# 🚀 Guide de Déploiement Dashboard sur Render

Ce guide explique comment déployer le dashboard Next.js sur Render au lieu de GitHub Pages.

## 📋 Prérequis

- Compte Render (https://render.com)
- Repository GitHub avec le code OTT
- Service API déjà déployé sur Render (https://ott-jbln.onrender.com)

## 🔧 Configuration Render

### 1. Créer un nouveau service Web sur Render

1. Aller sur https://dashboard.render.com
2. Cliquer sur **"New +"** → **"Web Service"**
3. Connecter votre repository GitHub (`ymora/OTT`)
4. Configurer le service :

**Paramètres de base :**
- **Name** : `ott-dashboard` (ou votre choix)
- **Region** : Même région que votre API (ex: Frankfurt)
- **Branch** : `main`
- **Root Directory** : `/` (racine du repo)

**Build & Deploy :**
- **Environment** : `Docker`
- **Dockerfile Path** : `Dockerfile.dashboard`
- **Docker Context** : `/`

**Variables d'environnement :**
```
NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com
NEXT_PUBLIC_ENABLE_DEMO_RESET=false
NODE_ENV=production
```

**Build Command** : (laissé vide, Docker gère tout)

**Start Command** : (laissé vide, défini dans Dockerfile)

### 2. Configuration avancée (optionnel)

**Health Check Path** : `/` (ou `/dashboard`)

**Auto-Deploy** : `Yes` (déploiement automatique à chaque push)

## 🐳 Dockerfile

Le fichier `Dockerfile.dashboard` est déjà créé et configuré pour :
- Build optimisé multi-stage
- Mode standalone Next.js
- Image Alpine légère
- Utilisateur non-root pour la sécurité

## 📝 Variables d'environnement

| Variable | Description | Valeur |
|----------|-------------|--------|
| `NEXT_PUBLIC_API_URL` | URL de l'API backend | `https://ott-jbln.onrender.com` |
| `NEXT_PUBLIC_ENABLE_DEMO_RESET` | Activer reset démo | `false` (prod) |
| `NODE_ENV` | Environnement | `production` |

## 🚀 Déploiement

### Première fois

1. Créer le service sur Render (voir ci-dessus)
2. Render va automatiquement :
   - Cloner le repo
   - Builder l'image Docker
   - Démarrer le service
3. Attendre la fin du build (5-10 minutes)
4. L'URL sera : `https://ott-dashboard.onrender.com` (ou votre nom)

### Mises à jour

À chaque push sur `main`, Render redéploie automatiquement.

Pour forcer un redéploiement :
1. Render Dashboard → Service → **"Manual Deploy"** → **"Deploy latest commit"**

## ✅ Vérification

1. **Vérifier l'URL** : https://votre-service.onrender.com
2. **Tester la connexion** : Le dashboard doit se charger
3. **Vérifier l'API** : Le dashboard doit pouvoir se connecter à l'API backend

## 💰 Coûts

| Service | Plan | Prix |
|---------|------|------|
| Dashboard (Render) | Starter | **7€/mois** |
| API (Render) | Starter | **7€/mois** |
| PostgreSQL (Render) | Free | **0€** |
| **TOTAL** | | **14€/mois** |

> **Note** : Le plan Starter inclut :
> - 512 MB RAM
> - 0.5 CPU
> - 100 GB bandwidth/mois
> - Sleep après 15 min d'inactivité (gratuit) ou toujours actif (Starter)

## 🔄 Migration depuis GitHub Pages

Si vous migrez depuis GitHub Pages :

1. **Déployer sur Render** (voir ci-dessus)
2. **Mettre à jour les URLs** dans :
   - README.md
   - Documentation
   - Firmware (si configuré)
3. **Désactiver GitHub Pages** (optionnel) :
   - GitHub → Settings → Pages → Source : None

## 🐛 Dépannage

### Le build échoue

- Vérifier les logs dans Render Dashboard
- Vérifier que `Dockerfile.dashboard` existe
- Vérifier les variables d'environnement

### Le dashboard ne se charge pas

- Vérifier que le service est "Live" (pas "Sleeping")
- Vérifier les logs : Render Dashboard → Logs
- Vérifier que `NEXT_PUBLIC_API_URL` est correct

### Erreur 502 Bad Gateway

- Le service est probablement en train de démarrer
- Attendre 1-2 minutes
- Vérifier les logs pour les erreurs

### Le dashboard ne peut pas se connecter à l'API

- Vérifier `NEXT_PUBLIC_API_URL` dans les variables d'environnement
- Vérifier que l'API backend est accessible
- Vérifier les CORS dans l'API (ajouter l'URL du dashboard)

## 📚 Ressources

- [Documentation Render](https://render.com/docs)
- [Next.js Docker](https://nextjs.org/docs/deployment#docker-image)
- [Render Pricing](https://render.com/pricing)

---

**© 2025 HAPPLYZ MEDICAL SAS**

