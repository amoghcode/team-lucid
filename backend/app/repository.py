from datetime import datetime, timezone
from typing import Any
from bson import ObjectId
from .database import db

STORE_COLLECTIONS = {
    "profiles": "profiles",
    "reminders": "reminders",
    "moods": "moods",
    "gameResults": "game_results",
    "familyMembers": "family_members",
    "achievements": "achievements",
    "alerts": "alerts",
}

DATE_KEYS = ("createdAt", "updatedAt", "deletedAt", "completedAt", "snoozedAt")


def parse_date(value: Any) -> Any:
    if isinstance(value, str):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    return value


def serialize(document: dict[str, Any] | None) -> dict[str, Any] | None:
    if not document:
        return None
    output = {key: value for key, value in document.items() if key != "_id" and not key.endswith("Hash")}
    for key, value in list(output.items()):
        if isinstance(value, datetime):
            output[key] = value.isoformat()
        elif isinstance(value, ObjectId):
            output[key] = str(value)
    return output


async def scoped_list(store: str, account_id: str, *, since: datetime | None = None) -> list[dict[str, Any]]:
    query: dict[str, Any] = {"familyAccountId": account_id}
    if since:
        query["updatedAt"] = {"$gt": since}
    return [serialize(doc) async for doc in db[STORE_COLLECTIONS[store]].find(query)]


def collection(store: str):
    return db[STORE_COLLECTIONS[store]]


async def latest_write(store: str, account_id: str, payload: dict[str, Any]) -> bool:
    identity = {"familyAccountId": account_id, "id": payload["id"]}
    existing = await collection(store).find_one(identity)
    incoming = parse_date(payload.get("updatedAt")) or datetime.now(timezone.utc)
    if existing and existing.get("updatedAt") and existing["updatedAt"] > incoming:
        return False
    clean = {**payload, "familyAccountId": account_id, "updatedAt": incoming}
    for key in DATE_KEYS:
        if key in clean:
            clean[key] = parse_date(clean[key])
    operator = "$setOnInsert" if store == "gameResults" else "$set"
    await collection(store).update_one(identity, {operator: clean}, upsert=True)
    return True


async def get_record(store: str, account_id: str, record_id: str) -> dict[str, Any] | None:
    return serialize(await collection(store).find_one({"familyAccountId": account_id, "id": record_id}))
