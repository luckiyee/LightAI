@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo --  _      ___   ____  _   _ _____   _    ___
echo -- ^| ^|    ^|_ _^| / ___^|^| ^| ^|_   _^| / \  ^|_ _^|
echo -- ^| ^|     ^| ^| ^| ^|  _ ^| ^|_^| ^| ^| ^|  / _ \  ^| ^|
echo -- ^| ^|___  ^| ^| ^| ^|_^| ^|  _  ^| ^| ^| / ___ \ ^| ^|
echo -- ^|_____^|^|___^| \____^|_^| ^|_^| ^|_^|/_/   \_\___^|
echo.
echo LightAI boots your local AI chat environment:
echo installs dependencies and starts the app.
echo Runtime uses Ollama via npm client (set OLLAMA_BASE_URL in .env).
echo.
set /p "startPrompt=Press Enter to start setup..."
echo.

call :ensure_winget
if errorlevel 1 exit /b 1

call :install_npm_deps
if errorlevel 1 exit /b 1

if not exist ".env" (
  echo [INFO] Creating .env from .env.example...
  copy /Y ".env.example" ".env" >nul
)

call :start_lightai_server
if errorlevel 1 exit /b 1

echo [INFO] Opening browser...
start "" "http://localhost:3000"

echo [DONE] LightAI is launching.
exit /b 0

:ensure_winget
call :ensure_node
exit /b %errorlevel%

:ensure_node
where node >nul 2>&1
if errorlevel 1 (
  where winget >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] Node.js is not installed and winget is unavailable.
    echo [ERROR] Install Node.js LTS manually, then rerun Start.bat.
    exit /b 1
  )
  echo [INFO] Node.js not found. Installing Node.js LTS...
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo [ERROR] Failed to install Node.js automatically.
    exit /b 1
  )
  if exist "%ProgramFiles%\nodejs" set "PATH=%PATH%;%ProgramFiles%\nodejs"
)
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js still not available in PATH. Open a new terminal and run Start.bat again.
  exit /b 1
)
exit /b 0

:install_npm_deps
if exist "node_modules" (
  echo [INFO] npm dependencies already installed.
  exit /b 0
)
echo [INFO] Installing npm dependencies...
npm install
if errorlevel 1 (
  echo [ERROR] npm install failed.
  exit /b 1
)
exit /b 0

:start_lightai_server
echo [INFO] Checking LightAI server status...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -Method Get -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 (
  echo [INFO] LightAI server is already running.
  exit /b 0
)

echo [INFO] Starting LightAI server...
start "LightAI Server" /min cmd /k "cd /d ""%~dp0"" && node ""server/index.js"""

set /a retries=0
:wait_lightai_server
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -Method Get -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 exit /b 0
set /a retries+=1
if !retries! GEQ 40 (
  echo [ERROR] LightAI server did not become ready in time.
  echo [ERROR] Check the 'LightAI Server' terminal window for details.
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto wait_lightai_server
