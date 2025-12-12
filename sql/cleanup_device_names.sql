-- Script de nettoyage des noms de dispositifs
-- Enlève le nom du patient du device_name pour éviter la redondance
-- Format actuel: OTT-25-Jacques Bernard → Format souhaité: OTT-25
-- 
-- Ce script met à jour tous les device_name qui contiennent un nom de patient
-- en extrayant uniquement la partie OTT-XX

BEGIN;

-- Mettre à jour les device_name qui contiennent un espace (indique la présence d'un nom)
-- Format détecté: OTT-XX-Nom Prenom ou OTT-XX Patient-XX
UPDATE devices 
SET device_name = 
    CASE 
        -- Pattern OTT-XX-Nom Prenom → OTT-XX
        WHEN device_name ~ '^OTT-[0-9]+-[A-Z]' THEN 
            SUBSTRING(device_name FROM '^OTT-[0-9]+')
        -- Pattern OTT-XX Patient-XX → OTT-XX
        WHEN device_name ~ '^OTT-[0-9]+-Patient' THEN 
            SUBSTRING(device_name FROM '^OTT-[0-9]+')
        -- Si le format ne correspond pas, ne rien changer
        ELSE device_name
    END,
    updated_at = NOW()
WHERE device_name IS NOT NULL
  AND (
      -- Contient un espace (nom de patient probable)
      device_name LIKE '% %' 
      OR 
      -- Contient "Patient-" (format fallback)
      device_name LIKE '%-Patient-%'
      OR
      -- Contient un pattern OTT-XX suivi d'autre chose
      device_name ~ '^OTT-[0-9]+-[^0-9]'
  )
  AND deleted_at IS NULL;

-- Log des modifications
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE '✅ % dispositifs mis à jour', updated_count;
END $$;

COMMIT;

COMMENT ON COLUMN devices.device_name IS 'Nom du dispositif (format: OTT-XX, sans nom de patient pour éviter la redondance avec la colonne patient)';

