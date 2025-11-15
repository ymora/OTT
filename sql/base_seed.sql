-- ============================================================================
-- BASE SEED (rôles, permissions, utilisateurs et données minimales)
-- ============================================================================

INSERT INTO roles (id, name, description) VALUES
  (1, 'admin', 'Administrateur systeme - Acces complet'),
  (2, 'medecin', 'Medecin - Consultation patients et dispositifs'),
  (3, 'technicien', 'Technicien - Maintenance dispositifs'),
  (4, 'viewer', 'Lecture seule')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

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
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

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

INSERT INTO role_permissions (role_id, permission_id)
SELECT 4, id FROM permissions WHERE code IN (
  'devices.view','patients.view','reports.view','alerts.view'
)
ON CONFLICT DO NOTHING;

INSERT INTO users (id, email, password_hash, first_name, last_name, role_id, is_active)
VALUES
  (1, 'admin@example.com', '$2y$10$w1K9P0IJhES2YwwHGwEk2Oq91Fv2R9DyCPr6Z0SqnX5nGooy2cS3m', 'Admin', 'Demo', 1, TRUE),
  (2, 'tech@example.com', '$2y$10$H8i5XbXwG0p4Az/cdXCMYOyNXadK1EzWLKQEiC5EvhczHxVh9Yx4C', 'Tech', 'Demo', 3, TRUE)
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

INSERT INTO user_notifications_preferences (user_id, email_enabled, sms_enabled, phone_number)
VALUES
  (1, TRUE, TRUE, '+33612345678'),
  (2, TRUE, FALSE, '+33612345679')
ON CONFLICT (user_id) DO UPDATE SET email_enabled = EXCLUDED.email_enabled;

INSERT INTO patients (id, first_name, last_name, phone, city, postal_code, birth_date)
VALUES
  (1, 'Pierre', 'Durand', '0612345601', 'Paris', '75015', '1945-03-15'),
  (2, 'Paul', 'Martin', '0612345602', 'Lyon', '69001', '1952-07-22'),
  (3, 'Jacques', 'Bernard', '0612345603', 'Marseille', '13001', '1948-11-30')
ON CONFLICT (id) DO UPDATE SET first_name = EXCLUDED.first_name;

INSERT INTO devices (id, sim_iccid, device_serial, device_name, patient_id, installation_date, first_use_date, last_seen, last_battery, latitude, longitude)
VALUES
  (1, '89330123456789012345', 'OTT-PIERRE-001', 'OTT Pierre Paris', 1, NOW() - INTERVAL '45 days', NOW() - INTERVAL '120 days', NOW(), 85.5, 48.8566, 2.3522),
  (2, '89330123456789012346', 'OTT-PAUL-002', 'OTT Paul Lyon', 2, NOW() - INTERVAL '30 days', NOW() - INTERVAL '90 days', NOW() - INTERVAL '2 hours', 72.3, 45.7640, 4.8357),
  (3, '89330123456789012347', 'OTT-JACQUES-003', 'OTT Jacques Marseille', 3, NOW() - INTERVAL '60 days', NOW() - INTERVAL '150 days', NOW() - INTERVAL '5 hours', 68.9, 43.2965, 5.3698)
ON CONFLICT (id) DO UPDATE SET device_name = EXCLUDED.device_name;

INSERT INTO device_configurations (device_id, firmware_version, sleep_minutes, measurement_duration_ms, calibration_coefficients)
VALUES
  (1, '3.0.0', 30, 100, '[0,1,0]'::jsonb),
  (2, '3.0.0', 30, 100, '[0,1,0]'::jsonb),
  (3, '3.0.0', 30, 100, '[0,1,0]'::jsonb)
ON CONFLICT (device_id) DO UPDATE SET firmware_version = EXCLUDED.firmware_version;

INSERT INTO firmware_versions (version, file_path, file_size, is_stable, release_notes, uploaded_by)
VALUES ('3.0.0', 'firmwares/fw_ott_v3.0.0.bin', 925000, TRUE, 'Version 3.0 stable avec OTA + JWT + Notifications', 1)
ON CONFLICT (version) DO UPDATE SET file_path = EXCLUDED.file_path;

INSERT INTO measurements (device_id, timestamp, flowrate, battery, device_status)
VALUES
  (1, NOW() - INTERVAL '30 minutes', 3.45, 85.5, 'TIMER'),
  (1, NOW() - INTERVAL '60 minutes', 3.21, 85.8, 'TIMER'),
  (1, NOW() - INTERVAL '90 minutes', 3.67, 86.0, 'TIMER'),
  (2, NOW() - INTERVAL '2 hours', 4.12, 72.3, 'TIMER'),
  (2, NOW() - INTERVAL '3 hours', 4.35, 73.1, 'TIMER'),
  (3, NOW() - INTERVAL '5 hours', 2.15, 68.9, 'TIMER')
ON CONFLICT DO NOTHING;

