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

  # A build that carries its own copy of the two install checks (Studio, while its pin predates them) defines
  # INSTALL_CHECKS_OWN_COPY, so the copy cut from here into its hooks emits neither and makensis meets no duplicate.
  !ifndef INSTALL_CHECKS_OWN_COPY
  !ifdef BUILD_UNINSTALLER
  # A SHORTCUT OF THIS NAME IN THE OTHER SCOPE goes with this uninstall when no installation is registered there, so a
  # copy that moved between per-user and all-users leaves no dead entry; one still registered keeps its own.
  Function un.RemoveStaleLinks
    Push $0
    ${If} $installMode == "all"
      ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
      ${If} $0 == ""
        SetShellVarContext current
        Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
        Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
        SetShellVarContext all
      ${EndIf}
    ${Else}
      ReadRegStr $0 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
      ${If} $0 == ""
        SetShellVarContext all
        Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
        Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
        SetShellVarContext current
      ${EndIf}
    ${EndIf}
    Pop $0
  FunctionEnd
  !else
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
        ${If} $3 S< "0"
        ${OrIf} $3 S> "9"
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
        ${If} $3 S< "0"
        ${OrIf} $3 S> "9"
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
        ${If} "$4" S< "$7"
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
  !endif

  # A TREE REMOVED WITHOUT ENTERING A LINK: RMDir /r follows a junction into its target, so run elevated over a folder its
  # user can write, it deletes wherever a link planted there points. Each entry's attributes are read before it is entered,
  # and a link is removed as itself. The folder is on the stack; a drive root is refused, as RMDir /r refuses one.
  !ifdef BUILD_UNINSTALLER
    !define ETIUDA_REMOVE_TREE "un.etiudaRemoveTree"
  !endif
  # Compiled where the name is defined: an unreferenced function is warning 6010, so an installer-pass caller defines it too.
  !ifdef ETIUDA_REMOVE_TREE
  Function ${ETIUDA_REMOVE_TREE}
    Exch $R0
    Push $R1
    Push $R2
    StrLen $R1 $R0
    ${If} $R1 < 4
      Goto etiudaTreeDone
    ${EndIf}
    System::Call 'kernel32::GetFileAttributesW(w R0) i .R1'
    ${If} $R1 = -1
      Goto etiudaTreeDone
    ${EndIf}
    IntOp $R2 $R1 & 0x400
    ${If} $R2 <> 0
      RMDir $R0
      Delete $R0
      Goto etiudaTreeDone
    ${EndIf}
    IntOp $R2 $R1 & 0x10
    ${If} $R2 = 0
      Delete $R0
      Goto etiudaTreeDone
    ${EndIf}
    FindFirst $R1 $R2 "$R0\*.*"
    ${DoWhile} $R2 != ""
      ${If} $R2 != "."
      ${AndIf} $R2 != ".."
        Push "$R0\$R2"
        Call ${ETIUDA_REMOVE_TREE}
      ${EndIf}
      FindNext $R1 $R2
    ${Loop}
    FindClose $R1
    RMDir $R0
    etiudaTreeDone:
    Pop $R2
    Pop $R1
    Pop $R0
  FunctionEnd
  !endif

  # The swap's walk over an older folder (etiudaDropOldFiles), in the installer only: here, after electron-builder's
  # !addplugindir, because its System::Call compiled where this file is read breaks makensis 3.12's every later one.
  !ifndef BUILD_UNINSTALLER
  !ifmacrodef etiudaDropOldFilesFunction
    !insertmacro etiudaDropOldFilesFunction
  !endif
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
  # app.setAsDefaultProtocolClient("etiuda") writes at that start (registerEtiudaLink in shell/main.js), where the .ec
  # type goes: HKLM for an all-users install, so every account has it, HKCU for a per-user one. The desk is the build
  # that registers the .ec type.
  !ifmacrodef registerFileAssociations
  WriteRegStr SHELL_CONTEXT "Software\Classes\etiuda" "" "URL:etiuda" # plant:f6-link-name
  WriteRegStr SHELL_CONTEXT "Software\Classes\etiuda" "URL Protocol" "" # plant:f6-link-flag
  WriteRegStr SHELL_CONTEXT "Software\Classes\etiuda\shell\open\command" "" `"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"` # plant:f6-link-open
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
# the installer waits and says so. Still open after that, it asks for Retry; a silent install gives up there with 1618,
# the retry-later code README.md lists, and leaves the installed version as it was. Both sentences name ${PRODUCT_NAME}.
!macro customCheckAppRunning
  Push $R5
  Push $R6
  Push $R7
  Push $R8
  Push $R9
  Push $R4
  ${If} $LANGUAGE == 1045
    StrCpy $R6 "Program ${PRODUCT_NAME} jest uruchomiony; instalator zamknie go przed kontynuacją."
    StrCpy $R9 "Program ${PRODUCT_NAME} jest uruchomiony. Po jego zamknięciu wystarczy wybrać Ponów."
  ${Else}
    StrCpy $R6 "${PRODUCT_NAME} is running, and the installer will close it before going on."
    StrCpy $R9 "${PRODUCT_NAME} is running. Close it, then choose Retry."
  ${EndIf}
  # An all-users install looks in every session, since every account runs its files; a per-user install looks in this
  # account's alone, since another account's copy runs from that account's own folder.
  StrCpy $R5 `/FI "USERNAME eq %USERNAME%" `
  ${If} $installMode == "all"
    StrCpy $R5 ""
  ${EndIf}
  StrCpy $R7 0
  ${Do}
    nsExec::Exec `"$SYSDIR\cmd.exe" /C "$SYSDIR\tasklist.exe" $R5/FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${APP_EXECUTABLE_FILENAME}\""`
    Pop $R8
    ${If} $R8 != 0
      ${ExitDo}
    ${EndIf}
    ${If} $R7 == 0
      DetailPrint "$R6"
      # Only this account's own copy is asked to close; another person's is never ended. With none of its own open there
      # is nothing to wait for, so the run goes straight to Retry, or to 1618 when silent.
      nsExec::Exec `"$SYSDIR\cmd.exe" /C "$SYSDIR\tasklist.exe" /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${APP_EXECUTABLE_FILENAME}\""`
      Pop $R8
      ${If} $R8 == 0
        ${If} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
          StrCpy $R4 "instdir"
        ${Else}
          StrCpy $R4 ""
        ${EndIf}
        # The desk's installer asks through etiudaAskClose (below): an install into another folder, or all-users over a
        # per-user copy, has no program in $INSTDIR yet, and no program a non-administrator can write runs elevated.
        # Studio's cut of this hook and the uninstaller ask through $INSTDIR's program alone, as before, and so does a script
        # that has not read UAC.nsh (tests/test.js 1152e preprocesses this hook alone).
        !ifmacrodef etiudaAskClose & _UAC_IsInnerInstance
          !insertmacro etiudaAskClose
        !else
          ${If} $R4 == "instdir"
            nsExec::Exec /TIMEOUT=3000 `"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --update-close`
            Pop $R8
          ${EndIf}
        !endif
        nsExec::Exec `"$SYSDIR\cmd.exe" /C "$SYSDIR\taskkill.exe" /IM "${APP_EXECUTABLE_FILENAME}" /FI "USERNAME eq %USERNAME%"` ; plant:installer-asks-close
        Pop $R8
      ${Else}
        StrCpy $R7 20
      ${EndIf}
    ${EndIf}
    IntOp $R7 $R7 + 1
    ${If} $R7 > 20
      ${If} ${Cmd} `MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$R9" /SD IDCANCEL IDRETRY`
        StrCpy $R7 0
      ${Else}
        # The installer's files staged beside the install go with it (etiudaStageAbort, below; Studio has none).
        !ifmacrodef etiudaStageAbort
          !insertmacro etiudaStageAbort
        !endif
        SetErrorLevel 1618
        Quit ; plant:installer-gives-up
      ${EndIf}
    ${Else}
      Sleep 1000
    ${EndIf}
  ${Loop}
  Pop $R4
  Pop $R9
  Pop $R8
  Pop $R7
  Pop $R6
  Pop $R5
