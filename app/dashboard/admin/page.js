'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

const RESET_AVAILABLE = process.env.NEXT_PUBLIC_ENABLE_DEMO_RESET === 'true'

export default function AdminToolsPage() {
  const { user, fetchWithAuth, API_URL } = useAuth()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)

  const isAdmin = user?.role_name === 'admin'

  const handleReset = async () => {
    if (!RESET_AVAILABLE || !isAdmin) return
    const confirmed = window.confirm(
      'Cette action TRONQUE toutes les tables et recharge les données de démonstration. Continuer ?'
    )
    if (!confirmed) return

    setLoading(true)
    setStatus(null)
    try {
      const response = await fetchWithAuth(
        `${API_URL}/api.php/admin/reset-demo`,
        { method: 'POST' },
        { requiresAuth: true }
      )
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Réinitialisation impossible')
      }
      setStatus({ type: 'success', payload: data })
    } catch (error) {
      setStatus({ type: 'error', message: error.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="animate-slide-up">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Administration</h1>
        <p className="text-gray-600">Réinitialiser la base Render avec le jeu de données de démonstration.</p>
      </div>

      <div className="card space-y-4">
        <h2 className="text-xl font-semibold">Réinitialisation base de démo</h2>
        <p className="text-gray-600">
          Cette action exécute <code>base_seed.sql</code> puis <code>demo_seed.sql</code> sur la base configurée
          par l&apos;API. Toutes les mesures, alertes, utilisateurs personnalisés et commandes seront supprimées.
        </p>

        {!RESET_AVAILABLE && (
          <div className="alert alert-warning">
            <strong>Option désactivée.</strong> Définissez <code>ENABLE_DEMO_RESET=true</code> (backend) et
            <code>NEXT_PUBLIC_ENABLE_DEMO_RESET=true</code> (frontend) pour autoriser cette opération.
          </div>
        )}

        {RESET_AVAILABLE && !isAdmin && (
          <div className="alert alert-warning">
            <strong>Accès restreint.</strong> Seuls les comptes admin peuvent lancer la réinitialisation.
          </div>
        )}

        {status?.type === 'success' && (
          <div className="alert alert-success">
            <p className="font-semibold">{status.payload.message}</p>
            {status.payload.meta && (
              <ul className="text-sm text-gray-700 mt-2 space-y-1">
                <li>Temps d&apos;exécution : {status.payload.meta.duration_ms} ms</li>
                <li>Tables réinitialisées : {status.payload.meta.tables_reset}</li>
              </ul>
            )}
          </div>
        )}

        {status?.type === 'error' && (
          <div className="alert alert-error">
            <strong>Erreur :</strong> {status.message}
          </div>
        )}

        <button
          className="btn-danger w-full md:w-auto"
          disabled={loading || !RESET_AVAILABLE || !isAdmin}
          onClick={handleReset}
        >
          {loading ? 'Réinitialisation en cours...' : 'Réinitialiser la base de démo'}
        </button>
      </div>
    </div>
  )
}

