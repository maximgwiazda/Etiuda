import { CONTENT_LANGS } from "./content-model.js";
import { lang } from "./app-state.js";

// ---- time-of-day greeting: EN splits three ways, PL two ("Dzień dobry" covers
// morning and afternoon). 04:00-11:59 Good morning / Dzień dobry · 12:00-17:59 Good
// afternoon / Dzień dobry · 18:00-03:59 Good evening / Dobry wieczór.
/* ONE clock for the whole app - two copies of a boundary rule drift on the first
   adjustment. 0 morning 04:00-11:59 · 1 afternoon 12:00-17:59 · 2 evening 18:00-03:59
   (the long slot: 4am is still last night to a night shift). */
function dayPart(){
  const h=new Date().getHours();
  if(h>=18 || h<4) return 2;
  return h<12 ? 0 : 1;
}
/* Takes the language rather than reading the toggle: a card pinned to one language must greet
   in it. Callers with no card in hand pass nothing and get the toggle, as before. */
/* NOT t(): that translates for the INTERFACE, and an English interface composes Polish comments
   all day. A fragment written into a comment follows the comment. */
function noActionText(l){ return l==="pl" ? "nie podjęto działań" : "no action taken"; }
/* ONE TABLE, TWO READERS: the clock picks a phrase out of it, and the search expander
   flattens the whole of it. A phrase written into only one of those places leaves the cards
   composing it unfindable by the other. Slots are dayPart's, and Polish repeats its first
   because one phrase covers both morning and afternoon. */
const GREETINGS={
  en:["Good morning","Good afternoon","Good evening"],
  pl:["Dzień dobry","Dzień dobry","Dobry wieczór"]
};
/* A catalog may bring its own phrases, one array of three per language in dayPart order.
   A language it brings replaces that language's row whole, never a slot of it: half a row is
   a desk greeting in two voices. A language it leaves out keeps the built-in row, or its cards
   would greet in another language. Absent, which is every catalog written so far, changes
   nothing. */
let CATALOG_GREETINGS=null;
function greetTable(){ return CATALOG_GREETINGS||GREETINGS; }
/* Every phrase the token can become, once each and built once: the expander runs over the
   whole catalog on every keystroke. Rebuilt by the setter, never derived at the call. */
function greetWordList(tab){
  return Object.keys(tab)
    .reduce((all,k)=>all.concat(tab[k]),[])
    .filter((w,i,all)=>w&&all.indexOf(w)===i).join(" ");
}
let GREET_WORDS=greetWordList(GREETINGS);
function setCatalogGreet(map){
  CATALOG_GREETINGS=map ? Object.assign({},GREETINGS,map) : null;
  GREET_WORDS=greetWordList(greetTable());
}
function greeting(l){
  const tab=greetTable();
  // The languages are the catalog's now, so the pair is asked for rather than spelled out.
  const L=(CONTENT_LANGS.indexOf(l)>-1)?l:lang;
  return (tab[L]||tab[CONTENT_LANGS[0]]||GREETINGS.en)[dayPart()];
}

/* A CARD'S OWN SENTENCE, for the one screen that has to SHOW what the name will do rather than
   describe it. Not t(): this is card text, so it follows the card language and not the buttons',
   the same rule noActionText above keeps. The greeting is whatever the table holds - a catalog's
   own phrase where it brought one, the built-in otherwise - and {NAME} is left for the caller,
   which is what lets the sample be greyed and the typed name not. */
function greetLine(name,l){
  const L=(CONTENT_LANGS.indexOf(l)>-1)?l:lang;
  return greeting(L)+(L==="pl" ? ", mam na imię " : ", my name is ")+String(name||"")+".";
}

export {
  dayPart,
  greetLine,
  noActionText,
  greeting,
  setCatalogGreet,
  GREET_WORDS
};