!macroend

# AN UPDATE'S UNINSTALL LEAVES THE FILES WHERE THEY ARE. This build's installer never runs it over the folder it replaces:
# it stages the new files beside that folder and swaps the two whole (etiudaSwap, below). Run over another folder, an
# install moved with /D or the per-user copy an all-users install replaces, it leaves that folder, and the installer then
# deletes from it only its own files (etiudaDropOld). A plain uninstall removes the folder, as electron-builder's does,
# without entering a link (un.etiudaRemoveTree).
!macro customRemoveFiles
  ${IfNot} ${isUpdated} ; plant:update-keeps-files
    SetOutPath $TEMP
    Push $INSTDIR
    Call un.etiudaRemoveTree
  ${EndIf}
!macroend

# ONE SWITCH FOR THE LICENCE. Defined, a ticked box removes the whole folder, licence
# included. Reset keeps those two files; the lists differ on purpose. Comment this
# line out and the same tick keeps etiuda-license.js and etiuda-revoked.json.
!define ETIUDA_REMOVE_LICENCE_WITH_DATA ; plant:uninstall-licence-goes

!macro customUnInstall
  !ifndef INSTALL_CHECKS_OWN_COPY
  ${IfNot} ${isKeepShortcuts}
    Call un.RemoveStaleLinks
  ${EndIf}
  !endif

  # START WITH WINDOWS: this account's Run value goes with the desk (never on an update), and only while it still starts
  # this install's program. Two names: the desk's own, which it writes since this build, and Electron's default id,
  # "electron.app." and the product name, which earlier builds wrote under (the test architect's hold of 23:29).
  ${IfNot} ${isUpdated}
    Push $R8
    Push $R9
    StrCpy $R8 `"$INSTDIR\${APP_EXECUTABLE_FILENAME}"`
    StrLen $R9 $R8
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_ID}"
    StrCpy $0 $0 $R9
    ${If} $0 == $R8
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_ID}"
    ${EndIf}
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.${PRODUCT_NAME}"
    StrCpy $0 $0 $R9
    ${If} $0 == $R8
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.${PRODUCT_NAME}"
    ${EndIf}
    Pop $R9
    Pop $R8
  ${EndIf}

  # THE etiuda: LINK goes with the desk, and only while it still opens this desk: another program's is left as it is.
  # From where the install wrote it, then from the uninstalling account's HKCU, where the desk's own start writes it.
  !ifmacrodef unregisterFileAssociations
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\etiuda\shell\open\command" ""
  ${If} $0 == `"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"`
    DeleteRegKey SHELL_CONTEXT "Software\Classes\etiuda" # plant:f6-link-gone
  ${EndIf}
  ReadRegStr $0 HKCU "Software\Classes\etiuda\shell\open\command" ""
  ${If} $0 == `"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"`
    DeleteRegKey HKCU "Software\Classes\etiuda"
  ${EndIf}
  !endif

  # THE DESK'S OWN DATA STEP. A build with its own Remove my data step (Studio, packaging/installer-pages.nsh
  # un.RemoveUserData, with its own keep list) defines OWN_UNINSTALL_DATA_STEP, so the copy cut from here into its
  # hooks emits none of it: no $RemoveMyData or un.ClearDeskFolder it never declares, and none of the desk's keep rules.
  !ifndef OWN_UNINSTALL_DATA_STEP
  # An update's silent uninstall carries /KEEP_APP_DATA or --updated. Either one keeps the desk's
  # data, whatever the checkbox, and this runs before any folder is removed.
  Push $R0
  Push $R1
  Push $R2
  StrCpy $R0 $CMDLINE
  unResetScan:
    StrCpy $R1 $R0 14
    StrCmp $R1 "/KEEP_APP_DATA" unResetHit
    StrCpy $R1 $R0 9
    StrCmp $R1 "--updated" unResetHit
    StrLen $R2 $R0
    IntCmp $R2 0 unResetDone
    StrCpy $R0 $R0 "" 1
    Goto unResetScan
  unResetHit:
    StrCpy $RemoveMyData "0" ; plant:update-keeps-data
  unResetDone:
    Pop $R2
    Pop $R1
    Pop $R0

  ${If} $RemoveMyData == "1"
    ${If} $installMode == "all"
      SetShellVarContext current
    ${EndIf}
    !ifdef ETIUDA_REMOVE_LICENCE_WITH_DATA
      # Three folder names, licence included. Reset's keep list is the other one, on purpose.
      Push "$APPDATA\${APP_FILENAME}"
      Call un.etiudaRemoveTree
      !ifdef APP_PRODUCT_FILENAME
        Push "$APPDATA\${APP_PRODUCT_FILENAME}"
        Call un.etiudaRemoveTree
      !endif
      !ifdef APP_PACKAGE_NAME
        Push "$APPDATA\${APP_PACKAGE_NAME}"
        Call un.etiudaRemoveTree
      !endif
    !else
      Push "$APPDATA\${APP_FILENAME}"
      Call un.ClearDeskFolder
      !ifdef APP_PRODUCT_FILENAME
        Push "$APPDATA\${APP_PRODUCT_FILENAME}"
        Call un.ClearDeskFolder
      !endif
      !ifdef APP_PACKAGE_NAME
        Push "$APPDATA\${APP_PACKAGE_NAME}"
        Call un.ClearDeskFolder
      !endif
    !endif
    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}
  ${EndIf}
  !endif
