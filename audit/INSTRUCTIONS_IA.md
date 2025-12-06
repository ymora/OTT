# 🤖 Instructions pour l'IA (Cursor)

## Comment utiliser l'audit intelligent

### 1. Lancer l'audit

L'utilisateur peut lancer l'audit avec :
```powershell
.\audit\Audit-Intelligent.ps1
```

### 2. Quand l'audit génère audit-ai.json

Si l'audit détecte des problèmes nécessitant une analyse IA, il crée :
- `audit/audit-ai.json` - Fichier avec les questions
- `audit/NEEDS_AI_ANALYSIS.txt` - Fichier indicateur

### 3. Instructions pour MOI (l'IA)

**Quand l'utilisateur dit :**
- "Analyse audit/audit-ai.json et réponds"
- "L'audit a créé audit-ai.json, analyse-le"
- Ou simplement : "Continue l'audit"

**JE DOIS :**

1. **Lire** `audit/audit-ai.json`
2. **Pour chaque question** :
   - Lire le fichier de code concerné
   - Analyser le problème
   - Générer une réponse avec :
     - Analyse du problème
     - Recommandation (delete, refactor, fix, ignore, manual_review)
     - Code corrigé si applicable
     - Niveau de confiance (0.0 à 1.0)
3. **Générer** `audit/audit-ai-resp.json` avec toutes les réponses au format :

```json
{
  "timestamp": "2024-01-15T10:35:00Z",
  "answers": [
    {
      "id": "q1",
      "type": "dead_code",
      "analysis": "Analyse détaillée...",
      "recommendation": "delete",
      "confidence": 0.95,
      "action": "delete",
      "suggested_fix": {
        "type": "delete_file",
        "file": "components/OldButton.js"
      }
    }
  ]
}
```

### 4. Format des réponses

Pour chaque question dans `audit-ai.json`, générer une réponse avec :

- **id** : Identifiant de la question (ex: "q1")
- **type** : Type du problème (dead_code, security, etc.)
- **analysis** : Analyse détaillée du problème
- **recommendation** : Recommandation (delete, refactor, fix, ignore, manual_review)
- **confidence** : Niveau de confiance (0.0 à 1.0)
- **action** : Action recommandée
- **suggested_fix** : Objet avec le code corrigé ou les actions à faire (optionnel)

### 5. Après avoir généré audit-ai-resp.json

L'utilisateur peut :
- Relancer l'audit (il lira automatiquement les réponses)
- Ou me dire : "Continue audit avec réponses IA"

L'audit intégrera alors mes réponses dans le rapport final.

---

## Exemple de workflow complet

1. Utilisateur : `.\audit\Audit-Intelligent.ps1`
2. Audit génère `audit/audit-ai.json` avec 5 questions
3. Utilisateur : "Analyse audit/audit-ai.json et réponds"
4. MOI : Je lis le fichier, analyse chaque question, génère `audit/audit-ai-resp.json`
5. Utilisateur : `.\audit\Audit-Intelligent.ps1` (relance) ou "Continue audit"
6. Audit lit mes réponses et génère le rapport final avec mes analyses

---

**Note** : Le système fonctionne entièrement via fichiers JSON, pas besoin d'API externe !

