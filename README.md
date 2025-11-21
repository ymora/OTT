# 🏥 OTT - Dispositif Médical IoT

**Version 3.3 Enterprise** - Solution Cloud Complète

**HAPPLYZ MEDICAL SAS**

---

## 📖 Documentation

La documentation est divisée en 3 parties accessibles depuis le dashboard :

👉 **Accès depuis le dashboard** : Menu latéral → Documentation (menu déroulant)

**Documentations disponibles :**
- 📸 **Présentation** : Vue d'ensemble, fonctionnalités, captures d'écran
- 💻 **Développeurs** : Architecture, API, firmware, déploiement, troubleshooting
- 💼 **Commerciale** : Analyse marché, business plan, ROI, avantages concurrentiels

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
- **Montant (devices → cloud)** : le firmware capture débit/batterie toutes les 5 min, ouvre le modem 4G, poste sur `/api.php/devices/measurements` (JSON + Bearer token quand auth active). Les logs et alertes utilisent `/api.php/devices/logs` et `/api.php/alerts`.
- **Persisté** : l’API écrit dans PostgreSQL (tables `devices`, `measurements`, `alerts`, `audit_logs`, etc.). Les requêtes utilisent PDO (pgsql) et auditent chaque action.
- **Descendant** :
  - Dashboard Next.js appelle l’API (`NEXT_PUBLIC_API_URL`) pour charger stats, cartes Leaflet, notifications, OTA…
  - Les techniciens déclenchent OTA/config via `/api.php/devices/:id/ota` ou `/config`.
  - Les dispositifs OTT se réveillent, mesurent, publient, puis récupèrent les commandes via `/devices/commands/pending`. Les ACK sont renvoyés sur `/devices/commands/ack` pour alimenter la console “Commandes”. Un verbe `UPDATE_CONFIG` permet de pousser APN/JWT/ICCID/Serial à distance (stockés en NVS après réception).
- **Auth** : Next → `/api.php/auth/login` (JWT). Token stocké dans LocalStorage, injecté par `fetchWithAuth`. L'API vérifie JWT + permissions (rôles admin/tech/etc.).
- **Docs / Firmware** : La documentation complète est accessible depuis le dashboard (3 documents : Présentation, Développeurs, Commerciale). `hardware/firmware/...` contient les sources mais n'est pas versionné.

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
   - Relancer `scripts/db_migrate.sh --seed` si vous êtes sur un environnement de démo.
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

> Astuce : le healthcheck et l’API partagent désormais la même résolution de configuration. Renseignez au minimum `DB_HOST/DB_NAME/DB_USER/DB_PASS` (et `DB_PORT` si besoin). `DATABASE_URL` reste utile pour les scripts (`scripts/db_migrate.sh`) ou pour forcer une configuration complète, mais n’est plus obligatoire pour obtenir `database: "connected"`. Pour autoriser la réinitialisation complète depuis le dashboard admin, définissez `ENABLE_DEMO_RESET=true` côté backend et `NEXT_PUBLIC_ENABLE_DEMO_RESET=true` côté frontend.

---

## 🗄️ Base PostgreSQL

### ✅ Configuration Simple : Utiliser Render pour Tout

**Vous n'avez PAS besoin de Docker !** Utilisez Render pour tout (développement ET production).

#### 1. Appliquer la migration sur Render (une seule fois)

**Sur Windows PowerShell :**
```powershell
# Récupérer DATABASE_URL depuis Render Dashboard
# Render > PostgreSQL > Connect > Internal Database URL

.\scripts\migrate_render.ps1 -DATABASE_URL "postgresql://..."
```

