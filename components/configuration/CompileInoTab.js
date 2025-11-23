'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useApiData } from '@/hooks'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import SuccessMessage from '@/components/SuccessMessage'
import Modal from '@/components/Modal'
import logger from '@/lib/logger'

export default function CompileInoTab() {
  const { fetchWithAuth, API_URL, token } = useAuth()
  const [compiling, setCompiling] = useState(false)
  const [compileLogs, setCompileLogs] = useState([])
  const [compileProgress, setCompileProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState(null)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [deletingFirmware, setDeletingFirmware] = useState(null)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [firmwareToDelete, setFirmwareToDelete] = useState(null)
  const [compileWindowMinimized, setCompileWindowMinimized] = useState(false)
  const [compileHistory, setCompileHistory] = useState([]) // Historique des compilations
  const [copySuccess, setCopySuccess] = useState(false)
  const [compilingFirmwareId, setCompilingFirmwareId] = useState(null)
  const compileLogsRef = useRef(null)
  const eventSourceRef = useRef(null)
  const reconnectAttemptedRef = useRef(false)

  const { data, loading, refetch } = useApiData(
    ['/api.php/firmwares'],
    { requiresAuth: true }
  )

  const firmwares = data?.firmwares?.firmwares || []
  
  // Fonctions utilitaires
  const closeEventSource = useCallback(() => {
    eventSourceRef.current?.close()
    eventSourceRef.current = null
  }, [])
  
  const resetCompilationState = useCallback(() => {
    setCompiling(false)
    setCompilingFirmwareId(null)
    setCurrentStep(null)
    setCompileProgress(0)
    closeEventSource()
  }, [closeEventSource])
  
  const addLog = useCallback((message, level = 'info') => {
    setCompileLogs(prev => {
      // Ne filtrer que les messages exactement identiques consécutifs
      const lastLog = prev[prev.length - 1]
      if (lastLog && lastLog.message === message && lastLog.level === level) {
        return prev
      }
      return [...prev, {
        timestamp: new Date().toLocaleTimeString('fr-FR'),
        message,
        level
      }]
    })
  }, [])

  // Compiler le firmware
  const handleCompile = useCallback(async (uploadId) => {
    const functionStartTime = new Date()
    logger.log('═══════════════════════════════════════════════════════')
    logger.log('🚀 [handleCompile] DÉBUT DE LA FONCTION')
    logger.log('═══════════════════════════════════════════════════════')
    logger.log('   Timestamp:', functionStartTime.toISOString())
    logger.log('   uploadId:', uploadId)
    logger.log('   compiling:', compiling)
    logger.log('   compilingFirmwareId:', compilingFirmwareId)
    logger.log('   eventSourceRef.current:', !!eventSourceRef.current)
    logger.log('   token présent:', !!token)
    logger.log('   API_URL:', API_URL)
    logger.log('   User Agent:', navigator.userAgent)
    logger.log('   Platform:', navigator.platform)
    logger.log('   Language:', navigator.language)
    logger.log('   Online:', navigator.onLine)
    logger.log('   Connection:', navigator.connection ? JSON.stringify({
      effectiveType: navigator.connection.effectiveType,
      downlink: navigator.connection.downlink,
      rtt: navigator.connection.rtt
    }) : 'N/A')
    logger.log('═══════════════════════════════════════════════════════')
    
    if (!uploadId) {
      logger.warn('⚠️ [handleCompile] uploadId manquant, arrêt')
      return
    }
    
    // Éviter les appels multiples pour le même firmware
    if (compiling && compilingFirmwareId === uploadId && eventSourceRef.current) {
      logger.warn('⚠️ [handleCompile] Compilation déjà en cours pour ce firmware, arrêt')
      return
    }
    
    logger.log('🔧 [handleCompile] Fermeture de l\'ancienne connexion si elle existe')
    // Fermer l'ancienne connexion si elle existe
    closeEventSource()

    logger.log('🔧 [handleCompile] Mise à jour des états React')
    setCompiling(true)
    setCompilingFirmwareId(uploadId)
    setCurrentStep('compilation')
    // Ajouter un message initial immédiatement pour qu'il s'affiche
    setCompileLogs([{
      timestamp: new Date().toLocaleTimeString('fr-FR'),
      message: '⏳ Connexion au serveur...',
      level: 'info'
    }])
    setCompileProgress(0)
    setError(null)
    setSuccess(null)
    reconnectAttemptedRef.current = false
    logger.log('✅ [handleCompile] États React mis à jour')

    try {
      logger.log('🔍 [handleCompile] Vérification du token')
      if (!token) {
        logger.error('❌ [handleCompile] Token manquant!')
        throw new Error('Token manquant. Veuillez vous reconnecter.')
      }
      logger.log('✅ [handleCompile] Token présent')

      logger.log('🔧 [handleCompile] Construction de l\'URL SSE')
      const tokenEncoded = encodeURIComponent(token)
      logger.log('   Token original length:', token.length)
      logger.log('   Token encoded length:', tokenEncoded.length)
      logger.log('   Token encoded preview:', tokenEncoded.substring(0, 50) + '...')
      
      const sseUrl = `${API_URL}/api.php/firmwares/compile/${uploadId}?token=${tokenEncoded}`
      logger.log('   URL SSE construite:', sseUrl.substring(0, 100) + '...')
      logger.log('   URL SSE length:', sseUrl.length)
      
      // Vérifier que l'URL est valide
      try {
        const urlObj = new URL(sseUrl)
        logger.log('✅ [handleCompile] URL valide:')
        logger.log('   Protocol:', urlObj.protocol)
        logger.log('   Host:', urlObj.host)
        logger.log('   Pathname:', urlObj.pathname)
        logger.log('   Search params count:', urlObj.searchParams.toString().length)
      } catch (urlError) {
        logger.error('❌ [handleCompile] URL invalide:', urlError)
        throw urlError
      }
      
      // Logs détaillés pour le diagnostic (console ET interface)
      const startLogs = [
        '═══════════════════════════════════════════════════════',
        '🔌 DÉMARRAGE COMPILATION FIRMWARE',
        '═══════════════════════════════════════════════════════',
        `📦 Firmware ID: ${uploadId}`,
        `🌐 API URL: ${API_URL}`,
        `🔗 URL SSE: ${sseUrl.substring(0, 100)}...`,
        `🔑 Token présent: ${!!token} (${token ? token.length : 0} caractères)`,
        `⏰ Timestamp: ${new Date().toISOString()}`,
        '═══════════════════════════════════════════════════════'
      ]
      
      // Afficher dans la console
      startLogs.forEach(log => logger.log(log))
      
      // Afficher aussi dans l'interface
      setCompileLogs(prev => [
        ...prev,
        ...startLogs.map(msg => ({
          timestamp: new Date().toLocaleTimeString('fr-FR'),
          message: msg,
          level: 'info'
        }))
      ])

      // Vérifier si le token est expiré AVANT de créer EventSource
      logger.log('🔍 [handleCompile] Vérification expiration du token')
      if (token) {
        try {
          logger.log('   Découpage du token en parties')
          const parts = token.split('.')
          logger.log('   Nombre de parties:', parts.length)
          if (parts.length === 3) {
            logger.log('   Décodage du payload JWT')
            const base64Payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
            logger.log('   Base64 payload length:', base64Payload.length)
            const payload = JSON.parse(atob(base64Payload))
            logger.log('   Payload décodé:', JSON.stringify(payload, null, 2))
            const exp = payload.exp
            const now = Math.floor(Date.now() / 1000)
            logger.log('   Expiration (exp):', exp, new Date(exp * 1000).toISOString())
            logger.log('   Maintenant (now):', now, new Date(now * 1000).toISOString())
            logger.log('   Différence:', exp - now, 'secondes')
            if (exp && exp < now) {
              const expiredMsg = '❌ Token expiré! Veuillez vous reconnecter.'
              logger.error('❌ [handleCompile]', expiredMsg)
              setCompileLogs(prev => [...prev, {
                timestamp: new Date().toLocaleTimeString('fr-FR'),
                message: expiredMsg,
                level: 'error'
              }])
              setError('Token expiré - Veuillez vous reconnecter')
              resetCompilationState()
              return
            }
            const minutesLeft = Math.floor((exp - now) / 60)
            logger.log(`✅ [handleCompile] Token valide (expire dans ${minutesLeft} minutes)`)
            addLog(`✅ Token valide (expire dans ${minutesLeft} minutes)`, 'info')
          } else {
            logger.warn('⚠️ [handleCompile] Token n\'a pas 3 parties, format invalide')
          }
        } catch (e) {
          logger.error('❌ [handleCompile] Erreur vérification token:', e)
          logger.error('   Stack:', e.stack)
          logger.warn('⚠️ [handleCompile] Impossible de vérifier l\'expiration du token, continuation...')
        }
      } else {
        logger.warn('⚠️ [handleCompile] Token null/undefined')
      }

      logger.log('═══════════════════════════════════════════════════════')
      logger.log('🔨 [handleCompile] CRÉATION EVENTSOURCE')
      logger.log('═══════════════════════════════════════════════════════')
      logger.log('   URL:', sseUrl)
      logger.log('   Timestamp avant création:', new Date().toISOString())
      
      const beforeCreation = performance.now()
      const eventSource = new EventSource(sseUrl)
      const afterCreation = performance.now()
      const creationTime = new Date()
      
      logger.log('   Temps création EventSource:', (afterCreation - beforeCreation).toFixed(2), 'ms')
      logger.log('   Timestamp après création:', creationTime.toISOString())
      
      logger.log('═══════════════════════════════════════════════════════')
      logger.log('📡 EVENTSOURCE CRÉÉ')
      logger.log('═══════════════════════════════════════════════════════')
      logger.log('   Timestamp:', creationTime.toISOString())
      logger.log('   readyState:', eventSource.readyState, '(0=CONNECTING, 1=OPEN, 2=CLOSED)')
      logger.log('   URL:', eventSource.url)
      logger.log('   URL length:', eventSource.url.length, 'caractères')
      logger.log('   withCredentials:', eventSource.withCredentials)
      logger.log('   Protocol:', new URL(eventSource.url).protocol)
      logger.log('   Host:', new URL(eventSource.url).host)
      logger.log('   Pathname:', new URL(eventSource.url).pathname)
      logger.log('   Search:', new URL(eventSource.url).search.substring(0, 50) + '...')
      logger.log('═══════════════════════════════════════════════════════')

      eventSourceRef.current = eventSource
      
      // Logger toutes les propriétés de l'EventSource pour diagnostic
      logger.log('📋 Propriétés EventSource:')
      logger.log('   readyState:', eventSource.readyState)
      logger.log('   url:', eventSource.url)
      logger.log('   withCredentials:', eventSource.withCredentials)
      logger.log('   onopen:', typeof eventSource.onopen)
      logger.log('   onmessage:', typeof eventSource.onmessage)
      logger.log('   onerror:', typeof eventSource.onerror)

      // Buffer pour capturer les messages même si la connexion se ferme rapidement
      let messageBuffer = []
      let hasReceivedMessage = false
      let openEventFired = false
      let errorEventFired = false
      let messageEventFired = false
      
      logger.log('📋 [handleCompile] Variables de suivi initialisées:')
      logger.log('   messageBuffer:', messageBuffer.length, 'éléments')
      logger.log('   hasReceivedMessage:', hasReceivedMessage)
      logger.log('   openEventFired:', openEventFired)
      logger.log('   errorEventFired:', errorEventFired)
      logger.log('   messageEventFired:', messageEventFired)

      // Log immédiatement l'état de la connexion
      logger.log('⏱️ [handleCompile] Configuration des timeouts de vérification')
      // NOTE: Le serveur Render répond en ~350ms, donc on vérifie après 500ms
      const timeout500 = setTimeout(() => {
        const checkTime = new Date()
        const timeSinceCreation = checkTime - creationTime
        logger.log('═══════════════════════════════════════════════════════')
        logger.log('⏱️ [TIMEOUT 500ms] VÉRIFICATION ÉTAT')
        logger.log('═══════════════════════════════════════════════════════')
        logger.log('   Timestamp:', checkTime.toISOString())
        logger.log('   Temps depuis création:', timeSinceCreation, 'ms')
        const state = eventSource.readyState
        const stateText = state === EventSource.CONNECTING ? 'CONNECTING' : state === EventSource.OPEN ? 'OPEN' : 'CLOSED'
        const stateMsg = `⏱️ [500ms] État: ${stateText} (${state})`
        
        logger.log('   readyState:', state, `(${stateText})`)
        logger.log('   openEventFired:', openEventFired)
        logger.log('   errorEventFired:', errorEventFired)
        logger.log('   messageEventFired:', messageEventFired)
        logger.log('   messages reçus:', messageBuffer.length)
        logger.log('   hasReceivedMessage:', hasReceivedMessage)
        logger.log('═══════════════════════════════════════════════════════')
        
        if (state === EventSource.CONNECTING) {
          const msg = '⚠️ Toujours en connexion... (normal, le serveur Render répond en ~350ms)'
          logger.log('   État: CONNECTING -', msg)
          setCompileLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString('fr-FR'),
            message: `${stateMsg} - ${msg}`,
            level: 'info'
          }])
        } else if (state === EventSource.OPEN) {
          const msg = '✅ Connexion ouverte avec succès!'
          logger.log('   État: OPEN -', msg)
          setCompileLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString('fr-FR'),
            message: `${stateMsg} - ${msg}`,
            level: 'info'
          }])
        } else if (state === EventSource.CLOSED) {
          logger.error('   État: CLOSED - Connexion fermée!')
          // Si on a reçu des messages avant la fermeture, les afficher
          if (messageBuffer.length > 0) {
            logger.log(`   📨 ${messageBuffer.length} message(s) reçu(s) avant fermeture:`)
            messageBuffer.forEach((msg, idx) => {
              logger.log(`      [${idx + 1}] ${msg.timestamp} (readyState: ${msg.readyState}): ${msg.data.substring(0, 100)}`)
            })
          } else {
            logger.error('   ⚠️  AUCUN MESSAGE REÇU AVANT FERMETURE!')
          }
          
          const errorMsgs = [
            '❌ Connexion fermée après 500ms!',
            '🔍 Causes possibles:',
            '   • Token expiré ou invalide',
            '   • Serveur inaccessible',
            '   • Erreur d\'authentification',
            '   • Timeout du serveur',
            `   • openEventFired: ${openEventFired}`,
            `   • errorEventFired: ${errorEventFired}`,
            `   • messageEventFired: ${messageEventFired}`,
            `   • Messages reçus: ${messageBuffer.length}`
          ]
          errorMsgs.forEach(msg => logger.error('   ', msg))
          setCompileLogs(prev => [...prev, ...errorMsgs.map(msg => ({
            timestamp: new Date().toLocaleTimeString('fr-FR'),
            message: msg,
            level: 'error'
          }))])
        }
      }, 500) // Augmenté à 500ms car le serveur répond en ~350ms
      
      logger.log('   ✅ Timeout 500ms configuré')
      
      // Vérifier aussi après 3 secondes (augmenté car Render peut être lent)
      const timeout3000 = setTimeout(() => {
        const checkTime = new Date()
        const timeSinceCreation = checkTime - creationTime
        logger.log('═══════════════════════════════════════════════════════')
        logger.log('⏱️ [TIMEOUT 3000ms] VÉRIFICATION ÉTAT')
        logger.log('═══════════════════════════════════════════════════════')
        logger.log('   Timestamp:', checkTime.toISOString())
        logger.log('   Temps depuis création:', timeSinceCreation, 'ms')
        const state = eventSource.readyState
        logger.log('   readyState:', state, `(${state === EventSource.CONNECTING ? 'CONNECTING' : state === EventSource.OPEN ? 'OPEN' : 'CLOSED'})`)
        logger.log('   openEventFired:', openEventFired)
        logger.log('   errorEventFired:', errorEventFired)
        logger.log('   messageEventFired:', messageEventFired)
        logger.log('   messages reçus:', messageBuffer.length)
        logger.log('   hasReceivedMessage:', hasReceivedMessage)
        logger.log('═══════════════════════════════════════════════════════')
        
        if (state === EventSource.CONNECTING) {
          logger.error('   ❌ Toujours en connexion après 3s - problème de connexion!')
          logger.error('   🔍 Vérifiez:')
          logger.error('      • La connexion réseau')
          logger.error('      • Que le serveur Render est accessible')
          logger.error('      • Les logs du serveur pour plus de détails')
          setCompileLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString('fr-FR'),
            message: '❌ Problème de connexion après 3s - Vérifiez votre connexion réseau',
            level: 'error'
          }])
          setCompileLogs(prev => {
            const lastMsg = prev[prev.length - 1]?.message
            if (!lastMsg || !lastMsg.includes('problème de connexion')) {
              return [...prev, {
                timestamp: new Date().toLocaleTimeString('fr-FR'),
                message: '❌ Problème de connexion au serveur - Vérifiez votre connexion réseau',
                level: 'error'
              }]
            }
            return prev
          })
        } else {
          logger.log('   ✅ État OK après 3s')
        }
      }, 3000)
      
      logger.log('   ✅ Timeout 3000ms configuré')

      logger.log('🔧 [handleCompile] Configuration des event listeners')
      
      eventSource.onopen = () => {
        openEventFired = true
        const openTime = new Date()
        const timeSinceCreation = openTime - creationTime
        const timeSinceFunctionStart = openTime - functionStartTime
        
        logger.log('═══════════════════════════════════════════════════════')
        logger.log('🎉 [EVENT: onopen] CONNEXION SSE ÉTABLIE!')
        logger.log('═══════════════════════════════════════════════════════')
        logger.log('   Timestamp:', openTime.toISOString())
        logger.log('   Temps depuis création EventSource:', timeSinceCreation, 'ms')
        logger.log('   Temps depuis début handleCompile:', timeSinceFunctionStart, 'ms')
        logger.log('   readyState:', eventSource.readyState, '(devrait être 1=OPEN)')
        logger.log('   URL:', eventSource.url.substring(0, 100) + '...')
        logger.log('   withCredentials:', eventSource.withCredentials)
        logger.log('   openEventFired:', openEventFired)
        logger.log('   errorEventFired:', errorEventFired)
        logger.log('   messageEventFired:', messageEventFired)
        logger.log('   messages reçus avant onopen:', messageBuffer.length)
        logger.log('═══════════════════════════════════════════════════════')
        
        const openLogs = [
          '═══════════════════════════════════════════════════════',
          '✅ CONNEXION SSE ÉTABLIE!',
          `   readyState: ${eventSource.readyState} (devrait être 1=OPEN)`,
          `   URL: ${eventSource.url.substring(0, 100)}...`,
          `   ⏰ Timestamp: ${openTime.toISOString()}`,
          `   ⏱️  Temps depuis création: ${timeSinceCreation}ms`,
          `   🔗 withCredentials: ${eventSource.withCredentials}`,
          '═══════════════════════════════════════════════════════'
        ]
        openLogs.forEach(log => logger.log(log))
        setCompileLogs(prev => [...prev, ...openLogs.map(msg => ({
          timestamp: new Date().toLocaleTimeString('fr-FR'),
          message: msg,
          level: 'info'
        }))])
        reconnectAttemptedRef.current = false
        // Mettre à jour le message initial
        setCompileLogs(prev => {
          if (prev.length === 1 && prev[0].message.includes('Connexion au serveur')) {
            return [{
              timestamp: new Date().toLocaleTimeString('fr-FR'),
              message: '✅ Connexion établie, démarrage de la compilation...',
              level: 'info'
            }]
          }
          return prev
        })
      }
      
      logger.log('   ✅ onopen listener configuré')

      eventSource.onmessage = (event) => {
        hasReceivedMessage = true
        const messageTime = new Date()
        const rawData = event.data?.substring(0, 150)
        
        logger.log('═══════════════════════════════════════════════════════')
        logger.log('📥 [SSE] MESSAGE REÇU')
        logger.log('   Timestamp:', messageTime.toISOString())
        logger.log('   ReadyState:', eventSource.readyState, '(0=CONNECTING, 1=OPEN, 2=CLOSED)')
        logger.log('   URL:', eventSource.url.substring(0, 100))
        logger.log('   Data length:', event.data?.length || 0, 'caractères')
        logger.log('   Data brut:', rawData)
        logger.log('═══════════════════════════════════════════════════════')
        
        // Ajouter au buffer pour diagnostic
        messageBuffer.push({
          timestamp: messageTime.toISOString(),
          data: rawData,
          readyState: eventSource.readyState
        })
        
        try {
          // Ignorer uniquement les messages keep-alive (commentaires SSE qui commencent par :)
          if (!event.data || event.data.trim() === '' || event.data.trim().startsWith(':')) {
            logger.log('⏭️ [SSE] Message ignoré (keep-alive ou vide)')
            setCompileLogs(prev => [...prev, {
              timestamp: new Date().toLocaleTimeString('fr-FR'),
              message: '⏭️ Keep-alive reçu (normal)',
              level: 'info'
            }])
            return
          }
          
          const data = JSON.parse(event.data)
          logger.log('📨 [SSE] Message parsé avec succès:')
          logger.log('   Type:', data.type)
          logger.log('   Level:', data.level || 'N/A')
          logger.log('   Message:', data.message || 'N/A')
          logger.log('   Progress:', data.progress || 'N/A')
          logger.log('   Version:', data.version || 'N/A')
          logger.log('   Full data:', JSON.stringify(data, null, 2))
          
          // Si c'est une erreur d'authentification, afficher immédiatement
          if (data.type === 'error' && (data.message?.includes('Unauthorized') || data.message?.includes('token'))) {
            logger.error('🔐 ERREUR D\'AUTHENTIFICATION DÉTECTÉE!')
            setCompileLogs(prev => [...prev, {
              timestamp: new Date().toLocaleTimeString('fr-FR'),
              message: `🔐 ${data.message || 'Erreur d\'authentification'}`,
              level: 'error'
            }])
            setError(data.message || 'Erreur d\'authentification - Veuillez vous reconnecter')
            resetCompilationState()
            eventSource.close()
            return
          }
          
          if (data.type === 'log') {
            // Ajouter directement le log pour qu'il soit immédiatement visible
            setCompileLogs(prev => {
              const newLog = {
                timestamp: new Date().toLocaleTimeString('fr-FR'),
                message: data.message,
                level: data.level || 'info'
              }
              // Ne filtrer que les messages exactement identiques consécutifs
              const lastLog = prev[prev.length - 1]
              if (lastLog && lastLog.message === newLog.message && lastLog.level === newLog.level) {
                return prev
              }
              return [...prev, newLog]
            })
            // Auto-scroll vers le bas
            setTimeout(() => {
              if (compileLogsRef.current) {
                compileLogsRef.current.scrollTop = compileLogsRef.current.scrollHeight
              }
            }, 100)
          } else if (data.type === 'progress') {
            setCompileProgress(data.progress || 0)
          } else if (data.type === 'success') {
            setCompileLogs(prev => [...prev, {
              timestamp: new Date().toLocaleTimeString('fr-FR'),
              message: `✅ Compilation réussie ! Firmware v${data.version} disponible`,
              level: 'info'
            }])
            setSuccess(`✅ Compilation réussie ! Firmware v${data.version} disponible`)
            setCompileHistory(prev => [...prev, {
              id: Date.now(),
              timestamp: new Date().toISOString(),
              version: data.version,
              status: 'success'
            }])
            resetCompilationState()
            refetch()
          } else if (data.type === 'error') {
            setCompileLogs(prev => [...prev, {
              timestamp: new Date().toLocaleTimeString('fr-FR'),
              message: data.message || 'Erreur lors de la compilation',
              level: 'error'
            }])
            setError(data.message || 'Erreur lors de la compilation')
            resetCompilationState()
          }
        } catch (err) {
          logger.error('❌ Erreur parsing EventSource:', err, 'Data reçu:', event.data)
          // Afficher le message brut si le parsing échoue
          if (event.data && event.data.trim() && !event.data.trim().startsWith(':')) {
            setCompileLogs(prev => [...prev, {
              timestamp: new Date().toLocaleTimeString('fr-FR'),
              message: `⚠️ Message non parsé: ${event.data.substring(0, 100)}`,
              level: 'warning'
            }])
          }
        }
      }

      logger.log('   ✅ onmessage listener configuré')
      
      eventSource.onerror = (error) => {
        errorEventFired = true
        const errorTime = new Date()
        const timeSinceCreation = errorTime - creationTime
        const timeSinceFunctionStart = errorTime - functionStartTime
        const state = eventSource.readyState
        
        logger.error('═══════════════════════════════════════════════════════')
        logger.error('❌ [EVENT: onerror] ERREUR EVENTSOURCE DÉTECTÉE!')
        logger.error('═══════════════════════════════════════════════════════')
        logger.error('   Timestamp:', errorTime.toISOString())
        logger.error('   Temps depuis création EventSource:', timeSinceCreation, 'ms')
        logger.error('   Temps depuis début handleCompile:', timeSinceFunctionStart, 'ms')
        logger.error('   ReadyState:', state, '(0=CONNECTING, 1=OPEN, 2=CLOSED)')
        logger.error('   URL:', eventSource.url.substring(0, 100) + '...')
        logger.error('   Error object:', error)
        logger.error('   Error type:', error?.type || 'N/A')
        logger.error('   Error target:', error?.target || 'N/A')
        logger.error('   Error bubbles:', error?.bubbles || 'N/A')
        logger.error('   Error cancelable:', error?.cancelable || 'N/A')
        logger.error('   Error defaultPrevented:', error?.defaultPrevented || 'N/A')
        logger.error('   Messages reçus: ', messageBuffer.length)
        logger.error('   HasReceivedMessage:', hasReceivedMessage)
        logger.error('   withCredentials:', eventSource.withCredentials)
        logger.error('   openEventFired:', openEventFired)
        logger.error('   errorEventFired:', errorEventFired)
        logger.error('   messageEventFired:', messageEventFired)
        
        // Afficher les messages reçus avant l'erreur
        if (messageBuffer.length > 0) {
          logger.error('   📨 Messages reçus avant erreur:')
          messageBuffer.forEach((msg, idx) => {
            logger.error(`      [${idx + 1}] ${msg.timestamp} (readyState: ${msg.readyState}): ${msg.data.substring(0, 100)}`)
          })
        } else {
          logger.error('   ⚠️  AUCUN MESSAGE REÇU AVANT L\'ERREUR!')
        }
        logger.error('═══════════════════════════════════════════════════════')
        
        const errorLogs = [
          '═══════════════════════════════════════════════════════',
          '❌ ERREUR EVENTSOURCE DÉTECTÉE!',
          '═══════════════════════════════════════════════════════',
          `   ReadyState: ${state} (0=CONNECTING, 1=OPEN, 2=CLOSED)`,
          `   Messages reçus: ${messageBuffer.length}`,
          `   HasReceivedMessage: ${hasReceivedMessage}`,
          `   Timestamp: ${errorTime.toISOString()}`,
          `   URL: ${eventSource.url.substring(0, 80)}...`,
          messageBuffer.length === 0 ? '   ⚠️  AUCUN MESSAGE REÇU AVANT L\'ERREUR!' : '',
          '═══════════════════════════════════════════════════════'
        ].filter(Boolean)
        
        errorLogs.forEach(log => logger.error(log))
        setCompileLogs(prev => [...prev, ...errorLogs.map(msg => ({
          timestamp: new Date().toLocaleTimeString('fr-FR'),
          message: msg,
          level: 'error'
        }))])
        
        // Afficher aussi dans les logs de compilation pour que l'utilisateur le voie
        setCompileLogs(prev => {
          let errorMsg = ''
          if (state === EventSource.CLOSED) {
            if (hasReceivedMessage && messageBuffer.length > 0) {
              // Si on a reçu des messages, c'est probablement une erreur d'auth
              errorMsg = '❌ Connexion fermée - Vérifiez votre authentification (token peut être expiré)'
            } else {
              errorMsg = '❌ Connexion fermée - Impossible de se connecter au serveur'
            }
          } else if (state === EventSource.CONNECTING) {
            errorMsg = '🔄 Tentative de reconnexion...'
          } else {
            errorMsg = '⚠️ Erreur de connexion au serveur'
          }
          
          const lastMsg = prev[prev.length - 1]?.message
          if (!lastMsg || !lastMsg.includes(errorMsg)) {
            return [...prev, {
              timestamp: new Date().toLocaleTimeString('fr-FR'),
              message: errorMsg,
              level: 'error'
            }]
          }
          return prev
        })
        
        if (state === EventSource.CLOSED) {
          setCompileLogs(prev => {
            const lastLog = prev[prev.length - 1]
            const hasFinalMessage = lastLog && (lastLog.message.includes('✅') || lastLog.message.includes('❌'))
            
            if (hasFinalMessage) {
              resetCompilationState()
              return prev
            }
            
            const warningMsg = '⚠️ Connexion fermée - La compilation continue en arrière-plan. Revenez sur cet onglet pour voir les logs.'
            const lastMsg = prev[prev.length - 1]?.message
            if (!lastMsg || !lastMsg.includes('Connexion fermée')) {
              return [...prev, {
                timestamp: new Date().toLocaleTimeString('fr-FR'),
                message: warningMsg,
                level: 'warning'
              }]
            }
            return prev
          })
        } else if (state === EventSource.CONNECTING) {
          logger.log('🔄 EventSource se reconnecte...')
          setCompileLogs(prev => {
            const lastMsg = prev[prev.length - 1]?.message
            if (!lastMsg || !lastMsg.includes('Reconnexion')) {
              return [...prev, {
                timestamp: new Date().toLocaleTimeString('fr-FR'),
                message: '🔄 Reconnexion en cours...',
                level: 'info'
              }]
            }
            return prev
          })
          return
        } else {
          logger.log('⚠️ EventSource en état OPEN mais avec erreur')
          setCompileLogs(prev => {
            const lastMsg = prev[prev.length - 1]?.message
            if (!lastMsg || !lastMsg.includes('Erreur de connexion')) {
              return [...prev, {
                timestamp: new Date().toLocaleTimeString('fr-FR'),
                message: '⚠️ Erreur de connexion - La compilation continue sur le serveur. Vérifiez l\'état dans la liste des firmwares.',
                level: 'warning'
              }]
            }
            return prev
          })
        }
        
        setTimeout(() => refetch(), 2000)
      }

    } catch (err) {
      logger.error('Erreur lors du démarrage de la compilation:', err)
      setError(err.message || 'Erreur lors du démarrage de la compilation')
      resetCompilationState()
    }
  }, [API_URL, token, compiling, compilingFirmwareId, closeEventSource, resetCompilationState, addLog])

  // Ne pas fermer l'EventSource au démontage si une compilation est en cours
  useEffect(() => {
    return () => {
      if (eventSourceRef.current && !compiling) {
        closeEventSource()
      }
    }
  }, [compiling, closeEventSource])
  
  // Reconnexion automatique si une compilation est en cours
  useEffect(() => {
    if (compiling || eventSourceRef.current) return
    
    const compilingFirmware = firmwares.find(fw => fw.status === 'compiling')
    
    if (compilingFirmware) {
      const firmwareId = compilingFirmware.id
      if (reconnectAttemptedRef.current !== firmwareId) {
        reconnectAttemptedRef.current = firmwareId
        setCompilingFirmwareId(firmwareId)
        handleCompile(firmwareId)
      }
    } else if (compilingFirmwareId) {
      reconnectAttemptedRef.current = false
    }
  }, [firmwares, compiling, compilingFirmwareId, handleCompile])
  
  // Polling de secours si pas de connexion SSE active
  useEffect(() => {
    if (!compiling || eventSourceRef.current) return
    
    const pollingInterval = setInterval(() => {
      refetch().then(() => {
        const compilingFirmware = firmwares.find(fw => fw.id === compilingFirmwareId && fw.status === 'compiling')
        if (!compilingFirmware && compilingFirmwareId) {
          resetCompilationState()
        }
      })
    }, 5000)
    
    return () => clearInterval(pollingInterval)
  }, [compiling, compilingFirmwareId, firmwares, refetch, resetCompilationState])

  // Auto-scroll des logs
  useEffect(() => {
    if (compileLogsRef.current && compiling && compileLogs.length > 0) {
      compileLogsRef.current.scrollTop = compileLogsRef.current.scrollHeight
    }
  }, [compileLogs.length, compiling])

  // Copier les logs de compilation
  const handleCopyLogs = useCallback(() => {
    if (compileLogs.length === 0) {
      return
    }

    const logsText = compileLogs.map(log => 
      `[${log.timestamp}] ${log.message}`
    ).join('\n')

    navigator.clipboard.writeText(logsText).then(() => {
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    }).catch(err => {
      logger.error('Erreur lors de la copie des logs:', err)
      setError('Erreur lors de la copie des logs')
    })
  }, [compileLogs, logger])

  return (
    <div className="space-y-6">
      {/* Section Compilation avec logs */}
      {(compiling || compileLogs.length > 0) && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">🔨 Compilation en cours</h2>
            <div className="flex items-center gap-2">
              {compileProgress > 0 && (
                <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">
                  {compileProgress}%
                </span>
              )}
              {compileLogs.length > 0 && (
                <button
                  onClick={handleCopyLogs}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title="Copier les logs"
                >
                  {copySuccess ? '✅ Copié!' : '📋 Copier'}
                </button>
              )}
              <button
                onClick={() => setCompileWindowMinimized(!compileWindowMinimized)}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                title={compileWindowMinimized ? 'Afficher les logs' : 'Masquer les logs'}
              >
                {compileWindowMinimized ? '⬆️' : '⬇️'}
              </button>
            </div>
          </div>
          
          {!compileWindowMinimized && (
            <>
              {/* Barre de progression */}
              {compileProgress > 0 && (
                <div className="space-y-2 mb-4">
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-300 ${
                        compiling ? 'bg-blue-500' :
                        compileProgress === 100 ? 'bg-green-500' :
                        'bg-gray-300 dark:bg-gray-600'
                      }`}
                      style={{ 
                        width: `${Math.max(0, Math.min(100, compileProgress))}%` 
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Logs de compilation */}
              <div
                ref={compileLogsRef}
                className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm h-96 overflow-y-auto"
              >
                {compileLogs.length === 0 ? (
                  <div className="text-gray-500">En attente des logs...</div>
                ) : (
                  compileLogs.map((log, idx) => (
                    <div key={idx} className="mb-1">
                      <span className="text-gray-500 pr-3">{log.timestamp}</span>
                      <span className={log.level === 'error' ? 'text-red-400' : log.level === 'warning' ? 'text-yellow-400' : 'text-green-300'}>
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Messages d'erreur et succès */}
      {error && <ErrorMessage error={error} />}
      {success && <SuccessMessage message={success} />}

      {/* Liste des firmwares */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">📦 Firmwares disponibles</h2>
        
        {loading ? (
          <LoadingSpinner />
        ) : firmwares.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">Aucun firmware disponible. Uploader un fichier .ino dans l&apos;onglet &quot;INO&quot; pour commencer.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Version</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Taille</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Statut</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {firmwares.map((fw) => (
                  <tr key={fw.id} className="table-row">
                    <td className="py-3 px-4">
                      <span className="font-mono font-semibold text-primary">v{fw.version}</span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {fw.file_size ? `${(fw.file_size / 1024).toFixed(2)} KB` : '-'}
                    </td>
                    <td className="py-3 px-4">
                      {fw.status && (
                        <span className={`badge ${
                          fw.status === 'pending_compilation' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' : 
                          fw.status === 'compiling' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                          fw.status === 'compiled' ? 'badge-success' :
                          fw.status === 'error' ? 'badge-danger' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                        } text-xs`}>
                          {fw.status === 'pending_compilation' ? 'En attente' : 
                           fw.status === 'compiling' ? 'Compilation' :
                           fw.status === 'compiled' ? 'Compilé' :
                           fw.status === 'error' ? 'Erreur' : fw.status}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {new Date(fw.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {fw.status === 'pending_compilation' && (
                          <button
                            onClick={() => handleCompile(fw.id)}
                            disabled={compiling}
                            className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                            title="Compiler le firmware"
                          >
                            <span className="text-lg">🔨</span>
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setFirmwareToDelete(fw)
                            setShowDeleteConfirmModal(true)
                          }}
                          className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                          title="Supprimer le firmware"
                        >
                          <span className="text-lg">🗑️</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal confirmation suppression */}
      <Modal
        isOpen={showDeleteConfirmModal}
        onClose={() => {
          setShowDeleteConfirmModal(false)
          setFirmwareToDelete(null)
        }}
        title="Confirmer la suppression"
        maxWidth="max-w-md"
      >
        {firmwareToDelete && (
          <div className="space-y-4">
            <p className="text-gray-700 dark:text-gray-300">
              Êtes-vous sûr de vouloir supprimer le firmware <strong>v{firmwareToDelete.version}</strong> ?
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Cette action est irréversible.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteConfirmModal(false)
                  setFirmwareToDelete(null)
                }}
                className="btn-secondary"
              >
                Annuler
              </button>
              <button
                onClick={async () => {
                  if (!firmwareToDelete) return
                  
                  setDeletingFirmware(firmwareToDelete.id)
                  try {
                    const response = await fetchWithAuth(
                      `${API_URL}/api.php/firmwares/${firmwareToDelete.id}`,
                      { method: 'DELETE' },
                      { requiresAuth: true }
                    )
                    
                    if (response.status === 404) {
                      const errorData = await response.json().catch(() => ({}))
                      throw new Error(`Erreur système: ${errorData.error || 'Endpoint non disponible'}`)
                    }
                    
                    if (!response.ok) {
                      const errorData = await response.json().catch(() => ({}))
                      throw new Error(errorData.error || `Erreur HTTP ${response.status}`)
                    }
                    
                    const data = await response.json()
                    if (!data.success) {
                      throw new Error(data.error || 'Erreur lors de la suppression')
                    }
                    
                    setSuccess(`Firmware v${firmwareToDelete.version} supprimé avec succès`)
                    setShowDeleteConfirmModal(false)
                    setFirmwareToDelete(null)
                    refetch()
                  } catch (err) {
                    const errorMsg = err.message?.includes('404') || err.message?.includes('Endpoint not found')
                      ? '⚠️ L\'endpoint de suppression n\'est pas disponible sur le serveur.'
                      : `Erreur lors de la suppression : ${err.message}`
                    setError(errorMsg)
                    setShowDeleteConfirmModal(false)
                    setFirmwareToDelete(null)
                  } finally {
                    setDeletingFirmware(null)
                  }
                }}
                disabled={deletingFirmware === firmwareToDelete?.id}
                className="btn-danger"
              >
                {deletingFirmware === firmwareToDelete?.id ? '⏳ Suppression...' : '🗑️ Supprimer'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

