#!/usr/bin/env node
/**
 * Audit Complet Automatique - OTT Firmware/API/Frontend/DB
 * 
 * Ce script analyse la cohérence entre :
 * - Firmware (paramètres configurables, données envoyées)
 * - API (endpoints, validation, stockage)
 * - Frontend (DeviceModal, formulaires)
 * - Base de données (schéma SQL)
 * 
 * Usage: node scripts/audit-complet.js
 */

const fs = require('fs');
const path = require('path');

// Couleurs pour la console
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(80));
  log(title, 'bold');
  console.log('='.repeat(80));
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'cyan');
}

// ============================================================================
// 1. ANALYSE DU FIRMWARE
// ============================================================================

function analyzeFirmware() {
  logSection('1. ANALYSE DU FIRMWARE');
  
  const firmwarePath = path.join(__dirname, '../hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino');
  
  if (!fs.existsSync(firmwarePath)) {
    logError(`Fichier firmware non trouvé: ${firmwarePath}`);
    return null;
  }
  
  const firmwareContent = fs.readFileSync(firmwarePath, 'utf-8');
  
  // Extraire les paramètres configurables (UPDATE_CONFIG)
  const updateConfigPattern = /payloadDoc\.containsKey\(["']([^"']+)["']\)/g;
  const configParams = new Set();
  let match;
  
  while ((match = updateConfigPattern.exec(firmwareContent)) !== null) {
    configParams.add(match[1]);
  }
  
  // Extraire les champs envoyés dans les mesures
  const measurementPattern = /doc\[["']([^"']+)["']\]\s*=/g;
  const measurementFields = new Set();
  
  // Chercher dans sendMeasurement
  const sendMeasurementMatch = firmwareContent.match(/bool sendMeasurement\([^)]*\)\s*\{[\s\S]*?\n\}/);
  if (sendMeasurementMatch) {
    let m;
    while ((m = measurementPattern.exec(sendMeasurementMatch[0])) !== null) {
      measurementFields.add(m[1]);
    }
  }
  
  // Extraire les constantes par défaut
  const defaultPattern = /(?:DEFAULT_|_DEFAULT)\s+(\w+)\s*=\s*([^;]+)/g;
  const defaults = {};
  while ((match = defaultPattern.exec(firmwareContent)) !== null) {
    defaults[match[1].toLowerCase()] = match[2].trim();
  }
  
  // Extraire les variables de configuration
  const varPattern = /static\s+(?:uint32_t|uint16_t|uint8_t|bool|String)\s+(\w+)\s*=/g;
  const configVars = new Set();
  while ((match = varPattern.exec(firmwareContent)) !== null) {
    configVars.add(match[1]);
  }
  
  logInfo(`Paramètres configurables trouvés: ${configParams.size}`);
  logInfo(`Champs de mesure trouvés: ${measurementFields.size}`);
  logInfo(`Constantes par défaut trouvées: ${Object.keys(defaults).length}`);
  
  return {
    configParams: Array.from(configParams),
    measurementFields: Array.from(measurementFields),
    defaults,
    configVars: Array.from(configVars)
  };
}

// ============================================================================
// 2. ANALYSE DE L'API
// ============================================================================

function analyzeAPI() {
  logSection('2. ANALYSE DE L\'API');
  
  const apiPath = path.join(__dirname, '../api/handlers/devices/measurements.php');
  const configPath = path.join(__dirname, '../api/handlers/devices/config.php');
  
  const apiData = {
    measurementFields: new Set(),
    configParams: new Set(),
    validationRules: {}
  };
  
  // Analyser measurements.php
  if (fs.existsSync(apiPath)) {
    const content = fs.readFileSync(apiPath, 'utf-8');
    
    // Extraire les champs extraits de $input
    const inputPattern = /\$(\w+)\s*=\s*\$input\[["']([^"']+)["']\]/g;
    let match;
    while ((match = inputPattern.exec(content)) !== null) {
      apiData.measurementFields.add(match[2]);
    }
    
    // Extraire les validations
    const validationPattern = /if\s*\([^)]*\$(\w+)[^)]*\)/g;
    while ((match = validationPattern.exec(content)) !== null) {
      if (!apiData.validationRules[match[1]]) {
        apiData.validationRules[match[1]] = [];
      }
    }
  }
  
  // Analyser config.php
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf-8');
    
    // Extraire les paramètres de configuration
    const configPattern = /["'](\w+)["']\s*=>/g;
    let match;
    while ((match = configPattern.exec(content)) !== null) {
      apiData.configParams.add(match[1]);
    }
  }
  
  logInfo(`Champs de mesure API: ${apiData.measurementFields.size}`);
  logInfo(`Paramètres de config API: ${apiData.configParams.size}`);
  
  return {
    measurementFields: Array.from(apiData.measurementFields),
    configParams: Array.from(apiData.configParams),
    validationRules: apiData.validationRules
  };
}

