# 🔌 Environnements API - Guide

## 📍 Les 3 Environnements

### 1. **Docker Local** (Développement)
- **URL** : `http://localhost:8080`
- **Base de données** : PostgreSQL Docker (`localhost:5432`)
- **Utilisation** : Développement local
- **Modifications** : ✅ **IMMÉDIATES** (volume monté)
  - Le fichier `api.php` est monté en volume dans Docker
  - Modifiez `api.php` → Redémarrez l'API : `docker compose restart api`
  - **PAS besoin de rebuild** le conteneur Docker

### 2. **Render Production** (Déploiement)
- **URL** : `https://ott-jbln.onrender.com`
- **Base de données** : PostgreSQL Render (cloud)
- **Utilisation** : Production / Démo
- **Modifications** : ⚠️ Nécessite un **déploiement**
  1. Modifiez `api.php`
  2. Commit : `git add api.php && git commit -m "Fix notifications"`
  3. Push : `git push origin main`
  4. Render rebuild automatiquement

### 3. **Git Repository** (Code source)
- **URL** : `https://github.com/ymora/OTT`
- **Utilisation** : Stockage du code source
- **Modifications** : Versionnement uniquement

---

## 🛠️ Workflow de Développement

### Pour développer localement :

```bash
# 1. Démarrer Docker
docker compose up -d db api

# 2. Modifier api.php (dans votre éditeur)

# 3. Redémarrer l'API (les modifications sont déjà prises en compte)
docker compose restart api

# 4. Tester sur http://localhost:3000 (frontend Next.js)
```

**✅ Pas besoin de rebuild Docker** car `api.php` est monté en volume !

### Pour déployer en production :

```bash
# 1. Tester localement d'abord
docker compose restart api
# Tester sur http://localhost:3000

# 2. Si ça marche, commit et push
git add api.php
git commit -m "Fix: patient notifications"
git push origin main

# 3. Render rebuild automatiquement (2-3 minutes)
# Vérifier sur https://ott-jbln.onrender.com
```

---

## 🔍 Vérifier quel environnement utilise le frontend

### Frontend local (Next.js dev) :
Vérifiez `.env.local` :
```bash
NEXT_PUBLIC_API_URL=http://localhost:8080  # ← Docker local
# ou
NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com  # ← Render production
```

### Frontend production (GitHub Pages) :
Utilise toujours `https://ott-jbln.onrender.com` (hardcodé dans le build)

---

## ⚡ Résumé Rapide

| Action | Docker Local | Render Production |
|--------|-------------|-------------------|
| **Modifier api.php** | ✅ Éditer directement | ✅ Éditer + Git push |
| **Appliquer les changements** | `docker compose restart api` | Git push (auto rebuild) |
| **Rebuild nécessaire ?** | ❌ Non (volume monté) | ✅ Oui (via Git) |
| **Temps de mise à jour** | ~5 secondes | ~2-3 minutes |

---

## 🐛 Dépannage

### "Mes modifications ne sont pas prises en compte (Docker)"

```bash
# Vérifier que le volume est bien monté
docker compose exec api ls -la /var/www/html/api.php

# Vérifier la date de modification
# Doit correspondre à votre fichier local

# Redémarrer l'API
docker compose restart api
```

### "Le frontend pointe vers la mauvaise API"

Vérifiez `.env.local` :
```bash
# Pour Docker local
NEXT_PUBLIC_API_URL=http://localhost:8080

# Pour Render production  
NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com
```

Puis redémarrez Next.js :
```bash
npm run dev
```

---

**💡 Astuce** : Pour le développement, utilisez toujours Docker local (`localhost:8080`) pour des modifications rapides !

