/**
 * Test end-to-end de l'upload firmware
 * Simule exactement ce que fait le frontend
 * 
 * Usage: node test_upload_end_to_end.js
 * OU: Ouvrir test_upload_complete.html dans le navigateur
 */

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:8000';
const TOKEN = process.env.TOKEN || '';

// Créer un fichier .ino de test
const testInoContent = `// Test firmware OTT
#define FIRMWARE_VERSION_STR "3.0.0-test"

void setup() {
  Serial.begin(115200);
  Serial.println("OTT Firmware Test");
}

void loop() {
  delay(1000);
}`;

console.log('=== TEST UPLOAD FIRMWARE END-TO-END ===\n');

// Test 1: Vérifier que l'API répond
async function test1_api_connection() {
    console.log('Test 1: Vérification connexion API...');
    try {
        const response = await fetch(`${API_URL}/api.php/firmwares`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${TOKEN}`
            }
        });
        
        console.log(`  Status: ${response.status}`);
        const text = await response.text();
        console.log(`  Réponse: ${text.substring(0, 100)}`);
        
        if (response.ok) {
            console.log('  ✅ API accessible\n');
            return true;
        } else {
            console.log('  ❌ API erreur\n');
            return false;
        }
    } catch (err) {
        console.log(`  ❌ Erreur: ${err.message}\n`);
        return false;
    }
}

// Test 2: Upload avec fetch (comme les autres endpoints)
async function test2_upload_with_fetch() {
    console.log('Test 2: Upload avec fetch()...');
    
    // Créer FormData
    const formData = new FormData();
    const blob = new Blob([testInoContent], { type: 'text/plain' });
    const file = new File([blob], 'test_firmware.ino', { type: 'text/plain' });
    formData.append('firmware_ino', file);
    formData.append('type', 'ino');
    
    try {
        const response = await fetch(`${API_URL}/api.php/firmwares/upload-ino`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOKEN}`
                // Ne PAS définir Content-Type pour FormData
            },
            body: formData
        });
        
        console.log(`  Status: ${response.status} ${response.statusText}`);
        const text = await response.text();
        console.log(`  Réponse: ${text}`);
        
        if (response.ok) {
            const data = JSON.parse(text);
            console.log('  ✅ Upload réussi avec fetch()\n');
            return data;
        } else {
            console.log('  ❌ Upload échoué\n');
            return null;
        }
    } catch (err) {
        console.log(`  ❌ Erreur: ${err.message}\n`);
        return null;
    }
}

// Test 3: Upload avec XMLHttpRequest (comme le frontend actuel)
function test3_upload_with_xhr() {
    return new Promise((resolve, reject) => {
        console.log('Test 3: Upload avec XMLHttpRequest...');
        
        const formData = new FormData();
        const blob = new Blob([testInoContent], { type: 'text/plain' });
        const file = new File([blob], 'test_firmware.ino', { type: 'text/plain' });
        formData.append('firmware_ino', file);
        formData.append('type', 'ino');
        
        const xhr = new XMLHttpRequest();
        xhr.timeout = 30000;
        
        xhr.addEventListener('load', () => {
            console.log(`  Status: ${xhr.status} ${xhr.statusText}`);
            console.log(`  Réponse: ${xhr.responseText.substring(0, 200)}`);
            
            if (xhr.status === 200) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    console.log('  ✅ Upload réussi avec XHR\n');
                    resolve(data);
                } catch (e) {
                    console.log(`  ❌ Erreur parsing: ${e.message}\n`);
                    reject(e);
                }
            } else {
                console.log('  ❌ Upload échoué\n');
                reject(new Error(`HTTP ${xhr.status}`));
            }
        });
        
        xhr.addEventListener('error', (e) => {
            console.log(`  ❌ Erreur réseau\n`);
            reject(e);
        });
        
        xhr.addEventListener('timeout', () => {
            console.log(`  ⏱️ Timeout\n`);
            reject(new Error('Timeout'));
        });
        
        xhr.open('POST', `${API_URL}/api.php/firmwares/upload-ino`);
        xhr.setRequestHeader('Authorization', `Bearer ${TOKEN}`);
        xhr.send(formData);
    });
}

// Exécuter les tests
async function runTests() {
    console.log(`API URL: ${API_URL}`);
    console.log(`Token: ${TOKEN ? TOKEN.substring(0, 20) + '...' : 'MANQUANT'}\n`);
    
    if (!TOKEN) {
        console.log('❌ Token manquant! Définissez TOKEN=... ou utilisez test_upload_complete.html\n');
        return;
    }
    
    // Test 1
    const apiOk = await test1_api_connection();
    if (!apiOk) {
        console.log('❌ API non accessible, arrêt des tests\n');
        return;
    }
    
    // Test 2
    const result2 = await test2_upload_with_fetch();
    
    // Test 3 (seulement si test 2 échoue)
    if (!result2) {
        console.log('Test 2 échoué, essai avec XHR...\n');
        try {
            await test3_upload_with_xhr();
        } catch (err) {
            console.log(`❌ Test 3 aussi échoué: ${err.message}\n`);
        }
    }
    
    console.log('=== FIN DES TESTS ===');
}

// Pour Node.js
if (typeof window === 'undefined') {
    // Node.js - utiliser node-fetch et form-data
    console.log('Mode Node.js - Installation requise: npm install node-fetch form-data\n');
    runTests().catch(console.error);
} else {
    // Browser
    window.runTests = runTests;
}