!macroend

# AN UPGRADE IS ALL OR NOTHING. tools/patch-nsis.cjs (fix 7) has electron-builder's install section call these: the new
# files go into "<folder>.setup-staging" beside the install while the older copy stays installed, registered and
# startable; only then is the app closed and the folder swapped by two renames, the older copy aside to
# "<folder>.setup-previous" and back if the second rename will not go. A copy in that folder keeps its registration until
# it is written over; the copy aside goes once the new one is registered. Installer only, and after Studio's five hooks.
!ifndef BUILD_UNINSTALLER
!define ETIUDA_STAGE_SUFFIX ".setup-staging"
!define ETIUDA_ASIDE_SUFFIX ".setup-previous"
Var etiudaBase
Var etiudaStage
Var etiudaAside
Var etiudaAsideMade
Var etiudaRunOld
Var etiudaOldDir
Var etiudaOldUserDir
Var etiudaDropRoot
Var etiudaDropList
# Every folder below is removed by the walk that never enters a link (customHeader's ${ETIUDA_REMOVE_TREE}, through
# etiudaRemoveTree): beside a folder a non-administrator may write, or read from HKCU, each may hold one. This compiles the
# walk into the installer as well.
!define ETIUDA_REMOVE_TREE "etiudaRemoveTree"

# THE CLOSE REQUEST (customCheckAppRunning, $R4 "instdir" where $INSTDIR holds the program). A program this run did not
# write, or one a non-administrator may, never runs elevated. The inner instance of an all-users install asks from the
# unelevated instance that started it, as the person whose copy is open (etiudaAsUser): $INSTDIR's program, else the
# copy that person's HKCU names, read there, else the staged one; the copy that runs speaks its own single-instance
# handshake, and the staged one, this build, leaves at once as a first instance (tests/silent-update-desk.js 1152n).
# Unreachable, nothing is asked, and the USERNAME-filtered taskkill and 1618 follow. Any other run is the person's own or
# an installer started elevated: $INSTDIR's program as before, else the staged one, never HKCU's.
!macro etiudaAskCloseRun
  ${If} $R4 == ""
    ReadRegStr $R9 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${If} $R9 != ""
    ${AndIf} ${FileExists} "$R9\${APP_EXECUTABLE_FILENAME}"
      StrCpy $R4 "$R9\${APP_EXECUTABLE_FILENAME}"
    ${EndIf}
  ${EndIf}
  ${If} $R4 == ""
    StrCpy $R4 $R8
  ${EndIf}
  ${If} $R4 != ""
    nsExec::Exec /TIMEOUT=3000 `"$R4" --update-close`
    Pop $R8
  ${EndIf}
  StrCpy $R9 "ran"
!macroend
!macro etiudaAskClose
  ${If} ${UAC_IsInnerInstance}
    Push $R9
    ${If} $R4 == "instdir"
      StrCpy $R4 "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ${EndIf}
    StrCpy $R8 ""
    ${If} $etiudaStage != ""
    ${AndIf} ${FileExists} "$etiudaStage\${APP_EXECUTABLE_FILENAME}"
      StrCpy $R8 "$etiudaStage\${APP_EXECUTABLE_FILENAME}"
    ${EndIf}
    !insertmacro etiudaAsUser etiudaAskCloseRun
    Pop $R9
  ${Else}
    ${If} $R4 == "instdir"
      nsExec::Exec /TIMEOUT=3000 `"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --update-close`
      Pop $R8
    ${Else}
      ${If} $etiudaStage != ""
      ${AndIf} ${FileExists} "$etiudaStage\${APP_EXECUTABLE_FILENAME}"
        nsExec::Exec /TIMEOUT=3000 `"$etiudaStage\${APP_EXECUTABLE_FILENAME}" --update-close`
        Pop $R8
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

# A path's trailing backslashes go: "/D=C:\Apps\Etiuda\" would otherwise stage inside the folder it replaces.
!macro etiudaTrimSlashes VAR
  Push $R9
  ${Do}
    StrCpy $R9 ${VAR} 1 -1
    ${If} $R9 != "\"
    ${AndIf} $R9 != "/"
      ${ExitDo}
    ${EndIf}
    StrCpy ${VAR} ${VAR} -1
  ${Loop}
  Pop $R9
!macroend

# What a failed run says before it ends, where a person is watching: the did-not-finish line, with the exit code.
!macro etiudaFailBox CODE
  ${IfNot} ${Silent}
    Push $2
    StrCpy $2 ${CODE}
    MessageBox MB_OK|MB_ICONSTOP "$(etiudaSetupNotFinished)" /SD IDOK
    Pop $2
  ${EndIf}
!macroend

