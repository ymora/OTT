# 🏗️ Architecture du Projet OTT

## 📁 Structure des Répertoires

```
OTT/
├── app/                          # Next.js App Router
│   ├── dashboard/                # Pages du dashboard
│   │   ├── admin/               # Administration
│   │   ├── alerts/              # Alertes
│   │   ├── audit/               # Audit logs
│   │   ├── commands/            # Commandes dispositifs
│   │   ├── configuration/       # Configuration
│   │   ├── devices/             # Gestion dispositifs
│   │   ├── diagnostics/         # Diagnostics système
│   │   ├── documentation/       # Documentation intégrée
│   │   ├── firmware-upload/     # Upload firmware (legacy)
│   │   ├── logs/                # Logs système
│   │   ├── map/                 # Carte interactive
│   │   ├── notifications/       # Notifications
│   │   ├── ota/                 # OTA firmware
│   │   ├── outils/              # Outils (firmware, flash, USB)
│   │   ├── patients/            # Gestion patients
│   │   └── users/               # Gestion utilisateurs
│   ├── layout.js                # Layout principal
│   ├── page.js                  # Page d'accueil
│   └── globals.css              # Styles globaux
│
├── components/                   # Composants React réutilisables
│   ├── configuration/          # Composants configuration
│   │   ├── DeviceConfigurationTab.js
│   │   ├── FirmwareFlashTab.js
│   │   ├── InoEditorTab.js      # Upload + Compilation firmware
│   │   └── UsbStreamingTab.js
│   ├── AlertCard.js
│   ├── Chart.js
│   ├── ErrorBoundary.js
│   ├── LoadingSpinner.js
│   ├── Modal.js
│   └── ...
│
├── contexts/                     # Contextes React
│   ├── AuthContext.js           # Authentification JWT
│   └── UsbContext.js            # Gestion USB
│
├── hooks/                        # Hooks React personnalisés
│   ├── useApiData.js
│   ├── useDebounce.js
│   ├── useFilter.js
│   └── useUsbAutoDetection.js
│
├── lib/                          # Utilitaires
│   ├── api.js                   # Client API
│   ├── config.js                # Configuration
│   ├── logger.js                # Logger
│   └── utils.js                 # Utilitaires généraux
│
├── public/                       # Assets statiques
│   ├── sw.js                    # Service Worker
│   ├── manifest.json            # PWA manifest
│   └── screenshots/             # Captures d'écran
│
├── scripts/                     # Scripts utilitaires
│   ├── dev/                     # Développement
│   ├── deploy/                  # Déploiement
│   ├── test/                    # Tests
│   ├── db/                      # Base de données
│   └── hardware/                # Firmware & Arduino
│
├── sql/                          # Scripts SQL
│   ├── schema.sql               # Schéma complet
│   ├── base_seed.sql            # Données de base
│   └── demo_seed.sql            # Données de démo
│
├── hardware/                     # Firmware & Hardware
│   ├── firmware/                # Firmwares compilés
│   │   └── vX.X/                # Par version
│   ├── lib/                     # Bibliothèques Arduino
│   └── cad/                     # Plans CAO
│
├── docs/                         # Documentation
│   ├── ARCHITECTURE.md          # Ce fichier
│   ├── DEPLOIEMENT.md
│   └── ...
│
├── api.php                       # Point d'entrée API (routing, CORS)
├── api/                          # Modules API refactorisés
│   ├── helpers.php              # Fonctions utilitaires partagées
│   └── handlers/                # Handlers par domaine
│       ├── auth.php             # Authentification, utilisateurs
│       ├── devices.php          # Dispositifs, mesures, commandes
│       ├── firmwares.php        # Firmwares, compilation, OTA
│       └── notifications.php   # Notifications, préférences
├── router.php                    # Routeur API (serveur PHP intégré)
├── index.php                     # Point d'entrée API (health check)
└── README.md                     # Documentation principale
```

## 🔄 Flux de Données

### Mode Normal (Production)

Le firmware fonctionne en cycle automatique :

```
Boot → Init Modem → Démarrage Modem
  ↓
Capture Mesures {
  - Débit d'air
  - Niveau batterie
  - RSSI (qualité signal)
}
  ↓
Géolocalisation {
  - GPS (priorité)
  - Réseau cellulaire (fallback)
}
  ↓
Envoi API {
  - POST /api.php/devices/measurements
  - JSON avec toutes les données
}
  ↓
Récupération Commandes {
  - GET /api.php/devices/commands
  - Traitement des commandes
}
  ↓
Arrêt Modem → Deep Sleep (24h par défaut)
  ↓
Réveil → Répète le cycle
```

