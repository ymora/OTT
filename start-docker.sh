#!/bin/bash
# ================================================================================
# Script de démarrage Docker - OTT Dashboard
# ================================================================================

echo "🐳 Démarrage de l'environnement Docker OTT..."

# Vérifier que Docker Desktop est lancé
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker Desktop n'est pas lancé !"
    echo "📋 Veuillez démarrer Docker Desktop et relancer ce script"
    exit 1
fi

# Arrêter les anciens conteneurs
echo "🛑 Arrêt des anciens conteneurs..."
docker-compose down

# Démarrer les nouveaux conteneurs
echo "🚀 Démarrage des conteneurs..."
docker-compose up -d --build

# Attendre que les services soient prêts
echo "⏳ Attente de démarrage des services..."
sleep 10

# Vérifier que tout fonctionne
echo "🔍 Vérification des services..."

# Vérifier l'API
if curl -s http://localhost:8080/api.php/health > /dev/null; then
    echo "✅ API PHP: OK (http://localhost:8080)"
else
    echo "❌ API PHP: ERREUR"
fi

# Vérifier Next.js
if curl -s http://localhost:3000 > /dev/null; then
    echo "✅ Next.js: OK (http://localhost:3000)"
else
    echo "⏳ Next.js: Démarrage en cours..."
fi

# Vérifier PostgreSQL
if docker-compose exec -T db pg_isready -U ott_user > /dev/null 2>&1; then
    echo "✅ PostgreSQL: OK"
else
    echo "❌ PostgreSQL: ERREUR"
fi

echo ""
echo "🎯 Accès à l'application:"
echo "   📱 Dashboard: http://localhost:3000"
echo "   🔌 API: http://localhost:8080/api.php/health"
echo "   🗄️  Database: db:5432 (ott_user/ott_password)"
echo ""
echo "📋 Commandes utiles:"
echo "   📊 Logs: docker-compose logs -f"
echo "   🛑 Arrêter: docker-compose down"
echo "   🔄 Rebuild: docker-compose up -d --build"
