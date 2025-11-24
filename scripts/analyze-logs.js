/**
 * Script pour analyser les logs de la console et détecter les boucles
 * Usage: Copiez les logs de la console et collez-les dans un fichier logs.txt
 * Puis: node scripts/analyze-logs.js
 */

const fs = require('fs')
const path = require('path')

const logFile = path.join(__dirname, '..', 'logs.txt')

if (!fs.existsSync(logFile)) {
  console.log('❌ Fichier logs.txt non trouvé')
  console.log('📝 Créez un fichier logs.txt à la racine du projet avec les logs de la console')
  process.exit(1)
}

const logs = fs.readFileSync(logFile, 'utf-8')
const lines = logs.split('\n')

// Détecter les patterns de boucle
const patterns = {
  redirect: /\[HomePage\]|\[DashboardLayout\]|redirection|redirect/i,
  reload: /reload|rechargement|location\.reload/i,
  cache: /cache|nettoyage|clear|unregister/i,
  sw: /Service Worker|SW\]|serviceWorker/i,
  auth: /AuthContext|authentification|login/i
}

const counts = {
  redirects: 0,
  reloads: 0,
  cacheOps: 0,
  swOps: 0,
  authOps: 0
}

const sequences = []
let currentSequence = []

lines.forEach((line, index) => {
  if (patterns.redirect.test(line)) {
    counts.redirects++
    currentSequence.push({ type: 'redirect', line: index + 1, content: line.trim() })
  }
  if (patterns.reload.test(line)) {
    counts.reloads++
    currentSequence.push({ type: 'reload', line: index + 1, content: line.trim() })
  }
  if (patterns.cache.test(line)) {
    counts.cacheOps++
    currentSequence.push({ type: 'cache', line: index + 1, content: line.trim() })
  }
  if (patterns.sw.test(line)) {
    counts.swOps++
    currentSequence.push({ type: 'sw', line: index + 1, content: line.trim() })
  }
  if (patterns.auth.test(line)) {
    counts.authOps++
    currentSequence.push({ type: 'auth', line: index + 1, content: line.trim() })
  }

  // Si on a une séquence significative, l'enregistrer
  if (currentSequence.length >= 3) {
    sequences.push([...currentSequence])
    currentSequence = []
  } else if (currentSequence.length > 0 && !line.trim()) {
    // Nouvelle ligne vide = fin de séquence
    if (currentSequence.length >= 2) {
      sequences.push([...currentSequence])
    }
    currentSequence = []
  }
})

// Analyser les séquences répétitives
const repeatedSequences = []
sequences.forEach((seq, i) => {
  const seqStr = seq.map(s => s.type).join(' -> ')
  const matches = sequences.filter(s => s.map(s2 => s2.type).join(' -> ') === seqStr)
  if (matches.length > 1) {
    repeatedSequences.push({ sequence: seqStr, count: matches.length, first: seq[0].line })
  }
})

// Afficher le rapport
console.log('📊 ANALYSE DES LOGS\n')
console.log('📈 Statistiques:')
console.log(`   Redirections: ${counts.redirects}`)
console.log(`   Rechargements: ${counts.reloads}`)
console.log(`   Opérations cache: ${counts.cacheOps}`)
console.log(`   Opérations Service Worker: ${counts.swOps}`)
console.log(`   Opérations auth: ${counts.authOps}`)
console.log('')

if (repeatedSequences.length > 0) {
  console.log('⚠️  SÉQUENCES RÉPÉTITIVES DÉTECTÉES (BOUCLES POTENTIELLES):')
  repeatedSequences.forEach((rs, i) => {
    console.log(`   ${i + 1}. ${rs.sequence} (${rs.count}x, ligne ${rs.first})`)
  })
  console.log('')
}

if (counts.reloads > 5) {
  console.log('🔴 ALERTE: Trop de rechargements détectés!')
}

if (counts.redirects > 10) {
  console.log('🔴 ALERTE: Trop de redirections détectées!')
}

if (counts.cacheOps > 20) {
  console.log('🟡 ATTENTION: Beaucoup d\'opérations de cache')
}

console.log('\n✅ Analyse terminée')

