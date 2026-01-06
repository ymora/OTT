/**
 * Interface unifiée pour Firmware Management
 * Upload → Compilation → Flash (tout-en-un)
 */

'use client'

import { useState, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useApiCall } from '@/hooks'
import { useUsb } from '@/contexts/UsbContext'
import { useSerialPort } from '@/components/SerialPortManager'
import logger from '@/lib/logger'
import Modal from '@/components/Modal'
import SuccessMessage from '@/components/SuccessMessage'

export default function FirmwareManager({ isOpen, onClose }) {
  const { fetchWithAuth, API_URL, user } = useAuth()
  const { isConnected: usbIsConnected, pauseUsbStreaming } = useUsb()
  const { isConnected: serialIsConnected, connect, disconnect, requestPort, startReading } = useSerialPort()
  
  // États
  const [activeTab, setActiveTab] = useState('upload') // 'upload' | 'compile' | 'flash'
  const [uploadProgress, setUploadProgress] = useState(0)
  const [compileStatus, setCompileStatus] = useState(null)
  const [flashStatus, setFlashStatus] = useState(null)
  const [terminalLogs, setTerminalLogs] = useState([])
  const [selectedFirmware, setSelectedFirmware] = useState(null)
  
  // Références
  const fileInputRef = useRef(null)
  const stopReadingRef = useRef(null)
  
  // Utilitaires
  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    const logEntry = `[${timestamp}] ${message}`
    console.log(logEntry)
    setTerminalLogs(prev => [...prev, { message: logEntry, type, timestamp: Date.now() }])
  }, [])

  // Vérifier permissions admin
  const hasPermission = user?.role_name === 'admin' || user?.role_name === 'technicien'

  // 1. UPLOAD DU FIRMWARE (.ino)
  const handleFileUpload = useCallback(async (event) => {
    const file = event.target.files[0]
    if (!file || !file.name.endsWith('.ino')) {
      addLog('❌ Veuillez sélectionner un fichier .ino', 'error')
      return
    }

    setUploadProgress(0)
    addLog(`📤 Upload du fichier: ${file.name}`, 'info')

    try {
      const formData = new FormData()
      formData.append('firmware', file)
      
      // Simuler la progression
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90))
      }, 200)

      const response = await fetchWithAuth(`${API_URL}/api.php/firmwares/upload`, {
        method: 'POST',
        body: formData
      })

      clearInterval(progressInterval)
      setUploadProgress(100)

      if (response.ok) {
        const result = await response.json()
        addLog(`✅ Firmware uploadé avec succès! ID: ${result.firmware_id}`, 'success')
        setSelectedFirmware(result.firmware)
        setActiveTab('compile')
      } else {
        throw new Error('Upload échoué')
      }
    } catch (error) {
      clearInterval(progressInterval)
      setUploadProgress(0)
      addLog(`❌ Erreur upload: ${error.message}`, 'error')
    }
  }, [fetchWithAuth, API_URL, addLog])

  // 2. COMPILATION (appel du script PowerShell optimisé)
  const handleCompile = useCallback(async () => {
    if (!selectedFirmware) {
      addLog('❌ Aucun firmware sélectionné pour la compilation', 'error')
      return
    }

    setCompileStatus('compiling')
    addLog('🔧 Démarrage compilation rapide...', 'info')

    try {
      // Appeler l'endpoint de compilation (GET avec SSE)
      const firmwareId = selectedFirmware.firmware_id || selectedFirmware.id
      const response = await fetchWithAuth(`${API_URL}/api.php/firmwares/compile/${firmwareId}`, {
        method: 'GET'
      })

      if (!response.ok) {
        throw new Error('Compilation échouée')
      }

      // Lire les messages SSE
      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              
              if (data.type === 'success') {
                setCompileStatus('compiled')
                addLog('✅ Compilation réussie!', 'success')
                setActiveTab('flash')
              } else if (data.type === 'error') {
                setCompileStatus('error')
                addLog(`❌ Erreur compilation: ${data.message}`, 'error')
              } else if (data.type === 'log') {
                addLog(data.message, data.level || 'info')
              }
            } catch (e) {
              // Ignorer les erreurs de parsing
            }
          }
        }
      }
    } catch (error) {
      setCompileStatus('error')
      addLog(`❌ Erreur compilation: ${error.message}`, 'error')
    }
  }, [selectedFirmware, fetchWithAuth, API_URL, addLog])

  // 3. FLASH USB DIRECT (optimisé)
  const handleFlashUsb = useCallback(async () => {
    if (!selectedFirmware) {
      addLog('❌ Aucun firmware sélectionné pour le flash', 'error')
      return
    }

    // Mettre en pause le streaming USB si actif
    if (usbIsConnected) {
      addLog('⏸️ Mise en pause du streaming USB...', 'info')
      pauseUsbStreaming()
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    setFlashStatus('connecting')
    addLog('🚀 Démarrage flash rapide...', 'info')

    try {
      // Appeler l'endpoint de flash optimisé
      const response = await fetchWithAuth(`${API_URL}/api.php/firmwares/flash_fast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firmware_id: selectedFirmware.firmware_id,
          port: 'COM3'
        })
      })

      if (!response.ok) {
        throw new Error('Flash échoué')
      }

      // Lire les messages SSE
      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              
              if (data.type === 'success') {
                setFlashStatus('completed')
                addLog('✅ Flash terminé avec succès!', 'success')
                
                // Redémarrer la lecture des logs
                setTimeout(() => {
                  startReading((data) => {
                    addLog(data, 'device')
                  })
                }, 2000)
              } else if (data.type === 'error') {
                setFlashStatus('error')
                addLog(`❌ Erreur flash: ${data.message}`, 'error')
              } else if (data.type === 'log') {
                addLog(data.message, data.level || 'info')
              }
            } catch (e) {
              // Ignorer les erreurs de parsing
            }
          }
        }
      }
    } catch (error) {
      setFlashStatus('error')
      addLog(`❌ Erreur flash: ${error.message}`, 'error')
    }
  }, [selectedFirmware, usbIsConnected, pauseUsbStreaming, startReading, fetchWithAuth, API_URL, addLog])

  // Interface
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="large">
      <div className="space-y-6">
        {/* En-tête */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            🚀 Gestionnaire Firmware
          </h2>
          {!hasPermission && (
            <span className="text-sm text-red-600">
              ⚠️ Admin/Technicien requis
            </span>
          )}
        </div>

        {/* Onglets */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {['upload', 'compile', 'flash'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-300'
              }`}
              disabled={!hasPermission}
            >
              {tab === 'upload' && '📤 Upload'}
              {tab === 'compile' && '🔧 Compiler'}
              {tab === 'flash' && '🚀 Flash'}
            </button>
          ))}
        </div>

        {/* Contenu des onglets */}
        <div className="min-h-96">
          {/* ONGLET UPLOAD */}
          {activeTab === 'upload' && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".ino"
                  onChange={handleFileUpload}
                  disabled={!hasPermission}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!hasPermission}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  📤 Choisir un fichier .ino
                </button>
                <p className="text-sm text-gray-500 mt-2">
                  Sélectionnez le fichier source du firmware à compiler
                </p>
              </div>

              {/* Barre de progression - seulement pour l'upload, pas pour la compilation */}
              {activeTab === 'upload' && uploadProgress > 0 && (
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* ONGLET COMPILE */}
          {activeTab === 'compile' && (
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
                <h3 className="font-semibold mb-4">🔧 Compilation du Firmware</h3>
                
                {selectedFirmware && (
                  <div className="mb-4 p-4 bg-white dark:bg-gray-700 rounded border">
                    <p className="font-medium">Firmware sélectionné:</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      ID: {selectedFirmware.firmware_id} | 
                      Nom: {selectedFirmware.name || 'Sans nom'} |
                      Version: {selectedFirmware.version || 'Inconnue'}
                    </p>
                  </div>
                )}

                <div className="flex gap-4">
                  <button
                    onClick={handleCompile}
                    disabled={!selectedFirmware || compileStatus === 'compiling'}
                    className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {compileStatus === 'compiling' ? '⏳ Compilation...' : '🔧 Compiler'}
                  </button>
                  
                  {compileStatus === 'compiled' && (
                    <button
                      onClick={() => setActiveTab('flash')}
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      ➡️ Passer au Flash
                    </button>
                  )}
                </div>

                {compileStatus && (
                  <div className={`mt-4 p-4 rounded ${
                    compileStatus === 'compiled' ? 'bg-green-50 text-green-800 border border-green-200' :
                    compileStatus === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
                    'bg-blue-50 text-blue-800 border border-blue-200'
                  }`}>
                    {compileStatus === 'compiled' && '✅ Compilation réussie!'}
                    {compileStatus === 'error' && '❌ Erreur de compilation'}
                    {compileStatus === 'compiling' && '⏳ Compilation en cours...'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ONGLET FLASH */}
          {activeTab === 'flash' && (
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
                <h3 className="font-semibold mb-4">🚀 Flash du Firmware</h3>
                
                {selectedFirmware && (
                  <div className="mb-4 p-4 bg-white dark:bg-gray-700 rounded border">
                    <p className="font-medium">Firmware à flasher:</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      ID: {selectedFirmware.firmware_id} | 
                      Nom: {selectedFirmware.name || 'Sans nom'} |
                      Version: {selectedFirmware.version || 'Inconnue'}
                    </p>
                  </div>
                )}

                <div className="flex gap-4">
                  <button
                    onClick={handleFlashUsb}
                    disabled={!selectedFirmware || flashStatus === 'flashing'}
                    className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {flashStatus === 'flashing' ? '⏳ Flash en cours...' : '🚀 Flash USB'}
                  </button>
                  
                  {flashStatus === 'completed' && (
                    <div className="text-green-600 font-medium">
                      ✅ Flash terminé!
                    </div>
                  )}
                </div>

                {flashStatus && (
                  <div className={`mt-4 p-4 rounded ${
                    flashStatus === 'completed' ? 'bg-green-50 text-green-800 border border-green-200' :
                    flashStatus === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
                    'bg-blue-50 text-blue-800 border border-blue-200'
                  }`}>
                    {flashStatus === 'completed' && '✅ Flash réussi! Le dispositif va redémarrer.'}
                    {flashStatus === 'error' && '❌ Erreur de flash'}
                    {flashStatus === 'flashing' && '⏳ Flash en cours... Ne débranchez pas!'}
                    {flashStatus === 'connecting' && '🔍 Connexion au dispositif...'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Terminal de logs */}
        <div className="border-2 border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
          <div className="bg-gray-100 dark:bg-gray-900 px-4 py-2 border-b border-gray-300 dark:border-gray-600">
            <h3 className="font-mono text-sm font-semibold text-gray-700 dark:text-gray-300">
              📋 Terminal ({terminalLogs.length} logs)
            </h3>
          </div>
          
          <div className="h-64 overflow-y-auto bg-black text-green-400 font-mono text-sm p-4">
            {terminalLogs.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                Aucun log... Lancez une opération pour voir les détails
              </div>
            ) : (
              terminalLogs.map((log, index) => (
                <div 
                  key={log.timestamp || index} 
                  className={`mb-1 ${
                    log.type === 'error' ? 'text-red-400' :
                    log.type === 'success' ? 'text-green-400' :
                    log.type === 'warning' ? 'text-yellow-400' :
                    'text-green-400'
                  }`}
                >
                  {log.message}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
