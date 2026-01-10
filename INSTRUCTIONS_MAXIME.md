# 📋 Instructions pour Maxime - Travail sur Branche dédiée

## 🎯 Objectif
Travailler sur ta propre branche `maxime` avec ton service Render personnel.

## 🌿 Ta branche est prête !
J'ai mis à jour ta branche `maxime` avec toute la configuration Docker + Render.

### ✅ Ce qui est déjà fait :
- Ta branche `maxime` est à jour avec `main`
- Configuration Render personnelle (`ott-dashboard-maxime`)
- Docker local fonctionnel (`npm run dev:docker`)
- Workflow Docker + Render isolé
- Guide complet de configuration

---

## 🚀 Comment travailler :

### **1. Cloner le repository (première fois)**
```bash
git clone https://github.com/ymora/OTT.git
cd OTT
```

### **2. Passer sur ta branche**
```bash
git checkout maxime
git pull origin maxime
```

### **3. Travailler en local (Docker)**
```bash
npm run dev:docker
# → http://localhost:3000 (API: http://localhost:8080)
```

### **4. Déployer sur Render**
```bash
git add .
git commit -m "feat: ma fonctionnalité"
git push origin maxime
# → Auto-déploiement sur https://ott-dashboard-maxime.onrender.com
```
---

## 🔗 Tes URLs personnelles

### **Local (Docker)**
- **Dashboard** : http://localhost:3000
- **API** : http://localhost:8080/api.php/health
- **Base** : PostgreSQL Docker locale

### **Render (Cloud)**
- **Dashboard** : https://ott-dashboard-maxime.onrender.com
- **API** : https://ott-dashboard-maxime.onrender.com/api.php/health
- **Base** : PostgreSQL partagé

### **Connexion admin**
- **Email** : `Maxime@happlyzmedical.com`
- **Mot de passe** : `Maxime2024`

---

## 📋 Configuration Render

### **Fichiers pour toi**
- `MAXIME_RENDER_GUIDE.md` - Guide complet pas à pas
- `render-maxime.yaml` - Configuration Render
- `DOCKER_RENDER_WORKFLOW.md` - Workflow Docker + Render

### **Étapes sur Render**
1. Va sur https://dashboard.render.com
2. "New" → "Web Service"
3. Configure avec `MAXIME_RENDER_GUIDE.md`
4. Attends le déploiement automatique

---

## 🔄 Workflow avec Yannick

### **Services isolés**
- **Yannick** : https://ott-dashboard-yannick.onrender.com
- **Maxime** : https://ott-dashboard-maxime.onrender.com
- **Production** : https://ott-jbln.onrender.com

### **Synchronisation**
```bash
# Récupérer les changements de Yannick
git checkout maxime
git merge yannick
git push origin maxime

# Mettre en production
git checkout main
git merge maxime
git push origin main
```

---

## ⚠️ Règles importantes

1. **TOUJOURS** travailler sur `maxime`
2. **JAMAIS** pousser directement sur `main`
3. **TESTER** en local avant de pousser
4. **Pousser** régulièrement pour voir tes changements en ligne

---

## 🎉 Exemple de workflow complet

```bash
# 1. Travailler en local
git checkout maxime
npm run dev:docker

# 2. Faire tes modifications
echo "mon code" > nouveau_fichier.js

# 3. Tester localement
curl http://localhost:8080/api.php/health

# 4. Ajouter et committer
git add nouveau_fichier.js
git commit -m "✨ Ajout de ma fonctionnalité"

# 5. Pousser
git push origin maxime

# 🎯 Résultat : 
# ✅ Auto-déploiement sur ton service Render
# ✅ Disponible immédiatement pour test
# ❌ Pas d'impact sur Yannick ou la production
```

---

## 🎯 C'est prêt !

**Tu peux maintenant :**
- ✅ Développer en local avec Docker
- ✅ Déployer sur ton service Render personnel
- ✅ Travailler sans impacter Yannick
- ✅ Tester en temps réel sur le cloud

**Plus besoin d'attendre personne pour déployer !** 🚀

---

## 📞 Si besoin :

- **Yann** : ymora@free.fr
- **GitHub** : https://github.com/ymora/OTT
- **Issues** : https://github.com/ymora/OTT/issues

**Ta branche est prête, commence à coder !** 🚀
