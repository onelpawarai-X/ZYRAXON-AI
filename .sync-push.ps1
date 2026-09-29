$ErrorActionPreference = "Continue"
Set-Location "C:\Users\MMP\Downloads\ZYRAXON-AI-main"
$log = "C:\Users\MMP\Downloads\ZYRAXON-AI-main\.sync-push.log"
"push started $(Get-Date -Format o)" | Out-File $log -Encoding utf8

$pending = @()
foreach ($b in (git branch --list "zyraxon/sync-*" --format="%(refname:short)")) {
  $r = git ls-remote origin "refs/heads/$b" 2>$null
  if (-not $r) { $pending += $b }
}
"pending: $($pending.Count) -> $($pending -join ' ')" | Out-File $log -Append -Encoding utf8

$refspecs = $pending | ForEach-Object { "${_}:$_" }
if ($refspecs.Count -gt 0) {
  # One push for every branch: git packs the shared objects once instead of
  # re-sending the same base tree for each branch separately.
  $args = @("push", "--no-verify", "--force", "origin") + $refspecs
  "running: git $($args -join ' ')" | Out-File $log -Append -Encoding utf8
  $out = & git @args 2>&1
  $code = $LASTEXITCODE
  $out | Out-File $log -Append -Encoding utf8
  "push exit code: $code  $(Get-Date -Format o)" | Out-File $log -Append -Encoding utf8
}

"verify on remote:" | Out-File $log -Append -Encoding utf8
foreach ($b in (git branch --list "zyraxon/sync-*" --format="%(refname:short)" | Sort-Object)) {
  $r = git ls-remote origin "refs/heads/$b" 2>$null
  if ($r) { "  pushed  $b" | Out-File $log -Append -Encoding utf8 } else { "  MISSING $b" | Out-File $log -Append -Encoding utf8 }
}
"DONE $(Get-Date -Format o)" | Out-File $log -Append -Encoding utf8
