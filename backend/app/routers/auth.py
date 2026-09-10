from datetime import datetime, timezone
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pymongo.errors import DuplicateKeyError
from slowapi import Limiter
from slowapi.util import get_remote_address
from ..database import db
from ..models import CaregiverUnlockRequest, LoginRequest, RegisterRequest, TokenResponse
from ..repository import serialize
from ..security import create_token, current_account, hash_secret, verify_secret

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


async def profile_for(account_id: str) -> dict:
    return serialize(await db.profiles.find_one({"familyAccountId": account_id})) or {}


def tokens_for(account_id: str, profile: dict) -> TokenResponse:
    return TokenResponse(accessToken=create_token(account_id), profile=profile)


async def create_account(body: RegisterRequest) -> str:
    now = datetime.now(timezone.utc)
    account_id = f"family_{uuid4()}"
    try:
        await db.accounts.insert_one({
            "id": account_id,
            "email": body.email.lower(),
            "passwordHash": hash_secret(body.password),
            "caregiverPinHash": hash_secret(body.caregiverPin),
            "createdAt": now,
            "updatedAt": now,
        })
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="An account already exists for this email") from exc
    await db.profiles.insert_one({
        "id": f"profile_{uuid4()}",
        "familyAccountId": account_id,
        "patientName": body.patientName,
        "caregiverName": body.caregiverName,
        "language": "en",
        "createdAt": now,
        "updatedAt": now,
        "lastActiveAt": now,
    })
    return account_id


async def find_account(email: str, password: str) -> dict:
    account = await db.accounts.find_one({"email": email.lower()})
    if not account or not verify_secret(account["passwordHash"], password):
        raise HTTPException(status_code=401, detail="Email or password is incorrect")
    return account


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, body: RegisterRequest) -> TokenResponse:
    account_id = await create_account(body)
    return tokens_for(account_id, await profile_for(account_id))


@router.post("/login", response_model=TokenResponse)
@limiter.limit("8/minute")
async def login(request: Request, body: LoginRequest) -> TokenResponse:
    account = await find_account(body.email, body.password)
    return tokens_for(account["id"], await profile_for(account["id"]))


@router.post("/logout", status_code=204)
async def logout(_: str = Depends(current_account)) -> None:
    return None


@router.post("/caregiver/unlock")
@limiter.limit("8/minute")
async def unlock(request: Request, body: CaregiverUnlockRequest, account_id: str = Depends(current_account)) -> dict[str, bool]:
    account = await db.accounts.find_one({"id": account_id})
    if not account or not verify_secret(account["caregiverPinHash"], body.pin):
        raise HTTPException(status_code=403, detail="Caregiver PIN is incorrect")
    return {"verified": True}
