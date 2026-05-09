"""人员批量读写（Tauri 无独立 command；供 REST 与后续前端接入）。"""

from __future__ import annotations

import sqlite3
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

        row = conn.execute(
            "SELECT created_at FROM people WHERE id = ?1",
            (pid,),
        ).fetchone()
        if row is not None:
            conn.execute(
                """
                UPDATE people SET plan_id = ?1, display_name = ?2, assigned_table_id = ?3, assigned_seat_no = ?4,
                    meta_json = ?5, updated_at = ?6
                WHERE id = ?7
                """,
                (plan_id, display_name, atid, asn, meta, t, pid),
            )
        else:
            conn.execute(
                """
                INSERT INTO people (id, plan_id, display_name, assigned_table_id, assigned_seat_no, meta_json, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                """,
                (pid, plan_id, display_name, atid, asn, meta, t, t),
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