# 🌟 Nouveau Workflow Multi-Services Render

## 🎯 Objectif
Éviter les redéploiements intempestifs en ayant des services dédiés par branche.

## 🏗️ Architecture

### **Services Render**
| Service | Branche | URL | Usage |
|---------|---------|-----|-------|
| `ott-dashboard` | `main` | https://ott-jbln.onrender.com | **Production** |
| `ott-dashboard-yannick` | `yannick` | https://ott-dashboard-yannick.onrender.com | **Dev Yannick** |
| `ott-dashboard-maxime` | `maxime` | https://ott-dashboard-maxime.onrender.com | **Dev Maxime** |

### **Base de données**
- **Unique** : `ott-data` (partagée entre les 3 services)
- **Commune** : Mêmes utilisateurs et données sur tous les services

---

## 🚀 Workflow de Travail

### **Pour Yannick**
```bash
# 1. Travailler sur ta branche
git checkout yannick
git pull origin yannick

# 2. Faire tes modifications
# ... ton code ...

# 3. Commiter et pousser
git add .
git commit -m "feat: ma fonctionnalité"
git push origin yannick

# 🎯 Résultat : 
# ✅ Auto-déploiement sur https://ott-dashboard-yannick.onrender.com
# ❌ PAS d'impact sur la production
# ❌ PAS d'impact sur le service de Maxime
```

### **Pour Maxime**
```bash
# 1. Travailler sur ta branche
git checkout maxime
git pull origin maxime

# 2. Faire tes modifications
# ... ton code ...

# 3. Committer et pousser
git add .
git commit -m "feat: ma fonctionnalité"
git push origin maxime

# 🎯 Résultat :
# ✅ Auto-déploiement sur https://ott-dashboard-maxime.onrender.com
# ❌ PAS d'impact sur la production
# ❌ PAS d'impact sur le service de Yannick
```

### **Pour la Production**
```bash
# 1. Merger les changements dans main
git checkout main
git merge yannick    # ou merge maxime
git push origin main

# 🎯 Résultat :
# ✅ Déploiement production sur https://ott-jbln.onrender.com
# ✅ Disponible pour les clients
```

---

## 🔧 Configuration Technique

### **Variables d'environnement**
Chaque service a ses propres variables :
- **Yannick** : `.env.yannick` → `NEXT_PUBLIC_API_URL=https://ott-dashboard-yannick.onrender.com`
- **Maxime** : `.env.maxime` → `NEXT_PUBLIC_API_URL=https://ott-dashboard-maxime.onrender.com`
- **Production** : `.env.production` → `NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com`

### **CORS configuré**
Chaque service accepte les requêtes des autres services :
```bash
CORS_ALLOWED_ORIGINS=https://ton-service.onrender.com,https://autre-service.onrender.com
```

---

## 🌐 Accès aux Services

### **Local (Docker)**
```bash
npm run dev:docker
# → http://localhost:3000 (API: http://localhost:8080)
```

### **Render Cloud**
- **Production** : https://ott-jbln.onrender.com
- **Dev Yannick** : https://ott-dashboard-yannick.onrender.com
- **Dev Maxime** : https://ott-dashboard-maxime.onrender.com

---

## 🔄 Synchronisation

### **Quand synchroniser les branches ?**
1. **Quand une fonctionnalité est terminée**
2. **Avant de merger dans main**
3. **Quand on veut les derniers changements**

```bash
# Maxime veut les changements de Yannick
git checkout maxime
git merge yannick
git push origin maxime

# Yannick veut les changements de Maxime
git checkout yannick
git merge maxime
git push origin yannick
```

---

## 🎯 Avantages

### **✅ Avantages**
- **Pas de redéploiement intempestif**
- **Isolation complète** des développements
- **Tests réels** sur Render en continu
- **Base de données partagée**
- **Déploiement automatique** par branche
- **Rollback facile** (revenir à une branche)

### **⚠️ Points d'attention**
- **3 services** = 3x plus de ressources (plan gratuit)
- **Base de données partagée** = attention aux conflits
- **URLs différentes** = bien tester sur la bonne URL

---

## 📊 Monitoring

### **Vérifier les services**
```bash
# Vérifier que les services sont up
curl https://ott-jbln.onrender.com/api.php/health
curl https://ott-dashboard-yannick.onrender.com/api.php/health
curl https://ott-dashboard-maxime.onrender.com/api.php/health
```

### **Logs Render**
- Dashboard Render → Service → Logs
- Chaque service a ses propres logs

---

## 🚨 Procédures d'urgence

### **Si un service est down**
1. **Vérifier les logs** sur Render
2. **Re-déployer** manuellement depuis le dashboard
3. **Revenir sur main** si nécessaire

### **Si la base est corrompue**
1. **Backup automatique** Render
2. **Restaurer** depuis un backup
3. **Notifier les autres développeurs**

---

## 🎉 Conclusion

**Ce workflow permet :**
- 🚀 **Développement parallèle** sans interférence
- 🔒 **Isolation** des environnements
- 🌐 **Tests réels** sur Render
- 📊 **Monitoring** individuel
- 🔄 **Synchronisation** contrôlée

**Plus besoin de se soucier des redéploiements !** 🎯
