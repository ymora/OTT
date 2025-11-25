# 🔧 Guide de dépannage - Déploiement OTT Dashboard

## Problème : Erreur 404 pour les fichiers CSS/JS

### Symptômes
- Erreur dans la console : `GET https://ymora.github.io/OTT/_next/static/css/48594cc8ce656b41.css net::ERR_ABORTED 404 (Not Found)`
- L'application ne charge pas correctement
- Les styles ne s'appliquent pas

### Causes possibles

1. **Cache du navigateur/service worker obsolète**
   - Le navigateur a mis en cache une ancienne version du HTML qui référence un ancien fichier CSS
   - Le service worker sert un cache obsolète

2. **Déploiement incomplet**
   - Les fichiers ne sont pas tous déployés sur GitHub Pages
   - Le dossier `out/` n'a pas été correctement copié

3. **Configuration basePath incorrecte**
   - Le `basePath` n'est pas correctement configuré dans `next.config.js`

## Solutions

### Solution 1 : Vider le cache du navigateur et du service worker

#### Dans le navigateur (Chrome/Edge) :
1. Ouvrez les outils de développement (F12)
2. Allez dans l'onglet "Application" (ou "Stockage" dans Firefox)
3. Dans la section "Storage", cliquez sur "Clear site data"
4. Cochez toutes les cases (Cookies, Cache, Service Workers, etc.)
5. Cliquez sur "Clear data"
6. Rechargez la page avec Ctrl+Shift+R (ou Cmd+Shift+R sur Mac)

#### Via la console JavaScript :
```javascript
// Désinscrire tous les service workers
navigator.serviceWorker.getRegistrations().then(function(registrations) {
  for(let registration of registrations) {
    registration.unregister();
  }
});

// Vider tous les caches
caches.keys().then(function(names) {
  for (let name of names) {
    caches.delete(name);
  }
});

// Recharger la page
location.reload(true);
```

### Solution 2 : Rebuild et redéploiement

1. **Nettoyer le build local** :
```bash
rm -rf out .next node_modules/.cache
```

2. **Rebuild avec les bonnes variables d'environnement** :
```bash
npm run export
```

3. **Vérifier que tous les fichiers sont présents** :
```bash
# Vérifier les fichiers critiques
ls -la out/sw.js
ls -la out/manifest.json
ls -la out/icon-192.png
ls -la out/_next/static/css/

# Compter les fichiers
find out -type f | wc -l
```

4. **Tester localement avant de déployer** :
```bash
# Tester la connexion
npm run test:connection

# Ou tester avec un serveur local
npx serve out -p 3001
# Puis ouvrir http://localhost:3001/OTT
```

5. **Redéployer sur GitHub Pages** :
   - Vérifiez que le workflow GitHub Actions s'est bien exécuté
   - Vérifiez que tous les fichiers du dossier `out/` sont bien dans la branche `gh-pages` ou dans le dossier de déploiement

### Solution 3 : Vérifier la configuration

1. **Vérifier `next.config.js`** :
   - Le `basePath` doit être `/OTT` en mode export statique
   - Le `assetPrefix` doit être `/OTT` en mode export statique

2. **Vérifier les variables d'environnement** :
```bash
# Lors du build, ces variables doivent être définies :
NEXT_STATIC_EXPORT=true
NEXT_PUBLIC_BASE_PATH=/OTT
NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com
NODE_ENV=production
```

3. **Vérifier le service worker** :
   - Le fichier `public/sw.js` doit être présent
   - Il doit être copié dans `out/sw.js` après le build
   - La version du cache doit être incrémentée à chaque déploiement

### Solution 4 : Utiliser le script de test

Un script de test a été créé pour vérifier la connexion :

```bash
# Tester la connexion au site déployé
npm run test:connection

# Ou avec une URL personnalisée
node scripts/test_connection.js https://ymora.github.io
```

Le script vérifie :
- ✅ La page principale
- ✅ Les fichiers CSS référencés
- ✅ Les fichiers JavaScript critiques
- ✅ Les assets statiques (manifest, icons, service worker)

## Améliorations apportées

### Service Worker amélioré (`public/sw.js`)
- ✅ Ne met plus en cache les fichiers `_next/static/` (CSS/JS avec hash)
- ✅ Utilise une stratégie "network first" pour les fichiers statiques
- ✅ Force la mise à jour immédiate avec `skipWaiting()` et `clients.claim()`
- ✅ Nettoie automatiquement les anciens caches

### Script de test (`scripts/test_connection.js`)
- ✅ Vérifie que tous les fichiers sont accessibles
- ✅ Détecte les fichiers CSS/JS manquants
- ✅ Fournit des suggestions en cas d'erreur

### Script d'export amélioré (`scripts/export_static.sh`)
- ✅ Vérifie que tous les fichiers critiques sont présents
- ✅ Compte les fichiers CSS et JS générés
- ✅ Affiche des avertissements si des fichiers manquent

## Commandes utiles

```bash
# Build et export
npm run export

# Test de connexion
npm run test:connection

# Nettoyer et rebuild
rm -rf out .next && npm run export

# Vérifier les fichiers générés
ls -la out/_next/static/css/
ls -la out/_next/static/chunks/ | head -20
```

## Vérification manuelle

1. **Vérifier que le HTML référence le bon CSS** :
   - Ouvrir `out/index.html`
   - Chercher `/_next/static/css/`
   - Vérifier que le nom du fichier correspond à un fichier existant dans `out/_next/static/css/`

2. **Vérifier que les assets sont copiés** :
   ```bash
   # Ces fichiers doivent exister
   test -f out/sw.js && echo "✓ sw.js présent" || echo "✗ sw.js manquant"
   test -f out/manifest.json && echo "✓ manifest.json présent" || echo "✗ manifest.json manquant"
   test -f out/icon-192.png && echo "✓ icon-192.png présent" || echo "✗ icon-192.png manquant"
   ```

3. **Vérifier le basePath dans le HTML** :
   - Tous les chemins doivent commencer par `/OTT/`
   - Exemple : `/OTT/_next/static/css/...` et non `/_next/static/css/...`

## En cas de problème persistant

1. **Vérifier les logs GitHub Actions** :
   - Allez sur votre dépôt GitHub
   - Onglet "Actions"
   - Vérifiez que le workflow de déploiement s'est bien terminé
   - Vérifiez les logs pour des erreurs

2. **Vérifier la branche de déploiement** :
   - GitHub Pages peut déployer depuis `gh-pages` ou depuis un dossier spécifique
   - Vérifiez que tous les fichiers du dossier `out/` sont bien dans la branche/dossier de déploiement

3. **Tester avec un nouveau build ID** :
   - Le `generateBuildId` dans `next.config.js` génère un ID unique à chaque build
   - Cela force le rechargement des assets

4. **Incrémenter la version du service worker** :
   - Modifier `CACHE_VERSION` dans `public/sw.js`
   - Cela force la mise à jour du cache

## Contact

Si le problème persiste après avoir essayé toutes ces solutions, vérifiez :
- Les logs du navigateur (Console et Network)
- Les logs GitHub Actions
- La structure des fichiers déployés

