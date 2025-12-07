# 🏥 OTT - Dispositif Médical IoT

**Version 3.1.0** - Solution Cloud Complète avec Pagination, Cache Redis, Sentry, OpenAPI

**HAPPLYZ MEDICAL SAS**

---

## 📖 Documentation

### Documentation Utilisateur (Dashboard)
La documentation est divisée en 3 parties accessibles depuis le dashboard :

👉 **Accès depuis le dashboard** : Menu latéral → Documentation (menu déroulant)

**Documentations disponibles :**
- 📸 **Présentation** : Vue d'ensemble, fonctionnalités, captures d'écran
- 💻 **Développeurs** : Architecture, API, firmware, déploiement, troubleshooting
- 💼 **Commerciale** : Analyse marché, business plan, ROI, avantages concurrentiels

### Documentation Technique
📚 **Toute la documentation technique est accessible depuis le dashboard** → Menu latéral → Documentation

**Pour les développeurs :**
- Code source : Voir les fichiers dans `hardware/firmware/` pour le firmware
- API : Voir `api.php` et `api/handlers/` pour l'API backend
- Dashboard : Voir `app/dashboard/` et `components/` pour le frontend

---

## 🚀 Accès Rapide

### 🌐 Dashboard Live
```
https://ymora.github.io/OTT/
```

**Accès démo sécurisé**
- Aucun identifiant n’est exposé publiquement.
- Demander un accès temporaire via l’équipe HAPPLYZ : support@happlyz.com.

### 🔌 API Backend
```
https://ott-jbln.onrender.com
```

### 📦 GitHub Repository
```
https://github.com/ymora/OTT
```

---

## ⚡ Installation Express (3 commandes)

### Frontend React
```bash
npm install
npm run dev
# Ouvrir http://localhost:3000
```

### Backend (déploiement automatique)
```bash
git add .
git commit -m "Deploy OTT V3"
git push origin main
# Déploiement auto via GitHub Actions + Render
```

## 🏗️ Architecture
```
 ┌────────────────────────────┐
 │  Firmware ESP32 + SIM7600  │
 │  capteur MPXV7007 + OTA    │
 └─────────────┬──────────────┘
               │ HTTPS (POST JSON mesures/logs, OTA GET)
               ▼
 ┌────────────────────────────┐        ┌────────────────────────────┐
 │  API PHP (Render Docker)   │ <────> │  PostgreSQL (Render DB)    │
 │  - auth JWT / rôles        │        │  - tables devices, alerts │
 │  - endpoints REST / OTA    │        │  - audit + notifications  │
 └─────────────┬──────────────┘        └─────────────┬──────────────┘
               │ REST (JSON)                         │ via PDO
               ▼                                     │
 ┌────────────────────────────┐                      │
 │  Dashboard Next.js (PWA)   │◀─────────────────────┘
 │  - hébergé sur GitHub Pages│
 │  - AuthContext → JWT       │
 │  - compos Santés, maps…    │
 └────────────────────────────┘
```

### Flux global

#### Mode Hybride (Production)
- **Envoi au reset hard** : Mesure initiale envoyée au démarrage (`status: "BOOT"`)
- **Détection de changement** : Surveillance continue du flux d'air (seuil: 0.5 L/min)
- **Envoi immédiat** : Mesure et envoi dès changement détecté (`status: "EVENT"`)
- **Deep sleep après mesure** : Après chaque envoi réussi, le dispositif entre en deep sleep pour la durée configurée (`configuredSleepMinutes`, par défaut 24 heures)
- **Deep sleep périodique** : Si aucun changement n'est détecté pendant la durée configurée, le dispositif entre en deep sleep automatiquement
- **Light sleep intermédiaire** : Si inactif depuis plus de 30 minutes mais moins que `configuredSleepMinutes`, le dispositif entre en light sleep (1 minute) pour économiser l'énergie tout en restant réactif
- **Vérification OTA** : Commandes vérifiées toutes les 30 secondes après chaque changement de flux détecté

#### Mode USB (Visualisation Live / Debug)
- **Fonctionnement normal** : Le dispositif continue de fonctionner normalement même branché en USB. Il envoie ses mesures en OTA comme d'habitude.
- **Visualisation live** : Les logs USB permettent de voir en temps réel ce qui se passe :
  - ✅ **Connexion modem** : Logs de connexion au réseau GSM, qualité du signal (RSSI)
  - ✅ **GPS** : Acquisition de position, coordonnées GPS, nombre de satellites
  - ✅ **Envoi API** : Tentatives d'envoi des mesures, réponses de l'API (succès/échec)
  - ✅ **Capteurs** : Valeurs des mesures (débit, batterie) en temps réel
