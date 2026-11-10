# Custom NSIS, inserted by electron-builder into its own installer script at two named points.
# `nsis.include` in electron-builder.js names this file rather than leaving it to be found by
# convention, so moving or renaming it fails the build instead of dropping what is below in silence.

# THE WELCOME PAGE IS FIRST, THEN THE LICENCE, then install-mode. Choosing all-users calls
# UAC_RunElevated; the inner copy starts the wizard again, so those two pages would show twice.
# Both presses sit under UAC_IsInnerInstance and under nothing else, so a per-user install shows
# each page once and the elevated inner copy skips the welcome page and then the licence.
# skipPageIfUpdated already owns its PRE. The define must precede MUI_INTERFACE; the function
# waits for customHeader, after electron-builder has added the UAC plugin directory.
!define MUI_CUSTOMFUNCTION_GUIINIT skipLicenseIfInner
!ifdef BUILD_UNINSTALLER
  !define MUI_CUSTOMFUNCTION_UNGUIINIT un.TurnGuiInit
!endif
!macro customHeader
  Function skipLicenseIfInner
    ${If} ${UAC_IsInnerInstance}
      BringToFront
      SendMessage $HWNDPARENT 0x408 1 0
      SendMessage $HWNDPARENT 0x408 1 0
    ${EndIf}
    # TurnPrepare exists only in the installer compile: the welcome macro inserts it, and this
    # file's uninstaller compile inserts un.TurnPrepare instead, started from un.TurnGuiInit.
    !ifndef BUILD_UNINSTALLER
      Call TurnPrepare
    !endif
  FunctionEnd

  !ifndef BUILD_UNINSTALLER
  Function CompareSemver
    # Compares $0 (v1, installed) with $1 (v2, installer).
    # Returns $0: -1 if v1 < v2, 0 if v1 == v2, 1 if v1 > v2, 2 if unreadable.
    Push $1
    Push $2
    Push $3
    Push $4
    Push $5
    Push $6
    Push $7
    Push $8
    Push $9
    Push $R0
    Push $R1
    Push $R2
    Push $R3
    Push $R4

    StrCmp $0 $1 CmpEqual 0
    StrCmp $0 "" CmpUnreadable 0
    StrCmp $1 "" CmpUnreadable 0

    # Strip build metadata (+...) from $0 into $R0
    StrCpy $R0 $0
    StrCpy $2 0
    LoopStripBuild0:
      StrCpy $3 $R0 1 $2
      StrCmp $3 "" DoneStripBuild0
      StrCmp $3 "+" 0 NextStripBuild0
      StrCpy $R0 $R0 $2
      Goto DoneStripBuild0
      NextStripBuild0:
      IntOp $2 $2 + 1
      Goto LoopStripBuild0
    DoneStripBuild0:

    # Strip build metadata (+...) from $1 into $R1
    StrCpy $R1 $1
    StrCpy $2 0
    LoopStripBuild1:
      StrCpy $3 $R1 1 $2
      StrCmp $3 "" DoneStripBuild1
      StrCmp $3 "+" 0 NextStripBuild1
      StrCpy $R1 $R1 $2
      Goto DoneStripBuild1
      NextStripBuild1:
      IntOp $2 $2 + 1
      Goto LoopStripBuild1
    DoneStripBuild1:

    # Split prerelease (-...) from $R0 -> Core0 ($R0), Pre0 ($R2)
    StrCpy $R2 ""
    StrCpy $2 0
    LoopSplitPre0:
      StrCpy $3 $R0 1 $2
      StrCmp $3 "" DoneSplitPre0
      StrCmp $3 "-" 0 NextSplitPre0
      IntOp $4 $2 + 1
      StrCpy $R2 $R0 "" $4
      StrCpy $R0 $R0 $2
      Goto DoneSplitPre0
      NextSplitPre0:
      IntOp $2 $2 + 1
      Goto LoopSplitPre0
    DoneSplitPre0:

    # Split prerelease (-...) from $R1 -> Core1 ($R1), Pre1 ($R3)
    StrCpy $R3 ""
    StrCpy $2 0
    LoopSplitPre1:
      StrCpy $3 $R1 1 $2
      StrCmp $3 "" DoneSplitPre1
      StrCmp $3 "-" 0 NextSplitPre1
      IntOp $4 $2 + 1
      StrCpy $R3 $R1 "" $4
      StrCpy $R1 $R1 $2
      Goto DoneSplitPre1
      NextSplitPre1:
      IntOp $2 $2 + 1
      Goto LoopSplitPre1
    DoneSplitPre1:

    # Parse Core0 ($R0) into Major0 ($4), Minor0 ($5), Patch0 ($6)
    StrCpy $2 0
    LoopCore0Dot1:
      StrCpy $3 $R0 1 $2
      StrCmp $3 "" CmpUnreadable
      StrCmp $3 "." FoundCore0Dot1 NextCore0Dot1
      NextCore0Dot1:
      IntOp $2 $2 + 1
      Goto LoopCore0Dot1
    FoundCore0Dot1:
      StrCpy $4 $R0 $2
      IntOp $2 $2 + 1
      StrCpy $R4 $R0 "" $2

    StrCpy $2 0
    LoopCore0Dot2:
      StrCpy $3 $R4 1 $2
      StrCmp $3 "" CmpUnreadable
      StrCmp $3 "." FoundCore0Dot2 NextCore0Dot2
      NextCore0Dot2:
      IntOp $2 $2 + 1
      Goto LoopCore0Dot2
    FoundCore0Dot2:
      StrCpy $5 $R4 $2
      IntOp $2 $2 + 1
      StrCpy $6 $R4 "" $2

    # Parse Core1 ($R1) into Major1 ($7), Minor1 ($8), Patch1 ($9)
    StrCpy $2 0
    LoopCore1Dot1:
      StrCpy $3 $R1 1 $2
      StrCmp $3 "" CmpUnreadable
      StrCmp $3 "." FoundCore1Dot1 NextCore1Dot1
      NextCore1Dot1:
      IntOp $2 $2 + 1
      Goto LoopCore1Dot1
    FoundCore1Dot1:
      StrCpy $7 $R1 $2
      IntOp $2 $2 + 1
      StrCpy $R4 $R1 "" $2

    StrCpy $2 0
    LoopCore1Dot2:
      StrCpy $3 $R4 1 $2
      StrCmp $3 "" CmpUnreadable
      StrCmp $3 "." FoundCore1Dot2 NextCore1Dot2
      NextCore1Dot2:
      IntOp $2 $2 + 1
      Goto LoopCore1Dot2
    FoundCore1Dot2:
      StrCpy $8 $R4 $2
      IntOp $2 $2 + 1
      StrCpy $9 $R4 "" $2

    # Validate that numeric parts are non-empty
    StrCmp $4 "" CmpUnreadable 0
    StrCmp $5 "" CmpUnreadable 0
    StrCmp $6 "" CmpUnreadable 0
    StrCmp $7 "" CmpUnreadable 0
    StrCmp $8 "" CmpUnreadable 0
    StrCmp $9 "" CmpUnreadable 0

    IntCmp $4 $7 0 CmpLess CmpGreater
    IntCmp $5 $8 0 CmpLess CmpGreater
    IntCmp $6 $9 0 CmpLess CmpGreater

    # Major, minor and patch are equal. Compare pre-releases
    StrCmp $R2 $R3 CmpEqual 0
    StrCmp $R2 "" CmpGreater 0 # no prerelease is newer than prerelease
    StrCmp $R3 "" CmpLess 0    # prerelease is older than no prerelease

    LoopCmpPre:
      StrCpy $2 0
      LoopId0:
        StrCpy $3 $R2 1 $2
        StrCmp $3 "" FoundEndId0
        StrCmp $3 "." FoundDotId0
        IntOp $2 $2 + 1
        Goto LoopId0
      FoundDotId0:
        StrCpy $4 $R2 $2
        IntOp $2 $2 + 1
        StrCpy $R2 $R2 "" $2
        Goto DoneId0
      FoundEndId0:
        StrCpy $4 $R2
        StrCpy $R2 ""
      DoneId0:

      StrCpy $2 0
      LoopId1:
        StrCpy $3 $R3 1 $2
        StrCmp $3 "" FoundEndId1
        StrCmp $3 "." FoundDotId1
        IntOp $2 $2 + 1
        Goto LoopId1
      FoundDotId1:
        StrCpy $7 $R3 $2
        IntOp $2 $2 + 1
        StrCpy $R3 $R3 "" $2
        Goto DoneId1
      FoundEndId1:
        StrCpy $7 $R3
        StrCpy $R3 ""
      DoneId1:

      StrCmp $4 "" CmpLess 0
      StrCmp $7 "" CmpGreater 0

      # Check if $4 is numeric
      StrCpy $2 0
      StrCpy $5 1
      LoopNum4:
        StrCpy $3 $4 1 $2
        StrCmp $3 "" DoneNum4
        ${If} $3 < "0"
        ${OrIf} $3 > "9"
          StrCpy $5 0
          Goto DoneNum4
        ${EndIf}
        IntOp $2 $2 + 1
        Goto LoopNum4
      DoneNum4:

      # Check if $7 is numeric
      StrCpy $2 0
      StrCpy $8 1
      LoopNum7:
        StrCpy $3 $7 1 $2
        StrCmp $3 "" DoneNum7
        ${If} $3 < "0"
        ${OrIf} $3 > "9"
          StrCpy $8 0
          Goto DoneNum7
        ${EndIf}
        IntOp $2 $2 + 1
        Goto LoopNum7
      DoneNum7:

      ${If} $5 == 1
      ${AndIf} $8 == 1
        IntCmp $4 $7 0 CmpLess CmpGreater
      ${ElseIf} $5 == 1
      ${AndIf} $8 == 0
        Goto CmpLess
      ${ElseIf} $5 == 0
      ${AndIf} $8 == 1
        Goto CmpGreater
      ${Else}
        StrCmp $4 $7 +3 0
        ${If} "$4" < "$7"
          Goto CmpLess
        ${Else}
          Goto CmpGreater
        ${EndIf}
      ${EndIf}

      StrCmp $R2 "" 0 LoopCmpPre
      StrCmp $R3 "" 0 LoopCmpPre
      Goto CmpEqual

    CmpLess:
      StrCpy $0 -1
      Goto DoneCmp
    CmpEqual:
      StrCpy $0 0
      Goto DoneCmp
    CmpGreater:
      StrCpy $0 1
      Goto DoneCmp
    CmpUnreadable:
      StrCpy $0 2
      Goto DoneCmp

    DoneCmp:
    Pop $R4
    Pop $R3
    Pop $R2
    Pop $R1
    Pop $R0
    Pop $9
    Pop $8
    Pop $7
    Pop $6
    Pop $5
    Pop $4
    Pop $3
    Pop $2
    Pop $1
  FunctionEnd

  Function RecogniseExistingInstallation
    Push $0
    Push $1
    Push $R1
    Push $R2

    StrCpy $InstalledVersion ""
    StrCpy $R2 "0"

    # Check HKLM
    ReadRegStr $0 HKLM "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    ${If} $0 != ""
      StrCpy $InstalledVersion $0
      StrCpy $R2 "1"
    ${Else}
      ReadRegStr $0 HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation"
      ${If} $0 != ""
        StrCpy $R2 "1"
      ${EndIf}
    ${EndIf}

    # Check HKCU
    ${If} $R2 == "0"
    ${OrIf} $installMode == "CurrentUser"
      ReadRegStr $1 HKCU "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
      ${If} $1 != ""
        StrCpy $InstalledVersion $1
        StrCpy $R2 "1"
      ${Else}
        ReadRegStr $1 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
        ${If} $1 != ""
          StrCpy $R2 "1"
        ${EndIf}
      ${EndIf}
    ${EndIf}

    ${If} $hasPerMachineInstallation == "1"
    ${OrIf} $hasPerUserInstallation == "1"
      StrCpy $R2 "1"
    ${EndIf}

    ${If} $R2 == "0"
      Goto DoneRecognise
    ${EndIf}

    ${If} $InstalledVersion == ""
      StrCpy $RecogniseMsg "$(RecogniseUnreadableText)"
    ${Else}
      StrCpy $0 $InstalledVersion
      StrCpy $1 "${VERSION}"
      Call CompareSemver
      ${If} $0 == -1
        StrCpy $RecogniseMsg "$(RecogniseOlderText)"
      ${ElseIf} $0 == 0
        StrCpy $RecogniseMsg "$(RecogniseSameText)"
      ${ElseIf} $0 == 1
        StrCpy $RecogniseMsg "$(RecogniseNewerText)"
      ${Else}
        StrCpy $RecogniseMsg "$(RecogniseUnreadableText)"
      ${EndIf}
    ${EndIf}

    MessageBox MB_OKCANCEL|MB_ICONQUESTION "$RecogniseMsg" /SD IDOK IDOK Proceed IDCANCEL Cancel
    Cancel:
      Quit
    Proceed:

    DoneRecognise:
    Pop $R2
    Pop $R1
    Pop $1
    Pop $0
  FunctionEnd
  !endif
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

