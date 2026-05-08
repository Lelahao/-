"""一次性、幂等的数据库结构安装（仅 CREATE IF NOT EXISTS，不删数据、不插种子）。"""

from __future__ import annotations

import sqlite3
from pathlib import Path

_SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


def apply_schema(conn: sqlite3.Connection) -> None:
    sql = _SCHEMA_PATH.read_text(encoding="utf-8")
    conn.executescript(sql)
    conn.commit()
