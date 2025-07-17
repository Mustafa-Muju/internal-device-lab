@echo off
setlocal

REM Get path of this script (windows folder)
set "SCRIPT_DIR=%~dp0"

REM Go one level up to reach the parent folder
set "ROOT_DIR=%SCRIPT_DIR%.."

REM Define path to Selenium JAR outside 'windows'
set "SELENIUM_JAR=%ROOT_DIR%\\selenium-server-4.34.0.jar"

REM Resolve full path and echo it
pushd %ROOT_DIR%
for %%f in ("%SELENIUM_JAR%") do set "SELENIUM_JAR=%%~ff"
popd

REM Check if JAR exists
if not exist "%SELENIUM_JAR%" (
    echo [ERROR] Selenium JAR not found: %SELENIUM_JAR%
    exit /b 1
)

echo [GRID] Starting Selenium Grid on ports 786...

REM Start Selenium Grid (both UI and event bus)
java -jar "%SELENIUM_JAR%" standalone --host localhost --port 786

endlocal
