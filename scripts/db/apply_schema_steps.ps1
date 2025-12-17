# Script pour appliquer le schéma en étapes séparées (fonctions, tables, triggers, données)
# Usage: .\scripts\db\apply_schema_steps.ps1

param(
    [string]$ApiUrl = "https://ott-jbln.onrender.com"
)

Write-Host "🚀 Application du schéma en étapes séparées" -ForegroundColor Cyan
Write-Host ""

$schemaFile = Join-Path $PSScriptRoot "..\..\sql\schema.sql"
if (-not (Test-Path $schemaFile)) {
    Write-Host "❌ Fichier introuvable: $schemaFile" -ForegroundColor Red
    exit 1
}

$sqlContent = Get-Content $schemaFile -Raw -Encoding UTF8

# Étape 1: Extension et fonctions (extraites du fichier)
$allLines = Get-Content $schemaFile
$step1Lines = @()
$inFunction = $false
$functionEnded = $false

foreach ($line in $allLines) {
    if ($line -match '^CREATE EXTENSION') {
        $step1Lines += $line
    } elseif ($line -match '^CREATE OR REPLACE FUNCTION') {
        $inFunction = $true
        $step1Lines += $line
    } elseif ($inFunction) {
        $step1Lines += $line
        if ($line -match '\$\$ LANGUAGE plpgsql;') {
            $inFunction = $false
            $functionEnded = $true
        }
    } elseif ($functionEnded -and $line -match '^--') {
        # Arrêter après les fonctions (avant les tables)
        break
    }
}

$step1 = $step1Lines -join "`n"

# Étape 2: Extraire toutes les lignes sauf les fonctions (déjà exécutées) et les triggers
$lines = Get-Content $schemaFile
$step2Lines = @()
$skipUntilSemicolon = $false
$inFunction = $false

foreach ($line in $lines) {
    # Ignorer les fonctions (déjà dans step1)
    if ($line -match '^CREATE EXTENSION' -or $line -match '^CREATE OR REPLACE FUNCTION') {
        $inFunction = $true
        continue
    }
    
    if ($inFunction) {
        if ($line -match '\$\$ LANGUAGE plpgsql;') {
            $inFunction = $false
        }
        continue
    }
    
    # Ignorer les triggers (seront dans step3)
    if ($line -match '^\s*CREATE TRIGGER' -or $line -match '^\s*DROP TRIGGER') {
        $skipUntilSemicolon = $true
        continue
    }
    
    if ($skipUntilSemicolon) {
        if ($line -match ';') {
            $skipUntilSemicolon = $false
        }
        continue
    }
    
    $step2Lines += $line
}

$step2 = $step2Lines -join "`n"

# Étape 3: Extraire uniquement les CREATE TRIGGER
$step3Lines = @()
foreach ($line in $lines) {
    if ($line -match '^\s*CREATE TRIGGER') {
        # Trouver toutes les lignes jusqu'au prochain ; ou ligne vide
        $triggerLines = @($line)
        $lineIndex = [array]::IndexOf($lines, $line)
        for ($i = $lineIndex + 1; $i -lt $lines.Count; $i++) {
            $triggerLines += $lines[$i]
            if ($lines[$i] -match ';') {
                break
            }
        }
        $step3Lines += ($triggerLines -join "`n")
    }
}
$step3 = $step3Lines -join "`n`n"

Write-Host "1️⃣  Étape 1: Extension et fonctions..." -ForegroundColor Yellow
try {
    $body = @{ sql = $step1 } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$ApiUrl/api.php/admin/migrate-sql" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 300 -ErrorAction Stop
    if ($response.success) {
        Write-Host "   ✅ Étape 1 réussie" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Erreur: $($response.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "2️⃣  Étape 2: Tables, index, vues, données..." -ForegroundColor Yellow
try {
    $body = @{ sql = $step2 } | ConvertTo-Json -Depth 10
    $response = Invoke-RestMethod -Uri "$ApiUrl/api.php/admin/migrate-sql" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 600 -ErrorAction Stop
    if ($response.success) {
        Write-Host "   ✅ Étape 2 réussie ($($response.statements_count) instructions)" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Erreur: $($response.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "3️⃣  Étape 3: Triggers..." -ForegroundColor Yellow
if ($step3.Trim()) {
    try {
        $body = @{ sql = $step3 } | ConvertTo-Json
        $response = Invoke-RestMethod -Uri "$ApiUrl/api.php/admin/migrate-sql" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 300 -ErrorAction Stop
        if ($response.success) {
            Write-Host "   ✅ Étape 3 réussie ($($response.statements_count) instructions)" -ForegroundColor Green
        } else {
            Write-Host "   ❌ Erreur: $($response.error)" -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "   ❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "   ⚠️  Aucun trigger à créer" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Schéma appliqué avec succès !" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Identifiants:" -ForegroundColor Cyan
Write-Host "   Email: ymora@free.fr" -ForegroundColor White
Write-Host "   Password: Ym120879" -ForegroundColor White

