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
/* THE NAMES THIS RULE WILL DECLINE AT ALL, ruled 2026-09-17: a name the engine does not know to
   be Polish stands as it was typed, which the sources accept as a vocative. The set is the
   ministry's CC0 register extract, the 500 commonest of each sex, less every name spelt with a
   letter or a pair Polish does not use: the register is names in use IN Poland rather than names
   OF Poland, and 2538 of the people in it are called John. Two more are missing on purpose, each
   a Polish verb form bare, which a name here would blind the diacritics gate to. */
const PL_NAMES=new Set([
  "aaron ada adam adamina adela adelajda adelina adolf adolfa adolfina adrian adriana adrianna ",
  "afrodyta agata agnieszka aida ala alan alana albert alberto albertyna albin albina aldona ",
  "alejandro alek aleks aleksander aleksandra aleksy alena alfons alfred alfreda ali alicja ",
  "alina alojza alojzy amadeusz amalia amanda amelia anastazja anatol anatola anatolia andrea ",
  "andreas andrej andrij andrzej andżelika aneta anetta angel angela angelika angelina ania ",
  "aniceta aniela anika anita anna annika antoni antonia antonina antonio apolinary apolonia ",
  "areta ariadna ariana arianna ariel arkadiusz arleta arletta armand armin arnold aron arsen ",
  "artur asia august augusta augustyn augustyna aurelia aureliusz aurora ałła balbina barbara ",
  "bartek bartosz bartłomiej bazyli beata ben benedykt benedykta beniamin benigna benita ",
  "benjamin benon berenika bernadeta bernadetta bernard bernarda bernardyna berta bianka ",
  "bibiana bibianna biruta blandyna blanka bogda bogdan bogdana bogna bogumił bogumiła bogusz ",
  "bogusław bogusława bolesław bolesława bonifacy boris borys bożena bożenna brajan brandon ",
  "brenda brian bronisław bronisława bruno brunon bryan brygida błażej carlo carlos cecilia ",
  "cecylia celestyna celina cezariusz cezary charles charlie christian christina chrystian ",
  "colin constantin cristian cristina cyntia cyprian cyryl czesław czesława dagmara dagna dalia ",
  "damian dan dana daniel daniela danuta daria dariusz dawid debora delfina dennis diana diego ",
  "dieter dina dioniza dionizy dmitrij dobrawa dobrochna dobromir dobromiła dobrosława domicela ",
  "dominic dominik dominika donat donata dora dorian dorota dymitr dąbrówka edgar edmund ",
  "edmunda eduard eduardo edward edwarda edwin edyta ela eldar elena eleonora eliasz eligia ",
  "eligiusz elina eliza elmira elwira elza elżbieta emanuel emil emilia emilian emiliana ",
  "engelbert enrico eric erik erika ernest ernestyna erwin erwina eryk eryka esmeralda estera ",
  "eufemia eufrozyna eugenia eugeniusz eulalia euzebiusz ewa ewald ewaryst ewelina fabian ",
  "fabiana fabiola fatima faustyna federico felicja felicjan felicyta feliks feliksa ferdynand ",
  "fernando filip filomena fiodor flora florentyna florian francesco francis franciszek ",
  "franciszka franek frank fryda fryderyk fryderyka gabriel gabriela gaja galina genowefa georg ",
  "george georgina gerard gerda gerhard german gertruda gilbert gina ginter gizela gleb gloria ",
  "gniewomir gniewosz gracja gracjan gracjana grażyna gregory greta grzegorz gustaw gustawa ",
  "gwidon halina halszka hana hania hanka hanna hans harald harry hasan hektor helena helga ",
  "helmut henrieta henry henryk henryka herbert herman hermina hiacynta hieronim hilary hilda ",
  "hildegarda honorata horst hubert hugo ian idalia idzi iga ignacy igor ilia ilona ilza ",
  "indira inga ingeborga ingryda ira irena ireneusz irina irma irmina isaac ismena ita iwan ",
  "iweta iwetta iwo iwona iwonka iwonna iza izabela izolda izydor izydora jacek jacenty jacob ",
  "jadwiga jagienka jagna jagoda jakob jakub jan janina janka january janusz jarema jaromir ",
  "jarosław jarosława jason jaśmina jean jelena jens jeremi jeremiasz jerzy joachim joanna jola ",
  "jolanta jonasz jonatan jordan josef jowita juan judyta julia julian juliana julianna ",
  "julietta julita juliusz jurand jurek jurij justin justyn justyna juta józef józefa józefina ",
  "jędrzej kacper kaja kajetan kalina kamil kamila karim karina karl karol karola karolina ",
  "kasandra kasia kasjan kasjana kasper katarina katarzyna kazimiera kazimierz kewin kinga kira ",
  "klara klaudia klaudiusz klaudyna klaus klemens klementyna koleta konrad konstancja ",
  "konstantin konstanty konstantyn kordian kornel kornelia korneliusz koryna kosma kristian ",
  "kryspin kryspina krystian krystiana krystyn krystyna krzesimir krzysztof krzysztofa ksawera ",
  "ksawery ksenia ksymena kuba kunegunda kurt lars larysa laura laurencja lea lech lechosław ",
  "lena leo leokadia leon leona leonard leonarda leonardo leonia leonid leonida leonora ",
  "leontyna leopold leszek lesław lesława letycja lew lidia ligia lilia liliana lilianna lisa ",
  "liwia liza lolita longin longina loretta luba lubomir lubomira luca lucia lucja lucjan ",
  "lucjana lucyna ludgarda ludmiła ludomir ludomira ludomiła ludwik ludwika ludwina luigi luis ",
  "luiza lukian lukrecja maciej magda magdalena majka makary maks maksym maksymilian ",
  "malina malwina manfred manuel manuela marc marcel marcela marceli marcelina marcin marcjanna ",
  "marco marcos marcus marek margareta maria marian marianna marieta marietta marika marina ",
  "mariola mariusz mark marlena marlon marta martyn martyna maryla maryna marysia marzanna ",
  "marzena marzenna mateusz matylda maura maurycy małgorzata melania melinda melisa michalina ",
  "michał mieczysław mieczysława mieszko miguel mikołaj mila milada milan milena mira miranda ",
  "mirela miron mirosław mirosława miłosz miłosława modesta monika mustafa myron nadia nadieżda ",
  "nadzieja narcyz narcyza natalia natalka natan nataniel natasza nela nelson neonila nestor ",
  "nicholas nicolas nika nikita nikodem nikoleta nikoletta nina noam nonna nora norbert norman ",
  "ofelia oksana oktawia oktawian oktawiusz ola olaf oleg olek olena olga olgierd olimpia ",
  "oliwer oliwia oliwier omar orest oresta oriana oscar oskar ostap oswald otto otylia pablo ",
  "pamela patrycja patrycjusz patryk paul paula paulina paweł pelagia peter petr petronela pia ",
  "pierre piotr platon pola prakseda przemysław rachela radek radomir radosław radosława rafał ",
  "rajmund rajnold ralf raul rebeka regina reinhard reinhold remigiusz rena renat renata rene ",
  "ricardo riccardo richard rita robert roberta roberto robin roch rodion roger roksana roland ",
  "roma roman romana romeo romuald romualda ron ronald rosanna rozalia ruben rudolf rufin ruta ",
  "ryan ryszard ryszarda róża sabina sabrina salomea samanta sambor samuel sandra santiago sara ",
  "sean sebastian selma serafin serafina sergiusz seweryn seweryna siergiej simon simona sofia ",
  "sonia stanisław stanisława stefan stefania stela stepan swietłana sylwana sylweriusz ",
  "sylwester sylwia sylwiusz syntia szarlota szczepan szymon sława sławomir sławomira tadeusz ",
  "tal tamara tania taras tatiana tekla teodor teodora teodozja teofil teofila teresa timur ",
  "tina tobiasz tom tomasz tosia tristan tyberiusz tycjan tymon tymoteusz tytus uri urszula ",
  "wacław wacława wadim waldemar walenty walentyna waleria walerian walery walter wanda wasyl ",
  "wawrzyniec wera werner weronika wiaczesław wielisława wiera wiesław wiesława wieńczysław ",
  "wieńczysława wiktor wiktoria wilhelm wilhelmina wincenta wincenty wincentyna winicjusz ",
  "wioleta wioletta wirginia wisława wit witalij witalis witold wojciech wolfgang władysław ",
  "władysława włodzimiera włodzimierz yanina yusuf zachariasz zbigniew zbyszek zbyszko zbysław ",
  "zdzisław zdzisława zefiryna zenaida zenobia zenobiusz zenon zenona ziemowit zinaida zofia ",
  "zosia zuza zuzanna zygfryd zygfryda zygmunt zyta łucja łucjan łukasz żaklina żaneta żanetta ",
  "żanna",
].join("").split(" "));
function plVocative(name){
  const n=String(name||"").trim();
  if(!n) return n;
  const hit=PL_VOC[n.toLowerCase()];
  if(hit) return hit;

  /* The table outranks this: a diminutive is a name somebody is called rather than one a
     register carries. Everything past here is a rule, and a rule needs a Polish name. */
  if(!PL_NAMES.has(n.toLowerCase())) return n;

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
