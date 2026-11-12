@echo off
rem THE SIGN-IN FROM A DEVELOPMENT TREE: starts this tree's own Electron, never the installed Etiuda, with ETIUDA_SIGNIN_LAB naming
rem the lab file given as the argument for that one start (shell/main.js signinLabRead), and a profile of its own under
rem %LOCALAPPDATA%\Etiuda-signin-staging, so the desk in daily use is untouched. Where the file fills Google's client id, Google's
rem client secret comes from ETIUDA_GOOGLE_CLIENT_SECRET in this start's environment. Never packaged: the files list in
rem electron-builder.js holds no tools/ (tests/desk-signin.mjs ds16g). With --where it prints what it would start, and starts nothing.
setlocal
set "ROOT=%~dp0.."
set "EXE=%ROOT%\node_modules\electron\dist\electron.exe"
set "PROFILE=%LOCALAPPDATA%\Etiuda-signin-staging"
if /i "%~1"=="--where" echo %EXE% %ROOT% --user-data-dir=%PROFILE%
if /i "%~1"=="--where" exit /b 0
if "%~1"=="" echo Name the lab file: tools\signin-staging.cmd C:\path\to\lab.json
if "%~1"=="" exit /b 1
if not exist "%~f1" echo No lab file at %~f1.
if not exist "%~f1" exit /b 1
if not exist "%EXE%" echo This tree's Electron was not found at %EXE%. Run npm install in the tree first.
if not exist "%EXE%" exit /b 1
set "ETIUDA_SIGNIN_LAB=%~f1"
start "" "%EXE%" "%ROOT%" "--user-data-dir=%PROFILE%"
endlocal