# ETIUDA IS ASKED TO CLOSE, NEVER STOPPED. The installer signals the running desk to seal its tabs and close, followed
# by taskkill without /F; the desk keeps in-progress tabs sealed on disk without a modal, or asks where it cannot, and
# the installer waits and says so. Still open after that, it asks for Retry; a silent install gives up there and leaves
# the installed version as it was.
!macro customCheckAppRunning
  Push $R7
  Push $R8
  Push $R9
  ${If} $LANGUAGE == 1045
    StrCpy $R9 "Etiuda jest jeszcze otwarta, więc instalator prosi ją o zamknięcie. Nic nie zostanie zamknięte siłą: Etiuda zachowa otwarte rozmowy wraz z wersjami roboczymi i przywróci je przy następnym uruchomieniu, a jeśli to niemożliwe, przy trwającej rozmowie najpierw o to zapyta. Instalacja będzie kontynuowana, gdy Etiuda się zamknie; jeśli pozostanie otwarta, trzeba zamknąć ją ręcznie i nacisnąć Ponów próbę."
  ${Else}
    StrCpy $R9 "Etiuda is still open, so the installer is asking it to close. Nothing is closed by force: Etiuda keeps its open conversations and their drafts and brings them back at its next start, or, where it cannot, asks first while a conversation is in progress. The installation carries on once it has closed; if it stays open, close it by hand and press Retry."
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
      ${If} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
        nsExec::Exec /TIMEOUT=3000 `"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --update-close`
        Pop $R8
      ${EndIf}
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

