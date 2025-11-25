# 🏗️ Architecture et Gestion des Environnements - OTT Dashboard

## 📋 Vue d'ensemble

Votre application utilise **3 environnements différents** qui fonctionnent ensemble :

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   DÉVELOPPEMENT  │         │   PRODUCTION     │         │  GITHUB PAGES   │
│     LOCAL        │         │     RENDER       │         │   (STATIQUE)    │
│                 │         │                  │         │                 │
│  Frontend:      │         │  Frontend:       │         │  Frontend:      │
│  Next.js Dev    │         │  Next.js Build   │         │  Export Statique│
│  (localhost:3000)│         │  (Render)        │         │  (GitHub Pages) │
│                 │         │                  │         │                 │
│  Backend:       │         │  Backend:        │         │  Backend:       │
│  Render API     │         │  Render API      │         │  Render API    │
│  (ott-jbln...)  │─────────▶│  (ott-jbln...)  │◀────────│  (ott-jbln...) │
└─────────────────┘         └──────────────────┘         └─────────────────┘
```

## 🔧 Les 3 Modes de Fonctionnement

### 1. 🖥️ Mode Développement Local (`npm run dev`)

**Quand l'utiliser :**
- Développement et tests locaux
- Débogage
- Modifications du code

**Comment ça marche :**
```bash
npm run dev
```

**Configuration automatique :**
- ✅ `NODE_ENV=development` (détecté automatiquement)
- ✅ `NEXT_STATIC_EXPORT=false` (par défaut)
- ✅ `basePath=''` (pas de préfixe, fonctionne sur `localhost:3000`)
- ✅ Proxy API activé : `/api.php/*` → `http://localhost:8000/api.php/*` (si API locale)
  OU → `https://ott-jbln.onrender.com/api.php/*` (si pas d'API locale)

**Variables d'environnement :**
Créez un fichier `.env.local` :
```env
NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com
# OU pour tester avec une API locale :
# NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Avantages :**
- Hot reload (rechargement automatique)
- Erreurs détaillées
- Pas besoin de rebuild
- Débogage facile

---

### 2. 🚀 Mode Production Render (`npm run build` + `npm start`)

**Quand l'utiliser :**
- Déploiement sur Render.com
- Serveur Next.js en production

**Comment ça marche :**
```bash
npm run build
npm start
```

**Configuration automatique :**
- ✅ `NODE_ENV=production` (détecté automatiquement)
- ✅ `NEXT_STATIC_EXPORT=false` (serveur Next.js)
- ✅ `basePath=''` (pas de préfixe)
- ✅ Pas de proxy (appels API directs)

**Variables d'environnement sur Render :**
Configurez dans le dashboard Render :
```env
NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com
NODE_ENV=production
```

**Avantages :**
- Performance optimisée
- SSR (Server-Side Rendering)
- Gestion des routes dynamiques

---

### 3. 📦 Mode Export Statique GitHub Pages (`npm run export`)

**Quand l'utiliser :**
- Déploiement sur GitHub Pages (gratuit, statique)
- Site statique sans serveur

**Comment ça marche :**
```bash
npm run export
```

**Configuration automatique :**
- ✅ `NEXT_STATIC_EXPORT=true` (forcé)
- ✅ `NODE_ENV=production`
- ✅ `basePath='/OTT'` (pour GitHub Pages)
- ✅ `assetPrefix='/OTT'` (pour les assets)
- ✅ Tous les fichiers générés dans `out/`

**Variables d'environnement :**
Dans le script `export` ou `.env.local` :
```env
NEXT_STATIC_EXPORT=true
NEXT_PUBLIC_BASE_PATH=/OTT
NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com
NODE_ENV=production
```

**Avantages :**
- Gratuit (GitHub Pages)
- Rapide (CDN)
- Pas de serveur à gérer

**Limitations :**
- Pas de SSR
- Pas de routes dynamiques
- Toutes les pages doivent être statiques

---

## 🔄 Comment le Code S'adapte Automatiquement

### Fichier `next.config.js`

Le code détecte automatiquement l'environnement :

```javascript
const isDev = process.env.NODE_ENV !== 'production'
const isStaticExport = process.env.NEXT_STATIC_EXPORT === 'true'

// En dev local : basePath = ''
// En export statique : basePath = '/OTT'
const basePath = (isDev || !isStaticExport) ? '' : '/OTT'
```

### Fichier `lib/config.js`

L'URL de l'API est configurable :

```javascript
BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'https://ott-jbln.onrender.com'
```

**Ordre de priorité :**
1. Variable d'environnement `NEXT_PUBLIC_API_URL`
2. Valeur par défaut : `https://ott-jbln.onrender.com`

### Proxy API en développement

Dans `next.config.js` :
```javascript
async rewrites() {
  if (isDev && !isStaticExport) {
    return [{
      source: '/api.php/:path*',
      destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api.php/:path*`
    }]
  }
  return []
}
```

**En développement :**
- Les appels à `/api.php/*` sont automatiquement redirigés vers l'API Render
- Pas besoin de gérer CORS
- Plus simple pour le développement

**En production/export :**
- Les appels vont directement à l'API Render
- CORS doit être configuré côté API

---

## 📝 Guide Pratique

### Scénario 1 : Développement Local

```bash
# 1. Créer .env.local
cp env.example .env.local

# 2. Modifier .env.local si besoin
# NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com

# 3. Lancer le serveur de développement
npm run dev

# 4. Ouvrir http://localhost:3000
```

**Résultat :**
- Frontend : `http://localhost:3000`
- Backend : `https://ott-jbln.onrender.com` (ou local si configuré)
- Hot reload activé
- Erreurs détaillées

---

### Scénario 2 : Test du Build Local

```bash
# 1. Build en mode production
npm run build

# 2. Tester localement
npm start

# 3. Ouvrir http://localhost:3000
```

**Résultat :**
- Frontend : `http://localhost:3000` (mode production)
- Backend : `https://ott-jbln.onrender.com`
- Performance optimisée
- Pas de hot reload

---

### Scénario 3 : Export pour GitHub Pages

```bash
# 1. Export statique
npm run export

# 2. Vérifier les fichiers générés
ls out/

# 3. Tester localement (optionnel)
npx serve out -p 3001
# Ouvrir http://localhost:3001/OTT

# 4. Déployer sur GitHub Pages
# (via GitHub Actions ou manuellement)
```

**Résultat :**
- Frontend : `https://ymora.github.io/OTT`
- Backend : `https://ott-jbln.onrender.com`
- Site statique
- Tous les fichiers dans `out/`

---

## 🔍 Vérification de l'Environnement Actuel

### Comment savoir dans quel mode vous êtes ?

**En développement :**
```javascript
// Dans le code
console.log('NODE_ENV:', process.env.NODE_ENV)
console.log('NEXT_STATIC_EXPORT:', process.env.NEXT_STATIC_EXPORT)
console.log('API URL:', process.env.NEXT_PUBLIC_API_URL)
```

**Dans le navigateur (console) :**
```javascript
// Vérifier l'URL de l'API
console.log('API URL:', process.env.NEXT_PUBLIC_API_URL || 'https://ott-jbln.onrender.com')

// Vérifier le basePath
console.log('Base Path:', window.location.pathname)
```

---

## 🎯 Résumé des Commandes

| Commande | Mode | URL | Usage |
|----------|------|-----|-------|
| `npm run dev` | Développement | `localhost:3000` | Développement |
| `npm run build` + `npm start` | Production | Render URL | Production Render |
| `npm run export` | Statique | `ymora.github.io/OTT` | GitHub Pages |

---

## ⚙️ Configuration Recommandée

### Fichier `.env.local` (développement)

```env
# API Backend (toujours Render en production)
NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com

# Pour tester avec une API locale (optionnel)
# NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Variables sur Render (production)

```env
NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com
NODE_ENV=production
```

### Variables pour GitHub Actions (export statique)

```env
NEXT_STATIC_EXPORT=true
NEXT_PUBLIC_BASE_PATH=/OTT
NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com
NODE_ENV=production
```

---

## ❓ Questions Fréquentes

### Q: Comment utiliser l'API locale en développement ?

**R:** Modifiez `.env.local` :
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Q: Le code fonctionne-t-il différemment selon l'environnement ?

**R:** Non ! Le code est le même. Seule la **configuration** change automatiquement selon les variables d'environnement.

### Q: Puis-je avoir les 3 environnements en même temps ?

**R:** Oui ! Chacun utilise des ports/URLs différents :
- Dev local : `localhost:3000`
- Render : Votre URL Render
- GitHub Pages : `ymora.github.io/OTT`

### Q: Comment savoir quelle API est utilisée ?

**R:** Vérifiez dans la console du navigateur (Network tab) ou ajoutez un log :
```javascript
console.log('API URL:', process.env.NEXT_PUBLIC_API_URL)
```

---

## 🎉 Conclusion

**Le code s'adapte automatiquement !** Vous n'avez qu'à :
1. **Développement** : `npm run dev` (utilise Render API par défaut)
2. **Production Render** : `npm run build` + déployer sur Render
3. **GitHub Pages** : `npm run export` + déployer via GitHub Actions

Tous utilisent la même API Render (`https://ott-jbln.onrender.com`) sauf si vous configurez autrement dans `.env.local`.

---

## 🏗️ Bonnes Pratiques de Développement

### Architecture Modulaire de l'API PHP

L'API PHP a été refactorisée en modules pour améliorer la maintenabilité. Voir [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md#-architecture-modulaire-de-lapi-php) pour les détails complets.

**Structure actuelle :**
- `api.php` : Point d'entrée (routing, CORS)
- `api/helpers.php` : Fonctions utilitaires partagées
- `api/handlers/` : Handlers par domaine (auth, devices, firmwares, notifications)

### Checklist Avant Commit

**Frontend (Next.js) :**
```bash
# Vérifier le linting
npm run lint

# Tester le build
npm run build

# Vérifier les variables d'environnement
cat .env.local  # Ne pas commiter ce fichier !
```

**Backend (PHP) :**
```bash
# Vérifier la syntaxe PHP
php -l api.php
php -l api/helpers.php
php -l api/handlers/*.php

# Vérifier les doublons de fonctions
grep -r "^function " api/ | sort | uniq -d

# Vérifier les tags PHP manquants
grep -L "^<?php" api/**/*.php
```

**Git :**
```bash
# Vérifier les fichiers modifiés
git status

