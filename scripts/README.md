# Scripts OTT - Documentation

## 🚀 Script principal : `dev.ps1`

**Un seul script PowerShell pour gérer tout le développement local !**

### Utilisation

```powershell
.\scripts\dev.ps1 [action]
```

### Actions disponibles

| Action | Description |
|--------|-------------|
| **`start`** (défaut) | Démarre l'environnement de développement complet |
| **`stop`** | Arrête tous les services (ports 3000, 5432, 8080, 8081) |
| **`restart`** | Redémarre l'environnement (stop + start) |
| **`clean`** | Nettoie les fichiers de build (`.next/`, `out/`, cache) |
| **`test`** | Tests complets du build pour GitHub Pages |
| **`build`** | Build de production avec tests de base |
| **`setup`** | Configuration initiale (dépendances + `.env.local`) |

### Détails des actions

#### `start` - Démarrage complet
- Arrête les processus sur les ports
- Redémarre PostgreSQL Docker
- Vérifie Node.js et npm
- Installe les dépendances si nécessaire
- Configure `.env.local` (API Render par défaut)
- Nettoie le cache Next.js
- Lance le serveur de développement
- Ouvre automatiquement le navigateur

#### `test` - Tests complets
- Nettoie les anciens builds
- Compile avec `basePath=/OTT`
- Vérifie la structure des fichiers
- Teste les fichiers essentiels (index.html, .nojekyll, _next/, CSS, JS, etc.)
- Affiche la taille du build
- Valide que le build est prêt pour GitHub Pages

#### `build` - Build de production
- Tests de base du build
- Génère les fichiers statiques dans `out/`
- Affiche les prochaines étapes pour le déploiement

### Exemples

```powershell
# Démarrer l'environnement
.\scripts\dev.ps1
# ou
.\scripts\dev.ps1 start

# Arrêter les services
.\scripts\dev.ps1 stop

# Nettoyer et redémarrer
.\scripts\dev.ps1 clean
.\scripts\dev.ps1 restart

# Tester le build complet
.\scripts\dev.ps1 test

# Build de production
.\scripts\dev.ps1 build
```

## 📦 Scripts conservés (spécifiques)

### PowerShell

- ✅ **`dev.ps1`** - Script principal unifié (remplace tous les autres)
- ✅ **`flash_firmware.ps1`** - Compilation et flash du firmware ESP32 via arduino-cli
  ```powershell
  .\scripts\flash_firmware.ps1 -Port COM6
  ```
- ✅ **`setup_local.ps1`** - Configuration interactive (optionnel)
- ✅ **`setup_local_render_db.ps1`** - Config API locale avec Render DB (optionnel)
- ✅ **`start_api_local.ps1`** - Démarrer API PHP locale sur port 8080 (optionnel)

### Bash (Linux/Mac/GitHub Actions)

- ✅ **`db_migrate.sh`** - Migration base de données PostgreSQL
  ```bash
  DATABASE_URL=postgresql://... ./scripts/db_migrate.sh --seed
  ```
- ✅ **`deploy_api.sh`** - Déploiement API sur Render (git push)
- ✅ **`deploy_dashboard.sh`** - Build et déploiement dashboard

## 🗑️ Scripts supprimés (intégrés dans `dev.ps1`)

Les scripts suivants ont été supprimés car leurs fonctionnalités sont intégrées dans `dev.ps1` :

- ❌ `restart_local.ps1` → `dev.ps1 restart`
- ❌ `stop_ports.ps1` → `dev.ps1 stop`
- ❌ `test_build.ps1` → `dev.ps1 test`
- ❌ `test_full_build.ps1` → `dev.ps1 test`
- ❌ `fix_env_local.ps1` → `dev.ps1 setup`
- ❌ `verify_github_pages.ps1` → `dev.ps1 test`
- ❌ `fix_github_pages.ps1` → `dev.ps1 test`
