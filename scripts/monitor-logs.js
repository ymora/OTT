/**
 * Script pour monitorer les logs en temps réel et détecter les erreurs JSON
 * Usage: node scripts/monitor-logs.js
 */

const readline = require('readline')
const fs = require('fs')
const path = require('path')

console.log('🔍 Monitoring des logs en temps réel...')
console.log('📋 Analyse des erreurs JSON et boucles de redirection\n')

// Créer un fichier de logs si nécessaire
const logFile = path.join(__dirname, '..', 'console-logs.txt')
if (!fs.existsSync(logFile)) {
  fs.writeFileSync(logFile, '', 'utf-8')
  console.log('✅ Fichier console-logs.txt créé')
  console.log('📝 Copiez les logs de la console F12 dans ce fichier\n')
}

// Analyser les logs existants
function analyzeLogs() {
  if (!fs.existsSync(logFile)) return
  
  const content = fs.readFileSync(logFile, 'utf-8')
  const lines = content.split('\n')
  
  const errors = {
    json: [],
    redirect: [],
    reload: [],
    cache: [],
    auth: []
  }
  
  lines.forEach((line, index) => {
    const lowerLine = line.toLowerCase()
    
    // Erreurs JSON
    if (lowerLine.includes('json') && (lowerLine.includes('error') || lowerLine.includes('unexpected') || lowerLine.includes('parse'))) {
      errors.json.push({ line: index + 1, content: line.trim() })
    }
    
    // Redirections
    if (lowerLine.includes('redirect') || lowerLine.includes('[homepage]') || lowerLine.includes('[dashboardlayout]')) {
      errors.redirect.push({ line: index + 1, content: line.trim() })
    }
    
    // Rechargements
    if (lowerLine.includes('reload') || lowerLine.includes('rechargement')) {
      errors.reload.push({ line: index + 1, content: line.trim() })
    }
    
    // Cache
    if (lowerLine.includes('cache') && (lowerLine.includes('clear') || lowerLine.includes('delete'))) {
      errors.cache.push({ line: index + 1, content: line.trim() })
    }
    
    // Auth
    if (lowerLine.includes('auth') || lowerLine.includes('login') || lowerLine.includes('token')) {
      errors.auth.push({ line: index + 1, content: line.trim() })
    }
  })
  
  // Afficher le rapport
  console.log('📊 ANALYSE DES LOGS:\n')
  
  if (errors.json.length > 0) {
    console.log('🔴 ERREURS JSON DÉTECTÉES:')
    errors.json.slice(0, 10).forEach(err => {
      console.log(`   Ligne ${err.line}: ${err.content.substring(0, 100)}`)
    })
    if (errors.json.length > 10) {
      console.log(`   ... et ${errors.json.length - 10} autres erreurs JSON`)
    }
    console.log('')
  }
  
  if (errors.redirect.length > 5) {
    console.log('🟡 TROP DE REDIRECTIONS:')
    console.log(`   ${errors.redirect.length} redirections détectées`)
    console.log(`   Première: Ligne ${errors.redirect[0].line}`)
    console.log(`   Dernière: Ligne ${errors.redirect[errors.redirect.length - 1].line}`)
    console.log('')
  }
  
  if (errors.reload.length > 3) {
    console.log('🟡 TROP DE RECHARGEMENTS:')
    console.log(`   ${errors.reload.length} rechargements détectés`)
    console.log('')
  }
  
  if (errors.cache.length > 10) {
    console.log('🟡 TROP D\'OPÉRATIONS DE CACHE:')
    console.log(`   ${errors.cache.length} opérations détectées`)
    console.log('')
  }
  
  // Détecter les patterns de boucle
  const recentRedirects = errors.redirect.slice(-10)
  if (recentRedirects.length >= 5) {
    const timeSpan = recentRedirects[recentRedirects.length - 1].line - recentRedirects[0].line
    if (timeSpan < 50) {
      console.log('🔴 BOUCLE DE REDIRECTION DÉTECTÉE!')
      console.log(`   ${recentRedirects.length} redirections en ${timeSpan} lignes`)
      console.log('')
    }
  }
  
  console.log('✅ Analyse terminée\n')
  console.log('💡 Pour mettre à jour: Modifiez console-logs.txt et relancez le script')
}

// Analyser au démarrage
analyzeLogs()

// Surveiller les changements du fichier
let lastSize = fs.existsSync(logFile) ? fs.statSync(logFile).size : 0
setInterval(() => {
  if (fs.existsSync(logFile)) {
    const currentSize = fs.statSync(logFile).size
    if (currentSize !== lastSize) {
      console.log('\n📝 Fichier mis à jour, nouvelle analyse...\n')
      lastSize = currentSize
      analyzeLogs()
    }
  }
}, 2000)

console.log('⏳ En attente de mises à jour du fichier console-logs.txt...')
console.log('   (Appuyez sur Ctrl+C pour arrêter)\n')