# A run that ends before the swap takes back what it wrote: the staged folder, and the setup copy installApplicationFiles
# left for an updater this product does not have (customInstall takes it back on success). The installed copy is untouched.
!macro etiudaStageAbort
  ${If} $etiudaStage != ""
    SetOutPath $PLUGINSDIR
    !insertmacro etiudaRemoveTree "$etiudaStage"
  ${EndIf}
  ${if} $installMode == "all"
    SetShellVarContext current
  ${endif}
  Delete "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
  RMDir "$LOCALAPPDATA\${UPDATER_CACHE_DIR}"
  ${if} $installMode == "all"
    SetShellVarContext all
  ${endif}
!macroend

!macro etiudaStageBegin
  Push $0
  # An interactive Update over a folder whose name lacks the product's: electron-builder's instFilesPre (assistedInstaller.nsh)
  # appends "\" and APP_FILENAME, which would nest the new copy inside the older one and leave that one whole. Where $INSTDIR
  # is the registered folder plus that name, holds no program, and the registered folder does, the install goes back into the
  # registered folder, $appExe with it (installSection.nsh set it from the nested path). A silent /D is the deployment tool's
  # own choice, and instFilesPre never ran on it.
  ${IfNot} ${Silent}
    ReadRegStr $0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
    !insertmacro etiudaTrimSlashes $0
    ${If} $0 != ""
    ${AndIf} $INSTDIR == "$0\${APP_FILENAME}"
    ${AndIfNot} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ${AndIf} ${FileExists} "$0\${APP_EXECUTABLE_FILENAME}"
      StrCpy $INSTDIR $0
      StrCpy $appExe "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ${EndIf}
  ${EndIf}
  StrCpy $etiudaBase $INSTDIR
  !insertmacro etiudaTrimSlashes $etiudaBase
  StrCpy $etiudaStage ""
  StrCpy $etiudaAside "$etiudaBase${ETIUDA_ASIDE_SUFFIX}"
  StrCpy $etiudaAsideMade "0"
  StrCpy $etiudaRunOld "1"
  StrCpy $etiudaOldDir ""
  StrCpy $etiudaOldUserDir ""
  StrCpy $etiudaDropRoot ""
  # A drive root has no folder beside it, and its uninstall would empty the drive.
  StrLen $0 $etiudaBase
  ${If} $0 < 4
    DetailPrint `Not installing into "$INSTDIR", a drive root.`
    !insertmacro etiudaFailBox 2
    SetErrorLevel 2
    Quit
  ${EndIf}
  StrCpy $etiudaStage "$etiudaBase${ETIUDA_STAGE_SUFFIX}"
  # Out of the install folder before anything beside it moves: .onInit made it this process's working folder.
  SetOutPath $PLUGINSDIR
  # A swap cut short between its two renames left the older copy aside and no program in its place: it goes back first,
  # tried as the swap's renames are, where the folder is gone or empty (a non-recursive RMDir, so nothing in it is lost).
  # The copy aside is then the only one, so it is removed only once the folder itself holds the program; one that cannot go
  # back ends the run 1618 with the copy aside as it was, and the next run tries again.
  ${If} ${FileExists} "$etiudaAside\${APP_EXECUTABLE_FILENAME}"
  ${AndIfNot} ${FileExists} "$etiudaBase\${APP_EXECUTABLE_FILENAME}"
    RMDir "$etiudaBase"
    ${IfNot} ${FileExists} "$etiudaBase"
      !insertmacro etiudaRenameRetry "$etiudaAside" "$etiudaBase"
    ${EndIf}
  ${EndIf}
  ${If} ${FileExists} "$etiudaAside\${APP_EXECUTABLE_FILENAME}"
  ${AndIfNot} ${FileExists} "$etiudaBase\${APP_EXECUTABLE_FILENAME}"
    DetailPrint `The installed copy is in "$etiudaAside" and could not be moved back; it stays there as it was.`
    !insertmacro etiudaFailBox 1618
    SetErrorLevel 1618
    Quit
  ${EndIf}
  !insertmacro etiudaRemoveTree "$etiudaAside"
  !insertmacro etiudaRemoveTree "$etiudaStage"
  # A stage folder that outlives its removal is another account's, made under a parent anyone may write to and held open: it
  # is never reused and renamed into place with that account's rights. Nothing of this run's is written yet; retry later.
  ${If} ${FileExists} "$etiudaStage\*.*"
  ${OrIf} ${FileExists} "$etiudaStage"
    DetailPrint `"$etiudaStage" is still there after its removal; the installed copy stays as it was.`
    !insertmacro etiudaFailBox 1618
    SetErrorLevel 1618
    Quit
  ${EndIf}
  ClearErrors
  CreateDirectory "$etiudaStage"
  ${If} ${Errors}
  ${OrIfNot} ${FileExists} "$etiudaStage\*.*"
    DetailPrint `Cannot write "$etiudaStage" beside the install.`
    !insertmacro etiudaStageAbort
    !insertmacro etiudaFailBox 2
    SetErrorLevel 2
    Quit
  ${EndIf}
  Pop $0
  SetOutPath "$etiudaStage"
!macroend

# Nsis7z answers nothing, so the stage counts as whole only with the program, its uninstaller, and at least 99 per cent of
# the size electron-builder measured (GetSize truncates, and the stage also holds the uninstaller).
!macro etiudaStageEnd
  Push $0
  Push $1
  Push $3
  Push $4
  SetOutPath $PLUGINSDIR
  RMDir /r "$PLUGINSDIR\7z-out"
  StrCpy $1 "1"
  ${IfNot} ${FileExists} "$etiudaStage\${APP_EXECUTABLE_FILENAME}"
    StrCpy $1 "0"
  ${EndIf}
  ${IfNot} ${FileExists} "$etiudaStage\${UNINSTALL_FILENAME}"
    StrCpy $1 "0"
  ${EndIf}
  !ifdef APP_64_UNPACKED_SIZE
    ${If} $packageArch == "64"
      ${GetSize} "$etiudaStage" "/S=0K" $0 $3 $4
      IntOp $0 $0 * 100
      IntOp $3 ${APP_64_UNPACKED_SIZE} * 99
      ${If} $0 < $3
        StrCpy $1 "0"
      ${EndIf}
    ${EndIf}
  !endif
  ${If} $1 != "1"
    DetailPrint `The files staged in "$etiudaStage" are not complete.`
    !insertmacro etiudaStageAbort
    !insertmacro etiudaFailBox 2
    SetErrorLevel 2
    Quit
  ${EndIf}
  Pop $4
  Pop $3
  Pop $1
  Pop $0
