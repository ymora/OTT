# 📋 Plan : Audit Automatique Intelligent et Réutilisable

## 🎯 Objectifs

Transformer le script d'audit actuel en un outil générique qui :
1. **S'adapte automatiquement** à différents types de projets (React, PHP, Node.js, Python, etc.)
2. **Interagit avec une IA** pour analyser intelligemment le code au lieu de règles fixes
3. **Évite les vérifications répétitives** en automatisant les audits de qualité
4. **S'apprend** au fur et à mesure des projets

---

## 🏗️ Architecture Proposée

### 1. Structure Modulaire

```
audit-intelligent/
├── core/
│   ├── AuditEngine.ps1          # Moteur principal
│   ├── ConfigLoader.ps1          # Chargement configuration
│   ├── ProjectDetector.ps1      # Détection automatique du type de projet
│   └── ReportGenerator.ps1      # Génération de rapports
│
├── checks/
│   ├── GenericChecks.ps1        # Vérifications génériques (code mort, duplication, etc.)
│   ├── ReactChecks.ps1          # Spécifique React/Next.js
│   ├── PHPChecks.ps1            # Spécifique PHP
│   ├── NodeChecks.ps1           # Spécifique Node.js
│   └── SecurityChecks.ps1       # Sécurité (générique)
│
├── ai/
│   ├── AIClient.ps1             # Client pour interagir avec l'IA
│   ├── PromptTemplates.ps1      # Templates de prompts pour l'IA
│   └── AnalysisEngine.ps1       # Analyse intelligente du code
│
├── config/
│   ├── default.yaml             # Configuration par défaut
│   └── templates/
│       ├── react-nextjs.yaml    # Template React/Next.js
│       ├── php-api.yaml         # Template PHP API
│       └── nodejs.yaml          # Template Node.js
│
└── reports/
    └── (générés automatiquement)
```

---

## 🔄 Flux de Fonctionnement

### Phase 1 : Détection et Configuration
```
1. Détection automatique du type de projet
   ├── Analyse package.json, composer.json, requirements.txt, etc.
   ├── Détection framework (Next.js, Laravel, Express, etc.)
   └── Identification structure (MVC, API REST, SPA, etc.)

2. Chargement configuration
   ├── Configuration par défaut (default.yaml)
   ├── Configuration projet (audit.config.yaml) si existe
   └── Merge intelligent des deux
```

### Phase 2 : Collecte de Données
```
1. Scan structure projet
   ├── Fichiers source
   ├── Configuration (config files)
   ├── Tests
   └── Documentation

2. Extraction métadonnées
   ├── Statistiques (lignes, fichiers, fonctions)
   ├── Dépendances
   └── Structure dossiers
```

### Phase 3 : Vérifications Automatiques
```
1. Vérifications génériques (tous projets)
   ├── Code mort
   ├── Duplication
   ├── Complexité
   ├── Sécurité (basique)
   └── Organisation fichiers

2. Vérifications spécifiques (selon type projet)
   ├── React: Hooks, composants, performance
   ├── PHP: SQL injection, PDO, sécurité
   ├── Node.js: Gestion erreurs, async/await
   └── etc.
```

### Phase 4 : Analyse IA (Intelligence)
```
Pour chaque problème détecté OU zone suspecte :

1. Préparation contexte
   ├── Code concerné (avec contexte)
   ├── Contexte projet (framework, architecture)
   └── Règles métier spécifiques (si définies)

2. Requête IA
   ├── Prompt structuré avec contexte
   ├── Demande d'analyse intelligente
   └── Suggestions de corrections

3. Traitement réponse
   ├── Parsing suggestions
   ├── Validation suggestions
   └── Génération actions correctives
```

### Phase 5 : Rapport et Actions
```
1. Génération rapport
   ├── Résumé exécutif
   ├── Détails par catégorie
   ├── Suggestions IA avec code corrigé
   └── Actions prioritaires

2. Options d'export
   ├── Markdown
   ├── HTML interactif
   ├── JSON (pour intégration CI/CD)
   └── Console colorée
```

---

## 🤖 Intégration IA

### Modèle de Prompt pour l'IA

```yaml
# Structure d'une requête IA
context:
  project_type: "React/Next.js"
  framework_version: "14.0.0"
  detected_issue: "Code mort détecté"
  
code_snippet:
  file: "components/UserCard.js"
  lines: "12-45"
  content: "..."
  
question: |
  Ce composant UserCard n'est utilisé nulle part dans le projet.
  Dois-je le supprimer ou est-ce un composant prévu pour un usage futur ?
  Analyse le code et donne une recommandation avec justification.
  
rules:
  - Pas de composants orphelins
  - Documentation requise si composant réservé
  - Supprimer si vraiment inutile
```

### Exemple d'Interaction

