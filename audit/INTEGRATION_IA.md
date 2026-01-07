# Integration IA dans l'Audit

## POINT D'ENTREE UNIQUE

**Fichier:** `audit/resultats/AI-SUMMARY.md`

Ce fichier est regenere automatiquement a chaque audit et contient:
- Scores par categorie
- Questions a verifier par l'IA
- Format de reponse attendu

## Workflow Simplifie

```powershell
# 1. Lancer l'audit
.\audit\audit.ps1 -Phases "all"

# 2. Lire le resume IA
Get-Content audit\resultats\AI-SUMMARY.md
```

## Architecture 2 Niveaux

| Niveau | Responsable | Fiabilite |
|--------|-------------|-----------|
| **CPU** | Audit auto (patterns, comptages) | 100% |
| **IA** | Cas ambigus (contexte semantique) | Variable |

## Format du Resume IA

```markdown
# RESUME AUDIT POUR L'IA
> Point d'entree unique - 2026-01-07 10:17

## Scores
- [OK] Architecture : 10/10
- [!] API : 5/10
- [!!] Structure API : 0/10

## QUESTIONS A VERIFIER
[ ] [1] Timer UsbContext.js:1662 - cleanup ?
[ ] [2] Handler handleGetUsers - utilise ?

## Format reponse: [ID] OUI/NON - raison courte
```

## Reponse Attendue de l'IA

```
[1] NON - timer dans useEffect avec cleanup ref
[2] OUI - handler appele dans api_router.php ligne 45
```

## Fichiers

| Fichier | Description |
|---------|-------------|
| `audit/resultats/AI-SUMMARY.md` | **SEUL fichier de sortie** |
| `audit/audit.ps1` | Script principal |
| `audit/modules/*.ps1` | Modules de verification |
