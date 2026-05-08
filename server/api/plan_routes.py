"""排座方案（对应 db_* plan 系 command）。"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from server.api.common import run_read, run_write
from server.repositories import plan_repo

router = APIRouter(prefix="/api", tags=["plans"])


class CreatePlanBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: str
    note: str | None = None


class UpdatePlanBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: str | None = None
    note: str | None = None
    status: str | None = None


@router.get("/plans")
def list_plans():
    return run_read(lambda c: {"plans": plan_repo.list_plans(c)})


@router.post("/plans")
def create_plan(body: CreatePlanBody):
    return run_write(lambda c: plan_repo.create_plan(c, body.name, body.note))


@router.get("/plans/{plan_id}")
def get_plan_detail(plan_id: str):
    return run_read(lambda c: plan_repo.get_plan_detail(c, plan_id))


@router.patch("/plans/{plan_id}")
def update_plan(plan_id: str, body: UpdatePlanBody):
    return run_write(
        lambda c: plan_repo.update_plan(
            c, plan_id, body.name, body.note, body.status
        ),
    )


@router.delete("/plans/{plan_id}")
def delete_plan(plan_id: str):
    def w(conn):
        plan_repo.delete_plan(conn, plan_id)
        return {"ok": True}

    return run_write(w)
