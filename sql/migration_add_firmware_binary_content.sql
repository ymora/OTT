-- ============================================================================
-- Migration: Ajouter colonnes ino_content et bin_content aux firmware_versions
-- ============================================================================
-- Ajoute les colonnes pour stocker le contenu binaire des fichiers .ino et .bin
-- ============================================================================

-- Ajouter la colonne ino_content si elle n'existe pas déjà
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'firmware_versions'
        AND column_name = 'ino_content'
    ) THEN
        ALTER TABLE firmware_versions 
        ADD COLUMN ino_content BYTEA;
    END IF;
END $$;

-- Ajouter la colonne bin_content si elle n'existe pas déjà
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'firmware_versions'
        AND column_name = 'bin_content'
    ) THEN
        ALTER TABLE firmware_versions 
        ADD COLUMN bin_content BYTEA;
    END IF;
END $$;

