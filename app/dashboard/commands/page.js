'use client'

// Désactiver le pré-rendu statique
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useApiData } from '@/hooks'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import SuccessMessage from '@/components/SuccessMessage'
import logger from '@/lib/logger'
import { buildUpdateConfigPayload, buildUpdateCalibrationPayload } from '@/lib/deviceCommands'

const commandOptions = [
  { value: 'SET_SLEEP_SECONDS', label: 'Modifier intervalle de sommeil' },
  { value: 'PING', label: 'Ping / Diagnostic rapide' },
  { value: 'UPDATE_CONFIG', label: 'Mettre à jour la configuration' },
  { value: 'UPDATE_CALIBRATION', label: 'Recalibrer le capteur' },
  { value: 'OTA_REQUEST', label: 'Déclencher une mise à jour OTA' },
]

const priorityOptions = [
  { value: 'low', label: 'Basse' },
  { value: 'normal', label: 'Normale' },
  { value: 'high', label: 'Haute' },
  { value: 'critical', label: 'Critique' },
]

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  executing: 'bg-blue-100 text-blue-800',
  executed: 'bg-green-100 text-green-800',
  error: 'bg-red-100 text-red-800',
  expired: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-gray-200 text-gray-700',
}

export default function CommandsPage() {
  const { fetchWithAuth, API_URL, user, loading: authLoading } = useAuth()
  const [creating, setCreating] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [refreshTick, setRefreshTick] = useState(0)

  const [form, setForm] = useState({
    iccid: '',
    command: 'SET_SLEEP_SECONDS',
    sleepSeconds: 300,
    message: '',
    priority: 'normal',
    expiresInMinutes: 60,
    configApn: '',
    configJwt: '',
    configIccid: '',
    configSerial: '',
    configSimPin: '',
    configSleepMinutes: '',
    configAirflowPasses: '',
    configAirflowSamples: '',
    configAirflowDelay: '',
    configWatchdogSeconds: '',
    configModemBootTimeout: '',
    configSimReadyTimeout: '',
    configNetworkAttachTimeout: '',
    configModemReboots: '',
    configOtaPrimaryUrl: '',
    configOtaFallbackUrl: '',
    configOtaMd5: '',
    calA0: '',
    calA1: '',
    calA2: '',
    otaUrl: '',
    otaChannel: 'primary',
    otaMd5: '',
  })

  // Charger les données avec useApiData
  const { data, loading, error, refetch } = useApiData(
    ['/api.php/devices/commands?limit=200', '/api.php/devices'],
    { requiresAuth: false, autoLoad: !authLoading && (!user || user.role_name === 'admin') }
  )

  const commands = data?.commands?.commands || []
  const devices = data?.devices?.devices || []

  // Initialiser le formulaire avec le premier dispositif
  useEffect(() => {
    if (!form.iccid && devices.length > 0) {
      setForm((prev) => ({ ...prev, iccid: devices[0].sim_iccid }))
    }
  }, [devices, form.iccid])

  // Rafraîchir quand refreshTick change
  useEffect(() => {
    if (refreshTick > 0 && !authLoading && (!user || user.role_name === 'admin')) {
      refetch()
    }
  }, [refreshTick, authLoading, user, refetch])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.iccid) {
      setActionError('Veuillez sélectionner un dispositif')
      return
    }

    const payload = {}
    if (form.command === 'SET_SLEEP_SECONDS') {
      payload.seconds = Number(form.sleepSeconds) || 300
    } else if (form.command === 'PING') {
      payload.message = form.message?.trim() || 'PING'
    } else if (form.command === 'UPDATE_CONFIG') {
      // Utiliser la fonction utilitaire pour construire le payload
      const config = {
        apn: form.configApn,
        jwt: form.configJwt,
        iccid: form.configIccid,
        serial: form.configSerial,
        simPin: form.configSimPin,
        sleepMinutes: form.configSleepMinutes,
        airflowPasses: form.configAirflowPasses,
        airflowSamples: form.configAirflowSamples,
        airflowDelay: form.configAirflowDelay,
        watchdogSeconds: form.configWatchdogSeconds,
        modemBootTimeout: form.configModemBootTimeout,
        simReadyTimeout: form.configSimReadyTimeout,
        networkAttachTimeout: form.configNetworkAttachTimeout,
        modemReboots: form.configModemReboots,
        otaPrimaryUrl: form.configOtaPrimaryUrl,
        otaFallbackUrl: form.configOtaFallbackUrl,
        otaMd5: form.configOtaMd5
      }
      
      try {
        payload = buildUpdateConfigPayload(config)
        if (Object.keys(payload).length === 0) {
          setActionError('Veuillez renseigner au moins un champ de configuration')
          return
        }
      } catch (err) {
        setActionError(err.message || 'Erreur lors de la construction du payload')
        return
      }
    } else if (form.command === 'UPDATE_CALIBRATION') {
      try {
        payload = buildUpdateCalibrationPayload(form.calA0, form.calA1, form.calA2)
      } catch (err) {
        setActionError(err.message)
        return
      }
    } else if (form.command === 'OTA_REQUEST') {
      payload.channel = form.otaChannel
      const trimmedUrl = form.otaUrl?.trim()
      if (trimmedUrl) {
        payload.url = trimmedUrl
      }
      const trimmedMd5 = form.otaMd5?.trim()
      if (trimmedMd5) {
        payload.md5 = trimmedMd5
      }
    }

    const body = {
      command: form.command,
      payload,
      priority: form.priority,
      expires_in_seconds: Number(form.expiresInMinutes) > 0 ? Number(form.expiresInMinutes) * 60 : undefined,
    }

    try {
      setCreating(true)
      setActionError(null)
      await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/devices/${form.iccid}/commands`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
        { requiresAuth: true }
      )
      setSuccess('Commande créée avec succès')
      setRefreshTick((tick) => tick + 1)
    } catch (err) {
      logger.error(err)
      setActionError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const stats = useMemo(() => {
    const pending = commands.filter((c) => c.status === 'pending').length
    const executed = commands.filter((c) => c.status === 'executed').length
    const errors = commands.filter((c) => c.status === 'error').length
    return { pending, executed, errors }
  }, [commands])

  if (!authLoading && user && user.role_name !== 'admin') {
    return (
      <div className="card">
        <h1 className="text-2xl font-semibold">Commandes descendantes</h1>
        <p className="text-gray-600 mt-2">
          Seuls les administrateurs peuvent programmer ou consulter les commandes critiques. Veuillez
          contacter un administrateur si vous avez besoin d’exécuter une action.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">📡 Commandes Dispositifs</h1>
        <p className="text-gray-600 mt-1">
          Envoyer des commandes aux dispositifs et consulter l&apos;historique
        </p>
      </div>

      <ErrorMessage error={error} onRetry={refetch} />
      <ErrorMessage error={actionError} onClose={() => setActionError(null)} />
      <SuccessMessage message={success} onClose={() => setSuccess(null)} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-sm text-gray-500">En attente</p>
          <p className="text-3xl font-semibold text-yellow-500">{stats.pending}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Exécutées</p>
          <p className="text-3xl font-semibold text-green-600">{stats.executed}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Erreurs</p>
          <p className="text-3xl font-semibold text-red-500">{stats.errors}</p>
        </div>
      </div>

      {/* Formulaire de commande - Simplifié et plus clair */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">📡 Envoyer une commande</h2>
        <form className="space-y-4" onSubmit={handleCreate}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Dispositif *</label>
                <select
                  className="input"
                  value={form.iccid}
                  onChange={(e) => setForm((prev) => ({ ...prev, iccid: e.target.value }))}
                  required
                >
                  <option value="">— Sélectionner un dispositif —</option>
                  {devices.map((device) => (
                    <option key={device.sim_iccid} value={device.sim_iccid}>
                      {device.device_name || device.sim_iccid} {device.first_name ? `(${device.first_name} ${device.last_name || ''})` : '(Non assigné)'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Type de commande *</label>
                <select
                  className="input"
                  value={form.command}
                  onChange={(e) => setForm((prev) => ({ ...prev, command: e.target.value }))}
                  required
                >
                  {commandOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Paramètres spécifiques selon le type de commande */}
            {form.command === 'SET_SLEEP_SECONDS' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Intervalle de sommeil (secondes) *
                </label>
                <input
                  type="number"
                  min={30}
                  max={7200}
                  className="input"
                  value={form.sleepSeconds}
                  onChange={(e) => setForm((prev) => ({ ...prev, sleepSeconds: e.target.value }))}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Valeur entre 30 et 7200 secondes</p>
              </div>
            )}

            {form.command === 'PING' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message de diagnostic (optionnel)
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="Ex: Test de connexion"
                  value={form.message}
                  onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
                />
                <p className="text-xs text-gray-500 mt-1">Message qui sera renvoyé par le dispositif</p>
              </div>
            )}

            {form.command === 'UPDATE_CONFIG' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-4">
                <div className="bg-amber-100 border-l-4 border-amber-500 p-3 rounded">
                  <p className="text-sm font-semibold text-amber-800 mb-1">⚠️ Configuration avancée</p>
                  <p className="text-xs text-amber-700">
                    Remplir uniquement les champs à modifier. Les valeurs vides seront ignorées.
                  </p>
                </div>
                
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-3">🔐 Identité & Réseau</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      className="input"
                      placeholder="APN"
                      value={form.configApn}
                      onChange={(e) => setForm((prev) => ({ ...prev, configApn: e.target.value }))}
                    />
                    <input
                      className="input"
                      placeholder="JWT Bearer..."
                      value={form.configJwt}
                      onChange={(e) => setForm((prev) => ({ ...prev, configJwt: e.target.value }))}
                    />
                    <input
                      className="input"
                      placeholder="ICCID"
                      value={form.configIccid}
                      onChange={(e) => setForm((prev) => ({ ...prev, configIccid: e.target.value }))}
                    />
                    <input
                      className="input"
                      placeholder="Numéro de série"
                      value={form.configSerial}
                      onChange={(e) => setForm((prev) => ({ ...prev, configSerial: e.target.value }))}
                    />
                    <input
                      className="input"
                      placeholder="PIN SIM"
                      value={form.configSimPin}
                      onChange={(e) => setForm((prev) => ({ ...prev, configSimPin: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-3">📊 Mesures & Sommeil</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="number"
                      min={1}
                      className="input"
                      placeholder="Sommeil par défaut (minutes)"
                      value={form.configSleepMinutes}
                      onChange={(e) => setForm((prev) => ({ ...prev, configSleepMinutes: e.target.value }))}
                    />
                    <input
                      type="number"
                      min={1}
                      className="input"
                      placeholder="Passes capteur"
                      value={form.configAirflowPasses}
                      onChange={(e) => setForm((prev) => ({ ...prev, configAirflowPasses: e.target.value }))}
                    />
                    <input
                      type="number"
                      min={1}
                      className="input"
                      placeholder="Échantillons / passe"
                      value={form.configAirflowSamples}
                      onChange={(e) => setForm((prev) => ({ ...prev, configAirflowSamples: e.target.value }))}
                    />
                    <input
                      type="number"
                      min={1}
                      className="input"
                      placeholder="Délai échantillons (ms)"
                      value={form.configAirflowDelay}
                      onChange={(e) => setForm((prev) => ({ ...prev, configAirflowDelay: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-3">⚙️ Watchdog & Modem</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="number"
                      min={5}
                      className="input"
                      placeholder="Watchdog (secondes)"
                      value={form.configWatchdogSeconds}
                      onChange={(e) => setForm((prev) => ({ ...prev, configWatchdogSeconds: e.target.value }))}
                    />
                    <input
                      type="number"
                      min={1000}
                      className="input"
                      placeholder="Timeout boot modem (ms)"
                      value={form.configModemBootTimeout}
                      onChange={(e) => setForm((prev) => ({ ...prev, configModemBootTimeout: e.target.value }))}
                    />
                    <input
                      type="number"
                      min={1000}
                      className="input"
                      placeholder="Timeout SIM prête (ms)"
                      value={form.configSimReadyTimeout}
                      onChange={(e) => setForm((prev) => ({ ...prev, configSimReadyTimeout: e.target.value }))}
                    />
                    <input
                      type="number"
                      min={1000}
                      className="input"
                      placeholder="Timeout attache réseau (ms)"
                      value={form.configNetworkAttachTimeout}
                      onChange={(e) => setForm((prev) => ({ ...prev, configNetworkAttachTimeout: e.target.value }))}
                    />
                    <input
                      type="number"
                      min={1}
                      className="input"
                      placeholder="Redémarrages modem max"
                      value={form.configModemReboots}
                      onChange={(e) => setForm((prev) => ({ ...prev, configModemReboots: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-3">⬆️ OTA par défaut</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      className="input"
                      placeholder="URL primaire"
                      value={form.configOtaPrimaryUrl}
                      onChange={(e) => setForm((prev) => ({ ...prev, configOtaPrimaryUrl: e.target.value }))}
                    />
                    <input
                      className="input"
                      placeholder="URL fallback"
                      value={form.configOtaFallbackUrl}
                      onChange={(e) => setForm((prev) => ({ ...prev, configOtaFallbackUrl: e.target.value }))}
                    />
                    <input
                      className="input md:col-span-2"
                      placeholder="MD5 attendu (optionnel)"
                      value={form.configOtaMd5}
                      onChange={(e) => setForm((prev) => ({ ...prev, configOtaMd5: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            )}

            {form.command === 'UPDATE_CALIBRATION' && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">📐 Coefficients de calibration</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {['a0', 'a1', 'a2'].map((coef) => (
                    <div key={coef}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Coefficient {coef.toUpperCase()} *
                      </label>
                      <input
                        type="number"
                        step="any"
                        className="input"
                        placeholder={`Valeur ${coef.toUpperCase()}`}
                        value={form[`cal${coef.toUpperCase()}`]}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            [`cal${coef.toUpperCase()}`]: e.target.value,
                          }))
                        }
                        required
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {form.command === 'OTA_REQUEST' && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
                <div className="bg-orange-100 border-l-4 border-orange-500 p-3 rounded">
                  <p className="text-sm font-semibold text-orange-800 mb-1">⚠️ Mise à jour OTA</p>
                  <p className="text-xs text-orange-700">
                    Laisser l&apos;URL vide pour utiliser la configuration stockée dans le dispositif.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Canal OTA</label>
                  <select
                    className="input"
                    value={form.otaChannel}
                    onChange={(e) => setForm((prev) => ({ ...prev, otaChannel: e.target.value }))}
                  >
                    <option value="primary">Primaire</option>
                    <option value="fallback">Fallback</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">URL du firmware (optionnel)</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="https://..."
                    value={form.otaUrl}
                    onChange={(e) => setForm((prev) => ({ ...prev, otaUrl: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">MD5 attendu (optionnel)</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Hash MD5 du firmware"
                    value={form.otaMd5}
                    onChange={(e) => setForm((prev) => ({ ...prev, otaMd5: e.target.value }))}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-200">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Priorité</label>
                <select
                  className="input"
                  value={form.priority}
                  onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}
                >
                  {priorityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Expiration (minutes)</label>
                <input
                  type="number"
                  min={5}
                  className="input"
                  value={form.expiresInMinutes}
                  onChange={(e) => setForm((prev) => ({ ...prev, expiresInMinutes: e.target.value }))}
                />
                <p className="text-xs text-gray-500 mt-1">Temps avant expiration de la commande</p>
              </div>
            </div>

            <button type="submit" className="btn-primary w-full" disabled={creating || !form.iccid}>
              {creating ? '⏳ Envoi en cours...' : '📤 Envoyer la commande'}
            </button>
          </form>
      </div>

      {/* Historique des commandes */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">📋 Historique des commandes</h2>
          <button 
            className="btn-secondary text-sm" 
            onClick={() => setRefreshTick((tick) => tick + 1)}
            disabled={loading}
          >
            🔄 Actualiser
          </button>
        </div>
        
        {loading ? (
          <LoadingSpinner size="lg" text="Chargement des commandes..." />
        ) : commands.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg mb-2">Aucune commande enregistrée</p>
            <p className="text-sm">Les commandes envoyées apparaîtront ici</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-3 px-4">Commande</th>
                  <th className="py-3 px-4">Dispositif</th>
                  <th className="py-3 px-4">Priorité</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4">Créée</th>
                </tr>
              </thead>
              <tbody>
                {commands.map((cmd) => (
                  <tr key={cmd.id} className="border-b dark:border-[rgb(var(--night-border))] hover:bg-gray-50 dark:hover:bg-[rgb(var(--night-surface-hover))] transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-medium text-primary">{cmd.command}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-primary">{cmd.device_name || cmd.sim_iccid || '—'}</div>
                      {cmd.patient_first_name || cmd.patient_last_name ? (
                        <div className="text-xs text-muted">
                          {cmd.patient_first_name} {cmd.patient_last_name}
                        </div>
                      ) : (
                        <div className="text-xs text-amber-600">Non assigné</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="capitalize text-gray-700">{cmd.priority}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          statusColors[cmd.status] || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {cmd.status === 'pending' ? '⏳ En attente' :
                         cmd.status === 'executed' ? '✅ Exécutée' :
                         cmd.status === 'error' ? '❌ Erreur' :
                         cmd.status === 'expired' ? '⏰ Expirée' :
                         cmd.status === 'cancelled' ? '🚫 Annulée' :
                         cmd.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-500">
                      {new Date(cmd.created_at ?? cmd.execute_after).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

