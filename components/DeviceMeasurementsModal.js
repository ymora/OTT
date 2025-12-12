'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import ConfirmModal from '@/components/ConfirmModal'
import logger from '@/lib/logger'
import Modal from '@/components/Modal'

/**
 * Modal pour afficher l'historique des mesures d'un dispositif
 */
export default function DeviceMeasurementsModal({ isOpen, onClose, device }) {
  const { fetchWithAuth, API_URL, user } = useAuth()
  const [measurements, setMeasurements] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showArchived, setShowArchived] = useState(false)
  const [deletingMeasurement, setDeletingMeasurement] = useState(null)
  const [archivingMeasurement, setArchivingMeasurement] = useState(null)
  const [restoringMeasurement, setRestoringMeasurement] = useState(null)
  const [selectedMeasurements, setSelectedMeasurements] = useState(new Set())
  const [deletingMultiple, setDeletingMultiple] = useState(false)
  const [archivingMultiple, setArchivingMultiple] = useState(false)
  
  // États pour les modals de confirmation
  const [confirmArchiveModal, setConfirmArchiveModal] = useState({ isOpen: false, measurementId: null })
  const [confirmDeleteModal, setConfirmDeleteModal] = useState({ isOpen: false, measurementId: null })
  const [confirmRestoreModal, setConfirmRestoreModal] = useState({ isOpen: false, measurementId: null })
  const [confirmDeleteMultipleModal, setConfirmDeleteMultipleModal] = useState(false)

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
        logger.debug(`✅ ${data.measurements.length} mesures chargées pour dispositif ${device.id}`)
        if (data.measurements.length === 0) {
          logger.warn(`⚠️ Aucune mesure trouvée pour dispositif ${device.id} (${device.device_name || device.sim_iccid})`)
        }
      } else {
        const errorMsg = data.error || 'Impossible de charger les mesures'
        logger.error(`❌ Erreur API: ${errorMsg}`)
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

  useEffect(() => {
    if (isOpen && device?.id) {
      loadMeasurements()
    } else {
      setMeasurements([])
      setError(null)
      setSelectedMeasurements(new Set()) // Réinitialiser la sélection quand le modal se ferme
    }
  }, [isOpen, device?.id, loadMeasurements])

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    try {
      const date = new Date(dateString)
      return date.toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    } catch {
      return dateString
    }
  }

  const handleArchiveMeasurement = async (measurementId) => {
    setConfirmArchiveModal({ isOpen: true, measurementId })
  }

  const confirmArchiveMeasurement = async () => {
    const { measurementId } = confirmArchiveModal
    if (!measurementId) return
    
    setConfirmArchiveModal({ isOpen: false, measurementId: null })
    setArchivingMeasurement(measurementId)
    setError(null)

    try {
      const data = await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/measurements/${measurementId}?archive=true`,
        { method: 'DELETE' },
        { requiresAuth: true }
      )

      if (data.success) {
        // Retirer la mesure de la liste
        setMeasurements(prev => prev.filter(m => m.id !== measurementId))
        logger.log(`✅ Mesure ${measurementId} archivée`)
      } else {
        const errorMsg = data.error || 'Erreur lors de l\'archivage'
        logger.error(`❌ Erreur archivage mesure: ${errorMsg}`)
        setError(errorMsg)
      }
    } catch (err) {
      logger.error('Erreur archivage mesure:', err)
      setError(err.message || 'Erreur lors de l\'archivage de la mesure')
    } finally {
      setArchivingMeasurement(null)
    }
  }

  const handleDeleteMeasurement = async (measurementId) => {
    setConfirmDeleteModal({ isOpen: true, measurementId })
  }

  const confirmDeleteMeasurement = async () => {
    const { measurementId } = confirmDeleteModal
    if (!measurementId) return
    
    setConfirmDeleteModal({ isOpen: false, measurementId: null })
    setDeletingMeasurement(measurementId)
    setError(null)

    try {
      const data = await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/measurements/${measurementId}?permanent=true`,
        { method: 'DELETE' },
        { requiresAuth: true }
      )

      if (data.success) {
        // Retirer la mesure de la liste
        setMeasurements(prev => prev.filter(m => m.id !== measurementId))
        logger.log(`✅ Mesure ${measurementId} supprimée définitivement`)
      } else {
        const errorMsg = data.error || 'Erreur lors de la suppression'
        logger.error(`❌ Erreur suppression mesure: ${errorMsg}`)
        setError(errorMsg)
      }
    } catch (err) {
      logger.error('Erreur suppression mesure:', err)
      setError(err.message || 'Erreur lors de la suppression de la mesure')
    } finally {
      setDeletingMeasurement(null)
    }
  }

  const handleRestoreMeasurement = async (measurementId) => {
    setConfirmRestoreModal({ isOpen: true, measurementId })
  }

  const confirmRestoreMeasurement = async () => {
    const { measurementId } = confirmRestoreModal
    if (!measurementId) return
    
    setConfirmRestoreModal({ isOpen: false, measurementId: null })
    setRestoringMeasurement(measurementId)
    setError(null)

    try {
      const data = await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/measurements/${measurementId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ deleted_at: null })
        },
        { requiresAuth: true }
      )

      if (data.success) {
        // Recharger les mesures
        await loadMeasurements()
        logger.log(`✅ Mesure ${measurementId} restaurée`)
      } else {
        const errorMsg = data.error || 'Erreur lors de la restauration'
        logger.error(`❌ Erreur restauration mesure: ${errorMsg}`)
        setError(errorMsg)
      }
    } catch (err) {
      logger.error('Erreur restauration mesure:', err)
      setError(err.message || 'Erreur lors de la restauration de la mesure')
    } finally {
      setRestoringMeasurement(null)
    }
  }

  // Vérifier si l'utilisateur est admin (support de plusieurs formats de rôle)
  const isAdmin = user?.role_name === 'admin' || user?.role === 'admin' || user?.roles?.includes('admin')
  
  // Debug: logger le rôle pour diagnostiquer
  useEffect(() => {
    if (isOpen) {
      logger.debug(`[DeviceMeasurementsModal] User role check:`, {
        user: user,
        role_name: user?.role_name,
        role: user?.role,
        roles: user?.roles,
        isAdmin: isAdmin
      })
      // Log dans la console pour debug
      console.log('[DeviceMeasurementsModal] User:', user, 'isAdmin:', isAdmin)
    }
  }, [isOpen, user, isAdmin])
  
  // Fonction pour gérer la sélection/désélection d'une mesure
  const toggleMeasurementSelection = (measurementId) => {
    setSelectedMeasurements(prev => {
      const newSet = new Set(prev)
      if (newSet.has(measurementId)) {
        newSet.delete(measurementId)
      } else {
        newSet.add(measurementId)
      }
      return newSet
    })
  }
  
  // Fonction pour sélectionner/désélectionner toutes les mesures
  const toggleSelectAll = () => {
    if (selectedMeasurements.size === measurements.length) {
      setSelectedMeasurements(new Set())
    } else {
      setSelectedMeasurements(new Set(measurements.map(m => m.id)))
    }
  }
  
  // Fonction pour supprimer plusieurs mesures
  const handleDeleteMultiple = async () => {
    if (selectedMeasurements.size === 0) return
    setConfirmDeleteMultipleModal(true)
  }

  const confirmDeleteMultiple = async () => {
    setConfirmDeleteMultipleModal(false)
    setDeletingMultiple(true)
    setError(null)

    try {
      const measurementIds = Array.from(selectedMeasurements)
      let successCount = 0
      let errorCount = 0

      // Supprimer les mesures une par une
      for (const measurementId of measurementIds) {
        try {
          const data = await fetchJson(
            fetchWithAuth,
            API_URL,
            `/api.php/measurements/${measurementId}`,
            { method: 'DELETE' },
            { requiresAuth: true }
          )

          if (data.success) {
            successCount++
          } else {
            errorCount++
          }
        } catch (err) {
          logger.error(`Erreur suppression mesure ${measurementId}:`, err)
          errorCount++
        }
      }

      if (successCount > 0) {
        // Retirer les mesures supprimées de la liste
        setMeasurements(prev => prev.filter(m => !selectedMeasurements.has(m.id)))
        setSelectedMeasurements(new Set())
        logger.log(`✅ ${successCount} mesure${successCount > 1 ? 's' : ''} supprimée${successCount > 1 ? 's' : ''} définitivement`)
        
        if (errorCount > 0) {
          setError(`${successCount} mesure${successCount > 1 ? 's' : ''} supprimée${successCount > 1 ? 's' : ''}, ${errorCount} erreur${errorCount > 1 ? 's' : ''}`)
        }
      } else {
        setError(`Erreur lors de la suppression de ${errorCount} mesure${errorCount > 1 ? 's' : ''}`)
      }
    } catch (err) {
      logger.error('Erreur suppression multiple:', err)
      setError(err.message || 'Erreur lors de la suppression multiple')
    } finally {
      setDeletingMultiple(false)
    }
  }

  // Calculer les statistiques
  const stats = measurements.length > 0 ? {
    flowrate: {
      avg: measurements.reduce((sum, m) => sum + (Number(m.flowrate) || 0), 0) / measurements.length,
      min: Math.min(...measurements.map(m => Number(m.flowrate) || 0)),
      max: Math.max(...measurements.map(m => Number(m.flowrate) || 0))
    },
    battery: {
      avg: measurements.filter(m => m.battery != null).length > 0 
        ? measurements.filter(m => m.battery != null).reduce((sum, m) => sum + Number(m.battery), 0) / measurements.filter(m => m.battery != null).length
        : null,
      min: measurements.filter(m => m.battery != null).length > 0
        ? Math.min(...measurements.filter(m => m.battery != null).map(m => Number(m.battery)))
        : null,
      max: measurements.filter(m => m.battery != null).length > 0
        ? Math.max(...measurements.filter(m => m.battery != null).map(m => Number(m.battery)))
        : null
    },
    rssi: {
      avg: measurements.filter(m => m.signal_strength != null && m.signal_strength !== -999).length > 0
        ? measurements.filter(m => m.signal_strength != null && m.signal_strength !== -999).reduce((sum, m) => sum + Number(m.signal_strength), 0) / measurements.filter(m => m.signal_strength != null && m.signal_strength !== -999).length
        : null,
      min: measurements.filter(m => m.signal_strength != null && m.signal_strength !== -999).length > 0
        ? Math.min(...measurements.filter(m => m.signal_strength != null && m.signal_strength !== -999).map(m => Number(m.signal_strength)))
        : null,
      max: measurements.filter(m => m.signal_strength != null && m.signal_strength !== -999).length > 0
        ? Math.max(...measurements.filter(m => m.signal_strength != null && m.signal_strength !== -999).map(m => Number(m.signal_strength)))
        : null
    }
  } : null

  // Fonction pour exporter en CSV
  const handleExportCSV = () => {
    if (measurements.length === 0) return

    const headers = ['Date & Heure', 'Débit (L/min)', 'Batterie (%)', 'RSSI (dBm)', 'Latitude', 'Longitude', 'Statut']
    const rows = measurements.map(m => [
      formatDate(m.timestamp),
      m.flowrate !== null && m.flowrate !== undefined ? Number(m.flowrate).toFixed(2) : '',
      m.battery !== null && m.battery !== undefined ? Number(m.battery).toFixed(1) : '',
      m.signal_strength !== null && m.signal_strength !== undefined && m.signal_strength !== -999 ? m.signal_strength : '',
      m.latitude != null && m.latitude !== 0 ? Number(m.latitude).toFixed(4) : '',
      m.longitude != null && m.longitude !== 0 ? Number(m.longitude).toFixed(4) : '',
      m.device_status || ''
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `mesures_${device?.device_name || device?.sim_iccid || 'dispositif'}_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={device ? `📊 Historique des mesures - ${device.device_name || device.sim_iccid || 'Dispositif'}` : 'Historique des mesures'}
      maxWidth="max-w-6xl"
    >
      <div className="space-y-4">
        {error && (
          <ErrorMessage 
            error={error} 
            onRetry={loadMeasurements}
            onClose={() => setError(null)}
          />
        )}

        {loading ? (
          <div className="py-8">
            <LoadingSpinner text="Chargement des mesures..." />
          </div>
        ) : measurements.length === 0 ? (
          <div className="py-8 text-center text-gray-500 dark:text-gray-400">
            <p className="text-lg mb-2">📭 Aucune mesure enregistrée</p>
            <p className="text-sm">
              Les mesures envoyées par le dispositif (USB live ou OTA) apparaîtront ici.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 space-y-3">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-between">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>{measurements.length}</strong> mesure{measurements.length > 1 ? 's' : ''} trouvée{measurements.length > 1 ? 's' : ''} 
                  {measurements.length > 0 && (
                    <> (dernière mesure le {formatDate(measurements[0]?.timestamp)})</>
                  )}
                </p>
                <div className="flex items-center gap-3">
                  {isAdmin && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showArchived}
                        onChange={(e) => setShowArchived(e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                      />
                      <span className="text-sm text-blue-800 dark:text-blue-200">
                        🗄️ Afficher les archives
                      </span>
                    </label>
                  )}
                  <button
                    onClick={handleExportCSV}
                    className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-2"
                    title="Exporter les mesures en CSV"
                  >
                    <span>📥</span>
                    <span>Exporter CSV</span>
                  </button>
                </div>
              </div>

              {stats && (
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase">📊 Statistiques</p>
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div>
                      <p className="font-medium text-gray-600 dark:text-gray-400 mb-1">Débit (L/min)</p>
                      <p className="text-gray-900 dark:text-gray-100">
                        Moy: <strong>{stats.flowrate.avg.toFixed(2)}</strong> | 
                        Min: <strong>{stats.flowrate.min.toFixed(2)}</strong> | 
                        Max: <strong>{stats.flowrate.max.toFixed(2)}</strong>
                      </p>
                    </div>
                    {stats.battery.avg !== null && (
                      <div>
                        <p className="font-medium text-gray-600 dark:text-gray-400 mb-1">Batterie (%)</p>
                        <p className="text-gray-900 dark:text-gray-100">
                          Moy: <strong>{stats.battery.avg.toFixed(1)}</strong> | 
                          Min: <strong>{stats.battery.min.toFixed(1)}</strong> | 
                          Max: <strong>{stats.battery.max.toFixed(1)}</strong>
                        </p>
                      </div>
                    )}
                    {stats.rssi.avg !== null && (
                      <div>
                        <p className="font-medium text-gray-600 dark:text-gray-400 mb-1">RSSI (dBm)</p>
                        <p className="text-gray-900 dark:text-gray-100">
                          Moy: <strong>{stats.rssi.avg.toFixed(0)}</strong> | 
                          Min: <strong>{stats.rssi.min}</strong> | 
                          Max: <strong>{stats.rssi.max}</strong>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {isAdmin && selectedMeasurements.size > 0 && (
              <div className="mb-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg flex items-center justify-between gap-3">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>{selectedMeasurements.size}</strong> mesure{selectedMeasurements.size > 1 ? 's' : ''} sélectionnée{selectedMeasurements.size > 1 ? 's' : ''}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleArchiveMultiple}
                    disabled={archivingMultiple || deletingMultiple}
                    className="px-4 py-2 text-sm bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Archiver les mesures sélectionnées"
                  >
                    <span>{archivingMultiple ? '⏳' : '📦'}</span>
                    <span>{archivingMultiple ? 'Archivage...' : `Archiver ${selectedMeasurements.size} mesure${selectedMeasurements.size > 1 ? 's' : ''}`}</span>
                  </button>
                  <button
                    onClick={handleDeleteMultiple}
                    disabled={deletingMultiple || archivingMultiple}
                    className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Supprimer définitivement les mesures sélectionnées"
                  >
                    <span>{deletingMultiple ? '⏳' : '🗑️'}</span>
                    <span>{deletingMultiple ? 'Suppression...' : `Supprimer ${selectedMeasurements.size} mesure${selectedMeasurements.size > 1 ? 's' : ''}`}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0">
                  <tr>
                    {isAdmin && (
                      <th className="px-4 py-2 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase w-12">
                        <input
                          type="checkbox"
                          checked={measurements.length > 0 && selectedMeasurements.size === measurements.length}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                          title="Sélectionner/désélectionner toutes les mesures"
                        />
                      </th>
                    )}
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                      Date & Heure
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                      Débit (L/min)
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                      Batterie (%)
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                      RSSI (dBm)
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                      GPS
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                      Statut
                    </th>
                    {isAdmin && (
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                        Action
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {measurements.map((measurement, index) => (
                    <tr 
                      key={measurement.id || index} 
                      className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${selectedMeasurements.has(measurement.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                    >
                      {isAdmin && (
                        <td className="px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedMeasurements.has(measurement.id)}
                            onChange={() => toggleMeasurementSelection(measurement.id)}
                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                            title="Sélectionner cette mesure"
                          />
                        </td>
                      )}
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300 font-mono text-xs">
                        {formatDate(measurement.timestamp)}
                      </td>
                      <td className="px-4 py-2 text-gray-900 dark:text-gray-100">
                        {measurement.flowrate !== null && measurement.flowrate !== undefined 
                          ? `${Number(measurement.flowrate).toFixed(2)}`
                          : <span className="text-gray-400">-</span>
                        }
                      </td>
                      <td className="px-4 py-2">
                        {measurement.battery !== null && measurement.battery !== undefined ? (
                          <span className={`font-medium ${
                            measurement.battery < 20 ? 'text-red-600 dark:text-red-400' :
                            measurement.battery < 50 ? 'text-orange-600 dark:text-orange-400' :
                            'text-green-600 dark:text-green-400'
                          }`}>
                            {Number(measurement.battery).toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                        {measurement.signal_strength !== null && measurement.signal_strength !== undefined && measurement.signal_strength !== -999
                          ? (
                            <span className={`font-medium ${
                              measurement.signal_strength >= -70 ? 'text-green-600 dark:text-green-400' :
                              measurement.signal_strength >= -90 ? 'text-yellow-600 dark:text-yellow-400' :
                              'text-red-600 dark:text-red-400'
                            }`}>
                              {measurement.signal_strength} dBm
                            </span>
                          )
                          : <span className="text-gray-400">-</span>
                        }
                      </td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                        {measurement.latitude != null && measurement.longitude != null && 
                         measurement.latitude !== 0 && measurement.longitude !== 0 ? (
                          <a
                            href={`https://www.google.com/maps?q=${Number(measurement.latitude).toFixed(6)},${Number(measurement.longitude).toFixed(6)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            title="Ouvrir dans Google Maps"
                          >
                            {Number(measurement.latitude).toFixed(4)}, {Number(measurement.longitude).toFixed(4)} 🗺️
                          </a>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {measurement.device_status ? (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                            {measurement.device_status}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            {measurement.deleted_at ? (
                              // Mesure archivée : bouton restaurer
                              <button
                                className="p-2 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => handleRestoreMeasurement(measurement.id)}
                                disabled={restoringMeasurement === measurement.id || archivingMeasurement === measurement.id || deletingMeasurement === measurement.id || deletingMultiple || archivingMultiple}
                                title="Restaurer cette mesure"
                              >
                                <span className="text-lg">
                                  {restoringMeasurement === measurement.id ? '⏳' : '♻️'}
                                </span>
                              </button>
                            ) : (
                              // Mesure active : boutons archiver et supprimer
                              <>
                                <button
                                  className="p-2 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  onClick={() => handleArchiveMeasurement(measurement.id)}
                                  disabled={archivingMeasurement === measurement.id || archivingMultiple || deletingMeasurement === measurement.id || deletingMultiple || restoringMeasurement === measurement.id}
                                  title="Archiver cette mesure"
                                >
                                  <span className="text-lg">
                                    {archivingMeasurement === measurement.id ? '⏳' : '📦'}
                                  </span>
                                </button>
                                <button
                                  className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  onClick={() => handleDeleteMeasurement(measurement.id)}
                                  disabled={deletingMeasurement === measurement.id || deletingMultiple || archivingMeasurement === measurement.id || archivingMultiple || restoringMeasurement === measurement.id}
                                  title="Supprimer définitivement cette mesure"
                                >
                                  <span className="text-lg">
                                    {deletingMeasurement === measurement.id ? '⏳' : '🗑️'}
                                  </span>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      
      {/* Modals de confirmation */}
      <ConfirmModal
        isOpen={confirmArchiveModal.isOpen}
        onClose={() => setConfirmArchiveModal({ isOpen: false, measurementId: null })}
        onConfirm={confirmArchiveMeasurement}
        title="Archiver une mesure"
        message="Êtes-vous sûr de vouloir archiver cette mesure ? Elle ne sera plus visible dans l'historique."
        confirmText="Archiver"
        cancelText="Annuler"
        variant="warning"
        loading={archivingMeasurement === confirmArchiveModal.measurementId}
      />
      
      <ConfirmModal
        isOpen={confirmDeleteModal.isOpen}
        onClose={() => setConfirmDeleteModal({ isOpen: false, measurementId: null })}
        onConfirm={confirmDeleteMeasurement}
        title="Supprimer définitivement une mesure"
        message="Êtes-vous sûr de vouloir supprimer définitivement cette mesure ? Cette action est irréversible."
        confirmText="Supprimer définitivement"
        cancelText="Annuler"
        variant="danger"
        loading={deletingMeasurement === confirmDeleteModal.measurementId}
      />
      
      <ConfirmModal
        isOpen={confirmRestoreModal.isOpen}
        onClose={() => setConfirmRestoreModal({ isOpen: false, measurementId: null })}
        onConfirm={confirmRestoreMeasurement}
        title="Restaurer une mesure"
        message="Êtes-vous sûr de vouloir restaurer cette mesure ? Elle sera à nouveau visible dans l'historique."
        confirmText="Restaurer"
        cancelText="Annuler"
        variant="info"
        loading={restoringMeasurement === confirmRestoreModal.measurementId}
      />
      
      <ConfirmModal
        isOpen={confirmDeleteMultipleModal}
        onClose={() => setConfirmDeleteMultipleModal(false)}
        onConfirm={confirmDeleteMultiple}
        title="Supprimer définitivement des mesures"
        message={`Êtes-vous sûr de vouloir supprimer définitivement ${selectedMeasurements.size} mesure${selectedMeasurements.size > 1 ? 's' : ''} ? Cette action est irréversible.`}
        confirmText="Supprimer définitivement"
        cancelText="Annuler"
        variant="danger"
        loading={deletingMultiple}
      />
    </Modal>
  )
}

