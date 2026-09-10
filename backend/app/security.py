import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from .config import get_settings
from .database import database

settings = get_settings()
hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4)
bearer = HTTPBearer(auto_error=False)


def hash_secret(value: str) -> str:
    return hasher.hash(value)


def verify_secret(stored: str, value: str) -> bool:
    try:
        return hasher.verify(stored, value)
    except VerifyMismatchError:
        return False


def create_access_token(account_id: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": account_id, "type": "access", "iat": now, "exp": now + timedelta(minutes=settings.access_token_minutes)}, settings.jwt_secret, algorithm="HS256")


async def issue_refresh_token(account_id: str) -> str:
    raw = secrets.token_urlsafe(48)
    await database.refresh_tokens.insert_one({"tokenHash": hashlib.sha256(raw.encode()).hexdigest(), "familyAccountId": account_id, "createdAt": datetime.now(timezone.utc), "expiresAt": datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_days), "revokedAt": None})
    return raw


async def rotate_refresh_token(raw: str) -> tuple[str, str]:
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    record = await database.refresh_tokens.find_one({"tokenHash": token_hash, "revokedAt": None, "expiresAt": {"$gt": datetime.now(timezone.utc)}})
    if not record:
        raise HTTPException(status_code=401, detail="Refresh token is invalid or expired")
    await database.refresh_tokens.update_one({"_id": record["_id"]}, {"$set": {"revokedAt": datetime.now(timezone.utc)}})
    return create_access_token(record["familyAccountId"]), await issue_refresh_token(record["familyAccountId"])


async def current_account(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> str:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"])
        if payload.get("type") != "access" or not payload.get("sub"):
            raise JWTError()
        return str(payload["sub"])
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Token is invalid or expired") from exc
