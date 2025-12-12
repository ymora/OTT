# Script de configuration de la collaboration GitHub
# Automatise autant que possible la configuration via GitHub CLI

param(
    [Parameter(Mandatory=$false)]
    [string]$CollaboratorUsername = "",
    
    [Parameter(Mandatory=$false)]
    [switch]$ProtectBranch,
    
    [Parameter(Mandatory=$false)]
    [switch]$TestWorkflow,
    
    [Parameter(Mandatory=$false)]
    [switch]$Help
)

$ErrorActionPreference = "Continue"

# Couleurs
function Write-Success { param($Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Info { param($Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Warning { param($Message) Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Error { param($Message) Write-Host "❌ $Message" -ForegroundColor Red }
function Write-Step { param($Message) Write-Host "`n🔹 $Message" -ForegroundColor Magenta }

function Show-Help {
    Write-Host @"
🔧 Configuration GitHub Collaboration
======================================

Ce script aide à configurer la collaboration GitHub avec protection de branche.

PRÉREQUIS:
    - GitHub CLI (gh) installé et authentifié
    - Droits administrateur sur le dépôt GitHub

INSTALLATION GITHUB CLI:
    winget install GitHub.cli
    # Puis authentifier :
    gh auth login

USAGE:
    .\setup-github-collaboration.ps1 [-CollaboratorUsername <username>] [-ProtectBranch] [-TestWorkflow] [-Help]

OPTIONS:
    -CollaboratorUsername <username>    Nom d'utilisateur GitHub du collaborateur à ajouter
    -ProtectBranch                      Protéger la branche main
    -TestWorkflow                       Tester le workflow avec une branche de test
    -Help                               Afficher cette aide

EXEMPLES:
    # Ajouter un collaborateur
    .\setup-github-collaboration.ps1 -CollaboratorUsername maximeberriot

    # Protéger la branche main
    .\setup-github-collaboration.ps1 -ProtectBranch

    # Tester le workflow
    .\setup-github-collaboration.ps1 -TestWorkflow

    # Tout faire en une fois
    .\setup-github-collaboration.ps1 -CollaboratorUsername maximeberriot -ProtectBranch

"@ -ForegroundColor White
}

function Test-GitHubCLI {
    Write-Step "Vérification de GitHub CLI..."
    
    if (-not (Get-Command "gh" -ErrorAction SilentlyContinue)) {
        Write-Error "GitHub CLI (gh) n'est pas installé!"
        Write-Info "Pour l'installer, exécutez :"
        Write-Host "    winget install GitHub.cli" -ForegroundColor Gray
        Write-Info "Puis authentifiez-vous :"
        Write-Host "    gh auth login" -ForegroundColor Gray
        return $false
    }
    
    # Vérifier l'authentification
    $authStatus = gh auth status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Vous n'êtes pas authentifié avec GitHub CLI!"
        Write-Info "Pour vous authentifier, exécutez :"
        Write-Host "    gh auth login" -ForegroundColor Gray
        return $false
    }
    
    Write-Success "GitHub CLI installé et authentifié"
    return $true
}

function Get-RepoInfo {
    Write-Step "Récupération des informations du dépôt..."
    
    $repoInfo = gh repo view --json owner,name,url 2>&1 | ConvertFrom-Json
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Impossible de récupérer les informations du dépôt"
        return $null
    }
    
    Write-Success "Dépôt : $($repoInfo.owner.login)/$($repoInfo.name)"
    Write-Info "URL : $($repoInfo.url)"
    
    return $repoInfo
}

function Add-Collaborator {
    param($Username, $RepoInfo)
    
    Write-Step "Ajout du collaborateur : $Username"
    
    $owner = $RepoInfo.owner.login
    $repo = $RepoInfo.name
    
    Write-Info "Invitation de $Username au dépôt $owner/$repo..."
    
    # GitHub CLI n'a pas de commande directe pour ajouter un collaborateur
    # On utilise l'API GitHub
    gh api -X PUT "repos/$owner/$repo/collaborators/$Username" -f permission=push 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Invitation envoyée à $Username !"
        Write-Info "$Username recevra un email et devra accepter l'invitation."
        Write-Info "Vérifier les invitations : https://github.com/$owner/$repo/settings/access"
    } else {
        Write-Error "Erreur lors de l'invitation de $Username"
        Write-Info "Vous pouvez le faire manuellement sur : https://github.com/$owner/$repo/settings/access"
    }
}

function Protect-MainBranch {
    param($RepoInfo)
    
    Write-Step "Protection de la branche main..."
    
    $owner = $RepoInfo.owner.login
    $repo = $RepoInfo.name
    
    Write-Warning "Configuration de la protection de branche..."
    
    # Configuration de la protection de branche via l'API GitHub
    $protectionConfig = @{
        required_status_checks = $null
        enforce_admins = $true
        required_pull_request_reviews = @{
            dismiss_stale_reviews = $true
            require_code_owner_reviews = $false
            required_approving_review_count = 1
            require_last_push_approval = $false
        }
        restrictions = $null
        required_linear_history = $true
        allow_force_pushes = $false
        allow_deletions = $false
        block_creations = $false
        required_conversation_resolution = $true
        lock_branch = $false
        allow_fork_syncing = $false
    } | ConvertTo-Json -Depth 10
    
    Write-Info "Application de la protection..."
    
    gh api -X PUT "repos/$owner/$repo/branches/main/protection" --input - <<< $protectionConfig 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Branche main protégée avec succès !"
        Write-Info "Règles appliquées :"
        Write-Host "  ✅ Pull Request obligatoire avant fusion" -ForegroundColor Gray
        Write-Host "  ✅ 1 approbation requise" -ForegroundColor Gray
        Write-Host "  ✅ Résolution des commentaires obligatoire" -ForegroundColor Gray
        Write-Host "  ✅ Historique linéaire" -ForegroundColor Gray
        Write-Host "  ❌ Force push désactivé" -ForegroundColor Gray
        Write-Host "  ❌ Suppression désactivée" -ForegroundColor Gray
        Write-Host "  ✅ Admins doivent suivre les règles" -ForegroundColor Gray
        Write-Warning "Vous ne pourrez plus pousser directement sur main !"
    } else {
        Write-Error "Erreur lors de la protection de la branche"
        Write-Info "Vous pouvez le faire manuellement sur : https://github.com/$owner/$repo/settings/branches"
    }
}

function Test-WorkflowSetup {
    Write-Step "Test du workflow de collaboration..."
    
    Write-Info "Création d'une branche de test..."
    
    # Vérifier qu'on est sur main
    $currentBranch = git branch --show-current
    if ($currentBranch -ne "main") {
        git checkout main
    }
    
    # Créer une branche de test
    $testBranch = "test/setup-workflow-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    git checkout -b $testBranch
    
    # Créer un fichier de test
    $testFile = "test-workflow-setup.txt"
    "Test de la configuration du workflow de collaboration" | Out-File $testFile
    "Date : $(Get-Date)" | Out-File $testFile -Append
    "Branche : $testBranch" | Out-File $testFile -Append
    
    git add $testFile
    git commit -m "test: vérification configuration workflow collaboration"
    
    Write-Info "Push de la branche de test..."
    git push origin $testBranch
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Branche de test poussée avec succès !"
        
        Write-Info "Création d'une Pull Request de test..."
        
        $prTitle = "Test: Configuration workflow collaboration"
        $prBody = @"
## 🧪 Pull Request de test

Cette PR teste la configuration du workflow de collaboration.

### Vérifications :
- [x] Branche créée avec succès
- [x] Fichier de test ajouté
- [x] Commit effectué
- [x] Push réussi
- [ ] PR créée (en cours)
- [ ] Approbation requise
- [ ] Fusion possible après approbation

### Fichiers modifiés :
- $testFile (nouveau fichier de test)

---

**Cette PR peut être fusionnée puis supprimée après test.**
"@
        
        gh pr create --title "$prTitle" --body "$prBody" --base main --head $testBranch
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Pull Request de test créée !"
            Write-Info "Vous pouvez maintenant :"
            Write-Host "  1. Aller sur GitHub et voir la PR" -ForegroundColor Gray
            Write-Host "  2. Vérifier que l'approbation est requise" -ForegroundColor Gray
            Write-Host "  3. Approuver la PR" -ForegroundColor Gray
            Write-Host "  4. Fusionner la PR" -ForegroundColor Gray
            Write-Host "  5. Supprimer la branche de test" -ForegroundColor Gray
            
            # Ouvrir la PR dans le navigateur
            Write-Info "Ouverture de la PR dans le navigateur..."
            gh pr view --web
        } else {
            Write-Warning "Impossible de créer la PR automatiquement"
            Write-Info "Vous pouvez la créer manuellement sur GitHub"
        }
        
        # Revenir sur main
        git checkout main
    } else {
        Write-Error "Erreur lors du push de la branche de test"
        git checkout main
        git branch -D $testBranch
    }
}

