# Configuration Protection Branche Main

## Objectif
- **Vous (admin)** : Pouvez pusher directement sur `main`
- **Maxime** : Doit créer une Pull Request et attendre votre approbation

## Configuration sur GitHub

### Étape 1 : Aller sur les paramètres de branches
1. Allez sur : https://github.com/ymora/OTT/settings/branches
2. Trouvez la règle pour la branche `main`
3. Cliquez sur "Edit" (ou créez une nouvelle règle si elle n'existe pas)

### Étape 2 : Configurer la protection
Cochez les options suivantes :

✅ **Require pull request reviews before merging**
   - Number of required reviewers: `1`
   - ✅ Dismiss stale pull request approvals when new commits are pushed
   - ✅ Require review from Code Owners (si vous avez un fichier CODEOWNERS)

✅ **Require status checks to pass before merging** (optionnel, si vous avez des tests)

✅ **Require conversation resolution before merging** (optionnel)

❌ **NE PAS COCHER** : "Do not allow bypassing the above settings"
   - Cette option doit être **DÉCOCHÉE** pour que vous (admin) puissiez pusher directement

### Étape 3 : Restreindre qui peut pusher (optionnel)
**Note** : Cette option peut ne pas être visible selon votre plan GitHub.

Si elle est disponible, cherchez dans la section avancée ou tout en bas de la page :
- "Restrict who can push to matching branches"
- OU "Allow specified actors to bypass required pull requests"

Si vous ne voyez pas cette option :
- Pas de problème ! Avec "Do not allow bypassing" décoché, vous (admin) pourrez pusher directement
- Maxime devra quand même passer par une PR car il n'est pas admin

### Étape 4 : Sauvegarder
Cliquez sur "Save changes"

## Résultat

- ✅ **Vous** : Pouvez pusher directement sur `main` (admin bypass)
- ✅ **Maxime** : Doit créer une PR depuis sa branche `maxime` vers `main`
- ✅ **Vous** : Devez approuver la PR de Maxime avant qu'elle puisse être fusionnée

## Workflow pour Maxime

1. Maxime travaille sur sa branche `maxime`
2. Maxime pousse sur `origin/maxime`
3. Maxime crée une Pull Request depuis `maxime` vers `main`
4. Vous recevez une notification
5. Vous examinez la PR et cliquez sur "Approve"
6. Maxime peut alors fusionner la PR (ou vous pouvez le faire)

## Workflow pour vous

1. Vous travaillez directement sur `main`
2. Vous poussez directement : `git push origin main`
3. Pas besoin de PR pour vous
