from datetime import datetime, timedelta, timezone
from io import BytesIO
from uuid import uuid4
from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from PIL import Image
from ..config import get_settings
from ..database import db, photos
from ..models import GameResult, ProfileUpdate, Reminder, SyncRequest
from ..repository import STORE_COLLECTIONS, get_record, latest_write, scoped_list, serialize
from ..security import current_account

router = APIRouter()
settings = get_settings()


def now() -> datetime:
    return datetime.now(timezone.utc)


def photo_url(record_id: str) -> str:
    return f"/api/family-members/{record_id}/photo"


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


async def read_upload(photo: UploadFile) -> tuple[bytes, str]:
    raw = await photo.read(settings.max_upload_bytes + 1)
    if len(raw) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="Photo exceeds the 5 MB limit")
    if photo.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Photo must be JPEG, PNG, or WebP")
    return process_image(raw)


async def store_photo(account_id: str, record_id: str, prepared: bytes, content_type: str):
    async with photos.open_upload_stream(f"{record_id}.webp", metadata={"familyAccountId": account_id, "contentType": content_type}) as stream:
        await stream.write(prepared)
        return stream._id


async def family_payload(account_id: str, record_id: str) -> dict:
    member = await get_record("familyMembers", account_id, record_id)
    if member:
        member["photoUrl"] = photo_url(record_id)
    return member


async def save_reminder(body: Reminder, account_id: str) -> dict:
    await latest_write("reminders", account_id, body.model_dump())
    return await get_record("reminders", account_id, body.id)


@router.post("/sync")
async def sync(body: SyncRequest, account_id: str = Depends(current_account)) -> dict:
    acknowledged = []
    for mutation in body.mutations:
        await latest_write(mutation.store, account_id, {**mutation.payload, "id": mutation.recordId})
        acknowledged.append(mutation.id)
    records = [{"store": store, "payload": item} for store in STORE_COLLECTIONS for item in await scoped_list(store, account_id, since=body.cursor)]
    return {"acknowledged": acknowledged, "records": records, "cursor": now().isoformat()}


@router.post("/game-results", status_code=status.HTTP_201_CREATED)
async def create_game_result(body: GameResult, account_id: str = Depends(current_account)) -> dict:
    await latest_write("gameResults", account_id, body.model_dump())
    return await get_record("gameResults", account_id, body.id)


@router.get("/reminders")
async def list_reminders(account_id: str = Depends(current_account)) -> list[dict]:
    return await scoped_list("reminders", account_id)


@router.post("/reminders", status_code=status.HTTP_201_CREATED)
async def create_reminder(body: Reminder, account_id: str = Depends(current_account)) -> dict:
    return await save_reminder(body, account_id)


@router.patch("/reminders/{record_id}")
async def update_reminder(record_id: str, body: Reminder, account_id: str = Depends(current_account)) -> dict:
    if record_id != body.id:
        raise HTTPException(status_code=400, detail="Record ID does not match path")
    return await save_reminder(body, account_id)


@router.delete("/reminders/{record_id}", status_code=204)
async def delete_reminder(record_id: str, account_id: str = Depends(current_account)) -> None:
    result = await db.reminders.update_one({"familyAccountId": account_id, "id": record_id}, {"$set": {"deletedAt": now(), "updatedAt": now()}})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Reminder not found")


@router.get("/family-members")
async def list_family(account_id: str = Depends(current_account)) -> list[dict]:
    members = await scoped_list("familyMembers", account_id)
    for member in members:
        if member.get("photoId"):
            member["photoUrl"] = photo_url(member["id"])
    return members


