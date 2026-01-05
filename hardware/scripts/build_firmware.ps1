param(
    [string]$FQBN = 'esp32:esp32:esp32',
    [string]$Port = 'COM3',
    [switch]$Upload
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$InoFile = Join-Path $ScriptDir '..\firmware\fw_ott_optimized\fw_ott_optimized.ino'

$ArduinoCli = (Get-Command arduino-cli -ErrorAction SilentlyContinue)?.Source
if (-not $ArduinoCli) {
    $Candidates = @(
        'C:\\Program Files\\Arduino CLI\\arduino-cli.exe',
        'C:\\Program Files (x86)\\Arduino CLI\\arduino-cli.exe'
    )
    foreach ($c in $Candidates) {
        if (Test-Path $c) { $ArduinoCli = $c; break }
    }
}
if (-not $ArduinoCli) {
    Write-Error "arduino-cli introuvable. Installe Arduino CLI ou ajoute-le au PATH."; exit 1
}

Write-Host "🔧 Compilation : $InoFile" -ForegroundColor Cyan
& $ArduinoCli compile --fqbn $FQBN $InoFile
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Compilation échouée'; exit $LASTEXITCODE
}

if ($Upload) {
    Write-Host "⬆️ Upload sur $Port" -ForegroundColor Green
    & $ArduinoCli upload -p $Port --fqbn $FQBN $InoFile
}
