"""活动日志列表（写入仍由各 repo 内部 log_activity 完成；Rust 无读 command）。"""

from __future__ import annotations

from fastapi import APIRouter, Query

from server.api.common import run_read
from server.repositories import activity_repo

router = APIRouter(prefix="/api", tags=["activity-logs"])


@router.get("/activity-logs")
def list_activity_logs(
    plan_id: str | None = Query(None, alias="planId"),
    limit: int = Query(200, ge=1, le=2000),
):
    return run_read(
        lambda c: {"items": activity_repo.list_activity_logs(c, plan_id, limit)},
    )
