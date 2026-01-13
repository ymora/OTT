-- ============================================================================  
-- OTT Demo Data Seed (Final version for actual schema)
-- ============================================================================  
-- HAPPLYZ MEDICAL SAS
-- Données de démonstration pour développement
-- ============================================================================

-- Utilisateurs de démo (adapté au schéma réel)
INSERT INTO users (id, email, password_hash, first_name, last_name, phone, role_id, is_active, created_at, updated_at) VALUES
  (1, 'ymora@free.fr', crypt('Ym120879', gen_salt('bf')), 'Yannick', 'Mora', '0612345678', 1, true, NOW(), NOW()),
  (2, 'admin@example.com', crypt('Admin1234!', gen_salt('bf')), 'Admin', 'User', '0623456789', 1, true, NOW(), NOW()),
  (3, 'medecin@example.com', crypt('Medecin1234!', gen_salt('bf')), 'Jean', 'Dupont', '0634567890', 2, true, NOW(), NOW()),
  (4, 'tech@example.com', crypt('Technicien1234!', gen_salt('bf')), 'Pierre', 'Martin', '0645678901', 3, true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET 
  email = EXCLUDED.email,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  phone = EXCLUDED.phone,
  role_id = EXCLUDED.role_id,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Patients de démo
INSERT INTO patients (id, first_name, last_name, date_of_birth, email, phone, city, address, postal_code, status, created_at, updated_at) VALUES
  (1, 'Marie', 'Martin', '1985-03-15', 'marie.martin@email.com', '0612345678', 'Paris', '123 Rue de la Santé', '75014', 'active', NOW(), NOW()),
  (2, 'Jean', 'Bernard', '1972-08-22', 'jean.bernard@email.com', '0623456789', 'Lyon', '456 Avenue des Gones', '69000', 'active', NOW(), NOW()),
  (3, 'Sophie', 'Petit', '1990-12-10', 'sophie.petit@email.com', '0634567890', 'Marseille', '789 Boulevard du Prado', '13008', 'active', NOW(), NOW()),
  (4, 'Robert', 'Dubois', '1965-05-30', 'robert.dubois@email.com', '0645678901', 'Bordeaux', '321 Cours de la Garonne', '33000', 'active', NOW(), NOW()),
  (5, 'Françoise', 'Leroy', '1978-09-18', 'francoise.leroy@email.com', '0656789012', 'Toulouse', '654 Place du Capitole', '31000', 'active', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET 
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  date_of_birth = EXCLUDED.date_of_birth,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  city = EXCLUDED.city,
  address = EXCLUDED.address,
  postal_code = EXCLUDED.postal_code,
  updated_at = NOW();

-- Firmware versions (adapté au schéma réel)
INSERT INTO firmware_versions (id, version, file_path, status, uploaded_by, created_at, updated_at) VALUES
  (1, 'v2.5.0', '/firmware/ott_v2.5.0.bin', 'active', 1, NOW(), NOW()),
  (2, 'v2.5.1', '/firmware/ott_v2.5.1.bin', 'inactive', 1, NOW(), NOW()),
  (3, 'fw_ott_optimized', '/firmware/fw_ott_optimized.bin', 'active', 1, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET 
  version = EXCLUDED.version,
  file_path = EXCLUDED.file_path,
  status = EXCLUDED.status,
  updated_at = NOW();

-- Dispositifs OTT de démo (adapté au schéma réel)
INSERT INTO devices (id, sim_iccid, device_serial, device_name, firmware_version, status, patient_id, current_firmware_id, last_seen, last_battery, last_flowrate, last_rssi, created_at, updated_at) VALUES
  (1, '89330176000012345678', 'OTT001', 'OTT-MARIE-001', 'v2.5.0', 'active', 1, 1, NOW() - INTERVAL '10 minutes', 85, 2.5, -65, NOW(), NOW()),
  (2, '89330176000012345679', 'OTT002', 'OTT-JEAN-002', 'v2.5.0', 'active', 2, 1, NOW() - INTERVAL '5 minutes', 92, 1.8, -58, NOW(), NOW()),
  (3, '89330176000012345680', 'OTT003', 'OTT-SOPHIE-003', 'v2.5.0', 'inactive', 3, 1, NOW() - INTERVAL '2 hours', 45, 0.0, -72, NOW(), NOW()),
  (4, '89330176000012345681', 'OTT004', 'OTT-ROBERT-004', 'fw_ott_optimized', 'active', 4, 3, NOW() - INTERVAL '15 minutes', 78, 3.2, -70, NOW(), NOW()),
  (5, '89330176000012345682', 'OTT005', 'OTT-FRANCOISE-005', 'v2.5.0', 'active', 5, 1, NOW() - INTERVAL '30 minutes', 12, 2.1, -75, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET 
  sim_iccid = EXCLUDED.sim_iccid,
  device_serial = EXCLUDED.device_serial,
  device_name = EXCLUDED.device_name,
  firmware_version = EXCLUDED.firmware_version,
  status = EXCLUDED.status,
  patient_id = EXCLUDED.patient_id,
  current_firmware_id = EXCLUDED.current_firmware_id,
  last_seen = EXCLUDED.last_seen,
  last_battery = EXCLUDED.last_battery,
  last_flowrate = EXCLUDED.last_flowrate,
  last_rssi = EXCLUDED.last_rssi,
  updated_at = NOW();

-- Configurations des dispositifs (adapté au schéma réel)
INSERT INTO device_configurations (device_id, firmware_version, ota_pending, sleep_minutes, measurement_duration_ms, min_battery_pct, created_at, updated_at) VALUES
  (1, 'v2.5.0', false, 5, 30000, 20, NOW(), NOW()),
  (2, 'v2.5.0', false, 10, 60000, 15, NOW(), NOW()),
  (3, 'v2.5.0', true, 5, 30000, 25, NOW(), NOW()),
  (4, 'fw_ott_optimized', false, 5, 30000, 20, NOW(), NOW()),
  (5, 'v2.5.0', false, 5, 30000, 30, NOW(), NOW())
ON CONFLICT (device_id) DO UPDATE SET 
  firmware_version = EXCLUDED.firmware_version,
  ota_pending = EXCLUDED.ota_pending,
  sleep_minutes = EXCLUDED.sleep_minutes,
  measurement_duration_ms = EXCLUDED.measurement_duration_ms,
  min_battery_pct = EXCLUDED.min_battery_pct,
  updated_at = NOW();

-- Mesures récentes (adapté au schéma réel)
INSERT INTO measurements (device_id, timestamp, flowrate, battery, signal_strength, device_status, created_at) VALUES
  (1, NOW() - INTERVAL '10 minutes', 2.5, 85, -65, 'normal', NOW()),
  (1, NOW() - INTERVAL '20 minutes', 2.3, 86, -67, 'normal', NOW()),
  (1, NOW() - INTERVAL '30 minutes', 2.7, 87, -64, 'normal', NOW()),
  (2, NOW() - INTERVAL '5 minutes', 1.8, 92, -58, 'normal', NOW()),
  (2, NOW() - INTERVAL '15 minutes', 2.1, 93, -56, 'normal', NOW()),
  (4, NOW() - INTERVAL '15 minutes', 3.2, 78, -72, 'normal', NOW()),
  (4, NOW() - INTERVAL '30 minutes', 2.9, 79, -70, 'normal', NOW())
ON CONFLICT DO NOTHING;

-- Alertes de démo (adapté au schéma réel avec les bons types)
INSERT INTO alerts (id, device_id, type, severity, message, status, created_at) VALUES
  ('alert_001', 3, 'device_offline', 'high', 'Dispositif hors ligne depuis plus de 2 heures', 'unresolved', NOW() - INTERVAL '2 hours'),
  ('alert_002', 5, 'low_battery', 'medium', 'Batterie faible (12%)', 'unresolved', NOW() - INTERVAL '30 minutes'),
  ('alert_003', 1, 'low_flowrate', 'low', 'Débit faible détecté', 'resolved', NOW() - INTERVAL '1 hour')
ON CONFLICT (id) DO UPDATE SET 
  type = EXCLUDED.type,
  severity = EXCLUDED.severity,
  message = EXCLUDED.message,
  status = EXCLUDED.status;

-- Logs système de démo (adapté au schéma réel)
INSERT INTO audit_logs (id, user_id, action, table_name, record_id, details, ip_address, user_agent, created_at) VALUES
  (1, 1, 'INSERT', 'users', 1, 'Création utilisateur Yannick Mora', '127.0.0.1', 'Mozilla/5.0...', NOW() - INTERVAL '1 hour'),
  (2, 1, 'SELECT', 'patients', NULL, 'Consultation liste patients', '127.0.0.1', 'Mozilla/5.0...', NOW() - INTERVAL '45 minutes'),
  (3, 1, 'INSERT', 'patients', 1, 'Création patient Marie Martin', '127.0.0.1', 'Mozilla/5.0...', NOW() - INTERVAL '30 minutes'),
  (4, 1, 'UPDATE', 'devices', 1, 'Mise à jour configuration OTT-MARIE-001', '127.0.0.1', 'Mozilla/5.0...', NOW() - INTERVAL '15 minutes')
ON CONFLICT (id) DO UPDATE SET 
  action = EXCLUDED.action,
  table_name = EXCLUDED.table_name,
  record_id = EXCLUDED.record_id,
  details = EXCLUDED.details,
  updated_at = NOW();

-- Préférences de notification des patients
INSERT INTO patient_notifications_preferences (patient_id, email_enabled, sms_enabled, push_enabled, created_at, updated_at) VALUES
  (1, true, true, false, NOW(), NOW()),
  (2, true, false, true, NOW(), NOW()),
  (3, false, true, true, NOW(), NOW()),
  (4, true, true, true, NOW(), NOW()),
  (5, false, false, true, NOW(), NOW())
ON CONFLICT (patient_id) DO UPDATE SET 
  email_enabled = EXCLUDED.email_enabled,
  sms_enabled = EXCLUDED.sms_enabled,
  push_enabled = EXCLUDED.push_enabled,
  updated_at = NOW();

COMMIT;
