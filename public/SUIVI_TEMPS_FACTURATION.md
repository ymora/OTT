# Suivi du Temps - Projet OTT
## Journal de travail pour facturation (Généré automatiquement)

**Période analysée** : 2025-11-14 - 2025-12-02  
**Développeur** : ymora  
**Projet** : OTT - Dispositif Médical IoT  
**Total commits analysés** : 572  
**Branches analysées** : Toutes
**Auteur filtré** : ymora  



---

## Tableau Récapitulatif

| Date | Heures | Commits | Développement | Correction | Test | Documentation | Refactoring | Déploiement | UI/UX | Optimisation |
|------|--------|---------|---------------|------------|------|----------------|-------------|-------------|-------|--------------|
| 2025-11-14 | ~6h | 9 | 2 | 0 | 0 | 0 | 0 | 1 | 2 | 0 |
| 2025-11-15 | ~10h | 23 | 9 | 3 | 1 | 2 | 0 | 0 | 4 | 0 |
| 2025-11-16 | ~9h | 27 | 8 | 3 | 0 | 0 | 2 | 0 | 12 | 0 |
| 2025-11-17 | ~5h | 14 | 2 | 3 | 0 | 0 | 1 | 0 | 6 | 1 |
| 2025-11-18 | ~8h | 25 | 7 | 9 | 0 | 1 | 5 | 0 | 1 | 1 |
| 2025-11-19 | ~5h | 7 | 2 | 0 | 0 | 0 | 4 | 0 | 0 | 1 |
| 2025-11-20 | ~1h | 3 | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 0 |
| 2025-11-21 | ~6h | 12 | 9 | 1 | 0 | 1 | 0 | 0 | 0 | 1 |
| 2025-11-22 | ~10h | 69 | 11 | 31 | 0 | 1 | 6 | 1 | 5 | 9 |
| 2025-11-23 | ~10h | 60 | 15 | 26 | 0 | 0 | 1 | 0 | 5 | 9 |
| 2025-11-24 | ~6h | 28 | 0 | 16 | 0 | 0 | 2 | 0 | 0 | 6 |
| 2025-11-25 | ~10h | 45 | 7 | 24 | 0 | 1 | 0 | 0 | 3 | 10 |
| 2025-11-26 | ~10h | 59 | 5 | 42 | 0 | 3 | 5 | 0 | 2 | 2 |
| 2025-11-27 | ~10h | 59 | 12 | 28 | 0 | 2 | 2 | 0 | 8 | 7 |
| 2025-11-28 | ~1h | 3 | 0 | 0 | 0 | 1 | 0 | 0 | 2 | 0 |
| 2025-11-29 | ~0.5h | 2 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2025-11-30 | ~8h | 77 | 5 | 32 | 0 | 1 | 1 | 0 | 8 | 26 |
| 2025-12-01 | ~5h | 14 | 1 | 1 | 0 | 1 | 0 | 0 | 2 | 8 |
| 2025-12-02 | ~8h | 36 | 1 | 4 | 0 | 3 | 0 | 0 | 7 | 15 |
**Total** | **~128.5h** | **572** | **27** | **41.4** | **0.4** | **4.4** | **8.6** | **0.8** | **17.2** | **18.6**

---

## Détail par Jour

### 14 novembre 2025
**Heures estimées** : ~6h  
**Période** : 08:51 - 21:33  
**Nombre de commits** : 9

#### Avancées principales
- [FEAT] ­ƒöÆ Mise ├á jour de la s├®curit├® : ajout d'un dossier hardware ignor├®, mise ├á jour des identifiants de d├®mo, et ajustements de l'authentification dans l'API et le frontend.
- [FEAT] Ô£¿ Enhance API routing: Added support for accessing routes via /api.php/ and improved fallback handling for direct /api.php URLs. Updated Next.js configuration to conditionally set output based on static export environment variable.
#### Problèmes résolus
- *Aucun problème résolu enregistré*
#### Redéploiements
- *Aucun redéploiement enregistré*
#### Tests
- *Aucun test enregistré*

---

### 15 novembre 2025
**Heures estimées** : ~10h  
**Période** : 00:30 - 23:27  
**Nombre de commits** : 23

