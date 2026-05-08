"""导出记录（export_records）。"""

from __future__ import annotations

import json
import sqlite3
import uuid
from typing import Any

from server.core.database import now_ms


def insert_export(
    conn: sqlite3.Connection,
    plan_id: str | None,
    format_name: str,
    meta: dict[str, Any] | None,
) -> dict[str, Any]:
    rid = str(uuid.uuid4())
    t = now_ms()
    conn.execute(
        """
        INSERT INTO export_records (id, plan_id, format, meta_json, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        """,
        (
            rid,
            plan_id,
            format_name,
            json.dumps(meta or {}, ensure_ascii=False),
            t,
        ),
    )
    return {"id": rid, "createdAt": t}


def list_exports(
    conn: sqlite3.Connection,
    plan_id: str | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 2000))
    if plan_id is not None:
        cur = conn.execute(
            """
            SELECT id, plan_id, format, meta_json, created_at FROM export_records
            WHERE plan_id = ?1
            ORDER BY created_at DESC
            LIMIT ?2
            """,
            (plan_id, limit),
        )
    else:
        cur = conn.execute(
            """
            SELECT id, plan_id, format, meta_json, created_at FROM export_records
            ORDER BY created_at DESC
            LIMIT ?1
            """,
            (limit,),
        )
    return [
        {
            "id": r["id"],
            "planId": r["plan_id"],
            "format": r["format"],
            "metaJson": r["meta_json"],
            "createdAt": r["created_at"],
        }
        for r in cur.fetchall()
    ]
