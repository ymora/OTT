'use client'

// Désactiver le pré-rendu statique
export const dynamic = 'force-dynamic'

import { useState, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useUsb } from '@/contexts/UsbContext'
import { useUsbAutoDetection } from '@/hooks'
import { useApiData } from '@/hooks'
import { createDataSourceTracker, getDataSourceBadge } from '@/lib/dataSourceTracker'
import InoEditorTab from '@/components/configuration/InoEditorTab'
import FirmwareFlashTab from '@/components/configuration/FirmwareFlashTab'
import UsbStreamingTab from '@/components/configuration/UsbStreamingTab'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function OutilsPage() {
  const { user } = useAuth()
  const { isSupported, autoDetecting, setAutoDetecting, usbConnectedDevice, usbVirtualDevice, usbStreamLastMeasurement } = useUsb()
  
  // Activer la détection automatique USB
  useUsbAutoDetection(isSupported, autoDetecting, setAutoDetecting, usbConnectedDevice, usbVirtualDevice)

  // Charger les dispositifs
  const { data, loading } = useApiData(
    ['/api.php/devices'],
    { requiresAuth: true }
  )

  const devices = data?.devices?.devices || []

  // Combiner les dispositifs réels avec le dispositif virtuel USB
  const allDevices = useMemo(() => {
    const realDevices = [...devices]
    
    if (usbConnectedDevice) {
      return realDevices
    }
    
    if (usbVirtualDevice) {
      const isDuplicate = realDevices.some(d => {
        if (usbVirtualDevice.sim_iccid && d.sim_iccid && 
            (d.sim_iccid.includes(usbVirtualDevice.sim_iccid) || 
             usbVirtualDevice.sim_iccid.includes(d.sim_iccid))) {
          return true
        }
        if (usbVirtualDevice.device_serial && d.device_serial && 
            (d.device_serial.includes(usbVirtualDevice.device_serial) || 
             usbVirtualDevice.device_serial.includes(d.device_serial))) {
          return true
        }
        if (usbVirtualDevice.device_name && d.device_name && 
            d.device_name === usbVirtualDevice.device_name) {
          return true
        }
        return false
      })
      
      if (!isDuplicate && !realDevices.find(d => d.id === usbVirtualDevice.id)) {
        realDevices.push(usbVirtualDevice)
      }
    }
    
    return realDevices
  }, [devices, usbVirtualDevice, usbConnectedDevice])

  // Fonctions utilitaires pour les badges
  const getStatusBadge = (device) => {
    if (device.isVirtual) {
      return { label: '🔌 USB', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' }
    }
    if (!device.last_seen) {
      return { label: '❓ Inconnu', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' }
    }
    const lastSeen = new Date(device.last_seen)
    const now = new Date()
    const diffMinutes = (now - lastSeen) / (1000 * 60)
    
    if (diffMinutes < 5) {
      return { label: '🟢 En ligne', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' }
    } else if (diffMinutes < 60) {
      return { label: '🟡 Récent', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' }
    } else if (diffMinutes < 1440) {
      return { label: '🟠 Inactif', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' }
    } else {
      return { label: '🔴 Hors ligne', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' }
    }
  }

  const getBatteryBadge = (battery) => {
    if (battery === null || battery === undefined) {
      return { label: 'N/A', color: 'text-gray-500 dark:text-gray-400' }
    }
    if (battery >= 80) {
      return { label: `${battery}%`, color: 'text-green-600 dark:text-green-400' }
    } else if (battery >= 50) {
      return { label: `${battery}%`, color: 'text-yellow-600 dark:text-yellow-400' }
    } else if (battery >= 20) {
      return { label: `${battery}%`, color: 'text-orange-600 dark:text-orange-400' }
    } else {
      return { label: `${battery}%`, color: 'text-red-600 dark:text-red-400' }
    }
  }

  // États pour les filtres
  const [searchTerm, setSearchTerm] = useState('')
  const [assignmentFilter, setAssignmentFilter] = useState('all')

  // Filtrer les dispositifs
  const filteredDevices = useMemo(() => {
    const needle = searchTerm.toLowerCase()
    return allDevices.filter(d => {
      const isVirtualUSB = d.isVirtual && d.status === 'usb_connected'
      
      const matchesSearch = searchTerm === '' || 
        d.device_name?.toLowerCase().includes(needle) ||
        d.sim_iccid?.includes(searchTerm) ||
        `${d.first_name || ''} ${d.last_name || ''}`.toLowerCase().includes(needle) ||
        (isVirtualUSB && (d.device_name?.toLowerCase().includes(needle) || 'usb'.includes(needle)))

      const isAssigned = Boolean(d.patient_id)
      const matchesAssignment =
        assignmentFilter === 'all' ||
        (assignmentFilter === 'assigned' && isAssigned) ||
        (assignmentFilter === 'unassigned' && !isAssigned) ||
        (isVirtualUSB && assignmentFilter === 'unassigned')

      return matchesSearch && matchesAssignment
    })
  }, [allDevices, searchTerm, assignmentFilter])

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
    { id: 'flash', label: 'Flash', icon: '🔌' },
    { id: 'streaming', label: 'Debug & Config', icon: '🔧' }
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">🔌 Dispositifs OTT</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestion des firmwares, flash USB et streaming
          </p>
        </div>
      </div>

      {/* Filtres et recherche */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-2">
          {[
            { id: 'all', label: 'Tous' },
            { id: 'assigned', label: 'Assignés' },
            { id: 'unassigned', label: 'Non assignés' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setAssignmentFilter(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                assignmentFilter === tab.id
                  ? 'bg-primary-600 text-white shadow-md dark:bg-primary-500'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 max-w-md">
          <input
            type="text"
            placeholder="🔍 Rechercher par nom, patient, ou ICCID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
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
        <div style={{ display: activeTab === 'flash' ? 'block' : 'none' }}>
          <FirmwareFlashTab />
        </div>
        <div style={{ display: activeTab === 'streaming' ? 'block' : 'none' }}>
          <UsbStreamingTab />
        </div>
      </div>

    </div>
  )
}

