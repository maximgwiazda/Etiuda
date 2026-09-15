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
