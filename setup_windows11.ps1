$ErrorActionPreference = "Stop"
$PayloadDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallRoot = Join-Path $env:LOCALAPPDATA "PyTrader"
$AppDir = Join-Path $InstallRoot "app"
$PythonDir = Join-Path $InstallRoot "python"
$PrivatePython = Join-Path $PythonDir "python.exe"
$LogPath = Join-Path $InstallRoot "install.log"

New-Item -ItemType Directory -Force -Path $AppDir | Out-Null
Start-Transcript -Path $LogPath -Append | Out-Null
try {
    if (-not [Environment]::Is64BitOperatingSystem) {
        throw "Este instalador requiere Windows de 64 bits."
    }
    Write-Host "Instalando PyTrader. Se necesita conexion a Internet."
    if (-not (Test-Path $PrivatePython)) {
        foreach ($RegistryRoot in @("HKCU:\Software\Python\PythonCore", "HKLM:\Software\Python\PythonCore")) {
            $RegistryPath = Join-Path $RegistryRoot "3.13\InstallPath"
            if (Test-Path $RegistryPath) {
                $RegisteredDir = (Get-ItemProperty -LiteralPath $RegistryPath).'(default)'
                if ($RegisteredDir -and (Test-Path (Join-Path $RegisteredDir "python.exe"))) {
                    $PythonDir = $RegisteredDir
                    $PrivatePython = Join-Path $PythonDir "python.exe"
                    break
                }
            }
        }
    }
    if (-not (Test-Path $PrivatePython)) {
        $PythonInstaller = Join-Path $PayloadDir "python-3.13.12-amd64.exe"
        $Signature = Get-AuthenticodeSignature -FilePath $PythonInstaller
        if ($Signature.Status -ne "Valid" -or $Signature.SignerCertificate.Subject -notmatch "Python Software Foundation") {
            throw "La firma del instalador de Python no es valida."
        }
        $Arguments = '/quiet InstallAllUsers=0 Include_launcher=0 Include_test=0 Include_pip=1 PrependPath=0 Shortcuts=0 TargetDir="{0}"' -f $PythonDir
        $Process = Start-Process -FilePath $PythonInstaller -ArgumentList $Arguments -Wait -PassThru
        if ($Process.ExitCode -notin @(0, 3010) -or -not (Test-Path $PrivatePython)) {
            throw "La instalacion de Python fallo: $($Process.ExitCode)."
        }
    }
    $Files = @("F_Trader_4.py", "F_Trader_4.ui", "lupa-diagrama-negocios.png",
        ".env.example", "requirements.txt", "requirements-build.txt", "pytrader.spec",
        "build_windows.ps1", "package_windows.ps1", "install_windows.ps1")
    foreach ($File in $Files) {
        Copy-Item -LiteralPath (Join-Path $PayloadDir $File) -Destination (Join-Path $AppDir $File) -Force
    }
    $env:PATH = "$PythonDir;$env:PATH"
    & (Join-Path $AppDir "build_windows.ps1") -Install
    Write-Host "Instalacion terminada. Abre PyTrader desde el Escritorio o el menu Inicio."
    Write-Host "Ejecutable: $(Join-Path $AppDir 'dist\PyTrader.exe')"
}
catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Registro de instalacion: $LogPath"
    Read-Host "Pulsa Enter para cerrar"
    exit 1
}
finally {
    Stop-Transcript | Out-Null
}
Read-Host "Pulsa Enter para cerrar"
