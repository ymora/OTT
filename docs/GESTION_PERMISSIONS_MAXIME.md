# Gestion des Permissions pour Maxime

## Problème
Si Maxime est **admin** du dépôt, il peut bypasser les règles de protection de branche et pusher directement sur `main`, même si vous avez configuré les règles de protection.

## Solution : Retirer les droits Admin à Maxime

### Étape 1 : Vérifier les permissions actuelles
1. Allez sur : https://github.com/ymora/OTT/settings/access
2. Cherchez Maxime dans la liste des collaborateurs
3. Vérifiez son rôle actuel (Admin, Write, Read, etc.)

### Étape 2 : Modifier les permissions
Si Maxime est **Admin** :
1. Cliquez sur le menu déroulant à côté de son nom
2. Changez le rôle de **Admin** à **Write** (ou **Maintain** si disponible)
3. Cliquez sur "Change role" ou "Save"

### Étape 3 : Vérifier la configuration
- **Maxime avec rôle "Write"** : 
  - ✅ Peut créer des branches
  - ✅ Peut pusher sur sa branche `maxime`
  - ❌ **NE PEUT PAS** pusher directement sur `main` (protégée)
  - ✅ **DOIT** créer une Pull Request pour fusionner dans `main`
  - ✅ Vous devez approuver sa PR avant qu'elle puisse être fusionnée

### Étape 4 : Confirmer les règles de protection
Assurez-vous que sur la page :
https://github.com/ymora/OTT/settings/branch_protection_rules/70760562

- ✅ "Require a pull request before merging" est **COCHÉ**
- ✅ "Do not allow bypassing the above settings" est **DÉCOCHÉ** (pour vous permettre de bypasser)
- ⚠️ **IMPORTANT** : Même si cette case est décochée, Maxime (non-admin) ne pourra PAS bypasser

## Résultat Final

### Vous (Admin)
- ✅ Pouvez pusher directement sur `main`
- ✅ Devez approuver les PRs de Maxime

### Maxime (Write/Maintain)
- ✅ Peut travailler sur sa branche `maxime`
- ✅ Peut créer des Pull Requests
- ❌ **NE PEUT PAS** pusher directement sur `main`
- ❌ **NE PEUT PAS** fusionner sa PR sans votre approbation

## Vérification
Pour tester que Maxime ne peut pas pusher directement :
1. Demandez à Maxime d'essayer : `git push origin main`
2. Il devrait recevoir une erreur indiquant que la branche est protégée
3. Il devra créer une PR depuis `maxime` vers `main`