# Vérifier les différences
git diff

# Ne pas commiter :
# - .env.local
# - node_modules/
# - out/
# - Fichiers temporaires
```

### Principes de Refactoring

1. **Séparation des responsabilités** : Chaque handler gère un domaine fonctionnel
2. **Pas de duplication** : Fonctions communes dans `helpers.php`
3. **Chemins relatifs** : Utiliser `__DIR__` pour les includes
4. **Tags PHP obligatoires** : Tous les fichiers PHP commencent par `<?php`
5. **Validation systématique** : Vérifier la syntaxe PHP avant commit

### Gestion des Erreurs

**En développement local :**
- Erreurs détaillées dans la console du navigateur
- Logs PHP dans la console du serveur (`php -S localhost:8000`)
- React DevTools pour inspecter les composants

**En production (Render) :**
- Vérifier les logs Render : Dashboard → Service → Logs
- Tester l'endpoint `/health` : `https://ott-jbln.onrender.com/api.php/health`
- Vérifier les variables d'environnement dans le dashboard Render

### Déploiement

**Workflow recommandé :**
1. **Développement local** : `npm run dev` → Tester sur `localhost:3000`
2. **Validation** : Vérifier syntaxe PHP, linting, build
3. **Commit** : `git add . && git commit -m "Description"`
4. **Push** : `git push origin main`
5. **Vérification** : Attendre le déploiement Render (2-5 minutes)
6. **Test production** : Vérifier `https://ott-jbln.onrender.com/api.php/health`

**En cas d'erreur après déploiement :**
1. Vérifier les logs Render
2. Tester l'endpoint `/health`
3. Vérifier les variables d'environnement
4. Vérifier que tous les fichiers sont bien déployés (Dockerfile, .htaccess)
5. Si nécessaire, faire un "Manual Deploy" depuis le dashboard Render

