Set-Location "C:\Users\MMP\Downloads\ZYRAXON-AI-main"
$log = "C:\Users\MMP\Downloads\ZYRAXON-AI-main\.sync-final.log"
"final sync started $(Get-Date -Format HH:mm:ss)" | Out-File $log -Encoding utf8
(Get-Content "C:\Users\MMP\Downloads\ZYRAXON-AI-main\.sync-final.ps1.out" -ErrorAction SilentlyContinue) | Out-Null
bun run scripts/sync-final.ts 2>&1 | Out-File $log -Append -Encoding utf8
"exit=$LASTEXITCODE $(Get-Date -Format HH:mm:ss)" | Out-File $log -Append -Encoding utf8
"DONE $(Get-Date -Format HH:mm:ss)" | Out-File $log -Append -Encoding utf8
