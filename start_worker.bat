@echo off
cd /d "%~dp0worker"
powershell -NoProfile -ExecutionPolicy Bypass -Command "npm install; node src/worker.js"
