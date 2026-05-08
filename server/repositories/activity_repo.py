"""活动日志写入（对应 app_db.rs log_activity）。"""

from __future__ import annotations

import json
import sqlite3
import uuid


def log_activity(
    conn: sqlite3.Connection,
    created_at_ms: int,
    plan_id: str | None,
    action: str,
    payload: dict,
) -> None:
    rid = str(uuid.uuid4())
    conn.execute(
        """
        INSERT INTO activity_logs (id, plan_id, action, payload_json, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        """,
        (rid, plan_id, action, json.dumps(payload, ensure_ascii=False), created_at_ms),
    )
