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

  // Détecter la version du firmware depuis les logs USB et usbDeviceInfo
  useEffect(() => {
    // Priorité: usbDeviceInfo (déjà parsé) > logs bruts
    if (usbDeviceInfo?.firmware_version) {
      setTestResults(prev => ({ ...prev, version: usbDeviceInfo.firmware_version }))
      return
    }
    
    if (!usbStreamLogs || usbStreamLogs.length === 0) return
    
    // Chercher la version dans les logs JSON (format config_response)
    const versionLog = usbStreamLogs.find(log => {
      if (!log.line) return false
      // Chercher JSON avec firmware_version
      if (log.line.startsWith('{') && log.line.includes('firmware_version')) {
        try {
          const json = JSON.parse(log.line)
          if (json.firmware_version) {
            return true
          }
        } catch (e) {
          // Pas un JSON valide, continuer
        }
      }
      // Chercher aussi dans les logs formatés
      return log.line.includes('firmware_version') || 
             log.line.includes('FIRMWARE_VERSION') || 
             log.line.includes('v2.') ||
             log.line.includes('v2.5')
    })
    
    if (versionLog) {
      // Essayer de parser le JSON d'abord
      if (versionLog.line.startsWith('{')) {
        try {
          const json = JSON.parse(versionLog.line)
          if (json.firmware_version) {
            setTestResults(prev => ({ ...prev, version: json.firmware_version }))
            return
          }
        } catch (e) {
          // Pas un JSON valide, continuer avec regex
        }
      }
      
      // Extraire la version avec regex
      const versionMatch = versionLog.line.match(/["']?firmware_version["']?\s*[:=]\s*["']?([^"',}\s]+)/i) ||
                          versionLog.line.match(/v(\d+\.\d+(?:\.\d+)?)/i)
      if (versionMatch) {
        const detectedVersion = versionMatch[1]
        setTestResults(prev => ({ ...prev, version: detectedVersion }))
      }
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
        // Sauvegarder le nombre de logs avant l'envoi
        const logsBefore = usbStreamLogs.length
        
        // Envoyer la commande
        const getConfigCmd = JSON.stringify({ command: 'GET_CONFIG' }) + '\n'
        logger.log('[FirmwareTest] 📤 Envoi commande:', getConfigCmd.trim())
        await usbWrite(getConfigCmd)
        
        // Attendre la réponse (augmenté à 5 secondes)
        logger.log('[FirmwareTest] ⏳ Attente réponse (5 secondes)...')
        
        // Attendre avec vérification périodique (plus réactif)
        // Vérifier à la fois usbDeviceInfo (mis à jour quand la réponse arrive) et usbStreamLogs
        let configResponse = null
        let configDetectedViaDeviceInfo = false
        const maxWaitTime = 5000
        const checkInterval = 200
        const maxChecks = Math.ceil(maxWaitTime / checkInterval)
        
        // État initial de usbDeviceInfo pour détecter les changements
        const initialConfig = usbDeviceInfo?.config
        const initialFirmwareVersion = usbDeviceInfo?.firmware_version
        
        for (let i = 0; i < maxChecks; i++) {
          await new Promise(resolve => setTimeout(resolve, checkInterval))
          
          // Vérifier d'abord usbDeviceInfo (plus fiable que les logs)
          // Si la config est mise à jour, c'est que la réponse config_response a été reçue
          const currentDeviceInfo = usbDeviceInfo
          if (currentDeviceInfo) {
            // Vérifier si la config a été mise à jour (signe que config_response a été reçue)
            const hasConfig = currentDeviceInfo.config && 
                              (currentDeviceInfo.config.sleep_minutes != null || 
                               currentDeviceInfo.config.measurement_duration_ms != null ||
                               currentDeviceInfo.config.calibration_coefficients)
            
            // Vérifier si firmware_version a été mis à jour
            const firmwareUpdated = currentDeviceInfo.firmware_version && 
                                    currentDeviceInfo.firmware_version !== initialFirmwareVersion
            
            // Si la config est complète OU si firmware_version est présent, c'est que la réponse a été reçue
            if (hasConfig || (firmwareUpdated && currentDeviceInfo.firmware_version)) {
              configDetectedViaDeviceInfo = true
              configResponse = { detected: true, source: 'usbDeviceInfo' }
              logger.log(`[FirmwareTest] ✅ Réponse détectée via usbDeviceInfo après ${(i + 1) * checkInterval}ms`)
              break
            }
          }
          
          // Vérifier aussi les logs (au cas où)
          const currentLogs = usbStreamLogs || []
          
          // Chercher la réponse dans TOUS les logs
          const logResponse = currentLogs.find(log => {
            if (!log || !log.line) return false
            const line = log.line.trim()
            
            // Chercher JSON avec type: "config_response"
            if (line.startsWith('{') && (line.includes('"type":"config_response"') || line.includes('"type": "config_response"'))) {
              return true
            }
            // Chercher aussi dans les logs formatés
            const lineLower = line.toLowerCase()
            if (lineLower.includes('config_response') || 
                lineLower.includes('configuration complète envoyée')) {
              return true
            }
            // Chercher JSON avec firmware_version + device_serial + sim_iccid (signature config_response)
            if (line.startsWith('{') && 
                line.includes('firmware_version') && 
                line.includes('device_serial') && 
                line.includes('sim_iccid') &&
                line.includes('sleep_minutes')) {
              return true
            }
            return false
          })
          
          if (logResponse) {
            configResponse = logResponse
            logger.log(`[FirmwareTest] ✅ Réponse détectée dans les logs après ${(i + 1) * checkInterval}ms`)
            break
          }
        }
        
        logger.log(`[FirmwareTest] 📊 État final:`)
        logger.log(`  - Logs totaux: ${usbStreamLogs?.length || 0}, Nouveaux: ${(usbStreamLogs?.length || 0) - logsBefore}`)
        logger.log(`  - usbDeviceInfo: ${usbDeviceInfo ? 'présent' : 'absent'}`)
        logger.log(`  - usbDeviceInfo.config: ${usbDeviceInfo?.config ? 'présent' : 'absent'}`)
        logger.log(`  - usbDeviceInfo.firmware_version: ${usbDeviceInfo?.firmware_version || 'absent'}`)
        
        // Afficher les derniers logs pour debug si pas de réponse
        if (!configResponse && usbStreamLogs && usbStreamLogs.length > 0) {
          logger.warn('[FirmwareTest] ⚠️ Derniers logs reçus (pour debug):')
          const lastLogs = usbStreamLogs.slice(-10)
          lastLogs.forEach((log, idx) => {
            const line = log?.line || ''
            logger.warn(`[FirmwareTest]   ${idx + 1}. ${line.substring(0, 150)}...`)
          })
        }
        
        if (configResponse) {
          results.commandsTested.push({ command: 'GET_CONFIG', status: 'success' })
          results.commandsSupported.push('GET_CONFIG')
          logger.log('[FirmwareTest] ✅ GET_CONFIG répond correctement')
          
          // Extraire la version depuis usbDeviceInfo ou depuis la réponse JSON
          if (configDetectedViaDeviceInfo && usbDeviceInfo?.firmware_version) {
            results.version = usbDeviceInfo.firmware_version
            logger.log('[FirmwareTest] 📌 Version détectée depuis usbDeviceInfo:', usbDeviceInfo.firmware_version)
          } else if (configResponse.line) {
            // Essayer d'extraire la version depuis la réponse JSON
            try {
              const jsonMatch = configResponse.line.match(/\{[^}]*"firmware_version"[^}]*\}/)
              if (jsonMatch) {
                const jsonData = JSON.parse(jsonMatch[0])
                if (jsonData.firmware_version) {
                  results.version = jsonData.firmware_version
                  logger.log('[FirmwareTest] 📌 Version détectée depuis réponse JSON:', jsonData.firmware_version)
                }
              }
            } catch (e) {
              // Ignorer erreur parsing JSON
            }
          }
        } else {
          results.commandsTested.push({ command: 'GET_CONFIG', status: 'timeout' })
          results.errors.push('GET_CONFIG: Timeout (pas de réponse dans les 5 secondes)')
          results.score -= 1
          logger.warn('[FirmwareTest] ⚠️ GET_CONFIG: Timeout - Aucune réponse détectée')
        }
      } catch (err) {
        results.commandsTested.push({ command: 'GET_CONFIG', status: 'error' })
        results.errors.push(`GET_CONFIG: ${err.message}`)
        results.score -= 1
        logger.error('[FirmwareTest] ❌ GET_CONFIG erreur:', err)
      }

      // Test 2: GET_STATUS (si supporté) - seulement si GET_CONFIG a réussi
      if (results.commandsSupported.includes('GET_CONFIG')) {
        logger.log('[FirmwareTest] Test GET_STATUS...')
        try {
          const logsBefore = usbStreamLogs.length
          const getStatusCmd = JSON.stringify({ command: 'GET_STATUS' }) + '\n'
          logger.log('[FirmwareTest] 📤 Envoi commande:', getStatusCmd.trim())
          await usbWrite(getStatusCmd)
          await new Promise(resolve => setTimeout(resolve, 5000))
          
          const newLogs = usbStreamLogs.slice(logsBefore)
          const statusResponse = newLogs.find(log => {
            if (!log.line) return false
            const line = log.line.toLowerCase()
            return line.includes('config_response') || 
                   line.includes('status') || 
                   line.includes('get_status')
          })
          
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