- **Processus parallèles** : Le firmware exécute deux processus en parallèle :
  - **Processus 1 (Debug USB)** : Affichage des mesures toutes les secondes sur USB pour visualisation live
  - **Processus 2 (Normal OTA)** : Envoi périodique des mesures via OTA selon `configuredSleepMinutes` (par défaut toutes les 24 heures, configurable)
- **⚠️ Important** : 
  - Les mesures affichées sur USB sont **uniquement pour visualisation** (affichées toutes les secondes)
  - Les mesures envoyées à l'API suivent le **cycle normal OTA** (toutes les `configuredSleepMinutes`)
  - Le processus normal OTA continue même en mode USB, sans deep sleep (mode continu)
- **Configuration directe** : Commandes USB `config {...}` et `calibration {...}` pour configuration immédiate
- **Commandes disponibles** : `config {...}`, `calibration {...}`, `interval=<ms>`
- **Pas de deep sleep en USB** : Mode continu tant que USB connecté pour permettre la visualisation live, retour automatique en mode normal (avec deep sleep) à la déconnexion

#### Géolocalisation
- **Dispositifs OTA (Mode Normal)** : le firmware tente d'obtenir la position via GPS (priorité) ou réseau cellulaire (fallback) et l'inclut dans chaque mesure. L'API met à jour automatiquement `latitude`/`longitude` du dispositif.
- **Dispositifs USB** : la position est déterminée via géolocalisation IP du PC client (service ip-api.com). Mise à jour automatique lors de la réception d'une mesure USB.

📖 **Documentation complète** : Accessible depuis le dashboard → Documentation
- **Persisté** : l’API écrit dans PostgreSQL (tables `devices`, `measurements`, `alerts`, `audit_logs`, etc.). Les requêtes utilisent PDO (pgsql) et auditent chaque action.
- **Descendant** :
  - Dashboard Next.js appelle l’API (`NEXT_PUBLIC_API_URL`) pour charger stats, cartes Leaflet, notifications, OTA…
  - Les techniciens déclenchent OTA/config via `/api.php/devices/:id/ota` ou `/config`.
  - Les dispositifs OTT se réveillent, mesurent, publient, puis récupèrent les commandes via `/devices/commands/pending`. Les ACK sont renvoyés sur `/devices/commands/ack` pour alimenter la console “Commandes”. Un verbe `UPDATE_CONFIG` permet de pousser APN/JWT/ICCID/Serial à distance (stockés en NVS après réception).
- **Auth** : Next → `/api.php/auth/login` (JWT). Token stocké dans LocalStorage, injecté par `fetchWithAuth`. L'API vérifie JWT + permissions (rôles admin/tech/etc.).
- **Docs / Firmware** : La documentation complète est accessible depuis le dashboard (3 documents : Présentation, Développeurs, Commerciale). `hardware/firmware/vX.X/` contient les firmwares compilés et uploadés (non versionnés).
- **Compilation Firmware** : La compilation est toujours réelle via `arduino-cli` (jamais simulée). Le serveur doit avoir `arduino-cli` installé. Si `arduino-cli` n'est pas disponible, la compilation est refusée avec une erreur explicite. Voir section "Installation arduino-cli" ci-dessous.

### 📟 Dépannage – “mon dispositif n’apparaît pas”
1. **Vérifier l’ICCID côté firmware**
   - Après `SIM READY`, journaliser `modem.getSimCCID()` et confirmer qu’il correspond à l’ICCID attendu.
2. **S’assurer que le POST mesure cible bien l’API**
   - `httpPost(PATH_MEASURE, body)` doit pointer sur `https://ott-jbln.onrender.com/api.php/devices/measurements`.
   - Le body JSON doit contenir `device_sim_iccid`, `payload.flowrate`, `payload.battery`.
3. **Observer la réponse API**
   - En succès, l’API renvoie `{ success: true, device_id: <id> }`. Sinon, noter le message `[API]` côté série.
4. **Confirmer côté dashboard**
   - Une fois la mesure enregistrée, le boîtier apparaît dans `/api.php/devices`. Utiliser la recherche ICCID sur la page “Dispositifs” pour le localiser, puis l’associer à un patient.
5. **Toujours absent ?**
   - Relancer `scripts/db/db_migrate.sh --seed` si vous êtes sur un environnement de démo.
   - Vérifier que `ENABLE_DEMO_RESET` n’a pas été déclenché récemment (les boîtiers “réels” doivent être ré-injectés après un reset).

---

## 🛠️ Préparation Environnement

### Frontend – `.env.local`

