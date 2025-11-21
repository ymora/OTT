-- Migration: Ajouter la colonne status à firmware_versions
-- Pour gérer les états: pending_compilation, compiled, error

ALTER TABLE firmware_versions 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'compiled' 
CHECK (status IN ('pending_compilation', 'compiling', 'compiled', 'error'));

-- Mettre à jour les firmwares existants
UPDATE firmware_versions SET status = 'compiled' WHERE status IS NULL;

