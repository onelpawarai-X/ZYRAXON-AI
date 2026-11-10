@echo off
title ZYRAXON System Initialization
color 0A
echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║        ZYRAXON SYSTEM INITIALIZATION            ║
echo  ║        Version 19.0.2                           ║
echo  ╚══════════════════════════════════════════════════╝
echo.

:: Create system directories
set ZYRAXON_HOME=%USERPROFILE%\.zyraxon
set ZYRAXON_DATA=%ZYRAXON_HOME%\data
set ZYRAXON_CONFIG=%ZYRAXON_HOME%\config
set ZYRAXON_CACHE=%ZYRAXON_HOME%\cache
set ZYRAXON_LOG=%ZYRAXON_HOME%\log

echo [1/8] Creating system directories...
if not exist "%ZYRAXON_HOME%" mkdir "%ZYRAXON_HOME%"
if not exist "%ZYRAXON_DATA%" mkdir "%ZYRAXON_DATA%"
if not exist "%ZYRAXON_CONFIG%" mkdir "%ZYRAXON_CONFIG%"
if not exist "%ZYRAXON_CACHE%" mkdir "%ZYRAXON_CACHE%"
if not exist "%ZYRAXON_LOG%" mkdir "%ZYRAXON_LOG%"
echo       Done.

:: Initialize system.dat (critical file - app depends on this)
echo [2/8] Initializing system.dat...
if not exist "%ZYRAXON_HOME%\system.dat" (
    echo {"initialized":true,"version":"19.0.2","created":%DATE% %TIME%,"status":"active"} > "%ZYRAXON_HOME%\system.dat"
    echo       system.dat created.
) else (
    echo       system.dat already exists.
)

:: Initialize subscription state (free tier by default)
echo [3/8] Initializing subscription...
if not exist "%ZYRAXON_HOME%\subscription.json" (
    echo {"tier":"free","activatedAt":null,"expiresAt":null,"secretCode":null,"stripeSessionId":null} > "%ZYRAXON_HOME%\subscription.json"
    echo       Subscription set to FREE tier.
) else (
    echo       Subscription file exists.
)

:: Initialize session store
echo [4/8] Initializing session store...
if not exist "%ZYRAXON_DATA%\sessions.json" echo [] > "%ZYRAXON_DATA%\sessions.json"
echo       Sessions initialized.

:: Initialize memory store
echo [5/8] Initializing memory store...
if not exist "%ZYRAXON_DATA%\memory.json" echo {"entries":[],"version":1} > "%ZYRAXON_DATA%\memory.json"
echo       Memory initialized.

:: Initialize config
echo [6/8] Initializing configuration...
if not exist "%ZYRAXON_CONFIG%\settings.json" (
    echo {"theme":"dark","language":"en","autoSave":true,"maxHistory":50} > "%ZYRAXON_CONFIG%\settings.json"
    echo       Default config created.
) else (
    echo       Config exists.
)

:: Clean temp files
echo [7/8] Cleaning temporary files...
if exist "%ZYRAXON_CACHE%\*.tmp" del /q "%ZYRAXON_CACHE%\*.tmp" 2>nul
if exist "%TEMP%\zyraxon_*" del /q "%TEMP%\zyraxon_*" 2>nul
echo       Temp cleaned.

:: Verify installation
echo [8/8] Verifying installation...
set "VALID=1"
if not exist "%ZYRAXON_HOME%\system.dat" set "VALID=0"
if not exist "%ZYRAXON_HOME%\subscription.json" set "VALID=0"
if not exist "%ZYRAXON_DATA%\memory.json" set "VALID=0"
if "%VALID%"=="1" (
    echo.
    echo  ╔══════════════════════════════════════════════════╗
    echo  ║   SYSTEM INITIALIZATION COMPLETE                ║
    echo  ║   All systems operational.                      ║
    echo  ╚══════════════════════════════════════════════════╝
    echo.
    echo  Home:     %ZYRAXON_HOME%
    echo  Data:     %ZYRAXON_DATA%
    echo  Config:   %ZYRAXON_CONFIG%
    echo  Log:      %ZYRAXON_LOG%
    echo.
) else (
    echo.
    echo  [ERROR] System initialization failed!
    echo  Some critical files could not be created.
    echo  Please run this script as Administrator.
    echo.
)
pause
