# Vérification Déploiement GitHub Pages

## ✅ Corrections Appliquées

### 1. Script `verify-build.sh` créé
- ✅ Script de vérification du build ajouté
- ✅ Vérifie les fichiers critiques (index.html, sw.js, manifest.json)
- ✅ Vérifie les assets Next.js (_next/static/)
- ✅ Vérifie les pages statiques (migrate.html, diagnostic-measurements.html)

### 2. Workflow amélioré
- ✅ Ajout de `chmod +x` pour les scripts bash
- ✅ Ajout des permissions explicites pour le job `deploy`
- ✅ Ajout de `retention-days: 1` pour les artifacts
- ✅ Amélioration des vérifications de build

### 3. Documentation créée
- ✅ `docs/CORRECTION_DEPLOIEMENT_GITHUB_PAGES.md` - Guide de correction
- ✅ `docs/VÉRIFICATION_DÉPLOIEMENT.md` - Ce fichier

## 🔍 Vérifications à Effectuer

### 1. Vérifier que GitHub Pages utilise GitHub Actions

1. Allez sur : https://github.com/ymora/OTT/settings/pages
2. Vérifiez que **Source** = `GitHub Actions` (pas "Deploy from a branch")
3. Si ce n'est pas le cas, changez vers "GitHub Actions"

### 2. Vérifier l'exécution du workflow

1. Allez sur : https://github.com/ymora/OTT/actions
2. Vérifiez que le workflow "Deploy Next.js to GitHub Pages" s'exécute
3. Ouvrez le dernier workflow et vérifiez :
   - ✅ Le job `build` se termine avec succès
   - ✅ Le job `deploy` se termine avec succès
   - ✅ Aucune erreur dans les logs

### 3. Vérifier le déploiement

1. Attendez 1-2 minutes après la fin du workflow
2. Allez sur : https://ymora.github.io/OTT/
3. Vérifiez que :
   - ✅ La page charge correctement
   - ✅ Les fichiers JS/CSS sont chargés (F12 > Network)
   - ✅ L'API est accessible depuis le dashboard
   - ✅ Les changements récents sont visibles

## 🛠️ Si le Déploiement Ne Fonctionne Pas

### Problème 1 : Le workflow ne s'exécute pas

**Solution** :
1. Vérifier les permissions GitHub Actions dans Settings > Actions > General
2. Vérifier que "Workflow permissions" = "Read and write permissions"
3. Forcer l'exécution : Actions > Deploy Next.js to GitHub Pages > Run workflow

### Problème 2 : Le workflow échoue

**Solution** :
1. Ouvrir le workflow en échec
2. Vérifier les logs pour identifier l'erreur
3. Les erreurs communes :
   - Script bash non exécutable → `chmod +x` ajouté
   - Fichier manquant → Vérifier que tous les fichiers sont commités
   - Erreur de build → Vérifier les logs du build Next.js

### Problème 3 : GitHub Pages utilise encore l'ancienne méthode

**Solution** :
1. Settings > Pages
2. Changer "Source" de "Deploy from a branch" vers "GitHub Actions"
3. Sauvegarder

### Problème 4 : Cache du navigateur

**Solution** :
1. Vider le cache (Ctrl+Shift+Delete)
2. Ouvrir en navigation privée
3. Ajouter `?v=timestamp` aux URLs pour forcer le rechargement

## 📋 Checklist de Vérification

- [ ] GitHub Pages configuré sur "GitHub Actions"
- [ ] Workflow s'exécute automatiquement sur push vers `main`
- [ ] Job `build` se termine avec succès
- [ ] Job `deploy` se termine avec succès
- [ ] Site accessible sur https://ymora.github.io/OTT/
- [ ] Les fichiers JS/CSS se chargent correctement
- [ ] L'API est accessible depuis le dashboard
- [ ] Les changements récents sont visibles

## 🚀 Forcer un Nouveau Déploiement

Si nécessaire, forcer un nouveau déploiement :

```bash
git commit --allow-empty -m "chore: Force GitHub Pages deployment"
git push origin main
```

Ou via l'interface GitHub :
1. Actions > Deploy Next.js to GitHub Pages
2. Run workflow > Run workflow


