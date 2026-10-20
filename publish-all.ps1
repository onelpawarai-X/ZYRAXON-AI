# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

<#
.SYNOPSIS
    ZYRAXON AI - All-in-One Package Publisher
    Publishes all 12 @zyraxon-ai/* packages to npm in dependency order.

.DESCRIPTION
    For each package this script:
      1. Resolves catalog: and workspace:* references to real versions
         (the catalog is read from the root package.json, never hardcoded)
      2. Drops "private", sets the version, rewrites exports to ./dist
      3. Compiles TypeScript to dist/ with tsc  (no bun required)
      4. Publishes to npm with --access public

    Every file it touches is restored in a finally block, so the working tree
    is left exactly as it was found. The repo's exports point at ./src on
    purpose - that is how Bun consumes the monorepo - so the rewrite is only
    ever temporary.

.NOTES
    Run from the ZYRAXON-AI project root directory.
    Requires: Node.js, npm, TypeScript. Bun is NOT required.
    Author: OMG / Lx Sayidi (ZYRAXON AI)
#>

param(
    [string]$Version = "19.0.6",
    [string]$NpmToken = "",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$LogFile = Join-Path $ProjectRoot "publish-log.txt"

function Write-Log {
    param([string]$Message, [string]$Color = "White")
    $timestamp = Get-Date -Format "HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage -ForegroundColor $Color
    Add-Content -Path $LogFile -Value $logMessage
}

# Read the root workspace catalog once. Adding a dependency to the catalog is
# then enough for it to resolve here too.
function Get-Catalog {
    $root = Get-Content (Join-Path $ProjectRoot "package.json") -Raw | ConvertFrom-Json
    $catalog = @{}
    $root.workspaces.catalog.PSObject.Properties | ForEach-Object {
        $catalog[$_.Name] = $_.Value
    }
    return $catalog
}

$Catalog = Get-Catalog

function Resolve-CatalogDeps {
    param([string]$PackageDir)

    $pkgJson = Join-Path $PackageDir "package.json"
    $pkg = Get-Content $pkgJson -Raw | ConvertFrom-Json
    $changed = $false

    foreach ($section in @("dependencies", "devDependencies", "peerDependencies")) {
        if (-not $pkg.PSObject.Properties[$section]) { continue }
        $table = @{}
        $pkg.$section.PSObject.Properties | ForEach-Object {
            $name = $_.Name
            $val = $_.Value
            if ($val -eq "catalog:") {
                if ($Catalog.ContainsKey($name)) {
                    $table[$name] = $Catalog[$name]
                    $changed = $true
                } else {
                    $table[$name] = $val
                    Write-Log "  WARNING: catalog key '$name' not found, keeping as-is" "Yellow"
                }
            } elseif ($val -eq "workspace:*") {
                $table[$name] = "^$Version"
                $changed = $true
            } else {
                $table[$name] = $val
            }
        }
        $pkg.$section = $table
    }

    if ($changed) {
        Set-Content -Path $pkgJson -Value ($pkg | ConvertTo-Json -Depth 20) -Encoding UTF8
        Write-Log "  Fixed catalog/workspace references" "Green"
    }
}

function Convert-ExportValue {
    param($Value)
    if ($Value -is [string] -and $Value -like "./src/*") {
        $stem = $Value.Substring(6)          # drop "./src/"
        if ($stem.EndsWith(".ts")) { $stem = $stem.Substring(0, $stem.Length - 3) }
        return [ordered]@{ types = "./dist/$stem.d.ts"; default = "./dist/$stem.js" }
    }
    return $Value
}

function Ensure-PublishReady {
    param([string]$PackageDir)

    $pkgJsonPath = Join-Path $PackageDir "package.json"
    $pkg = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json
    $changed = $false

    if ($pkg.PSObject.Properties['private']) {
        $pkg.PSObject.Properties.Remove('private')
        $changed = $true
    }

    if ($pkg.version -ne $Version) {
        $pkg | Add-Member -NotePropertyName version -NotePropertyValue $Version -Force
        $changed = $true
    }

    # main/types so classic resolvers find the compiled entry.
    $pkg | Add-Member -NotePropertyName main -NotePropertyValue "./dist/index.js" -Force
    $pkg | Add-Member -NotePropertyName types -NotePropertyValue "./dist/index.d.ts" -Force

    if ($pkg.exports) {
        $exports = [ordered]@{}
        $pkg.exports.PSObject.Properties | ForEach-Object {
            $exports[$_.Name] = Convert-ExportValue $_.Value
        }
        $pkg.exports = $exports
        $changed = $true
    }

    if ($pkg.PSObject.Properties['files']) {
        $files = @($pkg.files)
        if ($files -notcontains "dist") { $files += "dist"; $changed = $true }
        $pkg.files = $files
    } else {
        $pkg | Add-Member -NotePropertyName files -NotePropertyValue @("dist") -Force
        $changed = $true
    }

    if ($pkg.scripts -and -not $pkg.scripts.PSObject.Properties['build']) {
        $pkg.scripts | Add-Member -NotePropertyName build -NotePropertyValue "tsc --project tsconfig.build.json"
        $changed = $true
    }
    if ($pkg.scripts) {
        $pkg.scripts | Add-Member -NotePropertyName prepublishOnly -NotePropertyValue "npm run build" -Force
    }

    if ($changed) {
        Set-Content -Path $pkgJsonPath -Value ($pkg | ConvertTo-Json -Depth 20) -Encoding UTF8
    }
}

function Ensure-BuildConfig {
    param([string]$PackageDir)

    $tsconfigPath = Join-Path $PackageDir "tsconfig.build.json"
    if (Test-Path $tsconfigPath) { return $false }
    if (-not (Test-Path (Join-Path $PackageDir "src"))) { return $false }

    $tsconfig = [ordered]@{
        '$schema'       = "https://json.schemastore.org/tsconfig"
        compilerOptions = [ordered]@{
            target                           = "ESNext"
            module                           = "ESNext"
            moduleResolution                 = "bundler"
            lib                              = @("ESNext", "DOM", "DOM.Iterable")
            outDir                           = "./dist"
            rootDir                          = "./src"
            declaration                      = $true
            declarationMap                   = $true
            sourceMap                        = $true
            skipLibCheck                     = $true
            noCheck                          = $true
            strict                           = $false
            esModuleInterop                  = $true
            forceConsistentCasingInFileNames = $true
            resolveJsonModule                = $true
            isolatedModules                  = $true
        }
        include         = @("src/**/*.ts")
        exclude         = @("node_modules", "dist")
    }

    $tsconfig | ConvertTo-Json -Depth 5 | Set-Content -Path $tsconfigPath -Encoding UTF8
    Write-Log "  Created tsconfig.build.json" "Green"
    return $true
}

