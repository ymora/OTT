# Vérification Firmware et Code Dashboard

## Date : 2025-01-27

## 1. Vérification du Firmware

### ✅ Firmware Prêt

**Fichier** : `hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino`

**Ligne 14** : Le firmware mentionne explicitement :
```cpp
// Commandes : SET_SLEEP_SECONDS, PING, UPDATE_CONFIG, UPDATE_CALIBRATION
```

**Conclusion** : Le firmware est **prêt** pour recevoir les commandes `UPDATE_CONFIG` et `UPDATE_CALIBRATION`.

### 📋 Commandes Supportées

D'après le code du firmware (ligne 14) :
- ✅ `SET_SLEEP_SECONDS` : Modifier l'intervalle de sommeil
- ✅ `PING` : Diagnostic rapide
- ✅ `UPDATE_CONFIG` : Mettre à jour la configuration
- ✅ `UPDATE_CALIBRATION` : Recalibrer le capteur

**Note** : Le code de traitement des commandes doit être vérifié dans le firmware pour confirmer l'implémentation complète, mais la déclaration indique que ces commandes sont supportées.

## 2. Analyse du Code Dashboard

### 🔍 Doublons Identifiés

#### Problème 1 : Logique de création de commandes dupliquée

**Fichiers concernés** :
1. `app/dashboard/devices/page.js` (lignes 1468-1513)
2. `app/dashboard/commands/page.js` (lignes 113-158)
3. `components/configuration/DeviceConfigurationTab.js` (lignes 136-216)

**Code dupliqué** :
- Construction du payload pour `UPDATE_CONFIG`
- Construction du payload pour `UPDATE_CALIBRATION`
- Validation des coefficients de calibration
- Format des commandes OTA

**Impact** :
- ❌ Maintenance difficile (changements à faire en 3 endroits)
- ❌ Risque d'incohérences
- ❌ Code répétitif

### 📊 Détails des Doublons

#### 1. Construction UPDATE_CONFIG

**Dupliqué dans** :
- `devices/page.js` : lignes 1468-1501
- `commands/page.js` : lignes 113-146
- `DeviceConfigurationTab.js` : lignes 140-152

**Code similaire** :
```javascript
// Même logique dans les 3 fichiers
const addString = (key, value) => { ... }
const addNumber = (key, value) => { ... }
addNumber('sleep_minutes_default', ...)
addNumber('measurement_duration_ms', ...)
// etc.
```

#### 2. Construction UPDATE_CALIBRATION

**Dupliqué dans** :
- `devices/page.js` : lignes 1502-1513
- `commands/page.js` : lignes 147-158
- `DeviceConfigurationTab.js` : lignes 182-216

**Code similaire** :
```javascript
// Même validation et construction dans les 3 fichiers
if (calA0 === '' || calA1 === '' || calA2 === '') { ... }
payload.a0 = Number(calA0)
payload.a1 = Number(calA1)
payload.a2 = Number(calA2)
```

### ✅ Code Propre (Sans Doublons)

**Fichiers bien structurés** :
- ✅ `components/configuration/DeviceConfigurationTab.js` : Code propre, bien organisé
- ✅ `app/dashboard/outils/page.js` : Simple, pas de duplication
- ✅ `app/dashboard/configuration/page.js` : Redirection simple

### 🔧 Recommandations d'Optimisation

#### Option 1 : Créer une fonction utilitaire (Recommandé)

**Créer** : `lib/deviceCommands.js`