| Variable | Description | Valeur recommandée |
|----------|-------------|--------------------|
| `NEXT_PUBLIC_API_URL` | URL de l'API (Render) | `https://ott-jbln.onrender.com` |
| `NEXT_PUBLIC_ENABLE_DEMO_RESET` | Activer le bouton "Réinitialiser démo" dans l'admin | `false` (ou `true` pour tests) |

**Fichier `.env.local` minimal :**
```bash
NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com
NEXT_PUBLIC_ENABLE_DEMO_RESET=false
```

**Note :** `NEXT_PUBLIC_REQUIRE_AUTH` n'existe plus - l'authentification est toujours requise.

### Backend – variables Render (Docker service)

| Variable | Rôle | Exemple |
|----------|------|---------|
| `DB_TYPE` (optionnel) | SGBD (`pgsql` par défaut) | `pgsql` |
| `DB_HOST` / `DB_NAME` / `DB_USER` / `DB_PASS` | Secrets Render Postgres | valeurs Render (`dpg-...`, `ott_data`, etc.) |
| `DB_PORT` (optionnel) | Port associé au SGBD | `5432` |
| `DATABASE_URL` (optionnel) | URL complète (scripts + migrations) | `postgresql://user:pass@host/ott_data` |
| `JWT_SECRET` | Clé HMAC pour signer les tokens | générer via `openssl rand -hex 32` |
| `AUTH_DISABLED` | Bypass login (demo) | `false` en prod |
| `ENABLE_DEMO_RESET` | Autoriser `/admin/reset-demo` | `false` |
| `SENDGRID_*`, `TWILIO_*` | Clés notification | laisser vide si non utilisées |
| `CORS_ALLOWED_ORIGINS` | Origines additionnelles autorisées (CSV) | `https://mon-dashboard.com,https://foo.app` |

> Astuce : le healthcheck et l'API partagent désormais la même résolution de configuration. Renseignez au minimum `DB_HOST/DB_NAME/DB_USER/DB_PASS` (et `DB_PORT` si besoin). `DATABASE_URL` reste utile pour les scripts (`scripts/db/db_migrate.sh`) ou pour forcer une configuration complète, mais n'est plus obligatoire pour obtenir `database: "connected"`. Pour autoriser la réinitialisation complète depuis le dashboard admin, définissez `ENABLE_DEMO_RESET=true` côté backend et `NEXT_PUBLIC_ENABLE_DEMO_RESET=true` côté frontend.

---

## 🗄️ Base PostgreSQL

### ✅ Configuration Simple : Utiliser Render pour Tout

**Vous n'avez PAS besoin de Docker !** Utilisez Render pour tout (développement ET production).

#### 1. Appliquer la migration sur Render (une seule fois)

**Sur Windows PowerShell :**
```powershell
# Récupérer DATABASE_URL depuis Render Dashboard
# Render > PostgreSQL > Connect > Internal Database URL

.\scripts\db\migrate_render.ps1 -DATABASE_URL "postgresql://..."
```

**Sur Linux/Mac :**
```bash
DATABASE_URL="postgresql://..." ./scripts/db/db_migrate.sh
```

#### 2. Configurer le frontend (`.env.local`)

```bash
NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com
```

**C'est tout !** Le frontend local utilisera l'API Render qui utilise la base Render.

### Base Docker (Optionnel - Seulement si pas d'internet)

**Docker n'est PAS nécessaire** si vous avez internet. Utilisez-le seulement si :
- Vous développez sans connexion internet
- Vous voulez tester des modifications sans affecter Render

Si vous utilisez Docker, vous aurez 2 bases séparées (Docker local ≠ Render production).

#### Commandes utiles

- Voir les logs : `docker compose logs -f db`
- Accéder à la base : `docker compose exec db psql -U postgres -d ott_data`
- Réinitialiser complètement : `docker compose down -v && docker compose up -d db`
- Visualiser la base (pgweb) : `docker compose up -d pgweb` puis http://localhost:8081

**⚠️ Important :** Les scripts Docker préservent vos données. La migration est idempotente (peut être réexécutée sans erreur).

> ℹ️ Tous les scripts contenus dans `sql/` sont **100 % anonymisés** (ICCID simulés, e-mails génériques, mots de passe uniquement sous forme de hash bcrypt). Aucun secret de production n’est versionné.

Le jeu de données installe automatiquement :
- 3 rôles principaux (`admin`, `medecin`, `technicien`) + 19 permissions.
- 3 patients et 3 dispositifs reliés pour les pages Dashboard.

### 🔐 Rôles et Permissions

**Voir la documentation complète :** Accessible depuis le dashboard → Documentation → Développeurs (section "Sécurité - Rôles et Permissions")

