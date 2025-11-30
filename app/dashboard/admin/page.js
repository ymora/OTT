'use client'

// Désactiver le pré-rendu statique
export const dynamic = 'force-dynamic'

import { useAuth } from '@/contexts/AuthContext'

export default function AdminToolsPage() {
  const { user } = useAuth()

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="animate-slide-up">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Administration</h1>
        <p className="text-gray-600">Outils d'administration du système OTT.</p>
      </div>

      <div className="card space-y-4">
        <h2 className="text-xl font-semibold">Informations système</h2>
        <p className="text-gray-600">
          La base de données est en mode production. Le mode démo a été désactivé.
        </p>
        
        {user && (
          <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <strong>Utilisateur connecté :</strong> {user.email} ({user.role_name})
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

