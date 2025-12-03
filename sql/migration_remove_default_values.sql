-- ============================================================================
-- Migration : Suppression des valeurs par défaut inutiles
-- ============================================================================
-- Les valeurs par défaut sont inutiles car les données viennent du firmware
-- et doivent refléter la réalité, pas des valeurs arbitraires
-- ============================================================================

-- Retirer la valeur par défaut de firmware_version dans devices
ALTER TABLE devices ALTER COLUMN firmware_version DROP DEFAULT;

-- Retirer la valeur par défaut de firmware_version dans device_configurations
ALTER TABLE device_configurations ALTER COLUMN firmware_version DROP DEFAULT;

-- Note: Les autres DEFAULT (status, timestamps, etc.) sont conservés car utiles
-- pour les valeurs qui ont un sens par défaut (ex: status='active', created_at=NOW())

