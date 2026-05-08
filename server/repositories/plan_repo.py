"""方案域数据访问（对应 app_db.rs 各 db_* command）。"""

from __future__ import annotations

import json
import sqlite3
import uuid
from typing import Any

from server.core.database import get_connection, now_ms
from server.repositories.activity_repo import log_activity


def create_plan(conn: sqlite3.Connection, name: str, note: str | None) -> dict[str, Any]:
    pid = str(uuid.uuid4())
    t = now_ms()
    conn.execute(
        """
        INSERT INTO plans (id, name, note, status, created_at, updated_at)
        VALUES (?1, ?2, ?3, 'draft', ?4, ?5)
        """,
        (pid, name, note, t, t),
    )
    log_activity(conn, t, pid, "createPlan", {"planId": pid})
    return {"id": pid, "updatedAt": t}


def list_plans(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    cur = conn.execute(
        """
        SELECT id, name, note, status, created_at, updated_at
        FROM plans
        ORDER BY updated_at DESC
        """
    )
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "note": r["note"],
            "status": r["status"],
            "createdAt": r["created_at"],
            "updatedAt": r["updated_at"],
        }
        for r in cur.fetchall()
    ]


def bump_plan_updated(conn: sqlite3.Connection, plan_id: str) -> int:
    t = now_ms()
    conn.execute(
        "UPDATE plans SET updated_at = ?1 WHERE id = ?2",
        (t, plan_id),
    )
    return t


def update_plan(
    conn: sqlite3.Connection,
    plan_id: str,
    name: str | None,
    note: str | None,
    status: str | None,
) -> dict[str, Any]:
    t = now_ms()
    if name is not None:
        conn.execute(
            "UPDATE plans SET name = ?1, updated_at = ?2 WHERE id = ?3",
            (name, t, plan_id),
        )
    if note is not None:
        conn.execute(
            "UPDATE plans SET note = ?1, updated_at = ?2 WHERE id = ?3",
            (note, t, plan_id),
        )
    if status is not None:
        conn.execute(
            "UPDATE plans SET status = ?1, updated_at = ?2 WHERE id = ?3",
            (status, t, plan_id),
        )
    updated = bump_plan_updated(conn, plan_id)
    log_activity(conn, updated, plan_id, "updatePlan", {"planId": plan_id})
    return {"id": plan_id, "updatedAt": updated}


def delete_plan(conn: sqlite3.Connection, plan_id: str) -> None:
    conn.execute("DELETE FROM plans WHERE id = ?1", (plan_id,))


