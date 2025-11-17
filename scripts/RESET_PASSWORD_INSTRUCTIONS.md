# Instructions pour réinitialiser le mot de passe de ymora@free.fr

## Mot de passe à définir: `Ym120879`

## Méthode 1: Via script PHP (recommandé si PHP est disponible)

Sur le serveur Render, exécutez:

```bash
php scripts/reset_admin_password.php
```

Le script est déjà configuré avec:
- Email: `ymora@free.fr`
- Mot de passe: `Ym120879`

## Méthode 2: Via SQL direct (recommandé pour Render)

1. Connectez-vous au dashboard Render
2. Allez dans votre service PostgreSQL
3. Cliquez sur "Connect" ou "Shell"
4. Exécutez d'abord cette commande pour générer le hash:

```sql
-- Générer le hash bcrypt (nécessite l'extension pgcrypto)
-- OU utilisez PHP: php -r "echo password_hash('Ym120879', PASSWORD_BCRYPT);"
```

5. Puis exécutez la mise à jour:

```sql
UPDATE users 
SET password_hash = '<HASH_GÉNÉRÉ>'
WHERE email = 'ymora@free.fr';
```

## Méthode 3: Via API (si vous avez un autre compte admin)

Si vous avez accès à un autre compte administrateur:

```bash
curl -X PUT https://ott-jbln.onrender.com/api.php/users/{id} \
  -H "Authorization: Bearer {VOTRE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"password": "Ym120879"}'
```

## Vérification

Après la réinitialisation, testez la connexion avec:
- Email: `ymora@free.fr`
- Mot de passe: `Ym120879`
