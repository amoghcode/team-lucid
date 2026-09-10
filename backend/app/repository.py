from datetime import datetime, timezone
from typing import Any
from bson import ObjectId
from .database import database

STORE_COLLECTIONS = {
    "profiles": "profiles", "reminders": "reminders", "moods": "moods",
    "gameResults": "game_results", "familyMembers": "family_members",
    "achievements": "achievements", "alerts": "alerts"
}


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
    return [serialize(doc) async for doc in database[STORE_COLLECTIONS[store]].find(query)]


async def latest_write(store: str, account_id: str, payload: dict[str, Any]) -> bool:
    collection = database[STORE_COLLECTIONS[store]]
    identity = {"familyAccountId": account_id, "id": payload["id"]}
    existing = await collection.find_one(identity)
    incoming_time = payload.get("updatedAt") or datetime.now(timezone.utc)
    if isinstance(incoming_time, str):
        incoming_time = datetime.fromisoformat(incoming_time.replace("Z", "+00:00"))
    if existing and existing.get("updatedAt") and existing["updatedAt"] > incoming_time:
        return False
    clean = {**payload, "familyAccountId": account_id, "updatedAt": incoming_time}
    for key in ("createdAt", "deletedAt", "completedAt", "snoozedAt"):
        if isinstance(clean.get(key), str):
            clean[key] = datetime.fromisoformat(clean[key].replace("Z", "+00:00"))
    if store == "gameResults":
        await collection.update_one(identity, {"$setOnInsert": clean}, upsert=True)
    else:
        await collection.update_one(identity, {"$set": clean}, upsert=True)
    return True
