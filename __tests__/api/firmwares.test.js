/**
 * Tests pour l'API Firmwares
 * 
 * Ces tests vérifient que l'API de gestion des firmwares fonctionne correctement
 */

describe('Firmwares API', () => {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  let authToken = null
  let testFirmwareId = null

  // Se connecter en tant qu'admin avant tous les tests
  beforeAll(async () => {
    const loginResponse = await fetch(`${API_URL}/api.php/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@test.com',
        password: 'admin123'
      })
    })
    
    if (loginResponse.ok) {
      const data = await loginResponse.json()
      authToken = data.token
    }
  })

  describe('GET /api.php/firmwares', () => {
    it('devrait récupérer la liste des firmwares', async () => {
      const response = await fetch(`${API_URL}/api.php/firmwares`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
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
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(firmwareData)
      })

      expect(response.ok).toBe(true)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.firmware).toBeDefined()
      expect(data.firmware.version).toBe(firmwareData.version)
      
      testFirmwareId = data.firmware.id
    })

    it('devrait échouer avec des données invalides', async () => {
      const invalidData = {
        version: '', // Version vide
        description: 'Firmware invalide'
      }

      const response = await fetch(`${API_URL}/api.php/firmwares`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
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
      if (!testFirmwareId) return

      const response = await fetch(`${API_URL}/api.php/firmwares/${testFirmwareId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      })

      expect(response.ok).toBe(true)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.firmware.id).toBe(testFirmwareId)
    })

    it('devrait retourner 404 pour un firmware inexistant', async () => {
      const response = await fetch(`${API_URL}/api.php/firmwares/999999`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      })

      expect(response.status).toBe(404)
    })
  })

  describe('PUT /api.php/firmwares/:id', () => {
    it('devrait mettre à jour un firmware', async () => {
      if (!testFirmwareId) return

      const updateData = {
        description: 'Description mise à jour',
        hardware_version: 'v1.1'
      }

      const response = await fetch(`${API_URL}/api.php/firmwares/${testFirmwareId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
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
      if (!testFirmwareId) return

      const response = await fetch(`${API_URL}/api.php/firmwares/${testFirmwareId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
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
      // Ne pas ajouter de fichier pour tester l'erreur

      const response = await fetch(`${API_URL}/api.php/firmwares/upload-ino`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        body: formData
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
    })
  })
})
