@echo off
rem Double-click to open the London Travel Geek database viewer in your browser.
cd /d "%~dp0"
if not exist "work\node_modules\pg" (
  echo Installing the database library, this happens once...
  call npm install --prefix work pg
)
node scripts\db\viewer\server.mjs --open
echo.
echo The viewer has stopped. Press any key to close this window.
pause >nul
