# 🔄 Refactorisation de la Duplication de Code

**Date** : 2025-12-13  
**Basé sur** : Audit complet - Duplication détectée (Score: 8/10)

## 📊 Analyse de la Duplication

### Patterns Détectés par l'Audit
- **useState** : 189 occurrences dans 39 fichiers
- **useEffect** : 87 occurrences dans 37 fichiers
- **Appels API** : 77 occurrences dans 22 fichiers
- **Try/catch** : 201 occurrences dans 61 fichiers

### Patterns de Duplication Identifiés

#### 1. **Pattern loading/error/success** (Très fréquent)
```javascript
// Pattern dupliqué dans de nombreux composants
const [loading, setLoading] = useState(false)
const [error, setError] = useState(null)
const [success, setSuccess] = useState(null)

try {
  setLoading(true)
  setError(null)
  const data = await fetchJson(...)
  setSuccess('Opération réussie')
} catch (err) {
  setError(err.message)
} finally {
  setLoading(false)
}
```

#### 2. **Pattern try/catch avec fetchJson** (Très fréquent)
```javascript
// Pattern dupliqué dans de nombreux composants
try {
  const data = await fetchJson(fetchWithAuth, API_URL, endpoint, options, { requiresAuth: true })
  // Traitement des données
} catch (err) {
  logger.error('Erreur:', err)
  setError(err.message)
}
```

#### 3. **Pattern modal state** (Fréquent)
```javascript
// Pattern dupliqué pour les modals
const [isOpen, setIsOpen] = useState(false)
const [data, setData] = useState(null)

const open = (modalData) => {
  setData(modalData)
  setIsOpen(true)
}

const close = () => {
  setIsOpen(false)
  setData(null)
}
```

## ✅ Hooks Créés pour Réduire la Duplication

### 1. **useApiCall** (Nouveau)
**Fichier** : `hooks/useApiCall.js`

**Objectif** : Simplifier les appels API avec gestion automatique des états

**Avant** :
```javascript
const [loading, setLoading] = useState(false)
const [error, setError] = useState(null)

const loadData = async () => {
  setLoading(true)
  setError(null)
  try {
    const data = await fetchJson(fetchWithAuth, API_URL, '/api.php/devices', {}, { requiresAuth: true })
    // Traitement
  } catch (err) {
    setError(err.message)
  } finally {
    setLoading(false)
  }
}
```

**Après** :
```javascript
const { loading, error, call } = useApiCall({ requiresAuth: true })

const loadData = async () => {
  try {
    const data = await call('/api.php/devices')
    // Traitement
  } catch (err) {
    // Erreur déjà gérée par le hook
  }
}
```

**Bénéfices** :
- Réduction de ~10 lignes par appel API
- Gestion automatique des états
- Support autoReset optionnel

### 2. **useModalState** (Nouveau)
**Fichier** : `hooks/useModalState.js`

**Objectif** : Gérer les états des modals de manière unifiée

**Avant** :
```javascript
const [isOpen, setIsOpen] = useState(false)
const [modalData, setModalData] = useState(null)

const openModal = (data) => {
  setModalData(data)
  setIsOpen(true)
}

const closeModal = () => {
  setIsOpen(false)
  setModalData(null)
}
```

**Après** :
```javascript
const { isOpen, open, close, data } = useModalState({
  onOpen: (data) => console.log('Modal ouvert', data),
  onClose: () => console.log('Modal fermé')
})

// Utilisation
open(item) // Ouvre avec des données
close()    // Ferme et réinitialise
```

**Bénéfices** :
- Réduction de ~8 lignes par modal
- Gestion unifiée de l'ouverture/fermeture
- Support callbacks optionnels

### 3. **Hooks Existants à Utiliser Plus Souvent**

#### **useAsyncState** (Existant)
**Fichier** : `hooks/useAsyncState.js`

**Utilisation recommandée** : Pour les opérations asynchrones simples

```javascript
const { loading, error, success, execute } = useAsyncState()

const handleAction = () => {
  execute(async () => {
    return await someAsyncOperation()
  }, {
    onSuccess: (result) => console.log('Succès', result),
    onError: (err) => console.error('Erreur', err),
    successMessage: 'Opération réussie'
  })
}
```

#### **useActionState** (Existant)
**Fichier** : `hooks/useActionState.js`

