# ================================================================================
# Script de diagnostic et reparation de la base de donnees Docker
# ================================================================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DIAGNOSTIC BASE DE DONNEES DOCKER" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verifier Docker
Write-Host "[1/6] Verification Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK Docker installe: $dockerVersion" -ForegroundColor Green
    } else {
        Write-Host "ERREUR Docker non disponible" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "ERREUR Docker non disponible: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 2. Verifier les conteneurs
Write-Host "[2/6] Verification conteneurs..." -ForegroundColor Yellow
$containers = docker ps -a --format '{{.Names}}|{{.Status}}|{{.Ports}}' 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "Conteneurs trouves:" -ForegroundColor Cyan
    $containers | ForEach-Object {
        $parts = $_ -split '\|'
        $name = $parts[0]
        $status = $parts[1]
        $ports = $parts[2]
        
        if ($name -eq "ott-postgres") {
            if ($status -like "*Up*") {
                Write-Host "  OK $name : $status" -ForegroundColor Green
            } else {
                Write-Host "  ERREUR $name : $status (ARRETE)" -ForegroundColor Red
            }
        } elseif ($name -eq "ott-api") {
            if ($status -like "*Up*") {
                Write-Host "  OK $name : $status" -ForegroundColor Green
            } else {
                Write-Host "  ERREUR $name : $status (ARRETE)" -ForegroundColor Red
            }
        } else {
            Write-Host "  INFO $name : $status" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "ERREUR lors de la verification des conteneurs" -ForegroundColor Red
    Write-Host "   Sortie: $containers" -ForegroundColor Red
}
Write-Host ""

# 3. Verifier le conteneur PostgreSQL
Write-Host "[3/6] Verification conteneur PostgreSQL..." -ForegroundColor Yellow
$postgresRunning = docker ps --filter "name=ott-postgres" --format '{{.Names}}' 2>&1
if ($postgresRunning -eq "ott-postgres") {
    Write-Host "OK Conteneur ott-postgres en cours d'execution" -ForegroundColor Green
    
    # Verifier la sante
    $health = docker inspect ott-postgres --format '{{.State.Health.Status}}' 2>&1
    Write-Host "   Etat sante: $health" -ForegroundColor $(if ($health -eq "healthy") { "Green" } else { "Yellow" })
    
} else {
    Write-Host "ERREUR Conteneur ott-postgres NON en cours d'execution" -ForegroundColor Red
    Write-Host ""
    Write-Host "SOLUTION: Demarrer le conteneur..." -ForegroundColor Yellow
    Write-Host "   Commande: docker-compose up -d db" -ForegroundColor Cyan
    Write-Host ""
    
    $start = Read-Host "Voulez-vous demarrer le conteneur maintenant? (O/N)"
    if ($start -eq "O" -or $start -eq "o") {
        Write-Host "Demarrage du conteneur..." -ForegroundColor Yellow
        docker-compose up -d db
        Start-Sleep -Seconds 5
        Write-Host "OK Conteneur demarre" -ForegroundColor Green
    } else {
        Write-Host "ATTENTION: Veuillez demarrer le conteneur manuellement" -ForegroundColor Yellow
        exit 1
    }
}
Write-Host ""

# 4. Tester la connexion PostgreSQL
Write-Host "[4/6] Test connexion PostgreSQL..." -ForegroundColor Yellow
$testQuery = 'SELECT version();'
$testConnection = docker exec ott-postgres psql -U postgres -d ott_data -c $testQuery 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "OK Connexion PostgreSQL reussie" -ForegroundColor Green
    $version = ($testConnection | Select-String "PostgreSQL").ToString()
    Write-Host "   $version" -ForegroundColor Gray
} else {
    Write-Host "ERREUR Connexion PostgreSQL echouee" -ForegroundColor Red
    Write-Host "   Erreur: $testConnection" -ForegroundColor Red
    Write-Host ""
    Write-Host "SOLUTIONS:" -ForegroundColor Yellow
    Write-Host "   1. Verifier que le conteneur est demarre: docker ps" -ForegroundColor Cyan
    Write-Host "   2. Verifier les logs: docker logs ott-postgres" -ForegroundColor Cyan
    Write-Host "   3. Redemarrer le conteneur: docker restart ott-postgres" -ForegroundColor Cyan
    Write-Host "   4. Reinitialiser le volume (ATTENTION: perte de donnees): docker-compose down -v" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# 5. Verifier les tables
Write-Host "[5/6] Verification tables..." -ForegroundColor Yellow
$sqlQuery = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('roles', 'users', 'devices', 'firmware_versions', 'patients') ORDER BY table_name;"
$tables = docker exec ott-postgres psql -U postgres -d ott_data -t -c $sqlQuery 2>&1

if ($LASTEXITCODE -eq 0) {
    $tableList = $tables | Where-Object { $_.Trim() -ne "" }
    $tableCount = ($tableList | Measure-Object).Count
    
    if ($tableCount -ge 5) {
        Write-Host "OK $tableCount tables trouvees:" -ForegroundColor Green
        $tableList | ForEach-Object {
            Write-Host "   - $($_.Trim())" -ForegroundColor Gray
        }
    } else {
        Write-Host "ATTENTION: Seulement $tableCount tables trouvees (attendu: 5+)" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "SOLUTION: Initialiser le schema..." -ForegroundColor Yellow
        Write-Host "   Commande: Get-Content sql/schema.sql | docker exec -i ott-postgres psql -U postgres -d ott_data" -ForegroundColor Cyan
        Write-Host ""
        
        $init = Read-Host "Voulez-vous initialiser le schema maintenant? (O/N)"
        if ($init -eq "O" -or $init -eq "o") {
            if (Test-Path "sql/schema.sql") {
                Write-Host "Initialisation du schema..." -ForegroundColor Yellow
                Get-Content sql/schema.sql | docker exec -i ott-postgres psql -U postgres -d ott_data
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "OK Schema initialise" -ForegroundColor Green
                } else {
                    Write-Host "ERREUR lors de l'initialisation" -ForegroundColor Red
                }
            } else {
                Write-Host "ERREUR: Fichier sql/schema.sql introuvable" -ForegroundColor Red
            }
        }
    }
} else {
    Write-Host "ERREUR lors de la verification des tables" -ForegroundColor Red
    Write-Host "   Erreur: $tables" -ForegroundColor Red
}
Write-Host ""

# 6. Verifier le reseau Docker
Write-Host "[6/6] Verification reseau Docker..." -ForegroundColor Yellow
$network = docker network ls --filter "name=ott-network" --format '{{.Name}}' 2>&1
if ($network -eq "ott-network") {
    Write-Host "OK Reseau ott-network existe" -ForegroundColor Green
} else {
    Write-Host "ATTENTION: Reseau ott-network non trouve" -ForegroundColor Yellow
    Write-Host "   Creation du reseau..." -ForegroundColor Yellow
    docker network create ott-network 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK Reseau cree" -ForegroundColor Green
    } else {
        Write-Host "ERREUR lors de la creation du reseau" -ForegroundColor Red
    }
}
Write-Host ""

# Resume
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DIAGNOSTIC TERMINE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Commandes utiles:" -ForegroundColor Yellow
Write-Host "  - Voir les logs PostgreSQL: docker logs ott-postgres" -ForegroundColor Cyan
Write-Host "  - Redemarrer PostgreSQL: docker restart ott-postgres" -ForegroundColor Cyan
Write-Host "  - Redemarrer tous les services: docker-compose restart" -ForegroundColor Cyan
Write-Host "  - Arreter tous les services: docker-compose down" -ForegroundColor Cyan
Write-Host "  - Demarrer tous les services: docker-compose up -d" -ForegroundColor Cyan
Write-Host "  - Reinitialiser completement (ATTENTION: perte de donnees): docker-compose down -v" -ForegroundColor Yellow
Write-Host ""
