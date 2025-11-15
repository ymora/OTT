-- ============================================================================
-- Création/activation d'un utilisateur de démonstration pour le dashboard OTT
-- ============================================================================
-- Usage :
--   psql $DATABASE_URL -f sql/create_demo_user.sql
--   (ou remplacez $DATABASE_URL par votre chaîne de connexion Postgres)
--
-- Ce script :
--   1. S'assure que l'extension pgcrypto est disponible (pour bcrypt via crypt()).
--   2. Crée ou met à jour l'utilisateur demo@example.com avec le mot de passe "Demo1234!".
--   3. Active le compte et lui attribue le rôle "viewer" (role_id = 4 par défaut).
--   4. Crée les préférences de notifications associées si elles n'existent pas.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

WITH upsert AS (
  INSERT INTO users (
    email,
    password_hash,
    first_name,
    last_name,
    role_id,
    is_active
  )
  VALUES (
    'demo@example.com',
    crypt('Demo1234!', gen_salt('bf', 10)),
    'Demo',
    'User',
    4,
    TRUE
  )
  ON CONFLICT (email) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        role_id = EXCLUDED.role_id,
        is_active = TRUE
  RETURNING id
)
INSERT INTO user_notifications_preferences (user_id, email_enabled, sms_enabled, push_enabled)
SELECT id, TRUE, FALSE, TRUE FROM upsert
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- Connexion :
--   Email    : demo@example.com
--   Password : Demo1234!
-- ============================================================================

