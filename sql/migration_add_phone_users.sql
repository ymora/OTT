-- ============================================================================
-- MIGRATION : Ajouter colonne phone à la table users
-- ============================================================================
-- HAPPLYZ MEDICAL SAS
-- Ce script ajoute la colonne phone si elle n'existe pas
-- ============================================================================

BEGIN;

-- Vérifier et ajouter la colonne phone si elle n'existe pas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name = 'phone'
  ) THEN
    ALTER TABLE users ADD COLUMN phone VARCHAR(20);
    RAISE NOTICE 'Colonne phone ajoutée à la table users';
  ELSE
    RAISE NOTICE 'Colonne phone existe déjà dans la table users';
  END IF;
END $$;

COMMIT;

