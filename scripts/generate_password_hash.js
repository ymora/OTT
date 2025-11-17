/**
 * Script pour générer un hash bcrypt pour le mot de passe
 * Usage: node scripts/generate_password_hash.js
 */

const bcrypt = require('bcryptjs');

const password = 'Ym120879';

// Générer le hash
bcrypt.hash(password, 10, (err, hash) => {
  if (err) {
    console.error('Erreur:', err);
    process.exit(1);
  }
  
  console.log('========================================');
  console.log('Hash bcrypt généré');
  console.log('========================================');
  console.log('');
  console.log('Mot de passe:', password);
  console.log('Hash bcrypt:', hash);
  console.log('');
  console.log('Script SQL:');
  console.log('');
  console.log(`UPDATE users`);
  console.log(`SET password_hash = '${hash}'`);
  console.log(`WHERE email = 'ymora@free.fr';`);
  console.log('');
});

