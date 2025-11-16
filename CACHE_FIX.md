# 🔄 Instructions pour vider le cache et voir la version à jour

## Problème
Le navigateur affiche une ancienne version en cache.

## Solutions (essayez dans l'ordre)

### 1. Rechargement forcé (le plus rapide)
- **Windows/Linux** : `Ctrl + Shift + R` ou `Ctrl + F5`
- **Mac** : `Cmd + Shift + R`

### 2. Vider le cache du navigateur

#### Chrome/Edge :
1. Ouvrez les DevTools : `F12`
2. Clic droit sur le bouton de rechargement
3. Sélectionnez "Vider le cache et effectuer une actualisation forcée"

OU

1. `Ctrl + Shift + Delete`
2. Cochez "Images et fichiers en cache"
3. Sélectionnez "Dernière heure"
4. Cliquez sur "Effacer les données"

#### Firefox :
1. `Ctrl + Shift + Delete`
2. Cochez "Cache"
3. Cliquez sur "Effacer maintenant"

### 3. Mode navigation privée
Ouvrez une fenêtre de navigation privée :
- **Chrome/Edge** : `Ctrl + Shift + N`
- **Firefox** : `Ctrl + Shift + P`

Puis allez sur `http://localhost:3000`

### 4. Désactiver le cache dans DevTools
1. Ouvrez les DevTools : `F12`
2. Allez dans l'onglet "Network" (Réseau)
3. Cochez "Disable cache" (Désactiver le cache)
4. Gardez les DevTools ouverts
5. Rechargez la page : `F5`

## Vérification

Après avoir vidé le cache, vous devriez voir :
- ✅ Menu avec "Diagnostics" dans `/dashboard/diagnostics`
- ✅ Page Dispositifs avec carte en haut + tableau
- ✅ Toutes les pages sous `/dashboard/`
- ✅ Pas de liens cassés

## Si ça ne fonctionne toujours pas

1. Arrêtez le serveur : `.\scripts\dev.ps1 stop`
2. Supprimez `.next` : `Remove-Item -Recurse -Force .next`
3. Redémarrez : `.\scripts\dev.ps1 start`
4. Videz le cache du navigateur (voir ci-dessus)
5. Rechargez : `Ctrl + Shift + R`

