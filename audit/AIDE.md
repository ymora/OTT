# 🆘 Aide - Audit Intelligent

## 🚀 Démarrage Rapide

```powershell
# Lancement simple
.\audit\Audit-Intelligent.ps1
```

## 📋 Options Disponibles

```powershell
.\audit\Audit-Intelligent.ps1 `
    -ProjectPath . `              # Chemin du projet (défaut: .)
    -ConfigFile audit.config.yaml `  # Fichier de config (optionnel)
    -UseAI `                      # Activer l'analyse IA (défaut: true)
    -Verbose `                    # Mode verbose
    -MaxQuestions 15              # Nombre max de questions IA
```

## 🤖 Interaction avec l'IA

### Étape 1 : Lancer l'audit
```powershell
.\audit\Audit-Intelligent.ps1
```

### Étape 2 : Si l'audit génère des questions
Le script crée `audit/audit-ai.json` et affiche :
```
📝 Fichier créé pour analyse IA
   → Dites-moi: 'Analyse audit/audit-ai.json et réponds'
```

### Étape 3 : Demander à l'IA d'analyser
Dans Cursor, dites simplement :
```
Analyse audit/audit-ai.json et réponds
```

### Étape 4 : Continuer l'audit
L'IA génère `audit/audit-ai-resp.json`. Ensuite :
- Relancez l'audit : `.\audit\Audit-Intelligent.ps1`
- Ou dites : `Continue audit avec réponses IA`

L'audit intégrera automatiquement les réponses IA dans le rapport final.

## 📊 Résultats

- **Rapports** : `audit/reports/audit-report-YYYY-MM-DD_HH-mm-ss.md`
- **Questions IA** : `audit/audit-ai.json`
- **Réponses IA** : `audit/audit-ai-resp.json`

## ⚙️ Configuration

Créez `audit.config.yaml` à la racine pour personnaliser :

```yaml
project:
  name: "Mon Projet"

checks:
  dead_code:
    enabled: true
    severity: "high"

ai:
  enabled: true
  analyze_when:
    - "dead_code_detected"
    - "security_issue_found"
```

## ❓ Problèmes Courants

**L'audit ne trouve pas les fichiers ?**
- Vérifiez que vous êtes à la racine du projet
- Vérifiez les exclusions dans la config

**L'IA ne répond pas ?**
- Vérifiez que `audit/audit-ai.json` existe
- Dites explicitement : "Analyse audit/audit-ai.json"

**Erreur de module non trouvé ?**
- Vérifiez que tous les fichiers dans `audit/modules/` sont présents

---

**Besoin d'aide ?** Voir `audit/INSTRUCTIONS_IA.md` pour les détails techniques.

