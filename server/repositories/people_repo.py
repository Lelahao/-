"""人员批量读写（Tauri 无独立 command；供 REST 与后续前端接入）。"""

from __future__ import annotations

import sqlite3
import uuid
from typing import Any

from server.core.database import now_ms
from server.repositories.activity_repo import log_activity
from server.repositories.plan_repo import bump_plan_updated


def _pick(d: dict[str, Any], *keys: str) -> Any:
    for k in keys:
        if k in d:
            return d[k]
    return None


def upsert_people(
    conn: sqlite3.Connection,
    plan_id: str,
    people_in: list[dict[str, Any]],
    *,
    replace: bool = False,
) -> int:
    t = now_ms()
    if replace:
        incoming_ids = {str(_pick(p, "id")) for p in people_in}
        cur = conn.execute("SELECT id FROM people WHERE plan_id = ?1", (plan_id,))
        for row in cur.fetchall():
            pid = row[0]
            if pid not in incoming_ids:
                conn.execute("DELETE FROM people WHERE id = ?1", (pid,))

    for p in people_in:
        pid = str(_pick(p, "id"))
        display_name = str(_pick(p, "displayName", "display_name") or "")
        atid = _pick(p, "assignedTableId", "assigned_table_id")
        asn = _pick(p, "assignedSeatNo", "assigned_seat_no")
        meta = _pick(p, "metaJson", "meta_json")
        region_in = _pick(p, "region")
        position_in = _pick(p, "position")
        role_in = _pick(p, "role")

        row = conn.execute(
            "SELECT created_at FROM people WHERE id = ?1",
            (pid,),
        ).fetchone()
        if row is not None:
            conn.execute(
                """
                UPDATE people SET plan_id = ?1, display_name = ?2, assigned_table_id = ?3, assigned_seat_no = ?4,
                    meta_json = ?5, updated_at = ?6,
                    region = COALESCE(?7, region), position = COALESCE(?8, position), role = COALESCE(?9, role)
                WHERE id = ?10
                """,
                (
                    plan_id,
                    display_name,
                    atid,
                    asn,
                    meta,
                    t,
                    region_in,
                    position_in,
                    role_in,
                    pid,
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO people (id, plan_id, display_name, region, position, role, assigned_table_id, assigned_seat_no, meta_json, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                """,
                (
                    pid,
                    plan_id,
                    display_name,
                    region_in,
                    position_in,
                    role_in,
                    atid,
                    asn,
                    meta,
                    t,
                    t,
                ),
            )

    updated = bump_plan_updated(conn, plan_id)
    log_activity(
        conn,
        updated,
        plan_id,
        "savePeople",
        {"planId": plan_id, "count": len(people_in)},
    )
    return updated


def _plan_exists(conn: sqlite3.Connection, plan_id: str) -> bool:
    return (
        conn.execute("SELECT 1 FROM plans WHERE id = ?1", (plan_id,)).fetchone()
        is not None
    )


def create_person(
    conn: sqlite3.Connection,
    plan_id: str,
    *,
    display_name: str,
    region: str,
    position: str,
    role: str,
) -> tuple[dict[str, Any], int]:
    if not _plan_exists(conn, plan_id):
        raise ValueError("plan not found")
    pid = str(uuid.uuid4())
    t = now_ms()
    conn.execute(
        """
        INSERT INTO people (id, plan_id, display_name, region, position, role, assigned_table_id, assigned_seat_no, meta_json, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL, NULL, ?7, ?8)
        """,
        (pid, plan_id, display_name, region, position, role, t, t),
    )
    updated = bump_plan_updated(conn, plan_id)
    log_activity(conn, updated, plan_id, "createPerson", {"personId": pid})
    person = {
        "id": pid,
        "planId": plan_id,
        "displayName": display_name,
        "region": region,
        "position": position,
        "role": role,
        "assignedTableId": None,
        "assignedSeatNo": None,
        "metaJson": None,
        "createdAt": t,
        "updatedAt": t,
    }
    return person, updated


def update_person(
    conn: sqlite3.Connection,
    plan_id: str,
    person_id: str,
    *,
    display_name: str | None = None,
    region: str | None = None,
    position: str | None = None,
    role: str | None = None,
) -> tuple[dict[str, Any], int]:
    if not _plan_exists(conn, plan_id):
        raise ValueError("plan not found")
    row = conn.execute(
        "SELECT id FROM people WHERE id = ?1 AND plan_id = ?2",
        (person_id, plan_id),
    ).fetchone()
    if row is None:
        raise ValueError("person not found")
    if all(x is None for x in (display_name, region, position, role)):
        raise ValueError("no fields to update")

    sets: list[str] = []
    args: list[Any] = []
    t = now_ms()
    if display_name is not None:
        sets.append("display_name = ?")
        args.append(display_name)
    if region is not None:
        sets.append("region = ?")
        args.append(region)
    if position is not None:
        sets.append("position = ?")
        args.append(position)
    if role is not None:
        sets.append("role = ?")
        args.append(role)
    sets.append("updated_at = ?")
    args.append(t)
    args.extend([person_id, plan_id])
    conn.execute(
        f"UPDATE people SET {', '.join(sets)} WHERE id = ? AND plan_id = ?",
        args,
    )
    plan_updated = bump_plan_updated(conn, plan_id)
    log_activity(
        conn,
        plan_updated,
        plan_id,
        "updatePerson",
        {"personId": person_id},
    )
    cur = conn.execute(
        """
        SELECT id, plan_id, display_name, region, position, role, assigned_table_id, assigned_seat_no, meta_json, created_at, updated_at
        FROM people WHERE id = ?1 AND plan_id = ?2
        """,
        (person_id, plan_id),
    )
    r = cur.fetchone()
    if r is None:
        raise ValueError("person not found")
    person = {
        "id": r["id"],
        "planId": r["plan_id"],
        "displayName": r["display_name"],
        "region": r["region"],
        "position": r["position"],
        "role": r["role"],
        "assignedTableId": r["assigned_table_id"],
        "assignedSeatNo": r["assigned_seat_no"],
        "metaJson": r["meta_json"],
        "createdAt": r["created_at"],
        "updatedAt": r["updated_at"],
    }
    return person, plan_updated


def clear_seats_for_person(
    conn: sqlite3.Connection,
    plan_id: str,
    person_id: str,
) -> None:
    t = now_ms()
    conn.execute(
        """
        UPDATE seats SET person_id = NULL, updated_at = ?1
        WHERE plan_id = ?2 AND person_id = ?3
        """,
        (t, plan_id, person_id),
    )


def unassign_person(conn: sqlite3.Connection, plan_id: str, person_id: str) -> int:
    if not _plan_exists(conn, plan_id):
        raise ValueError("plan not found")
    row = conn.execute(
        "SELECT id FROM people WHERE id = ?1 AND plan_id = ?2",
        (person_id, plan_id),
    ).fetchone()
    if row is None:
        raise ValueError("person not found")
    t = now_ms()
    clear_seats_for_person(conn, plan_id, person_id)
    conn.execute(
        """
        UPDATE people SET assigned_table_id = NULL, assigned_seat_no = NULL, updated_at = ?1
        WHERE id = ?2 AND plan_id = ?3
        """,
        (t, person_id, plan_id),
    )
    plan_updated = bump_plan_updated(conn, plan_id)
    log_activity(
        conn,
        plan_updated,
        plan_id,
        "unassignPerson",
        {"personId": person_id},
    )
    return plan_updated


def delete_person(conn: sqlite3.Connection, plan_id: str, person_id: str) -> int:
    if not _plan_exists(conn, plan_id):
        raise ValueError("plan not found")
    row = conn.execute(
        "SELECT id FROM people WHERE id = ?1 AND plan_id = ?2",
        (person_id, plan_id),
    ).fetchone()
    if row is None:
        raise ValueError("person not found")
    t = now_ms()
    clear_seats_for_person(conn, plan_id, person_id)
    conn.execute("DELETE FROM people WHERE id = ?1 AND plan_id = ?2", (person_id, plan_id))
    plan_updated = bump_plan_updated(conn, plan_id)
    log_activity(
        conn,
        plan_updated,
        plan_id,
        "deletePerson",
        {"personId": person_id},
    )
    return plan_updated


def import_people_rows(
    conn: sqlite3.Connection,
    plan_id: str,
    rows: list[tuple[str, str, str, str]],
    *,
    first_row_no: int = 2,
) -> dict[str, Any]:
    if not _plan_exists(conn, plan_id):
        raise ValueError("plan not found")
    success: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []

    for i, (name, region, position, role) in enumerate(rows):
        row_no = first_row_no + i
        rreason: str | None = None
        if not name.strip():
            rreason = "姓名不能为空"
        elif not region.strip():
            rreason = "区域不能为空"
        elif not position.strip():
            rreason = "岗位不能为空"
        elif not role.strip():
            rreason = "角色不能为空"

        if rreason:
            failures.append(
                {
                    "row": row_no,
                    "name": name or "",
                    "region": region,
                    "position": position,
                    "role": role,
                    "reason": rreason,
                },
            )
            continue

        pid = str(uuid.uuid4())
        t = now_ms()
        conn.execute(
            """
            INSERT INTO people (id, plan_id, display_name, region, position, role, assigned_table_id, assigned_seat_no, meta_json, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL, NULL, ?7, ?8)
            """,
            (pid, plan_id, name.strip(), region.strip(), position.strip(), role.strip(), t, t),
        )
        success.append(
            {
                "id": pid,
                "name": name.strip(),
                "region": region.strip(),
                "position": position.strip(),
                "role": role.strip(),
            },
        )

    plan_updated = bump_plan_updated(conn, plan_id)
    log_activity(
        conn,
        plan_updated,
        plan_id,
        "importPeople",
        {"success": len(success), "failed": len(failures)},
    )
    return {
        "planUpdatedAt": plan_updated,
        "success": success,
        "failures": failures,
        "successCount": len(success),
        "failureCount": len(failures),
    }
