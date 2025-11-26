'use client'

// Désactiver le pré-rendu statique
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useApiData } from '@/hooks'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import SuccessMessage from '@/components/SuccessMessage'

export default function NotificationsPage() {
  const { fetchWithAuth, API_URL } = useAuth()
  const [preferences, setPreferences] = useState(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [actionError, setActionError] = useState(null)

  // Charger les données avec useApiData
  const { data, loading, error, refetch } = useApiData(
    ['/api.php/notifications/preferences', '/api.php/notifications/queue?limit=50'],
    { requiresAuth: false }
  )

  const queue = data?.queue?.queue || []
  
  // Initialiser les préférences depuis les données (une seule fois)
  useEffect(() => {
    if (!preferences && data?.preferences?.preferences) {
      setPreferences(data.preferences.preferences)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.preferences?.preferences])

  const handleToggle = (field) => {
    setPreferences(prev => ({ ...prev, [field]: !prev?.[field] }))
  }

  const handleChange = (field, value) => {
    setPreferences(prev => ({ ...prev, [field]: value }))
  }

  const savePreferences = async () => {
    try {
      setSaving(true)
      setMessage(null)
      await fetchJson(
        fetchWithAuth,
        API_URL,
        '/api.php/notifications/preferences',
        { method: 'PUT', body: JSON.stringify(preferences) },
        { requiresAuth: false }
      )
      setMessage('Préférences enregistrées')
      await refetch()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const testNotification = async (type) => {
    try {
      await fetchJson(
        fetchWithAuth,
        API_URL,
        '/api.php/notifications/test',
        { method: 'POST', body: JSON.stringify({ type }) },
        { requiresAuth: false }
      )
      setMessage(`Notification ${type.toUpperCase()} envoyée (voir logs serveur)`)
    } catch (err) {
      setActionError(err.message)
    }
  }

  if (loading || !preferences) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold">📧 Notifications</h1>
          <p className="text-gray-600 mt-1">Configurer les canaux d&apos;alertes et préférences.</p>
        </div>
        <LoadingSpinner size="lg" text="Chargement des préférences..." />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">📧 Notifications</h1>
          <p className="text-gray-600 mt-1">Configurer les canaux d&apos;alertes et préférences.</p>
        </div>
        <div className="space-x-2">
          <button className="btn-secondary" onClick={() => testNotification('email')}>✉️ Test Email</button>
          <button className="btn-secondary" onClick={() => testNotification('sms')}>📱 Test SMS</button>
        </div>
      </div>

      <ErrorMessage error={error} onRetry={refetch} />
      <ErrorMessage error={actionError} onClose={() => setActionError(null)} />
      <SuccessMessage message={message} onClose={() => setMessage(null)} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card space-y-4">
          <h2 className="text-xl font-semibold">Préférences personnelles</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {['email_enabled','sms_enabled','push_enabled'].map(field => (
              <label key={field} className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                preferences[field]
                  ? 'bg-blue-100 border-2 border-blue-500 text-blue-900 font-semibold'
                  : 'bg-gray-50 border border-gray-200 text-gray-700'
              }`}>
                <input
                  type="checkbox"
                  checked={!!preferences[field]}
                  onChange={() => handleToggle(field)}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">
                  {field === 'email_enabled' && '✉️ Email'}
                  {field === 'sms_enabled' && '📱 SMS'}
                  {field === 'push_enabled' && '🔔 Push (PWA)'}
                </span>
              </label>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Numéro SMS</label>
            <input
              type="tel"
              value={preferences.phone_number || ''}
              onChange={e => handleChange('phone_number', e.target.value)}
              className="input"
              placeholder="+336..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Heure début silence</label>
              <input
                type="time"
                value={preferences.quiet_hours_start || ''}
                onChange={e => handleChange('quiet_hours_start', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Heure fin silence</label>
              <input
                type="time"
                value={preferences.quiet_hours_end || ''}
                onChange={e => handleChange('quiet_hours_end', e.target.value)}
                className="input"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {[
              { field: 'notify_battery_low', label: 'Batterie faible' },
              { field: 'notify_device_offline', label: 'Dispositif hors ligne' },
              { field: 'notify_abnormal_flow', label: 'Débit anormal' },
              { field: 'notify_new_patient', label: 'Nouveau patient' }
            ].map(option => (
              <label key={option.field} className="flex items-center gap-2 text-sm bg-gray-50 px-3 py-2 rounded-lg">
                <input
                  type="checkbox"
                  checked={!!preferences[option.field]}
                  onChange={() => handleToggle(option.field)}
                />
                {option.label}
              </label>
            ))}
          </div>

          <button
            className="btn-primary"
            onClick={savePreferences}
            disabled={saving}
          >
            {saving ? 'Enregistrement...' : '💾 Enregistrer'}
          </button>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Queue des notifications</h2>
          <div className="space-y-3 max-h-[420px] overflow-y-auto">
            {queue.length === 0 ? (
              <p className="text-gray-500 text-sm">Aucune notification en attente.</p>
            ) : (
              queue.map(item => (
                <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="badge bg-primary-50 text-primary-700">{item.type.toUpperCase()}</span>
                    <span className="text-xs text-gray-500">{item.status}</span>
                  </div>
                  <p className="font-semibold text-gray-900">{item.subject || 'Notification'}</p>
                  <p className="text-sm text-gray-600">{item.message}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    → {item.email} ({item.priority})
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

