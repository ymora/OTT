#!/usr/bin/env node
/**
 * Script de test de connexion pour vérifier que tous les assets sont accessibles
 * Usage: node scripts/test_connection.js [baseUrl]
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.argv[2] || 'https://ymora.github.io';
const BASE_PATH = '/OTT';

// Couleurs pour la console
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[1;31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'OTT-Connection-Test/1.0'
      },
      timeout: 10000
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function testFile(url, description) {
  try {
    const response = await makeRequest(url);
    if (response.statusCode === 200) {
      log(`✓ ${description}`, 'green');
      return { success: true, statusCode: response.statusCode };
    } else {
      log(`✗ ${description} - Status: ${response.statusCode}`, 'red');
      return { success: false, statusCode: response.statusCode };
    }
  } catch (error) {
    log(`✗ ${description} - Error: ${error.message}`, 'red');
    return { success: false, error: error.message };
  }
}

async function findCssFilesInHtml(htmlContent) {
  // Rechercher les fichiers CSS - plusieurs méthodes pour être sûr
  const matches = new Set();
  
  // Méthode 1: href dans les balises <link>
  const hrefRegex = /href=["']([^"']*\/_next\/static\/css\/[^"']*\.css)["']/g;
  let match;
  while ((match = hrefRegex.exec(htmlContent)) !== null) {
    matches.add(match[1]);
  }
  
  // Méthode 2: Recherche simple du pattern CSS
  const simpleRegex = /\/_next\/static\/css\/[^"'\s<>]*\.css/g;
  const simpleMatches = htmlContent.match(simpleRegex) || [];
  simpleMatches.forEach(m => {
    // Ajouter le basePath si nécessaire
    if (!m.startsWith('/OTT')) {
      matches.add(`/OTT${m}`);
    } else {
      matches.add(m);
    }
  });
  
  return Array.from(matches);
}

async function findJsFilesInHtml(htmlContent) {
  const jsRegex = /src=["']([^"']*\/_next\/static\/[^"']*\.js)["']/g;
  const matches = [];
  let match;
  while ((match = jsRegex.exec(htmlContent)) !== null) {
    matches.push(match[1]);
  }
  return [...new Set(matches)];
}

async function main() {
  log('\n🔍 Test de connexion OTT Dashboard\n', 'cyan');
  log(`Base URL: ${BASE_URL}${BASE_PATH}\n`, 'blue');

  const results = {
    passed: 0,
    failed: 0,
    total: 0
  };

  // Test 1: Page principale
  log('📄 Test de la page principale...', 'blue');
  const indexUrl = `${BASE_URL}${BASE_PATH}/`;
  const indexResult = await testFile(indexUrl, 'Page principale (index.html)');
  results.total++;
  if (indexResult.success) {
    results.passed++;
  } else {
    results.failed++;
    log(`\n❌ Impossible de charger la page principale. Arrêt des tests.\n`, 'red');
    process.exit(1);
  }

  // Récupérer le contenu HTML
  let htmlContent = '';
  try {
    const response = await makeRequest(indexUrl);
    htmlContent = response.data;
  } catch (error) {
    log(`\n❌ Impossible de récupérer le contenu HTML: ${error.message}\n`, 'red');
    process.exit(1);
  }

  // Test 2: Fichiers CSS référencés dans le HTML
  log('\n🎨 Test des fichiers CSS...', 'blue');
  const cssFiles = await findCssFilesInHtml(htmlContent);
  if (cssFiles.length === 0) {
    log('⚠️  Aucun fichier CSS trouvé dans le HTML', 'yellow');
  } else {
    for (const cssPath of cssFiles) {
      const cssUrl = cssPath.startsWith('http') ? cssPath : `${BASE_URL}${cssPath}`;
      results.total++;
      const result = await testFile(cssUrl, `CSS: ${cssPath}`);
      if (result.success) {
        results.passed++;
      } else {
        results.failed++;
      }
    }
  }

  // Test 3: Fichiers JavaScript critiques
  log('\n📜 Test des fichiers JavaScript critiques...', 'blue');
  const jsFiles = await findJsFilesInHtml(htmlContent);
  const criticalJsFiles = jsFiles.filter(file => 
    file.includes('main-') || 
    file.includes('webpack-') || 
    file.includes('framework-')
  ).slice(0, 5); // Limiter à 5 fichiers pour ne pas surcharger

  for (const jsPath of criticalJsFiles) {
    const jsUrl = jsPath.startsWith('http') ? jsPath : `${BASE_URL}${jsPath}`;
    results.total++;
    const result = await testFile(jsUrl, `JS: ${path.basename(jsPath)}`);
    if (result.success) {
      results.passed++;
    } else {
      results.failed++;
    }
  }

  // Test 4: Assets statiques
  log('\n🖼️  Test des assets statiques...', 'blue');
  const staticAssets = [
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
    '/sw.js'
  ];

  for (const asset of staticAssets) {
    const assetUrl = `${BASE_URL}${BASE_PATH}${asset}`;
    results.total++;
    const result = await testFile(assetUrl, `Asset: ${asset}`);
    if (result.success) {
      results.passed++;
    } else {
      results.failed++;
    }
  }

  // Test 5: Vérifier les fichiers CSS dans le dossier out
  log('\n📁 Vérification locale des fichiers CSS...', 'blue');
  const outCssDir = path.join(process.cwd(), 'out', '_next', 'static', 'css');
  if (fs.existsSync(outCssDir)) {
    const cssFilesLocal = fs.readdirSync(outCssDir).filter(f => f.endsWith('.css'));
    log(`Fichiers CSS trouvés localement: ${cssFilesLocal.length}`, 'cyan');
    cssFilesLocal.forEach(file => {
      log(`  - ${file}`, 'cyan');
    });
  } else {
    log('⚠️  Dossier out/_next/static/css non trouvé', 'yellow');
  }

  // Résumé
  log('\n' + '='.repeat(50), 'cyan');
  log('📊 Résumé des tests', 'cyan');
  log('='.repeat(50), 'cyan');
  log(`Total: ${results.total}`, 'blue');
  log(`✓ Réussis: ${results.passed}`, 'green');
  log(`✗ Échoués: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  
  if (results.failed === 0) {
    log('\n✅ Tous les tests sont passés !\n', 'green');
    process.exit(0);
  } else {
    log('\n❌ Certains tests ont échoué. Vérifiez les erreurs ci-dessus.\n', 'red');
    log('💡 Suggestions:', 'yellow');
    log('  1. Vérifiez que le build a été fait correctement (npm run export)', 'yellow');
    log('  2. Vérifiez que tous les fichiers sont bien déployés sur GitHub Pages', 'yellow');
    log('  3. Videz le cache du navigateur et du service worker', 'yellow');
    log('  4. Vérifiez que le basePath est correctement configuré (/OTT)', 'yellow');
    process.exit(1);
  }
}

main().catch((error) => {
  log(`\n❌ Erreur fatale: ${error.message}\n`, 'red');
  console.error(error);
  process.exit(1);
});

