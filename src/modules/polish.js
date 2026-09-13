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
// for female names ("Dzień dobry, Anno", never Anna). Male names are forgiving in chat,
// so the table carries them but nothing is guessed for an unknown male name.
// Order: table -> a name ending in -a takes -o -> else leave untouched.
const PL_VOC_PAIRS = [
// Only names the RULES GET WRONG live here - regular ones (-a -> -o, -ek -> -ku,
// -sia/-zia/-cia -> -u) are deliberately absent: dead weight, and re-listing common names
// would MASK a broken rule (the common ones would keep working from the table while the
// rare ones failed - the wrong way round for noticing). Check the rules before adding.
// -nia is ambiguous (Ania -> u, Melania -> o) and -la carries no marker - spelled out.
"Ania:Aniu Hania:Haniu Renia:Reniu Sonia:Soniu Ola:Olu Ula:Ulu Ela:Elu Ala:Alu Jola:Jolu",
// male - the stem itself changes, so no suffix rule survives: r->rz, t->cie, d->dzie,
// l->le, st->scie, plus the fleeting e that drops out of Kacper, Kasper, Sylwester and
// Aleksander. This is the bulk of the table and the part that has to grow by hand.
"Jan:Janie Andrzej:Andrzeju Piotr:Piotrze Krzysztof:Krzysztofie Stanisław:Stanisławie",
"Tomasz:Tomaszu Paweł:Pawle Józef:Józefie Marcin:Marcinie Michał:Michale Grzegorz:Grzegorzu",
"Tadeusz:Tadeuszu Adam:Adamie Łukasz:Łukaszu Zbigniew:Zbigniewie Ryszard:Ryszardzie",
"Dariusz:Dariuszu Henryk:Henryku Mariusz:Mariuszu Kazimierz:Kazimierzu Wojciech:Wojciechu",
"Robert:Robercie Mateusz:Mateuszu Marian:Marianie Rafał:Rafale Jakub:Jakubie",
"Sławomir:Sławomirze Wiesław:Wiesławie Artur:Arturze Zdzisław:Zdzisławie Edward:Edwardzie",
"Mirosław:Mirosławie Bartosz:Bartoszu Damian:Damianie Sebastian:Sebastianie Kamil:Kamilu",
"Dawid:Dawidzie Karol:Karolu Filip:Filipie Szymon:Szymonie Maciej:Macieju",
"Aleksander:Aleksandrze Dominik:Dominiku Patryk:Patryku Norbert:Norbercie Oskar:Oskarze",
"Igor:Igorze Wiktor:Wiktorze Nikodem:Nikodemie Leon:Leonie Alan:Alanie Emil:Emilu",
"Fabian:Fabianie Gabriel:Gabrielu Hubert:Hubercie Kacper:Kacprze Konrad:Konradzie",
"Krystian:Krystianie Lech:Lechu Ludwik:Ludwiku Marcel:Marcelu Miłosz:Miłoszu Olaf:Olafie",
"Przemysław:Przemysławie Radosław:Radosławie Sylwester:Sylwestrze Wacław:Wacławie",
"Witold:Witoldzie Zygmunt:Zygmuncie Bogdan:Bogdanie Czesław:Czesławie Eugeniusz:Eugeniuszu",
"Ireneusz:Ireneuszu Janusz:Januszu Julian:Julianie Juliusz:Juliuszu Lucjan:Lucjanie",
"Maksymilian:Maksymilianie Mikołaj:Mikołaju Roman:Romanie Stefan:Stefanie Władysław:Władysławie",
"Zenon:Zenonie Bronisław:Bronisławie Bogusław:Bogusławie Jarosław:Jarosławie",
"Tymoteusz:Tymoteuszu Borys:Borysie Cyprian:Cyprianie Natan:Natanie Oliwier:Oliwierze",
"Tymon:Tymonie Daniel:Danielu Adrian:Adrianie Bartłomiej:Bartłomieju Waldemar:Waldemarze",
"Arkadiusz:Arkadiuszu Beniamin:Beniaminie Bolesław:Bolesławie Benedykt:Benedykcie",
"Edmund:Edmundzie Ernest:Erneście Feliks:Feliksie Florian:Florianie Fryderyk:Fryderyku",
"Gustaw:Gustawie Hieronim:Hieronimie Joachim:Joachimie Kajetan:Kajetanie Kasper:Kasprze",
"Klemens:Klemensie Kornel:Kornelu Leonard:Leonardzie Mieczysław:Mieczysławie Mieszko:Mieszku",
"Seweryn:Sewerynie Teodor:Teodorze Wilhelm:Wilhelmie Wawrzyniec:Wawrzyńcze Aleks:Aleksie",
"Maks:Maksie Alfred:Alfredzie Arnold:Arnoldzie Gerard:Gerardzie Herbert:Herbercie Denis:Denisie",
"Ziemowit:Ziemowicie Samuel:Samuelu Teofil:Teofilu Anatol:Anatolu August:Auguście",
"Bernard:Bernardzie Bogumił:Bogumile Cyryl:Cyrylu Erwin:Erwinie Ferdynand:Ferdynandzie",
"Hektor:Hektorze Izydor:Izydorze Kordian:Kordianie Lesław:Lesławie Longin:Longinie",
"Lubomir:Lubomirze Martin:Martinie Nataniel:Natanielu Otton:Ottonie Rudolf:Rudolfie",
"Symeon:Symeonie Wit:Wicie Zygfryd:Zygfrydzie Brajan:Brajanie",
// male - invariant. These LOOK redundant (an unknown name returns untouched anyway),
// but that is the give-up branch rather than a decision: listing them records the form
// was checked and genuinely does not inflect - and protects them if a general masculine
// rule is ever added above.
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

  /* Two endings can be DERIVED; everything else stays list-driven, deliberately: the
     code cannot know an unknown name's gender, only whether it ends in -a, and a general
     masculine rule would confidently produce "Nicolu" for women whose names are
     indeclinable - far worse than leaving a man in the nominative. -ek -> -ku is reliable
     for the whole class; the softening step is what a naive suffix swap gets wrong -
     si/ci/ni/zi collapse before the ending, so Grzesiek is Grześku, not "Grzesiku". */
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
  return n;                                                   // unknown female / foreign: leave alone
}

export {
  zForm,
  plVocative
};
