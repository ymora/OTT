'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useApiData } from '@/hooks'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import SuccessMessage from '@/components/SuccessMessage'
import logger from '@/lib/logger'
import { createUpdateConfigCommand, createUpdateCalibrationCommand } from '@/lib/deviceCommands'

export default function DeviceConfigurationTab() {
  const { fetchWithAuth, API_URL } = useAuth()
  
  const { data, loading, refetch } = useApiData(
    ['/api.php/devices'],
    { requiresAuth: true }
  )

  const devices = data?.devices?.devices || []
  const [selectedDeviceId, setSelectedDeviceId] = useState(null)
  const [config, setConfig] = useState({
    sleep_minutes: 30,
    measurement_duration_ms: 100,
    send_every_n_wakeups: 1,
    calibration_coefficients: [0, 1, 0]
  })
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Charger la configuration du dispositif sélectionné
  const loadDeviceConfig = useCallback(async (deviceId) => {
    if (!deviceId) {
      setConfig({
        sleep_minutes: 30,
        measurement_duration_ms: 100,
        send_every_n_wakeups: 1,
        calibration_coefficients: [0, 1, 0]
      })
      return
    }

    setLoadingConfig(true)
    setError(null)
    try {
      const response = await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/devices/${deviceId}/config`,
        { method: 'GET' },
        { requiresAuth: true }
      )

      if (response.config) {
        setConfig({
          sleep_minutes: response.config.sleep_minutes ?? 30,
          measurement_duration_ms: response.config.measurement_duration_ms ?? 100,
          send_every_n_wakeups: response.config.send_every_n_wakeups ?? 1,
          calibration_coefficients: response.config.calibration_coefficients 
            ? (Array.isArray(response.config.calibration_coefficients) 
                ? response.config.calibration_coefficients 
                : JSON.parse(response.config.calibration_coefficients))
            : [0, 1, 0]
        })
      }
    } catch (err) {
      logger.error('Erreur chargement configuration:', err)
      setError(err.message || 'Erreur lors du chargement de la configuration')
    } finally {
      setLoadingConfig(false)
    }
  }, [fetchWithAuth, API_URL])

  // Charger la configuration quand un dispositif est sélectionné
  useEffect(() => {
    if (selectedDeviceId) {
      loadDeviceConfig(selectedDeviceId)
    } else {
      setConfig({
        sleep_minutes: 30,
        measurement_duration_ms: 100,
        send_every_n_wakeups: 1,
        calibration_coefficients: [0, 1, 0]
      })
    }
  }, [selectedDeviceId, loadDeviceConfig])

  // Sauvegarder la configuration
  const handleSave = useCallback(async (e) => {
    e.preventDefault()
    if (!selectedDeviceId) {
      setError('Veuillez sélectionner un dispositif')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const selectedDevice = devices.find(d => d.id === parseInt(selectedDeviceId))
      if (!selectedDevice) {
        setError('Dispositif introuvable')
        return
      }

      // 1. Mettre à jour la base de données
      const updateData = {}
      
      if (config.sleep_minutes !== null && config.sleep_minutes !== '') {
        updateData.sleep_minutes = parseInt(config.sleep_minutes)
      }
      if (config.measurement_duration_ms !== null && config.measurement_duration_ms !== '') {
        updateData.measurement_duration_ms = parseInt(config.measurement_duration_ms)
      }
      if (config.send_every_n_wakeups !== null && config.send_every_n_wakeups !== '') {
        updateData.send_every_n_wakeups = parseInt(config.send_every_n_wakeups)
      }
      if (config.calibration_coefficients && Array.isArray(config.calibration_coefficients)) {
        updateData.calibration_coefficients = config.calibration_coefficients
      }

      await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/devices/${selectedDeviceId}/config`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData)
        },
        { requiresAuth: true }
      )

      // 2. Créer automatiquement des commandes OTA pour appliquer la configuration
      const configForCommand = {
        sleep_minutes: config.sleep_minutes,
        measurement_duration_ms: config.measurement_duration_ms,
        send_every_n_wakeups: config.send_every_n_wakeups
      }
      
      // Vérifier si au moins un paramètre de config est défini
      const hasConfigParams = 
        (config.sleep_minutes !== null && config.sleep_minutes !== '') ||
        (config.measurement_duration_ms !== null && config.measurement_duration_ms !== '') ||
        (config.send_every_n_wakeups !== null && config.send_every_n_wakeups !== '')

      // Créer la commande UPDATE_CONFIG si nécessaire
      if (hasConfigParams) {
        try {
          await createUpdateConfigCommand(
            fetchWithAuth,
            API_URL,
            selectedDevice.sim_iccid,
            configForCommand,
            { priority: 'normal', expiresInSeconds: 7 * 24 * 60 * 60 }
          )
        } catch (cmdErr) {
          // Ne pas bloquer la sauvegarde si la création de commande échoue
          logger.error('Erreur création commande OTA UPDATE_CONFIG:', cmdErr)
        }
      }

      // Créer une commande UPDATE_CALIBRATION séparée pour les coefficients
      if (config.calibration_coefficients && Array.isArray(config.calibration_coefficients)) {
        const calA0 = config.calibration_coefficients[0]
        const calA1 = config.calibration_coefficients[1]
        const calA2 = config.calibration_coefficients[2]
        
        // Vérifier que les valeurs sont valides
        if (calA0 !== undefined && calA1 !== undefined && calA2 !== undefined) {
          try {
            await createUpdateCalibrationCommand(
              fetchWithAuth,
              API_URL,
              selectedDevice.sim_iccid,
              calA0,
              calA1,
              calA2,
              { priority: 'normal', expiresInSeconds: 7 * 24 * 60 * 60 }
            )
          } catch (cmdErr) {
            logger.error('Erreur création commande OTA UPDATE_CALIBRATION:', cmdErr)
          }
        }
      }

      setSuccess('Configuration sauvegardée. Le dispositif sera mis à jour lors de sa prochaine connexion.')
      await refetch()
      
      // Recharger la configuration pour afficher les valeurs sauvegardées
      await loadDeviceConfig(selectedDeviceId)
    } catch (err) {
      logger.error('Erreur sauvegarde configuration:', err)
      setError(err.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }, [selectedDeviceId, config, devices, fetchWithAuth, API_URL, refetch, loadDeviceConfig])

  const selectedDevice = devices.find(d => d.id === parseInt(selectedDeviceId))

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">⚙️ Configuration des dispositifs</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Configurez les paramètres de réveil, mesure et envoi des données pour chaque dispositif.
          <br />
          <span className="text-primary-600 dark:text-primary-400 font-medium">
            ℹ️ Les modifications seront appliquées au dispositif lors de sa prochaine connexion via OTA.
          </span>
        </p>

        {/* Sélection du dispositif */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Dispositif</label>
          <select
            value={selectedDeviceId || ''}
            onChange={(e) => setSelectedDeviceId(e.target.value || null)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700"
          >
            <option value="">-- Sélectionner un dispositif --</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.device_name || device.sim_iccid} 
                {device.firmware_version && ` (v${device.firmware_version})`}
                {device.first_name && ` - ${device.first_name} ${device.last_name || ''}`}
              </option>
            ))}
          </select>
        </div>

        <ErrorMessage error={error} onClose={() => setError(null)} />
        <SuccessMessage message={success} onClose={() => setSuccess(null)} />

        {/* Formulaire de configuration */}
        {selectedDeviceId && (
          <form onSubmit={handleSave} className="space-y-6">
            {loadingConfig ? (
              <LoadingSpinner />
            ) : (
              <>
                {/* Section : Cycle de fonctionnement */}
                <div className="space-y-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <span className="text-lg">⏰</span>
                    Cycle de Fonctionnement
                  </h3>
                  
                  {/* Intervalle de réveil */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                      Intervalle de réveil (minutes)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      value={config.sleep_minutes || ''}
                      onChange={(e) => setConfig(prev => ({ ...prev, sleep_minutes: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700"
                      placeholder="30"
                    />
                    <div className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <span className="text-blue-500">ℹ️</span>
                      <span>
                        Le dispositif se réveille toutes les <strong>{config.sleep_minutes || 30} minutes</strong> pour prendre une mesure.
                        <br />
                        <span className="text-gray-500 dark:text-gray-400">Plage : 1 minute (très fréquent) à 1440 minutes (24h)</span>
                      </span>
                    </div>
                  </div>

                  {/* Durée de mesure */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                      Durée de mesure (millisecondes)
                    </label>
                    <input
                      type="number"
                      min="10"
                      max="10000"
                      value={config.measurement_duration_ms || ''}
                      onChange={(e) => setConfig(prev => ({ ...prev, measurement_duration_ms: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700"
                      placeholder="100"
                    />
                    <div className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <span className="text-blue-500">ℹ️</span>
                      <span>
                        Temps pendant lequel le capteur collecte des données à chaque réveil.
                        <br />
                        <span className="text-gray-500 dark:text-gray-400">Plage : 10ms (rapide) à 10000ms (10 secondes, plus précis)</span>
                      </span>
                    </div>
                  </div>

                  {/* Envoi toutes les N réveils */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                      Fréquence d&apos;envoi des données
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={config.send_every_n_wakeups || ''}
                      onChange={(e) => setConfig(prev => ({ ...prev, send_every_n_wakeups: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700"
                      placeholder="1"
                    />
                    <div className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <span className="text-blue-500">ℹ️</span>
                      <span>
                        {config.send_every_n_wakeups === '1' || !config.send_every_n_wakeups ? (
                          <>Les données sont envoyées <strong>à chaque réveil</strong> (fréquence maximale).</>
                        ) : (
                          <>Les données sont envoyées <strong>tous les {config.send_every_n_wakeups} réveils</strong> (économie de batterie et données).</>
                        )}
                        <br />
                        <span className="text-gray-500 dark:text-gray-400">1 = à chaque réveil, 2 = tous les 2 réveils, etc.</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Coefficients de calibration */}
                <div className="space-y-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-8 h-8 bg-blue-500 dark:bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
                        🔧
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-gray-100">
                        Calibration du Capteur de Débit
                      </label>
                      <p className="text-xs text-gray-600 dark:text-gray-300 mb-4">
                        Les coefficients permettent de convertir la valeur brute du capteur en débit réel (L/min).
                        <br />
                        <span className="font-mono bg-white dark:bg-gray-800 px-2 py-1 rounded mt-2 inline-block">
                          Débit = a0 + (a1 × valeur) + (a2 × valeur²)
                        </span>
                      </p>
                      
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            a0 - Offset
                          </label>
                          <input
                            type="number"
                            step="0.0001"
                            value={config.calibration_coefficients?.[0] ?? 0}
                            onChange={(e) => {
                              const newCoeffs = [...(config.calibration_coefficients || [0, 1, 0])]
                              newCoeffs[0] = parseFloat(e.target.value) || 0
                              setConfig(prev => ({ ...prev, calibration_coefficients: newCoeffs }))
                            }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
                            placeholder="0"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Décalage constant (valeur par défaut : 0)
                          </p>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            a1 - Coefficient Linéaire
                          </label>
                          <input
                            type="number"
                            step="0.0001"
                            value={config.calibration_coefficients?.[1] ?? 1}
                            onChange={(e) => {
                              const newCoeffs = [...(config.calibration_coefficients || [0, 1, 0])]
                              newCoeffs[1] = parseFloat(e.target.value) || 1
                              setConfig(prev => ({ ...prev, calibration_coefficients: newCoeffs }))
                            }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
                            placeholder="1"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Facteur de proportionnalité (valeur par défaut : 1)
                          </p>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            a2 - Coefficient Quadratique
                          </label>
                          <input
                            type="number"
                            step="0.0001"
                            value={config.calibration_coefficients?.[2] ?? 0}
                            onChange={(e) => {
                              const newCoeffs = [...(config.calibration_coefficients || [0, 1, 0])]
                              newCoeffs[2] = parseFloat(e.target.value) || 0
                              setConfig(prev => ({ ...prev, calibration_coefficients: newCoeffs }))
                            }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
                            placeholder="0"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Correction de courbure (valeur par défaut : 0)
                          </p>
                        </div>
                      </div>
                      
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                        <p className="text-xs text-yellow-800 dark:text-yellow-200">
                          <strong>💡 Exemple :</strong> Si le capteur lit 100 et que a0=0, a1=0.5, a2=0.001,
                          alors le débit calculé sera : 0 + (0.5 × 100) + (0.001 × 100²) = 50 + 10 = 60 L/min
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Informations du dispositif */}
                {selectedDevice && (
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
                    <p className="text-sm font-semibold">Informations du dispositif</p>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Nom:</span>{' '}
                        <span className="font-medium">{selectedDevice.device_name || selectedDevice.sim_iccid}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">ICCID:</span>{' '}
                        <span className="font-mono text-xs">{selectedDevice.sim_iccid}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Firmware:</span>{' '}
                        <span className="font-medium">{selectedDevice.firmware_version || 'N/A'}</span>
                      </div>
                      {selectedDevice.last_seen && (
                        <div>
                          <span className="text-gray-500">Dernière vue:</span>{' '}
                          <span className="font-medium">
                            {new Date(selectedDevice.last_seen).toLocaleString('fr-FR')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Bouton de sauvegarde */}
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving || loadingConfig}
                    className="px-6 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? '⏳ Sauvegarde...' : '💾 Sauvegarder la configuration'}
                  </button>
                </div>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  )
}

