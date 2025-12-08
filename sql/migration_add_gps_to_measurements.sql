-- Migration pour ajouter les colonnes latitude et longitude à la table measurements
-- Cela permet de stocker les coordonnées GPS spécifiques à chaque mesure
-- et de tracer le déplacement du dispositif dans le temps.

ALTER TABLE measurements 
ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,8),
ADD COLUMN IF NOT EXISTS longitude NUMERIC(11,8);

-- Commentaires pour documentation
COMMENT ON COLUMN measurements.latitude IS 'Latitude GPS de la mesure (si disponible)';
COMMENT ON COLUMN measurements.longitude IS 'Longitude GPS de la mesure (si disponible)';

-- Index pour améliorer les requêtes de géolocalisation
CREATE INDEX IF NOT EXISTS idx_measurements_location ON measurements(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

