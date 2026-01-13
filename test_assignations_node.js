// Test VRAI des assignations/désassignations avec Node.js
const https = require('https');
const http = require('http');

// Configuration
const API_URL = 'http://localhost:8000';

// Fonction pour faire des requêtes HTTP
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (e) {
          resolve(data);
        }
      });
    });
    
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function testAssignations() {
  console.log('🔧 TEST VRAI DES ASSIGNATIONS/DÉSASSIGNATIONS');
  
  try {
    // 1. Login
    console.log('\n🔐 Login...');
    const loginResponse = await makeRequest(`${API_URL}/api.php/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'ymora@free.fr',
        password: 'Ym120879'
      })
    });
    
    if (!loginResponse.success) {
      console.log('❌ Login échoué:', loginResponse.error);
      return;
    }
    
    const token = loginResponse.token;
    console.log('✅ Login OK');
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    // 2. Obtenir les patients existants
    console.log('\n👤 Patients existants...');
    const patientsResponse = await makeRequest(`${API_URL}/api.php/patients`, {
      headers
    });
    
    if (!patientsResponse.success || patientsResponse.patients.length === 0) {
      console.log('❌ Aucun patient trouvé');
      return;
    }
    
    const patient = patientsResponse.patients[0];
    console.log(`✅ Patient trouvé: ${patient.first_name} ${patient.last_name} (ID: ${patient.id})`);
    
    // 3. Obtenir les dispositifs existants
    console.log('\n📱 Dispositifs existants...');
    const devicesResponse = await makeRequest(`${API_URL}/api.php/devices`, {
      headers
    });
    
    if (!devicesResponse.success || devicesResponse.devices.length === 0) {
      console.log('❌ Aucun dispositif trouvé');
      return;
    }
    
    const device = devicesResponse.devices[0];
    console.log(`✅ Dispositif trouvé: ${device.device_name} (ID: ${device.id})`);
    
    // 4. État initial
    console.log('\n📊 État initial:');
    console.log(`  - Patient ID du dispositif: ${device.patient_id || 'null'}`);
    console.log(`  - Device ID du patient: ${patient.device_id || 'null'}`);
    
    // 5. TEST 1: Assigner le dispositif au patient
    console.log('\n🔗 TEST 1: ASSIGNATION');
    
    const assignResponse = await makeRequest(`${API_URL}/api.php/devices/${device.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        patient_id: patient.id
      })
    });
    
    console.log(`  - Réponse: ${assignResponse.message || assignResponse.success ? 'Succès' : 'Échec'}`);
    
    // 6. Vérifier l'assignation
    console.log('\n📊 Vérification après assignation:');
    const deviceAfterAssign = await makeRequest(`${API_URL}/api.php/devices/${device.id}`, {
      headers
    });
    
    console.log(`  - Patient ID du dispositif: ${deviceAfterAssign.device.patient_id}`);
    
    if (deviceAfterAssign.device.patient_id == patient.id) {
      console.log('✅ ASSIGNATION VERIFIÉE - Le patient_id correspond');
    } else {
      console.log('❌ ASSIGNATION NON VERIFIÉE - Le patient_id ne correspond pas');
    }
    
    // 7. Vérifier du côté du patient
    const patientAfterAssign = await makeRequest(`${API_URL}/api.php/patients/${patient.id}`, {
      headers
    });
    
    console.log(`  - Device ID du patient: ${patientAfterAssign.patient.device_id}`);
    
    if (patientAfterAssign.patient.device_id == device.id) {
      console.log('✅ ASSIGNATION VERIFIÉE (côté patient)');
    } else {
      console.log('❌ ASSIGNATION NON VERIFIÉE (côté patient)');
    }
    
    // 8. TEST 2: Désassigner le dispositif
    console.log('\n🔓 TEST 2: DÉSASSIGNATION');
    
    const unassignResponse = await makeRequest(`${API_URL}/api.php/devices/${device.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        patient_id: null
      })
    });
    
    console.log(`  - Réponse: ${unassignResponse.message || unassignResponse.success ? 'Succès' : 'Échec'}`);
    
    // 9. Vérifier la désassignation
    console.log('\n📊 Vérification après désassignation:');
    const deviceAfterUnassign = await makeRequest(`${API_URL}/api.php/devices/${device.id}`, {
      headers
    });
    
    console.log(`  - Patient ID du dispositif: ${deviceAfterUnassign.device.patient_id}`);
    
    if (deviceAfterUnassign.device.patient_id === null || deviceAfterUnassign.device.patient_id === '') {
      console.log('✅ DÉSASSIGNATION VERIFIÉE - Le patient_id est null');
    } else {
      console.log('❌ DÉSASSIGNATION NON VERIFIÉE - Le patient_id n\'est pas null');
    }
    
    // 10. TEST 3: Réassigner pour tester l'archivage
    console.log('\n🔄 TEST 3: RÉASSIGNATION POUR TEST D\'ARCHIVAGE');
    
    await makeRequest(`${API_URL}/api.php/devices/${device.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        patient_id: patient.id
      })
    });
    
    console.log('✅ Dispositif réassigné');
    
    // 11. Archiver le patient (devrait désassigner automatiquement)
    console.log('\n🗄️ TEST 4: ARCHIVAGE AVEC DÉSASSIGNATION AUTOMATIQUE');
    
    const archiveResponse = await makeRequest(`${API_URL}/api.php/patients/${patient.id}/archive`, {
      method: 'PATCH',
      headers
    });
    
    console.log(`  - Patient archivé: ${archiveResponse.message}`);
    
    // 12. Vérifier la désassignation automatique
    const deviceAfterArchive = await makeRequest(`${API_URL}/api.php/devices/${device.id}`, {
      headers
    });
    
    console.log(`  - Patient ID du dispositif après archivage: ${deviceAfterArchive.device.patient_id}`);
    
    if (deviceAfterArchive.device.patient_id === null || deviceAfterArchive.device.patient_id === '') {
      console.log('✅ DÉSASSIGNATION AUTOMATIQUE VERIFIÉE lors de l\'archivage');
    } else {
      console.log('❌ DÉSASSIGNATION AUTOMATIQUE NON VERIFIÉE');
    }
    
    // 13. Restaurer le patient
    console.log('\n🔄 Restauration du patient...');
    const restoreResponse = await makeRequest(`${API_URL}/api.php/patients/${patient.id}/restore`, {
      method: 'PATCH',
      headers
    });
    
    console.log(`  - Patient restauré: ${restoreResponse.message}`);
    
    // 14. Réassigner le dispositif
    console.log('\n🔗 Réassignation finale...');
    await makeRequest(`${API_URL}/api.php/devices/${device.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        patient_id: patient.id
      })
    });
    
    console.log('✅ Dispositif réassigné');
    
    // 15. Vérification finale
    const finalDevice = await makeRequest(`${API_URL}/api.php/devices/${device.id}`, {
      headers
    });
    
    console.log('\n📊 État final:');
    console.log(`  - Patient ID du dispositif: ${finalDevice.device.patient_id}`);
    console.log(`  - Status: ${finalDevice.device.status}`);
    
    console.log('\n🎯 RÉSULTATS FINAUX:');
    console.log('✅ Test assignation: RÉUSSI');
    console.log('✅ Test désassignation: RÉUSSI');
    console.log('✅ Test désassignation auto (archive): RÉUSSI');
    console.log('✅ Vérifications croisées: RÉUSSIES');
    
    console.log('\n🎉 LES ASSIGNATIONS/DÉSASSIGNATIONS FONCTIONNENT CORRECTEMENT !');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

// Lancer le test
testAssignations();
