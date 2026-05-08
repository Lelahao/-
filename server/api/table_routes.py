"""桌（对应 db_save_tables / db_get_plan_detail.tables）。"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from server.api.common import run_read, run_write
from server.repositories import plan_repo

router = APIRouter(prefix="/api", tags=["tables"])


class TableIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str | None = None
    tableNo: int
    hallName: str | None = None
    capacity: int
    kind: str | None = None


class SaveTablesBody(BaseModel):
    tables: list[TableIn]


@router.get("/plans/{plan_id}/tables")
def list_tables(plan_id: str):
    def r(conn):
        d = plan_repo.get_plan_detail(conn, plan_id)
        return {"tables": d["tables"]}

    return run_read(r)


@router.put("/plans/{plan_id}/tables")
def put_tables(plan_id: str, body: SaveTablesBody):
    def w(conn):
        rows = [t.model_dump(mode="json", by_alias=True) for t in body.tables]
        return {"planUpdatedAt": plan_repo.save_tables(conn, plan_id, rows)}

    return run_write(w)
