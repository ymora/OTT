# 🤝 Collaboration Git - Configuration Rapide

## ⚡ Pour vous (Yannick) - À faire maintenant

### 1. Configuration GitHub (5 minutes)

#### Ajouter Maxime Berriot :
🔗 https://github.com/ymora/OTT/settings/access
- Cliquer "Invite a collaborator"
- Entrer l'email/username de Maxime
- Rôle : **Write**

#### Protéger la branche main :
🔗 https://github.com/ymora/OTT/settings/branches
- Cliquer "Add branch protection rule"
- Branch pattern : `main`
- Cocher :
  - ✅ Require pull request (1 approval)
  - ✅ Require conversation resolution
  - ✅ Do not allow bypassing ⚠️
  - ❌ Allow force pushes
  - ❌ Allow deletions

### 2. Pousser les fichiers de configuration

```powershell
git add .
git commit -m "docs: configuration workflow collaboration Git"
git push origin main
```

⚠️ **Après la protection, vous ne pourrez plus push directement sur main !**

---

## 📚 Documentation complète

- **Guide détaillé** : `WORKFLOW_COLLABORATION.md` (tout le processus)
- **Démarrage rapide** : `GUIDE_DEMARRAGE_COLLABORATION.md` (étapes concrètes)
- **Script d'aide** : `scripts/git-workflow-helper.ps1` (automatisation)

---

## 🛠️ Commandes rapides

### Créer une nouvelle branche
```powershell
.\scripts\git-workflow-helper.ps1 -Action create-branch -BranchType feature -BranchName "ma-fonctionnalite"
```

### Vérifier l'état
```powershell
.\scripts\git-workflow-helper.ps1 -Action check-status
```

### Synchroniser avec main
```powershell
.\scripts\git-workflow-helper.ps1 -Action sync-main
```

### Nettoyer les branches fusionnées
```powershell
.\scripts\git-workflow-helper.ps1 -Action cleanup
```

---

## 📧 Message pour Maxime

Une fois qu'il a accepté l'invitation :

```
Salut Maxime,

Le dépôt est prêt : https://github.com/ymora/OTT

Pour commencer :
1. git clone https://github.com/ymora/OTT.git
2. Lire WORKFLOW_COLLABORATION.md
3. Utiliser .\scripts\git-workflow-helper.ps1 pour créer des branches
4. Créer des Pull Requests sur GitHub pour validation

Toutes les modifications doivent passer par des PR avant fusion dans main.

Yannick
```

---

## ✅ Workflow en 3 étapes

### Pour Maxime (développement)
1. **Créer une branche** : `feature/ma-fonctionnalite`
2. **Développer et pousser** : `git push origin feature/ma-fonctionnalite`
3. **Créer une Pull Request** sur GitHub

### Pour vous (validation)
1. **Recevoir la notification** de PR
2. **Examiner le code** sur GitHub (onglet "Files changed")
3. **Approuver et merger** (ou demander des modifications)

### Après fusion
- **Maxime** : `git checkout main && git pull origin main`
- **Vous** : Votre main est déjà à jour

---

## 🔗 Liens rapides

- **Dépôt** : https://github.com/ymora/OTT
- **Pull Requests** : https://github.com/ymora/OTT/pulls
- **Paramètres** : https://github.com/ymora/OTT/settings
- **Branches** : https://github.com/ymora/OTT/branches

---

**Configuration estimée : 10 minutes** ⏱️