#### Avancées principales
- [FEAT] Ô£¿ API enhancements: Added debug mode for error reporting, implemented device command management with new endpoints for creating, retrieving, and acknowledging commands, and improved command handling logic. Updated permission checks to require admin access for certain operations.
- [FEAT] ­ƒôÜ Update README and documentation: Revised API URL references, enhanced architecture diagrams, and added detailed data flow descriptions. Updated documentation to reflect changes in data handling and authentication processes.
- [FEAT] ­ƒöä Refactor database schema: Transitioned to PostgreSQL with new multi-tenant structure, added user roles and permissions, implemented triggers for automatic timestamp updates, and updated initial seed data for users, devices, and configurations. Enhanced views for device statistics and user roles.
- [FEAT] ­ƒôû Update README and documentation: Expanded environment configuration details for frontend and backend, clarified API setup instructions, and added comprehensive guidelines for database initialization and seeding. Enhanced security notes regarding sensitive information and user roles.
- [FEAT] Ô£¿ Add initial database schema and password update script: Introduced a comprehensive PostgreSQL schema for a multi-tenant application, including tables for users, roles, permissions, devices, and notifications. Added a script for updating user passwords in the Render environment, with detailed instructions for execution.
- [FEAT] ­ƒôû Update README and documentation: Revised SQL file references throughout the documentation, added a new script for creating a demo user, and clarified the process for applying database migrations. Enhanced descriptions of device command functionalities and remote configuration updates.
- [FEAT] ­ƒöº Enhance CORS handling in API: Implemented dynamic origin validation for CORS requests, allowing additional origins via environment variable. Updated OPTIONS response code to 204 and documented new environment variable in README.
- [FEAT] ­ƒöº Enhance command handling and error management: Added new commands for updating configuration, recalibrating sensors, and triggering OTA updates in the dashboard. Introduced a dedicated error boundary component for improved UI error handling. Updated README and documentation to reflect new command functionalities and API changes.
- [FEAT] Ô£¿ Add diagnostics page and panel: Introduced a new `/diagnostics` page in the dashboard to test API connectivity and display service status, PostgreSQL connection, and exposed frontend variables. Updated README and documentation to reflect this new feature.
- [FEAT] Ô£¿ Implement demo reset functionality: Added a new admin endpoint `/admin/reset-demo` to truncate key tables and reload demo data from SQL files. Introduced `ENABLE_DEMO_RESET` configuration to control this feature. Updated README with instructions for enabling and using the demo reset. Enhanced database migration script to include base seed data. Updated sidebar to include an administration link.
#### Problèmes résolus
- [FIX] Ô£¿ API enhancements: Added debug mode for error reporting, implemented device command management with new endpoints for creating, retrieving, and acknowledging commands, and improved command handling logic. Updated permission checks to require admin access for certain operations.
- [FIX] ­ƒöº Update Next.js configuration: Added `assetPrefix` to `next.config.js` to support asset loading based on the `basePath`, enhancing deployment flexibility. This change allows for better handling of static assets in different environments.
- [FIX] fix postgres boolean filters
#### Redéploiements
- [DEPLOY] ­ƒôû Update README and documentation: Revised SQL file references throughout the documentation, added a new script for creating a demo user, and clarified the process for applying database migrations. Enhanced descriptions of device command functionalities and remote configuration updates.
- [DEPLOY] Ô£¿ Implement demo reset functionality: Added a new admin endpoint `/admin/reset-demo` to truncate key tables and reload demo data from SQL files. Introduced `ENABLE_DEMO_RESET` configuration to control this feature. Updated README with instructions for enabling and using the demo reset. Enhanced database migration script to include base seed data. Updated sidebar to include an administration link.
- [DEPLOY] ­ƒöº Update Next.js configuration: Added `assetPrefix` to `next.config.js` to support asset loading based on the `basePath`, enhancing deployment flexibility. This change allows for better handling of static assets in different environments.
- [DEPLOY] ­ƒöº Update deployment configuration: Changed `NEXT_PUBLIC_API_URL` to point to the new API endpoint, added `NEXT_PUBLIC_REQUIRE_AUTH` and `NEXT_PUBLIC_ENABLE_DEMO_RESET` environment variables for enhanced deployment settings.
#### Tests
- [TEST] Ô£¿ API enhancements: Added debug mode for error reporting, implemented device command management with new endpoints for creating, retrieving, and acknowledging commands, and improved command handling logic. Updated permission checks to require admin access for certain operations.
- [TEST] Ô£¿ Add diagnostics page and panel: Introduced a new `/diagnostics` page in the dashboard to test API connectivity and display service status, PostgreSQL connection, and exposed frontend variables. Updated README and documentation to reflect this new feature.

---

### 16 novembre 2025
**Heures estimées** : ~9h  
**Période** : 00:23 - 22:43  
**Nombre de commits** : 27

