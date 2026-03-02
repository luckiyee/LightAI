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
echo installs dependencies, verifies models, and starts the app.
echo Runtime uses Ollama with required local models.
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

call :ensure_ollama
if errorlevel 1 exit /b 1

call :start_ollama
if errorlevel 1 exit /b 1

call :ensure_required_models
if errorlevel 1 exit /b 1

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

:ensure_ollama
where ollama >nul 2>&1
if errorlevel 1 (
  where winget >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] Ollama is not installed and winget is unavailable.
    echo [ERROR] Install Ollama manually, then rerun Start.bat.
    exit /b 1
  )
  echo [INFO] Ollama not found. Installing Ollama...
  winget install -e --id Ollama.Ollama --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo [ERROR] Failed to install Ollama automatically.
    exit /b 1
  )
  if exist "%LocalAppData%\Programs\Ollama" set "PATH=%PATH%;%LocalAppData%\Programs\Ollama"
  if exist "%ProgramFiles%\Ollama" set "PATH=%PATH%;%ProgramFiles%\Ollama"
)
where ollama >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Ollama still not available in PATH. Open a new terminal and run Start.bat again.
  exit /b 1
)
exit /b 0

:start_ollama
echo [INFO] Checking Ollama service status...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -Method Get -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 (
  echo [INFO] Ollama service already running.
  exit /b 0
)

echo [INFO] Starting Ollama service...
start "Ollama Service" /min cmd /c "ollama serve"

set /a retries=0
:wait_ollama_service
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -Method Get -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 exit /b 0
set /a retries+=1
if !retries! GEQ 40 (
  echo [ERROR] Ollama service did not become ready in time.
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto wait_ollama_service

:ensure_required_models
echo [INFO] Verifying required models...

ollama show qwen2.5:3b >nul 2>&1
if errorlevel 1 (
  echo [INFO] Model qwen2.5:3b missing. Downloading...
  ollama pull qwen2.5:3b
  if errorlevel 1 (
    echo [ERROR] Failed to download qwen2.5:3b.
    exit /b 1
  )
) else (
  echo [INFO] Model qwen2.5:3b is already present.
)

ollama show llama3.1:8b >nul 2>&1
if errorlevel 1 (
  echo [INFO] Model llama3.1:8b missing. Downloading...
  ollama pull llama3.1:8b
  if errorlevel 1 (
    echo [ERROR] Failed to download llama3.1:8b.
    exit /b 1
  )
) else (
  echo [INFO] Model llama3.1:8b is already present.
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
