"""Package the Windows bootstrap installer using the official 7-Zip SFX module."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tempfile

import py7zr


def build_installer(sfx_file, python_installer):
    root = Path(__file__).resolve().parent
    files = ["F_Trader_4.py", "F_Trader_4.ui", "lupa-diagrama-negocios.png",
             ".env.example", "requirements.txt", "requirements-build.txt", "pytrader.spec",
             "build_windows.ps1", "package_windows.ps1", "install_windows.ps1", "setup_windows11.ps1"]
    if not sfx_file.read_bytes().startswith(b"MZ") or not python_installer.read_bytes().startswith(b"MZ"):
        raise ValueError("Both inputs must be Windows executables from the official distributors.")
    output = root / "dist" / "PyTrader-Setup-Windows11.exe"
    output.parent.mkdir(exist_ok=True)
    config = (';!@Install@!UTF-8!\n'
              'Title="PyTrader - Windows 11"\n'
              'BeginPrompt="Instalar PyTrader para este usuario? Necesita Internet y puede tardar varios minutos."\n'
              'Directory=""\n'
              'RunProgram="powershell.exe -NoProfile -ExecutionPolicy Bypass -File \\"%%T\\\\setup_windows11.ps1\\""\n'
              ';!@InstallEnd@!\n').encode("utf-8")
    with tempfile.TemporaryDirectory(prefix="pytrader-installer-") as temporary:
        archive_path = Path(temporary) / "payload.7z"
        with py7zr.SevenZipFile(archive_path, "w", filters=[{"id": py7zr.FILTER_LZMA}]) as archive:
            for filename in files:
                archive.write(root / filename, filename)
            archive.write(python_installer, "python-3.13.12-amd64.exe")
        with output.open("wb") as destination:
            with sfx_file.open("rb") as handle:
                shutil.copyfileobj(handle, destination)
            destination.write(config)
            with archive_path.open("rb") as handle:
                shutil.copyfileobj(handle, destination)
    manifest = {"installer": output.name, "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
                "sfx_sha256": hashlib.sha256(sfx_file.read_bytes()).hexdigest(),
                "python_sha256": hashlib.sha256(python_installer.read_bytes()).hexdigest(),
                "python_source": "https://www.python.org/ftp/python/3.13.12/python-3.13.12-amd64.exe",
                "sfx_source": "https://www.7-zip.org/a/lzma2604.7z"}
    output.with_suffix(".manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sfx-file", type=Path, required=True)
    parser.add_argument("--python-installer", type=Path, required=True)
    args = parser.parse_args()
    build_installer(args.sfx_file, args.python_installer)
