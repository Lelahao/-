"""ui_settings 表（对应 app_db db_save_ui_setting / db_get_ui_setting）。"""

from __future__ import annotations

import sqlite3

from server.core.database import get_connection, now_ms


def upsert(conn: sqlite3.Connection, key: str, value: str) -> int:
    t = now_ms()
    conn.execute(
        """
        INSERT INTO ui_settings (key, value, updated_at)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        """,
        (key, value, t),
    )
    return t


def get_by_key(conn: sqlite3.Connection, key: str) -> dict | None:
    cur = conn.execute(
        "SELECT key, value, updated_at FROM ui_settings WHERE key = ?1",
        (key,),
    )
    row = cur.fetchone()
    if row is None:
        return None
    return {"key": row["key"], "value": row["value"], "updatedAt": row["updated_at"]}


def list_all(conn: sqlite3.Connection) -> list[dict]:
    cur = conn.execute(
        "SELECT key, value, updated_at FROM ui_settings ORDER BY key ASC"
    )
    return [
        {"key": r["key"], "value": r["value"], "updatedAt": r["updated_at"]}
        for r in cur.fetchall()
    ]


def upsert_standalone(key: str, value: str) -> dict:
    with get_connection() as conn:
        t = upsert(conn, key, value)
        conn.commit()
    return {"key": key, "updatedAt": t}


def get_by_key_standalone(key: str) -> dict | None:
    with get_connection() as conn:
        return get_by_key(conn, key)


def list_all_standalone() -> list[dict]:
    with get_connection() as conn:
        return list_all(conn)
