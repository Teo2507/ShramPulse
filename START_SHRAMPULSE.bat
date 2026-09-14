@echo off
setlocal
cd /d "%~dp0"

echo ==============================================
echo          SHRAM PULSE - DEMO STARTER
echo ==============================================
echo.

echo Starting backend on http://localhost:5050 ...
start "ShramPulse Backend" cmd /k "cd /d "%~dp0backend" && if not exist node_modules npm install && npm start"

timeout /t 2 /nobreak >nul

echo Starting frontend with Vite ...
start "ShramPulse Frontend" cmd /k "cd /d "%~dp0frontend" && if not exist node_modules npm install && npm run dev"

echo.
echo Backend:  http://localhost:5050/api/health
echo Frontend: use the Local URL printed by Vite.
echo.
echo Keep both command windows open while demonstrating.
pause
