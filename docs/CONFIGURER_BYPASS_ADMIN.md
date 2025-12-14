# Configurer le Bypass Admin pour Pusher Directement

## Page de configuration
https://github.com/ymora/OTT/settings/branch_protection_rules/70760562

## Étapes pour permettre le push direct (admin)

### 1. Trouver l'option "Do not allow bypassing"
- Faites défiler sur la page de la règle
- Cherchez la section "Rules applied to everyone including administrators"
- Dans cette section, cherchez "Do not allow bypassing the above settings"
- **IMPORTANT** : Cette case doit être **DÉCOCHÉE** (non cochée)
- ⚠️ **ATTENTION** : Ce n'est PAS la section "Allow force pushes" (c'est différent)

### 2. Si vous voyez "Allow specified actors to bypass"
- Cherchez cette option (peut être en bas de page ou dans une section avancée)
- Cliquez sur "Add" ou le bouton pour ajouter des acteurs
- Ajoutez votre compte : `ymora`
- Sauvegardez

### 3. Alternative : Vérifier les permissions
Si vous ne voyez pas l'option de bypass :
- Vérifiez que vous êtes bien admin du dépôt
- Vérifiez que "Do not allow bypassing" est bien **DÉCOCHÉ**
- En tant qu'admin, vous devriez pouvoir pusher directement si cette option est décochée

## Test
Après configuration :
1. Allez sur votre dépôt local
2. Faites une modification
3. Commitez : `git commit -m "test"`
4. Poussez : `git push origin main`
5. Si ça fonctionne, c'est bon ! ✅

## Si ça ne fonctionne pas
- Vérifiez que vous êtes bien connecté avec le compte `ymora`
- Vérifiez que vous avez bien les droits admin sur le dépôt
- Vérifiez que "Do not allow bypassing" est décoché