# THE TURNING SIDEBAR AND HEADER. Looping frames, one every ${TURN_INTERVAL} ms. Frame 0 is the still
# electron-builder shows from installerSidebar.bmp and installerHeader.bmp. The frames are
# extracted into $PLUGINSDIR\turn from turning.7z at .onInit and un.onInit. One nsDialogs timer,
# NSIS's own, swaps whichever image is on the page: the sidebar on Welcome and Finish, the header
# on an inner page. Leaving a page changes that key, so the count returns to frame 0 and the
# previous page's sequence stops. A page with no image is left on the still. .onGUIEnd removes the timer.
!ifndef BUILD_RESOURCES_DIR
  !define BUILD_RESOURCES_DIR "shell"
!endif
!include "${BUILD_RESOURCES_DIR}\installer\turning.nsh"

!macro customInit
  ${IfNot} ${Silent}
    ${IfNot} ${UAC_IsInnerInstance}
      Call RecogniseExistingInstallation
    ${EndIf}
    InitPluginsDir
    CreateDirectory "$PLUGINSDIR\turn"
    Push $0
    StrCpy $0 $OUTDIR
    SetOutPath "$PLUGINSDIR\turn"
    File "${BUILD_RESOURCES_DIR}\installer\turning.7z"
    # Nsis7z::Extract answers nothing and sets no error flag; what guards a failed or partial
    # extraction is the FileExists before the timer and before every frame, so the still stays.
    Nsis7z::Extract "$PLUGINSDIR\turn\turning.7z"
    Delete "$PLUGINSDIR\turn\turning.7z"
    SetOutPath "$0"
    Pop $0
  ${EndIf}
