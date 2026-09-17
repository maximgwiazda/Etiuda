/* Etiuda's sample catalog, format 1, for the 1.x page. Opt-in demo content, never loaded
   automatically and deliberately NOT a fallback a real catalog replaces. A sibling script
   rather than a fetch, so a copy opened from file:// can load it too.

   Chopin's letters set as a catalog, written so that every feature of the engine is worked
   by at least two cards. A shelf is the city a letter was written from; an intent is either
   one of his forms or one of his subjects; a card's text is a passage from a letter, the
   Polish original beside an English translation, and the title names a piece filed beside
   the passage rather than matched to it.
   The last shelf is the supporting one, and it is where the placeholders live: the reader's
   name in the Polish vocative, the desk's own name in the sign-off, the greeting by the
   clock, the chosen intent with its z or ze, and the note for the file.
   The catalog's NAME is deliberately descriptive: "Chopin's Letters" is the title of the
   Voynich edition of 1931, and CHOPIN is a registered word mark, so neither is used as a
   product name here.
   An omission inside a passage is three plain dots, never the ellipsis glyph: the harness
   rejects characters a keyboard cannot type.
   Every card carries a "src" key the engine does not read, naming the letter, the Polish page
   and the English translation, so swapping a translation is one field per card.
   The same content as sample-catalog-v2.js, in the older shape: a body with alternatives is
   blank-line separated and flagged alt/seq instead of carrying marker lines, an intent is
   linked by its position in the arrays below, and `cat` lists the shelves each intent's own
   cards sit on, which format 2 derives instead of declaring. */
