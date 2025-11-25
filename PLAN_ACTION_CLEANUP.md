# 📋 PLAN D'ACTION - NETTOYAGE ET ORGANISATION DU CODE

## 🔍 SITUATION ACTUELLE

### Inventaire des fonctions par fichier :
- **auth.php** : 14 fonctions (9 auth/users + 5 devices DOUBLONS)
- **devices.php** : 29 fonctions (5 devices DOUBLONS + 24 autres devices/patients/firmwares)
- **firmwares.php** : 11 fonctions (4 firmwares + 7 notifications DOUBLONS)
- **notifications.php** : 5 fonctions (2 notifications DOUBLONS + 3 autres)

### Problèmes identifiés :

1. **DOUBLONS DEVICES** (auth.php lignes 512-932 vs devices.php lignes 7-574)
   - `handleGetDevices` : 2 versions (auth.php = complète avec auth optionnelle, devices.php = simplifiée)
   - `handleCreateDevice` : 2 versions (auth.php = avec permissions, devices.php = simplifiée)
   - `handleUpdateDevice` : 2 versions (auth.php = avec soft delete, devices.php = simplifiée)
   - `handleDeleteDevice` : 2 versions (auth.php = avec soft delete, devices.php = simplifiée)
   - `handlePostMeasurement` : 2 versions (auth.php = complète, devices.php = simplifiée)

2. **DOUBLONS NOTIFICATIONS** (firmwares.php lignes 1381+ vs notifications.php)
   - `handleGetNotificationPreferences` : 2 versions
   - `handleUpdateNotificationPreferences` : 2 versions
   - `handleTestNotification` : seulement dans firmwares.php
   - `handleGetNotificationsQueue` : seulement dans firmwares.php
   - `handleProcessNotificationsQueue` : seulement dans firmwares.php
   - `handleGetUserNotifications` : seulement dans firmwares.php
   - `handleUpdateUserNotifications` : seulement dans firmwares.php

3. **FONCTIONS MAL PLACÉES** dans devices.php :
   - `handleGetFirmwares`, `handleCheckFirmwareVersion`, `handleDeleteFirmware`, `handleGetFirmwareIno`, `handleUpdateFirmwareIno` → doivent être dans firmwares.php
   - `handleGetPatients`, `handleCreatePatient`, `handleUpdatePatient`, `handleDeletePatient` → doivent rester dans devices.php (liées aux devices)

4. **FONCTIONS HELPER** dans auth.php :
   - `getLocationFromIp`, `getClientIp` → doivent être dans api/helpers.php

## ✅ PLAN D'ACTION SÉCURISÉ

### PHASE 1 : SAUVEGARDE ET VÉRIFICATION
- [ ] Créer une branche de sauvegarde : `git checkout -b backup-before-cleanup`
- [ ] Vérifier que toutes les routes dans api.php pointent vers les bonnes fonctions
- [ ] Lister toutes les fonctions utilisées dans api.php pour s'assurer qu'elles existent

### PHASE 2 : NETTOYAGE DES DOUBLONS DEVICES
- [ ] **Comparer les 2 versions** de chaque fonction devices pour identifier la meilleure
- [ ] **Garder les versions COMPLÈTES** de auth.php (auth optionnelle, soft delete, permissions)
- [ ] **Remplacer** les versions simplifiées dans devices.php par les versions complètes de auth.php
- [ ] **Supprimer** la section "HANDLERS - DEVICES" de auth.php (lignes 512-932)
- [ ] **Déplacer** `getLocationFromIp` et `getClientIp` de auth.php vers api/helpers.php (si pas déjà présent)

### PHASE 3 : NETTOYAGE DES DOUBLONS NOTIFICATIONS
- [ ] **Comparer** les versions de notifications dans firmwares.php et notifications.php
- [ ] **Consolider** toutes les fonctions notifications dans notifications.php
- [ ] **Déplacer** les fonctions manquantes de firmwares.php vers notifications.php :
  - `handleTestNotification`
  - `handleGetNotificationsQueue`
  - `handleProcessNotificationsQueue`
  - `handleGetUserNotifications`
  - `handleUpdateUserNotifications`
- [ ] **Supprimer** la section "HANDLERS - NOTIFICATIONS" de firmwares.php (lignes 1381+)

### PHASE 4 : RÉORGANISATION FIRMWARES
- [ ] **Déplacer** de devices.php vers firmwares.php :
  - `handleGetFirmwares`
  - `handleCheckFirmwareVersion`
  - `handleDeleteFirmware`
  - `handleGetFirmwareIno`
  - `handleUpdateFirmwareIno`
- [ ] **Vérifier** que firmwares.php contient toutes les fonctions firmwares nécessaires

