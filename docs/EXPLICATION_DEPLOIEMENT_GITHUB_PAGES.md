# Explication du Déploiement GitHub Pages

## 🔍 Pourquoi le site distant n'était pas à jour ?

### Causes possibles

1. **Workflow GitHub Actions non déclenché**
   - Le workflow ne se déclenche que sur un **push vers la branche `main`**
   - Si vous avez fait des modifications locales sans push, le workflow ne s'exécute pas
   - Le workflow peut aussi échouer silencieusement

2. **Cache du navigateur**
   - Votre navigateur peut avoir mis en cache l'ancienne version
   - Le service worker peut servir une version en cache
   - Solution : vider le cache ou faire un hard refresh (Ctrl+F5)

3. **Build échoué silencieusement**
   - Le workflow peut échouer sans notification visible
   - Erreurs de build non détectées
   - Problèmes de permissions GitHub Pages

4. **Délai de propagation**
   - GitHub Pages peut prendre 2-5 minutes pour déployer
   - Parfois jusqu'à 10 minutes en cas de charge

5. **Service Worker en cache**
   - Le service worker (`sw.js`) peut servir une version ancienne
   - Il faut le mettre à jour manuellement ou attendre son expiration

## 📋 Ce que fait le workflow GitHub Actions

### Fichier : `.github/workflows/deploy.yml`

Le workflow se déclenche automatiquement à chaque **push sur `main`** et effectue :

#### 1. **Checkout du code**
```yaml
- name: Checkout
  uses: actions/checkout@v4
```
- Récupère le code source depuis GitHub

#### 2. **Setup Node.js**
```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'
```
- Installe Node.js 20
- Configure le cache npm pour accélérer les builds

#### 3. **Nettoyage**
```yaml
- name: Clean build artifacts
  run: |
    rm -rf .next
    rm -rf out
    rm -rf node_modules/.cache
```
- Supprime tous les anciens fichiers de build
- Garantit un build propre sans cache

#### 4. **Installation des dépendances**
```yaml
- name: Install dependencies
  run: npm ci --no-audit --no-fund
```
- Installe toutes les dépendances npm
- `npm ci` = installation propre (supprime node_modules avant)

#### 5. **Génération SUIVI_TEMPS_FACTURATION.md**
```yaml
- name: Generate SUIVI_TEMPS_FACTURATION.md
  run: bash scripts/deploy/generate_time_tracking.sh
```
- Génère automatiquement le fichier de suivi du temps
- Analyse les commits Git pour calculer les heures

#### 6. **Build & Export statique**
```yaml
- name: Build & export static site
  run: bash scripts/deploy/export_static.sh
  env:
    NEXT_PUBLIC_API_URL: https://ott-jbln.onrender.com
    NEXT_PUBLIC_BASE_PATH: '/OTT'
    NEXT_STATIC_EXPORT: 'true'
```
- **C'est ici que la magie opère !**
- Lance `next build` avec les variables d'environnement
- Next.js génère un site statique dans `out/`
- Toutes les pages sont pré-rendues en HTML statique

#### 7. **Vérification du build**
```yaml
- name: Verify build output
  run: bash scripts/deploy/verify-build.sh out
```
- Vérifie que `index.html` existe
- Vérifie que les fichiers critiques sont présents
- Vérifie que `SUIVI_TEMPS_FACTURATION.md` est copié

#### 8. **Upload de l'artifact**
```yaml
- name: Upload artifact
  uses: actions/upload-pages-artifact@v3
  with:
    path: ./out
```
- Upload le dossier `out/` vers GitHub
- Cet artifact sera utilisé pour le déploiement

#### 9. **Déploiement sur GitHub Pages**
```yaml
- name: Deploy to GitHub Pages
  uses: actions/deploy-pages@v4
```
- Déploie l'artifact sur GitHub Pages
- Le site devient accessible sur `https://ymora.github.io/OTT/`

## 🔧 Ce que fait le script `export_static.sh`

### Fichier : `scripts/deploy/export_static.sh`

Ce script est exécuté **pendant le workflow** et fait :

1. **Vérifie les variables d'environnement**
   ```bash
   NEXT_STATIC_EXPORT=true
   NEXT_PUBLIC_BASE_PATH=/OTT
   NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com
   ```

2. **Nettoie l'ancien build**
   - Supprime le dossier `out/` s'il existe

3. **Vérifie que SUIVI_TEMPS_FACTURATION.md existe**
   - Doit être dans `public/SUIVI_TEMPS_FACTURATION.md`
   - Sinon, le build échoue

