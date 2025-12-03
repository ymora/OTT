# 🚀 Installation USB Logs sur Render.com

## Informations de connexion

- **Host** : `dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com`
- **Port** : `5432`
- **User** : `ott_data_user`
- **Database** : `ott_data`
- **Région** : Frankfurt (Allemagne)

---

## ✅ Méthode 1 : Script PowerShell automatique (Recommandé)

### Prérequis
- PostgreSQL Client installé (psql)
- Téléchargement : https://www.postgresql.org/download/windows/

### Commandes

```powershell
# Depuis la racine du projet
cd C:\Users\ymora\Desktop\maxime

# Exécuter le script d'installation
.\scripts\install_usb_logs_render.ps1
```

Le script va :
1. ✅ Se connecter à votre base Render
2. ✅ Exécuter la migration SQL
3. ✅ Vérifier que la table est créée
4. ✅ Afficher un message de confirmation

---

## ✅ Méthode 2 : Commande psql directe

Si vous préférez exécuter manuellement :

```powershell
# Définir le mot de passe (temporaire)
$env:PGPASSWORD = "lxNCXElZadbthGiOgT3cg2Y6JmMeMqUM"

# Exécuter la migration
psql `
  -h dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com `
  -p 5432 `
  -U ott_data_user `
  -d ott_data `
  -f sql/migration_add_usb_logs.sql

# Vérifier que ça a fonctionné
psql `
  -h dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com `
  -p 5432 `
  -U ott_data_user `
  -d ott_data `
  -c "SELECT COUNT(*) FROM usb_logs;"

# Nettoyer le mot de passe
Remove-Item Env:\PGPASSWORD
```

---

## ✅ Méthode 3 : Via l'API Web (Sans psql)

Si vous n'avez pas psql installé, utilisez l'API :

### Étape 1 : Se connecter en tant qu'admin

```powershell
# Ouvrir PowerShell et exécuter :
$loginResponse = Invoke-RestMethod `
  -Uri "http://localhost:3000/api.php/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"admin@test.com","password":"votre_mot_de_passe_admin"}'

# Stocker le token
$token = $loginResponse.token
Write-Host "Token: $token"
```

### Étape 2 : Exécuter la migration

```powershell
$migrateResponse = Invoke-RestMethod `
  -Uri "http://localhost:3000/api.php/migrate" `
  -Method POST `
  -ContentType "application/x-www-form-urlencoded" `
  -Headers @{ "Authorization" = "Bearer $token" } `
  -Body "file=migration_add_usb_logs.sql"

Write-Host $migrateResponse
```

Si vous voyez `"success": true`, c'est bon ! ✅

---

## ✅ Méthode 4 : Via l'interface Render.com

Si aucune méthode précédente ne fonctionne :

1. **Accéder au dashboard Render**
   - https://dashboard.render.com/
   - Se connecter

2. **Ouvrir votre base de données**
   - Cliquer sur "ott_data"
   - Onglet "Shell"

3. **Copier-coller le contenu de `sql/migration_add_usb_logs.sql`**
   - Ouvrir le fichier `sql/migration_add_usb_logs.sql`
   - Copier tout le contenu
   - Coller dans le Shell Render
   - Appuyer sur "Execute"

---

## 🔍 Vérification après installation

### Via psql

```powershell
$env:PGPASSWORD = "lxNCXElZadbthGiOgT3cg2Y6JmMeMqUM"

# Vérifier que la table existe
psql `
  -h dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com `
  -p 5432 `
  -U ott_data_user `
  -d ott_data `
  -c "\dt usb_logs"

# Voir la structure de la table
psql `
  -h dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com `
  -p 5432 `
  -U ott_data_user `
  -d ott_data `
  -c "\d usb_logs"

Remove-Item Env:\PGPASSWORD
```

### Via l'interface web

1. Ouvrir : http://localhost:3000/dashboard/admin/usb-logs
2. Se connecter en tant qu'admin
3. La page devrait s'afficher sans erreur

### Via l'API

