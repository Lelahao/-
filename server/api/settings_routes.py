from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from server.core.database import get_connection, now_ms

router = APIRouter(prefix="/api", tags=["settings"])


class SettingWrite(BaseModel):
    key: str = Field(min_length=1)
    value: str


@router.get("/settings")
def list_settings():
    with get_connection() as conn:
        cur = conn.execute(
            "SELECT key, value, updated_at FROM settings ORDER BY key ASC"
        )
        rows = cur.fetchall()
    return {
        "items": [
            {"key": r["key"], "value": r["value"], "updatedAt": r["updated_at"]}
            for r in rows
        ]
    }


@router.post("/settings")
def upsert_setting(body: SettingWrite):
    t = now_ms()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO settings (key, value, updated_at)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
            """,
            (body.key, body.value, t),
        )
        conn.commit()
    return {"key": body.key, "updatedAt": t}
