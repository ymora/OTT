# ===============================================================================
# CONFIGURATION AUDIT - Par défaut (générique)
# ===============================================================================
# Cette configuration doit rester réutilisable pour tout projet.
# Les surcharges spécifiques projet se trouvent dans :
#   audit/projects/<project>/config/audit.config.ps1
# ===============================================================================

@{
    Project = @{
        Name = "Projet"
        Company = ""
        Description = ""
    }

    Exclude = @{
        Directories = @(
            "node_modules"
            ".next"
            "dist"
            "build"
            ".git"
            "out"
            "vendor"
            ".arduino15"
            "audit/resultats"
            "resultats"
        )
        Files = @(
            "**/*.min.js"
            "**/*.bundle.js"
        )
    }

    Checks = @{
        Complexity = @{
            Enabled = $true
            # Seuil augmenté pour éviter les faux positifs sur les fichiers légitimement grands
            # (composants React complexes, API monolithiques, etc.)
            MaxFileLines = 800
            MaxFunctionLines = 120
            # Pour limiter le coût IA, ne générer des questions IA que pour les fichiers vraiment énormes.
            AIQuestionMinLines = 1500
        }
    }

    ScoreWeights = @{
        # Phase 1: Inventaire
        "Inventory" = 0.5
        # Phase 2: Architecture
        "Architecture" = 1.0
        "Organization" = 0.8
        # Phase 3: Sécurité
        "Security" = 2.0
        # Phase 4: Configuration
        "Configuration" = 1.5
        # Phase 5: Backend
        "API" = 1.5
        "Structure API" = 1.0
        "Database" = 1.0
        # Phase 6: Frontend
        "Routes" = 0.8
        "UI/UX" = 0.8
        # Phase 7: Qualité Code
        "Code Mort" = 1.5
        "Duplication" = 1.2
        "Complexity" = 1.2
        # Phase 8: Performance
        "Performance" = 1.0
        "Optimisations" = 1.2
        # Phase 9: Documentation
        "Documentation" = 0.5
        "MarkdownFiles" = 0.3
        # Phase 10: Tests
        "Tests" = 0.8
        "FunctionalTests" = 0.5
        # Phase 12: Hardware
        "Firmware" = 0.5
    }
}
