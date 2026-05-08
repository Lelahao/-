"""座位（对应 db_save_seats / db_move_seat_person / db_swap_seat_persons）。"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from server.api.common import run_read, run_write
from server.repositories import plan_repo

router = APIRouter(prefix="/api", tags=["seats"])


class SeatIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str | None = None
    tableId: str
    seatNo: int
    personId: str | None = None
    locked: bool | None = None


class SaveSeatsBody(BaseModel):
    seats: list[SeatIn]


class SeatRef(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    tableId: str
    seatNo: int


class MoveSeatBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    personId: str
    targetTableId: str
    targetSeatNo: int


class SwapSeatsBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    a: SeatRef
    b: SeatRef


@router.get("/plans/{plan_id}/seats")
def list_seats(plan_id: str):
    def r(conn):
        d = plan_repo.get_plan_detail(conn, plan_id)
        return {"seats": d["seats"]}

    return run_read(r)


@router.put("/plans/{plan_id}/seats")
def put_seats(plan_id: str, body: SaveSeatsBody):
    def w(conn):
        rows = [s.model_dump(mode="json", by_alias=True) for s in body.seats]
        return {"planUpdatedAt": plan_repo.save_seats(conn, plan_id, rows)}

    return run_write(w)


@router.post("/plans/{plan_id}/seats/move-person")
def move_seat_person(plan_id: str, body: MoveSeatBody):
    def w(conn):
        return {
            "planUpdatedAt": plan_repo.move_seat_person(
                conn,
                plan_id,
                body.personId,
                body.targetTableId,
                body.targetSeatNo,
            ),
        }

    return run_write(w)


@router.post("/plans/{plan_id}/seats/swap")
def swap_seats(plan_id: str, body: SwapSeatsBody):
    def w(conn):
        return {
            "planUpdatedAt": plan_repo.swap_seat_persons(
                conn,
                plan_id,
                body.a.tableId,
                body.a.seatNo,
                body.b.tableId,
                body.b.seatNo,
            ),
        }

    return run_write(w)
