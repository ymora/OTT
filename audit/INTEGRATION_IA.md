# 🔍 Intégration IA dans l'Audit - Guide d'Utilisation

## 🎯 Objectif

Optimiser l'audit pour :
- **CPU** : Détecte les patterns suspects (rapide, reproductible)
- **IA** : Vérifie seulement les cas douteux avec contexte (efficace, précise)

## 📋 Workflow

### 1. Audit CPU (Automatique)
```powershell
.\audit\audit.ps1 -All
```

L'audit détecte :
- ✅ Patterns évidents (code mort, doublons, sécurité basique)
- ⚠️ Cas douteux (handlers "inutilisés", imports "inutilisés", timers)

### 2. Génération du Rapport IA
```powershell
# Le rapport est généré automatiquement dans audit/resultats/ai-context.json
```

Le rapport contient :
- Contexte de code pour chaque cas douteux
- Patterns de routing détectés
- Questions spécifiques pour l'IA

### 3. Vérification IA (Optionnelle)
```powershell
# Lire le prompt généré
Get-Content audit/resultats/ai-verification-prompt.txt

# Ou utiliser directement le contexte JSON
$context = Get-Content audit/resultats/ai-context.json | ConvertFrom-Json
```

## 🔧 Modules Améliorés

### `Checks-StructureAPI-Improved.ps1`
- ✅ Détection générique des patterns de routing (preg_match, switch/case, if/elseif)
- ✅ Pas de noms de fichiers fixes (détecte api.php, router.php, etc.)
- ✅ Génère contexte pour l'IA au lieu de faux positifs

### `AI-ContextGenerator.ps1`
- ✅ Génère rapport structuré avec contexte de code
- ✅ Inclut patterns de routing et routes potentielles
- ✅ Questions spécifiques pour l'IA

### `AI-VerificationPrompt.ps1`
- ✅ Génère prompt optimisé pour minimiser les tokens
- ✅ Contexte ciblé (seulement ce qui est nécessaire)
- ✅ Format structuré pour réponse facile

## 📊 Exemple de Rapport IA

```json
{
  "Context": [
    {
      "Category": "Structure API",
      "Type": "Unused Handler",
      "Handler": "handleGetUsers",
      "Question": "Le handler 'handleGetUsers' est-il utilisé via un routing dynamique non détecté automatiquement ?",
      "CodeContext": {
        "File": "auth.php",
        "Code": "function handleGetUsers() { ... }"
      },
      "RoutingContext": {
        "Patterns": ["preg_match('#/users$#', $path) && handleGetUsers()"]
      },
      "NeedsAICheck": true
    }
  ]
}
```

## 🚀 Avantages

1. **Moins de tokens** : L'IA vérifie seulement les cas douteux
2. **Plus précis** : Contexte fourni pour chaque cas
3. **Généraliste** : Pas de noms de fichiers ou patterns spécifiques
4. **Réutilisable** : Modules utilisables pour d'autres projets
5. **Performant** : CPU fait le travail lourd, IA vérifie efficacement

## 📝 Intégration dans Audit-Complet.ps1

Pour activer les modules améliorés, remplacer dans `Audit-Complet.ps1` :

```powershell
# Ancien
. "$MODULES_DIR\Checks-StructureAPI.ps1"
Invoke-Check-StructureAPI -Results $Results -ProjectPath $ProjectRoot

# Nouveau
. "$MODULES_DIR\Checks-StructureAPI-Improved.ps1"
Invoke-Check-StructureAPI-Improved -Results $Results -ProjectPath $ProjectRoot

# Après toutes les vérifications
. "$MODULES_DIR\AI-ContextGenerator.ps1"
$aiReport = Generate-AIContext -Results $Results -ProjectPath $ProjectRoot -OutputFile "$ResultDir\ai-context.json"

. "$MODULES_DIR\AI-VerificationPrompt.ps1"
$prompt = Generate-AIVerificationPrompt -AIReport $aiReport -OutputFile "$ResultDir\ai-verification-prompt.txt"
```

## 🧪 Module Tests Complets Application OTT (Phase 21)

### Description

Module spécialisé pour tester exhaustivement l'application OTT :
- ✅ Vérification fichiers critiques
- ✅ Vérification corrections critiques (whereClause, display_errors, urldecode)
- ✅ Tests API (health check, endpoints)
- ✅ Vérification sécurité SQL
- ✅ Génération contexte IA pour analyse approfondie

### Utilisation

```powershell
# Exécuter uniquement la phase 21
.\audit\audit.ps1 -Phases 21

# Ou inclure dans l'audit complet
.\audit\audit.ps1 -All
```

### Contexte IA Généré

Le module génère automatiquement un contexte IA structuré avec :
- Questions spécifiques pour chaque problème détecté
- Contexte de code pour analyse approfondie
- Recommandations basées sur les résultats
- Score de qualité global

### Fichiers

- `audit/modules/Checks-TestsComplets.ps1` - Module de vérification
- `audit/modules/AI-TestsComplets.ps1` - Générateur de contexte IA

