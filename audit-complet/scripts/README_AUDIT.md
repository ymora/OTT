# Script d'Audit Automatique - Documentation

## 📋 Vue d'ensemble

Le script `AUDIT_COMPLET_AUTOMATIQUE.ps1` effectue un audit complet de votre projet en 20 phases, couvrant :
- Code mort et duplication
- Complexité et performance
- Sécurité (SQL injection, XSS)
- Tests API fonctionnels
- Base de données
- Documentation et organisation

## 🚀 Utilisation

### Utilisation basique (projet OTT)
```powershell
.\scripts\AUDIT_COMPLET_AUTOMATIQUE.ps1
```

### Utilisation avec configuration personnalisée
```powershell
.\scripts\AUDIT_COMPLET_AUTOMATIQUE.ps1 -ConfigFile "scripts/audit.config.ps1"
```

### Utilisation avec variables d'environnement
```powershell
$env:AUDIT_EMAIL = "user@example.com"
$env:AUDIT_PASSWORD = "password"
$env:AUDIT_API_URL = "https://api.example.com"
.\scripts\AUDIT_COMPLET_AUTOMATIQUE.ps1
```

### Options disponibles
```powershell
.\scripts\AUDIT_COMPLET_AUTOMATIQUE.ps1 `
    -Email "user@example.com" `
    -Password "password" `
    -ApiUrl "https://api.example.com" `
    -ConfigFile "scripts/audit.config.ps1" `
    -Verbose `
    -MaxFileLines 500
```

## ⚙️ Configuration

### Créer votre configuration

1. **Copier l'exemple** :
   ```powershell
   Copy-Item scripts/audit.config.example.ps1 scripts/audit.config.ps1
   ```

2. **Adapter à votre projet** :
   - Modifier les endpoints API
   - Adapter les routes
   - Configurer les hooks spécifiques
   - Ajuster la structure de la base de données

3. **Utiliser la configuration** :
   ```powershell
   .\scripts\AUDIT_COMPLET_AUTOMATIQUE.ps1 -ConfigFile "scripts/audit.config.ps1"
   ```

### Structure de la configuration

Le fichier `audit.config.ps1` est un hashtable PowerShell contenant :

```powershell
@{
    Project = @{ Name = "..."; Company = "..." }
    Api = @{ BaseUrl = "..."; Endpoints = @(...) }
    Routes = @(...)
    Hooks = @{ Archive = "..."; Delete = "..." }
    Database = @{ Entities = @(...) }
    GitHub = @{ Repo = "..."; BaseUrl = "..." }
    # ... etc
}
```

Voir `audit.config.example.ps1` pour un exemple complet.

## 🔒 Sécurité

### Variables d'environnement (recommandé)
```powershell
# Windows PowerShell
$env:AUDIT_EMAIL = "user@example.com"
$env:AUDIT_PASSWORD = "password"

# PowerShell Core (cross-platform)
$env:AUDIT_EMAIL = "user@example.com"
$env:AUDIT_PASSWORD = "password"
```

### Prompt sécurisé
Si les variables d'environnement ne sont pas définies, le script demandera le mot de passe de manière sécurisée.

## 📊 Phases d'audit

1. **Inventaire exhaustif** - Tous les fichiers
2. **Architecture** - Statistiques du code
3. **Code mort** - Composants/hooks/libs non utilisés
4. **Duplication** - Patterns dupliqués
5. **Complexité** - Fichiers volumineux
6. **Routes** - Vérification des pages
7. **Endpoints API** - Tests fonctionnels
8. **Base de données** - Cohérence et intégrité
9. **Sécurité** - SQL injection, XSS
10. **Performance** - Optimisations React
11. **Tests** - Couverture
12. **Documentation** - Complétude
13. **Imports** - Vérification
14. **Erreurs** - Gestion
15. **Logs** - Utilisation
16. **Best practices** - Conformité
17. **Uniformisation UI/UX** - Cohérence
18. **Organisation** - Structure
19. **Éléments inutiles** - Fichiers obsolètes
20. **Synchronisation GitHub** - Déploiement

## 🔧 Personnalisation

### Pour un nouveau projet

1. **Créer `audit.config.ps1`** basé sur `audit.config.example.ps1`
2. **Adapter les endpoints** selon votre API
3. **Configurer les routes** selon votre structure
4. **Définir les hooks** si vous en avez
5. **Ajuster la structure BDD** selon votre schéma

### Exemple minimal

```powershell
@{
    Project = @{ Name = "Mon Projet"; Company = "Ma Société" }
    Api = @{
        BaseUrl = "https://api.monprojet.com"
        AuthEndpoint = "/api/auth/login"
        Endpoints = @(
            @{ Path = "/api/users"; Name = "Utilisateurs" }
        )
    }
    Routes = @(
        @{ Route = "/dashboard"; File = "app/dashboard/page.js"; Name = "Dashboard" }
    )
}
```

## 📝 Notes importantes

- Le script utilise des valeurs par défaut pour le projet OTT si aucune configuration n'est fournie
- Les variables d'environnement ont priorité sur la configuration
- Le mot de passe n'est jamais affiché dans les logs
- Le script est compatible PowerShell 5.1+ et PowerShell Core 7+

## 🐛 Dépannage

### Erreur "Configuration non trouvée"
- Vérifiez que `audit.config.ps1` existe
- Utilisez `-ConfigFile` pour spécifier le chemin
- Le script utilisera les valeurs par défaut si la config est absente

### Erreur d'authentification API
- Vérifiez les variables d'environnement `AUDIT_EMAIL` et `AUDIT_PASSWORD`
- Vérifiez l'URL de l'API dans la configuration
- Vérifiez que l'endpoint d'authentification est correct

### Tests API échouent
- Vérifiez que l'API est accessible
- Vérifiez que les endpoints sont corrects dans la configuration
- Utilisez `-Verbose` pour plus de détails

## 📚 Références

- Configuration : `scripts/audit.config.ps1`
- Exemple : `scripts/audit.config.example.ps1`
- Script principal : `scripts/AUDIT_COMPLET_AUTOMATIQUE.ps1`

