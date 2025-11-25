# 📋 Guide - Migration Firmware BYTEA

## 🎯 Objectif
Ajouter les colonnes `ino_content` et `bin_content` dans PostgreSQL pour stocker les firmwares directement en base de données (alternative au Persistent Disk).

## ✅ Méthode 1 : Via Script PowerShell (Recommandé)

### Étape 1 : Attendre le déploiement
Attendre 2-5 minutes que Render.com déploie les nouveaux fichiers.

Vérifier que l'API est accessible :
```
https://ott-jbln.onrender.com/api.php/health
```

### Étape 2 : Se connecter
1. Ouvrir https://ott-jbln.onrender.com
2. Se connecter avec vos identifiants (admin requis)

### Étape 3 : Récupérer le token JWT
1. Appuyer sur **F12** (ouvrir les outils développeur)
2. Aller dans l'onglet **Console**
3. Taper cette commande :
   ```javascript
   localStorage.getItem('ott_token')
   ```
4. **Copier le token** qui s'affiche (longue chaîne de caractères)

### Étape 4 : Exécuter le script
Dans PowerShell, exécuter :
```powershell
.\scripts\db\apply_firmware_blob_migration.ps1 -JWT_TOKEN 'VOTRE_TOKEN_ICI'
```

**Exemple :**
```powershell
.\scripts\db\apply_firmware_blob_migration.ps1 -JWT_TOKEN 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

### Résultat attendu
```
✅ Migration appliquée avec succès !

📊 Résultats:
   ✅ ALTER TABLE firmware_versions...
   ✅ CREATE INDEX IF NOT EXISTS...

📋 Colonnes créées:
   ✅ ino_content (bytea)
   ✅ bin_content (bytea)
```

---

## ✅ Méthode 2 : Via curl/Invoke-WebRequest (Alternative)

Si vous préférez utiliser curl directement :

```powershell
$token = "VOTRE_TOKEN_JWT"
$response = Invoke-WebRequest -Uri "https://ott-jbln.onrender.com/api.php/migrate/firmware-blob" `
    -Method POST `
    -Headers @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    } `
    -Body "{}" `
    -UseBasicParsing

$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

---

## ✅ Méthode 3 : Via Render Dashboard SQL Shell

1. Aller sur **Render Dashboard** → **PostgreSQL** → **SQL Shell**
2. Copier-coller le contenu de `sql/migration_firmware_blob.sql`
3. Exécuter

---

## 🔍 Vérification

Pour vérifier que la migration a réussi, exécuter cette requête SQL :

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'firmware_versions' 
AND column_name IN ('ino_content', 'bin_content')
ORDER BY column_name;
```

**Résultat attendu :**
```
 column_name  | data_type
--------------+-----------
 bin_content  | bytea
 ino_content  | bytea
```

---

## ❓ Problèmes courants

### Erreur : "Unauthorized"
- **Solution** : Vérifiez que vous êtes connecté et que le token JWT est valide
- **Solution** : Vérifiez que vous avez les droits **admin**

### Erreur : "Endpoint not found"
- **Solution** : Attendez que Render.com déploie les nouveaux fichiers (2-5 minutes)
- **Solution** : Vérifiez que l'URL est correcte : `https://ott-jbln.onrender.com/api.php/migrate/firmware-blob`

### Erreur : "already exists"
- **Solution** : C'est normal ! Les colonnes existent déjà, la migration a déjà été appliquée

---

## 📝 Après la migration

Une fois la migration appliquée :
- ✅ Les nouveaux uploads `.ino` seront automatiquement stockés dans PostgreSQL
- ✅ Les compilations `.bin` seront automatiquement stockées dans PostgreSQL
- ✅ Plus de perte de fichiers lors des redéploiements Render.com
- ✅ Compatibilité maintenue avec les firmwares existants (fallback sur fichiers)

---

## 🆘 Besoin d'aide ?

Si vous rencontrez des problèmes :
1. Vérifiez les logs Render.com : Dashboard → Service → Logs
2. Vérifiez que l'endpoint `/api.php/health` répond
3. Vérifiez que vous êtes bien connecté en tant qu'admin

