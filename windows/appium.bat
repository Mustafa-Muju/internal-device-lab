@echo off
setlocal enabledelayedexpansion

set MAX_RETRIES=5
set RETRY_COUNT=0

:try_start
if !RETRY_COUNT! GEQ %MAX_RETRIES% (
  echo Failed to start Appium after %MAX_RETRIES% attempts. Exiting.
  goto end
)

echo Starting Appium server... Attempt !RETRY_COUNT! + 1

REM Start Appium directly (no 'start' to avoid new window)
REM Using `start /b` would run in background but harder to check status here
appium -a 0.0.0.0 -p 4725 --allow-insecure chromedriver_autodownload --allow-cors

timeout /t 10 /nobreak >nul

REM Check if Appium is running by testing port 4725
netstat -ano | findstr ":4725" >nul
if errorlevel 1 (
  echo Appium server NOT detected running. Retrying...
  set /a RETRY_COUNT+=1
  goto try_start
) else (
  echo Appium server is running!
  goto end
)

:end
echo Done.
endlocal
