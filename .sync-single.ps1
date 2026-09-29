$ErrorActionPreference = "Continue"
Set-Location "C:\Users\MMP\Downloads\ZYRAXON-AI-main"
$log = "C:\Users\MMP\Downloads\ZYRAXON-AI-main\.sync-single.log"
function Log($m) { ((Get-Date -Format HH:mm:ss) + "  " + $m) | Out-File $log -Append -Encoding utf8 }
"single-commit sync started $(Get-Date -Format HH:mm:ss)" | Out-File $log -Encoding utf8

$out = (bun run scripts/full-sync-single.ts --push --merge 2>&1 | Out-String)
$out | Out-File $log -Append -Encoding utf8
"exit=$LASTEXITCODE $(Get-Date -Format HH:mm:ss)" | Out-File $log -Append -Encoding utf8
"DONE $(Get-Date -Format HH:mm:ss)" | Out-File $log -Append -Encoding utf8
