"""人员读取与批量 upsert（读取对应 db_get_plan_detail.people；写为 REST 扩展）。"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from server.api.common import run_read, run_write
from server.repositories import people_repo, plan_repo

router = APIRouter(prefix="/api", tags=["people"])


class PeopleBatchBody(BaseModel):
    people: list[dict[str, Any]]
    replace: bool = False


@router.get("/plans/{plan_id}/people")
def list_people(plan_id: str):
    def r(conn):
        d = plan_repo.get_plan_detail(conn, plan_id)
        return {"people": d["people"]}

    return run_read(r)


@router.put("/plans/{plan_id}/people")
def put_people(plan_id: str, body: PeopleBatchBody):
    def w(conn):
        row = conn.execute(
            "SELECT 1 FROM plans WHERE id = ?1",
            (plan_id,),
        ).fetchone()
        if row is None:
            raise ValueError("plan not found")
        return {
            "planUpdatedAt": people_repo.upsert_people(
                conn, plan_id, body.people, replace=body.replace
            ),
        }

    return run_write(w)
