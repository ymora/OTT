@echo off
REM ================================================================================
REM LAUNCHER INTERFACE GRAPHIQUE AUDIT
REM ================================================================================
REM Double-cliquez sur ce fichier pour ouvrir l'interface visuelle de l'audit
REM ================================================================================

cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0audit-gui.ps1"
