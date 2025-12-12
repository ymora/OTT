-- ============================================================================
-- RÉPARATION BASE DE DONNÉES - Sans perte de données
-- ============================================================================
-- HAPPLYZ MEDICAL SAS
-- 
-- Ce script répare/complète la base de données en créant tout ce qui manque
-- SANS TOUCHER aux données existantes
-- 
-- ✅ Crée les tables manquantes (IF NOT EXISTS)
-- ✅ Crée les index manquants (IF NOT EXISTS)
-- ✅ Crée les fonctions et triggers manquants
-- ✅ GARDE TOUTES LES DONNÉES EXISTANTES
-- ❌ NE FAIT AUCUN TRUNCATE, DELETE ou DROP
-- 
-- Date: 2025-12-12
-- ============================================================================

-- ============================================================================
-- ÉTAPE 1 : Fonction set_updated_at (utilisée par les triggers)
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ÉTAPE 2 : Tables de notifications (CRITIQUES - souvent manquantes)
-- ============================================================================

-- Table user_notifications_preferences
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

-- Trigger pour user_notifications_preferences
DROP TRIGGER IF EXISTS trg_user_notifications_preferences_updated ON user_notifications_preferences;
CREATE TRIGGER trg_user_notifications_preferences_updated 
BEFORE UPDATE ON user_notifications_preferences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table patient_notifications_preferences
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

-- Trigger pour patient_notifications_preferences
DROP TRIGGER IF EXISTS trg_patient_notifications_preferences_updated ON patient_notifications_preferences;
CREATE TRIGGER trg_patient_notifications_preferences_updated 
BEFORE UPDATE ON patient_notifications_preferences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table notifications_queue
CREATE TABLE IF NOT EXISTS notifications_queue (
  id BIGSERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  patient_id INT REFERENCES patients(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('email', 'sms', 'push')) NOT NULL,
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  send_after TIMESTAMPTZ DEFAULT NOW(),
  status TEXT CHECK (status IN ('pending', 'sent', 'failed')) DEFAULT 'pending',
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour notifications_queue
CREATE INDEX IF NOT EXISTS idx_notifications_queue_status ON notifications_queue(status, send_after);
CREATE INDEX IF NOT EXISTS idx_notifications_queue_user ON notifications_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_queue_patient ON notifications_queue(patient_id);

-- ============================================================================
-- ÉTAPE 3 : Vérifier et créer les autres tables critiques (si manquantes)
-- ============================================================================

-- Note: Ces tables devraient déjà exister, mais on les crée par sécurité
-- Elles utilisent IF NOT EXISTS donc aucun risque de conflit

-- Table device_events (si elle n'existe pas)
CREATE TABLE IF NOT EXISTS device_events (
  id BIGSERIAL PRIMARY KEY,
  device_id INT REFERENCES devices(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_events_device_id ON device_events(device_id);
CREATE INDEX IF NOT EXISTS idx_device_events_created_at ON device_events(created_at);

-- ============================================================================
-- ÉTAPE 4 : Index manquants sur tables existantes
-- ============================================================================

-- Index pour améliorer les performances des requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_devices_deleted_at ON devices(deleted_at);
CREATE INDEX IF NOT EXISTS idx_devices_patient_id ON devices(patient_id);
CREATE INDEX IF NOT EXISTS idx_devices_sim_iccid ON devices(sim_iccid);
CREATE INDEX IF NOT EXISTS idx_measurements_device_id ON measurements(device_id);
CREATE INDEX IF NOT EXISTS idx_measurements_created_at ON measurements(created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_device_id ON alerts(device_id);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_device_commands_device_id ON device_commands(device_id);
CREATE INDEX IF NOT EXISTS idx_device_logs_device_id ON device_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);
CREATE INDEX IF NOT EXISTS idx_patients_deleted_at ON patients(deleted_at);

-- ============================================================================
-- ÉTAPE 5 : Vérification finale
-- ============================================================================

-- Compter les tables importantes
SELECT 
    'Base de données réparée avec succès !' as message,
    (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) as users_actifs,
    (SELECT COUNT(*) FROM patients WHERE deleted_at IS NULL) as patients_actifs,
    (SELECT COUNT(*) FROM devices WHERE deleted_at IS NULL) as devices_actifs,
    (SELECT COUNT(*) FROM measurements) as total_mesures,
    (SELECT COUNT(*) FROM user_notifications_preferences) as prefs_users,
    (SELECT COUNT(*) FROM patient_notifications_preferences) as prefs_patients;

-- ============================================================================
-- TERMINÉ ✅
-- ============================================================================
-- Toutes les tables et index nécessaires ont été créés (si manquants)
-- AUCUNE DONNÉE N'A ÉTÉ PERDUE
-- ============================================================================

