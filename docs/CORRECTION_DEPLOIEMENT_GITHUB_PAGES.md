# Correction Déploiement GitHub Pages

## 🔍 Problème Identifié

La version web (https://ymora.github.io/OTT/) n'est pas à jour malgré les commits poussés sur `main`.

## ✅ Configuration Actuelle

### Workflow GitHub Actions
- **Fichier** : `.github/workflows/deploy.yml`
- **Déclenchement** : Sur chaque push vers `main`
- **Méthode** : GitHub Actions Pages (nouvelle méthode)
- **Dossier source** : `out/` (généré par Next.js)

### Configuration Next.js
- **Export statique** : Activé (`output: 'export'`)
- **Base path** : `/OTT`
- **API URL** : `https://ott-jbln.onrender.com`

## 🔧 Vérifications à Effectuer

### 1. Vérifier que GitHub Pages est configuré correctement

1. Allez sur https://github.com/ymora/OTT/settings/pages
2. Vérifiez que :
   - **Source** : `GitHub Actions` (pas `Deploy from a branch`)
   - **Branch** : N/A (si GitHub Actions est sélectionné)

### 2. Vérifier que le workflow s'exécute

1. Allez sur https://github.com/ymora/OTT/actions
2. Vérifiez que le workflow "Deploy Next.js to GitHub Pages" s'exécute
3. Vérifiez les logs pour voir s'il y a des erreurs

### 3. Forcer un nouveau déploiement

Si le workflow ne s'exécute pas automatiquement :

1. Allez sur https://github.com/ymora/OTT/actions/workflows/deploy.yml
2. Cliquez sur "Run workflow"
3. Sélectionnez la branche `main`
4. Cliquez sur "Run workflow"

## 🛠️ Corrections Appliquées

### 1. Vérification du workflow
- ✅ Workflow configuré pour se déclencher sur push vers `main`
- ✅ Utilise `actions/deploy-pages@v4` (méthode moderne)
- ✅ Upload depuis `out/` (correct)

### 2. Amélioration du script de build
- ✅ Nettoyage complet du cache avant build
- ✅ Vérification des fichiers critiques
- ✅ Génération de `SUIVI_TEMPS_FACTURATION.md`

### 3. Configuration Next.js
- ✅ `basePath: '/OTT'` pour GitHub Pages
- ✅ `output: 'export'` pour export statique
- ✅ Variables d'environnement correctes

## 📋 Actions Immédiates

### Option 1 : Forcer le déploiement via GitHub Actions

1. Créer un commit vide pour déclencher le workflow :
```bash
git commit --allow-empty -m "chore: Force GitHub Pages deployment"
git push origin main
```

### Option 2 : Vérifier manuellement sur GitHub

1. https://github.com/ymora/OTT/settings/pages
2. Vérifier que "Source" = "GitHub Actions"
3. Si ce n'est pas le cas, changer vers "GitHub Actions"

### Option 3 : Vérifier les logs du workflow

1. https://github.com/ymora/OTT/actions
2. Ouvrir le dernier workflow "Deploy Next.js to GitHub Pages"
3. Vérifier les logs pour identifier les erreurs

## ⚠️ Problèmes Potentiels

### 1. GitHub Pages utilise encore l'ancienne méthode
**Symptôme** : Les fichiers dans `docs/` sont servis au lieu de `out/`

**Solution** : Changer la source dans Settings > Pages vers "GitHub Actions"

### 2. Le workflow ne s'exécute pas
**Symptôme** : Aucun workflow dans l'onglet Actions

**Solution** : 
- Vérifier les permissions GitHub Actions
- Vérifier que le workflow est dans `.github/workflows/`
- Forcer l'exécution manuellement

### 3. Cache du navigateur
**Symptôme** : Les changements ne sont pas visibles même après déploiement

**Solution** :
- Vider le cache du navigateur (Ctrl+Shift+Delete)
- Ouvrir en navigation privée
- Ajouter `?v=timestamp` aux URLs

## ✅ Test de Vérification

Après correction, vérifier :
1. https://ymora.github.io/OTT/ charge correctement
2. Les fichiers JS/CSS sont chargés depuis `/OTT/_next/static/`
3. L'API est accessible depuis le dashboard
4. Les changements récents sont visibles


