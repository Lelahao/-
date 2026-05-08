"""本地 API 入口：仅绑定 127.0.0.1。"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from server.api.health_routes import router as health_router
from server.api.settings_routes import router as settings_router
from server.core.database import init_database


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_database()
    yield


app = FastAPI(title="排座助手本地服务", lifespan=lifespan)
app.include_router(health_router)
app.include_router(settings_router)
