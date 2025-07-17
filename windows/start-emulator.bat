@echo off
setlocal

REM Android SDK path
set "ANDROID_SDK=C:\Users\%USERNAME%\AppData\Local\Android\Sdk"

REM Your AVD name
set "AVD_NAME=Pixel_8"

REM Log file for emulator output
set "LOG_FILE=emulator.log"

set "EMULATOR_PATH=%ANDROID_SDK%\emulator\emulator.exe"
set "ADB_PATH=%ANDROID_SDK%\platform-tools\adb.exe"

echo Starting emulator...

REM Launch emulator without blocking batch execution and redirect output to log
"%EMULATOR_PATH%" -avd %AVD_NAME% -netdelay none -netspeed full -no-snapshot-load

echo Waiting for emulator to start booting...

:wait_for_boot
set "BOOT_COMPLETED="
for /f "tokens=*" %%a in ('"%ADB_PATH%" shell getprop sys.boot_completed 2^>nul') do (
  set "BOOT_COMPLETED=%%a"
)

if "%BOOT_COMPLETED%"=="1" (
  echo Emulator fully booted!
  goto after_boot
) else (
  timeout /t 5 /nobreak >nul
  echo Waiting for boot...
  goto wait_for_boot
)

:after_boot
echo Emulator is ready to use!
endlocal
