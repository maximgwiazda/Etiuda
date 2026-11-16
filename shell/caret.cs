// THE CARET HELPER, Windows only: the picker's reply into the field the agent was typing in. It asks
// which window is in front and which program owns it, reads the text the agent has selected there through
// UI Automation, read-only, and presses Ctrl+V in that same window; it reads no window's title or pixels, no
// password field, and never touches the clipboard, which already holds the reply.
//   caret.exe which           prints "<window> <process id>" for the window in front
//   caret.exe selection       line 1 is ro, ed, or "u mixed|unsupported|contradicted"; then the selected text, UTF-8, at most MAX; exit 1 when none
//   caret.exe paste <window>  brings that window forward and presses Ctrl+V in it; exit 0 when pressed
//   caret.exe check           prints the selection cap over a fixed text, then the editability rows, touching no window
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
      if (args.Length == 1 && args[0] == "check") {
        string p = "Za\u017C\u00F3\u0142\u0107 g\u0119\u015Bl\u0105 ja\u017A\u0144 ";
        Print(Capped(p + new string('x', MAX - 1 - p.Length) + "\uD83D\uDE00") + "\n" + RuleText());
        return 0;
      }
      long h;
      if (args.Length == 2 && args[0] == "paste" && long.TryParse(args[1], out h) && h != 0) return Paste(new IntPtr(h));
      return 64;
    } catch (Exception) { return 70; }
  }

  // 0 printed, a fact line then the text; 1 nothing selected; 2 no control has the focus; 3 no text pattern; 6 a password field.
  // Every read is of the selection alone: nothing is set, selected, scrolled or invoked. The password refusal stays first.
  static int Selection() {
    AutomationElement e = AutomationElement.FocusedElement;
    if (e == null) return 2;
    if (e.Current.IsPassword) return 6;
    object found;
    if (!e.TryGetCurrentPattern(TextPattern.Pattern, out found)) return 3;
    TextPatternRange[] ranges = ((TextPattern)found).GetSelection();
    if (ranges == null) return 1;
    StringBuilder text = new StringBuilder();
    string[] attrs = new string[ranges.Length];
    for (int i = 0; i < ranges.Length; i++) {
      TextPatternRange r = ranges[i];
      if (text.Length <= MAX) {
        if (text.Length > 0) text.Append('\n');
        int room = MAX + 1 - text.Length;
        if (room > 0) text.Append(r.GetText(room));
      }
      attrs[i] = AttrOf(r);
    }
    string got = Capped(text.ToString());
    if (got.Trim().Length == 0) return 1;
    Print(FactLine(JoinFact(attrs, SecondLive(e))) + "\n" + got);
    return 0;
  }

  // A throw that is not the element vanishing is a missing attribute. The element vanishing reaches Main.
  static string AttrOf(TextPatternRange r) {
    object v;
    try { v = r.GetAttributeValue(TextPattern.IsReadOnlyAttribute); }
    catch (ElementNotAvailableException) { throw; }
    catch { return "ns"; }
    if (v == null || Object.Equals(v, AutomationElement.NotSupported)) return "ns";
    if (Object.Equals(v, TextPattern.MixedAttributeValue)) return "mx";
    if (v is bool) return (bool)v ? "ro" : "ed";
    return "ns";
  }

  // Value.IsReadOnly when the element has that pattern; ControlType.Text is read-only; Edit and Document say nothing.
  static string SecondLive(AutomationElement e) {
    string value = ".";
    object raw;
    if (e.TryGetCurrentPattern(ValuePattern.Pattern, out raw)) {
      ValuePattern vp = raw as ValuePattern;
      if (vp != null) value = vp.Current.IsReadOnly ? "ro" : "ed";
    }
    string type = "other";
    ControlType ct = e.Current.ControlType;
    if (ct != null) {
      if (ControlType.Text.Equals(ct)) type = "text";
      else if (ControlType.Edit.Equals(ct)) type = "edit";
      else if (ControlType.Document.Equals(ct)) type = "doc";
    }
    return SecondOf(value, type);
  }

  // value is ro, ed or "."; type is text, edit, doc or other. "?" when Value says editable and the type is Text.
  static string SecondOf(string value, string type) {
    string fromType = type == "text" ? "ro" : ".";
    if (value == "ro" || value == "ed") {
      if (fromType != "." && fromType != value) return "?";
      return value;
    }
    return fromType;
  }

  static string JoinFact(string[] attrs, string second) {
    string acc = null;
    bool mixed = false, contradicted = false, unsupported = false;
    for (int i = 0; i < attrs.Length; i++) {
      string one = Answer(attrs[i], second);
      if (one == "? mixed") mixed = true;
      else if (one == "? contradicted") contradicted = true;
      else if (one == "? not-supported") unsupported = true;
      else if (acc == null) acc = one;
      else if (acc != one) contradicted = true;
    }
    if (mixed) return "? mixed";
    if (contradicted) return "? contradicted";
    if (unsupported || acc == null) return "? not-supported";
    return acc;
  }

  // Range IsReadOnly, then one second opinion. Value.IsReadOnly speaks; ControlType.Text speaks read-only; Edit and Document stay silent.
  // Disagreeing opinions, a mixed range, or no attribute and no second opinion: unknown. Every range must agree.
  // ro/ro=ro ro/ed=? ro/.=ro ro/?=? | ed/ro=? ed/ed=ed ed/.=ed ed/?=? | ns/ro=ro ns/ed=ed ns/.=? ns/?=? | mx/any=?
  static string Answer(string attr, string second) {
    if (attr == "mx") return "? mixed";
    if (attr == "ro" && second == "ed") return "? contradicted"; // plant:fact-contradict
    if (attr == "ed" && second == "ro") return "? contradicted";
    if (second == "?") return attr == "ns" ? "? not-supported" : "? contradicted";
    if (attr == "ro") return "ro";
    if (attr == "ed") return "ed";
    if (second == "ro" || second == "ed") return second;
    return "? not-supported";
  }

  static string FactLine(string fact) {
    if (fact == "ro") return "ro";
    if (fact == "ed") return "ed";
    if (fact == "? mixed") return "u mixed";
    if (fact == "? contradicted") return "u contradicted";
    return "u unsupported";
  }

  static string RuleText() {
    string[] attrs = { "ro", "ed", "ns", "mx" };
    string[] seconds = { "ro", "ed", ".", "?" };
    StringBuilder b = new StringBuilder();
    for (int i = 0; i < attrs.Length; i++) {
      for (int j = 0; j < seconds.Length; j++) {
        if (b.Length > 0) b.Append('\n');
        b.Append("fact ").Append(attrs[i]).Append(' ').Append(seconds[j]).Append(' ').Append(Answer(attrs[i], seconds[j]));
      }
    }
    string[] values = { "ro", "ed", "." };
    string[] types = { "text", "edit", "doc", "other" };
    for (int i = 0; i < values.Length; i++) {
      for (int j = 0; j < types.Length; j++) {
        b.Append('\n');
        b.Append("second ").Append(values[i]).Append(' ').Append(types[j]).Append(' ').Append(SecondOf(values[i], types[j]));
      }
    }
    return b.ToString();
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