!macroend

!macro customUnInit
  ${IfNot} ${Silent}
    InitPluginsDir
    CreateDirectory "$PLUGINSDIR\turn"
    Push $0
    StrCpy $0 $OUTDIR
    SetOutPath "$PLUGINSDIR\turn"
    File "${BUILD_RESOURCES_DIR}\installer\turning.7z"
    # Nsis7z::Extract answers nothing and sets no error flag; what guards a failed or partial
    # extraction is the FileExists before the timer and before every frame, so the still stays.
    Nsis7z::Extract "$PLUGINSDIR\turn\turning.7z"
    Delete "$PLUGINSDIR\turn\turning.7z"
    SetOutPath "$0"
    Pop $0
  ${EndIf}
!macroend

Var TurnFrame
Var TurnKey
Var TurnNext
Var TurnHwnd
Var TurnKind
Var TurnBmp
Var TurnReady
!ifndef BUILD_UNINSTALLER
Var InstalledVersion
Var RecogniseMsg
!endif

!macro TurnEmit UN
  !ifdef TURN_PFX
    !undef TURN_PFX
  !endif
  !searchreplace TURN_PFX "${UN}" "x" ""

  Function ${TURN_PFX}TurnPrepare
    ${If} $TurnReady == "1"
      Return
    ${EndIf}
    StrCpy $TurnReady "1"
    StrCpy $TurnFrame 0
    StrCpy $TurnKey ""
    StrCpy $TurnNext ""
    StrCpy $TurnHwnd 0
    StrCpy $TurnKind ""
    StrCpy $TurnBmp 0
    ${If} ${FileExists} "$PLUGINSDIR\turn\sidebar-000.bmp"
      Push $0
      GetFunctionAddress $0 ${TURN_PFX}TurnTick
      nsDialogs::CreateTimer $0 ${TURN_INTERVAL}
      Pop $0
    ${EndIf}
  FunctionEnd

  Function ${TURN_PFX}TurnPage
    Push $0
    Push $1
    Push $2
    Push $3
    Push $4
    StrCpy $TurnKind ""
    StrCpy $TurnHwnd 0
    StrCpy $TurnNext ""
    GetDlgItem $0 $HWNDPARENT 1046
    System::Call 'user32::IsWindowVisible(p r0) i.r1'
    ${If} $1 != 0
      StrCpy $TurnKind "h"
      StrCpy $TurnHwnd $0
      GetDlgItem $0 $HWNDPARENT 1037
      System::Call 'user32::GetWindowText(p r0, t.r2, i 220)'
      StrCpy $TurnNext "h:$2"
    ${Else}
      StrCpy $4 $HWNDPARENT
      StrCpy $0 0
      ${Do}
        System::Call 'user32::FindWindowEx(p r4, p r0, t "#32770", p 0) p.r0'
        ${If} $0 == 0
          ${ExitDo}
        ${EndIf}
        StrCpy $1 0
        ${Do}
          System::Call 'user32::FindWindowEx(p r0, p r1, t "Static", p 0) p.r1'
          ${If} $1 == 0
            ${ExitDo}
          ${EndIf}
          System::Call 'user32::GetWindowLong(p r1, i -16) i.r3'
          IntOp $3 $3 & 31
          ${If} $3 == 14
            System::Call 'user32::IsWindowVisible(p r1) i.r3'
            ${If} $3 != 0
              StrCpy $TurnKind "s"
              StrCpy $TurnHwnd $1
              System::Call 'user32::FindWindowEx(p r0, p r1, t "Static", p 0) p.r3'
              System::Call 'user32::GetWindowText(p r3, t.r2, i 220)'
              StrCpy $TurnNext "s:$2"
              ${ExitDo}
            ${EndIf}
          ${EndIf}
        ${Loop}
        ${If} $TurnKind != ""
          ${ExitDo}
        ${EndIf}
      ${Loop}
    ${EndIf}
    Pop $4
    Pop $3
    Pop $2
    Pop $1
    Pop $0
  FunctionEnd

  Function ${TURN_PFX}TurnPaint
    Push $0
    Push $1
    Push $2
    Push $3
    Push $4
    Push $5
    Push $6
    Push $R0
    StrCpy $R0 $TurnHwnd
    System::Call 'user32::GetClientRect(pR0,@r0)'
    System::Call '*$0(i,i,i.r1,i.r2)'
    ${If} $1 != 0
    ${AndIf} $2 != 0
      IntFmt $3 "%03d" $TurnFrame
      ${If} $TurnKind == "h"
        StrCpy $4 "$PLUGINSDIR\turn\header-$3.bmp"
      ${Else}
        StrCpy $4 "$PLUGINSDIR\turn\sidebar-$3.bmp"
      ${EndIf}
      ${If} ${FileExists} $4
        System::Call 'user32::LoadImage(p 0, t r4, i 0, i r1, i r2, i 0x10) p.r5'
        ${If} $5 != 0
          SendMessage $TurnHwnd 0x172 0 $5 $6
          ${If} $TurnBmp != 0
          ${AndIf} $6 == $TurnBmp
            StrCpy $1 $TurnBmp
            System::Call 'gdi32::DeleteObject(p r1)'
          ${EndIf}
          StrCpy $TurnBmp $5
        ${EndIf}
      ${EndIf}
    ${EndIf}
    Pop $R0
    Pop $6
    Pop $5
    Pop $4
    Pop $3
    Pop $2
    Pop $1
    Pop $0
  FunctionEnd

  Function ${TURN_PFX}TurnTick
    Push $0
    Push $1
    Call ${TURN_PFX}TurnPage
    ${If} $TurnKind != ""
      ${If} $TurnNext != $TurnKey
        ${If} $TurnBmp != 0
          StrCpy $1 $TurnBmp
          System::Call 'gdi32::DeleteObject(p r1)'
          StrCpy $TurnBmp 0
        ${EndIf}
        StrCpy $TurnKey $TurnNext
        StrCpy $TurnFrame 0
      ${Else}
        IntOp $TurnFrame $TurnFrame + 1
        ${If} $TurnFrame >= ${TURN_FRAMES}
          StrCpy $TurnFrame 0
        ${EndIf}
      ${EndIf}
      Call ${TURN_PFX}TurnPaint
    ${EndIf}
    Pop $1
    Pop $0
  FunctionEnd

  !if "${TURN_PFX}" == "un."
    Function un.onGUIEnd
  !else
    Function .onGUIEnd
  !endif
    Push $0
    Push $1
    GetFunctionAddress $0 ${TURN_PFX}TurnTick
    nsDialogs::KillTimer $0
    ${If} $TurnBmp != 0
      StrCpy $1 $TurnBmp
      System::Call 'gdi32::DeleteObject(p r1)'
      StrCpy $TurnBmp 0
    ${EndIf}
    Pop $1
    Pop $0
  FunctionEnd
  !undef TURN_PFX
