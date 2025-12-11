# 🔍 Analyse des Problèmes de Synchronisation GitHub Pages

## Problèmes identifiés

### 1. **Cache npm dans GitHub Actions** ⚠️ CRITIQUE
- Le workflow utilise `cache: 'npm'` qui peut mettre en cache les node_modules
- Même avec `npm ci`, le cache peut servir d'anciennes versions de dépendances
- **Impact** : Les builds peuvent utiliser d'anciennes versions de code

### 2. **BuildId non unique entre builds** ⚠️ CRITIQUE
- `generateBuildId` utilise `Date.now()` mais Next.js génère des hash basés sur le **contenu**
- Si le contenu ne change pas, les fichiers JS ont le même hash
- Le navigateur peut servir une version en cache même après un déploiement
- **Impact** : Les fichiers JS peuvent avoir les mêmes noms/hash, donc le navigateur ne les recharge pas

### 3. **Service Worker cache les fichiers JS** ⚠️ IMPORTANT
- Même si on a modifié le service worker pour les pages HTML, il peut encore mettre en cache les fichiers JS
- Les fichiers `_next/static/chunks/*.js` sont mis en cache
- **Impact** : Le service worker peut servir d'anciennes versions des fichiers JS

### 4. **Pages `force-dynamic`** ⚠️ MOYEN
- Toutes les pages ont `export const dynamic = 'force-dynamic'`
- Elles sont générées côté client, mais Next.js devrait quand même les exporter
- **Impact** : Les fichiers JS peuvent ne pas être régénérés si le contenu ne change pas

## Solutions proposées

### Solution 1 : Désactiver le cache npm OU forcer un rebuild complet
```yaml
# Dans .github/workflows/deploy.yml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'
    # cache: 'npm'  # ❌ DÉSACTIVER pour forcer un rebuild complet
```

OU

```yaml
- name: Clear npm cache
  run: npm cache clean --force
```

### Solution 2 : Ajouter un hash du commit dans le buildId
```javascript
// Dans next.config.js
generateBuildId: async () => {
  const commitSha = process.env.GITHUB_SHA || process.env.COMMIT_SHA || Date.now().toString()
  return `build-${commitSha.slice(0, 7)}-${Date.now()}`
}
```

### Solution 3 : Forcer Next.js à régénérer tous les fichiers
```javascript
// Dans next.config.js
webpack: (config, { dev, isServer }) => {
  if (!dev && isStaticExport) {
    config.cache = false
    // Forcer la régénération complète
    config.optimization = {
      ...config.optimization,
      moduleIds: 'deterministic', // Mais avec un nouveau buildId
    }
  }
  return config
}
```

### Solution 4 : Améliorer le service worker pour ne jamais mettre en cache les fichiers JS
```javascript
// Dans public/sw.js
// Pour les fichiers _next/static (CSS, JS avec hash), utiliser "network first"
if (pathname.includes('/_next/static/')) {
  event.respondWith(
    fetch(event.request, { 
      cache: 'no-store', // ❌ CHANGER de 'no-cache' à 'no-store'
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    })
    .then((response) => {
      return response
    })
    .catch(() => {
      // En cas d'échec réseau, essayer le cache en dernier recours
      return caches.match(event.request)
    })
  )
  return
}
```

### Solution 5 : Ajouter un paramètre de version dans les URLs des assets
```javascript
// Dans next.config.js
assetPrefix: isStaticExport ? '/OTT' : undefined,
// Ajouter un query string avec le buildId pour forcer le rechargement
generateBuildId: async () => {
  const buildId = `build-${Date.now()}`
  // Stocker dans une variable d'environnement pour l'utiliser dans assetPrefix
  process.env.NEXT_BUILD_ID = buildId
  return buildId
}
```

## Solution recommandée (combinée)

1. **Désactiver le cache npm** dans GitHub Actions
2. **Ajouter le commit SHA dans le buildId** pour forcer de nouveaux hash
3. **Améliorer le service worker** pour ne jamais mettre en cache les fichiers JS
4. **Ajouter un timestamp dans les variables d'environnement** pour forcer la régénération

