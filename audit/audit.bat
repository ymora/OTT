@echo off
REM ================================================================================
REM LAUNCHER AUDIT - Windows Batch (Multiprojet avec Config JSON)
REM ================================================================================
REM Lance le systeme d'audit complet avec support multiprojet
REM 
REM Le systeme d'audit supporte automatiquement:
REM   - Detection automatique du projet
REM   - Configuration par projet (project_metadata.json dans la racine du projet)
REM   - Configuration par projet (audit.config.json dans la racine du projet)
REM   - Configuration globale (audit/config/audit.config.ps1)
REM
REM Usage: audit.bat [Options] [CheminProjet] [FichierCible]
REM Exemples:
REM   audit.bat                          # Audit complet (12 phases)
REM   audit.bat -Phases "all"            # Audit complet (12 phases)
REM   audit.bat "C:\Projets\OTT"         # Audit d'un projet specifique
REM   audit.bat "" "firmware.ino"        # Audit d'un fichier specifique
REM   audit.bat -Phases "1,2,3"          # Audit de phases specifiques
REM ================================================================================

cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0audit.ps1" %*
set EXIT_CODE=%ERRORLEVEL%
if %EXIT_CODE% NEQ 0 (
    echo.
    echo [ERREUR] L'audit s'est termine avec le code d'erreur: %EXIT_CODE%
    echo.
    echo Pour obtenir de l'aide:
    echo   audit.bat -Help
    echo.
    pause
)
exit /b %EXIT_CODE%

