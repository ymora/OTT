# ============================================================================
# Script de redémarrage environnement local OTT
# ============================================================================
# Arrête les processus sur les ports utilisés et relance les services
# ============================================================================

Write-Host "🔄 Redémarrage environnement local OTT" -ForegroundColor Cyan
Write-Host ""

# Fonction pour tuer un processus sur un port
function Stop-ProcessOnPort {
    param([int]$Port)
    
    $processes = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | 
                 Select-Object -ExpandProperty OwningProcess -Unique
    
    if ($processes) {
        foreach ($pid in $processes) {
            $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "  ⚠️  Arrêt du processus $($proc.ProcessName) (PID: $pid) sur le port $Port" -ForegroundColor Yellow
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                Start-Sleep -Milliseconds 500
            }
        }
    } else {
        Write-Host "  ✓ Port $Port libre" -ForegroundColor Green
    }
}

# Ports à libérer
$ports = @(3000, 5432, 8080, 8081)

Write-Host "📌 Libération des ports..." -ForegroundColor Cyan
foreach ($port in $ports) {
    Stop-ProcessOnPort -Port $port
}
Write-Host ""

# Attendre un peu pour que les ports soient libérés
Write-Host "⏳ Attente de libération des ports..." -ForegroundColor Cyan
Start-Sleep -Seconds 2

# Vérifier si PostgreSQL est en cours (Docker)
Write-Host "🐳 Vérification Docker PostgreSQL..." -ForegroundColor Cyan
$dockerRunning = docker ps -a --filter "name=ott-db" --format "{{.Names}}" 2>$null
if ($dockerRunning) {
    Write-Host "  ✓ Conteneur Docker trouvé: $dockerRunning" -ForegroundColor Green
    Write-Host "  🔄 Redémarrage du conteneur PostgreSQL..." -ForegroundColor Yellow
    docker restart ott-db 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ PostgreSQL redémarré" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Démarrage du conteneur PostgreSQL..." -ForegroundColor Yellow
        docker-compose up -d db 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ PostgreSQL démarré" -ForegroundColor Green
        }
    }
    Start-Sleep -Seconds 3
} else {
    Write-Host "  ℹ️  Aucun conteneur Docker trouvé. Démarrage..." -ForegroundColor Yellow
    docker-compose up -d db 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ PostgreSQL démarré" -ForegroundColor Green
        Start-Sleep -Seconds 3
    } else {
        Write-Host "  ⚠️  PostgreSQL peut être externe ou Docker non disponible" -ForegroundColor Gray
    }
}
Write-Host ""

# Vérifier si on est dans le bon répertoire
$currentDir = Get-Location
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Erreur: package.json non trouvé. Assurez-vous d'être dans le répertoire du projet." -ForegroundColor Red
    exit 1
}

# Vérifier les dépendances Node.js
Write-Host "📦 Vérification des dépendances Node.js..." -ForegroundColor Cyan
if (-not (Test-Path "node_modules")) {
    Write-Host "  ⚠️  node_modules non trouvé. Installation des dépendances..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ❌ Erreur lors de l'installation des dépendances" -ForegroundColor Red
        exit 1
    }
}
Write-Host "  ✓ Dépendances OK" -ForegroundColor Green
Write-Host ""

# Vérifier le fichier .env.local
Write-Host "⚙️  Vérification de la configuration..." -ForegroundColor Cyan
if (-not (Test-Path ".env.local")) {
    Write-Host "  ⚠️  .env.local non trouvé. Création avec API Render par défaut..." -ForegroundColor Yellow
    @"
# Configuration Frontend OTT - Développement Local
# Utilise l'API Render par défaut (plus simple pour tester)
NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com
NEXT_PUBLIC_REQUIRE_AUTH=false
NEXT_PUBLIC_ENABLE_DEMO_RESET=false
"@ | Out-File -FilePath ".env.local" -Encoding UTF8
    Write-Host "  ✓ Fichier .env.local créé avec API Render" -ForegroundColor Green
    Write-Host "  💡 Pour utiliser une API locale, modifiez NEXT_PUBLIC_API_URL dans .env.local" -ForegroundColor Gray
} else {
    Write-Host "  ✓ .env.local trouvé" -ForegroundColor Green
    # Afficher la configuration actuelle
    $envContent = Get-Content ".env.local" -Raw
    if ($envContent -match "NEXT_PUBLIC_API_URL=(.+)") {
        $apiUrl = $matches[1].Trim()
        Write-Host "  → API configurée: $apiUrl" -ForegroundColor Gray
    }
}
Write-Host ""

# Démarrer le serveur de développement Next.js
Write-Host "🚀 Démarrage du serveur Next.js..." -ForegroundColor Cyan
Write-Host "  → Le serveur sera accessible sur http://localhost:3000" -ForegroundColor Gray
Write-Host "  → Appuyez sur Ctrl+C pour arrêter" -ForegroundColor Gray
Write-Host ""

# Lancer Next.js en arrière-plan
Write-Host "📋 Démarrage du serveur..." -ForegroundColor Cyan
Write-Host ""

# Lancer npm run dev en arrière-plan
$job = Start-Job -ScriptBlock {
    Set-Location $using:currentDir
    npm run dev 2>&1
}

# Attendre que le serveur démarre
Write-Host "⏳ Attente du démarrage du serveur..." -ForegroundColor Cyan
$maxAttempts = 30
$attempt = 0
$serverReady = $false

while ($attempt -lt $maxAttempts -and -not $serverReady) {
    Start-Sleep -Seconds 1
    $attempt++
    
    $port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
    if ($port3000) {
        $serverReady = $true
        Write-Host "  ✓ Serveur démarré sur le port 3000" -ForegroundColor Green
    } else {
        Write-Host "  ." -NoNewline -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host ""

if ($serverReady) {
    Write-Host "✅ Serveur Next.js démarré avec succès!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🌐 Ouverture du navigateur..." -ForegroundColor Cyan
    Start-Sleep -Seconds 1
    
    # Ouvrir le navigateur
    Start-Process "http://localhost:3000"
    
    Write-Host "📖 Page ouverte dans votre navigateur par défaut" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Logs du serveur (Ctrl+C pour arrêter):" -ForegroundColor Cyan
    Write-Host "─────────────────────────────────────────────────────────" -ForegroundColor Gray
    Write-Host ""
    
    # Afficher les logs en temps réel
    try {
        while ($true) {
            $output = Receive-Job -Job $job -ErrorAction SilentlyContinue
            if ($output) {
                $output | ForEach-Object { Write-Host $_ }
            }
            Start-Sleep -Milliseconds 500
        }
    } catch {
        Write-Host ""
        Write-Host "🛑 Arrêt du serveur" -ForegroundColor Yellow
    } finally {
        Stop-Job -Job $job -ErrorAction SilentlyContinue
        Remove-Job -Job $job -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "⚠️  Le serveur n'a pas démarré dans les délais" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "📋 Logs d'erreur:" -ForegroundColor Yellow
    Receive-Job -Job $job | ForEach-Object { Write-Host $_ }
    Stop-Job -Job $job -ErrorAction SilentlyContinue
    Remove-Job -Job $job -ErrorAction SilentlyContinue
    exit 1
}