```powershell
# Tester l'endpoint (avec votre token admin)
Invoke-RestMethod `
  -Uri "http://localhost:3000/api.php/usb-logs?limit=10" `
  -Headers @{ "Authorization" = "Bearer VOTRE_TOKEN" }
```

---

## 🎯 Test complet

### 1. Tester l'insertion de logs

```powershell
# Se connecter
$loginResponse = Invoke-RestMethod `
  -Uri "http://localhost:3000/api.php/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"admin@test.com","password":"votre_password"}'

$token = $loginResponse.token

# Insérer des logs de test
$testLogs = @{
    device_identifier = "TEST-RENDER-001"
    device_name = "USB-TEST-RENDER"
    logs = @(
        @{
            log_line = "Test log 1 - Installation réussie!"
            log_source = "dashboard"
            timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        },
        @{
            log_line = "Test log 2 - Connexion à Render OK"
            log_source = "device"
            timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        }
    )
} | ConvertTo-Json -Depth 3

$insertResponse = Invoke-RestMethod `
  -Uri "http://localhost:3000/api.php/usb-logs" `
  -Method POST `
  -ContentType "application/json" `
  -Headers @{ "Authorization" = "Bearer $token" } `
  -Body $testLogs

Write-Host "✅ Logs insérés: $($insertResponse.inserted_count)"
```

### 2. Vérifier l'affichage

```powershell
# Récupérer les logs
$getResponse = Invoke-RestMethod `
  -Uri "http://localhost:3000/api.php/usb-logs?limit=10" `
  -Headers @{ "Authorization" = "Bearer $token" }

Write-Host "📊 Total logs: $($getResponse.total)"
$getResponse.logs | Format-Table -AutoSize
```

### 3. Tester via l'interface web

1. Ouvrir : http://localhost:3000/dashboard/admin/usb-logs
2. Vous devriez voir les 2 logs de test
3. Tester les filtres
4. Activer l'auto-refresh

---

## 🐛 Troubleshooting

### Erreur "psql: command not found"

**Solution** : Installer PostgreSQL Client
- Windows : https://www.postgresql.org/download/windows/
- Ou utiliser la Méthode 3 (API) ou Méthode 4 (Render Shell)

### Erreur "connection refused"

**Causes possibles** :
1. Firewall bloque la connexion
2. IP non autorisée sur Render

**Solutions** :
- Vérifier les Access Control dans Render Dashboard
- Ajouter votre IP publique aux IPs autorisées
- Ou utiliser la Méthode 4 (Render Shell)

### Erreur "password authentication failed"

**Solution** : Vérifier le mot de passe dans le fichier `.env`
```powershell
# Vérifier la DATABASE_URL
Get-Content .env | Select-String "DATABASE_URL"
```

### Erreur "table already exists"

**C'est normal !** La table existe déjà, la migration est déjà exécutée.

**Vérification** :
```sql
SELECT COUNT(*) FROM usb_logs;
```

### L'interface web affiche "403 Forbidden"

**Cause** : Vous n'êtes pas connecté en tant qu'admin

**Solution** : Se connecter avec un compte admin

---

## 📝 Après l'installation

1. ✅ **Tester la connexion USB**
   - Connecter un dispositif USB
   - Démarrer le streaming
   - Attendre 5-10 secondes
   - Vérifier dans `/dashboard/admin/usb-logs` que les logs apparaissent

2. ✅ **Configurer le nettoyage automatique** (Optionnel)
   - Les logs sont automatiquement supprimés après 7 jours
   - Pour forcer le nettoyage : Bouton "🗑️ Nettoyer" dans l'interface

3. ✅ **Surveiller les performances**
   - Vérifier la taille de la table périodiquement
   - Avec 10 dispositifs : ~1.2 Go pour 7 jours

---

## 📞 Support

Si vous rencontrez des problèmes :

1. **Vérifier les logs serveur**
   - Render Dashboard → Logs
   
2. **Vérifier les logs navigateur**
   - F12 → Console → Chercher "USB" ou "logs"

3. **Tester manuellement**
   - Utiliser les commandes de test ci-dessus

---

**Base de données** : `ott_data` sur Render.com  
**Date d'installation** : Décembre 2024  
**Version** : 1.0.0

