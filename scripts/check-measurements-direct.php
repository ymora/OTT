<?php
/**
 * Script de vérification directe des mesures dans la base de données
 * Se connecte directement à la BDD et affiche les résultats
 * 
 * Usage: php scripts/check-measurements-direct.php
 */

// Charger la configuration
require_once __DIR__ . '/../bootstrap/env_loader.php';
require_once __DIR__ . '/../bootstrap/database.php';

echo "=== VÉRIFICATION DIRECTE DES MESURES ===\n\n";

try {
    // Obtenir la configuration de la base de données
    $dbConfig = ott_database_config();
    
    if (!$dbConfig) {
        echo "❌ ERREUR: Impossible de charger la configuration de la base de données\n";
        echo "Vérifiez les variables d'environnement:\n";
        echo "  - DB_HOST\n";
        echo "  - DB_NAME\n";
        echo "  - DB_USER\n";
        echo "  - DB_PASS (optionnel)\n";
        echo "  - DB_PORT (optionnel)\n";
        echo "  - DATABASE_URL (alternative)\n";
        exit(1);
    }
    
    echo "📡 Connexion à la base de données...\n";
    echo "   Type: {$dbConfig['type']}\n";
    echo "   Host: {$dbConfig['host']}\n";
    echo "   Port: {$dbConfig['port']}\n";
    echo "   Database: {$dbConfig['name']}\n";
    echo "   User: {$dbConfig['user']}\n";
    echo "\n";
    
    // Se connecter
    $pdo = new PDO(
        $dbConfig['dsn'],
        $dbConfig['user'],
        $dbConfig['pass'],
        ott_pdo_options($dbConfig['type'])
    );
    
    echo "✅ Connexion réussie!\n\n";
    
    // 1. Compter les dispositifs
    echo "1️⃣  DISPOSITIFS:\n";
    $stmt = $pdo->query("SELECT COUNT(*) FROM devices WHERE deleted_at IS NULL");
    $deviceCount = (int)$stmt->fetchColumn();
    echo "   Total dispositifs actifs: $deviceCount\n\n";
    
    if ($deviceCount === 0) {
        echo "⚠️  Aucun dispositif trouvé dans la base de données!\n";
        exit(0);
    }
    
    // Lister les dispositifs
    $stmt = $pdo->query("
        SELECT id, sim_iccid, device_name, device_serial, last_seen, last_battery, firmware_version
        FROM devices 
        WHERE deleted_at IS NULL 
        ORDER BY last_seen DESC NULLS LAST
        LIMIT 20
    ");
    $devices = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo "   Liste des dispositifs:\n";
    foreach ($devices as $i => $device) {
        $lastSeen = $device['last_seen'] ? date('Y-m-d H:i:s', strtotime($device['last_seen'])) : 'Jamais';
        $battery = $device['last_battery'] !== null ? number_format($device['last_battery'], 1) . '%' : 'N/A';
        echo "   " . ($i + 1) . ". ID: {$device['id']} | ICCID: {$device['sim_iccid']} | Nom: {$device['device_name']}\n";
        echo "      Serial: " . ($device['device_serial'] ?: 'N/A') . " | Dernière vue: $lastSeen | Batterie: $battery\n";
    }
    echo "\n";
    
    // 2. Compter les mesures
    echo "2️⃣  MESURES:\n";
    $stmt = $pdo->query("SELECT COUNT(*) FROM measurements");
    $measurementCount = (int)$stmt->fetchColumn();
    echo "   Total mesures: $measurementCount\n\n";
    
    if ($measurementCount === 0) {
        echo "❌ AUCUNE MESURE trouvée dans la base de données!\n";
        echo "\n";
        echo "🔍 DIAGNOSTIC:\n";
        echo "   → Le problème vient de l'envoi des mesures (firmware/API)\n";
        echo "   → Vérifiez:\n";
        echo "      - Que le dispositif envoie bien les mesures\n";
        echo "      - Les logs du serveur API\n";
        echo "      - Que l'endpoint /api.php/devices/measurements fonctionne\n";
        exit(0);
    }
    
    // 3. Mesures par dispositif
    echo "   Mesures par dispositif:\n";
    $stmt = $pdo->query("
        SELECT d.id, d.sim_iccid, d.device_name, 
               COUNT(m.id) as measurement_count,
               MAX(m.timestamp) as last_measurement,
               MIN(m.timestamp) as first_measurement
        FROM devices d
        LEFT JOIN measurements m ON d.id = m.device_id
        WHERE d.deleted_at IS NULL
        GROUP BY d.id, d.sim_iccid, d.device_name
        ORDER BY measurement_count DESC, last_measurement DESC NULLS LAST
    ");
    $deviceStats = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    foreach ($deviceStats as $stat) {
        $count = (int)$stat['measurement_count'];
        $last = $stat['last_measurement'] ? date('Y-m-d H:i:s', strtotime($stat['last_measurement'])) : 'Aucune';
        $first = $stat['first_measurement'] ? date('Y-m-d H:i:s', strtotime($stat['first_measurement'])) : 'Aucune';
        echo "   - {$stat['device_name']} (ICCID: {$stat['sim_iccid']}): $count mesures\n";
        echo "     Première: $first | Dernière: $last\n";
    }
    echo "\n";
    
    // 4. Dernières mesures
    echo "3️⃣  DERNIÈRES MESURES (10):\n";
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
    
    foreach ($measurements as $i => $m) {
        $timestamp = date('Y-m-d H:i:s', strtotime($m['timestamp']));
        $flowrate = number_format($m['flowrate'], 2);
        $battery = $m['battery'] !== null ? number_format($m['battery'], 1) . '%' : 'N/A';
        $rssi = $m['signal_strength'] !== null ? $m['signal_strength'] . ' dBm' : 'N/A';
        $status = $m['device_status'] ?: 'N/A';
        echo "   " . ($i + 1) . ". {$m['device_name']} | $timestamp\n";
        echo "      Flow: $flowrate L/min | Bat: $battery | RSSI: $rssi | Status: $status\n";
    }
    echo "\n";
    
    // 5. Mesures des dernières 24h
    echo "4️⃣  MESURES DES DERNIÈRES 24 HEURES:\n";
    $stmt = $pdo->query("
        SELECT COUNT(*) 
        FROM measurements m
        JOIN devices d ON m.device_id = d.id
        WHERE m.timestamp >= NOW() - INTERVAL '24 HOURS'
        AND d.deleted_at IS NULL
    ");
    $recentCount = (int)$stmt->fetchColumn();
    echo "   Total: $recentCount mesures\n";
    
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
        $recentStats = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        echo "   Par dispositif:\n";
        foreach ($recentStats as $stat) {
            $last = date('Y-m-d H:i:s', strtotime($stat['last_measurement']));
            echo "   - {$stat['device_name']} (ICCID: {$stat['sim_iccid']}): {$stat['count']} mesures | Dernière: $last\n";
        }
    } else {
        echo "   ⚠️  Aucune mesure dans les dernières 24 heures!\n";
        echo "   → Le dispositif n'envoie peut-être plus de mesures\n";
    }
    echo "\n";
    
    // 6. Dispositifs sans mesures
    echo "5️⃣  DISPOSITIFS SANS MESURES:\n";
    $stmt = $pdo->query("
        SELECT d.id, d.sim_iccid, d.device_name, d.device_serial, d.last_seen
        FROM devices d
        LEFT JOIN measurements m ON d.id = m.device_id
        WHERE d.deleted_at IS NULL
        AND m.id IS NULL
        ORDER BY d.last_seen DESC NULLS LAST
    ");
    $devicesWithout = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (count($devicesWithout) > 0) {
        echo "   ⚠️  " . count($devicesWithout) . " dispositif(s) sans mesures:\n";
        foreach ($devicesWithout as $d) {
            $lastSeen = $d['last_seen'] ? date('Y-m-d H:i:s', strtotime($d['last_seen'])) : 'Jamais';
            echo "   - {$d['device_name']} (ICCID: {$d['sim_iccid']}) | Dernière vue: $lastSeen\n";
        }
    } else {
        echo "   ✅ Tous les dispositifs ont au moins une mesure\n";
    }
    echo "\n";
    
    // Résumé final
    echo "=== RÉSUMÉ ===\n";
    echo "✅ Dispositifs: $deviceCount\n";
    echo "✅ Mesures totales: $measurementCount\n";
    echo "✅ Mesures (24h): $recentCount\n";
    echo "✅ Dispositifs sans mesures: " . count($devicesWithout) . "\n";
    echo "\n";
    
    if ($measurementCount > 0 && $recentCount === 0) {
        echo "⚠️  ATTENTION: Des mesures existent mais aucune dans les dernières 24h\n";
        echo "   → Le dispositif n'envoie peut-être plus de mesures\n";
    } elseif ($measurementCount > 0) {
        echo "✅ Les mesures sont présentes dans la base de données!\n";
        echo "   → Si elles ne s'affichent pas dans le frontend, vérifiez:\n";
        echo "      - La console du navigateur (erreurs JavaScript)\n";
        echo "      - Les requêtes réseau (onglet Network)\n";
        echo "      - L'endpoint /api.php/devices/{id}/history\n";
    }
    
} catch (PDOException $e) {
    echo "❌ ERREUR BASE DE DONNÉES:\n";
    echo "   Message: " . $e->getMessage() . "\n";
    echo "   Code: " . $e->getCode() . "\n";
    echo "\n";
    echo "Vérifiez:\n";
    echo "  - Que la base de données est accessible\n";
    echo "  - Les identifiants de connexion\n";
    echo "  - Que les tables existent (exécuter schema.sql si nécessaire)\n";
    exit(1);
} catch (Exception $e) {
    echo "❌ ERREUR: " . $e->getMessage() . "\n";
    exit(1);
}

