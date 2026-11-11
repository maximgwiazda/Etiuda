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

- **In the person's own account:** `etiuda-<version>-setup.exe /S /currentuser` installs for that account alone and
  opens no window. This is the path tested so far.
- **From an elevated context, such as the system account:** `etiuda-<version>-setup.exe /S /allusers` installs once for
  every account on the machine. It has not been tested here yet.
- **Bare `/S` follows the account that runs it.** Run as the system account, it installs into that
  account's own profile, where no person can start Etiuda. Pass `/currentuser` or `/allusers` rather
  than leaving the choice to the account.

The uninstaller takes `/S` the same way, as the `QuietUninstallString` the installer registers, and keeps
each person's data. The exit code says what to do next:

| Code | Meaning | What to do |
|---|---|---|
| 0 | Installed, or uninstalled. A Windows older than 7, or a 32-bit Windows, is refused and can also end with 0 | Nothing, on a supported machine |
| 1618 | Etiuda was still open in the installing account after being asked to close for about 20 seconds, or another Etiuda installer was running | Retry later |
| 740 | An all-users run could not get administrator rights | Run it elevated, or install per account with `/currentuser` |
| 2 | An older version would not uninstall, its own 1618 included, or another failure the installer caught | Look at that machine |

The installer sees only the installing account's open copy. Run from the system account, it does not
see a copy of Etiuda open in a person's session, so close it before an upgrade. 1618 and 740 are the codes
Windows itself uses for these two cases; the deployment tool still needs them mapped, 1618 to a retry and
740 and 2 to a failure.

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
