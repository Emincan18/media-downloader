# Installiert den yt-dlp-Helfer für das Add-on "Media Downloader" (nur für den aktuellen Windows-Benutzer).
# Braucht: Python, ffmpeg und Node im PATH. Danach Zen einmal neu starten.
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:LOCALAPPDATA 'MediaDownloader'
New-Item -ItemType Directory -Force $dir | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'host.py') $dir -Force

$python = (Get-Command python).Source
# curl-cffi: TikTok blockt yt-dlp ohne Browser-Imitation.
& $python -m pip install -q -U "yt-dlp[default,curl-cffi]"

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
Write-Host "Helfer installiert in $dir"
