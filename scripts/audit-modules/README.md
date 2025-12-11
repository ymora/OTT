# 🔍 Audit Intelligent Automatique

Système d'audit automatique intelligent et réutilisable pour tous types de projets.

## 🚀 Utilisation

### Lancement simple

```powershell
.\scripts\audit-modules\Audit-Intelligent.ps1
```

### Avec options

```powershell
.\scripts\audit-modules\Audit-Intelligent.ps1 -ProjectPath . -UseAI -Verbose
```

## 📁 Structure

```
scripts/audit-modules/
├── Audit-Intelligent.ps1    # Point d'entrée principal
├── modules/                  # Tous les modules de vérification
├── config/                   # Configurations par défaut
└── README.md                 # Ce fichier
```

## 🤖 Interaction avec l'IA

1. Le script génère automatiquement `scripts/audit-modules/audit-ai.json` avec les questions
2. Dites-moi dans Cursor : **"Analyse scripts/audit-modules/audit-ai.json et réponds"**
3. Je génère `scripts/audit-modules/audit-ai-resp.json` avec mes réponses
4. Relancez le script ou dites : **"Continue audit avec réponses IA"**

## 📊 Rapports

Les rapports sont générés dans `scripts/audit-modules/reports/audit-report-YYYY-MM-DD_HH-mm-ss.md`

## ⚙️ Configuration

Créez un fichier `audit.config.yaml` à la racine du projet pour personnaliser les vérifications.

---

**Version** : 3.0 - Intelligent & Réutilisable

