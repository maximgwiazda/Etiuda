# THE UNINSTALLER'S FIRST PAGE, DRIVEN AS A PERSON DRIVES IT, on a hosted Windows runner only (tools/runner/installer-legs.mjs, leg
# uninstall-data). The leg starts the uninstaller with no /S and runs this beside it. It finds the uninstaller's window, reads every
# control's rectangle, asks Windows what stands under the checkbox's centre (WindowFromPoint, which honours z-order and a static's
# HTTRANSPARENT), clicks it where the system would deliver the click (to the window found there, never straight to the box), toggles it
# with the keyboard through the dialog's own Tab and Space, sets the state the pass wants, presses Next, and presses Close at the end.
# Everything it saw is written as one JSON file. It writes and removes nothing else, and stops nothing: the leg stops by pid.
#
#   uninstaller-drive.ps1 -Product <name in the window's title> -Final ticked|unticked -Out <json path> [-Seconds 240]
#   -AfterNext: the box is not on the first page (the desk asks on a page of its own): Next is pressed once, and the box waited for.
param([string]$Product, [string]$Final, [string]$Out, [int]$Seconds = 240, [switch]$AfterNext)
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public struct RECT { public int Left, Top, Right, Bottom; }
public struct POINT { public int X, Y; }
[StructLayout(LayoutKind.Sequential)]
public struct GUITHREADINFO { public int cbSize, flags; public IntPtr hwndActive, hwndFocus, hwndCapture, hwndMenuOwner, hwndMoveSize, hwndCaret; public RECT rcCaret; }
public static class W {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr h, EnumProc p, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint t, ref GUITHREADINFO i);
  [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
  public static List<IntPtr> Tops() { var l = new List<IntPtr>(); EnumWindows((h, p) => { l.Add(h); return true; }, IntPtr.Zero); return l; }
  public static List<IntPtr> Kids(IntPtr top) { var l = new List<IntPtr>(); EnumChildWindows(top, (h, p) => { l.Add(h); return true; }, IntPtr.Zero); return l; }
  public static string Text(IntPtr h) { var s = new StringBuilder(2048); GetWindowText(h, s, s.Capacity); return s.ToString(); }
  public static string Class(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, s.Capacity); return s.ToString(); }
}
"@

function Describe($h) {
  $r = New-Object RECT; [void][W]::GetWindowRect($h, [ref]$r)
  [pscustomobject]@{ hwnd = [int64]$h; parent = [int64][W]::GetParent($h); class = [W]::Class($h); text = [W]::Text($h); id = [W]::GetDlgCtrlID($h)
    left = $r.Left; top = $r.Top; right = $r.Right; bottom = $r.Bottom; visible = [W]::IsWindowVisible($h); enabled = [W]::IsWindowEnabled($h) }
}
function MainWindow() {
  foreach ($h in [W]::Tops()) {
    if (-not [W]::IsWindowVisible($h)) { continue }
    if ([W]::Class($h) -ne "#32770") { continue }
    $t = [W]::Text($h)
    if ($t.Contains($Product) -and $t -match "Uninstall|Odinstal") { return $h }
  }
  return [IntPtr]::Zero
}
function State($box) { [int][W]::SendMessage($box, 0x00F0, [IntPtr]::Zero, [IntPtr]::Zero) }   # BM_GETCHECK
function Focus($main) {
  [uint32]$pid2 = 0; $tid = [W]::GetWindowThreadProcessId($main, [ref]$pid2)
  $i = New-Object GUITHREADINFO; $i.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($i)
  [void][W]::GetGUIThreadInfo($tid, [ref]$i); return $i.hwndFocus
}
function Key($main, [int]$vk, [int]$scan) {
  $to = Focus $main; if ($to -eq [IntPtr]::Zero) { $to = $main }
  [void][W]::PostMessage($to, 0x0100, [IntPtr]$vk, [IntPtr](1 + ($scan -shl 16)))
  Start-Sleep -Milliseconds 80
  [void][W]::PostMessage($to, 0x0101, [IntPtr]$vk, [IntPtr](0xC0000001 + ($scan -shl 16)))
  Start-Sleep -Milliseconds 250
}
# A click delivered where the system would deliver it: to whatever WindowFromPoint names at the point, in that window's client
# coordinates. A control laid over the box takes the click and the box stays as it was, which is how a person met this page.
function ClickAt($x, $y) {
  $p = New-Object POINT; $p.X = $x; $p.Y = $y
  $hit = [W]::WindowFromPoint($p)
  $c = New-Object POINT; $c.X = $x; $c.Y = $y; [void][W]::ScreenToClient($hit, [ref]$c)
  $lp = [IntPtr](($c.Y -shl 16) -bor ($c.X -band 0xFFFF))
  [void][W]::PostMessage($hit, 0x0201, [IntPtr]1, $lp); Start-Sleep -Milliseconds 80
  [void][W]::PostMessage($hit, 0x0202, [IntPtr]0, $lp); Start-Sleep -Milliseconds 250
  return $hit
}

