from datetime import datetime, timezone
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pymongo.errors import DuplicateKeyError
from slowapi import Limiter
from slowapi.util import get_remote_address
from ..database import database
from ..models import LoginRequest, RefreshRequest, RegisterRequest, TokenResponse
from ..repository import serialize
from ..security import create_access_token, current_account, hash_secret, issue_refresh_token, rotate_refresh_token, verify_secret

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


async def token_response(account_id: str) -> TokenResponse:
    profile = serialize(await database.profiles.find_one({"familyAccountId": account_id})) or {}
    return TokenResponse(accessToken=create_access_token(account_id), refreshToken=await issue_refresh_token(account_id), profile=profile)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, body: RegisterRequest) -> TokenResponse:
    now = datetime.now(timezone.utc)
    account_id = f"family_{uuid4()}"
    profile_id = f"profile_{uuid4()}"
    account_created = False
    try:
        await database.accounts.insert_one({"id": account_id, "email": str(body.email).lower(), "passwordHash": hash_secret(body.password), "caregiverPinHash": hash_secret(body.caregiverPin), "createdAt": now, "updatedAt": now})
        account_created = True
        await database.profiles.insert_one({"id": profile_id, "familyAccountId": account_id, "patientName": body.patientName, "caregiverName": body.caregiverName, "language": "en", "createdAt": now, "updatedAt": now, "lastActiveAt": now})
        return await token_response(account_id)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="An account already exists for this email") from exc
    except Exception:
        # Registration spans several MongoDB collections. Compensate on failure so
        # a later retry never encounters an account without its profile or tokens.
        await database.refresh_tokens.delete_many({"familyAccountId": account_id})
        await database.profiles.delete_many({"familyAccountId": account_id})
        if account_created:
            await database.accounts.delete_one({"id": account_id})
        raise


@router.post("/login", response_model=TokenResponse)
@limiter.limit("8/minute")
async def login(request: Request, body: LoginRequest) -> TokenResponse:
    account = await database.accounts.find_one({"email": str(body.email).lower()})
    if not account or not verify_secret(account["passwordHash"], body.password):
        raise HTTPException(status_code=401, detail="Email or password is incorrect")
    return await token_response(account["id"])


@router.post("/token/refresh")
@limiter.limit("12/minute")
async def refresh(request: Request, body: RefreshRequest) -> dict[str, str]:
    access, refresh_token = await rotate_refresh_token(body.refreshToken)
    return {"accessToken": access, "refreshToken": refresh_token, "tokenType": "bearer"}


@router.post("/token/revoke", status_code=204)
async def revoke(body: RefreshRequest) -> None:
    import hashlib
    await database.refresh_tokens.update_one({"tokenHash": hashlib.sha256(body.refreshToken.encode()).hexdigest()}, {"$set": {"revokedAt": datetime.now(timezone.utc)}})


@router.post("/caregiver/unlock")
@limiter.limit("8/minute")
async def unlock(request: Request, body: dict[str, str], account_id: str = Depends(current_account)) -> dict[str, bool]:
    account = await database.accounts.find_one({"id": account_id})
    if not account or not verify_secret(account["caregiverPinHash"], body.get("pin", "")):
        raise HTTPException(status_code=403, detail="Caregiver PIN is incorrect")
    return {"verified": True}

