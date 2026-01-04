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
        )
        Files = @(
            "**/*.min.js"
            "**/*.bundle.js"
        )
    }

    Checks = @{ }

    ScoreWeights = @{
        "Architecture" = 1.0
        "CodeMort" = 1.5
        "Duplication" = 1.2
        "Complexity" = 1.2
        "Security" = 2.0
        "Performance" = 1.0
        "API" = 1.5
        "Database" = 1.0
        "Tests" = 0.8
        "Documentation" = 0.5
        "Configuration" = 1.5
        "Structure API" = 1.0
        "Optimisations" = 1.2
        "Organization" = 0.8
        "UI/UX" = 0.8
    }
}
