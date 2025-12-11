# 🔄 Guide de Synchronisation GitHub Pages

## Problème résolu

Le site GitHub Pages n'était pas toujours à jour par rapport au code local. Ce problème est maintenant résolu avec plusieurs mécanismes automatiques.

## ✅ Solutions mises en place

### 1. **Fichier de version automatique**

À chaque déploiement, un fichier `.version.json` est créé dans le dossier `out/` avec :
- Le SHA du commit déployé
- Le timestamp du build
- Le message du commit

Ce fichier permet de vérifier facilement si le site est à jour.

**URL du fichier de version :**
```
https://ymora.github.io/OTT/.version.json
```

### 2. **Mise à jour automatique du Service Worker**

Le service worker est automatiquement mis à jour avec une nouvelle version à chaque build pour forcer la mise à jour du cache navigateur.

### 3. **Script de vérification**

Un script PowerShell permet de vérifier rapidement si le site est synchronisé :

```powershell
.\scripts\verifier-synchronisation-deploiement.ps1
```

Ce script :
- Compare le commit local avec le commit déployé
- Vérifie que le commit local est bien poussé sur GitHub
- Affiche des instructions si le site n'est pas à jour

### 4. **Workflow GitHub Actions amélioré**

Le workflow `.github/workflows/deploy.yml` a été amélioré pour :
- Mettre à jour automatiquement la version du service worker
- Créer un fichier de version à chaque déploiement
- Vérifier que le déploiement est réussi

## 🔍 Comment vérifier que le site est à jour ?

### Méthode 1 : Script automatique (recommandé)

```powershell
.\scripts\verifier-synchronisation-deploiement.ps1
```

### Méthode 2 : Vérification manuelle

1. **Récupérer le commit local :**
   ```bash
   git rev-parse --short HEAD
   ```

2. **Vérifier le fichier de version sur GitHub Pages :**
   ```bash
   curl -s https://ymora.github.io/OTT/.version.json | jq .
   ```

3. **Comparer les deux commits :** Ils doivent être identiques.

### Méthode 3 : Via l'interface GitHub

1. Aller sur : https://github.com/ymora/OTT/actions
2. Vérifier que le dernier workflow "Deploy Next.js to GitHub Pages" a réussi
3. Vérifier la date/heure du dernier déploiement

## 🚀 Processus de déploiement

### Déploiement automatique

Le déploiement se fait **automatiquement** à chaque push sur la branche `main` :

```bash
git add .
git commit -m "votre message"
git push origin main
```

**Durée :** 2-5 minutes après le push

### Déploiement manuel

Si le workflow ne se déclenche pas automatiquement, vous pouvez le déclencher manuellement :

1. Aller sur : https://github.com/ymora/OTT/actions
2. Sélectionner "Deploy Next.js to GitHub Pages"
3. Cliquer sur "Run workflow"
4. Sélectionner la branche `main`
5. Cliquer sur "Run workflow"

### Forcer un redéploiement

Si le site n'est pas à jour, vous pouvez forcer un redéploiement :

```bash
git commit --allow-empty -m "chore: Force GitHub Pages deployment"
git push origin main
```

## ⚠️ Problèmes courants et solutions

### Le site n'est pas à jour après un push

**Causes possibles :**
1. Le workflow GitHub Actions n'a pas été déclenché
2. Le workflow a échoué
3. Le déploiement est encore en cours (attendre 2-5 minutes)
4. Cache du navigateur (faire Ctrl+F5)
5. **Service Worker en cache** : Le service worker peut servir une ancienne version des fichiers JS
6. **Pages `force-dynamic`** : Les pages avec `export const dynamic = 'force-dynamic'` sont générées comme client-side uniquement, mais le cache peut servir une ancienne version

**Solutions :**
1. Vérifier les Actions GitHub : https://github.com/ymora/OTT/actions
2. Vérifier que le commit est bien sur `main` : `git log origin/main -1`
3. Attendre quelques minutes
4. **Vider le cache du navigateur** (Ctrl+F5 ou Cmd+Shift+R)
5. **Désinscrire le Service Worker** (voir section ci-dessous)
6. Forcer un redéploiement (voir ci-dessus)

### Problème spécifique : Icônes ou fonctionnalités manquantes en ligne

**Symptômes :**
- Une fonctionnalité (ex: icône 📊 historique des mesures) est présente localement mais absente en ligne
- Le code est bien présent dans le repository
- Le workflow GitHub Actions a réussi

**Causes possibles :**
1. **Cache du Service Worker** : Le service worker met en cache les fichiers JS et peut servir une ancienne version
2. **Cache du navigateur** : Le navigateur peut avoir mis en cache une ancienne version des fichiers
3. **Cache CDN GitHub Pages** : GitHub Pages peut avoir un cache CDN qui sert une ancienne version
4. **Build incomplet** : Le build peut ne pas avoir inclus tous les fichiers (rare)

