# AN ALL-USERS INSTALL INTO A FOLDER ORDINARY USERS CAN CHANGE IS NEVER UNSEEN. tools/patch-nsis.cjs (fix 5b) inserts this
# before electron-builder's folder page and makes etiudaFolderLeave its leave function, so it runs on Next and never in a
# silent run, which shows no page. Outside Program Files it reads who may change the folder and its parent by SID, since a
# Polish Windows names the groups in Polish. Where one of the five may, or it cannot be told, a box asks: Yes installs there
# and No stays on the page.

# What lets an account change what runs: add a file (0x2) or a folder (0x4), delete a child (0x40), delete (0x10000), change
# the DACL (0x40000) or the owner (0x80000), and the generic all (0x10000000) and write (0x40000000) of an inheritable entry.
!define ETIUDA_CHANGE_MASK 0x500D0046
!define ETIUDA_INHERIT_ONLY 0x8
!define ETIUDA_DOMAIN_USERS_RID 513

!macro etiudaFolderCheck
  Var etiudaFolderBack

  # [folder, "any" or "self"] on the stack, "1", "0" or "?" back. "1" where an allowed entry (ACE type 0 or 9) for Users,
  # Authenticated Users, Everyone, INTERACTIVE or a domain's Domain Users holds a right above, or the DACL is NULL; "?"
  # where it cannot be read. "self" passes over inherit-only entries, which reach what the folder holds and not the folder.
  Function etiudaFolderOpen
    Exch $R1
    Exch
    Exch $R0
    Push $0
    Push $1
    Push $2
    Push $3
    Push $4
    Push $5
    Push $6
    Push $7
    Push $8
    Push $9
    Push $R2
    Push $R3
    Push $R4
    Push $R5
    Push $R6
    StrCpy $R6 "?"
    System::Call 'advapi32::GetNamedSecurityInfoW(w R0, i 1, i 4, p 0, p 0, *p .r0, p 0, *p .r1) i .r2'
    ${If} $2 = 0
      StrCpy $R6 "1"
      ${If} $0 P<> 0
        StrCpy $R6 "0"
        System::Call 'advapi32::ConvertStringSidToSidW(w "S-1-5-32-545", *p .R2)'
        System::Call 'advapi32::ConvertStringSidToSidW(w "S-1-5-11", *p .R3)'
        System::Call 'advapi32::ConvertStringSidToSidW(w "S-1-1-0", *p .R4)'
        System::Call 'advapi32::ConvertStringSidToSidW(w "S-1-5-4", *p .R5)'
        System::Call '*$0(&i1, &i1, &i2, &i2 .r3)'
        StrCpy $4 0
        ${DoWhile} $4 < $3
          System::Call 'advapi32::GetAce(p r0, i r4, *p .r5) i .r2'
          ${If} $2 = 0
            StrCpy $R6 "?"
            ${ExitDo}
          ${EndIf}
          System::Call '*$5(&i1 .r6, &i1 .r7, &i2, i .r8)'
          IntOp $9 $7 & ${ETIUDA_INHERIT_ONLY}
          IntOp $8 $8 & ${ETIUDA_CHANGE_MASK}
          ${If} $R1 == "any"
            StrCpy $9 0
          ${EndIf}
          ${If} $6 = 0
          ${OrIf} $6 = 9
            ${If} $9 = 0
            ${AndIf} $8 <> 0
              IntPtrOp $5 $5 + 8
              System::Call 'advapi32::EqualSid(p r5, p R2) i .r2'
              ${If} $2 = 0
                System::Call 'advapi32::EqualSid(p r5, p R3) i .r2'
              ${EndIf}
              ${If} $2 = 0
                System::Call 'advapi32::EqualSid(p r5, p R4) i .r2'
              ${EndIf}
              ${If} $2 = 0
                System::Call 'advapi32::EqualSid(p r5, p R5) i .r2'
              ${EndIf}
              # Domain Users by its shape, since its SID is the domain's own: authority 5, five subauthorities, the first 21
              # and the last ${ETIUDA_DOMAIN_USERS_RID}.
              ${If} $2 = 0
                System::Call 'advapi32::GetSidSubAuthorityCount(p r5) p .r6'
                System::Call '*$6(&i1 .r6)'
                ${If} $6 = 5
                  System::Call 'advapi32::GetSidIdentifierAuthority(p r5) p .r6'
                  System::Call '*$6(&i4 .r7, &i1 .r8, &i1 .r9)'
                  System::Call 'advapi32::GetSidSubAuthority(p r5, i 0) p .r6'
                  System::Call '*$6(i .r6)'
                  ${If} $7 = 0
                  ${AndIf} $8 = 0
                  ${AndIf} $9 = 5
                  ${AndIf} $6 = 21
                    System::Call 'advapi32::GetSidSubAuthority(p r5, i 4) p .r6'
                    System::Call '*$6(i .r6)'
                    ${If} $6 = ${ETIUDA_DOMAIN_USERS_RID}
                      StrCpy $2 1
                    ${EndIf}
                  ${EndIf}
                ${EndIf}
              ${EndIf}
              ${If} $2 <> 0
                StrCpy $R6 "1"
                ${ExitDo}
              ${EndIf}
            ${EndIf}
          ${EndIf}
          IntOp $4 $4 + 1
        ${Loop}
        System::Call 'kernel32::LocalFree(p R2)'
        System::Call 'kernel32::LocalFree(p R3)'
        System::Call 'kernel32::LocalFree(p R4)'
        System::Call 'kernel32::LocalFree(p R5)'
      ${EndIf}
      System::Call 'kernel32::LocalFree(p r1)'
    ${EndIf}
    StrCpy $R0 $R6
    Pop $R6
    Pop $R5
    Pop $R4
    Pop $R3
    Pop $R2
    Pop $9
    Pop $8
    Pop $7
    Pop $6
    Pop $5
    Pop $4
    Pop $3
    Pop $2
    Pop $1
    Pop $0
    Exch
    Pop $R1
    Exch $R0
  FunctionEnd

  # The folder instFilesPre will install into, read as it reads it. An existing one is judged by every entry it holds and
  # its parent by those that apply to the parent; a missing one by every entry of the nearest folder above that exists,
  # which it and the folders between will inherit. A bare drive is read as its root ("D:" alone is that drive's current
  # folder); a path with nothing readable above it is one whose permissions could not be read.
  Function etiudaFolderLeave
    StrCpy $etiudaFolderBack "0"
    ${If} $installMode == "all"
      Push $0
      Push $1
      Push $2
      Push $3
      Push $4
      StrCpy $0 $INSTDIR
      StrCpy $1 $0 1 -1
      ${If} $1 == "\"
        StrCpy $0 $0 -1
      ${EndIf}
      ${StrContains} $1 "${APP_FILENAME}" $INSTDIR
      ${If} $1 == ""
        StrCpy $0 "$0\${APP_FILENAME}"
      ${EndIf}
      StrCpy $2 "0"
      StrLen $3 $PROGRAMFILES64
      StrCpy $4 $0 $3
      StrCpy $1 $0 1 $3
      ${If} $4 == $PROGRAMFILES64
      ${AndIf} $1 == "\"
        StrCpy $2 "skip"
      ${EndIf}
      StrLen $3 $PROGRAMFILES
      StrCpy $4 $0 $3
      StrCpy $1 $0 1 $3
      ${If} $4 == $PROGRAMFILES
      ${AndIf} $1 == "\"
        StrCpy $2 "skip"
      ${EndIf}
      ${If} $2 != "skip"
        StrCpy $1 $0
        StrCpy $3 "here"
        StrCpy $4 0
        ${DoUntil} ${FileExists} "$1\*.*"
          IntOp $4 $4 + 1
          ${GetParent} $1 $2
          ${If} $2 == ""
          ${OrIf} $2 == $1
          ${OrIf} $4 > 64
            StrCpy $1 ""
            ${ExitDo}
          ${EndIf}
          StrCpy $1 $2
          StrCpy $3 "above"
        ${Loop}
        ${If} $1 == ""
          StrCpy $2 "?"
        ${Else}
          !insertmacro etiudaFolderRoot $1
          Push $1
          Push "any"
          Call etiudaFolderOpen
          Pop $2
          ${If} $2 != "1"
          ${AndIf} $3 == "here"
            ${GetParent} $0 $1
            StrCpy $4 "?"
            ${If} $1 != ""
              !insertmacro etiudaFolderRoot $1
              Push $1
              Push "self"
              Call etiudaFolderOpen
              Pop $4
            ${EndIf}
            ${If} $4 != "0"
              StrCpy $2 $4
            ${EndIf}
          ${EndIf}
        ${EndIf}
        # "1" where one of the groups can change either folder, which outranks "?", one that could not be read.
        ${If} $2 == "1"
          ${If} $LANGUAGE == 1045
            StrCpy $1 "Ten folder lub folder nad nim mogą zmieniać osoby bez uprawnień administratora, a wraz z nim to, co ${PRODUCT_NAME} uruchamia dla wszystkich. Bezpieczniej w Program Files lub w folderze, którego nie mogą zmieniać. Zainstalować mimo to?"
          ${Else}
            StrCpy $1 "This folder, or the one above it, can be changed by people who are not administrators, and with it what ${PRODUCT_NAME} runs for everyone. Program Files, or a folder they cannot change, is safer. Install here anyway?"
          ${EndIf}
        ${ElseIf} $2 == "?"
          ${If} $LANGUAGE == 1045
            StrCpy $1 "Nie udało się ustalić, kto może zmieniać ten folder ani folder nad nim. Bezpieczniej w Program Files lub w folderze, który mogą zmieniać tylko administratorzy. Zainstalować mimo to?"
          ${Else}
            StrCpy $1 "Setup could not tell who can change this folder, or the one above it. Program Files, or a folder only administrators can change, is safer. Install here anyway?"
          ${EndIf}
        ${EndIf}
        ${If} $2 != "0"
          ${If} ${Cmd} `MessageBox MB_YESNO "$1" /SD IDYES IDNO`
            StrCpy $etiudaFolderBack "1"
          ${EndIf}
        ${EndIf}
      ${EndIf}
      Pop $4
      Pop $3
      Pop $2
      Pop $1
      Pop $0
    ${EndIf}
    ${If} $etiudaFolderBack == "1"
      Abort
    ${EndIf}
  FunctionEnd
!macroend

!macro etiudaFolderRoot VAR
  Push $R9
  StrCpy $R9 ${VAR} 1 1
  ${If} $R9 == ":"
    StrLen $R9 ${VAR}
    ${If} $R9 = 2
      StrCpy ${VAR} "${VAR}\"
    ${EndIf}
  ${EndIf}
  Pop $R9
!macroend
