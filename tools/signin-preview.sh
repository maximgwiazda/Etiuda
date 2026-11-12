#!/bin/sh
# THE SIGN-IN PREVIEW IN ONE COMMAND, on Ubuntu: starts the installed Etiuda with ETIUDA_SIGNIN_PREVIEW=1 set for that one start
# (shell/main.js signinPreviewing), as tools/signin-preview.cmd does on Windows. Never packaged: the files list in
# electron-builder.js holds no tools/ (tests/desk-signin.mjs ds14d). With --where it prints the program it would start, and
# starts nothing. To preview an AppImage, name it as the argument.
#
#   sh tools/signin-preview.sh                          the installed .deb, /opt/Etiuda/etiuda
#   sh tools/signin-preview.sh ~/Downloads/etiuda-*.AppImage
#   sh tools/signin-preview.sh --where
set -u
where=0
if [ "${1:-}" = "--where" ]; then where=1; shift; fi
exe="${1:-/opt/Etiuda/etiuda}"
if [ ! -x "$exe" ]; then
  echo "Etiuda was not found at $exe. Name an AppImage as the argument to preview that one." >&2
  exit 1
fi
if [ "$where" = 1 ]; then echo "$exe"; exit 0; fi
if pgrep -x etiuda >/dev/null 2>&1; then
  echo "Etiuda is open already, and a second start only brings it forward without the preview. Quit it (the tray menu, Quit Etiuda), then run this again." >&2
  exit 1
fi
ETIUDA_SIGNIN_PREVIEW=1 exec "$exe"
