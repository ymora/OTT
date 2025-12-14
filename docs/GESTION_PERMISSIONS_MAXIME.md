# Gestion des Permissions pour Maxime

## ⚠️ Problème Important
Si Maxime est **admin** du dépôt, il peut bypasser les règles de protection de branche et pusher directement sur `main`, même si vous avez configuré les règles de protection.

## ✅ Solution : S'assurer que Maxime n'a PAS les droits Admin

### Étape 1 : Vérifier les permissions actuelles
1. Allez sur : https://github.com/ymora/OTT/settings/access
2. Cherchez Maxime dans la liste des collaborateurs
3. Vérifiez son rôle actuel :
   - ❌ **Admin** = Peut bypasser les règles (PROBLÈME)
   - ✅ **Write** ou **Maintain** = Ne peut PAS bypasser (CORRECT)

### Étape 2 : Si Maxime est déjà collaborateur avec Admin
1. Cliquez sur le menu déroulant (3 points ou menu) à côté de son nom
2. Sélectionnez "Change role" ou "Manage access"
3. Changez le rôle de **Admin** à **Write** (ou **Maintain** si disponible)
4. Cliquez sur "Change role" ou "Save"

### Étape 3 : Si Maxime a une invitation en attente
1. Trouvez l'invitation pour `maxime@happlyzmedical.com`
2. **Modifiez le rôle de l'invitation** :
   - Cliquez sur le menu (3 points) à côté de l'invitation
   - Sélectionnez "Change role" ou "Edit role"
   - Choisissez **"Write"** (PAS Admin)
   - Sauvegardez
3. Si l'invitation propose déjà **Write** ou **Maintain** : ✅ C'est bon !

**Note** : Si GitHub ne demande pas le rôle lors de l'invitation, modifiez-le immédiatement après via le menu de l'invitation.

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