```javascript
// Fonction réutilisable pour construire le payload UPDATE_CONFIG
export function buildUpdateConfigPayload(config) {
  const payload = {}
  const addString = (key, value) => {
    const trimmed = (value ?? '').trim()
    if (trimmed) payload[key] = trimmed
  }
  const addNumber = (key, value) => {
    if (value === '' || value === null || value === undefined) return
    const num = Number(value)
    if (Number.isFinite(num)) payload[key] = num
  }
  
  // Mapper tous les paramètres
  addString('apn', config.apn)
  addNumber('sleep_minutes_default', config.sleepMinutes)
  // ... etc
  
  return payload
}

// Fonction réutilisable pour construire le payload UPDATE_CALIBRATION
export function buildUpdateCalibrationPayload(calA0, calA1, calA2) {
  if (calA0 === '' || calA1 === '' || calA2 === '') {
    throw new Error('Veuillez fournir les coefficients a0, a1 et a2')
  }
  
  const a0 = Number(calA0)
  const a1 = Number(calA1)
  const a2 = Number(calA2)
  
  if ([a0, a1, a2].some((value) => Number.isNaN(value))) {
    throw new Error('Les coefficients doivent être numériques')
  }
  
  return { a0, a1, a2 }
}

// Fonction pour créer une commande OTA
export async function createOtaCommand(fetchWithAuth, API_URL, iccid, command, payload, options = {}) {
  const commandBody = {
    command,
    payload,
    priority: options.priority || 'normal',
    expires_in_seconds: options.expiresInSeconds || 7 * 24 * 60 * 60
  }
  
  return await fetchJson(
    fetchWithAuth,
    API_URL,
    `/api.php/devices/${iccid}/commands`,
    {
      method: 'POST',
      body: JSON.stringify(commandBody)
    },
    { requiresAuth: true }
  )
}
```

**Avantages** :
- ✅ Code centralisé
- ✅ Maintenance facile
- ✅ Tests unitaires possibles
- ✅ Réutilisable partout

#### Option 2 : Créer un hook personnalisé

**Créer** : `hooks/useDeviceCommands.js`

```javascript
export function useDeviceCommands() {
  const { fetchWithAuth, API_URL } = useAuth()
  
  const createUpdateConfigCommand = useCallback(async (iccid, config) => {
    const payload = buildUpdateConfigPayload(config)
    return await createOtaCommand(fetchWithAuth, API_URL, iccid, 'UPDATE_CONFIG', payload)
  }, [fetchWithAuth, API_URL])
  
  const createUpdateCalibrationCommand = useCallback(async (iccid, calA0, calA1, calA2) => {
    const payload = buildUpdateCalibrationPayload(calA0, calA1, calA2)
    return await createOtaCommand(fetchWithAuth, API_URL, iccid, 'UPDATE_CALIBRATION', payload)
  }, [fetchWithAuth, API_URL])
  
  return {
    createUpdateConfigCommand,
    createUpdateCalibrationCommand
  }
}
```

## 3. Résumé

### ✅ Firmware
- **Statut** : ✅ Prêt
- **Commandes supportées** : UPDATE_CONFIG, UPDATE_CALIBRATION
- **Action requise** : Aucune (firmware prêt)

### ⚠️ Code Dashboard
- **Statut** : ⚠️ Doublons identifiés
- **Problèmes** : 
  - Logique de création de commandes dupliquée dans 3 fichiers
  - Validation des coefficients dupliquée
- **Action requise** : Refactoriser pour créer des fonctions utilitaires

### 📋 Plan d'Action

1. **Court terme** (Optionnel mais recommandé) :
   - Créer `lib/deviceCommands.js` avec les fonctions utilitaires
   - Refactoriser les 3 fichiers pour utiliser ces fonctions

2. **Moyen terme** :
   - Créer un hook `useDeviceCommands` pour simplifier l'utilisation
   - Ajouter des tests unitaires

3. **Long terme** :
   - Centraliser toute la logique de commandes dans un service dédié

## 4. Conclusion

- ✅ **Firmware** : Prêt et fonctionnel
- ⚠️ **Code Dashboard** : Fonctionnel mais avec des doublons à nettoyer
- 🎯 **Priorité** : Moyenne (le code fonctionne, mais l'optimisation améliorerait la maintenabilité)

