// Multi-word filter for combo rows: EVERY term must match (AND), against t and optional alt
/* Word matching for the combo filters: substring misses "change" in "changing", and
   plain prefix fails the other direction. Shared leading characters covers both - and
   handles Polish inflection free (zmian -> zmiana / zmianą) with no per-language stemmer.
   WORD_PREFIX_MIN is the knob: 5 accepts change/changing and rejects refund/refuse;
   shorter queries stay literal, so "cat" still finds "category" by substring. */
const WORD_PREFIX_MIN=5;
/* Diacritic folding: nobody reaches for ą / ł at chat speed, so "bagaz" must find
   "bagaż". Applied to the haystack AND the query, so both meet in one alphabet. An
   explicit map rather than NFD: ł is a stroke letter with no combining form - the Polish
   letter most typed bare would be the one case NFD still failed. Uppercase included so
   the function is safe on text not yet lowercased. */
const FOLD={
  "ą":"a","ć":"c","ę":"e","ł":"l","ń":"n","ó":"o","ś":"s","ź":"z","ż":"z",
  "Ą":"a","Ć":"c","Ę":"e","Ł":"l","Ń":"n","Ó":"o","Ś":"s","Ź":"z","Ż":"z",
  "à":"a","á":"a","â":"a","ã":"a","ä":"a","å":"a","è":"e","é":"e","ê":"e","ë":"e",
  "ì":"i","í":"i","î":"i","ï":"i","ò":"o","ô":"o","õ":"o","ö":"o","ø":"o",
  "ù":"u","ú":"u","û":"u","ü":"u","ý":"y","ÿ":"y","ñ":"n","ç":"c",
  "š":"s","ž":"z","č":"c","ř":"r","ů":"u","ě":"e","ť":"t","ď":"d","ň":"n",
  "ā":"a","ē":"e","ī":"i","ō":"o","ū":"u","æ":"ae","œ":"oe","ß":"ss","đ":"d","þ":"th",
  "À":"a","Á":"a","Â":"a","Ä":"a","È":"e","É":"e","Ê":"e","Ë":"e","Í":"i","Î":"i",
  "Ò":"o","Ô":"o","Ö":"o","Ù":"u","Ú":"u","Ü":"u","Ñ":"n","Ç":"c","Š":"s","Ž":"z"
};
const FOLD_RE=new RegExp("["+Object.keys(FOLD).join("")+"]","g");
function foldDiacritics(s){
  const t=String(s==null?"":s);
  // Fast path: nothing above ASCII means nothing to fold, and this runs over every field of
  // every card on every keystroke. The scan is far cheaper than entering the regex engine
  // with a ~90 character class.
  for(let i=0;i<t.length;i++){ if(t.charCodeAt(i)>127) return t.replace(FOLD_RE,ch=>FOLD[ch]||ch); }
  return t;
}
/** Words of a haystack, for both the combo filters and macro search. */
function splitWords(s){
  return foldDiacritics(String(s==null?"":s).toLowerCase()).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}
function sharedPrefixLen(a,b){
  const n=Math.min(a.length,b.length);
  let i=0;
  while(i<n && a.charCodeAt(i)===b.charCodeAt(i)) i++;
  return i;
}
/* The reverse rule (word is a prefix of the query, e.g. "book" for "booking") needs
   its own floor, or fragments left by apostrophes match far too much: "minor's" splits
   into "minor" and "s", and a bare "s" matched every query starting with that letter. */
const WORD_STEM_MIN=4;
function wordMatchesTerm(word, term){
  if(!word||!term) return false;
  if(word.indexOf(term)===0) return true;                                // book → booking
  if(word.length>=WORD_STEM_MIN && term.indexOf(word)===0) return true;  // booking → book
  if(term.length<WORD_PREFIX_MIN) return false;
  return sharedPrefixLen(word,term)>=WORD_PREFIX_MIN;
}

export {
  foldDiacritics,
  splitWords,
  sharedPrefixLen,
  wordMatchesTerm,
  WORD_PREFIX_MIN,
  WORD_STEM_MIN
};