```powershell
# Le script détecte un problème
$issue = @{
    Type = "DeadCode"
    File = "components/OldComponent.js"
    Severity = "Medium"
}

# Préparation du contexte pour l'IA
$context = Prepare-AIContext -Issue $issue -ProjectType "React"

# Requête à l'IA
$aiResponse = Invoke-AIAnalysis `
    -Prompt $context.Prompt `
    -Code $context.Code `
    -ProjectContext $context.ProjectInfo

# L'IA répond avec analyse + suggestion
# → "Ce composant semble être une ancienne version remplacée par NewComponent.js.
#    Il peut être supprimé en toute sécurité. Voici le code de vérification..."
```

---

## 📝 Format de Configuration

### audit.config.yaml (Projet spécifique)

```yaml
# Configuration d'audit pour ce projet
project:
  name: "OTT Dashboard"
  type: "React/Next.js"
  version: "3.0.0"

# Vérifications à activer/désactiver
checks:
  dead_code:
    enabled: true
    severity: "high"
    exclude_patterns:
      - "**/test/**"
      - "**/docs/**"
  
  code_duplication:
    enabled: true
    threshold: 80  # Nombre de lignes similaires pour alerter
  
  security:
    enabled: true
    scan_sql_injection: true
    scan_xss: true
    scan_secrets: true
  
  performance:
    enabled: true
    max_file_lines: 500
    max_function_lines: 100

# Règles métier spécifiques
custom_rules:
  - name: "Tous les composants doivent être dans components/"
    pattern: "components/**/*.js"
    check: "file_location"
  
  - name: "Pas de console.log en production"
    pattern: "**/*.{js,jsx,ts,tsx}"
    check: "no_console_log"
    exclude: ["**/logger.js", "**/*.test.js"]

# Endpoints API à tester (si applicable)
api:
  base_url: "https://ott-jbln.onrender.com"
  auth:
    endpoint: "/api.php/auth/login"
    credentials: "env"  # Lire depuis .env
  endpoints_to_test:
    - path: "/api.php/devices"
      method: "GET"
      expected_status: 200
    - path: "/api.php/patients"
      method: "GET"
      expected_status: 200

# Intégration IA
ai:
  enabled: true
  provider: "openai"  # ou "anthropic", "local", etc.
  model: "gpt-4-turbo"
  api_key: "env:OPENAI_API_KEY"
  
  # Scénarios où demander à l'IA
  analyze_when:
    - "dead_code_detected"
    - "security_issue_found"
    - "complex_code_detected"  # Fichier > 500 lignes
    - "duplication_found"
    - "architecture_issue"
  
  # Auto-fix activé ?
  auto_fix:
    enabled: false  # Par défaut, seulement suggérer
    confirmation_required: true

# Exclusions
exclude:
  directories:
    - "node_modules"
    - ".next"
    - "dist"
    - "build"
  files:
    - "**/*.min.js"
    - "**/*.bundle.js"

# Reporting
report:
  format: ["console", "markdown", "html"]
  output_dir: "./audit-reports"
  include_code_snippets: true
  include_ai_suggestions: true
```

---

## 🚀 Utilisation

### Installation

```powershell
# Option 1: Module PowerShell
Install-Module -Name AuditIntelligent -Scope CurrentUser

# Option 2: Clone repository
git clone https://github.com/user/audit-intelligent.git
cd audit-intelligent
```

### Utilisation Basique

```powershell
# Détection automatique + audit
Invoke-Audit -Path ./mon-projet

# Avec configuration personnalisée
Invoke-Audit -Path ./mon-projet -Config ./audit.config.yaml

# Avec interaction IA
Invoke-Audit -Path ./mon-projet -UseAI -AIProvider "openai"

