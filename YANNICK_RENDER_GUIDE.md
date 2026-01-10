# 🚀 Configuration Render - Yannick

## 🎯 Ton service personnel

- **Nom** : `ott-dashboard-yannick`
- **URL** : https://ott-dashboard-yannick.onrender.com
- **Branche** : `yannick`
- **Base de données** : `ott-data` (partagée)

---

## 🔧 Étapes de configuration sur Render

### **1. Aller sur Render Dashboard**
1. Connecte-toi à https://dashboard.render.com
2. Va dans "New" → "Web Service"

### **2. Configuration du service**
- **Name** : `ott-dashboard-yannick`
- **Environment** : `Docker`
- **Region** : `Frankfurt` (ou la plus proche)
- **Branch** : `yannick`
- **Root Directory** : `.`
- **Dockerfile Path** : `./Dockerfile`
- **Health Check Path** : `/api.php/health`

### **3. Variables d'environnement**
Copie-colle ces variables dans "Environment" :

```bash
NODE_ENV=development
APP_ENV=development
NEXT_PUBLIC_API_MODE=development
NEXT_PUBLIC_API_URL=https://ott-dashboard-yannick.onrender.com
DATABASE_URL=postgresql://ott_data_user:lxNCXElZadbthGiOgT3cg2Y6JmMeMqUM@dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com/ott_data
DB_HOST=dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com
DB_PORT=5432
DB_NAME=ott_data
DB_USER=ott_data_user
DB_PASSWORD=lxNCXElZadbthGiOgT3cg2Y6JmMeMqUM
JWT_SECRET=happlyz_medical_ott_jwt_secret_2024_production
AUTH_DISABLED=false
CORS_ALLOWED_ORIGINS=https://ott-dashboard-yannick.onrender.com,https://ott-jbln.onrender.com,https://ott-dashboard-maxime.onrender.com
NEXT_PUBLIC_ENABLE_DEMO_RESET=false
DEBUG_ERRORS=true
```

### **4. Base de données**
Si la base `ott-data` n'existe pas :
1. Va dans "New" → "PostgreSQL"
2. **Name** : `ott-data`
3. **Database Name** : `ott_data`
4. **User** : `ott_data_user`
5. **Region** : `Frankfurt`
6. **Plan** : `Free`

### **5. Lien avec la base de données**
Dans ton service web, ajoute la base de données connectée.

---

## 🚀 Workflow de travail

### **Développement local**
```bash
# 1. S'assurer d'être sur la bonne branche
git checkout yannick
git pull origin yannick

# 2. Démarrer Docker local
npm run dev:docker

# 3. Travailler sur ton code
# ... modifications ...

# 4. Tester localement
# http://localhost:3000
```

### **Déploiement sur Render**
```bash
# 1. Committer tes changements
git add .
git commit -m "feat: ma fonctionnalité"

# 2. Pousser sur ta branche
git push origin yannick

# 🎯 Résultat :
# ✅ Auto-déploiement sur https://ott-dashboard-yannick.onrender.com
# ✅ Disponible immédiatement pour test
```

---

## 🔗 Accès et Connexion

### **URLs**
- **Ton service** : https://ott-dashboard-yannick.onrender.com
- **API Health** : https://ott-dashboard-yannick.onrender.com/api.php/health
- **Production** : https://ott-jbln.onrender.com
- **Service Maxime** : https://ott-dashboard-maxime.onrender.com

### **Connexion admin**
- **Email** : `ymora@free.fr`
- **Mot de passe** : `Ym120879`
- **Rôle** : Admin complet

---

## 🔄 Synchronisation

### **Récupérer les changements de main**
```bash
git checkout yannick
git merge main
git push origin yannick
```

### **Récupérer les changements de maxime**
```bash
git checkout yannick
git merge maxime
git push origin yannick
```

### **Mettre tes changements en production**
```bash
git checkout main
git merge yannick
git push origin main
```

---

## 🛠️ Dépannage

### **Si le service ne démarre pas**
1. **Vérifier les logs** sur Render
2. **Vérifier les variables d'environnement**
3. **Vérifier la connexion à la base de données**

### **Si l'API ne répond pas**
```bash
# Tester l'API
curl https://ott-dashboard-yannick.onrender.com/api.php/health
```

### **Si la base de données n'est pas accessible**
1. **Vérifier que la base `ott-data` existe**
2. **Vérifier les identifiants**
3. **Vérifier la région (doit être la même)**

---

## 📊 Monitoring

### **Logs Render**
- Dashboard → Services → ott-dashboard-yannick → Logs
- Temps réel : `tail -f`

### **Métriques**
- Dashboard → Services → ott-dashboard-yannick → Metrics
- CPU, mémoire, réseau

### **Health Check**
- Automatic toutes les 30s
- URL : `/api.php/health`

---

## 🎯 Bonnes pratiques

### **Commits réguliers**
- Pousse régulièrement pour voir tes changements en ligne
- Utilise des messages de commit clairs

### **Tests**
- Teste toujours en local avant de pousser
- Vérifie sur ton service Render avant de merger

### **Sécurité**
- Ne jamais pousser de secrets dans le code
- Utilise les variables d'environnement Render

---

## 🎉 C'est prêt !

**Une fois configuré sur Render, tu auras :**
- ✅ **Ton service personnel** isolé
- ✅ **Déploiement automatique** à chaque push
- ✅ **Base de données partagée** avec les autres
- ✅ **URL dédiée** pour tes tests
- ✅ **Logs et monitoring** individuels

**Plus besoin d'attendre personne pour déployer !** 🚀
