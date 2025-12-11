# ✅ TODO - Plan de Correction Suite à l'Audit

## 🔴 PHASE 1 : URGENT (Priorité Maximale)

### 1.1 Refactoriser Fichiers Critiques > 1000 lignes

#### Frontend React

- [ ] **UsbStreamingTab.js (2301 lignes)** 🔴 CRITIQUE
  - Analyser structure actuelle
  - Extraire sous-composants (configuration, streaming, logs, contrôles)
  - Créer hooks : `useUsbStreaming`, `useUsbConfiguration`, `useUsbLogs`
  - Appliquer `React.memo()` et lazy loading
  - **Objectif** : < 500 lignes par fichier

- [ ] **UsbContext.js (1824 lignes)** 🔴 CRITIQUE
  - Analyser responsabilités
  - Séparer en contextes : `UsbConnectionContext`, `UsbStreamingContext`, `UsbConfigurationContext`
  - Extraire logique métier dans hooks
  - **Objectif** : < 500 lignes par contexte

- [ ] **documentation/page.js (1758 lignes)** 🔴 CRITIQUE
  - Extraire sections en composants séparés
  - Créer composants modulaires
  - Utiliser données statiques (JSON/MD)
  - Implémenter lazy loading
  - **Objectif** : < 500 lignes

- [ ] **DeviceModal.js (1504 lignes)** 🔴 CRITIQUE
  - Extraire onglets en composants : `DeviceInfoTab`, `DeviceConfigurationTab`, `DeviceMeasurementsTab`, `DeviceAlertsTab`
  - Utiliser hooks pour logique métier
  - Optimiser avec `React.memo()`
  - **Objectif** : < 500 lignes

#### Backend PHP

- [ ] **api.php (1542 lignes)** 🔴 CRITIQUE
  - Extraire routes dans fichiers séparés : `api/routes/devices.php`, `api/routes/patients.php`, `api/routes/auth.php`, `api/routes/firmwares.php`
  - Créer routeur centralisé
  - Séparer logique CORS et headers
  - **Objectif** : < 500 lignes

- [ ] **firmwares/compile.php (1235 lignes)** 🔴 CRITIQUE
  - Extraire fonctions utilitaires
  - Créer classes : Compilation Arduino, Gestion fichiers, Validation firmwares
  - Utiliser traits pour code commun
  - **Objectif** : < 500 lignes

- [ ] **notifications.php (1133 lignes)** 🔴 CRITIQUE
  - Séparer en modules : `notifications/email.php`, `notifications/sms.php`, `notifications/push.php`, `notifications/queue.php`
  - Créer classe `NotificationManager`
  - Extraire templates
  - **Objectif** : < 500 lignes

### 1.2 Sécurité

- [ ] Vérifier tous endpoints utilisent `api/validators.php`
- [ ] Vérifier rate limiting sur endpoints sensibles (login, OTA)
- [ ] Ajouter documentation pour whitelists SQL
- [ ] Documenter `dangerouslySetInnerHTML` statique

---

## 🟡 PHASE 2 : IMPORTANT

### 2.1 Refactoriser Fichiers 500-1000 lignes

#### Frontend
- [ ] UserPatientModal.js (1289 lignes)
- [ ] InoEditorTab.js (1220 lignes)
- [ ] FlashModal.js (776 lignes)
- [ ] SerialPortManager.js (670 lignes)
- [ ] patients/page.js (573 lignes)
- [ ] dashboard/page.js (536 lignes)
- [ ] DeviceMeasurementsModal.js (521 lignes)

#### Backend
- [ ] devices/crud.php (878 lignes)
- [ ] devices/measurements.php (723 lignes)
- [ ] firmwares/upload.php (693 lignes)
- [ ] auth.php (648 lignes)
- [ ] helpers.php (590 lignes)

### 2.2 Réduire Duplication de Code

- [ ] Créer hook `useApiCall` pour remplacer `fetchJson` répétitif (68 occurrences)
- [ ] Créer hook `useAsyncState` pour patterns `useState` + `useEffect` (176 + 86 occurrences)
- [ ] Centraliser gestion d'erreurs avec `ErrorBoundary` et `useErrorHandler` (194 try/catch)
- [ ] Créer wrappers pour appels API courants

### 2.3 Optimiser Performance React

- [ ] Ajouter `useMemo` pour calculs coûteux (`.filter()`, `.map()`, `.find()`)
- [ ] Ajouter `useCallback` pour fonctions passées en props
- [ ] Implémenter `React.memo()` pour composants purs
- [ ] Lazy loading composants lourds avec `next/dynamic`

---

## 🟢 PHASE 3 : AMÉLIORATION CONTINUE

### 3.1 Tests

- [ ] Augmenter couverture > 70%
- [ ] Tests unitaires hooks personnalisés
- [ ] Tests unitaires helpers PHP
- [ ] Tests intégration composants critiques
- [ ] Tests E2E flux utilisateur

### 3.2 Accessibilité (a11y)

- [ ] Audit complet a11y
- [ ] Navigation clavier complète
- [ ] Vérifier contraste couleurs (WCAG AA)
- [ ] Tests avec lecteurs d'écran
- [ ] Ajouter attributs ARIA manquants

### 3.3 Documentation

- [ ] Documenter architecture refactorisée
- [ ] Documenter nouveaux hooks
- [ ] Documenter patterns de code
- [ ] Mettre à jour `.cursorrules` si nécessaire

---

## 📊 Métriques de Succès

- ✅ Fichiers > 500 lignes : **19 → < 10**
- ✅ Fichiers > 1000 lignes : **7 → 0**
- ✅ Duplication patterns : **4 → < 2**
- ✅ Couverture tests : **< 50% → > 70%**
- ✅ Core Web Vitals : LCP < 2.5s, FID < 100ms, CLS < 0.1

---

## 🚀 Prochaine Action

**Commencer par** : Refactoriser `UsbStreamingTab.js` (2301 lignes) - Le fichier le plus volumineux

