"""SQLite 连接与结构初始化。"""

from __future__ import annotations

import sqlite3
import time
from contextlib import contextmanager

from server.core.config import get_data_dir, get_db_path
from server.migrations import apply_schema


def init_database() -> None:
    """创建数据目录、连接数据库并应用幂等结构（不删表、不插种子）。"""
    data_dir = get_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    path = get_db_path()
    conn = sqlite3.connect(path)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        apply_schema(conn)
    finally:
        conn.close()


@contextmanager
def get_connection():
    """请求级连接；自动确保目录存在、外键开启，并应用幂等结构。"""
    get_data_dir().mkdir(parents=True, exist_ok=True)
    path = get_db_path()
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    apply_schema(conn)
    try:
        yield conn
    finally:
        conn.close()


def now_ms() -> int:
    return int(time.time() * 1000)
