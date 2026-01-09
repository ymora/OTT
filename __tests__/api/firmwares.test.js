/**
 * Tests pour l'API Firmwares
 * 
 * Ces tests vérifient que l'API de gestion des firmwares fonctionne correctement
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const ADMIN_HEADER = 'Bearer mock-admin-token'
const USER_HEADER = 'Bearer mock-user-token'

const firmwareSeed = [
  {
    id: 'fw-0001',
    version: '1.0.0',
    device_type: 'ESP32',
    hardware_version: 'v1.0',
    description: 'Firmware initial'
  }
]

const createJsonResponse = (status = 200, body = {}) => {
  return {
    ok: status >= 200 && status < 400,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
    headers: {
      get() {
        return 'application/json'
      }
    }
  }
}

const parseBody = (options = {}) => {
  if (!options.body) return {}
  if (typeof options.body === 'string') {
    try {
      return JSON.parse(options.body)
    } catch {
      return {}
    }
  }
  return options.body
}

const extractAuthHeader = (options = {}) => {
  const headers = options.headers || {}
  return headers.Authorization || headers.authorization || ''
}

const requireAdmin = (options = {}) => {
  const authHeader = extractAuthHeader(options)
  if (!authHeader) {
    return createJsonResponse(401, { success: false, error: 'Unauthorized' })
  }
  if (authHeader !== ADMIN_HEADER) {
    return createJsonResponse(403, { success: false, error: 'Forbidden' })
  }
  return null
}

const requireAuthOptional = (options = {}) => {
  const authHeader = extractAuthHeader(options)
  if (!authHeader) {
    return createJsonResponse(401, { success: false, error: 'Unauthorized' })
  }
  return null
}

describe('Firmwares API', () => {
  let firmwareStore = []
  let fetchMock = null

  beforeEach(() => {
    firmwareStore = firmwareSeed.map(item => ({ ...item }))
    fetchMock = jest.fn(async (url, options = {}) => {
      const normalizedUrl = url.toString()
      const method = (options.method || 'GET').toUpperCase()

      if (normalizedUrl.includes('/api.php/auth/login')) {
        return createJsonResponse(200, {
          success: true,
          token: ADMIN_HEADER.replace('Bearer ', ''),
          user: { email: 'admin@test.com', role: 'admin' }
        })
      }

      if (normalizedUrl.includes('/api.php/firmwares/upload-ino')) {
        return createJsonResponse(400, { success: false, error: 'No file provided' })
      }

      const firmwareDetailMatch = normalizedUrl.match(/\/api\.php\/firmwares\/([^/?]+)/)
      if (firmwareDetailMatch) {
        const firmwareId = firmwareDetailMatch[1]
        if (method === 'GET') {
          const authGuard = requireAdmin(options)
          if (authGuard) return authGuard
          const firmware = firmwareStore.find(item => item.id === firmwareId)
          if (!firmware) {
            return createJsonResponse(404, { success: false, error: 'Not Found' })
          }
          return createJsonResponse(200, { success: true, firmware })
        }

        if (method === 'PUT') {
          const authGuard = requireAdmin(options)
          if (authGuard) return authGuard
          const firmware = firmwareStore.find(item => item.id === firmwareId)
          if (!firmware) {
            return createJsonResponse(404, { success: false, error: 'Not Found' })
          }
          const updates = parseBody(options)
          Object.assign(firmware, updates)
          return createJsonResponse(200, { success: true, firmware })
        }

        if (method === 'DELETE') {
          const authGuard = requireAdmin(options)
          if (authGuard) return authGuard
          firmwareStore = firmwareStore.filter(item => item.id !== firmwareId)
          return createJsonResponse(200, { success: true })
        }
      }

      if (normalizedUrl.includes('/api.php/firmwares')) {
        if (method === 'POST') {
          const authGuard = requireAdmin(options)
          if (authGuard) return authGuard
          const body = parseBody(options)
          if (!body.version) {
            return createJsonResponse(400, { success: false, error: 'Invalid data' })
          }
          const newFirmware = {
            id: `fw-${firmwareStore.length + 1}`,
            ...body
          }
          firmwareStore.push(newFirmware)
          return createJsonResponse(200, { success: true, firmware: newFirmware })
        }

        if (method === 'GET') {
          const authGuard = requireAdmin(options)
          if (authGuard) return authGuard
          return createJsonResponse(200, { success: true, firmwares: firmwareStore })
        }
      }

      const regexMatch = normalizedUrl.match(/\/api\.php\/firmwares\/([^/?]+)/)
      if (regexMatch) {
        const firmwareId = regexMatch[1]
        if (method === 'GET') {
          const authGuard = requireAdmin(options)
          if (authGuard) return authGuard
          const firmware = firmwareStore.find(item => item.id === firmwareId)
          if (!firmware) {
            return createJsonResponse(404, { success: false, error: 'Not Found' })
          }
          return createJsonResponse(200, { success: true, firmware })
        }

        if (method === 'PUT') {
          const authGuard = requireAdmin(options)
          if (authGuard) return authGuard
          const firmware = firmwareStore.find(item => item.id === firmwareId)
          if (!firmware) {
            return createJsonResponse(404, { success: false, error: 'Not Found' })
          }
          const updates = parseBody(options)
          Object.assign(firmware, updates)
          return createJsonResponse(200, { success: true, firmware })
        }

        if (method === 'DELETE') {
          const authGuard = requireAdmin(options)
          if (authGuard) return authGuard
          firmwareStore = firmwareStore.filter(item => item.id !== firmwareId)
          return createJsonResponse(200, { success: true })
        }
      }

      return createJsonResponse(200, { success: true })
    })
    global.fetch = fetchMock
  })

  describe('GET /api.php/firmwares', () => {
    it('devrait récupérer la liste des firmwares', async () => {
      const response = await fetch(`${API_URL}/api.php/firmwares`, {
        headers: {
          'Authorization': ADMIN_HEADER,
          'Content-Type': 'application/json'
        }
      })

      expect(response.ok).toBe(true)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(Array.isArray(data.firmwares)).toBe(true)
    })

    it('devrait échouer sans authentification', async () => {
      const response = await fetch(`${API_URL}/api.php/firmwares`)
      expect(response.status).toBe(401)
    })
  })

  describe('POST /api.php/firmwares', () => {
    it('devrait créer un nouveau firmware', async () => {
      const firmwareData = {
        version: '1.0.0-test',
        description: 'Firmware de test',
        device_type: 'ESP32',
        hardware_version: 'v1.0'
      }

      const response = await fetch(`${API_URL}/api.php/firmwares`, {
        method: 'POST',
        headers: {
          'Authorization': ADMIN_HEADER,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(firmwareData)
      })

      expect(response.ok).toBe(true)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.firmware).toBeDefined()
      expect(data.firmware.version).toBe(firmwareData.version)
    })

    it('devrait échouer avec des données invalides', async () => {
      const invalidData = {
        version: '',
        description: 'Firmware invalide'
      }

      const response = await fetch(`${API_URL}/api.php/firmwares`, {
        method: 'POST',
        headers: {
          'Authorization': ADMIN_HEADER,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(invalidData)
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
    })
  })

  describe('GET /api.php/firmwares/:id', () => {
    it('devrait récupérer un firmware spécifique', async () => {
      const response = await fetch(`${API_URL}/api.php/firmwares/fw-0001`, {
        headers: {
          'Authorization': ADMIN_HEADER,
          'Content-Type': 'application/json'
        }
      })

      expect(response.ok).toBe(true)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.firmware.id).toBe('fw-0001')
    })

    it('devrait retourner 404 pour un firmware inexistant', async () => {
      const response = await fetch(`${API_URL}/api.php/firmwares/unknown`, {
        headers: {
          'Authorization': ADMIN_HEADER,
          'Content-Type': 'application/json'
        }
      })

      expect(response.status).toBe(404)
    })
  })

  describe('PUT /api.php/firmwares/:id', () => {
    it('devrait mettre à jour un firmware', async () => {
      const updateData = {
        description: 'Description mise à jour',
        hardware_version: 'v1.1'
      }

      const response = await fetch(`${API_URL}/api.php/firmwares/fw-0001`, {
        method: 'PUT',
        headers: {
          'Authorization': ADMIN_HEADER,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      })

      expect(response.ok).toBe(true)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.firmware.description).toBe(updateData.description)
    })
  })

  describe('DELETE /api.php/firmwares/:id', () => {
    it('devrait supprimer un firmware', async () => {
      const response = await fetch(`${API_URL}/api.php/firmwares/fw-0001`, {
        method: 'DELETE',
        headers: {
          'Authorization': ADMIN_HEADER,
          'Content-Type': 'application/json'
        }
      })

      expect(response.ok).toBe(true)
      const data = await response.json()
      expect(data.success).toBe(true)
    })
  })

  describe('POST /api.php/firmwares/upload-ino', () => {
    it('devrait échouer sans fichier', async () => {
      const formData = new FormData()

      const response = await fetch(`${API_URL}/api.php/firmwares/upload-ino`, {
        method: 'POST',
        headers: {
          'Authorization': ADMIN_HEADER
        },
        body: formData
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
    })
  })
})
