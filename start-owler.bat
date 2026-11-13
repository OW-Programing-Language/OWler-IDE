@echo off
cd /d "%~dp0"
where npm >nul 2>nul || (echo Install Node.js 22+ from nodejs.org & pause & exit /b 1)
if not exist node_modules call npm install
call npm run desktop
pause
