@echo off
cd /d "%~dp0"
python run_tests.py
if errorlevel 1 (
    echo.
    echo The framework exited with an error. Review the message above.
)
pause
