'use client'

/**
 * Composant Console de Logs USB
 * Extrait de UsbStreamingTab.js pour réduire la complexité
 * 
 * Affiche les logs USB en temps réel avec formatage et catégorisation
 */

import { useState } from 'react'
import { useUsbLogs } from './hooks/useUsbLogs'
import { getUsbDeviceLabel } from '@/lib/usbDevices'
import logger from '@/lib/logger'
import ConfirmModal from '@/components/ConfirmModal'

export default function UsbConsole({
  // Props du contexte USB
  isConnected,
  isSupported,
  usbStreamStatus,
  usbStreamLogs = [],
  remoteLogs = [],
  isStreamingRemote = false,
  port,
  requestPort,
  connect,
  startUsbStreaming,
  pauseUsbStreaming,
  appendUsbStreamLog,
  clearUsbStreamLogs,
  // Références pour éviter les re-renders
  isStartingStreamRef,
  timeoutRefs,
  createTimeoutWithCleanup
}) {
  const { formatJsonLog, analyzeLogCategory, getLogColorClass } = useUsbLogs()
  const [showClearLogsModal, setShowClearLogsModal] = useState(false)

  // Fusionner les logs locaux et distants
  const allLogs = [...usbStreamLogs, ...remoteLogs]

  // Formater les logs pour l'affichage
  const formattedLogs = allLogs.map((log) => {
    const logLine = typeof log === 'string' ? log : (log?.line || String(log) || '')
    const logSource = typeof log === 'object' && log !== null ? (log.source || 'device') : 'device'
    const isRemote = typeof log === 'object' && log !== null ? (log.isRemote || false) : false
    const isDashboard = logSource === 'dashboard'

    // Essayer de formater le JSON si c'est un USB stream
    const formattedJson = formatJsonLog(logLine)
    let displayLine = formattedJson || logLine

    // Extraire ou déterminer la provenance entre crochets
    let provenance = null
    let cleanLine = displayLine

    // Chercher si une provenance existe déjà dans le log
    const provenanceMatch = displayLine.match(/^(\[[^\]]+\])/)
    if (provenanceMatch) {
      provenance = provenanceMatch[1]
      cleanLine = displayLine.replace(/^\[[^\]]+\]\s*/, '')
    } else {
      // Si pas de provenance, en ajouter une selon le contexte
      if (isDashboard) {
        if (displayLine.includes('📤') || displayLine.includes('ENVOI') || displayLine.includes('COMMANDE')) {
          provenance = '[CMD]'
        } else if (displayLine.includes('✅') || displayLine.includes('SUCCESS') || displayLine.includes('RÉUSSI')) {
          provenance = '[OK]'
        } else if (displayLine.includes('❌') || displayLine.includes('ERROR') || displayLine.includes('ÉCHEC')) {
          provenance = '[ERR]'
        } else if (displayLine.includes('⚠️') || displayLine.includes('WARN') || displayLine.includes('ATTENTION')) {
          provenance = '[WARN]'
        } else {
          provenance = '[DASHBOARD]'
        }
      } else {
        if (displayLine.includes('MODEM') || displayLine.includes('SIM') || displayLine.includes('APN') || displayLine.includes('RSSI')) {
          provenance = '[MODEM]'
        } else if (displayLine.includes('SENSOR') || displayLine.includes('AIRFLOW') || displayLine.includes('FLOW') || displayLine.includes('BATTERY')) {
          provenance = '[SENSOR]'
        } else if (displayLine.includes('GPS') || displayLine.includes('LATITUDE') || displayLine.includes('LONGITUDE')) {
          provenance = '[GPS]'
        } else if (displayLine.includes('CFG') || displayLine.includes('CONFIG')) {
          provenance = '[CFG]'
        } else if (displayLine.includes('USB') || displayLine.includes('STREAM')) {
          provenance = '[USB]'
        } else {
          provenance = '[DEVICE]'
        }
      }
    }

    const category = analyzeLogCategory(displayLine)
    const colorClass = getLogColorClass(category, isDashboard)

    return {
      id: typeof log === 'object' && log !== null ? (log.id || `${Date.now()}-${Math.random()}`) : `${Date.now()}-${Math.random()}`,
      timestamp: typeof log === 'object' && log !== null ? (log.timestamp || Date.now()) : Date.now(),
      source: logSource,
      line: logLine,
      isDashboard,
      isRemote,
      provenance,
      cleanLine,
      colorClass
    }
  })

  const handleConnect = async () => {
    try {
      appendUsbStreamLog('🔍 Sélection du port USB...', 'dashboard')
      const selectedPort = await requestPort()
      if (selectedPort) {
        const portInfo = selectedPort.getInfo?.()
        const deviceLabel = getUsbDeviceLabel(portInfo)
        const portPath = portInfo?.path || 'Port inconnu'
        const portLabel = deviceLabel ? `${deviceLabel} (${portPath})` : portPath
        appendUsbStreamLog(`✅ Port sélectionné: ${portLabel}`, 'dashboard')
        logger.log(`[USB] Port sélectionné: ${portLabel}`, portInfo)
        
        appendUsbStreamLog('🔌 Connexion au port en cours...', 'dashboard')
        const connected = await connect(selectedPort, 115200)
        if (connected) {
          appendUsbStreamLog(`✅ Connexion USB établie sur ${portLabel} !`, 'dashboard')
          logger.log(`[USB] Connexion établie sur ${portLabel}`)
          
          // Démarrer automatiquement le streaming après connexion
          const streamTimeoutId = setTimeout(async () => {
            if (usbStreamStatus !== 'idle' || isStartingStreamRef?.current) {
              logger.debug('[USB] Streaming déjà démarré ou en cours, pas de démarrage manuel')
              timeoutRefs.current = timeoutRefs.current.filter(id => id !== streamTimeoutId)
              return
            }
            
            try {
              isStartingStreamRef.current = true
              logger.log('[USB] Démarrage streaming après connexion manuelle')
              await startUsbStreaming(selectedPort)
            } catch (streamErr) {
              logger.error('❌ Erreur démarrage streaming:', streamErr)
              appendUsbStreamLog(`❌ Erreur démarrage streaming: ${streamErr.message || streamErr}`, 'dashboard')
            } finally {
              isStartingStreamRef.current = false
              timeoutRefs.current = timeoutRefs.current.filter(id => id !== streamTimeoutId)
            }
          }, 500)
          timeoutRefs.current.push(streamTimeoutId)
        } else {
          appendUsbStreamLog(`❌ Échec de la connexion au port ${portLabel}`, 'dashboard')
          logger.error(`[USB] Échec connexion au port ${portLabel}`)
        }
      } else {
        appendUsbStreamLog('ℹ️ Aucun port sélectionné. Vérifiez que votre navigateur supporte l\'API Web Serial (Chrome/Edge) et qu\'un périphérique USB est connecté.', 'dashboard')
        logger.warn('[USB] requestPort() a retourné null sans erreur')
      }
    } catch (err) {
      if (err.name === 'NotFoundError') {
        appendUsbStreamLog('ℹ️ Aucun port sélectionné (utilisateur a annulé)', 'dashboard')
      } else {
        logger.error('❌ Erreur sélection port:', err)
        appendUsbStreamLog(`❌ Erreur: ${err.message || err}`, 'dashboard')
      }
    }
  }

  const handleTogglePause = async () => {
    if (usbStreamStatus === 'running') {
      pauseUsbStreaming()
      logger.log('⏸️ Logs en pause')
    } else if (usbStreamStatus === 'paused' && !isStartingStreamRef?.current) {
      isStartingStreamRef.current = true
      try {
        await startUsbStreaming(port)
        logger.log('▶️ Logs reprennent')
      } finally {
        isStartingStreamRef.current = false
      }
    }
  }

  const handleCopyLogs = () => {
    const allLogsText = [...usbStreamLogs, ...remoteLogs]
      .map(log => log.line || String(log))
      .join('\n')
    navigator.clipboard.writeText(allLogsText)
      .then(() => {
        logger.log('📋 Logs copiés dans le presse-papiers')
      })
      .catch(err => {
        logger.error('❌ Erreur copie:', err)
      })
  }

  const handleClearLogs = () => {
    if (clearUsbStreamLogs) {
      clearUsbStreamLogs()
    }
    setShowClearLogsModal(false)
    logger.log('🗑️ Console effacée')
  }

  return (
    <>
      <div className="mb-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                📡 Console de Logs USB
              </h2>
              <span className={`badge text-xs ${
                isConnected 
                  ? 'badge-success' 
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400'
              }`}>
                {isConnected ? 'USB Connecté' : 'USB Déconnecté'}
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Logs en temps réel du streaming USB et des actions du dashboard
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {!isConnected && isSupported && (
              <button
                onClick={handleConnect}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 shadow-md hover:shadow-lg"
                title="Autoriser COM3 (une seule fois nécessaire) - Après autorisation, la connexion sera automatique"
              >
                🔌 Autoriser COM3 (automatique après)
              </button>
            )}
            <button
              onClick={handleTogglePause}
              className={`px-3 py-1.5 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                usbStreamStatus === 'paused' 
                  ? 'bg-green-500 hover:bg-green-600' 
                  : 'bg-orange-500 hover:bg-orange-600'
              }`}
              title={usbStreamStatus === 'paused' ? 'Reprendre les logs' : 'Mettre en pause les logs'}
              disabled={!isConnected}
            >
              {usbStreamStatus === 'paused' ? (
                <>
                  <span>▶️</span>
                  <span>Reprendre</span>
                </>
              ) : (
                <>
                  <span>⏸️</span>
                  <span>Pause</span>
                </>
              )}
            </button>
            <button
              onClick={handleCopyLogs}
              className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              title="Copier tous les logs"
            >
              📋 Copier
            </button>
            <button
              onClick={() => setShowClearLogsModal(true)}
              className="px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              title="Effacer la console"
            >
              🗑️ RAZ
            </button>
          </div>
        </div>
        <div 
          className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-900 p-4 shadow-inner overflow-y-auto" 
          style={{ minHeight: '500px', maxHeight: '600px' }}
        >
          {isStreamingRemote && (
            <div className="mb-3 flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1 text-purple-400">
                <span className="animate-pulse">📡</span>
                Streaming distant en temps réel
              </span>
              <span className="text-gray-500">
                ({remoteLogs.length} logs)
              </span>
            </div>
          )}
          
          {allLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-2 text-gray-500">
              <span className="text-4xl">📡</span>
              <p className="font-medium">
                {isStreamingRemote ? 'Chargement du streaming distant...' : 'En attente de logs USB...'}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {isStreamingRemote 
                  ? 'Les logs apparaîtront ici dès qu\'ils seront disponibles'
                  : 'Connectez un dispositif USB et démarrez le streaming pour voir les logs'
                }
              </p>
            </div>
          ) : (
            <div className="space-y-1 font-mono text-sm tracking-tight">
              {formattedLogs.map((log) => (
                <div key={log.id} className="whitespace-pre-wrap">
                  <span className="text-gray-500 pr-3">{new Date(log.timestamp).toLocaleTimeString('fr-FR')}</span>
                  {log.isRemote && <span className="text-purple-400 text-xs mr-2">📡</span>}
                  <span className="text-gray-400 dark:text-gray-500 font-semibold mr-2">
                    {log.provenance}
                  </span>
                  <span className={log.colorClass}>
                    {log.cleanLine}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={showClearLogsModal}
        onClose={() => setShowClearLogsModal(false)}
        onConfirm={handleClearLogs}
        title="Effacer la console ?"
        message="Cette action supprimera tous les logs affichés dans la console USB."
        confirmText="Effacer"
        cancelText="Annuler"
        confirmColor="red"
      />
    </>
  )
}