# protocol: makeDefaultApi lost its explicit return type, so tsc cannot
# serialize the inferred type into api.d.ts (TS7056). Restoring the annotation
# the package shipped with in 19.0.5 fixes declaration emit.
function Apply-BuildPatches {
    param([string]$Name, [string]$PackageDir)

    if ($Name -ne "@zyraxon-ai/protocol") { return }

    $apiPath = Join-Path $PackageDir "src/api.ts"
    if (-not (Test-Path $apiPath)) { return }
    $text = Get-Content $apiPath -Raw

    $old = @'
export const makeDefaultApi = <
  LocationId extends HttpApiMiddleware.AnyId,
  LocationService,
  SessionLocationId extends HttpApiMiddleware.AnyId,
  SessionLocationService,
>(options: {
  readonly locationMiddleware: Context.Key<LocationId, LocationService>
  readonly sessionLocationMiddleware: Context.Key<SessionLocationId, SessionLocationService>
}) => makeApiFromGroup(EventGroup, options.locationMiddleware, options.sessionLocationMiddleware)
'@

    $new = @'
export const makeDefaultApi: <
  LocationId extends HttpApiMiddleware.AnyId,
  LocationService,
  SessionLocationId extends HttpApiMiddleware.AnyId,
  SessionLocationService,
>(options: {
  readonly locationMiddleware: Context.Key<LocationId, LocationService>
  readonly sessionLocationMiddleware: Context.Key<SessionLocationId, SessionLocationService>
}) => ReturnType<typeof makeApiFromGroup> = <
  LocationId extends HttpApiMiddleware.AnyId,
  LocationService,
  SessionLocationId extends HttpApiMiddleware.AnyId,
  SessionLocationService,
>(options: {
  readonly locationMiddleware: Context.Key<LocationId, LocationService>
  readonly sessionLocationMiddleware: Context.Key<SessionLocationId, SessionLocationService>
}) => makeApiFromGroup(EventGroup, options.locationMiddleware, options.sessionLocationMiddleware)
'@

    if ($text.Contains($new)) {
        Write-Log "  build patch already applied: src/api.ts" "Green"
        return
    }
    if (-not $text.Contains($old)) {
        Write-Log "  WARNING: build patch target not found in src/api.ts" "Yellow"
        return
    }
    Set-Content -Path $apiPath -Value $text.Replace($old, $new) -Encoding UTF8
    Write-Log "  applied build patch: src/api.ts" "Green"
}