!macroend

# One LangString per language the installer loads, app-builder-lib's bundledLanguages.
# 1045 is Polish. Every other language gets the English, as the licence page does.
# A language added upstream and missing here is warning 6030, and -WX fails the build.
!macro TurnLang ID
  !if ${ID} == 1045
    LangString TurnWelcomeTitle ${ID} "Witamy w Etiudzie"
    LangString TurnWelcomeText ${ID} "Etiuda trzyma odpowiedzi zespołu pod ręką, gotowe do skopiowania do każdej rozmowy z klientem.$\r$\n$\r$\nInstalacja dotyczy tylko tego konta Windows, więc przy proponowanym folderze nie są potrzebne uprawnienia administratora. Jeśli Etiuda jest otwarta, instalator poprosi o jej zamknięcie.$\r$\n$\r$\nAby kontynuować, wystarczy nacisnąć Dalej."
    LangString TurnUnWelcomeTitle ${ID} "Usuwanie: Etiuda"
    LangString TurnUnWelcomeText ${ID} "Program Etiuda zostanie usunięty z tego komputera. Jego katalogi i ustawienia zostają na miejscu, więc po ponownej instalacji będą takie jak wcześniej.$\r$\n$\r$\nAby kontynuować, wystarczy nacisnąć Dalej."

    !ifndef BUILD_UNINSTALLER
    LangString RecogniseOlderTitle ${ID} "Aktualizacja programu Etiuda" ; placeholder: Claudette
    LangString RecogniseSameTitle ${ID} "Ponowna instalacja programu Etiuda" ; placeholder: Claudette
    LangString RecogniseNewerTitle ${ID} "Instalacja programu Etiuda" ; placeholder: Claudette
    LangString RecogniseUnreadableTitle ${ID} "Instalacja programu Etiuda" ; placeholder: Claudette
    !endif

    !ifndef BUILD_UNINSTALLER
    LangString RecogniseOlderText ${ID} "Na tym komputerze jest już program ${PRODUCT_NAME} w wersji $InstalledVersion, a ten instalator zawiera nowszą wersję ${VERSION}. Zaktualizować do wersji ${VERSION}?$\r$\n$\r$\nDane na tym komputerze i licencja zostają bez zmian."
    LangString RecogniseSameText ${ID} "Na tym komputerze jest już program ${PRODUCT_NAME} w wersji $InstalledVersion, tej samej co w instalatorze. Zainstalować go ponownie?$\r$\n$\r$\nDane na tym komputerze i licencja zostają bez zmian."
    LangString RecogniseNewerText ${ID} "Na tym komputerze jest już program ${PRODUCT_NAME} w wersji $InstalledVersion, nowszej niż wersja ${VERSION} z tego instalatora. Zainstalować w jej miejsce wersję ${VERSION}?$\r$\n$\r$\nDane na tym komputerze i licencja zostają bez zmian."
    LangString RecogniseUnreadableText ${ID} "Na tym komputerze jest już program ${PRODUCT_NAME}, ale nie da się odczytać jego wersji. Zainstalować w jego miejsce wersję ${VERSION}?$\r$\n$\r$\nDane na tym komputerze i licencja zostają bez zmian."
    !endif

    !ifndef BUILD_UNINSTALLER
    LangString RecogniseBtnUpdate ${ID} "Aktualizuj" ; placeholder: Claudette
    LangString RecogniseBtnReinstall ${ID} "Zainstaluj ponownie" ; placeholder: Claudette
    LangString RecogniseBtnCancel ${ID} "Anuluj" ; placeholder: Claudette
    LangString RecogniseAppRunningRetry ${ID} "${PRODUCT_NAME} jest uruchomiony. Po jego zamknięciu wystarczy wybrać Ponów." ; placeholder: Claudette
    LangString RecogniseAppRunningClose ${ID} "${PRODUCT_NAME} jest uruchomiony; instalator zamknie go przed kontynuacją." ; placeholder: Claudette
    !endif
  !else
    LangString TurnWelcomeTitle ${ID} "Welcome to Etiuda"
    LangString TurnWelcomeText ${ID} "Etiuda keeps a team's replies at hand, ready to copy into any conversation with a customer.$\r$\n$\r$\nSetup installs it for this Windows account only, so no administrator rights are needed for the folder it suggests. If Etiuda is open, Setup asks for it to be closed first.$\r$\n$\r$\nPress Next to go on."
    LangString TurnUnWelcomeTitle ${ID} "Removing Etiuda"
    LangString TurnUnWelcomeText ${ID} "This removes Etiuda from this computer. Its catalogs and settings stay where they are, so installing it again finds them as they were.$\r$\n$\r$\nPress Next to go on."

    !ifndef BUILD_UNINSTALLER
    LangString RecogniseOlderTitle ${ID} "Update Etiuda" ; placeholder: Claudette
    LangString RecogniseSameTitle ${ID} "Reinstall Etiuda" ; placeholder: Claudette
    LangString RecogniseNewerTitle ${ID} "Install Etiuda" ; placeholder: Claudette
    LangString RecogniseUnreadableTitle ${ID} "Install Etiuda" ; placeholder: Claudette
    !endif

    !ifndef BUILD_UNINSTALLER
    LangString RecogniseOlderText ${ID} "${PRODUCT_NAME} $InstalledVersion is installed on this computer, and this installer holds ${VERSION}, which is newer. Update to ${VERSION}?$\r$\n$\r$\nData on this computer and the licence stay as they are."
    LangString RecogniseSameText ${ID} "${PRODUCT_NAME} $InstalledVersion is already installed on this computer, the same version as this installer. Reinstall it?$\r$\n$\r$\nData on this computer and the licence stay as they are."
    LangString RecogniseNewerText ${ID} "${PRODUCT_NAME} $InstalledVersion is installed on this computer, which is newer than this installer's ${VERSION}. Reinstall ${VERSION} in its place?$\r$\n$\r$\nData on this computer and the licence stay as they are."
    LangString RecogniseUnreadableText ${ID} "${PRODUCT_NAME} is already installed on this computer, but its version cannot be read. Reinstall ${VERSION} in its place?$\r$\n$\r$\nData on this computer and the licence stay as they are."
    !endif

    !ifndef BUILD_UNINSTALLER
    LangString RecogniseBtnUpdate ${ID} "Update" ; placeholder: Claudette
    LangString RecogniseBtnReinstall ${ID} "Reinstall" ; placeholder: Claudette
    LangString RecogniseBtnCancel ${ID} "Cancel" ; placeholder: Claudette
    LangString RecogniseAppRunningRetry ${ID} "${PRODUCT_NAME} is running. Close it, then choose Retry." ; placeholder: Claudette
    LangString RecogniseAppRunningClose ${ID} "${PRODUCT_NAME} is running, and the installer will close it before going on." ; placeholder: Claudette
    !endif
  !endif
