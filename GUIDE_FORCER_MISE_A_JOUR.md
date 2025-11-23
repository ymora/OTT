# 🔄 Guide pour Forcer la Mise à Jour - GitHub Pages

## 🚨 Problème Actuel

Le site GitHub Pages charge des fichiers avec des noms de hash différents de ceux déployés :
- `page-1e718a600b5534ac.js` (recherché mais n'existe pas)
- `page-3438f2667123d76d.js` (recherché mais n'existe pas)

**Cause :** Le navigateur/service worker utilise une version en cache du HTML qui référence d'anciens fichiers.

---

## ✅ Solutions Immédiates (Côté Client)

### Solution 1 : Vider le Cache Complet

**Dans Chrome/Edge :**
1. Ouvrez les outils de développement (F12)
2. Onglet **Application** (ou **Stockage** dans Firefox)
3. Section **Storage** → **Clear site data**
4. Cochez **TOUT** :
   - ✅ Cookies
   - ✅ Cache
   - ✅ Service Workers
   - ✅ Local Storage
   - ✅ Session Storage
5. Cliquez sur **Clear data**
6. Rechargez avec **Ctrl+Shift+R** (ou **Cmd+Shift+R** sur Mac)

### Solution 2 : Via la Console JavaScript

Ouvrez la console (F12) et exécutez :

```javascript
// Désinscrire tous les service workers
navigator.serviceWorker.getRegistrations().then(function(registrations) {
  for(let registration of registrations) {
    registration.unregister().then(() => {
      console.log('Service worker désinscrit')
    })
  }
})

// Vider tous les caches
caches.keys().then(function(names) {
  for (let name of names) {
    caches.delete(name).then(() => {
      console.log('Cache supprimé:', name)
    })
  }
})

// Recharger la page
setTimeout(() => {
  window.location.reload(true)
}, 1000)
```

### Solution 3 : Mode Navigation Privée

1. Ouvrez une fenêtre de navigation privée (Ctrl+Shift+N)
2. Allez sur `https://ymora.github.io/OTT/`
3. Cela bypassera le cache

---

## 🔧 Solutions Côté Déploiement

### Vérifier le Workflow GitHub Actions

1. Allez sur votre dépôt GitHub
2. Onglet **Actions**
3. Vérifiez que le dernier workflow s'est bien terminé
4. Si échec, vérifiez les logs

### Forcer un Nouveau Build

Si le build a échoué, vous pouvez :

1. **Via GitHub Actions :**
   - Onglet **Actions**
   - Cliquez sur le dernier workflow
   - Bouton **Re-run all jobs**

2. **Via Git :**
   ```bash
   # Faire un commit vide pour déclencher le workflow
   git commit --allow-empty -m "Trigger rebuild"
   git push
   ```

---

## 📋 Vérifications

### Vérifier que les Fichiers sont Déployés

1. Allez sur `https://ymora.github.io/OTT/`
2. Ouvrez F12 > Network
3. Rechargez la page (Ctrl+Shift+R)
4. Vérifiez que les fichiers CSS/JS se chargent avec le statut **200**

### Vérifier le Service Worker

1. F12 > Application > Service Workers
2. Vérifiez la version : doit être `ott-dashboard-v3.0.2`
3. Si ancienne version, cliquez sur **Unregister**
4. Rechargez la page

---

## 🎯 Actions Automatiques Mises en Place

Le code a été amélioré pour :

1. **Service Worker :**
   - Ignore les requêtes `chrome-extension:`
   - Gestion d'erreurs améliorée
   - Mise à jour automatique

2. **Mise à jour automatique :**
   - Vérification toutes les heures
   - Activation immédiate des nouvelles versions

3. **Logs de débogage :**
   - Console F12 affiche maintenant des logs utiles

---

## ⚠️ Si le Problème Persiste

1. **Vérifier GitHub Actions :**
   - Le build s'est-il bien terminé ?
   - Y a-t-il des erreurs dans les logs ?

2. **Vérifier le déploiement :**
   - Les fichiers dans `out/` sont-ils bien déployés ?
   - Le dossier `out/` est-il dans la branche `gh-pages` ?

3. **Attendre quelques minutes :**
   - GitHub Pages peut prendre 1-2 minutes pour se mettre à jour
   - Videz le cache après avoir attendu

---

## 📝 Commandes Utiles

```bash
# Vérifier l'état du workflow
# (via l'interface GitHub Actions)

# Forcer un rebuild
git commit --allow-empty -m "Trigger rebuild"
git push
```

---

**Note :** Le build local échoue à cause de Tailwind CSS v4, mais GitHub Actions devrait réussir car il utilise son propre environnement Linux.

