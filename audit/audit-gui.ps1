# ===============================================================================
# INTERFACE GRAPHIQUE AUDIT - Windows Forms
# ===============================================================================
# Lance une interface visuelle pour configurer et exécuter l'audit
# Usage: .\audit-gui.ps1 ou double-clic sur audit-gui.bat
# ===============================================================================

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

# Chemin du script d'audit
$AuditScript = Join-Path $PSScriptRoot "audit.ps1"

# ===============================================================================
# CRÉATION DE LA FENÊTRE PRINCIPALE
# ===============================================================================

$form = New-Object System.Windows.Forms.Form
$form.Text = "Audit Intelligent - OTT"
$form.Size = New-Object System.Drawing.Size(550, 620)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(30, 30, 30)
$form.ForeColor = [System.Drawing.Color]::White
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9)

# ===============================================================================
# TITRE
# ===============================================================================

$labelTitle = New-Object System.Windows.Forms.Label
$labelTitle.Text = "🔍 Système d'Audit v2.0"
$labelTitle.Font = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
$labelTitle.ForeColor = [System.Drawing.Color]::FromArgb(0, 150, 255)
$labelTitle.Location = New-Object System.Drawing.Point(20, 15)
$labelTitle.Size = New-Object System.Drawing.Size(500, 35)
$form.Controls.Add($labelTitle)

$labelSubtitle = New-Object System.Windows.Forms.Label
$labelSubtitle.Text = "Analyse qualité, sécurité et structure de projets"
$labelSubtitle.ForeColor = [System.Drawing.Color]::Gray
$labelSubtitle.Location = New-Object System.Drawing.Point(20, 50)
$labelSubtitle.Size = New-Object System.Drawing.Size(500, 20)
$form.Controls.Add($labelSubtitle)

# ===============================================================================
# SECTION: CIBLE
# ===============================================================================

$groupTarget = New-Object System.Windows.Forms.GroupBox
$groupTarget.Text = "Cible de l'audit"
$groupTarget.Location = New-Object System.Drawing.Point(20, 80)
$groupTarget.Size = New-Object System.Drawing.Size(495, 90)
$groupTarget.ForeColor = [System.Drawing.Color]::White
$form.Controls.Add($groupTarget)

$radioProject = New-Object System.Windows.Forms.RadioButton
$radioProject.Text = "Projet complet"
$radioProject.Location = New-Object System.Drawing.Point(15, 25)
$radioProject.Size = New-Object System.Drawing.Size(120, 20)
$radioProject.Checked = $true
$radioProject.ForeColor = [System.Drawing.Color]::White
$groupTarget.Controls.Add($radioProject)

$radioFile = New-Object System.Windows.Forms.RadioButton
$radioFile.Text = "Fichier spécifique"
$radioFile.Location = New-Object System.Drawing.Point(150, 25)
$radioFile.Size = New-Object System.Drawing.Size(130, 20)
$radioFile.ForeColor = [System.Drawing.Color]::White
$groupTarget.Controls.Add($radioFile)

$radioDir = New-Object System.Windows.Forms.RadioButton
$radioDir.Text = "Répertoire"
$radioDir.Location = New-Object System.Drawing.Point(300, 25)
$radioDir.Size = New-Object System.Drawing.Size(100, 20)
$radioDir.ForeColor = [System.Drawing.Color]::White
$groupTarget.Controls.Add($radioDir)

$textPath = New-Object System.Windows.Forms.TextBox
$textPath.Location = New-Object System.Drawing.Point(15, 55)
$textPath.Size = New-Object System.Drawing.Size(380, 25)
$textPath.BackColor = [System.Drawing.Color]::FromArgb(45, 45, 45)
$textPath.ForeColor = [System.Drawing.Color]::White
$textPath.BorderStyle = "FixedSingle"
$textPath.Enabled = $false
$textPath.Text = "(Projet complet - pas de chemin requis)"
$groupTarget.Controls.Add($textPath)

$btnBrowse = New-Object System.Windows.Forms.Button
$btnBrowse.Text = "..."
$btnBrowse.Location = New-Object System.Drawing.Point(400, 54)
$btnBrowse.Size = New-Object System.Drawing.Size(35, 25)
$btnBrowse.BackColor = [System.Drawing.Color]::FromArgb(60, 60, 60)
$btnBrowse.FlatStyle = "Flat"
$btnBrowse.Enabled = $false
$groupTarget.Controls.Add($btnBrowse)

# Events pour activer/désactiver le champ de chemin
$radioProject.Add_CheckedChanged({
    $textPath.Enabled = $false
    $btnBrowse.Enabled = $false
    $textPath.Text = "(Projet complet - pas de chemin requis)"
})

$radioFile.Add_CheckedChanged({
    $textPath.Enabled = $true
    $btnBrowse.Enabled = $true
    $textPath.Text = ""
})

$radioDir.Add_CheckedChanged({
    $textPath.Enabled = $true
    $btnBrowse.Enabled = $true
    $textPath.Text = ""
})

