<#
  script to install dependencies and run key suites for OTT
  execute from repository root: powershell -File scripts/install-and-test.ps1
#>

Push-Location $PSScriptRoot\..

Write-Host "Installing PHP dependencies..."
if (Test-Path .\api\composer.json) {
    Push-Location .\api
    composer install --no-interaction
    Pop-Location
} else {
    Write-Warning "composer.json not found under ./api"
}

Write-Host "Installing JS dependencies (legacy peer deps)..."
npm install --legacy-peer-deps

Write-Host "Running PHP tests..."
Push-Location .\api
if (Test-Path .\vendor\bin\phpunit) {
    .\vendor\bin\phpunit
} else {
    Write-Warning "phpunit binary missing. Run composer install first."
}
Pop-Location

Write-Host "Running frontend checks..."
npm run lint --prefix ./
npm run test --prefix ./
npm run build --prefix ./

Write-Host "Completed install/test pipeline."

Pop-Location
