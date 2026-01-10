# Configuration des Notifications Croisées entre Administrateurs

## 🎯 Objectif
Notifier automatiquement l'autre administrateur lorsqu'un push est effectué sur le repository OTT.

### 📋 Scénarios de notification:
- **Yann pousse** → **Maxime est notifié**
- **Maxime pousse** → **Yann est notifié**

## 🔄 Système de Notification Croisée

### Option 1: GitHub Notifications (Recommandé - Gratuit)
**Configuration requise:**
1. Les deux admins doivent avoir un compte GitHub
2. Être collaborateurs sur le repo
3. "Watch" le repository avec notifications de commits

**Étapes pour Maxime:**
```bash
# 1. Accepter l'invitation collaborateur sur GitHub
# 2. Configurer les notifications:
# Watch → Custom → ☑️ Commits
```

### Option 2: Email Automatique (Nécessite configuration SMTP)
**Workflow:** `.github/workflows/notify-admin.yml`
- Détecte automatiquement qui a poussé
- Envoie un email à l'autre admin uniquement
- Sujet: "🚀 OTT - Nouveau push de [Nom]"

**Prérequis:**
- Configurer les secrets GitHub:
  - `EMAIL_USERNAME`: Compte email SMTP
  - `EMAIL_PASSWORD`: Mot de passe email SMTP

### Option 3: GitHub Issues (Alternative - Gratuit)
**Workflow:** `.github/workflows/notify-cross-admin.yml`
- Crée automatiquement une issue GitHub quand Maxime pousse
- Yann reçoit une notification GitHub
- Pas besoin de configuration SMTP

## 🚀 Mise en Place Rapide

### Étape 1: Configuration GitHub (Recommandé)
1. **Yann**: Ajoute Maxime comme collaborateur
   - GitHub → Settings → Access → Add people
   - Email: `maxime@happlyzmedical.com`
   - Rôle: `Admin`

2. **Maxime**: 
   - Accepter l'invitation
   - Watch → Custom → ☑️ Commits

### Étape 2: Configuration Email (Optionnel)
1. **Yann**: Configure les secrets GitHub
   - Settings → Secrets → Actions → New repository secret
   - `EMAIL_USERNAME`: Votre email SMTP
   - `EMAIL_PASSWORD`: Votre mot de passe SMTP

### Étape 3: Test du système
```bash
# Test de Yann vers Maxime
echo "test notification Yann→Maxime" >> README.md
git add README.md
git commit -m "🧪 Test notification croisée"
git push origin main

# Test de Maxime vers Yann (une fois qu'il a accès)
# Maxime fera la même chose depuis son compte
```

## ✅ Résultats Attendus

### Quand Yann pousse:
- ✅ Maxime reçoit une notification GitHub
- ✅ (Optionnel) Maxime reçoit un email si SMTP configuré

### Quand Maxime pousse:
- ✅ Yann reçoit une notification GitHub
- ✅ (Optionnel) Yann reçoit un email si SMTP configuré
- ✅ Une issue GitHub est créée (alternative)

## 📊 Workflows Disponibles

1. **`notify-admin.yml`** - Email avec détection automatique
2. **`notify-cross-admin.yml`** - Issues GitHub + artifacts
3. **`notify-simple.yml`** - Artifacts simples

## 🔧 Personnalisation

Pour changer les emails de notification:
```yaml
# Dans notify-admin.yml, modifier la ligne:
to: ${{ github.event.head_commit.author.email == 'ymora@free.fr' && 'maxime@happlyzmedical.com' || 'ymora@free.fr' }}
```

Le système est maintenant bidirectionnel et automatique ! 🎉
