# Réinitialisation du mot de passe admin

## Problème
Vous avez perdu l'accès admin avec l'email `ymora@free.fr` et le mot de passe `Ym120879`.

## Solutions

### Solution 1: Via Render Dashboard (Recommandé)

1. Connectez-vous à [Render Dashboard](https://dashboard.render.com/)
2. Allez dans votre service PostgreSQL
3. Cliquez sur "Connect" ou "Shell"
4. Exécutez cette commande SQL:

```sql
-- Générer le hash bcrypt (si PHP est disponible)
-- Sinon, utilisez le script PHP ci-dessous

UPDATE users 
SET password_hash = (
    SELECT password_hash 
    FROM (
        VALUES (
            '$2y$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
        )
    ) AS t(hash)
    WHERE EXISTS (
        SELECT 1 FROM users WHERE email = 'ymora@free.fr'
    )
)
WHERE email = 'ymora@free.fr';
```

**OU** utilisez le script SQL complet:

```bash
# Depuis votre machine locale (si vous avez psql)
psql $DATABASE_URL -f scripts/reset_admin_password.sql
```

### Solution 2: Via script PHP sur Render

1. Connectez-vous au shell de votre service API sur Render
2. Exécutez:

```bash
php scripts/reset_admin_password.php
```

### Solution 3: Générer le hash manuellement

Si vous avez accès à PHP (local ou sur Render):

```bash
php -r "echo password_hash('Ym120879', PASSWORD_BCRYPT);"
```

Puis utilisez le hash généré dans la requête SQL:

```sql
UPDATE users 
SET password_hash = '<HASH_GÉNÉRÉ>'
WHERE email = 'ymora@free.fr';
```

### Solution 4: Via l'API (si vous avez un autre compte admin)

1. Connectez-vous avec un autre compte admin
2. Utilisez l'endpoint `PUT /api.php/users/{id}` pour mettre à jour le mot de passe
3. Ou utilisez l'interface du dashboard pour modifier l'utilisateur

## Vérification

Après la réinitialisation, vérifiez que ça fonctionne:

```sql
SELECT 
    id, 
    email, 
    first_name, 
    last_name, 
    role_id,
    CASE 
        WHEN password_hash IS NOT NULL THEN '✅ OK'
        ELSE '❌ ERREUR'
    END as status
FROM users 
WHERE email = 'ymora@free.fr';
```

Puis essayez de vous connecter avec:
- **Email**: `ymora@free.fr`
- **Mot de passe**: `Ym120879`

