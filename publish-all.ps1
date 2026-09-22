<#
.SYNOPSIS
    ZYRAXON AI — All-in-One Package Publisher
    Publishes all 12 @zyraxon-ai/* packages to npm in correct dependency order.

.DESCRIPTION
    This script:
    1. Resolves all catalog: and workspace:* references to real versions
    2. Removes "private": true from all packages
    3. Adds tsconfig.build.json where missing
    4. Compiles TypeScript to dist/
    5. Publishes each package to npm

.NOTES
    Run from the ZYRAXON-AI project root directory.
    Requires: Node.js, npm, TypeScript
    Author: OMG / Lx Sayidi (ZYRAXON AI)
#>

param(
    [string]$Version = "19.0.5",
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

function Resolve-CatalogDeps {
    param([string]$PackageDir)
    $pkgJson = Join-Path $PackageDir "package.json"
    $content = Get-Content $pkgJson -Raw
    $pkg = $content | ConvertFrom-Json

    # Catalog versions (from root package.json)
    $catalog = @{
        "effect"                    = "4.0.0-beta.83"
        "drizzle-orm"               = "1.0.0-rc.2"
        "drizzle-kit"               = "1.0.0-rc.2"
        "cross-spawn"               = "7.0.6"
        "zod"                       = "4.1.8"
        "diff"                      = "8.0.2"
        "typescript"                = "5.8.2"
        "@effect/opentelemetry"     = "4.0.0-beta.83"
        "@effect/platform-node"     = "4.0.0-beta.83"
        "@effect/sql-sqlite-bun"    = "4.0.0-beta.83"
        "@lydell/node-pty"          = "0.4.8"
        "@tsconfig/bun"             = "1.0.9"
        "@tsconfig/node22"          = "22.0.2"
        "@types/bun"                = "1.3.13"
        "@types/cross-spawn"        = "6.0.6"
        "@types/node"               = "24.12.2"
        "@types/semver"             = "7.7.1"
        "@typescript/native-preview" = "7.0.0-dev.20251207.1"
    }

    $changed = $false

    # Fix dependencies
    if ($pkg.dependencies) {
        $deps = @{}
        $pkg.dependencies.PSObject.Properties | ForEach-Object {
            $name = $_.Name
            $val = $_.Value
            if ($val -eq "catalog:") {
                if ($catalog.ContainsKey($name)) {
                    $deps[$name] = $catalog[$name]
                    $changed = $true
                } else {
                    $deps[$name] = $val
                    Write-Log "  WARNING: catalog key '$name' not found, keeping as-is" "Yellow"
                }
            } elseif ($val -eq "workspace:*") {
                $deps[$name] = "^$Version"
                $changed = $true
            } else {
                $deps[$name] = $val
            }
        }
        $pkg.dependencies = $deps
    }

    # Fix devDependencies
    if ($pkg.devDependencies) {
        $devDeps = @{}
        $pkg.devDependencies.PSObject.Properties | ForEach-Object {
            $name = $_.Name
            $val = $_.Value
            if ($val -eq "catalog:") {
                if ($catalog.ContainsKey($name)) {
                    $devDeps[$name] = $catalog[$name]
                    $changed = $true
                } else {
                    $devDeps[$name] = $val
                    Write-Log "  WARNING: catalog key '$name' not found in devDeps" "Yellow"
                }
            } elseif ($val -eq "workspace:*") {
                $devDeps[$name] = "^$Version"
                $changed = $true
            } else {
                $devDeps[$name] = $val
            }
        }
        $pkg.devDependencies = $devDeps
    }

    if ($changed) {
        $json = $pkg | ConvertTo-Json -Depth 10
        Set-Content -Path $pkgJson -Value $json -Encoding UTF8
        Write-Log "  Fixed catalog/workspace references" "Green"
    }
}

function Ensure-BuildConfig {
    param([string]$PackageDir)
    $tsconfigPath = Join-Path $PackageDir "tsconfig.build.json"
    $pkgJsonPath = Join-Path $PackageDir "package.json"
    $pkg = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json

    # Skip if already has tsconfig.build.json or doesn't need compilation
    if (Test-Path $tsconfigPath) { return }
    if (-not (Test-Path (Join-Path $PackageDir "src"))) { return }

    $tsconfig = @{
        '$schema' = "https://json.schemastore.org/tsconfig"
        compilerOptions = @{
            target = "ESNext"
            module = "ESNext"
            moduleResolution = "bundler"
            lib = @("ESNext", "DOM", "DOM.Iterable")
            outDir = "./dist"
            rootDir = "./src"
            declaration = $true
            declarationMap = $true
            sourceMap = $true
            skipLibCheck = $true
            noCheck = $true
            strict = $false
            esModuleInterop = $true
            forceConsistentCasingInFileNames = $true
            resolveJsonModule = $true
            isolatedModules = $true
        }
        include = @("src/**/*.ts")
        exclude = @("node_modules", "dist")
    }

    $tsconfig | ConvertTo-Json -Depth 5 | Set-Content -Path $tsconfigPath -Encoding UTF8
    Write-Log "  Created tsconfig.build.json" "Green"
}

