@echo off
setlocal
cd /d "%~dp0"
echo SoleilCode kuruluyor...
call npm install
if errorlevel 1 goto :fail
call npm run build
if errorlevel 1 goto :fail
call npm link
if errorlevel 1 goto :fail
echo.
echo Kurulum tamamlandi.
echo Herhangi bir proje klasorunde CMD acip soleil yazabilirsiniz.
echo Once sistemi kontrol etmek icin: soleil doctor
exit /b 0

:fail
echo.
echo Kurulum tamamlanamadi. Yukaridaki hata mesajini kontrol edin.
exit /b 1