**Utilisation recommandée** : Pour les actions avec reset automatique

```javascript
const { loading, error, success, execute } = useActionState({ resetOnNewAction: true })

const handleAction = () => {
  execute(async () => {
    return await someAsyncOperation()
  })
}
```

## 📋 Plan de Refactorisation

### Phase 1 : Composants Prioritaires (À refactoriser en premier)

1. **DeviceMeasurementsModal.js**
   - Utiliser `useApiCall` pour `loadMeasurements`
   - Utiliser `useModalState` pour les modals de confirmation
   - **Réduction estimée** : ~30 lignes

2. **FlashModal.js**
   - Utiliser `useApiCall` pour `loadFirmwares`
   - Utiliser `useAsyncState` pour les opérations de flash
   - **Réduction estimée** : ~25 lignes

3. **InoEditorTab.js**
   - Utiliser `useApiCall` pour les appels API
   - Utiliser `useModalState` pour les modals
   - **Réduction estimée** : ~40 lignes

### Phase 2 : Composants Secondaires

4. **SerialPortManager.js**
   - Utiliser `useAsyncState` pour les opérations série
   - **Réduction estimée** : ~15 lignes

5. **UserPatientModal.js**
   - Utiliser `useApiCall` pour les appels API
   - **Réduction estimée** : ~20 lignes

### Phase 3 : Pages

6. **app/dashboard/documentation/page.js**
   - Utiliser `useApiCall` pour le chargement
   - **Réduction estimée** : ~10 lignes

7. **app/dashboard/admin-migrations/page.js**
   - Utiliser `useApiCall` pour les migrations
   - **Réduction estimée** : ~15 lignes

## 🎯 Objectifs de Réduction

### Réduction Estimée Totale
- **Lignes de code** : ~155 lignes supprimées
- **Duplication useState** : ~50 occurrences réduites
- **Duplication try/catch** : ~30 occurrences réduites
- **Duplication appels API** : ~20 occurrences réduites

### Amélioration du Score
- **Avant** : 8/10 (Duplication)
- **Après** : 9-9.5/10 (Réduction significative)

## 📝 Exemple de Refactorisation

### Exemple : DeviceMeasurementsModal.js

**Avant** (lignes 34-68) :
```javascript
const [loading, setLoading] = useState(false)
const [error, setError] = useState(null)

const loadMeasurements = useCallback(async () => {
  if (!device?.id) return

  setLoading(true)
  setError(null)
  
  try {
    const url = `/api.php/devices/${device.id}/history${showArchived ? '?show_archived=true' : ''}`
    const data = await fetchJson(
      fetchWithAuth,
      API_URL,
      url,
      { method: 'GET' },
      { requiresAuth: true }
    )
    
    if (data.success && data.measurements) {
      setMeasurements(data.measurements)
    } else {
      const errorMsg = data.error || 'Impossible de charger les mesures'
      setError(errorMsg)
    }
  } catch (err) {
    logger.error('Erreur chargement mesures:', err)
    setError(err.message || 'Erreur lors du chargement des mesures')
    setMeasurements([])
  } finally {
    setLoading(false)
  }
}, [device?.id, fetchWithAuth, API_URL, showArchived])
```

**Après** :
```javascript
const { loading, error, call } = useApiCall({ requiresAuth: true })

const loadMeasurements = useCallback(async () => {
  if (!device?.id) return

  try {
    const url = `/api.php/devices/${device.id}/history${showArchived ? '?show_archived=true' : ''}`
    const data = await call(url, { method: 'GET' })
    
    if (data.success && data.measurements) {
      setMeasurements(data.measurements)
    } else {
      // Erreur déjà gérée par useApiCall
    }
  } catch (err) {
    // Erreur déjà gérée par useApiCall
    setMeasurements([])
  }
}, [device?.id, showArchived, call])
```

**Réduction** : ~15 lignes, code plus lisible

## ✅ Prochaines Étapes

1. **Refactoriser les composants prioritaires** (Phase 1)
2. **Tester les refactorisations** pour s'assurer qu'elles fonctionnent
3. **Continuer avec les phases suivantes**
4. **Relancer l'audit** pour mesurer l'amélioration

---

**Note** : Les hooks créés sont compatibles avec le code existant et peuvent être adoptés progressivement sans casser les fonctionnalités.

