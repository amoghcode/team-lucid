from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from .config import get_settings

settings = get_settings()
hasher = PasswordHasher()
bearer = HTTPBearer(auto_error=False)


def hash_secret(value: str) -> str:
    return hasher.hash(value)


def verify_secret(stored: str, value: str) -> bool:
    try:
        return hasher.verify(stored, value)
    except VerifyMismatchError:
        return False


def create_token(account_id: str) -> str:
    return jwt.encode({"sub": account_id}, settings.jwt_secret, algorithm="HS256")


async def current_account(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> str:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"], options={"verify_exp": False})
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Token is invalid") from exc
    account_id = payload.get("sub")
    if not account_id:
        raise HTTPException(status_code=401, detail="Token is invalid")
    return str(account_id)
