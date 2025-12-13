# Workflow de Collaboration Git - Projet OTT

## 🎯 Objectif
Permettre à Maxime Berriot de travailler sur le projet tout en sécurisant la branche `main` avec validation obligatoire.

---

## 📝 Étape 1 : Ajouter Maxime comme collaborateur sur GitHub

### Sur GitHub (interface web) :
1. Aller sur : https://github.com/ymora/OTT
2. Cliquer sur **Settings** (Paramètres)
3. Dans le menu de gauche, cliquer sur **Collaborators** (Collaborateurs)
4. Cliquer sur **Add people** (Ajouter des personnes)
5. Entrer l'email ou le nom d'utilisateur GitHub de Maxime Berriot
6. Sélectionner le niveau d'accès : **Write** (Écriture)
7. Envoyer l'invitation

### Maxime recevra :
- Un email d'invitation
- Il devra accepter l'invitation pour avoir accès au dépôt

---

## 🔒 Étape 2 : Protéger la branche `main`

### Configuration de la protection de branche :

1. Sur GitHub, aller dans **Settings** > **Branches**
2. Cliquer sur **Add branch protection rule** (Ajouter une règle de protection)
3. Dans **Branch name pattern**, entrer : `main`

### Règles recommandées à activer :

#### ✅ Règles obligatoires :
- **Require a pull request before merging** ✓
  - **Require approvals** : 1 (vous devez approuver)
  - **Dismiss stale pull request approvals when new commits are pushed** ✓
  - **Require review from Code Owners** (optionnel)

- **Require status checks to pass before merging** ✓ (si vous avez des tests automatiques)
  - Sélectionner les checks requis (tests, linting, etc.)

- **Require conversation resolution before merging** ✓ (résoudre tous les commentaires)

- **Require linear history** ✓ (éviter les merge commits complexes)

- **Do not allow bypassing the above settings** ✓ (même pour les admins - IMPORTANT)

#### ⚠️ Règles de sécurité supplémentaires :
- **Restrict who can push to matching branches** : Limiter aux admins uniquement
- **Allow force pushes** : ❌ DÉSACTIVER (empêcher `git push --force`)
- **Allow deletions** : ❌ DÉSACTIVER (empêcher la suppression de `main`)

4. Cliquer sur **Create** pour sauvegarder

---

## 🌳 Étape 3 : Workflow de branches recommandé

### Structure des branches :

```
main (protégée)
├── develop (branche principale de développement - optionnelle)
├── feature/nom-fonctionnalite (branches de Maxime)
├── feature/autre-fonctionnalite
└── hotfix/correction-urgente
```

### Convention de nommage :
- `feature/description` : Nouvelles fonctionnalités
- `fix/description` : Corrections de bugs
- `hotfix/description` : Corrections urgentes
- `refactor/description` : Refactoring
- `docs/description` : Documentation

---

## 👨‍💻 Workflow pour Maxime Berriot

### 1. Cloner le dépôt (première fois)
```bash
git clone https://github.com/ymora/OTT.git
cd OTT
```

### 2. Créer une nouvelle branche pour travailler
```bash
git checkout main
git pull origin main
git checkout -b feature/ma-nouvelle-fonctionnalite
```

### 3. Travailler et commiter
```bash
# Faire des modifications
git add .
git commit -m "feat: description claire de la modification"

# Répéter autant de fois que nécessaire
```

### 4. Pousser la branche sur GitHub
```bash
git push origin feature/ma-nouvelle-fonctionnalite
```

### 5. Créer une Pull Request (PR)
1. Aller sur GitHub : https://github.com/ymora/OTT
2. Un bouton **Compare & pull request** apparaîtra automatiquement
3. Remplir :
   - **Titre** : Description claire de la fonctionnalité
   - **Description** : 
     - Ce qui a été fait
     - Pourquoi (contexte)
     - Comment tester
     - Screenshots si pertinent
4. Assigner **vous** comme reviewer
5. Créer la Pull Request

### 6. Attendre la validation
- Vous recevrez une notification
- Vous examinerez le code
- Vous pourrez :
  - Approuver et merger
  - Demander des modifications
  - Ajouter des commentaires

### 7. Après la fusion
```bash
# Revenir sur main et mettre à jour
git checkout main
git pull origin main

# Supprimer la branche locale (nettoyage)
git branch -d feature/ma-nouvelle-fonctionnalite
```

---

## 👤 Workflow pour vous (Validation)

### 1. Recevoir une notification de Pull Request
- Email de GitHub
- Notification sur GitHub

### 2. Examiner la Pull Request
1. Aller sur : https://github.com/ymora/OTT/pulls
2. Cliquer sur la PR à examiner
3. Onglet **Files changed** : Voir tous les changements

### 3. Révision du code
```bash
# Option 1 : Examiner en ligne sur GitHub (recommandé pour petites modifications)

# Option 2 : Tester localement (pour grosses modifications)
git fetch origin
git checkout feature/nom-de-la-branche-de-maxime
npm install  # Si besoin de nouvelles dépendances
npm run lint  # Vérifier le linting
npm test  # Exécuter les tests
npm run build  # Vérifier que ça compile

# Tester manuellement la fonctionnalité
# ...

# Revenir sur main après test
git checkout main
```