**Sur Linux/Mac :**
```bash
DATABASE_URL="postgresql://..." ./scripts/db_migrate.sh
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
- `api.php` - API REST complète (800 lignes)
- `sql/schema.sql` - Base PostgreSQL (14 tables, données anonymisées)
- `Dockerfile` - Container pour Render

### Données & Scripts
- `sql/schema.sql` - Schéma complet + seeds minima
- `sql/base_seed.sql` - Données de base (rôles, utilisateurs, config)
- `sql/demo_seed.sql` - Jeu de données de démo (emails génériques)
- `sql/create_demo_user.sql` - Création utilisateur `demo@example.com`
- `sql/UPDATE_PASSWORDS_RENDER.sql` - Rotation de mots de passe Render
- `public/manifest.json` / `public/sw.js` - PWA installable
- `hardware/` - CAD + doc modem + firmware ESP32/SIM7600 (`cad/`, `docs/`, `firmware/`, `scripts/`)
  - `hardware/firmware/fw_ott_optimized` contient le firmware complet (OTA, commandes, streaming USB)
  - `hardware/firmware/external/TinyGSM*` embarque la lib TinyGSM patchée utilisée par l'ESP32

---

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

6. **Scripts utiles**  
   - `scripts/db_migrate.sh --seed` : applique `sql/schema.sql` + `sql/demo_seed.sql` sur Postgres (`DATABASE_URL=...`).  
   - `psql $DATABASE_URL -f sql/create_demo_user.sql` : crée/active `demo@example.com` (role viewer).  
   - `scripts/deploy_api.sh` / `scripts/deploy_dashboard.sh` : automatisent Render + GitHub Pages.  
   - `scripts/flash_firmware.ps1 -Port COMx` : compil/flash Arduino CLI.
   - Page `/diagnostics` : teste en un clic l’API (`index.php`), affiche version, statut base Postgres et variables `NEXT_PUBLIC_*`.

---

## 🆕 Améliorations Récentes (v3.3)

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
- ✅ Deep sleep dynamique (5 min par défaut, override via dashboard + configuration distante)
- ✅ Publication HTTPS sécurisée (Bearer JWT, endpoints `/devices/measurements`, `/devices/commands/*`, `/devices/logs`)
- ✅ Watchdog applicatif + instrumentation série (flux/batterie/RSSI, compte commandes, progression OTA)
- ✅ Mesure paramétrable (passes, échantillons, délais) + timeouts modem/OTA ajustables à chaud
- ✅ OTA primaire/fallback avec vérification MD5, rollback possible via `OTA_REQUEST`
- ✅ Configuration par défaut embarquée (ICCID/APN/SIM PIN=1234 + JWT optionnel via macros `OTT_DEFAULT_*`) pour boîtiers prêts à l’emploi sans commande distante
- ✅ Protocoles API alignés : headers `X-Device-ICCID`, payload `device_sim_iccid` + `payload{flowrate,battery,signal_*}`, prise en charge des réponses `/devices/{iccid}/commands/pending`
- ✅ Reconfiguration distante des secrets APN/JWT/ICCID/serial/PIN SIM et paramètres runtime (watchdog, OTA, mesures) stockés en NVS
- ✅ **Mode streaming USB** : brancher l’OTT en USB, ouvrir un moniteur série 115200 puis taper `usb` + Entrée <3s → 1 mesure/s en JSON (`interval=<ms>`, `once`, `exit`)

#### Mode streaming USB – mode opératoire

1. Alimenter l’OTT via USB et ouvrir un moniteur série 115200 bauds (Arduino IDE, screen, dashboard Web Serial…).
2. Dès l’affichage de la bannière `[BOOT]`, taper `usb` puis Entrée (délai ~3 secondes).
3. Le firmware reste éveillé et publie une mesure par seconde au format JSON + une ligne lisible.

Commandes durant la session :

- `once` → envoie immédiatement une mesure
- `interval=<ms>` → change l’intervalle (200 à 10000 ms, défaut 1000 ms)
- `help` → affiche l’aide
- `exit` / `usb_stream_off` → quitte le streaming et redémarre pour reprendre le cycle 4G/deep sleep

📁 Sources : `hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino`

💻 Côté dashboard (`/dashboard/devices`), l’onglet « ⚡ Streaming USB » du modal dispositif permet désormais :
- de déclencher `🔍 Détecter USB` (Web Serial) et de lire ICCID/Serial pour réconcilier automatiquement avec la base ;
- d’afficher les logs bruts en plein écran (console verte) avec boutons `▶️ Redémarrer` / `⏹️ Arrêter` ;
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
  DATABASE_URL="postgresql://..." ./scripts/db_migrate.sh --seed
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

**© 2025 HAPPLYZ MEDICAL SAS** | Version 3.3 - React + Next.js + Render Cloud

---

## 🆕 Nouveautés v3.3

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
- **Code mort supprimé** : Nettoyage des fonctions non utilisées
- **Imports optimisés** : Suppression des imports inutilisés
- **Notifications UX** : ajouts des bannières `alert-success/info/warning` pour toutes les étapes USB (détection, création, fallback)

