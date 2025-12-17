# 🔧 Configurer ALLOW_MIGRATION_ENDPOINT sur Render

Ce guide vous explique comment configurer la variable d'environnement `ALLOW_MIGRATION_ENDPOINT=true` sur Render pour permettre l'exécution de migrations via l'API sans authentification.

## ⚠️ IMPORTANT

**Cette variable se configure sur le SERVICE API, pas sur la base de données !**

- ✅ **Service API** : Le service PHP qui exécute `api.php` (ex: `ott-api` ou `ott-jbln`)
- ❌ **Base de données** : Le service PostgreSQL (ex: `ott-database25`)

## 📋 Étapes

### 1. Accéder au dashboard Render

1. Allez sur https://dashboard.render.com
2. Connectez-vous avec votre compte

### 2. Sélectionner le SERVICE API (pas la base de données)

1. Dans le menu de gauche, cliquez sur **"Services"** (ou cherchez votre service API)
2. **Sélectionnez votre SERVICE API** (ex: `ott-api`, `ott-jbln`, ou le nom que vous avez donné à votre service PHP)
   - ⚠️ **Ce n'est PAS la base de données** (`ott-database25`)
   - ✅ C'est le **service qui exécute votre API PHP**

### 3. Accéder aux variables d'environnement

1. Dans votre service API, cliquez sur l'onglet **"Environment"** dans le menu de gauche
2. Vous verrez la liste de toutes les variables d'environnement actuellement configurées (ex: `DATABASE_URL`, `JWT_SECRET`, etc.)

### 4. Ajouter la variable

1. Cliquez sur **"Add Environment Variable"** (ou le bouton **"+"** si disponible)
2. Dans le champ **"Key"**, entrez : `ALLOW_MIGRATION_ENDPOINT`
3. Dans le champ **"Value"**, entrez : `true`
4. Cliquez sur **"Save Changes"** (ou **"Add"**)

### 5. Redéployer le service

⚠️ **Important** : Après avoir ajouté/modifié une variable d'environnement, Render redéploie automatiquement le service. Attendez que le déploiement soit terminé (1-2 minutes).

## 📝 BONUS : Mettre à jour DATABASE_URL

Pendant que vous êtes dans l'onglet "Environment" du service API, profitez-en pour mettre à jour `DATABASE_URL` :

1. **Trouvez la variable `DATABASE_URL`** dans la liste
2. **Cliquez sur "Edit"** (ou le crayon) à côté de cette variable
3. **Remplacez la valeur** par la nouvelle **Internal Database URL** de votre base de données
   - Cette URL se trouve dans la page de votre base de données (`ott-database25`)
   - Format : `postgresql://ott_database25_user:password@dpg-d51db3mmcj7s73eorra0-a.frankfurt-postgres.render.com:5432/ott_database25`
4. **Cliquez sur "Save Changes"**

## 🔍 Vérification

Une fois le service redéployé, vous pouvez tester l'endpoint de migration :

```powershell
.\scripts\db\apply_schema_via_render_api.ps1 -ApiUrl "https://ott-jbln.onrender.com"
```

Si tout fonctionne, vous devriez voir :
```
✅ Schéma appliqué avec succès via l'API !
```

## ⚠️ Sécurité

**Note importante** : Cette variable permet d'exécuter des migrations SQL sans authentification. C'est pratique pour l'initialisation, mais :

- ✅ **Sécurisé** : L'endpoint vérifie toujours que le fichier SQL est dans le répertoire `sql/` autorisé
- ✅ **Sécurisé** : Seuls les fichiers `schema.sql`, `base_seed.sql`, `demo_seed.sql` et `migration_*.sql` sont autorisés
- ⚠️ **Recommandation** : Une fois le schéma appliqué, vous pouvez retirer cette variable pour plus de sécurité

## 🔄 Alternative : Utiliser un token JWT

Si vous préférez ne pas activer `ALLOW_MIGRATION_ENDPOINT`, vous pouvez utiliser un token JWT :

1. Connectez-vous à l'API (via le frontend ou directement)
2. Récupérez le token depuis `localStorage` (utilisez `public/get-token.html`)
3. Utilisez le script avec le token :

```powershell
.\scripts\db\apply_schema_via_render_api.ps1 -ApiUrl "https://ott-jbln.onrender.com" -Token "votre_token_jwt"
```

## 📸 Navigation dans Render

```
Dashboard Render
│
├── Services ← Cliquez ici
│   └── ott-api (ou ott-jbln) ← Sélectionnez votre SERVICE API
│       └── [Environment] ← Cliquez sur cet onglet
│           └── Environment Variables
│               ├── DATABASE_URL: postgresql://...
│               ├── JWT_SECRET: xxx...
│               └── [+ Add Environment Variable] ← Cliquez ici
│                   └── Key: ALLOW_MIGRATION_ENDPOINT
│                   └── Value: true
│                   └── [Save Changes]
│
└── Databases
    └── ott-database25 ← Ce n'est PAS ici qu'on configure la variable !
```

## ❓ Comment distinguer le service API de la base de données ?

- **Service API** :
  - Type : "Web Service" ou "Background Worker"
  - Build Command : `composer install` ou similaire
  - Start Command : `php -S 0.0.0.0:$PORT` ou similaire
  - A des variables comme `DATABASE_URL`, `JWT_SECRET`

- **Base de données** :
  - Type : "PostgreSQL"
  - Affiche "Hostname", "Port", "Database", "Username", "Password"
  - A des sections "Connections", "Networking", "Storage"
