'use client'

// Désactiver le pré-rendu statique
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useUsb } from '@/contexts/UsbContext'
import { useUsbAutoDetection } from '@/hooks'
import InoEditorTab from '@/components/configuration/InoEditorTab'
import UsbStreamingTab from '@/components/configuration/UsbStreamingTab'

export default function OutilsPage() {
  const { user } = useAuth()
  const { isSupported, autoDetecting, setAutoDetecting, usbConnectedDevice, usbVirtualDevice } = useUsb()
  
  // Activer la détection automatique USB
  useUsbAutoDetection(isSupported, autoDetecting, setAutoDetecting, usbConnectedDevice, usbVirtualDevice)


  // Vérifier les permissions (admin ou technicien)
  const canAccess = user?.role_name === 'admin' || user?.role_name === 'technicien'

  // Onglet actif (Dispositifs par défaut)
  const [activeTab, setActiveTab] = useState('streaming')

  if (!canAccess) {
    return (
      <div className="p-6">
        <div className="alert alert-warning">
          Accès refusé. Seuls les administrateurs et techniciens peuvent accéder aux outils.
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'streaming', label: 'Dispositifs', icon: '🔧' },
    { id: 'ino', label: 'Upload INO', icon: '📝' }
  ]

  return (
    <div className="space-y-6">
      {/* Onglets */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                py-4 px-1 border-b-2 font-medium text-sm transition-colors relative
                ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }
              `}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Contenu des onglets - Ne pas démonter les composants pour garder les connexions SSE ouvertes */}
      <div className="mt-6">
        <div style={{ display: activeTab === 'ino' ? 'block' : 'none' }}>
          <InoEditorTab />
        </div>
        <div style={{ display: activeTab === 'streaming' ? 'block' : 'none' }}>
          <UsbStreamingTab />
        </div>
      </div>

    </div>
  )
}

