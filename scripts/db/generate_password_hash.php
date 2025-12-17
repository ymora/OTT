<?php
// Script temporaire pour générer le hash bcrypt du mot de passe
// Usage: php scripts/db/generate_password_hash.php

$password = 'Ym120879';
$hash = password_hash($password, PASSWORD_BCRYPT);

echo "Password: $password\n";
echo "Hash: $hash\n";
echo "\n";
echo "SQL INSERT statement:\n";
echo "INSERT INTO users (id, email, password_hash, first_name, last_name, phone, role_id, is_active)\n";
echo "VALUES\n";
echo "  (1, 'ymora@free.fr', '$hash', 'Yann', 'Mora', NULL, 1, TRUE)\n";
echo "ON CONFLICT (id) DO UPDATE SET \n";
echo "  email = EXCLUDED.email,\n";
echo "  phone = EXCLUDED.phone,\n";
echo "  role_id = EXCLUDED.role_id;\n";

