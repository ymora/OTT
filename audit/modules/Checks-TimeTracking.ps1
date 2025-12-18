# ===============================================================================
# VÉRIFICATION : SUIVI TEMPS GIT (FACTURATION)
# ===============================================================================

function Invoke-Check-TimeTracking {
    param(
        [Parameter(Mandatory=$true)]
        [string]$ProjectPath
    )
    
    Write-Section "[17/21] Suivi du Temps - Analyse Git Commits"
    
    try {
        # Vérifier Git disponible
        try {
            $null = git --version 2>&1
            $null = git rev-parse --git-dir 2>&1
        } catch {
            Write-Warn "Git non disponible ou pas de dépôt Git - Suivi temps ignoré"
            return
        }
        
        Write-Info "Génération rapport suivi temps..."
        
        # Récupérer tous les commits (branches distantes + locales)
        $allCommits = @()
        
        # Commits distants
        $remoteCommits = git log --all --remotes --format="%ci|%an|%s|%H" 2>&1 | Where-Object { $_ -match '\|' }
        if ($remoteCommits) {
            foreach ($line in $remoteCommits) {
                $parts = $line -split '\|'
                if ($parts.Count -ge 4) {
                    $dateTime = $parts[0] -replace ' \+\d{4}', ''
                    $allCommits += [PSCustomObject]@{
                        DateTime = $dateTime
                        Date = ($dateTime -split ' ')[0]
                        Author = $parts[1]
                        Message = $parts[2]
                        Hash = $parts[3]
                    }
                }
            }
        }
        
        # Filtrer par auteur (chercher différents patterns)
        $authorPatterns = @("*ymora*", "*ymora*", "*admin*", "*dev*")
        $commits = $allCommits | Where-Object {
            $author = $_.Author
            foreach ($pattern in $authorPatterns) {
                if ($author -like $pattern) {
                    return $true
                }
            }
            return $false
        } | Sort-Object DateTime
        
        # Si pas de commits trouvés, essayer tous les commits
        if ($commits.Count -eq 0) {
            Write-Info "Aucun commit trouvé avec patterns auteurs, utilisation de tous les commits"
            $commits = $allCommits | Sort-Object DateTime
        }
        
        if ($commits.Count -eq 0) {
            Write-Warn "Aucun commit trouvé"
            return
        }
        
        Write-OK "$($commits.Count) commits trouvés"
        
        # Grouper par date et catégoriser
        $commitsByDate = @{}
        $categories = @{
            'Développement' = @('feat', 'add', 'create', 'implement', 'develop', 'new')
            'Correction' = @('fix', 'correct', 'repair', 'resolve', 'bug', 'error')
            'Test' = @('test', 'spec', 'coverage', 'tests')
            'Documentation' = @('doc', 'readme', 'comment', 'guide', 'docs')
            'Refactoring' = @('refactor', 'clean', 'organize', 'restructure', 'refactor')
            'Déploiement' = @('deploy', 'release', 'publish', 'build', 'ci')
            'UI/UX' = @('ui', 'ux', 'style', 'design', 'css', 'layout', 'component')
            'Optimisation' = @('optim', 'perf', 'improve', 'enhance', 'speed', 'optimize')
        }
        
        foreach ($commit in $commits) {
            $date = $commit.Date
            if (-not $commitsByDate.ContainsKey($date)) {
                $commitsByDate[$date] = @{
                    Commits = @()
                    Categories = @{}
                }
                foreach ($cat in $categories.Keys) {
                    $commitsByDate[$date].Categories[$cat] = 0
                }
            }
            
            $commitsByDate[$date].Commits += $commit
            
            # Catégoriser
            $message = $commit.Message.ToLower()
            foreach ($cat in $categories.Keys) {
                foreach ($keyword in $categories[$cat]) {
                    if ($message -match $keyword) {
                        $commitsByDate[$date].Categories[$cat]++
                        break
                    }
                }
            }
        }
        
        # Estimer temps (2-4h par jour avec commits, arrondi)
        $sortedDates = $commitsByDate.Keys | Sort-Object
        $totalHours = 0
        $daysWorked = $sortedDates.Count
        
        if ($daysWorked -eq 0) {
            Write-Warn "Aucune date trouvée"
            return
        }
        
        # Générer rapport Markdown
        $report = @"
# Suivi du Temps - Projet
## Journal de travail pour facturation (Généré automatiquement)

**Période analysée** : $($sortedDates[0]) - $($sortedDates[-1])
**Développeur** : $(($commits[0].Author))
**Projet** : $(Split-Path $ProjectPath -Leaf)
**Total commits analysés** : $($commits.Count)

---

## Tableau Récapitulatif

| Date | Heures | Commits | Développement | Correction | Test | Documentation | Refactoring | Déploiement | UI/UX | Optimisation |
|------|--------|---------|---------------|------------|------|----------------|-------------|-------------|-------|--------------|
"@
        
        foreach ($date in $sortedDates) {
            $dayData = $commitsByDate[$date]
            $commitCount = $dayData.Commits.Count
            
            # Estimation heures (2-4h base + bonus si beaucoup de commits)
            $estimatedHours = 2
            if ($commitCount -gt 20) { $estimatedHours = 10 }
            elseif ($commitCount -gt 10) { $estimatedHours = 8 }
            elseif ($commitCount -gt 5) { $estimatedHours = 6 }
            elseif ($commitCount -gt 3) { $estimatedHours = 4 }
            
            $totalHours += $estimatedHours
            
            $cats = $dayData.Categories
            $report += "| $date | ~${estimatedHours}h | $commitCount | $($cats['Développement']) | $($cats['Correction']) | $($cats['Test']) | $($cats['Documentation']) | $($cats['Refactoring']) | $($cats['Déploiement']) | $($cats['UI/UX']) | $($cats['Optimisation']) |`n"
        }
        
        $avgHours = [math]::Round($totalHours / $daysWorked, 1)
        
        $report += @"

---

## Résumé

- **Total estimé** : ~$totalHours heures
- **Jours travaillés** : $daysWorked jours
- **Moyenne** : ~${avgHours}h/jour
- **Période** : $($sortedDates[0]) -> $($sortedDates[-1])

---

_Rapport généré automatiquement le $(Get-Date -Format 'yyyy-MM-dd HH:mm')_
_Basé sur l'analyse Git des commits_
"@
        
        # Sauvegarder uniquement dans public/ (fichier principal utilisé par le dashboard et les scripts)
        $publicPath = Join-Path $ProjectPath "public" "SUIVI_TEMPS_FACTURATION.md"
        $publicDir = Split-Path $publicPath -Parent
        
        if (-not (Test-Path $publicDir)) {
            New-Item -ItemType Directory -Path $publicDir -Force | Out-Null
        }
        $report | Out-File -FilePath $publicPath -Encoding UTF8
        
        Write-OK "Rapport généré: public\SUIVI_TEMPS_FACTURATION.md"
        Write-Host "  Total estimé: ~$totalHours heures sur $daysWorked jours" -ForegroundColor Green
        Write-Host "  Moyenne: ~${avgHours}h/jour" -ForegroundColor Green
        
    } catch {
        Write-Warn "Erreur génération suivi temps: $($_.Exception.Message)"
    }
}

