<?php
/**
 * Script de test pour vérifier le parsing des migrations SQL
 * Teste les deux fichiers de migration pour s'assurer qu'ils sont correctement parsés
 */

// Charger la fonction parseSqlStatements depuis helpers.php
require_once __DIR__ . '/api/helpers.php';

function testMigration($filename, $description) {
    echo "\n" . str_repeat("=", 80) . "\n";
    echo "TEST: $description\n";
    echo "Fichier: $filename\n";
    echo str_repeat("=", 80) . "\n\n";
    
    $path = __DIR__ . '/sql/' . $filename;
    
    if (!file_exists($path)) {
        echo "❌ ERREUR: Fichier non trouvé: $path\n";
        return false;
    }
    
    $sql = file_get_contents($path);
    echo "📄 Fichier lu: " . strlen($sql) . " octets\n\n";
    
    // Tester parseSqlStatements
    echo "🔍 Parsing SQL...\n";
    $statements = parseSqlStatements($sql);
    
    echo "\n📊 Résultats:\n";
    echo "  Nombre d'instructions: " . count($statements) . "\n\n";
    
    $allValid = true;
    foreach ($statements as $index => $stmt) {
        $num = $index + 1;
        echo "  Instruction $num:\n";
        echo "    Longueur: " . strlen($stmt) . " chars\n";
        echo "    Preview: " . substr($stmt, 0, 100) . "...\n";
        
        // Vérifications spécifiques
        $issues = [];
        
        // Vérifier qu'il n'y a pas de placeholder non restauré
        if (strpos($stmt, '___DOLLAR_QUOTE_') !== false) {
            $issues[] = "❌ Placeholder non restauré détecté !";
            $allValid = false;
        }
        
        // Vérifier qu'il n'y a pas de $$ orphelins
        $dollarCount = substr_count($stmt, '$$');
        if ($dollarCount > 0 && $dollarCount % 2 !== 0) {
            $issues[] = "⚠️ Nombre impair de $$ détecté ($dollarCount)";
        }
        
        // Vérifications pour les fonctions
        if (strpos($stmt, 'CREATE OR REPLACE FUNCTION') !== false) {
            if (strpos($stmt, 'RETURN NEW') === false) {
                $issues[] = "❌ Fonction incomplète: manque 'RETURN NEW'";
                $allValid = false;
            }
            if (strpos($stmt, 'END;') === false && strpos($stmt, 'END') === false) {
                $issues[] = "❌ Fonction incomplète: manque 'END'";
                $allValid = false;
            }
            if (strpos($stmt, 'LANGUAGE plpgsql') === false) {
                $issues[] = "❌ Fonction incomplète: manque 'LANGUAGE plpgsql'";
                $allValid = false;
            }
            if (strpos($stmt, 'RETURNS TRIGGER AS $$') === false) {
                $issues[] = "❌ Fonction incomplète: manque 'RETURNS TRIGGER AS $$'";
                $allValid = false;
            }
        }
        
        if (!empty($issues)) {
            echo "    ⚠️ Problèmes détectés:\n";
            foreach ($issues as $issue) {
                echo "      $issue\n";
            }
        } else {
            echo "    ✅ Instruction valide\n";
        }
        echo "\n";
    }
    
    if ($allValid) {
        echo "✅ TOUS LES TESTS PASSÉS pour $filename\n";
        return true;
    } else {
        echo "❌ ERREURS DÉTECTÉES pour $filename\n";
        return false;
    }
}

// Tests
echo "╔════════════════════════════════════════════════════════════════════════════╗\n";
echo "║                    TEST DES MIGRATIONS SQL                                 ║\n";
echo "╚════════════════════════════════════════════════════════════════════════════╝\n";

$results = [];

// Test 1: migration_add_measurements_deleted_at.sql (simple, pas de $$)
$results['migration_add_measurements_deleted_at.sql'] = testMigration(
    'migration_add_measurements_deleted_at.sql',
    'Migration: Ajouter deleted_at à measurements'
);

// Test 2: migration_cleanup_device_names.sql (simple, pas de $$)
$results['migration_cleanup_device_names.sql'] = testMigration(
    'migration_cleanup_device_names.sql',
    'Migration: Nettoyer les noms de dispositifs'
);

// Test 3: schema.sql (complexe, contient des blocs $$)
$results['schema.sql'] = testMigration(
    'schema.sql',
    'Schema complet (contient des fonctions avec blocs $$)'
);

// Résumé
echo "\n" . str_repeat("=", 80) . "\n";
echo "RÉSUMÉ DES TESTS\n";
echo str_repeat("=", 80) . "\n\n";

$allPassed = true;
foreach ($results as $file => $passed) {
    $status = $passed ? "✅ PASSÉ" : "❌ ÉCHOUÉ";
    echo "  $status: $file\n";
    if (!$passed) {
        $allPassed = false;
    }
}

echo "\n";
if ($allPassed) {
    echo "🎉 TOUS LES TESTS SONT PASSÉS !\n";
    exit(0);
} else {
    echo "❌ CERTAINS TESTS ONT ÉCHOUÉ\n";
    exit(1);
}

