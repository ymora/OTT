@echo off
REM ================================================================================
REM LAUNCHER AUDIT - Windows Batch
REM ================================================================================
REM Lance le systeme d'audit complet
REM Usage: audit.bat [Options] [CheminProjet] [FichierCible]
REM Exemples:
REM   audit.bat -All                    # Audit complet du projet
REM   audit.bat "" "firmware.ino"       # Audit d'un fichier specifique
REM ================================================================================

cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0audit.ps1" %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Erreur lors de l'execution de l'audit.
    pause
)

