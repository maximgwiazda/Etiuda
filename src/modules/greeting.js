import { CONTENT_LANGS } from "./content-model.js";

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
/* Every phrase the token can become, once each and built once: the expander runs over the
   whole catalog on every keystroke. */
const GREET_WORDS=Object.keys(GREETINGS)
  .reduce((all,k)=>all.concat(GREETINGS[k]),[])
  .filter((w,i,all)=>all.indexOf(w)===i).join(" ");
function greeting(l){
  const L=(l==="en"||l==="pl")?l:lang;
  return (GREETINGS[L]||GREETINGS[CONTENT_LANGS[0]])[dayPart()];
}

export {
  dayPart,
  noActionText,
  greeting,
  GREET_WORDS
};
