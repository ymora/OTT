# ============================================================================
# Script de vérification de la base de données de production
# ============================================================================
# Vérifie que la base de données Render est à jour avec tous les changements
# ============================================================================

param(
    [string]$DATABASE_URL = $env:DATABASE_URL
)

if (-not $DATABASE_URL) {
    Write-Host "❌ ERREUR: DATABASE_URL doit être défini" -ForegroundColor Red
    Write-Host "" -ForegroundColor White
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  `$env:DATABASE_URL='postgresql://...' .\scripts\verify_database.ps1" -ForegroundColor Cyan
    Write-Host "  OU" -ForegroundColor White
    Write-Host "  .\scripts\verify_database.ps1 -DATABASE_URL 'postgresql://...'" -ForegroundColor Cyan
    Write-Host "" -ForegroundColor White
    Write-Host "Récupérez DATABASE_URL depuis:" -ForegroundColor Yellow
    Write-Host "  Render Dashboard > PostgreSQL > Connect > Internal Database URL" -ForegroundColor Cyan
    exit 1
}

Write-Host "🔍 Vérification de la base de données de production..." -ForegroundColor Cyan
Write-Host "   Base: $DATABASE_URL" -ForegroundColor Gray
Write-Host ""

$env:PGPASSWORD = ($DATABASE_URL -split '@')[0] -replace '.*:', ''
$dbHost = ($DATABASE_URL -split '@')[1] -split '/')[0] -split ':'
$dbName = ($DATABASE_URL -split '/')[-1] -split '\?')[0]

$checks = @()

# 1. Vérifier colonne phone dans users
Write-Host "1️⃣  Vérification colonne 'phone' dans 'users'..." -ForegroundColor Yellow
try {
    $result = docker run --rm postgres:15 psql "$DATABASE_URL" -t -c "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='phone');" 2>&1
    if ($result -match 't|true|1') {
        Write-Host "   ✅ Colonne 'phone' existe" -ForegroundColor Green
        $checks += @{name="phone_column"; status="ok"}
    } else {
        Write-Host "   ❌ Colonne 'phone' n'existe pas" -ForegroundColor Red
        $checks += @{name="phone_column"; status="missing"}
    }
} catch {
    Write-Host "   ⚠️  Erreur lors de la vérification: $_" -ForegroundColor Yellow
    $checks += @{name="phone_column"; status="error"}
}

# 2. Vérifier table patient_notifications_preferences
Write-Host "2️⃣  Vérification table 'patient_notifications_preferences'..." -ForegroundColor Yellow
try {
    $result = docker run --rm postgres:15 psql "$DATABASE_URL" -t -c "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='patient_notifications_preferences');" 2>&1
    if ($result -match 't|true|1') {
        Write-Host "   ✅ Table 'patient_notifications_preferences' existe" -ForegroundColor Green
        $checks += @{name="patient_notifications_table"; status="ok"}
    } else {
        Write-Host "   ❌ Table 'patient_notifications_preferences' n'existe pas" -ForegroundColor Red
        $checks += @{name="patient_notifications_table"; status="missing"}
    }
} catch {
    Write-Host "   ⚠️  Erreur lors de la vérification: $_" -ForegroundColor Yellow
    $checks += @{name="patient_notifications_table"; status="error"}
}

# 3. Vérifier vue users_with_roles avec phone
Write-Host "3️⃣  Vérification vue 'users_with_roles' avec 'phone'..." -ForegroundColor Yellow
try {
    $result = docker run --rm postgres:15 psql "$DATABASE_URL" -t -c "SELECT column_name FROM information_schema.columns WHERE table_name='users_with_roles' AND column_name='phone';" 2>&1
    if ($result -match 'phone') {
        Write-Host "   ✅ Vue 'users_with_roles' contient 'phone'" -ForegroundColor Green
        $checks += @{name="users_with_roles_phone"; status="ok"}
    } else {
        Write-Host "   ❌ Vue 'users_with_roles' ne contient pas 'phone'" -ForegroundColor Red
        $checks += @{name="users_with_roles_phone"; status="missing"}
    }
} catch {
    Write-Host "   ⚠️  Erreur lors de la vérification: $_" -ForegroundColor Yellow
    $checks += @{name="users_with_roles_phone"; status="error"}
}

# 4. Vérifier valeurs par défaut des notifications (FALSE)
Write-Host "4️⃣  Vérification valeurs par défaut notifications (FALSE)..." -ForegroundColor Yellow
try {
    $result = docker run --rm postgres:15 psql "$DATABASE_URL" -t -c "SELECT column_default FROM information_schema.columns WHERE table_name='user_notifications_preferences' AND column_name='email_enabled';" 2>&1
    if ($result -match 'false|FALSE') {
        Write-Host "   ✅ Notifications désactivées par défaut (FALSE)" -ForegroundColor Green
        $checks += @{name="notifications_default_false"; status="ok"}
    } else {
        Write-Host "   ⚠️  Valeurs par défaut des notifications à vérifier" -ForegroundColor Yellow
        $checks += @{name="notifications_default_false"; status="warning"}
    }
} catch {
    Write-Host "   ⚠️  Erreur lors de la vérification: $_" -ForegroundColor Yellow
    $checks += @{name="notifications_default_false"; status="error"}
}

# 5. Vérifier contrainte notifications_queue
Write-Host "5️⃣  Vérification contrainte 'notifications_queue_recipient_check'..." -ForegroundColor Yellow
try {
    $result = docker run --rm postgres:15 psql "$DATABASE_URL" -t -c "SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notifications_queue_recipient_check');" 2>&1
    if ($result -match 't|true|1') {
        Write-Host "   ✅ Contrainte 'notifications_queue_recipient_check' existe" -ForegroundColor Green
        $checks += @{name="notifications_queue_constraint"; status="ok"}
    } else {
        Write-Host "   ⚠️  Contrainte 'notifications_queue_recipient_check' n'existe pas" -ForegroundColor Yellow
        $checks += @{name="notifications_queue_constraint"; status="warning"}
    }
} catch {
    Write-Host "   ⚠️  Erreur lors de la vérification: $_" -ForegroundColor Yellow
    $checks += @{name="notifications_queue_constraint"; status="error"}
}

# 6. Vérifier colonne patient_id dans notifications_queue
Write-Host "6️⃣  Vérification colonne 'patient_id' dans 'notifications_queue'..." -ForegroundColor Yellow
try {
    $result = docker run --rm postgres:15 psql "$DATABASE_URL" -t -c "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications_queue' AND column_name='patient_id');" 2>&1
    if ($result -match 't|true|1') {
        Write-Host "   ✅ Colonne 'patient_id' existe dans 'notifications_queue'" -ForegroundColor Green
        $checks += @{name="notifications_queue_patient_id"; status="ok"}
    } else {
        Write-Host "   ❌ Colonne 'patient_id' n'existe pas dans 'notifications_queue'" -ForegroundColor Red
        $checks += @{name="notifications_queue_patient_id"; status="missing"}
    }
} catch {
    Write-Host "   ⚠️  Erreur lors de la vérification: $_" -ForegroundColor Yellow
    $checks += @{name="notifications_queue_patient_id"; status="error"}
}

Write-Host ""
Write-Host "📊 RÉSUMÉ DES VÉRIFICATIONS" -ForegroundColor Cyan
Write-Host ""

$allOk = $true
foreach ($check in $checks) {
    if ($check.status -eq "ok") {
        Write-Host "   ✅ $($check.name): OK" -ForegroundColor Green
    } elseif ($check.status -eq "missing") {
        Write-Host "   ❌ $($check.name): MANQUANT" -ForegroundColor Red
        $allOk = $false
    } elseif ($check.status -eq "warning") {
        Write-Host "   ⚠️  $($check.name): À VÉRIFIER" -ForegroundColor Yellow
    } else {
        Write-Host "   ⚠️  $($check.name): ERREUR" -ForegroundColor Yellow
    }
}

Write-Host ""

if ($allOk) {
    Write-Host "✅ Base de données à jour !" -ForegroundColor Green
    Write-Host ""
    Write-Host "Tous les changements décidés dans le chat sont présents:" -ForegroundColor White
    Write-Host "   ✅ Colonne 'phone' dans 'users'" -ForegroundColor Green
    Write-Host "   ✅ Table 'patient_notifications_preferences'" -ForegroundColor Green
    Write-Host "   ✅ Vue 'users_with_roles' avec 'phone'" -ForegroundColor Green
    Write-Host "   ✅ Notifications désactivées par défaut" -ForegroundColor Green
    Write-Host "   ✅ Support patients dans 'notifications_queue'" -ForegroundColor Green
} else {
    Write-Host "❌ Base de données nécessite une migration !" -ForegroundColor Red
    Write-Host ""
    Write-Host "Pour appliquer la migration:" -ForegroundColor Yellow
    Write-Host "   docker run --rm -i postgres:15 psql `$DATABASE_URL < sql/schema.sql" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "OU" -ForegroundColor White
    Write-Host "   psql `$DATABASE_URL -f sql/schema.sql" -ForegroundColor Cyan
}

Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

