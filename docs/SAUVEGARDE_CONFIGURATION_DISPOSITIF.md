# Sauvegarde Configuration Dispositif

## Problème Identifié

Lors de la réouverture du modal de configuration, les paramètres envoyés au dispositif n'apparaissaient pas car :

1. **Sauvegarde partielle en BDD** : Seulement certains paramètres étaient sauvegardés en base de données (`sleep_minutes`, `measurement_duration_ms`, `send_every_n_wakeups`, `calibration_coefficients`, `gps_enabled`)
2. **Paramètres non sauvegardés** : Les autres paramètres (APN, SIM PIN, airflow, modem, OTA) étaient envoyés au firmware mais **pas sauvegardés en BDD**
3. **Rechargement incomplet** : Le modal chargeait depuis la BDD, donc les paramètres non sauvegardés n'apparaissaient pas

## Solution Appliquée

### 1. Ajout des Colonnes Manquantes en BDD

Toutes les colonnes nécessaires ont été ajoutées à la table `device_configurations` :

```sql
-- Paramètres airflow
airflow_passes INTEGER
airflow_samples_per_pass INTEGER
airflow_delay_ms INTEGER

-- Paramètres modem
watchdog_seconds INTEGER
modem_boot_timeout_ms INTEGER
sim_ready_timeout_ms INTEGER
network_attach_timeout_ms INTEGER
modem_max_reboots INTEGER

-- Paramètres réseau
apn VARCHAR(64)
sim_pin VARCHAR(8)

-- Paramètres OTA
ota_primary_url TEXT
ota_fallback_url TEXT
ota_md5 VARCHAR(32)
```

### 2. Sauvegarde Complète en BDD

L'API `handleUpdateDeviceConfig` sauvegarde maintenant **TOUS** les paramètres en BDD :

- ✅ Paramètres de base (sleep, measurement, calibration, GPS)
- ✅ Paramètres airflow
- ✅ Paramètres modem
- ✅ Paramètres réseau (APN, SIM PIN)
- ✅ Paramètres OTA

### 3. Double Sauvegarde

Les paramètres sont maintenant sauvegardés **à deux endroits** :

1. **Base de données** : Pour rechargement dans le modal dashboard
2. **NVS (firmware)** : Pour persistance après reset matériel

## Réponses aux Questions

### 1. Les paramètres sont-ils sauvegardés en dur ou lus depuis le dispositif ?

**Réponse** : Les paramètres sont **lus depuis la base de données**, pas depuis le dispositif.

- Le modal charge depuis `/api.php/devices/{id}/config` qui lit la table `device_configurations`
- Les paramètres sont sauvegardés en BDD lors de la mise à jour via le modal
- Le firmware sauvegarde aussi en NVS (Non-Volatile Storage) pour persistance

### 2. Les paramètres sont-ils conservés après un reset par appui sur le bouton ?

**Réponse** : **OUI**, les paramètres sont conservés après reset matériel.

Le firmware utilise **NVS (Non-Volatile Storage)** qui est persistant :

```cpp
void saveConfig() {
  prefs.begin("ott-fw", false);
  prefs.putString("apn", NETWORK_APN);
  prefs.putString("sim_pin", SIM_PIN);
  prefs.putUInt("sleep_min", configuredSleepMinutes);
  // ... tous les autres paramètres
  prefs.end();
}
```

**Fonctionnement** :
- Lors de `UPDATE_CONFIG`, le firmware met à jour les variables en mémoire
- Puis appelle `saveConfig()` qui sauvegarde en NVS (ligne 2425 du firmware)
- Le NVS est persistant même après reset matériel (bouton)
- Au boot suivant, `loadConfig()` recharge depuis NVS (ligne 2535 du firmware)

### 3. Le firmware est-il prêt pour tous les paramètres que le dashboard peut envoyer ?

**Réponse** : **OUI**, le firmware gère tous les paramètres envoyés par le dashboard.

**Paramètres supportés par le firmware** (lignes 2303-2445) :

✅ **Réseau** :
- `apn` → `NETWORK_APN`
- `sim_pin` → `SIM_PIN`
- `iccid` → `DEVICE_ICCID`
- `serial` → `DEVICE_SERIAL`

✅ **Sommeil et mesure** :
- `sleep_minutes` / `sleep_minutes_default` → `configuredSleepMinutes`
- `measurement_duration_ms` → `airflowSampleDelayMs`
- `send_every_n_wakeups` → `sendEveryNWakeups`

✅ **Airflow** :
- `airflow_passes` → `airflowPasses`
- `airflow_samples_per_pass` → `airflowSamplesPerPass`
- `airflow_delay_ms` → `airflowSampleDelayMs`

✅ **Modem** :
- `watchdog_seconds` → `watchdogTimeoutSeconds`
- `modem_boot_timeout_ms` → `modemBootTimeoutMs`
- `sim_ready_timeout_ms` → `simReadyTimeoutMs`
- `network_attach_timeout_ms` → `networkAttachTimeoutMs`
- `modem_max_reboots` → `modemMaxReboots`

✅ **GPS** :
- `gps_enabled` → `gpsEnabled` (avec activation/désactivation immédiate si modem prêt)

✅ **OTA** :
- `ota_primary_url` → `otaPrimaryUrl`
- `ota_fallback_url` → `otaFallbackUrl`
- `ota_md5` → `otaExpectedMd5`

✅ **Calibration** :
- `calibration_coefficients` → `CAL_OVERRIDE_A0/A1/A2` (via commande séparée `UPDATE_CALIBRATION`)

## Flux Complet

### 1. Mise à jour depuis le Dashboard

```
Dashboard (DeviceModal)
  ↓
PUT /api.php/devices/{id}/config
  ↓
API sauvegarde TOUS les paramètres en BDD
  ↓
API crée commande UPDATE_CONFIG dans device_commands
  ↓
Firmware récupère la commande (polling ou push)
  ↓
Firmware traite UPDATE_CONFIG
  ↓
Firmware met à jour variables en mémoire
  ↓
Firmware appelle saveConfig() → sauvegarde en NVS
  ↓
Firmware redémarre (reboot automatique)
  ↓
Au boot suivant : loadConfig() recharge depuis NVS
```

### 2. Rechargement dans le Modal

```
Dashboard (DeviceModal) s'ouvre
  ↓
GET /api.php/devices/{id}/config
  ↓
API lit depuis device_configurations (BDD)
  ↓
Modal affiche TOUS les paramètres sauvegardés
```

## Vérification

Pour vérifier que tout fonctionne :

1. **Ouvrir le modal** → Tous les paramètres doivent s'afficher
2. **Modifier des paramètres** → Sauvegarder
3. **Fermer et rouvrir le modal** → Les paramètres modifiés doivent être présents
4. **Reset matériel du dispositif** → Les paramètres doivent être conservés (vérifier via logs USB)

## Notes Importantes

- ⚠️ **Double source de vérité** : Les paramètres sont dans la BDD (pour le dashboard) ET dans le NVS (pour le firmware)
- ⚠️ **Synchronisation** : Si le firmware est mis à jour directement (sans passer par le dashboard), la BDD ne sera pas à jour
- ✅ **Recommandation** : Toujours utiliser le dashboard pour modifier la configuration, jamais directement sur le firmware