#### Avancées principales
- [FEAT] Ô£¿ Enhance LeafletMap component: Added connection status and battery information for devices, improving user interface with status badges and last seen timestamps. Updated popup display for better clarity and user experience.
- [FEAT] Ô£¿ Add device creation and update functionality: Implemented endpoints for creating and updating devices in the API. Enhanced the dashboard to support patient assignment and filtering of devices based on assignment status. Improved user experience with modals for device assignment and error handling.
- [FEAT] Ô£¿ Enhance dashboard functionality: Added patient assignment details to device commands, improved alert filtering with search functionality, and enriched reports with patient-device associations. Updated UI components for better clarity and user experience.
- [FEAT] Ô£¿ Update to Version 3.1: Enhanced user interface with a reorganized menu and optimized overview section. Introduced complete user management with CRUD functionality and improved device assignment features. Added detailed patient information modals and an interactive map with dynamic status indicators. Updated documentation to reflect new features and improvements.
- [FEAT] Ô£¿ Enhance Patients and Users Pages: Added email and phone number columns to patient and user tables for improved information display. Updated sidebar menu structure for better navigation and added descriptions for menu items. Refactored sidebar links for enhanced accessibility and user experience.
- [FEAT] Ô£¿ Enhance Patients and Users Pages: Added email and phone number columns to patient and user tables for improved information display. Updated sidebar menu structure for better navigation and added descriptions for menu items. Improved user interface with refined action buttons and enhanced user experience in detail views.
- [FEAT] Ô£¿ Add user and patient notification management: Implemented endpoints for retrieving and updating user and patient notification preferences. Enhanced database queries to support default preference creation and improved error handling for better user experience.
- [FEAT] Ô£¿ Update project structure: Added 'docs/' to .gitignore, included 'env_loader.php' in api.php and index.php for environment configuration, and removed unused import in dashboard page.js to streamline code.
- [FEAT] Ô£¿ Update project structure and enhance functionality: Added 'docs/' to .gitignore, included env_loader in api.php and index.php for environment configuration, removed unused DeviceCard import in dashboard, and corrected alert label formatting in Patients and Users pages.
- [FEAT] Ô£¿ Enhance dashboard functionality: Integrated report overview data into the dashboard, added new statistics cards for 24-hour measurements and average flow rate, and improved layout for better data visualization. Removed the deprecated reports page and updated sidebar menu structure to reflect these changes.
#### Problèmes résolus
- [FIX] Ô£¿ Refactor handleGetUsers function: Updated SQL query to retrieve user data with roles and permissions, improving data structure and error handling. Enhanced error logging for better debugging.
- [FIX] Ô£¿ Add cache clearing instructions and refactor diagnostics page: Introduced a new CACHE_FIX.md file with detailed steps for clearing browser cache. Refactored the diagnostics page structure, moving it to a new path and updating the sidebar menu for improved navigation.
- [FIX] Ô£¿ Update Next.js configuration for GitHub Pages: Adjusted basePath and assetPrefix settings for static exports to ensure proper asset loading. Added trailingSlash option for improved routing consistency.
#### Redéploiements
- [DEPLOY] Ô£¿ Update deployment scripts and environment configuration: Added new environment variables for production deployment in GitHub Actions, ensured the creation of .nojekyll file for static export, and cleaned up obsolete scripts to streamline the development process.
#### Tests
- [TEST] Ô£¿ Refactor handleGetUsers function: Updated SQL query to retrieve user data with roles and permissions, improving data structure and error handling. Enhanced error logging for better debugging.

---

### 17 novembre 2025
**Heures estimées** : ~5h  
**Période** : 06:59 - 23:32  
**Nombre de commits** : 14

#### Avancées principales
- [FEAT] Ô£¿ Enhance user form validation and error handling: Added comprehensive validation for user input fields including first name, last name, email, phone, role, and password. Implemented dynamic error messaging to improve user feedback during form submission. Updated the user modal interface for better accessibility and user experience, ensuring trimmed input values for consistency.
- [FEAT] Ô£¿ Enhance user form validation and error handling: Introduced comprehensive validation for user input fields, including first name, last name, email, phone, role, and password. Added state management for form errors to provide real-time feedback. Improved user experience with updated modal styles and error messages, ensuring a more intuitive interface for user creation and editing.
- [FEAT] Ô£¿ Enhance API and UI functionality: Improved the handlePostMeasurement and handlePostLog functions to support multiple input formats for device identifiers and event data. Added comprehensive validation for ICCID and event fields, ensuring robust error handling. Enhanced the dashboard with new firmware upload capabilities, including version extraction from binary files and improved user feedback during uploads. Updated CSS styles for better visual consistency across components and refined the command management interface for devices.
- [FEAT] Ô£¿ Enhance API and UI functionality: Improved the handlePostMeasurement and handlePostLog functions to support multiple input formats for device identifiers and event data. Added comprehensive validation for ICCID and event fields, ensuring robust error handling. Enhanced the dashboard with new firmware upload capabilities, including version extraction from binary files and improved user feedback during uploads. Updated CSS styles for better visual consistency across components and refined the command management interface for devices.
- [FEAT] Ajout endpoint temporaire pour r├®initialiser le mot de passe de ymora@free.fr
- [FEAT] Fix CORS: ajout localhost:3003 et utilisation du proxy pour le login
- [FEAT] Docs: Ajout v├®rification compatibilit├® firmware/API
#### Problèmes résolus
- [FIX] Fix CORS: ajout localhost:3003 et utilisation du proxy pour le login
- [FIX] Fix: Page de connexion unique, redirection dashboard apr├¿s login
- [FIX] Fix: Correction URLs avec doubles slashes et param├¿tres vides
#### Redéploiements
- *Aucun redéploiement enregistré*
#### Tests
- *Aucun test enregistré*

---

### 18 novembre 2025
**Heures estimées** : ~8h  
**Période** : 05:47 - 22:40  
**Nombre de commits** : 25

#### Avancées principales
- [FEAT] feat: add database verification script
- [FEAT] feat: disable email/SMS notifications until valid email/phone entered
- [FEAT] feat: auto-disable notifications when email/phone becomes invalid
- [FEAT] feat: add warning when notification channel enabled but no alert type
- [FEAT] docs: add unification guide for users/patients handlers
- [FEAT] docs: add complete data flow documentation
- [FEAT] docs: add complete database schema documentation
- [FEAT] fix: implement soft delete for users and patients
- [FEAT] feat: add phone column migration and update related scripts
#### Problèmes résolus
- [FIX] fix: handle missing phone column in handleUpdateUser and notification queries
- [FIX] fix: handle missing patient_notifications_preferences table gracefully
- [FIX] fix: handle null/undefined phone_number in UserPatientModal
- [FIX] fix: preserve phone_number type in loadNotificationPrefs
- [FIX] fix: ensure patient notifications are saved and table updates correctly
- [FIX] fix: unify patient notifications with user notifications
- [FIX] fix: implement soft delete for users and patients
- [FIX] fix: enhance patient notifications handling and database initialization
- [FIX] fix: enhance user creation and notification handling
#### Redéploiements
- [DEPLOY] chore: unify database migration into single schema.sql + cleanup
- [DEPLOY] feat: add phone column migration and update related scripts
#### Tests
- *Aucun test enregistré*

