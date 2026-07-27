@echo off
setlocal
cd /d "%~dp0"
echo Installing SoleilCode...
call npm install
if errorlevel 1 goto :fail
call npm run build
if errorlevel 1 goto :fail
call npm link
if errorlevel 1 goto :fail
echo.
echo Installation complete.
echo Open CMD in any project directory and enter: soleil
echo Check your model setup first with: soleil doctor
exit /b 0

:fail
echo.
echo Installation failed. Review the error message above.
exit /b 1
