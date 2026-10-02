@echo off
rem Windows equivalent of ./website - generates a site from the prepared template.
rem Usage: website.bat --name "Business" --phone "+45 12 34 56 78" --email "hello@business.com" --theme-color "#2563eb"
setlocal
cd /d "%~dp0"
set PYTHONUTF8=1
where py >nul 2>nul
if %errorlevel%==0 (set "PY=py -3") else (set "PY=python")
%PY% tools\quick_site.py create %*
exit /b %errorlevel%
