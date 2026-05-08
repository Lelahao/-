"""全屏圆桌布局（对应 save_round_layout / load_round_layout）。"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body

from server.api.common import run_read, run_write
from server.repositories import layout_repo

router = APIRouter(prefix="/api", tags=["layout"])


@router.get("/round-layout")
def get_round_layout():
    return run_read(layout_repo.load_round_layout)


@router.put("/round-layout")
def put_round_layout(payload: dict[str, Any] = Body(...)):
    def w(conn):
        layout_repo.save_round_layout(conn, payload)
        return {"ok": True}

    return run_write(w)
