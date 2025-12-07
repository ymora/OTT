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

## Solution proposée

### 1. Ajouter le rafraîchissement automatique

- **`useAutoRefresh`** : Rafraîchir le tableau toutes les 10 secondes
- **`useDevicesUpdateListener`** : Écouter les événements `ott-devices-updated` (cross-tab)
- **Réduire le cache** : De 30 secondes à 5 secondes pour des données plus fraîches

### 2. S'assurer que les notifications sont déclenchées

- Vérifier que `notifyDevicesUpdated()` est appelé après chaque mesure réussie
- S'assurer que l'événement est déclenché même depuis `UsbContext.js`

### 3. Workflow final

```
[Local] Mesure USB envoyée
  → API met à jour BDD
  → sendMeasurement() appelle notifyDevicesUpdated()
  → Événement 'ott-devices-updated' déclenché
  → useDevicesUpdateListener() écoute l'événement
  → refetchDevices() appelé automatiquement
  → Tableau mis à jour ✅

[Web] Pas de mesure locale
  → useAutoRefresh() rafraîchit toutes les 10 secondes
  → refetchDevices() appelé automatiquement
  → Tableau mis à jour ✅
```

## Avantages

1. **Temps réel** : Le tableau se met à jour automatiquement toutes les 10 secondes
2. **Cross-tab** : Les mises à jour sont synchronisées entre les onglets
3. **Cross-instance** : Les mises à jour depuis un autre PC sont visibles via localStorage
4. **Performance** : Cache de 5 secondes pour éviter les requêtes inutiles
5. **Robustesse** : Double mécanisme (polling + événements) pour garantir la mise à jour

