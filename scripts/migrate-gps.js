#!/usr/bin/env node

/**
 * MIGRATION GPS AUTOMATIQUE via Node.js
 * Utilise pg (PostgreSQL client pour Node)
 */

const { Client } = require('pg');

// Couleurs console
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m'
};

console.log('\n═══════════════════════════════════════════');
console.log('  MIGRATION GPS AUTOMATIQUE');
console.log('═══════════════════════════════════════════\n');

// Configuration connexion PostgreSQL Render
const client = new Client({
  connectionString: 'postgresql://ott_data_user:lxNCXElZadbthGiOgT3cg2Y6JmMeMqUM@dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com/ott_data',
  ssl: {
    rejectUnauthorized: false
  }
});

// SQL de migration
const migrationSQL = `
  ALTER TABLE device_configurations 
  ADD COLUMN IF NOT EXISTS gps_enabled BOOLEAN DEFAULT false;
  
  UPDATE device_configurations 
  SET gps_enabled = false 
  WHERE gps_enabled IS NULL;
  
  SELECT 
    COUNT(*) as total_configs,
    SUM(CASE WHEN gps_enabled THEN 1 ELSE 0 END) as gps_enabled_count
  FROM device_configurations;
`;

async function executeMigration() {
  try {
    console.log(`${colors.cyan}📡 Connexion à Render PostgreSQL...${colors.reset}`);
    await client.connect();
    console.log(`${colors.green}✅ Connecté à la base de données\n${colors.reset}`);
    
    console.log(`${colors.yellow}🔧 Exécution migration GPS...${colors.reset}`);
    const result = await client.query(migrationSQL);
    
    console.log(`${colors.green}✅ Migration exécutée avec succès !\n${colors.reset}`);
    
    // Afficher le résultat
    if (result.length > 0 && result[result.length - 1].rows.length > 0) {
      const stats = result[result.length - 1].rows[0];
      console.log(`${colors.cyan}📊 Résultat:${colors.reset}`);
      console.log(`   • Configurations totales: ${stats.total_configs}`);
      console.log(`   • GPS activés: ${stats.gps_enabled_count}`);
      console.log(`   • GPS désactivés: ${stats.total_configs - stats.gps_enabled_count}\n`);
    }
    
    console.log(`${colors.green}═══════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.green}  GPS EST MAINTENANT DISPONIBLE ! 🎉${colors.reset}`);
    console.log(`${colors.green}═══════════════════════════════════════════\n${colors.reset}`);
    
    console.log(`${colors.cyan}Prochaines étapes:${colors.reset}`);
    console.log('  1. Décommenter GPS toggle dans DeviceModal.js');
    console.log('  2. git commit + push');
    console.log('  3. Attendre déploiement Render (2 min)');
    console.log('  4. F5 dashboard');
    console.log('  5. GPS fonctionne ! ✅\n');
    
  } catch (error) {
    console.error(`${colors.red}❌ Erreur: ${error.message}${colors.reset}\n`);
    
    if (error.message.includes('column') && error.message.includes('already exists')) {
      console.log(`${colors.yellow}⚠️ La colonne gps_enabled existe déjà !${colors.reset}`);
      console.log(`${colors.green}✅ Migration déjà faite, rien à faire\n${colors.reset}`);
    } else {
      console.log(`${colors.yellow}SOLUTION ALTERNATIVE:${colors.reset}`);
      console.log('  Interface web Render:');
      console.log('  https://dashboard.render.com/d/dpg-d4b6c015pdvs73ck6rp0\n');
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Exécuter
executeMigration();

