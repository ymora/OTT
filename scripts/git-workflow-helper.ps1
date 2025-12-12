# Script d'aide pour le workflow Git
# Facilite les opérations courantes de gestion des branches

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("create-branch", "sync-main", "list-prs", "cleanup", "check-status", "help")]
    [string]$Action = "help",
    
    [Parameter(Mandatory=$false)]
    [string]$BranchName = "",
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("feature", "fix", "hotfix", "refactor", "docs")]
    [string]$BranchType = "feature"
)

$ErrorActionPreference = "Stop"

# Couleurs pour l'affichage
function Write-Success { param($Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Info { param($Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Warning { param($Message) Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Error { param($Message) Write-Host "❌ $Message" -ForegroundColor Red }

# Vérifier qu'on est dans un dépôt Git
function Test-GitRepository {
    if (-not (Test-Path ".git")) {
        Write-Error "Ce répertoire n'est pas un dépôt Git!"
        exit 1
    }
}

# Afficher l'aide
function Show-Help {
    Write-Host @"
🔧 Git Workflow Helper - Projet OTT
====================================

USAGE:
    .\git-workflow-helper.ps1 -Action <action> [options]

ACTIONS DISPONIBLES:

    create-branch       Créer une nouvelle branche de travail
        -BranchType <type>    Type: feature, fix, hotfix, refactor, docs (défaut: feature)
        -BranchName <nom>     Nom descriptif de la branche (obligatoire)
        Exemple: .\git-workflow-helper.ps1 -Action create-branch -BranchType feature -BranchName "ajout-graphiques"

    sync-main           Synchroniser avec la branche main distante
        Met à jour votre branche main locale avec les dernières modifications

    list-prs            Lister les Pull Requests ouvertes
        Affiche toutes les PR en attente de validation

    cleanup             Nettoyer les branches locales fusionnées
        Supprime les branches locales déjà fusionnées dans main

    check-status        Vérifier l'état du dépôt
        Affiche la branche actuelle, les modifications, et l'état de sync

    help                Afficher cette aide

EXEMPLES:

    # Créer une nouvelle branche feature
    .\git-workflow-helper.ps1 -Action create-branch -BranchType feature -BranchName "ajout-notifications"

    # Synchroniser avec main
    .\git-workflow-helper.ps1 -Action sync-main

    # Vérifier l'état
    .\git-workflow-helper.ps1 -Action check-status

    # Nettoyer les branches fusionnées
    .\git-workflow-helper.ps1 -Action cleanup

"@ -ForegroundColor White
}

# Créer une nouvelle branche
function New-WorkBranch {
    param($Type, $Name)
    
    if ([string]::IsNullOrWhiteSpace($Name)) {
        Write-Error "Le nom de la branche est obligatoire! Utilisez -BranchName"
        exit 1
    }
    
    $fullBranchName = "$Type/$Name"
    
    Write-Info "Création de la branche: $fullBranchName"
    
    # Vérifier qu'on est sur main
    $currentBranch = git branch --show-current
    if ($currentBranch -ne "main") {
        Write-Warning "Vous n'êtes pas sur main (actuellement sur: $currentBranch)"
        $response = Read-Host "Voulez-vous passer sur main d'abord? (o/N)"
        if ($response -eq "o") {
            git checkout main
        }
    }
    
    # Mettre à jour main
    Write-Info "Mise à jour de la branche main..."
    git pull origin main
    
    # Créer et passer sur la nouvelle branche
    Write-Info "Création et passage sur la nouvelle branche..."
    git checkout -b $fullBranchName
    
    Write-Success "Branche '$fullBranchName' créée et active!"
    Write-Info "Vous pouvez maintenant travailler sur cette branche."
    Write-Info "Commandes utiles:"
    Write-Host "  git add ." -ForegroundColor Gray
    Write-Host "  git commit -m 'feat: description de la modification'" -ForegroundColor Gray
    Write-Host "  git push origin $fullBranchName" -ForegroundColor Gray
}

# Synchroniser avec main
function Sync-MainBranch {
    Write-Info "Synchronisation avec la branche main distante..."
    
    $currentBranch = git branch --show-current
    
    if ($currentBranch -ne "main") {
        Write-Info "Passage sur la branche main..."
        git checkout main
    }
    
    Write-Info "Récupération des dernières modifications..."
    git pull origin main
    
    Write-Success "Branche main synchronisée!"
    
    if ($currentBranch -ne "main") {
        Write-Info "Retour sur la branche $currentBranch..."
        git checkout $currentBranch
    }
}

# Lister les Pull Requests (nécessite GitHub CLI)
function List-PullRequests {
    Write-Info "Liste des Pull Requests ouvertes..."
    
    if (-not (Get-Command "gh" -ErrorAction SilentlyContinue)) {
        Write-Warning "GitHub CLI (gh) n'est pas installé."
        Write-Info "Vous pouvez voir les PR sur: https://github.com/ymora/OTT/pulls"
        return
    }
    
    gh pr list
}

# Nettoyer les branches locales
function Remove-MergedBranches {
    Write-Info "Nettoyage des branches locales fusionnées..."
    
    # Passer sur main pour pouvoir supprimer les autres branches
    git checkout main
    git pull origin main
    
    # Lister les branches fusionnées (sauf main)
    $mergedBranches = git branch --merged main | Where-Object { $_ -notmatch "main" -and $_ -notmatch "\*" } | ForEach-Object { $_.Trim() }
    
    if ($mergedBranches.Count -eq 0) {
        Write-Success "Aucune branche fusionnée à nettoyer."
        return
    }
    
    Write-Info "Branches fusionnées trouvées:"
    $mergedBranches | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
    
    $response = Read-Host "Voulez-vous supprimer ces branches? (o/N)"
    if ($response -eq "o") {
        foreach ($branch in $mergedBranches) {
            Write-Info "Suppression de la branche: $branch"
            git branch -d $branch
        }
        Write-Success "Branches nettoyées!"
    } else {
        Write-Info "Nettoyage annulé."
    }
}

# Vérifier l'état du dépôt
function Get-RepositoryStatus {
    Write-Host "`n📊 État du dépôt Git" -ForegroundColor Cyan
    Write-Host "==================`n" -ForegroundColor Cyan
    
    # Branche actuelle
    $currentBranch = git branch --show-current
    Write-Host "🌿 Branche actuelle: " -NoNewline
    Write-Host $currentBranch -ForegroundColor Green
    
    # Modifications en cours
    $status = git status --short
    if ($status) {
        Write-Host "`n📝 Modifications en cours:" -ForegroundColor Yellow
        git status --short
    } else {
        Write-Host "`n✅ Aucune modification en cours" -ForegroundColor Green
    }
    
    # Commits en avance/retard
    Write-Host "`n🔄 État de synchronisation:" -ForegroundColor Cyan
    git fetch origin
    $ahead = git rev-list --count origin/$currentBranch..$currentBranch 2>$null
    $behind = git rev-list --count $currentBranch..origin/$currentBranch 2>$null
    
    if ($ahead -gt 0) {
        Write-Host "  ⬆️  $ahead commit(s) en avance" -ForegroundColor Yellow
    }
    if ($behind -gt 0) {
        Write-Host "  ⬇️  $behind commit(s) en retard" -ForegroundColor Yellow
    }
    if ($ahead -eq 0 -and $behind -eq 0) {
        Write-Host "  ✅ Synchronisé avec origin/$currentBranch" -ForegroundColor Green
    }
    
    # Derniers commits
    Write-Host "`n📜 Derniers commits:" -ForegroundColor Cyan
    git log --oneline -n 5
    
    Write-Host ""
}

# Point d'entrée principal
function Main {
    Test-GitRepository
    
    switch ($Action) {
        "create-branch" { New-WorkBranch -Type $BranchType -Name $BranchName }
        "sync-main" { Sync-MainBranch }
        "list-prs" { List-PullRequests }
        "cleanup" { Remove-MergedBranches }
        "check-status" { Get-RepositoryStatus }
        "help" { Show-Help }
        default { Show-Help }
    }
}

# Exécuter le script
Main

