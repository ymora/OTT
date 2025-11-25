# 🔄 Comment Réinitialiser Microsoft Edge

## Option 1 : Réinitialisation Complète (Recommandé)

1. **Ouvrez Edge**
2. Allez dans **Paramètres** :
   - Cliquez sur les **3 points** (⋮) en haut à droite
   - Sélectionnez **Paramètres**
3. Allez dans **Réinitialiser les paramètres** :
   - Dans le menu de gauche, cliquez sur **Réinitialiser les paramètres**
   - Ou tapez `edge://settings/reset` dans la barre d'adresse
4. Cliquez sur **Restaurer les paramètres à leurs valeurs par défaut**
5. Confirmez en cliquant sur **Réinitialiser**

## Option 2 : Nettoyage Manuel

### Étape 1 : Vider les Données du Site

1. Appuyez sur **F12** pour ouvrir les DevTools
2. Onglet **Application** (ou **Stockage**)
3. Section **Storage** → **Clear site data**
4. Cochez **TOUT** :
   - ✅ Cookies
   - ✅ Cache
   - ✅ Service Workers
   - ✅ Local Storage
   - ✅ Session Storage
   - ✅ IndexedDB
5. Cliquez sur **Clear site data**

### Étape 2 : Supprimer les Extensions

1. Tapez `edge://extensions` dans la barre d'adresse
2. Désactivez ou supprimez toutes les extensions suspectes
3. Redémarrez Edge

### Étape 3 : Supprimer les Bookmarklets

1. Appuyez sur **Ctrl+Shift+O** pour ouvrir les favoris
2. Vérifiez s'il y a des bookmarklets (scripts JavaScript dans les favoris)
3. Supprimez-les si présents

### Étape 4 : Vider le Cache Complet

1. Appuyez sur **Ctrl+Shift+Delete**
2. Sélectionnez **Toutes les périodes**
3. Cochez **TOUT** :
   - ✅ Images et fichiers en cache
   - ✅ Cookies et autres données de site
   - ✅ Historique de navigation
4. Cliquez sur **Effacer maintenant**

## Option 3 : Réinitialisation via PowerShell (Avancé)

```powershell
# Arrêter Edge
Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force

# Supprimer le cache et les données
$edgePath = "$env:LOCALAPPDATA\Microsoft\Edge\User Data"
if (Test-Path $edgePath) {
    Remove-Item -Recurse -Force "$edgePath\Default\Cache"
    Remove-Item -Recurse -Force "$edgePath\Default\Service Worker"
    Remove-Item -Recurse -Force "$edgePath\Default\Local Storage"
    Write-Host "Cache Edge supprimé"
}
```

## Après la Réinitialisation

1. **Redémarrez Edge complètement**
2. Allez sur `http://localhost:3000`
3. **Ne copiez-collez AUCUN script** dans la console
4. Testez la connexion

## Vérification

Après la réinitialisation, ouvrez la console (F12) et vérifiez qu'il n'y a plus de messages automatiques comme :
- ❌ `🔄 Début du nettoyage du cache...`
- ❌ `VM11341`, `VM11347`, etc.

Si ces messages apparaissent encore, c'est qu'une extension ou un bookmarklet est toujours actif.



