@echo off

title Running Hugo Document Server for Testing purposes

SET port=8080

rem Starting Hugo Server on port 8080
hugo.exe server -w --source documentation\ -p %port% --appendPort true -v --debug --minify

pause