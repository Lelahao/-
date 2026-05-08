"""数据目录等运行配置。"""

from __future__ import annotations

import os
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parent.parent


def get_data_dir() -> Path:
    raw = os.environ.get("PAIZUO_DATA_DIR")
    if raw and raw.strip():
        return Path(raw).expanduser().resolve()
    return (SERVER_ROOT / "data").resolve()


def get_db_path() -> Path:
    return get_data_dir() / "paizuo_local.db"
