#!/bin/bash
# Script de vérification finale de l'audit
# Vérifie que tout est en place après l'audit

echo "🔍 Vérification Finale de l'Audit OTT"
echo "======================================"
echo ""

ERRORS=0
WARNINGS=0

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✅${NC} $1 existe"
        return 0
    else
        echo -e "${RED}❌${NC} $1 manquant"
        ((ERRORS++))
        return 1
    fi
}

check_header() {
    if grep -q "$2" "$1" 2>/dev/null; then
        echo -e "${GREEN}✅${NC} Header '$2' présent dans $1"
        return 0
    else
        echo -e "${YELLOW}⚠️${NC} Header '$2' absent de $1"
        ((WARNINGS++))
        return 1
    fi
}

echo "📋 Phase 1 - Sécurité"
echo "---------------------"

# Vérifier fichiers sécurité
check_file "api/helpers_sql.php"
check_file "PHASE1_SECURITE_CHANGEMENTS.md"

# Vérifier headers de sécurité dans api.php
echo ""
echo "Vérification des headers de sécurité..."
check_header "api.php" "X-Content-Type-Options"
check_header "api.php" "X-Frame-Options"
check_header "api.php" "Content-Security-Policy"

# Vérifier inclusion helpers_sql.php
if grep -q "helpers_sql.php" "api.php"; then
    echo -e "${GREEN}✅${NC} helpers_sql.php inclus dans api.php"
else
    echo -e "${RED}❌${NC} helpers_sql.php non inclus dans api.php"
    ((ERRORS++))
fi

echo ""
echo "📋 Phase 2 - Consolidation"
echo "-------------------------"

# Vérifier fichiers consolidation
check_file "lib/dateUtils.js"
check_file "lib/statusUtils.js"
check_file "hooks/useStats.js"
check_file "components/DataTable.js"

echo ""
echo "📋 Fichiers Longs à Refactoriser"
echo "--------------------------------"

# Vérifier taille des fichiers
check_long_file() {
    if [ -f "$1" ]; then
        LINES=$(wc -l < "$1" 2>/dev/null || echo "0")
        if [ "$LINES" -gt 1000 ]; then
            echo -e "${YELLOW}⚠️${NC} $1: $LINES lignes (à refactoriser)"
            ((WARNINGS++))
        else
            echo -e "${GREEN}✅${NC} $1: $LINES lignes"
        fi
    fi
}

check_long_file "app/dashboard/devices/page.js"
check_long_file "api.php"
check_long_file "app/dashboard/admin/database-view/page.js"

echo ""
echo "📋 Documentation"
echo "---------------"

check_file "PLAN_AUDIT_PROJET.md"
check_file "AUDIT_RESUME_EXECUTIF.md"
check_file "AUDIT_FINAL_COMPLET.md"

echo ""
echo "======================================"
echo "📊 RÉSUMÉ"
echo "======================================"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ Tout est en ordre !${NC}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️ $WARNINGS avertissement(s)${NC}"
    exit 0
else
    echo -e "${RED}❌ $ERRORS erreur(s), $WARNINGS avertissement(s)${NC}"
    exit 1
fi

