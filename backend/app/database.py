import gridfs
from pymongo import ASCENDING, AsyncMongoClient
from .config import get_settings

settings = get_settings()
client = AsyncMongoClient(settings.mongodb_uri)
db = client[settings.mongodb_database]
photos = gridfs.AsyncGridFSBucket(db, bucket_name="family_photos")


async def ensure_indexes() -> None:
    await db.accounts.create_index("email", unique=True)
    for name in ("profiles", "reminders", "family_members", "game_results", "moods", "achievements", "alerts"):
        await db[name].create_index([("familyAccountId", ASCENDING), ("id", ASCENDING)], unique=True)


async def ping() -> None:
    await db.command("ping")