4. **Lance le build Next.js**
   ```bash
   npx next build
   ```
   - Next.js lit `next.config.js`
   - Détecte `output: 'export'` (mode statique)
   - Génère toutes les pages en HTML statique
   - Copie les fichiers de `public/` vers `out/`

5. **Vérifie les fichiers critiques**
   - `out/index.html`
   - `out/sw.js` (service worker)
   - `out/manifest.json`
   - `out/docs/DOCUMENTATION_*.html`

6. **Copie SUIVI_TEMPS_FACTURATION.md**
   - Next.js ne copie **PAS** automatiquement les `.md`
   - Le script copie manuellement depuis `public/` vers `out/`

7. **Vérifie que tout est OK**
   - Compte les fichiers générés
   - Affiche un résumé

## ⏰ Quand le script est lancé ?

### Déclencheurs automatiques

1. **Push sur `main`** (principal)
   ```yaml
   on:
     push:
       branches: [main]
   ```
   - Chaque fois que vous faites `git push origin main`
   - Le workflow se déclenche automatiquement
   - Délai : ~30 secondes après le push

2. **Déclenchement manuel** (workflow_dispatch)
   ```yaml
   on:
     workflow_dispatch:
   ```
   - Via l'interface GitHub Actions
   - Onglet "Actions" → "Deploy Next.js to GitHub Pages" → "Run workflow"
   - Utile pour forcer un redéploiement

### Déclenchement manuel (local)

Vous pouvez aussi lancer le build localement :

```powershell
# Windows
.\scripts\deploy\export_static.ps1

# Linux/Mac
bash scripts/deploy/export_static.sh
```

**⚠️ Important** : Le build local ne déploie **PAS** sur GitHub Pages, il génère juste le dossier `out/` localement.

## 🔄 Processus complet

```
1. Vous modifiez le code localement
   ↓
2. git add .
   ↓
3. git commit -m "message"
   ↓
4. git push origin main
   ↓
5. GitHub détecte le push
   ↓
6. Workflow GitHub Actions se déclenche
   ↓
7. Build Next.js (2-3 minutes)
   ↓
8. Upload artifact
   ↓
9. Déploiement GitHub Pages (1-2 minutes)
   ↓
10. Site mis à jour sur https://ymora.github.io/OTT/
```

## 🐛 Pourquoi ça peut ne pas fonctionner ?

### Problèmes courants

1. **Workflow non déclenché**
   - Vérifier que vous avez bien push sur `main`
   - Vérifier les Actions GitHub : https://github.com/ymora/OTT/actions

2. **Build échoue**
   - Erreurs de syntaxe dans le code
   - Dépendances manquantes
   - Variables d'environnement incorrectes

3. **Site pas mis à jour**
   - Cache navigateur (Ctrl+F5)
   - Service worker en cache
   - Délai de propagation (attendre 5-10 minutes)

4. **Fichiers manquants**
   - `SUIVI_TEMPS_FACTURATION.md` non généré
   - Fichiers de documentation non copiés
   - `.nojekyll` manquant

## ✅ Solution : Commit vide pour forcer le déploiement

Quand le site n'est pas à jour, on peut forcer un nouveau déploiement :

```bash
git commit --allow-empty -m "chore: Force GitHub Pages deployment"
git push origin main
```

Cela déclenche le workflow **sans modifier le code**, forçant un rebuild complet.

## 📊 Vérification du déploiement

### Script de vérification

```powershell
.\scripts\verifier-deploiement-github-pages.ps1
```

Ce script :
- Vérifie l'accessibilité du site
- Teste les fichiers critiques
- Affiche les liens utiles

### Vérification manuelle

1. **Actions GitHub** : https://github.com/ymora/OTT/actions
   - Voir si le workflow est en cours ou a réussi
   - Voir les logs en cas d'erreur

2. **Site GitHub Pages** : https://ymora.github.io/OTT/
   - Vérifier que le site fonctionne
   - Faire Ctrl+F5 pour vider le cache

3. **Fichiers spécifiques** :
   - https://ymora.github.io/OTT/SUIVI_TEMPS_FACTURATION.md
   - https://ymora.github.io/OTT/docs/DOCUMENTATION_PRESENTATION.html

## 🎯 Résumé

- **Workflow déclenché** : À chaque push sur `main`
- **Script exécuté** : `export_static.sh` pendant le workflow
- **Durée** : 2-5 minutes en moyenne
- **Résultat** : Site mis à jour sur GitHub Pages
- **Problème** : Si pas à jour, créer un commit vide pour forcer le redéploiement

