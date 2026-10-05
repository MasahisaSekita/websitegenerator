@echo off
rem Starts the website generator: it builds the websites that dashboard Generate buttons ask for.
rem Leave this window open while you work. Close it or press Ctrl+C to stop.
setlocal
cd /d "%~dp0"
set PYTHONUTF8=1
set "PYEXE="
set "PYARG="
rem "python" and "py" can be Microsoft Store placeholders that only print "Python was not found".
if exist "%LOCALAPPDATA%\Python\bin\python.exe" set "PYEXE=%LOCALAPPDATA%\Python\bin\python.exe"
if not defined PYEXE py -3 -c "import sys" >nul 2>nul && (set "PYEXE=py" & set "PYARG=-3")
if not defined PYEXE python -c "import sys" >nul 2>nul && set "PYEXE=python"
if not defined PYEXE (
  echo Python 3 was not found. Install it from python.org, then try again.
  pause
  exit /b 1
)
"%PYEXE%" %PYARG% tools\site_runner.py doctor
echo.
echo Website generator running. Generate buttons in the dashboard are built here.
"%PYEXE%" %PYARG% tools\site_runner.py watch
if errorlevel 1 pause
