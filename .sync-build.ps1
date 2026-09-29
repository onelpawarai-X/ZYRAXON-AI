$ErrorActionPreference = "Continue"
Set-Location "C:\Users\MMP\Downloads\ZYRAXON-AI-main"
$log = "C:\Users\MMP\Downloads\ZYRAXON-AI-main\.sync-build.log"
"build started $(Get-Date -Format HH:mm:ss)" | Out-File $log -Encoding utf8

git symbolic-ref HEAD refs/heads/zyraxon/full-sync 2>&1 | Out-Null
foreach ($x in (git branch --list "zyraxon/sync-*" --format="%(refname:short)")) { git branch -D $x 2>&1 | Out-Null }

$out = (bun run scripts/full-sync.ts --no-push 2>&1 | Out-String)
$out | Out-File $log -Append -Encoding utf8
"build exit=$LASTEXITCODE $(Get-Date -Format HH:mm:ss)" | Out-File $log -Append -Encoding utf8

foreach ($x in @("zyraxon/sync-01","zyraxon/sync-13","zyraxon/sync-25")) {
  $mb = (git merge-base origin/main $x 2>&1 | Out-String).Trim()
  $c = (git rev-list --count "origin/main..$x" 2>&1 | Out-String).Trim()
  "$x merge-base=$mb commits=$c" | Out-File $log -Append -Encoding utf8
}
"DONE $(Get-Date -Format HH:mm:ss)" | Out-File $log -Append -Encoding utf8
