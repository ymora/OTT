#!/usr/bin/env node
/**
 * Script de test pour l'API de compilation firmware
 * Teste directement l'endpoint SSE pour diagnostiquer les problèmes
 * 
 * Usage: node scripts/test_compile_api.js <firmware_id> <token>
 */

const https = require('https')
const http = require('http')

const API_URL = process.env.API_URL || 'https://ott-jbln.onrender.com'
const firmwareId = process.argv[2]
const token = process.argv[3]

if (!firmwareId) {
  console.error('❌ Usage: node scripts/test_compile_api.js <firmware_id> <token>')
  console.error('   Exemple: node scripts/test_compile_api.js 123 "votre_token_jwt"')
  process.exit(1)
}

if (!token) {
  console.error('❌ Token manquant!')
  console.error('   Récupérez votre token depuis localStorage (F12 → Application → Local Storage → ott_token)')
  process.exit(1)
}

const url = new URL(`${API_URL}/api.php/firmwares/compile/${firmwareId}?token=${encodeURIComponent(token)}`)
const isHttps = url.protocol === 'https:'
const client = isHttps ? https : http

console.log('═══════════════════════════════════════════════════════')
console.log('🧪 TEST API COMPILATION FIRMWARE')
console.log('═══════════════════════════════════════════════════════')
console.log('📦 Firmware ID:', firmwareId)
console.log('🌐 API URL:', API_URL)
console.log('🔗 URL SSE:', url.toString().substring(0, 100) + '...')
console.log('🔑 Token:', token.substring(0, 20) + '... (' + token.length + ' caractères)')
console.log('⏰ Timestamp:', new Date().toISOString())
console.log('═══════════════════════════════════════════════════════')
console.log('')

const options = {
  hostname: url.hostname,
  port: url.port || (isHttps ? 443 : 80),
  path: url.pathname + url.search,
  method: 'GET',
  headers: {
    'Accept': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'User-Agent': 'Node.js-SSE-Test/1.0'
  }
}

let connectionStartTime = Date.now()
let firstMessageTime = null
let messageCount = 0
let lastKeepAlive = Date.now()

const req = client.request(options, (res) => {
  const statusCode = res.statusCode
  const headers = res.headers
  
  console.log('📡 RÉPONSE SERVEUR:')
  console.log('   Status Code:', statusCode)
  console.log('   Content-Type:', headers['content-type'])
  console.log('   Connection:', headers['connection'])
  console.log('   Cache-Control:', headers['cache-control'])
  console.log('')
  
  if (statusCode !== 200) {
    console.error('❌ ERREUR: Status code', statusCode)
    console.error('   Headers:', JSON.stringify(headers, null, 2))
    res.on('data', (chunk) => {
      console.error('   Body:', chunk.toString())
    })
    return
  }
  
  if (headers['content-type']?.includes('text/event-stream')) {
    console.log('✅ Headers SSE corrects!')
    console.log('')
  } else {
    console.warn('⚠️  Content-Type inattendu:', headers['content-type'])
    console.warn('   Attendu: text/event-stream')
    console.log('')
  }
  
  let buffer = ''
  
  res.on('data', (chunk) => {
    if (!firstMessageTime) {
      firstMessageTime = Date.now()
      const timeToFirstMessage = firstMessageTime - connectionStartTime
      console.log('⏱️  Premier message reçu après', timeToFirstMessage, 'ms')
      console.log('')
    }
    
    buffer += chunk.toString()
    
    // Traiter les messages SSE (séparés par \n\n)
    const messages = buffer.split('\n\n')
    buffer = messages.pop() || '' // Garder le dernier message incomplet
    
    messages.forEach(msg => {
      if (!msg.trim()) return
      
      messageCount++
      lastKeepAlive = Date.now()
      
      // Ignorer les keep-alive (commentaires SSE)
      if (msg.trim().startsWith(':')) {
        console.log(`[${messageCount}] Keep-alive reçu`)
        return
      }
      
      // Extraire les données SSE
      const lines = msg.split('\n')
      let data = null
      
      lines.forEach(line => {
        if (line.startsWith('data: ')) {
          try {
            data = JSON.parse(line.substring(6))
          } catch (e) {
            console.warn(`[${messageCount}] Erreur parsing JSON:`, line.substring(6))
          }
        }
      })
      
      if (data) {
        console.log(`[${messageCount}] Message SSE:`)
        console.log('   Type:', data.type)
        if (data.message) {
          console.log('   Message:', data.message.substring(0, 100))
        }
        if (data.progress !== undefined) {
          console.log('   Progress:', data.progress + '%')
        }
        if (data.level) {
          console.log('   Level:', data.level)
        }
        console.log('')
        
        // Arrêter si erreur ou succès
        if (data.type === 'error' || data.type === 'success') {
          console.log('═══════════════════════════════════════════════════════')
          if (data.type === 'error') {
            console.error('❌ ERREUR:', data.message)
          } else {
            console.log('✅ SUCCÈS:', data.message)
          }
          console.log('═══════════════════════════════════════════════════════')
          req.destroy()
          process.exit(data.type === 'error' ? 1 : 0)
        }
      } else {
        console.log(`[${messageCount}] Message brut:`, msg.substring(0, 100))
        console.log('')
      }
    })
  })
  
  res.on('end', () => {
    console.log('')
    console.log('═══════════════════════════════════════════════════════')
    console.log('📊 RÉSUMÉ:')
    console.log('   Messages reçus:', messageCount)
    if (firstMessageTime) {
      console.log('   Temps au premier message:', firstMessageTime - connectionStartTime, 'ms')
    }
    console.log('   Connexion fermée par le serveur')
    console.log('═══════════════════════════════════════════════════════')
  })
  
  res.on('error', (err) => {
    console.error('❌ Erreur lors de la réception:', err.message)
  })
})

req.on('error', (err) => {
  console.error('')
  console.error('═══════════════════════════════════════════════════════')
  console.error('❌ ERREUR DE CONNEXION!')
  console.error('═══════════════════════════════════════════════════════')
  console.error('   Message:', err.message)
  console.error('   Code:', err.code)
  console.error('')
  console.error('🔍 Causes possibles:')
  console.error('   • Serveur inaccessible')
  console.error('   • Problème réseau')
  console.error('   • Certificat SSL invalide')
  console.error('   • Firewall bloque la connexion')
  console.error('═══════════════════════════════════════════════════════')
  process.exit(1)
})

// Timeout après 30 secondes
setTimeout(() => {
  const timeSinceLastMessage = Date.now() - lastKeepAlive
  if (timeSinceLastMessage > 5000) {
    console.log('')
    console.log('⏱️  TIMEOUT: Aucun message depuis 5 secondes')
    console.log('   La connexion peut être fermée ou le serveur est lent')
    req.destroy()
    process.exit(1)
  }
}, 30000)

// Vérifier la connexion après 100ms
setTimeout(() => {
  if (!firstMessageTime) {
    console.log('⏱️  [100ms] Aucun message reçu encore')
    console.log('   (Normal si le serveur est lent)')
    console.log('')
  }
}, 100)

// Vérifier après 2 secondes
setTimeout(() => {
  if (!firstMessageTime) {
    console.log('⏱️  [2s] Aucun message reçu - problème possible')
    console.log('   Vérifiez:')
    console.log('   • Que le token est valide')
    console.log('   • Que le firmware ID existe')
    console.log('   • Les logs du serveur Render')
    console.log('')
  }
}, 2000)

console.log('🔌 Connexion au serveur...')
console.log('')
connectionStartTime = Date.now()
req.end()

