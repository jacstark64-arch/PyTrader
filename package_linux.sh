#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$APP_DIR/dist"
PACKAGE_NAME="PyTrader-linux-x86_64"
PACKAGE_DIR="$DIST_DIR/$PACKAGE_NAME"
ARCHIVE="$DIST_DIR/$PACKAGE_NAME.tar.gz"

if [[ ! -x "$DIST_DIR/PyTrader" ]]; then
    echo "No se encontro $DIST_DIR/PyTrader. Ejecuta primero: ./build_linux.sh" >&2
    exit 1
fi

rm -rf "$PACKAGE_DIR" "$ARCHIVE"
mkdir -p "$PACKAGE_DIR"

cp "$DIST_DIR/PyTrader" "$PACKAGE_DIR/PyTrader"
cp "$APP_DIR/lupa-diagrama-negocios.png" "$PACKAGE_DIR/lupa-diagrama-negocios.png"
cp "$APP_DIR/.env.example" "$PACKAGE_DIR/.env.example"

cat > "$PACKAGE_DIR/install.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/opt/pytrader"
LAUNCHER="$HOME/.local/bin/pytrader"
DESKTOP_FILE="$HOME/.local/share/applications/pytrader.desktop"

mkdir -p "$INSTALL_DIR" "$HOME/.local/bin" "$HOME/.local/share/applications"
cp "$SCRIPT_DIR/PyTrader" "$INSTALL_DIR/PyTrader"
cp "$SCRIPT_DIR/lupa-diagrama-negocios.png" "$INSTALL_DIR/lupa-diagrama-negocios.png"
cp "$SCRIPT_DIR/.env.example" "$INSTALL_DIR/.env.example"
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
Icon=$INSTALL_DIR/lupa-diagrama-negocios.png
Terminal=false
Categories=Office;Finance;
StartupNotify=true
DESKTOP_EOF

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true
fi

echo "PyTrader instalado."
echo "Comando: pytrader"
EOF

chmod +x "$PACKAGE_DIR/install.sh"

cat > "$PACKAGE_DIR/README.txt" <<'EOF'
PyTrader para Linux x86_64

Instalacion:
1. Descomprime este paquete.
2. Ejecuta ./install.sh
3. Abre PyTrader desde el menu de aplicaciones o ejecuta: pytrader

Configuracion opcional de correo:
- Copia .env.example como .env dentro de ~/.local/opt/pytrader
- Rellena las variables SMTP antes de abrir la aplicacion
EOF

tar -C "$DIST_DIR" -czf "$ARCHIVE" "$PACKAGE_NAME"
echo "Instalable Linux creado en: $ARCHIVE"
