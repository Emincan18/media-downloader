# Ein-Befehl-Installation des Helfers, ohne Repo-Download. In PowerShell ausführen:
#   irm https://raw.githubusercontent.com/Emincan18/media-downloader/main/helper/setup.ps1 | iex
# Installiert fehlendes Python, ffmpeg und Node per winget, lädt host.py und install.ps1 von GitHub
# und startet install.ps1. Kein "exit": bei "| iex" würde das das ganze Fenster schließen.
$ErrorActionPreference = 'Stop'
$base = 'https://raw.githubusercontent.com/Emincan18/media-downloader/main/helper'
$pkgs = [ordered]@{ python = 'Python.Python.3.12'; ffmpeg = 'Gyan.FFmpeg'; node = 'OpenJS.NodeJS.LTS' }

# python.exe unter WindowsApps ist nur der Store-Platzhalter, kein echtes Python.
function Test-Missing($name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  -not $cmd -or $cmd.Source -like '*\WindowsApps\*'
}

$missing = @($pkgs.Keys | Where-Object { Test-Missing $_ })
if ($missing -and -not (Get-Command winget -ErrorAction SilentlyContinue)) {
  Write-Host "Es fehlt: $($missing -join ', '), und winget ist nicht da. Bitte von Hand installieren und den Befehl nochmal ausfuehren." -ForegroundColor Red
  return
}
foreach ($name in $missing) {
  Write-Host "Installiere $name ..." -ForegroundColor Cyan
  winget install -e --id $pkgs[$name] --accept-source-agreements --accept-package-agreements
}
# Neu installierte Programme sind erst in einem neuen Fenster im PATH; hier direkt nachladen.
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$still = @($pkgs.Keys | Where-Object { Test-Missing $_ })
if ($still) {
  Write-Host "Immer noch nicht gefunden: $($still -join ', '). PowerShell neu oeffnen und den Befehl nochmal ausfuehren." -ForegroundColor Red
  return
}

$tmp = Join-Path $env:TEMP "media-downloader-setup"
New-Item -ItemType Directory -Force $tmp | Out-Null
foreach ($file in 'host.py', 'install.ps1') {
  Invoke-WebRequest "$base/$file" -OutFile (Join-Path $tmp $file) -UseBasicParsing
}
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $tmp 'install.ps1')
