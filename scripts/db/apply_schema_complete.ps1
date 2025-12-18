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

-- Fonction pour mettre à jour automatiquement les min/max des dispositifs
CREATE OR REPLACE FUNCTION update_device_min_max()
RETURNS TRIGGER AS \$\$
BEGIN
  UPDATE devices SET
    min_flowrate = CASE 
      WHEN NEW.flowrate IS NOT NULL THEN
        LEAST(COALESCE(min_flowrate, NEW.flowrate), NEW.flowrate)
      ELSE min_flowrate
    END,
    max_flowrate = CASE 
      WHEN NEW.flowrate IS NOT NULL THEN
        GREATEST(COALESCE(max_flowrate, NEW.flowrate), NEW.flowrate)
      ELSE max_flowrate
    END,
    min_battery = CASE 
      WHEN NEW.battery IS NOT NULL THEN
        LEAST(COALESCE(min_battery, NEW.battery), NEW.battery)
      ELSE min_battery
    END,
    max_battery = CASE 
      WHEN NEW.battery IS NOT NULL THEN
        GREATEST(COALESCE(max_battery, NEW.battery), NEW.battery)
      ELSE max_battery
    END,
    min_rssi = CASE 
      WHEN NEW.signal_strength IS NOT NULL THEN
        LEAST(COALESCE(min_rssi, NEW.signal_strength), NEW.signal_strength)
      ELSE min_rssi
    END,
    max_rssi = CASE 
      WHEN NEW.signal_strength IS NOT NULL THEN
        GREATEST(COALESCE(max_rssi, NEW.signal_strength), NEW.signal_strength)
      ELSE max_rssi
    END,
    min_max_updated_at = NOW()
  WHERE id = NEW.device_id;
  
  RETURN NEW;
END;
\$\$ LANGUAGE plpgsql;
"@

# Étape 2: Tables principales (sans foreign keys complexes)
$step2 = @"
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  category VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
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

CREATE TABLE IF NOT EXISTS measurements (
  id BIGSERIAL PRIMARY KEY,
  device_id INT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  flowrate NUMERIC(5,2) NOT NULL,
  battery NUMERIC(5,2),
  signal_strength INT,
  device_status VARCHAR(50),
  latitude NUMERIC(10,8),
  longitude NUMERIC(11,8),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS alerts (
  id VARCHAR(50) PRIMARY KEY,
  device_id INT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('low_flowrate','high_flowrate','low_battery','device_offline','abnormal_flowrate')),
  severity TEXT CHECK (severity IN ('low','medium','high','critical')),
  message TEXT NOT NULL,
  status TEXT CHECK (status IN ('unresolved','acknowledged','resolved')) DEFAULT 'unresolved',
  created_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by INT REFERENCES users(id),
  resolution TEXT
);

