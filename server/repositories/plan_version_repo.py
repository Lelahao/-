"""方案历史版本（plan_versions）：完整快照与查询。"""

from __future__ import annotations

import json
import sqlite3
import uuid
from typing import Any

from server.core.database import now_ms
from server.repositories import layout_repo
from server.repositories.activity_repo import log_activity
from server.repositories.plan_repo import get_plan_detail


def _count_assigned(people: list[dict[str, Any]]) -> int:
    return sum(
        1
        for p in people
        if p.get("assignedTableId") is not None and p.get("assignedSeatNo") is not None
    )


def build_plan_snapshot(conn: sqlite3.Connection, plan_id: str) -> tuple[dict[str, Any], dict[str, int]]:
    """读取方案详情 + 当前全局 round_layout（若有）+ 统计，组成可序列化快照。"""
    detail = get_plan_detail(conn, plan_id)
    people = detail["people"]
    tables = detail["tables"]
    table_count = len(tables)
    people_count = len(people)
    assigned_count = _count_assigned(people)
    unassigned_count = people_count - assigned_count
    stats = {
        "tableCount": table_count,
        "peopleCount": people_count,
        "assignedCount": assigned_count,
        "unassignedCount": unassigned_count,
    }
    layout = layout_repo.load_round_layout(conn)
    snapshot: dict[str, Any] = {
        "plan": detail["plan"],
        "people": detail["people"],
        "tables": detail["tables"],
        "seats": detail["seats"],
        "stats": stats,
        "layout": layout,
    }
    return snapshot, stats


def create_plan_version(
    conn: sqlite3.Connection,
    plan_id: str,
    version_name: str | None,
    note: str | None,
    created_by: str | None = None,
) -> dict[str, Any]:
    """若 plan 不存在则抛 ValueError。version_no 在 plan_id 内递增。"""
    get_plan_detail(conn, plan_id)

    row = conn.execute(
        "SELECT COALESCE(MAX(version_no), 0) AS m FROM plan_versions WHERE plan_id = ?1",
        (plan_id,),
    ).fetchone()
    next_no = int(row["m"] if row else 0) + 1

    snapshot, stats = build_plan_snapshot(conn, plan_id)
    snapshot_json = json.dumps(snapshot, ensure_ascii=False)
    vid = str(uuid.uuid4())
    t = now_ms()

    conn.execute(
        """
        INSERT INTO plan_versions (
            id, plan_id, version_no, version_name, note, snapshot_json,
            table_count, people_count, assigned_count, unassigned_count,
            created_at, created_by, export_count
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0)
        """,
        (
            vid,
            plan_id,
            next_no,
            version_name,
            note,
            snapshot_json,
            stats["tableCount"],
            stats["peopleCount"],
            stats["assignedCount"],
            stats["unassignedCount"],
            t,
            created_by,
        ),
    )
    log_activity(
        conn,
        t,
        plan_id,
        "createPlanVersion",
        {"planId": plan_id, "versionId": vid, "versionNo": next_no},
    )
    return {
        "id": vid,
        "planId": plan_id,
        "versionNo": next_no,
        "versionName": version_name,
        "note": note,
        "tableCount": stats["tableCount"],
        "peopleCount": stats["peopleCount"],
        "assignedCount": stats["assignedCount"],
        "unassignedCount": stats["unassignedCount"],
        "createdAt": t,
        "createdBy": created_by,
        "exportCount": 0,
    }


def list_plan_versions(conn: sqlite3.Connection, plan_id: str) -> list[dict[str, Any]]:
    """确认方案存在。"""
    get_plan_detail(conn, plan_id)
    cur = conn.execute(
        """
        SELECT id, plan_id, version_no, version_name, note,
               table_count, people_count, assigned_count, unassigned_count,
               created_at, created_by, export_count
        FROM plan_versions
        WHERE plan_id = ?1
        ORDER BY version_no DESC, created_at DESC
        """,
        (plan_id,),
    )
    return [_row_to_list_dto(r) for r in cur.fetchall()]


def _row_to_list_dto(r: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": r["id"],
        "versionNo": r["version_no"],
        "versionName": r["version_name"],
        "note": r["note"],
        "tableCount": r["table_count"],
        "peopleCount": r["people_count"],
        "assignedCount": r["assigned_count"],
        "unassignedCount": r["unassigned_count"],
        "createdAt": r["created_at"],
    }


def get_plan_version_detail(
    conn: sqlite3.Connection, plan_id: str, version_id: str
) -> dict[str, Any]:
    get_plan_detail(conn, plan_id)
    cur = conn.execute(
        """
        SELECT id, plan_id, version_no, version_name, note, snapshot_json,
               table_count, people_count, assigned_count, unassigned_count,
               created_at, created_by, export_count
        FROM plan_versions
        WHERE id = ?1 AND plan_id = ?2
        """,
        (version_id, plan_id),
    )
    r = cur.fetchone()
    if r is None:
        raise ValueError("version not found")

    try:
        snapshot = json.loads(r["snapshot_json"])
    except json.JSONDecodeError as e:
        raise ValueError("version snapshot corrupted") from e

    version = {
        "id": r["id"],
        "planId": r["plan_id"],
        "versionNo": r["version_no"],
        "versionName": r["version_name"],
        "note": r["note"],
        "tableCount": r["table_count"],
        "peopleCount": r["people_count"],
        "assignedCount": r["assigned_count"],
        "unassignedCount": r["unassigned_count"],
        "createdAt": r["created_at"],
        "createdBy": r["created_by"],
        "exportCount": r["export_count"],
    }
    return {"version": version, "snapshot": snapshot}
