from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from server.api.common import run_read, run_write
from server.repositories import settings_repo

router = APIRouter(prefix="/api", tags=["settings"])


class SettingWrite(BaseModel):
    key: str = Field(min_length=1)
    value: str


@router.get("/settings")
def list_settings():
    return run_read(lambda c: {"items": settings_repo.list_all(c)})


@router.get("/settings/{key}")
def get_setting(key: str):
    return run_read(lambda c: settings_repo.get_by_key(c, key))


@router.post("/settings")
def upsert_setting(body: SettingWrite):
    return run_write(
        lambda c: {
            "key": body.key,
            "updatedAt": settings_repo.upsert(c, body.key, body.value),
        },
    )
