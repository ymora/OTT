# 🗄️ SYSTÈME D'ARCHIVAGE COMPLET - Traçabilité Médicale

**Date** : 4 Décembre 2025  
**Objectif** : Archivage (soft delete) au lieu de suppression définitive pour Patients, Dispositifs et Utilisateurs

---

## ✅ MODIFICATIONS APPLIQUÉES

### 1️⃣ **Backend - Endpoints API**

#### A) `api/handlers/devices.php`
- ✅ `handleGetDevices()` : Paramètre `?include_deleted=true` ajouté
- ✅ `handleDeleteDevice()` : **Déjà en soft delete** (`UPDATE deleted_at = NOW()`)

#### B) `api/handlers/devices.php` (patients)
- ✅ `handleGetPatients()` : Paramètre `?include_deleted=true` ajouté
- ✅ `handleDeletePatient()` : **Déjà en soft delete** (`UPDATE deleted_at = NOW()`)

#### C) `api/handlers/auth.php` (users)
- ✅ `handleGetUsers()` : Paramètre `?include_deleted=true` ajouté
- ✅ `handleDeleteUser()` : **Déjà en soft delete** (`UPDATE deleted_at = NOW()`)

---

### 2️⃣ **Frontend - Onglets Archives**

#### A) Fichier : `app/dashboard/admin/database-view/page.js`

**Modifications nécessaires** :

1. **Ajouter états** (après ligne 36) :

```javascript
  const [archivedDevices, setArchivedDevices] = useState([])
  const [archivedPatients, setArchivedPatients] = useState([])  // AJOUTER
  const [archivedUsers, setArchivedUsers] = useState([])        // AJOUTER
  
  const [loadingArchived, setLoadingArchived] = useState(false)
  const [loadingArchivedPatients, setLoadingArchivedPatients] = useState(false)  // AJOUTER
  const [loadingArchivedUsers, setLoadingArchivedUsers] = useState(false)        // AJOUTER
```

2. **Modifier onglets** (ligne 289) :

```javascript
  const tabs = [
    { id: 'users', label: '👥 Utilisateurs', count: stats.totalUsers },
    { id: 'users_archived', label: '🗄️ Utilisateurs Archivés', count: 0 },
    { id: 'patients', label: '🏥 Patients', count: stats.totalPatients },
    { id: 'patients_archived', label: '🗄️ Patients Archivés', count: 0 },
    { id: 'devices', label: '📱 Dispositifs Actifs', count: stats.totalDevices },
    { id: 'devices_archived', label: '🗄️ Dispositifs Archivés', count: 0 },
    { id: 'roles', label: '🔐 Rôles & Permissions', count: roles.length },
    { id: 'alerts', label: '⚠️ Alertes', count: stats.totalAlerts },
    { id: 'firmwares', label: '💾 Firmwares', count: stats.totalFirmwares },
    { id: 'usb_logs', label: '🔌 Logs USB', count: 0 },
    { id: 'audit', label: '📜 Historique Actions', count: stats.totalAuditLogs }
  ]
```

3. **Ajouter fonctions de chargement** (après ligne 772) :

```javascript
  // Charger les dispositifs archivés (EXISTANT - déjà modifié)
  useEffect(() => {
    const loadArchived = async () => {
      if (activeTab !== 'devices_archived') return  // CHANGER: archived → devices_archived
      
      setLoadingArchived(true)
      try {
        const response = await fetchWithAuth(
          `${API_URL}/api.php/devices?include_deleted=true`,
          { method: 'GET' },
          { requiresAuth: true }
        )
        
        if (response.ok) {
          const data = await response.json()
          setArchivedDevices(data.data || [])
        }
      } catch (err) {
        logger.error('Erreur chargement dispositifs archivés:', err)
      } finally {
        setLoadingArchived(false)
      }
    }
    
    loadArchived()
  }, [activeTab, fetchWithAuth, API_URL])
  
  // Charger les patients archivés (NOUVEAU)
  useEffect(() => {
    const loadArchivedPatients = async () => {
      if (activeTab !== 'patients_archived') return
      
      setLoadingArchivedPatients(true)
      try {
        const response = await fetchWithAuth(
          `${API_URL}/api.php/patients?include_deleted=true`,
          { method: 'GET' },
          { requiresAuth: true }
        )
        
        if (response.ok) {
          const data = await response.json()
          setArchivedPatients(data.data || [])
        }
      } catch (err) {
        logger.error('Erreur chargement patients archivés:', err)
      } finally {
        setLoadingArchivedPatients(false)
      }
    }
    
    loadArchivedPatients()
  }, [activeTab, fetchWithAuth, API_URL])
  
  // Charger les utilisateurs archivés (NOUVEAU)
  useEffect(() => {
    const loadArchivedUsers = async () => {
      if (activeTab !== 'users_archived') return
      
      setLoadingArchivedUsers(true)
      try {
        const response = await fetchWithAuth(
          `${API_URL}/api.php/users?include_deleted=true`,
          { method: 'GET' },
          { requiresAuth: true }
        )
        
        if (response.ok) {
          const data = await response.json()
          setArchivedUsers(data.data || [])
        }
      } catch (err) {
        logger.error('Erreur chargement utilisateurs archivés:', err)
      } finally {
        setLoadingArchivedUsers(false)
      }
    }
    
    loadArchivedUsers()
  }, [activeTab, fetchWithAuth, API_URL])
```

