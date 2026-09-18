from datetime import datetime, timezone
from typing import Any, Literal
from pydantic import BaseModel, EmailStr, Field, field_validator


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    patientName: str = Field(min_length=1, max_length=80)
    caregiverName: str = Field(min_length=1, max_length=80)
    caregiverPin: str = Field(pattern=r"^\d{4,8}$")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class CaregiverUnlockRequest(BaseModel):
    pin: str = Field(pattern=r"^\d{4,8}$")


class RecordBase(BaseModel):
    id: str = Field(min_length=3, max_length=100)
    deviceId: str | None = None
    createdAt: datetime = Field(default_factory=utc_now)
    updatedAt: datetime = Field(default_factory=utc_now)
    deletedAt: datetime | None = None


class ProfileUpdate(BaseModel):
    patientName: str | None = Field(default=None, min_length=1, max_length=80)
    caregiverName: str | None = Field(default=None, min_length=1, max_length=80)
    language: Literal["en", "hi", "as", "bn", "mni"] | None = None


class Reminder(RecordBase):
    title: str = Field(min_length=1, max_length=100)
    category: Literal["medication", "hydration", "exercise", "appointment", "daily", "medicine", "water", "activity"]
    date: str | None = None
    time: str = ""
    completedAt: datetime | None = None
    snoozedAt: datetime | None = None

    @field_validator("time")
    @classmethod
    def valid_time(cls, value: str) -> str:
        if value and (len(value) != 5 or value[2] != ":"):
            raise ValueError("time must be HH:MM")
        return value


class GameResult(RecordBase):
    game: Literal["memory", "objects", "routine", "pattern", "family", "emotion"]
    difficulty: Literal["easy", "medium", "hard"]
    score: int = Field(ge=0, le=100)
    accuracy: int = Field(ge=0, le=100)
    speed: int = Field(ge=0, le=100)
    mistakes: int = Field(ge=0)
    responseTime: int = Field(ge=0)
    completed: bool = True


class SyncMutation(BaseModel):
    id: str
    store: Literal["profiles", "reminders", "moods", "gameResults", "familyMembers", "achievements", "alerts"]
    operation: Literal["upsert", "delete"]
    recordId: str
    payload: dict[str, Any]
    attempts: int = 0
    createdAt: datetime
    updatedAt: datetime


class SyncRequest(BaseModel):
    cursor: datetime | None = None
    mutations: list[SyncMutation] = Field(default_factory=list, max_length=500)


class TokenResponse(BaseModel):
    accessToken: str
    tokenType: str = "bearer"
    profile: dict[str, Any]


class CompanionRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    language: Literal["en", "hi", "as", "bn", "mni"] = "en"
