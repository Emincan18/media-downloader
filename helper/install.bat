@echo off
rem Doppelklick-Installation des Helfers. Muss normal aus Windows gestartet werden:
rem Aus der Claude-App heraus (MSIX-Paket) landen Registry und AppData in deren privatem Bereich.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if not "%1"=="/quiet" pause
