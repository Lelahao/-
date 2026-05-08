"""API 辅助：请求级连接与写事务。"""

from __future__ import annotations

import sqlite3
from collections.abc import Callable
from typing import TypeVar

from fastapi.responses import JSONResponse

from server.core.database import get_connection

T = TypeVar("T")


def run_read(fn: Callable[[sqlite3.Connection], T]) -> T:
    with get_connection() as conn:
        return fn(conn)


def run_write(fn: Callable[[sqlite3.Connection], T]) -> T:
    with get_connection() as conn:
        conn.execute("BEGIN IMMEDIATE")
        try:
            out = fn(conn)
            conn.commit()
            return out
        except Exception:
            conn.rollback()
            raise


def value_error_response(exc: ValueError) -> JSONResponse:
    msg = str(exc)
    code = 404 if msg.endswith("not found") else 400
    return JSONResponse(status_code=code, content={"message": msg})
