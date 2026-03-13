@echo off
cd /d "%~dp0"

REM Kill any old server on port 3000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING 2^>nul') do taskkill /PID %%a /F >nul 2>nul

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found. Install it from https://nodejs.org
    pause
    exit /b 1
)

echo Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo ERROR: npm install failed
    pause
    exit /b 1
)

echo.
echo Server starting at http://localhost:3000
echo Press Ctrl+C to stop
echo.
node server.js
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Server crashed (see above)
    pause
    exit /b 1
)
pause
