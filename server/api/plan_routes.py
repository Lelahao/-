"""排座方案（对应 db_* plan 系 command）。"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from server.api.common import run_read, run_write
from server.repositories import plan_repo, plan_version_repo

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


class CreatePlanVersionBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    version_name: str | None = Field(default=None, alias="versionName")
    note: str | None = None
    created_by: str | None = Field(default=None, alias="createdBy")


@router.get("/plans")
def list_plans():
    return run_read(lambda c: {"plans": plan_repo.list_plans(c)})


@router.post("/plans")
def create_plan(body: CreatePlanBody):
    return run_write(lambda c: plan_repo.create_plan(c, body.name, body.note))


@router.get("/plans/{plan_id}/versions/{version_id}")
def get_plan_version_detail(plan_id: str, version_id: str):
    return run_read(lambda c: plan_version_repo.get_plan_version_detail(c, plan_id, version_id))


@router.get("/plans/{plan_id}/versions")
def list_plan_versions(plan_id: str):
    return run_read(lambda c: {"versions": plan_version_repo.list_plan_versions(c, plan_id)})


@router.post("/plans/{plan_id}/versions")
def create_plan_version(plan_id: str, body: CreatePlanVersionBody):
    return run_write(
        lambda c: plan_version_repo.create_plan_version(
            c,
            plan_id,
            body.version_name,
            body.note,
            body.created_by,
        ),
    )


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
