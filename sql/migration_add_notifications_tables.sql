-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION - Tables de notifications
-- ═══════════════════════════════════════════════════════════════════
-- HAPPLYZ MEDICAL SAS
-- 
-- Ce script crée les tables de préférences de notifications
-- pour les utilisateurs et les patients si elles n'existent pas.
-- 
-- UTILISATION:
--   - BDD PostgreSQL existante
--   - Exécuter ce script UNE SEULE FOIS
--   - Idempotent (peut être rejoué sans erreur)
-- 
-- Date: 2025-01-XX
-- ═══════════════════════════════════════════════════════════════════

-- S'assurer que la fonction set_updated_at existe
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Table des préférences de notifications pour les utilisateurs
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

-- Trigger pour mettre à jour automatiquement updated_at
DROP TRIGGER IF EXISTS trg_user_notifications_preferences_updated ON user_notifications_preferences;
CREATE TRIGGER trg_user_notifications_preferences_updated 
BEFORE UPDATE ON user_notifications_preferences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table des préférences de notifications pour les patients
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

-- Trigger pour mettre à jour automatiquement updated_at
DROP TRIGGER IF EXISTS trg_patient_notifications_preferences_updated ON patient_notifications_preferences;
CREATE TRIGGER trg_patient_notifications_preferences_updated 
BEFORE UPDATE ON patient_notifications_preferences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table de la queue de notifications (si elle n'existe pas déjà)
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

-- Index pour la queue de notifications
CREATE INDEX IF NOT EXISTS idx_notifications_queue_status ON notifications_queue(status, send_after);
CREATE INDEX IF NOT EXISTS idx_notifications_queue_user ON notifications_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_queue_patient ON notifications_queue(patient_id);

SELECT 'MIGRATION NOTIFICATIONS COMPLETE' as status;


