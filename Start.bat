@echo off
setlocal
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

if exist "node_modules" (
  echo [INFO] npm dependencies already installed.
) else (
  echo [INFO] Installing npm dependencies...
  npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    exit /b 1
  )
)

if not exist ".env" (
  echo [INFO] Creating .env from .env.example...
  copy /Y ".env.example" ".env" >nul
)

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

node -e "fetch('http://127.0.0.1:11434/api/tags').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >nul 2>&1
if errorlevel 1 (
  echo [INFO] Starting Ollama service...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -WindowStyle Minimized -FilePath 'ollama' -ArgumentList 'serve'"
  timeout /t 3 /nobreak >nul
) else (
  echo [INFO] Ollama service already running.
)

echo [INFO] Verifying required models...

ollama show qwen2.5:3b >nul 2>&1
if errorlevel 1 (
  echo [INFO] Downloading qwen2.5:3b... (this may take a few minutes)
  ollama pull qwen2.5:3b >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] Failed to download qwen2.5:3b.
    echo [ERROR] If this is your first run, execute: ollama signin
    exit /b 1
  )
  echo [INFO] qwen2.5:3b ready.
) else (
  echo [INFO] Model qwen2.5:3b is already present.
)

ollama show llama3.1:8b >nul 2>&1
if errorlevel 1 (
  echo [INFO] Downloading llama3.1:8b... (this may take a few minutes)
  ollama pull llama3.1:8b >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] Failed to download llama3.1:8b.
    echo [ERROR] If this is your first run, execute: ollama signin
    exit /b 1
  )
  echo [INFO] llama3.1:8b ready.
) else (
  echo [INFO] Model llama3.1:8b is already present.
)

node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >nul 2>&1
if errorlevel 1 (
  echo [INFO] Starting LightAI server...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -WindowStyle Minimized -WorkingDirectory '%~dp0' -FilePath 'node' -ArgumentList 'server/index.js'"
  timeout /t 2 /nobreak >nul
) else (
  echo [INFO] LightAI server already running.
)

echo [INFO] Opening browser...
start "" "http://localhost:3000"
echo [DONE] LightAI is launching.
exit /b 0
