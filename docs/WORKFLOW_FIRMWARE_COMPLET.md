# Schéma du Workflow Complet du Firmware OTT

Date: 2025-01-XX  
Firmware Version: v1.0

## Vue d'Ensemble

Le firmware OTT fonctionne selon **2 modes principaux** détectés automatiquement :
1. **Mode USB Streaming** : USB connecté → Affichage continu des mesures
2. **Mode Hybride** : Pas d'USB → Détection de changement de flux d'air + Deep sleep

---

## 1. DÉMARRAGE (setup())

```
┌─────────────────────────────────────────────────────────────┐
│                    SETUP() - Initialisation                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ 1. initSerial()                       │
        │    - Serial.begin(115200)             │
        │    - Nettoyer buffer                  │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ 2. initBoard()                        │
        │    - POWERON_PIN = HIGH               │
        │    - PWRKEY toggle (démarrage modem)  │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ 3. loadConfig()                       │
        │    - Charger depuis NVS               │
        │    - APN, ICCID, Serial, PIN, etc.    │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ 4. checkBootFailureAndRollback()      │
        │    - Si bootFailureCount >= 3         │
        │    - Tentative rollback               │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ 5. validateBootAndMarkStable()        │
        │    - Valider boot réussi              │
        │    - Marquer firmware comme stable    │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ 6. configureWatchdog()                │
        │    - Armement watchdog (30s par défaut)│
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ 7. initModem()                        │
        │    - SerialAT.begin()                 │
        │    - Reset modem                      │
        │    - Test AT                          │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ 8. DÉTECTION USB                      │
        │    usbConnected = Serial.available... │
        └───────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
       USB CONNECTÉ ?              USB NON CONNECTÉ ?
              │                           │
              ▼                           ▼
    ┌─────────────────┐        ┌─────────────────────┐
    │ MODE USB        │        │ MODE HYBRIDE        │
    │                 │        │                     │
    │ - modemReady=   │        │ - startModem()      │
    │   false         │        │ - Envoi mesure      │
    │ - return (→loop)│        │   initiale (BOOT)   │
    │                 │        │ - fetchCommands()   │
    │                 │        │ - Deep sleep        │
    └─────────────────┘        └─────────────────────┘
              │                           │
              └─────────────┬─────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  LOOP()       │
                    └───────────────┘
```

---

## 2. LOOP() - Mode USB Streaming

```
┌─────────────────────────────────────────────────────────────┐
│                  LOOP() - Mode USB Streaming                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ feedWatchdog()                        │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ Détection USB dynamique (toutes 500ms)│
        │ - Si USB branché → usbModeActive=true │
        │ - Si USB débranché → usbModeActive=   │
        │   false → Mode hybride                │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ Initialisation modem (arrière-plan)   │
        │ - Première tentative: immédiatement   │
        │ - Puis toutes les 30s si échec        │
        │ - startModem() → modemReady=true      │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ PROCESSUS 1 : USB Debug               │
        │ - Toutes les 1 seconde                │
        │ - captureSensorSnapshot()             │
        │ - getDeviceLocationFast() (GPS)       │
        │ - emitDebugMeasurement()              │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ PROCESSUS 2 : OTA Périodique          │
        │ - Vérifier configuredSleepMinutes     │
        │ - Si délai écoulé ET modem prêt       │
        │   → sendMeasurement("TIMER")          │
        │   → fetchCommands()                   │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ Vérification commandes OTA            │
        │ - Toutes les 30 secondes              │
        │ - fetchCommands()                     │
        │ - handleCommand()                     │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ Commandes série (USB)                 │
        │ - config {...}                        │
        │ - calibration {...}                   │
        └───────────────────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │ delay(100)    │
                    │ return        │
                    └───────────────┘
```

---

## 3. LOOP() - Mode Hybride

```
┌─────────────────────────────────────────────────────────────┐
│                  LOOP() - Mode Hybride                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ feedWatchdog()                        │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ Détection USB dynamique               │
        │ - Si USB branché → basculer en        │
        │   mode USB                            │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ Lecture capteur                       │
        │ - measureAirflowRaw()                 │
        │ - airflowToLpm()                      │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ Calcul changement flux                │
        │ flowChange = |current - last|         │
        └───────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
    CHANGEMENT > 0.5 L/min ?     PAS DE CHANGEMENT ?
         ET intervalle OK ?               │
              │                           ▼
              ▼               ┌─────────────────────────┐
    ┌─────────────────┐      │ Vérifier idleTime      │
    │ DÉCLENCHEMENT   │      │ - Si > sleepMinutes →   │
    │ MESURE          │      │   Deep sleep            │
    │                 │      │ - Si > 30min →          │
    │ 1. Démarrage    │      │   Light sleep           │
    │    modem si     │      │ - Sinon → delay(1000)   │
    │    nécessaire   │      └─────────────────────────┘
    │ 2. Vérifier     │              │
    │    réseau       │              │
    │ 3. Capturer     │              │
    │    mesure       │              │
    │ 4. GPS          │              │
    │ 5. Envoyer      │              │
    │    ("EVENT")    │              │
    │ 6. fetchCommands│              │
    │ 7. Deep sleep   │              │
    │    (si succès)  │              │
    └─────────────────┘              │
              │                      │
              └──────────┬───────────┘
                         │
                         ▼
                 ┌───────────────┐
                 │ delay(1000)   │
                 └───────────────┘
```