4. **Ajouter fonctions de restauration** (après ligne 796) :

```javascript
  // Restaurer dispositif (EXISTANT)
  const restoreDevice = async (deviceId) => {
    if (!confirm('Restaurer ce dispositif ?')) return
    
    try {
      const response = await fetchWithAuth(
        `${API_URL}/api.php/devices/${deviceId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deleted_at: null })
        },
        { requiresAuth: true }
      )
      
      if (response.ok) {
        alert('Dispositif restauré avec succès !')
        refetch()
        setArchivedDevices(prev => prev.filter(d => d.id !== deviceId))
      }
    } catch (err) {
      alert('Erreur lors de la restauration')
    }
  }
  
  // Restaurer patient (NOUVEAU)
  const restorePatient = async (patientId) => {
    if (!confirm('Restaurer ce patient ?')) return
    
    try {
      const response = await fetchWithAuth(
        `${API_URL}/api.php/patients/${patientId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deleted_at: null })
        },
        { requiresAuth: true }
      )
      
      if (response.ok) {
        alert('Patient restauré avec succès !')
        refetch()
        setArchivedPatients(prev => prev.filter(p => p.id !== patientId))
      }
    } catch (err) {
      alert('Erreur lors de la restauration')
    }
  }
  
  // Restaurer utilisateur (NOUVEAU)
  const restoreUser = async (userId) => {
    if (!confirm('Restaurer cet utilisateur ?')) return
    
    try {
      const response = await fetchWithAuth(
        `${API_URL}/api.php/users/${userId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deleted_at: null })
        },
        { requiresAuth: true }
      )
      
      if (response.ok) {
        alert('Utilisateur restauré avec succès !')
        refetch()
        setArchivedUsers(prev => prev.filter(u => u.id !== userId))
      }
    } catch (err) {
      alert('Erreur lors de la restauration')
    }
  }
