# 🤖 Communication entre le Script PowerShell et l'IA (Cursor)

## 🎯 Principe

Le script PowerShell ne communique **pas directement** avec une API externe. À la place, il crée des **fichiers d'interaction** que **moi (l'IA dans Cursor) je peux lire et analyser**.

---

## 📋 Mécanisme de Communication

### Architecture Simple

```
┌─────────────────────┐
│  Script PowerShell  │
│                     │
│  1. Détecte problèmes│
│  2. Génère questions │
│  3. Crée fichier     │
│     audit-ai.json   │
└──────────┬──────────┘
           │
           │ (fichier créé)
           ▼
┌─────────────────────┐
│ audit-ai.json       │
│ {                   │
│   "questions": [...]│
│   "code": {...}     │
│ }                   │
└──────────┬──────────┘
           │
           │ (je lis ce fichier)
           ▼
┌─────────────────────┐
│  Moi (IA Cursor)    │
│                     │
│  1. Lit audit-ai.json│
│  2. Analyse le code │
│  3. Génère réponses │
│  4. Écrit           │
│     audit-ai-resp.json│
└──────────┬──────────┘
           │
           │ (fichier de réponse)
           ▼
┌─────────────────────┐
│ audit-ai-resp.json  │
│ {                   │
│   "answers": [...]  │
│   "fixes": [...]    │
│ }                   │
└──────────┬──────────┘
           │
           │ (script lit les réponses)
           ▼
┌─────────────────────┐
│  Script PowerShell  │
│                     │
│  Intègre réponses   │
│  dans le rapport    │
└─────────────────────┘
```

---

## 📝 Format du Fichier d'Interaction

