"""一次性、幂等的数据库结构安装（仅 CREATE IF NOT EXISTS，不删数据、不插种子）。"""

from __future__ import annotations

import sqlite3
from pathlib import Path

_SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


def _migrate_people_profile_columns(conn: sqlite3.Connection) -> None:
    cur = conn.execute("PRAGMA table_info(people)")
    col_names = {str(r[1]) for r in cur.fetchall()}
    for stmt in (
        "ALTER TABLE people ADD COLUMN region TEXT",
        "ALTER TABLE people ADD COLUMN position TEXT",
        "ALTER TABLE people ADD COLUMN role TEXT",
    ):
        col = stmt.split("ADD COLUMN ")[1].split()[0]
        if col not in col_names:
            conn.execute(stmt)
            col_names.add(col)


def apply_schema(conn: sqlite3.Connection) -> None:
    sql = _SCHEMA_PATH.read_text(encoding="utf-8")
    conn.executescript(sql)
    _migrate_people_profile_columns(conn)
    conn.commit()
