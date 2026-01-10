# 📋 Instructions pour Maxime - Travail sur Branche dédiée

## 🎯 Objectif
Travailler sur ta propre branche `maxime` sans toucher à `main`.

## 🌿 Ta branche est prête !
J'ai mis à jour ta branche `maxime` avec mon dernier commit de `main`.

### ✅ Ce qui est déjà fait :
- Ta branche `maxime` est à jour avec `main`
- Les notifications sont configurées pour tes pushes
- Tu as tous les derniers changements (corrections stats, notifications, etc.)

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

### **3. Travailler normalement**
```bash
# Faire tes modifications
# Ajouter tes fichiers
git add .
# Committer
git commit -m "ton message de commit"
```

### **4. Pousser sur ta branche**
```bash
git push origin maxime
```

---

## 📊 Ce qui se passe quand tu pousses :

### **Quand tu pousses sur `maxime` :**
- ✅ Yann reçoit une notification GitHub
- ✅ Les workflows GitHub Actions se déclenchent
- ✅ Une issue GitHub est créée pour Yann
- ❌ Tu ne touches PAS à `main` (sécurisé)

### **Quand Yann pousse sur `main` :**
- ✅ Tu reçois une notification GitHub
- ✅ Tu vois les changements de production

---

## 🔄 Pour synchroniser avec `main` :

Si tu veux récupérer les derniers changements de `main` :
```bash
git checkout maxime
git merge main
git push origin maxime
```

---

## ⚠️ Règles importantes :

1. **NE JAMAIS** pousser directement sur `main`
2. **TOUJOURS** travailler sur `maxime`
3. **Pousser** régulièrement pour que Yann voie ton travail
4. **Demander** à Yann de merger quand tu es prêt

---

## 🎉 Exemple de workflow complet :

```bash
# 1. Passer sur ta branche
git checkout maxime

# 2. Mettre à jour avec main (optionnel)
git merge main

# 3. Travailler sur un fichier
echo "mon code" > nouveau_fichier.js

# 4. Ajouter et committer
git add nouveau_fichier.js
git commit -m "✨ Ajout de ma fonctionnalité"

# 5. Pousser
git push origin maxime

# 🎯 Résultat : Yann est notifié automatiquement !
```

---

## 📞 Si besoin :

- **Yann** : ymora@free.fr
- **GitHub** : https://github.com/ymora/OTT
- **Issues** : https://github.com/ymora/OTT/issues

**Ta branche est prête, commence à coder !** 🚀
