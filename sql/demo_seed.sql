-- ============================================================================
-- DEMO DATA FOR RENDER POSTGRES
-- ============================================================================
-- À exécuter sur la base ott_data (Render PostgreSQL)
-- psql $DATABASE_URL -f sql/demo_seed.sql
-- ============================================================================

-- Patients
INSERT INTO patients (id, first_name, last_name, birth_date, phone, email, city, postal_code)
VALUES
  (1, 'Pierre', 'Dupont', '1982-03-14', '+33611223344', 'pierre.dupont@example.com', 'Paris', '75002'),
  (2, 'Paul', 'Martin', '1975-08-02', '+33655667788', 'paul.martin@example.com', 'Lyon', '69003'),
  (3, 'Jacques', 'Bernard', '1990-12-21', '+33777889900', 'jacques.bernard@example.com', 'Marseille', '13008')
ON CONFLICT (id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  birth_date = EXCLUDED.birth_date,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  city = EXCLUDED.city,
  postal_code = EXCLUDED.postal_code;

SELECT setval('patients_id_seq', (SELECT MAX(id) FROM patients));

-- Devices
INSERT INTO devices (id, sim_iccid, device_serial, device_name, firmware_version, status, patient_id, installation_date, first_use_date, last_seen, last_battery, latitude, longitude)
VALUES
  (1, '893301230000000001', 'OTT-PAR-001', 'OTT-Paris-001', '2.0.0', 'active', 1, NOW() - INTERVAL '30 days', NOW() - INTERVAL '90 days', NOW() - INTERVAL '10 minutes', 82.5, 48.8566, 2.3522),
  (2, '893301230000000002', 'OTT-LYO-002', 'OTT-Lyon-002', '2.0.0', 'active', 2, NOW() - INTERVAL '20 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 minutes', 56.2, 45.7640, 4.8357),
  (3, '893301230000000003', 'OTT-MRS-003', 'OTT-Marseille-003', '1.9.5', 'maintenance', 3, NOW() - INTERVAL '10 days', NOW() - INTERVAL '30 days', NOW() - INTERVAL '12 hours', 24.4, 43.2965, 5.3698),
  (4, '893301230000000004', 'OTT-LIL-004', 'OTT-Lille-004', '1.8.0', 'inactive', NULL, NULL, NOW() - INTERVAL '180 days', NOW() - INTERVAL '4 days', 5.1, 50.6292, 3.0573)
ON CONFLICT (id) DO UPDATE SET
  sim_iccid = EXCLUDED.sim_iccid,
  device_serial = EXCLUDED.device_serial,
  device_name = EXCLUDED.device_name,
  firmware_version = EXCLUDED.firmware_version,
  status = EXCLUDED.status,
  patient_id = EXCLUDED.patient_id,
  installation_date = EXCLUDED.installation_date,
  first_use_date = EXCLUDED.first_use_date,
  last_seen = EXCLUDED.last_seen,
  last_battery = EXCLUDED.last_battery,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude;

SELECT setval('devices_id_seq', (SELECT MAX(id) FROM devices));

-- Measurements (dernières 24h)
DELETE FROM measurements WHERE timestamp >= NOW() - INTERVAL '48 hours' AND device_id IN (1,2,3);
INSERT INTO measurements (device_id, timestamp, flowrate, battery, signal_strength, device_status)
VALUES
  (1, NOW() - INTERVAL '1 hour', 2.3, 82.0, -78, 'normal'),
  (1, NOW() - INTERVAL '2 hours', 2.1, 80.5, -80, 'normal'),
  (1, NOW() - INTERVAL '3 hours', 2.2, 79.8, -79, 'normal'),
  (2, NOW() - INTERVAL '30 minutes', 3.0, 56.0, -92, 'normal'),
  (2, NOW() - INTERVAL '90 minutes', 2.8, 57.0, -95, 'normal'),
  (3, NOW() - INTERVAL '4 hours', 1.5, 24.0, -105, 'low_battery'),
  (3, NOW() - INTERVAL '6 hours', 1.2, 28.0, -110, 'low_battery');

-- Alerts
INSERT INTO alerts (id, device_id, type, severity, message, status, created_at)
VALUES
  ('alert_par_batt', 3, 'low_battery', 'critical', 'Batterie < 25%', 'unresolved', NOW() - INTERVAL '3 hours'),
  ('alert_lille_offline', 4, 'device_offline', 'high', 'Aucune transmission depuis 72h', 'unresolved', NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO UPDATE SET
  device_id = EXCLUDED.device_id,
  type = EXCLUDED.type,
  severity = EXCLUDED.severity,
  message = EXCLUDED.message,
  status = EXCLUDED.status,
  created_at = EXCLUDED.created_at;

-- Device logs
DELETE FROM device_logs WHERE device_id IN (1,2,3,4);
INSERT INTO device_logs (device_id, timestamp, level, event_type, message)
VALUES
  (1, NOW() - INTERVAL '10 minutes', 'INFO', 'network', 'Transmission HTTP réussie (250ms)'),
  (2, NOW() - INTERVAL '45 minutes', 'WARN', 'network', 'RSSI faible (-101 dBm) - retry'),
  (3, NOW() - INTERVAL '3 hours', 'ERROR', 'power', 'Batterie < 20% - Mode économie'),
  (4, NOW() - INTERVAL '1 day', 'INFO', 'sleep', 'Entrée en deep sleep planifié');

-- Commandes descendantes de démonstration
DELETE FROM device_commands WHERE device_id IN (1,2,3);
INSERT INTO device_commands (device_id, command, payload, priority, status, execute_after, expires_at)
VALUES
  (1, 'SET_SLEEP_SECONDS', '{"seconds":180}', 'high', 'pending', NOW(), NOW() + INTERVAL '2 hour'),
  (2, 'PING', '{"message":"Diag rapide"}', 'normal', 'pending', NOW(), NOW() + INTERVAL '1 hour');

-- Utilisateurs demo (hash bcrypt generes via bcrypt-generator.com)
-- ⚠️ Remplacez ces hashes par vos propres mots de passe via variables d'environnement / scripts d'init.
INSERT INTO users (id, email, password_hash, first_name, last_name, role_id, is_active)
VALUES
  (1, 'admin@example.com', '$2y$10$w1K9P0IJhES2YwwHGwEk2Oq91Fv2R9DyCPr6Z0SqnX5nGooy2cS3m', 'Admin', 'Demo', 1, TRUE),
  (2, 'tech@example.com', '$2y$10$H8i5XbXwG0p4Az/cdXCMYOyNXadK1EzWLKQEiC5EvhczHxVh9Yx4C', 'Tech', 'Demo', 3, TRUE)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  role_id = EXCLUDED.role_id,
  is_active = EXCLUDED.is_active;

SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

-- Notifications prefs (par défaut)
INSERT INTO user_notifications_preferences (user_id, email_enabled, sms_enabled, push_enabled, phone_number)
VALUES
  (1, TRUE, FALSE, TRUE, '+33611223344'),
  (2, TRUE, TRUE, TRUE, '+33655667788')
ON CONFLICT (user_id) DO UPDATE SET
  email_enabled = EXCLUDED.email_enabled,
  sms_enabled = EXCLUDED.sms_enabled,
  push_enabled = EXCLUDED.push_enabled,
  phone_number = EXCLUDED.phone_number;

-- Notifications en file attente
INSERT INTO notifications_queue (user_id, type, priority, subject, message)
VALUES
  (1, 'email', 'medium', 'Rapport quotidien', 'Résumé des événements du 14/11'),
  (2, 'sms', 'high', 'Alerte batterie', 'Le dispositif OTT-Marseille-003 est en batterie critique')
ON CONFLICT DO NOTHING;

-- Audit logs de démonstration
INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, old_value, new_value)
VALUES
  (1, 'device.config_updated', 'device', '1', '192.168.0.12', NULL, '{"sleep_interval":300}'),
  (2, 'user.login', 'user', '2', '192.168.0.45', NULL, NULL);
