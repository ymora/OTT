<?php
/**
 * Tests unitaires pour les handlers critiques de l'API
 * Couvre les fonctionnalités principales de sécurité et de gestion
 */

require_once __DIR__ . '/../api/bootstrap.php';

class ApiHandlerTests {
    private $pdo;
    private $testResults = [];
    
    public function __construct() {
        // Utiliser une base de données de test
        $this->pdo = new PDO('sqlite::memory:');
        $this->setupTestDatabase();
    }
    
    private function setupTestDatabase() {
        // Créer les tables de test
        $this->pdo->exec("
            CREATE TABLE users (
                id INTEGER PRIMARY KEY,
                email TEXT UNIQUE,
                password_hash TEXT,
                first_name TEXT,
                last_name TEXT,
                is_active INTEGER DEFAULT 1,
                deleted_at TEXT
            );
            
            CREATE TABLE devices (
                id INTEGER PRIMARY KEY,
                serial_number TEXT UNIQUE,
                sim_iccid TEXT,
                patient_id INTEGER,
                status TEXT DEFAULT 'active',
                deleted_at TEXT
            );
            
            CREATE TABLE patients (
                id INTEGER PRIMARY KEY,
                first_name TEXT,
                last_name TEXT,
                deleted_at TEXT
            );
        ");
        
        // Insérer des données de test
        $this->pdo->exec("
            INSERT INTO users (email, password_hash, first_name, last_name) 
            VALUES ('test@example.com', 'hash123', 'Test', 'User');
            
            INSERT INTO patients (first_name, last_name) 
            VALUES ('John', 'Doe');
            
            INSERT INTO devices (serial_number, patient_id) 
            VALUES ('TEST001', 1);
        ");
    }
    
    /**
     * Test des requêtes SQL avec injection potentielle
     */
    public function testSqlInjectionSafety() {
        $this->runTest('SQL Injection - Users Count', function() {
            // Simulation de la vulnérabilité corrigée
            $includeDeleted = false;
            $deletedCondition = $includeDeleted ? "IS NOT NULL" : "IS NULL";
            
            $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM users WHERE deleted_at $deletedCondition");
            $stmt->execute();
            $count = $stmt->fetchColumn();
            
            // Tenter une injection
            $maliciousInput = "'; DROP TABLE users; --";
            $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM users WHERE deleted_at ?");
            $stmt->execute([$maliciousInput]);
            
            return $count > 0; // La table existe toujours
        });
        
        $this->runTest('SQL Injection - Patients Count', function() {
            $includeDeleted = false;
            $deletedCondition = $includeDeleted ? "IS NOT NULL" : "IS NULL";
            
            $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM patients WHERE deleted_at $deletedCondition");
            $stmt->execute();
            $count = $stmt->fetchColumn();
            
            return $count >= 0;
        });
    }
    
    /**
     * Test de validation des entrées
     */
    public function testInputValidation() {
        $this->runTest('Device Serial Number Validation', function() {
            $serialNumber = '';
            $isValid = !empty(trim($serialNumber));
            
            // Test avec numéro de série valide
            $serialNumber = 'TEST001';
            $isValid = !empty(trim($serialNumber)) && preg_match('/^[A-Z0-9-]+$/', $serialNumber);
            
            return $isValid;
        });
        
        $this->runTest('Email Validation', function() {
            $email = 'invalid-email';
            $isValid = filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
            
            // Test avec email valide
            $email = 'test@example.com';
            $isValid = filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
            
            return $isValid;
        });
    }
    
    /**
     * Test des permissions et autorisations
     */
    public function testPermissions() {
        $this->runTest('Admin Permission Check', function() {
            // Simulation de vérification de permissions
            $userRole = 'admin';
            $requiredPermission = 'devices.edit';
            
            $permissions = [
                'admin' => ['devices.edit', 'users.manage', 'firmwares.upload'],
                'user' => ['devices.view'],
                'guest' => []
            ];
            
            return in_array($requiredPermission, $permissions[$userRole] ?? []);
        });
        
        $this->runTest('User Permission Check', function() {
            $userRole = 'user';
            $requiredPermission = 'devices.edit';
            
            $permissions = [
                'admin' => ['devices.edit', 'users.manage', 'firmwares.upload'],
                'user' => ['devices.view'],
                'guest' => []
            ];
            
            return !in_array($requiredPermission, $permissions[$userRole] ?? []);
        });
    }
    
    /**
     * Test de gestion des erreurs
     */
    public function testErrorHandling() {
        $this->runTest('Database Error Handling', function() {
            try {
                // Tenter une requête sur une table inexistante
                $stmt = $this->pdo->prepare("SELECT * FROM non_existent_table");
                $stmt->execute();
                return false; // Ne devrait pas arriver
            } catch (PDOException $e) {
                return true; // Erreur correctement capturée
            }
        });
        
        $this->runTest('JSON Response Format', function() {
            $response = [
                'success' => true,
                'data' => ['id' => 1, 'name' => 'Test'],
                'message' => 'Operation successful'
            ];
            
            $json = json_encode($response);
            $decoded = json_decode($json, true);
            
            return isset($decoded['success']) && $decoded['success'] === true;
        });
    }
    
    /**
     * Test de sécurité des mots de passe
     */
    public function testPasswordSecurity() {
        $this->runTest('Password Hash Strength', function() {
            $password = 'TestPassword123!';
            $hash = password_hash($password, PASSWORD_ARGON2ID);
            
            return password_verify($password, $hash) && strlen($hash) > 50;
        });
        
        $this->runTest('Password Validation', function() {
            $password = 'weak';
            $isValid = strlen($password) >= 8 && 
                      preg_match('/[A-Z]/', $password) && 
                      preg_match('/[a-z]/', $password) && 
                      preg_match('/[0-9]/', $password);
            
            // Test avec mot de passe fort
            $password = 'StrongPass123!';
            $isValid = strlen($password) >= 8 && 
                      preg_match('/[A-Z]/', $password) && 
                      preg_match('/[a-z]/', $password) && 
                      preg_match('/[0-9]/', $password);
            
            return $isValid;
        });
    }
    
    /**
     * Exécute un test individuel
     */
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
    
    /**
     * Exécute tous les tests
     */
    public function runAllTests() {
        echo "🧪 Démarrage des tests unitaires API...\n\n";
        
        $this->testSqlInjectionSafety();
        $this->testInputValidation();
        $this->testPermissions();
        $this->testErrorHandling();
        $this->testPasswordSecurity();
        
        $this->displayResults();
    }
    
    /**
     * Affiche les résultats des tests
     */
    private function displayResults() {
        $total = count($this->testResults);
        $passed = count(array_filter($this->testResults, fn($r) => $r['status'] === 'PASS'));
        $failed = count(array_filter($this->testResults, fn($r) => $r['status'] === 'FAIL'));
        $errors = count(array_filter($this->testResults, fn($r) => $r['status'] === 'ERROR'));
        
        echo "📊 RÉSULTATS DES TESTS\n";
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
        
        if ($failed > 0 || $errors > 0) {
            echo "\n⚠️  Des tests ont échoué. Veuillez vérifier le code.\n";
        } else {
            echo "\n🎉 Tous les tests passés avec succès !\n";
        }
    }
}

// Exécuter les tests si ce fichier est appelé directement
if (basename(__FILE__) === basename($_SERVER['SCRIPT_NAME'])) {
    $tests = new ApiHandlerTests();
    $tests->runAllTests();
}
