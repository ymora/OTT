#!/usr/bin/env php
<?php
/**
 * Script pour réinitialiser le mot de passe admin
 * Usage: php scripts/reset_admin_password.php
 */

require_once __DIR__ . '/../bootstrap/env_loader.php';
require_once __DIR__ . '/../bootstrap/database.php';

$email = 'ymora@free.fr';
$newPassword = 'Ym120879';

try {
    // Générer le hash bcrypt
    $passwordHash = password_hash($newPassword, PASSWORD_BCRYPT);
    
    // Mettre à jour le mot de passe
    $stmt = $pdo->prepare("
        UPDATE users 
        SET password_hash = :password_hash 
        WHERE email = :email
    ");
    
    $result = $stmt->execute([
        'email' => $email,
        'password_hash' => $passwordHash
    ]);
    
    if ($stmt->rowCount() > 0) {
        echo "✅ Mot de passe réinitialisé avec succès pour $email\n";
        echo "   Nouveau mot de passe: $newPassword\n";
        echo "   Hash: $passwordHash\n";
    } else {
        echo "⚠️  Aucun utilisateur trouvé avec l'email: $email\n";
        echo "   Vérifiez que l'email est correct.\n";
    }
    
} catch (PDOException $e) {
    echo "❌ Erreur: " . $e->getMessage() . "\n";
    exit(1);
}

