'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'

export default function OTAPage() {
  const { fetchWithAuth, API_URL } = useAuth()
  const [firmwares, setFirmwares] = useState([])
  const [devices, setDevices] = useState([])
  const [selectedFirmware, setSelectedFirmware] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [deploying, setDeploying] = useState({})

  const loadData = useCallback(async () => {
    try {
      setError(null)
      const [firmwaresData, devicesData] = await Promise.all([
        fetchJson(fetchWithAuth, API_URL, '/api.php/firmwares', {}, { requiresAuth: true }),
        fetchJson(fetchWithAuth, API_URL, '/api.php/devices', {}, { requiresAuth: true })
      ])
      setFirmwares(firmwaresData.firmwares || [])
      setDevices(devicesData.devices || [])
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [API_URL, fetchWithAuth])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filtrer les dispositifs qui n'ont PAS le firmware sélectionné
  const devicesToUpdate = useMemo(() => {
    if (!selectedFirmware) return []
    
    return devices.filter(device => {
      const deviceFirmware = device.firmware_version || '0.0.0'
      return deviceFirmware !== selectedFirmware.version
    })
  }, [devices, selectedFirmware])

  const triggerOTA = async (deviceId, version) => {
    try {
      setMessage(null)
      setError(null)
      setDeploying(prev => ({ ...prev, [deviceId]: true }))
      
      await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/devices/${deviceId}/ota`,
        {
          method: 'POST',
          body: JSON.stringify({ firmware_version: version })
        },
        { requiresAuth: true }
      )
      
      setMessage(`✅ OTA v${version} programmé pour le dispositif`)
      
      // Recharger les données pour mettre à jour les versions
      await loadData()
    } catch (err) {
      setError(err.message || 'Erreur lors du déploiement')
    } finally {
      setDeploying(prev => {
        const next = { ...prev }
        delete next[deviceId]
        return next
      })
    }
  }

  const deployToAll = async () => {
    if (!selectedFirmware || devicesToUpdate.length === 0) return

    const confirmMessage = `⚠️ ATTENTION : Déploiement massif OTA\n\n` +
      `Firmware: v${selectedFirmware.version}\n` +
      `Dispositifs concernés: ${devicesToUpdate.length}\n\n` +
      `Cette opération va déployer le firmware sur TOUS les dispositifs listés.\n` +
      `Cela peut planter les dispositifs si le firmware est incompatible.\n\n` +
      `Êtes-vous sûr de vouloir continuer ?`

    if (!confirm(confirmMessage)) return

    setMessage(null)
    setError(null)
    const allDeviceIds = devicesToUpdate.map(d => d.id)
    
    // Marquer tous comme en cours de déploiement
    const deployingState = {}
    allDeviceIds.forEach(id => { deployingState[id] = true })
    setDeploying(deployingState)

    let successCount = 0
    let errorCount = 0

    try {
      // Déployer sur tous les dispositifs en parallèle
      const promises = allDeviceIds.map(async (deviceId) => {
        try {
          await fetchJson(
            fetchWithAuth,
            API_URL,
            `/api.php/devices/${deviceId}/ota`,
            {
              method: 'POST',
              body: JSON.stringify({ firmware_version: selectedFirmware.version })
            },
            { requiresAuth: true }
          )
          successCount++
        } catch (err) {
          errorCount++
          console.error(`Erreur OTA pour dispositif ${deviceId}:`, err)
        }
      })

      await Promise.all(promises)

      if (errorCount === 0) {
        setMessage(`✅ OTA v${selectedFirmware.version} programmé avec succès sur ${successCount} dispositif(s)`)
      } else {
        setError(`⚠️ Déploiement partiel : ${successCount} succès, ${errorCount} erreur(s)`)
      }

      // Recharger les données
      await loadData()
    } catch (err) {
      setError(`Erreur lors du déploiement massif: ${err.message}`)
    } finally {
      // Réinitialiser l'état de déploiement
      setDeploying({})
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">🔄 Gestion OTA</h1>
        <p className="text-gray-600 mt-1">Déploiement de firmwares sur les dispositifs</p>
      </div>

      {(error || message) && (
        <div className={`alert ${error ? 'alert-warning' : 'alert-success'}`}>
          {error ? `❌ Erreur : ${error}` : message}
        </div>
      )}

      {/* Firmwares */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">📦 Firmwares Disponibles</h2>
        </div>

        {loading ? (
          <div className="animate-shimmer h-48"></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Version</th>
                  <th className="text-left py-3 px-4">Taille</th>
                  <th className="text-left py-3 px-4">Stable</th>
                  <th className="text-left py-3 px-4">Date</th>
                  <th className="text-left py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {firmwares.map((fw, i) => (
                  <tr 
                    key={fw.id} 
                    className={`border-b hover:bg-gray-50 transition-all cursor-pointer ${
                      selectedFirmware?.id === fw.id ? 'bg-primary-50 border-primary-200' : ''
                    }`}
                    onClick={() => setSelectedFirmware(fw)}
                    style={{animationDelay: `${i * 0.05}s`}}
                  >
                    <td className="py-3 px-4 font-mono font-bold">v{fw.version}</td>
                    <td className="py-3 px-4">{(fw.file_size / 1024).toFixed(0)} Ko</td>
                    <td className="py-3 px-4">
                      {fw.is_stable ? (
                        <span className="badge badge-success">✅ Stable</span>
                      ) : (
                        <span className="badge badge-warning">⚠️ Beta</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {new Date(fw.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="py-3 px-4">
                      {selectedFirmware?.id === fw.id ? (
                        <span className="badge badge-success">✓ Sélectionné</span>
                      ) : (
                        <span className="text-sm text-gray-500">Cliquer pour sélectionner</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Liste des dispositifs à mettre à jour */}
      {selectedFirmware && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">
                📱 Dispositifs à mettre à jour vers v{selectedFirmware.version}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {devicesToUpdate.length} dispositif(s) n&apos;ont pas ce firmware
              </p>
            </div>
            {devicesToUpdate.length > 1 && (
              <button
                onClick={deployToAll}
                disabled={Object.keys(deploying).length > 0}
                className="btn-primary text-sm"
                title="Déployer le firmware sur tous les dispositifs listés"
              >
                {Object.keys(deploying).length > 0 ? '⏳ Déploiement en cours...' : '🚀 Déployer sur tous'}
              </button>
            )}
          </div>

          {devicesToUpdate.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="text-lg mb-2">✅ Tous les dispositifs ont déjà ce firmware</p>
              <p className="text-sm">Aucun déploiement nécessaire</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4">Dispositif</th>
                    <th className="text-left py-3 px-4">ICCID</th>
                    <th className="text-left py-3 px-4">Firmware actuel</th>
                    <th className="text-left py-3 px-4">Patient</th>
                    <th className="text-left py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {devicesToUpdate.map((device, i) => (
                    <tr 
                      key={device.id} 
                      className="border-b hover:bg-gray-50 animate-slide-up"
                      style={{animationDelay: `${i * 0.03}s`}}
                    >
                      <td className="py-3 px-4 font-medium">
                        {device.device_name || `Dispositif #${device.id}`}
                      </td>
                      <td className="py-3 px-4 font-mono text-sm text-gray-600">
                        {device.sim_iccid || '-'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="badge badge-warning">
                          v{device.firmware_version || 'N/A'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {device.first_name && device.last_name ? (
                          <span>{device.first_name} {device.last_name}</span>
                        ) : (
                          <span className="text-gray-400">Non assigné</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => triggerOTA(device.id, selectedFirmware.version)}
                          disabled={deploying[device.id]}
                          className="btn-primary text-sm"
                        >
                          {deploying[device.id] ? '⏳ Déploiement...' : '🚀 Déployer'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!selectedFirmware && (
        <div className="card bg-gray-50 border-dashed">
          <div className="text-center py-8 text-gray-500">
            <p className="text-lg mb-2">👆 Sélectionnez un firmware ci-dessus</p>
            <p className="text-sm">La liste des dispositifs à mettre à jour s&apos;affichera ici</p>
          </div>
        </div>
      )}
    </div>
  )
}