function Publish-Package {
    param(
        [string]$Name,
        [string]$Dir,
        [string]$PackageDir
    )

    Write-Log ""
    Write-Log "-----------------------------------------------" "Cyan"
    Write-Log "  Publishing: $Name@$Version" "Cyan"
    Write-Log "-----------------------------------------------" "Cyan"

    if (-not (Test-Path $PackageDir)) {
        Write-Log "  SKIP: Directory not found: $Dir" "Yellow"
        return $true
    }

    try {
        $existing = npm view "$Name@$Version" version 2>$null
        if ($existing -eq $Version) {
            Write-Log "  ALREADY PUBLISHED: $Name@$Version" "Yellow"
            return $true
        }
    } catch {}

    # Snapshot everything this may change, and restore it in the finally block.
    $pkgJson = Join-Path $PackageDir "package.json"
    $apiJson = Join-Path $PackageDir "src/api.ts"
    $backup = @{
        pkg     = Get-Content $pkgJson -Raw
        api     = if (Test-Path $apiJson) { Get-Content $apiJson -Raw } else { $null }
        created = $false
    }
    $tsconfigPath = Join-Path $PackageDir "tsconfig.build.json"

    try {
        Write-Log "  [1/5] Resolving dependencies..." "White"
        Resolve-CatalogDeps -PackageDir $PackageDir

        Write-Log "  [2/5] Preparing package.json..." "White"
        Ensure-PublishReady -PackageDir $PackageDir

        Write-Log "  [3/5] Checking build config..." "White"
        $backup.created = Ensure-BuildConfig -PackageDir $PackageDir

        Write-Log "  [4/5] Applying build patches..." "White"
        Apply-BuildPatches -Name $Name -PackageDir $PackageDir

        $distDir = Join-Path $PackageDir "dist"
        if (Test-Path $distDir) { Remove-Item -Recurse -Force $distDir }

        Write-Log "  [4/5] Compiling with tsc..." "White"
        Push-Location $PackageDir
        try {
            $buildOutput = npm run build 2>&1 | Out-String
            if ($LASTEXITCODE -ne 0) {
                Write-Log "  FAILED: build`n$buildOutput" "Red"
                return $false
            }
        } finally {
            Pop-Location
        }

        if (-not (Test-Path $distDir) -or -not (Get-ChildItem $distDir -ErrorAction SilentlyContinue)) {
            Write-Log "  FAILED: build produced no dist output" "Red"
            return $false
        }

        if ($DryRun) {
            Write-Log "  DRY RUN: built $((Get-ChildItem $distDir -Recurse).Count) files" "Magenta"
            return $true
        }

        Write-Log "  [5/5] Publishing to npm..." "White"
        Push-Location $PackageDir
        try {
            $output = npm publish --access public --tag latest 2>&1 | Out-String
            if ($LASTEXITCODE -eq 0) {
                Write-Log "  SUCCESS: $Name@$Version published!" "Green"
                return $true
            }
            Write-Log "  FAILED: $output" "Red"
            return $false
        } finally {
            Pop-Location
        }
    } finally {
        # Restore the working tree. This is why the script is safe to run on a
        # checkout that Bun and the desktop builds depend on.
        Set-Content -Path $pkgJson -Value $backup.pkg -Encoding UTF8 -NoNewline
        if ($null -ne $backup.api) {
            Set-Content -Path $apiJson -Value $backup.api -Encoding UTF8 -NoNewline
        }
        if ($backup.created) {
            Remove-Item -Force $tsconfigPath -ErrorAction SilentlyContinue
        }
    }
}