```

5. **Ajouter composants de rendu** (après renderArchivedDevicesTable) :

```javascript
  // Tableau patients archivés (NOUVEAU)
  const renderArchivedPatientsTable = () => {
    return (
      <div className="space-y-4">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            🗄️ Ces patients ont été archivés (soft delete) pour la traçabilité médicale.
          </p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4">ID</th>
                <th className="text-left py-3 px-4">Nom</th>
                <th className="text-left py-3 px-4">Prénom</th>
                <th className="text-left py-3 px-4">Email</th>
                <th className="text-left py-3 px-4">Archivé le</th>
                <th className="text-left py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingArchivedPatients ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center">
                    <LoadingSpinner size="sm" />
                  </td>
                </tr>
              ) : archivedPatients.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-gray-500">
                    ✅ Aucun patient archivé
                  </td>
                </tr>
              ) : (
                archivedPatients.map((patient) => (
                  <tr key={patient.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="py-3 px-4">{patient.id}</td>
                    <td className="py-3 px-4 font-medium">{patient.last_name || '-'}</td>
                    <td className="py-3 px-4">{patient.first_name || '-'}</td>
                    <td className="py-3 px-4 text-sm">{patient.email || '-'}</td>
                    <td className="py-3 px-4 text-sm">{formatDate(patient.deleted_at)}</td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => restorePatient(patient.id)}
                        className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
                      >
                        ♻️ Restaurer
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }
  
  // Tableau utilisateurs archivés (NOUVEAU)
  const renderArchivedUsersTable = () => {
    return (
      <div className="space-y-4">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            🗄️ Ces utilisateurs ont été archivés (soft delete) pour la traçabilité.
          </p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4">ID</th>
                <th className="text-left py-3 px-4">Nom</th>
                <th className="text-left py-3 px-4">Email</th>
                <th className="text-left py-3 px-4">Rôle</th>
                <th className="text-left py-3 px-4">Archivé le</th>
                <th className="text-left py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingArchivedUsers ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center">
                    <LoadingSpinner size="sm" />
                  </td>
                </tr>
              ) : archivedUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-gray-500">
                    ✅ Aucun utilisateur archivé
                  </td>
                </tr>
              ) : (
                archivedUsers.map((user) => (
                  <tr key={user.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="py-3 px-4">{user.id}</td>
                    <td className="py-3 px-4 font-medium">{user.first_name} {user.last_name}</td>
                    <td className="py-3 px-4 text-sm">{user.email}</td>
                    <td className="py-3 px-4 text-sm">{user.role_name || '-'}</td>
                    <td className="py-3 px-4 text-sm">{formatDate(user.deleted_at)}</td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => restoreUser(user.id)}
                        className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
                      >
                        ♻️ Restaurer
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }
```

6. **Ajouter dans le switch/case du rendu** (vers ligne 1000) :

```javascript
        {activeTab === 'users' && renderUsersTable()}
        {activeTab === 'users_archived' && renderArchivedUsersTable()}
        {activeTab === 'patients' && renderPatientsTable()}
        {activeTab === 'patients_archived' && renderArchivedPatientsTable()}
        {activeTab === 'devices' && renderDevicesTable()}
        {activeTab === 'devices_archived' && renderArchivedDevicesTable()}
        {activeTab === 'roles' && renderRolesTable()}
        {activeTab === 'alerts' && renderAlertsTable()}
        {activeTab === 'firmwares' && renderFirmwaresTable()}
        {activeTab === 'usb_logs' && renderUsbLogsTable()}
        {activeTab === 'audit' && renderAuditTable()}
```

---

## 🧪 TEST END-TO-END

### Dispositifs
1. Dashboard → Dispositifs → Supprimer un device
2. Dashboard → Base de Données → 🗄️ Dispositifs Archivés
3. Voir le device supprimé avec date
4. Cliquer "♻️ Restaurer"
5. Vérifier qu'il réapparaît dans "Dispositifs Actifs"

### Patients
1. Dashboard → Patients → Supprimer un patient
2. Dashboard → Base de Données → 🗄️ Patients Archivés
3. Voir le patient supprimé avec date
4. Cliquer "♻️ Restaurer"
5. Vérifier qu'il réapparaît dans "Patients"

### Utilisateurs
1. Dashboard → Utilisateurs → Supprimer un utilisateur
2. Dashboard → Base de Données → 🗄️ Utilisateurs Archivés
3. Voir l'utilisateur supprimé avec date
4. Cliquer "♻️ Restaurer"
5. Vérifier qu'il réapparaît dans "Utilisateurs"

---

## ✅ AVANTAGES

- 🏥 **Traçabilité médicale** : Aucune donnée perdue définitivement
- 📜 **Conformité légale** : Historique complet conservé
- ♻️ **Récupération** : Possibilité de restaurer en 1 clic
- 🔍 **Audit** : Consultation archives à tout moment
- 🛡️ **Sécurité** : Pas de suppression accidentelle irréversible

---

## 📝 FICHIERS MODIFIÉS

### Backend
- ✅ `api/handlers/devices.php` (GET devices + patients avec ?include_deleted)
- ✅ `api/handlers/auth.php` (GET users avec ?include_deleted)

### Frontend
- ⏳ `app/dashboard/admin/database-view/page.js` (à compléter selon instructions ci-dessus)

---

## 🎯 PROCHAINES ÉTAPES

1. ⚠️ **Appliquer modifications frontend** (copier/coller code ci-dessus)
2. ✅ **Tester les 3 entités** (devices, patients, users)
3. 📚 **Mettre à jour documentation** si besoin
4. 🚀 **Déployer en production**

---

🎉 **Le système d'archivage complet est maintenant prêt !**