### PHASE 5 : VÉRIFICATION CORS
- [ ] **Vérifier** que api.php autorise bien :
  - `https://ymora.github.io` (production)
  - `http://localhost:3000` (dev local)
  - `http://localhost:3003` (autres ports)
  - `http://localhost:5173` (Vite)
- [ ] **Vérifier** que AuthContext.js utilise bien l'API directement (pas de proxy qui cause 500)
- [ ] **Tester** que les requêtes CORS fonctionnent en local ET en production

### PHASE 6 : TESTS ET VALIDATION
- [ ] **Vérifier syntaxe PHP** : `php -l` sur tous les fichiers modifiés
- [ ] **Vérifier** que toutes les fonctions sont définies avant d'être utilisées
- [ ] **Tester** les endpoints critiques :
  - `/api.php/auth/login`
  - `/api.php/devices`
  - `/api.php/firmwares`
  - `/api.php/notifications/preferences`
- [ ] **Vérifier** qu'il n'y a plus de doublons

### PHASE 7 : COMMIT ET DÉPLOIEMENT
- [ ] **Commit** avec message clair : "refactor: nettoyage doublons et réorganisation handlers"
- [ ] **Push** vers GitHub
- [ ] **Attendre** déploiement Render (2-3 min)
- [ ] **Tester** l'API en production

## 🎯 ORGANISATION FINALE CIBLE

### api/handlers/auth.php
- ✅ `handleLogin`
- ✅ `handleGetMe`
- ✅ `handleRefreshToken`
- ✅ `handleGetUsers`
- ✅ `handleCreateUser`
- ✅ `handleUpdateUser`
- ✅ `handleDeleteUser`
- ✅ `handleGetRoles`
- ✅ `handleGetPermissions`
- ❌ **SUPPRIMER** : toutes les fonctions devices

### api/handlers/devices.php
- ✅ `handleGetDevices` (version complète de auth.php)
- ✅ `handleCreateDevice` (version complète de auth.php)
- ✅ `handleUpdateDevice` (version complète de auth.php)
- ✅ `handleDeleteDevice` (version complète de auth.php)
- ✅ `handlePostMeasurement` (version complète de auth.php)
- ✅ Toutes les autres fonctions devices/commands/patients
- ❌ **SUPPRIMER** : fonctions firmwares (déplacer vers firmwares.php)

### api/handlers/firmwares.php
- ✅ `handleUploadFirmware`
- ✅ `handleDownloadFirmware`
- ✅ `handleUploadFirmwareIno`
- ✅ `handleCompileFirmware`
- ✅ `handleGetFirmwares` (déplacé de devices.php)
- ✅ `handleCheckFirmwareVersion` (déplacé de devices.php)
- ✅ `handleDeleteFirmware` (déplacé de devices.php)
- ✅ `handleGetFirmwareIno` (déplacé de devices.php)
- ✅ `handleUpdateFirmwareIno` (déplacé de devices.php)
- ❌ **SUPPRIMER** : toutes les fonctions notifications

### api/handlers/notifications.php
- ✅ `handleGetNotificationPreferences`
- ✅ `handleUpdateNotificationPreferences`
- ✅ `handleGetPatientNotifications`
- ✅ `handleUpdatePatientNotifications`
- ✅ `handleGetAuditLogs`
- ✅ `handleClearAuditLogs`
- ✅ `handleTestNotification` (déplacé de firmwares.php)
- ✅ `handleGetNotificationsQueue` (déplacé de firmwares.php)
- ✅ `handleProcessNotificationsQueue` (déplacé de firmwares.php)
- ✅ `handleGetUserNotifications` (déplacé de firmwares.php)
- ✅ `handleUpdateUserNotifications` (déplacé de firmwares.php)

### api/helpers.php
- ✅ Toutes les fonctions helper existantes
- ✅ `getLocationFromIp` (déplacé de auth.php si pas déjà présent)
- ✅ `getClientIp` (déplacé de auth.php si pas déjà présent)

## ⚠️ PRÉCAUTIONS

1. **NE PAS SUPPRIMER** avant d'avoir vérifié que la version à garder est la bonne
2. **TOUJOURS** comparer les deux versions avant de supprimer
3. **PRÉSERVER** toutes les fonctionnalités (auth optionnelle, soft delete, permissions, etc.)
4. **TESTER** après chaque phase
5. **COMMITER** après chaque phase réussie pour pouvoir revenir en arrière

## 🔒 GARANTIES CORS

- ✅ `api.php` autorise déjà `localhost:3000`, `localhost:3003`, `localhost:5173`, `ymora.github.io`
- ✅ `AuthContext.js` utilise directement `https://ott-jbln.onrender.com` (pas de proxy)
- ✅ Les headers CORS sont définis en premier dans `api.php`
- ✅ Les requêtes OPTIONS (preflight) sont gérées correctement

