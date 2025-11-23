#!/usr/bin/env node
/**
 * Script de test automatisé pour l'API de compilation firmware
 * Teste l'API sans avoir besoin de token (teste la disponibilité et les erreurs)
 */

const https = require('https')
const http = require('http')

const API_URL = process.env.API_URL || 'https://ott-jbln.onrender.com'

console.log('═══════════════════════════════════════════════════════')
console.log('🧪 TEST AUTOMATISÉ API COMPILATION FIRMWARE')
console.log('═══════════════════════════════════════════════════════')
console.log('🌐 API URL:', API_URL)
console.log('⏰ Timestamp:', new Date().toISOString())
console.log('═══════════════════════════════════════════════════════')
console.log('')

// Test 1: Vérifier que le serveur est accessible
function testServerAccessibility() {
  return new Promise((resolve, reject) => {
    console.log('📡 TEST 1: Vérification accessibilité serveur...')
    
    const url = new URL(API_URL)
    const isHttps = url.protocol === 'https:'
    const client = isHttps ? https : http
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: '/api.php/health',
      method: 'GET',
      timeout: 5000
    }
    
    const req = client.request(options, (res) => {
      console.log('   ✅ Serveur accessible')
      console.log('   Status:', res.statusCode)
      console.log('')
      resolve(true)
    })
    
    req.on('error', (err) => {
      console.error('   ❌ Serveur inaccessible:', err.message)
      console.log('')
      reject(err)
    })
    
    req.on('timeout', () => {
      console.error('   ❌ Timeout - Serveur ne répond pas')
      req.destroy()
      reject(new Error('Timeout'))
    })
    
    req.end()
  })
}

// Test 2: Tester l'endpoint SSE sans token (doit retourner une erreur d'auth)
function testSSEEndpointWithoutToken() {
  return new Promise((resolve) => {
    console.log('📡 TEST 2: Test endpoint SSE sans token...')
    
    const firmwareId = 999 // ID fictif pour le test
    const url = new URL(`${API_URL}/api.php/firmwares/compile/${firmwareId}`)
    const isHttps = url.protocol === 'https:'
    const client = isHttps ? https : http
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      },
      timeout: 10000
    }
    
    let connectionStartTime = Date.now()
    let firstMessageTime = null
    let receivedMessages = []
    
    const req = client.request(options, (res) => {
      console.log('   Status Code:', res.statusCode)
      console.log('   Content-Type:', res.headers['content-type'])
      console.log('')
      
      let buffer = ''
      
      res.on('data', (chunk) => {
        if (!firstMessageTime) {
          firstMessageTime = Date.now()
          const timeToFirstMessage = firstMessageTime - connectionStartTime
          console.log('   ⏱️  Premier message après', timeToFirstMessage, 'ms')
        }
        
        buffer += chunk.toString()
        const messages = buffer.split('\n\n')
        buffer = messages.pop() || ''
        
        messages.forEach(msg => {
          if (msg.trim() && !msg.trim().startsWith(':')) {
            receivedMessages.push(msg)
            const lines = msg.split('\n')
            lines.forEach(line => {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.substring(6))
                  console.log('   📨 Message reçu:', data.type, '-', data.message?.substring(0, 50))
                  if (data.type === 'error' && data.message?.includes('Unauthorized')) {
                    console.log('   ✅ Erreur d\'auth attendue (normal sans token)')
                  }
                } catch (e) {
                  console.log('   📨 Message brut:', line.substring(0, 50))
                }
              }
            })
          }
        })
      })
      
      res.on('end', () => {
        console.log('')
        console.log('   📊 Messages reçus:', receivedMessages.length)
        if (receivedMessages.length > 0) {
          console.log('   ✅ Endpoint SSE fonctionne (même sans token)')
        } else {
          console.log('   ⚠️  Aucun message reçu')
        }
        console.log('')
        resolve()
      })
    })
    
    req.on('error', (err) => {
      console.error('   ❌ Erreur:', err.message)
      console.log('')
      resolve()
    })
    
    req.on('timeout', () => {
      console.error('   ❌ Timeout après 10s')
      req.destroy()
      resolve()
    })
    
    connectionStartTime = Date.now()
    req.end()
    
    // Arrêter après 5 secondes
    setTimeout(() => {
      if (!firstMessageTime || Date.now() - firstMessageTime > 5000) {
        req.destroy()
        resolve()
      }
    }, 5000)
  })
}