**Rôles disponibles :**
- **Admin** : Accès complet (2 max : Maxime, Yann)
- **Technicien** : Maintenance dispositifs, OTA, commandes (3 max)
- **Médecin** : Consultation patients, suivi médical (2 max)

**Migration des permissions :**
```bash
psql $DATABASE_URL -f sql/migration_roles_v3.2.sql
```
- Des mesures/alertes/logs réalistes pour vérifier les graphiques.

### Réinitialiser la base de démo via le dashboard

1. Activer la fonctionnalité : `ENABLE_DEMO_RESET=true` côté API et `NEXT_PUBLIC_ENABLE_DEMO_RESET=true` côté frontend.
2. Se connecter avec un compte **admin** puis ouvrir `Dashboard → Administration`.
3. Cliquer sur **Réinitialiser la base de démo**. L’API tronque les principales tables puis rejoue `sql/base_seed.sql` + `sql/demo_seed.sql`.
4. En 2‑3 secondes, la base Render revient à l’état documenté ci-dessus.

> ⚠️ Cette action supprime définitivement les données réelles (patients, commandes, journaux). À utiliser uniquement sur des environnements de démonstration.

---

---

## 📦 Fichiers Principaux

### Frontend (React/Next.js)
- `app/` - Pages Next.js (12 pages)
- `components/` - Composants réutilisables
- `contexts/` - AuthContext (JWT + refresh)
- `package.json` - Dépendances Node.js (config via `.env.local`)

### Backend (PHP)
- `api.php` - Point d'entrée API REST (routing et CORS)
- `api/helpers.php` - Fonctions utilitaires partagées (JWT, DB, audit, géolocalisation)
- `api/handlers/` - Handlers modulaires par domaine :
  - `auth.php` - Authentification et gestion utilisateurs
  - `devices.php` - Gestion dispositifs, mesures, commandes, logs
  - `firmwares.php` - Gestion firmwares, compilation, OTA
  - `notifications.php` - Notifications et préférences
- `sql/schema.sql` - Base PostgreSQL (14 tables, données anonymisées)
- `Dockerfile` - Container pour Render

### Données & Scripts
- `sql/` - Scripts SQL (schéma, seeds, migrations)
- `scripts/` - Scripts organisés par catégorie :
  - `dev/` - Développement local
  - `deploy/` - Déploiement (export, GitHub Actions)
  - `test/` - Tests et diagnostics
  - `db/` - Migrations base de données
  - `hardware/` - Firmware & Arduino CLI
- `public/` - Assets statiques (PWA, manifest, documentation)
- `hardware/` - Firmware & Hardware
  - `firmware/vX.X/` - Firmwares compilés (.bin) et uploadés (.ino) par version
  - `lib/` - Bibliothèques Arduino (TinyGSM)
  - `cad/` - Plans CAO
- `public/docs/` - Documentation HTML accessible depuis le dashboard (3 documents)

---

## 🏗️ Architecture Modulaire de l'API PHP

### Structure Refactorisée

L'API PHP a été refactorisée en modules pour améliorer la maintenabilité :

```
api.php                    # Point d'entrée (routing, CORS, erreurs)
├── api/helpers.php        # Fonctions utilitaires partagées
│   ├── JWT (génération, validation, refresh)
│   ├── Database (connexion, requêtes préparées)
│   ├── Audit (logging des actions)
│   ├── Géolocalisation (IP → coordonnées)
│   └── Notifications (queue, envoi)
└── api/handlers/          # Handlers par domaine fonctionnel
    ├── auth.php           # Login, utilisateurs, rôles, permissions
    ├── devices.php        # CRUD dispositifs, mesures, commandes, logs
    ├── firmwares.php      # Upload, compilation, OTA, versions
    └── notifications.php  # Préférences, queue, envoi, audit logs
```

### Principes de Refactoring Appliqués

1. **Séparation des responsabilités** : Chaque handler gère un domaine fonctionnel spécifique
2. **Pas de duplication** : Fonctions communes dans `helpers.php`, pas de doublons entre handlers
3. **Chemins relatifs corrects** : Tous les `require_once` utilisent `__DIR__` pour résoudre les chemins
4. **Tags PHP obligatoires** : Tous les fichiers PHP commencent par `<?php`
5. **Validation systématique** : Vérification de syntaxe PHP avant commit (`php -l`)

### Lignes Directrices pour Futures Corrections

**✅ À FAIRE :**
- Vérifier la syntaxe PHP avant commit : `php -l api.php` et `php -l api/**/*.php`
- Placer les nouvelles fonctions utilitaires dans `api/helpers.php`
- Créer un nouveau handler dans `api/handlers/` si un nouveau domaine fonctionnel émerge
- Utiliser `__DIR__` pour les chemins relatifs dans les includes
- Tester localement avant de pousser sur GitHub

