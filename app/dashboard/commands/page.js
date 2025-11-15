'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'

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
  const [commands, setCommands] = useState([])
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
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

  const loadData = useCallback(async () => {
    try {
      setError(null)
      setLoading(true)
      const [commandData, deviceData] = await Promise.all([
        fetchJson(fetchWithAuth, API_URL, `/api.php/devices/commands?limit=200`),
        fetchJson(fetchWithAuth, API_URL, `/api.php/devices`),
      ])
      setCommands(commandData.commands || [])
      setDevices(deviceData.devices || [])
      if (!form.iccid && deviceData.devices?.length) {
        setForm((prev) => ({ ...prev, iccid: deviceData.devices[0].sim_iccid }))
      }
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [API_URL, fetchWithAuth, form.iccid])

  useEffect(() => {
    if (authLoading) return
    if (user && user.role_name !== 'admin') return
    loadData()
  }, [loadData, refreshTick, authLoading, user])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.iccid) {
      setError('Veuillez sélectionner un dispositif')
      return
    }

    const payload = {}
    if (form.command === 'SET_SLEEP_SECONDS') {
      payload.seconds = Number(form.sleepSeconds) || 300
    } else if (form.command === 'PING') {
      payload.message = form.message?.trim() || 'PING'
    } else if (form.command === 'UPDATE_CONFIG') {
      const addString = (key, value) => {
        const trimmed = (value ?? '').trim()
        if (trimmed) payload[key] = trimmed
      }
      const addNumber = (key, value) => {
        if (value === '' || value === null || value === undefined) return
        const num = Number(value)
        if (Number.isFinite(num)) {
          payload[key] = num
        }
      }
      addString('apn', form.configApn)
      addString('jwt', form.configJwt)
      addString('iccid', form.configIccid)
      addString('serial', form.configSerial)
      addString('sim_pin', form.configSimPin)
      addNumber('sleep_minutes_default', form.configSleepMinutes)
      addNumber('airflow_passes', form.configAirflowPasses)
      addNumber('airflow_samples_per_pass', form.configAirflowSamples)
      addNumber('airflow_delay_ms', form.configAirflowDelay)
      addNumber('watchdog_seconds', form.configWatchdogSeconds)
      addNumber('modem_boot_timeout_ms', form.configModemBootTimeout)
      addNumber('sim_ready_timeout_ms', form.configSimReadyTimeout)
      addNumber('network_attach_timeout_ms', form.configNetworkAttachTimeout)
      addNumber('modem_max_reboots', form.configModemReboots)
      addString('ota_primary_url', form.configOtaPrimaryUrl)
      addString('ota_fallback_url', form.configOtaFallbackUrl)
      addString('ota_md5', form.configOtaMd5)

      if (Object.keys(payload).length === 0) {
        setError('Veuillez renseigner au moins un champ de configuration')
        return
      }
    } else if (form.command === 'UPDATE_CALIBRATION') {
      if (form.calA0 === '' || form.calA1 === '' || form.calA2 === '') {
        setError('Veuillez fournir les coefficients a0, a1 et a2')
        return
      }
      payload.a0 = Number(form.calA0)
      payload.a1 = Number(form.calA1)
      payload.a2 = Number(form.calA2)
      if ([payload.a0, payload.a1, payload.a2].some((value) => Number.isNaN(value))) {
        setError('Les coefficients doivent être numériques')
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
      setError(null)
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
      setRefreshTick((tick) => tick + 1)
    } catch (err) {
      console.error(err)
      setError(err.message)
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Commandes descendantes</h1>
          <p className="text-gray-600 mt-1">
            {commands.length} commande(s) enregistrées – {stats.pending} en attente
          </p>
        </div>
        <button className="btn-primary" onClick={() => setRefreshTick((tick) => tick + 1)}>
          🔄 Rafraîchir
        </button>
      </div>

      {error && (
        <div className="alert alert-warning">
          <strong>Erreur :</strong> {error}
        </div>
      )}

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2 overflow-x-auto">
          <h2 className="text-xl font-semibold mb-4">Historique des commandes</h2>
          {loading ? (
            <p className="text-gray-500">Chargement...</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2">Commande</th>
                  <th className="py-2">Dispositif</th>
                  <th className="py-2">Priorité</th>
                  <th className="py-2">Statut</th>
                  <th className="py-2">Créée</th>
                </tr>
              </thead>
              <tbody>
                {commands.map((cmd) => (
                  <tr key={cmd.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{cmd.command}</td>
                    <td className="py-2 text-gray-600">
                      <div>{cmd.device_name || '—'}</div>
                      <div className="text-xs text-gray-500">{cmd.sim_iccid}</div>
                    </td>
                    <td className="py-2 capitalize">{cmd.priority}</td>
                    <td className="py-2">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          statusColors[cmd.status] || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {cmd.status}
                      </span>
                    </td>
                    <td className="py-2 text-gray-500">
                      {new Date(cmd.created_at ?? cmd.execute_after).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {commands.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-gray-500">
                      Aucune commande enregistrée
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Nouvelle commande</h2>
          <form className="space-y-4" onSubmit={handleCreate}>
            <div>
              <label className="label">Dispositif</label>
              <select
                className="input"
                value={form.iccid}
                onChange={(e) => setForm((prev) => ({ ...prev, iccid: e.target.value }))}
              >
                {devices.map((device) => (
                  <option key={device.sim_iccid} value={device.sim_iccid}>
                    {device.device_name || device.sim_iccid}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Commande</label>
              <select
                className="input"
                value={form.command}
                onChange={(e) => setForm((prev) => ({ ...prev, command: e.target.value }))}
              >
                {commandOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {form.command === 'SET_SLEEP_SECONDS' && (
              <div>
                <label className="label">Intervalle sommeil (secondes)</label>
                <input
                  type="number"
                  min={30}
                  max={7200}
                  className="input"
                  value={form.sleepSeconds}
                  onChange={(e) => setForm((prev) => ({ ...prev, sleepSeconds: e.target.value }))}
                />
              </div>
            )}

            {form.command === 'PING' && (
              <div>
                <label className="label">Message (optionnel)</label>
                <input
                  type="text"
                  className="input"
                  value={form.message}
                  onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
                />
              </div>
            )}

            {form.command === 'UPDATE_CONFIG' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">
                  Remplir uniquement les champs à modifier. Les valeurs numériques sont optionnelles.
                </p>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Identité & secrets</p>
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
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Mesures & sommeil</p>
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
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Watchdog & modem</p>
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
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">OTA par défaut</p>
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {['a0', 'a1', 'a2'].map((coef) => (
                  <div key={coef}>
                    <label className="label">Coefficient {coef.toUpperCase()}</label>
                    <input
                      type="number"
                      step="any"
                      className="input"
                      value={form[`cal${coef.toUpperCase()}`]}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          [`cal${coef.toUpperCase()}`]: e.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            {form.command === 'OTA_REQUEST' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">
                  Laisser l’URL vide pour utiliser la valeur primaire/fallback stockée dans le boîtier.
                </p>
                <div>
                  <label className="label">Canal</label>
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
                  <label className="label">URL binaire (optionnel)</label>
                  <input
                    type="text"
                    className="input"
                    value={form.otaUrl}
                    onChange={(e) => setForm((prev) => ({ ...prev, otaUrl: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">MD5 attendu (optionnel)</label>
                  <input
                    type="text"
                    className="input"
                    value={form.otaMd5}
                    onChange={(e) => setForm((prev) => ({ ...prev, otaMd5: e.target.value }))}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="label">Priorité</label>
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
              <label className="label">Expiration (minutes)</label>
              <input
                type="number"
                min={5}
                className="input"
                value={form.expiresInMinutes}
                onChange={(e) => setForm((prev) => ({ ...prev, expiresInMinutes: e.target.value }))}
              />
            </div>

            <button type="submit" className="btn-primary w-full" disabled={creating}>
              {creating ? 'Envoi...' : 'Programmer'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

