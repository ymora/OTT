-- ============================================================================
-- Migration: Ajouter colonne status aux patients
-- ============================================================================
-- Ajoute une colonne status aux patients (comme pour les devices)
-- ============================================================================

-- Ajouter la colonne status si elle n'existe pas déjà
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'patients'
        AND column_name = 'status'
    ) THEN
        ALTER TABLE patients 
        ADD COLUMN status TEXT CHECK (status IN ('active','inactive')) DEFAULT 'active';
        
        -- Mettre à jour les patients existants (par défaut actifs sauf ceux archivés)
        UPDATE patients SET status = 'active' WHERE deleted_at IS NULL;
        UPDATE patients SET status = 'inactive' WHERE deleted_at IS NOT NULL;
    END IF;
END $$;

-- Créer un index pour améliorer les performances des requêtes filtrées par status
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status) WHERE deleted_at IS NULL;

