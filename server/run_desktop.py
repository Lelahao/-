"""Electron 桌面环境入口：启动内嵌 uvicorn，非业务逻辑。"""

from __future__ import annotations

import os

# 供 PyInstaller 静态依赖收集
import server.main  # noqa: F401


def main() -> None:
    import uvicorn

    port_s = os.environ.get("PAIZUO_PORT") or os.environ.get("PAIZUO_BACKEND_PORT") or "8765"
    port = int(port_s)
    host = os.environ.get("PAIZUO_HOST", "127.0.0.1")
    uvicorn.run(
        "server.main:app",
        host=host,
        port=port,
        factory=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