**❌ À ÉVITER :**
- Dupliquer du code entre handlers (utiliser `helpers.php`)
- Modifier `api.php` pour ajouter de la logique métier (utiliser les handlers)
- Oublier le tag `<?php` en début de fichier
- Utiliser des chemins absolus ou relatifs incorrects
- Commiter sans vérifier la syntaxe PHP

**🔍 Vérifications Avant Commit :**
```bash
# Vérifier syntaxe PHP
php -l api.php
php -l api/helpers.php
php -l api/handlers/*.php

# Vérifier les doublons de fonctions
grep -r "function " api/ | sort | uniq -d
```

## 🔐 Sécurité & Configuration

1. **.env.local (Frontend)**  
   - Voir tableau ci-dessus. Toute valeur absente retombe sur les defaults (`localhost`, auth désactivée), donc **ne pas commiter** le fichier.

2. **Secrets backend obligatoires**  
   - `JWT_SECRET` doit être régénéré par projet (`openssl rand -hex 32`).  
   - `DB_HOST/NAME/USER/PASS` = secrets Render Postgres.  
   - `AUTH_DISABLED=false` en production (sinon accès libre).

3. **Comptes de démonstration**  
   - `sql/schema.sql` + `sql/demo_seed.sql` créent `admin@example.com` / `tech@example.com` avec hashes fictifs.  
   - `sql/create_demo_user.sql` ajoute un compte viewer `demo@example.com` (`Demo1234!`) pour les démonstrations rapides.  
   - Exécuter `sql/UPDATE_PASSWORDS_RENDER.sql` ou `psql ... -c "UPDATE users SET password_hash = crypt(...);"` avant mise en prod.

4. **Surface sensible réduite**  
   - Firmware + CAO déplacés dans `hardware/` (hors Git).  
   - Aucun mot de passe/jeton n’apparaît dans la doc, ni dans `public/*`.

5. **Contrôles d’accès**  
   - OTA, commandes descendantes, configuration distante : rôle **Admin** uniquement.  
   - Les autres rôles restent lecture/diagnostic ; l’API retourne `403 Forbidden` si la permission manque.

6. **Installation arduino-cli (requis pour compilation firmware)**  
   - **⚠️ IMPORTANT** : La compilation des firmwares est toujours réelle, jamais simulée. Si `arduino-cli` n'est pas disponible, la compilation est refusée avec une erreur explicite.
   - **Docker** : `arduino-cli` est automatiquement installé dans le `Dockerfile` lors du build.
   - **Render** : Le script `scripts/hardware/install_arduino_cli.sh` est exécuté automatiquement via `render.yaml` lors du déploiement.
   - **Persistent Disk sur Render (RECOMMANDÉ)** : Pour éviter de retélécharger le core ESP32 (~568MB) à chaque déploiement, configurez un Persistent Disk dans le dashboard Render :
     - Service ott-api → Disks → Add Disk
     - Mount Path: `/opt/render/project/src/hardware/arduino-data`
     - Size: `1 GB` (minimum recommandé)
     - 📖 **Documentation complète** : Accessible depuis le dashboard → Documentation → Développeurs
   - **Compilation avec SSE robuste** : La compilation utilise Server-Sent Events (SSE) avec keep-alive toutes les 2 secondes pendant l'installation du core. En cas d'interruption de connexion, le processus PHP continue en arrière-plan et le client vérifie automatiquement le statut du firmware.
   - **Installation manuelle** (si nécessaire) :
     ```bash
     curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh
     sudo mv bin/arduino-cli /usr/local/bin/arduino-cli
     sudo chmod +x /usr/local/bin/arduino-cli
     ```
   - **Vérification** : `arduino-cli version` doit afficher la version installée.

7. **Scripts utiles**  
   - `scripts/db_migrate.sh --seed` : applique `sql/schema.sql` + `sql/demo_seed.sql` sur Postgres (`DATABASE_URL=...`).  
   - `psql $DATABASE_URL -f sql/create_demo_user.sql` : crée/active `demo@example.com` (role viewer).  
   - `scripts/deploy_api.sh` / `scripts/deploy_dashboard.sh` : automatisent Render + GitHub Pages.  
   - `scripts/flash_firmware.ps1 -Port COMx` : compil/flash Arduino CLI.
   - `scripts/install_arduino_cli.sh` : installe arduino-cli sur le serveur (exécuté automatiquement sur Render).
   - Page `/diagnostics` : teste en un clic l'API (`index.php`), affiche version, statut base Postgres et variables `NEXT_PUBLIC_*`.

---