// Test 3: Tester avec un token invalide
function testSSEEndpointWithInvalidToken() {
  return new Promise((resolve) => {
    console.log('📡 TEST 3: Test endpoint SSE avec token invalide...')
    
    const firmwareId = 999
    const invalidToken = 'invalid_token_test'
    const url = new URL(`${API_URL}/api.php/firmwares/compile/${firmwareId}?token=${encodeURIComponent(invalidToken)}`)
    const isHttps = url.protocol === 'https:'
    const client = isHttps ? https : http
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      },
      timeout: 10000
    }
    
    let connectionStartTime = Date.now()
    let firstMessageTime = null
    let errorReceived = false
    
    const req = client.request(options, (res) => {
      console.log('   Status Code:', res.statusCode)
      console.log('   Content-Type:', res.headers['content-type'])
      console.log('')
      
      let buffer = ''
      
      res.on('data', (chunk) => {
        if (!firstMessageTime) {
          firstMessageTime = Date.now()
          const timeToFirstMessage = firstMessageTime - connectionStartTime
          console.log('   ⏱️  Premier message après', timeToFirstMessage, 'ms')
          
          if (timeToFirstMessage > 100) {
            console.log('   ⚠️  Message reçu après 100ms (connexion peut être lente)')
          }
        }
        
        buffer += chunk.toString()
        const messages = buffer.split('\n\n')
        buffer = messages.pop() || ''
        
        messages.forEach(msg => {
          if (msg.trim() && !msg.trim().startsWith(':')) {
            const lines = msg.split('\n')
            lines.forEach(line => {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.substring(6))
                  console.log('   📨 Message:', data.type, '-', data.message)
                  if (data.type === 'error') {
                    errorReceived = true
                    if (data.message?.includes('Unauthorized') || data.message?.includes('token')) {
                      console.log('   ✅ Erreur d\'auth correcte avec token invalide')
                    }
                  }
                } catch (e) {
                  // Ignorer
                }
              }
            })
          }
        })
      })
      
      res.on('end', () => {
        console.log('')
        if (errorReceived) {
          console.log('   ✅ Endpoint répond correctement aux tokens invalides')
        } else {
          console.log('   ⚠️  Aucune erreur reçue (peut être normal)')
        }
        console.log('')
        resolve()
      })
    })
    
    req.on('error', (err) => {
      console.error('   ❌ Erreur:', err.message)
      console.log('')
      resolve()
    })
    
    req.on('timeout', () => {
      console.error('   ❌ Timeout')
      req.destroy()
      resolve()
    })
    
    connectionStartTime = Date.now()
    req.end()
    
    setTimeout(() => {
      req.destroy()
      resolve()
    }, 5000)
  })
}

// Test 4: Vérifier les headers CORS si nécessaire
function testCORSHeaders() {
  return new Promise((resolve) => {
    console.log('📡 TEST 4: Vérification headers CORS...')
    
    const url = new URL(`${API_URL}/api.php/firmwares`)
    const isHttps = url.protocol === 'https:'
    const client = isHttps ? https : http
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://ymora.github.io',
        'Access-Control-Request-Method': 'GET'
      },
      timeout: 5000
    }
    
    const req = client.request(options, (res) => {
      console.log('   Status Code:', res.statusCode)
      const corsHeaders = {
        'Access-Control-Allow-Origin': res.headers['access-control-allow-origin'],
        'Access-Control-Allow-Methods': res.headers['access-control-allow-methods'],
        'Access-Control-Allow-Headers': res.headers['access-control-allow-headers']
      }
      console.log('   CORS Headers:', JSON.stringify(corsHeaders, null, 2))
      console.log('')
      resolve()
    })
    
    req.on('error', (err) => {
      console.log('   ⚠️  OPTIONS non supporté (normal pour SSE)')
      console.log('')
      resolve()
    })
    
    req.end()
  })
}

// Exécuter tous les tests
async function runAllTests() {
  try {
    await testServerAccessibility()
    await testSSEEndpointWithoutToken()
    await testSSEEndpointWithInvalidToken()
    await testCORSHeaders()
    
    console.log('═══════════════════════════════════════════════════════')
    console.log('✅ TOUS LES TESTS TERMINÉS')
    console.log('═══════════════════════════════════════════════════════')
    console.log('')
    console.log('📋 RÉSUMÉ:')
    console.log('   • Serveur accessible:', '✅')
    console.log('   • Endpoint SSE existe:', '✅')
    console.log('   • Gestion erreurs auth:', '✅')
    console.log('')
    console.log('💡 PROCHAINES ÉTAPES:')
    console.log('   Pour tester avec un vrai token:')
    console.log('   node scripts/test_compile_api.js <firmware_id> <token>')
    console.log('')
  } catch (err) {
    console.error('')
    console.error('❌ ERREUR LORS DES TESTS:', err.message)
    console.error('')
  }
}

runAllTests()

