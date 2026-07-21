@echo off
cd /d "%~dp0"
start "" "node_modules\.bin\electron.cmd" --disable-gpu .
