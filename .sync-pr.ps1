$ErrorActionPreference = "Continue"
Set-Location "C:\Users\MMP\Downloads\ZYRAXON-AI-main"
$log = "C:\Users\MMP\Downloads\ZYRAXON-AI-main\.sync-pr.log"
"pr+merge started $(Get-Date -Format HH:mm:ss)" | Out-File $log -Encoding utf8

function Log($m) { $m | Out-File $log -Append -Encoding utf8 }

$rows = Get-Content ".sync-manifest.txt" | Where-Object { $_ -and $_.Trim() }

foreach ($row in $rows) {
  $parts = $row -split "`t"
  $branch = $parts[0].Trim()
  $commits = $parts[1].Trim()
  $title = $parts[2].Trim()

  $existing = (gh pr list --head $branch --state all --json number --jq '.[].number' 2>$null | Out-String).Trim()
  if (-not $existing) {
    $body = "Part of the full local-to-GitHub sync of the ZYRAXON working tree.`n`n- commits: $commits (about 55 files each)`n- branch: $branch`n`nThe local working tree is the source of truth. Build output (dist, out) stays untracked because the build regenerates it. The prebuilt packages vendored under packages/desktop/resources are tracked, because the app ships them.`n"
    $bodyFile = ".pr-body.md"
    [System.IO.File]::WriteAllText($bodyFile, $body)
    $url = (gh pr create --base main --head $branch --title $title --body-file $bodyFile 2>&1 | Out-String).Trim()
    Remove-Item $bodyFile -ErrorAction SilentlyContinue
    if ($url -match '/pull/(\d+)') {
      Log "PR #$($Matches[1])  $branch  ($commits)"
    }
    else {
      Log "CREATE-FAIL $branch :: $($url -replace '\s+',' ' | ForEach-Object { $_.Substring(0,[Math]::Min(160,$_.Length)) })"
      continue
    }
  }
  else {
    Log "existing PR #$existing  $branch"
  }

  # Merge commits are kept so every small commit stays visible on main.
  $merge = (gh pr merge $branch --merge --delete-branch=false 2>&1 | Out-String).Trim()
  Log "merge $branch exit=$LASTEXITCODE :: $($merge -replace '\s+',' ')"
}

git fetch origin --prune 2>&1 | Out-Null
Log "origin/main = $(git rev-parse origin/main)"
Log "DONE $(Get-Date -Format HH:mm:ss)"
