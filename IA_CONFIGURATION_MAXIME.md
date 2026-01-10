# 🤖 Instructions IA pour Maxime - Configuration Espace de Travail

## 🎯 Objectif de l'IA
Configurer l'environnement de développement de Maxime sur la branche `maxime` du projet OTT avec Windsurf et l'IA.

---

## 📋 Contexte du Projet

**Projet :** OTT (Oxygen Therapy Tracker) - HAPPLYZ MEDICAL SAS  
**Repository :** https://github.com/ymora/OTT  
**Branche de Maxime :** `maxime`  
**Admin principal :** Yann Mora (ymora@free.fr)  
**Deuxième admin :** Maxime Happlyz Medical (Maxime@happlyzmedical.com)

### **Architecture technique :**
- **Frontend :** Next.js 14 + React + TypeScript + TailwindCSS
- **Backend :** PHP 8.2 + PostgreSQL + API REST
- **Hardware :** ESP32 + Arduino + USB Serial
- **Dashboard :** Tableau de bord médical temps réel
- **Notifications :** GitHub Actions + Workflows automatisés

---

## 🚀 Instructions de Configuration pour l'IA

### **Étape 1 - Clonage et Configuration Initiale**
```bash
# Cloner le repository
git clone https://github.com/ymora/OTT.git
cd OTT

# Passer sur la branche maxime
git checkout maxime
git pull origin maxime

# Vérifier la branche actuelle
git branch
# Devrait montrer: * maxime
```

### **Étape 2 - Installation Dépendances**
```bash
# Installer Node.js 20+ si nécessaire
# Installer les dépendances frontend
npm install

# Installer PHP 8.2+ et PostgreSQL si nécessaire
# Configurer la base de données locale (optionnel pour développement)
```

### **Étape 3 - Configuration Variables d'Environnement**
```bash
# Copier le fichier d'exemple
cp .env.example .env.local

# Configurer les variables essentielles:
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=secret_maxime_2026
DATABASE_URL=postgresql://user:password@localhost:ott_dev
API_URL=http://localhost:8000
```

### **Étape 4 - Démarrage Environnement de Développement**
```bash
# Démarrer le frontend Next.js
npm run dev

# Démarrer l'API PHP (terminal séparé)
php -S localhost:8000 -t api

# Ou utiliser les scripts prévus
npm run dev:full
```

---

## 🌿 Règles de Travail sur Branche `maxime`

### **✅ Ce que Maxime peut faire :**
- Travailler sur la branche `maxime`
- Modifier tous les fichiers sauf `main`
- Faire des commits et pushes sur `maxime`
- Créer des features, corrections, tests
- Utiliser l'IA pour le développement

### **❌ Ce que Maxime ne doit PAS faire :**
- Pousser directement sur `main`
- Modifier la branche `main`
- Fusionner `maxime` dans `main` sans accord de Yann

### **🔄 Workflow de Git :**
```bash
# TOUJOURS vérifier la branche
git branch  # Doit être sur maxime

# Travailler sur les fichiers
# Faire des modifications avec l'IA

# Ajouter et committer
git add .
git commit -m "feat: description du changement"

# Pousser sur maxime
git push origin maxime
```

---

## 🎯 Zones de Travail Prioritaires pour Maxime

### **1. Frontend Next.js**
- **Dashboard :** `app/dashboard/page.js`
- **Components :** `components/`
- **Hooks :** `hooks/`
- **Styles :** `tailwind.config.js`

### **2. API PHP**
- **Handlers :** `api/handlers/`
- **Endpoints :** `api/routing/`
- **Database :** `sql/schema.sql`

### **3. Hardware/Arduino**
- **Firmware :** `hardware/`
- **USB :** `components/SerialPortManager.js`
- **Tests :** `__tests__/`

### **4. Tests**
- **Integration :** `__tests__/integration/`
- **Components :** `__tests__/components/`
- **API :** `__tests__/api/`

---

## 🤖 Capacités de l'IA à Utiliser

### **Pour le Développement :**
- **Code completion** avec contexte du projet OTT
- **Refactoring** des composants React/Next.js
- **Debugging** des API PHP et JavaScript
- **Optimisation** des performances

### **Pour l'Architecture :**
- **Analyse** du code existant
- **Suggestions** d'améliorations
- **Documentation** automatique
- **Tests** unitaires et intégration

### **Pour la Sécurité :**
- **Audit** de code sécurité
- **Validation** des entrées API
- **Protection** XSS/CSRF
- **Hardening** configuration

---

## 📊 Notifications et Collaboration

### **Système de Notifications :**
- **Maxime pousse sur `maxime`** → **Yann notifié**
- **Yann pousse sur `main`** → **Maxime notifié**
- **Workflows GitHub Actions** automatiques
- **Issues GitHub** créées pour suivi

### **Communication avec Yann :**
- **GitHub Issues** pour les bugs/features
- **Commits clairs** avec messages structurés
- **Documentation** des changements
- **Reviews** de code avant merge

---

## 🔧 Configuration Windsurf + IA

### **Paramètres Windsurf :**
```json
{
  "workspaces": ["d:/Windsurf/OTT"],
  "branches": ["maxime"],
  "exclude_patterns": ["node_modules", ".git", "dist"],
  "ai_context": "medical_device_dashboard",
  "security_level": "high"
}
```

### **Contexte IA :**
- **Domaine** : Medical/IoT/Healthcare
- **Technologies** : Next.js, PHP, PostgreSQL, ESP32
- **Standards** : HIPAA, GDPR, Medical Device
- **Testing** : Jest, Cypress, Integration Tests

---

## 🚨 Sécurité et Bonnes Pratiques

### **Données Médicales :**
- **Anonymiser** les données de test
- **Respecter** la confidentialité patient
- **Utiliser** des environnements de test
- **Valider** les entrées utilisateur

### **Code Quality :**
- **TypeScript** strict
- **ESLint** configuré
- **Prettier** pour formatage
- **Tests** obligatoires

### **Performance :**
- **Lazy loading** des composants
- **Cache** des requêtes API
- **Optimisation** des images
- **Monitoring** des performances

---

## 📞 Support et Aide

### **Pour Maxime :**
- **Yann** : ymora@free.fr
- **GitHub** : https://github.com/ymora/OTT
- **Documentation** : `docs/` et `public/docs/`
- **Issues** : https://github.com/ymora/OTT/issues

### **Pour l'IA :**
- **Contexte** : Toujours se référer à la branche `maxime`
- **Permissions** : Travailler uniquement sur `maxime`
- **Validation** : Demander confirmation avant modifications critiques
- **Logging** : Documenter toutes les actions importantes

---

## 🎉 Checklist de Démarrage

- [ ] Cloner le repository
- [ ] Passer sur branche `maxime`
- [ ] Installer dépendances
- [ ] Configurer environnement
- [ ] Démarrer serveurs de développement
- [ ] Vérifier que tout fonctionne
- [ ] Commencer à développer avec l'IA
- [ ] Faire premier commit de test
- [ ] Pousser sur `maxime`
- [ ] Vérifier que Yann est notifié

**L'IA est maintenant prête à aider Maxime sur son espace de travail dédié !** 🚀
