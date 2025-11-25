-- ============================================================================
-- Migration: Stockage des firmwares dans la base de données (BYTEA)
-- ============================================================================
-- Alternative au Persistent Disk pour les fichiers .ino et .bin
-- Les fichiers sont stockés directement dans PostgreSQL
-- ============================================================================

-- Ajouter les colonnes pour stocker les fichiers en BYTEA
ALTER TABLE firmware_versions 
ADD COLUMN IF NOT EXISTS ino_content BYTEA,
ADD COLUMN IF NOT EXISTS bin_content BYTEA;

-- Créer un index pour améliorer les performances de recherche
CREATE INDEX IF NOT EXISTS idx_firmware_versions_version ON firmware_versions(version);
CREATE INDEX IF NOT EXISTS idx_firmware_versions_status ON firmware_versions(status);

-- Commentaires pour documentation
COMMENT ON COLUMN firmware_versions.ino_content IS 'Contenu du fichier .ino stocké en BYTEA (alternative au système de fichiers)';
COMMENT ON COLUMN firmware_versions.bin_content IS 'Contenu du fichier .bin compilé stocké en BYTEA (alternative au système de fichiers)';
COMMENT ON COLUMN firmware_versions.file_path IS 'Chemin historique (conservé pour compatibilité, peut être NULL si stocké en BYTEA)';

