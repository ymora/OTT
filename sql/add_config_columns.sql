-- Migration pour ajouter les colonnes de configuration manquantes
-- Exécuter ce script directement en SQL pour ajouter les colonnes

ALTER TABLE device_configurations
ADD COLUMN IF NOT EXISTS airflow_passes INTEGER,
ADD COLUMN IF NOT EXISTS airflow_samples_per_pass INTEGER,
ADD COLUMN IF NOT EXISTS airflow_delay_ms INTEGER,
ADD COLUMN IF NOT EXISTS watchdog_seconds INTEGER,
ADD COLUMN IF NOT EXISTS modem_boot_timeout_ms INTEGER,
ADD COLUMN IF NOT EXISTS sim_ready_timeout_ms INTEGER,
ADD COLUMN IF NOT EXISTS network_attach_timeout_ms INTEGER,
ADD COLUMN IF NOT EXISTS modem_max_reboots INTEGER,
ADD COLUMN IF NOT EXISTS apn VARCHAR(64),
ADD COLUMN IF NOT EXISTS sim_pin VARCHAR(8),
ADD COLUMN IF NOT EXISTS ota_primary_url TEXT,
ADD COLUMN IF NOT EXISTS ota_fallback_url TEXT,
ADD COLUMN IF NOT EXISTS ota_md5 VARCHAR(32);

COMMENT ON COLUMN device_configurations.airflow_passes IS 'Nombre de passes pour la mesure airflow';
COMMENT ON COLUMN device_configurations.airflow_samples_per_pass IS 'Nombre d''échantillons par passe airflow';
COMMENT ON COLUMN device_configurations.airflow_delay_ms IS 'Délai entre échantillons airflow en millisecondes';
COMMENT ON COLUMN device_configurations.watchdog_seconds IS 'Timeout watchdog en secondes';
COMMENT ON COLUMN device_configurations.modem_boot_timeout_ms IS 'Timeout démarrage modem en millisecondes';
COMMENT ON COLUMN device_configurations.sim_ready_timeout_ms IS 'Timeout préparation SIM en millisecondes';
COMMENT ON COLUMN device_configurations.network_attach_timeout_ms IS 'Timeout attachement réseau en millisecondes';
COMMENT ON COLUMN device_configurations.modem_max_reboots IS 'Nombre maximum de redémarrages modem';
COMMENT ON COLUMN device_configurations.apn IS 'APN réseau (ex: free, orange, sfr)';
COMMENT ON COLUMN device_configurations.sim_pin IS 'Code PIN SIM (4-8 chiffres)';
COMMENT ON COLUMN device_configurations.ota_primary_url IS 'URL primaire pour mise à jour OTA';
COMMENT ON COLUMN device_configurations.ota_fallback_url IS 'URL de secours pour mise à jour OTA';
COMMENT ON COLUMN device_configurations.ota_md5 IS 'MD5 attendu pour la mise à jour OTA';

