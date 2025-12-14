# Comment Ajouter Maxime avec le Rôle Write (pas Admin)

## Problème
Quand vous retirez Maxime et que vous l'ajoutez de nouveau, GitHub ne demande pas toujours le rôle. Il peut utiliser le dernier rôle utilisé ou un rôle par défaut.

## Solution : Modifier le Rôle Après l'Invitation

### Méthode 1 : Modifier le Rôle de l'Invitation (Recommandé)

1. **Invitez Maxime** :
   - Allez sur : https://github.com/ymora/OTT/settings/access
   - Cliquez sur "Add people"
   - Entrez l'email : `maxime@happlyzmedical.com`
   - Cliquez sur "Add [nom] to this repository"

2. **Immédiatement après l'invitation** :
   - Vous verrez l'invitation en attente dans la liste
   - À côté de l'invitation, il y a un menu (3 points ou menu déroulant)
   - Cliquez sur ce menu
   - Sélectionnez "Change role" ou "Edit role"
   - Choisissez **"Write"** (PAS Admin, PAS Maintain)
   - Sauvegardez

### Méthode 2 : Modifier le Rôle Après Acceptation

Si Maxime a déjà accepté l'invitation :

1. Allez sur : https://github.com/ymora/OTT/settings/access
2. Trouvez Maxime dans la liste des collaborateurs
3. À côté de son nom, cliquez sur le menu (3 points ou menu déroulant)
4. Sélectionnez "Change role" ou "Manage access"
5. Changez de **Admin** à **Write**
6. Cliquez sur "Change role" ou "Save"

## Vérification

Après avoir défini le rôle à **Write**, vérifiez que :
- ✅ Maxime peut pusher sur sa branche `maxime`
- ❌ Maxime **NE PEUT PAS** pusher directement sur `main`
- ✅ Maxime doit créer une Pull Request pour fusionner dans `main`

## Test Rapide

Demandez à Maxime d'essayer :
```bash
git push origin main
```

Il devrait recevoir une erreur comme :
```
remote: error: GH006: Protected branch update failed for refs/heads/main.
remote: error: At least 1 approving review is required by reviewers with write access.
```

C'est normal et attendu ! Cela confirme que les règles de protection fonctionnent.

## Rôles Disponibles

- **Read** : Peut seulement lire (trop restrictif)
- **Write** : ✅ **RECOMMANDÉ** - Peut pusher sur ses branches, doit créer des PRs pour `main`
- **Maintain** : Similaire à Write, avec quelques permissions supplémentaires (acceptable)
- **Admin** : ❌ **À ÉVITER** - Peut bypasser les règles de protection
