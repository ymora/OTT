'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'

const commandOptions = [
  { value: 'SET_SLEEP_SECONDS', label: 'Modifier intervalle de sommeil' },
  { value: 'PING', label: 'Ping / Diagnostic rapide' },
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

    const payload =
      form.command === 'SET_SLEEP_SECONDS'
        ? { seconds: Number(form.sleepSeconds) || 300 }
        : { message: form.message || 'PING' }

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

