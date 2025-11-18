-- ============================================================================
-- MIGRATION : Optimisations et Améliorations Base de Données OTT
-- ============================================================================
-- HAPPLYZ MEDICAL SAS
-- Ce script applique toutes les optimisations identifiées dans l'audit
-- À exécuter sur une base de données existante
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. FONCTIONS UTILITAIRES
-- ============================================================================

-- Fonction de validation email
CREATE OR REPLACE FUNCTION is_valid_email(email TEXT) RETURNS BOOLEAN AS $$
BEGIN
  RETURN email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Fonction de validation ICCID (19-20 chiffres)
CREATE OR REPLACE FUNCTION is_valid_iccid(iccid TEXT) RETURNS BOOLEAN AS $$
BEGIN
  RETURN iccid ~ '^[0-9]{19,20}$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 2. COLONNES MANQUANTES - TABLES EXISTANTES
-- ============================================================================

-- Table users : timezone et phone (si manquant)
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Europe/Paris',
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Table patients : colonnes supplémentaires
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('M','F','other')),
  ADD COLUMN IF NOT EXISTS national_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS insurance_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS medical_notes TEXT,
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Europe/Paris',
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Table devices : colonnes supplémentaires
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(50),
  ADD COLUMN IF NOT EXISTS model VARCHAR(50),
  ADD COLUMN IF NOT EXISTS warranty_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS purchase_date DATE,
  ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS imei VARCHAR(15) UNIQUE,
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Europe/Paris',
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Table measurements : colonnes supplémentaires
ALTER TABLE measurements
  ADD COLUMN IF NOT EXISTS temperature NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS humidity NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS pressure NUMERIC(8,2);

-- Table alerts : colonnes supplémentaires
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_by INT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_resolved BOOLEAN DEFAULT FALSE;

-- Table notifications_queue : colonnes supplémentaires
ALTER TABLE notifications_queue
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;

-- Table patient_notifications_preferences : ajouter phone_number (manquait dans le schéma initial)
ALTER TABLE patient_notifications_preferences
  ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);

-- ============================================================================
-- 3. CONTRAINTES CHECK - INTÉGRITÉ DES DONNÉES
-- ============================================================================

-- Contrainte batterie devices
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_battery_range'
  ) THEN
    ALTER TABLE devices ADD CONSTRAINT chk_battery_range 
      CHECK (last_battery IS NULL OR (last_battery >= 0 AND last_battery <= 100));
  END IF;
END $$;

-- Contraintes measurements
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_flowrate_positive'
  ) THEN
    ALTER TABLE measurements ADD CONSTRAINT chk_flowrate_positive 
      CHECK (flowrate >= 0);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_measurements_battery_range'
  ) THEN
    ALTER TABLE measurements ADD CONSTRAINT chk_measurements_battery_range 
      CHECK (battery IS NULL OR (battery >= 0 AND battery <= 100));
  END IF;
END $$;

-- Contrainte device_configurations
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_sleep_minutes_positive'
  ) THEN
    ALTER TABLE device_configurations ADD CONSTRAINT chk_sleep_minutes_positive 
      CHECK (sleep_minutes > 0);
  END IF;
END $$;

-- Validation email (optionnel - peut échouer si données invalides existent)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_valid_email'
  ) THEN
    BEGIN
      ALTER TABLE users ADD CONSTRAINT chk_users_valid_email 
        CHECK (is_valid_email(email));
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Contrainte email non ajoutée - vérifier les données existantes';
    END;
  END IF;
END $$;

-- Validation ICCID (optionnel)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_valid_iccid'
  ) THEN
    BEGIN
      ALTER TABLE devices ADD CONSTRAINT chk_valid_iccid 
        CHECK (is_valid_iccid(sim_iccid));
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Contrainte ICCID non ajoutée - vérifier les données existantes';
    END;
  END IF;
END $$;

-- ============================================================================
-- 4. INDEX MANQUANTS - PERFORMANCE
-- ============================================================================

-- Index devices
CREATE INDEX IF NOT EXISTS idx_devices_patient ON devices(patient_id) WHERE patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen DESC) WHERE last_seen IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_devices_deleted ON devices(deleted_at) WHERE deleted_at IS NULL;

-- Index notifications_queue
CREATE INDEX IF NOT EXISTS idx_notifications_queue_send_after 
  ON notifications_queue(send_after) WHERE status = 'pending';

-- Index audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Index device_commands
CREATE INDEX IF NOT EXISTS idx_device_commands_status 
  ON device_commands(status, execute_after);