!macroend

# One folder renamed, tried 30 times 2 s apart as a locked extract is, then Retry or Cancel; $0 answers "moved" or not.
!macro etiudaRenameRetry FROM TO
  StrCpy $0 0
  ${Do}
    ClearErrors
    Rename "${FROM}" "${TO}"
    ${IfNot} ${Errors}
      StrCpy $0 "moved"
      ${ExitDo}
    ${EndIf}
    IntOp $0 $0 + 1
    ${If} $0 < 30
      Sleep 2000
    ${ElseIf} ${Cmd} `MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY`
      StrCpy $0 0
    ${Else}
      StrCpy $0 "stuck"
      ${ExitDo}
    ${EndIf}
  ${Loop}
!macroend

# The app is closed and every file staged. The older copy goes aside whole, the staged folder takes its name, and if that
# will not go the older copy is put back and the run ends 1618, retry later. A folder holding no copy of the program (other
# files, from a /D) has no older version to keep whole, so the staged files are copied into it.
!macro etiudaSwap
  Push $0
  SetOutPath $PLUGINSDIR
  ${If} ${FileExists} "$etiudaBase\${APP_EXECUTABLE_FILENAME}"
    !insertmacro etiudaRenameRetry "$etiudaBase" "$etiudaAside"
    ${If} $0 != "moved"
      DetailPrint `"$etiudaBase" is locked; the installed copy stays as it was.`
      !insertmacro etiudaStageAbort
      SetErrorLevel 1618
      Quit
    ${EndIf}
    StrCpy $etiudaAsideMade "1"
  ${Else}
    RMDir "$etiudaBase"
  ${EndIf}
  ${If} ${FileExists} "$etiudaBase\*.*"
    ClearErrors
    CopyFiles /SILENT "$etiudaStage\*.*" "$etiudaBase"
    ${If} ${Errors}
      # A copy cut short is taken back by the staged names, the walk the older folder's clean-up uses (etiudaDropOldFiles),
      # so the folder keeps what it held besides: never set aside, whose removal would take a person's files with it.
      DetailPrint `Cannot copy the staged files into "$etiudaBase"; what was copied is taken back.`
      StrCpy $etiudaDropList $etiudaStage
      StrCpy $etiudaDropRoot $etiudaBase
      Push ""
      Call etiudaDropOldFiles
      StrCpy $etiudaDropRoot ""
      !insertmacro etiudaStageAbort
      SetErrorLevel 1618
      Quit
    ${EndIf}
    !insertmacro etiudaRemoveTree "$etiudaStage"
  ${Else}
    !insertmacro etiudaRenameRetry "$etiudaStage" "$etiudaBase"
    ${If} $0 != "moved"
      ${If} $etiudaAsideMade == "1"
        !insertmacro etiudaRenameRetry "$etiudaAside" "$etiudaBase"
        ${If} $0 != "moved"
          DetailPrint `The installed copy is in "$etiudaAside" and could not be moved back; the next run moves it back first.`
          !insertmacro etiudaStageAbort
          !insertmacro etiudaFailBox 2
          SetErrorLevel 2
          Quit
        ${EndIf}
        StrCpy $etiudaAsideMade "0"
      ${EndIf}
      DetailPrint `The staged folder could not take the name "$etiudaBase"; the installed copy stays as it was.`
      !insertmacro etiudaStageAbort
      SetErrorLevel 1618
      Quit
    ${EndIf}
  ${EndIf}
  # The older copy's uninstaller has nothing left to do where its folder was the one replaced: its registration is the same
  # keys, written over next. It still runs for a copy registered in another folder.
  ReadRegStr $0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  !insertmacro etiudaTrimSlashes $0
  ${If} $0 == $etiudaBase
    StrCpy $etiudaRunOld "0"
    # Same folder, so every shortcut's target still stands: the person's own, moved, renamed or given a key, are kept
    # (electron-builder's keep-shortcuts branch). A folder that changed has them made again, at the new target.
    StrCpy $keepShortcuts "true"
  ${Else}
    !insertmacro etiudaOldFolder $0 $etiudaOldDir
  ${EndIf}
  # An all-users install also uninstalls this account's per-user copy (installSection.nsh), whose folder is left too.
  ${If} $installMode == "all"
    ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    !insertmacro etiudaTrimSlashes $0
    !insertmacro etiudaOldFolder $0 $etiudaOldUserDir
  ${EndIf}
  Pop $0
!macroend

# An older copy's folder, read before its uninstaller runs, counts only if it holds the program, is no drive root, and is
# neither the new folder nor inside it nor holding it; OUT is left empty otherwise, and nothing there is removed.
!macro etiudaOldFolder DIR OUT
  Push $1
  Push $2
  Push $3
  Push $4
  StrCpy ${OUT} ""
  StrLen $3 ${DIR}
  ${If} $3 >= 4
  ${AndIf} ${FileExists} "${DIR}\${APP_EXECUTABLE_FILENAME}"
    StrCpy $1 "${DIR}\"
    StrCpy $2 "$etiudaBase\"
    StrLen $3 $1
    StrCpy $4 $2 $3
    ${If} $4 != $1
      StrLen $3 $2
      StrCpy $4 $1 $3
      ${If} $4 != $2
        StrCpy ${OUT} ${DIR}
      ${EndIf}
    ${EndIf}
  ${EndIf}
  Pop $4
  Pop $3
  Pop $2
  Pop $1
!macroend

