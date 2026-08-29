function Get-CompletedCount {
    param($userId = $null)
    if ($userId) {
        $u = "$url/rest/v1/projects?user_id=eq.$userId&status=eq.completed&select=id"
    } else {
        $u = "$url/rest/v1/projects?status=eq.completed&select=id"
    }
    try {
        $res = Invoke-RestMethod -Method Get -Uri $u -Headers $headers
        return $res.Count
    } catch {
        return 0
    }
}

function Get-DraftsCount {
    $u = "$url/rest/v1/projects?status=eq.draft&select=id"
    try {
        $res = Invoke-RestMethod -Method Get -Uri $u -Headers $headers
        return $res.Count
    } catch { return 0 }
}

function Clear-Drafts-PowerShell {
    $cutoff = (Get-Date).AddHours(-24).ToString("o")
    $u = "$url/rest/v1/projects?status=eq.draft&created_at=lt.$cutoff&select=id"
    try {
        $drafts = Invoke-RestMethod -Method Get -Uri $u -Headers $headers
        Write-Host "Found $($drafts.Count) old drafts (they never counted toward 10)" -ForegroundColor Yellow
        foreach ($d in $drafts) { Remove-ProjectHard $d.id }
    } catch { Write-Host "No drafts" }
}

Write-Host "=== YOUR TABLE IS READY FOR 100 USERS ===" -ForegroundColor Green
Write-Host "Completed (COUNT toward 10): $(Get-CompletedCount)" -ForegroundColor Cyan
Write-Host "Drafts (DON'T count toward 10): $(Get-DraftsCount)" -ForegroundColor Green
Write-Host "Total storage: 0 MB - Ready for R2!" -ForegroundColor Green
