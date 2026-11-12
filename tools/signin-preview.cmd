@echo off
rem THE SIGN-IN PREVIEW IN ONE DOUBLE-CLICK: starts the installed Etiuda with ETIUDA_SIGNIN_PREVIEW=1 set for that one start
rem (shell/main.js signinPreviewing), from its default per-user place, else its default all-users place. Never packaged: the files
rem list in electron-builder.js holds no tools/ (tests/desk-signin.mjs ds12e). With --where it prints the program it would start, and
rem starts nothing.
setlocal
set "EXE=%LOCALAPPDATA%\Programs\Etiuda\Etiuda.exe"
if not exist "%EXE%" set "EXE=%ProgramFiles%\Etiuda\Etiuda.exe"
if not exist "%EXE%" echo Etiuda was not found in %LOCALAPPDATA%\Programs\Etiuda or in %ProgramFiles%\Etiuda.
if not exist "%EXE%" if /i not "%~1"=="--where" pause
if not exist "%EXE%" exit /b 1
if /i "%~1"=="--where" echo %EXE%
if /i "%~1"=="--where" exit /b 0
set "OPEN="
tasklist /fi "imagename eq Etiuda.exe" /nh 2>nul | find /i "Etiuda.exe" >nul && set "OPEN=1"
if defined OPEN echo Etiuda is open already, and a second start only brings it forward without the preview. Quit it, then run this again.
if defined OPEN pause
if defined OPEN exit /b 1
set "ETIUDA_SIGNIN_PREVIEW=1"
start "" "%EXE%"
endlocal
