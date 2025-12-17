# 🗄️ Guide : Créer une nouvelle base PostgreSQL sur Render

Ce guide vous explique comment créer une nouvelle base de données PostgreSQL sur Render et l'initialiser pour le projet OTT.

## 📋 Prérequis

- Compte Render.com (gratuit)
- PostgreSQL client installé (`psql`) pour l'initialisation locale (optionnel)

## 🚀 Étapes de création

### 1. Créer la base de données sur Render

1. **Connectez-vous à Render**
   - Allez sur https://dashboard.render.com
   - Connectez-vous avec votre compte

2. **Créer une nouvelle base PostgreSQL**
   - Cliquez sur **"New +"** (en haut à droite)
   - Sélectionnez **"PostgreSQL"**

3. **Configurer la base de données**
   - **Name** : `ott-database25` (nom du service sur Render)
   - **Database** : `ott_data` (nom de la base de données)
   - **User** : `ott_database25_user` (nom d'utilisateur)
   - **Region** : `Frankfurt` (ou votre région préférée)
   - **PostgreSQL Version** : `15` (recommandé)
   - **Plan** : `Free` (pour commencer, vous pouvez upgrader plus tard)

4. **Créer la base**
   - Cliquez sur **"Create Database"**
   - Attendez 1-2 minutes que la base soit créée

### 2. Récupérer les informations de connexion

Une fois la base créée, vous verrez :

- **Internal Database URL** : URL pour connexion depuis Render (format: `postgresql://user:pass@host:port/dbname`)
- **External Database URL** : URL pour connexion externe (si vous voulez vous connecter depuis votre machine)
- **Host** : Adresse du serveur (ex: `dpg-xxxxx-a.frankfurt-postgres.render.com`)
- **Port** : `5432` (par défaut)
- **Database** : `ott_data`
- **User** : `ott_database25_user`
- **Password** : Mot de passe généré automatiquement

**⚠️ Important** : Notez ces informations, vous en aurez besoin pour configurer l'API.

### 3. Initialiser le schéma

#### Option A : Via l'API Render (RECOMMANDÉ - pas besoin de psql/PHP)

Cette méthode utilise l'endpoint de migration de votre API Render :

```powershell
.\scripts\db\apply_schema_via_render_api.ps1 -ApiUrl "https://ott-jbln.onrender.com"
```

**Avec authentification (si vous avez un token JWT)** :
```powershell
.\scripts\db\apply_schema_via_render_api.ps1 -ApiUrl "https://ott-jbln.onrender.com" -Token "votre_token_jwt"
```

**Note** : L'endpoint nécessite soit :
- Un token JWT valide (rôle admin)
- OU la variable d'environnement `ALLOW_MIGRATION_ENDPOINT=true` configurée sur Render

#### Option B : Utiliser le script PowerShell avec psql

```powershell
# Avec l'URL externe (si vous avez psql installé)
.\scripts\db\setup_new_render_db.ps1 -DatabaseUrl "postgresql://ott_database25_user:password@dpg-xxxxx-a.frankfurt-postgres.render.com:5432/ott_database25"
```

**Note** : Si `psql` n'est pas installé, vous pouvez :
- Utiliser WSL : `wsl psql "postgresql://..."`
- Installer PostgreSQL client : `choco install postgresql`
- Utiliser un client graphique (pgAdmin)

#### Option C : Via PHP CLI (si installé)

```powershell
.\scripts\db\apply_schema_simple.ps1 -DatabaseUrl "postgresql://ott_database25_user:password@dpg-xxxxx-a.frankfurt-postgres.render.com:5432/ott_database25"
```

#### Option D : Utiliser pgAdmin ou un client PostgreSQL

1. Installez pgAdmin ou un autre client PostgreSQL
2. Connectez-vous avec l'URL externe
3. Exécutez le contenu de `sql/schema.sql`

### 4. Configurer les variables d'environnement sur Render

1. **Allez sur votre service API**
   - Sur https://dashboard.render.com
   - Sélectionnez votre service **"ott-api"**

2. **Mettre à jour DATABASE_URL**
   - Allez dans l'onglet **"Environment"**
   - Trouvez la variable `DATABASE_URL`
   - Remplacez-la par la nouvelle **Internal Database URL** de votre nouvelle base
   - Cliquez sur **"Save Changes"**

3. **Vérifier les autres variables**
   - Assurez-vous que `JWT_SECRET` est défini
   - Vérifiez les autres variables si nécessaire

### 5. Redémarrer le service API

1. **Redéployer le service**
   - Dans votre service API, cliquez sur **"Manual Deploy"**
   - Sélectionnez **"Deploy latest commit"**
   - Attendez que le déploiement se termine

2. **Vérifier que tout fonctionne**
   - Allez sur `https://ott-jbln.onrender.com/api.php/health`
   - Vous devriez voir : `{"success":true}`
   - Testez la connexion : `https://ott-jbln.onrender.com/api.php/auth/login`

## 🔍 Vérification

### Vérifier que le schéma est bien appliqué

```powershell
# Lister les tables
psql "postgresql://ott_database25_user:password@host:port/ott_data" -c "\dt"

# Vérifier les rôles
psql "postgresql://ott_database25_user:password@host:port/ott_data" -c "SELECT * FROM roles;"

# Vérifier les permissions
psql "postgresql://ott_database25_user:password@host:port/ott_data" -c "SELECT * FROM permissions;"
```

### Vérifier depuis l'API

1. **Health check**
   ```
   GET https://ott-jbln.onrender.com/api.php/health
   ```

2. **Test de connexion**
   ```
   GET https://ott-jbln.onrender.com/api.php/auth/me
   (nécessite authentification)
   ```

## ⚠️ Notes importantes

### Plan gratuit Render

- **Limite** : 90 jours d'inactivité, puis la base est mise en pause
- **Solution** : Utiliser régulièrement l'API pour éviter la mise en pause
- **Upgrade** : Si vous avez besoin d'une base toujours active, upgradez vers un plan payant

### Sécurité

- **Ne commitez JAMAIS** les mots de passe ou URLs de base de données
- Utilisez les **variables d'environnement** sur Render
- L'**Internal Database URL** est plus sécurisée (accessible uniquement depuis Render)

### Migration depuis l'ancienne base

Si vous aviez des données dans l'ancienne base :

1. **Sauvegarder les données** (si l'ancienne base est encore accessible)
   ```powershell
   .\scripts\db\backup_data.ps1 -DATABASE_URL "postgresql://ancienne-url"
   ```

2. **Restaurer dans la nouvelle base**
   ```powershell
   .\scripts\db\restore_data.ps1 -DATABASE_URL "postgresql://nouvelle-url" -BackupFile "backups/backup_xxx.json"
   ```

## 🆘 Dépannage

### Erreur : "connection refused"

- Vérifiez que vous utilisez l'**External Database URL** pour les connexions externes
- Vérifiez que votre IP n'est pas bloquée (Render peut bloquer certaines IPs)

### Erreur : "database does not exist"

- Vérifiez le nom de la base dans l'URL (doit être `ott_data`)
- Vérifiez que la base est bien créée sur Render

### Erreur : "password authentication failed"

- Vérifiez le mot de passe dans l'URL
- Le mot de passe peut contenir des caractères spéciaux, encodez-les correctement dans l'URL

### Erreur : "relation already exists"

- C'est normal si vous réexécutez le schéma
- Le schéma utilise `CREATE TABLE IF NOT EXISTS`, donc c'est sans danger

## 📚 Ressources

- [Documentation Render PostgreSQL](https://render.com/docs/databases)
- [Scripts de gestion DB](../scripts/db/README.md)
- [Schéma SQL](../sql/schema.sql)

---

**Créé par** : HAPPLYZ MEDICAL SAS  
**Date** : 2025-12-15

