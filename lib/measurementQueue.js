/**
 * Queue locale pour stocker les mesures en cas d'échec réseau
 * Utilise IndexedDB pour la persistance
 */

const DB_NAME = 'ott_measurements_queue'
const DB_VERSION = 1
const STORE_NAME = 'measurements'

let dbInstance = null

// Initialiser IndexedDB
async function initDB() {
  if (dbInstance) return dbInstance

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      dbInstance = request.result
      resolve(dbInstance)
    }

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
        store.createIndex('timestamp', 'timestamp', { unique: false })
        store.createIndex('device_id', 'device_id', { unique: false })
      }
    }
  })
}

// Ajouter une mesure à la queue
export async function enqueueMeasurement(measurementData) {
  try {
    const db = await initDB()
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    const item = {
      ...measurementData,
      timestamp: Date.now(),
      retryCount: 0,
      lastRetry: null
    }

    await store.add(item)
    return true
  } catch (err) {
    console.error('Erreur ajout mesure à la queue:', err)
    return false
  }
}

// Récupérer les mesures en attente
export async function getPendingMeasurements(limit = 50) {
  try {
    const db = await initDB()
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('timestamp')

    return new Promise((resolve, reject) => {
      const request = index.getAll(null, limit)
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  } catch (err) {
    console.error('Erreur récupération mesures:', err)
    return []
  }
}

// Marquer une mesure comme envoyée
export async function removeMeasurement(id) {
  try {
    const db = await initDB()
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    await store.delete(id)
    return true
  } catch (err) {
    console.error('Erreur suppression mesure:', err)
    return false
  }
}

// Incrémenter le compteur de retry
export async function incrementRetry(id) {
  try {
    const db = await initDB()
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(id)

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const item = request.result
        if (item) {
          item.retryCount = (item.retryCount || 0) + 1
          item.lastRetry = Date.now()
          store.put(item)
          resolve(item)
        } else {
          resolve(null)
        }
      }
      request.onerror = () => reject(request.error)
    })
  } catch (err) {
    console.error('Erreur incrément retry:', err)
    return null
  }
}

// Nettoyer les mesures trop anciennes (plus de 7 jours)
export async function cleanupOldMeasurements() {
  try {
    const db = await initDB()
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('timestamp')
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000)

    return new Promise((resolve, reject) => {
      const request = index.openCursor(IDBKeyRange.upperBound(sevenDaysAgo))
      let count = 0

      request.onsuccess = (event) => {
        const cursor = event.target.result
        if (cursor) {
          cursor.delete()
          count++
          cursor.continue()
        } else {
          resolve(count)
        }
      }
      request.onerror = () => reject(request.error)
    })
  } catch (err) {
    console.error('Erreur nettoyage mesures:', err)
    return 0
  }
}

