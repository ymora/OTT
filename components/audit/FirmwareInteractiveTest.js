'use client'

import { useState, useEffect } from 'react'
import { useUsb } from '@/contexts/UsbContext'
import logger from '@/lib/logger'

/**
 * Composant pour tester le firmware en temps réel via USB
 * Utilisé par l'audit pour vérifier que le firmware répond correctement
 */
export default function FirmwareInteractiveTest({ onTestComplete, compact = false }) {
  const { 
    isConnected, 
    port, 
    write: usbWrite, 
    usbDeviceInfo,
    usbStreamLogs 
  } = useUsb()
  
  const [testResults, setTestResults] = useState({
    version: null,
    commandsSupported: [],
    commandsTested: [],
    errors: [],
    score: 10
  })
  const [testing, setTesting] = useState(false)

  // Détecter la version du firmware depuis les logs USB
  useEffect(() => {
    if (!usbStreamLogs || usbStreamLogs.length === 0) return
    
    // Chercher la version dans les logs
    const versionLog = usbStreamLogs.find(log => 
      log.line && (log.line.includes('firmware_version') || log.line.includes('FIRMWARE_VERSION') || log.line.includes('v2.0'))
    )
    
    if (versionLog) {
      // Extraire la version
      const versionMatch = versionLog.line.match(/v?(\d+\.\d+(?:\.\d+)?)|firmware_version["\s:]+([^"}\s]+)/i)
      if (versionMatch) {
        const detectedVersion = versionMatch[1] || versionMatch[2]
        setTestResults(prev => ({ ...prev, version: detectedVersion }))
      }
    }
    
    // Vérifier aussi dans usbDeviceInfo
    if (usbDeviceInfo?.firmware_version) {
      setTestResults(prev => ({ ...prev, version: usbDeviceInfo.firmware_version }))
    }
  }, [usbStreamLogs, usbDeviceInfo])

  // Tester les commandes supportées
  const testCommands = async () => {
    if (!isConnected || !port || !usbWrite) {
      logger.warn('[FirmwareTest] USB non connecté, impossible de tester')
      return
    }

    setTesting(true)
    const results = {
      version: testResults.version || usbDeviceInfo?.firmware_version || 'inconnue',
      commandsSupported: [],
      commandsTested: [],
      errors: [],
      score: 10
    }

    try {
      // Test 1: GET_CONFIG
      logger.log('[FirmwareTest] Test GET_CONFIG...')
      try {
        const getConfigCmd = JSON.stringify({ command: 'GET_CONFIG' }) + '\n'
        await usbWrite(getConfigCmd)
        
        // Attendre la réponse (max 5 secondes)
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // Vérifier si on a reçu une réponse dans les logs
        const configResponse = usbStreamLogs.slice(-10).find(log => 
          log.line && (log.line.includes('config_response') || log.line.includes('GET_CONFIG'))
        )
        
        if (configResponse) {
          results.commandsTested.push({ command: 'GET_CONFIG', status: 'success' })
          results.commandsSupported.push('GET_CONFIG')
          logger.log('[FirmwareTest] ✅ GET_CONFIG répond correctement')
        } else {
          results.commandsTested.push({ command: 'GET_CONFIG', status: 'timeout' })
          results.errors.push('GET_CONFIG: Timeout (pas de réponse dans les 2 secondes)')
          results.score -= 1
          logger.warn('[FirmwareTest] ⚠️ GET_CONFIG: Timeout')
        }
      } catch (err) {
        results.commandsTested.push({ command: 'GET_CONFIG', status: 'error' })
        results.errors.push(`GET_CONFIG: ${err.message}`)
        results.score -= 1
        logger.error('[FirmwareTest] ❌ GET_CONFIG erreur:', err)
      }

      // Test 2: GET_STATUS (si supporté)
      logger.log('[FirmwareTest] Test GET_STATUS...')
      try {
        const getStatusCmd = JSON.stringify({ command: 'GET_STATUS' }) + '\n'
        await usbWrite(getStatusCmd)
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        const statusResponse = usbStreamLogs.slice(-10).find(log => 
          log.line && (log.line.includes('status') || log.line.includes('GET_STATUS'))
        )
        
        if (statusResponse) {
          results.commandsTested.push({ command: 'GET_STATUS', status: 'success' })
          results.commandsSupported.push('GET_STATUS')
          logger.log('[FirmwareTest] ✅ GET_STATUS répond correctement')
        } else {
          results.commandsTested.push({ command: 'GET_STATUS', status: 'timeout' })
          logger.warn('[FirmwareTest] ⚠️ GET_STATUS: Timeout (peut être normal si non supporté)')
        }
      } catch (err) {
        logger.warn('[FirmwareTest] ⚠️ GET_STATUS erreur (peut être normal):', err)
      }

    } catch (err) {
      logger.error('[FirmwareTest] Erreur générale:', err)
      results.errors.push(`Erreur générale: ${err.message}`)
      results.score -= 2
    } finally {
      setTesting(false)
      setTestResults(results)
      if (onTestComplete) {
        onTestComplete(results)
      }
    }
  }

  // Auto-tester si USB connecté
  useEffect(() => {
    if (isConnected && port && usbWrite && !testing && testResults.commandsTested.length === 0) {
      // Attendre un peu que le streaming soit stable
      const timer = setTimeout(() => {
        testCommands()
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [isConnected, port, usbWrite])

  if (!isConnected) {
    return null // Ne rien afficher si USB non connecté
  }

  const content = (
    <>
      {testing && (
        <p className="text-xs text-gray-600 dark:text-gray-400">
          ⏳ Test en cours...
        </p>
      )}
      
      {!testing && testResults.commandsTested.length > 0 && (
        <div className="space-y-1 text-xs">
          <p className="text-gray-700 dark:text-gray-300">
            <strong>Version:</strong> {testResults.version || 'inconnue'}
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            <strong>Commandes testées:</strong> {testResults.commandsTested.length}
          </p>
          {testResults.commandsSupported.length > 0 && (
            <p className="text-green-700 dark:text-green-400">
              ✅ {testResults.commandsSupported.join(', ')}
            </p>
          )}
          {testResults.errors.length > 0 && (
            <div className="text-red-700 dark:text-red-400 text-xs">
              ⚠️ {testResults.errors.join('; ')}
            </div>
          )}
        </div>
      )}
      
      {!testing && testResults.commandsTested.length === 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-500">
          En attente...
        </div>
      )}
    </>
  )

  if (compact) {
    return content
  }

  return (
    <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20">
      <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
        🔧 Tests Interactifs Firmware (USB)
      </h3>
      {content}
    </div>
  )
}

