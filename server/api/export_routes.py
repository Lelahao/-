"""导出记录（Rust 无 invoke；表结构已迁移，供产品与验收）。"""

from __future__ import annotations

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict, Field

from server.api.common import run_read, run_write
from server.repositories import export_repo

router = APIRouter(prefix="/api", tags=["export"])


class ExportCreateBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    plan_id: str | None = Field(default=None, alias="planId")
    export_format: str = Field(alias="format")
    meta: dict | None = None


@router.post("/exports")
def create_export(body: ExportCreateBody):
    def w(conn):
        return export_repo.insert_export(
            conn,
            body.plan_id,
            body.export_format,
            body.meta,
        )

    return run_write(w)


@router.get("/exports")
def list_exports(
    plan_id: str | None = Query(None, alias="planId"),
    limit: int = Query(200, ge=1, le=2000),
):
    return run_read(lambda c: {"items": export_repo.list_exports(c, plan_id, limit)})
