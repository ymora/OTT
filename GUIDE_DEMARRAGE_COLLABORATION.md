# 🚀 Guide de Démarrage Rapide - Collaboration Git

## ✅ Checklist de configuration

### 1️⃣ Configuration sur GitHub (À faire maintenant)

#### A. Ajouter Maxime Berriot comme collaborateur

1. **Aller sur votre dépôt GitHub** :
   - 🔗 https://github.com/ymora/OTT/settings/access

2. **Ajouter le collaborateur** :
   - Cliquer sur le bouton vert **"Invite a collaborator"**
   - Entrer l'email ou le nom d'utilisateur GitHub de Maxime Berriot
   - Sélectionner le rôle : **"Write"** (accès en écriture)
   - Envoyer l'invitation

3. **Maxime recevra** :
   - Un email avec un lien d'invitation
   - Il doit cliquer sur **"Accept invitation"** pour confirmer

#### B. Protéger la branche `main`

1. **Aller dans les paramètres de branches** :
   - 🔗 https://github.com/ymora/OTT/settings/branches

2. **Ajouter une règle de protection** :
   - Cliquer sur **"Add branch protection rule"**

3. **Configuration (copier-coller ces paramètres)** :

```
Branch name pattern: main
```

**Cocher ces options :**

✅ **Require a pull request before merging**
  - ✅ Require approvals: **1**
  - ✅ Dismiss stale pull request approvals when new commits are pushed

✅ **Require status checks to pass before merging** (si vous avez des tests automatiques)

✅ **Require conversation resolution before merging**

✅ **Require linear history** (optionnel mais recommandé)

✅ **Do not allow bypassing the above settings** ⚠️ IMPORTANT
  - Cette option empêche TOUT LE MONDE (même les admins) de bypass les règles

❌ **Allow force pushes** - DÉSACTIVER

❌ **Allow deletions** - DÉSACTIVER

4. **Sauvegarder** :
   - Cliquer sur **"Create"** en bas de la page

---

### 2️⃣ Pousser les nouveaux fichiers sur GitHub

```powershell
# Ajouter les nouveaux fichiers
git add WORKFLOW_COLLABORATION.md
git add GUIDE_DEMARRAGE_COLLABORATION.md
git add .github/pull_request_template.md
git add .github/CODEOWNERS
git add scripts/git-workflow-helper.ps1

# Commiter
git commit -m "docs: ajout documentation workflow collaboration et outils Git"

# Pousser sur main (dernière fois en direct!)
git push origin main
```

⚠️ **Après avoir configuré la protection de branche, vous ne pourrez plus push directement sur `main` !**

---

### 3️⃣ Tester le workflow (Simulation)

#### Test 1 : Créer une branche avec le script d'aide

```powershell
# Utiliser le script d'aide pour créer une branche de test
.\scripts\git-workflow-helper.ps1 -Action create-branch -BranchType feature -BranchName "test-workflow"

# Vérifier que vous êtes bien sur la nouvelle branche
git branch --show-current
# Devrait afficher: feature/test-workflow
```

#### Test 2 : Faire une modification test

```powershell
# Créer un fichier de test
echo "Test du workflow de collaboration" > test-collaboration.txt

# Ajouter et commiter
git add test-collaboration.txt
git commit -m "test: vérification du workflow de collaboration"

# Pousser la branche
git push origin feature/test-workflow
```

#### Test 3 : Créer une Pull Request

1. **Aller sur GitHub** :
   - Après le push, GitHub affiche un bouton **"Compare & pull request"**
   - Ou aller directement sur : https://github.com/ymora/OTT/pulls

2. **Cliquer sur "New pull request"** :
   - Base: `main`
   - Compare: `feature/test-workflow`

3. **Remplir le template automatique** :
   - Le template que nous avons créé apparaît automatiquement
   - Remplir les informations demandées
   - Vous assigner comme reviewer

4. **Créer la Pull Request**

#### Test 4 : Valider et fusionner

1. **Examiner la PR** :
   - Aller dans l'onglet **"Files changed"**
   - Voir les modifications

2. **Approuver** :
   - Cliquer sur **"Review changes"**
   - Sélectionner **"Approve"**
   - Ajouter un commentaire (optionnel)
   - Cliquer sur **"Submit review"**

