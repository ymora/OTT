@{
    Id = "ott"
    Name = "OTT"
    Detect = {
        param([string]$ProjectRoot)

        $score = 0
        if (Test-Path (Join-Path $ProjectRoot "api.php")) { $score += 2 }
        if (Test-Path (Join-Path $ProjectRoot "api\handlers")) { $score += 1 }
        if (Test-Path (Join-Path $ProjectRoot "app")) { $score += 1 }
        if (Test-Path (Join-Path $ProjectRoot "public")) { $score += 1 }
        if (Test-Path (Join-Path $ProjectRoot "next.config.js")) { $score += 1 }

        return $score
    }
}
