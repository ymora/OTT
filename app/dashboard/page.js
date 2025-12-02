'use client'

// Désactiver le pré-rendu statique
export const dynamic = 'force-dynamic'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import StatsCard from '@/components/StatsCard'
import AlertCard from '@/components/AlertCard'
import { useApiData, useAutoRefresh } from '@/hooks'
import { useUsb } from '@/contexts/UsbContext'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import { formatDate } from '@/lib/dateUtils'

export default function DashboardPage() {
  const router = useRouter()
  const { isConnected, usbConnectedDevice, usbDeviceInfo, usbStreamLastMeasurement } = useUsb()
  
  // Charger les données avec useApiData
  const { data, loading, error, refetch } = useApiData(
    [
      '/api.php/devices',
      '/api.php/alerts',
      '/api.php/users',
      '/api.php/patients',
      '/api.php/firmwares'
    ],
    { requiresAuth: true }
  )
  
  const [databaseTab, setDatabaseTab] = useState('devices')

  // Utiliser le hook useAutoRefresh pour le rafraîchissement automatique
  useAutoRefresh(refetch, 30000)

  const devices = data?.devices?.devices || []
  const users = data?.users?.users || []
  const patients = data?.patients?.patients || []
  const firmwares = data?.firmwares?.firmwares || []
  const alerts = useMemo(() => {
    return (data?.alerts?.alerts || []).filter(a => a.status === 'unresolved')
  }, [data])

  // Mémoriser les calculs coûteux pour éviter les recalculs inutiles
  const stats = useMemo(() => {
    // Compter les dispositifs en ligne depuis la base de données (last_seen < 2h)
    const onlineFromDb = devices.filter(d => {
      // Gérer les valeurs null, undefined ou invalides
      if (!d.last_seen) return false
      const lastSeen = new Date(d.last_seen)
      // Vérifier que la date est valide
      if (isNaN(lastSeen.getTime())) return false
      const hoursSince = (new Date() - lastSeen) / (1000 * 60 * 60)
      return hoursSince < 2
    })
    
    // Vérifier si un dispositif USB est connecté et n'est pas déjà compté
    const usbDeviceOnline = isConnected && usbDeviceInfo && (
      usbDeviceInfo.sim_iccid || usbDeviceInfo.device_serial
    )
    
    // Si un dispositif USB est connecté, vérifier s'il est déjà dans la liste des dispositifs en ligne
    let usbDeviceAlreadyCounted = false
    if (usbDeviceOnline) {
      usbDeviceAlreadyCounted = onlineFromDb.some(d => 
        (usbDeviceInfo.sim_iccid && d.sim_iccid === usbDeviceInfo.sim_iccid) ||
        (usbDeviceInfo.device_serial && d.device_serial === usbDeviceInfo.device_serial)
      )
    }
    
    // Ajouter 1 si un dispositif USB est connecté et pas déjà compté
    const activeDevices = onlineFromDb.length + (usbDeviceOnline && !usbDeviceAlreadyCounted ? 1 : 0)
    
    // Calculer les batteries faibles depuis la base de données
    const lowBatteryFromDb = devices.filter(d => {
      const battery = d.last_battery
      return battery !== null && battery !== undefined && battery < 30
    }).length
    
    // Vérifier si le dispositif USB connecté a une batterie faible
    let usbBatteryLow = false
    let usbBatteryOk = false
    if (usbDeviceOnline && usbDeviceInfo) {
      // Priorité : usbStreamLastMeasurement (le plus récent) > usbDeviceInfo
      const usbBattery = usbStreamLastMeasurement?.battery ?? usbDeviceInfo.battery ?? usbDeviceInfo.last_battery
      if (usbBattery !== null && usbBattery !== undefined) {
        usbBatteryLow = usbBattery < 30
        usbBatteryOk = usbBattery >= 30
      }
    }
    
    // Compter le dispositif USB seulement s'il n'est pas déjà dans la base de données
    const lowBatteryDevices = lowBatteryFromDb + (usbBatteryLow && !usbDeviceAlreadyCounted ? 1 : 0)
    
    // Calculer le nombre total de dispositifs avec batterie OK (>= 30%)
    const devicesWithBattery = devices.filter(d => {
      const battery = d.last_battery
      return battery !== null && battery !== undefined
    })
    const okBatteryFromDb = devicesWithBattery.filter(d => d.last_battery >= 30).length
    const okBatteryDevices = okBatteryFromDb + (usbBatteryOk && !usbDeviceAlreadyCounted ? 1 : 0)
    
    // Total dispositifs : base de données + USB si pas déjà compté
    const totalDevices = devices.length + (usbDeviceOnline && !usbDeviceAlreadyCounted ? 1 : 0)
    
    return {
      totalDevices,
      activeDevices,
      criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
      lowBatteryDevices,
      okBatteryDevices
    }
  }, [devices, alerts, isConnected, usbDeviceInfo, usbStreamLastMeasurement])

  const unassignedDevices = useMemo(() => 
    devices.filter(d => !d.first_name && !d.last_name),
    [devices]
  )
  
  const lowBatteryList = useMemo(() => 
    devices.filter(d => {
      const battery = d.last_battery
      return battery !== null && battery !== undefined && battery < 30
    }),
    [devices]
  )

  // Tous les hooks doivent être appelés avant tout return conditionnel
  const criticalItems = useMemo(() => 
    alerts.filter(a => a.severity === 'critical' || a.severity === 'high'),
    [alerts]
  )
  
  // Limiter à 5 pour l'affichage
  const lowBatteryListDisplay = useMemo(() => 
    lowBatteryList.slice(0, 5),
    [lowBatteryList]
  )

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="animate-slide-up">
          <h1 className="text-3xl font-bold text-primary mb-2">Vue d&apos;Ensemble</h1>
          <p className="text-muted">Tableau de bord en temps réel des dispositifs OTT</p>
        </div>
        <LoadingSpinner size="lg" text="Chargement du tableau de bord..." />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="animate-slide-up">
        <h1 className="text-3xl font-bold text-primary mb-2">Vue d&apos;Ensemble</h1>
        <p className="text-muted">Tableau de bord en temps réel des dispositifs OTT</p>
      </div>

      <ErrorMessage error={error} onRetry={refetch} />

      {/* Stats Cards - Indicateurs clés (KPIs uniquement) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Dispositifs Totaux"
          value={stats.totalDevices}
          icon="🔌"
          color="primary"
          delay={0}
        />
        <StatsCard
          title="En Ligne"
          value={stats.activeDevices}
          icon="✅"
          color="green"
          delay={0.1}
        />
        <StatsCard
          title="Alertes Critiques"
          value={stats.criticalAlerts}
          icon="⚠️"
          color="red"
          delay={0.2}
        />
        <StatsCard
          title={stats.lowBatteryDevices > 0 ? "Batteries Faibles" : "Batteries OK"}
          value={stats.lowBatteryDevices > 0 ? stats.lowBatteryDevices : stats.okBatteryDevices}
          icon="🔋"
          color={stats.lowBatteryDevices > 0 ? "orange" : "green"}
          delay={0.3}
        />
      </div>

      {/* Section Actions Requises - Consolidée avec toutes les alertes */}
      {(alerts.length > 0 || unassignedDevices.length > 0 || lowBatteryList.length > 0) && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="text-red-500">⚡</span>
            Actions Requises
          </h2>
          
          <div className="space-y-6">
            {/* Toutes les alertes */}
            {alerts.length > 0 && (
              <div>
                <h3 className="font-semibold text-primary mb-3 flex items-center justify-between">
                  <span>🔔 Toutes les Alertes ({alerts.length})</span>
                </h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {alerts.map((alert, i) => (
                    <AlertCard key={alert.id} alert={alert} delay={i * 0.05} />
                  ))}
                </div>
              </div>
            )}

            {/* Autres actions (batteries faibles, non assignés) */}
            {(lowBatteryList.length > 0 || unassignedDevices.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                {/* Batteries faibles */}
                {lowBatteryList.length > 0 && (
                  <div className="border-l-4 border-orange-500 pl-4">
                    <h3 className="font-semibold text-orange-600 dark:text-orange-400 mb-2">Batteries Faibles ({lowBatteryList.length})</h3>
                    <div className="space-y-2">
                      {lowBatteryListDisplay.map(device => {
                        const battery = typeof device.last_battery === 'number' ? device.last_battery : parseFloat(device.last_battery) || 0
                        return (
                          <div key={device.id} className="text-sm">
                            <p className="font-semibold text-primary">{device.device_name || device.sim_iccid}</p>
                            <p className="text-xs text-muted">{battery.toFixed(0)}% restant</p>
                          </div>
                        )
                      })}
                    </div>
                    <button className="btn-secondary text-xs mt-2" onClick={() => router.push('/dashboard/outils')}>
                      Voir tous →
                    </button>
                  </div>
                )}

                {/* Boîtiers non assignés */}
                {unassignedDevices.length > 0 && (
                  <div className="border-l-4 border-amber-500 pl-4">
                    <h3 className="font-semibold text-amber-600 dark:text-amber-400 mb-2">Non Assignés ({unassignedDevices.length})</h3>
                    <div className="space-y-2">
                      {unassignedDevices.slice(0, 5).map(device => (
                        <div key={device.id} className="text-sm">
                          <p className="font-semibold text-primary">{device.device_name || device.sim_iccid}</p>
                          <p className="text-xs text-muted">
                            {device.last_seen ? new Date(device.last_seen).toLocaleDateString('fr-FR') : 'Jamais connecté'}
                          </p>
                        </div>
                      ))}
                    </div>
                    <button className="btn-primary text-xs mt-2" onClick={() => router.push('/dashboard/outils')}>
                      Assigner →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Section Base de Données */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="text-primary">🗄️</span>
          Base de Données
        </h2>
        
        {/* Onglets */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-4">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'devices', label: '📱 Dispositifs', count: devices.length },
              { id: 'users', label: '👥 Utilisateurs', count: users.length },
              { id: 'patients', label: '🏥 Patients', count: patients.length },
              { id: 'firmwares', label: '💾 Firmwares', count: firmwares.length }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setDatabaseTab(tab.id)}
                className={`px-4 py-2 rounded-t-lg transition-colors ${
                  databaseTab === tab.id
                    ? 'bg-primary-500 text-white font-semibold'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        </div>

        {/* Contenu des tableaux */}
        <div className="overflow-x-auto">
          {databaseTab === 'devices' && (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4">ID</th>
                  <th className="text-left py-3 px-4">Nom</th>
                  <th className="text-left py-3 px-4">ICCID</th>
                  <th className="text-left py-3 px-4">Série</th>
                  <th className="text-left py-3 px-4">Patient</th>
                  <th className="text-left py-3 px-4">Statut</th>
                  <th className="text-left py-3 px-4">Firmware</th>
                  <th className="text-left py-3 px-4">Batterie</th>
                  <th className="text-left py-3 px-4">Débit</th>
                  <th className="text-left py-3 px-4">Dernière vue</th>
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="py-8 text-center text-gray-500">
                      Aucun dispositif trouvé
                    </td>
                  </tr>
                ) : (
                  devices.map((device) => (
                    <tr key={device.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="py-3 px-4">{device.id}</td>
                      <td className="py-3 px-4 font-medium">{device.device_name || '-'}</td>
                      <td className="py-3 px-4 text-sm font-mono">{device.sim_iccid || '-'}</td>
                      <td className="py-3 px-4 text-sm">{device.device_serial || '-'}</td>
                      <td className="py-3 px-4">
                        {device.patient_id ? (
                          <span className="text-sm">
                            {device.first_name || ''} {device.last_name || ''}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`badge ${
                          device.status === 'active' ? 'badge-success' :
                          device.status === 'inactive' ? 'bg-gray-100 text-gray-600' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {device.status || 'active'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm">{device.firmware_version || '-'}</td>
                      <td className="py-3 px-4">
                        {device.last_battery !== null ? (
                          <span className={device.last_battery < 20 ? 'text-red-600 font-semibold' : ''}>
                            {device.last_battery.toFixed(1)}%
                          </span>
                        ) : '-'}
                      </td>
                      <td className="py-3 px-4">
                        {device.last_flowrate !== null && device.last_flowrate !== undefined ? `${Number(device.last_flowrate).toFixed(2)} L/min` : '-'}
                      </td>
                      <td className="py-3 px-4 text-sm">{formatDate(device.last_seen)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {databaseTab === 'users' && (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4">ID</th>
                  <th className="text-left py-3 px-4">Nom</th>
                  <th className="text-left py-3 px-4">Email</th>
                  <th className="text-left py-3 px-4">Téléphone</th>
                  <th className="text-left py-3 px-4">Rôle</th>
                  <th className="text-left py-3 px-4">Statut</th>
                  <th className="text-left py-3 px-4">Dernière connexion</th>
                  <th className="text-left py-3 px-4">Créé le</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-8 text-center text-gray-500">
                      Aucun utilisateur trouvé
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="py-3 px-4">{user.id}</td>
                      <td className="py-3 px-4 font-medium">{user.first_name} {user.last_name}</td>
                      <td className="py-3 px-4">{user.email}</td>
                      <td className="py-3 px-4">{user.phone || '-'}</td>
                      <td className="py-3 px-4">
                        <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                          {user.role_name || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {user.is_active ? (
                          <span className="badge badge-success">✅ Actif</span>
                        ) : (
                          <span className="badge bg-gray-100 text-gray-600">❌ Inactif</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm">{formatDate(user.last_login)}</td>
                      <td className="py-3 px-4 text-sm">{formatDate(user.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {databaseTab === 'patients' && (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4">ID</th>
                  <th className="text-left py-3 px-4">Nom</th>
                  <th className="text-left py-3 px-4">Date de naissance</th>
                  <th className="text-left py-3 px-4">Téléphone</th>
                  <th className="text-left py-3 px-4">Email</th>
                  <th className="text-left py-3 px-4">Ville</th>
                  <th className="text-left py-3 px-4">Code postal</th>
                  <th className="text-left py-3 px-4">Créé le</th>
                </tr>
              </thead>
              <tbody>
                {patients.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-8 text-center text-gray-500">
                      Aucun patient trouvé
                    </td>
                  </tr>
                ) : (
                  patients.map((patient) => (
                    <tr key={patient.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="py-3 px-4">{patient.id}</td>
                      <td className="py-3 px-4 font-medium">{patient.first_name} {patient.last_name}</td>
                      <td className="py-3 px-4">{patient.birth_date || '-'}</td>
                      <td className="py-3 px-4">{patient.phone || '-'}</td>
                      <td className="py-3 px-4">{patient.email || '-'}</td>
                      <td className="py-3 px-4">{patient.city || '-'}</td>
                      <td className="py-3 px-4">{patient.postal_code || '-'}</td>
                      <td className="py-3 px-4 text-sm">{formatDate(patient.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {databaseTab === 'firmwares' && (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4">ID</th>
                  <th className="text-left py-3 px-4">Version</th>
                  <th className="text-left py-3 px-4">Chemin fichier</th>
                  <th className="text-left py-3 px-4">Taille</th>
                  <th className="text-left py-3 px-4">Stable</th>
                  <th className="text-left py-3 px-4">Statut</th>
                  <th className="text-left py-3 px-4">Batterie min</th>
                  <th className="text-left py-3 px-4">Créé le</th>
                </tr>
              </thead>
              <tbody>
                {firmwares.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-8 text-center text-gray-500">
                      Aucun firmware trouvé
                    </td>
                  </tr>
                ) : (
                  firmwares.map((fw) => (
                    <tr key={fw.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="py-3 px-4">{fw.id}</td>
                      <td className="py-3 px-4 font-medium font-mono">{fw.version}</td>
                      <td className="py-3 px-4 text-sm">{fw.file_path || '-'}</td>
                      <td className="py-3 px-4 text-sm">
                        {fw.file_size ? `${(fw.file_size / 1024).toFixed(2)} KB` : '-'}
                      </td>
                      <td className="py-3 px-4">
                        {fw.is_stable ? (
                          <span className="badge badge-success">✅ Stable</span>
                        ) : (
                          <span className="badge bg-gray-100 text-gray-600">❌ Beta</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`badge ${
                          fw.status === 'compiled' ? 'badge-success' :
                          fw.status === 'compiling' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                          fw.status === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                          'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                        }`}>
                          {fw.status || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4">{fw.min_battery_pct || '-'}%</td>
                      <td className="py-3 px-4 text-sm">{formatDate(fw.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

