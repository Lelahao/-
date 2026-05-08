"""本地 API 入口：仅绑定 127.0.0.1。"""

from __future__ import annotations

from contextlib import asynccontextmanager

import sqlite3
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from server.api.common import value_error_response
from server.api.export_routes import router as export_router
from server.api.health_routes import router as health_router
from server.api.layout_routes import router as layout_router
from server.api.log_routes import router as log_router
from server.api.people_routes import router as people_router
from server.api.plan_routes import router as plan_router
from server.api.seat_routes import router as seat_router
from server.api.settings_routes import router as settings_router
from server.api.table_routes import router as table_router
from server.core.database import init_database


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_database()
    yield


app = FastAPI(title="排座助手本地服务", lifespan=lifespan)
app.add_exception_handler(
    ValueError,
    lambda _req, exc: value_error_response(exc),
)
app.add_exception_handler(
    sqlite3.IntegrityError,
    lambda _req, exc: JSONResponse(
        status_code=400,
        content={"message": str(exc)},
    ),
)

app.include_router(health_router)
app.include_router(plan_router)
app.include_router(people_router)
app.include_router(table_router)
app.include_router(seat_router)
app.include_router(layout_router)
app.include_router(settings_router)
app.include_router(export_router)
app.include_router(log_router)
