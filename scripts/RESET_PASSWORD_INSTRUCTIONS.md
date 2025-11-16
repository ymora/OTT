# 🔐 Instructions pour réinitialiser le mot de passe admin

## Informations
- **Email**: `ymora@free.fr`
- **Nouveau mot de passe**: `Ym120879`

## Méthode recommandée : Via Render Dashboard

### Étape 1: Générer le hash bcrypt

1. Connectez-vous à [Render Dashboard](https://dashboard.render.com/)
2. Allez dans votre service **API PHP** (pas PostgreSQL)
3. Cliquez sur **"Shell"** ou **"Connect"**
4. Exécutez cette commande pour générer le hash:

```bash
php -r "echo password_hash('Ym120879', PASSWORD_BCRYPT);"
```

**Copiez le hash généré** (il commence par `$2y$10$...`)

### Étape 2: Mettre à jour dans la base de données

1. Allez dans votre service **PostgreSQL** sur Render
2. Cliquez sur **"Connect"** ou **"Shell"**
3. Exécutez cette commande SQL (remplacez `<HASH>` par le hash copié à l'étape 1):

```sql
UPDATE users 
SET password_hash = '<HASH>'
WHERE email = 'ymora@free.fr';
```

**Exemple** (avec un hash fictif):
```sql
UPDATE users 
SET password_hash = '$2y$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
WHERE email = 'ymora@free.fr';
```

### Étape 3: Vérifier

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

### Étape 4: Tester la connexion

Allez sur le dashboard et connectez-vous avec:
- **Email**: `ymora@free.fr`
- **Mot de passe**: `Ym120879`

## Méthode alternative : Via script PHP

Si vous avez accès au shell de votre service API sur Render:

```bash
php scripts/reset_admin_password.php
```

Ce script génère automatiquement le hash et met à jour la base de données.

## Si l'utilisateur n'existe pas

Si l'utilisateur `ymora@free.fr` n'existe pas dans la base, créez-le:

```sql
INSERT INTO users (email, password_hash, first_name, last_name, role_id, is_active)
VALUES (
    'ymora@free.fr',
    '<HASH_GÉNÉRÉ>',  -- Remplacez par le hash de l'étape 1
    'Admin',
    'OTT',
    1,  -- role_id = 1 = admin
    TRUE
);
```

## Aide supplémentaire

Si vous avez des problèmes, vérifiez:
1. Que l'email est exactement `ymora@free.fr` (sans espaces)
2. Que le hash bcrypt est valide (commence par `$2y$10$`)
3. Que l'utilisateur a le `role_id = 1` (admin)

