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
