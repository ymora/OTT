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

**Solutions :**
1. Vérifier les Actions GitHub : https://github.com/ymora/OTT/actions
2. Vérifier que le commit est bien sur `main` : `git log origin/main -1`
3. Attendre quelques minutes
4. Vider le cache du navigateur (Ctrl+F5 ou Cmd+Shift+R)
5. Forcer un redéploiement (voir ci-dessus)

### Le service worker sert une version en cache

**Solution :**
1. Vider le cache du navigateur (Ctrl+F5)
2. Ouvrir les DevTools (F12)
3. Aller dans l'onglet "Application" → "Service Workers"
4. Cliquer sur "Unregister" pour désinscrire le service worker
5. Recharger la page

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