// ============================================================================
// 3. ANALYSE DU FRONTEND
// ============================================================================

function analyzeFrontend() {
  logSection('3. ANALYSE DU FRONTEND');
  
  const deviceModalPath = path.join(__dirname, '../components/DeviceModal.js');
  const deviceCommandsPath = path.join(__dirname, '../lib/deviceCommands.js');
  
  const frontendData = {
    formFields: new Set(),
    payloadFields: new Set()
  };
  
  // Analyser DeviceModal.js
  if (fs.existsSync(deviceModalPath)) {
    const content = fs.readFileSync(deviceModalPath, 'utf-8');
    
    // Extraire les champs du formulaire (formData)
    const formDataPattern = /(\w+):\s*(?:null|''|\[\]|false)/g;
    let match;
    while ((match = formDataPattern.exec(content)) !== null) {
      frontendData.formFields.add(match[1]);
    }
    
    // Extraire les champs dans handleSubmit
    const submitPattern = /(\w+):\s*formData\.(\w+)/g;
    while ((match = submitPattern.exec(content)) !== null) {
      frontendData.formFields.add(match[2]);
    }
  }
  
  // Analyser deviceCommands.js
  if (fs.existsSync(deviceCommandsPath)) {
    const content = fs.readFileSync(deviceCommandsPath, 'utf-8');
    
    // Extraire les champs du payload
    const payloadPattern = /payload\[["']([^"']+)["']\]\s*=/g;
    let match;
    while ((match = payloadPattern.exec(content)) !== null) {
      frontendData.payloadFields.add(match[1]);
    }
    
    // Extraire les appels addString/addNumber
    const addPattern = /add(?:String|Number)\(["']([^"']+)["']/g;
    while ((match = addPattern.exec(content)) !== null) {
      frontendData.payloadFields.add(match[1]);
    }
  }
  
  logInfo(`Champs de formulaire: ${frontendData.formFields.size}`);
  logInfo(`Champs de payload: ${frontendData.payloadFields.size}`);
  
  return {
    formFields: Array.from(frontendData.formFields),
    payloadFields: Array.from(frontendData.payloadFields)
  };
}

// ============================================================================
// 4. ANALYSE DE LA BASE DE DONNÉES
// ============================================================================

function analyzeDatabase() {
  logSection('4. ANALYSE DE LA BASE DE DONNÉES');
  
  const schemaPath = path.join(__dirname, '../sql/schema.sql');
  
  const dbData = {
    deviceColumns: new Set(),
    configColumns: new Set(),
    measurementColumns: new Set()
  };
  
  if (fs.existsSync(schemaPath)) {
    const content = fs.readFileSync(schemaPath, 'utf-8');
    
    // Extraire les colonnes de devices
    const devicesMatch = content.match(/CREATE TABLE.*?devices[^)]*\(([\s\S]*?)\);/i);
    if (devicesMatch) {
      const columns = devicesMatch[1].match(/(\w+)\s+[^,,\n]+/g);
      if (columns) {
        columns.forEach(col => {
          const colName = col.match(/^\s*(\w+)/);
          if (colName) dbData.deviceColumns.add(colName[1]);
        });
      }
    }
    
    // Extraire les colonnes de device_configurations
    const configMatch = content.match(/CREATE TABLE.*?device_configurations[^)]*\(([\s\S]*?)\);/i);
    if (configMatch) {
      const columns = configMatch[1].match(/(\w+)\s+[^,,\n]+/g);
      if (columns) {
        columns.forEach(col => {
          const colName = col.match(/^\s*(\w+)/);
          if (colName) dbData.configColumns.add(colName[1]);
        });
      }
    }
    
    // Extraire les colonnes de measurements
    const measurementsMatch = content.match(/CREATE TABLE.*?measurements[^)]*\(([\s\S]*?)\);/i);
    if (measurementsMatch) {
      const columns = measurementsMatch[1].match(/(\w+)\s+[^,,\n]+/g);
      if (columns) {
        columns.forEach(col => {
          const colName = col.match(/^\s*(\w+)/);
          if (colName) dbData.measurementColumns.add(colName[1]);
        });
      }
    }
  }
  
  logInfo(`Colonnes devices: ${dbData.deviceColumns.size}`);
  logInfo(`Colonnes device_configurations: ${dbData.configColumns.size}`);
  logInfo(`Colonnes measurements: ${dbData.measurementColumns.size}`);
  
  return {
    deviceColumns: Array.from(dbData.deviceColumns),
    configColumns: Array.from(dbData.configColumns),
    measurementColumns: Array.from(dbData.measurementColumns)
  };
}

// ============================================================================
// 5. COMPARAISON ET DÉTECTION D'INCOHÉRENCES
// ============================================================================

