# Configuration des Notifications pour le Deuxième Administrateur

## 🎯 Objectif
Informer automatiquement Maxime Happlyz Medical (deuxième admin) lors de chaque push sur le repository OTT.

## 📋 Options Disponibles

### Option 1: GitHub Notifications (Recommandé - Gratuit)
**Configuration requise:**
1. Maxime doit avoir un compte GitHub
2. Ajouter Maxime comme collaborateur sur le repo
3. Maxime doit "watch" le repository

**Étapes:**
```bash
# 1. Inviter Maxime sur GitHub
# Settings → Collaborators → Add people → maxime@happlyzmedical.com

# 2. Maxime doit configurer les notifications
# Sur GitHub: Watch → Custom → 
# ☑️ Commits (pour les pushes)
# ☑️ Releases  
# ☑️ Discussions
```

### Option 2: Email Automatique (Nécessite configuration)
**Prérequis:**
- Configurer des secrets GitHub: EMAIL_USERNAME, EMAIL_PASSWORD
- Utiliser un service SMTP (Gmail, SendGrid, etc.)

**Workflow créé:** `.github/workflows/notify-admin.yml`

### Option 3: Notification Simple (Actuellement configurée)
**Workflow:** `.github/workflows/notify-simple.yml`
- Crée un fichier de notification
- Pas besoin de secrets
- Consultable dans les artifacts GitHub

## 🚀 Mise en Place Rapide (Option 1)

### Pour Yann (admin principal):
1. Allez sur https://github.com/ymora/OTT/settings/access
2. Cliquez sur "Add people"
3. Entrez: `maxime@happlyzmedical.com`
4. Rôle: `Admin` ou `Maintainer`

### Pour Maxime (deuxième admin):
1. Accepter l'invitation par email
2. Sur le repo OTT, cliquer sur "Watch" → "Custom"
3. Cocher les notifications de commits

## ✅ Résultat
Maxime recevra automatiquement une notification GitHub à chaque push sur la branche main, sans configuration supplémentaire.

## 📊 Test
Après configuration, tester avec:
```bash
echo "test notification" >> README.md
git add README.md
git commit -m "🧪 Test notification system"
git push origin main
```