# THE OLDER FOLDER, ONCE THE NEW COPY IS REGISTERED: its list is the files this installer has just written
# ($etiudaDropList, the new folder, walked), and each is deleted in $etiudaDropRoot by the same relative name, once, never
# retried. Folders go only when empty, so a person's own file stays, as does anything locked, and the run still ends 0.
# Electron's resources and locales trees are the one exception, removed whole where the folder still holds the program
# (etiudaDropOld). The same walk takes back a copy cut short (etiudaSwap), its list the stage.
# NO LINK IS ENTERED: the older folder is read from HKCU or is one a non-administrator may write, and Delete through a
# junction deletes in its target. Each folder there is entered only where its attributes say a real folder; a link goes
# as itself, as in ${ETIUDA_REMOVE_TREE}; a root that is itself a link is left whole.
# COMPILED FROM customHeader, NOT WHERE THIS FILE IS READ: electron-builder's !addplugindir comes after this file in its
# script, and makensis 3.12 refuses every later System::Call ("conflicts with a plugin in another directory") once one has
# been compiled before the bundle's own plug-in folder was added again (3.04 did not). Plain jumps, as written for a file
# read before LogicLib.
!macro etiudaDropOldFilesFunction
Function etiudaDropOldFiles
  Exch $R0
  Push $R1
  Push $R2
  Push $R3
  StrCmp $R0 "" 0 etiudaDropOldList
    StrCpy $R3 "$etiudaDropRoot"
    System::Call 'kernel32::GetFileAttributesW(w R3) i .R3'
    IntCmp $R3 -1 etiudaDropOldOut
    IntOp $R3 $R3 & 0x410
    IntCmp $R3 0x10 0 etiudaDropOldOut etiudaDropOldOut
  etiudaDropOldList:
  FindFirst $R1 $R2 "$etiudaDropList$R0\*.*"
  etiudaDropOldNext:
    StrCmp $R2 "" etiudaDropOldDone
    StrCmp $R2 "." etiudaDropOldSkip
    StrCmp $R2 ".." etiudaDropOldSkip
    IfFileExists "$etiudaDropList$R0\$R2\*.*" 0 etiudaDropOldFile
      StrCpy $R3 "$etiudaDropRoot$R0\$R2"
      System::Call 'kernel32::GetFileAttributesW(w R3) i .R3'
      IntCmp $R3 -1 etiudaDropOldSkip
      IntOp $R3 $R3 & 0x410
      IntCmp $R3 0x10 etiudaDropOldDir
      IntCmp $R3 0 etiudaDropOldSkip
        RMDir "$etiudaDropRoot$R0\$R2"
        Delete "$etiudaDropRoot$R0\$R2"
        Goto etiudaDropOldSkip
      etiudaDropOldDir:
      Push "$R0\$R2"
      Call etiudaDropOldFiles
      RMDir "$etiudaDropRoot$R0\$R2"
      Goto etiudaDropOldSkip
    etiudaDropOldFile:
      Delete "$etiudaDropRoot$R0\$R2"
    etiudaDropOldSkip:
      FindNext $R1 $R2
      Goto etiudaDropOldNext
  etiudaDropOldDone:
  FindClose $R1
  etiudaDropOldOut:
  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
FunctionEnd
!macroend

!macro etiudaDropOld DIR
  ${If} ${DIR} != ""
    Push $0
    StrCpy $etiudaDropList $etiudaBase
    StrCpy $etiudaDropRoot ${DIR}
    # Only a real folder: one that is itself a link would lead every name below it, the two trees included, into its target.
    StrCpy $0 $etiudaDropRoot
    System::Call 'kernel32::GetFileAttributesW(w r0) i .r0'
    IntOp $0 $0 & 0x410
    ${If} $0 = 0x10
      # A file the older version shipped and this one does not would keep resources and locales, and the folder, for ever:
      # the two trees go whole where the folder still holds the program, read before the walk deletes it. The folder itself
      # goes only once empty.
      StrCpy $0 "0"
      ${If} ${FileExists} "$etiudaDropRoot\${APP_EXECUTABLE_FILENAME}"
        StrCpy $0 "1"
      ${EndIf}
      Push ""
      Call etiudaDropOldFiles
      ${If} $0 == "1"
        !insertmacro etiudaRemoveTree "$etiudaDropRoot\resources"
        !insertmacro etiudaRemoveTree "$etiudaDropRoot\locales"
      ${EndIf}
      RMDir "$etiudaDropRoot"
    ${EndIf}
    StrCpy $etiudaDropRoot ""
    Pop $0
  ${EndIf}
  ClearErrors
!macroend

# After the swap an older copy that would not uninstall is noted and the run goes on to register the new one; stopping
# here, as electron-builder does, would leave the new files with neither copy registered.
!macro customUnInstallCheck
  ${If} ${Errors}
    DetailPrint `The older copy's uninstaller could not be started.`
  ${ElseIf} $R0 != 0
    DetailPrint `The older copy's uninstaller ended with $R0.`
  ${EndIf}
  ClearErrors
!macroend
!macro customUnInstallCheckCurrentUser
  !insertmacro customUnInstallCheck
!macroend

# The new copy is registered: the older copy aside goes, and an older copy's folder elsewhere loses the program's files.
# AN OLDER FOLDER READ FROM HKCU IS EMPTIED ONLY AS THE PERSON (the test architect, on d30e0cbb): the walk reads the folder and
# each entry, not a junction among the folders above it, and etiudaOldFolder compares strings, so "U\j\Etiuda" with j pointing
# at the new install's parent would have an elevated run delete its own fresh copy. In an all-users install the per-user copy's
# folder goes from the unelevated instance (etiudaAsUser), with that person's rights; none reached, or an installer started
# elevated, it is left as it is (README: a deployment tool may leave one). A per-user install empties HKCU's folder only when it
# runs unelevated. HKLM's InstallLocation, which only an administrator writes, keeps its drop. Only the registers cross, so the
# run takes the new folder in $R7 and the older one in $R8.
!macro etiudaDropOldRun
  StrCpy $etiudaBase $R7
  !insertmacro etiudaDropOld $R8
  StrCpy $R9 "ran"
!macroend
!macro etiudaDropAside
  ${If} $etiudaAsideMade == "1"
    !insertmacro etiudaRemoveTree "$etiudaAside"
  ${EndIf}
  ${If} $installMode == "all"
    !insertmacro etiudaDropOld $etiudaOldDir
    ${If} $etiudaOldUserDir != ""
    ${AndIf} ${UAC_IsInnerInstance}
      Push $R7
      Push $R8
      Push $R9
      StrCpy $R7 $etiudaBase
      StrCpy $R8 $etiudaOldUserDir
      !insertmacro etiudaAsUser etiudaDropOldRun
      Pop $R9
      Pop $R8
      Pop $R7
    ${EndIf}
  ${Else}
    ${IfNot} ${UAC_IsAdmin}
      !insertmacro etiudaDropOld $etiudaOldDir
    ${EndIf}
  ${EndIf}