# ----------------------------------------------------------------
# MAIN
# ----------------------------------------------------------------

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "     ZYRAXON AI - All-in-One Package Publisher" -ForegroundColor Cyan
Write-Host "     Version: $Version" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

if ($DryRun) { Write-Log "DRY RUN MODE - no packages will be published" "Magenta" }
if ($NpmToken) { $env:NODE_AUTH_TOKEN = $NpmToken }

"" | Set-Content -Path $LogFile -Encoding UTF8
$startTime = Get-Date

# Dependency order: a package is only published after everything it imports.
$packages = @(
    @{ Name = "@zyraxon-ai/schema";                Dir = "packages/schema" },
    @{ Name = "@zyraxon-ai/http-recorder";         Dir = "packages/http-recorder" },
    @{ Name = "@zyraxon-ai/effect-drizzle-sqlite"; Dir = "packages/effect-drizzle-sqlite" },
    @{ Name = "@zyraxon-ai/effect-sqlite-node";    Dir = "packages/effect-sqlite-node" },
    @{ Name = "@zyraxon-ai/protocol";              Dir = "packages/protocol" },
    @{ Name = "@zyraxon-ai/llm";                   Dir = "packages/llm" },
    @{ Name = "@zyraxon-ai/sdk";                   Dir = "packages/sdk/js" },
    @{ Name = "@zyraxon-ai/plugin";                Dir = "packages/plugin" },
    @{ Name = "@zyraxon-ai/core";                  Dir = "packages/core" },
    @{ Name = "@zyraxon-ai/client";                Dir = "packages/client" },
    @{ Name = "@zyraxon-ai/server";                Dir = "packages/server" },
    @{ Name = "@zyraxon-ai/sdk-next";              Dir = "packages/sdk-next" }
)

$results = @()
foreach ($pkg in $packages) {
    $packageDir = Join-Path $ProjectRoot $pkg.Dir
    $ok = Publish-Package -Name $pkg.Name -Dir $pkg.Dir -PackageDir $packageDir
    $results += @{ Name = $pkg.Name; Success = $ok }
}

$elapsed = (Get-Date) - $startTime

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "                PUBLISH SUMMARY" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

$successCount = 0
$failCount = 0
foreach ($r in $results) {
    if ($r.Success) {
        Write-Host "  OK   $($r.Name)@$Version" -ForegroundColor Green
        $successCount++
    } else {
        Write-Host "  FAIL $($r.Name)@$Version" -ForegroundColor Red
        $failCount++
    }
}

Write-Host ""
Write-Host "  Total: $($results.Count) | Success: $successCount | Failed: $failCount" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Yellow" })
Write-Host "  Time: $($elapsed.TotalSeconds.ToString('F1'))s"
Write-Host "  Log: $LogFile"
Write-Host ""