---

### 19 novembre 2025
**Heures estimées** : ~5h  
**Période** : 07:12 - 20:12  
**Nombre de commits** : 7

#### Avancées principales
- [FEAT] feat: enhance OTA handling and device management
- [FEAT] feat: implement device deletion and automatic data refresh
#### Problèmes résolus
- [FIX] Fix: Suppression route proxy API, correction apostrophes ESLint, export statique GitHub Pages fonctionnel
#### Redéploiements
- *Aucun redéploiement enregistré*
#### Tests
- *Aucun test enregistré*

---

### 20 novembre 2025
**Heures estimées** : ~1h  
**Période** : 06:42 - 17:52  
**Nombre de commits** : 3

#### Avancées principales
- [FEAT] chore: update documentation and improve USB streaming features in version 3.3
#### Problèmes résolus
- [FIX] fix: update output configuration in next.config.js
#### Redéploiements
- *Aucun redéploiement enregistré*
#### Tests
- *Aucun test enregistré*

---

### 21 novembre 2025
**Heures estimées** : ~6h  
**Période** : 06:15 - 23:53  
**Nombre de commits** : 12

#### Avancées principales
- [FEAT] feat: introduce performance optimizations and testing framework in version 3.3
- [FEAT] feat: enhance dashboard and documentation features in version 3.3
- [FEAT] feat: enhance Sidebar with documentation dropdown and update confidential banner
- [FEAT] feat: enhance DevicesPage and USB context for improved measurement handling
- [FEAT] feat: enhance device information handling and firmware updates in USB context and dashboard
- [FEAT] feat: enhance device management and measurement handling in API and dashboard
- [FEAT] feat: add firmware upload and compilation features in dashboard
- [FEAT] feat: restrict firmware upload access to admin and technician roles in Sidebar
- [FEAT] feat: add project structure documentation and firmware management updates
- [FEAT] feat: integrate TinyGSM library and enhance firmware management features
#### Problèmes résolus
- [FIX] fix: improve firmware upload endpoint matching and enhance debug logging
#### Redéploiements
- *Aucun redéploiement enregistré*
#### Tests
- [TEST] feat: introduce performance optimizations and testing framework in version 3.3
- [TEST] fix: improve firmware upload endpoint matching and enhance debug logging

---

### 22 novembre 2025
**Heures estimées** : ~10h  
**Période** : 00:07 - 23:06  
**Nombre de commits** : 69

#### Avancées principales
- [FEAT] chore: add .htaccess file to Docker configuration
- [FEAT] Fix: Ajout colonne status firmware + endpoint init-firmware-db + correction Dockerfile
- [FEAT] feat: enhance firmware management with version checking and deletion functionality
- [FEAT] Fix: Ajout fonction refreshDevices manquante dans FlashUSBModal
- [FEAT] Feat: Modal unifi├® pour flash USB et OTA avec progression, logs et stats
- [FEAT] Fix: Ajout import logger manquant dans UsbContext
- [FEAT] Feat: Flash multiple avec barres de progression et console par dispositif
- [FEAT] Feat: Ajout onglet Configuration dans Outils pour configurer les dispositifs
- [FEAT] Feat: Gestion position dispositifs USB (via IP) et OTA (via GPS/r├®seau cellulaire)
- [FEAT] Fix: Ajout bouton fermeture (croix) au composant Modal
#### Problèmes résolus
- [FIX] Fix: Ajout colonne status firmware + endpoint init-firmware-db + correction Dockerfile
- [FIX] Fix: Am├®lioration gestion firmware upload et suppression
- [FIX] Fix: Conversion minutes en heures/jours pour affichage 'Vu il y a'
- [FIX] Fix: R├®activation automatique de la d├®tection USB apr├¿s d├®connexion
- [FIX] Fix: Activation de la d├®tection USB automatique dans la page firmware
- [FIX] Fix: Import manquant useUsbAutoDetection dans firmware-upload/page.js
- [FIX] Fix: D├®connexion automatique du streaming USB avant flash
- [FIX] Fix: Am├®lioration gestion erreur port d├®j├á utilis├® dans handleConnect
- [FIX] Fix: Nettoyage code configuration - ic├┤nes doubl├®es et imports inutilis├®s
- [FIX] Fix: Mise ├á jour automatique version firmware apr├¿s flash USB
#### Redéploiements
- *Aucun redéploiement enregistré*
#### Tests
- [TEST] Cleanup: Suppression des fichiers de test et documentation temporaire

---

### 23 novembre 2025
**Heures estimées** : ~10h  
**Période** : 06:18 - 22:31  
**Nombre de commits** : 60

