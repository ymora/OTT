# 🔍 Intégration IA dans l'Audit - Guide d'Utilisation

## 🎯 Objectif

Optimiser l'audit pour :
- **CPU** : Détecte les patterns suspects (rapide, reproductible)
- **IA** : Vérifie seulement les cas douteux avec contexte (efficace, précise)

## Workflow

### 1. Audit CPU (Automatique)
```powershell
.\audit\audit.ps1 -Phases "all" -Verbose
```

L'audit détecte :
- Patterns évidents (code mort, doublons, sécurité basique)
- Cas douteux (handlers "inutilisés", imports "inutilisés", timers)

### 2. Génération du Rapport IA
```powershell
# Le rapport peut être exporté si des modules ajoutent du contenu dans Results.AIContext
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

## Modules Améliorés

### `Checks-StructureAPI.ps1`
- Analyse de structure API / routing (détection de handlers, routes potentielles)
- Peut alimenter un contexte à faire valider par l'IA si nécessaire

### `AI-ContextGenerator.ps1`
- Génère rapport structuré avec contexte de code
- Inclut patterns de routing et routes potentielles
- Questions spécifiques pour l'IA

### `AI-VerificationPrompt.ps1`
- Génère prompt optimisé pour minimiser les tokens
- Contexte ciblé (seulement ce qui est nécessaire)
- Format structuré pour réponse facile

## Exemple de Rapport IA

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

## Avantages

1. **Moins de tokens** : L'IA vérifie seulement les cas douteux
2. **Plus précis** : Contexte fourni pour chaque cas
3. **Généraliste** : Pas de noms de fichiers ou patterns spécifiques
4. **Réutilisable** : Modules utilisables pour d'autres projets
5. **Performant** : CPU fait le travail lourd, IA vérifie efficacement

## Intégration dans audit.ps1

Les modules IA sont présents dans `audit/modules/AI-*.ps1`.
L'intégration automatique au lanceur `audit/audit.ps1` n'est pas activée par défaut :
- l'audit CPU peut générer des éléments dans `Results.AIContext`.
- tu peux ensuite exploiter ce contexte (JSON) pour faire valider les cas douteux par l'IA.

## Modules de tests exhaustifs (spécifiques projet)

Certains modules de tests “end-to-end” sont spécifiques à un projet (ex: OTT : endpoints, routes, fichiers critiques).
Ils ne font pas partie du **socle réutilisable** des 12 phases.

Exemples (OTT) :
- `audit/projects/ott/modules/Checks-TestsComplets.ps1`
- `audit/projects/ott/modules/AI-TestsComplets.ps1`

Recommandation : placer ces modules dans un dossier projet dédié (ex: `audit/projects/ott/modules/`) et n'activer ces tests que lorsqu'on audite ce projet.
