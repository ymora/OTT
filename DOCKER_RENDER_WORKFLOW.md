# 🐳 Docker + Render - Workflow Yannick

## 🎯 Objectif
Travailler en local avec Docker, pousser sur Render sans conflit.

---

## 🔄 Comment ça fonctionne

### **Local (Docker)**
- **Fichier** : `.env.local` 
- **API URL** : `http://localhost:8080`
- **Base** : PostgreSQL Docker (`db:5432`)
- **Commande** : `npm run dev:docker`

### **Render (Yannick)**
- **Fichier** : Variables Render (dashboard)
- **API URL** : `https://ott-dashboard-yannick.onrender.com`
- **Base** : PostgreSQL Render partagé
- **Déclencheur** : `git push origin yannick`

---

## 🚀 Workflow complet

### **1. Développement local**
```bash
# S'assurer d'être sur la bonne branche
git checkout yannick
git pull origin yannick

# Démarrer Docker (utilise .env.local)
npm run dev:docker

# Travail normal...
# - API: http://localhost:8080
# - Front: http://localhost:3000
# - Base: db:5432 (Docker)
```

### **2. Tests locaux**
```bash
# Vérifier que tout fonctionne
curl http://localhost:8080/api.php/health
curl http://localhost:3000

# Vérifier la base Docker
docker-compose exec db psql -U ott_user -d ott -c "SELECT COUNT(*) FROM users;"
```

### **3. Déploiement Render**
```bash
# Committer (NE PAS TOUCHER à .env.local)
git add .
git commit -m "feat: ma fonctionnalité testée en local"
git push origin yannick

# 🎯 Résultat :
# ✅ Render déploie avec SES variables
# ✅ Docker local reste inchangé
# ✅ Pas de redéploiement intempestif
```

---

## 📁 Fichiers de configuration

### **Local Docker (.env.local)**
```bash
NEXT_PUBLIC_API_URL=http://localhost:8080
DATABASE_URL=postgresql://ott_user:ott_password@db:5432/ott
DB_HOST=db
DB_PORT=5432
DB_NAME=ott
DB_USER=ott_user
DB_PASSWORD=ott_password
```

### **Render Yannick (variables Render)**
```bash
NEXT_PUBLIC_API_URL=https://ott-dashboard-yannick.onrender.com
DATABASE_URL=postgresql://ott_data_user:lxNCXElZadbthGiOgT3cg2Y6JmMeMqUM@dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com/ott_data
DB_HOST=dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com
# ... autres variables Render
```

---

## 🔧 Configuration Next.js

### **Détection automatique (next.config.js)**
```javascript
function getApiUrl() {
  // 1. Priorité: Variable explicite (.env.local ou Render)
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL
  }
  
  // 2. Sinon: Détection du mode
  const apiUrls = {
    production: 'https://ott-jbln.onrender.com',
    development: 'http://localhost:8080',
  }
  
  return apiUrls[mode]
}
```

### **Résultat**
- **Local** : `http://localhost:8080` (depuis .env.local)
- **Render** : `https://ott-dashboard-yannick.onrender.com` (depuis variables Render)

---

## 🛡️ Protection contre les conflits

### **Fichiers qui ne changent pas**
- ✅ `.env.local` : reste pour Docker local
- ✅ `docker-compose.yml` : reste pour local
- ✅ `Dockerfile` : commun aux deux environnements

### **Fichiers qui peuvent changer**
- 📝 Code source (`app/`, `components/`, `lib/`, etc.)
- 📝 Configuration API (`api/`)
- 📝 Documentation (`public/docs/`)

### **Variables d'environnement**
- 🐳 **Docker** : `.env.local` (jamais poussé)
- 🌐 **Render** : Dashboard Render (jamans dans .env)
- 🔄 **Isolation** : Parfaite !

---

## 🧪 Tests et validation

### **Test 1 : Docker local**
```bash
# Démarrer Docker
npm run dev:docker

# Vérifier que ça pointe bien sur localhost
curl http://localhost:3000 | grep -i "localhost"
```

### **Test 2 : Render Yannick**
```bash
# Pousser et vérifier
git push origin yannick

# Attendre déploiement puis tester
curl https://ott-dashboard-yannick.onrender.com/api.php/health
```

### **Test 3 : Isolation**
```bash
# Modifier .env.local (pour tests)
# NEXT_PUBLIC_API_URL=http://localhost:9999

# Pousser sur Render
git push origin yannick

# Vérifier que Render n'est PAS affecté
curl https://ott-dashboard-yannick.onrender.com/api.php/health
# Doit toujours fonctionner avec l'URL Render
```

---

## 🎯 Bonnes pratiques

### **Commits propres**
```bash
# ✅ BON : Ne jamais committer .env.local
echo ".env.local" >> .gitignore

# ✅ BON : Commiter seulement le code
git add app/ components/ lib/ api/
git commit -m "feat: nouvelle fonctionnalité"

# ❌ MAUVAIS : Modifier les variables d'environnement
# git add .env.local  # À NE JAMAIS FAIRE !
```

### **Tests systématiques**
1. **Toujours tester en local** avant de pousser
2. **Vérifier l'API Docker** : `curl http://localhost:8080/api.php/health`
3. **Vérifier le front Docker** : `curl http://localhost:3000`
4. **Pousser seulement si tout fonctionne**

### **Monitoring**
- **Local** : `docker-compose logs -f`
- **Render** : Dashboard Render → Logs

---

## 🚨 Dépannage

### **Si Docker ne fonctionne plus**
```bash
# Recréer les conteneurs
docker-compose down
docker-compose up -d --build

# Vérifier les variables
docker-compose exec api env | grep NEXT_PUBLIC
```

### **Si Render ne déploie pas**
1. **Vérifier les logs** sur Render
2. **Vérifier les variables** d'environnement
3. **Vérifier la branche** (`yannick`)

### **Si l'API ne répond pas**
```bash
# Local
curl http://localhost:8080/api.php/health

# Render
curl https://ott-dashboard-yannick.onrender.com/api.php/health
```

---

## 🎉 Conclusion

**Le workflow est parfait :**
- ✅ **Docker local** : `.env.local` inchangé
- ✅ **Render Yannick** : Variables Render isolées
- ✅ **Push automatique** : Sans impact sur local
- ✅ **Tests réels** : Les deux environnements fonctionnent

**Tu peux développer en Docker et déployer sur Render sans aucun conflit !** 🚀