**Caractéristiques** :
- ✅ Modem démarré automatiquement
- ✅ Mesures automatiques à chaque réveil
- ✅ Envoi automatique à l'API
- ✅ Deep sleep entre les cycles (économie d'énergie)
- ✅ 1 envoi par jour par défaut (limite les coûts réseau)

### Mode USB (Tests/Diagnostics)

Le firmware attend uniquement les commandes :

```
Boot → Détection USB (3.5s) → Mode USB activé
  ↓
usbStreamingLoop() {
  while (true) {
    - feedWatchdog()
    - Vérifier connexion USB (toutes les 5s)
    - Lire commandes Serial
    - Traiter commandes
    - Envoyer mesures SEULEMENT si streamingActive = true ET commande reçue
  }
}
```

**Caractéristiques** :
- ❌ Modem non démarré automatiquement (sur demande uniquement)
- ❌ Aucune mesure automatique (sur commande uniquement)
- ❌ Pas de connexion réseau (pas de coûts)
- ❌ Pas de deep sleep (boucle active)
- ✅ Mode interactif complet (toutes les commandes disponibles)

📖 **Documentation complète** : Voir [Mode USB vs Mode Normal](./MODE_USB_VS_MODE_NORMAL.md)

### 1. Firmware → API
```
ESP32 + SIM7600
  ↓ (HTTPS POST)
/api.php/devices/measurements
  ↓ (PDO)
PostgreSQL (Render)
```

### 2. Dashboard → API
```
Next.js Dashboard
  ↓ (fetch + JWT)
/api.php/*
  ↓ (PDO)
PostgreSQL (Render)
```

### 3. Compilation Firmware
```
Dashboard (InoEditorTab)
  ↓ (EventSource SSE avec keep-alive)
/api.php/firmwares/compile/{id}
  ↓ (arduino-cli + core ESP32)
hardware/firmware/vX.X/*.bin
  ↓ (stockage DB BYTEA)
PostgreSQL (firmware_versions.bin_content)
```

**Fonctionnalités SSE :**
- Keep-alive toutes les 2 secondes pendant l'installation du core
- Heartbeat conditionnel (uniquement pendant l'installation, pas pendant le téléchargement)
- Gestion robuste des interruptions : le processus PHP continue même si la connexion SSE se ferme
- Vérification automatique du statut du firmware côté client après interruption

## 🗄️ Base de Données

### Tables Principales
- `devices` - Dispositifs OTT
- `measurements` - Mesures de débit
- `patients` - Patients
- `users` - Utilisateurs
- `firmware_versions` - Versions firmware
- `alerts` - Alertes
- `audit_logs` - Audit

### Relations
- `devices.patient_id` → `patients.id`
- `measurements.device_id` → `devices.id`
- `alerts.device_id` → `devices.id`

## 🔐 Sécurité

### Authentification
- JWT tokens (backend)
- LocalStorage (frontend)
- Refresh automatique

### Permissions
- `admin` - Accès complet
- `technicien` - Maintenance
- `medecin` - Consultation
- `viewer` - Lecture seule

## 🚀 Déploiement

### Frontend
- **Build** : `npm run export`
- **Hébergement** : GitHub Pages
- **CI/CD** : GitHub Actions

### Backend
- **Build** : Docker
- **Hébergement** : Render
- **Base** : Render PostgreSQL

## 📦 Dépendances Principales

### Frontend
- Next.js 14
- React 18
- Tailwind CSS 3
- Chart.js
- Leaflet

### Backend
- PHP 8+
- PostgreSQL
- arduino-cli (compilation)

## 🔧 Architecture Modulaire de l'API PHP

### Structure Refactorisée (v3.3)

L'API PHP a été refactorisée d'un fichier monolithique (~7000 lignes) en une architecture modulaire :

```
api.php                    # Point d'entrée (~200 lignes)
├── Routing des endpoints
├── Gestion CORS
├── Gestion des erreurs
└── Inclusion des handlers

api/helpers.php           # Fonctions utilitaires (~500 lignes)
├── JWT (generateToken, validateToken, refreshToken)
├── Database (getDbConnection, executeQuery)
├── Audit (logAudit, getAuditLogs)
├── Géolocalisation (getLocationFromIp, getClientIp)
├── Firmware (getFirmwarePath, validateFirmwareVersion)
└── Notifications (queueNotification, sendNotification)

api/handlers/             # Handlers par domaine (~1000-2000 lignes chacun)
├── auth.php              # Authentification & Utilisateurs
│   ├── handleLogin
│   ├── handleGetMe
│   ├── handleRefreshToken
│   ├── handleGetUsers / handleCreateUser / handleUpdateUser / handleDeleteUser
│   └── handleGetRoles / handleGetPermissions
├── devices.php           # Dispositifs & Mesures
│   ├── handleGetDevices / handleCreateDevice / handleUpdateDevice / handleDeleteDevice
│   ├── handlePostMeasurement
│   ├── handleGetPendingCommands / handleCreateDeviceCommand
│   ├── handleGetDeviceCommands / handleListAllCommands / handleAcknowledgeCommand
│   ├── handleGetLogs / handleGetDeviceHistory
│   ├── handleGetLatestMeasurements
│   └── handleGetDeviceConfig / handleUpdateDeviceConfig / handleTriggerOTA
├── firmwares.php         # Firmwares & Compilation (index modulaire)
│   └── firmwares/        # Sous-modules refactorisés
│       ├── helpers.php   # Fonctions utilitaires (extractVersionFromBin)
│       ├── crud.php      # CRUD firmwares (handleGetFirmwares, handleCheckFirmwareVersion, handleDeleteFirmware)
│       ├── upload.php    # Upload & Update (handleUploadFirmware, handleUploadFirmwareIno, handleUpdateFirmwareIno)
│       ├── download.php  # Téléchargement (handleDownloadFirmware, handleGetFirmwareIno)
│       └── compile.php   # Compilation avec SSE (handleCompileFirmware, sendSSE)
│           - Keep-alive toutes les 2s pendant l'installation
│           - Heartbeat conditionnel (pas pendant téléchargement)
│           - Gestion robuste des interruptions SSE
│           - Le processus continue même si la connexion se ferme (ignore_user_abort)
└── notifications.php     # Notifications & Audit
    ├── handleGetNotificationPreferences / handleUpdateNotificationPreferences
    ├── handleTestNotification
    ├── handleGetNotificationsQueue / handleProcessNotificationsQueue
    ├── handleGetUserNotifications / handleUpdateUserNotifications
    ├── handleGetPatientNotifications / handleUpdatePatientNotifications
    └── handleGetAuditLogs / handleClearAuditLogs
```

### Principes de Refactoring

1. **Séparation par domaine fonctionnel** : Chaque handler gère un domaine métier spécifique
2. **Fonctions utilitaires centralisées** : Toutes les fonctions réutilisables dans `helpers.php`
3. **Pas de duplication** : Chaque fonction existe en un seul exemplaire
4. **Chemins relatifs corrects** : Utilisation de `__DIR__` pour résoudre les chemins depuis n'importe quel niveau
5. **Tags PHP obligatoires** : Tous les fichiers PHP commencent par `<?php`

### Lignes Directrices pour Maintenance

#### ✅ Bonnes Pratiques

**Avant toute modification :**
1. Vérifier la syntaxe PHP : `php -l api.php && php -l api/**/*.php`
2. Identifier le domaine fonctionnel concerné (auth, devices, firmwares, notifications)
3. Vérifier si une fonction similaire existe déjà dans `helpers.php` ou un autre handler

**Lors de l'ajout de fonctionnalités :**
- **Nouvelle fonction utilitaire** → `api/helpers.php`
- **Nouveau endpoint dans un domaine existant** → Handler correspondant (`api/handlers/*.php`)
- **Nouveau domaine fonctionnel** → Créer un nouveau handler dans `api/handlers/`

**Chemins et includes :**
```php
// ✅ CORRECT : Utiliser __DIR__ pour les chemins relatifs
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../hardware/firmware/v3.0/config.ino';

// ❌ INCORRECT : Chemins relatifs depuis api.php
require_once 'api/helpers.php';  // Ne fonctionne pas depuis un handler
```

**Validation avant commit :**
```bash
# Vérifier syntaxe PHP
php -l api.php
php -l api/helpers.php
php -l api/handlers/*.php

# Vérifier les doublons de fonctions
grep -r "^function " api/ | sort | uniq -d

# Vérifier les tags PHP manquants
grep -L "^<?php" api/**/*.php
```

#### ❌ À Éviter

- **Dupliquer du code** : Toujours vérifier si une fonction existe déjà
- **Modifier `api.php` pour la logique métier** : Utiliser les handlers
- **Oublier le tag `<?php`** : Tous les fichiers PHP doivent commencer par `<?php`
- **Chemins absolus ou incorrects** : Utiliser `__DIR__` pour les chemins relatifs
- **Commiter sans vérification** : Toujours tester la syntaxe PHP avant commit

### Migration depuis l'Ancienne Structure

Si vous travaillez sur du code ancien qui référence directement `api.php` :

**Ancien code (monolithique) :**
```php
// api.php contenait tout : routing + logique métier
if ($path === '/auth/login') {
    // 200 lignes de code de login
}
```

**Nouveau code (modulaire) :**
```php
// api.php : routing uniquement
if ($path === '/auth/login') {
    require_once __DIR__ . '/api/handlers/auth.php';
    handleLogin();
    exit;
}

// api/handlers/auth.php : logique métier
function handleLogin() {
    // 200 lignes de code de login
}
```

### Avantages de l'Architecture Modulaire

1. **Maintenabilité** : Code organisé par domaine, plus facile à comprendre
2. **Réutilisabilité** : Fonctions utilitaires centralisées dans `helpers.php`
3. **Testabilité** : Chaque handler peut être testé indépendamment
4. **Évolutivité** : Ajout de nouveaux domaines sans modifier `api.php`
5. **Débogage** : Erreurs localisées plus facilement dans le handler concerné

## 📡 Architecture USB Streaming

### Structure des Fichiers Frontend

L'architecture USB suit une séparation en 3 couches (SoC - Separation of Concerns) :

```
components/SerialPortManager.js    # Couche bas niveau (284 lignes)
├── Gestion Web Serial API
├── Connexion/déconnexion port série
├── Lecture/écriture données brutes
└── Réutilisable (flash, configuration, etc.)

contexts/UsbContext.js             # Couche métier (429 lignes)
├── Parsing données JSON firmware
├── Gestion streaming continu
├── Envoi mesures à l'API
├── Détection automatique dispositifs
└── Spécifique au streaming USB

components/configuration/UsbStreamingTab.js  # Couche présentation (309 lignes)
├── Sélection port USB
├── Affichage logs temps réel
└── Affichage mesures
```

### Flux de Streaming USB (v3.6+)

```
1. Connexion au port USB (connect()) - Sélection automatique si dispositif déjà connecté
   ↓
2. Démarrage de la lecture (startReading())
   ↓
3. Envoi commande "usb\n" au firmware (write('usb\n'))
   ↓
4. Envoi commande "start\n" au firmware pour activer le streaming continu
   ↓
5. Firmware attend les commandes du dashboard (mode sécurisé)
   ↓
6. Dashboard envoie des commandes via icônes cliquables :
   - start/stop : contrôle du streaming continu
   - once : mesure immédiate
   - device_info : informations du dispositif
   - modem_on/off : contrôle du modem
   - test_network/gps : tests réseau et GPS
   ↓
7. Firmware envoie données JSON uniquement sur commande explicite
   ↓
8. Parsing et envoi à l'API (processUsbStreamLine)
   ↓
9. Mise à jour automatique des informations du dispositif (firmware_version, last_battery, status, last_seen)
```

### Commandes USB au Firmware (v3.5+)

**Important** : Le firmware ESP32 attend la commande `"usb\n"` dans les **3 secondes après le boot** pour activer le mode USB streaming.

**Séquence d'activation** (dans `startUsbStreaming()`) :
1. Vérifier que le port est connecté
2. Arrêter l'ancien streaming s'il existe
3. Démarrer la lecture (`startReading()`)
4. Attendre 500ms pour que la lecture soit prête
5. **Envoyer la commande "usb"** (`write('usb\n')`)
6. Attendre 500ms pour que le firmware entre en mode USB
7. **Envoyer la commande "start"** (`write('start\n')`) pour démarrer le streaming continu
8. Le firmware commence à envoyer des données automatiquement (si `start` a été envoyé)

**Mode sécurisé (v3.5+)** : Le firmware n'envoie des mesures que sur commande explicite :
- `start` : démarre le streaming continu (mesures automatiques)
- `stop` : arrête le streaming continu
- `once` : envoie une mesure unique immédiate
- `device_info` : envoie les informations du dispositif

**Sans la commande "usb"** : Le firmware n'envoie que les logs de boot, pas le streaming continu.
**Sans la commande "start"** : Le firmware attend les commandes mais n'envoie pas de mesures automatiquement.

### Décision : Fichiers Séparés ✅

**Raison** : Séparation des responsabilités
- `SerialPortManager` = couche bas niveau (réutilisable)
- `UsbContext` = couche métier (spécifique au streaming)
- `UsbStreamingTab` = couche présentation (UI)

**Avantages** :
- Réutilisabilité : `SerialPortManager` peut être utilisé pour le flash, la configuration, etc.
- Maintenabilité : Chaque fichier a une responsabilité claire
- Testabilité : Plus facile de tester chaque couche séparément

