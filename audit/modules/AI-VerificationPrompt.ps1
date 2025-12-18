# ===============================================================================
# GÉNÉRATEUR DE PROMPT POUR VÉRIFICATION IA
# ===============================================================================
# Génère un prompt optimisé pour que l'IA vérifie efficacement les cas douteux

function Generate-AIVerificationPrompt {
    param(
        [Parameter(Mandatory=$true)]
        [hashtable]$AIReport,
        
        [Parameter(Mandatory=$false)]
        [string]$OutputFile = ""
    )
    
    $prompt = @"
# VÉRIFICATION IA - CAS DOUTEUX IDENTIFIÉS PAR L'AUDIT

## Contexte du Projet
- Projet: $(Split-Path $AIReport.ProjectPath -Leaf)
- Date: $($AIReport.Timestamp)
- Total cas à vérifier: $($AIReport.Summary.NeedsAICheck)

## Instructions
Analysez chaque cas douteux ci-dessous et déterminez s'il s'agit d'un **vrai problème** ou d'un **faux positif**.
Pour chaque cas, fournissez:
1. **Verdict**: Vrai problème / Faux positif
2. **Raison**: Explication courte
3. **Action**: Correction nécessaire / Aucune action

---

"@
    
    $caseNumber = 1
    foreach ($context in $AIReport.Context) {
        $prompt += @"

## Cas #$caseNumber - $($context.Category): $($context.Type)

**Question**: $($context.Question)

"@
        
        if ($context.Handler) {
            $prompt += @"
**Handler**: $($context.Handler)
**Défini dans**: $($context.DefinedIn) (ligne $($context.Line))

**Contexte du code**:
``````php
$($context.CodeContext.Code)
``````

**Patterns de routing détectés**:
$($context.RoutingPatterns | ConvertTo-Json -Compress)

**Routes potentielles**:
$($context.PotentialRoutes -join ", ")

**Contexte de routing**:
$($context.RoutingContext.Patterns -join "`n`n")

"@
        }
        
        if ($context.Count) {
            $prompt += @"
**Nombre d'occurrences**: $($context.Count)

"@
        }
        
        $prompt += @"
**Sévérité**: $($context.Severity)

---

"@
        $caseNumber++
    }
    
    $prompt += @"

## Résumé
- Total cas à vérifier: $($AIReport.Summary.NeedsAICheck)
- Problèmes critiques: $($AIReport.Summary.CriticalIssues)
- Avertissements: $($AIReport.Summary.Warnings)

**Action requise**: Analysez chaque cas et fournissez un verdict pour chaque.
"@
    
    if ($OutputFile) {
        $prompt | Out-File $OutputFile -Encoding UTF8
        Write-Host "  [OK] Prompt IA généré: $OutputFile" -ForegroundColor Green
    }
    
    return $prompt
}

