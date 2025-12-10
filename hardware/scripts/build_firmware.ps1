param(
    [string]$FQBN = 'esp32:esp32:esp32',
    [string]$Port = 'COM3',
    [switch]$Upload
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$InoFile = Join-Path $ScriptDir '..\firmware\fw_ott_optimized\fw_ott_optimized.ino'

Write-Host "🔧 Compilation : $InoFile" -ForegroundColor Cyan
arduino-cli compile --fqbn $FQBN $InoFile
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Compilation échouée'; exit $LASTEXITCODE
}

if ($Upload) {
    Write-Host "⬆️ Upload sur $Port" -ForegroundColor Green
    arduino-cli upload -p $Port --fqbn $FQBN $InoFile
}