## 🆕 Améliorations Récentes

### Interface Utilisateur
- **Menu réorganisé** : passage de 14 onglets à 5 sections principales avec sous-menus déroulants
  - Dispositifs (Liste, Carte, Commandes, Historique, Journal, OTA)
  - Patients & Alertes (Patients, Alertes)
  - Administration (Utilisateurs, Notifications, Audit, Paramètres)
- **Vue d'ensemble optimisée** :
  - Section "Actions Requises" regroupant alertes critiques, batteries faibles, boîtiers non assignés
  - Indicateur "Batterie Faible" (compteur <30%) remplace la moyenne peu actionnable
  - Graphiques regroupés dans une section dédiée
  - Accès rapide aux pages principales

### Gestion des Utilisateurs
- **CRUD complet** : création, édition, suppression d'utilisateurs depuis le dashboard
- **Permissions** : gestion des rôles et activation/désactivation des comptes
- **Correction API** : requête SQL optimisée pour éviter les erreurs de vue `users_with_roles`

### Gestion des Dispositifs
- **Assignation patients** : modal pour rattacher/détacher un dispositif à un patient
- **Filtres** : vue "Tous", "Assignés", "Non assignés"
- **Badges visuels** : indication claire des dispositifs non assignés

### Détails Patients
- **Modale complète** : informations patient, dispositif associé, statistiques, alertes récentes
- **Graphiques** : visualisation des mesures de débit sur les dernières 24h
- **Lien carte** : accès direct à la localisation du dispositif depuis les détails patient

### Carte Interactive
- **Statut dynamique** : marqueurs colorés selon l'état (en ligne, attention, hors ligne)
- **Informations détaillées** : batterie, dernière connexion, patient associé dans les popups
- **Sélection** : clic sur un marqueur affiche les détails complets du dispositif

## ✨ Fonctionnalités Clés

### 🔧 Firmware
- ✅ Mesure débit oxygène (MPXV7007DP) + calibration polynomiale (override possible via `UPDATE_CALIBRATION`)
- ✅ Bidirectionnel complet (TinyGSM SIM7600, commandes `SET_SLEEP_SECONDS`, `PING`, `UPDATE_CONFIG`, `UPDATE_CALIBRATION`, `OTA_REQUEST`)
- ✅ Deep sleep dynamique (24 heures par défaut, override via dashboard + configuration distante)
- ✅ Publication HTTPS sécurisée (Bearer JWT, endpoints `/devices/measurements`, `/devices/commands/*`, `/devices/logs`)
- ✅ Watchdog applicatif + instrumentation série (flux/batterie/RSSI, compte commandes, progression OTA)
- ✅ Mesure paramétrable (passes, échantillons, délais) + timeouts modem/OTA ajustables à chaud
- ✅ OTA primaire/fallback avec vérification MD5, rollback possible via `OTA_REQUEST`
- ✅ Configuration par défaut embarquée (ICCID/APN/SIM PIN=1234 + JWT optionnel via macros `OTT_DEFAULT_*`) pour boîtiers prêts à l'emploi sans commande distante
- ✅ Protocoles API alignés : headers `X-Device-ICCID`, payload `device_sim_iccid` + `payload{flowrate,battery,signal_*}`, prise en charge des réponses `/devices/{iccid}/commands/pending`
- ✅ Reconfiguration distante des secrets APN/JWT/ICCID/serial/PIN SIM et paramètres runtime (watchdog, OTA, mesures) stockés en NVS
- ✅ **Mode streaming USB** : brancher l'OTT en USB, ouvrir un moniteur série 115200 puis taper `usb` + Entrée <3s → 1 mesure/s en JSON (`interval=<ms>`, `once`, `exit`)
- ✅ **Géolocalisation automatique** : envoi position GPS/réseau cellulaire dans chaque mesure OTA. Pour dispositifs USB, position déterminée via IP du PC client

#### Mode streaming USB – mode opératoire

1. Alimenter l'OTT via USB et ouvrir le dashboard (`/dashboard/devices` → onglet "⚡ Streaming USB").
2. Cliquer sur l'icône **🔌 Connexion USB** pour autoriser le port USB (Web Serial API).
3. Le dashboard détecte automatiquement le dispositif et affiche les logs en temps réel.
4. **Fonctionnement** : En mode USB, le firmware exécute deux processus parallèles :
   - **Processus 1 (Debug USB)** : Affichage des mesures toutes les secondes sur USB pour visualisation live
   - **Processus 2 (Normal OTA)** : Envoi périodique des mesures via OTA selon la configuration (par défaut toutes les 24 heures, configurable)
5. Le modem est automatiquement initialisé pour permettre l'envoi OTA, même en mode USB.

