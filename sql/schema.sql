-- ============================================================================
-- OTT Database Schema (PostgreSQL)
-- ============================================================================
-- HAPPLYZ MEDICAL SAS
-- Base de donnees multi-tenant avec users/roles, OTA, notifications, audit
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ========================= STRUCTURE =========================

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_roles_updated BEFORE UPDATE ON roles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  category VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_permissions_updated BEFORE UPDATE ON permissions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

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
  role_id INT NOT NULL REFERENCES roles(id),
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  birth_date DATE,
  phone VARCHAR(20),
  email VARCHAR(100),
  address TEXT,
  city VARCHAR(100),
  postal_code VARCHAR(10),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_patients_updated BEFORE UPDATE ON patients
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS devices (
  id SERIAL PRIMARY KEY,
  sim_iccid VARCHAR(20) UNIQUE NOT NULL,
  device_serial VARCHAR(50) UNIQUE,
  device_name VARCHAR(100),
  firmware_version VARCHAR(20) DEFAULT 'v2.0',
  status TEXT CHECK (status IN ('active','inactive','maintenance')) DEFAULT 'active',
  patient_id INT REFERENCES patients(id) ON DELETE SET NULL,
  installation_date TIMESTAMPTZ,
  first_use_date TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  last_battery NUMERIC(5,2),
  latitude NUMERIC(10,8),
  longitude NUMERIC(11,8),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_devices_updated BEFORE UPDATE ON devices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS measurements (
  id BIGSERIAL PRIMARY KEY,
  device_id INT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  flowrate NUMERIC(5,2) NOT NULL,
  battery NUMERIC(5,2),
  signal_strength INT,
  device_status VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_measurements_device_time ON measurements(device_id, timestamp DESC);

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
CREATE INDEX idx_alerts_device ON alerts(device_id);
CREATE INDEX idx_alerts_status ON alerts(status, severity);

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
CREATE INDEX idx_device_logs_device_time ON device_logs(device_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS device_configurations (
  device_id INT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  firmware_version VARCHAR(20) DEFAULT '3.0.0',
  target_firmware_version VARCHAR(20),
  firmware_url TEXT,
  sleep_minutes INT DEFAULT 30,
  measurement_duration_ms INT DEFAULT 100,
  send_every_n_wakeups INT DEFAULT 1,
  calibration_coefficients JSONB,
  ota_pending BOOLEAN DEFAULT FALSE,
  ota_requested_at TIMESTAMPTZ,
  ota_completed_at TIMESTAMPTZ,
  last_config_update TIMESTAMPTZ,
  config_applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_device_configurations_updated BEFORE UPDATE ON device_configurations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_firmware_versions_updated BEFORE UPDATE ON firmware_versions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS user_notifications_preferences (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN DEFAULT TRUE,
  sms_enabled BOOLEAN DEFAULT FALSE,
  push_enabled BOOLEAN DEFAULT TRUE,
  phone_number VARCHAR(20),
  notify_battery_low BOOLEAN DEFAULT TRUE,
  notify_device_offline BOOLEAN DEFAULT TRUE,
  notify_abnormal_flow BOOLEAN DEFAULT TRUE,
  notify_new_patient BOOLEAN DEFAULT FALSE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_user_notifications_preferences_updated BEFORE UPDATE ON user_notifications_preferences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS notifications_queue (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('email','sms','push')),
  priority TEXT CHECK (priority IN ('low','medium','high','critical')) DEFAULT 'medium',
  subject VARCHAR(255),
  message TEXT NOT NULL,
  data JSONB,
  status TEXT CHECK (status IN ('pending','sent','failed','cancelled')) DEFAULT 'pending',
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  send_after TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_notifications_queue_status ON notifications_queue(status, type);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(50),
  ip_address VARCHAR(45),
  user_agent TEXT,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

CREATE TABLE IF NOT EXISTS device_commands (
  id BIGSERIAL PRIMARY KEY,
  device_id INT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  command VARCHAR(64) NOT NULL,
  payload JSONB,
  priority TEXT CHECK (priority IN ('low','normal','high','critical')) DEFAULT 'normal',
  status TEXT CHECK (status IN ('pending','executing','executed','error','expired','cancelled')) DEFAULT 'pending',
  execute_after TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  requested_by INT REFERENCES users(id) ON DELETE SET NULL,
  requested_via TEXT,
  lock_token VARCHAR(64),
  locked_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  result_status TEXT CHECK (result_status IN ('success','error')),
  result_message TEXT,
  result_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_device_commands_updated BEFORE UPDATE ON device_commands
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE VIEW device_stats AS
SELECT 
  d.id,
  d.sim_iccid,
  d.device_name,
  d.status,
  d.last_seen,
  d.last_battery,
  p.first_name,
  p.last_name,
  dc.firmware_version,
  dc.ota_pending,
  COUNT(m.id) AS total_measurements,
  AVG(m.flowrate) FILTER (WHERE m.timestamp >= NOW() - INTERVAL '7 days') AS avg_flowrate_7d,
  EXTRACT(EPOCH FROM (NOW() - d.last_seen))/60 AS minutes_since_last_seen
FROM devices d
LEFT JOIN patients p ON d.patient_id = p.id
LEFT JOIN device_configurations dc ON d.id = dc.device_id
LEFT JOIN measurements m ON d.id = m.device_id
GROUP BY d.id, p.first_name, p.last_name, dc.firmware_version, dc.ota_pending;

CREATE OR REPLACE VIEW users_with_roles AS
SELECT 
  u.id,
  u.email,
  u.first_name,
  u.last_name,
  u.is_active,
  u.last_login,
  r.name AS role_name,
  r.description AS role_description,
  STRING_AGG(p.code, ',') AS permissions
FROM users u
JOIN roles r ON u.role_id = r.id
LEFT JOIN role_permissions rp ON r.id = rp.role_id
LEFT JOIN permissions p ON rp.permission_id = p.id
GROUP BY u.id, r.name, r.description;

-- ========================= SEED =========================
-- Voir sql/base_seed.sql pour les données de référence. Le script
-- scripts/db_migrate.sh applique automatiquement ce fichier après le schéma.