3. **Merger** :
   - Cliquer sur **"Merge pull request"**
   - Confirmer
   - Supprimer la branche (GitHub propose automatiquement)

#### Test 5 : Nettoyer localement

```powershell
# Revenir sur main
git checkout main

# Mettre à jour main
git pull origin main

# Vérifier que la modification est bien là
cat test-collaboration.txt

# Nettoyer les branches fusionnées
.\scripts\git-workflow-helper.ps1 -Action cleanup
```

✅ **Si tout fonctionne, le workflow est prêt !**

---

### 4️⃣ Partager avec Maxime Berriot

Une fois que Maxime a accepté l'invitation, lui envoyer :

```
📧 Email à Maxime Berriot
--------------------------

Bonjour Maxime,

Tu as maintenant accès au dépôt GitHub du projet OTT.

🔗 Dépôt : https://github.com/ymora/OTT

📚 Documentation :
- Workflow de collaboration : Voir WORKFLOW_COLLABORATION.md dans le dépôt
- Guide de démarrage : Voir GUIDE_DEMARRAGE_COLLABORATION.md

🚀 Pour commencer :

1. Cloner le dépôt :
   git clone https://github.com/ymora/OTT.git
   cd OTT

2. Lire la documentation :
   - WORKFLOW_COLLABORATION.md : Processus complet
   - .cursorrules : Règles de code du projet

3. Créer ta première branche :
   .\scripts\git-workflow-helper.ps1 -Action create-branch -BranchType feature -BranchName "nom-de-ta-fonctionnalite"

4. Après tes modifications, créer une Pull Request sur GitHub
   Je la validerai avant fusion dans main.

⚠️ Règles importantes :
- Ne JAMAIS pusher directement sur main (c'est bloqué)
- Toujours travailler sur une branche dédiée
- Créer une Pull Request pour chaque fonctionnalité/correction
- Exécuter les tests avant de pusher (npm run lint, npm test)

📞 N'hésite pas si tu as des questions !

Yannick
```

---

## 🛠️ Commandes utiles du script d'aide

```powershell
# Voir l'aide complète
.\scripts\git-workflow-helper.ps1 -Action help

# Créer une nouvelle branche
.\scripts\git-workflow-helper.ps1 -Action create-branch -BranchType feature -BranchName "ma-fonctionnalite"

# Synchroniser avec main
.\scripts\git-workflow-helper.ps1 -Action sync-main

# Vérifier l'état du dépôt
.\scripts\git-workflow-helper.ps1 -Action check-status

# Nettoyer les branches fusionnées
.\scripts\git-workflow-helper.ps1 -Action cleanup

# Lister les Pull Requests (nécessite GitHub CLI)
.\scripts\git-workflow-helper.ps1 -Action list-prs
```

---

## 📋 Checklist finale

Avant de dire à Maxime que tout est prêt :

- [ ] Maxime a reçu et accepté l'invitation GitHub
- [ ] La branche `main` est protégée sur GitHub
- [ ] Les nouveaux fichiers sont pushés sur `main`
- [ ] Vous avez testé le workflow complet (création branche → PR → merge)
- [ ] Le template de PR s'affiche automatiquement
- [ ] Vous ne pouvez plus push directement sur `main` (c'est normal!)
- [ ] Maxime a reçu la documentation (email ci-dessus)

---

## 🆘 Dépannage

### Problème : "Protected branch hook declined"
✅ **C'est normal !** La protection fonctionne. Utilisez une Pull Request.

### Problème : Les Pull Requests ne demandent pas d'approbation
❌ Vérifier que "Require approvals" est bien activé dans les paramètres de protection.

### Problème : Maxime ne voit pas le dépôt
❌ Vérifier qu'il a accepté l'invitation (email de GitHub).

### Problème : Le template de PR ne s'affiche pas
❌ Vérifier que le fichier `.github/pull_request_template.md` est bien présent sur GitHub.

### Problème : Le script PowerShell ne s'exécute pas
❌ Exécuter : `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

---

## 📚 Ressources supplémentaires

- **Documentation complète** : `WORKFLOW_COLLABORATION.md`
- **GitHub Flow** : https://guides.github.com/introduction/flow/
- **Pull Requests** : https://docs.github.com/en/pull-requests
- **Branch Protection** : https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches

---

**Bon courage ! 🚀**


