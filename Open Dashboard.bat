@echo off
rem Windows equivalent of "Open Dashboard.command" - serves the dashboard on http://localhost:4310
setlocal
cd /d "%~dp0"
set PYTHONUTF8=1
where py >nul 2>nul
if %errorlevel%==0 (set "PY=py -3") else (set "PY=python")
echo Dashboard: http://localhost:4310  (close this window or press Ctrl+C to stop)
start "" /min cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:4310"
%PY% tools\control.py serve --port 4310
if errorlevel 1 pause
