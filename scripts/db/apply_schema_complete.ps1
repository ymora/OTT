# Script pour appliquer le schéma SQL complet par étapes
# Gère les erreurs et applique progressivement

$ErrorActionPreference = "Stop"

Write-Host "📋 APPLICATION DU SCHÉMA SQL COMPLET" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

$apiUrl = "https://ott-jbln.onrender.com/api.php/admin/migrate-sql"
$schemaPath = Join-Path $PSScriptRoot "..\..\sql\schema.sql"

if (-not (Test-Path $schemaPath)) {
    Write-Host "❌ Fichier schema.sql non trouvé: $schemaPath" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Fichier trouvé: $schemaPath" -ForegroundColor Green
$schemaContent = Get-Content $schemaPath -Raw -Encoding UTF8
Write-Host "Taille: $($schemaContent.Length) caractères" -ForegroundColor Gray
Write-Host ""

# Diviser le schéma en étapes logiques
Write-Host "📝 Division du schéma en étapes..." -ForegroundColor Yellow

# Étape 1: Extensions et fonctions
$step1 = @"
-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Fonction set_updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS \$\$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
\$\$ LANGUAGE plpgsql;
"@

# Étape 2: Tables principales (sans foreign keys complexes)
$step2 = @"
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  role_id INT NOT NULL REFERENCES roles(id),
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  timezone VARCHAR(50) DEFAULT 'Europe/Paris',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(100),
  address TEXT,
  city VARCHAR(100),
  postal_code VARCHAR(10),
  notes TEXT,
  date_of_birth DATE,
  emergency_contact_name VARCHAR(200),
  emergency_contact_phone VARCHAR(20),
  medical_notes TEXT,
  timezone VARCHAR(50) DEFAULT 'Europe/Paris',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
  id SERIAL PRIMARY KEY,
  sim_iccid VARCHAR(20) UNIQUE NOT NULL,
  device_serial VARCHAR(50) UNIQUE,
  device_name VARCHAR(100),
  firmware_version VARCHAR(20),
  status TEXT CHECK (status IN ('active','inactive')) DEFAULT 'active',
  patient_id INT REFERENCES patients(id) ON DELETE SET NULL,
  installation_date TIMESTAMPTZ,
  first_use_date TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  last_battery FLOAT,
  last_flowrate FLOAT,
  last_rssi INTEGER,
  latitude NUMERIC(10,8),
  longitude NUMERIC(11,8),
  modem_imei VARCHAR(15),
  last_ip VARCHAR(45),
  warranty_expiry DATE,
  purchase_date DATE,
  purchase_price NUMERIC(10,2),
  imei VARCHAR(15) UNIQUE,
  timezone VARCHAR(50) DEFAULT 'Europe/Paris',
  deleted_at TIMESTAMPTZ,
  min_flowrate NUMERIC(5,2),
  max_flowrate NUMERIC(5,2),
  min_battery NUMERIC(5,2),
  max_battery NUMERIC(5,2),
  min_rssi INT,
  max_rssi INT,
  min_max_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS firmware_versions (
  id SERIAL PRIMARY KEY,
  version VARCHAR(20) UNIQUE NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  file_size BIGINT,
  checksum VARCHAR(64),
  release_notes TEXT,
  is_stable BOOLEAN DEFAULT FALSE,
  min_battery_pct INT DEFAULT 30,
  uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'compiled' CHECK (status IN ('pending_compilation', 'compiling', 'compiled', 'error')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
"@

# Fonction pour exécuter une étape
function Execute-Step {
    param(
        [string]$stepName,
        [string]$sql
    )
    
    Write-Host "▶️  $stepName..." -ForegroundColor Yellow
    $body = @{ sql = $sql } | ConvertTo-Json -Depth 10
    
    try {
        $response = Invoke-WebRequest -Uri $apiUrl -Method POST -Body $body -ContentType "application/json" -TimeoutSec 120 -ErrorAction Stop
        $result = $response.Content | ConvertFrom-Json
        
        if ($result.success) {
            Write-Host "✅ $stepName réussi" -ForegroundColor Green
            return $true
        } else {
            Write-Host "❌ $stepName échoué: $($result.error)" -ForegroundColor Red
            if ($result.message) {
                Write-Host "   Message: $($result.message)" -ForegroundColor Gray
            }
            return $false
        }
    } catch {
        Write-Host "❌ Erreur HTTP: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Appliquer les étapes
$success = $true

Write-Host ""
Write-Host "Étape 1/2: Extensions et fonctions..." -ForegroundColor Cyan
if (-not (Execute-Step "Extensions et fonctions" $step1)) {
    $success = $false
}

Write-Host ""
Write-Host "Étape 2/2: Tables principales..." -ForegroundColor Cyan
if (-not (Execute-Step "Tables principales" $step2)) {
    $success = $false
}

Write-Host ""
if ($success) {
    Write-Host "✅✅✅ SCHÉMA APPLIQUÉ AVEC SUCCÈS ! ✅✅✅" -ForegroundColor Green
    Write-Host ""
    Write-Host "Vérification de firmware_versions..." -ForegroundColor Yellow
    $check = @{ sql = "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'firmware_versions');" } | ConvertTo-Json
    try {
        $checkResponse = Invoke-WebRequest -Uri $apiUrl -Method POST -Body $check -ContentType "application/json" -TimeoutSec 30 -ErrorAction Stop
        $checkResult = $checkResponse.Content | ConvertFrom-Json
        if ($checkResult.data -match "true|t|1") {
            Write-Host "✅ Table firmware_versions créée !" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Table firmware_versions non trouvée" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠️  Impossible de vérifier" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ Échec de l'application du schéma" -ForegroundColor Red
    Write-Host "Vérifiez les logs Render pour plus de détails" -ForegroundColor Yellow
    exit 1
}

