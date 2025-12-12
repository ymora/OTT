-- Migration pour nettoyer les noms de dispositifs
-- Enlève le nom du patient du device_name pour éviter la redondance
-- Format actuel: OTT-25-Jacques Bernard → Format souhaité: OTT-25
-- 
-- Ce script met à jour tous les device_name qui contiennent un nom de patient
-- en extrayant uniquement la partie OTT-XX

-- Mettre à jour les device_name qui contiennent un espace (indique la présence d'un nom)
-- Format détecté: OTT-XX-Nom Prenom ou OTT-XX Patient-XX
-- Utilise regexp_replace avec backreference pour extraire uniquement la partie OTT-XX
-- Syntaxe: regexp_replace(source, pattern, replacement) 
-- Le pattern capture OTT-XX au début, le replacement \1 garde seulement la capture
UPDATE devices 
SET device_name = regexp_replace(device_name, '^(OTT-[0-9]+).*', E'\\1'),
    updated_at = NOW()
WHERE device_name IS NOT NULL
  AND (
      device_name LIKE '% %' 
      OR device_name LIKE '%-Patient-%'
      OR device_name LIKE 'OTT-%-%'
  )
  AND device_name ~ '^OTT-[0-9]+';

