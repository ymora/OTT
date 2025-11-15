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
  - Les devices récupèrent leurs OTA/config en GET sur les mêmes endpoints.
- **Auth** : Next → `/api.php/auth/login` (JWT). Token stocké dans LocalStorage, injecté par `fetchWithAuth`. L’API vérifie JWT + permissions (rôles admin/tech/etc.).
- **Docs / Firmware** : `public/DOCUMENTATION_COMPLETE_OTT.html` décrit la procédure complète, `hardware/firmware/...` contient les sources mais n’est pas versionné.

---

## 📦 Fichiers Principaux

### Frontend (React/Next.js)
- `app/` - Pages Next.js (12 pages)
- `components/` - Composants réutilisables
- `contexts/` - AuthContext (JWT + refresh)
- `package.json` - Dépendances Node.js (config via `.env.local`)

### Backend (PHP)
- `api.php` - API REST complète (800 lignes)
- `schema.sql` - Base PostgreSQL (14 tables, données anonymisées)
- `Dockerfile` - Container pour Render

### Données & Scripts
- `sql/demo_seed.sql` - Jeu de données de démo (emails génériques)
- `public/manifest.json` / `public/sw.js` - PWA installable
- `hardware/` (ignoré) - dépôt externe pour firmware/CAO

---

## 🔐 Sécurité & Configuration

1. **Variables d'environnement Next.js**
   Créer un fichier `.env.local` à la racine contenant :
   ```
   NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com
   NEXT_PUBLIC_REQUIRE_AUTH=true
   ```

2. **Comptes de démonstration**
   - Les seeds utilisent `admin@example.com` / `tech@example.com` avec hashes Bcrypt fictifs.
   - Mettez à jour via `sql/demo_seed.sql` ou `UPDATE_PASSWORDS_RENDER.sql` avec vos propres emails/mots de passe.

3. **Secrets & firmware**
   - Aucun mot de passe en clair dans la doc.
   - Firmware + fichiers CAO déplacés dans `hardware/` (hors Git) pour limiter la surface d’exposition.

4. **Contrôles d’accès critiques**
   - Les actions sensibles (commandes bidirectionnelles, configuration distante, OTA, upload firmware) sont réservées exclusivement aux comptes **Admin**.
   - Les autres rôles restent en lecture ou diagnostic uniquement ; toute tentative côté API retourne `403 Forbidden`.

5. **Scripts d’exploitation**
   - `scripts/db_migrate.sh [--seed]` : applique `schema.sql` (Postgres via `DATABASE_URL` ou MySQL via `DB_HOST/DB_USER/...`).
   - `scripts/deploy_api.sh` : push rapide vers le remote Render (`RENDER_REMOTE`/`RENDER_BRANCH` configurables).
   - `scripts/deploy_dashboard.sh` : `npm install` + build + commande de déploiement (`npm run deploy` par défaut).
   - `scripts/flash_firmware.ps1 -Port COMx` : compile et flash `fw_ott_optimized.ino` via `arduino-cli`.

---

## ✨ Fonctionnalités Clés

### 🔧 Firmware
- ✅ Mesure débit oxygène (MPXV7007DP)
- ✅ Deep sleep optimisé (111j autonomie)
- ✅ Watchdog anti-freeze
- ✅ Transmission HTTPS sécurisée

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

- **Initialiser la base Render :**
  ```bash
  psql $DATABASE_URL -f sql/demo_seed.sql
  ```
- **Mode lecture seule (sans login) :**
  - Render : `AUTH_DISABLED=true`
  - Frontend : `NEXT_PUBLIC_REQUIRE_AUTH=false`
- **Repasser en prod** : remettre les variables à `false` et réactiver la page de connexion.

---

## 📞 Support

📧 support@happlyz.com  
🌐 https://happlyz.com  
📦 https://github.com/ymora/OTT

---

**© 2025 HAPPLYZ MEDICAL SAS** | Version 3.0 - React + Next.js + Render Cloud
