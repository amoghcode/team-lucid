from datetime import datetime, timedelta, timezone
from io import BytesIO
from uuid import uuid4
from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from PIL import Image
from ..config import get_settings
from ..database import database, photos
from ..models import GameResult, ProfileUpdate, Reminder, SyncRequest
from ..repository import STORE_COLLECTIONS, latest_write, scoped_list, serialize
from ..security import current_account

router = APIRouter()
settings = get_settings()


@router.post("/sync")
async def sync(body: SyncRequest, account_id: str = Depends(current_account)) -> dict:
    acknowledged: list[str] = []
    for mutation in body.mutations:
        payload = {**mutation.payload, "id": mutation.recordId}
        await latest_write(mutation.store, account_id, payload)
        acknowledged.append(mutation.id)
    cursor = datetime.now(timezone.utc)
    records: list[dict] = []
    for store in STORE_COLLECTIONS:
        for item in await scoped_list(store, account_id, since=body.cursor):
            records.append({"store": store, "payload": item})
    return {"acknowledged": acknowledged, "records": records, "cursor": cursor.isoformat()}


@router.post("/game-results", status_code=status.HTTP_201_CREATED)
async def create_game_result(body: GameResult, account_id: str = Depends(current_account)) -> dict:
    await latest_write("gameResults", account_id, body.model_dump())
    return serialize(await database.game_results.find_one({"familyAccountId": account_id, "id": body.id}))


@router.get("/reminders")
async def list_reminders(account_id: str = Depends(current_account)) -> list[dict]:
    return await scoped_list("reminders", account_id)


@router.post("/reminders", status_code=status.HTTP_201_CREATED)
async def create_reminder(body: Reminder, account_id: str = Depends(current_account)) -> dict:
    await latest_write("reminders", account_id, body.model_dump())
    return serialize(await database.reminders.find_one({"familyAccountId": account_id, "id": body.id}))


@router.patch("/reminders/{record_id}")
async def update_reminder(record_id: str, body: Reminder, account_id: str = Depends(current_account)) -> dict:
    if record_id != body.id:
        raise HTTPException(status_code=400, detail="Record ID does not match path")
    await latest_write("reminders", account_id, body.model_dump())
    return serialize(await database.reminders.find_one({"familyAccountId": account_id, "id": record_id}))


@router.delete("/reminders/{record_id}", status_code=204)
async def delete_reminder(record_id: str, account_id: str = Depends(current_account)) -> None:
    result = await database.reminders.update_one({"familyAccountId": account_id, "id": record_id}, {"$set": {"deletedAt": datetime.now(timezone.utc), "updatedAt": datetime.now(timezone.utc)}})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Reminder not found")


def process_image(raw: bytes) -> tuple[bytes, str]:
    try:
        image = Image.open(BytesIO(raw))
        image.thumbnail((1280, 1280))
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")
        output = BytesIO()
        image.save(output, format="WEBP", quality=84, method=6)
        return output.getvalue(), "image/webp"
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Photo is not a valid image") from exc


@router.get("/family-members")
async def list_family(account_id: str = Depends(current_account)) -> list[dict]:
    members = await scoped_list("familyMembers", account_id)
    for member in members:
        if member.get("photoId"):
            member["photoUrl"] = f"/api/family-members/{member['id']}/photo"
    return members


@router.post("/family-members", status_code=status.HTTP_201_CREATED)
async def create_family_member(name: str = Form(min_length=1, max_length=80), relationship: str = Form(min_length=1, max_length=40), record_id: str | None = Form(default=None), photo: UploadFile = File(), account_id: str = Depends(current_account)) -> dict:
    raw = await photo.read(settings.max_upload_bytes + 1)
    if len(raw) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="Photo exceeds the 5 MB limit")
    if photo.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Photo must be JPEG, PNG, or WebP")
    prepared, content_type = process_image(raw)
    member_id = record_id or f"family_{uuid4()}"
    async with photos.open_upload_stream(f"{member_id}.webp", metadata={"familyAccountId": account_id, "contentType": content_type}) as stream:
        await stream.write(prepared)
        photo_id = stream._id
    now = datetime.now(timezone.utc)
    await database.family_members.update_one({"familyAccountId": account_id, "id": member_id}, {"$set": {"name": name, "relationship": relationship, "photoId": photo_id, "updatedAt": now, "deletedAt": None}, "$setOnInsert": {"createdAt": now}}, upsert=True)
    member = serialize(await database.family_members.find_one({"familyAccountId": account_id, "id": member_id}))
    member["photoUrl"] = f"/api/family-members/{member_id}/photo"
    return member