-- Index users
CREATE INDEX IF NOT EXISTS idx_users_deleted ON users(deleted_at) WHERE deleted_at IS NULL;

-- Index patients
CREATE INDEX IF NOT EXISTS idx_patients_deleted ON patients(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================================
-- 5. NOUVELLES TABLES - GESTION DES SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  refresh_token_hash VARCHAR(255),
  ip_address VARCHAR(45),
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at) WHERE revoked_at IS NULL;

-- ============================================================================
-- 6. NOUVELLES TABLES - HISTORIQUE FIRMWARE
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_firmware_history (
  id BIGSERIAL PRIMARY KEY,
  device_id INT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  from_version VARCHAR(20),
  to_version VARCHAR(20) NOT NULL,
  status TEXT CHECK (status IN ('pending','in_progress','success','failed','rolled_back')) DEFAULT 'pending',
  firmware_version_id INT REFERENCES firmware_versions(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  initiated_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_firmware_history_device ON device_firmware_history(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_firmware_history_status ON device_firmware_history(status);

-- ============================================================================
-- 7. NOUVELLES TABLES - PARAMÈTRES SYSTÈME
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT,
  type TEXT CHECK (type IN ('string','integer','boolean','json')) DEFAULT 'string',
  category VARCHAR(50),
  description TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  updated_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_system_settings_updated BEFORE UPDATE ON system_settings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS system_settings_history (
  id BIGSERIAL PRIMARY KEY,
  setting_id INT NOT NULL REFERENCES system_settings(id) ON DELETE CASCADE,
  old_value TEXT,
  new_value TEXT,
  changed_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_settings_history_setting ON system_settings_history(setting_id, created_at DESC);

-- Insertion des paramètres par défaut
INSERT INTO system_settings (key, value, type, category, description, is_public) VALUES
  ('alert.battery_low_threshold', '20', 'integer', 'alerts', 'Seuil de batterie faible (%)', TRUE),
  ('alert.offline_threshold_minutes', '180', 'integer', 'alerts', 'Seuil hors ligne (minutes)', TRUE),
  ('ota.min_battery_pct', '30', 'integer', 'ota', 'Batterie minimale pour OTA (%)', TRUE),
  ('measurement.retention_days', '365', 'integer', 'data', 'Rétention des mesures (jours)', FALSE),
  ('session.max_duration_hours', '24', 'integer', 'auth', 'Durée max session (heures)', FALSE),
  ('notification.max_attempts', '3', 'integer', 'notifications', 'Tentatives max notifications', FALSE)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 8. NOUVELLES TABLES - HISTORIQUE STATUT DISPOSITIFS
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_status_history (
  id BIGSERIAL PRIMARY KEY,
  device_id INT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by INT REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_device_status_history_device ON device_status_history(device_id, created_at DESC);

-- ============================================================================
-- 9. NOUVELLES TABLES - ÉVÉNEMENTS UNIFIÉS
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_events (
  id BIGSERIAL PRIMARY KEY,
  device_id INT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'measurement','alert','log','command','ota','config_update','status_change'
  )),
  source_table TEXT,
  source_id BIGINT,
  severity TEXT CHECK (severity IN ('info','warning','error','critical')),
  title VARCHAR(255),
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_device_events_device_time ON device_events(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_events_type ON device_events(event_type);

-- ============================================================================
-- 10. NOUVELLES TABLES - RAPPORTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('patients','devices','measurements','alerts','audit')),
  format TEXT CHECK (format IN ('csv','xlsx','pdf','json')) DEFAULT 'csv',
  filters JSONB,
  status TEXT CHECK (status IN ('pending','processing','completed','failed')) DEFAULT 'pending',
  file_path TEXT,
  file_size BIGINT,
  requested_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(requested_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- ============================================================================
-- 11. NOUVELLES TABLES - GROUPES/ÉQUIPES
-- ============================================================================

CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_teams_updated BEFORE UPDATE ON teams
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS team_members (
  team_id INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('member','leader')) DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);

CREATE TABLE IF NOT EXISTS team_devices (
  team_id INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  device_id INT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (team_id, device_id)
);
CREATE INDEX IF NOT EXISTS idx_team_devices_device ON team_devices(device_id);

-- ============================================================================
-- 12. NOUVELLES TABLES - MAINTENANCES PLANIFIÉES
-- ============================================================================

CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id SERIAL PRIMARY KEY,
  device_id INT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('preventive','corrective','calibration','firmware_update')) NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('scheduled','in_progress','completed','cancelled','skipped')) DEFAULT 'scheduled',
  description TEXT,
  technician_id INT REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_maintenance_schedules_updated BEFORE UPDATE ON maintenance_schedules
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_device ON maintenance_schedules(device_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_status ON maintenance_schedules(status, scheduled_at);

-- ============================================================================
-- 13. NOUVELLES TABLES - SEUILS ALERTE PERSONNALISÉS
-- ============================================================================

CREATE TABLE IF NOT EXISTS alert_thresholds (
  id SERIAL PRIMARY KEY,
  device_id INT REFERENCES devices(id) ON DELETE CASCADE,
  patient_id INT REFERENCES patients(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('low_flowrate','high_flowrate','low_battery','abnormal_flowrate')),
  threshold_value NUMERIC(10,2) NOT NULL,
  severity TEXT CHECK (severity IN ('low','medium','high','critical')) DEFAULT 'medium',
  is_active BOOLEAN DEFAULT TRUE,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT alert_thresholds_target CHECK (device_id IS NOT NULL OR patient_id IS NOT NULL)
);
CREATE TRIGGER trg_alert_thresholds_updated BEFORE UPDATE ON alert_thresholds
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_alert_thresholds_device ON alert_thresholds(device_id);
CREATE INDEX IF NOT EXISTS idx_alert_thresholds_patient ON alert_thresholds(patient_id);

-- ============================================================================
-- 14. NOUVELLES TABLES - PIÈCES JOINTES
-- ============================================================================

CREATE TABLE IF NOT EXISTS attachments (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('patient','device','maintenance','alert','audit')),
  entity_id INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type VARCHAR(100),
  uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id);

-- ============================================================================
-- 15. NOUVELLES TABLES - TAGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  color VARCHAR(7),
  category TEXT CHECK (category IN ('device','patient','alert','maintenance')) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_tags (
  device_id INT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  tag_id INT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (device_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_device_tags_tag ON device_tags(tag_id);

CREATE TABLE IF NOT EXISTS patient_tags (
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tag_id INT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (patient_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_patient_tags_tag ON patient_tags(tag_id);

-- ============================================================================
-- 16. TRIGGERS AUTOMATIQUES
-- ============================================================================

-- Trigger pour mettre à jour last_seen et last_battery automatiquement
CREATE OR REPLACE FUNCTION update_device_last_seen()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE devices 
  SET last_seen = NEW.timestamp,
      last_battery = NEW.battery
  WHERE id = NEW.device_id AND deleted_at IS NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_device_last_seen ON measurements;
CREATE TRIGGER trg_update_device_last_seen
AFTER INSERT ON measurements
FOR EACH ROW EXECUTE FUNCTION update_device_last_seen();

-- Trigger pour historiser les changements de statut
CREATE OR REPLACE FUNCTION log_device_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO device_status_history (device_id, old_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, NULL); -- changed_by sera rempli par l'API
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_device_status_change ON devices;
CREATE TRIGGER trg_log_device_status_change
AFTER UPDATE ON devices
FOR EACH ROW EXECUTE FUNCTION log_device_status_change();

-- Trigger pour créer un événement unifié lors d'une nouvelle mesure
CREATE OR REPLACE FUNCTION create_measurement_event()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO device_events (device_id, event_type, source_table, source_id, severity, title, description, metadata)
  VALUES (
    NEW.device_id,
    'measurement',
    'measurements',
    NEW.id,
    'info',
    'Nouvelle mesure',
    format('Débit: %s L/min, Batterie: %s%%', NEW.flowrate, COALESCE(NEW.battery::text, 'N/A')),
    jsonb_build_object(
      'flowrate', NEW.flowrate,
      'battery', NEW.battery,
      'timestamp', NEW.timestamp
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_measurement_event ON measurements;
CREATE TRIGGER trg_create_measurement_event
AFTER INSERT ON measurements
FOR EACH ROW EXECUTE FUNCTION create_measurement_event();

-- Trigger pour créer un événement lors d'une nouvelle alerte
CREATE OR REPLACE FUNCTION create_alert_event()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO device_events (device_id, event_type, source_table, source_id, severity, title, description, metadata)
  VALUES (
    NEW.device_id,
    'alert',
    'alerts',
    NEW.id,
    NEW.severity,
    format('Alerte: %s', NEW.type),
    NEW.message,
    jsonb_build_object(
      'type', NEW.type,
      'severity', NEW.severity,
      'status', NEW.status
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_alert_event ON alerts;
CREATE TRIGGER trg_create_alert_event
AFTER INSERT ON alerts
FOR EACH ROW EXECUTE FUNCTION create_alert_event();

-- ============================================================================
-- 17. VUES AMÉLIORÉES
-- ============================================================================

-- Vue enrichie device_stats avec soft delete (mise à jour seulement si nécessaire)
-- La vue existe déjà dans schema.sql, on la met à jour pour inclure soft delete
DO $$
BEGIN
  -- Vérifier si la colonne deleted_at existe dans devices
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'devices' AND column_name = 'deleted_at'
  ) THEN
    -- Mettre à jour la vue pour inclure le filtre soft delete
    EXECUTE 'CREATE OR REPLACE VIEW device_stats AS
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
      AVG(m.flowrate) FILTER (WHERE m.timestamp >= NOW() - INTERVAL ''7 days'') AS avg_flowrate_7d,
      EXTRACT(EPOCH FROM (NOW() - d.last_seen))/60 AS minutes_since_last_seen
    FROM devices d
    LEFT JOIN patients p ON d.patient_id = p.id AND (p.deleted_at IS NULL OR p.deleted_at IS NULL)
    LEFT JOIN device_configurations dc ON d.id = dc.device_id
    LEFT JOIN measurements m ON d.id = m.device_id
    WHERE d.deleted_at IS NULL
    GROUP BY d.id, p.first_name, p.last_name, dc.firmware_version, dc.ota_pending';
  END IF;
END $$;

-- Vue pour les dispositifs actifs uniquement
CREATE OR REPLACE VIEW active_devices AS
SELECT 
  d.id, d.sim_iccid, d.device_serial, d.device_name, d.firmware_version,
  d.status, d.patient_id, d.installation_date, d.first_use_date,
  d.last_seen, d.last_battery, d.latitude, d.longitude,
  d.created_at, d.updated_at, d.deleted_at,
  p.first_name, p.last_name, 
  dc.firmware_version AS config_firmware_version, dc.ota_pending
FROM devices d
LEFT JOIN patients p ON d.patient_id = p.id AND p.deleted_at IS NULL
LEFT JOIN device_configurations dc ON d.id = dc.device_id
WHERE d.deleted_at IS NULL AND d.status = 'active';

-- ============================================================================
-- 18. NETTOYAGE DES SESSIONS EXPIRÉES (Fonction)
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM user_sessions
  WHERE expires_at < NOW() OR revoked_at IS NOT NULL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 19. COMMENTAIRES SUR LES TABLES
-- ============================================================================

COMMENT ON TABLE user_sessions IS 'Gestion des sessions utilisateurs actives avec tokens JWT';
COMMENT ON TABLE device_firmware_history IS 'Historique complet des mises à jour firmware OTA';
COMMENT ON TABLE system_settings IS 'Paramètres de configuration système centralisés';
COMMENT ON TABLE device_status_history IS 'Historique des changements de statut des dispositifs';
COMMENT ON TABLE device_events IS 'Timeline unifiée de tous les événements dispositifs';
COMMENT ON TABLE reports IS 'Rapports et exports générés par les utilisateurs';
COMMENT ON TABLE teams IS 'Groupes/équipes d''utilisateurs';
COMMENT ON TABLE maintenance_schedules IS 'Planification des maintenances dispositifs';
COMMENT ON TABLE alert_thresholds IS 'Seuils d''alerte personnalisés par dispositif/patient';
COMMENT ON TABLE attachments IS 'Pièces jointes et documents';
COMMENT ON TABLE tags IS 'Système de tags pour catégorisation flexible';

COMMIT;

-- ============================================================================
-- FIN DE LA MIGRATION
-- ============================================================================
-- Vérifications recommandées après migration :
-- 
-- 1. Vérifier les index créés :
--    SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename;
--
-- 2. Vérifier les contraintes :
--    SELECT conname, conrelid::regclass, contype FROM pg_constraint WHERE conrelid::regclass::text LIKE '%devices%' OR conrelid::regclass::text LIKE '%measurements%';
--
-- 3. Vérifier les nouvelles tables :
--    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
--
-- 4. Tester les fonctions :
--    SELECT is_valid_email('test@example.com');
--    SELECT is_valid_iccid('89330123456789012345');
--
-- 5. Vérifier les paramètres système :
--    SELECT * FROM system_settings;
-- ============================================================================