### audit-ai.json (généré par le script)

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "project_info": {
    "type": "React/Next.js",
    "framework": "Next.js 14.0",
    "path": "C:/Users/ymora/Desktop/maxime"
  },
  "questions": [
    {
      "id": "q1",
      "type": "dead_code",
      "severity": "medium",
      "file": "components/OldButton.js",
      "line": 1,
      "question": "Ce composant OldButton.js n'est utilisé nulle part dans le projet. Dois-je le supprimer ou est-il prévu pour un usage futur ?",
      "code_snippet": {
        "file": "components/OldButton.js",
        "start_line": 1,
        "end_line": 50,
        "content": "export default function OldButton({ text, onClick }) {\n  return (\n    <button onClick={onClick}>\n      {text}\n    </button>\n  );\n}"
      },
      "context": {
        "similar_components": ["components/Button.js", "components/NewButton.js"],
        "git_history": "Dernière modification il y a 3 mois",
        "imports": []
      }
    },
    {
      "id": "q2",
      "type": "code_duplication",
      "severity": "high",
      "files": [
        {"file": "app/dashboard/users/page.js", "lines": "120-180"},
        {"file": "app/dashboard/patients/page.js", "lines": "130-190"}
      ],
      "question": "Ces deux fonctions handleArchive sont presque identiques. Comment les unifier en une seule fonction réutilisable ?",
      "code_snippets": [
        {
          "file": "app/dashboard/users/page.js",
          "start_line": 120,
          "end_line": 180,
          "content": "const handleArchive = async (userId) => {\n  // ... 60 lignes de code\n}"
        },
        {
          "file": "app/dashboard/patients/page.js",
          "start_line": 130,
          "end_line": 190,
          "content": "const handleArchive = async (patientId) => {\n  // ... 60 lignes de code similaire\n}"
        }
      ],
      "context": {
        "hooks_available": ["hooks/useEntityArchive.js"],
        "pattern_detected": "Même logique d'archivage"
      }
    },
    {
      "id": "q3",
      "type": "security",
      "severity": "high",
      "file": "api/handlers/users.php",
      "line": 45,
      "question": "Cette requête SQL semble non préparée. Y a-t-il un risque d'injection SQL ? Propose le code corrigé avec PDO préparé.",
      "code_snippet": {
        "file": "api/handlers/users.php",
        "start_line": 40,
        "end_line": 50,
        "content": "$query = \"SELECT * FROM users WHERE id = \" . $_GET['id'];\n$result = $pdo->query($query);"
      },
      "context": {
        "language": "PHP",
        "framework": "PDO",
        "security_impact": "Critical"
      }
    }
  ]
}
```

---

## ✅ Format de Réponse (généré par l'IA)

### audit-ai-resp.json (généré par moi)

```json
{
  "timestamp": "2024-01-15T10:35:00Z",
  "answers": [
    {
      "id": "q1",
      "analysis": "Ce composant OldButton.js est effectivement obsolète. Il a été remplacé par NewButton.js qui offre plus de fonctionnalités (variants, taille, icônes). Le composant n'est importé nulle part et sa dernière modification date de 3 mois.",
      "recommendation": "delete",
      "confidence": 0.95,
      "reasoning": "Le composant est inutilisé et remplacé. Aucune référence dans le code. Suppression recommandée.",
      "suggested_action": {
        "type": "delete_file",
        "file": "components/OldButton.js",
        "backup": true
      }
    },
    {
      "id": "q2",
      "analysis": "Les deux fonctions handleArchive sont effectivement dupliquées. Le projet dispose déjà d'un hook useEntityArchive qui encapsule cette logique. Les deux fonctions peuvent être remplacées par l'utilisation de ce hook.",
      "recommendation": "refactor",
      "confidence": 0.90,
      "reasoning": "Duplication évidente détectée. Hook existant peut être utilisé.",
      "suggested_fix": {
        "type": "replace_with_hook",
        "files": [
          {
            "file": "app/dashboard/users/page.js",
            "old_code": "const handleArchive = async (userId) => {\n  // ... ancien code\n}",
            "new_code": "const { archiveEntity } = useEntityArchive('user');\n\nconst handleArchive = async (userId) => {\n  await archiveEntity(userId);\n};",
            "imports_to_add": ["import { useEntityArchive } from '@/hooks/useEntityArchive';"]
          },
          {
            "file": "app/dashboard/patients/page.js",
            "old_code": "const handleArchive = async (patientId) => {\n  // ... ancien code\n}",
            "new_code": "const { archiveEntity } = useEntityArchive('patient');\n\nconst handleArchive = async (patientId) => {\n  await archiveEntity(patientId);\n};",
            "imports_to_add": ["import { useEntityArchive } from '@/hooks/useEntityArchive';"]
          }
        ]
      }
    },
    {
      "id": "q3",
      "analysis": "OUI, risque CRITIQUE d'injection SQL ! La requête construit directement la clause WHERE avec $_GET['id'] sans validation ni préparation. Un attaquant peut injecter du SQL malveillant.",
      "recommendation": "fix_immediately",
      "confidence": 1.0,
      "reasoning": "Vulnérabilité SQL injection critique. Doit être corrigé immédiatement.",
      "suggested_fix": {
        "type": "replace_code",
        "file": "api/handlers/users.php",
        "old_code": "$query = \"SELECT * FROM users WHERE id = \" . $_GET['id'];\n$result = $pdo->query($query);",
        "new_code": "$stmt = $pdo->prepare(\"SELECT * FROM users WHERE id = :id\");\n$stmt->execute(['id' => $_GET['id']]);\n$result = $stmt->fetchAll(PDO::FETCH_ASSOC);",
        "security_note": "Utilise des prepared statements PDO pour éviter l'injection SQL"
      }
    }
  ]
}
```

---

## 💻 Code PowerShell pour Générer les Questions

### Exemple dans le script

```powershell
function Generate-AIQuestions {
    param(
        [hashtable]$Issues,
        [hashtable]$ProjectInfo
    )
    
    $questions = @()
    
    foreach ($issue in $Issues) {
        # Lire le code concerné
        $codeContent = Get-Content $issue.File -Raw
        $lines = $codeContent -split "`n"
        
        $snippet = $lines[([Math]::Max(0, $issue.Line - 10))..([Math]::Min($lines.Count - 1, $issue.Line + 10))] -join "`n"
        
        $question = @{
            id = "q$($questions.Count + 1)"
            type = $issue.Type
            severity = $issue.Severity
            file = $issue.File
            line = $issue.Line
            question = Build-Question -Issue $issue
            code_snippet = @{
                file = $issue.File
                start_line = [Math]::Max(1, $issue.Line - 10)
                end_line = [Math]::Min($lines.Count, $issue.Line + 10)
                content = $snippet
            }
            context = @{
                # Informations contextuelles
            }
        }
        
        $questions += $question
    }
    
    $aiFile = @{
        timestamp = (Get-Date).ToUniversalTime().ToString("o")
        project_info = $ProjectInfo
        questions = $questions
    }
    
    # Sauvegarder dans audit-ai.json
    $aiFile | ConvertTo-Json -Depth 10 | Out-File -FilePath "audit-ai.json" -Encoding UTF8
    
    Write-Host "📝 Fichier audit-ai.json généré avec $($questions.Count) questions" -ForegroundColor Cyan
    Write-Host "   → Attendez que l'IA analyse et génère audit-ai-resp.json" -ForegroundColor Yellow
}