### 4. Ajouter des commentaires
- Cliquer sur les lignes de code pour ajouter des commentaires
- **Request changes** si des modifications sont nécessaires
- **Approve** si tout est bon

### 5. Fusionner la Pull Request
Une fois approuvée :
1. Cliquer sur **Merge pull request**
2. Choisir le type de merge :
   - **Create a merge commit** : Garde l'historique complet (recommandé)
   - **Squash and merge** : Combine tous les commits en un seul (pour nettoyer)
   - **Rebase and merge** : Historique linéaire (si "Require linear history" activé)
3. Confirmer le merge
4. Supprimer la branche sur GitHub (nettoyage automatique proposé)

---

## 🚨 Cas particuliers

### Maxime a besoin de vos dernières modifications
```bash
# Si vous avez fusionné du code pendant que Maxime travaille
git checkout feature/sa-branche
git pull origin main  # Récupérer les dernières modifications de main
# Résoudre les conflits si nécessaire
git push origin feature/sa-branche
```

### Correction urgente sur main (Hotfix)
Si VOUS devez corriger quelque chose d'urgent :
```bash
git checkout main
git pull origin main
git checkout -b hotfix/correction-urgente
# Faire la correction
git add .
git commit -m "hotfix: correction urgente"
git push origin hotfix/correction-urgente
# Créer une PR et la merger rapidement
```

### Résolution de conflits
Si la PR a des conflits avec `main` :
```bash
# Maxime doit faire :
git checkout feature/sa-branche
git pull origin main
# Résoudre les conflits dans les fichiers
git add .
git commit -m "fix: résolution des conflits avec main"
git push origin feature/sa-branche
# La PR sera automatiquement mise à jour
```

---

## 📋 Template de Pull Request

Créer un fichier `.github/pull_request_template.md` avec :

```markdown
## Description
<!-- Décrivez les modifications apportées -->

## Type de changement
- [ ] Nouvelle fonctionnalité (feature)
- [ ] Correction de bug (fix)
- [ ] Refactoring
- [ ] Documentation
- [ ] Autre (préciser)

## Modifications principales
<!-- Liste des principaux changements -->
- 
- 

## Comment tester
<!-- Étapes pour tester les modifications -->
1. 
2. 

## Checklist
- [ ] Le code compile sans erreurs (`npm run build`)
- [ ] Les tests passent (`npm test`)
- [ ] Le linting passe (`npm run lint`)
- [ ] L'audit de sécurité passe (si applicable)
- [ ] La documentation est à jour
- [ ] Les commentaires de code sont clairs
- [ ] Pas de code dupliqué ou mort introduit
- [ ] Les règles `.cursorrules` ont été respectées

## Screenshots (si applicable)
<!-- Ajouter des captures d'écran si pertinent -->

## Notes supplémentaires
<!-- Informations complémentaires pour le reviewer -->
```

---

## 🔧 Commandes Git utiles

### Pour Maxime
```bash
# Voir l'état actuel
git status

# Voir les branches
git branch -a

# Voir l'historique
git log --oneline --graph --all

# Annuler des modifications non commitées
git checkout -- fichier.js

# Modifier le dernier commit (si pas encore pushé)
git commit --amend

# Voir les différences
git diff

# Stash (mettre de côté temporairement)
git stash
git stash pop
```

### Pour vous
```bash
# Voir toutes les branches distantes
git branch -r

# Supprimer une branche locale
git branch -d nom-branche

# Supprimer une branche distante
git push origin --delete nom-branche

# Voir qui a modifié une ligne (blame)
git blame fichier.js
```

---

## 📊 Outils recommandés

### Extensions VS Code / Cursor
- **GitLens** : Voir l'historique Git directement dans l'éditeur
- **GitHub Pull Requests** : Gérer les PR depuis l'éditeur
- **Git Graph** : Visualiser l'historique graphiquement

### GitHub Actions (CI/CD)
Automatiser les vérifications à chaque PR :
- Linting automatique
- Tests automatiques
- Build de vérification
- Audit de sécurité

---

## 🎓 Ressources supplémentaires

- [GitHub Flow](https://guides.github.com/introduction/flow/) : Guide officiel du workflow GitHub
- [Conventional Commits](https://www.conventionalcommits.org/) : Convention de messages de commit
- [Git Branching Model](https://nvie.com/posts/a-successful-git-branching-model/) : Stratégie de branches détaillée

---

## ⚠️ Règles importantes

1. **JAMAIS** de push direct sur `main` (même pour vous après protection)
2. **TOUJOURS** créer une branche pour chaque fonctionnalité/correction
3. **TOUJOURS** faire une Pull Request, même pour vous
4. **TOUJOURS** tester le code avant de merger
5. **TOUJOURS** exécuter l'audit avant de merger des modifications importantes
6. **JAMAIS** de `git push --force` sur `main` ou les branches partagées
7. **TOUJOURS** écrire des messages de commit clairs et descriptifs

---

## 📞 Contact et Support

- **Questions sur le workflow** : Discuter ensemble
- **Problèmes Git** : Demander de l'aide avant de forcer quoi que ce soit
- **Revue de code** : Être constructif et respectueux dans les commentaires

---

**Date de création** : Décembre 2024  
**Dernière mise à jour** : Décembre 2024  
**Mainteneur** : Yannick Mora