$facts = [ordered]@{ final = $Final }
$deadline = (Get-Date).AddSeconds($Seconds)
$main = [IntPtr]::Zero
while ($main -eq [IntPtr]::Zero -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 300; $main = MainWindow }
if ($main -eq [IntPtr]::Zero) { $facts.error = "no uninstaller window titled with " + $Product; ($facts | ConvertTo-Json -Depth 6 -Compress) | Set-Content -LiteralPath $Out -Encoding UTF8; exit 0 }
Start-Sleep -Milliseconds 1500
if ($AfterNext) {
  $first = @([W]::Kids($main) | Where-Object { [W]::Class($_) -eq "Button" -and [W]::GetDlgCtrlID($_) -eq 1 } | Select-Object -First 1)
  if ($first.Count -eq 1) { [void][W]::SendMessage($first[0], 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) }
  $until = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $until) {
    Start-Sleep -Milliseconds 400
    $seen = @([W]::Kids($main) | Where-Object { [W]::Class($_) -eq "Button" -and [W]::Text($_) -match "^(Remove my data|Usu. tak.e dane)" -and [W]::IsWindowVisible($_) })
    if ($seen.Count) { break }
  }
  Start-Sleep -Milliseconds 800
}
$facts.dpi = [int][W]::GetDpiForWindow($main)
$facts.main = Describe $main
# Every descendant, in z-order as EnumChildWindows lists it (top first), so a covering sibling is read as such.
$kids = @([W]::Kids($main) | ForEach-Object { Describe $_ })
$facts.controls = $kids
$box = $kids | Where-Object { $_.class -eq "Button" -and $_.text -match "^(Remove my data|Usu. tak.e dane)" } | Select-Object -First 1
$note = $kids | Where-Object { $_.class -eq "Static" -and $_.text -match "^(Also removes|Usuwa r.wnie.)" } | Select-Object -First 1
$text = $kids | Where-Object { $_.class -eq "Static" -and $_.text -match "(Press Next|Aby kontynuowa.)" } | Select-Object -First 1
$next = $kids | Where-Object { $_.class -eq "Button" -and $_.id -eq 1 } | Select-Object -First 1
$facts.box = $box; $facts.note = $note; $facts.text = $text
if (-not $box) { $facts.error = "no Remove my data checkbox among the window's controls"; $facts.where = "absent" }
else {
  $hb = [IntPtr]$box.hwnd
  $cx = [int](($box.left + $box.right) / 2); $cy = [int](($box.top + $box.bottom) / 2)
  $p = New-Object POINT; $p.X = $cx; $p.Y = $cy
  $under = Describe ([W]::WindowFromPoint($p))
  $facts.underBoxCentre = $under
  $facts.boxIsHit = ($under.hwnd -eq $box.hwnd)
  $facts.start = State $hb
  # By mouse: click, tick, click again, untick.
  [void](ClickAt $cx $cy); $facts.afterMouse1 = State $hb
  [void](ClickAt $cx $cy); $facts.afterMouse2 = State $hb
  # By keyboard: Tab until the box has the focus (at most 12 presses), then Space.
  $tabs = 0
  while ((Focus $main) -ne $hb -and $tabs -lt 12) { Key $main 0x09 0x0F; $tabs++ }
  $facts.tabsToBox = $tabs; $facts.boxHasFocus = ((Focus $main) -eq $hb)
  Key $main 0x20 0x39; $facts.afterSpace1 = State $hb
  if ($Final -eq "unticked") { Key $main 0x20 0x39; $facts.afterSpace2 = State $hb }
  $facts.stateAtNext = State $hb
}
if (-not $next) { $facts.nextError = "no Next button (id 1)" }
else {
  [void][W]::SendMessage([IntPtr]$next.hwnd, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero)   # BM_CLICK
  $closed = ""
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 700
    $m = MainWindow
    if ($m -eq [IntPtr]::Zero) { $closed = "window gone"; break }
    foreach ($k in [W]::Kids($m)) {
      if ([W]::Class($k) -eq "Button" -and [W]::GetDlgCtrlID($k) -eq 1 -and [W]::IsWindowVisible($k) -and [W]::IsWindowEnabled($k) -and [W]::Text($k) -match "Close|Finish|Zamknij|Zako.cz") {
        [void][W]::SendMessage($k, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero); $closed = "pressed " + [W]::Text($k)
      }
    }
  }
  $facts.ended = $closed
}
($facts | ConvertTo-Json -Depth 6 -Compress) | Set-Content -LiteralPath $Out -Encoding UTF8