CREATE TABLE IF NOT EXISTS device_logs (
  id BIGSERIAL PRIMARY KEY,
  device_id INT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  level TEXT CHECK (level IN ('ERROR','WARN','INFO','SUCCESS')),
  event_type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_configurations (
  device_id INT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  firmware_version VARCHAR(20),
  target_firmware_version VARCHAR(20),
  firmware_url TEXT,
  sleep_minutes INT,
  measurement_duration_ms INT,
  send_every_n_wakeups INT DEFAULT 1,
  calibration_coefficients JSONB,
  gps_enabled BOOLEAN DEFAULT false,
  min_battery_pct INTEGER DEFAULT 20,
  max_temp_celsius INTEGER DEFAULT 50,
  ota_pending BOOLEAN DEFAULT FALSE,
  ota_requested_at TIMESTAMPTZ,
  ota_completed_at TIMESTAMPTZ,
  last_config_update TIMESTAMPTZ,
  config_applied_at TIMESTAMPTZ,
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

CREATE TABLE IF NOT EXISTS user_notifications_preferences (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN DEFAULT FALSE,
  sms_enabled BOOLEAN DEFAULT FALSE,
  push_enabled BOOLEAN DEFAULT FALSE,
  phone_number VARCHAR(20),
  notify_battery_low BOOLEAN DEFAULT FALSE,
  notify_device_offline BOOLEAN DEFAULT FALSE,
  notify_abnormal_flow BOOLEAN DEFAULT FALSE,
  notify_new_patient BOOLEAN DEFAULT FALSE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patient_notifications_preferences (
  patient_id INT PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
  email_enabled BOOLEAN DEFAULT FALSE,
  sms_enabled BOOLEAN DEFAULT FALSE,
  push_enabled BOOLEAN DEFAULT FALSE,
  phone_number VARCHAR(20),
  notify_battery_low BOOLEAN DEFAULT FALSE,
  notify_device_offline BOOLEAN DEFAULT FALSE,
  notify_abnormal_flow BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INT,
  old_data JSONB,
  new_data JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
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

# Étape 3: Index et triggers
$step3 = @"
-- Index pour measurements
DROP INDEX IF EXISTS idx_measurements_device_time;
CREATE INDEX idx_measurements_device_time ON measurements(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_measurements_location ON measurements(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Index pour alerts
DROP INDEX IF EXISTS idx_alerts_device;
CREATE INDEX idx_alerts_device ON alerts(device_id);
DROP INDEX IF EXISTS idx_alerts_status;
CREATE INDEX idx_alerts_status ON alerts(status, severity);

-- Index pour device_logs
DROP INDEX IF EXISTS idx_device_logs_device_time;
CREATE INDEX idx_device_logs_device_time ON device_logs(device_id, timestamp DESC);

-- Triggers pour updated_at
DROP TRIGGER IF EXISTS trg_roles_updated ON roles;
CREATE TRIGGER trg_roles_updated BEFORE UPDATE ON roles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_permissions_updated ON permissions;
CREATE TRIGGER trg_permissions_updated BEFORE UPDATE ON permissions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_patients_updated ON patients;
CREATE TRIGGER trg_patients_updated BEFORE UPDATE ON patients
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_devices_updated ON devices;
CREATE TRIGGER trg_devices_updated BEFORE UPDATE ON devices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_device_configurations_updated ON device_configurations;
CREATE TRIGGER trg_device_configurations_updated BEFORE UPDATE ON device_configurations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_firmware_versions_updated ON firmware_versions;
CREATE TRIGGER trg_firmware_versions_updated BEFORE UPDATE ON firmware_versions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_user_notifications_preferences_updated ON user_notifications_preferences;
CREATE TRIGGER trg_user_notifications_preferences_updated BEFORE UPDATE ON user_notifications_preferences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_patient_notifications_preferences_updated ON patient_notifications_preferences;
CREATE TRIGGER trg_patient_notifications_preferences_updated BEFORE UPDATE ON patient_notifications_preferences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Trigger pour min/max
DROP TRIGGER IF EXISTS trg_update_device_min_max ON measurements;
CREATE TRIGGER trg_update_device_min_max
AFTER INSERT ON measurements
FOR EACH ROW
WHEN (NEW.flowrate IS NOT NULL OR NEW.battery IS NOT NULL OR NEW.signal_strength IS NOT NULL)
EXECUTE FUNCTION update_device_min_max();
"@

# Étape 4: Vue users_with_roles
$step4 = @"
DROP VIEW IF EXISTS users_with_roles CASCADE;
CREATE OR REPLACE VIEW users_with_roles AS
SELECT 
  u.id,
  u.email,
  u.password_hash,
  u.first_name,
  u.last_name,
  u.phone,
  u.is_active,
  u.created_at,
  u.updated_at,
  r.name AS role_name,
  r.description AS role_description,
  STRING_AGG(p.code, ',') AS permissions
FROM users u
JOIN roles r ON u.role_id = r.id
LEFT JOIN role_permissions rp ON r.id = rp.role_id
LEFT JOIN permissions p ON rp.permission_id = p.id
WHERE u.deleted_at IS NULL
GROUP BY u.id, u.email, u.password_hash, u.first_name, u.last_name, u.phone, 
         u.is_active, u.created_at, u.updated_at, r.name, r.description;
"@

# Appliquer les étapes
$success = $true

Write-Host ""
Write-Host "Étape 1/4: Extensions et fonctions..." -ForegroundColor Cyan
if (-not (Execute-Step "Extensions et fonctions" $step1)) {
    $success = $false
}

Write-Host ""
Write-Host "Étape 2/4: Tables principales..." -ForegroundColor Cyan
if (-not (Execute-Step "Tables principales" $step2)) {
    $success = $false
}

Write-Host ""
Write-Host "Étape 3/4: Index et triggers..." -ForegroundColor Cyan
if (-not (Execute-Step "Index et triggers" $step3)) {
    $success = $false
}

Write-Host ""
Write-Host "Étape 4/4: Vue users_with_roles..." -ForegroundColor Cyan
if (-not (Execute-Step "Vue users_with_roles" $step4)) {
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

