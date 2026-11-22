# Etiuda

A live-chat macro bank for the desktop. What you put into it stays on your machine, except a team's shared files, which travel sealed, and what Settings name as going to an AI service your organisation sets up, while that use is on.
Named for the etude: the short study you practise until it plays itself.

## Where things stand

Etiuda 2.x is being built in this repository, on `main`.

Etiuda 1.x is finished and runs today. It is the single file `v1/Etiuda.html`, under the MIT
licence, with its whole history behind it, and it opens straight from
[maximgwiazda.github.io/Etiuda/v1/Etiuda.html](https://maximgwiazda.github.io/Etiuda/v1/Etiuda.html)
or from [etiuda.dev/v1](https://etiuda.dev/v1). The older `etiuda-v1` repository now redirects
here and keeps the 1.x history and every 1.x tag.

The copy served at etiuda.dev/v1 counts its use (how long it is open and in use, and how many cards are used) and
says so in a line under its footer; the file itself, run from disk or served elsewhere, sends nothing.

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
  desktop is, installs for all users. Tested on GitHub's Windows runner, under a test identity (this installer under
  another app id): pushed silently as the system account into Program Files, a standard account's first start, and the
  removal as the system account (run 43434942330, 2026-11-13).
- **In the person's own account:** `etiuda-<version>-setup.exe /S /currentuser` installs for that account alone and
  opens no window. Tested the same way, over an older version (run 43435159941, 2026-11-13).
- **Bare `/S` anywhere else follows the account that runs it**, as it always has: for that account alone, unless an
  all-users copy is already registered. Pass `/currentuser` or `/allusers` rather than leaving the choice to the account.

`/D=<folder>` installs somewhere else; it goes last, unquoted. An all-users install gives every account the shortcuts,
the `.ec` type and the `etiuda:` link, all under HKLM, and its uninstall takes them away; a per-user install keeps
all three in that account's HKCU.

Install for all users into Program Files, or into a folder that neither Users, Authenticated Users, Everyone, INTERACTIVE
nor Domain Users (S-1-5-32-545, S-1-5-11, S-1-1-0, S-1-5-4, and the domain's own SID ending -513) can write to, and whose
parent folder they cannot write to either. A silent install gives no warning when this is not so.

The uninstaller takes `/S` the same way, as the `QuietUninstallString` the installer registers, and keeps each
person's data. For an all-users install that is `"C:\Program Files\Etiuda\Uninstall Etiuda.exe" /allusers /S`,
written out in full for a tool that does not expand variables. The exit code says what to do next:

| Code | Meaning | What to do |
|---|---|---|
| 0 | Installed, or uninstalled. A Windows older than 7, or a 32-bit Windows, is refused and can also end with 0 | Nothing, on a supported machine |
| 1618 | Etiuda was still open after being asked to close for about 20 seconds, or open in another person's session, or its folder or one of its files stayed locked, or a folder left beside it could not be removed or moved back, or another Etiuda installer was running | Retry later |
| 740 | An all-users run could not get administrator rights | Run it elevated, or install per account with `/currentuser` |
| 1638 | A silent run found a newer version installed, and left it as it was | Nothing, or pass `/ALLOWDOWNGRADE` to install the older version in its place |
| 2 | The new files could not all be written beside the install, the folder is a drive root, the old version could not be moved back after a failed swap, or another failure the installer caught | Look at that machine |

An upgrade writes the new version into a folder beside the installed one, `<folder>.setup-staging`, while the old
version stays installed, registered and startable. Only once every file the package lists is there, at its size, does it
close Etiuda and swap the two folders, so a failed upgrade leaves the old version as it was. Anything in the folder that
the old version's own list (`etiuda-files.ini`) does not name goes straight back into it. The old version waits in
`<folder>.setup-previous` until the new one has started; an account that cannot write there, as with an all-users install,
leaves it for the next upgrade or the uninstall. A locked folder or file is tried for about a minute
before the run ends with 1618. An upgrade in the same folder keeps each person's shortcuts as they left them; one that
moves Etiuda to another folder makes them again there, and then deletes from the old folder the files the installer
wrote, with its `resources` and `locales` folders whole, leaving anything else in it, and anything locked, without
failing the run. A deployment tool that names a folder inside or above the registered one keeps the old copy there,
no longer registered, to be removed by hand.

An all-users install looks for an open copy in every session, and asks only the installing account's own copy to
close: another person's is never closed, so the run ends with 1618 and the deployment tool tries again later. A
per-user install looks in its own account alone, since another account's copy runs from that account's own folder.
An all-users install started already elevated, with no person's own instance to act through, leaves that account's
per-user copy to its own uninstaller, run silently as that account the next time it signs in, keeping its data.

1618, 740 and 1638 are the codes Windows itself uses for these cases; the deployment tool still needs them mapped, 1618
to a retry, 1638 to done or to a rerun with `/ALLOWDOWNGRADE`, and 740 and 2 to a failure.

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

## A managed installation

Etiuda's Group Policy template is in `shell/policy` (`etiuda.admx`, with English and Polish `.adml`), and an all-users
install carries it in `resources\policy` beside the program. Every setting is machine policy under
`HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Etiuda`, read and never written; each one's own text says what it does.

### A non-persistent desktop

A desk's identity is two key pairs that Etiuda keeps in the person's profile, in `%APPDATA%\etiuda` (the file
`desk.json` beside its team's mirrors), sealed by Windows' data protection for that person. The desk is the same desk on
every host, on its team with its catalog and nobody to let it in again, wherever **the profile keeps that folder and the
person's Windows data protection keys**:

- an **FSLogix Profile Container**, which keeps the whole profile, or
- a **roaming profile**, which carries the data protection keys with the person.

Measured on GitHub's Windows runner (run 43496397329): with the whole `%APPDATA%\etiuda` folder discarded between
sessions the desk came back as a new desk; with its `Local State` file alone discarded and `desk.json` kept, the same desk.
The person's Documents were unchanged either way.

Where profiles are not kept, two settings say what the desk does when its key cannot be opened on a new host:

- **Keep each desk on a non-persistent desktop** (`NonPersistent`): the desk says what happened and whom to ask (the
  setting `SupportContact`, or the organisation's IT department), keeps working in everything but signing in, and makes no new desk. Its sign-ins say
  that it is pooled, so a person's pooled desks hold one place among their three computers, the newest taking it over.
- **Let a non-persistent desktop make a new desk** (`NonPersistentNewDesk`), with the first: such a desk makes a new
  desk, as on any computer, and its team may need to let it in again; it still holds one pooled place.

With neither set, a desk whose key cannot be opened makes a new desk, as on any computer.

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
