/**
 * Tests pour l'API USB Logs
 * 
 * Ces tests vérifient que l'API de monitoring USB fonctionne correctement
 */

describe('USB Logs API', () => {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  let authToken = null
  let testDeviceId = null

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

  describe('POST /api.php/usb-logs', () => {
    it('devrait enregistrer des logs USB avec succès', async () => {
      const response = await fetch(`${API_URL}/api.php/usb-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          device_identifier: '893330240012345678',
          device_name: 'USB-TEST-001',
          logs: [
            {
              log_line: 'Test log 1',
              log_source: 'device',
              timestamp: Date.now()
            },
            {
              log_line: 'Test log 2',
              log_source: 'dashboard',
              timestamp: Date.now()
            }
          ]
        })
      })

      expect(response.status).toBe(201)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.inserted_count).toBe(2)
    })

    it('devrait rejeter une requête sans device_identifier', async () => {
      const response = await fetch(`${API_URL}/api.php/usb-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          logs: [{ log_line: 'Test', log_source: 'device' }]
        })
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
    })

    it('devrait rejeter une requête avec plus de 100 logs', async () => {
      const logs = Array.from({ length: 101 }, (_, i) => ({
        log_line: `Log ${i}`,
        log_source: 'device',
        timestamp: Date.now()
      }))

      const response = await fetch(`${API_URL}/api.php/usb-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          device_identifier: '893330240012345678',
          logs
        })
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
    })

    it('devrait rejeter une requête sans authentification', async () => {
      const response = await fetch(`${API_URL}/api.php/usb-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_identifier: '893330240012345678',
          logs: [{ log_line: 'Test', log_source: 'device' }]
        })
      })

      expect(response.status).toBe(401)
    })
  })

  describe('GET /api.php/usb-logs', () => {
    // Créer des logs de test avant les tests de récupération
    beforeAll(async () => {
      await fetch(`${API_URL}/api.php/usb-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          device_identifier: 'TEST-DEVICE-001',
          device_name: 'USB-TEST-GET',
          logs: [
            { log_line: 'GET Test log 1', log_source: 'device', timestamp: Date.now() },
            { log_line: 'GET Test log 2', log_source: 'dashboard', timestamp: Date.now() }
          ]
        })
      })
    })

    it('devrait récupérer tous les logs (admin uniquement)', async () => {
      const response = await fetch(`${API_URL}/api.php/usb-logs?limit=10`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(Array.isArray(data.logs)).toBe(true)
      expect(data.total).toBeGreaterThan(0)
    })

    it('devrait filtrer les logs par dispositif', async () => {
      const response = await fetch(`${API_URL}/api.php/usb-logs?device=TEST-DEVICE-001&limit=10`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.logs.every(log => log.device_identifier === 'TEST-DEVICE-001')).toBe(true)
    })

    it('devrait filtrer les logs par source', async () => {
      const response = await fetch(`${API_URL}/api.php/usb-logs?source=device&limit=10`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.logs.every(log => log.log_source === 'device')).toBe(true)
    })

    it('devrait rejeter une requête sans authentification', async () => {
      const response = await fetch(`${API_URL}/api.php/usb-logs?limit=10`)
      expect(response.status).toBe(401)
    })

    it('devrait rejeter une requête d\'un utilisateur non-admin', async () => {
      // Se connecter en tant qu'utilisateur normal
      const loginResponse = await fetch(`${API_URL}/api.php/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'user@test.com',
          password: 'user123'
        })
      })

      if (loginResponse.ok) {
        const { token } = await loginResponse.json()
        
        const response = await fetch(`${API_URL}/api.php/usb-logs?limit=10`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })

        expect(response.status).toBe(403)
        const data = await response.json()
        expect(data.success).toBe(false)
      }
    })
  })

  describe('GET /api.php/usb-logs/:device', () => {
    it('devrait récupérer les logs d\'un dispositif spécifique', async () => {
      const response = await fetch(`${API_URL}/api.php/usb-logs/TEST-DEVICE-001?limit=10`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.logs.every(log => log.device_identifier === 'TEST-DEVICE-001')).toBe(true)
    })
  })

  describe('DELETE /api.php/usb-logs/cleanup', () => {
    it('devrait nettoyer les vieux logs (admin uniquement)', async () => {
      const response = await fetch(`${API_URL}/api.php/usb-logs/cleanup`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(typeof data.deleted_count).toBe('number')
    })

    it('devrait rejeter une requête sans authentification', async () => {
      const response = await fetch(`${API_URL}/api.php/usb-logs/cleanup`, {
        method: 'DELETE'
      })

      expect(response.status).toBe(401)
    })
  })

  describe('Pagination', () => {
    it('devrait supporter la pagination', async () => {
      const response1 = await fetch(`${API_URL}/api.php/usb-logs?limit=5&offset=0`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      const data1 = await response1.json()

      const response2 = await fetch(`${API_URL}/api.php/usb-logs?limit=5&offset=5`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      const data2 = await response2.json()

      expect(data1.logs).not.toEqual(data2.logs)
      expect(data1.limit).toBe(5)
      expect(data2.limit).toBe(5)
      expect(data2.offset).toBe(5)
    })
  })
})

