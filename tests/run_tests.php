<?php
/**
 * Script d'exécution de tous les tests unitaires
 */

echo "🚀 LANCEMENT DE LA SUITE DE TESTS API OTT\n";
echo str_repeat("=", 60) . "\n\n";

require_once __DIR__ . '/ApiHandlerTests.php';
require_once __DIR__ . '/DeviceHandlerTests.php';

// Exécuter les tests API
echo "1️⃣  TESTS DES HANDLERS API\n";
echo str_repeat("-", 40) . "\n";
$apiTests = new ApiHandlerTests();
$apiTests->runAllTests();

echo "\n" . str_repeat("=", 60) . "\n\n";

// Exécuter les tests Device
echo "2️⃣  TESTS DES HANDLERS DEVICES\n";
echo str_repeat("-", 40) . "\n";
$deviceTests = new DeviceHandlerTests();
$deviceTests->runAllTests();

echo "\n" . str_repeat("=", 60) . "\n";
echo "🏁 TOUS LES TESTS TERMINÉS\n";
echo str_repeat("=", 60) . "\n";

// Résumé global
$allResults = array_merge(
    $apiTests->testResults ?? [],
    $deviceTests->testResults ?? []
);

$total = count($allResults);
$passed = count(array_filter($allResults, fn($r) => $r['status'] === 'PASS'));
$failed = count(array_filter($allResults, fn($r) => $r['status'] === 'FAIL'));
$errors = count(array_filter($allResults, fn($r) => $r['status'] === 'ERROR'));

echo "📈 RÉSUMÉ GLOBAL\n";
echo "Total: $total | ✅ Passés: $passed | ❌ Échoués: $failed | 🚨 Erreurs: $errors\n";
echo "🎯 Taux de réussite global: " . round(($passed / $total) * 100, 1) . "%\n";

if ($failed === 0 && $errors === 0) {
    echo "\n🎉 TOUS LES TESTS PASSÉS - API PRÊTE POUR LA PRODUCTION !\n";
} else {
    echo "\n⚠️  DES TESTS ONT ÉCHOUÉ - VÉRIFIEZ LE CODE AVANT DÉPLOIEMENT\n";
}

echo "\n💡 Prochaines étapes recommandées:\n";
echo "   1. Corriger les tests échoués\n";
echo "   2. Ajouter plus de tests de couverture\n";
echo "   3. Intégrer les tests dans le CI/CD\n";
echo "   4. Documenter les cas de test\n";