@router.post("/family-members", status_code=status.HTTP_201_CREATED)
async def create_family_member(name: str = Form(min_length=1, max_length=80), relationship: str = Form(min_length=1, max_length=40), record_id: str | None = Form(default=None), photo: UploadFile = File(), account_id: str = Depends(current_account)) -> dict:
    prepared, content_type = await read_upload(photo)
    member_id = record_id or f"family_{uuid4()}"
    photo_id = await store_photo(account_id, member_id, prepared, content_type)
    stamp = now()
    await db.family_members.update_one(
        {"familyAccountId": account_id, "id": member_id},
        {"$set": {"name": name, "relationship": relationship, "photoId": photo_id, "updatedAt": stamp, "deletedAt": None}, "$setOnInsert": {"createdAt": stamp}},
        upsert=True,
    )
    return await family_payload(account_id, member_id)


@router.patch("/family-members/{record_id}")
async def update_family_member(record_id: str, name: str = Form(min_length=1, max_length=80), relationship: str = Form(min_length=1, max_length=40), photo: UploadFile | None = File(default=None), account_id: str = Depends(current_account)) -> dict:
    existing = await db.family_members.find_one({"familyAccountId": account_id, "id": record_id, "deletedAt": None})
    if not existing:
        raise HTTPException(status_code=404, detail="Family member not found")
    values = {"name": name, "relationship": relationship, "updatedAt": now()}
    if photo:
        prepared, content_type = await read_upload(photo)
        values["photoId"] = await store_photo(account_id, record_id, prepared, content_type)
    await db.family_members.update_one({"_id": existing["_id"]}, {"$set": values})
    return await family_payload(account_id, record_id)


@router.get("/family-members/{record_id}/photo")
async def get_family_photo(record_id: str, account_id: str = Depends(current_account)) -> Response:
    member = await db.family_members.find_one({"familyAccountId": account_id, "id": record_id, "deletedAt": None})
    if not member or not member.get("photoId"):
        raise HTTPException(status_code=404, detail="Photo not found")
    stream = await photos.open_download_stream(ObjectId(member["photoId"]))
    return Response(await stream.read(), media_type=stream.metadata.get("contentType", "image/webp"), headers={"Cache-Control": "private, max-age=3600"})


@router.delete("/family-members/{record_id}", status_code=204)
async def delete_family_member(record_id: str, account_id: str = Depends(current_account)) -> None:
    result = await db.family_members.update_one({"familyAccountId": account_id, "id": record_id}, {"$set": {"deletedAt": now(), "updatedAt": now()}})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Family member not found")


@router.get("/profile")
async def get_profile(account_id: str = Depends(current_account)) -> dict:
    return serialize(await db.profiles.find_one({"familyAccountId": account_id})) or {}


@router.patch("/profile")
async def update_profile(body: ProfileUpdate, account_id: str = Depends(current_account)) -> dict:
    values = {key: value for key, value in body.model_dump().items() if value is not None}
    values["updatedAt"] = now()
    await db.profiles.update_one({"familyAccountId": account_id}, {"$set": values})
    return serialize(await db.profiles.find_one({"familyAccountId": account_id})) or {}


def avg(values: list[float]) -> int:
    return round(sum(values) / len(values)) if values else 0


@router.get("/analytics")
async def analytics(account_id: str = Depends(current_account)) -> dict:
    cutoff = now() - timedelta(days=30)
    results = [doc async for doc in db.game_results.find({"familyAccountId": account_id, "createdAt": {"$gte": cutoff}, "deletedAt": None})]
    by_game = {name: [r["score"] for r in results if r["game"] == name] for name in ("memory", "objects", "routine", "pattern", "family", "emotion")}
    memory = avg(by_game["memory"] + by_game["objects"] + by_game["family"])
    recall = avg(by_game["objects"] + by_game["routine"] + by_game["family"])
    attention = avg(by_game["pattern"] + by_game["emotion"] + by_game["memory"])
    moods = [doc["value"] * 20 async for doc in db.moods.find({"familyAccountId": account_id, "createdAt": {"$gte": cutoff}, "deletedAt": None})]
    mood = avg(moods) or 60
    return {"memory": memory, "recall": recall, "attention": attention, "mood": mood, "overall": round(memory * .3 + recall * .3 + attention * .25 + mood * .15), "attempts": len(results)}
