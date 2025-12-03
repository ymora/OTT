'use client'

// Désactiver le pré-rendu statique
export const dynamic = 'force-dynamic'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useApiData, useAutoRefresh } from '@/hooks'
import { useUsb } from '@/contexts/UsbContext'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import StatsCard from '@/components/StatsCard'
import AlertCard from '@/components/AlertCard'
import logger from '@/lib/logger'

export default function DatabaseViewPage() {
  const { user, fetchWithAuth, API_URL } = useAuth()
  const router = useRouter()
  
  // Vérifier que l'utilisateur est admin
  useEffect(() => {
    if (user && user.role_name !== 'admin') {
      router.push('/dashboard')
    }
  }, [user, router])
  const { 
    isConnected,
    usbVirtualDevice,
    usbDeviceInfo, 
    usbStreamLastMeasurement,
    setSendMeasurementCallback,
    setUpdateDeviceFirmwareCallback
  } = useUsb()
  const [activeTab, setActiveTab] = useState('users')
  const [archivedDevices, setArchivedDevices] = useState([])
  const [loadingArchived, setLoadingArchived] = useState(false)

  // Charger toutes les données nécessaires
  const { data, loading, error, refetch } = useApiData(
    [
      '/api.php/users',
      '/api.php/roles',
      '/api.php/devices',
      '/api.php/patients',
      '/api.php/alerts',
      '/api.php/firmwares',
      '/api.php/audit?limit=100',
      '/api.php/permissions'
    ],
    { requiresAuth: true }
  )

  // Utiliser le hook useAutoRefresh pour le rafraîchissement automatique
  useAutoRefresh(refetch, 30000)
  
  // Configurer les callbacks USB pour enregistrer automatiquement les dispositifs dans la base
  useEffect(() => {
    if (!fetchWithAuth || !API_URL) {
      return
    }
    
    const sendMeasurement = async (measurementData) => {
      try {
        const response = await fetchWithAuth(
          `${API_URL}/api.php/devices/measurements`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(measurementData)
          },
          { requiresAuth: false }
        )
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Erreur HTTP ${response.status}`)
        }
        
        const result = await response.json()
        setTimeout(() => refetch(), 1000)
        return result
      } catch (err) {
        logger.error('❌ Erreur envoi mesure USB:', err)
        throw err
      }
    }
    
    const updateDevice = async (identifier, firmwareVersion, updateData = {}) => {
      try {
        const devicesResponse = await fetchWithAuth(
          `${API_URL}/api.php/devices`,
          { method: 'GET' },
          { requiresAuth: true }
        )
        
        if (!devicesResponse.ok) return
        
        const devicesData = await devicesResponse.json()
        const devices = devicesData.devices || []
        
        const device = devices.find(d => 
          d.sim_iccid === identifier || 
          d.device_serial === identifier ||
          d.device_name === identifier
        )
        
        // ✨ AUTO-CRÉATION: Si le dispositif n'existe pas, le créer automatiquement
        if (!device) {
          logger.log(`🆕 [AUTO-CREATE] Dispositif non trouvé (${identifier}), création automatique...`)
          
          const createPayload = {
            device_name: updateData.device_name || `USB-${identifier.slice(-4)}`,
            sim_iccid: updateData.sim_iccid || (identifier.startsWith('89') ? identifier : null),
            device_serial: updateData.device_serial || (!identifier.startsWith('89') ? identifier : null),
            firmware_version: firmwareVersion || null,
            status: updateData.status || 'usb_connected',
            last_seen: updateData.last_seen || new Date().toISOString()
          }
          
          if (updateData.last_battery !== undefined) createPayload.last_battery = updateData.last_battery
          if (updateData.last_flowrate !== undefined) createPayload.last_flowrate = updateData.last_flowrate
          if (updateData.last_rssi !== undefined) createPayload.last_rssi = updateData.last_rssi
          
          const createResponse = await fetchWithAuth(
            `${API_URL}/api.php/devices`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(createPayload)
            },
            { requiresAuth: true }
          )
          
          if (createResponse.ok) {
            logger.log('✅ [AUTO-CREATE] Dispositif créé avec succès')
            setTimeout(() => refetch(), 1000)
          }
          return
        }
        
        // MISE À JOUR: Le dispositif existe
        const updatePayload = { ...updateData }
        if (firmwareVersion && firmwareVersion !== '') {
          updatePayload.firmware_version = firmwareVersion
        }
        
        const response = await fetchWithAuth(
          `${API_URL}/api.php/devices/${device.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload)
          },
          { requiresAuth: true }
        )
        
        if (response.ok) {
          logger.log(`✅ [AUTO-UPDATE] Dispositif ${device.id} mis à jour`)
          setTimeout(() => refetch(), 1000)
        }
      } catch (err) {
        // Ignorer silencieusement
      }
    }
    
    setSendMeasurementCallback(sendMeasurement)
    setUpdateDeviceFirmwareCallback(updateDevice)
    
    return () => {
      setSendMeasurementCallback(null)
      setUpdateDeviceFirmwareCallback(null)
    }
  }, [fetchWithAuth, API_URL, setSendMeasurementCallback, setUpdateDeviceFirmwareCallback])
  // NE PAS ajouter devices ou refetch dans les dépendances

  // Extraire les données exactement comme dans users/page.js et patients/page.js
  const users = data?.users?.users || []
  const roles = data?.roles?.roles || []
  const devices = data?.devices?.devices || []
  const patients = data?.patients?.patients || []
  const alerts = data?.alerts?.alerts || []
  const firmwares = data?.firmwares?.firmwares || []
  const auditLogs = data?.audit?.logs || []
  const permissions = data?.permissions?.permissions || []

  // Calculer les statistiques comme dans la vue d'ensemble
  const unresolvedAlerts = useMemo(() => {
    return alerts.filter(a => a.status === 'unresolved')
  }, [alerts])

  const stats = useMemo(() => {
    // Compter les dispositifs en ligne depuis la base de données (last_seen < 2h)
    const onlineFromDb = devices.filter(d => {
      if (!d.last_seen) return false
      const lastSeen = new Date(d.last_seen)
      if (isNaN(lastSeen.getTime())) return false
      const hoursSince = (new Date() - lastSeen) / (1000 * 60 * 60)
      return hoursSince < 2
    })
    
    // Vérifier si un dispositif USB est connecté et n'est pas déjà compté
    const usbDeviceOnline = isConnected && usbDeviceInfo && (
      usbDeviceInfo.sim_iccid || usbDeviceInfo.device_serial
    )
    
    let usbDeviceAlreadyCounted = false
    if (usbDeviceOnline) {
      usbDeviceAlreadyCounted = onlineFromDb.some(d => 
        (usbDeviceInfo.sim_iccid && d.sim_iccid === usbDeviceInfo.sim_iccid) ||
        (usbDeviceInfo.device_serial && d.device_serial === usbDeviceInfo.device_serial)
      )
    }
    
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
      totalUsers: users.length,
      activeUsers: users.filter(u => u.is_active).length,
      totalDevices,
      activeDevices,
      totalPatients: patients.length,
      totalAlerts: alerts.length,
      unresolvedAlerts: unresolvedAlerts.length,
      criticalAlerts: unresolvedAlerts.filter(a => a.severity === 'critical').length,
      lowBatteryDevices,
      okBatteryDevices,
      totalFirmwares: firmwares.length,
      totalAuditLogs: auditLogs.length
    }
  }, [devices, users, patients, alerts, unresolvedAlerts, firmwares, auditLogs, isConnected, usbDeviceInfo, usbStreamLastMeasurement])

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

  const criticalItems = useMemo(() => 
    unresolvedAlerts.filter(a => a.severity === 'critical' || a.severity === 'high'),
    [unresolvedAlerts]
  )
  
  const lowBatteryListDisplay = useMemo(() => 
    lowBatteryList.slice(0, 5),
    [lowBatteryList]
  )

  const tabs = [
    { id: 'users', label: '👥 Utilisateurs', count: stats.totalUsers },
    { id: 'devices', label: '📱 Dispositifs Actifs', count: stats.totalDevices },
    { id: 'archived', label: '🗄️ Dispositifs Archivés', count: 0 },
    { id: 'patients', label: '🏥 Patients', count: stats.totalPatients },
    { id: 'roles', label: '🔐 Rôles & Permissions', count: roles.length },
    { id: 'alerts', label: '⚠️ Alertes', count: stats.totalAlerts },
    { id: 'firmwares', label: '💾 Firmwares', count: stats.totalFirmwares },
    { id: 'usb_logs', label: '🔌 Logs USB', count: 0 },
    { id: 'audit', label: '📜 Historique Actions', count: stats.totalAuditLogs }
  ]

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const renderUsersTable = () => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="text-left py-3 px-4">ID</th>
            <th className="text-left py-3 px-4">Nom</th>
            <th className="text-left py-3 px-4">Email</th>
            <th className="text-left py-3 px-4">Téléphone</th>
            <th className="text-left py-3 px-4">Rôle</th>
            <th className="text-left py-3 px-4">Permissions</th>
            <th className="text-left py-3 px-4">Statut</th>
            <th className="text-left py-3 px-4">Dernière connexion</th>
            <th className="text-left py-3 px-4">Créé le</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan="9" className="py-8 text-center text-gray-500">
                <LoadingSpinner size="sm" text="Chargement des utilisateurs..." />
              </td>
            </tr>
          ) : users.length === 0 ? (
            <tr>
              <td colSpan="9" className="py-8 text-center text-gray-500">
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
                    {user.role_name}
                  </span>
                </td>
                <td className="py-3 px-4 text-sm">
                  {user.permissions ? (
                    <div className="flex flex-wrap gap-1">
                      {user.permissions.split(',').filter(p => p).slice(0, 3).map((perm, i) => (
                        <span key={i} className="badge bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-xs">
                          {perm}
                        </span>
                      ))}
                      {user.permissions.split(',').filter(p => p).length > 3 && (
                        <span className="text-xs text-gray-500">+{user.permissions.split(',').filter(p => p).length - 3}</span>
                      )}
                    </div>
                  ) : '-'}
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
    </div>
  )

  const renderDevicesTable = () => (
    <div className="overflow-x-auto">
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
          {loading ? (
            <tr>
              <td colSpan="10" className="py-8 text-center text-gray-500">
                <LoadingSpinner size="sm" text="Chargement des dispositifs..." />
              </td>
            </tr>
          ) : devices.length === 0 ? (
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
    </div>
  )

  const renderPatientsTable = () => (
    <div className="overflow-x-auto">
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
          {loading ? (
            <tr>
              <td colSpan="8" className="py-8 text-center text-gray-500">
                <LoadingSpinner size="sm" text="Chargement des patients..." />
              </td>
            </tr>
          ) : patients.length === 0 ? (
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
    </div>
  )

  const renderRolesTable = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Rôles</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4">ID</th>
                <th className="text-left py-3 px-4">Nom</th>
                <th className="text-left py-3 px-4">Description</th>
                <th className="text-left py-3 px-4">Permissions</th>
                <th className="text-left py-3 px-4">Créé le</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-gray-500">
                    <LoadingSpinner size="sm" text="Chargement des rôles..." />
                  </td>
                </tr>
              ) : roles.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-gray-500">
                    Aucun rôle trouvé
                  </td>
                </tr>
              ) : (
                roles.map((role) => (
                  <tr key={role.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="py-3 px-4">{role.id}</td>
                    <td className="py-3 px-4 font-medium">
                      <span className="badge bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                        {role.name}
                      </span>
                    </td>
                    <td className="py-3 px-4">{role.description || '-'}</td>
                    <td className="py-3 px-4">
                      {role.permissions ? (
                        <div className="flex flex-wrap gap-1">
                          {role.permissions.split(',').filter(p => p).map((perm, i) => (
                            <span key={i} className="badge bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-xs">
                              {perm}
                            </span>
                          ))}
                        </div>
                      ) : '-'}
                    </td>
                    <td className="py-3 px-4 text-sm">{formatDate(role.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Permissions</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4">ID</th>
                <th className="text-left py-3 px-4">Code</th>
                <th className="text-left py-3 px-4">Description</th>
                <th className="text-left py-3 px-4">Catégorie</th>
                <th className="text-left py-3 px-4">Créé le</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-gray-500">
                    <LoadingSpinner size="sm" text="Chargement des permissions..." />
                  </td>
                </tr>
              ) : permissions.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-gray-500">
                    Aucune permission trouvée
                  </td>
                </tr>
              ) : (
                permissions.map((perm) => (
                  <tr key={perm.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="py-3 px-4">{perm.id}</td>
                    <td className="py-3 px-4 font-mono text-sm">{perm.code}</td>
                    <td className="py-3 px-4">{perm.description || '-'}</td>
                    <td className="py-3 px-4">
                      <span className="badge bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                        {perm.category || '-'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm">{formatDate(perm.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )

  const renderAlertsTable = () => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="text-left py-3 px-4">ID</th>
            <th className="text-left py-3 px-4">Dispositif</th>
            <th className="text-left py-3 px-4">Type</th>
            <th className="text-left py-3 px-4">Sévérité</th>
            <th className="text-left py-3 px-4">Message</th>
            <th className="text-left py-3 px-4">Statut</th>
            <th className="text-left py-3 px-4">Créée le</th>
            <th className="text-left py-3 px-4">Résolue le</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan="8" className="py-8 text-center text-gray-500">
                <LoadingSpinner size="sm" text="Chargement des alertes..." />
              </td>
            </tr>
          ) : alerts.length === 0 ? (
            <tr>
              <td colSpan="8" className="py-8 text-center text-gray-500">
                Aucune alerte trouvée
              </td>
            </tr>
          ) : (
            alerts.map((alert) => (
              <tr key={alert.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="py-3 px-4 font-mono text-sm">{alert.id}</td>
                <td className="py-3 px-4">{alert.device_name || `Device #${alert.device_id}`}</td>
                <td className="py-3 px-4">
                  <span className="badge bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                    {alert.type || '-'}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span className={`badge ${
                    alert.severity === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                    alert.severity === 'high' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
                    alert.severity === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                    'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  }`}>
                    {alert.severity || '-'}
                  </span>
                </td>
                <td className="py-3 px-4">{alert.message || '-'}</td>
                <td className="py-3 px-4">
                  <span className={`badge ${
                    alert.status === 'resolved' ? 'badge-success' :
                    alert.status === 'acknowledged' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                  }`}>
                    {alert.status || 'unresolved'}
                  </span>
                </td>
                <td className="py-3 px-4 text-sm">{formatDate(alert.created_at)}</td>
                <td className="py-3 px-4 text-sm">{formatDate(alert.resolved_at)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )

  const renderFirmwaresTable = () => (
    <div className="overflow-x-auto">
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
          {loading ? (
            <tr>
              <td colSpan="8" className="py-8 text-center text-gray-500">
                <LoadingSpinner size="sm" text="Chargement des firmwares..." />
              </td>
            </tr>
          ) : firmwares.length === 0 ? (
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
    </div>
  )

  // Charger les dispositifs archivés quand on affiche l'onglet
  useEffect(() => {
    const loadArchived = async () => {
      if (activeTab !== 'archived') return
      
      setLoadingArchived(true)
      try {
        const response = await fetchWithAuth(
          `${API_URL}/api.php/admin/database-view`,
          { method: 'GET' },
          { requiresAuth: true }
        )
        
        if (response.ok) {
          const data = await response.json()
          const archived = data.data?.tables
            ?.find(t => t.name === 'devices')
            ?.sample?.filter(d => d.deleted_at !== null) || []
          setArchivedDevices(archived)
        }
      } catch (err) {
        logger.error('Erreur chargement dispositifs archivés:', err)
      } finally {
        setLoadingArchived(false)
      }
    }
    
    loadArchived()
  }, [activeTab, fetchWithAuth, API_URL])
  
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

  const renderArchivedDevicesTable = () => {
    return (
      <div className="space-y-4">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            🗄️ Ces dispositifs ont été supprimés (soft delete) mais restent en base pour la traçabilité médicale.
          </p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4">ID</th>
                <th className="text-left py-3 px-4">Nom</th>
                <th className="text-left py-3 px-4">ICCID</th>
                <th className="text-left py-3 px-4">Serial</th>
                <th className="text-left py-3 px-4">Supprimé le</th>
                <th className="text-left py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingArchived ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center">
                    <LoadingSpinner size="sm" />
                  </td>
                </tr>
              ) : archivedDevices.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-gray-500">
                    ✅ Aucun dispositif archivé
                  </td>
                </tr>
              ) : (
                archivedDevices.map((device) => (
                  <tr key={device.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="py-3 px-4">{device.id}</td>
                    <td className="py-3 px-4 font-medium">{device.device_name || '-'}</td>
                    <td className="py-3 px-4 font-mono text-sm">{device.sim_iccid || '-'}</td>
                    <td className="py-3 px-4 text-sm">{device.device_serial || '-'}</td>
                    <td className="py-3 px-4 text-sm">{formatDate(device.deleted_at)}</td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => restoreDevice(device.id)}
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

  const renderAuditTable = () => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="text-left py-3 px-4">ID</th>
            <th className="text-left py-3 px-4">Utilisateur</th>
            <th className="text-left py-3 px-4">Action</th>
            <th className="text-left py-3 px-4">Type entité</th>
            <th className="text-left py-3 px-4">ID entité</th>
            <th className="text-left py-3 px-4">IP</th>
            <th className="text-left py-3 px-4">Date</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan="7" className="py-8 text-center text-gray-500">
                <LoadingSpinner size="sm" text="Chargement des logs d'audit..." />
              </td>
            </tr>
          ) : auditLogs.length === 0 ? (
            <tr>
              <td colSpan="7" className="py-8 text-center text-gray-500">
                Aucun log d&apos;audit trouvé
              </td>
            </tr>
          ) : (
            auditLogs.map((log) => (
              <tr key={log.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="py-3 px-4">{log.id}</td>
                <td className="py-3 px-4">
                  {log.user_email ? (
                    <span className="text-sm">{log.user_email}</span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-mono text-xs">
                    {log.action || '-'}
                  </span>
                </td>
                <td className="py-3 px-4">{log.entity_type || '-'}</td>
                <td className="py-3 px-4 font-mono text-sm">{log.entity_id || '-'}</td>
                <td className="py-3 px-4 font-mono text-xs">{log.ip_address || '-'}</td>
                <td className="py-3 px-4 text-sm">{formatDate(log.created_at)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )

  const renderUsbLogsTable = () => (
    <div className="overflow-x-auto">
      <div className="alert alert-info mb-4">
        <strong>ℹ️ Logs USB Streaming</strong><br />
        Les logs USB sont automatiquement streamés en temps réel dans l'onglet <strong>Dispositifs OTT</strong>.
        Cette table stocke l'historique des 7 derniers jours pour audit et debugging.
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="text-left py-3 px-4">ID</th>
            <th className="text-left py-3 px-4">ICCID / Serial</th>
            <th className="text-left py-3 px-4">Ligne de log</th>
            <th className="text-left py-3 px-4">Date</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan="4" className="py-8 text-center text-gray-500">
              <p className="mb-2">📊 Consultez les logs USB en temps réel dans l'onglet <strong>Dispositifs OTT</strong></p>
              <p className="text-sm text-gray-400">Table usb_logs disponible pour requêtes SQL personnalisées</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )

  const renderContent = () => {
    switch (activeTab) {
      case 'users':
        return renderUsersTable()
      case 'devices':
        return renderDevicesTable()
      case 'patients':
        return renderPatientsTable()
      case 'roles':
        return renderRolesTable()
      case 'alerts':
        return renderAlertsTable()
      case 'firmwares':
        return renderFirmwaresTable()
      case 'usb_logs':
        return renderUsbLogsTable()
      case 'archived':
        return renderArchivedDevicesTable()
      case 'audit':
        return renderAuditTable()
      default:
        return renderUsersTable()
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          🗄️ Base de Données
        </h1>
      </div>

      {/* Onglets */}
      <div className="card">
        <div className="border-b border-gray-200 dark:border-gray-700 mb-4">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-t-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-500 text-white font-semibold'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        </div>

        <ErrorMessage error={error} onRetry={refetch} />
        {renderContent()}
      </div>
    </div>
  )
}

