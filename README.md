# PyTrader

Aplicacion de escritorio en Python/PyQt6 para analizar tickers con yfinance.

## Instalar en Windows

Tambien puedes ejecutar `dist/PyTrader-Setup-Windows11.exe` en Windows 11 x64.
Este instalador incluye Python 3.13.12, descarga las dependencias y construye
`PyTrader.exe` en `%LOCALAPPDATA%\PyTrader\app\dist`. Crea accesos directos
en el Escritorio y el menu Inicio. Requiere Internet durante la instalacion;
el registro queda en `%LOCALAPPDATA%\PyTrader\install.log`.
Para configurar el correo en esta instalacion, copia `.env.example` como `.env`
en `%LOCALAPPDATA%\PyTrader\app\dist`, junto a `PyTrader.exe`.
El arranque de este instalador debe comprobarse en Windows; desde Linux se
verifica el formato EXE y la integridad del contenido, pero no su ejecucion.

Para regenerar el instalador desde Linux, instala `requirements-dev.txt`,
extrae `bin/7zSD.sfx` del [LZMA SDK 26.04](https://www.7-zip.org/a/lzma2604.7z)
y descarga el [instalador oficial Python 3.13.12 x64](https://www.python.org/ftp/python/3.13.12/python-3.13.12-amd64.exe).
Despues ejecuta:

```bash
.venv/bin/python build_windows_installer.py \
  --sfx-file /ruta/bin/7zSD.sfx \
  --python-installer /ruta/python-3.13.12-amd64.exe
```

Desde PowerShell, en la carpeta del proyecto:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install_windows.ps1
```

El instalador crea:

- un entorno virtual en `.venv`
- el lanzador `pytrader.bat`
- accesos directos en el Escritorio y en el menu Inicio

## Correo de resultados

Al finalizar el analisis, la aplicacion envia a `titogilito64@gmail.com` los
resultados con `Score` igual o superior a `80` si estan configuradas estas
variables.
Puedes definirlas en el entorno del sistema o crear un archivo `.env` en la
carpeta del proyecto usando `.env.example` como plantilla:

```bash
PYTRADER_SMTP_HOST=smtp.gmail.com
PYTRADER_SMTP_PORT=587
PYTRADER_SMTP_USER=tu_correo@gmail.com
PYTRADER_SMTP_PASSWORD=tu_password_de_aplicacion
PYTRADER_SMTP_FROM=tu_correo@gmail.com
```

`PYTRADER_SMTP_FROM` es opcional. Si no se define, se usa
`PYTRADER_SMTP_USER` como remitente.

Para Gmail, `PYTRADER_SMTP_PASSWORD` debe ser una contrasena de aplicacion, no
la contrasena normal de la cuenta.

## Instalar en Linux

Desde la carpeta del proyecto:

```bash
chmod +x install_linux.sh
./install_linux.sh
```

El instalador crea:

- un entorno virtual en `.venv`
- el comando `pytrader` en `~/.local/bin`
- una entrada de escritorio en `~/.local/share/applications/pytrader.desktop`

Si `~/.local/bin` no esta en tu `PATH`, puedes abrir la aplicacion desde el menu
de Linux o ejecutar directamente:

```bash
~/.local/bin/pytrader
```

## Crear ejecutable para Linux

Desde Linux:

```bash
chmod +x build_linux.sh
./build_linux.sh
```

El ejecutable queda en:

```bash
dist/PyTrader
```

Para crear el ejecutable e instalarlo en el menu de aplicaciones:

```bash
./build_linux.sh --install
```

## Crear ejecutable para Windows 11

El `.exe` debe generarse en Windows. Desde PowerShell, en la carpeta del
proyecto:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build_windows.ps1
```

Para crear el ejecutable e instalar accesos directos en el Escritorio y el menu Inicio:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build_windows.ps1 -Install
```

El ejecutable queda en:

```powershell
dist\PyTrader.exe
```

Si estas trabajando desde Linux, puedes preparar un paquete para copiar a
Windows 11 y construir alli el `.exe`:

```bash
chmod +x package_windows_source.sh
./package_windows_source.sh
```

El paquete queda en:

```bash
dist/PyTrader-windows11-source-installer.zip
```
