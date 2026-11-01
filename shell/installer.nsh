# Custom NSIS, inserted by electron-builder into its own installer script at two named points.
# `nsis.include` in electron-builder.js names this file rather than leaving it to be found by
# convention, so moving or renaming it fails the build instead of dropping what is below in silence.

# THE LICENCE PAGE IS THE FIRST PAGE, then install-mode. Choosing all-users calls UAC_RunElevated;
# the inner copy starts the wizard again, so that page would show twice. skipPageIfUpdated already
# owns its PRE. The define must precede MUI_INTERFACE; the function waits for customHeader, after
# electron-builder has added the UAC plugin directory.
!define MUI_CUSTOMFUNCTION_GUIINIT skipLicenseIfInner
!macro customHeader
  Function skipLicenseIfInner
    ${If} ${UAC_IsInnerInstance}
      SendMessage $HWNDPARENT 0x408 1 0
    ${EndIf}
  FunctionEnd
!macroend

# The cache directory, taken from electron-builder's own define rather than spelled a second time
# and left to drift: the define is "<name>-updater\installer.exe" and this is everything before the
# file. If that tail ever changes, the strip leaves the string whole and the build stops here.
!searchreplace UPDATER_CACHE_DIR "${APP_INSTALLER_STORE_FILE}" "\installer.exe" ""
!if "${UPDATER_CACHE_DIR}" == "${APP_INSTALLER_STORE_FILE}"
  !error "APP_INSTALLER_STORE_FILE is ${APP_INSTALLER_STORE_FILE}, which no longer ends in \installer.exe"
!endif

!macro customInstall
  # Add or remove programs, and every tool that asks Windows where a program sits, read the folder
  # from InstallLocation, which electron-builder writes into its own key and not into this one.
  # Written before the context dance below, because SHELL_CONTEXT follows SetShellVarContext.
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "InstallLocation" "$INSTDIR"

  # THE .ec FILE TYPE IN THE INSTALLER'S LANGUAGE: electron-builder names it once, from
  # fileAssociations in electron-builder.js, which is the English. registerFileAssociations has run
  # by now, into the same key; 1045 is Polish, and the name is ui-lang.js's for "Etiuda catalog".
  # Its open verb's label is electron-builder's "Open with <productName>", English too.
  # Only a build that registers the type writes here: Studio includes this file and claims no
  # type. The macro is defined after this file is read, so the test is made at insertion.
  !ifmacrodef registerFileAssociations
  ${If} $LANGUAGE == 1045
    WriteRegStr SHELL_CONTEXT "Software\Classes\Etiuda catalog" "" "Katalog Etiudy"
    WriteRegStr SHELL_CONTEXT "Software\Classes\Etiuda catalog\shell\open" "" "Otwórz w Etiudzie"
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
  ${EndIf}
  !endif

  # THE etiuda: LINK, so an invitation opened before the desk's first start still reaches it: the three values
  # app.setAsDefaultProtocolClient("etiuda") writes at that start (registerEtiudaLink in shell/main.js), and under
  # HKCU as it writes them, whatever the install mode. The desk is the build that registers the .ec type.
  !ifmacrodef registerFileAssociations
  WriteRegStr HKCU "Software\Classes\etiuda" "" "URL:etiuda" # plant:f6-link-name
  WriteRegStr HKCU "Software\Classes\etiuda" "URL Protocol" "" # plant:f6-link-flag
  WriteRegStr HKCU "Software\Classes\etiuda\shell\open\command" "" `"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"` # plant:f6-link-open
  !endif

  # THE UPDATER'S CACHE, which nothing here will ever spend: installApplicationFiles copies the
  # whole setup.exe into LOCALAPPDATA for electron-updater, this product has no auto-update, and
  # electron-builder offers no switch to stop the copy. So it is taken back at install rather than
  # at uninstall, or a customer carries the installer's full weight for as long as the app is here.
  # The context is set as the copy set it, or an all-users install deletes under ProgramData.
  ${if} $installMode == "all"
    SetShellVarContext current
  ${endif}
  Delete "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
  RMDir "$LOCALAPPDATA\${UPDATER_CACHE_DIR}"
  ${if} $installMode == "all"
    SetShellVarContext all
  ${endif}
!macroend

# ETIUDA IS ASKED TO CLOSE, NEVER STOPPED. taskkill without /F sends its window the close the window's own X sends, which
# asks the person first while a conversation is in progress, and the installer waits and says so. Still open after that,
# it asks for Retry; a silent install gives up there and leaves the installed version as it was.
!macro customCheckAppRunning
  Push $R7
  Push $R8
  Push $R9
  ${If} $LANGUAGE == 1045
    StrCpy $R9 "Etiuda jest jeszcze otwarta, więc instalator prosi ją o zamknięcie. Instalacja będzie kontynuowana, gdy Etiuda się zamknie. Jeśli pozostanie otwarta, trzeba zamknąć ją ręcznie i nacisnąć Ponów próbę."
  ${Else}
    StrCpy $R9 "Etiuda is still open, so the installer is asking it to close. The installation carries on once it has closed. If it stays open, close it by hand and press Retry."
  ${EndIf}
  StrCpy $R7 0
  ${Do}
    nsExec::Exec `"$SYSDIR\cmd.exe" /C tasklist /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${APP_EXECUTABLE_FILENAME}\""`
    Pop $R8
    ${If} $R8 != 0
      ${ExitDo}
    ${EndIf}
    ${If} $R7 == 0
      DetailPrint "$R9"
      nsExec::Exec `"$SYSDIR\cmd.exe" /C taskkill /IM "${APP_EXECUTABLE_FILENAME}" /FI "USERNAME eq %USERNAME%"` ; plant:installer-asks-close
      Pop $R8
    ${EndIf}
    IntOp $R7 $R7 + 1
    ${If} $R7 > 20
      ${If} ${Cmd} `MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$R9" /SD IDCANCEL IDRETRY`
        StrCpy $R7 0
      ${Else}
        SetErrorLevel 2
        Quit ; plant:installer-gives-up
      ${EndIf}
    ${Else}
      Sleep 1000
    ${EndIf}
  ${Loop}
  Pop $R9
  Pop $R8
  Pop $R7
!macroend

# AN UPDATE LEAVES THE INSTALLED FILES WHERE THEY ARE: the new installer copies over them only once its own extraction to a
# temporary folder has finished, so a run cut short before then leaves the old version whole. A plain uninstall removes
# the folder, as electron-builder's own step does.
!macro customRemoveFiles
  ${IfNot} ${isUpdated} ; plant:update-keeps-files
    SetOutPath $TEMP
    RMDir /r $INSTDIR
  ${EndIf}
!macroend

!macro customUnInstall
  # THE etiuda: LINK goes with the desk, and only while it still opens this desk: another program's is left as it is.
  !ifmacrodef unregisterFileAssociations
  ReadRegStr $0 HKCU "Software\Classes\etiuda\shell\open\command" ""
  ${If} $0 == `"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"`
    DeleteRegKey HKCU "Software\Classes\etiuda" # plant:f6-link-gone
  ${EndIf}
  !endif
!macroend
