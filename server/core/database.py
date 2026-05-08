"""SQLite：建目录、建库、settings 表。"""

from __future__ import annotations

import sqlite3
import time
from contextlib import contextmanager

from server.core.config import get_data_dir, get_db_path


def init_database() -> None:
    data_dir = get_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    path = get_db_path()
    conn = sqlite3.connect(path)
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


@contextmanager
def get_connection():
    init_database()
    path = get_db_path()
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def now_ms() -> int:
    return int(time.time() * 1000)