#### Avancées principales
- [FEAT] Add: Scripts et guide pour forcer la mise ├á jour du cache
- [FEAT] fix: ajout script PowerShell pour export Windows
- [FEAT] feat: nettoyage automatique du cache et d├®tection des mises ├á jour
- [FEAT] feat: am├®lioration logs console pour compilation firmware
- [FEAT] feat: ajout script de test API compilation firmware
- [FEAT] feat: ajout script de test automatis├® API compilation
- [FEAT] feat: ajout script PowerShell pour tester API compilation firmware
- [FEAT] feat: ajout logs d├®taill├®s pour diagnostic compilation firmware
- [FEAT] feat: ajout logs ultra-d├®taill├®s pour diagnostic compilation
- [FEAT] feat: compl├®tion logs ultra-d├®taill├®s onmessage et onerror
#### Problèmes résolus
- [FIX] Fix: Restauration ordre original handleCompileFirmware pour SSE - requireAuth avant headers SSE
- [FIX] Fix: Restauration comportement SSE b03325b - headers SSE avant auth, erreur via SSE si auth ├®choue
- [FIX] Fix: Corrections configuration API, service worker et scripts de diagnostic
- [FIX] Fix: Service worker ignore extensions Chrome + logs d├®bogage dashboard
- [FIX] Fix: Version service worker v3.0.2
- [FIX] Fix: Service worker am├®lior├® - ignore extensions + auto-update
- [FIX] fix: r├®solution conflit Tailwind CSS v3/v4 et nettoyage builds
- [FIX] fix: ajout script PowerShell pour export Windows
- [FIX] fix: correction export bash et service worker
- [FIX] fix: correction erreur syntaxe JavaScript dans layout et r├®installation Tailwind
#### Redéploiements
- *Aucun redéploiement enregistré*
#### Tests
- [TEST] feat: ajout script de test API compilation firmware
- [TEST] feat: ajout script de test automatis├® API compilation
- [TEST] fix: correction d├®lais v├®rification connexion SSE bas├®e sur tests
- [TEST] feat: ajout script PowerShell pour tester API compilation firmware
- [TEST] debug: ajout logs pour v├®rifier affichage bouton compilation

---

### 24 novembre 2025
**Heures estimées** : ~6h  
**Période** : 06:27 - 23:26  
**Nombre de commits** : 28

#### Avancées principales
- [FEAT] Fix: Ajout catch manquant pour try interne ligne 4495
- [FEAT] Fix: Ajout accolade fermante manquante pour bloc else ligne 5115
- [FEAT] Fix: Ajout accolade fermante manquante pour try interne ligne 4495
- [FEAT] Fix: Ajout accolade fermante manquante pour try interne ligne 4495 - correction structure compl├¿te
#### Problèmes résolus
- [FIX] ­ƒöº Fix: boucle infinie redirection page connexion
- [FIX] ­ƒöº Fix: protection contre boucles de cache Service Worker
- [FIX] ­ƒöº Fix: erreur JSON - toutes erreurs PHP converties en JSON
- [FIX] ­ƒöº Fix: Content-Type JSON forc├® dans handleLogin()
- [FIX] ­ƒöº Fix: output buffering + nettoyage complet buffer erreurs
- [FIX] index on test-yesterday-morning: b67b78db ­ƒöº Fix: output buffering + nettoyage complet buffer erreurs
- [FIX] Fix: Correction erreur syntaxe PHP ligne 5108 + am├®liorations UI connexion
- [FIX] Fix: Correction indentation compl├¿te dans handleCompileFirmware - erreur syntaxe ligne 5108
- [FIX] Fix: Correction indentation compl├¿te bloc try dans handleCompileFirmware
- [FIX] Fix: Correction indentation compl├¿te - toutes les lignes dans bloc try
#### Redéploiements
- *Aucun redéploiement enregistré*
#### Tests
- [TEST] index on test-yesterday-morning: b67b78db ­ƒöº Fix: output buffering + nettoyage complet buffer erreurs

---

### 25 novembre 2025
**Heures estimées** : ~10h  
**Période** : 06:06 - 23:18  
**Nombre de commits** : 45

