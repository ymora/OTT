-- ============================================================================  
-- OTT Demo Data Seed
-- ============================================================================  
-- HAPPLYZ MEDICAL SAS
-- Données de démonstration pour développement
-- ============================================================================

-- Utilisateurs de démo
INSERT INTO users (id, email, password_hash, first_name, last_name, role_id, status, created_at, updated_at) VALUES
  (1, 'ymora@free.fr', crypt('Ym120879', gen_salt('bf')), 'Yannick', 'Mora', 1, 'active', NOW(), NOW()),
  (2, 'admin@example.com', crypt('Admin1234!', gen_salt('bf')), 'Admin', 'User', 1, 'active', NOW(), NOW()),
  (3, 'medecin@example.com', crypt('Medecin1234!', gen_salt('bf')), 'Jean', 'Dupont', 2, 'active', NOW(), NOW()),
  (4, 'tech@example.com', crypt('Technicien1234!', gen_salt('bf')), 'Pierre', 'Martin', 3, 'active', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET 
  email = EXCLUDED.email,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  role_id = EXCLUDED.role_id,
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

-- Firmware versions
INSERT INTO firmware_versions (id, version, description, file_path, status, created_at, updated_at) VALUES
  (1, 'v2.5.0', 'Version stable avec corrections bugs', '/firmware/ott_v2.5.0.bin', 'active', NOW(), NOW()),
  (2, 'v2.5.1', 'Version beta avec nouvelles fonctionnalités', '/firmware/ott_v2.5.1.bin', 'inactive', NOW(), NOW()),
  (3, 'fw_ott_optimized', 'Version optimisée pour production', '/firmware/fw_ott_optimized.bin', 'active', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET 
  version = EXCLUDED.version,
  description = EXCLUDED.description,
  file_path = EXCLUDED.file_path,
  status = EXCLUDED.status,
  updated_at = NOW();

-- Dispositifs OTT de démo
INSERT INTO devices (id, iccid, device_name, firmware_version, status, battery_level, last_seen, patient_id, current_firmware_id, created_at, updated_at) VALUES
  ('89330176000012345678', '89330176000012345678', 'OTT-MARIE-001', 'v2.5.0', 'online', 85, NOW() - INTERVAL '10 minutes', 1, 1, NOW(), NOW()),
  ('89330176000012345679', '89330176000012345679', 'OTT-JEAN-002', 'v2.5.0', 'online', 92, NOW() - INTERVAL '5 minutes', 2, 1, NOW(), NOW()),
  ('89330176000012345680', '89330176000012345680', 'OTT-SOPHIE-003', 'v2.5.0', 'offline', 45, NOW() - INTERVAL '2 hours', 3, 1, NOW(), NOW()),
  ('89330176000012345681', '89330176000012345681', 'OTT-ROBERT-004', 'fw_ott_optimized', 'online', 78, NOW() - INTERVAL '15 minutes', 4, 3, NOW(), NOW()),
  ('89330176000012345682', '89330176000012345682', 'OTT-FRANCOISE-005', 'v2.5.0', 'warning', 12, NOW() - INTERVAL '30 minutes', 5, 1, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET 
  device_name = EXCLUDED.device_name,
  firmware_version = EXCLUDED.firmware_version,
  status = EXCLUDED.status,
  battery_level = EXCLUDED.battery_level,
  last_seen = EXCLUDED.last_seen,
  patient_id = EXCLUDED.patient_id,
  current_firmware_id = EXCLUDED.current_firmware_id,
  updated_at = NOW();

-- Configurations des dispositifs
INSERT INTO device_configurations (device_id, firmware_version, ota_pending, configuration_data, created_at, updated_at) VALUES
  ('89330176000012345678', 'v2.5.0', false, '{"measurement_interval": 300, "battery_threshold": 20, "apn": "free", "server_url": "https://ott-api.example.com"}', NOW(), NOW()),
  ('89330176000012345679', 'v2.5.0', false, '{"measurement_interval": 600, "battery_threshold": 15, "apn": "orange", "server_url": "https://ott-api.example.com"}', NOW(), NOW()),
  ('89330176000012345680', 'v2.5.0', true, '{"measurement_interval": 300, "battery_threshold": 25, "apn": "sfr", "server_url": "https://ott-api.example.com"}', NOW(), NOW()),
  ('89330176000012345681', 'fw_ott_optimized', false, '{"measurement_interval": 300, "battery_threshold": 20, "apn": "bouygues", "server_url": "https://ott-api.example.com"}', NOW(), NOW()),
  ('89330176000012345682', 'v2.5.0', false, '{"measurement_interval": 300, "battery_threshold": 30, "apn": "free", "server_url": "https://ott-api.example.com"}', NOW(), NOW())
ON CONFLICT (device_id) DO UPDATE SET 
  firmware_version = EXCLUDED.firmware_version,
  ota_pending = EXCLUDED.ota_pending,
  configuration_data = EXCLUDED.configuration_data,
  updated_at = NOW();

-- Mesures récentes
INSERT INTO measurements (device_id, timestamp, flowrate, volume, battery_level, signal_strength, temperature, created_at) VALUES
  ('89330176000012345678', NOW() - INTERVAL '10 minutes', 2.5, 1500, 85, -65, 22.5, NOW()),
  ('89330176000012345678', NOW() - INTERVAL '20 minutes', 2.3, 1380, 86, -67, 22.3, NOW()),
  ('89330176000012345678', NOW() - INTERVAL '30 minutes', 2.7, 1620, 87, -64, 22.7, NOW()),
  ('89330176000012345679', NOW() - INTERVAL '5 minutes', 1.8, 540, 92, -58, 21.8, NOW()),
  ('89330176000012345679', NOW() - INTERVAL '15 minutes', 2.1, 630, 93, -56, 21.9, NOW()),
  ('89330176000012345681', NOW() - INTERVAL '15 minutes', 3.2, 2880, 78, -72, 23.2, NOW()),
  ('89330176000012345681', NOW() - INTERVAL '30 minutes', 2.9, 2610, 79, -70, 23.0, NOW())
ON CONFLICT DO NOTHING;

-- Alertes de démo
INSERT INTO alerts (id, device_id, type, severity, message, status, created_at, updated_at) VALUES
  ('alert_001', '89330176000012345680', 'offline', 'high', 'Dispositif hors ligne depuis plus de 2 heures', 'unresolved', NOW() - INTERVAL '2 hours', NOW()),
  ('alert_002', '89330176000012345682', 'battery', 'medium', 'Batterie faible (12%)', 'unresolved', NOW() - INTERVAL '30 minutes', NOW()),
  ('alert_003', '89330176000012345678', 'measurement', 'low', 'Absence de mesures depuis 10 minutes', 'resolved', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '30 minutes')
ON CONFLICT (id) DO UPDATE SET 
  type = EXCLUDED.type,
  severity = EXCLUDED.severity,
  message = EXCLUDED.message,
  status = EXCLUDED.status,
  updated_at = NOW();

-- Logs système de démo
INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, ip_address, user_agent, created_at) VALUES
  (1, 1, 'login', 'auth', NULL, 'Connexion réussie', '127.0.0.1', 'Mozilla/5.0...', NOW() - INTERVAL '1 hour'),
  (2, 1, 'view', 'patients', NULL, 'Consultation liste patients', '127.0.0.1', 'Mozilla/5.0...', NOW() - INTERVAL '45 minutes'),
  (3, 1, 'create', 'patients', 1, 'Création patient Marie Martin', '127.0.0.1', 'Mozilla/5.0...', NOW() - INTERVAL '30 minutes'),
  (4, 1, 'update', 'devices', '89330176000012345678', 'Mise à jour configuration OTT-MARIE-001', '127.0.0.1', 'Mozilla/5.0...', NOW() - INTERVAL '15 minutes')
ON CONFLICT (id) DO UPDATE SET 
  action = EXCLUDED.action,
  resource_type = EXCLUDED.resource_type,
  resource_id = EXCLUDED.resource_id,
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
