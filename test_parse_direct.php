<?php
/**
 * Test direct du parsing SQL sans dépendances
 */

// Simuler exactement la fonction parseSqlStatements
function parseSqlStatements($sql) {
    $placeholders = [];
    $placeholderIndex = 0;
    $protectedSql = $sql;
    $maxIterations = 100;
    $iteration = 0;
    
    // Boucle pour trouver tous les blocs $$ ... $$
    while ($iteration < $maxIterations) {
        $startPos = strpos($protectedSql, '$$');
        if ($startPos === false) {
            break;
        }
        
        $endPos = strpos($protectedSql, '$$', $startPos + 2);
        if ($endPos === false) {
            echo "⚠️ Bloc $$ non fermé à la position {$startPos}\n";
            break;
        }
        
        $block = substr($protectedSql, $startPos, $endPos - $startPos + 2);
        $placeholder = "___DOLLAR_QUOTE_{$placeholderIndex}___";
        $placeholders[$placeholder] = $block;
        $protectedSql = substr_replace($protectedSql, $placeholder, $startPos, $endPos - $startPos + 2);
        
        echo "Bloc trouvé: " . strlen($block) . " chars, placeholder: {$placeholder}\n";
        $placeholderIndex++;
        $iteration++;
    }
    
    echo "\nSQL protégé (preview): " . substr($protectedSql, 0, 200) . "\n\n";
    
    // Diviser par point-virgule
    $rawStatements = explode(';', $protectedSql);
    echo "Après division: " . count($rawStatements) . " parties\n\n";
    
    // Réassembler
    $statements = [];
    $currentParts = [];
    
    foreach ($rawStatements as $index => $rawStmt) {
        $stmt = trim($rawStmt);
        
        if (empty($stmt)) {
            if (!empty($currentParts)) {
                $finalStmt = implode('; ', $currentParts) . ';';
                foreach (array_reverse($placeholders, true) as $ph => $orig) {
                    $finalStmt = str_replace($ph, $orig, $finalStmt);
                }
                if (!preg_match('/^\s*--/', $finalStmt)) {
                    $statements[] = $finalStmt;
                }
                $currentParts = [];
            }
            continue;
        }
        
        $hasPlaceholder = false;
        $placeholderInStmt = null;
        foreach ($placeholders as $placeholder => $original) {
            if (strpos($stmt, $placeholder) !== false) {
                $hasPlaceholder = true;
                $placeholderInStmt = $placeholder;
                break;
            }
        }
        
        echo "Part $index: " . (strlen($stmt) > 80 ? substr($stmt, 0, 80) . '...' : $stmt) . "\n";
        echo "  Has placeholder: " . ($hasPlaceholder ? 'OUI' : 'NON') . "\n";
        
        if ($hasPlaceholder) {
            $currentParts[] = $stmt;
            $isComplete = false;
            if ($placeholderInStmt && preg_match('/' . preg_quote($placeholderInStmt, '/') . '[\s\S]*?LANGUAGE\s+\w+/i', $stmt)) {
                $isComplete = true;
                echo "  ✅ Contient LANGUAGE après placeholder\n";
            }
            
            if ($isComplete) {
                $finalStmt = implode('; ', $currentParts) . ';';
                foreach (array_reverse($placeholders, true) as $ph => $orig) {
                    $finalStmt = str_replace($ph, $orig, $finalStmt);
                }
                if (!preg_match('/^\s*--/', $finalStmt)) {
                    $statements[] = $finalStmt;
                }
                $currentParts = [];
                echo "  ✅ Instruction finalisée\n";
            } else {
                echo "  ⏳ Instruction en cours (pas de LANGUAGE)\n";
            }
        } else {
            if (!empty($currentParts)) {
                if (preg_match('/^[\s\n\r]*LANGUAGE\s+\w+/i', $stmt)) {
                    echo "  ✅ Cette partie complète l'instruction (LANGUAGE)\n";
                    $currentParts[] = $stmt;
                    $finalStmt = implode('; ', $currentParts) . ';';
                    foreach (array_reverse($placeholders, true) as $ph => $orig) {
                        $finalStmt = str_replace($ph, $orig, $finalStmt);
                    }
                    if (!preg_match('/^\s*--/', $finalStmt)) {
                        $statements[] = $finalStmt;
                    }
                    $currentParts = [];
                } else {
                    echo "  ⚠️ Finalisation instruction en cours (pas de LANGUAGE)\n";
                    $finalStmt = implode('; ', $currentParts) . ';';
                    foreach (array_reverse($placeholders, true) as $ph => $orig) {
                        $finalStmt = str_replace($ph, $orig, $finalStmt);
                    }
                    if (!preg_match('/^\s*--/', $finalStmt)) {
                        $statements[] = $finalStmt;
                    }
                    $currentParts = [];
                }
            }
            
            if (!preg_match('/^\s*--/', $stmt)) {
                $statements[] = $stmt . ';';
            }
        }
        echo "\n";
    }
    
    if (!empty($currentParts)) {
        $finalStmt = implode('; ', $currentParts) . ';';
        foreach (array_reverse($placeholders, true) as $ph => $orig) {
            $finalStmt = str_replace($ph, $orig, $finalStmt);
        }
        if (!preg_match('/^\s*--/', $finalStmt)) {
            $statements[] = $finalStmt;
        }
    }
    
    return $statements;
}

// Test avec le SQL réel
$testSql = "CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;";

echo "=== TEST PARSING SQL ===\n\n";
echo "SQL d'entrée:\n$testSql\n\n";
echo "=== RÉSULTAT ===\n\n";

$statements = parseSqlStatements($testSql);

echo "\n=== VÉRIFICATION FINALE ===\n";
echo "Nombre d'instructions: " . count($statements) . "\n\n";

foreach ($statements as $i => $stmt) {
    echo "Instruction " . ($i + 1) . ":\n";
    echo "Longueur: " . strlen($stmt) . " chars\n";
    
    if (strpos($stmt, 'CREATE OR REPLACE FUNCTION') !== false) {
        $checks = [
            'RETURNS TRIGGER AS $$' => strpos($stmt, 'RETURNS TRIGGER AS $$') !== false,
            'RETURN NEW' => strpos($stmt, 'RETURN NEW') !== false,
            'END;' => strpos($stmt, 'END;') !== false,
            '$$ LANGUAGE plpgsql' => strpos($stmt, '$$ LANGUAGE plpgsql') !== false
        ];
        
        echo "Vérifications:\n";
        foreach ($checks as $check => $result) {
            echo "  " . ($result ? "✅" : "❌") . " $check\n";
        }
        
        if (in_array(false, $checks)) {
            echo "\n❌ INSTRUCTION INCOMPLÈTE !\n";
            echo "Contenu complet:\n$stmt\n";
        } else {
            echo "\n✅ INSTRUCTION COMPLÈTE !\n";
        }
    }
    echo "\n";
}

