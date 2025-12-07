# Workflow : Mise à jour du tableau des dispositifs

## Problème identifié

Les logs USB sont visibles dans la console web, mais le tableau des dispositifs ne se met pas à jour automatiquement avec les dernières données (`last_seen`, `last_battery`, `last_rssi`).

## Workflow actuel

### 1. Envoi de mesure USB (local)

```
[Dispositif USB] 
  → processUsbStreamLine() 
  → sendMeasurementToApi() 
  → sendMeasurementWithRetry() 
  → sendMeasurement() (callback dans UsbStreamingTab.js)
  → POST /api.php/devices/measurements
```

### 2. Mise à jour base de données (API)

```
handlePostMeasurement() dans api/handlers/devices/measurements.php
  → UPDATE devices SET last_seen = :timestamp, last_battery = :battery, last_rssi = :rssi
  → INSERT INTO measurements
```

### 3. Rafraîchissement tableau (frontend)

**En local (USB connecté)** :
- `sendMeasurement()` appelle `refetchDevices()` après 500ms ✅
- `sendMeasurement()` appelle `notifyDevicesUpdated()` ✅

**Sur la version web (pas de USB local)** :
- ❌ Pas de rafraîchissement automatique
- ❌ Le cache de 30 secondes est trop long
- ❌ Pas de polling automatique

## Solution optimisée (IMPLÉMENTÉE)

### 1. Hook unifié `useSmartDeviceRefresh`

**Fonctionnalités** :
- **Polling adaptatif** : 
  - 5 secondes si USB connecté (plus fréquent pour réactivité)
  - 15 secondes si web seulement (moins fréquent pour économiser les ressources)
- **Événements avec debounce** : 
  - Debounce de 2 secondes pour éviter les refetch multiples si plusieurs mesures arrivent rapidement
  - Coordination entre polling et événements pour éviter les refetch redondants
- **Cache optimisé** : 3 secondes (correspond au polling USB)

### 2. Notifications déclenchées

- `notifyDevicesUpdated()` appelé après chaque mesure réussie dans `sendMeasurement()`
- Événement `ott-devices-updated` déclenché depuis `UsbContext.js` après chaque mesure réussie
- Synchronisation cross-tab via localStorage

### 3. Workflow final optimisé

```
[Local] Mesure USB envoyée
  → API met à jour BDD (last_seen, last_battery, last_rssi)
  → sendMeasurementToApi() déclenche 'ott-devices-updated'
  → useSmartDeviceRefresh() écoute l'événement
  → Debounce de 2s (évite refetch multiples)
  → refetchDevices() appelé (si cache expiré)
  → Tableau mis à jour ✅

[Web] Pas de mesure locale
  → useSmartDeviceRefresh() polling toutes les 15 secondes
  → refetchDevices() appelé (si cache expiré)
  → Tableau mis à jour ✅

[Local avec USB] Mesure USB envoyée
  → Événement déclenché
  → Polling adaptatif à 5 secondes (plus réactif)
  → Tableau mis à jour rapidement ✅
```

## Avantages de la solution optimisée

1. **Performance** : 
   - Moins de requêtes inutiles grâce au debounce et à la coordination
   - Polling adaptatif selon le contexte (USB vs web)
   - Cache de 3 secondes pour éviter les requêtes trop fréquentes

2. **Réactivité** :
   - 5 secondes si USB connecté (temps réel)
   - 15 secondes si web seulement (acceptable pour monitoring)

3. **Robustesse** :
   - Debounce évite les refetch multiples
   - Coordination polling + événements évite les refetch redondants
   - Cross-tab et cross-instance synchronisés

4. **Optimisation** :
   - Une seule solution unifiée (remplace useAutoRefresh + useDevicesUpdateListener)
   - Moins de code, plus maintenable
   - Évite les conflits entre polling et événements

