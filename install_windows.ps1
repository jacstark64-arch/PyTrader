$ErrorActionPreference = "Stop"

$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvDir = Join-Path $AppDir ".venv"
$Launcher = Join-Path $AppDir "pytrader.bat"
$PythonExe = Join-Path $VenvDir "Scripts\python.exe"
$PipExe = Join-Path $VenvDir "Scripts\pip.exe"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python no esta disponible en PATH. Instala Python y vuelve a ejecutar este instalador."
}

if (-not (Test-Path $PythonExe)) {
    python -m venv $VenvDir
}

& $PythonExe -m pip install --upgrade pip
& $PipExe install -r (Join-Path $AppDir "requirements.txt")

$IconPng = Join-Path $AppDir "lupa-diagrama-negocios.png"
$IconIco = Join-Path $AppDir "pytrader.ico"
if ((Test-Path $IconPng) -and (-not (Test-Path $IconIco))) {
    Add-Type -AssemblyName System.Drawing
    $SourceBitmap = [System.Drawing.Bitmap]::new($IconPng)
    $Bitmap = [System.Drawing.Bitmap]::new($SourceBitmap, [System.Drawing.Size]::new(256, 256))
    $SourceBitmap.Dispose()
    try {
        $Icon = [System.Drawing.Icon]::FromHandle($Bitmap.GetHicon())
        $Stream = [System.IO.File]::Create($IconIco)
        try {
            $Icon.Save($Stream)
        }
        finally {
            $Stream.Close()
            $Icon.Dispose()
        }
    }
    finally {
        $Bitmap.Dispose()
    }
}

@"
@echo off
cd /d "$AppDir"
"$PythonExe" "$AppDir\F_Trader_4.py"
"@ | Set-Content -LiteralPath $Launcher -Encoding ASCII

$WScript = New-Object -ComObject WScript.Shell
$DesktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "PyTrader.lnk"
$StartMenuDir = Join-Path ([Environment]::GetFolderPath("Programs")) "PyTrader"
$StartMenuShortcut = Join-Path $StartMenuDir "PyTrader.lnk"

New-Item -ItemType Directory -Force -Path $StartMenuDir | Out-Null

foreach ($ShortcutPath in @($DesktopShortcut, $StartMenuShortcut)) {
    $Shortcut = $WScript.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = $Launcher
    $Shortcut.WorkingDirectory = $AppDir
    if (Test-Path $IconIco) {
        $Shortcut.IconLocation = $IconIco
    }
    $Shortcut.Description = "Smart Money stock screener"
    $Shortcut.Save()
}

Write-Host "PyTrader instalado."
Write-Host "Puedes abrirlo desde el acceso directo del Escritorio, el menu Inicio o ejecutando:"
Write-Host $Launcher
