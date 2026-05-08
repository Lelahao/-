"""全屏/总览布局快照（对应 layout_db.rs save_round_layout / load_round_layout）。"""

from __future__ import annotations

import json
import sqlite3
from typing import Any

from server.core.database import get_connection


def _normalize_tables(raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for t in raw:
        out.append(
            {
                "id": t["id"],
                "table_no": int(t.get("no", t.get("table_no"))),
                "hall_name": str(t.get("hallName", t.get("hall_name", ""))),
                "capacity": int(t["capacity"]),
            }
        )
    return out


def _normalize_people(raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for p in raw:
        tid = p.get("assignedTableId", p.get("assigned_table_id"))
        sn = p.get("assignedSeatNo", p.get("assigned_seat_no"))
        out.append(
            {
                "id": p["id"],
                "display_name": str(p.get("name", p.get("display_name", ""))),
                "assigned_table_id": tid,
                "assigned_seat_no": int(sn) if sn is not None else None,
            }
        )
    return out


def save_round_layout(conn: sqlite3.Connection, payload: dict[str, Any]) -> None:
    """与 Rust 相同语义：清空三张 layout 表后重写。"""
    tables = _normalize_tables(list(payload.get("tables") or []))
    people = _normalize_people(list(payload.get("people") or []))

    conn.execute("DELETE FROM round_layout_seats")
    conn.execute("DELETE FROM round_layout_people")
    conn.execute("DELETE FROM round_layout_table_defs")

    for t in tables:
        conn.execute(
            """
            INSERT INTO round_layout_table_defs (id, table_no, hall_name, capacity)
            VALUES (?1, ?2, ?3, ?4)
            """,
            (t["id"], t["table_no"], t["hall_name"], t["capacity"]),
        )

    for p in people:
        conn.execute(
            """
            INSERT INTO round_layout_people (id, display_name, assigned_table_id, assigned_seat_no)
            VALUES (?1, ?2, ?3, ?4)
            """,
            (
                p["id"],
                p["display_name"],
                p["assigned_table_id"],
                p["assigned_seat_no"],
            ),
        )
        tid = p["assigned_table_id"]
        sn = p["assigned_seat_no"]
        if tid is not None and sn is not None:
            conn.execute(
                """
                INSERT INTO round_layout_seats (table_id, seat_no, person_id)
                VALUES (?1, ?2, ?3)
                """,
                (tid, sn, p["id"]),
            )


def load_round_layout(conn: sqlite3.Connection) -> dict[str, Any]:
    cur_t = conn.execute(
        "SELECT id, table_no, hall_name, capacity FROM round_layout_table_defs ORDER BY table_no ASC"
    )
    tables = [
        {
            "id": r["id"],
            "no": r["table_no"],
            "hallName": r["hall_name"],
            "capacity": r["capacity"],
        }
        for r in cur_t.fetchall()
    ]

    cur_p = conn.execute(
        "SELECT id, display_name, assigned_table_id, assigned_seat_no FROM round_layout_people ORDER BY id ASC"
    )
    people = [
        {
            "id": r["id"],
            "name": r["display_name"],
            "assignedTableId": r["assigned_table_id"],
            "assignedSeatNo": r["assigned_seat_no"],
        }
        for r in cur_p.fetchall()
    ]

    return {"people": people, "tables": tables}


def save_round_layout_json(payload_json: str) -> None:
    payload = json.loads(payload_json)
    with get_connection() as conn:
        save_round_layout(conn, payload)
        conn.commit()


def load_round_layout_json() -> str:
    with get_connection() as conn:
        dto = load_round_layout(conn)
    return json.dumps(dto, ensure_ascii=False)
