# Plan de Refactorisation - Firmware OTT

## 📊 État Actuel

- **Lignes de code** : ~3068 lignes
- **Complexité** : Élevée (multiples responsabilités, code dupliqué)
- **Problèmes identifiés** :
  - Connexion modem instable (CSQ=99, timeout réseau)
  - Enregistrement automatique bloqué
  - Logique wakeupCounter complexe
  - Code dupliqué entre mode USB et mode normal

## 🔍 Phase 1 : Audit Complet

### 1.1 Audit Base de Données

#### Tests de connexion
```bash
# Vérifier la connexion
psql $DATABASE_URL -c "SELECT version();"

# Vérifier le schéma
psql $DATABASE_URL -c "\d devices"
psql $DATABASE_URL -c "\d device_configurations"
psql $DATABASE_URL -c "\d measurements"
psql $DATABASE_URL -c "\d device_commands"
```

#### Vérification cohérence
- [ ] Vérifier que tous les dispositifs ont un ICCID valide
- [ ] Vérifier que les mesures ont des device_id valides
- [ ] Vérifier les contraintes de clés étrangères
- [ ] Vérifier les index et performances
- [ ] Vérifier les triggers (update_device_min_max)

#### Tests API
- [ ] GET /api.php/devices - Liste des dispositifs
- [ ] GET /api.php/devices/:id - Détails d'un dispositif
- [ ] POST /api.php/devices/measurements - Envoi de mesure
- [ ] GET /api.php/devices/:id/config - Configuration
- [ ] PUT /api.php/devices/:id/config - Mise à jour config

### 1.2 Audit Firmware

#### Analyse de complexité
- [ ] Compter les fonctions (objectif : < 30 fonctions principales)
- [ ] Identifier les fonctions dupliquées
- [ ] Identifier les responsabilités multiples
- [ ] Analyser les dépendances entre fonctions

#### Zones problématiques identifiées
1. **Gestion modem** (~500 lignes)
   - `startModem()` - Initialisation
   - `attachNetwork()` / `attachNetworkWithRetry()` - Attachement réseau
   - `connectData()` - Connexion GPRS
   - `waitForSimReady()` - Attente SIM
   - Logique de retry complexe avec backoff exponentiel

2. **Gestion sleep/wakeup** (~300 lignes)
   - `goToSleep()` - Deep sleep
   - Logique wakeupCounter avec RTC_DATA_ATTR
   - Mode USB vs Mode normal (code dupliqué)

3. **Gestion mesures** (~400 lignes)
   - `captureSensorSnapshot()` - Capture capteur
   - `sendMeasurement()` - Envoi API
   - `emitDebugMeasurement()` - Affichage USB
   - Format unifié vs format ancien (duplication)

4. **Gestion commandes** (~300 lignes)
   - `handleCommand()` - Traitement commandes USB
   - `fetchCommands()` - Récupération commandes OTA
   - `handleUpdateConfig()` - Mise à jour config
   - Logique UPDATE_CONFIG dupliquée

5. **Gestion GPS** (~200 lignes)
   - `getDeviceLocation()` - GPS complet
   - `getDeviceLocationFast()` - GPS rapide
   - Logique de timeout et retry

#### Code mort / inutilisé
- [ ] Rechercher les fonctions jamais appelées
- [ ] Rechercher les variables jamais utilisées
- [ ] Rechercher les #define jamais utilisés

### 1.3 Audit API

#### Endpoints critiques
- [ ] `/api.php/devices/measurements` - Réception mesures
- [ ] `/api.php/devices/:id/config` - Configuration
- [ ] `/api.php/devices/:iccid/commands` - Commandes OTA
- [ ] Gestion erreurs et validation

#### Problèmes identifiés
- [ ] Erreurs HTTP 500 sur certains endpoints
- [ ] Validation des données insuffisante
- [ ] Gestion des erreurs incohérente

### 1.4 Audit Frontend

#### Composants critiques
- [ ] `UsbContext.js` - Gestion USB (1809 lignes !)
- [ ] `DeviceModal.js` - Configuration dispositif
- [ ] `UsbStreamingTab.js` - Streaming USB
- [ ] Gestion états et performance

#### Problèmes identifiés
- [ ] Enregistrement automatique bloqué
- [ ] États complexes et redondants
- [ ] Performance (re-renders inutiles)

## 🔧 Phase 2 : Refactorisation Firmware

### 2.1 Structure Proposée

