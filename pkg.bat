@echo off
echo ==========================================
echo [LingoFlow] Starting Extension Build ^& Zip
echo ==========================================

REM Check if node_modules exists
if not exist "node_modules\" (
    echo [Error] node_modules not found. Running npm install...
    call npm install
)

echo [1/2] Building extension...
call npm run build

if %ERRORLEVEL% neq 0 (
    echo [Error] Build failed!
    pause
    exit /b %ERRORLEVEL%
)

echo [2/2] Creating ZIP package...
node zip.js

if %ERRORLEVEL% neq 0 (
    echo [Error] Packaging failed!
    pause
    exit /b %ERRORLEVEL%
)

echo ==========================================
echo [LingoFlow] All tasks completed successfully!
echo ==========================================
pause
