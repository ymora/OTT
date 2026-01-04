# ===============================================================================
# CONFIGURATION AUDIT - Projet OTT
# ===============================================================================
# Configuration pour l'audit automatique du projet OTT
# ===============================================================================

@{
    # Informations du projet
    Project = @{
        Name = "OTT Dashboard"
        Company = "HAPPLYZ MEDICAL"
        Description = "Système de monitoring et gestion de dispositifs médicaux"
    }

    # Configuration API
    Api = @{
        # URL de l'API - Configuration générique selon le mode
        # Mode production (Render) : https://ott-jbln.onrender.com
        # Mode développement (Docker) : http://localhost:8000
        # 
        # Pour définir le mode, utilisez la variable d'environnement API_MODE:
        #   - $env:API_MODE = "production"  -> Utilise Render
        #   - $env:API_MODE = "development"  -> Utilise Docker (défaut)
        # 
        # Ou définissez directement l'URL avec $env:API_URL
        BaseUrl = if ($env:API_URL) { 
            $env:API_URL 
        } elseif ($env:API_MODE -eq "production") { 
            "https://ott-jbln.onrender.com" 
        } else { 
            "http://localhost:8000" 
        }
        
        # Endpoint d'authentification
        AuthEndpoint = "/api.php/auth/login"
        
        # Endpoints à tester
        Endpoints = @(
            @{ Path="/api.php/devices"; Name="Dispositifs" }
            @{ Path="/api.php/patients"; Name="Patients" }
            @{ Path="/api.php/users"; Name="Utilisateurs" }
            @{ Path="/api.php/alerts"; Name="Alertes" }
            @{ Path="/api.php/firmwares"; Name="Firmwares" }
            @{ Path="/api.php/roles"; Name="Roles" }
            @{ Path="/api.php/permissions"; Name="Permissions" }
            @{ Path="/api.php/health"; Name="Healthcheck" }
        )
    }

    # Credentials API - CONFIGURÉ
    # IMPORTANT: Ne pas commiter ce fichier avec des credentials réels
    # Utiliser des variables d'environnement ou un fichier .env.local
    Credentials = @{
        # Email et mot de passe pour l'authentification API
        # Par défaut, utilise les variables d'environnement
        Email = if ($env:AUDIT_API_EMAIL) { $env:AUDIT_API_EMAIL } else { $env:AUDIT_EMAIL }
        Password = if ($env:AUDIT_API_PASSWORD) { $env:AUDIT_API_PASSWORD } else { $env:AUDIT_PASSWORD }
    }

    # Routes de l'application (Next.js App Router)
    Routes = @(
        @{ Route = "/"; File = "app/page.js"; Name = "Accueil" }
        @{ Route = "/dashboard"; File = "app/dashboard/page.js"; Name = "Dashboard" }
        @{ Route = "/dashboard/dispositifs"; File = "app/dashboard/dispositifs/page.js"; Name = "Dispositifs" }
        @{ Route = "/dashboard/patients"; File = "app/dashboard/patients/page.js"; Name = "Patients" }
        @{ Route = "/dashboard/users"; File = "app/dashboard/users/page.js"; Name = "Utilisateurs" }
        @{ Route = "/dashboard/documentation"; File = "app/dashboard/documentation/page.js"; Name = "Documentation" }
        @{ Route = "/dashboard/admin-migrations"; File = "app/dashboard/admin-migrations/page.js"; Name = "Migrations" }
    )

    # Hooks React spécifiques au projet
    Hooks = @{
        Archive = "useEntityArchive"
        PermanentDelete = "useEntityPermanentDelete"
        Restore = "useEntityRestore"
        Delete = "useEntityDelete"
    }

    # Patterns de fonctions à détecter (pour éviter la duplication)
    DuplicationPatterns = @(
        @{ Pattern = "const handleArchive\s*=|function handleArchive|handleArchive\s*=\s*async"; Hook = "useEntityArchive"; Description = "handleArchive" }
        @{ Pattern = "const handlePermanentDelete\s*=|function handlePermanentDelete|handlePermanentDelete\s*=\s*async"; Hook = "useEntityPermanentDelete"; Description = "handlePermanentDelete" }
        @{ Pattern = "const handleRestore\w*\s*=|function handleRestore\w*|handleRestore\w*\s*=\s*async"; Hook = "useEntityRestore"; Description = "handleRestore*" }
    )

    # Structure de la base de données
    Database = @{
        Entities = @(
            @{ Name = "devices"; Field = "devices"; CountField = "Count"; UnassignedField = "patient_id"; UnassignedMessage = "dispositifs non assignes" }
            @{ Name = "patients"; Field = "patients"; CountField = "Count"; UnassignedField = $null; UnassignedMessage = $null }
            @{ Name = "users"; Field = "users"; CountField = "Count"; UnassignedField = $null; UnassignedMessage = $null }
            @{ Name = "alerts"; Field = "alerts"; CountField = "Count"; UnassignedField = $null; UnassignedMessage = $null }
        )
    }

    # Configuration GitHub Pages
    GitHub = @{
        Repo = "ymora/OTT"
        BaseUrl = "https://ymora.github.io/OTT"
        BasePath = "/OTT"
    }

    # Fichiers de test obsolètes à détecter
    ObsoleteTestFiles = @(
        "scripts\test-send-measurement.ps1"
        "scripts\test-send-measurement.sh"
        "scripts\test-gps-column.js"
        "scripts\test-ota-measurements.sql"
        "scripts\check-measurements-direct.php"
    )

    # Scripts redondants
    RedundantScripts = @(
        # Scripts déjà supprimés - liste conservée pour référence
    )

    # Fichiers temporaires à détecter (patterns)
    TemporaryFiles = @(
        "*.tmp"
        "audit_result*.txt"
        "logs_*.log"
        "*.bak"
    )

    # Documentation obsolète
    ObsoleteDocumentation = @(
        # À compléter selon les besoins
    )

    # Fichiers dupliqués (Original -> Duplicate)
    DuplicateFiles = @(
        @{ Original = "public\SUIVI_TEMPS_FACTURATION.md"; Duplicate = "SUIVI_TEMPS_FACTURATION.md" }
        @{ Original = "public\docs"; Duplicate = "docs\docs" }
    )

    # Dossiers vides à détecter
    EmptyDirectories = @(
        "docs\archive"
        "audit\reports"
    )

    # Code mort spécifique (fonctions non utilisées)
    DeadCode = @(
        # Fonctions déjà supprimées - liste conservée pour référence
    )
}

