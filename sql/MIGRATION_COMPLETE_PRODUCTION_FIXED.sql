-- Migration complète CORRIGÉE (sans référence à colonne "result" inexistante)
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
ADD COLUMN IF NOT EXISTS imei VARCHAR(15) UNIQUE,
ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Europe/Paris';

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

-- COLONNES LAST_*
ALTER TABLE devices
ADD COLUMN IF NOT EXISTS last_battery FLOAT,
ADD COLUMN IF NOT EXISTS last_flowrate FLOAT,
ADD COLUMN IF NOT EXISTS last_rssi INTEGER;

-- COLONNES MIN/MAX
ALTER TABLE device_configurations
ADD COLUMN IF NOT EXISTS min_battery_pct INTEGER DEFAULT 20,
ADD COLUMN IF NOT EXISTS max_temp_celsius INTEGER DEFAULT 50;

-- FIRMWARE STATUS
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'firmwares' AND column_name = 'status') THEN
        ALTER TABLE firmwares DROP CONSTRAINT IF EXISTS firmwares_status_check;
        ALTER TABLE firmwares 
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

SELECT 'MIGRATION COMPLETE' as status;

