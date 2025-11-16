# Scripts PowerShell pour OTT

## Script principal : `dev.ps1`

**Un seul script pour tout gérer !**

### Utilisation

```powershell
.\scripts\dev.ps1 [action]
```

### Actions disponibles

- **`start`** (par défaut) - Démarre l'environnement de développement
  - Arrête les processus sur les ports
  - Redémarre PostgreSQL Docker
  - Vérifie les dépendances
  - Configure `.env.local` si nécessaire
  - Nettoie le cache Next.js
  - Lance Next.js et ouvre le navigateur

- **`stop`** - Arrête tous les services
  - Libère les ports 3000, 5432, 8080, 8081

- **`restart`** - Redémarre l'environnement
  - Même chose que `start` mais avec nettoyage

- **`clean`** - Nettoie les fichiers de build
  - Supprime `.next/`, `out/`, `node_modules/.cache`

- **`test`** - Teste le build pour GitHub Pages
  - Compile avec `basePath=/OTT`
  - Vérifie la structure des fichiers

- **`build`** - Build de production
  - Génère les fichiers statiques dans `out/`

- **`setup`** - Configuration initiale
  - Installe les dépendances
  - Crée `.env.local`

### Exemples

```powershell
# Démarrer l'environnement (action par défaut)
.\scripts\dev.ps1
# ou
.\scripts\dev.ps1 start

# Arrêter les services
.\scripts\dev.ps1 stop

# Nettoyer et redémarrer
.\scripts\dev.ps1 clean
.\scripts\dev.ps1 start

# Tester le build
.\scripts\dev.ps1 test
```

## Scripts obsolètes (remplacés par dev.ps1)

Les scripts suivants sont maintenant obsolètes et remplacés par `dev.ps1` :

- ❌ `restart_local.ps1` → `dev.ps1 start`
- ❌ `stop_ports.ps1` → `dev.ps1 stop`
- ❌ `test_build.ps1` → `dev.ps1 test`
- ❌ `test_full_build.ps1` → `dev.ps1 test`
- ❌ `fix_env_local.ps1` → `dev.ps1 setup`
- ❌ `verify_github_pages.ps1` → `dev.ps1 test`
- ❌ `fix_github_pages.ps1` → `dev.ps1 test`

## Scripts conservés (spécifiques)

- ✅ `db_migrate.sh` - Migration base de données (bash)
- ✅ `deploy_api.sh` - Déploiement API (bash)
- ✅ `deploy_dashboard.sh` - Déploiement dashboard (bash)
- ✅ `flash_firmware.ps1` - Flash firmware ESP32
- ✅ `setup_local.ps1` - Configuration interactive (optionnel)
- ✅ `setup_local_render_db.ps1` - Config API locale avec Render (optionnel)
- ✅ `start_api_local.ps1` - Démarrer API PHP locale (optionnel)
