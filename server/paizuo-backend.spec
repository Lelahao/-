# -*- mode: python ; coding: utf-8 -*-
# 在项目根目录执行:
#   pyinstaller --clean --noconfirm --distpath dist-backend --workpath server/build server/paizuo-backend.spec
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

SPEC_DIR = Path(SPEC).resolve().parent
PROJECT_ROOT = SPEC_DIR.parent
sys.path.insert(0, str(PROJECT_ROOT))

block_cipher = None

hiddenimports = collect_submodules("uvicorn") + collect_submodules("server")

a = Analysis(
    [str(SPEC_DIR / "run_desktop.py")],
    pathex=[str(PROJECT_ROOT)],
    binaries=[],
    datas=[
        (str(SPEC_DIR / "migrations"), "server/migrations"),
    ],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="paizuo-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
