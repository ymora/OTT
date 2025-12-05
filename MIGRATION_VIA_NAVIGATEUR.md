# 🚀 Migration via Navigateur (Sans Shell Render)

## ✅ Solution créée pour vous !

Comme vous n'avez pas accès au Shell sur Render (plan gratuit), j'ai créé **une page web simple** pour exécuter la migration directement depuis votre navigateur !

---

## 🎯 MÉTHODE SIMPLE (2 minutes)

### Étape 1 : Ouvrir la page de migration

**Option A - Depuis votre serveur Render :**

Allez sur : **https://ott-jbln.onrender.com/migrate.html**

**Option B - Depuis votre machine locale :**

1. Ouvrez le fichier : `public/migrate.html`
2. Dans le champ "URL de votre API", entrez : `https://ott-jbln.onrender.com`

### Étape 2 : Se connecter (si nécessaire)

Si vous n'êtes pas connecté, vous devrez peut-être vous authentifier d'abord :

1. Allez sur : **https://ott-jbln.onrender.com/api.php/auth/login**
2. Connectez-vous avec un compte **admin**
3. Revenez à la page de migration

### Étape 3 : Lancer la migration

1. Cliquez sur le bouton **"🚀 Exécuter la Migration Complète"**
2. ⏳ Attendez 10-30 secondes
3. ✅ Vous verrez le résultat (succès ou erreur)

---

## 🔧 Alternative : Via ligne de commande (curl)

Si vous préférez utiliser curl, ouvrez PowerShell et exécutez :

```powershell
# Récupérez votre token JWT depuis le navigateur (F12 > Application > LocalStorage > auth_token)
$token = "VOTRE_TOKEN_JWT_ICI"
$apiUrl = "https://ott-jbln.onrender.com"

Invoke-RestMethod -Uri "$apiUrl/api.php/admin/migrate-complete" `
    -Method POST `
    -Headers @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    } | ConvertTo-Json -Depth 10
```

**Ou sans authentification** (si vous avez activé `ALLOW_MIGRATION_ENDPOINT=true` sur Render) :

```powershell
$apiUrl = "https://ott-jbln.onrender.com"

Invoke-RestMethod -Uri "$apiUrl/api.php/admin/migrate-complete" `
    -Method POST `
    -Headers @{
        "Content-Type" = "application/json"
    } | ConvertTo-Json -Depth 10
```

---

## 🔑 Authentification

La migration nécessite un compte **admin**. 

Si vous n'avez pas de compte admin :
1. Connectez-vous à votre base de données (même via un service externe)
2. Ou activez temporairement `ALLOW_MIGRATION_ENDPOINT=true` dans les variables d'environnement Render

---

## ✅ Après la migration

1. Retournez sur : **https://ymora.github.io/OTT/**
2. Essayez de créer ou modifier un dispositif
3. ✅ L'erreur "Database error" devrait avoir disparu !

---

## 📋 Ce qui a été créé

- ✅ **Endpoint API** : `/api.php/admin/migrate-complete`
- ✅ **Page web** : `public/migrate.html`
- ✅ **Handler sécurisé** : Vérifie les permissions avant d'exécuter

---

## ⚠️ IMPORTANT

Une fois le problème résolu :
1. **Désactivez le mode DEBUG** dans `api.php` (supprimez `putenv('DEBUG_ERRORS=true');`)
2. **Supprimez ou sécurisez** la page `migrate.html` en production (ou ajoutez une protection supplémentaire)

---

## 🆘 Besoin d'aide ?

Si la migration échoue :
1. Ouvrez la console du navigateur (F12)
2. Regardez l'erreur affichée
3. Vérifiez que vous êtes connecté en tant qu'admin
4. Consultez les logs Render pour plus de détails

---

**Temps estimé** : 2 minutes ⚡  
**Difficulté** : ⭐ Très facile (un clic !)

🚀 **Allez sur https://ott-jbln.onrender.com/migrate.html pour commencer !**

