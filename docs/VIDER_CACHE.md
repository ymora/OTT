# 🧹 Vider le Cache - Code Simple

## Méthode 1 : Code à Coller dans la Console (F12)

Copiez-collez ce code dans la console du navigateur (F12) et appuyez sur Entrée :

```javascript
(async()=>{const r=await navigator.serviceWorker.getRegistrations();for(const s of r)await s.unregister();const c=await caches.keys();for(const n of c)await caches.delete(n);setTimeout(()=>window.location.reload(true),500)})()
```

**Version lisible :**
```javascript
(async () => {
  // Désinscrire tous les service workers
  const registrations = await navigator.serviceWorker.getRegistrations()
  for (const reg of registrations) await reg.unregister()
  
  // Vider tous les caches
  const cacheNames = await caches.keys()
  for (const name of cacheNames) await caches.delete(name)
  
  // Recharger la page
  setTimeout(() => window.location.reload(true), 500)
})()
```

## Méthode 2 : Bouton dans l'Interface

Un bouton "🧹 Vider le cache" est disponible dans le menu utilisateur (en haut à droite).

## Méthode 3 : Via les Outils de Développement

1. **F12** → Onglet **Application** (ou **Stockage**)
2. **Clear site data** → Tout cocher → **Clear data**
3. **Ctrl+Shift+R** pour recharger

