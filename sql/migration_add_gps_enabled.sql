-- Migration: Ajout du champ gps_enabled à device_configurations
-- Date: 2025-12-03
-- Description: Permet d'activer/désactiver le GPS par dispositif (OFF par défaut pour stabilité)

-- Ajouter le champ gps_enabled
ALTER TABLE device_configurations 
ADD COLUMN IF NOT EXISTS gps_enabled BOOLEAN DEFAULT false;

-- Commentaire sur la colonne
COMMENT ON COLUMN device_configurations.gps_enabled IS 
'Active/désactive le GPS pour ce dispositif. OFF par défaut car le GPS peut bloquer le modem et consommer de la batterie.';

-- Mettre à jour les dispositifs existants (tous à false par défaut)
UPDATE device_configurations SET gps_enabled = false WHERE gps_enabled IS NULL;

-- Afficher le résultat
SELECT COUNT(*) as total_devices, 
       SUM(CASE WHEN gps_enabled THEN 1 ELSE 0 END) as gps_enabled_count
FROM device_configurations;

