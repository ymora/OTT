/**
 * Hook pour gérer le formatage et l'analyse des logs USB
 * Extrait de UsbStreamingTab.js pour réduire la complexité
 */

import { useCallback } from 'react'

/**
 * Hook pour formater et analyser les logs USB
 */
export function useUsbLogs() {
  // Fonction pour formater le JSON de manière lisible
  const formatJsonLog = useCallback((logLine) => {
    // Détecter si c'est un JSON compact (commence par { et contient usb_stream)
    if (!logLine?.trim().startsWith('{') || !logLine.includes('usb_stream')) {
      return null // Pas un JSON USB stream
    }
    
    try {
      const json = JSON.parse(logLine.trim())
      
      // Formater de manière concise et lisible sur une seule ligne
      const parts = []
      if (json.seq) parts.push(`Seq=${json.seq}`)
      if (json.flow_lpm != null || json.flowrate != null) {
        parts.push(`Flow=${((json.flow_lpm || json.flowrate || 0).toFixed(2))} L/min`)
      }
      if (json.battery_percent != null || json.battery != null) {
        parts.push(`Bat=${((json.battery_percent || json.battery || 0).toFixed(1))}%`)
      }
      if (json.rssi != null) parts.push(`RSSI=${json.rssi} dBm`)
      if (json.latitude != null && json.longitude != null) {
        parts.push(`GPS=${json.latitude.toFixed(4)},${json.longitude.toFixed(4)}`)
      }
      if (json.device_name || json.device_serial) {
        parts.push(`Device=${json.device_name || json.device_serial || 'N/A'}`)
      }
      
      return parts.length > 0 ? `[USB_STREAM] ${parts.join(' | ')}` : null
    } catch (_e) {
      return null // JSON invalide, afficher tel quel
    }
  }, [])

  // Fonction pour analyser et catégoriser un log (comme le script PowerShell)
  const analyzeLogCategory = useCallback((logLine) => {
    if (!logLine) return 'default'
    
    const line = logLine.toUpperCase()
    
    // Erreurs (priorité haute) - Rouge
    const errorPatterns = [
      'ERROR', '❌', 'ÉCHEC', 'FAIL', 'FATAL', 'EXCEPTION',
      'ERREUR JSON', 'ERREUR PARSING', 'DATABASE ERROR', 'ACCÈS REFUSÉ'
    ]
    if (errorPatterns.some(pattern => logLine.includes(pattern) || line.includes(pattern))) {
      return 'error'
    }
    
    // Avertissements - Rouge/Orange
    const warningPatterns = [
      'WARN', '⚠️', 'WARNING', 'ATTENTION', 'TIMEOUT',
      'COMMANDE INCONNUE', 'NON DISPONIBLE', 'VÉRIFIER'
    ]
    if (warningPatterns.some(pattern => logLine.includes(pattern) || line.includes(pattern))) {
      return 'warning'
    }
    
    // Commandes envoyées - Violet
    const commandPatterns = [
      '📤', 'ENVOI', 'COMMANDE', 'SEND', 'REQUEST', 'DEMANDE',
      'UPDATE_CONFIG', 'GET_CONFIG', 'RESET_CONFIG', 'FLASH'
    ]
    if (commandPatterns.some(pattern => logLine.includes(pattern) || line.includes(pattern))) {
      return 'command'
    }
    
    // Confirmations d'exécution - Vert
    const successPatterns = [
      '✅', 'SUCCESS', 'SUCCÈS', 'RÉUSSI', 'CONFIGURÉ', 'CONNECTÉ',
      'ATTACHÉ', 'DÉMARRÉ', 'TERMINÉ', 'COMPLÉTÉ'
    ]
    if (successPatterns.some(pattern => logLine.includes(pattern) || line.includes(pattern))) {
      return 'success'
    }
    
    // Logs du dispositif (MODEM, SENSOR, GPS, etc.) - Bleu
    // Détecter la provenance entre crochets
    const provenanceMatch = logLine.match(/^\[([^\]]+)\]/)
    if (provenanceMatch) {
      const provenance = provenanceMatch[1].toUpperCase()
      if (provenance.includes('MODEM') || provenance.includes('SENSOR') || 
          provenance.includes('GPS') || provenance.includes('USB') ||
          provenance.includes('CFG') || provenance.includes('NETWORK')) {
        return 'device'
      }
    }
    
    // Modem (sans crochets)
    const modemPatterns = [
      'MODEM', 'SIM', 'CSQ', 'RSSI', 'SIGNAL',
      'OPÉRATEUR', 'ATTACHÉ', 'ENREGISTREMENT', 'APN', 'GPRS', '4G', 'LTE'
    ]
    if (modemPatterns.some(pattern => line.includes(pattern))) {
      return 'device'
    }
    
    // GPS
    const gpsPatterns = [
      'GPS', 'LATITUDE', 'LONGITUDE', 'SATELLITE',
      'FIX', 'COORDONNÉES', 'GÉOLOCALISATION'
    ]
    if (gpsPatterns.some(pattern => line.includes(pattern))) {
      return 'device'
    }
    
    // Sensor
    const sensorPatterns = [
      'AIRFLOW', 'FLOW', 'BATTERY', 'BATTERIE',
      'MESURE', 'CAPTURE', 'ADC', 'V_ADC', 'V_BATT'
    ]
    if (sensorPatterns.some(pattern => line.includes(pattern))) {
      return 'device'
    }
    
    return 'default'
  }, [])

  // Fonction pour obtenir la classe CSS selon la catégorie
  const getLogColorClass = useCallback((category, isDashboard) => {
    if (isDashboard) {
      // Logs du dashboard : différencier commandes, confirmations, etc.
      if (category === 'command') {
        return 'text-purple-400 dark:text-purple-300' // Violet pour commandes
      }
      if (category === 'success') {
        return 'text-green-400 dark:text-green-300' // Vert pour confirmations
      }
      if (category === 'error' || category === 'warning') {
        return 'text-red-400 dark:text-red-300' // Rouge pour erreurs/warnings
      }
      return 'text-blue-400 dark:text-blue-300' // Bleu par défaut pour dashboard
    }
    
    // Logs du dispositif
    switch (category) {
      case 'error':
        return 'text-red-400 dark:text-red-300' // Rouge pour erreurs
      case 'warning':
        return 'text-orange-400 dark:text-orange-300' // Orange pour warnings
      case 'command':
        return 'text-purple-400 dark:text-purple-300' // Violet pour commandes
      case 'success':
        return 'text-green-400 dark:text-green-300' // Vert pour confirmations
      case 'device':
        return 'text-blue-400 dark:text-blue-300' // Bleu pour logs dispositif
      default:
        return 'text-gray-300 dark:text-gray-400'
    }
  }, [])

  return {
    formatJsonLog,
    analyzeLogCategory,
    getLogColorClass
  }
}

