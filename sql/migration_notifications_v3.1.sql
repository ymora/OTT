-- ============================================================================
-- Migration Notifications V3.1
-- Ajout support notifications pour patients, médecins et utilisateurs
-- ============================================================================

-- 1. Ajouter champ phone dans users pour médecins/utilisateurs
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- 2. Créer table pour préférences notifications des patients
CREATE TABLE IF NOT EXISTS patient_notifications_preferences (
  patient_id INT PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
  email_enabled BOOLEAN DEFAULT TRUE,
  sms_enabled BOOLEAN DEFAULT FALSE,
  push_enabled BOOLEAN DEFAULT FALSE,
  notify_battery_low BOOLEAN DEFAULT TRUE,
  notify_device_offline BOOLEAN DEFAULT TRUE,
  notify_abnormal_flow BOOLEAN DEFAULT TRUE,
  notify_alert_critical BOOLEAN DEFAULT TRUE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_patient_notifications_preferences_updated 
  BEFORE UPDATE ON patient_notifications_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3. Modifier notifications_queue pour supporter patients
ALTER TABLE notifications_queue 
  ADD COLUMN IF NOT EXISTS patient_id INT REFERENCES patients(id) ON DELETE CASCADE,
  DROP CONSTRAINT IF EXISTS notifications_queue_user_id_not_null;
  
-- Rendre user_id nullable (peut être null si c'est une notification patient)
ALTER TABLE notifications_queue 
  ALTER COLUMN user_id DROP NOT NULL;

-- Ajouter contrainte : au moins user_id ou patient_id doit être défini
ALTER TABLE notifications_queue 
  ADD CONSTRAINT notifications_queue_recipient_check 
  CHECK (user_id IS NOT NULL OR patient_id IS NOT NULL);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_notifications_queue_patient ON notifications_queue(patient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_queue_user_patient ON notifications_queue(user_id, patient_id);

-- 4. Mettre à jour user_notifications_preferences pour utiliser phone de users
-- (on garde phone_number pour rétrocompatibilité mais on peut utiliser users.phone)

COMMENT ON TABLE patient_notifications_preferences IS 'Préférences de notifications pour les patients (email, SMS, push)';
COMMENT ON COLUMN users.phone IS 'Numéro de téléphone pour SMS (médecins, techniciens, etc.)';
COMMENT ON COLUMN notifications_queue.patient_id IS 'ID du patient destinataire (null si notification utilisateur)';

