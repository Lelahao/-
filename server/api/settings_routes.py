from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from server.repositories import settings_repo

router = APIRouter(prefix="/api", tags=["settings"])


class SettingWrite(BaseModel):
    key: str = Field(min_length=1)
    value: str


@router.get("/settings")
def list_settings():
    return {"items": settings_repo.list_all_standalone()}


@router.post("/settings")
def upsert_setting(body: SettingWrite):
    return settings_repo.upsert_standalone(body.key, body.value)
