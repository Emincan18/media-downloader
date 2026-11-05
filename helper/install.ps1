# Installiert den yt-dlp-Helfer für das Add-on "Media Downloader" (nur für den aktuellen Windows-Benutzer).
# Braucht: Python, ffmpeg und Node im PATH. Danach Zen einmal neu starten.
$ErrorActionPreference = 'Stop'

# Voraussetzungen vorher prüfen und klar sagen, was fehlt (sonst bricht das Skript kryptisch ab,
# und Zen meldet nur "No such native application media_downloader").
# python.exe unter WindowsApps ist nur der Store-Platzhalter, kein echtes Python.
$need = @{ python = 'winget install Python.Python.3.12'; ffmpeg = 'winget install Gyan.FFmpeg'; node = 'winget install OpenJS.NodeJS.LTS' }
$missing = $need.Keys | Where-Object {
  $cmd = Get-Command $_ -ErrorAction SilentlyContinue
  -not $cmd -or $cmd.Source -like '*\WindowsApps\*'
}
if ($missing) {
  Write-Host "Es fehlt: $($missing -join ', '). Bitte installieren, dann ein NEUES Fenster oeffnen und install.bat nochmal starten:" -ForegroundColor Red
  $missing | ForEach-Object { Write-Host "  $($need[$_])" }
  exit 1
}

$dir = Join-Path $env:LOCALAPPDATA 'MediaDownloader'
New-Item -ItemType Directory -Force $dir | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'host.py') $dir -Force

$python = (Get-Command python).Source
# curl-cffi: TikTok blockt yt-dlp ohne Browser-Imitation.
& $python -m pip install -q -U "yt-dlp[default,curl-cffi]"
if ($LASTEXITCODE) { Write-Host 'pip konnte yt-dlp nicht installieren (Fehler oben).' -ForegroundColor Red; exit 1 }

# ffmpeg und Node fest in den PATH des Helfers schreiben, damit es nicht vom Browser-PATH abhängt.
$tools = @('ffmpeg', 'node') | ForEach-Object { (Get-Command $_ -ErrorAction SilentlyContinue).Source } |
  Where-Object { $_ } | ForEach-Object { Split-Path $_ }
$bat = "@echo off`r`nset `"PATH=$($tools -join ';');%PATH%`"`r`n`"$python`" -u `"%~dp0host.py`" %*`r`n"
[IO.File]::WriteAllText((Join-Path $dir 'host.bat'), $bat)

$manifest = [ordered]@{
  name = 'media_downloader'
  description = 'yt-dlp helper for Media Downloader'
  path = (Join-Path $dir 'host.bat')
  type = 'stdio'
  allowed_extensions = @('x-video-downloader@emincan.local')
}
$json = Join-Path $dir 'media_downloader.json'
[IO.File]::WriteAllText($json, ($manifest | ConvertTo-Json))
New-Item -Path 'HKCU:\Software\Mozilla\NativeMessagingHosts\media_downloader' -Value $json -Force | Out-Null
Write-Host "Helfer installiert in $dir. Jetzt Zen/Firefox komplett schliessen und neu starten." -ForegroundColor Green
