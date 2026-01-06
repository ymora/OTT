/**
 * Tests de sécurité pour l'API
 * 
 * Ces tests vérifient que les mesures de sécurité sont correctement implémentées
 */

describe('API Security Tests', () => {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  let authToken = null

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

  describe('Protection contre les injections SQL', () => {
    it('devrait échouer avec une tentative d\'injection SQL', async () => {
      const maliciousInput = "'; DROP TABLE users; --"
      
      const response = await fetch(`${API_URL}/api.php/devices`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          device_identifier: maliciousInput,
          device_name: 'Test SQL Injection'
        })
      })

      // La requête doit échouer ou être traitée en toute sécurité
      expect(response.ok).toBe(false)
    })

    it('devrait échapper correctement les caractères spéciaux', async () => {
      const specialChars = "<script>alert('xss')</script>"
      
      const response = await fetch(`${API_URL}/api.php/patients`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          first_name: specialChars,
          last_name: 'Test XSS',
          medical_record_number: 'TEST123'
        })
      })

      if (response.ok) {
        const data = await response.json()
        // Les caractères spéciaux doivent être stockés mais non exécutés
        expect(data.patient.first_name).toBe(specialChars)
      }
    })
  })

  describe('Validation des entrées', () => {
    it('devrait rejeter les emails invalides', async () => {
      const invalidEmails = [
        'not-an-email',
        '@domain.com',
        'user@',
        'user..name@domain.com'
      ]

      for (const email of invalidEmails) {
        const response = await fetch(`${API_URL}/api.php/users`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: email,
            password: 'test123',
            role_name: 'user'
          })
        })

        expect(response.ok).toBe(false)
        const data = await response.json()
        expect(data.success).toBe(false)
      }
    })

    it('devrait valider les longueurs de chaînes', async () => {
      const longString = 'a'.repeat(1000) // Chaîne trop longue
      
      const response = await fetch(`${API_URL}/api.php/devices`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          device_identifier: longString,
          device_name: 'Test Long String'
        })
      })

      // La requête doit être rejetée ou tronquée
      expect(response.ok).toBe(false)
    })
  })

  describe('Authentification et autorisation', () => {
    it('devrait rejeter les requêtes sans token', async () => {
      const response = await fetch(`${API_URL}/api.php/users`)
      
      expect(response.status).toBe(401)
    })

    it('devrait rejeter les tokens invalides', async () => {
      const response = await fetch(`${API_URL}/api.php/users`, {
        headers: {
          'Authorization': 'Bearer invalid-token'
        }
      })
      
      expect(response.status).toBe(401)
    })

    it('devrait vérifier les permissions d\'accès', async () => {
      // Créer un utilisateur normal
      const userResponse = await fetch(`${API_URL}/api.php/users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: 'normaluser@test.com',
          password: 'test123',
          role_name: 'user'
        })
      })

      if (userResponse.ok) {
        const userData = await userResponse.json()
        
        // Se connecter en tant qu'utilisateur normal
        const loginResponse = await fetch(`${API_URL}/api.php/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'normaluser@test.com',
            password: 'test123'
          })
        })

        if (loginResponse.ok) {
          const loginData = await loginResponse.json()
          const userToken = loginData.token

          // Tenter d'accéder à une route admin
          const adminResponse = await fetch(`${API_URL}/api.php/admin/migrations`, {
            headers: {
              'Authorization': `Bearer ${userToken}`
            }
          })

          expect(adminResponse.status).toBe(403)
        }
      }
    })
  })

  describe('Rate limiting', () => {
    it('devrait limiter les requêtes excessives', async () => {
      const requests = []
      
      // Faire plusieurs requêtes rapidement
      for (let i = 0; i < 20; i++) {
        requests.push(
          fetch(`${API_URL}/api.php/health`, {
            headers: {
              'Authorization': `Bearer ${authToken}`
            }
          })
        )
      }

      const responses = await Promise.all(requests)
      
      // Au moins une requête devrait être limitée
      const rateLimited = responses.some(response => response.status === 429)
      expect(rateLimited).toBe(true)
    })
  })

  describe('CORS', () => {
    it('devrait inclure les en-têtes CORS appropriés', async () => {
      const response = await fetch(`${API_URL}/api.php/health`, {
        headers: {
          'Origin': 'http://localhost:3000'
        }
      })

      expect(response.headers.get('Access-Control-Allow-Origin')).toBeTruthy()
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeTruthy()
      expect(response.headers.get('Access-Control-Allow-Headers')).toBeTruthy()
    })

    it('devrait gérer les requêtes OPTIONS', async () => {
      const response = await fetch(`${API_URL}/api.php/health`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'GET'
        }
      })

      expect(response.status).toBe(200)
    })
  })
})
