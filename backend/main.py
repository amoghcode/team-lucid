from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.config import get_settings
from app.database import client, ensure_indexes, ping
from app.routers import auth, data

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    await ensure_indexes()
    yield
    await client.close()


app = FastAPI(title="SmritiAI API", version="1.0.0", docs_url="/api/docs", redoc_url=None, lifespan=lifespan)
app.state.limiter = auth.limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_credentials=False, allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"], allow_headers=["Authorization", "Content-Type"])


@app.get("/api/health")
async def health() -> dict[str, str]:
    await ping()
    return {"status": "healthy"}


app.include_router(auth.router, prefix="/api", tags=["authentication"])
app.include_router(data.router, prefix="/api", tags=["family data"])
