# 🏥 OTT - Dispositif Médical IoT

**Version 3.0 Enterprise** - Solution Cloud Complète

**HAPPLYZ MEDICAL SAS**

---

## 📖 Documentation Complète

👉 **Ouvrir dans votre navigateur:** [`DOCUMENTATION_COMPLETE_OTT.html`](./public/DOCUMENTATION_COMPLETE_OTT.html)

**Tout ce dont vous avez besoin :**
- ⚡ Démarrage rapide (30 minutes)
- 🔧 Guide firmware ESP32
- 🔌 Guide API PHP/PostgreSQL
- ⚛️ Guide dashboard React/Next.js
- ☁️ Déploiement GitHub + Render
- 🐛 Troubleshooting complet

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
- **Auth** : Next → `/api.php/auth/login` (JWT). Token stocké dans LocalStorage, injecté par `fetchWithAuth`. L’API vérifie JWT + permissions (rôles admin/tech/etc.).
- **Docs / Firmware** : `public/DOCUMENTATION_COMPLETE_OTT.html` décrit la procédure complète, `hardware/firmware/...` contient les sources mais n’est pas versionné.

---

## 🛠️ Préparation Environnement

### Frontend – `.env.local`

| Variable | Description | Valeur recommandée |
|----------|-------------|--------------------|
| `NEXT_PUBLIC_API_URL` | URL publique de l’API PHP | `https://ott-jbln.onrender.com` |
| `NEXT_PUBLIC_REQUIRE_AUTH` | Forcer la page de connexion | `true` en prod, `false` pour une démo readonly |
| `NEXT_STATIC_EXPORT` | Utilisé pendant `npm run export` | `true` uniquement lors du build GitHub Pages |

```bash
cat > .env.local <<'EOF'
NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com
NEXT_PUBLIC_REQUIRE_AUTH=true
EOF
```

### Backend – variables Render (Docker service)

| Variable | Rôle | Exemple |
|----------|------|---------|
| `DB_HOST` / `DB_NAME` / `DB_USER` / `DB_PASS` | Secrets Render Postgres | valeurs Render (`dpg-...`, `ott_data`, etc.) |
| `DB_PORT` (optionnel) | Port Postgres | `5432` |
| `DATABASE_URL` (optionnel) | URL complète Postgres (scripts + healthcheck) | `postgresql://user:pass@host/ott_data` |
| `JWT_SECRET` | Clé HMAC pour signer les tokens | générer via `openssl rand -hex 32` |
| `AUTH_DISABLED` | Bypass login (demo) | `false` en prod |
| `SENDGRID_*`, `TWILIO_*` | Clés notification | laisser vide si non utilisées |
| `CORS_ALLOWED_ORIGINS` | Origines additionnelles autorisées (CSV) | `https://mon-dashboard.com,https://foo.app` |

> Astuce : `DATABASE_URL` reste pratique pour les scripts (`scripts/db_migrate.sh`) et le healthcheck (`index.php`), mais l’API lit avant tout `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASS`. Gardez ces cinq variables alignées avec votre instance Postgres.

---

## 🗄️ Base PostgreSQL (schema + seeds)

1. Récupérer l’URL Render (`postgresql://.../ott_data`).
2. Appliquer la structure + données anonymisées :
   ```bash
   DATABASE_URL="postgresql://..." ./scripts/db_migrate.sh --seed
   # ou
   psql $DATABASE_URL -f sql/schema.sql
   psql $DATABASE_URL -f sql/demo_seed.sql
   ```
3. Vérifier :
   ```bash
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
   psql $DATABASE_URL -c "SELECT * FROM users_with_roles;"
   ```

### Base PostgreSQL locale (Docker Compose)

1. Lancer l’instance : `docker compose up -d db`
2. Exporter (ou définir dans `.env`) les variables attendues par l’API :
   ```bash
   export DB_HOST=localhost
   export DB_PORT=5432
   export DB_NAME=ott_data
   export DB_USER=postgres
   export DB_PASS=postgres
   ```
