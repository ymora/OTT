# Système de Reprise par Phases - Guide d'Utilisation

## Vue d'ensemble

Le système d'audit a été amélioré pour permettre :
1. **Sélection interactive des phases** à exécuter
2. **Reprise après interruption** (sauvegarde/restauration de l'état)
3. **Plans de correction structurés** pour chaque problème détecté
4. **Rapports consolidés** dans un seul fichier

## Utilisation

### Lancement avec menu interactif

```powershell
.\audit-complet\scripts\LANCER_AUDIT.ps1
```

Le menu affiche :
- Toutes les phases disponibles avec leur statut (✓ complétée, [ ] à faire)
- Options :
  - **[A]** Relancer TOUTES les phases
  - **[R]** Reprendre depuis la dernière phase incomplète
  - **[1-20]** Sélectionner des phases spécifiques (ex: `0,2,5-8,10`)
  - **[Q]** Quitter

### Lancement avec phases spécifiées

```powershell
.\audit-complet\scripts\LANCER_AUDIT.ps1 -Phases "0,2,5-8"
```

### Lancement sans menu (toutes les phases)

```powershell
.\audit-complet\scripts\LANCER_AUDIT.ps1 -SkipMenu
```

## Structure des Phases

Les phases sont définies dans `AUDIT_PHASES.ps1` :

- **Phase 0**: Inventaire Exhaustif
- **Phase 1**: Architecture et Statistiques
- **Phase 2**: Code Mort
- **Phase 3**: Duplication de Code
- **Phase 4**: Complexité
- **Phase 5**: Routes et Navigation
- **Phase 6**: Endpoints API
- **Phase 7**: Base de Données
- **Phase 8**: Sécurité
- **Phase 9**: Performance
- **Phase 10**: Tests
- **Phase 11**: Accessibilité (a11y)
- **Phase 12**: Gestion d'Erreurs
- **Phase 13**: Documentation
- **Phase 14**: Optimisations Avancées
- **Phase 15**: Liens et Imports
- **Phase 16**: Uniformisation UI/UX
- **Phase 17**: Organisation
- **Phase 18**: Structure API
- **Phase 19**: Éléments Inutiles
- **Phase 20**: Synchronisation GitHub Pages

## Fichiers Générés

### 1. Rapport d'audit (`audit_resultat_YYYYMMDD_HHMMSS.txt`)
Rapport texte complet avec tous les résultats.

### 2. Rapport JSON (`audit_resultat_YYYYMMDD_HHMMSS.json`)
Rapport structuré en JSON pour analyse programmatique.

### 3. Plans de correction (`correction_plans_YYYYMMDD_HHMMSS.json`)
Plans de correction structurés en JSON avec :
- Type de problème
- Sévérité (critical, high, medium, low, info)
- Description
- Localisation (fichier, ligne)
- Code actuel
- Recommandation de correction
- Étapes de vérification
- Dépendances

### 4. Rapport texte des plans (`correction_plans_YYYYMMDD_HHMMSS.txt`)
Version lisible des plans de correction.

### 5. État de progression (`audit_state.json`)
État sauvegardé pour permettre la reprise :
- Phases complétées
- Résultats partiels

## Exemple de Plan de Correction

```json
{
  "IssueType": "Secret Hardcodé",
  "Severity": "critical",
  "Description": "Password hardcode détecté dans api/config.php à la ligne 42...",
  "File": "api/config.php",
  "Line": 42,
  "CurrentCode": "const apiKey = 'sk-1234567890abcdef'",
  "RecommendedFix": "1. Créer une variable d'environnement...",
  "VerificationSteps": [
    "Vérifier que la variable d'environnement est définie",
    "Vérifier que .env.local est dans .gitignore"
  ],
  "Dependencies": ["Fichier: api/config.php", "Ligne: 42"]
}
```

## Reprise après Interruption

Si l'audit est interrompu :

1. Relancer `LANCER_AUDIT.ps1`
2. Choisir **[R]** pour reprendre depuis la dernière phase incomplète
3. L'audit reprendra automatiquement où il s'est arrêté

L'état est sauvegardé après chaque phase complétée.

## Intégration avec l'IA

Les plans de correction sont structurés pour être facilement analysés par l'IA :

1. **Format JSON** : Facile à parser
2. **Informations complètes** : Code actuel, recommandation, étapes
3. **Sévérité** : Priorisation automatique possible
4. **Dépendances** : Compréhension du contexte

L'IA peut :
- Analyser les plans de correction
- Proposer des corrections automatiques
- Vérifier que les corrections sont appliquées
- Générer du code de correction

## Améliorations Futures

- [ ] Wrapper toutes les phases avec `Invoke-AuditPhase`
- [ ] Générer des plans de correction pour tous les types de problèmes
- [ ] Intégration avec l'IA pour correction automatique
- [ ] Dashboard web pour visualiser les résultats
- [ ] Comparaison entre audits successifs