📁 Firmwares : `hardware/firmware/vX.X/` (organisés par version, .bin et .ino ensemble)

💻 Côté dashboard (`/dashboard/devices`), l’onglet « ⚡ Streaming USB » du modal dispositif permet désormais :
- de déclencher `🔍 Détecter USB` (Web Serial) et de lire ICCID/Serial pour réconcilier automatiquement avec la base ;
- d'afficher les logs en temps réel avec **deux couleurs distinctes** :
  - **🔵 Bleu** : Logs du dashboard (commandes envoyées, statuts, erreurs)
  - **🟢 Vert** : Logs du dispositif (mesures, firmware, modem, GPS)
- **Sélection automatique du port** : Le port USB est automatiquement sélectionné dès qu'un dispositif est connecté
- indicateurs d'état en temps réel organisés en 4 sections :
  - **État de connexion** : USB (avec bouton détection/démarrage intégré), Streaming (avec pause/reprise)
  - **Système** : Modem (démarrer/arrêter), GPS (test), Firmware, Identifiant
  - **Mesures en temps réel** : Débit, Batterie, Signal RSSI
  - **Statistiques** : Mesures reçues, Dernière mesure
- contrôles interactifs pour démarrer/arrêter le modem, tester le réseau et le GPS (icônes avec tooltips) ;
- **Mise à jour automatique** : Toutes les informations du dispositif (firmware_version, last_battery, status, last_seen) sont mises à jour automatiquement dans la base de données dès qu'une mesure est reçue
- de voir immédiatement si l’on utilise un dispositif réel ou un « virtuel » (identifiant incomplet) avec bouton « Relancer la détection » ;
- pour les admins, d’assigner le boîtier détecté au patient de leur choix directement depuis ce même onglet.

#### Chaîne de détection USB côté dashboard

1. **Détection / Autorisation** : bouton `🔍 Détecter USB` → l’utilisateur autorise le port dans Chrome/Edge.
2. **Lecture d’identité** : le dashboard envoie `AT+CCID`, `AT+CGSN`, `AT+FWVER?` et écoute 5 s le flux JSON (`usb_stream`).
3. **Réconciliation** :
   - si un ICCID/Serial correspond à un device existant → connexion immédiate, pas de doublon en base ;
   - sinon, création automatique (`USB-XXXX`). En cas d’erreur API « déjà utilisé », une nouvelle recherche est faite pour récupérer le vrai device.
4. **Fallback virtuel** : si l’ICCID/Serial est incomplet (ou si l’API refuse la création), un device « virtuel » est instancié localement pour afficher les logs quand même (mais non assignable). Un bandeau explique comment relancer la détection.
5. **Streaming** : la session de logs est permanente, quel que soit l’onglet actif du dashboard ; les logs restent visibles tant que le port est branché.

### 🔌 API Backend
- ✅ REST API avec JWT (désactivable via `AUTH_DISABLED=true`)
- ✅ Multi-utilisateurs (4 rôles, 19 permissions)
- ✅ **CRUD Utilisateurs** : `GET/POST/PUT/DELETE /api.php/users` avec gestion des permissions
- ✅ **Gestion Dispositifs** : `PUT /api.php/devices/{id}` pour assignation patients, mise à jour statut/coordonnées
- ✅ OTA firmware management
- ✅ Notifications (Email/SMS/Push)
- ✅ CRUD Patients (`GET/POST/PUT /patients`) avec audit automatique
- ✅ Endpoint `/reports/overview` (agrégats débit/batterie, top dispositifs, répartition des alertes, assignations)
- ✅ **Correction requêtes SQL** : optimisation des jointures pour éviter les erreurs de vue

### ⚛️ Dashboard React
- ✅ 12 pages complètes
- ✅ Animations modernes et fluides
- ✅ PWA installable
- ✅ Responsive mobile-first
- ✅ **Menu optimisé** : regroupement logique en sections déroulantes (Dispositifs, Patients & Alertes, Administration)
- ✅ **Vue d'ensemble réorganisée** : section "Actions Requises" pour alertes critiques, batteries faibles, boîtiers non assignés
- ✅ **Gestion utilisateurs** : création, édition, suppression avec permissions
- ✅ **Gestion dispositifs** : assignation aux patients, filtres (assignés/non assignés)
- ✅ **Détails patients** : modale complète avec dispositif associé, statistiques, alertes, graphiques
- ✅ **Carte interactive** : visualisation des dispositifs avec statut (batterie, en ligne/hors ligne)
- ✅ Modale "Nouveau patient" reliée aux permissions `patients.edit`
- ✅ Page Rapports interactive (cartes + graphiques Chart.js + exports)
- ✅ Alertes contextualisées (patient + dispositif + liens carte)
- ✅ **Indicateurs intelligents** : "Batterie Faible" (compteur <30%) au lieu de moyenne

