@echo off
cd /d "%~dp0"
if not exist node_modules call npm install
set OW_BUNDLE_ZIG=1
call npm run package:desktop
if errorlevel 1 (echo Build failed. Install Rust, Maven, Git and full JDK 21 and check JAVA_HOME. & pause & exit /b 1)
echo.
echo Your installers are in src-tauri\target\release\bundle\
pause
