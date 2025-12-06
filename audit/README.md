# 🔍 Audit Intelligent Automatique

Système d'audit automatique intelligent et réutilisable pour tous types de projets.

## 🚀 Utilisation

### Lancement simple

```powershell
.\audit\Audit-Intelligent.ps1
```

### Avec options

```powershell
.\audit\Audit-Intelligent.ps1 -ProjectPath . -UseAI -Verbose
```

## 📁 Structure

```
audit/
├── Audit-Intelligent.ps1    # Point d'entrée principal
├── modules/                  # Tous les modules de vérification
├── config/                   # Configurations par défaut
└── README.md                 # Ce fichier
```

## 🤖 Interaction avec l'IA

1. Le script génère automatiquement `audit/audit-ai.json` avec les questions
2. Dites-moi dans Cursor : **"Analyse audit/audit-ai.json et réponds"**
3. Je génère `audit/audit-ai-resp.json` avec mes réponses
4. Relancez le script ou dites : **"Continue audit avec réponses IA"**

## 📊 Rapports

Les rapports sont générés dans `audit/reports/audit-report-YYYY-MM-DD_HH-mm-ss.md`

## ⚙️ Configuration

Créez un fichier `audit.config.yaml` à la racine du projet pour personnaliser les vérifications.

---

**Version** : 3.0 - Intelligent & Réutilisable