function compareAndReport(firmware, api, frontend, database) {
  logSection('5. RAPPORT D\'INCOHÉRENCES');
  
  const issues = [];
  
  // 1. Paramètres de configuration
  log('\n📋 Paramètres de configuration:');
  const fwConfig = new Set(firmware.configParams);
  const fePayload = new Set(frontend.payloadFields);
  const dbConfig = new Set(database.configColumns);
  
  // Paramètres dans firmware mais pas dans frontend
  fwConfig.forEach(param => {
    if (!fePayload.has(param) && !fePayload.has(param.replace(/_/g, ''))) {
      issues.push({
        type: 'MISSING_IN_FRONTEND',
        category: 'config',
        param,
        message: `Paramètre '${param}' présent dans firmware mais absent du frontend`
      });
      logWarning(`  - ${param} (firmware) → manquant dans frontend`);
    }
  });
  
  // Paramètres dans frontend mais pas dans firmware
  fePayload.forEach(param => {
    if (!fwConfig.has(param) && !fwConfig.has(param.replace(/_/g, ''))) {
      issues.push({
        type: 'MISSING_IN_FIRMWARE',
        category: 'config',
        param,
        message: `Paramètre '${param}' présent dans frontend mais absent du firmware`
      });
      logWarning(`  - ${param} (frontend) → manquant dans firmware`);
    }
  });
  
  // 2. Champs de mesure
  log('\n📊 Champs de mesure:');
  const fwMeasure = new Set(firmware.measurementFields);
  const apiMeasure = new Set(api.measurementFields);
  const dbMeasure = new Set(database.measurementColumns);
  
  // Champs dans firmware mais pas dans API
  fwMeasure.forEach(field => {
    if (!apiMeasure.has(field) && !apiMeasure.has(field.replace(/_/g, ''))) {
      issues.push({
        type: 'MISSING_IN_API',
        category: 'measurement',
        param: field,
        message: `Champ '${field}' envoyé par firmware mais non traité par API`
      });
      logError(`  - ${field} (firmware) → manquant dans API`);
    }
  });
  
  // Champs dans API mais pas dans DB
  apiMeasure.forEach(field => {
    const dbField = field.replace(/_/g, '').toLowerCase();
    if (!dbMeasure.has(field) && !dbMeasure.has(dbField)) {
      issues.push({
        type: 'MISSING_IN_DB',
        category: 'measurement',
        param: field,
        message: `Champ '${field}' traité par API mais absent de la base de données`
      });
      logError(`  - ${field} (API) → manquant dans DB`);
    }
  });
  
  // 3. Résumé
  log('\n📈 Résumé:');
  logInfo(`Total d'incohérences détectées: ${issues.length}`);
  
  const byType = {};
  issues.forEach(issue => {
    byType[issue.type] = (byType[issue.type] || 0) + 1;
  });
  
  Object.entries(byType).forEach(([type, count]) => {
    logWarning(`  ${type}: ${count}`);
  });
  
  // Générer un rapport JSON
  const reportPath = path.join(__dirname, '../docs/AUDIT_COMPLET.json');
  const report = {
    timestamp: new Date().toISOString(),
    firmware: {
      configParams: firmware.configParams,
      measurementFields: firmware.measurementFields,
      defaults: firmware.defaults
    },
    api: {
      measurementFields: api.measurementFields,
      configParams: api.configParams
    },
    frontend: {
      formFields: frontend.formFields,
      payloadFields: frontend.payloadFields
    },
    database: {
      deviceColumns: database.deviceColumns,
      configColumns: database.configColumns,
      measurementColumns: database.measurementColumns
    },
    issues
  };
  
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  logSuccess(`Rapport détaillé sauvegardé: ${reportPath}`);
  
  return issues;
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  log('\n' + '='.repeat(80));
  log('🔍 AUDIT COMPLET AUTOMATIQUE - OTT FIRMWARE/API/FRONTEND/DB', 'bold');
  log('='.repeat(80));
  
  try {
    const firmware = analyzeFirmware();
    if (!firmware) {
      logError('Impossible de continuer sans analyse du firmware');
      process.exit(1);
    }
    
    const api = analyzeAPI();
    const frontend = analyzeFrontend();
    const database = analyzeDatabase();
    
    const issues = compareAndReport(firmware, api, frontend, database);
    
    if (issues.length > 0) {
      log('\n⚠️  Des incohérences ont été détectées. Consultez le rapport détaillé.', 'yellow');
      process.exit(1);
    } else {
      log('\n✅ Aucune incohérence détectée !', 'green');
      process.exit(0);
    }
  } catch (error) {
    logError(`Erreur lors de l'audit: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, analyzeFirmware, analyzeAPI, analyzeFrontend, analyzeDatabase };