$btnBrowse.Add_Click({
    if ($radioFile.Checked) {
        $dialog = New-Object System.Windows.Forms.OpenFileDialog
        $dialog.Filter = "Tous les fichiers (*.*)|*.*|Scripts (*.ps1;*.js;*.php)|*.ps1;*.js;*.php"
        if ($dialog.ShowDialog() -eq "OK") {
            $textPath.Text = $dialog.FileName
        }
    } else {
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        if ($dialog.ShowDialog() -eq "OK") {
            $textPath.Text = $dialog.SelectedPath
        }
    }
})

# ===============================================================================
# SECTION: PHASES
# ===============================================================================

$groupPhases = New-Object System.Windows.Forms.GroupBox
$groupPhases.Text = "Phases à exécuter"
$groupPhases.Location = New-Object System.Drawing.Point(20, 180)
$groupPhases.Size = New-Object System.Drawing.Size(495, 220)
$groupPhases.ForeColor = [System.Drawing.Color]::White
$form.Controls.Add($groupPhases)

$checkAll = New-Object System.Windows.Forms.CheckBox
$checkAll.Text = "Toutes les phases (audit complet)"
$checkAll.Location = New-Object System.Drawing.Point(15, 25)
$checkAll.Size = New-Object System.Drawing.Size(250, 20)
$checkAll.Checked = $true
$checkAll.ForeColor = [System.Drawing.Color]::FromArgb(0, 200, 100)
$checkAll.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$groupPhases.Controls.Add($checkAll)

# Liste des phases avec checkboxes
$phases = @(
    @{Id=1; Name="Inventaire"; Desc="Analyse fichiers"}
    @{Id=2; Name="Architecture"; Desc="Structure projet"}
    @{Id=3; Name="Sécurité"; Desc="Vulnérabilités"}
    @{Id=4; Name="Configuration"; Desc="Docker, env"}
    @{Id=5; Name="Backend API"; Desc="Endpoints, DB"}
    @{Id=6; Name="Frontend"; Desc="Routes, UI"}
    @{Id=7; Name="Qualité Code"; Desc="Code mort, duplication"}
    @{Id=8; Name="Performance"; Desc="Optimisations"}
    @{Id=9; Name="Documentation"; Desc="README, MD"}
    @{Id=10; Name="Tests"; Desc="Unitaires, E2E"}
    @{Id=11; Name="Déploiement"; Desc="CI/CD"}
    @{Id=12; Name="Hardware"; Desc="Firmware"}
)

$phaseCheckboxes = @()
$col = 0
$row = 0
foreach ($phase in $phases) {
    $cb = New-Object System.Windows.Forms.CheckBox
    $cb.Text = "$($phase.Id). $($phase.Name)"
    $cb.Tag = $phase.Id
    $cb.Location = New-Object System.Drawing.Point((15 + $col * 165), (55 + $row * 25))
    $cb.Size = New-Object System.Drawing.Size(155, 20)
    $cb.Checked = $true
    $cb.Enabled = $false
    $cb.ForeColor = [System.Drawing.Color]::LightGray
    $groupPhases.Controls.Add($cb)
    $phaseCheckboxes += $cb
    
    $col++
    if ($col -ge 3) {
        $col = 0
        $row++
    }
}

$checkAll.Add_CheckedChanged({
    foreach ($cb in $phaseCheckboxes) {
        $cb.Enabled = -not $checkAll.Checked
        $cb.Checked = $checkAll.Checked
    }
})

# ===============================================================================
# SECTION: OPTIONS
# ===============================================================================

$groupOptions = New-Object System.Windows.Forms.GroupBox
$groupOptions.Text = "Options"
$groupOptions.Location = New-Object System.Drawing.Point(20, 410)
$groupOptions.Size = New-Object System.Drawing.Size(495, 60)
$groupOptions.ForeColor = [System.Drawing.Color]::White
$form.Controls.Add($groupOptions)

$checkVerbose = New-Object System.Windows.Forms.CheckBox
$checkVerbose.Text = "Mode verbose (détails)"
$checkVerbose.Location = New-Object System.Drawing.Point(15, 25)
$checkVerbose.Size = New-Object System.Drawing.Size(180, 20)
$checkVerbose.ForeColor = [System.Drawing.Color]::White
$groupOptions.Controls.Add($checkVerbose)

$checkQuiet = New-Object System.Windows.Forms.CheckBox
$checkQuiet.Text = "Mode silencieux"
$checkQuiet.Location = New-Object System.Drawing.Point(200, 25)
$checkQuiet.Size = New-Object System.Drawing.Size(150, 20)
$checkQuiet.ForeColor = [System.Drawing.Color]::White
$groupOptions.Controls.Add($checkQuiet)

$checkOpenReport = New-Object System.Windows.Forms.CheckBox
$checkOpenReport.Text = "Ouvrir le rapport à la fin"
$checkOpenReport.Location = New-Object System.Drawing.Point(360, 25)
$checkOpenReport.Size = New-Object System.Drawing.Size(180, 20)
$checkOpenReport.Checked = $true
$checkOpenReport.ForeColor = [System.Drawing.Color]::White
$groupOptions.Controls.Add($checkOpenReport)

