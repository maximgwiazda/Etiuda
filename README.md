# Etiuda

A live-chat macro bank for the desktop, and nothing you put into it leaves your machine.
Named for the etude: the short study you practise until it plays itself.

## Where things stand

Etiuda 2.x is being built in this repository, and the tree is still being laid out.

Etiuda 1.x is finished and runs today. It lives at
[maximgwiazda/etiuda-v1](https://github.com/maximgwiazda/etiuda-v1), under the MIT licence,
and opens straight from
[maximgwiazda.github.io/etiuda-v1/Etiuda.html](https://maximgwiazda.github.io/etiuda-v1/Etiuda.html).

`Etiuda.html` here is a redirect to that page, kept so an older link carries on working.

## Running the prototype

The first Electron prototype puts the finished 1.16.6 engine in a desktop window.

```
npm install
npm start
```

It looks for a catalog named `etiuda-catalog.js` in the project folder and in the
application's user-data folder, reads it as data, and hands it to the window before the first
script there runs. With no catalog present Etiuda starts as a clean slate, which is a normal
state rather than a fault.

What a prototype is honest about: the window wears the standard frame and menu rather than
the band 2.x is designed around, nothing is packaged or signed, and the engine inside it is
1.x. This is 1.16.6 with a desktop window around it rather than a first look at 2.0.0.

## Licence

Etiuda 2.x will be published under the Business Source License 1.1, which makes the source
available to read and to work with while reserving commercial use. The `LICENSE` file is not
in the tree yet, so no licence is granted here so far: the ordinary default applies until it
lands.

Etiuda 1.x is MIT and stays MIT, in its own repository, with every 1.x tag.
