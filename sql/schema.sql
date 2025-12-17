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
DROP TRIGGER IF EXISTS trg_roles_updated ON roles;
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
DROP TRIGGER IF EXISTS trg_permissions_updated ON permissions;
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
  phone VARCHAR(20),
  role_id INT NOT NULL REFERENCES roles(id),
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  timezone VARCHAR(50) DEFAULT 'Europe/Paris',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

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
DROP TRIGGER IF EXISTS trg_patients_updated ON patients;
CREATE TRIGGER trg_patients_updated BEFORE UPDATE ON patients
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

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
  -- Min/Max values (mises à jour automatiquement par trigger)
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
DROP TRIGGER IF EXISTS trg_devices_updated ON devices;
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
  latitude NUMERIC(10,8),
  longitude NUMERIC(11,8),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
DROP INDEX IF EXISTS idx_measurements_device_time;
CREATE INDEX idx_measurements_device_time ON measurements(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_measurements_location ON measurements(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Fonction pour mettre à jour automatiquement les min/max des dispositifs
CREATE OR REPLACE FUNCTION update_device_min_max()
RETURNS TRIGGER AS $$
BEGIN
  -- Mettre à jour les min/max uniquement si les valeurs ne sont pas NULL
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

-- Trigger pour mettre à jour automatiquement les min/max à chaque nouvelle mesure
DROP TRIGGER IF EXISTS trg_update_device_min_max ON measurements;
CREATE TRIGGER trg_update_device_min_max
AFTER INSERT ON measurements
FOR EACH ROW
WHEN (NEW.flowrate IS NOT NULL OR NEW.battery IS NOT NULL OR NEW.signal_strength IS NOT NULL)
EXECUTE FUNCTION update_device_min_max();

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
DROP INDEX IF EXISTS idx_alerts_device;
CREATE INDEX idx_alerts_device ON alerts(device_id);
DROP INDEX IF EXISTS idx_alerts_status;
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
DROP INDEX IF EXISTS idx_device_logs_device_time;
CREATE INDEX idx_device_logs_device_time ON device_logs(device_id, timestamp DESC);

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
DROP TRIGGER IF EXISTS trg_device_configurations_updated ON device_configurations;
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
  status VARCHAR(50) DEFAULT 'compiled' CHECK (status IN ('pending_compilation', 'compiling', 'compiled', 'error')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_firmware_versions_updated ON firmware_versions;
CREATE TRIGGER trg_firmware_versions_updated BEFORE UPDATE ON firmware_versions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

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
DROP TRIGGER IF EXISTS trg_user_notifications_preferences_updated ON user_notifications_preferences;
CREATE TRIGGER trg_user_notifications_preferences_updated BEFORE UPDATE ON user_notifications_preferences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS patient_notifications_preferences (
  patient_id INT PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
  email_enabled BOOLEAN DEFAULT FALSE,
  sms_enabled BOOLEAN DEFAULT FALSE,
  push_enabled BOOLEAN DEFAULT FALSE,
  phone_number VARCHAR(20),
  notify_battery_low BOOLEAN DEFAULT FALSE,
  notify_device_offline BOOLEAN DEFAULT FALSE,
  notify_abnormal_flow BOOLEAN DEFAULT FALSE,
  notify_alert_critical BOOLEAN DEFAULT FALSE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_patient_notifications_preferences_updated ON patient_notifications_preferences;
CREATE TRIGGER trg_patient_notifications_preferences_updated BEFORE UPDATE ON patient_notifications_preferences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS notifications_queue (
  id BIGSERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  patient_id INT REFERENCES patients(id) ON DELETE CASCADE,
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT notifications_queue_recipient_check CHECK (user_id IS NOT NULL OR patient_id IS NOT NULL)
);
DROP INDEX IF EXISTS idx_notifications_queue_status;
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
DROP INDEX IF EXISTS idx_audit_logs_user;
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
DROP INDEX IF EXISTS idx_audit_logs_action;
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
DROP TRIGGER IF EXISTS trg_device_commands_updated ON device_commands;
CREATE TRIGGER trg_device_commands_updated BEFORE UPDATE ON device_commands
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table USB Logs pour streaming à distance
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
  u.phone,
  u.password_hash,
  u.is_active,
  u.last_login,
  u.created_at,
  r.name AS role_name,
  r.description AS role_description,
  STRING_AGG(p.code, ',') AS permissions
FROM users u
JOIN roles r ON u.role_id = r.id
LEFT JOIN role_permissions rp ON r.id = rp.role_id
LEFT JOIN permissions p ON rp.permission_id = p.id
WHERE u.deleted_at IS NULL
GROUP BY u.id, u.email, u.first_name, u.last_name, u.phone, u.password_hash, 
         u.is_active, u.last_login, u.created_at, r.name, r.description;

-- ========================= SEED =========================

INSERT INTO roles (id, name, description) VALUES
  (1, 'admin', 'Administrateur systeme - Acces complet'),
  (2, 'medecin', 'Medecin - Consultation patients et dispositifs'),
  (3, 'technicien', 'Technicien - Maintenance dispositifs')
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description;

INSERT INTO permissions (code, description, category) VALUES
  ('devices.view', 'Voir liste et details dispositifs', 'devices'),
  ('devices.edit', 'Modifier dispositifs', 'devices'),
  ('devices.delete', 'Supprimer dispositifs', 'devices'),
  ('devices.ota', 'Mises a jour OTA', 'devices'),
  ('devices.configure', 'Configurer parametres a distance', 'devices'),
  ('devices.commands', 'Pilotage commandes descendantes', 'devices'),
  ('patients.view', 'Voir patients', 'patients'),
  ('patients.edit', 'Modifier patients', 'patients'),
  ('patients.delete', 'Supprimer patients', 'patients'),
  ('patients.export', 'Exporter patients', 'patients'),
  ('users.view', 'Voir utilisateurs', 'users'),
  ('users.manage', 'Gerer utilisateurs', 'users'),
  ('users.roles', 'Attribuer roles et permissions', 'users'),
  ('reports.view', 'Voir rapports', 'reports'),
  ('reports.export', 'Exporter rapports', 'reports'),
  ('alerts.view', 'Voir alertes', 'alerts'),
  ('alerts.manage', 'Resoudre alertes', 'alerts'),
  ('audit.view', 'Voir audit', 'audit'),
  ('settings.view', 'Lire parametres', 'settings'),
  ('settings.edit', 'Modifier parametres', 'settings')
ON CONFLICT (code) DO UPDATE SET 
  description = EXCLUDED.description,
  category = EXCLUDED.category;

INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE code IN (
  'devices.view','patients.view','patients.edit','patients.export',
  'reports.view','reports.export','alerts.view'
)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions WHERE code IN (
  'devices.view','devices.edit','devices.configure','devices.commands',
  'alerts.view','alerts.manage','reports.view'
)
ON CONFLICT DO NOTHING;

-- ========================= SEED - Utilisateur admin uniquement =========================
-- Utilisateur admin réel (créé automatiquement à l'initialisation)
-- Email: ymora@free.fr
-- Password: Ym120879
-- Hash bcrypt généré avec: password_hash('Ym120879', PASSWORD_BCRYPT)
INSERT INTO users (id, email, password_hash, first_name, last_name, phone, role_id, is_active)
VALUES
  (1, 'ymora@free.fr', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Yann', 'Mora', NULL, 1, TRUE)
ON CONFLICT (id) DO UPDATE SET 
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  role_id = EXCLUDED.role_id;

INSERT INTO user_notifications_preferences (user_id, email_enabled, sms_enabled, push_enabled, phone_number)
VALUES
  (1, TRUE, TRUE, FALSE, NULL)  -- ymora@free.fr
ON CONFLICT (user_id) DO UPDATE SET 
  email_enabled = EXCLUDED.email_enabled,
  sms_enabled = EXCLUDED.sms_enabled,
  push_enabled = EXCLUDED.push_enabled,
  phone_number = EXCLUDED.phone_number;

-- Pas de données de démo - Base de données vide prête pour les données réelles