3. Initialiser les données : `./scripts/db_migrate.sh --seed`
4. Réinitialiser complètement : `docker compose down -v`
5. Visualiser la base dans un navigateur :
   ```bash
   docker run -d --name ott-db-viewer -p 8081:8081 ^
     -e PGWEB_DATABASE_URL="postgres://postgres:postgres@host.docker.internal:55432/ott_data?sslmode=disable" ^
     sosedoff/pgweb
   # Ouvrir http://localhost:8081 (stopper via: docker stop ott-db-viewer)
   ```

> ℹ️ Tous les scripts contenus dans `sql/` sont **100 % anonymisés** (ICCID simulés, e-mails génériques, mots de passe uniquement sous forme de hash bcrypt). Aucun secret de production n’est versionné.

Le jeu de données installe automatiquement :
- 4 rôles (`admin`, `medecin`, `technicien`, `viewer`) + 19 permissions.
- 3 patients et 3 dispositifs reliés pour les pages Dashboard.
- Des mesures/alertes/logs réalistes pour vérifier les graphiques.

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
- `sql/demo_seed.sql` - Jeu de données de démo (emails génériques)
- `sql/create_demo_user.sql` - Création utilisateur `demo@example.com`
- `sql/UPDATE_PASSWORDS_RENDER.sql` - Rotation de mots de passe Render
- `public/manifest.json` / `public/sw.js` - PWA installable
- `hardware/` (ignoré) - dépôt externe pour firmware/CAO

---

## 🔐 Sécurité & Configuration

1. **.env.local (Frontend)**  
   - Voir tableau ci-dessus. Toute valeur absente retombe sur les defaults (`localhost`, auth désactivée), donc **ne pas commiter** le fichier.

2. **Secrets backend obligatoires**  
   - `JWT_SECRET` doit être régénéré par projet (`openssl rand -hex 32`).  
   - `DB_HOST/NAME/USER/PASS` = secrets Render Postgres (ou Docker Compose).  
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

---

## ✨ Fonctionnalités Clés

### 🔧 Firmware
- ✅ Mesure débit oxygène (MPXV7007DP) + calibration polynomiale (override possible via `UPDATE_CALIBRATION`)
- ✅ Bidirectionnel complet (TinyGSM SIM7600, commandes `SET_SLEEP_SECONDS`, `PING`, `UPDATE_CONFIG`, `UPDATE_CALIBRATION`)
- ✅ Deep sleep dynamique (5 min par défaut, override via dashboard)
- ✅ Publication HTTPS sécurisée (Bearer JWT, endpoints `/devices/measurements`, `/devices/commands/*`, `/devices/logs`)
- ✅ Configuration par défaut embarquée (ICCID/APN/SIM PIN + JWT optionnel via macros `OTT_DEFAULT_*`) pour boîtiers prêts à l’emploi sans commande distante
- ✅ Protocoles API alignés : headers `X-Device-ICCID`, payload `device_sim_iccid` + `payload{flowrate,battery,signal_*}`, prise en charge des réponses `/devices/{iccid}/commands/pending`
- ✅ Reconfiguration distante des secrets APN/JWT/ICCID/serial/PIN SIM (sauvegarde NVS)

### 🔌 API Backend
- ✅ REST API avec JWT (désactivable via `AUTH_DISABLED=true`)
- ✅ Multi-utilisateurs (4 rôles, 19 permissions)
- ✅ OTA firmware management
- ✅ Notifications (Email/SMS/Push)

### ⚛️ Dashboard React
- ✅ 12 pages complètes
- ✅ Animations modernes et fluides
- ✅ PWA installable
- ✅ Responsive mobile-first

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
   - `NEXT_STATIC_EXPORT=true npm run export` avant `git push`.
   - Vérifier https://ymora.github.io/OTT/ (CSS + login) juste après le déploiement.

---

## 📞 Support

📧 support@happlyz.com  
🌐 https://happlyz.com  
📦 https://github.com/ymora/OTT

---

**© 2025 HAPPLYZ MEDICAL SAS** | Version 3.0 - React + Next.js + Render Cloud

