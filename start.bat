@echo off
title Online Attendance System
cd /d "%~dp0backend"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
echo Starting server on http://localhost:5000 ...
node server.js
pause
