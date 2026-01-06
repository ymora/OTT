# ===============================================================================
# GENERATION DES STATISTIQUES GIT PAR UTILISATEUR
# ===============================================================================
# Script pour generer des statistiques detaillees par contributeur
# Usage: .\Generate-GitStats.ps1 [-OutputPath "path"] [-Days 90] [-Format "md|json|both"]
# ===============================================================================

param(
    [string]$OutputPath = "public/SUIVI_CONTRIBUTEURS.md",
    [string]$JsonOutputPath = "public/git_stats.json",
    [int]$Days = 365,
    [ValidateSet("md", "json", "both")]
    [string]$Format = "both",
    [string]$ProjectRoot = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    # scripts folder is directly in the project root
    $ProjectRoot = Split-Path -Parent $PSScriptRoot
}

Push-Location $ProjectRoot

try {
    $gitVersion = & git --version 2>$null
    if (-not $gitVersion) {
        Write-Error "Git n'est pas disponible"
        exit 1
    }

    Write-Host "Generation des statistiques Git par utilisateur..." -ForegroundColor Cyan
    Write-Host "   Projet: $ProjectRoot" -ForegroundColor Gray
    Write-Host "   Periode: $Days derniers jours" -ForegroundColor Gray

    $sinceDate = (Get-Date).AddDays(-$Days).ToString("yyyy-MM-dd")
    $gitLogFormat = "%H|%an|%ae|%ci|%s"
    $commits = & git log --all --since="$sinceDate" --format="$gitLogFormat" 2>$null

    if (-not $commits -or $commits.Count -eq 0) {
        Write-Warning "Aucun commit trouve dans la periode specifiee"
        $commits = @()
    }

    $parsedCommits = @()
    foreach ($line in $commits) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        
        $parts = $line -split '\|', 5
        if ($parts.Count -ge 5) {
            $parsedCommits += @{
                Hash = $parts[0]
                Author = $parts[1].Trim()
                Email = $parts[2].Trim()
                Date = [DateTime]::Parse($parts[3].Substring(0, 19))
                Message = $parts[4]
            }
        }
    }

    Write-Host "   Commits analyses: $($parsedCommits.Count)" -ForegroundColor Green

    $authorStats = @{}
    $dailyStats = @{}

    foreach ($commit in $parsedCommits) {
        $author = $commit.Author
        $dateKey = $commit.Date.ToString("yyyy-MM-dd")
        
        if (-not $authorStats.ContainsKey($author)) {
            $authorStats[$author] = @{
                Name = $author
                Email = $commit.Email
                TotalCommits = 0
                FirstCommit = $commit.Date
                LastCommit = $commit.Date
                DaysActive = @{}
                Categories = @{
                    Feature = 0
                    Fix = 0
                    Refactor = 0
                    Doc = 0
                    Test = 0
                    UI = 0
                    Deploy = 0
                    Other = 0
                }
            }
        }
        
        $authorStats[$author].TotalCommits++
        $authorStats[$author].DaysActive[$dateKey] = $true
        
        if ($commit.Date -lt $authorStats[$author].FirstCommit) {
            $authorStats[$author].FirstCommit = $commit.Date
        }
        if ($commit.Date -gt $authorStats[$author].LastCommit) {
            $authorStats[$author].LastCommit = $commit.Date
        }
        
        $msg = $commit.Message.ToLower()
        if ($msg -match "feat|feature|add|ajout|nouveau") {
            $authorStats[$author].Categories.Feature++
        }
        elseif ($msg -match "fix|bug|corr|repair") {
            $authorStats[$author].Categories.Fix++
        }
        elseif ($msg -match "refact|clean|optim") {
            $authorStats[$author].Categories.Refactor++
        }
        elseif ($msg -match "doc|readme|comment") {
            $authorStats[$author].Categories.Doc++
        }
        elseif ($msg -match "test|spec|jest") {
            $authorStats[$author].Categories.Test++
        }
        elseif ($msg -match "ui|css|style|design|interface") {
            $authorStats[$author].Categories.UI++
        }
        elseif ($msg -match "deploy|release|version|build") {
            $authorStats[$author].Categories.Deploy++
        }
        else {
            $authorStats[$author].Categories.Other++
        }

        if (-not $dailyStats.ContainsKey($dateKey)) {
            $dailyStats[$dateKey] = @{
                Date = $dateKey
                TotalCommits = 0
                Authors = @{}
            }
        }
        $dailyStats[$dateKey].TotalCommits++
        if (-not $dailyStats[$dateKey].Authors.ContainsKey($author)) {
            $dailyStats[$dateKey].Authors[$author] = 0
        }
        $dailyStats[$dateKey].Authors[$author]++
    }

    # Statistiques par branche
    $branchStats = @{}
    $branches = & git branch -a --format="%(refname:short)" 2>$null
    foreach ($branch in $branches) {
        if ([string]::IsNullOrWhiteSpace($branch)) { continue }
        $branchName = $branch -replace '^origin/', ''
        if ($branchStats.ContainsKey($branchName)) { continue }
        
        $branchCommits = & git log $branch --since="$sinceDate" --format="%an" 2>$null
        if ($branchCommits) {
            $branchStats[$branchName] = @{
                Name = $branchName
                TotalCommits = 0
                Authors = @{}
            }
            foreach ($auth in $branchCommits) {
                if ([string]::IsNullOrWhiteSpace($auth)) { continue }
                $branchStats[$branchName].TotalCommits++
                if (-not $branchStats[$branchName].Authors.ContainsKey($auth)) {
                    $branchStats[$branchName].Authors[$auth] = 0
                }
                $branchStats[$branchName].Authors[$auth]++
            }
        }
    }

    $authorSummaries = @()
    foreach ($author in $authorStats.Keys | Sort-Object { $authorStats[$_].TotalCommits } -Descending) {
        $stats = $authorStats[$author]
        $daysActive = $stats.DaysActive.Keys.Count
        $totalDays = ($stats.LastCommit - $stats.FirstCommit).Days + 1
        $estimatedHours = [Math]::Round($stats.TotalCommits * 0.5, 1)
        
        $authorSummaries += @{
            Name = $author
            Email = $stats.Email
            TotalCommits = $stats.TotalCommits
            DaysActive = $daysActive
            TotalDays = $totalDays
            FirstCommit = $stats.FirstCommit.ToString("yyyy-MM-dd")
            LastCommit = $stats.LastCommit.ToString("yyyy-MM-dd")
            EstimatedHours = $estimatedHours
            CommitsPerDay = [Math]::Round($stats.TotalCommits / [Math]::Max(1, $daysActive), 2)
            Categories = $stats.Categories
            Contribution = 0
        }
    }

    # Calculate total commits from hashtable array
    $totalCommits = 0
    foreach ($s in $authorSummaries) { $totalCommits += $s.TotalCommits }
    
    foreach ($summary in $authorSummaries) {
        $summary.Contribution = [Math]::Round(($summary.TotalCommits / [Math]::Max(1, $totalCommits)) * 100, 1)
    }

    # JSON Output
    if ($Format -eq "json" -or $Format -eq "both") {
        $jsonOutput = @{
            GeneratedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
            Period = @{ Days = $Days; Since = $sinceDate }
            Summary = @{
                TotalCommits = $totalCommits
                TotalAuthors = $authorSummaries.Count
                TotalDaysWithActivity = $dailyStats.Keys.Count
            }
            Authors = $authorSummaries
            Branches = $branchStats.Values
            DailyActivity = $dailyStats.Values | Sort-Object Date -Descending | Select-Object -First 30
        }
        
        $jsonDir = Split-Path $JsonOutputPath -Parent
        if ($jsonDir -and -not (Test-Path $jsonDir)) {
            New-Item -ItemType Directory -Path $jsonDir -Force | Out-Null
        }
        
        $jsonOutput | ConvertTo-Json -Depth 10 | Out-File -FilePath $JsonOutputPath -Encoding UTF8
        Write-Host "[OK] JSON genere: $JsonOutputPath" -ForegroundColor Green
    }

    # Markdown Output - Using array to avoid pipe interpretation issues
    if ($Format -eq "md" -or $Format -eq "both") {
        $mdDir = Split-Path $OutputPath -Parent
        if ($mdDir -and -not (Test-Path $mdDir)) {
            New-Item -ItemType Directory -Path $mdDir -Force | Out-Null
        }

        $genDate = Get-Date -Format "yyyy-MM-dd HH:mm"
        $lines = @()
        $lines += "# Statistiques des Contributeurs - Projet OTT"
        $lines += "## Rapport genere automatiquement"
        $lines += ""
        $lines += "**Date de generation** : $genDate"
        $lines += "**Periode analysee** : $Days derniers jours (depuis $sinceDate)"
        $lines += "**Total commits** : $totalCommits"
        $lines += "**Nombre de contributeurs** : $($authorSummaries.Count)"
        $lines += ""
        $lines += "---"
        $lines += ""
        $lines += "## Resume par Contributeur"
        $lines += ""
        $sep = [char]124  # pipe character
        $lines += "${sep} Contributeur ${sep} Commits ${sep} Contribution ${sep} Jours actifs ${sep} Heures estimees ${sep} Periode ${sep}"
        $lines += "${sep}--------------|---------|--------------|--------------|-----------------|---------|"
        
        foreach ($author in $authorSummaries) {
            $name = $author.Name
            $commits = $author.TotalCommits
            $contrib = "$($author.Contribution)%"
            $daysAct = $author.DaysActive
            $hours = "~$($author.EstimatedHours)h"
            $period = "$($author.FirstCommit) - $($author.LastCommit)"
            $lines += "${sep} **$name** ${sep} $commits ${sep} $contrib ${sep} $daysAct ${sep} $hours ${sep} $period ${sep}"
        }
        
        $lines += ""
        $lines += "---"
        $lines += ""
        $lines += "## Detail par Contributeur"
        $lines += ""
        
        foreach ($author in $authorSummaries) {
            $lines += "### $($author.Name)"
            $lines += "- **Email** : $($author.Email)"
            $lines += "- **Total commits** : $($author.TotalCommits)"
            $lines += "- **Contribution** : $($author.Contribution)%"
            $lines += "- **Jours actifs** : $($author.DaysActive) / $($author.TotalDays) jours"
            $lines += "- **Moyenne** : $($author.CommitsPerDay) commits/jour actif"
            $lines += "- **Heures estimees** : ~$($author.EstimatedHours)h"
            $lines += ""
            $lines += "#### Repartition par type de travail :"
            $lines += "${sep} Type ${sep} Nombre ${sep}"
            $lines += "${sep}------|--------|"
            $lines += "${sep} Features ${sep} $($author.Categories.Feature) ${sep}"
            $lines += "${sep} Corrections ${sep} $($author.Categories.Fix) ${sep}"
            $lines += "${sep} Refactoring ${sep} $($author.Categories.Refactor) ${sep}"
            $lines += "${sep} Documentation ${sep} $($author.Categories.Doc) ${sep}"
            $lines += "${sep} Tests ${sep} $($author.Categories.Test) ${sep}"
            $lines += "${sep} UI/UX ${sep} $($author.Categories.UI) ${sep}"
            $lines += "${sep} Deploiement ${sep} $($author.Categories.Deploy) ${sep}"
            $lines += "${sep} Autres ${sep} $($author.Categories.Other) ${sep}"
            $lines += ""
        }
        
        $lines += "---"
        $lines += ""
        $lines += "## Statistiques par Branche"
        $lines += ""
        $lines += "${sep} Branche ${sep} Commits ${sep} Contributeurs ${sep}"
        $lines += "${sep}---------|---------|---------------|"
        foreach ($br in $branchStats.Values | Sort-Object { $_.TotalCommits } -Descending) {
            $authList = ($br.Authors.GetEnumerator() | ForEach-Object { "$($_.Key): $($_.Value)" }) -join ", "
            $lines += "${sep} **$($br.Name)** ${sep} $($br.TotalCommits) ${sep} $authList ${sep}"
        }
        $lines += ""
        $lines += "---"
        $lines += ""
        $lines += "## Activite recente (30 derniers jours)"
        $lines += ""
        $lines += "${sep} Date ${sep} Total ${sep} Contributeurs ${sep}"
        $lines += "${sep}------|-------|---------------|"
        
        $recentDays = $dailyStats.Values | Sort-Object { [DateTime]$_.Date } -Descending | Select-Object -First 30
        foreach ($day in $recentDays) {
            $authorsStr = ($day.Authors.GetEnumerator() | ForEach-Object { "$($_.Key): $($_.Value)" }) -join ", "
            $lines += "${sep} $($day.Date) ${sep} $($day.TotalCommits) ${sep} $authorsStr ${sep}"
        }
        
        $lines += ""
        $lines += "---"
        $lines += ""
        $lines += "_Rapport genere automatiquement par Generate-GitStats.ps1_"
        $lines += "_Base sur l'analyse des commits Git du projet_"

        $lines -join "`n" | Out-File -FilePath $OutputPath -Encoding UTF8
        Write-Host "[OK] Markdown genere: $OutputPath" -ForegroundColor Green

        # Generer aussi SUIVI_TEMPS_FACTURATION.md avec colonne Contributeur
        $timeLines = @()
        $timeLines += "# Suivi du Temps - Projet OTT"
        $timeLines += "## Journal de travail pour facturation (Genere automatiquement)"
        $timeLines += ""
        $timeLines += "**Date de generation** : $genDate"
        $timeLines += "**Periode analysee** : $Days derniers jours (depuis $sinceDate)"
        $timeLines += "**Total commits** : $totalCommits"
        $timeLines += "**Contributeurs** : $($authorSummaries.Count)"
        $timeLines += ""
        $timeLines += "---"
        $timeLines += ""
        $timeLines += "## Tableau Recapitulatif par Jour et Contributeur"
        $timeLines += ""
        $timeLines += "${sep} Date ${sep} Contributeur ${sep} Commits ${sep} Heures ${sep} Features ${sep} Fix ${sep} Refactor ${sep} Doc ${sep} Tests ${sep} UI ${sep}"
        $timeLines += "${sep}------|--------------|---------|--------|----------|-----|----------|-----|-------|-----|"
        
        # Grouper par date et contributeur
        $sortedDays = $dailyStats.Values | Sort-Object { [DateTime]$_.Date } -Descending
        foreach ($day in $sortedDays) {
            foreach ($auth in $day.Authors.GetEnumerator() | Sort-Object Value -Descending) {
                $authName = $auth.Key
                $authCommits = $auth.Value
                $estHours = "~$([Math]::Round($authCommits * 0.5, 1))h"
                
                # Compter les types de commits pour ce jour et cet auteur
                $dayAuthorCommits = $parsedCommits | Where-Object { 
                    $_.Date.ToString("yyyy-MM-dd") -eq $day.Date -and $_.Author -eq $authName 
                }
                $feat = ($dayAuthorCommits | Where-Object { $_.Message -match "feat|feature|add|ajout|nouveau" }).Count
                $fix = ($dayAuthorCommits | Where-Object { $_.Message -match "fix|bug|corr|repair" }).Count
                $refact = ($dayAuthorCommits | Where-Object { $_.Message -match "refact|clean|optim" }).Count
                $doc = ($dayAuthorCommits | Where-Object { $_.Message -match "doc|readme|comment" }).Count
                $test = ($dayAuthorCommits | Where-Object { $_.Message -match "test|spec|jest" }).Count
                $ui = ($dayAuthorCommits | Where-Object { $_.Message -match "ui|css|style|design" }).Count
                
                $timeLines += "${sep} $($day.Date) ${sep} **$authName** ${sep} $authCommits ${sep} $estHours ${sep} $feat ${sep} $fix ${sep} $refact ${sep} $doc ${sep} $test ${sep} $ui ${sep}"
            }
        }
        
        $timeLines += ""
        $timeLines += "---"
        $timeLines += ""
        $timeLines += "## Resume par Contributeur"
        $timeLines += ""
        foreach ($author in $authorSummaries) {
            $timeLines += "### $($author.Name)"
            $timeLines += "- **Total commits** : $($author.TotalCommits) ($($author.Contribution)%)"
            $timeLines += "- **Heures estimees** : ~$($author.EstimatedHours)h"
            $timeLines += "- **Jours actifs** : $($author.DaysActive)"
            $timeLines += "- **Moyenne** : $($author.CommitsPerDay) commits/jour"
            $timeLines += ""
        }
        
        $timeLines += "---"
        $timeLines += ""
        $timeLines += "_Rapport genere automatiquement par Generate-GitStats.ps1_"
        
        $timeFilePath = Join-Path $mdDir "SUIVI_TEMPS_FACTURATION.md"
        $timeLines -join "`n" | Out-File -FilePath $timeFilePath -Encoding UTF8
        Write-Host "[OK] Suivi temps genere: $timeFilePath" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "Resume des contributions:" -ForegroundColor Cyan
    Write-Host "   -----------------------------------------" -ForegroundColor Gray
    foreach ($author in $authorSummaries) {
        $bar = "*" * [Math]::Min(20, [Math]::Round($author.Contribution / 5))
        Write-Host "   $($author.Name.PadRight(20)) $($author.TotalCommits.ToString().PadLeft(5)) commits ($($author.Contribution)%) $bar" -ForegroundColor White
    }
    Write-Host "   -----------------------------------------" -ForegroundColor Gray
    Write-Host "   Total: $totalCommits commits" -ForegroundColor Green

} finally {
    Pop-Location
}
