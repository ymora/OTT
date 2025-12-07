'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import logger from '@/lib/logger'
import Modal from '@/components/Modal'

/**
 * Modal pour afficher l'historique des mesures d'un dispositif
 */
export default function DeviceMeasurementsModal({ isOpen, onClose, device }) {
  const { fetchWithAuth, API_URL } = useAuth()
  const [measurements, setMeasurements] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const loadMeasurements = useCallback(async () => {
    if (!device?.id) return

    setLoading(true)
    setError(null)
    
    try {
      const data = await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/devices/${device.id}/history`,
        { method: 'GET' },
        { requiresAuth: true }
      )
      
      if (data.success && data.measurements) {
        setMeasurements(data.measurements)
        logger.debug(`✅ ${data.measurements.length} mesures chargées pour dispositif ${device.id}`)
      } else {
        setError('Impossible de charger les mesures')
      }
    } catch (err) {
      logger.error('Erreur chargement mesures:', err)
      setError(err.message || 'Erreur lors du chargement des mesures')
      setMeasurements([])
    } finally {
      setLoading(false)
    }
  }, [device?.id, fetchWithAuth, API_URL])

  useEffect(() => {
    if (isOpen && device?.id) {
      loadMeasurements()
    } else {
      setMeasurements([])
      setError(null)
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
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>{measurements.length}</strong> mesure{measurements.length > 1 ? 's' : ''} trouvée{measurements.length > 1 ? 's' : ''} 
                {measurements.length > 0 && (
                  <> (dernière mesure le {formatDate(measurements[0]?.timestamp)})</>
                )}
              </p>
            </div>

            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0">
                  <tr>
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
                      RSSI
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                      Statut
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {measurements.map((measurement, index) => (
                    <tr 
                      key={measurement.id || index} 
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
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
                        {measurement.signal_strength !== null && measurement.signal_strength !== undefined
                          ? measurement.signal_strength
                          : <span className="text-gray-400">-</span>
                        }
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