!macroend
!endif

# RUN AS THE PERSON, from an elevated instance: the macro named by RUN runs in the unelevated instance that started this
# one, and only the registers cross, both ways. $R9 reads "unreached" after unless RUN set it, so a caller can tell that
# nothing ran: no such instance (an installer started elevated has none), or it could not be reached.
!define ETIUDA_AS_USER_N 0
!macro etiudaAsUser RUN
  !define /redef /math ETIUDA_AS_USER_N ${ETIUDA_AS_USER_N} + 1
  StrCpy $R9 "unreached"
  ${If} ${UAC_IsInnerInstance}
    Goto etiudaAsUserCall${ETIUDA_AS_USER_N}
  etiudaAsUserRun${ETIUDA_AS_USER_N}:
    !insertmacro ${RUN}
    Return
  etiudaAsUserCall${ETIUDA_AS_USER_N}:
    !insertmacro UAC_AsUser_Call Label etiudaAsUserRun${ETIUDA_AS_USER_N} ${UAC_SYNCREGISTERS}
  ${EndIf}
!macroend

# A folder removed without entering a link, from anywhere a function may be called: un.etiudaRemoveTree in customHeader.
# The hooks call it directly, since Studio's cut of them stops before this macro.
!macro etiudaRemoveTree FOLDER
  Push `${FOLDER}`
  Call ${ETIUDA_REMOVE_TREE}
!macroend

# A COPY INSTALLED FOR ONE ACCOUNT, met by an all-users install, is removed by its own uninstaller run as that account
# (etiudaAsUser): the file, and the HKCU key naming it, are that account's to write. tools/patch-nsis.cjs inserts this
# where the template ran it elevated. The error flag rides back in $R9; $appExe goes over in $R8.
!macro etiudaOldUserCopyRun
  StrCpy $appExe $R8
  InitPluginsDir
  !insertmacro uninstallOldVersion HKEY_CURRENT_USER
  StrCpy $R9 "ran"
  ${If} ${Errors}
    StrCpy $R9 "failed"
  ${EndIf}