@router.patch("/family-members/{record_id}")
async def update_family_member(record_id: str, name: str = Form(min_length=1, max_length=80), relationship: str = Form(min_length=1, max_length=40), photo: UploadFile | None = File(default=None), account_id: str = Depends(current_account)) -> dict:
    existing = await database.family_members.find_one({"familyAccountId": account_id, "id": record_id, "deletedAt": None})
    if not existing:
        raise HTTPException(status_code=404, detail="Family member not found")
    values = {"name": name, "relationship": relationship, "updatedAt": datetime.now(timezone.utc)}
    if photo:
        raw = await photo.read(settings.max_upload_bytes + 1)
        if len(raw) > settings.max_upload_bytes:
            raise HTTPException(status_code=413, detail="Photo exceeds the 5 MB limit")
        prepared, content_type = process_image(raw)
        async with photos.open_upload_stream(f"{record_id}.webp", metadata={"familyAccountId": account_id, "contentType": content_type}) as stream:
            await stream.write(prepared)
            values["photoId"] = stream._id
    await database.family_members.update_one({"_id": existing["_id"]}, {"$set": values})
    member = serialize(await database.family_members.find_one({"_id": existing["_id"]}))
    member["photoUrl"] = f"/api/family-members/{record_id}/photo"
    return member


@router.get("/family-members/{record_id}/photo")
async def get_family_photo(record_id: str, account_id: str = Depends(current_account)) -> Response:
    member = await database.family_members.find_one({"familyAccountId": account_id, "id": record_id, "deletedAt": None})
    if not member or not member.get("photoId"):
        raise HTTPException(status_code=404, detail="Photo not found")
    stream = await photos.open_download_stream(ObjectId(member["photoId"]))
    content = await stream.read()
    return Response(content, media_type=stream.metadata.get("contentType", "image/webp"), headers={"Cache-Control": "private, max-age=3600"})


@router.delete("/family-members/{record_id}", status_code=204)
async def delete_family_member(record_id: str, account_id: str = Depends(current_account)) -> None:
    result = await database.family_members.update_one({"familyAccountId": account_id, "id": record_id}, {"$set": {"deletedAt": datetime.now(timezone.utc), "updatedAt": datetime.now(timezone.utc)}})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Family member not found")


@router.get("/profile")
async def get_profile(account_id: str = Depends(current_account)) -> dict:
    return serialize(await database.profiles.find_one({"familyAccountId": account_id})) or {}


@router.patch("/profile")
async def update_profile(body: ProfileUpdate, account_id: str = Depends(current_account)) -> dict:
    values = {key: value for key, value in body.model_dump().items() if value is not None}
    values["updatedAt"] = datetime.now(timezone.utc)
    await database.profiles.update_one({"familyAccountId": account_id}, {"$set": values})
    return serialize(await database.profiles.find_one({"familyAccountId": account_id})) or {}


def avg(values: list[float]) -> int:
    return round(sum(values) / len(values)) if values else 0


@router.get("/analytics")
async def analytics(account_id: str = Depends(current_account)) -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    results = [doc async for doc in database.game_results.find({"familyAccountId": account_id, "createdAt": {"$gte": cutoff}, "deletedAt": None})]
    by_game = {name: [r["score"] for r in results if r["game"] == name] for name in ("memory", "objects", "routine", "pattern", "family", "emotion")}
    memory = avg(by_game["memory"] + by_game["objects"] + by_game["family"])
    recall = avg(by_game["objects"] + by_game["routine"] + by_game["family"])
    attention = avg(by_game["pattern"] + by_game["emotion"] + by_game["memory"])
    moods = [doc["value"] * 20 async for doc in database.moods.find({"familyAccountId": account_id, "createdAt": {"$gte": cutoff}, "deletedAt": None})]
    mood = avg(moods) or 60
    return {"memory": memory, "recall": recall, "attention": attention, "mood": mood, "overall": round(memory * .3 + recall * .3 + attention * .25 + mood * .15), "attempts": len(results)}
