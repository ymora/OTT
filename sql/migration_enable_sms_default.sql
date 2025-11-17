-- ============================================================================
-- MIGRATION POUR ACTIVER SMS PAR DÉFAUT POUR TOUS LES UTILISATEURS
-- ============================================================================
-- À exécuter sur la base de données pour activer SMS par défaut
-- pour tous les utilisateurs existants
-- ============================================================================

-- Activer SMS pour tous les utilisateurs qui ont déjà des préférences
UPDATE user_notifications_preferences 
SET sms_enabled = TRUE 
WHERE sms_enabled = FALSE OR sms_enabled IS NULL;

-- Créer des préférences par défaut pour les utilisateurs qui n'en ont pas
-- (avec SMS activé par défaut)
INSERT INTO user_notifications_preferences (user_id, email_enabled, sms_enabled, push_enabled)
SELECT id, TRUE, TRUE, TRUE
FROM users
WHERE id NOT IN (SELECT user_id FROM user_notifications_preferences)
ON CONFLICT (user_id) DO NOTHING;

-- Vérification
SELECT 
    u.id,
    u.email,
    unp.sms_enabled,
    unp.email_enabled,
    unp.push_enabled
FROM users u
LEFT JOIN user_notifications_preferences unp ON u.id = unp.user_id
ORDER BY u.id;