#### Avancées principales
- [FEAT] ­ƒöº Fix: R├®paration api/handlers/auth.php - ajout fonctions manquantes (handleLogin, handleGetMe, handleRefreshToken, handleGetUsers, handleCreateUser) + suppression route /health dupliqu├®e + mise ├á jour docker-compose.yml pour monter api/
- [FEAT] Fix: Ajouter localhost:3000 dans origines CORS par d├®faut (production + dev)
- [FEAT] ­ƒöº Refactor: Suppression du fichier RESET_EDGE.md et ajout de la gestion des utilisateurs dans temp_complete_auth.txt
- [FEAT] fix: ajouter balise PHP manquante dans api/helpers.php
- [FEAT] fix: ajouter balises PHP manquantes dans devices.php et notifications.php
- [FEAT] docs: ajout lignes directrices refactoring et architecture modulaire API
- [FEAT] fix: ajout endpoint /api.php/logs manquant dans le routing
- [FEAT] refactor: ajout fonction getProjectRoot() pour coh├®rence des chemins
- [FEAT] feat: stockage firmwares .ino et .bin dans PostgreSQL (BYTEA) - alternative au Persistent Disk
- [FEAT] feat: script PowerShell pour appliquer migration firmware BYTEA
#### Problèmes résolus
- [FIX] ­ƒöº Fix: am├®lioration de la gestion des erreurs et v├®rification des fichiers firmware
- [FIX] Fix: Corrections chemins + endpoint /health + proxy Next.js
- [FIX] ­ƒöº Fix: R├®paration api/handlers/auth.php - ajout fonctions manquantes (handleLogin, handleGetMe, handleRefreshToken, handleGetUsers, handleCreateUser) + suppression route /health dupliqu├®e + mise ├á jour docker-compose.yml pour monter api/
- [FIX] Fix: Correction AuthContext.js pour utiliser directement Render.com + correction apostrophe Login.js
- [FIX] Fix: Ajouter localhost:3000 dans origines CORS par d├®faut (production + dev)
- [FIX] fix: restaurer l'ouverture PHP de handlers/firmwares
- [FIX] fix: copier api et hardware dans l'image Docker
- [FIX] fix: autoriser hardware/lib et hardware/firmware dans Docker (n├®cessaires pour compilation)
- [FIX] fix: forcer ex├®cution PHP pour api.php dans Apache
- [FIX] fix: ajouter balise PHP manquante dans api/helpers.php
#### Redéploiements
- [DEPLOY] feat: script PowerShell pour appliquer migration firmware BYTEA
- [DEPLOY] feat: endpoint API /migrate/firmware-blob pour ex├®cuter la migration
- [DEPLOY] feat: script PowerShell pour appliquer migration via API
- [DEPLOY] docs: guide complet pour appliquer migration firmware BYTEA
- [DEPLOY] feat: script automatique migration firmware BYTEA avec attente d├®ploiement
#### Tests
- *Aucun test enregistré*

---

### 26 novembre 2025
**Heures estimées** : ~10h  
**Période** : 07:03 - 23:20  
**Nombre de commits** : 59

#### Avancées principales
- [FEAT] debug: ajout logs console pour diagnostiquer upload fichier .ino
- [FEAT] fix: ajouter keep-alive pendant copie librairies et v├®rification core ESP32 pour maintenir connexion SSE
- [FEAT] feat: am├®liorer messages d├®tection USB automatique et streaming
- [FEAT] fix: ajouter helper is_windows pour compilation
- [FEAT] feat: ajouter bouton Detecter USB dans l'onglet streaming
- [FEAT] feat: am├®liorer gestion erreurs compilation avec messages d├®taill├®s
- [FEAT] docs: ajouter rapport de v├®rification du refactoring firmwares
- [FEAT] fix: ajouter import useRouter manquant dans app/page.js
- [FEAT] feat: connexion automatique USB au chargement de l'onglet
- [FEAT] fix: ajouter d├®pendances manquantes dans useCallback startUsbStreaming
#### Problèmes résolus
- [FIX] debug: ajout logs console pour diagnostiquer upload fichier .ino
- [FIX] fix: exclure colonnes BYTEA volumineuses de handleGetFirmwares pour ├®viter erreur JSON
- [FIX] fix: am├®lioration gestion erreur JSON dans handleGetFirmwares
- [FIX] fix: mise ├á jour ino_content en DB lors de handleUpdateFirmwareIno + script test upload/├®dition
- [FIX] fix: retirer colonne error_message inexistante de handleGetFirmwares
- [FIX] fix: utiliser stream_select au lieu de fgets pour ├®viter blocage SSE lors compilation
- [FIX] fix: utiliser stream_select pour v├®rification core ESP32 pour ├®viter blocage
- [FIX] fix: ajouter keep-alive pendant copie librairies et v├®rification core ESP32 pour maintenir connexion SSE
- [FIX] fix: ajouter helper is_windows pour compilation
- [FIX] fix: s├®curiser v├®rif core ESP32 pour compilation
#### Redéploiements
- *Aucun redéploiement enregistré*
#### Tests
- [TEST] debug: ajout logs console pour diagnostiquer upload fichier .ino
- [TEST] fix: mise ├á jour ino_content en DB lors de handleUpdateFirmwareIno + script test upload/├®dition
- [TEST] fix: d├®finir descriptorspec avant utilisation pour core list
- [TEST] debug: ajouter logs d├®taill├®s pour analyser probl├¿me write('usb')
- [TEST] debug: ajouter logs d├®taill├®s pour voir pourquoi donn├®es n'apparaissent pas

---

### 27 novembre 2025
**Heures estimées** : ~10h  
**Période** : 06:05 - 23:06  
**Nombre de commits** : 59