function Ensure-PublishReady {
    param([string]$PackageDir)
    $pkgJsonPath = Join-Path $PackageDir "package.json"
    $pkg = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json
    $changed = $false

    # Remove private flag
    if ($pkg.PSObject.Properties['private']) {
        $pkg.PSObject.Properties.Remove('private')
        $changed = $true
    }

    # Set version
    if ($pkg.version -ne $Version) {
        $pkg.version = $Version
        $changed = $true
    }

    # Ensure exports point to dist/ if src/ files are referenced
    if ($pkg.exports) {
        $exports = $pkg.exports
        $exports.PSObject.Properties | ForEach-Object {
            $val = $_.Value
            if ($val -is [string] -and $val -like "./src/*") {
                $newVal = $val -replace '\.\/src\/', './dist/' -replace '\.ts$', '.js'
                $_.Value = $newVal
                $changed = $true
            }
        }
        $pkg.exports = $exports
    }

    # Ensure files array includes dist and README
    if ($pkg.PSObject.Properties['files']) {
        $files = @($pkg.files)
        if ($files -notcontains "dist") { $files += "dist"; $changed = $true }
        if ($files -notcontains "README.md") { $files += "README.md"; $changed = $true }
        $pkg.files = $files
    }

    # Add build script if missing
    if ($pkg.scripts -and -not $pkg.scripts.PSObject.Properties['build']) {
        if (Test-Path (Join-Path $PackageDir "src")) {
            $pkg.scripts | Add-Member -NotePropertyName "build" -NotePropertyValue "tsc --project tsconfig.build.json"
            $pkg.scripts | Add-Member -NotePropertyName "prepublishOnly" -NotePropertyValue "npm run build"
            $changed = $true
        }
    }

    if ($changed) {
        $json = $pkg | ConvertTo-Json -Depth 10
        Set-Content -Path $pkgJsonPath -Value $json -Encoding UTF8
    }
}

