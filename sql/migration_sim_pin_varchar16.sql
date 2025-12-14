-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Augmenter sim_pin de VARCHAR(8) à VARCHAR(16)
-- ═══════════════════════════════════════════════════════════════════
-- HAPPLYZ MEDICAL SAS
-- 
-- RAISON:
-- - Standard 3GPP: PIN SIM = 4-8 chiffres
-- - VARCHAR(16) permet une marge de sécurité
-- - La validation applicative reste à 4-8 chiffres (standard)
-- - Corrige l'erreur "value too long for type character varying(8)"
-- 
-- Date: 2025-12-13
-- ═══════════════════════════════════════════════════════════════════

-- Vérifier si la colonne existe et sa taille actuelle
DO $$
BEGIN
    -- Augmenter la limite de sim_pin de VARCHAR(8) à VARCHAR(16)
    -- Si la colonne n'existe pas encore, elle sera créée automatiquement par le code PHP
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'device_configurations' 
        AND column_name = 'sim_pin'
    ) THEN
        -- Modifier le type de la colonne existante
        ALTER TABLE device_configurations 
        ALTER COLUMN sim_pin TYPE VARCHAR(16);
        
        RAISE NOTICE 'Colonne sim_pin mise à jour: VARCHAR(8) -> VARCHAR(16)';
    ELSE
        -- Créer la colonne si elle n'existe pas
        ALTER TABLE device_configurations 
        ADD COLUMN sim_pin VARCHAR(16);
        
        RAISE NOTICE 'Colonne sim_pin créée: VARCHAR(16)';
    END IF;
END $$;

-- Ajouter/modifier le commentaire
COMMENT ON COLUMN device_configurations.sim_pin IS 
'Code PIN SIM (4-8 chiffres selon standard 3GPP). Stocké en VARCHAR(16) pour marge de sécurité, validé à 4-8 chiffres par l''application.';

-- Vérification finale
SELECT 
    'MIGRATION sim_pin VARCHAR(16) COMPLETE' as status,
    column_name,
    data_type,
    character_maximum_length
FROM information_schema.columns
WHERE table_name = 'device_configurations' 
AND column_name = 'sim_pin';
