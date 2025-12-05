# 🔧 TÂCHE : Correction Warnings React Hooks

## 📊 État actuel

- **Build fonctionne** ✅ (compile avec succès)
- **~20 warnings React Hooks** ⚠️ (non bloquants mais à corriger)
- **Impact** : Performance potentielle, best practices

---

## 🎯 Warnings à corriger

### 🔴 Critiques (Performance)

#### 1. `app/dashboard/page.js` (7 warnings)
- **Lignes 177, 181-187** : `useEffect` missing dependency `refetch`
- **Lignes 181-187** : Multiple `useMemo` avec deps `users`, `devices`, `patients`, `alerts`, `firmwares`, `auditLogs`
- **Problème** : Expressions logiques (`data?.users?.users || []`) causent re-renders inutiles
- **Solution** : Wrapper chaque donnée dans son propre `useMemo()`

```javascript
// ❌ Avant
const users = useMemo(() => data?.users?.users || [], [data?.users])

// ✅ Après
const users = useMemo(() => {
  return data?.users?.users || []
}, [data?.users?.users]) // Plus précis
```

#### 2. `components/configuration/UsbStreamingTab.js` (3 warnings)
- **Ligne 377** : `useEffect` missing deps `notifyDevicesUpdated`, `refetchDevices`
- **Ligne 537** : `useEffect` missing many deps (API_URL, allDevices, fetchWithAuth, etc.)
- **Ligne 743** : `useEffect` missing deps `dbDeviceData`, `loadingDbData`, etc.
- **Solution** : Ajouter deps manquantes ou utiliser `useCallback` pour fonctions stables

---

### 🟡 Importants

#### 3. `components/DeviceModal.js` (3 warnings)
- **Ligne 130** : `useEffect` missing deps `editingItem`, `loadDeviceConfig`
- **Ligne 475** : `useCallback` missing dep `addLog`
- **Ligne 533** : `useCallback` missing dep `addLog`
- **Solution** : Ajouter deps ou extraire fonctions

#### 4. `contexts/UsbContext.js` (2 warnings)
- **Ligne 88** : `useEffect` missing dep `port`
- **Ligne 572** : `useCallback` missing dep `port`

---

### 🟢 Mineurs (5 warnings restants)

- `app/dashboard/admin/database-view/page.js` : useCallback deps
- `app/dashboard/admin/firmwares/page.js` : useCallback deps
- `components/NotificationCenter.js` : useEffect deps

---

## 🛠️ Plan de correction

### Phase 1 : Dashboard (Priorité haute)
1. **Wrapper toutes les données** dans des `useMemo` individuels
2. **Ajouter `refetch`** comme dépendance ou utiliser un ref
3. **Tester** : Build sans warning pour dashboard

### Phase 2 : UsbStreamingTab (Priorité haute)
1. **Extraire fonctions stables** en `useCallback` hors du composant
2. **Ajouter toutes les deps** ou justifier leur absence avec `// eslint-disable-next-line`
3. **Tester** : Synchronisation USB fonctionne toujours

### Phase 3 : Composants mineurs (Priorité moyenne)
1. **DeviceModal** : Ajouter `addLog` en dep ou en ref
2. **UsbContext** : Ajouter `port` en dep
3. **Autres composants** : Corrections similaires

### Phase 4 : Tests complets
1. **Build local** sans warnings
2. **Tests fonctionnels** : GPS, USB, Archives
3. **Tests performance** : Pas de régression
4. **Déploiement** GitHub Pages + Render

---

## ✅ Checklist avant merge

- [ ] Tous les warnings corrigés
- [ ] Build sans warnings
- [ ] Tests USB fonctionnels
- [ ] Tests GPS fonctionnels
- [ ] Tests Archives fonctionnels
- [ ] Pas de régression visuelle
- [ ] Performance OK (DevTools profiler)

---

## 📚 Ressources

- [React Hooks Exhaustive Deps](https://react.dev/learn/removing-effect-dependencies)
- [useMemo Performance](https://react.dev/reference/react/useMemo)
- [useCallback Best Practices](https://react.dev/reference/react/useCallback)

---

## 💡 Notes

- **Ne pas précipiter** : Ces corrections touchent le cœur de l'app
- **Tester après chaque fix** : Isoler les régressions
- **Documenter les choix** : Si on ignore un warning, expliquer pourquoi
- **Profiler performance** : Avant/après pour valider les gains

---

**Estimation** : 2-3 heures (corrections + tests)
**Priorité** : Moyenne (warnings non bloquants, app fonctionne)
**Date création** : 2025-12-04