---

## 💰 Coûts

| Service | Prix |
|---------|------|
| PostgreSQL (Render) | 0€ |
| API (Render Starter) | 7€/mois |
| Dashboard (GitHub Pages) | 0€ |
| **TOTAL** | **7€/mois** |

🎉 **vs 10 000€/mois** avec solutions cloud classiques !

---

## 📊 Performances

- **Autonomie:** 111 jours sur batterie 2000mAh
- **Mesure capteur:** 100ms (au lieu de 5000ms)
- **RAM:** 13% utilisée
- **Uptime API:** 99.9% (Render Starter)

---

## 🗃️ Seeding & Modes

- **Initialiser / réinitialiser la base Render :**
  ```bash
  DATABASE_URL="postgresql://..." ./scripts/db/db_migrate.sh --seed
  # ou, pour rejouer seulement les seeds
  psql $DATABASE_URL -f sql/demo_seed.sql
  ```
- **Mode lecture seule (sans login) :**
  - Backend : `AUTH_DISABLED=true`
  - Frontend : `NEXT_PUBLIC_REQUIRE_AUTH=false`
- **Repasser en prod** : remettre les variables précédentes à `false`, purger LocalStorage et relancer `npm run dev`.

---

## 🔁 Check-list alignement Local ↔ Web ↔ Render

1. **Backend Render**
   - `DB_HOST/PORT/NAME/USER/PASS` renseignés avec les valeurs Render/Postgres.
   - `JWT_SECRET` renseigné, `AUTH_DISABLED=false`.
   - Dernier Docker image déployé (`Manual Deploy` si doute).
2. **Base de données**
   - `psql $DATABASE_URL -c "SELECT COUNT(*) FROM measurements;"` retourne > 0.
   - `psql ... -c "SELECT * FROM users_with_roles;"` liste les comptes attendus.
3. **Frontend local**
   - `.env.local` pointe vers `https://ott-jbln.onrender.com`.
   - `npm run lint && npm run build` passent.
4. **Frontend GitHub Pages**
   - `npm run export` avant `git push`.
   - Vérifier https://ymora.github.io/OTT/ (CSS + login) juste après le déploiement.

---

## 📞 Support

📧 support@happlyz.com  
🌐 https://happlyz.com  
📦 https://github.com/ymora/OTT

---

**© 2025 HAPPLYZ MEDICAL SAS** | Version 3.11 - React + Next.js + Render Cloud

---

## 🆕 Nouveautés Récentes

### Architecture USB Améliorée
- **UsbContext global** : Contexte React pour gérer l'état USB en permanence sur toutes les pages
- **Détection automatique permanente** : Vérification toutes les 5 secondes des ports USB connectés
- **Streaming USB dans le modal** : Déplacé de la page principale vers l'onglet "Streaming USB" du modal de détails
- **Reconnaissance intelligente** : Le streaming USB n'est visible que pour le dispositif réellement connecté
- **Console plein écran** : affichage 100 % logs, badge de statut, boutons `▶️/⏹️`, message d’attente clair
- **CTA Assignation** : un boîtier detecté mais non assigné peut être rattaché à un patient sans quitter l’onglet

### Chaîne de détection & gestion des dispositifs
- **Réconciliation automatique** : lecture ICCID/Serial + recherche exacte/partielle → réutilisation du device existant
- **Création assistée** : si rien n’est trouvé, création `USB-xxxx` avec feedback visuel (alertes succès/erreur)
- **Fallback virtuel** : si l’ICCID/Serial est absent ou si l’API refuse la création, un device virtuel local est créé (logs disponibles mais bannière informative)
- **Relance guidée** : bandeau « Relancer la détection » + bouton dans le modal pour demander une nouvelle autorisation Web Serial

### Optimisations Code
- **Réduction duplication** : Migration vers `useUsb()` pour éliminer ~500 lignes de code dupliqué
- **Code mort supprimé** : Nettoyage des fonctions non utilisées (`FlashUSBModal.js` supprimé, remplacé par `FlashModal.js` unifié)
- **Imports optimisés** : Suppression des imports inutilisés
- **Fonction helper centralisée** : `findDeviceByIdentifier()` dans `api.php` pour éliminer la logique répétée de recherche de dispositifs
- **Notifications UX** : ajouts des bannières `alert-success/info/warning` pour toutes les étapes USB (détection, création, fallback)
- **Structure optimisée** : Nettoyage de `.gitignore` (doublons supprimés), vérification de la cohérence des chemins de menu

