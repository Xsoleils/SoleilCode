@echo off
setlocal
cd /d "%~dp0"
call npm unlink -g soleilcode
echo The global SoleilCode command was removed. Project files were not deleted.