function Show-ManualInstructions {
    param($RepoInfo)
    
    $owner = $RepoInfo.owner.login
    $repo = $RepoInfo.name
    
    Write-Host "`n" -NoNewline
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  📋 INSTRUCTIONS MANUELLES" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    
    Write-Host "`n🔹 Pour ajouter un collaborateur manuellement :" -ForegroundColor Yellow
    Write-Host "   1. Ouvrir : https://github.com/$owner/$repo/settings/access" -ForegroundColor White
    Write-Host "   2. Cliquer sur 'Invite a collaborator'" -ForegroundColor White
    Write-Host "   3. Entrer le nom d'utilisateur ou email" -ForegroundColor White
    Write-Host "   4. Sélectionner le rôle 'Write'" -ForegroundColor White
    Write-Host "   5. Envoyer l'invitation" -ForegroundColor White
    
    Write-Host "`n🔹 Pour protéger la branche main manuellement :" -ForegroundColor Yellow
    Write-Host "   1. Ouvrir : https://github.com/$owner/$repo/settings/branches" -ForegroundColor White
    Write-Host "   2. Cliquer sur 'Add branch protection rule'" -ForegroundColor White
    Write-Host "   3. Branch pattern : main" -ForegroundColor White
    Write-Host "   4. Cocher :" -ForegroundColor White
    Write-Host "      ✅ Require a pull request before merging" -ForegroundColor Green
    Write-Host "         - Require approvals: 1" -ForegroundColor Green
    Write-Host "         - Dismiss stale pull request approvals" -ForegroundColor Green
    Write-Host "      ✅ Require conversation resolution" -ForegroundColor Green
    Write-Host "      ✅ Do not allow bypassing (IMPORTANT)" -ForegroundColor Green
    Write-Host "      ❌ Allow force pushes (DÉSACTIVER)" -ForegroundColor Red
    Write-Host "      ❌ Allow deletions (DÉSACTIVER)" -ForegroundColor Red
    Write-Host "   5. Cliquer sur 'Create'" -ForegroundColor White
    
    Write-Host "`n═══════════════════════════════════════════════════════════`n" -ForegroundColor Cyan
}

