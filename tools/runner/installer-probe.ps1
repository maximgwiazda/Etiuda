# WHAT A HOSTED WINDOWS RUNNER IS, before any installer leg is trusted there (the test architect, 2026-11-12).
#
# Installs nothing, launches no Etiuda, and writes the registry only where noted: one standard account made and removed again.
# Prints facts, one per line, "fact <name>: <value>", and writes the same lines to -Out. Nothing here is a verdict; the legs that
# follow are shaped by what it finds:
#   - who the job runs as, its groups and integrity level (an elevated admin, a split token, or a standard user);
#   - whether UAC is on (EnableLUA) and how an admin is asked (ConsentPromptBehaviorAdmin), which says whether finding 1's
#     same-user split token can be modelled here at all;
#   - whether a second, standard account can be made and a process started as it with its own profile loaded (its HKCU), by
#     Start-Process -Credential and, if that is refused, by a one-shot scheduled task;
#   - whether a scheduled task can run as SYSTEM, which leg (c) of the four (a bare /S as SYSTEM) needs;
#   - whether a directory junction can be made, which the swap's repair 10 legs need.
# The standard account's password is made here, used here and never printed or written; the account is removed at the end.
param([Parameter(Mandatory = $true)][string]$Out)
$ErrorActionPreference = "Continue"
$lines = New-Object System.Collections.Generic.List[string]
function Fact([string]$name, [string]$value) { $l = "fact ${name}: $value"; $lines.Add($l); Write-Output $l }

# 1. Who the job is.
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$p = New-Object Security.Principal.WindowsPrincipal($id)
Fact "user" $id.Name
Fact "admin-role-active" ($p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))
$il = (whoami /groups | Select-String -Pattern "Mandatory Label\\(\w+) Mandatory Level").Matches | ForEach-Object { $_.Groups[1].Value } | Select-Object -First 1
Fact "integrity" $il
Fact "session-id" ([System.Diagnostics.Process]::GetCurrentProcess().SessionId)

# 2. UAC.
$sys = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"
foreach ($v in "EnableLUA", "ConsentPromptBehaviorAdmin", "PromptOnSecureDesktop", "FilterAdministratorToken") {
  $got = (Get-ItemProperty -Path $sys -Name $v -ErrorAction SilentlyContinue).$v
  Fact ("uac-" + $v) $(if ($null -eq $got) { "(absent)" } else { $got })
}

# 3. A second, standard account, and a process as it with its profile (so its own HKCU) loaded.
$name = "etst" + (Get-Random -Minimum 10000 -Maximum 99999)
$bytes = New-Object byte[] 24; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$plain = "Aa1!" + [Convert]::ToBase64String($bytes)
$secure = ConvertTo-SecureString $plain -AsPlainText -Force
$made = $false
try { New-LocalUser -Name $name -Password $secure -PasswordNeverExpires -AccountNeverExpires -ErrorAction Stop | Out-Null; $made = $true } catch { Fact "standard-user-made" ("no: " + $_.Exception.Message) }
if ($made) {
  Fact "standard-user-made" "yes"
  $cred = New-Object Management.Automation.PSCredential(".\$name", $secure)
  $drop = Join-Path $env:RUNNER_TEMP ("as-" + $name)
  New-Item -ItemType Directory -Force -Path $drop | Out-Null
  icacls $drop /grant "${name}:(OI)(CI)M" | Out-Null
  $who = Join-Path $drop "whoami.txt"
  try {
    $proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c whoami /groups > `"$who`" & reg query HKCU\Environment >> `"$who`" 2>&1" -Credential $cred -LoadUserProfile -WorkingDirectory $drop -WindowStyle Hidden -PassThru -Wait -ErrorAction Stop
    Fact "start-as-standard" ("exit " + $proc.ExitCode)
  } catch { Fact "start-as-standard" ("refused: " + $_.Exception.Message) }
  if (Test-Path $who) {
    $t = Get-Content $who -Raw
    Fact "standard-integrity" ((([regex]"Mandatory Label\\(\w+) Mandatory Level").Match($t)).Groups[1].Value)
    Fact "standard-is-admin" ($t -match "BUILTIN\\Administrators")
    Fact "standard-hkcu-loaded" ($t -match "HKEY_CURRENT_USER\\Environment")
  } else {
    # The fallback: a one-shot task as that account, run now and removed.
    $task = "etst-probe-" + $name
    schtasks /Create /TN $task /TR "cmd.exe /c whoami /groups > `"$who`"" /SC ONCE /ST 23:59 /RU ".\$name" /RP $plain /F | Out-Null
    schtasks /Run /TN $task | Out-Null
    for ($i = 0; $i -lt 30 -and -not (Test-Path $who); $i++) { Start-Sleep -Seconds 1 }
    schtasks /Delete /TN $task /F | Out-Null
    Fact "task-as-standard" $(if (Test-Path $who) { "ran" } else { "did not run in 30 s" })
    if (Test-Path $who) { Fact "standard-integrity" ((([regex]"Mandatory Label\\(\w+) Mandatory Level").Match((Get-Content $who -Raw))).Groups[1].Value) }
  }
}

# 4. A one-shot task as SYSTEM.
$sysOut = Join-Path $env:RUNNER_TEMP "as-system.txt"
schtasks /Create /TN "etst-probe-system" /TR "cmd.exe /c whoami > `"$sysOut`"" /SC ONCE /ST 23:59 /RU SYSTEM /F | Out-Null
schtasks /Run /TN "etst-probe-system" | Out-Null
for ($i = 0; $i -lt 30 -and -not (Test-Path $sysOut); $i++) { Start-Sleep -Seconds 1 }
schtasks /Delete /TN "etst-probe-system" /F | Out-Null
Fact "task-as-system" $(if (Test-Path $sysOut) { (Get-Content $sysOut -Raw).Trim() } else { "did not run in 30 s" })

# 5. A directory junction.
$jt = Join-Path $env:RUNNER_TEMP "jt-target"; $jl = Join-Path $env:RUNNER_TEMP "jt-link"
New-Item -ItemType Directory -Force -Path $jt | Out-Null
cmd /c mklink /J "$jl" "$jt" | Out-Null
Fact "junction" $(if ((Get-Item $jl -ErrorAction SilentlyContinue).LinkType -eq "Junction") { "yes" } else { "no" })
cmd /c rmdir "$jl" | Out-Null

# 6. The .NET compiler a marker exe is built with (finding 1's leg).
$csc = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
Fact "csc" $(if (Test-Path $csc) { "yes" } else { "no" })

# The standard account goes; its profile folder is left to the runner, which is thrown away.
if ($made) { try { Remove-LocalUser -Name $name -ErrorAction Stop; Fact "standard-user-removed" "yes" } catch { Fact "standard-user-removed" ("no: " + $_.Exception.Message) } }
$plain = $null
$lines | Set-Content -Path $Out -Encoding utf8
