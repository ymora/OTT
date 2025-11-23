# Script de débogage pour le dashboard
# Usage: .\scripts\debug-dashboard.ps1

Write-Host "🔍 GUIDE DE DÉBOGAGE - Dashboard" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "📋 Étapes de débogage:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Ouvrez la console du navigateur (F12)" -ForegroundColor White
Write-Host "   Onglet: Console" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Vérifiez les logs suivants:" -ForegroundColor White
Write-Host "   [AuthContext] Initialisation..." -ForegroundColor Gray
Write-Host "   [AuthContext] localStorage: ..." -ForegroundColor Gray
Write-Host "   [AuthContext] Utilisateur restauré: ..." -ForegroundColor Gray
Write-Host "   [HomePage] État: ..." -ForegroundColor Gray
Write-Host "   [DashboardLayout] État: ..." -ForegroundColor Gray
Write-Host ""
Write-Host "3. Vérifiez l'onglet Network:" -ForegroundColor White
Write-Host "   - Requêtes vers /api.php/auth/login" -ForegroundColor Gray
Write-Host "   - Statut des réponses (200, 401, 500...)" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Vérifiez l'onglet Application > Local Storage:" -ForegroundColor White
Write-Host "   - ott_token: doit être présent si connecté" -ForegroundColor Gray
Write-Host "   - ott_user: doit être présent si connecté" -ForegroundColor Gray
Write-Host ""
Write-Host "5. Si page blanche:" -ForegroundColor Yellow
Write-Host "   - Vérifiez les logs [DashboardLayout]" -ForegroundColor White
Write-Host "   - Si 'Pas d'utilisateur authentifié' → Connectez-vous d'abord" -ForegroundColor White
Write-Host "   - Si 'Redirection vers /' → Normal, attendez la redirection" -ForegroundColor White
Write-Host ""
Write-Host "6. Pour se connecter:" -ForegroundColor Yellow
Write-Host "   - Allez sur http://localhost:3000/" -ForegroundColor White
Write-Host "   - Utilisez les identifiants de test" -ForegroundColor White
Write-Host "   - Vérifiez que l'API répond: https://ott-jbln.onrender.com" -ForegroundColor White
Write-Host ""

