'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useUsb } from '@/contexts/UsbContext'
import { useUsbAutoDetection } from '@/hooks'
import InoEditorTab from '@/components/configuration/InoEditorTab'
import CompileInoTab from '@/components/configuration/CompileInoTab'
import FirmwareFlashTab from '@/components/configuration/FirmwareFlashTab'
import UsbStreamingTab from '@/components/configuration/UsbStreamingTab'
import DeviceConfigurationTab from '@/components/configuration/DeviceConfigurationTab'

export default function OutilsPage() {
  const { user } = useAuth()
  const { isSupported, autoDetecting, setAutoDetecting, usbConnectedDevice, usbVirtualDevice } = useUsb()
  
  // Activer la détection automatique USB
  useUsbAutoDetection(isSupported, autoDetecting, setAutoDetecting, usbConnectedDevice, usbVirtualDevice)

  // Vérifier les permissions (admin ou technicien)
  const canAccess = user?.role_name === 'admin' || user?.role_name === 'technicien'

  // Onglet actif
  const [activeTab, setActiveTab] = useState('ino')

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
    { id: 'ino', label: 'Upload INO', icon: '📝' },
    { id: 'compile', label: 'Compile INO', icon: '🔨' },
    { id: 'flash', label: 'Flash', icon: '🔌' },
    { id: 'configuration', label: 'Configuration', icon: '⚙️' },
    { id: 'streaming', label: 'Streaming USB', icon: '📡' }
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">⚙️ Outils</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestion des firmwares, flash USB et streaming
          </p>
        </div>
      </div>

      {/* Onglets */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                py-4 px-1 border-b-2 font-medium text-sm transition-colors
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

      {/* Contenu des onglets */}
      <div className="mt-6">
        {activeTab === 'ino' && <InoEditorTab />}
        {activeTab === 'compile' && <CompileInoTab />}
        {activeTab === 'flash' && <FirmwareFlashTab />}
        {activeTab === 'configuration' && <DeviceConfigurationTab />}
        {activeTab === 'streaming' && <UsbStreamingTab />}
      </div>
    </div>
  )
}

