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
  ↓ (EventSource SSE)
/api.php/firmwares/compile/{id}
  ↓ (arduino-cli)
hardware/firmware/vX.X/*.bin
```

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
├── firmwares.php         # Firmwares & Compilation
│   ├── handleGetFirmwares / handleCheckFirmwareVersion / handleDeleteFirmware
│   ├── handleGetFirmwareIno / handleUpdateFirmwareIno
│   ├── handleUploadFirmware / handleDownloadFirmware
│   ├── handleUploadFirmwareIno
│   ├── handleCompileFirmware (avec SSE)
│   └── sendSSE
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

