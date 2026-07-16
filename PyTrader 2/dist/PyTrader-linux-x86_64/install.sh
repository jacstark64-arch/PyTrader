#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/opt/pytrader"
LAUNCHER="$HOME/.local/bin/pytrader"
DESKTOP_FILE="$HOME/.local/share/applications/pytrader.desktop"

mkdir -p "$INSTALL_DIR" "$HOME/.local/bin" "$HOME/.local/share/applications"
cp "$SCRIPT_DIR/PyTrader" "$INSTALL_DIR/PyTrader"
chmod +x "$INSTALL_DIR/PyTrader"

cat > "$LAUNCHER" <<LAUNCHER_EOF
#!/usr/bin/env bash
exec "$INSTALL_DIR/PyTrader"
LAUNCHER_EOF
chmod +x "$LAUNCHER"

cat > "$DESKTOP_FILE" <<DESKTOP_EOF
[Desktop Entry]
Type=Application
Name=PyTrader
Comment=Smart Money stock screener
Exec=$LAUNCHER
Terminal=false
Categories=Office;Finance;
StartupNotify=true
DESKTOP_EOF

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true
fi

echo "PyTrader instalado."
echo "Comando: pytrader"