# Point d'entrée principal
function Main {
    Write-Host "`n🚀 Configuration de la collaboration GitHub" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════`n" -ForegroundColor Cyan
    
    if ($Help) {
        Show-Help
        return
    }
    
    # Vérifier GitHub CLI
    if (-not (Test-GitHubCLI)) {
        Write-Host "`n"
        Show-ManualInstructions -RepoInfo @{owner=@{login="ymora"}; name="OTT"}
        return
    }
    
    # Récupérer les infos du dépôt
    $repoInfo = Get-RepoInfo
    if (-not $repoInfo) {
        return
    }
    
    # Ajouter un collaborateur
    if ($CollaboratorUsername) {
        Add-Collaborator -Username $CollaboratorUsername -RepoInfo $repoInfo
    }
    
    # Protéger la branche main
    if ($ProtectBranch) {
        Protect-MainBranch -RepoInfo $repoInfo
    }
    
    # Tester le workflow
    if ($TestWorkflow) {
        Test-WorkflowSetup
    }
    
    # Afficher les instructions manuelles
    if (-not $CollaboratorUsername -and -not $ProtectBranch -and -not $TestWorkflow) {
        Show-ManualInstructions -RepoInfo $repoInfo
    }
    
    Write-Host "`n✅ Configuration terminée !`n" -ForegroundColor Green
}

# Exécuter le script
Main

