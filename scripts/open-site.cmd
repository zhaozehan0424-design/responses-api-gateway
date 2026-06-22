@echo off
setlocal
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0open-site.ps1"
exit /b %ERRORLEVEL%
