param(
    [string] = 'esp32:esp32:esp32',
    [string] = 'COM3',
    [switch]
)

 = Split-Path -Parent System.Management.Automation.InvocationInfo.MyCommand.Path
 = Join-Path  '..\firmware\fw_ott_optimized\fw_ott_optimized.ino'

Write-Host  🔧 Compilation :  -ForegroundColor Cyan
arduino-cli compile --fqbn  
if ( -ne 0) {
    Write-Error 'Compilation échouée'; exit 
}

if () {
    Write-Host ⬆️ Upload sur  -ForegroundColor Green
    arduino-cli upload -p  --fqbn  
}
