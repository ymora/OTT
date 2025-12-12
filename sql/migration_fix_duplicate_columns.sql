-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION - Correction des colonnes en double
-- ═══════════════════════════════════════════════════════════════════
-- HAPPLYZ MEDICAL SAS
-- 
-- Ce script corrige les colonnes en double dans la base de données
-- Exemple: birth_date vs date_of_birth dans patients
-- 
-- UTILISATION:
--   - BDD PostgreSQL existante
--   - Exécuter ce script UNE SEULE FOIS
--   - Vérifier les données avant exécution
-- 
-- Date: 2025-01-XX
-- ═══════════════════════════════════════════════════════════════════

-- 1. Corriger birth_date vs date_of_birth dans patients
--    Si birth_date existe et date_of_birth n'existe pas, copier les données puis supprimer birth_date
--    Si les deux existent, migrer birth_date vers date_of_birth puis supprimer birth_date

DO $$
BEGIN
    -- Vérifier si birth_date existe
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'patients' 
        AND column_name = 'birth_date'
    ) THEN
        -- Si date_of_birth n'existe pas, créer la colonne
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'patients' 
            AND column_name = 'date_of_birth'
        ) THEN
            ALTER TABLE patients ADD COLUMN date_of_birth DATE;
        END IF;
        
        -- Copier les données de birth_date vers date_of_birth (si date_of_birth est NULL)
        UPDATE patients 
        SET date_of_birth = birth_date 
        WHERE birth_date IS NOT NULL AND date_of_birth IS NULL;
        
        -- Supprimer la colonne birth_date
        ALTER TABLE patients DROP COLUMN IF EXISTS birth_date;
        
        RAISE NOTICE 'Colonne birth_date supprimée, données migrées vers date_of_birth';
    ELSE
        RAISE NOTICE 'Colonne birth_date n''existe pas, aucune action nécessaire';
    END IF;
END $$;

-- 2. Vérifier et corriger d'autres doublons potentiels
--    (Ajouter ici d'autres corrections si nécessaire)

SELECT 'MIGRATION CORRECTION DOUBLONS COMPLETE' as status;