function Publish-Package {
    param(
        [string]$Name,
        [string]$Dir,
        [string[]]$DependsOn = @()
    )

    Write-Log ""
    Write-Log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "Cyan"
    Write-Log "  Publishing: $Name@$Version" "Cyan"
    Write-Log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "Cyan"

    $packageDir = Join-Path $ProjectRoot $Dir

    if (-not (Test-Path $packageDir)) {
        Write-Log "  SKIP: Directory not found: $Dir" "Yellow"
        return $false
    }

    # Check if already published
    try {
        $existing = npm view "$Name@$Version" version 2>$null
        if ($existing -eq $Version) {
            Write-Log "  ALREADY PUBLISHED: $Name@$Version" "Yellow"
            return $true
        }
    } catch {}

    # Step 1: Resolve catalog/workspace references
    Write-Log "  [1/5] Resolving dependencies..." "White"
    Resolve-CatalogDeps -PackageDir $packageDir

    # Step 2: Ensure publish-ready (version, exports, private flag)
    Write-Log "  [2/5] Preparing package.json..." "White"
    Ensure-PublishReady -PackageDir $packageDir

    # Step 3: Ensure tsconfig.build.json exists
    Write-Log "  [3/5] Checking build config..." "White"
    Ensure-BuildConfig -PackageDir $packageDir

    # Step 4: Clean old dist
    $distDir = Join-Path $packageDir "dist"
    if (Test-Path $distDir) {
        Remove-Item -Recurse -Force $distDir
    }

    # Step 5: Publish
    Write-Log "  [4/5] Publishing to npm..." "White"
    if ($DryRun) {
        Write-Log "  DRY RUN: Would publish $Name@$Version" "Magenta"
        return $true
    }

    Push-Location $packageDir
    try {
        $output = npm publish --access public 2>&1 | Out-String
        if ($LASTEXITCODE -eq 0) {
            Write-Log "  [5/5] SUCCESS: $Name@$Version published!" "Green"
            $true
        } else {
            Write-Log "  FAILED: $output" "Red"
            $false
        }
    } finally {
        Pop-Location
    }
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# MAIN
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     ZYRAXON AI — All-in-One Package Publisher            ║" -ForegroundColor Cyan
Write-Host "║     Version: $Version                                        ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

if ($DryRun) {
    Write-Log "DRY RUN MODE — no packages will be published" "Magenta"
}

# Clear log
"" | Set-Content -Path $LogFile -Encoding UTF8

$startTime = Get-Date

# Publish in dependency order
$packages = @(
    @{ Name = "@zyraxon-ai/schema";                 Dir = "packages/schema" },
    @{ Name = "@zyraxon-ai/http-recorder";          Dir = "packages/http-recorder" },
    @{ Name = "@zyraxon-ai/effect-drizzle-sqlite";  Dir = "packages/effect-drizzle-sqlite" },
    @{ Name = "@zyraxon-ai/effect-sqlite-node";     Dir = "packages/effect-sqlite-node" },
    @{ Name = "@zyraxon-ai/protocol";               Dir = "packages/protocol" },
    @{ Name = "@zyraxon-ai/llm";                    Dir = "packages/llm" },
    @{ Name = "@zyraxon-ai/sdk";                    Dir = "packages/sdk/js" },
    @{ Name = "@zyraxon-ai/plugin";                 Dir = "packages/plugin" },
    @{ Name = "@zyraxon-ai/core";                   Dir = "packages/core" },
    @{ Name = "@zyraxon-ai/client";                 Dir = "packages/client" },
    @{ Name = "@zyraxon-ai/server";                 Dir = "packages/server" },
    @{ Name = "@zyraxon-ai/sdk-next";               Dir = "packages/sdk-next" }
)

$results = @()
foreach ($pkg in $packages) {
    $ok = Publish-Package -Name $pkg.Name -Dir $pkg.Dir
    $results += @{ Name = $pkg.Name; Success = $ok }
}

# Summary
$endTime = Get-Date
$elapsed = $endTime - $startTime

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                    PUBLISH SUMMARY                        ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$successCount = 0
$failCount = 0

foreach ($r in $results) {
    if ($r.Success) {
        Write-Host "  ✓ $($r.Name)@$Version" -ForegroundColor Green
        $successCount++
    } else {
        Write-Host "  ✗ $($r.Name)@$Version" -ForegroundColor Red
        $failCount++
    }
}

Write-Host ""
Write-Host "  Total: $($results.Count) | Success: $successCount | Failed: $failCount" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Yellow" })
Write-Host "  Time: $($elapsed.TotalSeconds.ToString('F1'))s"
Write-Host "  Log: $LogFile"
Write-Host ""