#### Avancées principales
- [FEAT] fix: ajouter import logger manquant dans AuthContext.js
- [FEAT] fix: ajouter useEffect manquant pour maintenir menu Documentation ouvert
- [FEAT] feat: garder le menu Documentation ouvert lors de la navigation
- [FEAT] feat: syst├¿me pause/reprise pour streaming USB
- [FEAT] feat: inverser ordre logs USB - r├®cents en haut, initiaux en bas
- [FEAT] feat: ajouter affichage min/max pour batterie, d├®bit et RSSI
- [FEAT] feat: ajouter support dark mode pour les 3 documentations HTML
- [FEAT] feat: ajouter min/max en BDD et ascenseur pour documentations
- [FEAT] feat: ajouter styles dark mode pour images dans toutes les docs
- [FEAT] docs: ajouter rapport d'optimisation documentation
#### Problèmes résolus
- [FIX] fix: ajouter import logger manquant dans AuthContext.js
- [FIX] fix: ajouter useEffect manquant pour maintenir menu Documentation ouvert
- [FIX] fix: optimiser MarkdownViewer et am├®liorer menu Documentation
- [FIX] fix: permettre toggle bouton en ├®tat paused
- [FIX] fix: comportement menu Documentation - seul triangle toggle, pas de surbrillance menu principal
- [FIX] fix: simplifier inversion logs - utiliser uniquement reverse() sur tableau
- [FIX] fix: optimiser menu Documentation - r├®activit├® et d├®ploiement vers le haut
- [FIX] fix: menu Documentation se d├®ploie vers le haut avec flex-col-reverse
- [FIX] fix: texte Documentation non cliquable, seul triangle d├®ploie/r├®duit
- [FIX] fix: triangle menu Documentation fonctionne apr├¿s clic sur une doc
#### Redéploiements
- *Aucun redéploiement enregistré*
#### Tests
- [TEST] feat: Contr├┤les modem et GPS depuis l'interface USB streaming - Ajout commandes firmware: modem_on, modem_off, test_network, gps - Interface: boutons pour d├®marrer/arr├¬ter modem et tester r├®seau/GPS - D├®tection automatique ├®tat modem depuis les logs - Indicateur modem mis ├á jour en temps r├®el (arr├¬t├®/d├®marrage/d├®marr├®) - Am├®lioration gestion erreurs REG_DENIED avec APN automatique - Retry avec backoff exponentiel pour attache r├®seau - Logs d├®taill├®s avec suggestions APN selon op├®rateur
- [TEST] fix: Correction boucle d'erreur infinie et am├®lioration UX modem/GPS - Correction boucle d'erreur infinie dans SerialPortManager avec compteur d'erreurs cons├®cutives - Ajout d├®lai entre tentatives pour ├®viter le spam d'erreurs - Arr├¬t automatique apr├¿s 5 erreurs cons├®cutives - Ajout guide d'utilisation pour d├®marrer modem et tester GPS - Instructions claires avec ├®tapes num├®rot├®es dans l'interface

---

### 28 novembre 2025
**Heures estimées** : ~1h  
**Période** : 00:28 - 07:18  
**Nombre de commits** : 3

#### Avancées principales
- [FEAT] feat: Interface USB streaming v3.5 - Ic├┤nes cliquables, mode s├®curis├®, connexion automatique
#### Problèmes résolus
- *Aucun problème résolu enregistré*
#### Redéploiements
- *Aucun redéploiement enregistré*
#### Tests
- *Aucun test enregistré*

---

### 29 novembre 2025
**Heures estimées** : ~0.5h  
**Période** : 19:28 - 19:34  
**Nombre de commits** : 2

#### Avancées principales
- [FEAT] Ajout colonnes last_flowrate et last_rssi dans devices + am├®lioration gestion erreurs framing + affichage donn├®es DB sans USB
- [FEAT] Ajout migration last_flowrate et last_rssi + script PowerShell + documentation
#### Problèmes résolus
- [FIX] Ajout colonnes last_flowrate et last_rssi dans devices + am├®lioration gestion erreurs framing + affichage donn├®es DB sans USB
#### Redéploiements
- [DEPLOY] Ajout migration last_flowrate et last_rssi + script PowerShell + documentation
#### Tests
- *Aucun test enregistré*

---

### 30 novembre 2025
**Heures estimées** : ~8h  
**Période** : 04:06 - 21:37  
**Nombre de commits** : 77

#### Avancées principales
- [FEAT] feat: v3.9 - Am├®liorations compl├¿tes: visualisation BDD, suivi temps mis ├á jour, nettoyage docs, corrections s├®curit├®
- [FEAT] feat: v3.10 - Partage USB multi-onglets, d├®sactivation boutons sauvegarde, corrections routing
- [FEAT] feat: v3.11 - Pagination, cache Redis, Sentry, OpenAPI, suivi temps am├®lior├® (commits locaux)
- [FEAT] debug: Ajout logs debug pour diagnostiquer 404 /admin/database-view
- [FEAT] feat: Ajout s├®lection dispositif depuis base de donn├®es dans Debug & Config
- [FEAT] feat: Renommer Outils en Dispositifs OTT avec ic├┤ne ­ƒöî
- [FEAT] feat: Ajout tableau dispositifs visible en permanence dans Dispositifs OTT
- [FEAT] feat: Ajout filtres et recherche par patient dans tableau dispositifs
- [FEAT] refactor: Suppression tableau bas, ajout colonne Patient dans tableaux onglets
- [FEAT] feat: Ajout tableau dispositifs et suppression avec modal dans Debug & Config
#### Problèmes résolus
- [FIX] Optimisation firmware et dashboard: correction messages, format unifi├®, s├®lection automatique
- [FIX] feat: v3.9 - Am├®liorations compl├¿tes: visualisation BDD, suivi temps mis ├á jour, nettoyage docs, corrections s├®curit├®
- [FIX] feat: v3.10 - Partage USB multi-onglets, d├®sactivation boutons sauvegarde, corrections routing
- [FIX] fix: Correction erreur React UsbStreamingTab + am├®lioration d├®tection commits locaux
- [FIX] fix: R├®duction logs r├®p├®titifs d├®tection USB - intervalle adaptatif
- [FIX] fix: Intervalle adaptatif d├®tection USB (15s si pas de ports, 3s sinon)
- [FIX] fix: Correction routing /admin/database-view - route sp├®cifique avant route g├®n├®rique
- [FIX] fix: Correction erreur usbConnectedDevice + suppression mode d├®mo
- [FIX] fix: Simplification pattern regex /admin/database-view pour corriger 404
- [FIX] debug: Ajout logs debug pour diagnostiquer 404 /admin/database-view
#### Redéploiements
- *Aucun redéploiement enregistré*
#### Tests
- [TEST] debug: Ajout logs debug pour diagnostiquer 404 /admin/database-view
- [TEST] feat: Ajout s├®lection dispositif depuis base de donn├®es dans Debug & Config
- [TEST] feat: Ajout tableau dispositifs et suppression avec modal dans Debug & Config
- [TEST] feat: Ajout tableau complet dispositifs et modal suppression dans Debug & Config
- [TEST] fix: Pattern route plus permissif pour /devices/test/create

