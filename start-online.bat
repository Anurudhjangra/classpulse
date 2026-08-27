@echo off
title ClassPulse - Online Mode
echo ============================================
echo  ClassPulse - Online Mode (Public Link)
echo ============================================
echo.

:: 1. Ensure MongoDB service is running
echo [1/3] Checking MongoDB service...
net start MongoDB >nul 2>&1
if errorlevel 1 ( echo  MongoDB already running or starting. ) else ( echo  MongoDB started. )

:: 2. Start server if not already running
echo [2/3] Starting server on http://localhost:5000 ...
cd /d "%~dp0backend"
if not exist node_modules (
  echo  Installing dependencies...
  call npm install
)
netstat -ano | findstr ":5000 " | findstr "LISTENING" >nul
if errorlevel 1 (
  start "ClassPulse Server" cmd /k node server.js
  echo  Server started.
) else (
  echo  Server already running on port 5000.
)
cd /d "%~dp0"

:: 3. Open the local app in browser
start "" http://localhost:5000

:: 4. Start public tunnel if not already running
echo [3/3] Checking public tunnel...
tasklist /FI "IMAGENAME eq cloudflared.exe" 2>nul | findstr /I "cloudflared" >nul
if errorlevel 1 (
  echo  Starting public tunnel...
  echo.
  echo  Waiting for your public link (may take ~15 sec)...
  echo  Jab "your quick Tunnel has been created" dikhe, uske
  echo  upar wala https:// URL copy karo - wahi public link hai.
  echo.
  echo  IMPORTANT: Ye window band mat karna.
  echo.
  "%LOCALAPPDATA%\Programs\cloudflared\cloudflared.exe" tunnel --url http://localhost:5000 --no-autoupdate
) else (
  echo  Tunnel already running.
  echo  (Public link tab tak kaam karega jab tak cloudflared chalta hai.)
  echo.
  pause
)
