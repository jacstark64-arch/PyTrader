#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$APP_DIR/dist"
PACKAGE_NAME="PyTrader-windows11-source-installer"
PACKAGE_DIR="$DIST_DIR/$PACKAGE_NAME"
ARCHIVE="$DIST_DIR/$PACKAGE_NAME.zip"

mkdir -p "$DIST_DIR"
rm -rf "$PACKAGE_DIR" "$ARCHIVE"
mkdir -p "$PACKAGE_DIR"

cp "$APP_DIR/F_Trader_4.py" "$PACKAGE_DIR/F_Trader_4.py"
cp "$APP_DIR/F_Trader_4.ui" "$PACKAGE_DIR/F_Trader_4.ui"
cp "$APP_DIR/lupa-diagrama-negocios.png" "$PACKAGE_DIR/lupa-diagrama-negocios.png"
cp "$APP_DIR/.env.example" "$PACKAGE_DIR/.env.example"
cp "$APP_DIR/requirements.txt" "$PACKAGE_DIR/requirements.txt"
cp "$APP_DIR/requirements-build.txt" "$PACKAGE_DIR/requirements-build.txt"
cp "$APP_DIR/pytrader.spec" "$PACKAGE_DIR/pytrader.spec"
cp "$APP_DIR/install_windows.ps1" "$PACKAGE_DIR/install_windows.ps1"
cp "$APP_DIR/build_windows.ps1" "$PACKAGE_DIR/build_windows.ps1"
cp "$APP_DIR/package_windows.ps1" "$PACKAGE_DIR/package_windows.ps1"

cat > "$PACKAGE_DIR/README.txt" <<'EOF'
PyTrader para Windows 11

Este paquete se debe ejecutar en Windows 11 porque PyInstaller crea ejecutables
nativos del sistema donde se ejecuta.

Instalar desde codigo fuente:
1. Instala Python 3.12 o superior y marca "Add python.exe to PATH".
2. Abre PowerShell en esta carpeta.
3. Ejecuta:
   powershell -NoProfile -ExecutionPolicy Bypass -File .\install_windows.ps1

Crear PyTrader.exe e instalador portable:
1. Abre PowerShell en esta carpeta.
2. Ejecuta:
   powershell -NoProfile -ExecutionPolicy Bypass -File .\build_windows.ps1

El ejecutable queda en dist\PyTrader.exe.
El instalable queda en dist\PyTrader-windows11-x64.zip.

Para crear el ejecutable y accesos directos a la vez:
   powershell -NoProfile -ExecutionPolicy Bypass -File .\build_windows.ps1 -Install
EOF

if command -v zip >/dev/null 2>&1; then
    (cd "$DIST_DIR" && zip -qr "$ARCHIVE" "$PACKAGE_NAME")
else
    python3 -m zipfile -c "$ARCHIVE" "$PACKAGE_DIR"
fi

echo "Paquete fuente Windows 11 creado en: $ARCHIVE"