# Auto-fix (avec confirmation)
Invoke-Audit -Path ./mon-projet -UseAI -AutoFix
```

### Intégration CI/CD

```yaml
# .github/workflows/audit.yml
name: Code Audit
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Audit
        run: |
          pwsh -File ./scripts/audit-intelligent/AuditEngine.ps1
          -Path . -Config ./audit.config.yaml -Format JSON
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      - name: Upload Report
        uses: actions/upload-artifact@v3
        with:
          name: audit-report
          path: audit-reports/*.json
```

---

## 🧠 Intelligence IA : Exemples de Questions

### 1. Code Mort
```
"Ce fichier X n'est importé/utilisé nulle part. 
Dois-je le supprimer ou est-ce prévu pour usage futur ? 
Analyse le code et recommande avec justification."
```

### 2. Duplication
```
"J'ai détecté ces 3 fonctions similaires (A, B, C) dans des fichiers différents.
Analyse-les et propose un refactoring pour les unifier.
Génère le code d'une fonction générique réutilisable."
```

### 3. Sécurité
```
"J'ai trouvé cette requête SQL directe dans le code PHP.
Analyse si elle est sécurisée ou si elle nécessite des prepared statements.
Propose le code corrigé avec PDO."
```

### 4. Performance
```
"Ce composant React fait des appels API dans une boucle map().
Analyse l'impact performance et propose une optimisation.
Génère le code corrigé avec batch requests."
```

### 5. Architecture
```
"Cette fonction fait 450 lignes et mélange logique métier et présentation.
Analyse et propose une refactorisation en suivant les bonnes pratiques React.
Génère le code refactorisé."
```

---

## 📊 Rapport Interactif

Le rapport généré contiendra :

1. **Résumé Exécutif**
   - Score global /10
   - Top 5 problèmes critiques
   - Statistiques clés

2. **Détails par Catégorie**
   - Problèmes détectés
   - Analyse IA avec justification
   - Code avant/après (si suggestion IA)
   - Actions recommandées

3. **Actions Correctives**
   - Liste des problèmes avec solutions
   - Bouton "Appliquer correction" (si auto-fix activé)
   - Commandes à exécuter manuellement

4. **Historique**
   - Comparaison avec audit précédent
   - Évolution du score
   - Problèmes résolus/nouveaux

---

## 🎯 Avantages de cette Approche

✅ **Réutilisable** : Un seul outil pour tous vos projets  
✅ **Intelligent** : L'IA comprend le contexte au lieu de règles fixes  
✅ **Évolutif** : Facile d'ajouter de nouveaux types de vérifications  
✅ **Personnalisable** : Configuration YAML pour règles métier  
✅ **Automatisable** : Intégration CI/CD facile  
✅ **Gain de temps** : Plus besoin de faire les mêmes vérifications manuellement  

---

## 📅 Plan d'Implémentation

### Phase 1 : Refactoring Base (1-2 semaines)
- [ ] Détection automatique type projet
- [ ] Système de configuration YAML
- [ ] Architecture modulaire (checks séparés)
- [ ] Vérifications génériques (code mort, duplication, etc.)

### Phase 2 : Intégration IA (1 semaine)
- [ ] Client API OpenAI/Anthropic
- [ ] Templates de prompts
- [ ] Système d'analyse intelligente
- [ ] Parsing et validation réponses IA

### Phase 3 : Vérifications Spécifiques (1 semaine)
- [ ] Checks React/Next.js
- [ ] Checks PHP
- [ ] Checks Node.js
- [ ] Checks Sécurité avancés

### Phase 4 : Reporting & UX (1 semaine)
- [ ] Rapport HTML interactif
- [ ] Export JSON/Markdown
- [ ] Comparaison historique
- [ ] Interface en ligne de commande améliorée

### Phase 5 : Tests & Documentation (1 semaine)
- [ ] Tests unitaires
- [ ] Documentation utilisateur
- [ ] Exemples de configuration
- [ ] Guide d'intégration CI/CD

---

## 🔮 Améliorations Futures

- **Apprentissage** : Mémoriser les décisions de l'utilisateur pour améliorer les suggestions
- **Plugins** : Système de plugins pour checks personnalisés
- **Dashboard Web** : Interface web pour visualiser les audits
- **Intégrations** : GitHub Actions, GitLab CI, Jenkins, etc.
- **Multi-langages** : Support Python, Java, Go, Rust, etc.

---

## 💡 Exemple Concret d'Utilisation

```powershell
# Dans votre projet
cd mon-projet

# Première utilisation : détection automatique
Invoke-Audit -Path .

# → Détecte : "React/Next.js project"
# → Charge : config/templates/react-nextjs.yaml
# → Lance : vérifications adaptées

# L'IA détecte un problème :
# ❌ [DEAD_CODE] components/OldButton.js n'est utilisé nulle part
#    → 🤖 Analyse IA : "Ce composant semble être remplacé par NewButton.js.
#       Il peut être supprimé en toute sécurité."

# Vous acceptez la suggestion
# ✅ Composant supprimé automatiquement

# Rapport généré : audit-reports/report-2024-01-15.html
# → Ouvrir dans navigateur pour voir les détails et suggestions IA
```

---

## ❓ Questions à Résoudre

1. **API IA** : Quelle API utiliser ? (OpenAI, Anthropic, local LLM ?)
2. **Coûts** : Budget pour les appels API IA ? (peut être cher sur gros projets)
3. **Confidentialité** : Envoyer du code à une API externe ? (option local LLM ?)
4. **Performance** : Temps d'exécution avec analyse IA ? (peut être long)
5. **Maintenance** : Qui maintient les templates de vérifications ?

---

## 📚 Ressources Nécessaires

- PowerShell 7+ (cross-platform)
- Module YAML pour PowerShell (`powershell-yaml`)
- Accès API IA (OpenAI, Anthropic, ou modèle local)
- Templates de configuration par type de projet

---

**🎉 Résultat Final** : Un outil qui fait le travail de vérification à votre place, avec l'intelligence de comprendre le contexte et de proposer des solutions adaptées, au lieu de simplement lister des problèmes avec des règles en dur.