---

### 01 décembre 2025
**Heures estimées** : ~5h  
**Période** : 19:49 - 23:13  
**Nombre de commits** : 14

#### Avancées principales
- [FEAT] feat: Ajout bouton modification dans tableaux (dispositifs, patients, utilisateurs) au lieu du clic sur la ligne
- [FEAT] Ajout audit complet du code: doublons, redondances, code mort, s├®curit├®
- [FEAT] Ajout document r├®capitulatif du refactoring
- [FEAT] D├®tection code mort: ajout docs/_next/ au gitignore, documentation code mort restant
- [FEAT] Fix: ajout deleteLoading manquant dans patients/page.js
- [FEAT] Nettoyage: suppression Base de Donn├®es du menu doc, ajout Audit Consolid├®, nettoyage Git
#### Problèmes résolus
- [FIX] Fix: ajout deleteLoading manquant dans patients/page.js
#### Redéploiements
- *Aucun redéploiement enregistré*
#### Tests
- *Aucun test enregistré*

---

### 02 décembre 2025
**Heures estimées** : ~8h  
**Période** : 07:22 - 22:48  
**Nombre de commits** : 36

#### Avancées principales
- [FEAT] ­ƒù║´©Å Ajout carte dispositifs + r├®duction taille boutons vue d'ensemble
- [FEAT] ­ƒùä´©Å Base de donn├®es sortie de la vue d'ensemble + ajout├®e au menu (admin uniquement)
#### Problèmes résolus
- [FIX] Corrections: tableau base de donn├®es dans Vue d'ensemble, suppression page Audit Consolid├®, correction bug audit/suivi temps
- [FIX] Audit complet: s├®curit├®, consolidation, documentation + Fix dispositif USB non visible
- [FIX] Fix: Dispositif USB appara├«t imm├®diatement dans le tableau apr├¿s cr├®ation
- [FIX] Documentation: Fix dispositif USB visible imm├®diatement
- [FIX] Simplification: Correction affichage dispositif USB cr├®├® automatiquement
- [FIX] ­ƒöº Fix default tab Base de Donn├®es
#### Redéploiements
- *Aucun redéploiement enregistré*
#### Tests
- *Aucun test enregistré*

---

## Statistiques Globales

### Répartition par activité
- **Développement** : ~27h (21%)
- **Correction** : ~41.4h (32.2%)
- **Test** : ~0.4h (0.3%)
- **Documentation** : ~4.4h (3.4%)
- **Refactoring** : ~8.6h (6.7%)
- **Déploiement** : ~0.8h (0.6%)
- **UI/UX** : ~17.2h (13.4%)
- **Optimisation** : ~18.6h (14.5%)

### Temps total estimé : ~128.5 heures

### Nombre de jours travaillés : 19

### Moyenne par jour : ~6.8h

---

## Notes pour facturation

### Méthodologie d'estimation
- Estimation basée sur l'analyse des commits Git de **toutes les branches**
- Calcul de la durée entre premier et dernier commit de la journée
- Ajustement selon le nombre de commits (plus de commits = plus de temps)
- Plafond de 10h par jour maximum
- Catégorisation automatique des commits

### Catégories de travail
1. **Développement** : Nouvelles fonctionnalités (feat, ajout, nouveau, ✨🚀)
2. **Correction** : Bug fixes, résolution problèmes (fix, bug, erreur, 🔧🐛)
3. **Test** : Tests unitaires, tests d'intégration (test, debug, 🧪🔍)
4. **Documentation** : Rédaction, mise à jour docs (doc, documentation, 📝📚)
5. **Refactoring** : Restructuration code (refactor, nettoyage, ♻️🔨)
6. **Déploiement** : Configuration, migrations, redéploiements (deploy, migration, 🚀📦)
7. **UI/UX** : Améliorations visuelles, design (carte, accordéons, icônes, 🎨🗺️📊)
8. **Optimisation** : Nettoyage code, audit, performance (🗑️🧹✨)

### Recommandations
- Ce document est généré automatiquement à partir des commits Git
- Les estimations peuvent être ajustées manuellement si nécessaire
- Pour facturation précise, combiner avec un système de suivi temps réel (Toggl, etc.)
- Les commits sont analysés de toutes les branches pour une vue complète

---

**Dernière génération** : 02/12/2025 22:51  
**Source** : Analyse automatique des commits Git du projet  
**Script** : scripts/generate_time_tracking.ps1