---

## 4. WORKFLOW MODEM (startModem)

```
┌─────────────────────────────────────────────────────────────┐
│                    startModem()                             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ Test AT (avec retry)                  │
        │ - Attendre réponse modem              │
        │ - Si timeout → toggle PWRKEY          │
        │ - Max 3 reboots                       │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ waitForSimReady()                     │
        │ - Vérifier statut SIM                 │
        │ - Déverrouiller si SIM_PIN            │
        │ - Timeout 45s                         │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ Lire ICCID réel                       │
        │ - getSimCCID()                        │
        │ - Sauvegarder si par défaut           │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ Configuration APN                     │
        │ - +CGDCONT=1,"IP","<APN>"             │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ attachNetworkWithRetry()              │
        │ - Vérifier CSQ=99 → reset modem       │
        │ - 3 tentatives avec backoff           │
        │ - Si REG_DENIED → APN alternatif      │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ connectData()                         │
        │ - Essayer APN configuré                │
        │ - Essayer APN recommandé               │
        │ - Essayer "internet" (générique)       │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ Activation GPS (si gpsEnabled)        │
        │ - modem.enableGPS()                   │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ flushOfflineLogs()                    │
        │ - Envoyer logs tamponnés              │
        └───────────────────────────────────────┘
                            │
                            ▼
                    modemReady = true
```

---

## 5. ENVOI MESURE (sendMeasurement)

```
┌─────────────────────────────────────────────────────────────┐
│                 sendMeasurement()                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ Vérifier modem prêt                   │
        │ - modemReady == true                  │
        │ - isGprsConnected() == true           │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ Construire payload JSON               │
        │ - sim_iccid, device_serial            │
        │ - device_name (buildDeviceName())     │
        │ - flow_lpm, battery_percent, rssi     │
        │ - latitude, longitude (si valide)     │
        │ - calibration_coefficients            │
        │ - sleep_minutes, etc.                 │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ httpPost(PATH_MEASURE, body)          │
        │ - POST /api.php/measurements          │
        └───────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
         SUCCÈS ?                    ÉCHEC ?
              │                           │
              ▼                           ▼
    ┌─────────────────┐        ┌─────────────────┐
    │ - Log succès    │        │ - Log erreur    │
    │ - Retour true   │        │ - sendLog(ERROR)│
    │                 │        │ - Retour false  │
    └─────────────────┘        └─────────────────┘
```

---

## 6. COMMANDES OTA (handleCommand)

```
┌─────────────────────────────────────────────────────────────┐
│                  handleCommand()                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ Désérialiser payload                  │
        └───────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
         SET_SLEEP_SECONDS          UPDATE_CONFIG
              │                           │
              ▼                           ▼
    ┌─────────────────┐        ┌─────────────────────┐
    │ - Calculer      │        │ - Valider/Sanitize  │
    │   minutes       │        │ - Mettre à jour      │
    │ - Acknowledge   │        │   config            │
    │                 │        │ - saveConfig()       │
    │                 │        │ - Restart ESP32      │
    └─────────────────┘        └─────────────────────┘
              │                           │
              └─────────────┬─────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
         UPDATE_CALIBRATION         OTA_REQUEST
              │                           │
              ▼                           ▼
    ┌─────────────────┐        ┌─────────────────────┐
    │ - Valider a0,a1 │        │ - Sauvegarder état  │
    │ - updateCalib() │        │ - performOtaUpdate()│
    │ - saveConfig()  │        │ - Reboot si succès   │
    │ - Acknowledge   │        │ - Rollback si échec  │
    └─────────────────┘        └─────────────────────┘
```

---

## 7. GESTION GPS

```
┌─────────────────────────────────────────────────────────────┐
│                    GPS - Non Bloquant                       │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
      Mode USB (Fast)              Mode Hybride (Standard)
              │                           │
              ▼                           ▼
    ┌─────────────────┐        ┌─────────────────────┐
    │ getDeviceLocation│        │ getDeviceLocation() │
    │ Fast()           │        │                     │
    │                  │        │ 1. GPS (3s timeout) │
    │ - Timeout 500ms  │        │ 2. Si échec →       │
    │ - Cache 5s       │        │    Réseau cellulaire│
    │ - Non bloquant   │        │                     │
    └─────────────────┘        └─────────────────────┘
              │                           │
              └─────────────┬─────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ isValidGpsCoordinates()               │
        │ - lat: [-90, 90]                      │
        │ - lon: [-180, 180]                    │
        │ - Exclure (0, 0)                      │
        └───────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
          VALIDE ?                   INVALIDE ?
              │                           │
              ▼                           ▼
    ┌─────────────────┐        ┌─────────────────┐
    │ - Inclure GPS   │        │ - Ignorer GPS   │
    │   dans payload  │        │ - Log "non      │
    │                 │        │   bloquant"     │
    └─────────────────┘        └─────────────────┘
```

