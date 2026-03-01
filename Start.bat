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
echo installs dependencies (if needed), prepares the Light model, and starts the app.
echo.
set /p "startPrompt=Press Enter to start setup..."
echo.

call :ensure_winget
if errorlevel 1 exit /b 1

call :ensure_node
if errorlevel 1 exit /b 1

call :ensure_ollama
if errorlevel 1 exit /b 1

call :install_npm_deps
if errorlevel 1 exit /b 1

call :start_ollama
if errorlevel 1 exit /b 1

call :ensure_light_model
if errorlevel 1 exit /b 1

if not exist ".env" (
  echo [INFO] Creating .env from .env.example...
  copy /Y ".env.example" ".env" >nul
)

echo [INFO] Starting LightAI server...
start "LightAI Server" cmd /c "cd /d ""%~dp0"" && npm start"

timeout /t 3 /nobreak >nul
echo [INFO] Opening browser...
start "" "http://localhost:3000"

echo [DONE] LightAI is launching.
exit /b 0

:ensure_winget
where winget >nul 2>&1
if errorlevel 1 (
  echo [ERROR] winget is required for automatic dependency install.
  echo [ERROR] Please install App Installer from Microsoft Store, then rerun Start.bat.
  exit /b 1
)
exit /b 0

:ensure_node
where node >nul 2>&1
if errorlevel 1 (
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

:ensure_ollama
where ollama >nul 2>&1
if errorlevel 1 (
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

:start_ollama
echo [INFO] Starting Ollama service...
start "Ollama Service" /min cmd /c "ollama serve"

echo [INFO] Waiting for Ollama API...
where curl >nul 2>&1
if errorlevel 1 (
  goto wait_ollama_powershell
)
set /a retries=0
:wait_ollama
curl -s "http://127.0.0.1:11434/api/tags" >nul 2>&1
if not errorlevel 1 exit /b 0
set /a retries+=1
if %retries% GEQ 23 (
  echo [ERROR] Ollama did not become ready in time.
  exit /b 1
)
timeout /t 2 /nobreak >nul
goto wait_ollama

:wait_ollama_powershell
set /a retries=0
:wait_ollama_ps_loop
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -Method Get | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 exit /b 0
set /a retries+=1
if %retries% GEQ 23 (
  echo [ERROR] Ollama did not become ready in time.
  exit /b 1
)
timeout /t 2 /nobreak >nul
goto wait_ollama_ps_loop
exit /b 0

:ensure_light_model
echo [INFO] Ensuring base model exists (llama3.1:8b)...
ollama pull llama3.1:8b
if errorlevel 1 (
  echo [ERROR] Failed to pull base model llama3.1:8b.
  exit /b 1
)

ollama show Light >nul 2>&1
if errorlevel 1 (
  echo [INFO] Creating Light model (v0.1) from Modelfile.light...
  ollama create Light -f "Modelfile.light"
  if errorlevel 1 (
    echo [ERROR] Failed to create Light model.
    exit /b 1
  )
) else (
  echo [INFO] Light model already exists.
)
exit /b 0
