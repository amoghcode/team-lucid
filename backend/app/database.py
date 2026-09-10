import gridfs
from pymongo import ASCENDING, AsyncMongoClient
from pymongo.server_api import ServerApi
from .config import get_settings

settings = get_settings()
client = AsyncMongoClient(settings.mongodb_uri, server_api=ServerApi("1"))
database = client[settings.mongodb_database]
photos = gridfs.AsyncGridFSBucket(database, bucket_name="family_photos")


async def ensure_indexes() -> None:
    await database.accounts.create_index("email", unique=True)
    await database.refresh_tokens.create_index("tokenHash", unique=True)
    await database.refresh_tokens.create_index("expiresAt", expireAfterSeconds=0)
    for name in ("profiles", "reminders", "family_members", "game_results", "moods", "achievements", "alerts"):
        await database[name].create_index([("familyAccountId", ASCENDING), ("updatedAt", ASCENDING)])
        await database[name].create_index([("familyAccountId", ASCENDING), ("id", ASCENDING)], unique=True)


async def ping() -> bool:
    await database.command("ping")
    return True