**Solutions (dans l'ordre) :**

1. **Vérifier la version déployée :**
   ```bash
   curl -s https://ymora.github.io/OTT/.version.json | jq .
   ```
   Comparer avec votre commit local : `git rev-parse --short HEAD`

2. **Vider le cache du navigateur :**
   - **Chrome/Edge** : Ctrl+Shift+Delete → Cocher "Images et fichiers en cache" → Effacer
   - **Firefox** : Ctrl+Shift+Delete → Cocher "Cache" → Effacer
   - **Safari** : Cmd+Option+E (vider le cache)

3. **Désinscrire le Service Worker :**
   - Ouvrir les DevTools (F12)
   - Aller dans l'onglet "Application" (Chrome) ou "Stockage" (Firefox)
   - Section "Service Workers"
   - Cliquer sur "Unregister" pour chaque service worker
   - Recharger la page (Ctrl+F5)

4. **Forcer un rechargement complet :**
   - **Chrome/Edge** : Ctrl+Shift+R ou Ctrl+F5
   - **Firefox** : Ctrl+Shift+R ou Ctrl+F5
   - **Safari** : Cmd+Shift+R

5. **Vérifier que le build inclut bien les fichiers :**
   - Aller sur : https://github.com/ymora/OTT/actions
   - Ouvrir le dernier workflow réussi
   - Vérifier l'étape "Verify build output"
   - Vérifier que les fichiers JS sont bien générés

6. **Forcer un redéploiement :**
   ```bash
   git commit --allow-empty -m "chore: Force GitHub Pages deployment - fix cache"
   git push origin main
   ```
   Attendre 2-5 minutes puis vider le cache du navigateur

7. **Vérifier les fichiers générés :**
   - Ouvrir : https://ymora.github.io/OTT/dashboard/dispositifs/
   - Ouvrir les DevTools (F12) → Onglet "Network"
   - Recharger la page (Ctrl+F5)
   - Vérifier que les fichiers JS chargés sont récents (regarder les dates)
   - Vérifier qu'il n'y a pas d'erreurs 404 pour les fichiers JS

### Le service worker sert une version en cache

**Symptômes :**
- Le site ne se met pas à jour même après un déploiement réussi
- Les fonctionnalités manquantes persistent après avoir vidé le cache
- Les fichiers JS chargés sont anciens (vérifier dans DevTools → Network)

**Solution complète :**
1. **Ouvrir les DevTools** (F12)
2. **Aller dans l'onglet "Application"** (Chrome) ou "Stockage" (Firefox)
3. **Section "Service Workers"** :
   - Vérifier qu'un service worker est actif
   - Noter la version (devrait être mise à jour automatiquement)
4. **Désinscrire le service worker** :
   - Cliquer sur "Unregister" pour chaque service worker
   - Attendre la confirmation
5. **Vider le cache du navigateur** :
   - **Chrome/Edge** : Ctrl+Shift+Delete → Cocher "Images et fichiers en cache" → Effacer
   - **Firefox** : Ctrl+Shift+Delete → Cocher "Cache" → Effacer
6. **Fermer tous les onglets** du site
7. **Rouvrir le site** dans un nouvel onglet
8. **Vérifier** que le nouveau service worker est enregistré avec la bonne version

**Note :** Le service worker est mis à jour automatiquement à chaque déploiement, mais le navigateur peut ne pas détecter la mise à jour immédiatement. La désinscription manuelle force la mise à jour.

### Le workflow échoue

**Vérifications :**
1. Vérifier les logs du workflow : https://github.com/ymora/OTT/actions
2. Vérifier que tous les fichiers nécessaires sont présents
3. Vérifier que `SUIVI_TEMPS_FACTURATION.md` existe dans `public/`

## 📋 Checklist avant chaque push

- [ ] Tous les changements sont commités (`git status` doit être propre)
- [ ] Les tests passent (`npm test`)
- [ ] Le build local fonctionne (`npm run build`)
- [ ] Le commit est poussé sur `main` (`git push origin main`)
- [ ] Le workflow GitHub Actions est déclenché (vérifier sur GitHub)
- [ ] Attendre 2-5 minutes pour le déploiement
- [ ] Vérifier que le site est à jour avec le script de vérification

## 🔗 Liens utiles

- **Actions GitHub :** https://github.com/ymora/OTT/actions
- **Pages Settings :** https://github.com/ymora/OTT/settings/pages
- **Site Live :** https://ymora.github.io/OTT/
- **Fichier de version :** https://ymora.github.io/OTT/.version.json

## 📝 Notes importantes

1. **Le déploiement est automatique** : Pas besoin de faire quoi que ce soit après un push sur `main`
2. **Le workflow utilise `out/`** : Ne pas copier manuellement vers `docs/`, le workflow s'en charge
3. **Le service worker est mis à jour automatiquement** : Pas besoin de modifier manuellement `sw.js`
4. **Le fichier de version est créé automatiquement** : Il permet de vérifier la synchronisation

## 🎯 Résumé

- ✅ Déploiement automatique à chaque push sur `main`
- ✅ Fichier de version pour vérifier la synchronisation
- ✅ Service worker mis à jour automatiquement
- ✅ Script de vérification disponible
- ✅ Workflow amélioré avec vérifications

**Le site devrait maintenant toujours être à jour !** 🎉

