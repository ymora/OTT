# Export AIContext - Utilisation par l'IA

## 📋 Résumé

L'audit exporte automatiquement le contexte IA dans un fichier JSON structuré à la fin de chaque exécution.

## 📍 Emplacement

Les fichiers sont exportés dans : `audit/reports/ai-context-YYYY-MM-DD_HH-mm-ss.json`

## 📊 Format JSON

```json
{
  "Timestamp": "2026-01-01 12:00:00",
  "Version": "1.0",
  "TotalQuestions": 5,
  "Categories": {
    "Organization": {
      "QuestionCount": 3,
      "Questions": [
        {
          "Category": "Organization",
          "Type": "TODO/FIXME Found",
          "Count": 5,
          "Files": "file1.js, file2.php",
          "Severity": "low",
          "NeedsAICheck": true,
          "Question": "5 fichier(s) contiennent des TODO/FIXME. Ces éléments doivent-ils être traités maintenant, reportés, ou supprimés s'ils sont obsolètes ?"
        },
        {
          "Category": "Organization",
          "Type": "Disabled Code Found",
          "Count": 2,
          "Files": "file3.js (Marqueur DISABLED détecté), file4.php (15 lignes commentées consécutives)",
          "Severity": "medium",
          "NeedsAICheck": true,
          "Question": "2 fichier(s) contiennent du code désactivé temporairement..."
        }
      ],
      "Summary": {
        "Critical": 0,
        "High": 0,
        "Medium": 1,
        "Low": 2
      }
    }
  }
}
```

## 🤖 Utilisation par l'IA

### 1. Charger le fichier JSON

```powershell
$aiContext = Get-Content "audit/reports/ai-context-2026-01-01_12-00-00.json" -Raw | ConvertFrom-Json
```

### 2. Parcourir les questions

```powershell
foreach ($category in $aiContext.Categories.PSObject.Properties) {
    $categoryName = $category.Name
    $categoryData = $category.Value
    
    Write-Host "Catégorie: $categoryName" -ForegroundColor Cyan
    Write-Host "  Questions: $($categoryData.QuestionCount)" -ForegroundColor Yellow
    
    foreach ($question in $categoryData.Questions) {
        if ($question.NeedsAICheck) {
            Write-Host "`n  Question: $($question.Question)" -ForegroundColor White
            Write-Host "  Type: $($question.Type)" -ForegroundColor Gray
            Write-Host "  Sévérité: $($question.Severity)" -ForegroundColor $(if($question.Severity -eq "critical"){"Red"}elseif($question.Severity -eq "high"){"Yellow"}else{"Green"})
            Write-Host "  Fichiers: $($question.Files)" -ForegroundColor Cyan
            
            # L'IA peut maintenant traiter cette question
            # et proposer des corrections
        }
    }
}
```

### 3. Prioriser par sévérité

```powershell
# Trier par sévérité (critical > high > medium > low)
$allQuestions = @()
foreach ($category in $aiContext.Categories.PSObject.Properties) {
    $allQuestions += $category.Value.Questions
}

$prioritized = $allQuestions | Sort-Object {
    switch ($_.Severity) {
        "critical" { 0 }
        "high" { 1 }
        "medium" { 2 }
        "low" { 3 }
        default { 4 }
    }
}

# Traiter d'abord les questions critiques
foreach ($question in $prioritized) {
    if ($question.Severity -eq "critical") {
        # Traiter en priorité
    }
}
```

## ✅ Avantages

1. **Format structuré** : JSON facilement parsable
2. **Questions spécifiques** : Chaque problème a une question claire pour l'IA
3. **Sévérité** : Permet de prioriser les corrections
4. **Fichiers listés** : L'IA sait exactement quels fichiers corriger
5. **Export automatique** : Pas besoin d'intervention manuelle

## 🔄 Workflow Recommandé

1. **Exécuter l'audit** : `.\audit\scripts\Audit-Complet.ps1`
2. **Récupérer le fichier JSON** : `audit/reports/ai-context-*.json`
3. **Analyser avec l'IA** : Charger le JSON et traiter les questions
4. **Corriger automatiquement** : L'IA peut proposer et appliquer des corrections
5. **Relancer l'audit** : Vérifier que les corrections ont résolu les problèmes

## 📝 Exemple de Correction Automatique

```powershell
# Charger le contexte IA
$aiContext = Get-Content "audit/reports/ai-context-*.json" -Raw | ConvertFrom-Json

# Pour chaque question TODO/FIXME
foreach ($category in $aiContext.Categories.PSObject.Properties) {
    foreach ($question in $category.Value.Questions) {
        if ($question.Type -eq "TODO/FIXME Found") {
            # L'IA peut :
            # 1. Analyser chaque fichier
            # 2. Décider si le TODO doit être traité, reporté ou supprimé
            # 3. Appliquer la correction automatiquement
        }
    }
}
```

## 🎯 Types de Questions Détectées

- **TODO/FIXME Found** : Marqueurs TODO/FIXME/XXX/HACK dans le code
- **Disabled Code Found** : Code désactivé temporairement (commenté avec marqueurs ou gros blocs)
- **Too Many console.log** : Trop de console.log (devrait utiliser logger)

D'autres types peuvent être ajoutés dans d'autres phases de l'audit.