!macroend
!macro etiudaOldUserCopy
  ${If} ${UAC_IsInnerInstance}
    Push $R8
    Push $R9
    StrCpy $R8 $appExe
    !insertmacro etiudaAsUser etiudaOldUserCopyRun
    ${If} $R9 == "unreached"
      Pop $R9
      Pop $R8
    ${Else}
      ClearErrors
      ${If} $R9 == "failed"
        SetErrors
      ${EndIf}
      Pop $R9
      Pop $R8
      !insertmacro handleUninstallResult HKEY_CURRENT_USER
    ${EndIf}
  ${Else}
    # An installer started elevated has no unelevated instance, and this one never runs that file: the copy stays
    # registered, and the finish page says so wherever HKCU names an uninstaller, as uninstallOldVersion would read it.
    Push $R9
    ReadRegStr $R9 HKCU "${UNINSTALL_REGISTRY_KEY}" UninstallString
    !ifdef UNINSTALL_REGISTRY_KEY_2
      ${If} $R9 == ""
        ReadRegStr $R9 HKCU "${UNINSTALL_REGISTRY_KEY_2}" UninstallString
      ${EndIf}
    !endif
    ${If} $R9 != ""
      StrCpy $etiudaFinishText "$(etiudaOldCopyLeft)"
    ${EndIf}
    Pop $R9
  ${EndIf}
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
  StrCpy $etiudaFinishText "$(MUI_TEXT_FINISH_INFO_TEXT)"
  # "/D=C:\Apps\Etiuda\" keeps its backslash: GetDParameter (multiUser.nsh) copies it into $INSTDIR past NSIS's own trim, and
  # $appExe, the etiuda: command and InstallLocation would carry "\\", which the uninstaller's compare then misses. Trimmed
  # once here, in .onInit after initMultiUser has read /D, before any page and the install section, silent or not.
  !insertmacro etiudaTrimSlashes $INSTDIR
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
  StrCpy $RemoveMyData "0"
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
# THE FINISH PAGE'S TEXT, Modern UI's own unless etiudaOldUserCopy left a copy registered. With the Run box on the page
# the label is 195 by 40 dialog units, about five lines, so the case's text replaces the whole of it rather than adding.
Var etiudaFinishText
!define MUI_FINISHPAGE_TEXT "$etiudaFinishText"
!endif
# The uninstaller's own: the installer pass never reads them, and makensis's warning 6001 for an unused variable
# is an error in this build.
!ifdef BUILD_UNINSTALLER
Var RemoveMyData
Var RemoveDataBox
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
    LangString RecogniseOlderText ${ID} "Na tym komputerze jest już program ${PRODUCT_NAME} w wersji $InstalledVersion, a ten instalator zawiera nowszą wersję ${VERSION}. Zaktualizować do wersji ${VERSION}?$\r$\n$\r$\nDane na tym komputerze i licencja zostają bez zmian."
    LangString RecogniseSameText ${ID} "Na tym komputerze jest już program ${PRODUCT_NAME} w wersji $InstalledVersion, tej samej co w instalatorze. Zainstalować go ponownie?$\r$\n$\r$\nDane na tym komputerze i licencja zostają bez zmian."
    LangString RecogniseNewerText ${ID} "Na tym komputerze jest już program ${PRODUCT_NAME} w wersji $InstalledVersion, nowszej niż wersja ${VERSION} z tego instalatora. Zainstalować w jej miejsce wersję ${VERSION}?$\r$\n$\r$\nDane na tym komputerze i licencja zostają bez zmian."
    LangString RecogniseUnreadableText ${ID} "Na tym komputerze jest już program ${PRODUCT_NAME}, ale nie da się odczytać jego wersji. Zainstalować w jego miejsce wersję ${VERSION}?$\r$\n$\r$\nDane na tym komputerze i licencja zostają bez zmian."
    LangString etiudaOldCopyLeft ${ID} "Etiuda jest zainstalowana. Na tym komputerze jest też inna kopia, zainstalowana tylko dla jednego konta. Wszystko jest w porządku: można ją usunąć na tym koncie, z listy zainstalowanych aplikacji w Windows."
    !endif
    LangString etiudaSetupNotFinished ${ID} "Instalacja programu ${PRODUCT_NAME} nie została ukończona. Pomóc może ponowne uruchomienie instalatora; jeśli znów się zatrzyma, ten kod pomoże ustalić przyczynę: $2."

    LangString RemoveDataBox ${ID} "Usuń także dane z tego komputera"
    LangString RemoveDataLine ${ID} "Usuwa również dane Etiudy z tego komputera: ustawienia, rozmowy, licencję, własne karty i gwiazdki oraz miejsce tego stanowiska w zespole, więc zapieczętowany katalog otworzy się dopiero po nowym zaproszeniu od lidera zespołu. Pliki katalogów zostają."
  !else
    LangString TurnWelcomeTitle ${ID} "Welcome to Etiuda"
    LangString TurnWelcomeText ${ID} "Etiuda keeps a team's replies at hand, ready to copy into any conversation with a customer.$\r$\n$\r$\nSetup installs it for this Windows account only, so no administrator rights are needed for the folder it suggests. If Etiuda is open, Setup asks for it to be closed first.$\r$\n$\r$\nPress Next to go on."
    LangString TurnUnWelcomeTitle ${ID} "Removing Etiuda"
    LangString TurnUnWelcomeText ${ID} "This removes Etiuda from this computer. Its catalogs and settings stay where they are, so installing it again finds them as they were.$\r$\n$\r$\nPress Next to go on."


    !ifndef BUILD_UNINSTALLER
    LangString RecogniseOlderText ${ID} "${PRODUCT_NAME} $InstalledVersion is installed on this computer, and this installer holds ${VERSION}, which is newer. Update to ${VERSION}?$\r$\n$\r$\nData on this computer and the licence stay as they are."
    LangString RecogniseSameText ${ID} "${PRODUCT_NAME} $InstalledVersion is already installed on this computer, the same version as this installer. Reinstall it?$\r$\n$\r$\nData on this computer and the licence stay as they are."
    LangString RecogniseNewerText ${ID} "${PRODUCT_NAME} $InstalledVersion is installed on this computer, which is newer than this installer's ${VERSION}. Reinstall ${VERSION} in its place?$\r$\n$\r$\nData on this computer and the licence stay as they are."
    LangString RecogniseUnreadableText ${ID} "${PRODUCT_NAME} is already installed on this computer, but its version cannot be read. Reinstall ${VERSION} in its place?$\r$\n$\r$\nData on this computer and the licence stay as they are."
    LangString etiudaOldCopyLeft ${ID} "Etiuda is installed. Another copy, installed for one account only, is also on this computer. Nothing is wrong: it can be removed in that account, from the list of installed apps in Windows."
    !endif
    LangString etiudaSetupNotFinished ${ID} "The installation of ${PRODUCT_NAME} did not finish. Running the installer again may help; if it stops again, this code helps find the cause: $2."

    LangString RemoveDataBox ${ID} "Remove my data"
    LangString RemoveDataLine ${ID} "Also removes Etiuda's data on this computer: settings, conversations, the licence, own cards and stars, and this desk's place on its team, so a sealed catalog opens again only after a new invitation from the team's lead. The catalog files stay."
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
  # Leaves the two licence files and the folder. Used only when the licence switch (ETIUDA_REMOVE_LICENCE_WITH_DATA)
  # is commented out; while it is defined nothing calls this, and makensis's warning 6010 for an unreferenced
  # function is an error in this build, so the function is compiled only when it is called.
  !ifndef ETIUDA_REMOVE_LICENCE_WITH_DATA
  Function un.ClearDeskFolder
    Exch $R0
    Push $R1
    Push $R2
    # A folder only, never a link to one (un.etiudaRemoveTree).
    System::Call 'kernel32::GetFileAttributesW(w R0) i .R1'
    IntCmp $R1 -1 unClearDeskDone
    IntOp $R1 $R1 & 0x410
    IntCmp $R1 0x10 0 unClearDeskDone unClearDeskDone
    FindFirst $R1 $R2 "$R0\*.*"
    unClearDeskLoop:
      StrCmp $R2 "" unClearDeskClose
      StrCmp $R2 "." unClearDeskNext
      StrCmp $R2 ".." unClearDeskNext
      StrCmp $R2 "etiuda-license.js" unClearDeskNext
      StrCmp $R2 "etiuda-revoked.json" unClearDeskNext
      Push "$R0\$R2"
      Call un.etiudaRemoveTree
      unClearDeskNext:
        FindNext $R1 $R2
        Goto unClearDeskLoop
    unClearDeskClose:
      FindClose $R1
    unClearDeskDone:
      Pop $R2
      Pop $R1
      Pop $R0
  FunctionEnd
  !endif
  Function un.RemoveDataCreate
    ${If} ${Silent}
      Abort
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "$(TurnUnWelcomeTitle)" "$(RemoveDataBox)"
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateCheckbox} 0 0 100% 12u "$(RemoveDataBox)"
    Pop $RemoveDataBox
    ${NSD_CreateLabel} 0 18u 100% 60u "$(RemoveDataLine)"
    Pop $0
    nsDialogs::Show
  FunctionEnd
  Function un.RemoveDataLeave
    Push $0
    ${NSD_GetState} $RemoveDataBox $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $RemoveMyData "1"
    ${Else}
      StrCpy $RemoveMyData "0"
    ${EndIf}
    Pop $0
  FunctionEnd
  UninstPage custom un.RemoveDataCreate un.RemoveDataLeave
!macroend

# The folder page's warning for an all-users install into a folder ordinary users can change: its macros only, which
# tools/patch-nsis.cjs (fix 5b) inserts before the page.
!include /CHARSET=UTF8 "${BUILD_RESOURCES_DIR}\installer\allusers-folder.nsh"
