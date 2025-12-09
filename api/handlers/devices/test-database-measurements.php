<?php
/**
 * Script de diagnostic pour vérifier les mesures dans la base de données
 * Usage: php scripts/test-database-measurements.php
 */

require_once __DIR__ . '/../bootstrap/env_loader.php';
require_once __DIR__ . '/../bootstrap/database.php';

echo "=== DIAGNOSTIC BASE DE DONNÉES - MESURES ===\n\n";

try {
    global $pdo;
    
    // 1. Vérifier la connexion
    echo "1. Test de connexion à la base de données...\n";
    $pdo->query("SELECT 1");
    echo "   ✅ Connexion OK\n\n";
    
    // 2. Compter les dispositifs
    echo "2. Nombre de dispositifs dans la base:\n";
    $stmt = $pdo->query("SELECT COUNT(*) FROM devices WHERE deleted_at IS NULL");
    $deviceCount = $stmt->fetchColumn();
    echo "   Dispositifs actifs: $deviceCount\n";
    
    if ($deviceCount > 0) {
        $stmt = $pdo->query("
            SELECT id, sim_iccid, device_name, device_serial, last_seen, last_battery, firmware_version
            FROM devices 
            WHERE deleted_at IS NULL 
            ORDER BY last_seen DESC NULLS LAST
            LIMIT 10
        ");
        $devices = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo "   Derniers dispositifs:\n";
        foreach ($devices as $device) {
            $lastSeen = $device['last_seen'] ? date('Y-m-d H:i:s', strtotime($device['last_seen'])) : 'Jamais';
            echo "   - ID: {$device['id']} | ICCID: {$device['sim_iccid']} | Nom: {$device['device_name']} | Dernière vue: $lastSeen\n";
        }
    }
    echo "\n";
    
    // 3. Compter les mesures
    echo "3. Nombre de mesures dans la base:\n";
    $stmt = $pdo->query("SELECT COUNT(*) FROM measurements");
    $measurementCount = $stmt->fetchColumn();
    echo "   Total mesures: $measurementCount\n";
    
    if ($measurementCount > 0) {
        // Mesures par dispositif
        $stmt = $pdo->query("
            SELECT d.id, d.sim_iccid, d.device_name, COUNT(m.id) as count
            FROM devices d
            LEFT JOIN measurements m ON d.id = m.device_id
            WHERE d.deleted_at IS NULL
            GROUP BY d.id, d.sim_iccid, d.device_name
            ORDER BY count DESC
        ");
        $deviceMeasurements = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo "   Mesures par dispositif:\n";
        foreach ($deviceMeasurements as $dm) {
            echo "   - {$dm['device_name']} (ICCID: {$dm['sim_iccid']}): {$dm['count']} mesures\n";
        }
        
        // Dernières mesures
        echo "\n   Dernières 10 mesures:\n";
        $stmt = $pdo->query("
            SELECT m.id, m.device_id, d.sim_iccid, d.device_name, 
                   m.timestamp, m.flowrate, m.battery, m.signal_strength, m.device_status
            FROM measurements m
            JOIN devices d ON m.device_id = d.id
            WHERE d.deleted_at IS NULL
            ORDER BY m.timestamp DESC
            LIMIT 10
        ");
        $measurements = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($measurements as $m) {
            $timestamp = date('Y-m-d H:i:s', strtotime($m['timestamp']));
            echo "   - {$m['device_name']} | $timestamp | Flow: {$m['flowrate']} L/min | Bat: {$m['battery']}% | RSSI: {$m['signal_strength']} dBm | Status: {$m['device_status']}\n";
        }
    } else {
        echo "   ⚠️  AUCUNE MESURE TROUVÉE dans la base de données!\n";
    }
    echo "\n";
    
    // 4. Vérifier les mesures des dernières 24h
    echo "4. Mesures des dernières 24 heures:\n";
    $stmt = $pdo->query("
        SELECT COUNT(*) 
        FROM measurements m
        JOIN devices d ON m.device_id = d.id
        WHERE m.timestamp >= NOW() - INTERVAL '24 HOURS'
        AND d.deleted_at IS NULL
    ");
    $recentCount = $stmt->fetchColumn();
    echo "   Mesures (24h): $recentCount\n";
    
    if ($recentCount > 0) {
        $stmt = $pdo->query("
            SELECT d.sim_iccid, d.device_name, COUNT(m.id) as count, MAX(m.timestamp) as last_measurement
            FROM measurements m
            JOIN devices d ON m.device_id = d.id
            WHERE m.timestamp >= NOW() - INTERVAL '24 HOURS'
            AND d.deleted_at IS NULL
            GROUP BY d.id, d.sim_iccid, d.device_name
            ORDER BY last_measurement DESC
        ");
        $recentMeasurements = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo "   Par dispositif:\n";
        foreach ($recentMeasurements as $rm) {
            $last = date('Y-m-d H:i:s', strtotime($rm['last_measurement']));
            echo "   - {$rm['device_name']} (ICCID: {$rm['sim_iccid']}): {$rm['count']} mesures | Dernière: $last\n";
        }
    }
    echo "\n";
    
    // 5. Vérifier les dispositifs sans mesures
    echo "5. Dispositifs sans mesures:\n";
    $stmt = $pdo->query("
        SELECT d.id, d.sim_iccid, d.device_name, d.last_seen
        FROM devices d
        LEFT JOIN measurements m ON d.id = m.device_id
        WHERE d.deleted_at IS NULL
        AND m.id IS NULL
        ORDER BY d.last_seen DESC NULLS LAST
    ");
    $devicesWithoutMeasurements = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (count($devicesWithoutMeasurements) > 0) {
        echo "   ⚠️  " . count($devicesWithoutMeasurements) . " dispositif(s) sans mesures:\n";
        foreach ($devicesWithoutMeasurements as $d) {
            $lastSeen = $d['last_seen'] ? date('Y-m-d H:i:s', strtotime($d['last_seen'])) : 'Jamais';
            echo "   - {$d['device_name']} (ICCID: {$d['sim_iccid']}) | Dernière vue: $lastSeen\n";
        }
    } else {
        echo "   ✅ Tous les dispositifs ont au moins une mesure\n";
    }
    echo "\n";
    
    // 6. Vérifier la structure de la table measurements
    echo "6. Structure de la table measurements:\n";
    $stmt = $pdo->query("
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'measurements'
        ORDER BY ordinal_position
    ");
    $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($columns as $col) {
        $nullable = $col['is_nullable'] === 'YES' ? 'NULL' : 'NOT NULL';
        echo "   - {$col['column_name']}: {$col['data_type']} ($nullable)\n";
    }
    echo "\n";
    
    // 7. Test de l'endpoint API
    echo "7. Test de l'endpoint API /api.php/measurements/latest:\n";
    echo "   Pour tester: curl -H 'Authorization: Bearer YOUR_TOKEN' https://your-api.com/api.php/measurements/latest\n";
    echo "   Ou via le dashboard: /api.php/measurements/latest\n";
    echo "\n";
    
    echo "=== FIN DU DIAGNOSTIC ===\n";
    
} catch (PDOException $e) {
    echo "❌ ERREUR BASE DE DONNÉES: " . $e->getMessage() . "\n";
    exit(1);
} catch (Exception $e) {
    echo "❌ ERREUR: " . $e->getMessage() . "\n";
    exit(1);
}

