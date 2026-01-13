/**
 * Script de test des actions API unifiées
 * Teste archivage, restauration, suppression pour patients, users, devices
 */

const API_URL = 'http://localhost:8000';

// Test credentials (admin)
const ADMIN_CREDENTIALS = {
    email: 'ymora@free.fr',
    password: 'Ym120879'
};

let authToken = '';

// Helper pour faire des requêtes API
async function apiRequest(method, endpoint, data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        }
    };
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    const response = await fetch(`${API_URL}${endpoint}`, options);
    return await response.json();
}

// Login pour obtenir le token
async function login() {
    console.log('🔐 Connexion en tant qu\'admin...');
    const response = await fetch(`${API_URL}/api.php/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ADMIN_CREDENTIALS)
    });
    
    const result = await response.json();
    if (result.success) {
        authToken = result.token;
        console.log('✅ Connexion réussie');
        return true;
    } else {
        console.error('❌ Échec connexion:', result.error);
        return false;
    }
}

// Test d'archivage patient
async function testPatientArchive() {
    console.log('\n🏥 Test archivage patient...');
    
    // Créer un patient de test
    const createResult = await apiRequest('POST', '/api.php/patients', {
        first_name: 'Test',
        last_name: 'Patient',
        email: 'test.patient@example.com',
        phone: '0123456789'
    });
    
    if (!createResult.success) {
        console.error('❌ Création patient échouée:', createResult.error);
        return false;
    }
    
    const patientId = createResult.patient?.id || createResult.user_id;
    console.log(`✅ Patient créé avec ID: ${patientId}`);
    
    // Tester l'archivage
    const archiveResult = await apiRequest('PATCH', `/api.php/patients/${patientId}/archive`);
    
    if (archiveResult.success) {
        console.log('✅ Archivage patient réussi:', archiveResult.message);
    } else {
        console.error('❌ Archivage patient échoué:', archiveResult.error);
        return false;
    }
    
    // Tester la restauration
    const restoreResult = await apiRequest('PATCH', `/api.php/patients/${patientId}/restore`);
    
    if (restoreResult.success) {
        console.log('✅ Restauration patient réussie:', restoreResult.message);
    } else {
        console.error('❌ Restauration patient échouée:', restoreResult.error);
        return false;
    }
    
    // Tester la suppression permanente
    const deleteResult = await apiRequest('DELETE', `/api.php/patients/${patientId}?permanent=true`);
    
    if (deleteResult.success) {
        console.log('✅ Suppression patient réussie:', deleteResult.message);
    } else {
        console.error('❌ Suppression patient échouée:', deleteResult.error);
        return false;
    }
    
    return true;
}

// Test d'archivage utilisateur
async function testUserArchive() {
    console.log('\n👤 Test archivage utilisateur...');
    
    // Créer un utilisateur de test
    const createResult = await apiRequest('POST', '/api.php/users', {
        first_name: 'Test',
        last_name: 'User',
        email: 'test.user@example.com',
        password: 'TestPassword123!',
        role_id: 2 // Utilisateur normal
    });
    
    if (!createResult.success) {
        console.error('❌ Création utilisateur échouée:', createResult.error);
        return false;
    }
    
    const userId = createResult.user_id;
    console.log(`✅ Utilisateur créé avec ID: ${userId}`);
    
    // Tester l'archivage
    const archiveResult = await apiRequest('PATCH', `/api.php/users/${userId}/archive`);
    
    if (archiveResult.success) {
        console.log('✅ Archivage utilisateur réussi:', archiveResult.message);
    } else {
        console.error('❌ Archivage utilisateur échoué:', archiveResult.error);
        return false;
    }
    
    // Tester la restauration
    const restoreResult = await apiRequest('PATCH', `/api.php/users/${userId}/restore`);
    
    if (restoreResult.success) {
        console.log('✅ Restauration utilisateur réussie:', restoreResult.message);
    } else {
        console.error('❌ Restauration utilisateur échouée:', restoreResult.error);
        return false;
    }
    
    // Tester la suppression permanente
    const deleteResult = await apiRequest('DELETE', `/api.php/users/${userId}?permanent=true`);
    
    if (deleteResult.success) {
        console.log('✅ Suppression utilisateur réussie:', deleteResult.message);
    } else {
        console.error('❌ Suppression utilisateur échouée:', deleteResult.error);
        return false;
    }
    
    return true;
}

// Test d'archivage dispositif
async function testDeviceArchive() {
    console.log('\n📱 Test archivage dispositif...');
    
    // Créer un dispositif de test
    const createResult = await apiRequest('POST', '/api.php/devices', {
        sim_iccid: `893301760000123456${Math.floor(Math.random() * 100)}`,
        device_serial: `TEST-DEVICE-${Date.now()}`,
        device_name: 'Test Device'
    });
    
    if (!createResult.success) {
        console.error('❌ Création dispositif échouée:', createResult.error);
        return false;
    }
    
    const deviceId = createResult.device?.id;
    console.log(`✅ Dispositif créé avec ID: ${deviceId}`);
    
    // Tester l'archivage
    const archiveResult = await apiRequest('PATCH', `/api.php/devices/${deviceId}/archive`);
    
    if (archiveResult.success) {
        console.log('✅ Archivage dispositif réussi:', archiveResult.message);
    } else {
        console.error('❌ Archivage dispositif échoué:', archiveResult.error);
        return false;
    }
    
    // Tester la restauration
    const restoreResult = await apiRequest('PATCH', `/api.php/devices/${deviceId}/restore`);
    
    if (restoreResult.success) {
        console.log('✅ Restauration dispositif réussie:', restoreResult.message);
    } else {
        console.error('❌ Restauration dispositif échouée:', restoreResult.error);
        return false;
    }
    
    // Tester la suppression permanente
    const deleteResult = await apiRequest('DELETE', `/api.php/devices/${deviceId}?permanent=true`);
    
    if (deleteResult.success) {
        console.log('✅ Suppression dispositif réussie:', deleteResult.message);
    } else {
        console.error('❌ Suppression dispositif échouée:', deleteResult.error);
        return false;
    }
    
    return true;
}

// Fonction principale de test
async function runTests() {
    console.log('🚀 DÉMARRAGE DES TESTS D\'ACTIONS API UNIFIÉES\n');
    
    // Connexion
    const loggedIn = await login();
    if (!loggedIn) {
        console.error('❌ Tests arrêtés - connexion échouée');
        return;
    }
    
    // Tests
    const results = [];
    
    results.push(await testPatientArchive());
    results.push(await testUserArchive());
    results.push(await testDeviceArchive());
    
    // Résultats finaux
    const passed = results.filter(r => r).length;
    const total = results.length;
    
    console.log('\n📊 RÉSULTATS DES TESTS:');
    console.log(`✅ Tests réussis: ${passed}/${total}`);
    
    if (passed === total) {
        console.log('🎉 TOUS LES TESTS RÉUSSIS - API unifiée fonctionnelle!');
    } else {
        console.log('⚠️ Certains tests ont échoué - vérification nécessaire');
    }
}

// Exécuter les tests
runTests().catch(console.error);
