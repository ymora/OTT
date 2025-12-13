# ===============================================================================
# EXEMPLE DE CONFIGURATION AUDIT - Projet Générique
# ===============================================================================
# Copiez ce fichier vers audit.config.ps1 et adaptez-le à votre projet
# ===============================================================================

@{
    # Informations du projet
    Project = @{
        Name = "Mon Projet"
        Company = "Ma Société"
        Description = "Description du projet"
    }

    # Configuration API
    Api = @{
        BaseUrl = "https://api.monprojet.com"
        AuthEndpoint = "/api/auth/login"
        Endpoints = @(
            @{ Path = "/api/users"; Name = "Utilisateurs" }
            @{ Path = "/api/posts"; Name = "Articles" }
            @{ Path = "/api/comments"; Name = "Commentaires" }
            @{ Path = "/api/health"; Name = "Healthcheck" }
        )
    }

    # Routes de l'application (Next.js App Router ou autre)
    Routes = @(
        @{ Route = "/dashboard"; File = "app/dashboard/page.js"; Name = "Dashboard" }
        @{ Route = "/users"; File = "app/users/page.js"; Name = "Utilisateurs" }
        @{ Route = "/posts"; File = "app/posts/page.js"; Name = "Articles" }
    )

    # Hooks React spécifiques au projet (pour détection de duplication)
    # Si votre projet n'utilise pas de hooks spécifiques, laissez vide
    Hooks = @{
        Archive = "useArchive"  # Votre hook d'archivage
        PermanentDelete = "useDelete"  # Votre hook de suppression
        Restore = "useRestore"  # Votre hook de restauration
        Delete = "useSoftDelete"  # Votre hook de suppression soft
    }

    # Patterns de fonctions à détecter (pour éviter la duplication)
    # Adaptez selon vos conventions de nommage
    DuplicationPatterns = @(
        @{ Pattern = "const handleArchive\s*=|function handleArchive|handleArchive\s*=\s*async"; Hook = "useArchive"; Description = "handleArchive" }
        @{ Pattern = "const handleDelete\s*=|function handleDelete|handleDelete\s*=\s*async"; Hook = "useDelete"; Description = "handleDelete" }
    )

    # Structure de la base de données (pour vérification de cohérence)
    # Adaptez selon votre schéma de base de données
    Database = @{
        Entities = @(
            @{ Name = "users"; Field = "users"; CountField = "Count"; UnassignedField = $null; UnassignedMessage = $null }
            @{ Name = "posts"; Field = "posts"; CountField = "Count"; UnassignedField = "author_id"; UnassignedMessage = "articles sans auteur" }
            @{ Name = "comments"; Field = "comments"; CountField = "Count"; StatusField = "status"; StatusValue = "pending"; StatusThreshold = 10; StatusMessage = "commentaires en attente" }
        )
    }

    # Configuration GitHub Pages (si applicable)
    GitHub = @{
        Repo = "username/repo"
        BaseUrl = "https://username.github.io/repo"
        BasePath = "/repo"  # Ou "" si à la racine
    }

    # Fichiers de test obsolètes à détecter (spécifiques à votre projet)
    ObsoleteTestFiles = @(
        "test_old.php"
        "test_legacy.js"
    )

    # Scripts de migration redondants (spécifiques à votre projet)
    RedundantMigrationScripts = @(
        "scripts\old_migration.ps1"
    )

    # Scripts redondants (spécifiques à votre projet)
    RedundantScripts = @(
        @{ Script = "scripts\old_script.ps1"; Reason = "Remplacé par nouveau_script.ps1" }
    )

    # Fichiers temporaires à détecter (patterns)
    TemporaryFiles = @(
        "*.tmp"
        "audit_result*.txt"
        "logs_*.log"
    )

    # Documentation obsolète
    ObsoleteDocumentation = @(
        "docs\OLD_README.md"
    )

    # Fichiers dupliqués (Original -> Duplicate)
    DuplicateFiles = @(
        @{ Original = "public\file.md"; Duplicate = "file.md" }
    )

    # Dossiers vides à détecter
    EmptyDirectories = @(
        "docs\archive"
    )

    # Code mort spécifique (fonctions non utilisées)
    DeadCode = @(
        @{ File = "lib\utils.js"; Function = "oldFunction"; Pattern = "oldFunction\(" }
    )
}

