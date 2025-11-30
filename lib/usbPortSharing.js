/**
 * Système de partage du port USB entre tous les onglets
 * Utilise BroadcastChannel pour la communication inter-onglets
 * et localStorage pour la persistance de l'état
 */

// Note: logger est importé dynamiquement pour éviter les erreurs SSR
let logger = null
if (typeof window !== 'undefined') {
  try {
    logger = require('@/lib/logger').default || require('@/lib/logger').logger
  } catch (e) {
    // Fallback si logger n'est pas disponible
    logger = {
      debug: (...args) => console.debug(...args),
      warn: (...args) => console.warn(...args),
      error: (...args) => console.error(...args),
      log: (...args) => console.log(...args)
    }
  }
}

const CHANNEL_NAME = 'ott-usb-port-sharing'
const STORAGE_KEY = 'ott-usb-port-state'
const HEARTBEAT_INTERVAL = 2000 // 2 secondes
const HEARTBEAT_TIMEOUT = 5000 // 5 secondes (si pas de heartbeat depuis 5s, considérer l'onglet mort)

class UsbPortSharing {
  constructor() {
    this.channel = typeof BroadcastChannel !== 'undefined' 
      ? new BroadcastChannel(CHANNEL_NAME) 
      : null
    this.tabId = this.generateTabId()
    this.isMaster = false
    this.masterTabId = null
    this.heartbeatInterval = null
    this.listeners = new Map()
    this.lastHeartbeat = Date.now()
    
    // Écouter les messages du canal
    if (this.channel) {
      this.channel.onmessage = (event) => this.handleMessage(event)
    }
    
    // Écouter les changements de localStorage (pour les navigateurs sans BroadcastChannel)
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY) {
          this.handleStorageChange(e.newValue)
        }
      })
    }
    
    // Démarrer le heartbeat
    this.startHeartbeat()
    
    // Vérifier l'état au démarrage
    this.checkState()
  }
  
  generateTabId() {
    return `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
  
  startHeartbeat() {
    // Envoyer un heartbeat toutes les 2 secondes
    this.heartbeatInterval = setInterval(() => {
      if (this.isMaster) {
        this.broadcast({
          type: 'heartbeat',
          tabId: this.tabId,
          timestamp: Date.now()
        })
        this.updateStorage({
          masterTabId: this.tabId,
          lastHeartbeat: Date.now()
        })
      } else {
        // Vérifier si le master est toujours vivant
        const state = this.getStorageState()
        if (state && state.masterTabId) {
          const timeSinceHeartbeat = Date.now() - (state.lastHeartbeat || 0)
          if (timeSinceHeartbeat > HEARTBEAT_TIMEOUT) {
            // Le master est mort, devenir master
            if (typeof logger !== 'undefined' && logger.debug) {
              logger.debug('[USB Sharing] Master timeout, becoming master')
            }
            this.becomeMaster()
          }
        }
      }
    }, HEARTBEAT_INTERVAL)
  }
  
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }
  
  checkState() {
    const state = this.getStorageState()
    if (state && state.masterTabId) {
      const timeSinceHeartbeat = Date.now() - (state.lastHeartbeat || 0)
      if (timeSinceHeartbeat < HEARTBEAT_TIMEOUT) {
        // Un master actif existe
        this.masterTabId = state.masterTabId
        this.isMaster = false
        this.notifyListeners('state-changed', { isMaster: false, masterTabId: this.masterTabId })
      } else {
        // Le master est mort, devenir master
        this.becomeMaster()
      }
    } else {
      // Pas de master, devenir master
      this.becomeMaster()
    }
  }
  
  becomeMaster() {
    this.isMaster = true
    this.masterTabId = this.tabId
    this.updateStorage({
      masterTabId: this.tabId,
      lastHeartbeat: Date.now()
    })
    this.broadcast({
      type: 'master-announcement',
      tabId: this.tabId,
      timestamp: Date.now()
    })
    this.notifyListeners('state-changed', { isMaster: true, masterTabId: this.tabId })
    if (typeof logger !== 'undefined' && logger.debug) {
      logger.debug('[USB Sharing] Became master tab')
    }
  }
  
  requestMaster() {
    // Demander à devenir master
    this.broadcast({
      type: 'request-master',
      tabId: this.tabId,
      timestamp: Date.now()
    })
    
    // Attendre un peu pour voir si quelqu'un répond
    return new Promise((resolve) => {
      setTimeout(() => {
        const state = this.getStorageState()
        if (state && state.masterTabId === this.tabId) {
          resolve(true)
        } else {
          resolve(false)
        }
      }, 500)
    })
  }
  
  broadcast(message) {
    if (this.channel) {
      this.channel.postMessage({
        ...message,
        tabId: this.tabId
      })
    }
  }
  
  handleMessage(event) {
    const { type, tabId, data } = event.data
    
    if (tabId === this.tabId) {
      // Ignorer nos propres messages
      return
    }
    
    switch (type) {
      case 'heartbeat':
        if (this.isMaster && tabId !== this.tabId) {
          // Un autre onglet pense être master, résoudre le conflit
          if (tabId < this.tabId) {
            // L'autre onglet a un ID plus petit, lui céder
            this.isMaster = false
            this.masterTabId = tabId
            this.notifyListeners('state-changed', { isMaster: false, masterTabId: tabId })
          }
        } else if (!this.isMaster) {
          this.masterTabId = tabId
          this.lastHeartbeat = Date.now()
        }
        break
        
      case 'master-announcement':
        if (!this.isMaster) {
          this.masterTabId = tabId
          this.notifyListeners('state-changed', { isMaster: false, masterTabId: tabId })
        }
        break
        
      case 'request-master':
        if (this.isMaster) {
          // Répondre que je suis le master
          this.broadcast({
            type: 'master-response',
            tabId: this.tabId,
            timestamp: Date.now()
          })
        }
        break
        
      case 'master-response':
        // Un autre onglet est master
        if (!this.isMaster) {
          this.masterTabId = tabId
          this.notifyListeners('state-changed', { isMaster: false, masterTabId: tabId })
        }
        break
        
      case 'port-opened':
        this.notifyListeners('port-opened', data)
        break
        
      case 'port-closed':
        this.notifyListeners('port-closed', data)
        break
        
      case 'data-received':
        this.notifyListeners('data-received', data)
        break
    }
  }
  
  handleStorageChange(newValue) {
    try {
      const state = JSON.parse(newValue || '{}')
      if (state.masterTabId && state.masterTabId !== this.tabId) {
        this.masterTabId = state.masterTabId
        if (this.isMaster) {
          this.isMaster = false
          this.notifyListeners('state-changed', { isMaster: false, masterTabId: state.masterTabId })
        }
      }
    } catch (e) {
      if (typeof logger !== 'undefined' && logger.warn) {
        logger.warn('[USB Sharing] Error parsing storage change:', e)
      }
    }
  }
  
  getStorageState() {
    if (typeof window === 'undefined') return null
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : null
    } catch (e) {
      return null
    }
  }
  
  updateStorage(state) {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...state,
        timestamp: Date.now()
      }))
    } catch (e) {
      if (typeof logger !== 'undefined' && logger.warn) {
        logger.warn('[USB Sharing] Error updating storage:', e)
      }
    }
  }
  
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event).push(callback)
    
    // Retourner une fonction pour se désabonner
    return () => {
      const callbacks = this.listeners.get(event)
      if (callbacks) {
        const index = callbacks.indexOf(callback)
        if (index > -1) {
          callbacks.splice(index, 1)
        }
      }
    }
  }
  
  notifyListeners(event, data) {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data)
        } catch (e) {
          if (typeof logger !== 'undefined' && logger.error) {
            logger.error('[USB Sharing] Error in listener:', e)
          }
        }
      })
    }
  }
  
  notifyPortOpened(portInfo) {
    if (this.isMaster) {
      this.broadcast({
        type: 'port-opened',
        data: portInfo
      })
    }
  }
  
  notifyPortClosed() {
    if (this.isMaster) {
      this.broadcast({
        type: 'port-closed',
        data: { tabId: this.tabId }
      })
    }
  }
  
  notifyDataReceived(data) {
    if (this.isMaster) {
      this.broadcast({
        type: 'data-received',
        data: data
      })
    }
  }
  
  cleanup() {
    this.stopHeartbeat()
    if (this.isMaster) {
      // Nettoyer l'état si on était master
      localStorage.removeItem(STORAGE_KEY)
      this.broadcast({
        type: 'master-closed',
        tabId: this.tabId
      })
    }
    if (this.channel) {
      this.channel.close()
    }
  }
}

// Instance singleton
let instance = null

export function getUsbPortSharing() {
  if (typeof window === 'undefined') {
    // SSR, retourner un mock
    return {
      isMaster: false,
      masterTabId: null,
      on: () => () => {},
      requestMaster: () => Promise.resolve(false),
      notifyPortOpened: () => {},
      notifyPortClosed: () => {},
      notifyDataReceived: () => {},
      cleanup: () => {}
    }
  }
  
  if (!instance) {
    instance = new UsbPortSharing()
    
    // Nettoyer à la fermeture de l'onglet
    window.addEventListener('beforeunload', () => {
      instance.cleanup()
    })
  }
  
  return instance
}

export default getUsbPortSharing