!macroend
!insertmacro TurnLang 1033
!insertmacro TurnLang 1031
!insertmacro TurnLang 1036
!insertmacro TurnLang 3082
!insertmacro TurnLang 2052
!insertmacro TurnLang 1028
!insertmacro TurnLang 1041
!insertmacro TurnLang 1042
!insertmacro TurnLang 1040
!insertmacro TurnLang 1043
!insertmacro TurnLang 1030
!insertmacro TurnLang 1053
!insertmacro TurnLang 1044
!insertmacro TurnLang 1035
!insertmacro TurnLang 1049
!insertmacro TurnLang 2070
!insertmacro TurnLang 1046
!insertmacro TurnLang 1045
!insertmacro TurnLang 1058
!insertmacro TurnLang 1029
!insertmacro TurnLang 1051
!insertmacro TurnLang 1038
!insertmacro TurnLang 1025
!insertmacro TurnLang 1055
!insertmacro TurnLang 1054
!insertmacro TurnLang 1066

!macro customWelcomePage
  !insertmacro TurnEmit "x"
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW TurnWelcomeShow
  !insertmacro MUI_PAGE_WELCOME
  Function TurnWelcomeShow
    SendMessage $mui.WelcomePage.Title ${WM_SETTEXT} 0 "STR:$(TurnWelcomeTitle)"
    SendMessage $mui.WelcomePage.Text ${WM_SETTEXT} 0 "STR:$(TurnWelcomeText)"
  FunctionEnd
!macroend

!macro customUnWelcomePage
  Function un.TurnGuiInit
    Call un.TurnPrepare
  FunctionEnd
  !insertmacro TurnEmit "un."
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.TurnUnWelcomeShow
  !insertmacro MUI_UNPAGE_WELCOME
  Function un.TurnUnWelcomeShow
    SendMessage $mui.WelcomePage.Title ${WM_SETTEXT} 0 "STR:$(TurnUnWelcomeTitle)"
    SendMessage $mui.WelcomePage.Text ${WM_SETTEXT} 0 "STR:$(TurnUnWelcomeText)"
  FunctionEnd
!macroend
