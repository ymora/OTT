# Documentation Interface Old OTT - Guide de Récupération

## 📋 Vue d'Ensemble de l'Interface

### 1. Dashboard Principal (`/dashboard`)
**Fichier**: `app/dashboard/page.js`

#### Fonctionnalités principales:
- **Carte interactive Leaflet** : Affichage des dispositifs géolocalisés
- **KPIs avec accordéons** : 5 cartes principales
- **Actions requises** : Alertes et batteries faibles
- **Auto-rafraîchissement** : 30 secondes

#### Onglets et Actions:
- **Carte des Dispositifs** 🗺️
  - Zoom sur dispositif (clic)
  - Affichage dispositifs actifs/géolocalisés
  - Support USB streaming temps réel

- **KPIs (cartes cliquables)**:
  1. **Dispositifs** 🔌 : Liste complète avec accordéon
  2. **En Ligne** 🟢 : Dispositifs actifs (< 2h)
  3. **Alertes** ⚠️ : Alertes critiques
  4. **Batterie** 🔋 : Niveau batterie (OK/Faible)
  5. **Non Assignés** 📦 : Dispositifs sans patient

- **Actions Requises**:
  - **Alertes Actives** 🔔 : Liste des alertes non résolues
  - **Batteries Faibles** 🔋 : < 30% avec détails

#### Boutons et Interactions:
- `zoomToDevice(deviceId)` : Zoom carte sur dispositif
- `toggleAccordion(key)` : Déplier/replier KPI
- Auto-scroll vers carte lors du zoom
- Hover effects sur tous les éléments cliquables

---

### 2. Page Dispositifs (`/dashboard/dispositifs`)
**Fichier**: `app/dashboard/dispositifs/page.js`

#### Fonctionnalités principales:
- **Détection USB automatique**
- **Configuration firmware** (éditeur .ino)
- **Streaming USB temps réel**
- **Gestion des dispositifs**

#### Onglets principaux:
1. **Liste des dispositifs** : Tableau avec actions
2. **Configuration USB** : Éditeur de code + streaming
3. **Flash firmware** : Mise à jour OTA

#### Actions disponibles:
- **Ajouter dispositif** : Modal de création
- **Modifier** : Modal d'édition
- **Archiver/Restaurer** : Gestion état
- **Supprimer** : Suppression définitive
- **Flash firmware** : Mise à jour OTA
- **Voir mesures** : Historique des mesures

#### Composants clés:
- `DeviceModal` : CRUD dispositifs
- `FlashModal` : Flash firmware
- `DeviceMeasurementsModal` : Historique
- `InoEditorTab` : Éditeur code Arduino
- `UsbStreamingTab` : Streaming temps réel

---

### 3. Page Patients (`/dashboard/patients`)
**Fichier**: `app/dashboard/patients/page.js`

#### Fonctionnalités:
- **Gestion des patients**
- **Assignation dispositifs**
- **Suivi médical**

#### Actions:
- CRUD patients
- Assigner/libérer dispositifs
- Voir historique

---

### 4. Page Utilisateurs (`/dashboard/users`)
**Fichier**: `app/dashboard/users/page.js`

#### Fonctionnalités:
- **Gestion des comptes**
- **Rôles et permissions**
- **Administration**

---

## 🔧 Composants Techniques Clés

### Contextes React:
- **AuthContext** : Gestion authentification
- **UsbContext** : Communication USB
- **DeviceContext** : État dispositifs

### Hooks Personnalisés:
- `useApiData()` : Appels API avec cache
- `useAutoRefresh()` : Rafraîchissement auto
- `useUsbAutoDetection()` : Détection USB
- `useEntityArchive()` : Archivage

### API Endpoints:
- `/api.php/devices` : CRUD dispositifs
- `/api.php/patients` : CRUD patients  
- `/api.php/users` : CRUD utilisateurs
- `/api.php/alerts` : Alertes
- `/api.php/devices/measurements` : Mesures temps réel

---

## 🚨 Points Critiques à Préserver

### 1. Interface Dashboard
- **Carte Leaflet** : Composant `LeafletMap`
- **Accordéons KPI** : État `kpiAccordions`
- **Auto-refresh** : Hook `useAutoRefresh`
- **Zoom interactif** : Fonction `zoomToDevice`

### 2. Gestion USB
- **Détection auto** : Hook `useUsbAutoDetection`
- **Streaming temps réel** : `UsbStreamingTab`
- **Éditeur firmware** : `InoEditorTab`

### 3. Modales et Actions
- **CRUD modals** : DeviceModal, ConfirmModal
- **Flash firmware** : FlashModal
- **Mesures** : DeviceMeasurementsModal

---

## 🔄 Flux de Données

### Dashboard:
```
API → useApiData → useMemo → Components
USB → useUsb → usbDevice → Dashboard
```

### Dispositifs:
```
USB → useUsbAutoDetection → usbDevice → Tableau
API → fetchWithAuth → CRUD operations
```

---

## 📱 État Global (à sauvegarder)

### États React importants:
```javascript
// Dashboard
const [kpiAccordions, setKpiAccordions] = useState({...})
const [focusDeviceId, setFocusDeviceId] = useState(null)

// Dispositifs  
const [selectedDevice, setSelectedDevice] = useState(null)
const [modalStates, setModalStates] = useState({...})

// USB
const { usbDevice, usbDeviceInfo, isConnected } = useUsb()
```

### Données API:
```javascript
// Dashboard
const { data, loading, error, refetch } = useApiData([
  '/api.php/devices',
  '/api.php/alerts', 
  '/api.php/users',
  '/api.php/patients',
  '/api.php/firmwares'
])
```

---

## 🛠️ Configuration Clé

### Variables d'environnement:
- `API_URL` : URL backend API
- `NEXT_PUBLIC_*` : Variables publiques Next.js

### Fichiers de config:
- `next.config.js` : Configuration Next.js
- `tailwind.config.js` : Styles
- `package.json` : Dépendances

---

## 📋 Checklist Récupération

### Avant nettoyage:
- [ ] Documenter état actuel des composants
- [ ] Sauvegarder fichiers clés
- [ ] Exporter configuration

### Après nettoyage:
- [ ] Vérifier dashboard fonctionnel
- [ ] Tester détection USB
- [ ] Valider tous les boutons
- [ ] Confirmer API endpoints
- [ ] Tester carte Leaflet

---

## 🎯 Actions Critiques à NE PAS supprimer

### Composants:
- `app/dashboard/page.js` : Dashboard principal
- `app/dashboard/dispositifs/page.js` : Gestion dispositifs
- `components/LeafletMap.js` : Carte interactive
- `contexts/UsbContext.js` : Gestion USB
- `hooks/useApiData.js` : Appels API

### Fonctions:
- `zoomToDevice()` : Navigation carte
- `toggleAccordion()` : Interface KPI
- `useUsbAutoDetection()` : Détection auto
- `useAutoRefresh()` : Rafraîchissement

### Styles:
- Classes Tailwind pour animations
- Dark mode support
- Responsive design

---

*Dernière mise à jour: 13/01/2026*
*Version: Old OTT Interface Documentation v1.0*