def get_plan_detail(conn: sqlite3.Connection, plan_id: str) -> dict[str, Any]:
    cur = conn.execute(
        """
        SELECT id, name, note, status, created_at, updated_at
        FROM plans WHERE id = ?1
        """,
        (plan_id,),
    )
    row = cur.fetchone()
    if row is None:
        raise ValueError("plan not found")
    plan = {
        "id": row["id"],
        "name": row["name"],
        "note": row["note"],
        "status": row["status"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }

    cur = conn.execute(
        """
        SELECT id, plan_id, display_name, assigned_table_id, assigned_seat_no, meta_json, created_at, updated_at
        FROM people WHERE plan_id = ?1 ORDER BY id
        """,
        (plan_id,),
    )
    people = [
        {
            "id": r["id"],
            "planId": r["plan_id"],
            "displayName": r["display_name"],
            "assignedTableId": r["assigned_table_id"],
            "assignedSeatNo": r["assigned_seat_no"],
            "metaJson": r["meta_json"],
            "createdAt": r["created_at"],
            "updatedAt": r["updated_at"],
        }
        for r in cur.fetchall()
    ]

    cur = conn.execute(
        """
        SELECT id, plan_id, table_no, hall_name, capacity, kind, meta_json, created_at, updated_at
        FROM tables WHERE plan_id = ?1 ORDER BY table_no
        """,
        (plan_id,),
    )
    tables = [
        {
            "id": r["id"],
            "planId": r["plan_id"],
            "tableNo": r["table_no"],
            "hallName": r["hall_name"],
            "capacity": r["capacity"],
            "kind": r["kind"],
            "metaJson": r["meta_json"],
            "createdAt": r["created_at"],
            "updatedAt": r["updated_at"],
        }
        for r in cur.fetchall()
    ]

    cur = conn.execute(
        """
        SELECT id, plan_id, table_id, seat_no, person_id, locked, meta_json, created_at, updated_at
        FROM seats WHERE plan_id = ?1 ORDER BY table_id, seat_no
        """,
        (plan_id,),
    )
    seats = [
        {
            "id": r["id"],
            "planId": r["plan_id"],
            "tableId": r["table_id"],
            "seatNo": r["seat_no"],
            "personId": r["person_id"],
            "locked": bool(r["locked"]),
            "metaJson": r["meta_json"],
            "createdAt": r["created_at"],
            "updatedAt": r["updated_at"],
        }
        for r in cur.fetchall()
    ]

    return {"plan": plan, "people": people, "tables": tables, "seats": seats}


def _tbl_get(t: dict[str, Any], *keys: str) -> Any:
    for k in keys:
        if k in t:
            return t[k]
    return None


def save_tables(conn: sqlite3.Connection, plan_id: str, tables_in: list[dict[str, Any]]) -> int:
    t = now_ms()
    cur = conn.execute("SELECT id FROM tables WHERE plan_id = ?1", (plan_id,))
    existing = [r[0] for r in cur.fetchall()]
    keep: set[str] = set()

    for tbl in tables_in:
        tid = _tbl_get(tbl, "id") or str(uuid.uuid4())
        keep.add(tid)
        table_no = int(_tbl_get(tbl, "table_no", "tableNo"))
        hall_name = _tbl_get(tbl, "hall_name", "hallName")
        capacity = int(_tbl_get(tbl, "capacity"))
        kind = _tbl_get(tbl, "kind") or "round"

        cur2 = conn.execute(
            "SELECT COUNT(1) FROM tables WHERE id = ?1",
            (tid,),
        )
        exists = cur2.fetchone()[0]

        if exists:
            conn.execute(
                """
                UPDATE tables SET plan_id = ?1, table_no = ?2, hall_name = ?3, capacity = ?4, kind = ?5, updated_at = ?6
                WHERE id = ?7
                """,
                (plan_id, table_no, hall_name, capacity, kind, t, tid),
            )
        else:
            conn.execute(
                """
                INSERT INTO tables (id, plan_id, table_no, hall_name, capacity, kind, meta_json, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?8)
                """,
                (tid, plan_id, table_no, hall_name, capacity, kind, t, t),
            )

    for eid in existing:
        if eid not in keep:
            conn.execute("DELETE FROM tables WHERE id = ?1", (eid,))

    plan_updated = bump_plan_updated(conn, plan_id)
    log_activity(conn, plan_updated, plan_id, "saveTables", {"planId": plan_id})
    return plan_updated


def save_seats(conn: sqlite3.Connection, plan_id: str, seats_in: list[dict[str, Any]]) -> int:
    t = now_ms()

    for s in seats_in:
        sid = _tbl_get(s, "id") or str(uuid.uuid4())
        table_id = str(_tbl_get(s, "table_id", "tableId"))
        seat_no = int(_tbl_get(s, "seat_no", "seatNo"))
        person_id = _tbl_get(s, "person_id", "personId")
        locked = bool(_tbl_get(s, "locked") or False)
        locked_i = 1 if locked else 0

        cur = conn.execute(
            "SELECT COUNT(1) FROM seats WHERE table_id = ?1 AND seat_no = ?2",
            (table_id, seat_no),
        )
        exists = cur.fetchone()[0]

        if exists:
            conn.execute(
                """
                UPDATE seats SET plan_id = ?1, person_id = ?2, locked = ?3, updated_at = ?4
                WHERE table_id = ?5 AND seat_no = ?6
                """,
                (plan_id, person_id, locked_i, t, table_id, seat_no),
            )
        else:
            conn.execute(
                """
                INSERT INTO seats (id, plan_id, table_id, seat_no, person_id, locked, meta_json, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?8)
                """,
                (sid, plan_id, table_id, seat_no, person_id, locked_i, t, t),
            )

        if person_id is not None:
            conn.execute(
                """
                UPDATE people SET assigned_table_id = ?1, assigned_seat_no = ?2, updated_at = ?3
                WHERE id = ?4 AND plan_id = ?5
                """,
                (table_id, seat_no, t, person_id, plan_id),
            )

    plan_updated = bump_plan_updated(conn, plan_id)
    log_activity(conn, plan_updated, plan_id, "saveSeats", {"planId": plan_id})
    return plan_updated


def move_seat_person(
    conn: sqlite3.Connection,
    plan_id: str,
    person_id: str,
    target_table_id: str,
    target_seat_no: int,
) -> int:
    t = now_ms()

    row = conn.execute(
        "SELECT id FROM people WHERE id = ?1 AND plan_id = ?2",
        (person_id, plan_id),
    ).fetchone()
    if row is None:
        raise ValueError("person not found")

    tgt_sid = conn.execute(
        """
        SELECT id FROM seats WHERE plan_id = ?1 AND table_id = ?2 AND seat_no = ?3
        """,
        (plan_id, target_table_id, target_seat_no),
    ).fetchone()
    if tgt_sid is None:
        raise ValueError("target seat not found")
    tgt_sid = tgt_sid[0]

    src = conn.execute(
        """
        SELECT id, table_id, seat_no FROM seats WHERE plan_id = ?1 AND person_id = ?2 LIMIT 1
        """,
        (plan_id, person_id),
    ).fetchone()

    if src is not None:
        _, stid, sn = src
        if stid == target_table_id and sn == target_seat_no:
            cur = conn.execute(
                "SELECT updated_at FROM plans WHERE id = ?1",
                (plan_id,),
            )
            return cur.fetchone()[0]

        conn.execute(
            "UPDATE seats SET person_id = NULL, updated_at = ?1 WHERE id = ?2",
            (t, src[0]),
        )

    tgt_row = conn.execute(
        "SELECT person_id FROM seats WHERE id = ?1",
        (tgt_sid,),
    ).fetchone()
    tgt_pid = tgt_row[0] if tgt_row else None

    if tgt_pid is not None and tgt_pid != person_id:
        conn.execute(
            """
            UPDATE people SET assigned_table_id = NULL, assigned_seat_no = NULL, updated_at = ?1
            WHERE id = ?2
            """,
            (t, tgt_pid),
        )

    conn.execute(
        "UPDATE seats SET person_id = ?1, updated_at = ?2 WHERE id = ?3",
        (person_id, t, tgt_sid),
    )
    conn.execute(
        """
        UPDATE people SET assigned_table_id = ?1, assigned_seat_no = ?2, updated_at = ?3
        WHERE id = ?4
        """,
        (target_table_id, target_seat_no, t, person_id),
    )

    plan_updated = bump_plan_updated(conn, plan_id)
    log_activity(
        conn,
        plan_updated,
        plan_id,
        "moveSeatPerson",
        {
            "personId": person_id,
            "targetTableId": target_table_id,
            "targetSeatNo": target_seat_no,
        },
    )
    return plan_updated


def swap_seat_persons(
    conn: sqlite3.Connection,
    plan_id: str,
    a_table_id: str,
    a_seat_no: int,
    b_table_id: str,
    b_seat_no: int,
) -> int:
    t = now_ms()

    id_a = conn.execute(
        """
        SELECT id FROM seats WHERE plan_id = ?1 AND table_id = ?2 AND seat_no = ?3
        """,
        (plan_id, a_table_id, a_seat_no),
    ).fetchone()
    id_b = conn.execute(
        """
        SELECT id FROM seats WHERE plan_id = ?1 AND table_id = ?2 AND seat_no = ?3
        """,
        (plan_id, b_table_id, b_seat_no),
    ).fetchone()
    if id_a is None or id_b is None:
        raise ValueError("seat not found")
    id_a, id_b = id_a[0], id_b[0]

    pa = conn.execute(
        "SELECT person_id FROM seats WHERE id = ?1",
        (id_a,),
    ).fetchone()[0]
    pb = conn.execute(
        "SELECT person_id FROM seats WHERE id = ?1",
        (id_b,),
    ).fetchone()[0]

    conn.execute(
        "UPDATE seats SET person_id = ?1, updated_at = ?2 WHERE id = ?3",
        (pb, t, id_a),
    )
    conn.execute(
        "UPDATE seats SET person_id = ?1, updated_at = ?2 WHERE id = ?3",
        (pa, t, id_b),
    )

    if pa is not None:
        conn.execute(
            """
            UPDATE people SET assigned_table_id = ?1, assigned_seat_no = ?2, updated_at = ?3
            WHERE id = ?4
            """,
            (b_table_id, b_seat_no, t, pa),
        )
    if pb is not None:
        conn.execute(
            """
            UPDATE people SET assigned_table_id = ?1, assigned_seat_no = ?2, updated_at = ?3
            WHERE id = ?4
            """,
            (a_table_id, a_seat_no, t, pb),
        )

    plan_updated = bump_plan_updated(conn, plan_id)
    log_activity(
        conn,
        plan_updated,
        plan_id,
        "swapSeatPersons",
        {"a": {"tableId": a_table_id, "seatNo": a_seat_no}, "b": {"tableId": b_table_id, "seatNo": b_seat_no}},
    )
    return plan_updated


def insert_export_record(
    conn: sqlite3.Connection,
    rid: str,
    plan_id: str | None,
    format_name: str,
    meta: dict[str, Any] | None,
    created_at: int,
) -> None:
    conn.execute(
        """
        INSERT INTO export_records (id, plan_id, format, meta_json, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        """,
        (
            rid,
            plan_id,
            format_name,
            json.dumps(meta or {}, ensure_ascii=False),
            created_at,
        ),
    )
