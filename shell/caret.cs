// THE CARET HELPER, Windows only: the picker's reply into the field the agent was typing in. It asks
// which window is in front and which program owns it, reads the text the agent has selected there through
// UI Automation, read-only, and presses Ctrl+V in that same window; it reads no window's title or pixels, no
// password field, and never touches the clipboard, which already holds the reply.
//   caret.exe which           prints "<window> <process id>" for the window in front
//   caret.exe selection       prints the focused control's selected text, UTF-8, at most MAX characters; exit 1 when none
//   caret.exe paste <window>  brings that window forward and presses Ctrl+V in it; exit 0 when pressed
//   caret.exe check           prints what the selection's cap and UTF-8 make of a fixed text, touching no window
// Built by electron-builder.js with the C# compiler Windows carries.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Automation.Text;

static class Caret {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr w, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr w);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr w);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
  [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint mapType);
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, Input[] inputs, int size);

  [StructLayout(LayoutKind.Sequential)] struct MouseInput { public int dx, dy; public uint data, flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct KeyInput { public ushort vk, scan; public uint flags, time; public IntPtr extra; }
  // The union is as wide as its widest member, the mouse's, or SendInput refuses the size it is given.
  [StructLayout(LayoutKind.Explicit)] struct Either { [FieldOffset(0)] public MouseInput mouse; [FieldOffset(0)] public KeyInput key; }
  [StructLayout(LayoutKind.Sequential)] struct Input { public uint type; public Either u; }

  const int VK_RETURN = 0x0D, VK_SHIFT = 0x10, VK_CONTROL = 0x11, VK_MENU = 0x12, VK_LWIN = 0x5B, VK_RWIN = 0x5C, VK_V = 0x56;
  const uint KEYUP = 0x0002;
  const int FRONT_MS = 1000, KEYS_MS = 2000, SETTLE_MS = 40;
  // The longest message the shell reads (clip-suggest.cjs MESSAGE_MAX_CHARS).
  const int MAX = 1500;

  static int Main(string[] args) {
    try {
      if (args.Length == 1 && args[0] == "which") {
        IntPtr w = GetForegroundWindow();
        uint pid = 0;
        if (w != IntPtr.Zero) GetWindowThreadProcessId(w, out pid);
        Console.Out.Write(w.ToInt64() + " " + pid);
        return w == IntPtr.Zero ? 2 : 0;
      }
      if (args.Length == 1 && args[0] == "selection") return Selection();
      if (args.Length == 1 && args[0] == "check") { string p = "Za\u017C\u00F3\u0142\u0107 g\u0119\u015Bl\u0105 ja\u017A\u0144 "; Print(Capped(p + new string('x', MAX - 1 - p.Length) + "\uD83D\uDE00")); return 0; }
      long h;
      if (args.Length == 2 && args[0] == "paste" && long.TryParse(args[1], out h) && h != 0) return Paste(new IntPtr(h));
      return 64;
    } catch (Exception) { return 70; }
  }

  // 0 printed; 1 nothing selected; 2 no control has the focus; 3 the control offers no text to read; 6 a password field.
  // Every read is of the selection alone: nothing is set, selected, scrolled or invoked.
  static int Selection() {
    AutomationElement e = AutomationElement.FocusedElement;
    if (e == null) return 2;
    if (e.Current.IsPassword) return 6;
    object found;
    if (!e.TryGetCurrentPattern(TextPattern.Pattern, out found)) return 3;
    TextPatternRange[] ranges = ((TextPattern)found).GetSelection();
    StringBuilder text = new StringBuilder();
    foreach (TextPatternRange r in ranges) {
      if (text.Length > 0) text.Append('\n');
      text.Append(r.GetText(MAX + 1 - text.Length));
      if (text.Length > MAX) break;
    }
    string got = Capped(text.ToString());
    if (got.Trim().Length == 0) return 1;
    Print(got);
    return 0;
  }

  // At most MAX characters, never half of a pair that makes one character.
  static string Capped(string s) {
    if (s.Length <= MAX) return s;
    int n = MAX;
    if (char.IsHighSurrogate(s[n - 1])) n--;
    return s.Substring(0, n);
  }

  // UTF-8 on standard output whatever the console's code page, which a program with no console does not have.
  static void Print(string s) {
    byte[] bytes = new UTF8Encoding(false).GetBytes(s);
    var output = Console.OpenStandardOutput();
    output.Write(bytes, 0, bytes.Length);
    output.Flush();
  }

  static bool Held(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }

  // 0 pressed; 2 the window is gone; 3 another window came forward and kept it; 4 the agent's keys
  // stayed down; 5 Windows took none of the presses.
  static int Paste(IntPtr w) {
    if (!IsWindow(w)) return 2;
    // Allowed because the shell starts this while its picker is in front: Windows lets a program
    // started by the window in front hand the front to another.
    SetForegroundWindow(w);
    Stopwatch clock = Stopwatch.StartNew();
    while (GetForegroundWindow() != w) {
      if (clock.ElapsedMilliseconds > FRONT_MS) return 3;
      Thread.Sleep(10);
    }
    // A modifier still down turns Ctrl+V into another combination, and Enter still down would repeat
    // into the chat after the reply lands, which sends it.
    clock.Restart();
    while (Held(VK_CONTROL) || Held(VK_SHIFT) || Held(VK_MENU) || Held(VK_LWIN) || Held(VK_RWIN) || Held(VK_RETURN)) {
      if (clock.ElapsedMilliseconds > KEYS_MS) return 4;
      Thread.Sleep(10);
    }
    // The window gives the focus back to its own field as it comes forward; this is that moment.
    Thread.Sleep(SETTLE_MS);
    if (GetForegroundWindow() != w) return 3;
    Input[] keys = { Key(VK_CONTROL, 0), Key(VK_V, 0), Key(VK_V, KEYUP), Key(VK_CONTROL, KEYUP) };
    return SendInput((uint)keys.Length, keys, Marshal.SizeOf(typeof(Input))) == keys.Length ? 0 : 5;
  }

  static Input Key(int vk, uint flags) {
    Input i = new Input();
    i.type = 1;
    i.u.key.vk = (ushort)vk;
    i.u.key.scan = (ushort)MapVirtualKey((uint)vk, 0);
    i.u.key.flags = flags;
    return i;
  }
}
