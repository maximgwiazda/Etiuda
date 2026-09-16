/* THE STATE A TAB CARRIES, and where the mark is. Two groups of names that no one surface
   owns: several set them and a dozen read them, so they sit in a file that imports nothing at
   all and can therefore be imported by anything, inside the load cycle or out of it.
   Each is replaced wholesale rather than mutated, so each has a setter: an imported binding
   cannot be assigned to, and the accessor main.js installs is a getter, so a bare write from
   the other side would be a silent no-op rather than an error. */

/* NAMING. A macro is one copyable segment - what a click sends; a card is the titled
   container holding one or more. All user-facing wording and the catalog format use those
   meanings. INTERNAL IDENTIFIERS STILL SAY THE OLD THING (cards[], cardOrder, findCard,
   rebuildCards) - numerous, invisible, and pack.cardOrder is a stored key. Reading
   `macro` in an identifier, think card; prefer the new words in anything a user reads. */
let cards=[];
// INTENT box dual mode: normal intent pick/free-text, or macro search after pressing /
/* One search over two surfaces. railOrder is what the panel SHOWS top to bottom and what
   the arrows walk (matches only - grey rows are inactive); railMarkIdx is the intent Enter
   takes when the cursor is automatic. railMarkUsed: the offer was consumed by a pick or a
   copy, and only typing or the arrows open it again. */
let railSel=-1, railOrder=[], railMarkIdx=-1, railMatch=null;
let railSortT=0, railSettled=true, railMarkUsed=false;
/* See the beforeinput above: the category filter is armed to drop and lands at railSettle. */
let catsDropArmed=false;
// A live Ctrl+Enter run. While set, a plain Enter ADDS its pick and closes the run -
// replacing would throw away everything picked so far. Survives typing (the run's
// promise is "the box stays for the next name"); dies with the set it was building.
let pickRun=false;
/* Which surface holds THE mark - "intent" or "card", never both. Hover claims it for its
   surface, arrows move it within one, a pick or a copy consumes it. */
let semiKind=null;

// The drag order of the category pills, persisted; the pills seed it from the base cats.
let catOrder=[];
// Several categories can be active at once (ctrl+click a pill). Empty = All.
let cats=[], shown=[];
// Focused copyable block: { id: cardId, vi: partIndex } or null (↑↓ / Enter target)
let entrySel=null;
// After picking an intent (or opening its category), scroll the list to the first
// card that is explicitly linked to that intent.
let pendingScrollHit=false;
// {INTENT} is either a chip index (so it re-maps when you flip EN<->PL) or free text.
// Several intents can be active at once (ctrl+click). Stored as indexes so each one
// re-maps when the language flips; free text is a separate, single value.
let intentIdxs=[], intentText="";
/* Language is PER-TAB: two chats side by side are routinely in different languages.
   blankTab() carries it, applyTab() installs it, setLang() writes it back; "eLang"
   records the language last on screen and seeds new tabs - defaulting them to English
   would fight a Polish shift on every chat. */
/* Seeded from "eLang" by the boot list rather than here, so this file can go on importing
   nothing and reading nothing while it loads. */
let lang="en";

/* Which <details> in Manage are expanded, and which categories in its library tree. Held
   rather than read off the DOM because openManage() re-renders after each edit - without it,
   hiding one card slammed every open group shut. Deliberately not persisted: it restarts with
   the browser; staying put MID-SESSION is what matters. Catalog & data starts open - all-shut
   showed four closed headings and no answer to what brings most people here, and it is the
   only section that fits on screen whole. Mutated in place, so it needs no setter. */
const mgOpen=new Set(["data"]);

/* The container tally per category, rebuilt by recountMacros() from `cards`. Here rather than
   beside the memos it is rebuilt with: five surfaces ask it whether a category still holds
   anything, and its own home imports too much of the tree to be asked from below. */
let cardCounts={};

/* The pill drag's own state, started in the pointerdown pills-bar.js writes and finished in
   the pointermove and pointerup paint.js writes, so neither of those two owns it. */
let dragState=null, suppressClick=false, swapLock=0;

/* Two of these are raw writes under a second name, because the plain name is already an ACT
   elsewhere: setEntrySel in mark.js paints the mark and saves the tab, and setLang in
   lang-seg.js writes the preference and moves the thumb. Most writes here want neither. */
function setRailSel(v){ railSel=v; }
function setRailOrder(v){ railOrder=v; }
function setRailMarkIdx(v){ railMarkIdx=v; }
function setRailMatch(v){ railMatch=v; }
function setRailSortT(v){ railSortT=v; }
function setRailSettled(v){ railSettled=v; }
function setRailMarkUsed(v){ railMarkUsed=v; }
function setCatsDropArmed(v){ catsDropArmed=v; }
function setPickRun(v){ pickRun=v; }
function setSemiKind(v){ semiKind=v; }
function setCatOrder(v){ catOrder=v; }
function setCats(v){ cats=v; }
/* NOTHING OF ANYBODY'S ON THE DESK: no cards at all and no category chosen. The empty
   screen is what this paints, and it is also when the folder's catalog is offered at boot,
   so the two read one definition and cannot drift apart about what empty means. */
function wholeThingEmpty(){ return !cards.length && !cats.length; }
function setShown(v){ shown=v; }
function putEntrySel(v){ entrySel=v; }
function setPendingScrollHit(v){ pendingScrollHit=v; }
function setIntentIdxs(v){ intentIdxs=v; }
function setIntentText(v){ intentText=v; }
function putLang(v){ lang=v; }
function setCards(v){ cards=v; }
function setCardCounts(v){ cardCounts=v; }
function setDragState(v){ dragState=v; }
function setSuppressClick(v){ suppressClick=v; }
function setSwapLock(v){ swapLock=v; }

export {
  mgOpen,
  railSel,
  railOrder,
  railMarkIdx,
  railMatch,
  railSortT,
  railSettled,
  railMarkUsed,
  catsDropArmed,
  pickRun,
  semiKind,
  cats,
  shown,
  entrySel,
  pendingScrollHit,
  intentIdxs,
  intentText,
  lang,
  cards,
  catOrder,
  cardCounts,
  dragState,
  suppressClick,
  swapLock,
  setRailSel,
  setRailOrder,
  setRailMarkIdx,
  setRailMatch,
  setRailSortT,
  setRailSettled,
  setRailMarkUsed,
  setCatsDropArmed,
  setPickRun,
  setSemiKind,
  setCatOrder,
  setCats,
  wholeThingEmpty,
  setShown,
  putEntrySel,
  setPendingScrollHit,
  setIntentIdxs,
  setIntentText,
  putLang,
  setCards,
  setCardCounts,
  setDragState,
  setSuppressClick,
  setSwapLock,
};
