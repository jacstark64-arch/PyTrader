# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path
import sys

ROOT = Path(SPECPATH)
ICON_FILE = ROOT / "pytrader.ico"
if not ICON_FILE.exists() and sys.platform != "win32":
    ICON_FILE = ROOT / "lupa-diagrama-negocios.png"
if not ICON_FILE.exists():
    ICON_FILE = None

a = Analysis(
    ["F_Trader_4.py"],
    pathex=[str(ROOT)],
    binaries=[],
    datas=[
        ("F_Trader_4.ui", "."),
        ("lupa-diagrama-negocios.png", "."),
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="PyTrader",
    icon=str(ICON_FILE) if ICON_FILE else None,
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