```
fw_ott_optimized.ino (~1500 lignes max)
├── Configuration & Définitions (~100 lignes)
├── Structures de données (~50 lignes)
├── Variables globales (~50 lignes)
├── Setup & Loop (~100 lignes)
│
├── Module Modem (~300 lignes)
│   ├── initModem()
│   ├── startModem()
│   ├── attachNetwork()
│   ├── connectData()
│   └── stopModem()
│
├── Module Capteur (~200 lignes)
│   ├── measureAirflowRaw()
│   ├── measureBattery()
│   └── captureSensorSnapshot()
│
├── Module Communication (~300 lignes)
│   ├── sendMeasurement()
│   ├── fetchCommands()
│   ├── sendLog()
│   └── httpPost()
│
├── Module GPS (~150 lignes)
│   ├── getDeviceLocation()
│   └── getDeviceLocationFast()
│
├── Module Commandes (~200 lignes)
│   ├── handleCommand()
│   ├── handleUpdateConfig()
│   └── handleUpdateCalibration()
│
└── Module Sleep (~100 lignes)
    ├── goToSleep()
    └── Gestion wakeupCounter
```

### 2.2 Simplifications Proposées

#### 1. Unifier la gestion modem
- **Actuel** : `attachNetwork()` appelle `attachNetworkWithRetry()` avec logique complexe
- **Proposé** : Une seule fonction `attachNetwork()` avec retry intégré simplifié
- **Gain** : -100 lignes

#### 2. Simplifier la gestion sleep
- **Actuel** : Logique wakeupCounter complexe avec RTC_DATA_ATTR, vérification au boot, etc.
- **Proposé** : Logique simple : incrémenter après chaque deep sleep, vérifier avant envoi
- **Gain** : -50 lignes

#### 3. Unifier les formats de mesure
- **Actuel** : Format unifié + format ancien (compatibilité)
- **Proposé** : Un seul format unifié, supprimer l'ancien
- **Gain** : -100 lignes

#### 4. Simplifier la gestion commandes
- **Actuel** : `handleCommand()` traite USB et OTA avec logique dupliquée
- **Proposé** : Séparer commandes USB (immédiat) et OTA (asynchrone)
- **Gain** : -80 lignes

#### 5. Réduire les logs verbeux
- **Actuel** : Logs très détaillés partout
- **Proposé** : Logs essentiels seulement, mode debug optionnel
- **Gain** : -200 lignes

#### 6. Simplifier mode USB vs Normal
- **Actuel** : Code largement dupliqué entre les deux modes
- **Proposé** : Fonctions communes, flags pour différencier
- **Gain** : -150 lignes

### 2.3 Objectifs de Refactorisation

- **Réduction** : 3068 → ~1500 lignes (-50%)
- **Fonctions** : < 30 fonctions principales
- **Complexité** : Réduire la complexité cyclomatique
- **Maintenabilité** : Code clair et documenté
- **Performance** : Pas de régression

## 🧪 Phase 3 : Tests

### 3.1 Tests Base de Données
- [ ] Test connexion
- [ ] Test insertion mesure
- [ ] Test récupération dispositif
- [ ] Test mise à jour config

### 3.2 Tests Firmware (Simulation)
- [ ] Test initialisation modem
- [ ] Test connexion réseau
- [ ] Test envoi mesure
- [ ] Test réception commande
- [ ] Test deep sleep / wakeup

### 3.3 Tests End-to-End
- [ ] Connexion USB → Détection → Enregistrement
- [ ] Configuration via USB → Application
- [ ] Envoi mesure OTA → Réception API → Stockage DB
- [ ] Commande OTA → Réception → Exécution

## 📋 Plan d'Exécution

### Semaine 1 : Audit
1. **Jour 1-2** : Audit base de données
   - Connexion et tests
   - Vérification cohérence
   - Tests API

2. **Jour 3-4** : Audit firmware
   - Analyse complexité
   - Identification doublons
   - Documentation problèmes

3. **Jour 5** : Audit frontend
   - Analyse composants
   - Identification problèmes
   - Tests manuels

### Semaine 2 : Refactorisation
1. **Jour 1-2** : Refactorisation module Modem
2. **Jour 3** : Refactorisation module Sleep
3. **Jour 4** : Refactorisation module Communication
4. **Jour 5** : Refactorisation module Commandes

### Semaine 3 : Tests & Validation
1. **Jour 1-2** : Tests unitaires
2. **Jour 3-4** : Tests intégration
3. **Jour 5** : Tests end-to-end et validation

## ✅ Critères de Succès

- [ ] Firmware < 2000 lignes
- [ ] Tous les tests passent
- [ ] Connexion modem stable
- [ ] Enregistrement automatique fonctionnel
- [ ] Pas de régression fonctionnelle
- [ ] Code documenté et maintenable

