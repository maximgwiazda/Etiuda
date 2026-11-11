# Etiuda

A live-chat macro bank for the desktop, and nothing you put into it leaves your machine.
Named for the etude: the short study you practise until it plays itself.

## Where things stand

Etiuda 2.x is being built in this repository, on `main`.

Etiuda 1.x is finished and runs today. It is the single file `v1/Etiuda.html`, under the MIT
licence, with its whole history behind it, and it opens straight from
[maximgwiazda.github.io/Etiuda/v1/Etiuda.html](https://maximgwiazda.github.io/Etiuda/v1/Etiuda.html)
or from [etiuda.dev/v1](https://etiuda.dev/v1). The older `etiuda-v1` repository now redirects
here and keeps the 1.x history and every 1.x tag.

`Etiuda.html` at the root is a redirect to `v1/Etiuda.html`, kept so an older link carries on
working.

## Running the prototype

The first Electron prototype puts the engine in a desktop window.

```
npm install
npm start
```

It reads a catalog as data and hands it to the window before the first script there runs,
looking in three places in turn: the catalog folder, which is `Documents/Etiuda` unless
Settings names another and where any `.ec` file counts, the most recently changed one
winning; the application's user-data folder; and the project folder. The single-file build
that runs in a browser is unchanged, and still loads a sibling script named
`etiuda-catalog.js`. With no catalog present Etiuda starts as a clean slate, which is a
normal state rather than a fault.

What a prototype is honest about: the window wears the standard frame and menu rather than
the band 2.x is designed around, nothing is packaged or signed, and the engine inside it is
still the 1.x one. This is that engine with a desktop window around it rather than a first
look at 2.0.0.

## Installing silently

Which command to use depends on the account the deployment tool runs as:

- **From the system account, or elevated with nobody signed in:** `etiuda-<version>-setup.exe /S /allusers` installs
  once for every account on the machine, into `C:\Program Files\Etiuda`. Bare `/S` does the same here: a silent run
  with neither switch, by the system account or by an administrator's elevated process in session 0, where no person's
  desktop is, installs for all users. No all-users install has been run on any machine yet; this path is built and
  compiled, not tested.
- **In the person's own account:** `etiuda-<version>-setup.exe /S /currentuser` installs for that account alone and
  opens no window. This is the path tested so far.
- **Bare `/S` anywhere else follows the account that runs it**, as it always has: for that account alone, unless an
  all-users copy is already registered. Pass `/currentuser` or `/allusers` rather than leaving the choice to the account.

`/D=<folder>` installs somewhere else; it goes last, unquoted. An all-users install gives every account the shortcuts,
the `.ec` type and the `etiuda:` link, all under HKLM, and its uninstall takes them away; a per-user install keeps
all three in that account's HKCU.

The uninstaller takes `/S` the same way, as the `QuietUninstallString` the installer registers, and keeps each
person's data. For an all-users install that is `"C:\Program Files\Etiuda\Uninstall Etiuda.exe" /allusers /S`,
written out in full for a tool that does not expand variables. The exit code says what to do next:

| Code | Meaning | What to do |
|---|---|---|
| 0 | Installed, or uninstalled. A Windows older than 7, or a 32-bit Windows, is refused and can also end with 0 | Nothing, on a supported machine |
| 1618 | Etiuda was still open after being asked to close for about 20 seconds, or open in another person's session, or its folder or one of its files stayed locked, or another Etiuda installer was running | Retry later |
| 740 | An all-users run could not get administrator rights | Run it elevated, or install per account with `/currentuser` |
| 2 | The new files could not all be written beside the install, the folder is a drive root, the old version could not be moved back after a failed swap, or another failure the installer caught | Look at that machine |

An upgrade writes the new version into a folder beside the installed one, `<folder>.setup-staging`, while the old
version stays installed, registered and startable. Only once every file is there does it close Etiuda and swap the two
folders, so a failed upgrade leaves the old version as it was. A locked folder or file is tried for about a minute
before the run ends with 1618.

An all-users install looks for an open copy in every session, and asks only the installing account's own copy to
close: another person's is never closed, so the run ends with 1618 and the deployment tool tries again later. A
per-user install looks in its own account alone, since another account's copy runs from that account's own folder.
1618 and 740 are the codes Windows itself uses for these cases; the deployment tool still needs them mapped, 1618 to a
retry and 740 and 2 to a failure.

### Detecting it, and packaging it

- **Detection** is a registry rule in the 64-bit view: the value `DisplayVersion` under
  `HKEY_LOCAL_MACHINE\Software\Microsoft\Windows\CurrentVersion\Uninstall\7c08242d-3785-55b6-ac6a-f6378a2e1a4f` for an
  all-users install, or the same path under `HKEY_CURRENT_USER` for a per-user one. The key comes from the app's id
  and stays the same from version to version; `InstallLocation` beside it is the folder.
- **`DisplayVersion` is the version the build carries.** Every build so far carries the same development version, so
  detect that the value exists rather than compare it, until releases carry numbers of their own.
- **The package is the one setup file**, with nothing beside it, and the install reaches no host on the network.
- **The hourly look for a new version is switched off** by the DWORD `DeskNoUpdateCheck` set to 1 under
  `HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Etiuda`: the desk then asks for no version note and offers none. The switch is
  read on Windows only. It reads the value and never writes it, and a per-user value does nothing.
- **The installer is unsigned until a certificate is in place**, so a machine that allows only signed publishers needs
  each build allowed by its hash.
- **There is no installer log.** The NSIS build that electron-builder bundles is compiled without logging, so the exit
  code is the record, with the deployment tool's own log beside it.

## Licence

Etiuda 2.x is source-available under the Etiuda Source-Available Licence 1.0, and `LICENSE`
carries the terms in full. Reading the source, modifying it and any non-production use are
free to everyone. Production use is free for personal purposes; use in the course of
employment, or in or for a business, is licensable.

That covers everything in this repository outside `v1/`, `engine/etiuda.html` included. It
began as the finished 1.16.7 engine, carried here so the prototype had something to run, and
2.x has been shaped in it since.

Etiuda 1.x is MIT and stays MIT. `v1/` carries its own `LICENSE`, and the directory is the
boundary: a file under `v1/` is MIT, a file anywhere else is under the licence at the root.
The 1.x history and every 1.x tag are kept in the `etiuda-v1` repository, which now redirects
here.
