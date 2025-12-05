-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION COMPLÈTE AUTOMATIQUE - OTT Dashboard v1.0
-- ═══════════════════════════════════════════════════════════════════
-- HAPPLYZ MEDICAL SAS
-- 
-- Ce script consolide TOUTES les migrations nécessaires pour une
-- installation complète de la base de données OTT en production.
-- 
-- UTILISATION:
--   1. BDD PostgreSQL vide ou existante
--   2. Exécuter ce script UNE SEULE FOIS
--   3. Tout sera configuré automatiquement
-- 
-- SÉCURITÉ:
--   - Toutes les commandes utilisent IF NOT EXISTS
--   - Peut être exécuté plusieurs fois sans erreur
--   - Idempotent (même résultat si rejoué)
-- 
-- Date: 2025-12-04
-- Version: 1.0 Production
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- ÉTAPE 1: EXTENSIONS ET FONCTIONS
-- ═══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════
-- ÉTAPE 2: TABLES PRINCIPALES (depuis schema.sql)
-- ═══════════════════════════════════════════════════════════════════

-- Note: Les tables sont créées par schema.sql
-- Cette migration ajoute seulement les colonnes manquantes

-- ═══════════════════════════════════════════════════════════════════
-- ÉTAPE 3: COLONNES SOFT DELETE (deleted_at)
-- ═══════════════════════════════════════════════════════════════════

-- Ajout deleted_at pour traçabilité (soft delete)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE patients
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE devices
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════════════════
-- ÉTAPE 4: COLONNES SUPPLÉMENTAIRES USERS
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Europe/Paris';

-- ═══════════════════════════════════════════════════════════════════
-- ÉTAPE 5: COLONNES SUPPLÉMENTAIRES PATIENTS
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE patients
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS city VARCHAR(100),
ADD COLUMN IF NOT EXISTS postal_code VARCHAR(10),
ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(200),
ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS medical_notes TEXT,
ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Europe/Paris';

-- ═══════════════════════════════════════════════════════════════════
-- ÉTAPE 6: COLONNES SUPPLÉMENTAIRES DEVICES
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE devices
ADD COLUMN IF NOT EXISTS modem_imei VARCHAR(15),
ADD COLUMN IF NOT EXISTS last_ip VARCHAR(45),
ADD COLUMN IF NOT EXISTS warranty_expiry DATE,
ADD COLUMN IF NOT EXISTS purchase_date DATE,
ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS imei VARCHAR(15) UNIQUE,
ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Europe/Paris';

-- ═══════════════════════════════════════════════════════════════════
-- ÉTAPE 7: TABLE USB LOGS (nouveau)
-- ═══════════════════════════════════════════════════════════════════

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

COMMENT ON TABLE usb_logs IS 'Logs USB streaming pour monitoring à distance';

-- ═══════════════════════════════════════════════════════════════════
-- ÉTAPE 8: COLONNE GPS (nouveau)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE device_configurations 
ADD COLUMN IF NOT EXISTS gps_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN device_configurations.gps_enabled IS 
'Active/désactive le GPS pour ce dispositif. OFF par défaut car le GPS peut bloquer le modem et consommer de la batterie.';

-- Mettre à jour les dispositifs existants (tous à false par défaut)
UPDATE device_configurations 
SET gps_enabled = false 
WHERE gps_enabled IS NULL;

-- ═══════════════════════════════════════════════════════════════════
-- ÉTAPE 9: COLONNES LAST_* POUR DEVICES
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE devices
ADD COLUMN IF NOT EXISTS last_battery FLOAT,
ADD COLUMN IF NOT EXISTS last_flowrate FLOAT,
ADD COLUMN IF NOT EXISTS last_rssi INTEGER;

-- ═══════════════════════════════════════════════════════════════════
-- ÉTAPE 10: COLONNES MIN/MAX POUR DEVICE_CONFIGURATIONS
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE device_configurations
ADD COLUMN IF NOT EXISTS min_battery_pct INTEGER DEFAULT 20,
ADD COLUMN IF NOT EXISTS max_temp_celsius INTEGER DEFAULT 50;

-- ═══════════════════════════════════════════════════════════════════
-- ÉTAPE 11: FIRMWARE STATUS
-- ═══════════════════════════════════════════════════════════════════

-- Modifier le type de status pour inclure les nouveaux statuts
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'firmwares' AND column_name = 'status') THEN
        ALTER TABLE firmwares 
        DROP CONSTRAINT IF EXISTS firmwares_status_check;
        
        ALTER TABLE firmwares 
        ADD CONSTRAINT firmwares_status_check 
        CHECK (status IN ('pending', 'pending_compilation', 'compiling', 'compiled', 'error', 'active'));
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- ÉTAPE 12: NETTOYAGE - Suppression valeurs par défaut inutiles
-- ═══════════════════════════════════════════════════════════════════
-- NOTE: Cette étape a été désactivée car non essentielle et peut causer
-- des erreurs sur certaines configurations. Les valeurs par défaut ne sont
-- pas problématiques et peuvent être utiles.
-- 
-- Si vous souhaitez nettoyer les valeurs par défaut, vous pouvez le faire
-- manuellement après la migration principale.

-- ═══════════════════════════════════════════════════════════════════
-- ÉTAPE 13: INDEX PERFORMANCE
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_devices_deleted_at ON devices(deleted_at);
CREATE INDEX IF NOT EXISTS idx_patients_deleted_at ON patients(deleted_at);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);
CREATE INDEX IF NOT EXISTS idx_measurements_timestamp ON measurements(timestamp);

-- ═══════════════════════════════════════════════════════════════════
-- VÉRIFICATION FINALE
-- ═══════════════════════════════════════════════════════════════════

SELECT 
    'MIGRATION COMPLÈTE' as status,
    (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) as users_actifs,
    (SELECT COUNT(*) FROM patients WHERE deleted_at IS NULL) as patients_actifs,
    (SELECT COUNT(*) FROM devices WHERE deleted_at IS NULL) as devices_actifs,
    (SELECT COUNT(*) FROM device_configurations WHERE gps_enabled IS NOT NULL) as configs_gps_ready,
    (SELECT COUNT(*) FROM usb_logs) as usb_logs_count;

-- ═══════════════════════════════════════════════════════════════════
-- FIN DE LA MIGRATION AUTOMATIQUE
-- ═══════════════════════════════════════════════════════════════════
-- 
-- ✅ Si vous voyez ce message sans erreur, la migration est réussie !
-- ✅ Toutes les fonctionnalités sont maintenant disponibles :
--    - GPS activation/désactivation
--    - USB logs streaming
--    - Soft delete (archives)
--    - Traçabilité complète
--    - Optimisations performance
-- 
-- 🎉 Votre base de données est prête pour la production !
-- ═══════════════════════════════════════════════════════════════════