window.PB_SAMPLE={
  format:1, kind:"playbook-catalog", name:"Letters, 1824 to 1831",
  version:"2026-09-17",
  /* Drives the watermark. Not carried into an export. */
  sample:1,
  /* Six shelves: five cities a letter was written from, and one supporting shelf that
     reaches every intent. The palette deals seven hues, so no two shelves share one. */
  categories:{ "t-szafarnia":"Szafarnia", "t-warszawa":"Warsaw", "t-berlin":"Berlin",
               "t-wieden":"Vienna", "t-paryz":"Paris", "t-openings":"Openings and sign-offs" },
  categoriesPl:{ "t-szafarnia":"Szafarnia", "t-warszawa":"Warszawa", "t-berlin":"Berlin",
                 "t-wieden":"Wiedeń", "t-paryz":"Paryż", "t-openings":"Początki i podpisy" },
  /* Pinned rather than dealt, so reordering the shelves repaints nothing. Slots are the
     palette's own deal order; 5 is retired and is not used. */
  icons:{ "t-szafarnia":"notehead", "t-warszawa":"beam", "t-berlin":"sharp",
          "t-wieden":"flat", "t-paryz":"natural", "t-openings":"staff" },
  colors:{ "t-szafarnia":0, "t-warszawa":1, "t-berlin":2,
           "t-wieden":6, "t-paryz":3, "t-openings":7 },
  /* The supporting shelf: its cards reach every intent and keep a blue ring. */
  roles:{ always:["t-openings"] },
  /* Four addressees rather than four relationships, because one list serves both languages
     and a name is the same word in each. The register follows the name. */
  who:["Tytus","Elsner","Jan","Wilhelm"],
  commentLang:"en",
  /* This catalog's own greeting phrases, replacing the built-in table. English says "Good
     day" where the built-in says "Good afternoon"; Polish repeats its first phrase, one
     covering both morning and afternoon. */
  greet:{ en:["Good morning","Good day","Good evening"],
          pl:["Dzień dobry","Dzień dobry","Dobry wieczór"] },
  intents:{
    /* Eight forms, then six subjects. The Polish clause is written in the instrumental so
       that {Z} in front of it can agree: "z nokturnami", but "ze Strzyżewem". */
    en:["the nocturnes","the mazurkas","the etudes","the waltzes",
        "the ballades","the concertos","the rondos","the scherzos",
        "the journey to Berlin","Szafarnia in the summer","Strzyzewo and the two pianos",
        "the cholera in Vienna","the concert on 25 December","the lodgings on the boulevards"],
    pl:["nokturnami","mazurkami","etiudami","walcami",
        "balladami","koncertami","rondami","scherzami",
        "podróżą do Berlina","Szafarnią w lecie","Strzyżewem i dwoma fortepianami",
        "cholerą w Wiedniu","koncertem 25 grudnia","mieszkaniem na bulwarach"],
    /* What each intent lights up: the shelves its own cards happen to sit on, which is
       uneven on purpose - a few heavy intents, a long tail. */
    cat:[["t-warszawa","t-paryz"],
         ["t-szafarnia","t-warszawa","t-wieden"],
         ["t-warszawa","t-berlin","t-wieden"],
         "t-wieden",
         ["t-wieden","t-paryz"],
         ["t-warszawa","t-paryz"],
         ["t-warszawa","t-berlin"],
         ["t-wieden","t-paryz"],
         "t-berlin","t-szafarnia","t-warszawa","t-wieden","t-paryz","t-paryz"],
    cmt:["nocturnes shown","mazurkas shown","etudes shown","waltzes shown",
         "ballades shown","concertos shown","rondos shown","scherzos shown",
         "the journey described","the summer described","the rehearsal described",
         "the cholera mentioned","the date given","the address given"],
    cmtPl:["pokazano nokturny","pokazano mazurki","pokazano etiudy","pokazano walce",
           "pokazano ballady","pokazano koncerty","pokazano ronda","pokazano scherza",
           "opisano podróż","opisano lato","opisano próbę",
           "wspomniano o cholerze","podano datę koncertu","podano adres"],
    topic:["the nocturnes","the mazurkas","the etudes","the waltzes",
           "the ballades","the concertos","the rondos","the scherzos",
           "the journey to Berlin","the summer at Szafarnia","the two pianos",
           "the cholera in Vienna","the concert on 25 December","the lodgings on the boulevards"],
    topicPl:["nokturny","mazurki","etiudy","walce",
             "ballady","koncerty","ronda","scherza",
             "podróż do Berlina","lato w Szafarni","dwa fortepiany",
             "cholera w Wiedniu","koncert 25 grudnia","mieszkanie na bulwarach"]
  },
  cards:[
    { c:"t-szafarnia", t:"Mazurka in F major, Op. 68 No. 3", tPl:"Mazurek F-dur op. 68 nr 3",
      k:"szafarnia koń horse małpa monkey niedźwiedź bear", intents:[1,9],
      note:"A shelf is the city a letter was written from, and a title names a piece filed beside the passage rather than matched to it. This card answers two intents, one of them a form and one of them a subject.",
      notePl:"Półka to miasto, z którego wysłano list, a tytuł nazywa utwór postawiony obok fragmentu, a nie do niego dobrany. Ta karta odpowiada na dwie intencje: jedną formę i jeden temat.",
      en:"I am having a very good time of it, and you are not the only one who rides, for I can sit a horse too. ... The horse goes slowly wherever it pleases, and I sit on it in fear, like a monkey on a bear.",
      pl:"Ja się też wcale nieźle bawię, a nietylko ty jeździsz na koniu, bo ja umiem na nim siedzieć. ... koń powoli gdzie chce idzie, a ja jak małpa na niedźwiedziu, na nim ze strachem siedzę.",
      src:"Chopin to Wilhelm Kolberg, 19 Aug 1824, Szafarnia. PL: Karasowski 1882 I.44 (Tom_I/Rozdział_II). EN: rendered here, Niecks ch. III having it in narrative. Shortened." },
    { c:"t-szafarnia", t:"Mazurka in B flat major, Op. 7 No. 1", tPl:"Mazurek B-dur op. 7 nr 1",
      k:"szafarnia muchy flies komary mosquitoes nos nose", intents:[1],
      en:"the flies sit on my prominent nose--this, however, is of no consequence, it is the habit of these little animals. The mosquitoes bite me--this too, however, is of no consequence, for they don't bite me in the nose.",
      pl:"Muchy mi często na wyniosłym nosie siadają ... Komary mię gryzą, ale i to mniejsza, bo nie w nos.",
      src:"Chopin to Wilhelm Kolberg, 19 Aug 1824, Szafarnia. PL: Karasowski 1882 I.44 (Tom_I/Rozdział_II). EN: Niecks 1888 ch. III (Gutenberg 4973), the double hyphens as Gutenberg prints them." },
    { c:"t-szafarnia", t:"Mazurka in A minor, Op. 17 No. 4", tPl:"Mazurek a-moll op. 17 nr 4",
      k:"szafarnia ogród garden las wood", intents:[9],
      note:"Three mazurkas on one shelf, and all three out of one letter: Szafarnia is the village summer where a boy of fourteen first heard the dance played.",
      notePl:"Trzy mazurki na jednej półce i wszystkie trzy z jednego listu: Szafarnia to wiejskie lato, w którym czternastolatek pierwszy raz usłyszał ten taniec.",
      en:"I run about the garden, and sometimes I walk. I walk to the wood, and sometimes I ride.",
      pl:"Biegam po ogrodzie, a czasem chodzę. Chodzę do lasu, a czasem jeżdżę.",
      src:"Chopin to Wilhelm Kolberg, 19 Aug 1824, Szafarnia. PL: Karasowski 1882 I.44 (Tom_I/Rozdział_II). EN: rendered here." },
    { c:"t-warszawa", t:"Rondo in C major, Op. posth. 73", tPl:"Rondo C-dur op. 73",
      k:"strzyżewo ernemann bucholtz fortepiany pianos", intents:[6,10],
      note:"Pick either of this card's two intents and it rises, with its shelf ringed green. Its subject is also where the Polish preposition changes: the panel's clause is \"Strzyzewem\", so {Z} becomes ze.",
      notePl:"Wybierz którąkolwiek z dwóch intencji tej karty, a karta podniesie się, a jej półka zyska zielony pierścień. Na tym temacie widać też zmianę przyimka: klauzula brzmi \"Strzyżewem\", więc {Z} przechodzi w ze.",
      en:"At Strzyzewo I recast that Rondo in C major ... for two pianos; today I tried it with Ernemann at Bucholtz's, and it came out well enough.",
      pl:"W Strzyżewie przerobiłem owe Rondo C-dur ... na 2 fortepiany; dzisiaj go próbowałem z Ernemannem u Bucholtza, i dosyć się dobrze wydało.",
      src:"Chopin to Tytus Woyciechowski, 9 Sep 1828, Warsaw. PL: Karasowski 1882 I.75 (Tom_I/Rozdział_IV). EN: rendered here; Niecks ch. IV tells it in narrative. Shortened." },
    { c:"t-warszawa", t:"Etude in A flat major, Op. 25 No. 1", tPl:"Etiuda As-dur op. 25 nr 1",
      k:"etiuda etude skomponowałem composed tytus", intents:[2],
      en:"I have composed an etude in my own manner; when we meet I shall play it to you.",
      pl:"Skomponowałem Etiudę w moim sposobie, jak się zobaczemy, to ci ją zagram.",
      src:"Chopin to Tytus Woyciechowski, 20 Oct 1829. PL: Karasowski 1882 I.147 (Tom_I/Rozdział_VI). EN: rendered here; Niecks ch. IX has the sentence only in narrative." },
    { c:"t-warszawa", t:"Piano Concerto No. 2 in F minor, Op. 21", tPl:"Koncert f-moll op. 21",
      k:"ideał ideal adagio koncert concerto", intents:[5], allIntents:1, intentTop:1,
      note:"Linked to every intent and marked to stand first among them, so whichever intent is picked this card is at the top of it. The piece and the passage match for once: the Adagio he means is this concerto's.",
      notePl:"Powiązana z każdą intencją i oznaczona tak, by stawać wśród nich pierwsza, więc przy każdym wyborze znajdziesz ją na górze. Tu wyjątkowo utwór i fragment pasują do siebie: Adagio, o którym mowa, należy do tego koncertu.",
      en:"I have--perhaps to my misfortune--already found my ideal, which I worship faithfully and sincerely. ... Whilst my thoughts were with her I composed the Adagio of my Concerto.",
      pl:"mam mój ideał, któremu wiecznie, nie mówiąc z nim, już pół roku służę ... na którego pamiątkę skomponowałem Adagio do mojego Koncertu.",
      src:"Chopin to Tytus Woyciechowski, 3 Oct 1829. PL: Karasowski 1882 I.142 (Tom_I/Rozdział_VI). EN: Niecks 1888 ch. IX (Gutenberg 4973), the double hyphens as Gutenberg prints them. Shortened." },
    { c:"t-warszawa", t:"Rondo à la mazur in F major, Op. 5", tPl:"Rondo à la mazur F-dur op. 5",
      k:"adagio rondo potpourri warszawa warsaw", intents:[6,1],
      note:"The title names two forms, so the card sits on both intents.",
      notePl:"Tytuł nazywa dwie formy, więc karta stoi przy obu intencjach.",
      en:"The Adagio and the Rondo made the greatest effect. ... As for the potpourri on Polish airs, to my mind it missed its mark altogether.",
      pl:"Adagio i Rondo największy efekt sprawiło. ... Ale co Potpouri z polskich pieśni, zupełnie podług mnie celu nie dopięło.",
      src:"Chopin to Tytus Woyciechowski, 27 Mar 1830. PL: Karasowski 1882 I.151-152 (Tom_I/Rozdział_VI). EN: rendered here, neither Niecks nor Hill opened for this sentence. Shortened." },
    { c:"t-warszawa", t:"Nocturne in E major, Op. 62 No. 2", tPl:"Nokturn E-dur op. 62 nr 2",
      k:"adagio noc night księżyc moon wiosna spring", intents:[0,5],
      en:"The Adagio is in E major, and of a romantic, calm, and partly melancholy character ... for instance, on a fine, moonlit spring night.",
      pl:"Adagio jest w tonie E-dur; charakter jego romansowy, spokojny, melancholiczny; ... dumanie podczas pięknej wiosennej nocy, oświetlonej księżycem.",
      src:"Chopin to Tytus Woyciechowski, 15 May 1830. PL: Karasowski 1882 I.165-166 (Tom_I/Rozdział_VI). EN: Niecks 1888 ch. XIII (Gutenberg 4973). Shortened." },
    { c:"t-warszawa", t:"Nocturne in C sharp minor, Op. 27 No. 1", tPl:"Nokturn cis-moll op. 27 nr 1",
      k:"kraków wiedeń praga drezno wrocław teatr theatre",
      note:"A card on no intent. It stays where it is filed and comes back through its shelf, which is how most of a catalog begins.",
      notePl:"Karta bez intencji. Zostaje tam, gdzie ją odłożono, i wraca przez swoją półkę. Tak zaczyna się większość katalogów.",
      en:"I have been to Cracow, Vienna, Prague, Dresden and Breslau. ... Just imagine my playing twice in the Royal and Imperial Theatre in so short a time.",
      pl:"żem był w Krakowie, Wiedniu, Pradze, Dreznie, Wrocławiu. ... Wystaw sobie, w tak krótkim czasie kazali mi dwa razy grać na cesarsko-królewskim teatrze!",
      src:"Chopin to Tytus Woyciechowski, 12 Sep 1829, Warsaw. PL: Karasowski 1882 I.135 (Tom_I/Rozdział_VI). EN: Hill 1879 (Gutenberg 46577), Niecks not having it as letter text. Shortened." },
    { c:"t-berlin", t:"Rondo in E flat major, Op. 16", tPl:"Rondo Es-dur op. 16",
      k:"berlin dyliżans diligence podróż journey niedziela sunday", intents:[8,6], alt:1, seq:1,
      note:"An ordered sequence: the blocks are numbered as steps rather than offered as alternatives. Leave Warsaw, arrive on the Sunday, and start home at the end of the month.",
      notePl:"Uporządkowana sekwencja: bloki są numerowane jako kroki, a nie podawane jako warianty. Wyjazd z Warszawy, przyjazd w niedzielę, powrót pod koniec miesiąca.",
      en:"For I am going to-day to Berlin.\n\nWe arrived safely in this great city about 3 o'clock on Sunday afternoon.\n\nAt the end of this month I shall leave Berlin, a five days' journey by diligence!",
      pl:"jadę dziś do Berlina!\n\nW niedzielę około 3 popołudniu, przydyliżansowaliśmy do tego zawielkiego miasta.\n\nKu końcowi tego miesiąca opuszczę Berlin. Pięć dni drogi dyliżansem!",
      src:"Step 1: to Tytus Woyciechowski, 9 Sep 1828, Warsaw, Karasowski 1882 I.74 (Tom_I/Rozdział_IV), EN Niecks 1888 ch. VI (Gutenberg 4973). Step 2: to his parents, 16 Sep 1828, Berlin, Karasowski 1882 I.77 (Tom_I/Rozdział_IV), EN Hill 1879 (Gutenberg 46577). Step 3: to Tytus, 9 Sep 1828, Karasowski 1882 I.76, EN Hill 1879 (Gutenberg 46577). All shortened." },
    { c:"t-berlin", t:"Etude in E major, Op. 10 No. 3", tPl:"Etiuda E-dur op. 10 nr 3",
      k:"handel oratorium oratorio spontini zelter mendelssohn", intents:[2], alt:1,
      note:"Two alternatives, both out of the same letter, offered rather than ordered. Click the one you want.",
      notePl:"Dwa warianty, oba z tego samego listu, podane do wyboru, a nie po kolei. Kliknij ten, który chcesz.",
      en:"Handel's oratorio for St Cecilia's Day came nearer to the ideal I have formed of great music.\n\nSpontini, Zelter, and Felix Mendelssohn-Bartholdy were also there; but I spoke to none of these gentlemen, as I did not think it becoming to introduce myself.",
      pl:"Oratoryum Cäcilienfest Händla, więcej się zbliżało do ideału, jaki sobie o wielkiej muzyce utworzyłem.\n\nSpontiniego, Zeltera, Mendelsohna widziałem, lecz z żadnym nie mówiłem, bo nie śmiałem się sam rekomendować.",
      src:"Chopin to his parents, 20 Sep 1828, Berlin. PL: Karasowski 1882 I.82 (Tom_I/Rozdział_IV). EN: first alternative rendered here, Niecks ch. VI reporting it in narrative; second alternative Niecks 1888 ch. VI (Gutenberg 4973)." },
    { c:"t-berlin", t:"Nocturne in G major, Op. 37 No. 2", tPl:"Nokturn G-dur op. 37 nr 2",
      k:"berlin miasto city ludność people",
      note:"The second card on no intent, and the one that shows what a shelf is for: nothing in the panel reaches it, and the city does.",
      notePl:"Druga karta bez intencji, i ta, która pokazuje, po co jest półka: nic z panelu do niej nie sięga, a miasto tak.",
      en:"My general opinion of Berlin: that it is too wide, and that as many people again could be fitted into it with ease.",
      pl:"ogólne zaś moje zdanie o Berlinie: że za szeroki, zdaje się, że jeszcze drugie tyle ludności snadnie zmieścićby się w nim mogło.",
      src:"Chopin to his parents, 16 Sep 1828, Berlin. PL: Karasowski 1882 I.79 (Tom_I/Rozdział_IV). EN: rendered here, neither Niecks nor Hill opened for this sentence." },
    { c:"t-berlin", t:"Berceuse in D flat major, Op. 57", tPl:"Berceuse Des-dur op. 57",
      k:"zdrowie health teatr theatre berlin powrót return", intents:[8],
      en:"I am well, and I have seen what there was to see. I am coming back to you. ... I do nothing but haunt the theatre.",
      pl:"Zdrów jestem, widziałem co można było widzieć. Wracam do Was. ... Nic nie robię tylko łażę na teatr.",
      src:"Chopin to his parents, 27 Sep 1828, Berlin. PL: Karasowski 1882 I.84 (Tom_I/Rozdział_IV). EN: rendered here, neither Niecks nor Hill opened for this sentence. Shortened." },
    { c:"t-wieden", t:"Waltz in A flat major, Op. 34 No. 1", tPl:"Walc As-dur op. 34 nr 1",
      k:"walce waltz strauss lanner druk printed", intents:[3], alt:1,
      note:"Two sentences out of one letter to his teacher, and the second answers the first. The pair is offered rather than ordered, so either can be sent alone.",
      notePl:"Dwa zdania z jednego listu do nauczyciela, a drugie odpowiada pierwszemu. Para jest podana do wyboru, a nie po kolei, więc każde może pójść osobno.",
      en:"Waltzes are here called works; and Lanner and Strauss, who lead the performances, Capellmeister.\n\nStill, it is almost only waltzes that are published.",
      pl:"Oni tu Walce dziełami nazywają, a Straussa i Lannera, którzy do tańca przygrywają, kapelmeistrami!\n\nale mimo to, Walce tylko drukują.",
      src:"Chopin to Józef Elsner, Vienna, 29 Jan 1831 in Karasowski and 16 Jan in Hill. PL: Karasowski 1882 I.246 (Strona:...t.I.djvu/246). EN: Niecks 1888 ch. XII (Gutenberg 4973), both alternatives." },
    { c:"t-wieden", t:"Etude in C minor, Op. 10 No. 12", tPl:"Etiuda c-moll op. 10 nr 12",
      k:"malfatti kosmopolita cosmopolitan polak pole", intents:[2],
      en:"Malfatti gives himself useless trouble in trying to convince me that the artist is, or ought to be, a cosmopolitan. And, supposing this were really the case, as an artist I am still in the cradle, but as a Pole already a man.",
      pl:"Malfatti napróżno się stara mię przekonać, iż każdy artysta jest kosmopolitą. Choćby i tak było, to jako artysta, jestem jeszcze w kolebce, a jako Polak, trzeci krzyżyk zacząłem.",
      src:"Chopin to Józef Elsner, Vienna, 29 Jan 1831 in Karasowski and 16 Jan in Hill. PL: Karasowski 1882 I.244 (Strona:...t.I.djvu/244). EN: Niecks 1888 ch. XI (Gutenberg 4973)." },
    { c:"t-wieden", t:"Ballade No. 4 in F minor, Op. 52", tPl:"Ballada f-moll op. 52",
      k:"biblioteka library rękopis manuscript bolonia bologna", intents:[4],
      en:"picture to yourselves my astonishment when, among the newer manuscripts, I see a volume ... lettered Chopin. I take it out, I look, and it is my own hand.",
      pl:"wystawcie sobie moje zdziwienie, gdy pomiędzy nowszemi rękopismami, widzę książkę ... z napisem Chopin. Wyjmuję, patrzę, moja ręka.",
      src:"Chopin to his parents, 14 May 1831, Vienna. PL: Karasowski 1882 I.249-250 (Strona:...t.I.djvu/249). EN: rendered here; Niecks ch. XII tells the episode in narrative. Shortened." },
    { c:"t-wieden", t:"Scherzo No. 3 in C sharp minor, Op. 39", tPl:"Scherzo cis-moll op. 39",
      k:"fajerwerk fireworks kahlenberg sobieski cholera", intents:[7,11], alt:1, seq:1,
      note:"The Vienna summer of 1831 in the order it happened: May, June, July. The card answers a form and a subject at once, and the subject is the one nobody looks for until they need it.",
      notePl:"Wiedeńskie lato 1831 roku w kolejności, w jakiej się zdarzyło: maj, czerwiec, lipiec. Karta odpowiada naraz na formę i na temat, a tego tematu nikt nie szuka, dopóki nie jest potrzebny.",
      en:"Last Sunday there was to have been a grand display of fireworks, but the rain spoilt it. It is a remarkable fact that it almost always rains here when they are going to have fireworks.\n\nAfter breakfast we went up the Kahlenberg, where King Sobieski had his camp, and I am sending Isabella a leaf from it.\n\nEveryone is terribly afraid of the cholera ... Printed prayers are sold, supplicating God and all the saints to stop the cholera. Nobody ventures to eat fruit.",
      pl:"W przeszłą niedzielę miał być wielki fajerwerk, lecz się nie udał z powodu deszczu. Szczególna rzecz, iż zawsze prawie w dzień fajerwerkowy, musi być niepogoda.\n\nPo śniadaniu udaliśmy się na Kahlenberg, gdzie król Sobieski miał obóz, (z niego posyłam Izabelli listek).\n\nCholery tu się strasznie boją, aż śmiech bierze. Drukowane modlitwy od cholery sprzedają, owoców nie jedzą, a najwięcéj z miasta uciekają.",
      src:"Step 1: to his parents, 14 May 1831, Karasowski 1882 I.250 (Strona:...t.I.djvu/250), EN Hill 1879 (Gutenberg 46573). Step 2: to his parents, 25 June 1831, Karasowski 1882 I.257, EN rendered here. Step 3: to his parents, July 1831, Karasowski 1882 I.259, EN Hill 1879 (Gutenberg 46573). Steps 2 and 3 shortened." },
    { c:"t-wieden", t:"Mazurka in B flat minor, Op. 24 No. 4", tPl:"Mazurek b-moll op. 24 nr 4",
      k:"polskie motywa polish airs majufes publiczność", intents:[1],
      en:"Poor Polish airs! You do not in the least suspect how you will be interlarded with 'majufes' ... and that the title of 'Polish music' is only given you to entice the public.",
      pl:"Biedne polskie motywa! ani się spodziewacie, jakiemi majufesami was naszpikują, nazywając to dla przywabienia publiczności polską muzyką.",
      src:"Chopin to his parents, 28 May 1831. PL: Karasowski 1882 I.253 (Strona:...t.I.djvu/253). EN: Niecks 1888 ch. XII (Gutenberg 4973). Shortened." },
    { c:"t-paryz", t:"Ballade No. 3 in A flat major, Op. 47", tPl:"Ballada As-dur op. 47",
      k:"kalkbrenner nowy świat new world elsner", intents:[4], intentTop:1,
      note:"Marked to stand first among the ballades. Where a card leads an intent is the catalog's decision, and a star of your own still lifts above it.",
      notePl:"Oznaczona tak, by stawać pierwsza wśród ballad. O tym, która karta otwiera intencję, decyduje katalog, a Twoja własna gwiazdka i tak podnosi się ponad nią.",
      en:"I shall never become a copy of Kalkbrenner; he will not be able to break my perhaps bold but noble resolve--TO CREATE A NEW ART-ERA.",
      pl:"Mam tyle pojęcia, że nie będę kopią Kalkbrennera; nie zdoła on zatrzeć zbyt śmiałej może, ale szlachetnej mojej chęci: utworzenia sobie nowego świata.",
      src:"Chopin to Józef Elsner, 14 Dec 1831, Paris. PL: Karasowski 1882 II.18 (Tom_II/Rozdział_I). EN: Niecks 1888 ch. XV (Gutenberg 4973), the double hyphen as Gutenberg prints it." },
    { c:"t-paryz", t:"Scherzo No. 1 in B minor, Op. 20", tPl:"Scherzo h-moll op. 20",
      k:"pianiści pianists wirtuozi virtuosi paryż paris", intents:[7],
      en:"I do not know whether there are more pianists anywhere than in Paris,\nnor whether there are more asses and more virtuosi anywhere than here.",
      pl:"nie wiem czy gdzie więcej pianistów jak w Paryżu,\nnie wiem czy gdzie więcej osłów i więcej wirtuozów jak tu.",
      src:"Chopin to Tytus Woyciechowski, 12 Dec 1831, Paris. PL: Karasowski 1882 II.23 (Tom_II/Rozdział_I), the original's dash set here as a line break. EN: rendered here; Niecks ch. XV has it in narrative only." },
    { c:"t-paryz", t:"Piano Concerto No. 1 in E minor, Op. 11", tPl:"Koncert e-moll op. 11",
      k:"koncert concerto monachium munich bawaria bavaria", intents:[5],
      en:"I played my E minor Concerto, which charmed the people of the Bavarian capital so much.",
      pl:"Zagrałem mój Koncert E-moll, nad którym unoszono się w stolicy bawarskiej.",
      src:"Chopin to Tytus Woyciechowski, 12 Dec 1831, Paris. PL: Karasowski 1882 II.24 (Tom_II/Rozdział_I). EN: Niecks 1888 ch. XV (Gutenberg 4973)." },
    { c:"t-paryz", t:"Nocturne in B flat minor, Op. 9 No. 1", tPl:"Nokturn b-moll op. 9 nr 1",
      k:"przeczucia foreboding sen dream tęsknota longing", intents:[0], allIntents:1,
      note:"The second card linked to every intent, and this one is not marked to lead: it turns up wherever you are, below whatever the catalog puts first.",
      notePl:"Druga karta powiązana z każdą intencją, ale bez oznaczenia pierwszeństwa: pojawia się wszędzie, poniżej tego, co katalog stawia na początku.",
      en:"Uneasy forebodings, restlessness, bad dreams or no sleep at all, a longing ...",
      pl:"Jakieś przeczucia niedobre, niepokój, złe sny, albo bezsenność, tęsknota ...",
      src:"Chopin to Tytus Woyciechowski, 25 Dec 1831, Paris. PL: Karasowski 1882 II.36 (Tom_II/Rozdział_I). EN: rendered here; Niecks's wording for this sentence was not reached. Shortened." },
    { c:"t-paryz", t:"Impromptu No. 1 in A flat major, Op. 29", tPl:"Impromptu As-dur op. 29",
      k:"bulwary boulevard balkon balcony piętro floor", intents:[13],
      note:"A card on a subject and on no form. The panel holds both kinds, and an address is the sort of thing a desk is asked for far more often than a ballade.",
      notePl:"Karta przy temacie, a nie przy formie. Panel trzyma jedne i drugie, a o adres pytają znacznie częściej niż o balladę.",
      en:"I live on the fourth floor, though in the prettiest place there is, on the boulevards, with a little balcony over the street.",
      pl:"mieszkam na 4 piętrze, ale w najładniejszym miejscu, bo na bulwarach; mam balkonik na ulicę wychodzący.",
      src:"Chopin to Tytus Woyciechowski, 25 Dec 1831, Paris. PL: Karasowski 1882 II.31 (Tom_II/Rozdział_I). EN: rendered here, neither Niecks nor Hill opened for this sentence." },
    { c:"t-paryz", t:"Nocturne in F minor, Op. 55 No. 1", tPl:"Nokturn f-moll op. 55 nr 1",
      k:"baillot brod paganini oboista oboist", intents:[0,12],
      en:"I am giving a concert on 25 December; Baillot, that rival of Paganini, and Brod the celebrated oboist will take part in it.",
      pl:"Daję koncert 25 grudnia; Baillot, ów rywal Paganiniego, Brodt sławny oboista, przyjmą w nim udział.",
      src:"Chopin to Tytus Woyciechowski, 12 Dec 1831, Paris. PL: Karasowski 1882 II.25 (Tom_II/Rozdział_I). EN: rendered here; Niecks ch. XV gives the concert in narrative." },
    { c:"t-openings", t:"The opening", tPl:"Początek",
      k:"powitanie greeting wołacz vocative otwarcie opening", firstOnly:1, paxVoc:1,
      note:"The letters to Tytus open \"Najdroższy Tytusie\", and this card does the same work with the app's own words. {PAX} takes the reader's name, in the vocative on a Polish card; {GREET} follows the clock, in this catalog's own phrasing; {INTENT} is whatever the panel has chosen. {Z} is the Polish preposition made to agree: \"z Szafarnią\" but \"ze Strzyżewem\".",
      notePl:"Listy do Tytusa zaczynają się od \"Najdroższy Tytusie\", a ta karta robi to samo słowami aplikacji. {PAX} przyjmuje imię odbiorcy, na polskiej karcie w wołaczu; {GREET} idzie za zegarem, w brzmieniu tego katalogu; {INTENT} to wybrana intencja. {Z} to przyimek uzgadniany z tym, co po nim: \"z Szafarnią\", ale \"ze Strzyżewem\".",
      en:"{GREET}, {PAX}. What news of {INTENT}?",
      pl:"{GREET}, {PAX}. Co słychać {Z} {INTENT}?",
      src:"Composed here, not a letter. The opening is modelled on Chopin's own, Karasowski 1882 Tom_I/Rozdział_VI (\"Najdroższy Tytusie!\"); the words in braces are the engine's placeholders." },
    { c:"t-openings", t:"The sign-off", tPl:"Podpis",
      k:"podpis signature inicjały initials pożegnanie farewell",
      note:"Chopin signs \"Twój Fryderyk\". Here the name is the desk's own: {AGENT} is the name set on the first run, {INIT} the initials it makes. The second card carrying {INTENT}, so the preposition can be watched twice.",
      notePl:"Chopin podpisuje się \"Twój Fryderyk\". Tu imię należy do biurka: {AGENT} to imię ustawione przy pierwszym uruchomieniu, a {INIT} to inicjały z niego zrobione. Druga karta z {INTENT}, więc przyimek widać dwa razy.",
      en:"I close for today and leave you with {INTENT}.\n{AGENT} ({INIT})",
      pl:"Kończę na dziś i zostawiam Cię {Z} {INTENT}.\n{AGENT} ({INIT})",
      src:"Composed here, not a letter. The sign-off is modelled on Chopin's own, Karasowski 1882 Tom_I/Rozdział_VI (\"Twój Fryderyk\"); the words in braces are the engine's placeholders." },
    { c:"t-openings", t:"The hour, and who it is for", tPl:"Pora dnia i adresat",
      k:"pora dnia daypart adresat addressee rano morning wieczór evening", firstOnly:1, paxVoc:1,
      note:"{DAYPART} is a split decision: the engine says which part of the day it is and the catalog writes all three phrasings, so Polish can agree with the verb in front of it. {ROLE} is the addressee picked in the row above the cards.",
      notePl:"{DAYPART} to decyzja dzielona: aplikacja mówi, która to pora dnia, a katalog pisze wszystkie trzy wersje, żeby polszczyzna zgadzała się z poprzedzającym czasownikiem. {ROLE} to adresat wybrany w rzędzie nad kartami.",
      en:"{GREET}, {PAX}. Written {DAYPART:this morning|this afternoon|this evening}, and the addressee is {ROLE}.\n{AGENT}",
      pl:"{GREET}, {PAX}. Pisane {DAYPART:dziś rano|dziś po południu|dziś wieczorem}, a adresat to {ROLE}.\n{AGENT}",
      src:"Composed here, not a letter. The words in braces are the engine's placeholders; the four addressees in the role list are the men Chopin writes to in this catalog." },
    { c:"t-openings", t:"The note for the file", tPl:"Notatka do akt",
      k:"notatka note akta file temat subject działanie action", lockLang:"en",
      note:"An internal line rather than a letter, so the card is pinned to one language: a file is kept in the language the desk keeps it in, whichever way the toggle is set. The Polish is carried in the file for whoever unpins it. {TOPIC} names the intent and {ACTION} says what was done; a catalog that writes neither never sees these two fields at all.",
      notePl:"To zapis wewnętrzny, a nie list, więc karta jest przypięta do jednego języka: akta prowadzi się w tym języku, w którym biurko je prowadzi, niezależnie od przełącznika. Polska wersja czeka w pliku na tego, kto kartę odepnie. {TOPIC} nazywa intencję, a {ACTION} mówi, co zrobiono; katalog, który nie pisze żadnego z nich, nigdy tych dwóch pól nie zobaczy.",
      en:"Addressee: {ROLE}. Subject: {TOPIC}. {ACTION}. Noted by {INIT}, {DAYPART:morning|afternoon|evening}.",
      pl:"Adresat: {ROLE}. Temat: {TOPIC}. {ACTION}. Zanotowano: {INIT}, {DAYPART:rano|po południu|wieczorem}.",
      src:"Composed here, not a letter. The words in braces are the engine's placeholders." },
    { c:"t-openings", t:"What the letter is about", tPl:"O czym jest list",
      k:"temat subject list letter podsumowanie summary", lockLang:"en",
      note:"The second internal line and the second card pinned to English. A subject line in the panel's own words, so a long letter can be filed in one glance.",
      notePl:"Drugi zapis wewnętrzny i druga karta przypięta do angielskiego. Temat zapisany słowami panelu, żeby długi list dało się odłożyć jednym spojrzeniem.",
      en:"In this letter: {TOPIC}. {ACTION}.",
      pl:"W tym liście: {TOPIC}. {ACTION}.",
      src:"Composed here, not a letter. The words in braces are the engine's placeholders." }
  ],
  /* The panel renders white-space:pre - it scrolls sideways rather than wrapping, so every
     line is wrapped by hand. Longest line below: 54 characters. */
  facts:"THE SAMPLE\n"
    +"Chopin's letters set as a catalog. A shelf is the city\n"
    +"the letter was written from, an intent is one of his\n"
    +"forms or one of his subjects, and a card's text is a\n"
    +"passage from a letter, the Polish beside an English\n"
    +"translation. A title names a piece and is filed beside\n"
    +"the passage rather than matched to it.\n"
    +"\n"
    +"WHAT THE APP FILLS IN\n"
    +"The last shelf carries the placeholders: the reader's\n"
    +"name in the Polish vocative, your own name in the\n"
    +"sign-off, the greeting by the clock, the chosen intent\n"
    +"with its z or ze, and the note for the file with its\n"
    +"subject and its action.\n"
    +"\n"
    +"ADDRESSEES\n"
    +"Tytus Woyciechowski and Jan Matuszyński, school\n"
    +"friends; Józef Elsner, his teacher; Wilhelm Kolberg, a\n"
    +"boy he wrote to from Szafarnia. The register follows\n"
    +"the name: formal to Elsner, loose to the other three.\n"
    +"\n"
    +"DATES AND PLACES\n"
    +"Szafarnia, August 1824. Warsaw, 1828 to 1830. Berlin,\n"
    +"September 1828: five days on the road by diligence, in\n"
    +"at three on the Sunday. Vienna, 1830 to 1831. Paris\n"
    +"from September 1831: the fourth floor, on the\n"
    +"boulevards, and a concert announced for 25 December.\n"
    +"\n"
    +"SOURCES\n"
    +"Polish: Karasowski, Fryderyk Chopin, Warszawa 1882.\n"
    +"English: Niecks 1888 where he has the letter, Emily\n"
    +"Hill 1879 where only she has it, otherwise rendered\n"
    +"here. Each card names its own source in a src field\n"
    +"the engine does not read.\n"
    +"\n"
    +"PRÓBKA\n"
    +"Listy Chopina ułożone jak katalog. Półka to miasto, z\n"
    +"którego wysłano list, intencja to jedna z jego form\n"
    +"albo jeden z jego tematów, a tekst karty to fragment\n"
    +"listu, polski oryginał obok angielskiego przekładu.\n"
    +"Tytuł nazywa utwór i stoi obok fragmentu, a nie jest\n"
    +"do niego dobrany.\n"
    +"\n"
    +"CO UZUPEŁNIA APLIKACJA\n"
    +"Ostatnia półka niesie znaczniki: imię odbiorcy w\n"
    +"wołaczu, Twoje imię w podpisie, powitanie według\n"
    +"zegara, wybraną intencję razem z \"z\" albo \"ze\", oraz\n"
    +"notatkę do akt z tematem i działaniem.\n"
    +"\n"
    +"ADRESACI\n"
    +"Tytus Woyciechowski i Jan Matuszyński, koledzy ze\n"
    +"szkoły; Józef Elsner, nauczyciel; Wilhelm Kolberg,\n"
    +"chłopiec, do którego pisał z Szafarni. Ton idzie za\n"
    +"nazwiskiem: do Elsnera oficjalnie, do pozostałych\n"
    +"swobodnie.\n"
    +"\n"
    +"DATY I MIEJSCA\n"
    +"Szafarnia, sierpień 1824. Warszawa, 1828 do 1830.\n"
    +"Berlin, wrzesień 1828: pięć dni drogi dyliżansem,\n"
    +"przyjazd w niedzielę o trzeciej. Wiedeń, 1830 do 1831.\n"
    +"Paryż od września 1831: czwarte piętro na bulwarach\n"
    +"i koncert zapowiedziany na 25 grudnia.\n"
    +"\n"
    +"ŹRÓDŁA\n"
    +"Polski: Karasowski, Fryderyk Chopin, Warszawa 1882.\n"
    +"Angielski: Niecks 1888 tam, gdzie ma dany list, Emily\n"
    +"Hill 1879 tam, gdzie ma go tylko ona, w pozostałych\n"
    +"miejscach przekład własny. Każda karta podaje swoje\n"
    +"źródło w polu src, którego silnik nie czyta.\n"
};
