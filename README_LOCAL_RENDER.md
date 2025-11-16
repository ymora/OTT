# 🏠 Utiliser la base de données Render en local

Ce guide explique comment configurer votre environnement local pour utiliser l'API PHP locale qui se connecte à la base de données PostgreSQL Render.

## 📋 Prérequis

1. **PHP 8.2+** avec extension `pgsql` installée
2. **Informations de connexion Render** (disponibles dans Render Dashboard)

## 🚀 Configuration rapide

### Étape 1 : Configurer l'API locale avec Render

Exécutez le script de configuration :

```powershell
.\scripts\setup_local_render_db.ps1
```

Le script vous demandera :
- `DB_HOST` : Host Render (ex: `dpg-xxxxx-a.frankfurt-postgres.render.com`)
- `DB_NAME` : Nom de la base (ex: `ott_data`)
- `DB_USER` : Utilisateur (ex: `ott_data_user`)
- `DB_PASS` : Mot de passe Render
- `DB_PORT` : Port (généralement `5432`)
- `JWT_SECRET` : Clé secrète pour JWT (laissez vide pour générer)

Le script créera :
- `.env.php` : Configuration pour l'API PHP
- `.env.local` : Configuration pour le frontend Next.js

### Étape 2 : Démarrer l'API PHP locale

Dans un terminal :

```powershell
.\scripts\start_api_local.ps1
```

Ou manuellement :

```powershell
php -S localhost:8080 -t . api.php
```

L'API sera accessible sur `http://localhost:8080`

### Étape 3 : Démarrer le frontend Next.js

Dans un autre terminal :

```powershell
npm run dev
```

Le frontend sera accessible sur `http://localhost:3000`

## 📁 Fichiers créés

### `.env.php` (API PHP)
```php
DB_TYPE=pgsql
DB_HOST=dpg-xxxxx-a.frankfurt-postgres.render.com
DB_PORT=5432
DB_NAME=ott_data
DB_USER=ott_data_user
DB_PASS=votre_mot_de_passe

JWT_SECRET=votre_secret_jwt
AUTH_DISABLED=false
CORS_ALLOWED_ORIGINS=http://localhost:3000
DEBUG_ERRORS=true
```

### `.env.local` (Frontend Next.js)
```
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_REQUIRE_AUTH=false
NEXT_PUBLIC_ENABLE_DEMO_RESET=false
```

## 🔍 Vérification

1. **Tester l'API** : Ouvrez `http://localhost:8080` dans votre navigateur
   - Vous devriez voir un JSON avec `"database": "connected"`

2. **Tester le frontend** : Ouvrez `http://localhost:3000`
   - Le dashboard devrait se charger sans authentification

## ⚠️ Notes importantes

- **Sécurité** : Le fichier `.env.php` contient des mots de passe. Ne le commitez **JAMAIS** dans Git (il est déjà dans `.gitignore`)
- **Performance** : La connexion à Render peut être plus lente qu'une base locale
- **Limites** : Respectez les limites de connexions de votre plan Render

## 🐛 Dépannage

### Erreur : "Database configuration missing"
- Vérifiez que `.env.php` existe et contient toutes les variables nécessaires
- Vérifiez que les informations de connexion Render sont correctes

### Erreur : "Connection refused"
- Vérifiez que votre IP est autorisée dans Render (Settings > Network)
- Vérifiez que le service PostgreSQL Render est actif

### Erreur : "Extension pgsql not found"
- Installez l'extension PostgreSQL pour PHP :
  ```powershell
  # Windows (avec XAMPP/WAMP)
  # Décommentez extension=pgsql dans php.ini
  
  # Linux
  sudo apt-get install php-pgsql
  ```

## 🔄 Alternative : Base de données locale

Si vous préférez utiliser une base PostgreSQL locale (Docker) :

1. Modifiez `.env.php` pour pointer vers `localhost:5432`
2. Utilisez `docker-compose up -d db` pour démarrer PostgreSQL
3. Exécutez les migrations : `.\scripts\db_migrate.sh --seed`

