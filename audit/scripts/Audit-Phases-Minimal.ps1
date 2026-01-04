# Version minimaliste fonctionnelle pour lancer l'audit

$script:AuditPhases = @(
    @{ Number = 1; Name = "Inventaire Exhaustif"; Description = "Tous les fichiers et répertoires"; Dependencies = @() }
    @{ Number = 2; Name = "Architecture"; Description = "Structure du projet"; Dependencies = @(1) }
    @{ Number = 3; Name = "Organisation"; Description = "Structure fichiers"; Dependencies = @(1) }
    @{ Number = 4; Name = "Sécurité"; Description = "SQL injection, XSS"; Dependencies = @(1) }
    @{ Number = 5; Name = "API"; Description = "Tests endpoints API"; Dependencies = @(1) }
    @{ Number = 6; Name = "Base de Données"; Description = "Cohérence BDD"; Dependencies = @(5) }
    @{ Number = 7; Name = "Code Mort"; Description = "Fichiers non utilisés"; Dependencies = @(1, 2) }
    @{ Number = 8; Name = "Performance"; Description = "Optimisations"; Dependencies = @(1) }
    @{ Number = 9; Name = "Documentation"; Description = "README, commentaires"; Dependencies = @(1) }
)

function Get-PhaseDependencies {
    param([int]$PhaseNumber)
    $phase = $script:AuditPhases | Where-Object { $_.Number -eq $PhaseNumber }
    if ($phase) { return $phase.Dependencies } else { return @() }
}

function Parse-PhaseSelection {
    param([string]$Selection)
    if ($Selection -eq "A" -or $Selection -eq "a") {
        return $script:AuditPhases | ForEach-Object { $_.Number }
    }
    
    $selected = @()
    $parts = $Selection -split ','
    foreach ($part in $parts) {
        $part = $part.Trim()
        if ($part -match '^\d+$') {
            $num = [int]$part
            if ($script:AuditPhases | Where-Object { $_.Number -eq $num }) {
                $selected += $num
            }
        }
    }
    
    # Ajouter les dépendances
    $all = @()
    foreach ($num in $selected) {
        $deps = Get-PhaseDependencies -PhaseNumber $num
        foreach ($dep in $deps) {
            if ($all -notcontains $dep) { $all += $dep }
        }
        if ($all -notcontains $num) { $all += $num }
    }
    
    return ($all | Sort-Object -Unique)
}

function Save-AuditState {
    param([string]$StateFile, [array]$CompletedPhases)
    $state = @{ CompletedPhases = $CompletedPhases; Timestamp = Get-Date }
    $state | ConvertTo-Json | Out-File -FilePath $StateFile -Encoding UTF8
}

function Load-AuditState {
    param([string]$StateFile)
    if (Test-Path $StateFile) {
        try {
            $content = Get-Content $StateFile -Raw | ConvertFrom-Json
            return @{ CompletedPhases = [array]$content.CompletedPhases }
        } catch { return @{ CompletedPhases = @() } }
    }
    return @{ CompletedPhases = @() }
}

Write-Host "Audit-Phases-Minimal.ps1 chargé" -ForegroundColor Green
