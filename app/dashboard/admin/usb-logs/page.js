'use client'

import { useState } from 'react'
import UsbLogsViewer from '@/components/UsbLogsViewer'

/**
 * Page d'administration pour consulter les logs USB à distance
 * Accessible uniquement aux administrateurs
 */
export default function UsbLogsPage() {
  return (
    <div className="p-6 space-y-6">
      {/* En-tête de la page */}
      <div className="border-b border-gray-200 dark:border-slate-700 pb-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Monitoring USB à Distance
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Consultez en temps réel les logs des dispositifs USB connectés par les utilisateurs.
          Les logs sont automatiquement synchronisés depuis les PC locaux vers le serveur.
        </p>
      </div>

      {/* Informations importantes */}
      <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
        <div className="flex gap-3">
          <span className="text-2xl">ℹ️</span>
          <div className="space-y-2 text-sm text-blue-900 dark:text-blue-200">
            <p className="font-semibold">Comment ça fonctionne :</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Les logs sont envoyés automatiquement depuis les PC locaux toutes les 5 secondes</li>
              <li>Seuls les 7 derniers jours de logs sont conservés (nettoyage automatique)</li>
              <li>Les logs incluent à la fois les messages du firmware (device) et du dashboard</li>
              <li>L'actualisation automatique rafraîchit l'affichage toutes les 5 secondes</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Composant de visualisation des logs */}
      <UsbLogsViewer />

      {/* Informations techniques */}
      <div className="rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-4">
        <details className="cursor-pointer">
          <summary className="font-semibold text-gray-900 dark:text-gray-100">
            ⚙️ Informations techniques
          </summary>
          <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <p><strong>Base de données :</strong> Table <code className="bg-gray-200 dark:bg-slate-700 px-1 py-0.5 rounded">usb_logs</code></p>
            <p><strong>API Endpoints :</strong></p>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li><code className="bg-gray-200 dark:bg-slate-700 px-1 py-0.5 rounded">POST /api.php/usb-logs</code> - Enregistrer des logs (batch)</li>
              <li><code className="bg-gray-200 dark:bg-slate-700 px-1 py-0.5 rounded">GET /api.php/usb-logs</code> - Récupérer tous les logs</li>
              <li><code className="bg-gray-200 dark:bg-slate-700 px-1 py-0.5 rounded">GET /api.php/usb-logs/:device</code> - Logs d'un dispositif</li>
              <li><code className="bg-gray-200 dark:bg-slate-700 px-1 py-0.5 rounded">DELETE /api.php/usb-logs/cleanup</code> - Nettoyer les vieux logs</li>
            </ul>
            <p><strong>Rétention :</strong> 7 jours (configurable dans la fonction SQL <code className="bg-gray-200 dark:bg-slate-700 px-1 py-0.5 rounded">cleanup_old_usb_logs()</code>)</p>
            <p><strong>Limite :</strong> Maximum 100 logs par requête d'envoi (protection contre les abus)</p>
          </div>
        </details>
      </div>
    </div>
  )
}

