# Configuration GitHub Pages

## ⚠️ IMPORTANT : Configuration Requise

Pour que le dashboard soit accessible à https://ymora.github.io/OTT/, GitHub Pages **DOIT** être configuré pour utiliser **GitHub Actions** comme source, et NON le dossier `docs/`.

### ✅ Configuration Correcte

1. Aller dans **Settings** → **Pages** du repository GitHub
2. Sous **Source**, sélectionner **GitHub Actions** (pas "Deploy from a branch")
3. Le workflow `.github/workflows/deploy.yml` déploiera automatiquement depuis `out/` à chaque push sur `main`

### ❌ Configuration Incorrecte

Si GitHub Pages est configuré pour servir depuis :
- **Branch `main` / `docs/`** → ❌ Cela servira `docs/index.html` (ancien build)
- **Branch `main` / `root`** → ❌ Cela servira `README.md` ou autres fichiers

### 🔍 Vérification

Après chaque déploiement, vérifier que :
1. https://ymora.github.io/OTT/ affiche la page de **connexion** (OTT Dashboard)
2. **PAS** la page de documentation ou le README

### 🛠️ Solution si le problème persiste

1. Vérifier dans **Settings** → **Pages** que la source est bien **GitHub Actions**
2. Si ce n'est pas le cas, changer pour **GitHub Actions**
3. Attendre quelques minutes pour que le changement prenne effet
4. Vider le cache du navigateur (Ctrl+F5)