function Build-Question {
    param([hashtable]$Issue)
    
    switch ($Issue.Type) {
        "dead_code" {
            return "Ce fichier $($Issue.File) n'est utilisé nulle part dans le projet. Dois-je le supprimer ou est-il prévu pour un usage futur ? Analyse le code et propose une recommandation."
        }
        "code_duplication" {
            return "Code dupliqué détecté entre plusieurs fichiers. Analyse la duplication et propose un refactoring pour unifier le code."
        }
        "security" {
            return "Problème de sécurité détecté : $($Issue.Description). Analyse le risque et propose le code corrigé."
        }
        default {
            return "Problème détecté : $($Issue.Description). Analyse et propose une solution."
        }
    }
}
```

---

## 🤖 Comment MOI (l'IA) Je Traite le Fichier

### Quand le script crée audit-ai.json

**Vous pouvez me dire** :
```
"L'audit a créé audit-ai.json. Peux-tu l'analyser et répondre ?"
```

**MOI, je vais** :
1. Lire `audit-ai.json`
2. Pour chaque question :
   - Lire les fichiers de code concernés
   - Analyser le contexte
   - Générer une réponse intelligente avec code corrigé
3. Écrire `audit-ai-resp.json` avec toutes les réponses

---

## 🔄 Intégration dans le Script

```powershell
# Dans le script principal, après la détection des problèmes :

# 1. Générer les questions pour l'IA
if ($config.AI.Enabled) {
    Generate-AIQuestions -Issues $results.Issues -ProjectInfo $projectInfo
    
    # 2. Attendre que l'IA réponde (manuellement pour l'instant)
    Write-Host ""
    Write-Host "⏳ En attente de l'analyse IA..." -ForegroundColor Yellow
    Write-Host "   → Ouvrez Cursor et dites: 'L'audit a créé audit-ai.json. Analyse-le.'" -ForegroundColor Cyan
    Write-Host "   → L'IA va générer audit-ai-resp.json" -ForegroundColor Cyan
    Write-Host ""
    
    # Attendre que le fichier de réponse existe
    $maxWait = 300  # 5 minutes max
    $waited = 0
    while (-not (Test-Path "audit-ai-resp.json") -and $waited -lt $maxWait) {
        Start-Sleep -Seconds 5
        $waited += 5
        Write-Host "   En attente... ($waited/$maxWait secondes)" -ForegroundColor Gray
    }
    
    # 3. Lire les réponses de l'IA
    if (Test-Path "audit-ai-resp.json") {
        Write-Host "✅ Réponses IA reçues !" -ForegroundColor Green
        $aiResponses = Get-Content "audit-ai-resp.json" | ConvertFrom-Json
        
        # Intégrer les réponses dans les résultats
        foreach ($answer in $aiResponses.answers) {
            $issue = $results.Issues | Where-Object { $_.Id -eq $answer.id }
            if ($issue) {
                $issue.AIAnalysis = $answer.analysis
                $issue.SuggestedFix = $answer.suggested_fix
                $issue.Confidence = $answer.confidence
            }
        }
    } else {
        Write-Warn "Aucune réponse IA reçue. Continuons sans analyse IA."
    }
}
```

---

## 🎯 Workflow Complet

1. **Vous lancez le script** : `.\scripts\audit-intelligent.ps1`
2. **Le script détecte les problèmes** et crée `audit-ai.json`
3. **Vous me dites dans Cursor** : "L'audit a créé audit-ai.json. Analyse-le et réponds."
4. **Je lis audit-ai.json**, j'analyse le code, je génère `audit-ai-resp.json`
5. **Le script continue** (ou vous le relancez) et intègre mes réponses dans le rapport final

---

## 💡 Alternative : Mode Interactif

Le script peut aussi **me poser des questions directement** si vous êtes en train de travailler avec moi :

```powershell
# Dans le script
function Ask-AI {
    param([string]$Question, [string]$Code)
    
    Write-Host ""
    Write-Host "❓ QUESTION POUR L'IA:" -ForegroundColor Cyan
    Write-Host $Question -ForegroundColor White
    Write-Host ""
    Write-Host "💻 Copiez cette question et le code ci-dessus dans Cursor," -ForegroundColor Yellow
    Write-Host "   puis collez la réponse de l'IA ci-dessous:" -ForegroundColor Yellow
    Write-Host ""
    
    # Le script attend votre réponse manuelle
    $response = Read-Host "Réponse de l'IA"
    
    return $response
}
```

---

## ✅ Avantages de cette Approche

✅ **Pas besoin d'API externe** : Pas de clé API, pas de coûts  
✅ **Vous gardez le contrôle** : Vous voyez ce qui est envoyé à l'IA  
✅ **Réutilisable** : Même principe sur n'importe quel projet  
✅ **Traçable** : Fichiers JSON = historique des analyses  
✅ **Flexible** : Vous pouvez modifier les questions avant que je réponde  

---

**En résumé** : Le script génère un fichier JSON avec les questions, vous me demandez de l'analyser, je génère un fichier de réponses, et le script l'intègre dans son rapport final. Simple et efficace ! 🎉

