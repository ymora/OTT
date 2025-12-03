'use client'

// Désactiver le pré-rendu statique
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useUsb } from '@/contexts/UsbContext'
import { useUsbAutoDetection } from '@/hooks'
import logger from '@/lib/logger'
import InoEditorTab from '@/components/configuration/InoEditorTab'
import UsbStreamingTab from '@/components/configuration/UsbStreamingTab'

export default function OutilsPage() {
  const { user, fetchWithAuth, API_URL } = useAuth()
  const { 
    isSupported, 
    autoDetecting, 
    setAutoDetecting, 
    usbConnectedDevice, 
    usbVirtualDevice,
    setSendMeasurementCallback,
    setUpdateDeviceFirmwareCallback
  } = useUsb()
  
  // Activer la détection automatique USB
  useUsbAutoDetection(isSupported, autoDetecting, setAutoDetecting, usbConnectedDevice, usbVirtualDevice)

  // Log immédiat de la page
  useEffect(() => {
    logger.log('🏁 [OUTILS-PAGE] ========== PAGE OUTILS MONTÉE ==========')
    logger.log('🏁 [OUTILS-PAGE] URL:', window.location.href)
    logger.log('🏁 [OUTILS-PAGE] User:', user?.email, 'Role:', user?.role_name)
    return () => {
      logger.log('🔴 [OUTILS-PAGE] Page démontée')
    }
  }, [])
  
  // Configurer les callbacks USB pour enregistrer automatiquement les dispositifs dans la base
  useEffect(() => {
    if (!fetchWithAuth || !API_URL) {
      return
    }
    
    const sendMeasurement = async (measurementData) => {
      try {
        const response = await fetchWithAuth(
          `${API_URL}/api.php/devices/measurements`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(measurementData)
          },
          { requiresAuth: false }
        )
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Erreur HTTP ${response.status}`)
        }
        
        return await response.json()
      } catch (err) {
        logger.error('❌ Erreur envoi mesure USB:', err)
        throw err
      }
    }
    
    const updateDevice = async (identifier, firmwareVersion, updateData = {}) => {
      try {
        const devicesResponse = await fetchWithAuth(
          `${API_URL}/api.php/devices`,
          { method: 'GET' },
          { requiresAuth: true }
        )
        
        if (!devicesResponse.ok) return
        
        const devicesData = await devicesResponse.json()
        const devices = devicesData.devices || []
        
        const device = devices.find(d => 
          d.sim_iccid === identifier || 
          d.device_serial === identifier ||
          d.device_name === identifier
        )
        
        // ✨ AUTO-CRÉATION: Si le dispositif n'existe pas, le créer automatiquement
        if (!device) {
          logger.log(`🆕 [AUTO-CREATE] Dispositif non trouvé (${identifier}), création automatique...`)
          
          const createPayload = {
            device_name: updateData.device_name || `USB-${identifier.slice(-4)}`,
            sim_iccid: updateData.sim_iccid || (identifier.startsWith('89') ? identifier : null),
            device_serial: updateData.device_serial || (!identifier.startsWith('89') ? identifier : null),
            firmware_version: firmwareVersion || null,
            status: updateData.status || 'usb_connected',
            last_seen: updateData.last_seen || new Date().toISOString()
          }
          
          if (updateData.last_battery !== undefined) createPayload.last_battery = updateData.last_battery
          if (updateData.last_flowrate !== undefined) createPayload.last_flowrate = updateData.last_flowrate
          if (updateData.last_rssi !== undefined) createPayload.last_rssi = updateData.last_rssi
          
          await fetchWithAuth(
            `${API_URL}/api.php/devices`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(createPayload)
            },
            { requiresAuth: true }
          )
          
          logger.log('✅ [AUTO-CREATE] Dispositif créé avec succès')
          return
        }
        
        // MISE À JOUR: Le dispositif existe
        const updatePayload = { ...updateData }
        if (firmwareVersion && firmwareVersion !== '') {
          updatePayload.firmware_version = firmwareVersion
        }
        
        await fetchWithAuth(
          `${API_URL}/api.php/devices/${device.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload)
          },
          { requiresAuth: true }
        )
      } catch (err) {
        // Ignorer silencieusement les erreurs de mise à jour
      }
    }
    
    setSendMeasurementCallback(sendMeasurement)
    setUpdateDeviceFirmwareCallback(updateDevice)
    
    return () => {
      setSendMeasurementCallback(null)
      setUpdateDeviceFirmwareCallback(null)
    }
  }, [fetchWithAuth, API_URL, setSendMeasurementCallback, setUpdateDeviceFirmwareCallback])

  // Vérifier les permissions (admin ou technicien)
  const canAccess = user?.role_name === 'admin' || user?.role_name === 'technicien'

  // Onglet actif (Dispositifs par défaut)
  const [activeTab, setActiveTab] = useState('streaming')
  
  // Log à chaque changement d'onglet
  useEffect(() => {
    logger.log('📑 [OUTILS-PAGE] Onglet actif:', activeTab, activeTab === 'streaming' ? '(UsbStreamingTab affiché)' : '(InoEditorTab affiché)')
  }, [activeTab])

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

