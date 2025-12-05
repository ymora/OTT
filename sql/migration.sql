-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION COMPLÈTE - OTT Dashboard
-- ═══════════════════════════════════════════════════════════════════
-- HAPPLYZ MEDICAL SAS
-- 
-- Ce script permet de mettre à jour une base de données existante
-- vers le schéma complet. Il ajoute toutes les colonnes et tables
-- manquantes de manière idempotente.
-- 
-- UTILISATION:
--   - BDD PostgreSQL existante
--   - Exécuter ce script UNE SEULE FOIS
--   - Idempotent (peut être rejoué sans erreur)
-- 
-- Date: 2025-12-05
-- ═══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- COLONNES SOFT DELETE
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- COLONNES USERS
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Europe/Paris';

-- COLONNES PATIENTS
ALTER TABLE patients
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS city VARCHAR(100),
ADD COLUMN IF NOT EXISTS postal_code VARCHAR(10),
ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(200),
ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS medical_notes TEXT,
ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Europe/Paris';

-- COLONNES DEVICES
ALTER TABLE devices
ADD COLUMN IF NOT EXISTS modem_imei VARCHAR(15),
ADD COLUMN IF NOT EXISTS last_ip VARCHAR(45),
ADD COLUMN IF NOT EXISTS warranty_expiry DATE,
ADD COLUMN IF NOT EXISTS purchase_date DATE,
ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS imei VARCHAR(15),
ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Europe/Paris',
ADD COLUMN IF NOT EXISTS last_battery FLOAT,
ADD COLUMN IF NOT EXISTS last_flowrate FLOAT,
ADD COLUMN IF NOT EXISTS last_rssi INTEGER,
ADD COLUMN IF NOT EXISTS min_flowrate NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS max_flowrate NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS min_battery NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS max_battery NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS min_rssi INT,
ADD COLUMN IF NOT EXISTS max_rssi INT,
ADD COLUMN IF NOT EXISTS min_max_updated_at TIMESTAMPTZ;

-- TABLE USB LOGS
CREATE TABLE IF NOT EXISTS usb_logs (
    id SERIAL PRIMARY KEY,
    device_identifier VARCHAR(255) NOT NULL,
    device_name VARCHAR(255),
    log_line TEXT NOT NULL,
    log_source VARCHAR(50) DEFAULT 'device',
    timestamp_ms BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usb_logs_device_identifier ON usb_logs(device_identifier);
CREATE INDEX IF NOT EXISTS idx_usb_logs_created_at ON usb_logs(created_at);

COMMENT ON TABLE usb_logs IS 'Logs USB streaming pour monitoring à distance';

-- COLONNE GPS
ALTER TABLE device_configurations 
ADD COLUMN IF NOT EXISTS gps_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN device_configurations.gps_enabled IS 
'Active/désactive le GPS pour ce dispositif. OFF par défaut.';

UPDATE device_configurations 
SET gps_enabled = false 
WHERE gps_enabled IS NULL;

-- COLONNES MIN/MAX dans device_configurations
ALTER TABLE device_configurations
ADD COLUMN IF NOT EXISTS min_battery_pct INTEGER DEFAULT 20,
ADD COLUMN IF NOT EXISTS max_temp_celsius INTEGER DEFAULT 50;

-- FIRMWARE STATUS
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'firmware_versions' AND column_name = 'status') THEN
        ALTER TABLE firmware_versions DROP CONSTRAINT IF EXISTS firmwares_status_check;
        ALTER TABLE firmware_versions 
        ADD CONSTRAINT firmwares_status_check 
        CHECK (status IN ('pending', 'pending_compilation', 'compiling', 'compiled', 'error', 'active'));
    END IF;
END $$;

-- INDEX PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_devices_deleted_at ON devices(deleted_at);
CREATE INDEX IF NOT EXISTS idx_patients_deleted_at ON patients(deleted_at);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);
CREATE INDEX IF NOT EXISTS idx_measurements_timestamp ON measurements(timestamp);

-- Fonction pour mettre à jour automatiquement les min/max des dispositifs
CREATE OR REPLACE FUNCTION update_device_min_max()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

-- Trigger pour mettre à jour automatiquement les min/max
DROP TRIGGER IF EXISTS trg_update_device_min_max ON measurements;
CREATE TRIGGER trg_update_device_min_max
AFTER INSERT ON measurements
FOR EACH ROW
WHEN (NEW.flowrate IS NOT NULL OR NEW.battery IS NOT NULL OR NEW.signal_strength IS NOT NULL)
EXECUTE FUNCTION update_device_min_max();

SELECT 'MIGRATION COMPLETE' as status;

