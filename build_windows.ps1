param(
    [switch]$Install
)

$ErrorActionPreference = "Stop"

$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvDir = Join-Path $AppDir ".venv"
$PythonExe = Join-Path $VenvDir "Scripts\python.exe"

Set-Location $AppDir

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python no esta disponible en PATH. Instala Python 3.12 o superior y vuelve a ejecutar este script."
}

if (-not (Test-Path $PythonExe)) {
    python -m venv $VenvDir
    if ($LASTEXITCODE -ne 0) { throw "No se pudo crear el entorno virtual." }
}

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

& $PythonExe -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw "No se pudo actualizar pip." }
& $PythonExe -m pip install -r (Join-Path $AppDir "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "No se pudieron instalar las dependencias." }
& $PythonExe -m pip install -r (Join-Path $AppDir "requirements-build.txt")
if ($LASTEXITCODE -ne 0) { throw "No se pudo instalar PyInstaller." }
& $PythonExe -m PyInstaller --clean --noconfirm (Join-Path $AppDir "pytrader.spec")
if ($LASTEXITCODE -ne 0) { throw "No se pudo construir PyTrader.exe." }

$ExePath = Join-Path $AppDir "dist\PyTrader.exe"
if (-not (Test-Path $ExePath)) {
    throw "No se encontro el ejecutable esperado: $ExePath"
}

Write-Host "Ejecutable Windows creado en:"
& (Join-Path $AppDir "package_windows.ps1") -ExePath $ExePath
if ($Install) {
    $WScript = New-Object -ComObject WScript.Shell
    $DesktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "PyTrader.lnk"
    $StartMenuDir = Join-Path ([Environment]::GetFolderPath("Programs")) "PyTrader"
    $StartMenuShortcut = Join-Path $StartMenuDir "PyTrader.lnk"

    New-Item -ItemType Directory -Force -Path $StartMenuDir | Out-Null

    foreach ($ShortcutPath in @($DesktopShortcut, $StartMenuShortcut)) {
        $Shortcut = $WScript.CreateShortcut($ShortcutPath)
        $Shortcut.TargetPath = $ExePath
        $Shortcut.WorkingDirectory = $AppDir
        $Shortcut.Description = "Smart Money stock screener"
        $Shortcut.Save()
    }
}

Write-Host $ExePath
if ($Install) {
    Write-Host "Instalado tambien con accesos directos en Escritorio y menu Inicio."
}
