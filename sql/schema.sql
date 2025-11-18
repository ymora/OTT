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
  phone VARCHAR(20),
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
CREATE TRIGGER trg_user_notifications_preferences_updated BEFORE UPDATE ON user_notifications_preferences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS patient_notifications_preferences (
  patient_id INT PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
  email_enabled BOOLEAN DEFAULT FALSE,
  sms_enabled BOOLEAN DEFAULT FALSE,
  push_enabled BOOLEAN DEFAULT FALSE,
  notify_battery_low BOOLEAN DEFAULT FALSE,
  notify_device_offline BOOLEAN DEFAULT FALSE,
  notify_abnormal_flow BOOLEAN DEFAULT FALSE,
  notify_alert_critical BOOLEAN DEFAULT FALSE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
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

INSERT INTO users (id, email, password_hash, first_name, last_name, phone, role_id, is_active)
VALUES
  (1, 'admin@example.com', '$2y$10$w1K9P0IJhES2YwwHGwEk2Oq91Fv2R9DyCPr6Z0SqnX5nGooy2cS3m', 'Admin', 'Demo', '+33612345678', 1, TRUE),
  (2, 'tech@example.com', '$2y$10$H8i5XbXwG0p4Az/cdXCMYOyNXadK1EzWLKQEiC5EvhczHxVh9Yx4C', 'Tech', 'Demo', '+33612345679', 3, TRUE),
  (3, 'medecin@example.com', '$2y$10$H8i5XbXwG0p4Az/cdXCMYOyNXadK1EzWLKQEiC5EvhczHxVh9Yx4C', 'Dr', 'Girard', '+33698765432', 2, TRUE)
ON CONFLICT (id) DO UPDATE SET 
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  role_id = EXCLUDED.role_id;

INSERT INTO user_notifications_preferences (user_id, email_enabled, sms_enabled, push_enabled, phone_number)
VALUES
  (1, TRUE, TRUE, FALSE, '+33612345678'),
  (2, TRUE, TRUE, FALSE, '+33612345679'),
  (3, TRUE, TRUE, FALSE, '+33698765432')
ON CONFLICT (user_id) DO UPDATE SET 
  email_enabled = EXCLUDED.email_enabled,
  sms_enabled = EXCLUDED.sms_enabled,
  push_enabled = EXCLUDED.push_enabled,
  phone_number = EXCLUDED.phone_number;

INSERT INTO patients (id, first_name, last_name, phone, city, postal_code, birth_date)
VALUES
  (1, 'Pierre', 'Durand', '0612345601', 'Paris', '75015', '1945-03-15'),
  (2, 'Paul', 'Martin', '0612345602', 'Lyon', '69001', '1952-07-22'),
  (3, 'Jacques', 'Bernard', '0612345603', 'Marseille', '13001', '1948-11-30')
ON CONFLICT (id) DO UPDATE SET 
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  phone = EXCLUDED.phone;

INSERT INTO devices (id, sim_iccid, device_serial, device_name, patient_id, installation_date, first_use_date, last_seen, last_battery, latitude, longitude)
VALUES
  (1, '89330123456789012345', 'OTT-PIERRE-001', 'OTT Pierre Paris', 1, NOW() - INTERVAL '45 days', NOW() - INTERVAL '120 days', NOW(), 85.5, 48.8566, 2.3522),
  (2, '89330123456789012346', 'OTT-PAUL-002', 'OTT Paul Lyon', 2, NOW() - INTERVAL '30 days', NOW() - INTERVAL '90 days', NOW() - INTERVAL '2 hours', 72.3, 45.7640, 4.8357),
  (3, '89330123456789012347', 'OTT-JACQUES-003', 'OTT Jacques Marseille', 3, NOW() - INTERVAL '60 days', NOW() - INTERVAL '150 days', NOW() - INTERVAL '5 hours', 68.9, 43.2965, 5.3698),
  (4, '89330123456789019999', 'OTT-STOCK-004', 'OTT Stock Bordeaux', NULL, NULL, NULL, NOW() - INTERVAL '1 day', 55.0, 44.8378, -0.5792)
ON CONFLICT (id) DO UPDATE SET 
  device_name = EXCLUDED.device_name,
  patient_id = EXCLUDED.patient_id;

INSERT INTO device_configurations (device_id, firmware_version, sleep_minutes, measurement_duration_ms, calibration_coefficients)
VALUES
  (1, '3.0.0', 30, 100, '[0,1,0]'::jsonb),
  (2, '3.0.0', 30, 100, '[0,1,0]'::jsonb),
  (3, '3.0.0', 30, 100, '[0,1,0]'::jsonb),
  (4, '3.0.0', 30, 100, '[0,1,0]'::jsonb)
ON CONFLICT (device_id) DO UPDATE SET 
  firmware_version = EXCLUDED.firmware_version,
  calibration_coefficients = EXCLUDED.calibration_coefficients;

INSERT INTO firmware_versions (version, file_path, file_size, is_stable, release_notes, uploaded_by)
VALUES ('3.0.0', 'firmwares/fw_ott_v3.0.0.bin', 925000, TRUE, 'Version 3.0 stable avec OTA + JWT + Notifications', 1)
ON CONFLICT (version) DO UPDATE SET 
  file_path = EXCLUDED.file_path,
  is_stable = EXCLUDED.is_stable;

INSERT INTO measurements (device_id, timestamp, flowrate, battery, device_status)
VALUES
  (1, NOW() - INTERVAL '30 minutes', 3.45, 85.5, 'TIMER'),
  (1, NOW() - INTERVAL '60 minutes', 3.21, 85.8, 'TIMER'),
  (1, NOW() - INTERVAL '90 minutes', 3.67, 86.0, 'TIMER'),
  (2, NOW() - INTERVAL '2 hours', 4.12, 72.3, 'TIMER'),
  (2, NOW() - INTERVAL '3 hours', 4.35, 73.1, 'TIMER'),
  (3, NOW() - INTERVAL '5 hours', 2.15, 68.9, 'TIMER'),
  (4, NOW() - INTERVAL '6 hours', 0.00, 55.0, 'IDLE')
ON CONFLICT DO NOTHING;

INSERT INTO alerts (id, device_id, type, severity, message, status, created_at)
VALUES
  ('ALERT-001', 1, 'low_battery', 'medium', 'Batterie en dessous de 20% pour OTT Pierre Paris', 'unresolved', NOW() - INTERVAL '15 minutes'),
  ('ALERT-002', 2, 'device_offline', 'high', 'Dispositif OTT Paul Lyon hors ligne depuis 3h', 'unresolved', NOW() - INTERVAL '2 hours'),
  ('ALERT-003', 4, 'device_offline', 'medium', 'Boîtier en stock sans patient, vérification requise', 'unresolved', NOW() - INTERVAL '1 day'),
  ('ALERT-004', 3, 'abnormal_flowrate', 'critical', 'Variation de débit anormale détectée', 'unresolved', NOW() - INTERVAL '45 minutes'),
  ('ALERT-005', 2, 'low_battery', 'low', 'Batterie revenue à 30% - alerte clôturée', 'resolved', NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

INSERT INTO device_logs (id, device_id, timestamp, level, event_type, message)
VALUES
  (1, 1, NOW() - INTERVAL '1 hour', 'INFO', 'wake', 'Réveil planifié'),
  (2, 1, NOW() - INTERVAL '50 minutes', 'WARN', 'low_battery', 'Batterie 19%'),
  (3, 2, NOW() - INTERVAL '3 hours', 'ERROR', 'offline', 'Perte réseau prolongée'),
  (4, 4, NOW() - INTERVAL '2 hours', 'INFO', 'inventory_check', 'Boîtier stock testé en atelier')
ON CONFLICT DO NOTHING;

INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, created_at)
VALUES
  (1, 1, 'user.created', 'user', '3', NULL, json_build_object('email','medecin@example.com'), NOW() - INTERVAL '2 days'),
  (2, 1, 'device.updated', 'device', '2', json_build_object('patient_id',2), json_build_object('patient_id',2,'status','active'), NOW() - INTERVAL '12 hours'),
  (3, 2, 'device.updated', 'device', '4', NULL, json_build_object('status','maintenance'), NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;
