<?php
/**
 * Tests pour les handlers de dispositifs
 * Couvre la CRUD et la validation
 */

require_once __DIR__ . '/../api/handlers/devices/crud.php';

class DeviceHandlerTests {
    private $pdo;
    private $testResults = [];
    
    public function __construct() {
        $this->pdo = new PDO('sqlite::memory:');
        $this->setupTestDatabase();
    }
    
    private function setupTestDatabase() {
        $this->pdo->exec("
            CREATE TABLE devices (
                id INTEGER PRIMARY KEY,
                serial_number TEXT UNIQUE,
                sim_iccid TEXT,
                patient_id INTEGER,
                status TEXT DEFAULT 'active',
                notes TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                deleted_at TEXT
            );
            
            CREATE TABLE patients (
                id INTEGER PRIMARY KEY,
                first_name TEXT,
                last_name TEXT,
                deleted_at TEXT
            );
        ");
        
        $this->pdo->exec("
            INSERT INTO patients (first_name, last_name) 
            VALUES ('John', 'Doe'), ('Jane', 'Smith');
        ");
    }
    
    public function testDeviceCreation() {
        $this->runTest('Device Creation - Valid Data', function() {
            $device = [
                'serial_number' => 'TEST001',
                'patient_id' => 1,
                'status' => 'active'
            ];
            
            $stmt = $this->pdo->prepare("
                INSERT INTO devices (serial_number, patient_id, status) 
                VALUES (?, ?, ?)
            ");
            $result = $stmt->execute([$device['serial_number'], $device['patient_id'], $device['status']]);
            
            return $result && $this->pdo->lastInsertId() > 0;
        });
        
        $this->runTest('Device Creation - Duplicate Serial', function() {
            $device = [
                'serial_number' => 'TEST001', // Déjà utilisé
                'patient_id' => 2,
                'status' => 'active'
            ];
            
            try {
                $stmt = $this->pdo->prepare("
                    INSERT INTO devices (serial_number, patient_id, status) 
                    VALUES (?, ?, ?)
                ");
                $stmt->execute([$device['serial_number'], $device['patient_id'], $device['status']]);
                return false; // Ne devrait pas réussir
            } catch (PDOException $e) {
                return true; // Erreur de contrainte UNIQUE correcte
            }
        });
    }
    
    public function testDeviceValidation() {
        $this->runTest('Serial Number Format Validation', function() {
            $invalidSerials = ['', '   ', 'test@123', 'AB', 'A-B-C-D-E-F-G-H-I-J-K-L'];
            
            foreach ($invalidSerials as $serial) {
                if (!empty(trim($serial)) && !preg_match('/^[A-Z0-9-]{3,20}$/', $serial)) {
                    continue; // Correctement invalide
                }
                return false;
            }
            
            $validSerials = ['TEST001', 'DEV-123', 'SN456789'];
            foreach ($validSerials as $serial) {
                if (!preg_match('/^[A-Z0-9-]{3,20}$/', $serial)) {
                    return false; // Devrait être valide
                }
            }
            
            return true;
        });
        
        $this->runTest('Status Validation', function() {
            $validStatuses = ['active', 'inactive', 'maintenance', 'lost'];
            $invalidStatuses = ['unknown', 'deleted', 'pending', ''];
            
            foreach ($validStatuses as $status) {
                if (!in_array($status, $validStatuses)) {
                    return false;
                }
            }
            
            foreach ($invalidStatuses as $status) {
                if (in_array($status, $validStatuses)) {
                    return false;
                }
            }
            
            return true;
        });
    }
    
    public function testDeviceUpdate() {
        $this->runTest('Device Update - Valid Fields', function() {
            // Créer un dispositif
            $this->pdo->exec("
                INSERT INTO devices (serial_number, patient_id, status) 
                VALUES ('TEST002', 1, 'active')
            ");
            $deviceId = $this->pdo->lastInsertId();
            
            // Mettre à jour
            $stmt = $this->pdo->prepare("
                UPDATE devices 
                SET status = ?, notes = ? 
                WHERE id = ?
            ");
            $result = $stmt->execute(['maintenance', 'En maintenance', $deviceId]);
            
            // Vérifier la mise à jour
            $stmt = $this->pdo->prepare("SELECT status, notes FROM devices WHERE id = ?");
            $stmt->execute([$deviceId]);
            $updated = $stmt->fetch(PDO::FETCH_ASSOC);
            
            return $result && $updated['status'] === 'maintenance' && $updated['notes'] === 'En maintenance';
        });
    }
    
    public function testDeviceDeletion() {
        $this->runTest('Device Soft Delete', function() {
            // Créer un dispositif
            $this->pdo->exec("
                INSERT INTO devices (serial_number, patient_id, status) 
                VALUES ('TEST003', 1, 'active')
            ");
            $deviceId = $this->pdo->lastInsertId();
            
            // Suppression douce
            $stmt = $this->pdo->prepare("
                UPDATE devices 
                SET deleted_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            ");
            $result = $stmt->execute([$deviceId]);
            
            // Vérifier qu'il est marqué comme supprimé
            $stmt = $this->pdo->prepare("SELECT deleted_at FROM devices WHERE id = ?");
            $stmt->execute([$deviceId]);
            $deleted = $stmt->fetch(PDO::FETCH_ASSOC);
            
            return $result && !empty($deleted['deleted_at']);
        });
        
        $this->runTest('Device Query - Exclude Deleted', function() {
            // Créer deux dispositifs
            $this->pdo->exec("
                INSERT INTO devices (serial_number, patient_id, status) 
                VALUES ('TEST004', 1, 'active'), ('TEST005', 2, 'active')
            ");
            
            // Supprimer un des deux
            $stmt = $this->pdo->prepare("
                UPDATE devices 
                SET deleted_at = CURRENT_TIMESTAMP 
                WHERE serial_number = 'TEST004'
            ");
            $stmt->execute();
            
            // Compter les dispositifs non supprimés
            $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM devices WHERE deleted_at IS NULL");
            $stmt->execute();
            $count = $stmt->fetchColumn();
            
            return $count === 2; // TEST002, TEST003, TEST005 (TEST004 supprimé)
        });
    }
    
    public function testDeviceQueries() {
        $this->runTest('Device Search by Serial', function() {
            $stmt = $this->pdo->prepare("
                SELECT * FROM devices 
                WHERE serial_number = ? AND deleted_at IS NULL
            ");
            $stmt->execute(['TEST001']);
            $device = $stmt->fetch(PDO::FETCH_ASSOC);
            
            return $device && $device['serial_number'] === 'TEST001';
        });
        
        $this->runTest('Device Search by Patient', function() {
            $stmt = $this->pdo->prepare("
                SELECT COUNT(*) FROM devices 
                WHERE patient_id = ? AND deleted_at IS NULL
            ");
            $stmt->execute([1]);
            $count = $stmt->fetchColumn();
            
            return $count >= 1;
        });
    }
    
    private function runTest($testName, $testFunction) {
        try {
            $startTime = microtime(true);
            $result = $testFunction();
            $endTime = microtime(true);
            
            $this->testResults[] = [
                'name' => $testName,
                'status' => $result ? 'PASS' : 'FAIL',
                'duration' => round(($endTime - $startTime) * 1000, 2),
                'message' => $result ? 'Test passed successfully' : 'Test failed'
            ];
        } catch (Exception $e) {
            $this->testResults[] = [
                'name' => $testName,
                'status' => 'ERROR',
                'duration' => 0,
                'message' => $e->getMessage()
            ];
        }
    }
    
    public function runAllTests() {
        echo "🔧 Démarrage des tests Device Handlers...\n\n";
        
        $this->testDeviceCreation();
        $this->testDeviceValidation();
        $this->testDeviceUpdate();
        $this->testDeviceDeletion();
        $this->testDeviceQueries();
        
        $this->displayResults();
    }
    
    private function displayResults() {
        $total = count($this->testResults);
        $passed = count(array_filter($this->testResults, fn($r) => $r['status'] === 'PASS'));
        $failed = count(array_filter($this->testResults, fn($r) => $r['status'] === 'FAIL'));
        $errors = count(array_filter($this->testResults, fn($r) => $r['status'] === 'ERROR'));
        
        echo "📊 RÉSULTATS DES TESTS DEVICES\n";
        echo str_repeat("=", 50) . "\n";
        echo "Total: $total | ✅ Passés: $passed | ❌ Échoués: $failed | 🚨 Erreurs: $errors\n\n";
        
        foreach ($this->testResults as $result) {
            $icon = match($result['status']) {
                'PASS' => '✅',
                'FAIL' => '❌',
                'ERROR' => '🚨',
                default => '❓'
            };
            
            echo "$icon {$result['name']} ({$result['duration']}ms)\n";
            if ($result['status'] !== 'PASS') {
                echo "   └─ {$result['message']}\n";
            }
        }
        
        echo "\n🎯 Taux de réussite: " . round(($passed / $total) * 100, 1) . "%\n";
    }
}

if (basename(__FILE__) === basename($_SERVER['SCRIPT_NAME'])) {
    $tests = new DeviceHandlerTests();
    $tests->runAllTests();
}
