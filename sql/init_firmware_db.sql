-- ============================================================================
-- Script d'initialisation de la base de données Firmwares
-- ============================================================================
-- À exécuter directement sur la base de données PostgreSQL
-- ============================================================================

-- 1. Ajouter la colonne status si elle n'existe pas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'firmware_versions' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE firmware_versions 
        ADD COLUMN status VARCHAR(50) DEFAULT 'compiled' 
        CHECK (status IN ('pending_compilation', 'compiling', 'compiled', 'error'));
        
        RAISE NOTICE 'Colonne status ajoutée';
    ELSE
        RAISE NOTICE 'Colonne status existe déjà';
    END IF;
END $$;

-- 2. Mettre à jour les firmwares existants sans status
UPDATE firmware_versions SET status = 'compiled' WHERE status IS NULL;

-- 3. Supprimer tous les firmwares fictifs
DELETE FROM firmware_versions;

-- 4. Vérification
SELECT 
    (SELECT COUNT(*) FROM firmware_versions) as firmwares_count,
    (SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'firmware_versions' 
        AND column_name = 'status'
    )) as status_column_exists;

