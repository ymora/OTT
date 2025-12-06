# 🧪 Guide de Test - Vérifier les Modules API

## 🎯 Objectif

Vérifier que l'API utilise bien les **nouveaux modules modulaires** avant de supprimer `api/handlers/devices.php`.

## 📋 Méthode 1 : Test via le Frontend (Port 3000)

### Étape 1 : Démarrer le frontend
```powershell
npm run dev
```
→ Le frontend sera sur `http://localhost:3000`

### Étape 2 : Ouvrir le Dashboard
1. Ouvrir `http://localhost:3000` dans votre navigateur
2. Se connecter (si nécessaire)
3. Tester les pages suivantes :

#### ✅ Page "Dispositifs"
- **URL** : `http://localhost:3000/dashboard/devices`
- **Test** : Les dispositifs doivent s'afficher normalement
- **API appelée** : `/api.php/devices` → **Module `crud.php`**

#### ✅ Page "Patients"
- **URL** : `http://localhost:3000/dashboard/patients`
- **Test** : Les patients doivent s'afficher
- **API appelée** : `/api.php/patients` → **Module `patients.php`**

#### ✅ Page "Alertes"
- **URL** : `http://localhost:3000/dashboard/alerts`
- **Test** : Les alertes doivent s'afficher
- **API appelée** : `/api.php/alerts` → **Module `alerts.php`**

#### ✅ Page "Commandes"
- **URL** : Vérifier via la console navigateur (F12) → Network
- **API appelée** : `/api.php/commands` → **Module `commands.php`**

---

## 📋 Méthode 2 : Test Direct via PowerShell

### Étape 1 : Trouver l'URL de l'API

**En développement local** :
- Si vous avez un serveur PHP local : `http://localhost` ou `http://localhost:8080`
- Si vous utilisez Render : `https://ott-jbln.onrender.com`

**Détection automatique** :
```powershell
# Vérifier la variable d'environnement
$env:NEXT_PUBLIC_API_URL
```

### Étape 2 : Lancer le script de test

```powershell
cd C:\Users\ymora\Desktop\maxime
.\audit\test-api-modules.ps1 -ApiPhpUrl "http://localhost"
```

**Si l'API est sur Render** :
```powershell
.\audit\test-api-modules.ps1 -ApiPhpUrl "https://ott-jbln.onrender.com"
```

---

## 📋 Méthode 3 : Vérifier les Logs PHP

### Vérifier que les modules sont bien chargés

1. **Ouvrir les logs PHP** (selon votre configuration) :
   - Logs Apache : `C:\xampp\apache\logs\error.log` (si XAMPP)
   - Logs PHP : Vérifier `php.ini` → `error_log`

2. **Tester une requête** :
   ```powershell
   Invoke-WebRequest -Uri "http://localhost/api.php/devices?limit=1" -Method GET
   ```

3. **Vérifier les logs** :
   - ❌ **Si vous voyez** : `Call to undefined function handleGetDevices()` → Les modules ne sont pas chargés
   - ✅ **Si vous voyez** : Aucune erreur → Les modules fonctionnent

---

## 📋 Méthode 4 : Test Manuel (Navigateur)

### Ouvrir la Console du Navigateur (F12)

1. Aller sur `http://localhost:3000/dashboard/devices`
2. Ouvrir l'onglet **Console** (F12)
3. Vérifier s'il y a des erreurs 500 ou 404

### Tester directement via la Console

```javascript
// Test 1 : Dispositifs
fetch('/api.php/devices?limit=5')
  .then(r => r.json())
  .then(data => console.log('✅ Devices:', data))

// Test 2 : Patients
fetch('/api.php/patients?limit=5')
  .then(r => r.json())
  .then(data => console.log('✅ Patients:', data))

// Test 3 : Alertes
fetch('/api.php/alerts?limit=5')
  .then(r => r.json())
  .then(data => console.log('✅ Alerts:', data))
```

---

## 🔍 Vérification Rapide : Fichiers Chargés

### Vérifier que `api.php` charge bien les modules

```powershell
# Vérifier le contenu de api.php
Select-String -Path "api.php" -Pattern "devices/crud.php|devices/patients.php"
```

**Résultat attendu** :
```
api.php:17:require_once __DIR__ . '/api/handlers/devices/crud.php';
api.php:18:require_once __DIR__ . '/api/handlers/devices/patients.php';
...
```

---

## ✅ Checklist de Validation

- [ ] ✅ Le frontend se charge sans erreur (port 3000)
- [ ] ✅ La page "Dispositifs" affiche les données
- [ ] ✅ La page "Patients" affiche les données
- [ ] ✅ La page "Alertes" affiche les données
- [ ] ✅ Aucune erreur dans la console navigateur (F12)
- [ ] ✅ Le script de test PowerShell passe tous les tests
- [ ] ✅ Les logs PHP ne montrent aucune erreur de fonction non trouvée

---

## 🎯 Après Validation

Si tous les tests passent :

1. **Renommer l'ancien fichier** (backup) :
   ```powershell
   Rename-Item "api/handlers/devices.php" "api/handlers/devices.php.old"
   ```

2. **Relancer les tests** pour confirmer que tout fonctionne toujours

3. **Si tout est OK** : Supprimer `devices.php.old` après quelques jours

---

## ⚠️ En Cas de Problème

Si une fonction n'est pas trouvée :

1. **Vérifier l'ordre de chargement dans `api.php`** :
   - `utils.php` doit être chargé en premier (dépendances)
   - Les autres modules peuvent être dans n'importe quel ordre

2. **Vérifier que le fichier existe** :
   ```powershell
   Test-Path "api/handlers/devices/crud.php"
   ```

3. **Vérifier les erreurs PHP** :
   - Activer `DEBUG_ERRORS=true` dans `.env`
   - Relancer la requête
   - Vérifier les logs

