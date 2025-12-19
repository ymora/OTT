-- ============================================================================
-- Script pour supprimer definitivement TOUS les scripts de migration
-- de la table migration_history
-- ============================================================================
-- ATTENTION: Cette action est irreversible !
-- ============================================================================

-- Verifier si la table existe
DO $$
BEGIN
    IF EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'migration_history'
    ) THEN
        -- Afficher tous les enregistrements qui seront supprimes
        PERFORM 1; -- Placeholder pour SELECT qui ne peut pas etre dans DO block
        
        -- Supprimer definitivement tous les enregistrements
        DELETE FROM migration_history;
        
        RAISE NOTICE 'Tous les enregistrements de migration_history ont ete supprimes';
    ELSE
        RAISE NOTICE 'La table migration_history n''existe pas - rien a supprimer';
    END IF;
END $$;

-- Verification finale (apres le DO block)
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'migration_history'
        ) THEN (SELECT COUNT(*) FROM migration_history)
        ELSE 0
    END as remaining_count,
    'Enregistrements restants dans migration_history' as message;
