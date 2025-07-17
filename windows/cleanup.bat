@echo off
setlocal enabledelayedexpansion

REM Start adb daemon silently (no output)
adb start-server >nul 2>&1

echo Waiting for adb daemon to be ready...
set retries=0
:waitadb
adb devices | findstr /R /C:"device$" >nul
if errorlevel 1 (
  timeout /t 1 >nul
  set /a retries+=1
  if !retries! GEQ 10 (
    echo adb daemon not ready after 10 seconds, continuing anyway...
    goto continue
  )
  goto waitadb
)

:continue
echo [CLEANUP] Shutting down Android Emulators...
for /f "tokens=2 delims= " %%i in ('adb devices ^| findstr /r /c:"device$"') do (
    echo Killing emulator: %%i
    adb -s %%i emu kill
)

timeout /t 3 >nul

echo [CLEANUP] Closing Appium (port 4725)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":4725"') do (
    echo Killing PID on 4725: %%a
    taskkill /F /PID %%a >nul 2>&1
)

echo [CLEANUP] Closing Selenium Grid (ports 786 and 5555)...
for %%p in (786 5555) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%%p"') do (
        echo Killing PID on port %%p: %%a
        taskkill /F /PID %%a >nul 2>&1
    )
)

echo [CLEANUP] Done.
endlocal
