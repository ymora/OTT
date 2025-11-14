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
https://ott-api.onrender.com
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
┌─────────────┐
│   ESP32     │  ← Firmware C++ (mesure + 4G)
│  + SIM7600  │     111 jours autonomie !
└──────┬──────┘
       │ HTTPS
       ↓
┌─────────────┐
│ API PHP     │  ← Render.com (7€/mois)
│ PostgreSQL  │     JWT + Multi-users + OTA
└──────┬──────┘
       │ REST
       ↓
┌─────────────┐
│  Dashboard  │  ← Next.js/React (GitHub Pages)
│  React PWA  │     12 pages + Animations modernes
└─────────────┘
```

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
   NEXT_PUBLIC_API_URL=https://ott-api.onrender.com
   NEXT_PUBLIC_REQUIRE_AUTH=true
   ```

2. **Comptes de démonstration**
   - Les seeds utilisent `admin@example.com` / `tech@example.com` avec hashes Bcrypt fictifs.
   - Mettez à jour via `sql/demo_seed.sql` ou `UPDATE_PASSWORDS_RENDER.sql` avec vos propres emails/mots de passe.

3. **Secrets & firmware**
   - Aucun mot de passe en clair dans la doc.
   - Firmware + fichiers CAO déplacés dans `hardware/` (hors Git) pour limiter la surface d’exposition.

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
