# 📋 LISTE DE QUESTIONS AUDIT - PAR PRIORITÉ

**Date** : 13 décembre 2025  
**Tri** : Du plus facile/rapide/peu risqué au plus long/risqué

---

## 🎯 LÉGENDE

- ⏱️ **Temps** : ⚡ Rapide (< 5 min) | 🕐 Moyen (5-15 min) | ⏳ Long (> 15 min)
- ⚠️ **Risque** : 🟢 Faible | 🟡 Moyen | 🔴 Élevé
- 📊 **Impact** : Petit | Moyen | Grand

---

## ✅ PHASE 1 : NETTOYAGE RAPIDE (Risque Faible)

### **Question 1 : Code mort - ErrorBoundary** 🟢
- **Type** : Code mort
- **Fichier** : `components/ErrorBoundary.js`
- **Problème** : Composant non utilisé (0 imports, 0 JSX)
- **Temps** : ⚡ 2-3 minutes
- **Risque** : 🟢 Faible (suppression simple)
- **Action** : Supprimer ou documenter usage futur

---

### **Question 2 : console.log à remplacer** 🟢
- **Type** : Nettoyage
- **Problème** : 38 console.log détectés (>20 recommandé)
- **Fichiers** : 6 fichiers concernés
- **Temps** : ⚡ 5-10 minutes
- **Risque** : 🟢 Faible (remplacement par logger)
- **Action** : Remplacer par `logger.debug()`

---

### **Question 3 : TODO/FIXME à traiter** 🟢
- **Type** : Organisation
- **Problème** : 8 fichiers avec TODO/FIXME
- **Temps** : ⚡ 5-10 minutes
- **Risque** : 🟢 Faible (documentation)
- **Action** : Traiter ou documenter

---

## ⚠️ PHASE 2 : SÉCURITÉ ET HANDLERS (Risque Moyen)

### **Question 4 : Token en dur** 🟡
- **Type** : Sécurité
- **Problème** : 1 token en dur détecté
- **Temps** : 🕐 10-15 minutes
- **Risque** : 🟡 Moyen (sécurité)
- **Action** : Déplacer vers variables d'environnement

---

### **Question 5 : Handlers non appelés** 🟡
- **Type** : Code mort API
- **Problème** : 2 handlers définis mais jamais appelés
- **Temps** : 🕐 10-15 minutes
- **Risque** : 🟡 Moyen (peut casser des routes)
- **Action** : Vérifier et supprimer ou activer

---

## 🔴 PHASE 3 : REFACTORING FICHIERS VOLUMINEUX (Risque Élevé)

**Tri par taille** : Du plus petit au plus gros (moins risqué → plus risqué)

### **Question 6 : app/dashboard/page.js (556 lignes)** 🟡
- **Type** : Complexité
- **Taille** : 556 lignes (> 500)
- **Temps** : 🕐 15-20 minutes
- **Risque** : 🟡 Moyen (page principale)
- **Action** : Extraire composants KPIs, accordéons

---

### **Question 7 : app/dashboard/patients/page.js (573 lignes)** 🟡
- **Type** : Complexité
- **Taille** : 573 lignes (> 500)
- **Temps** : 🕐 15-20 minutes
- **Risque** : 🟡 Moyen (page fonctionnelle)
- **Action** : Extraire logique modale, filtres

---

### **Question 8 : components/SerialPortManager.js (650 lignes)** 🟡
- **Type** : Complexité
- **Taille** : 650 lignes (> 500)
- **Temps** : 🕐 20-30 minutes
- **Risque** : 🟡 Moyen (hook critique USB)
- **Action** : Extraire fonctions de connexion, lecture, écriture

---

### **Question 9 : api/handlers/auth.php (648 lignes)** 🟡
- **Type** : Complexité
- **Taille** : 648 lignes (> 500)
- **Temps** : 🕐 20-30 minutes
- **Risque** : 🟡 Moyen (authentification critique)
- **Action** : Extraire fonctions rate limiting, validation

---

### **Question 10 : components/DeviceMeasurementsModal.js (781 lignes)** 🟡
- **Type** : Complexité
- **Taille** : 781 lignes (> 500)
- **Temps** : ⏳ 30-45 minutes
- **Risque** : 🟡 Moyen (modal complexe)
- **Action** : Extraire composants de liste, modals de confirmation

