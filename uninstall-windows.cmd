@echo off
setlocal
cd /d "%~dp0"
call npm unlink -g soleilcode
echo SoleilCode genel CMD komutu kaldirildi. Proje dosyalari silinmedi.
