# Script pour appliquer le schéma en deux étapes (tables puis triggers)
# Usage: .\scripts\db\apply_schema_two_steps.ps1

param(
    [string]$ApiUrl = "https://ott-jbln.onrender.com"
)

Write-Host "🚀 Application du schéma en deux étapes" -ForegroundColor Cyan
Write-Host ""

$schemaFile = Join-Path $PSScriptRoot "..\..\sql\schema.sql"
if (-not (Test-Path $schemaFile)) {
    Write-Host "❌ Fichier introuvable: $schemaFile" -ForegroundColor Red
    exit 1
}

$sqlContent = Get-Content $schemaFile -Raw -Encoding UTF8

# Étape 1: Extraire tout sauf les CREATE TRIGGER et DROP TRIGGER
# On garde CREATE TABLE, CREATE FUNCTION, CREATE INDEX, INSERT, etc.
$lines = $sqlContent -split "`n"
$step1Lines = @()
$step2Lines = @()

foreach ($line in $lines) {
    if ($line -match '^\s*(DROP TRIGGER|CREATE TRIGGER)') {
        $step2Lines += $line
    } else {
        $step1Lines += $line
    }
}

$step1Sql = $step1Lines -join "`n"
$step2Sql = $step2Lines -join "`n"

Write-Host "1️⃣  Étape 1: Création des tables, fonctions, index, données..." -ForegroundColor Yellow
try {
    $body = @{
        sql = $step1Sql
    } | ConvertTo-Json -Depth 10
    
    $response = Invoke-RestMethod -Uri "$ApiUrl/api.php/admin/migrate-sql" `
        -Method POST `
        -Body $body `
        -ContentType "application/json" `
        -TimeoutSec 600 `
        -ErrorAction Stop
    
    if ($response.success) {
        Write-Host "   ✅ Étape 1 réussie ($($response.statements_count) instructions)" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Erreur: $($response.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

Write-Host "2️⃣  Étape 2: Création des triggers..." -ForegroundColor Yellow
try {
    $body = @{
        sql = $step2Sql
    } | ConvertTo-Json -Depth 10
    
    $response = Invoke-RestMethod -Uri "$ApiUrl/api.php/admin/migrate-sql" `
        -Method POST `
        -Body $body `
        -ContentType "application/json" `
        -TimeoutSec 300 `
        -ErrorAction Stop
    
    if ($response.success) {
        Write-Host "   ✅ Étape 2 réussie ($($response.statements_count) instructions)" -ForegroundColor Green
        Write-Host ""
        Write-Host "✅ Schéma appliqué avec succès !" -ForegroundColor Green
        Write-Host ""
        Write-Host "📋 Identifiants:" -ForegroundColor Cyan
        Write-Host "   Email: ymora@free.fr" -ForegroundColor White
        Write-Host "   Password: Ym120879" -ForegroundColor White
    } else {
        Write-Host "   ❌ Erreur: $($response.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

