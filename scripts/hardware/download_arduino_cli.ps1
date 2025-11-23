# ================================================================================
# Script de téléchargement d'arduino-cli pour Windows
# ================================================================================
# HAPPLYZ MEDICAL SAS
# Télécharge arduino-cli et le place dans bin/ du projet
# ================================================================================

$ErrorActionPreference = "Stop"

Write-Host "Telechargement d'arduino-cli pour Windows..." -ForegroundColor Cyan

# Créer le dossier bin/ s'il n'existe pas
$binDir = Join-Path $PSScriptRoot "..\bin"
if (-not (Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null
    Write-Host "Dossier bin/ cree" -ForegroundColor Green
}

# Vérifier si arduino-cli existe déjà
$arduinoCliPath = Join-Path $binDir "arduino-cli.exe"
if (Test-Path $arduinoCliPath) {
    Write-Host "arduino-cli existe deja dans bin/" -ForegroundColor Green
    & $arduinoCliPath version
    exit 0
}

# URL de téléchargement pour Windows (64-bit)
$version = "0.35.0"  # Version stable récente
$url = "https://github.com/arduino/arduino-cli/releases/download/v${version}/arduino-cli_${version}_Windows_64bit.zip"

Write-Host "Telechargement depuis GitHub..." -ForegroundColor Yellow
Write-Host "   URL: $url" -ForegroundColor Gray

# Télécharger dans un dossier temporaire
$tempDir = Join-Path $env:TEMP "arduino-cli-download"
if (Test-Path $tempDir) {
    Remove-Item -Path $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

$zipPath = Join-Path $tempDir "arduino-cli.zip"

try {
    # Télécharger avec progress bar
    Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
    
    Write-Host "Extraction de l'archive..." -ForegroundColor Yellow
    Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force
    
    # Trouver le binaire dans l'archive
    $extractedExe = Get-ChildItem -Path $tempDir -Filter "arduino-cli.exe" -Recurse | Select-Object -First 1
    
    if ($null -eq $extractedExe) {
        Write-Host "ERREUR: arduino-cli.exe non trouve dans l'archive" -ForegroundColor Red
        exit 1
    }
    
    # Copier vers bin/
    Copy-Item -Path $extractedExe.FullName -Destination $arduinoCliPath -Force
    Write-Host "arduino-cli copie vers bin/" -ForegroundColor Green
    
    # Nettoyer
    Remove-Item -Path $tempDir -Recurse -Force
    
    # Verifier l'installation
    Write-Host "Verification de l'installation..." -ForegroundColor Yellow
    $versionOutput = & $arduinoCliPath version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "arduino-cli installe avec succes!" -ForegroundColor Green
        Write-Host $versionOutput -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Emplacement: $arduinoCliPath" -ForegroundColor Gray
        Write-Host "La compilation sera REELLE, jamais simulee" -ForegroundColor Green
    } else {
        Write-Host "ERREUR: arduino-cli ne fonctionne pas" -ForegroundColor Red
        Write-Host $versionOutput -ForegroundColor Red
        exit 1
    }
    
} catch {
    Write-Host "ERREUR lors du telechargement: $_" -ForegroundColor Red
    exit 1
}