---

### **Question 11 : components/FlashModal.js (883 lignes)** 🟡
- **Type** : Complexité
- **Taille** : 883 lignes (> 500)
- **Temps** : ⏳ 30-45 minutes
- **Risque** : 🟡 Moyen (flash firmware critique)
- **Action** : Extraire logique USB/OTA, barre de progression

---

### **Question 12 : api/helpers.php (1006 lignes)** 🟡
- **Type** : Complexité
- **Taille** : 1006 lignes (> 500)
- **Temps** : ⏳ 30-45 minutes
- **Risque** : 🟡 Moyen (fonctions utilitaires)
- **Action** : Séparer par domaine (IP, JWT, DB, notifications)

---

### **Question 13 : components/UserPatientModal.js (1289 lignes)** 🔴
- **Type** : Complexité
- **Taille** : 1289 lignes (> 500)
- **Temps** : ⏳ 45-60 minutes
- **Risque** : 🟡 Moyen (modal utilisateur/patient)
- **Action** : Séparer UserModal et PatientModal

---

### **Question 14 : components/configuration/InoEditorTab.js (1362 lignes)** 🔴
- **Type** : Complexité
- **Taille** : 1362 lignes (> 500)
- **Temps** : ⏳ 45-60 minutes
- **Risque** : 🟡 Moyen (éditeur firmware)
- **Action** : Extraire logique upload, compilation, édition

---

### **Question 15 : app/dashboard/documentation/page.js (1444 lignes)** 🔴
- **Type** : Complexité
- **Taille** : 1444 lignes (> 500)
- **Temps** : ⏳ 45-60 minutes
- **Risque** : 🟡 Moyen (page documentation)
- **Action** : Extraire MarkdownViewer, graphiques, métadonnées

---

### **Question 16 : api.php (1654 lignes)** 🔴
- **Type** : Complexité
- **Taille** : 1654 lignes (> 500)
- **Temps** : ⏳ 60-90 minutes
- **Risque** : 🔴 Élevé (point d'entrée API critique)
- **Action** : Extraire router, middleware, handlers

---

### **Question 17 : components/DeviceModal.js (1669 lignes)** 🔴
- **Type** : Complexité
- **Taille** : 1669 lignes (> 500)
- **Temps** : ⏳ 60-90 minutes
- **Risque** : 🟡 Moyen (modal dispositif)
- **Action** : Extraire sections (config, alerts, logs, etc.)

---

### **Question 18 : contexts/UsbContext.js (1889 lignes)** 🔴
- **Type** : Complexité
- **Taille** : 1889 lignes (> 500)
- **Temps** : ⏳ 90-120 minutes
- **Risque** : 🔴 Élevé (contexte USB critique)
- **Action** : Extraire hooks useUsbStream, useUsbDevice, useUsbPort

---

### **Question 19 : components/configuration/UsbStreamingTab.js (2517 lignes)** 🔴
- **Type** : Complexité
- **Taille** : 2517 lignes (> 500)
- **Temps** : ⏳ 120-180 minutes
- **Risque** : 🔴 Élevé (composant le plus volumineux)
- **Action** : Refactoring complet en plusieurs composants/hooks

---

## 📊 RÉSUMÉ PAR PHASE

### **Phase 1 : Nettoyage Rapide** (3 questions)
- ⏱️ Temps total : ~15-20 minutes
- ⚠️ Risque : 🟢 Faible
- 📊 Impact : Petit (qualité code)

### **Phase 2 : Sécurité** (2 questions)
- ⏱️ Temps total : ~20-30 minutes
- ⚠️ Risque : 🟡 Moyen
- 📊 Impact : Moyen (sécurité, stabilité)

### **Phase 3 : Refactoring** (14 questions)
- ⏱️ Temps total : ~10-15 heures
- ⚠️ Risque : 🟡-🔴 Moyen à Élevé
- 📊 Impact : Grand (maintenabilité, performance)

---

## 🎯 RECOMMANDATION

**Commencer par Phase 1** (rapide, peu risqué) pour avoir des résultats immédiats, puis Phase 2 (sécurité), et enfin Phase 3 (refactoring progressif).


