function Invoke-Check-FunctionalTests {
    param(
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,

        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )

    Write-Section "Tests Fonctionnels"

    if (-not $Results.Scores) {
        $Results.Scores = @{}
    }

    if (-not $Results.Recommendations) {
        $Results.Recommendations = @()
    }

    $Results.Recommendations += "Tests fonctionnels: aucun scénario générique n'est fourni. Ajouter des tests end-to-end spécifiques projet (ex: Playwright/Cypress, Postman/Newman, tests API dédiés) ou fournir une surcharge via audit/projects/<project>/modules/Checks-FunctionalTests.ps1."

    $Results.Scores["FunctionalTests"] = 10
    Write-OK "Module générique: aucun test fonctionnel exécuté (à surcharger par projet)."
}
