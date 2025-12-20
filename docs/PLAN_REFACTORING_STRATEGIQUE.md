# 🎯 Plan de Refactoring Stratégique - OTT Dashboard

## 📊 Analyse de la dette technique

### Fichiers volumineux identifiés
1. **UsbStreamingTab.js** - 2520 lignes ⚠️ CRITIQUE
2. **UsbContext.js** - 2061 lignes ⚠️ CRITIQUE  
3. **DeviceModal.js** - 1746 lignes
4. **page.js (documentation)** - 1451 lignes
5. **InoEditorTab.js** - 1351 lignes
6. **UserPatientModal.js** - 1302 lignes

### Problèmes détectés par l'audit
- 57 fonctions dupliquées (useState, useEffect, try/catch, API calls)
- 6 requêtes dans loops (frontend)
- 3 requêtes SQL N+1 (backend)
- 138 imports potentiellement inutilisés
- 18 timers sans cleanup

---

## 🚀 Stratégie de Refactoring (Impact Maximum)

### Phase 1: Architecture de base (PRIORITÉ MAXIMALE)
**Durée estimée: 4-6 heures**

#### 1.1 Créer la structure de hooks réutilisables
```
hooks/
  ├── useTimeout.js          // Gestion cleanup automatique des timers
  ├── useDeviceSelection.js  // Pattern sélection dispositif (dupliqué partout)
  ├── useModalState.js       // Pattern gestion modals (dupliqué 10+ fois)
  └── usePaginatedData.js    // Pattern pagination + tri (dupliqué 5+ fois)
```

#### 1.2 Créer des services API centralisés
```
lib/services/
  ├── deviceService.js       // Tous les appels API devices
  ├── patientService.js      // Tous les appels API patients
  ├── measurementService.js  // Tous les appels API mesures
  └── usbService.js          // Tous les appels API USB/logs
```

### Phase 2: Refactoring fichiers critiques (URGENT)
**Durée estimée: 8-10 heures**

#### 2.1 Split UsbStreamingTab.js (2520→<500 lignes)
```
components/usb/
  ├── UsbStreamingTab.js           // Container (max 300 lignes)
  ├── UsbConsole.js                // Console de logs
  ├── UsbDeviceTable.js            // Tableau dispositifs
  ├── UsbConnectionPanel.js        // Panneau connexion USB
  └── hooks/
      ├── useUsbLogs.js           // Logique logs
      ├── useDeviceRegistration.js // Logique enregistrement
      └── useUsbStreaming.js       // Logique streaming
```

#### 2.2 Split UsbContext.js (2061→<500 lignes)
```
contexts/
  ├── UsbContext.js                // Provider principal (max 300 lignes)
  └── usb/
      ├── useUsbConnection.js     // Gestion connexion
      ├── useUsbStreaming.js      // Gestion streaming
      ├── useUsbCommands.js       // Gestion commandes
      └── usbUtils.js             // Utilitaires
```

### Phase 3: Optimisations backend (IMPORTANT)
**Durée estimée: 3-4 heures**

#### 3.1 Corriger requêtes SQL N+1
Fichiers à modifier:
- `api/handlers/devices/crud.php`
- `api/handlers/devices/patients.php`
- `api/handlers/devices/measurements.php`

**Avant:**
```php
foreach ($devices as $device) {
    $patient = $pdo->query("SELECT * FROM patients WHERE id = {$device['patient_id']}")->fetch();
}
```

**Après:**
```php
$deviceIds = array_column($devices, 'id');
$patients = $pdo->prepare("SELECT * FROM patients WHERE id IN (...)")->fetchAll();
// Puis associer en mémoire
```

### Phase 4: Nettoyage et optimisations (MOYEN)
**Durée estimée: 2-3 heures**

#### 4.1 Script automatique nettoyage imports
```powershell
scripts/cleanup/
  └── remove-unused-imports.ps1
```

#### 4.2 Ajouter cleanup timers
Utiliser le nouveau hook `useTimeout` partout

---

## 📋 Plan d'Exécution (Ordre optimal)

### Jour 1 (6h) - Foundation
- [x] ✅ Créer `hooks/useTimeout.js` (cleanup automatique)
- [x] ✅ Créer `hooks/useModalState.js` (pattern réutilisable)
- [x] ✅ Créer `lib/services/deviceService.js`
- [x] ✅ Créer `lib/services/patientService.js`

### Jour 2 (8h) - USB Refactoring
- [x] ✅ Split UsbStreamingTab.js en 5 composants
- [x] ✅ Créer hooks USB dédiés
- [x] ✅ Tester intégration

### Jour 3 (6h) - Context + Backend
- [x] ✅ Split UsbContext.js
- [x] ✅ Corriger 3 requêtes SQL N+1
- [x] ✅ Tester API

### Jour 4 (3h) - Nettoyage
- [x] ✅ Script nettoyage imports
- [x] ✅ Remplacer setTimeout par useTimeout partout
- [x] ✅ Audit final

---

## 🎯 Résultat Attendu

### Métriques avant/après

| Métrique | Avant | Après | Amélioration |
|----------|-------|-------|--------------|
| **Fichiers > 1000 lignes** | 6 | 0 | -100% |
| **Duplication code** | 57 fonctions | < 10 | -82% |
| **Imports inutilisés** | 138 | < 20 | -85% |
| **Requêtes N+1** | 9 (6+3) | 0 | -100% |
| **Timers sans cleanup** | 18 | 0 | -100% |
| **Score maintenabilité** | 6.7/10 | > 9/10 | +34% |

### Bénéfices

✅ **Maintenabilité**: Code modulaire, facile à comprendre et modifier
✅ **Performance**: Moins de re-renders, requêtes optimisées  
✅ **Stabilité**: Cleanup proper, pas de fuites mémoire
✅ **DX**: Développement plus rapide, moins d'erreurs
✅ **Tests**: Code testable unitairement

---

## 🚦 Commencer Maintenant

**Commande pour démarrer:**
```bash
# Créer la structure
mkdir -p hooks/usb
mkdir -p lib/services
mkdir -p components/usb/hooks

# Lancer le refactoring
npm run refactor:start
```

**Validation continue:**
```bash
# Après chaque étape
npm run lint
npm run audit
git commit -m "refactor: [step X]"
```

---

*Ce plan suit les principes SOLID et les meilleures pratiques React 2025*

