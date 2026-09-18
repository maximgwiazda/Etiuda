// ---- Polish z / ze: "ze" before a hard-to-pronounce opening cluster - a sibilant or
// z-sound (z s ś ź ż sz) followed by another consonant ("ze zmianą", "ze sprawą") - plus
// the fixed "ze mną" / "ze wszystkim"; otherwise plain "z".
// CZ AND RZ ARE NOT IN THE SET though they read as if they belong: Polish says
// "z człowiekiem", "z czwartkiem" - the cluster is pronounceable, so no euphonic vowel.
// They were in the list once and put "ze człowiekiem" into a customer-facing greeting.
const PL_VOWELS = "aąeęioóuy";
function isVowelPL(ch){ return !!ch && PL_VOWELS.indexOf(ch) > -1; }
function zForm(phrase){
  const w = String(phrase||"").trim().toLowerCase();
  if(!w) return "z";
  if(/^mn/.test(w)) return "ze";              // ze mną, ze mnie
  if(/^ws[ztp]/.test(w)) return "ze";         // ze wszystkim, ze wstępem
  if(/^sz/.test(w))         return isVowelPL(w[2]) ? "z" : "ze";
  if(/^[szżźś]/.test(w))   return isVowelPL(w[1]) ? "z" : "ze";
  return "z";
}

// ---- Polish vocative for first names: nominative address reads wrong, glaringly so
// for female names ("Dzień dobry, Anno", never Anna); for a man the nominative reads
// colloquial rather than wrong, which is why the table came first and the rule second.
// Order: table -> -ek -> the soft diminutives -> a name ending in -a takes -o -> the
// masculine consonant rule -> leave untouched.
const PL_VOC_PAIRS = [
// Only names the RULES GET WRONG live here - regular ones (-a -> -o, -ek -> -ku,
// -sia/-zia/-cia -> -u) are deliberately absent: dead weight, and re-listing common names
// would MASK a broken rule (the common ones would keep working from the table while the
// rare ones failed - the wrong way round for noticing). Check the rules before adding.
// -nia is ambiguous (Ania -> u, Melania -> o) and -la carries no marker - spelled out.
"Ania:Aniu Hania:Haniu Renia:Reniu Sonia:Soniu Tania:Taniu Ola:Olu Ula:Ulu Ela:Elu",
"Ala:Alu Jola:Jolu Pola:Polu Nela:Nelu",
// male - the seven the rule at the foot of plVocative cannot derive: the fleeting e that
// drops out of Paweł, Aleksander, Kacper, Kasper and Sylwester, the -o that takes -u, and
// one traditional ending. Every other name listed here is now the rule's own answer, name
// for name, and listing it again would mask a rule gone wrong on the common names.
"Paweł:Pawle Aleksander:Aleksandrze Kacper:Kacprze Kasper:Kasprze Sylwester:Sylwestrze",
"Mieszko:Mieszku Wawrzyniec:Wawrzyńcze",
// male - invariant. These LOOK redundant (the rule below leaves a vowel alone anyway), but
// that is the give-up branch rather than a decision: listing them records the form as
// checked and genuinely uninflecting, and holds them if the rule ever reaches a vowel.
"Jerzy:Jerzy Antoni:Antoni Ignacy:Ignacy Cezary:Cezary Ksawery:Ksawery Bruno:Bruno Iwo:Iwo",
"Maurycy:Maurycy Wincenty:Wincenty Hilary:Hilary Alojzy:Alojzy Ambroży:Ambroży Dionizy:Dionizy",
"Jeremi:Jeremi Marceli:Marceli Walenty:Walenty"
].join(" ");
const PL_VOC={};
PL_VOC_PAIRS.split(/\s+/).forEach(p=>{
  const i=p.indexOf(":"); if(i>0) PL_VOC[p.slice(0,i).toLowerCase()]=p.slice(i+1);
});
function plVocative(name){
  const n=String(name||"").trim();
  if(!n) return n;
  const hit=PL_VOC[n.toLowerCase()];
  if(hit) return hit;

  /* The table outranks this: a diminutive is a name somebody is called. Everything past
     here is a rule on the ending, origin aside; an ending that fits none is left as typed. */

  /* -ek -> -ku is reliable for the whole class; the softening step is what a naive suffix
     swap gets wrong - si/ci/ni/zi collapse before the ending, so Grzesiek is Grześku and
     not "Grzesiku". */
  if(/ek$/i.test(n) && n.length>3){
    const stem=n.slice(0,-2)
      .replace(/si$/i,"ś").replace(/ci$/i,"ć")
      .replace(/ni$/i,"ń").replace(/zi$/i,"ź");
    return stem+"ku";
  }

  /* -sia/-zia/-cia are diminutive endings and take -u; -cja/-zja are FULL names and want
     -o (Patrycjo, Alicjo) - the i and the j are doing real work. -nia is deliberately
     absent: genuinely ambiguous (Ania -> Aniu, Melania -> Melanio) - those sit in the
     table, and the -o default is the safer error: too formal reads neutral, too familiar
     reads presumptuous. */
  if(/(sia|zia|cia)$/i.test(n)) return n.slice(0,-1)+"u";

  // Any name ending in -a, not only a female one: Kuba is masculine and Kubo is right.
  if(n.length>2 && /a$/i.test(n)) return n.slice(0,-1)+"o";

  /* THE MASCULINE RULE, and it is the printed one: the vocative is the locative, -u after a
     soft or velar stem and -ie after a hard one, palatalising as it goes. It runs last, so
     the table and the -a branch decide first. THE COST, measured rather than feared: this
     cannot know a name's gender, so a woman whose name ends in a consonant is addressed as
     a man. Of the 500 commonest female names 0 end in anything but -a; of the 500 male
     ones, 277 sat in the nominative before this rule. */
  if(n.length>2 && /[^aąeęioóuy]$/i.test(n)){
    if(/(cz|sz|rz|dz|ch|[cjlżźśńćkgh])$/i.test(n)) return n+"u";
    if(/st$/i.test(n)) return n.slice(0,-2)+"ście";
    if(/t$/i.test(n))  return n.slice(0,-1)+"cie";
    if(/d$/i.test(n))  return n.slice(0,-1)+"dzie";
    if(/r$/i.test(n))  return n.slice(0,-1)+"rze";
    if(/ł$/i.test(n)) return n.slice(0,-1)+"le";
    if(/[bfmnpswz]$/i.test(n)) return n+"ie";
  }
  return n;                                                   // a vowel this rule does not decline
}

export {
  zForm,
  plVocative
};