---

## 8. DEEP SLEEP / ÉCONOMIE D'ÉNERGIE

```
┌─────────────────────────────────────────────────────────────┐
│                  Gestion Sleep                              │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
      Mode USB                    Mode Hybride
              │                           │
              ▼                           ▼
    ┌─────────────────┐        ┌─────────────────────┐
    │ - Pas de sleep  │        │ - Après mesure      │
    │ - Toujours actif│        │   envoyée avec      │
    │   (alimenté USB)│        │   succès →          │
    │                 │        │   Deep sleep        │
    │                 │        │                     │
    │                 │        │ - Si inactif >      │
    │                 │        │   sleepMinutes →    │
    │                 │        │   Deep sleep        │
    │                 │        │                     │
    │                 │        │ - Si inactif > 30min│
    │                 │        │   (mais < sleepMin) │
    │                 │        │   → Light sleep     │
    └─────────────────┘        └─────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ stopModem()                           │
        │ - disableGPS()                        │
        │ - gprsDisconnect()                    │
        │ - modemReady = false                  │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ goToSleep(minutes)                    │
        │ - esp_sleep_enable_timer_wakeup()     │
        │ - esp_deep_sleep_start()              │
        │ - (ne retourne jamais)                │
        └───────────────────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  WAKE UP      │
                    │  → setup()    │
                    └───────────────┘
```

---

## Problèmes Identifiés et Corrigés

### ✅ PROBLÈME 1 : Variable `lastOtaCheck` non initialisée
- **Localisation** : Ligne 172 (déclaration) vs ligne 736 (utilisation en mode hybride)
- **Impact** : En mode hybride, `lastOtaCheck` peut avoir une valeur aléatoire
- **Solution** : ✅ **CORRIGÉ** - Commentaire ajouté indiquant que l'initialisation à 0 permet la première vérification immédiate

### ✅ PROBLÈME 2 : Logique de deep sleep en mode hybride
- **Localisation** : Ligne 753-764
- **Problème** : `lastDeepSleepTime` est static mais jamais initialisé, donc au premier boot il sera 0 et la condition `timeSinceLastSleep > 60000` sera vraie immédiatement
- **Impact** : Deep sleep peut être déclenché trop tôt après le premier boot
- **Solution** : ✅ **CORRIGÉ** - Ajout d'un flag `firstMeasurementAfterBoot` pour initialiser `lastDeepSleepTime` au premier boot, et mise à jour avant le sleep

### ⚠️ PROBLÈME 3 : Redondance vérification commandes OTA en mode USB
- **Localisation** : Lignes 590-599 et 606-622
- **Problème** : Les commandes OTA sont vérifiées deux fois : après envoi mesure ET périodiquement
- **Impact** : Légère surcharge, mais pas critique (assure la réactivité)
- **Solution** : ⚠️ **ACCEPTÉ** - La redondance est intentionnelle pour garantir la réactivité des commandes

### ✅ PROBLÈME 4 : Return manquant dans handleSerialCommand
- **Localisation** : Ligne 1229-1233
- **Problème** : Après la commande `calibration`, il n'y a pas de return, donc le code continue vers "Commande inconnue"
- **Impact** : Message d'erreur incorrect après calibration réussie
- **Solution** : ✅ **CORRIGÉ** - Ajout du return manquant après le traitement de la commande calibration

### ⚠️ PROBLÈME 5 : Vérification réseau redondante en mode hybride
- **Localisation** : Lignes 681-693
- **Problème** : Vérification `isNetworkConnected()` puis `isGprsConnected()` séparément, mais `isGprsConnected()` devrait déjà impliquer `isNetworkConnected()`
- **Impact** : Logique redondante mais correcte (défensive programming)
- **Solution** : ⚠️ **ACCEPTÉ** - La redondance est intentionnelle pour robustesse

### ⚠️ PROBLÈME 6 : Modem init en mode USB peut bloquer
- **Localisation** : Ligne 448
- **Problème** : `startModem()` peut prendre plusieurs secondes et bloquer le processus USB
- **Impact** : Délais dans l'affichage USB pendant l'initialisation
- **Solution** : ⚠️ **ACCEPTÉ** - Nécessaire pour permettre l'envoi OTA, le processus USB reprend après

---

## Optimisations Possibles

1. **Réduction consommation** : Réduire la fréquence de vérification USB en mode hybride
2. **Cache GPS** : Améliorer le cache GPS pour éviter appels répétés
3. **Batch logs** : Envoyer plusieurs logs en une seule requête HTTP
4. **Réduction mémoire** : Réutiliser les buffers JSON au lieu de créer de nouveaux objets