# ===============================================================================
# BOUTONS
# ===============================================================================

$btnLaunch = New-Object System.Windows.Forms.Button
$btnLaunch.Text = "🚀 Lancer l'Audit"
$btnLaunch.Location = New-Object System.Drawing.Point(20, 485)
$btnLaunch.Size = New-Object System.Drawing.Size(240, 45)
$btnLaunch.BackColor = [System.Drawing.Color]::FromArgb(0, 120, 215)
$btnLaunch.ForeColor = [System.Drawing.Color]::White
$btnLaunch.FlatStyle = "Flat"
$btnLaunch.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$btnLaunch.Cursor = [System.Windows.Forms.Cursors]::Hand
$form.Controls.Add($btnLaunch)

$btnOpenResults = New-Object System.Windows.Forms.Button
$btnOpenResults.Text = "📂 Ouvrir Résultats"
$btnOpenResults.Location = New-Object System.Drawing.Point(275, 485)
$btnOpenResults.Size = New-Object System.Drawing.Size(240, 45)
$btnOpenResults.BackColor = [System.Drawing.Color]::FromArgb(60, 60, 60)
$btnOpenResults.ForeColor = [System.Drawing.Color]::White
$btnOpenResults.FlatStyle = "Flat"
$btnOpenResults.Font = New-Object System.Drawing.Font("Segoe UI", 11)
$btnOpenResults.Cursor = [System.Windows.Forms.Cursors]::Hand
$form.Controls.Add($btnOpenResults)

# ===============================================================================
# BARRE DE STATUT
# ===============================================================================

$statusBar = New-Object System.Windows.Forms.Label
$statusBar.Text = "Prêt"
$statusBar.Location = New-Object System.Drawing.Point(20, 545)
$statusBar.Size = New-Object System.Drawing.Size(495, 25)
$statusBar.ForeColor = [System.Drawing.Color]::Gray
$form.Controls.Add($statusBar)

# ===============================================================================
# ACTIONS
# ===============================================================================

$btnLaunch.Add_Click({
    # Construire les arguments
    $auditArgs = @()
    
    # Target
    if ($radioFile.Checked) {
        $auditArgs += '-Target "file"'
        $auditArgs += "-Path `"$($textPath.Text)`""
    } elseif ($radioDir.Checked) {
        $auditArgs += '-Target "directory"'
        $auditArgs += "-Path `"$($textPath.Text)`""
    }
    
    # Phases
    if ($checkAll.Checked) {
        $auditArgs += '-Phases "all"'
    } else {
        $selectedPhases = ($phaseCheckboxes | Where-Object { $_.Checked } | ForEach-Object { $_.Tag }) -join ","
        if ($selectedPhases) {
            $auditArgs += "-Phases `"$selectedPhases`""
        } else {
            [System.Windows.Forms.MessageBox]::Show("Veuillez sélectionner au moins une phase.", "Erreur", "OK", "Warning")
            return
        }
    }
    
    # Options
    if ($checkVerbose.Checked) { $auditArgs += "-Verbose" }
    if ($checkQuiet.Checked) { $auditArgs += "-Quiet" }
    
    $statusBar.Text = "Lancement de l'audit..."
    $statusBar.ForeColor = [System.Drawing.Color]::Orange
    $form.Refresh()
    
    # Lancer l'audit dans une nouvelle fenêtre PowerShell
    $command = "& `"$AuditScript`" $($auditArgs -join ' ')"
    $process = Start-Process powershell.exe -ArgumentList "-NoExit", "-ExecutionPolicy Bypass", "-Command", $command -PassThru
    
    $statusBar.Text = "Audit en cours... (PID: $($process.Id))"
    $statusBar.ForeColor = [System.Drawing.Color]::FromArgb(0, 200, 100)
})

$btnOpenResults.Add_Click({
    # Ouvrir directement le resume IA (point d'entree unique)
    $aiSummaryPath = Join-Path $PSScriptRoot "resultats\AI-SUMMARY.md"
    if (Test-Path $aiSummaryPath) {
        Start-Process notepad.exe -ArgumentList $aiSummaryPath
        $statusBar.Text = "Resume IA ouvert dans Notepad"
        $statusBar.ForeColor = [System.Drawing.Color]::FromArgb(0, 200, 100)
    } else {
        # Fallback: ouvrir le dossier
        $resultsPath = Join-Path $PSScriptRoot "resultats"
        if (Test-Path $resultsPath) {
            Start-Process explorer.exe -ArgumentList $resultsPath
        } else {
            [System.Windows.Forms.MessageBox]::Show("Lancez d'abord un audit pour generer le resume IA.", "Information", "OK", "Information")
        }
    }
})

# ===============================================================================
# AFFICHER LA FENÊTRE
# ===============================================================================

[void]$form.ShowDialog()
