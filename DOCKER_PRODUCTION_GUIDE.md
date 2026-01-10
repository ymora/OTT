# 🐳 Docker vs Production - Guide OTT

## 🎯 Objectif

Avoir deux environnements qui fonctionnent parfaitement :
- **Local** : Docker complet pour développement
- **Production** : Render pour la version web

---

## 🏠 **Mode Local (Docker)**

### Prérequis
- ✅ Docker Desktop installé et lancé
- ✅ Node.js 18+ installé

### Démarrage rapide
```bash
# Option 1: Script automatique
npm run dev:docker

# Option 2: Manuel
npm run docker:up
```

### Accès
- 📱 **Dashboard**: http://localhost:3000
- 🔌 **API**: http://localhost:8080/api.php/health
- 🗄️ **BDD**: db:5432 (ott_user/ott_password)

### Commandes utiles
```bash
npm run docker:logs    # Voir les logs
npm run docker:ps     # Voir les conteneurs
npm run docker:down   # Arrêter tout
```

---

## 🌐 **Mode Production (Render)**

### Configuration
Le fichier `.env.production` contient :
- URL API: `https://ott-jbln.onrender.com`
- BDD PostgreSQL Render
- CORS configuré pour les domaines Render

### Déploiement automatique
Les changements sur `main` sont déployés automatiquement sur Render.

---

## 📁 **Fichiers de configuration**

| Fichier | Usage | Contenu |
|---------|-------|---------|
| `.env.local` | **Docker local** | API localhost:8080 |
| `.env.development` | **Docker local** | Configuration Docker complète |
| `.env.production` | **Render** | API et BDD production |

---

## 🔄 **Comment ça fonctionne**

### Détection automatique de l'environnement

```javascript
// lib/config.js
function getApiMode() {
  // 1. Variable d'environnement explicite
  if (process.env.NEXT_PUBLIC_API_MODE) return mode
  
  // 2. URL API définie
  if (process.env.NEXT_PUBLIC_API_URL) return modeFromUrl
  
  // 3. NODE_ENV
  if (process.env.NODE_ENV === 'production') return 'production'
  
  // 4. Défaut: development
  return 'development'
}
```

### Proxy Next.js
En développement, Next.js redirige `/api.php/*` vers l'API Docker.

---

## 🛠️ **Dépannage**

### Docker ne démarre pas
```bash
# Vérifier Docker Desktop
docker info

# Redémarrer Docker Desktop
# Puis relancer:
npm run dev:docker
```

### API inaccessible
```bash
# Vérifier les conteneurs
npm run docker:ps

# Vérifier les logs
npm run docker:logs

# Redémarrer
npm run docker:down && npm run docker:up
```

### Variables d'environnement
```bash
# Vérifier les variables chargées
echo $NEXT_PUBLIC_API_URL
echo $NEXT_PUBLIC_API_MODE
```

---

## 🎯 **Workflow de développement**

1. **Local**: `npm run dev:docker`
2. **Tests**: `npm test`
3. **Commit**: `git add . && git commit -m "message"`
4. **Push**: `git push origin main`
5. **Production**: Déployé automatiquement sur Render

---

## 📊 **Différences clés**

| Caractéristique | Docker Local | Render Production |
|----------------|--------------|-------------------|
| URL API | http://localhost:8080 | https://ott-jbln.onrender.com |
| BDD | PostgreSQL Docker | PostgreSQL Render |
| Débogage | ✅ Activé | ❌ Désactivé |
| Hot reload | ✅ Oui | ❌ Non |
| Performance | ⚡ Rapide local | 🌐 Optimisée web |

---

## 🚀 **Pour aller plus loin**

### Ajouter un nouveau service
1. Modifier `docker-compose.yml`
2. Ajouter la configuration dans `.env.local`
3. Tester localement avec `npm run dev:docker`

### Mettre à jour la production
1. Modifier `.env.production`
2. Push sur `main`
3. Render déploie automatiquement

---

**🎉 C'est prêt ! Vous pouvez maintenant développer en Docker et déployer sur Render !**
