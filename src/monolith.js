/* ---------------- app ---------------- */
/* THE ONE CURVE. Every move, fold and fade the script animates settles on it, and the sheet
   writes the same curve by hand; a second curve anywhere would be a second opinion about how
   the interface moves. Durations vary by what is moving; the curve does not. */
const E_EASE="cubic-bezier(.2,.7,.3,1)";
const $=s=>document.querySelector(s), list=$("#list"), pax=$("#pax"), intentEl=$("#intent"),
      agentEl=$("#agent");
// Kill browser/OS form-history & word-suggestion popups (not our intent/ROLE dropdowns).
// autocomplete="off" is often ignored by Chrome/Edge; non-standard tokens + spellcheck off work better.
function suppressBrowserSuggest(){
  function harden(el, token){
    if(!el) return;
    el.setAttribute("autocomplete", token||("rc-"+(el.id||"field")));
    el.setAttribute("autocorrect","off");
    el.setAttribute("autocapitalize","off");
    el.setAttribute("spellcheck","false");
    el.setAttribute("data-lpignore","true");
    el.setAttribute("data-1p-ignore","true");
    el.setAttribute("data-form-type","other");
  }
  harden(agentEl,"rc-agent");
  harden(pax,"rc-pax");
  harden(intentEl,"rc-intent");
  harden($("#factsEdit"),"rc-facts");
  // Stamp the same on any later-created text inputs (modals, manage dialogs)
  document.addEventListener("focusin",e=>{
    const el=e.target;
    if(!el||(el.tagName!=="INPUT"&&el.tagName!=="TEXTAREA")) return;
    if(el.tagName==="INPUT"){
      const t=(el.type||"text").toLowerCase();
      if(t&&t!=="text"&&t!=="search"&&t!=="") return;
    }
    // Card EN/PL editors keep spellcheck on; only nudge autocomplete
    const ac=el.getAttribute("autocomplete");
    if(!ac||ac==="off"||ac==="on") el.setAttribute("autocomplete","rc-"+(el.id||el.name||"x"));
    if(el.tagName==="INPUT"||el.getAttribute("spellcheck")==="false"){
      el.setAttribute("autocorrect","off");
      el.setAttribute("autocapitalize","off");
      el.setAttribute("spellcheck","false");
      el.setAttribute("data-lpignore","true");
      el.setAttribute("data-1p-ignore","true");
      el.setAttribute("data-form-type","other");
    }
  },true);
}
suppressBrowserSuggest();
// INTENT box dual mode: normal intent pick/free-text, or macro search after pressing /
/* One search over two surfaces. railOrder is what the panel SHOWS top to bottom and what
   the arrows walk (matches only - grey rows are inactive); railMarkIdx is the intent Enter
   takes when the cursor is automatic. railMarkUsed: the offer was consumed by a pick or a
   copy, and only typing or the arrows open it again. */
let railSel=-1, railOrder=[], railMarkIdx=-1, railMatch=null;
/* The walk steps OVER picked rows, as the resting mark already does (the rail build and the
   pick tail both seek the first unpicked row): a chosen intent is a fact of the reply, not a
   candidate, and a mark on it would offer Enter as an undo. -1 when every row is picked. */
function railStep(from,step){
  const n=railOrder.length; let pos=from;
  for(let i=0;i<n;i++){ pos=((pos+step)%n+n)%n; if(intentIdxs.indexOf(railOrder[pos])<0) return pos; }
  return -1;
}
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
function kbdNav(on){ document.body.classList.toggle("e-kbdnav", !!on); }
addEventListener("mousemove",()=>{
  if(document.body.classList.contains("e-kbdnav")) kbdNav(false);
},{passive:true});
function railQuery(){
  return (typeof intentEl!=="undefined" && intentEl) ? String(intentEl.value||"").trim() : "";
}

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
   blankTab() carries it, applyTab() installs it, setLang() writes it back; "pbLang"
   records the language last on screen and seeds new tabs - defaulting them to English
   would fight a Polish shift on every chat. */
let lang = (lsGet("pbLang")==="pl") ? "pl" : "en";

/* Theme follows the SYSTEM until the user says otherwise; a stored choice always wins
   and is never overwritten - someone who picked light on a dark machine meant it. While
   nothing is stored the OS decides LIVE (sunset flips mid-shift). data-theme is always
   written explicitly - what lets the stylesheet's :not()/[data-theme] blocks stay as-is. */
/* ---- UI LANGUAGE ------------------------------------------------------------------------
   The CHROME's language, not the CONTENT's: the EN|PL switch decides what is copied to
   the passenger, this decides what the buttons say - deliberately independent, since
   tying them would break the per-tab content switch.
   ONE RULE MAKES THE REST POSSIBLE: a missing key falls back to English - never blank,
   never the key name - so a half-translated build is honest rather than broken. Do not
   "fix" a missing string by inventing Polish here; leave it and it reads English.
   Impersonal register on purpose ("Zapisano", never "Zapisalem") - the -lem/-lam problem
   stays confined to catalog macros, where the author's own voice belongs. PAX, INTENT,
   ROLE, AGENT stay untranslated (desk jargon), and so does the Maintenance panel (a
   rescue room, not a settings room). */
/* A REGISTRY, not a pair - more languages are expected, so nothing may care how many
   there are. Adding one = one object + one UI_LANGS row; every lookup goes through t(),
   every miss reads English. The Settings control is a SELECT for the same reason: a
   sliding switch stops being one at seven choices. */
const UI_LANGS=[
  {code:"en", label:"English"},
  {code:"pl", label:"Polski"}
];
const UI_STRINGS={};
UI_STRINGS.pl={
  "Always one language":"Zawsze jeden język",
  "The card keeps this language whatever the EN|PL toggle says, tokens included":"Karta zostaje w tym języku niezależnie od przełącznika EN|PL, razem z tokenami",
  "Fold this group away":"Zwiń tę grupę",
  "Show these cards":"Pokaż te karty",
  "Matching your intent":"Pasujące do intencji",
  "Put every setting back to its default? Your cards, edits, favourites and order are not touched.":"Przywrócić wszystkie ustawienia domyślne? Twoje karty, edycje, ulubione i kolejność pozostaną bez zmian.",
  "Settings reset":"Ustawienia przywrócone",
  "Put every setting on this screen back to what it ships with. Cards and edits are not affected.":"Przywraca wszystkie ustawienia z tego ekranu do stanu wyjściowego. Nie dotyczy kart ani edycji.",
  "maintenance␟hidden":"ukryte",
  "maintenance␟starred":"ulubione",
  "maintenance␟edited":"zmienione",
  "maintenance␟yours":"własne",
  "maintenance␟cards":"karty",
  "maintenance␟intents":"intencje",
  "maintenance␟content languages":"języki treści",
  "maintenance␟cards in one language":"karty w jednym języku",
  "maintenance␟scroll region":"przewijanie",
  "maintenance␟locked open":"zablokowane otwarte",
  "maintenance␟nothing":"nic",
  "maintenance␟categories renamed":"zmienione nazwy kategorii",
  "maintenance␟list width":"szerokość listy",
  "Columns":"Kolumny",
  "Auto":"Auto",
  "How many columns of cards to show. Auto fits as many as the window has room for.":"Ile kolumn kart pokazywać. Auto dopasowuje tyle, ile mieści się w oknie.",
  "Always a single column":"Zawsze jedna kolumna",
  "Always two columns, however wide the window is":"Zawsze dwie kolumny, niezależnie od szerokości okna",
  "As many as fit without making a column too narrow to read":"Tyle, ile się zmieści, bez zwężania kolumny poniżej czytelnej szerokości",
  "Narrowest column":"Najwęższa kolumna",
  "How narrow a column may get before Auto drops one. Wider means fewer, roomier columns.":"Jak wąska może być kolumna, zanim Auto usunie jedną. Szerzej to mniej, ale przestronniejszych kolumn.",
  "Columns fit the window":"Kolumny dopasowane do okna",
  "Single column":"Jedna kolumna",
  "Two columns":"Dwie kolumny",
  "maintenance␟Layout":"Układ",
  "maintenance␟window":"okno",
  "maintenance␟columns":"kolumny",
  "maintenance␟narrowest column":"najwęższa kolumna",
  "maintenance␟card / text width":"karta / tekst",
  "maintenance␟right padding":"prawy margines wewnętrzny",
  "INIT":"INICJAŁY",
  "GREET":"POWITANIE",
  "ACTION":"CZYNNOŚĆ",
  "TOPIC":"TEMAT",
  "DAYPART":"PORA DNIA",
  "Intent panel locked - open, and fixed width":"Panel intencji zablokowany - otwarty, ze stałą szerokością",
  "Intent panel locked off - hold Ctrl to show it":"Panel intencji zablokowany jako ukryty - przytrzymaj Ctrl, aby go pokazać",
  "Intent panel unlocked - may auto-hide, width draggable":"Panel intencji odblokowany - może chować się sam, szerokość można przeciągać",
  "Intent panel unlocked - hover the left edge to peek":"Panel intencji odblokowany - najedź na lewą krawędź, aby go podejrzeć",
  "Unlock - let the panel appear again when you hover the left edge":"Odblokuj - panel będzie znów pojawiał się po najechaniu na lewą krawędź",
  "Unlock - allow auto-hide on narrow windows, and allow the width to be dragged":"Odblokuj - pozwól na automatyczne chowanie w wąskich oknach i na przeciąganie szerokości",
  "Lock - stop the panel appearing on hover (Ctrl still shows it)":"Zablokuj - panel przestanie pojawiać się po najechaniu (Ctrl nadal go pokazuje)",
  "Hide the category bar, which is locked fully expanded when shown":"Ukryj pasek kategorii, który po pokazaniu pozostaje w pełni rozwinięty",
  "Hide the category bar; {KEY} peeks while it is hidden":"Ukryj pasek kategorii; {KEY} pozwala zerknąć, gdy jest ukryty",
  "Show the category bar under the header.":"Pokaż pasek kategorii pod nagłówkiem.",
  "Allow the category bar to auto-collapse to two lines when there are many categories.":"Pozwól, aby pasek kategorii zwijał się do dwóch linii, gdy kategorii jest dużo.",
  "Keep all category rows visible (no 2-line auto-collapse).":"Zachowaj wszystkie rzędy kategorii widoczne (bez zwijania do dwóch linii).",
  "Allow the intent panel to auto-hide on narrow windows (hover left edge or hold Ctrl to peek).":"Pozwól, aby panel intencji chował się sam w wąskich oknach (najedź na lewą krawędź lub przytrzymaj Ctrl, aby go podejrzeć).",
  "Keep the intent panel docked even when the window is narrow. Same as the lock at the top of the panel.":"Zachowaj panel intencji zadokowany nawet w wąskim oknie. To samo co blokada na górze panelu.",
  "maintenance␟name":"nazwa",
  "customer's name":"imię klienta",
  "agent's name":"imię agenta",
  "Role class":"Klasa roli",
  "Create a card":"Utwórz kartę",
  "Create a card in {CAT}":"Utwórz kartę w kategorii {CAT}",
  "No cards match.":"Brak pasujących kart.",
  "Press":"Naciśnij",
  "to clear macro search and intents.":"aby wyczyścić wyszukiwanie makr i intencje.",
  "Etiuda is empty.":"Etiuda jest pusta.",
  "Add a card to a category,":"Dodaj kartę do kategorii,",
  "Add a card to a category, or":"Dodaj kartę do kategorii albo",
  "you already have.":", który już masz.",
  "import a catalog":"zaimportuj katalog",
  "or":"albo",
  "to see how it works.":", aby zobaczyć, jak to działa.",
  "A catalog file next to Etiuda loads by itself when it is called":"Plik katalogu leżący obok Etiudy wczytuje się sam, gdy nazywa się",
  "Under any other name, bring it in with the button above.":"Pod inną nazwą wczytaj go przyciskiem powyżej.",
  "The catalog you import stays in this browser, ready whenever you come back.":"Wczytany katalog zostaje w tej przeglądarce i czeka, aż wrócisz.",
  "Add a card to {CAT}":"Dodaj kartę do kategorii {CAT}",
  "Clear search text":"Wyczyść tekst wyszukiwania",
  "not linked to your intent":"niepowiązane z Twoją intencją",
  "also mentions your search":"wspominają też Twoje zapytanie",
  "A search ranks the cards by relevance; clear it to order them yourself":"Wyszukiwanie porządkuje karty według trafności; po jego wyczyszczeniu ustalisz kolejność samodzielnie",
  "Drag header to reorder within the same highlight group":"Przeciągnij nagłówek, aby zmienić kolejność w tej samej grupie podświetlenia",
  "Drag header to reorder within the same highlight group; same category only":"Przeciągnij nagłówek, aby zmienić kolejność w tej samej grupie podświetlenia; tylko w tej samej kategorii",
  "{N} hidden":"ukrytych: {N}",
  "none":"brak",
  "Split by blank lines into alternatives":"Dziel pustymi liniami na warianty",
  "Ordered sequence (STEP badges)":"Ponumerowana sekwencja (znaczniki KROK)",
  "{PAX} as first name only":"{PAX} jako samo imię",
  "Linked to every {INT}":"Powiązanie ze wszystkimi {INT}",
  "Top of the {INT} group":"Na górze grupy {INT}",
  "steps":"kroki",
  "alt":"alt",
  "first name":"tylko imię",
  "every intent":"każda intencja",
  "top":"góra",
  "{L} only":"tylko {L}",
  "nothing set":"nic nie ustawiono",
  "none (shared)":"brak (wspólna)",
  "unnamed (shared)":"bez nazwy (wspólna)",
  "catalog name only":"tylko nazwa katalogu",
  "Unnamed catalog":"Katalog bez nazwy",
  "Collapse":"Zwiń",
  "Expand":"Rozwiń",
  "Supporting category, relevant regardless of the intent":"Kategoria wspierająca, przydatna niezależnie od intencji",
  "Make this a supporting category, relevant regardless of the intent":"Ustaw jako kategorię wspierającą, przydatną niezależnie od intencji",
  "Un-hide every hidden card":"Odkryj wszystkie ukryte karty",
  "Un-hide every hidden intent":"Odkryj wszystkie ukryte intencje",
  "Nothing is hidden":"Nic nie jest ukryte",
  "Engine":"Silnik",
  "Catalog":"Katalog",
  "Storage":"Pamięć",
  "Display":"Wyświetlanie",
  "Personal state":"Stan osobisty",
  "version":"wersja",
  "running from":"uruchomiona z",
  "running in":"uruchomiona w",
  "showing":"pokazywane",
  "file watch":"obserwacja pliku",
  "not supported here":"nieobsługiwane w tej przeglądarce",
  "unknown":"nieznana",
  "local memory used":"użyta pamięć lokalna",
  "theme":"motyw",
  "edition":"edycja",
  "cards / macros":"karty / makra",
  "intents / categories":"intencje / kategorie",
  "layout rungs":"szczeble układu",
  "reduced motion":"ograniczone animacje",
  "state":"stan",
  "panel width cap":"limit szerokości panelu",
  "dock threshold":"próg dokowania",
  "shortcuts rebound":"zmienione skróty",
  "tabs":"rozmowy",
  "sample untouched":"przykład nietknięty",
  "blur effects":"efekty rozmycia",
  "on":"wł.",
  "off":"wył.",
  "yes":"tak",
  "no":"nie",
  "dark (system)":"ciemny (systemowy)",
  "light (system)":"jasny (systemowy)",
  "dark (chosen)":"ciemny (wybrany)",
  "light (chosen)":"jasny (wybrany)",
  "docked":"zadokowany",
  "hidden / overlay":"ukryty / nakładka",
  "off (rescue)":"wył. (ratunek)",
  "(none loaded)":"(nie wczytano)",
  "system":"systemowy",
  "unavailable":"niedostępne",
  "IN-MEMORY ONLY - edits last only until this tab closes":"TYLKO W PAMIĘCI - zmiany przetrwają do zamknięcia tej karty przeglądarki",
  "IN-MEMORY ONLY":"TYLKO W PAMIĘCI",
  "ACTIVE":"AKTYWNE",
  "Tab":"Rozmowa",
  "Step 1":"Krok 1",
  "STEP":"KROK",
  "step":"krok",
  "Copied {WHAT} from {TITLE}":"Skopiowano {WHAT} z: {TITLE}",
  "All":"Wszystkie",
  "cards":"karty",
  "categories":"kategorie",
  "intent":"intencja",
  "copy":"kopiuj",
  "other language":"drugi język",
  "facts":"fakty",
  "rail":"panel",
  "clear":"wyczyść",
  "customise in":"dostosuj w",
  "→ Settings → Keyboard shortcuts":"→ Ustawienia → Skróty klawiszowe",
  "· Etiuda":"· Etiuda",
  "· Free and open source under the":"· Darmowe i otwartoźródłowe na licencji",
  "Clear tab fields":"Wyczyść pola rozmowy",
  "Close tab":"Zamknij rozmowę",
  "Clear tab":"Wyczyść rozmowę",
  "Add tab":"Dodaj rozmowę",
  "and":"i",
  "Searched for":"Szukano",
  "you typed":"wpisano",
  "Drag to reorder: intents in the side panel (double-click its title to reset), a card header within its highlight group (intent-linked / favourited / both / regular), or alternative and step macros inside a card (EN and PL stay aligned). Show or hide the panel from the":"Przeciągnij, aby zmienić kolejność: intencje w panelu bocznym (kliknij dwukrotnie jego tytuł, aby ją przywrócić), nagłówek karty w obrębie jej grupy podświetlenia (powiązane z intencją / ulubione / oba / zwykłe) albo warianty i kroki wewnątrz karty (EN i PL pozostają zgodne). Panel pokażesz lub ukryjesz z",
  "Quick facts - fees and deadlines.":"Szybkie fakty - opłaty i terminy.",
  "- cards, intent panel, category pills, shortcuts.":"- karty, panel intencji, pastylki kategorii, skróty.",
  "toggles theme.":"przełącza motyw.",
  "Toggle theme":"Przełącz motyw",
  "Switch language":"Przełącz język kart",
  "int":"int",
  "In a supporting category, relevant regardless of the intent":"W kategorii wspierającej, przydatna niezależnie od intencji",
  "sup":"wsp",
  "fav":"fav",
  "mod":"mod",
  "Put this card away: it greys out at the foot of this category and loses its star":"Odłóż tę kartę: zszarzeje na końcu swojej kategorii i straci gwiazdkę",
  "Put this card away: it greys out at the foot of this category":"Odłóż tę kartę: zszarzeje na końcu swojej kategorii",
  "Put this card away":"Odłóż tę kartę",
  "Changed or added by you, not what the catalog shipped":"Zmienione lub dodane przez Ciebie, nie z katalogu",
  "Add an intent":"Dodaj intencję",
  "Remove from Favourites":"Usuń z Ulubionych",
  "Add to Favourites":"Dodaj do Ulubionych",
  "Lock - keep the panel docked on narrow windows, and fix its width":"Zablokuj - panel pozostanie zadokowany w wąskich oknach, z ustaloną szerokością",
  "Unlock the intent panel":"Odblokuj panel intencji",
  "Lock the intent panel open and fix its width":"Zablokuj panel intencji otwarty i ustal jego szerokość",
  "Hold Ctrl to show intents":"Przytrzymaj Ctrl, aby pokazać intencje",
  "Click · drag to reorder ·":"Kliknij · przeciągnij kolejność ·",
  "for several":"dla kilku",
  "English":"English",
  "Polski":"Polski",
  "Maxim Gwiazda":"Maxim Gwiazda",
  /* "MIT" alone: this key's ONE consumer is the footer's bold, whose preceding fragment
     already carries "na licencji" - the full name would read "na licencji Licencja MIT".
     About writes its own whole line. A second consumer wanting the full name should split
     the key in two rather than changing this back. */
  "MIT License":"MIT",
  "Created by":"Autor:",
  "Free and open source under the":"Darmowe i otwartoźródłowe na licencji",
  "Tour {N} / {TOTAL}":"Przewodnik {N} / {TOTAL}",
  "Finish":"Zakończ",
  "Welcome to Etiuda":"Witaj w Etiudzie",
  "Your agent name":"Twoja nazwa agenta",
  "Chat tabs":"Rozmowy",
  "Customer name and role":"Imię klienta i rola",
  "Intent clause":"Klauzula intencji",
  "Category pills":"Pastylki kategorii",
  "Intent panel":"Panel intencji",
  "Cards":"Karty",
  "Put a card away":"Odkładanie karty na bok",
  "Edit a card":"Edycja karty",
  "A card of your own":"Twoja własna karta",
  "The card editor":"Edytor karty",
  "English / Polish":"Angielski / polski",
  "Light and dark":"Jasny i ciemny",
  "You are set":"Wszystko gotowe",
  "A live-chat macro bank for support agents. This short tour points at the main controls; you can skip it at any time with <kbd>Esc</kbd>.":"Bank makr do czatu na żywo dla agentów wsparcia. Ten krótki przewodnik pokazuje główne elementy - możesz go pominąć w każdej chwili klawiszem <kbd>Esc</kbd>.",
  "Type the name customers should see, exactly as you want it to appear; <span class=\"fillmiss\">AGENT</span> reproduces it verbatim. Internal comments sign with your initials as /<span class=\"fillmiss\">INIT</span>.":"Wpisz imię, które mają widzieć klienci, dokładnie w takiej formie - <span class=\"fillmiss\">AGENT</span> wstawia je bez zmian. Komentarze wewnętrzne podpisywane są Twoimi inicjałami jako /<span class=\"fillmiss\">INIT</span>.",
  "One tab per chat: {KEY} steps to the next one from anywhere, {NEW} opens one. Each tab keeps its own language, <span class=\"fillmiss\">PAX</span>, <span class=\"fillmiss\">INTENT</span>, <span class=\"fillmiss\">ROLE</span> and categories, and its dot takes the colour of its category filter; settings like the theme and your agent name are shared. Drag a tab to reorder.":"Po jednej rozmowie na czat: {KEY} przechodzi do następnej z dowolnego miejsca, {NEW} otwiera nową. Każda pamięta własny język, <span class=\"fillmiss\">PAX</span>, <span class=\"fillmiss\">INTENT</span>, <span class=\"fillmiss\">ROLE</span> i kategorie - kropka przy rozmowie przyjmuje kolor jej filtra kategorii - a ustawienia takie jak motyw i nazwa agenta są wspólne. Przeciągnij rozmowę, aby zmienić kolejność.",
  "Paste the name exactly as the chat gives it - full name, surname, ALL CAPS, all fine. Etiuda tidies it, and wherever a card addresses the customer it uses only the first name, declined in Polish automatically (ANNA KOWALSKA → <b>Anno</b>). Fills <span class=\"fillmiss\">PAX</span>. The wheel beside it sets who you are speaking to, relative to whoever the chat is about, and fills <span class=\"fillmiss\">ROLE</span> in internal comments. Click or scroll it to change; the empty notch clears it.":"Wklej imię dokładnie tak, jak podaje je czat - pełne dane, nazwisko, WERSALIKI, wszystko jedno. Etiuda je porządkuje, a tam gdzie karta zwraca się do klienta, używa samego imienia, odmienionego po polsku automatycznie (ANNA KOWALSKA → <b>Anno</b>). Wypełnia <span class=\"fillmiss\">PAX</span>. Kółko obok określa, z kim rozmawiasz, w odniesieniu do osoby, której dotyczy czat, i wypełnia <span class=\"fillmiss\">ROLE</span> w komentarzach wewnętrznych. Kliknij je lub przewiń, aby zmienić; pusta pozycja czyści wybór.",
  "Filter cards by category; <kbd>Ctrl</kbd>+click keeps several. The rings say why a pill stands out: <b class=\"t-go\">green</b> - it holds a card linked to your intent; <b class=\"t-acc\">blue</b> - a supporting category, useful whatever the customer asked. <kbd>←</kbd> <kbd>→</kbd> step through them, from the search box too. Drag pills to reorder; double-click <span class=\"t-pill\"><span data-icon=\"all\"></span>All</span> to reset the order.":"Filtruj karty według kategorii; <kbd>Ctrl</kbd>+klik zostawia kilka naraz. Obwódki mówią, dlaczego pastylka się wyróżnia: <b class=\"t-go\">zielona</b> - zawiera kartę powiązaną z Twoją intencją; <b class=\"t-acc\">niebieska</b> - kategoria wspierająca, przydatna niezależnie od pytania klienta. <kbd>←</kbd> <kbd>→</kbd> przechodzą między nimi, także z pola wyszukiwania. Przeciągaj pastylki, aby zmienić kolejność; kliknij dwukrotnie <span class=\"t-pill\"><span data-icon=\"all\"></span>Wszystkie</span>, aby ją przywrócić.",
  "Click to pick an intent, or <kbd>Ctrl</kbd>+click to pick several; picks stack at the top of the panel and the rest of the list scrolls beneath them, so a pick never leaves the screen. The pointer and the arrow keys share one mark. Drag to reorder, star to pin favourites to the top. Hold <kbd>Ctrl</kbd> over a star and it becomes an edit button; hold <kbd>Shift</kbd> and it becomes a hide button; hidden intents grey out and sink to the bottom, and the closed eye brings them back. The <span data-icon=\"pin\"></span> lock at the top keeps the panel open on narrow windows.":"Kliknij, aby wybrać intencję, albo <kbd>Ctrl</kbd>+kliknij, aby wybrać kilka; wybrane układają się na górze panelu, a reszta listy przewija się pod nimi, więc wybór nigdy nie znika z ekranu. Wskaźnik myszy i strzałki dzielą jedno zaznaczenie. Przeciągaj, aby zmieniać kolejność, gwiazdką przypinasz ulubione na górę. Przytrzymaj <kbd>Ctrl</kbd> nad gwiazdką, a zmieni się w przycisk edycji; przytrzymaj <kbd>Shift</kbd>, a zmieni się w przycisk ukrywania - ukryte intencje szarzeją i spadają na dół, a zamknięte oko je przywraca. Blokada <span data-icon=\"pin\"></span> na górze utrzymuje panel otwarty w wąskich oknach.",
  "Click a macro to copy it, or use <kbd>↑</kbd> <kbd>↓</kbd> between macros and <kbd>Enter</kbd> to copy (<kbd>Shift</kbd>+<kbd>Enter</kbd> other language). A card holding several shows <b>1/2</b> or <b>STEP 1/3</b>; each macro copies on its own. The small tags say why a card is where it is: <span class=\"cbadge hit\">int</span> linked to your intent, <span class=\"cbadge cat\">sup</span> a supporting category, <span class=\"cbadge fav\">fav</span> a favourite, <span class=\"cbadge ed\">mod</span> changed or added on this computer. Hover one for the full wording. Drag the card header to reorder within the same highlight group.":"Kliknij makro, aby je skopiować, albo poruszaj się między makrami klawiszami <kbd>↑</kbd> <kbd>↓</kbd> i kopiuj przez <kbd>Enter</kbd> (<kbd>Shift</kbd>+<kbd>Enter</kbd> - drugi język). Karta z kilkoma makrami pokazuje <b>1/2</b> lub <b>KROK 1/3</b> - każde makro kopiuje się osobno. Małe znaczniki mówią, skąd karta ma swoje miejsce: <span class=\"cbadge hit\">int</span> powiązana z Twoją intencją, <span class=\"cbadge cat\">wsp</span> kategoria wspierająca, <span class=\"cbadge fav\">fav</span> ulubiona, <span class=\"cbadge ed\">mod</span> zmieniona lub dodana na tym komputerze - najedź na znacznik, aby zobaczyć pełny opis. Przeciągnij nagłówek karty, aby zmienić kolejność w obrębie tej samej grupy podświetlenia.",
  "The star lifts a card to the top of wherever it already is: to the head of its category, to the head of its highlight group when an intent is selected, and on <span class=\"t-pill\"><span data-icon=\"all\"></span>All</span> to a <b class=\"t-fav\"><span data-icon=\"star\"></span>Favourites</b> block at the top of the list. The gold star and the <span class=\"cbadge fav\">fav</span> tag mark it - separate from the <b class=\"t-go\">green</b> of an intent link and the <b class=\"t-acc\">blue</b> of a supporting category.":"Gwiazdka podnosi kartę na szczyt tego miejsca, w którym już jest: na czoło swojej kategorii, na czoło grupy podświetlenia, gdy wybrano intencję, a w widoku <span class=\"t-pill\"><span data-icon=\"all\"></span>Wszystkie</span> do bloku <b class=\"t-fav\"><span data-icon=\"star\"></span>Ulubione</b> na górze listy. Oznacza ją złota gwiazdka i znacznik <span class=\"cbadge fav\">fav</span> - niezależnie od <b class=\"t-go\">zieleni</b> powiązania z intencją i <b class=\"t-acc\">błękitu</b> kategorii wspierającej.",
  "The eye puts a card away: it greys out and sinks to the foot of its own category, and it shows nowhere else - not in All, and not in a search. Open that category with the box empty and the same button brings it back. Putting a starred card away also unstars it. Nothing is deleted; <b class=\"t-bad\">Delete</b> lives only in the editor and in Library.":"Oko odkłada kartę na bok: karta szarzeje i spada na dół swojej kategorii, a poza tym nie pojawia się nigdzie - ani we Wszystkich, ani w wyszukiwaniu. Otwórz tę kategorię z pustym polem, a ten sam przycisk ją przywróci. Odłożenie karty z gwiazdką usuwa też gwiazdkę. Nic nie jest usuwane; <b class=\"t-bad\">Usuń</b> istnieje wyłącznie w edytorze i w Bibliotece.",
  "The pencil opens the card for editing - both languages, the internal note, the search keywords, and everything about how it behaves. Editing a built-in card writes a personal override <b>on this computer</b>; the catalog itself is untouched, and the editor's <b>Reset</b> brings the original wording back whenever you want it.":"Ołówek otwiera kartę do edycji - oba języki, notatkę wewnętrzną, słowa kluczowe i wszystko, co dotyczy jej zachowania. Edycja karty wbudowanej zapisuje własną wersję <b>na tym komputerze</b>; sam katalog pozostaje nienaruszony, a <b>Przywróć</b> w edytorze w każdej chwili odtwarza pierwotną treść.",
  "The <b>+</b> in the corner starts a new card from wherever you are - the same screen the pencil opens, empty. Inside a category it files into that one; under <span class=\"t-pill\"><span data-icon=\"all\"></span>All</span> the editor asks which, in its <span class=\"t-sec\">Category</span> section.":"<b>+</b> w rogu zaczyna nową kartę z dowolnego miejsca - ten sam ekran, który otwiera ołówek, tylko pusty. Wewnątrz kategorii trafi właśnie do niej; w widoku <span class=\"t-pill\"><span data-icon=\"all\"></span>Wszystkie</span> edytor zapyta, do której, w sekcji <span class=\"t-sec\">Kategoria</span>.",
  "<span class=\"t-sec\">Content</span> holds the text in both languages, with the internal note. Folded below: <span class=\"t-sec\">Keywords</span>, <span class=\"t-sec\">Category</span>, <span class=\"t-sec\">Linked intents</span> - which makes a card ring green under an intent, and marks its category relevant to those intents - and <span class=\"t-sec\">Advanced</span>, holding alternatives, ordered steps and the ring flags. <b>Cancel</b> leaves everything as it was. A row in <b>Library</b> opens the same screen.":"<span class=\"t-sec\">Treść</span> zawiera tekst w obu językach wraz z notatką wewnętrzną. Zwinięte poniżej: <span class=\"t-sec\">Słowa kluczowe</span>, <span class=\"t-sec\">Kategoria</span>, <span class=\"t-sec\">Powiązane intencje</span> - to one sprawiają, że karta świeci na zielono przy intencji, i oznaczają jej kategorię jako istotną dla tych intencji - oraz <span class=\"t-sec\">Zaawansowane</span>, gdzie są warianty, ponumerowane kroki i znaczniki obwódek. <b>Anuluj</b> zostawia wszystko bez zmian. Wiersz w <b>Bibliotece</b> otwiera ten sam ekran.",
  "Switch the language of macro text on screen; {KEY} flips it from anywhere. Intent clauses that come from the list follow <b class=\"t-acc\">EN</b>/<b class=\"t-pl\">PL</b>; free-typed intent text does not. A card with no Polish shows its English rather than a gap, so only the first language is ever required.":"Przełącz język treści makr na ekranie - {KEY} zmienia go z dowolnego miejsca. Klauzule intencji wybrane z listy podążają za <b class=\"t-acc\">EN</b>/<b class=\"t-pl\">PL</b>; intencja wpisana ręcznie nie. Karta bez polskiej wersji pokazuje angielską zamiast luki, więc wymagany jest tylko pierwszy język.",
  "Fees, deadlines, and useful links - click a link-like token to copy the full URL. You can edit this text for yourself; it stays in this browser.":"Opłaty, terminy i przydatne odnośniki - kliknij element wyglądający jak odnośnik, aby skopiować pełny adres. Możesz zmienić ten tekst na własny użytek; zostaje w tej przeglądarce.",
  "Etiuda follows your system's setting, and keeps following it. Clicking here is what turns that into a choice, and it is remembered from then on.":"Etiuda podąża za ustawieniem Twojego systemu i robi to nadal. Dopiero kliknięcie tutaj zamienia to w wybór, który od tej pory jest zapamiętany.",
  "Everything that is not a card. <b>Library</b> is where the content lives, <b>Settings</b> holds the interface language, the appearance and the keyboard shortcuts, and the entries in the middle hide or lock the intent panel and the category bar. Hold <kbd>Ctrl</kbd> to peek at either while it is hidden. This tour is here too, under <b>Show tour…</b>.":"Wszystko, co nie jest kartą. W <b>Bibliotece</b> mieszka treść, <b>Ustawienia</b> zawierają język interfejsu, wygląd i skróty klawiszowe, a pozycje w środku ukrywają lub blokują panel intencji i pasek kategorii. Przytrzymaj <kbd>Ctrl</kbd>, aby podejrzeć jedno lub drugie, gdy jest ukryte. Ten przewodnik też tu jest, pod <b>Pokaż przewodnik…</b>.",
  "<b><span data-icon=\"settings\"></span> → Library</b> opens this, and it is where the content lives. <span class=\"t-sec\">Categories &amp; cards</span> lists everything you have, grouped - add, edit, hide, delete, or drag a card into another category. <span class=\"t-sec\">Intents</span> does the same for the intent list. <span class=\"t-sec\">ROLE suggestions</span> fills the ROLE box. <span class=\"t-sec\">Catalog &amp; data</span> saves what you have to a file, brings someone else's in, or bakes the lot into a single copy to hand on.":"<b><span data-icon=\"settings\"></span> → Biblioteka</b> otwiera ten ekran i to tu mieszka treść. <span class=\"t-sec\">Kategorie i karty</span> wymienia wszystko, co masz, pogrupowane - dodawaj, edytuj, ukrywaj, usuwaj albo przeciągnij kartę do innej kategorii. <span class=\"t-sec\">Intencje</span> robi to samo z listą intencji. <span class=\"t-sec\">Podpowiedzi ROLE</span> wypełnia pole ROLE. <span class=\"t-sec\">Katalog i dane</span> zapisuje to, co masz, do pliku, wczytuje cudzy katalog albo zapieka całość w jedną kopię do przekazania dalej.",
  "<b><span data-icon=\"settings\"></span> → Settings</b> is the interface itself. <span class=\"t-sec\">Localisation</span> picks the language of the buttons and menus; the macros have their own switch in the header. <span class=\"t-sec\">Appearance</span> holds the theme, the columns, the blur and the animations; <span class=\"t-sec\">Layout</span> says what stays docked and what may hide itself when space is short; <span class=\"t-sec\">Keyboard shortcuts</span> rebinds any chord when you click it. <b>Reset defaults</b> puts this screen back to what it ships with and touches no card.":"<b><span data-icon=\"settings\"></span> → Ustawienia</b> to sam interfejs. <span class=\"t-sec\">Lokalizacja</span> wybiera język przycisków i menu - makra mają własny przełącznik w nagłówku. <span class=\"t-sec\">Wygląd</span> obejmuje motyw, kolumny, efekty rozmycia i animacje; <span class=\"t-sec\">Układ</span> mówi, co pozostaje zadokowane, a co może się schować, gdy brakuje miejsca; <span class=\"t-sec\">Skróty klawiszowe</span> zmienia dowolną kombinację po kliknięciu. <b>Przywróć domyślne</b> cofa ten ekran do stanu wyjściowego i nie dotyka żadnej karty.",
  "Shortcuts live under <span data-icon=\"settings\"></span> <b>→ About Etiuda</b>, and <b>Show tour…</b> in the same menu brings this back. When in doubt, your team lead is the one to ask.":"Skróty klawiszowe znajdziesz pod <span data-icon=\"settings\"></span> <b>→ O Etiudzie</b>, a <b>Pokaż przewodnik…</b> w tym samym menu otwiera go ponownie. W razie wątpliwości pytaj swojego team leadera.",
  "Categories & cards":"Kategorie i karty",
  "Intent":"Intencja",
  "Intents":"Intencje",
  "ROLE suggestions":"Podpowiedzi ROLE",
  "Catalog & data":"Katalog i dane",
  "Content":"Treść",
  "Category":"Kategoria",
  "Linked intents":"Powiązane intencje",
  "Advanced":"Zaawansowane",
  "Favourites":"Ulubione",
  "Sample catalog":"Przykładowy katalog",
  "Keys":"Klawisze",
  "No catalog loaded - Etiuda is empty.":"Nie wczytano katalogu - Etiuda jest pusta.",
  "About Etiuda · Version {V} · MIT License · © 2026 Maxim Gwiazda":"O Etiudzie · Wersja {V} · Licencja MIT · © 2026 Maxim Gwiazda",
  "An interactive tour of the main controls, about a minute.":"Interaktywny przewodnik po głównych elementach, około minuty.",
  "Toggle language":"Przełącz język",
  "Next tab":"Następna rozmowa",
  "New tab":"Nowa rozmowa",
  "Focus {PAX}":"Kursor w {PAX}",
  "Focus ROLE":"Kursor w ROLE",
  "Toggle intent panel":"Przełącz panel intencji",
  "Toggle category pills":"Przełącz pasek kategorii",
  "Clear intent":"Wyczyść intencję",
  "Clear the intent":"Wyczyść intencję",
  "Internal note":"Notatka wewnętrzna",
  "This category is empty.":"Ta kategoria jest pusta.",
  "to create a card here.":"aby utworzyć tu kartę.",
  "New card":"Nowa karta",
  "Open the editor for a new card, in the chosen category":"Otwiera edytor nowej karty, w wybranej kategorii",
  "Notes on hover":"Notatki po najechaniu",
  "Open a card's internal note when the pointer rests on the card.":"Otwiera notatkę wewnętrzną karty, gdy kursor na niej spocznie.",
  "The note opens by itself, and the card shows no i":"Notatka otwiera się sama, a karta nie pokazuje litery i",
  "The i on the card opens the note":"Litera i na karcie otwiera notatkę",
  "Notes open on hover":"Notatki otwierają się po najechaniu",
  "Notes open from the i":"Notatki otwiera litera i",
  "Clear the chosen intents ({N})":"Wyczyść wybrane intencje ({N})",
  "Reveal / expand categories":"Pokaż / rozwiń kategorie",
  "Maintenance panel":"Panel konserwacji",
  "Select search text":"Zaznacz tekst wyszukiwania",
  "{PAX} in the vocative":"{PAX} w wołaczu",
  "Polish only: declines the name into the vocative, the form Polish uses to address someone. Only the first name declines; a surname is left as written.":"Tylko dla polskiego: odmienia imię w wołaczu, czyli w formie, której polszczyzna używa w zwrocie do kogoś. Odmieniane jest tylko imię, a nazwisko pozostaje bez zmian.",
  "vocative":"wołacz",
  "Previous card":"Poprzednia karta",
  "Next card":"Następna karta",
  "Previous category":"Poprzednia kategoria",
  "Next category":"Następna kategoria",
  "Top of the list":"Początek listy",
  "Bottom of the list":"Koniec listy",
  "First category":"Pierwsza kategoria",
  "Last category":"Ostatnia kategoria",
  "Copy focused card":"Kopiuj zaznaczoną kartę",
  "Copy other language":"Kopiuj w drugim języku",
  "Escape / clear":"Escape / wyczyść",
  "Switch the cards between English and Polish":"Przełącza karty między angielskim a polskim",
  "Switch to the next chat tab, round to the first after the last":"Przełącza na następną rozmowę, a po ostatniej wraca do pierwszej",
  "Open a fresh chat tab":"Otwiera nową rozmowę",
  "Open or close the fees panel":"Otwiera lub zamyka panel opłat",
  "Edit the customer first name":"Edytuje imię klienta",
  "Edit the comment actor":"Edytuje wykonawcę w komentarzu",
  "Show or hide the left intent list":"Pokazuje lub ukrywa lewą listę intencji",
  "Show or hide the category bar":"Pokazuje lub ukrywa pasek kategorii",
  "Deselect every chosen intent":"Odznacza wszystkie wybrane intencje",
  "Clear the category filter":"Czyści filtr kategorii",
  "Hold Ctrl (Cmd on Mac): show the pills when hidden, or expand them past two rows":"Przytrzymaj Ctrl (Cmd na Macu): pokazuje ukryte kategorie lub rozwija je poza dwa rzędy",
  "Readings about this machine, and rescue switches":"Odczyty o tej maszynie i przełączniki ratunkowe",
  "Select everything in the INTENT / MACRO box, without clicking into it first":"Zaznacza całą treść pola INTENT / MACRO bez klikania w nie",
  "Move focus to the previous copyable macro (alt / step / single)":"Przenosi kursor na poprzednie makro do skopiowania (wariant / krok / pojedyncze)",
  "Move focus to the next copyable macro (alt / step / single)":"Przenosi kursor na następne makro do skopiowania (wariant / krok / pojedyncze)",
  "Select the previous category pill (All, then the categories)":"Wybiera poprzednią kategorię (Wszystkie, potem kategorie)",
  "Select the next category pill (All, then the categories)":"Wybiera następną kategorię (Wszystkie, potem kategorie)",
  "Move the mark to the top of its list, then across to the other one":"Przenosi zaznaczenie na początek swojej listy, a stamtąd na drugą listę",
  "Move the mark to the bottom of its list, then across to the other one":"Przenosi zaznaczenie na koniec swojej listy, a stamtąd na drugą listę",
  "Select the first category, skipping All and any the search has emptied":"Wybiera pierwszą kategorię, pomijając Wszystkie i te opróżnione przez wyszukiwanie",
  "Select the last category, skipping any the search has emptied":"Wybiera ostatnią kategorię, pomijając te opróżnione przez wyszukiwanie",
  "Copy the focused macro in the active language":"Kopiuje zaznaczone makro w aktywnym języku",
  "Copy the focused macro in the other language":"Kopiuje zaznaczone makro w drugim języku",
  "Sheds one thing per press: panels, then search, then intents, then all tabs":"Zdejmuje jedną rzecz na naciśnięcie: panele, potem wyszukiwanie, potem intencje, potem wszystkie rozmowy",
  "Customers see \"{NAME}\", and comments sign /{INIT}":"Klienci widzą \"{NAME}\", a komentarze podpisują się /{INIT}",
  "The name customers see, exactly as you type it; comments sign with its initials":"Nazwa, którą widzą klienci, dokładnie tak, jak ją wpiszesz; komentarze podpisują się jej inicjałami",
  "Panel is locked open (always docked). Hide turns it off entirely.":"Panel jest zablokowany otwarty (zawsze zadokowany). Ukryj wyłącza go całkowicie.",
  "Prefer showing the intent panel when the window is wide. On narrow windows it auto-hides; hover the left edge or hold Ctrl to peek. Use the lock at the top of the panel, or Settings, to keep it open.":"Pokazuj panel intencji, gdy okno jest szerokie. W wąskich oknach chowa się sam; najedź na lewą krawędź lub przytrzymaj Ctrl, aby go podejrzeć. Aby został otwarty, użyj blokady na górze panelu lub Ustawień.",
  "Intent panel off. Hold Ctrl to peek the intent list as an overlay.":"Panel intencji wyłączony. Przytrzymaj Ctrl, aby podejrzeć listę intencji jako nakładkę.",
  "Polish cards - switch to English":"Karty po polsku - przełącz na angielski",
  "English cards - switch to Polish":"Karty po angielsku - przełącz na polski",
  "Click to filter · Ctrl+click to add/remove · drag to reorder":"Kliknij, aby filtrować · Ctrl+kliknięcie dodaje/usuwa · przeciągnij, aby zmienić kolejność",
  "Green ring: holds a card linked to the chosen intent":"Zielona obwódka: zawiera kartę powiązaną z wybraną intencją",
  "Blue ring: a supporting category":"Niebieska obwódka: kategoria wspierająca",
  "Click any macro to copy":"Kliknij dowolne makro, aby skopiować",
  "… are alternatives, copied one at a time.":"… to warianty, kopiowane pojedynczo.",
  "fills from the name box;":"wypełnia się z pola imienia;",
  "from the agent name;":"z nazwy agenta;",
  "from the side panel, from the chips under the opener when the panel is off, or from what you type. A listed intent follows EN|PL; typed text does not. Typing in SEARCH ranks intents and filters cards in both languages.":"z panelu bocznego, z chipów pod kartą otwierającą, gdy panel jest ukryty, albo z tego, co wpiszesz. Intencja z listy podąża za EN|PL; tekst wpisany ręcznie już nie. Pisanie w SZUKAJ układa intencje i filtruje karty w obu językach.",
  "is the subject of the chat as a noun phrase: where":"to temat rozmowy jako wyrażenie rzeczownikowe: tam, gdzie",
  "names an act, this names a thing.":"nazywa czynność, to nazywa rzecz.",
  "is what was DONE, for internal comments. Both are set per intent in its editor.":"to opis tego, co ZOSTAŁO ZROBIONE, do komentarzy wewnętrznych. Oba ustawia się przy każdej intencji, w jej edytorze.",
  "just that macro":"tylko to makro",
  "- cards badged":"- karty oznaczone",
  "are alternatives and copy one at a time.":"to warianty i kopiują się pojedynczo.",
  "Different catalog found":"Znaleziono inny katalog",
  "Older catalog found":"Znaleziono starszy katalog",
  "The file beside Etiuda is an earlier edition than the one you have.":"Plik obok Etiudy to wcześniejsze wydanie niż to, które masz.",
  "Load it anyway":"Wczytaj mimo to",
  "Updated catalog found":"Znaleziono zaktualizowany katalog",
  "Watching":"Obserwowany plik:",
  "Check for updates":"Sprawdź aktualizacje",
  "Read that file again and offer it if it has changed":"Przeczytaj ten plik ponownie i zaproponuj go, jeśli się zmienił",
  "Stop watching":"Przestań obserwować",
  "No longer watching that file.":"Ten plik nie jest już obserwowany.",
  "No catalog file is being watched.":"Żaden plik katalogu nie jest obserwowany.",
  "Etiuda needs permission to read that file again.":"Etiuda potrzebuje ponownej zgody na odczyt tego pliku.",
  "That file is not a catalog Etiuda can read.":"Tego pliku Etiuda nie potrafi odczytać jako katalogu.",
  "That file matches the catalog you already have.":"Ten plik jest zgodny z katalogiem, który już masz.",
  "Could not read the watched file.":"Nie udało się odczytać obserwowanego pliku.",
  "The catalog beside Etiuda has changed since you loaded it.":"Katalog obok Etiudy zmienił się od czasu wczytania.",
  "Your own cards and edits are kept.":"Twoje karty i zmiany zostają.",
  "Load the update":"Wczytaj aktualizację",
  "You have {V}.":"Masz {V}.",
  "This is a newer copy of the catalog you already have, so your own cards and edits are kept.":"To nowsza kopia katalogu, który już masz, więc Twoje własne karty i zmiany zostaną zachowane.",
  "Load catalog?":"Wczytać katalog?",
  "The file beside Etiuda no longer matches what is loaded.":"Plik leżący obok Etiudy nie odpowiada już temu, co jest wczytane.",
  "Located as":"Znaleziony jako",
  "Loading it replaces the catalog you have now.":"Wczytanie go zastąpi katalog, który masz teraz.",
  "Card added":"Karta dodana",
  "Card saved":"Karta zapisana",
  "Intent added":"Intencja dodana",
  "Intent saved":"Intencja zapisana",
  "Intent shown again":"Intencja pokazana ponownie",
  "Intent hidden - greyed and moved to the bottom":"Intencja ukryta - wyszarzona i przeniesiona na dół",
  "Put away - greyed at the foot of its category":"Odłożona - wyszarzona na dole swojej kategorii",
  "Put away - greyed at the foot of its category, unfavourited":"Odłożona - wyszarzona na dole swojej kategorii, usunięta z ulubionych",
  "1 card shown again":"1 karta pokazana ponownie",
  "{N} cards shown again":"Karty pokazane ponownie: {N}",
  "1 intent shown again":"1 intencja pokazana ponownie",
  "{N} intents shown again":"Intencje pokazane ponownie: {N}",
  "Categories shown":"Kategorie pokazane",
  "Categories hidden":"Kategorie ukryte",
  "Categories stay fully expanded":"Kategorie pozostają w pełni rozwinięte",
  "Categories may auto-collapse":"Kategorie mogą się zwijać automatycznie",
  "Intent panel shown":"Panel intencji pokazany",
  "Intent panel hidden":"Panel intencji ukryty",
  "Quick facts saved":"Szybkie fakty zapisane",
  "Quick facts match built-in default":"Szybkie fakty zgodne z wbudowanymi",
  "is now a supporting category":"jest teraz kategorią wspierającą",
  "is an ordinary category":"jest zwykłą kategorią",
  "No {LANG} version for this card":"Brak wersji {LANG} dla tej karty",
  "switch to {LANG} to use it":"przełącz na {LANG}, aby jej użyć",
  "Keeping the loaded catalog.":"Zachowano wczytany katalog.",
  "Starting empty. Load one any time from the Library.":"Start bez katalogu. Możesz go wczytać w każdej chwili z Biblioteki.",
  "{INTENT} set -":"Ustawiono {INTENT} -",
  "Clear Etiuda's local memory in this browser?":"Wyczyścić pamięć lokalną Etiudy w tej przeglądarce?",
  "Removes every personal card, intent, edit, hide, category rename and quick-facts edit,":"Usuwa wszystkie własne karty, intencje, zmiany, ukrycia, zmienione nazwy kategorii i zmiany w szybkich faktach,",
  "Catalog files on disk are not touched.":"Pliki katalogu na dysku pozostają nienaruszone.",
  "Etiuda restarts empty. If a catalog file sits beside it you will be asked whether to":"Etiuda uruchomi się pusta. Jeśli obok leży plik katalogu, zostaniesz zapytany, czy",
  "Import catalog":"Importuj katalog",
  "Load this catalog on this browser:":"Wczytać ten katalog w tej przeglądarce:",
  "It replaces the catalog loaded now. Personal card edits and custom cards on this":"Zastąpi wczytany katalog. Własne zmiany w kartach i własne karty w tej",
  "browser are cleared, because they belong to the catalog they were written against.":"przeglądarce zostaną usunięte, ponieważ należą do katalogu, dla którego powstały.",
  "Nothing on disk is changed. Etiuda reloads to apply it.":"Nic na dysku nie zostanie zmienione. Etiuda przeładuje się, aby to zastosować.",
  "Continue?":"Kontynuować?",
  "Changes every label in Etiuda, never the cards themselves":"Zmienia wszystkie etykiety w Etiudzie, nigdy samych kart",
  "What language Etiuda's own buttons, menus and messages are written in":"W jakim języku są napisane przyciski, menu i komunikaty samej Etiudy",
  "Theme, blur effects and animations":"Motyw, efekty rozmycia i animacje",
  "What stays docked, and what may hide itself when space is short":"Co pozostaje zadokowane, a co może się schować, gdy brakuje miejsca",
  "Rebind any key combo. The keys the app itself needs are listed as fixed.":"Zmień dowolny skrót. Klawisze potrzebne samej aplikacji są oznaczone jako stałe.",
  "Always the light palette, whatever the computer asks for":"Zawsze jasna paleta, niezależnie od ustawień komputera",
  "Always the dark palette, whatever the computer asks for":"Zawsze ciemna paleta, niezależnie od ustawień komputera",
  "Follows your computer's light or dark setting, and changes with it":"Podąża za ustawieniem jasnym lub ciemnym komputera i zmienia się razem z nim",
  "Panels and the dialog backdrop stay blurred":"Panele i tło za oknami dialogowymi pozostają rozmyte",
  "Panels go flat and opaque, and a dialog only darkens what is behind it":"Panele stają się płaskie i nieprzezroczyste, a okno dialogowe tylko przyciemnia to, co za nim",
  "Everything moves as it was drawn to":"Wszystko porusza się tak, jak zaprojektowano",
  "Nothing moves; every change lands at once":"Nic się nie porusza; każda zmiana ląduje od razu",
  "The panel stays docked at any window width":"Panel pozostaje zadokowany przy każdej szerokości okna",
  "The panel hides itself when the window gets narrow":"Panel chowa się, gdy okno staje się wąskie",
  "Every category row stays visible":"Każdy rząd kategorii pozostaje widoczny",
  "The bar keeps two rows, and Ctrl peeks at the others":"Pasek zostaje przy dwóch wierszach, a Ctrl pozwala zerknąć na pozostałe",
  "Click, then press the new key combo":"Kliknij, a następnie naciśnij nową kombinację klawiszy",
  "Press keys…":"Naciśnij klawisze…",
  "Fixed keys":"Klawisze stałe",
  "The grammar the rest stands on: Esc is how key capture itself cancels, arrows and Enter keep their native meanings, and a held Ctrl is a hold, not a chord.":"Gramatyka, na której opiera się reszta: Esc anuluje samo przechwytywanie klawiszy, strzałki i Enter zachowują swoje naturalne znaczenie, a przytrzymany Ctrl to przytrzymanie, nie skrót.",
  "Delete this custom card?\n\nIt disappears from Etiuda and from anything you export. The catalog has no version to restore.":"Usunąć tę własną kartę?\n\nZniknie z Etiudy i ze wszystkiego, co wyeksportujesz. Katalog nie ma jej wersji do przywrócenia.",
  "Delete this card?\n\nIt disappears from Etiuda and from anything you export. Reset restores it from the catalog.":"Usunąć tę kartę?\n\nZniknie z Etiudy i ze wszystkiego, co wyeksportujesz. Przycisk Przywróć odtworzy ją z katalogu.",
  "Delete this custom intent?":"Usunąć tę własną intencję?",
  "Delete this intent?\n\nIt disappears from Etiuda and from anything you export. Reset restores it from the catalog.":"Usunąć tę intencję?\n\nZniknie z Etiudy i ze wszystkiego, co wyeksportujesz. Przycisk Przywróć odtworzy ją z katalogu.",
  "Keep current":"Zachowaj obecny",
  "Start empty":"Zacznij pusto",
  "Load it":"Wczytaj",
  "Load catalog":"Wczytaj katalog",
  "Show all hidden":"Pokaż wszystkie ukryte",
  "English cards - click, or press":"Karty po angielsku - kliknij lub naciśnij",
  "Polish cards - click, or press":"Karty po polsku - kliknij lub naciśnij",
  "toggles":"przełącza",
  "Library":"Biblioteka",
  "Maintenance":"Konserwacja",
  "Import failed -":"Import nie powiódł się -",
  "Moved to":"Przeniesiono do",
  "Restored original -":"Przywrócono oryginał -",
  "Edit, hide or restore every card, intent and category":"Edytuj, ukrywaj i przywracaj karty, intencje i kategorie",
  "Add a category":"Dodaj kategorię",
  "New category":"Nowa kategoria",
  "New category name":"Nazwa nowej kategorii",
  "Create a new category":"Utwórz nową kategorię",
  "Move or delete cards in this category first":"Najpierw przenieś lub usuń karty z tej kategorii",
  "Move or delete the cards in this category first":"Najpierw przenieś lub usuń karty z tej kategorii",
  "Create a card in":"Utwórz kartę w",
  "Delete card":"Usuń kartę",
  "Delete this card":"Usuń tę kartę",
  "New intent":"Nowa intencja",
  "Create a custom intent":"Utwórz własną intencję",
  "Write a new clause for {INTENT}":"Napisz nową klauzulę dla {INTENT}",
  "Delete this intent":"Usuń tę intencję",
  "Export catalog…":"Eksportuj katalog…",
  "Import catalog…":"Importuj katalog…",
  "Build integrated copy…":"Zbuduj zintegrowaną kopię…",
  "Clear local memory…":"Wyczyść pamięć lokalną…",
  "Eject catalog…":"Odłącz katalog…",
  "Previous":"Poprzedni",
  /* Qualified because the tour already owns a plain "Next" and calls it Dalej; Previous has
     no such clash, so it stays plain rather than being qualified for symmetry alone. */
  "editor␟Next":"Następny",
  "Editor: previous":"Edytor: poprzedni",
  "Editor: next":"Edytor: następny",
  "In an editor: open the one before it":"W edytorze: otwiera poprzednią pozycję",
  "In an editor: open the one after it":"W edytorze: otwiera następną pozycję",
  "Editor: previous language":"Edytor: poprzedni język",
  "Editor: next language":"Edytor: następny język",
  "In an editor: the language tab before this one":"W edytorze: poprzedni język",
  "In an editor: the language tab after this one":"W edytorze: następny język",
  "Switch the language being edited":"Przełącz edytowany język",
  "This card has unsaved changes. Leave it without saving?":"Ta karta ma niezapisane zmiany. Opuścić ją bez zapisywania?",
  "Restored your cards and stars from an earlier build.":"Przywrócono Twoje karty i gwiazdki z wcześniejszej wersji.",
  "Forget every personal card, edit, hide, rename and layout choice in this browser; the loaded catalog stays. It is also how you bring back anything you deleted.":"Zapomnij wszystkie własne karty, zmiany, ukrycia, zmiany nazw i ustawienia układu w tej przeglądarce; wczytany katalog zostaje. Tak też przywracasz to, co usunięte.",
  "Put the catalog down and restart empty. Your cards, edits, name, theme and layout all stay.":"Odłóż katalog i uruchom Etiudę pustą. Twoje karty, zmiany, nazwa, motyw i układ zostają.",
  "Eject the catalog from this browser?":"Odłączyć katalog od tej przeglądarki?",
  "Your own cards, edits, stars and card order are KEPT - load this catalog again":"Twoje własne karty, zmiany, gwiazdki i kolejność kart ZOSTAJĄ - wczytaj ten katalog ponownie,",
  "Your own cards, edits, stars and card order are KEPT, and come back where they were when you load this catalog again.":"Twoje własne karty, zmiany, gwiazdki i kolejność kart ZOSTAJĄ i wracają na swoje miejsca, gdy wczytasz ten katalog ponownie.",
  "Loading a different catalog clears them, because they were written against this one.":"Wczytanie innego katalogu je usunie, ponieważ powstały dla tego katalogu.",
  "Your agent name, theme and layout choices stay, and catalog files on disk are not touched.":"Twoja nazwa agenta, motyw i ustawienia układu pozostają, a pliki katalogu na dysku nie są ruszane.",
  "Etiuda restarts empty. If a catalog file sits beside it you will be asked whether to load it.":"Etiuda uruchomi się pusta. Jeśli obok leży plik katalogu, pojawi się pytanie o jego wczytanie.",
  "and forgets your agent name, theme and layout choices.":"i zapomina Twoją nazwę agenta, motyw oraz ustawienia układu.",
  "The loaded catalog stays, and Etiuda restarts with it.":"Wczytany katalog pozostaje, a Etiuda uruchomi się z nim.",
  "Save everything loaded now as a catalog file, your edits merged in":"Zapisz wszystko, co wczytane, jako plik katalogu z Twoimi zmianami",
  "Load a catalog file from disk: it is read as data, never executed. It replaces what is loaded now, and nothing on disk changes.":"Wczytaj plik katalogu z dysku: jest czytany jako dane, nigdy wykonywany. Zastępuje to, co wczytane teraz, a pliki na dysku pozostają bez zmian.",
  "Bake the catalog into one HTML file that needs nothing beside it":"Zapisz katalog w jednym pliku HTML, który nie potrzebuje nic obok",
  "Reset personal data":"Wyczyść dane osobiste",
  "Reset Etiuda":"Zresetuj Etiudę",
  "Edit card":"Edytuj kartę",
  "Edit this intent":"Edytuj tę intencję",
  "hold Ctrl to edit, Shift to hide":"przytrzymaj Ctrl, aby edytować, Shift, aby ukryć",
  "Edit intent":"Edytuj intencję",
  "Edit this category":"Edytuj tę kategorię",
  "Edit this category's names, icon and colour":"Edytuj nazwy, ikonę i kolor tej kategorii",
  "Delete this category. It is empty, so nothing is lost.":"Usuń tę kategorię. Jest pusta, więc nic nie zostanie utracone.",
  "hold Ctrl to edit it":"przytrzymaj Ctrl, aby edytować",
  "Delete category":"Usuń kategorię",
  "Discard your changes and restore the catalog's category.":"Odrzuć swoje zmiany i przywróć kategorię z katalogu.",
  "Nothing to discard - this matches the catalog.":"Nie ma czego odrzucać - to jest zgodne z katalogiem.",
  "This is yours, so the catalog has no version to restore.":"To jest Twoje, więc katalog nie ma wersji do przywrócenia.",
  "Discard your changes to this category?":"Odrzucić swoje zmiany w tej kategorii?",
  "Category reset":"Kategoria przywrócona",
  "Delete this empty category":"Usuń tę pustą kategorię",
  "Edit category":"Edytuj kategorię",
  "Title":"Tytuł",
  "Icon":"Ikona",
  "Colour":"Kolor",
  "Macro":"Makro",
  "Clause":"Fraza",
  "Comment action":"Czynność do komentarza",
  "Clause is required":"Fraza jest wymagana",
  "Category name":"Nazwa kategorii",
  "Name":"Nazwa",
  "Editing":"Edytujesz",
  "Keywords":"S\u0142owa kluczowe",
  "1 word":"1 s\u0142owo",
  "{N} words":"s\u0142\u00f3w: {N}",
  "zmieniono lot":"zmieniono lot",
  /* The three below are example VALUES, not chrome: the field takes English, so its hint
     stays English whatever the interface says. */
  "flight change":"flight change",
  "flight changed":"flight changed",
  "zmiana lotu":"zmiana lotu",
  "what was done":"co zostało zrobione",
  "extra words for search":"dodatkowe słowa do wyszukiwania",
  "a short name you will recognise":"krótka nazwa, którą rozpoznasz",
  "the text the customer receives":"tekst, który otrzyma klient",
  "guidance for you, never sent":"wskazówka dla Ciebie, nigdy nie wysyłana",
  "Note":"Notatka",
  "Blank lines split the text into separately copyable alternatives.":"Puste linie dzielą tekst na osobno kopiowane warianty.",
  "Numbers the alternatives as ordered steps.":"Numeruje warianty jako kolejne kroki.",
  "Rings green under every intent - for text that always applies, like an opener.":"Świeci na zielono przy każdej intencji - dla tekstu, który pasuje zawsze, jak powitanie.",
  "Sorts above the other linked cards when an intent is picked.":"Sortuje się nad pozostałymi powiązanymi kartami, gdy wybrano intencję.",
  "Save changes":"Zapisz zmiany",
  "Discard changes":"Odrzuć zmiany",
  "Close without saving any change":"Zamknij bez zapisywania zmian.",
  "Save this card on this computer":"Zapisz tę kartę na tym komputerze.",
  "Save this intent on this computer":"Zapisz tę intencję na tym komputerze.",
  "Delete this card: a built-in one returns on Reset, one you made does not":"Usuń tę kartę: wbudowana wróci po zresetowaniu, Twoja własna nie",
  "Delete this intent: a built-in one returns on Reset, one you made does not":"Usuń tę intencję: wbudowana wróci po zresetowaniu, Twoja własna nie",
  "Discard your edits and restore the catalog wording.":"Odrzuć swoje zmiany i przywróć treść z katalogu.",
  "Restore built-in quick facts":"Przywróć wbudowane szybkie fakty",
  "Delete this custom card permanently?":"Usunąć tę własną kartę na stałe?",
  "Delete this empty category?\n\nA Reset restores it from the catalog.":"Usunąć tę pustą kategorię?\n\nPrzycisk Przywróć odtworzy ją z katalogu.",
  "Reset all shortcuts to defaults?":"Przywrócić domyślne skróty klawiszowe?",
  "Restore built-in quick facts? Your edited text will be discarded.":"Przywrócić wbudowane szybkie fakty? Twój zmieniony tekst zostanie odrzucony.",
  "{KEY} is fixed and keeps its own meaning":"{KEY} to klawisz stały i zachowuje swoje znaczenie",
  "Saved {KEY}":"Zapisano {KEY}",
  "{N} card":"{N} karta",
  "{N} cards":"{N} kart",
  "few␟{N} cards":"{N} karty",
  "many␟{N} cards":"{N} kart",
  "{N} macro":"{N} makro",
  "{N} macros":"{N} makr",
  "few␟{N} macros":"{N} makra",
  "many␟{N} macros":"{N} makr",
  "{N} intent":"{N} intencja",
  "{N} intents":"{N} intencji",
  "few␟{N} intents":"{N} intencje",
  "many␟{N} intents":"{N} intencji",
  "{N} category":"{N} kategoria",
  "{N} categories":"{N} kategorii",
  "few␟{N} categories":"{N} kategorie",
  "many␟{N} categories":"{N} kategorii",
  "{CARDS} · {MACROS} · {INTENTS} · {CATEGORIES}":"{CARDS} · {MACROS} · {INTENTS} · {CATEGORIES}",
  "{MACROS} in {CARDS}, {CATEGORIES}":"{MACROS}, {CARDS}, {CATEGORIES}",
  "{MACROS} in {CARDS} · {INTENTS} · {CATEGORIES}":"{MACROS} · {CARDS} · {INTENTS} · {CATEGORIES}",
  "Built {FILE} with {MACROS} inside":"Zbudowano {FILE}, w środku {MACROS}",
  "Exported {FILE} with {MACROS} in {CARDS}":"Wyeksportowano {FILE}: {MACROS}, {CARDS}",
  "Card deleted":"Karta usunięta",
  "Custom card deleted":"Własna karta usunięta",
  "Category added":"Kategoria dodana",
  "Category deleted":"Kategoria usunięta",
  "Category updated":"Kategoria zaktualizowana",
  "Intent added to Favourites":"Intencja dodana do Ulubionych",
  "Intent removed from Favourites":"Intencja usunięta z Ulubionych",
  "Intent deleted":"Intencja usunięta",
  "Intent restored to original":"Przywrócono pierwotną intencję",
  "Intent not found":"Nie znaleziono intencji",
  "Intent order reset":"Przywrócono kolejność intencji",
  "Intent panel width reset":"Przywrócono szerokość panelu intencji",
  "Added to Favourites":"Dodano do Ulubionych",
  "Removed from Favourites":"Usunięto z Ulubionych",
  "Shown again":"Pokazano ponownie",
  "Tab cleared":"Rozmowa wyczyszczona",
  "no text yet":"jeszcze bez tekstu",
  "Copy the report: counts and environment only, never your content":"Skopiuj raport: tylko liczby i dane o środowisku, nigdy Twoja treść",
  "All tabs closed":"Zamknięto wszystkie rozmowy",
  "Press Esc again to close all tabs":"Naciśnij Esc ponownie, aby zamknąć wszystkie rozmowy",
  "{INTENT} cleared":"Wyczyszczono {INTENT}",
  "Shortcuts reset":"Przywrócono domyślne skróty",
  "Press the new shortcut (Esc to cancel, Backspace for the default)":"Naciśnij nowy skrót (Esc anuluje, Backspace przywraca domyślny)",
  "Built-in quick facts restored":"Przywrócono wbudowane szybkie fakty",
  "The browser blocked the copy, so select the text yourself.":"Przeglądarka zablokowała kopiowanie, więc zaznacz tekst samodzielnie.",
  "Some required fields are empty":"Niektóre wymagane pola są puste",
  "Title is required":"Tytuł jest wymagany",
  "Macro text is required":"Tekst makra jest wymagany",
  "The catalog is empty, so there is nothing to export.":"Katalog jest pusty, więc nie ma czego wyeksportować.",
  "The catalog is empty, so there is nothing to build.":"Katalog jest pusty, więc nie ma czego zbudować.",
  "Could not read file":"Nie udało się odczytać pliku",
  "Could not read this page's own source":"Nie udało się odczytać źródła tej strony",
  "Could not save, perhaps because the browser's storage is full.":"Nie udało się zapisać, być może pamięć przeglądarki jest zapełniona.",
  "Could not save shortcuts":"Nie udało się zapisać skrótów",
  "Could not save the catalog, perhaps because the browser's storage is full.":"Nie udało się zapisać katalogu, być może pamięć przeglądarki jest zapełniona.",
  "This browser is not storing anything, so a catalog cannot be kept here":"Ta przeglądarka niczego nie zapisuje, więc nie można tu zachować katalogu",
  "Could not find the embedded-catalog slot":"Nie znaleziono miejsca na wbudowany katalog",
  "load a sample catalog":"wczytaj przykładowy katalog",
  "Copy report":"Kopiuj raport",
  "Link copied":"Skopiowano link",
  "Report copied":"Skopiowano raport",
  "Nothing here yet.":"Jeszcze nic tu nie ma.",
  "Empty.":"Pusto.",
  "No categories.":"Brak kategorii.",
  "No intents.":"Brak intencji.",
  "No intents available.":"Brak dostępnych intencji.",
  "Uncategorised":"Bez kategorii",
  "Name this catalog":"Nazwij ten katalog",
  "Name this build":"Nazwij tę kompilację",
  "Saves as":"Zapisze się jako",
  "Reset shortcuts":"Przywróć skróty",
  "What Etiuda is, and every keyboard shortcut":"Czym jest Etiuda i wszystkie skróty klawiszowe",
  "Interface language, appearance and keyboard shortcuts":"Język interfejsu, wygląd i skróty klawiszowe",
  "Hide the category bar; hold Ctrl to peek at it while hidden":"Ukryj pasek kategorii; przytrzymaj Ctrl, aby na niego zerknąć",
  "Hide the intent panel; its chips then appear on the first card that uses {INTENT}":"Ukryj panel intencji; jego chipy pojawią się wtedy na pierwszej karcie z {INTENT}",
  "AGENT":"AGENT",
  "PAX":"PAX",
  "INTENT":"INTENCJA",
  "search intents and cards":"szukaj intencji i kart",
  "Search":"Szukaj",
  "One search: intents rank in the panel, cards filter below":"Jedno wyszukiwanie: intencje układają się w panelu, karty filtrują się poniżej",
  "search intents and cards · <kbd>Enter</kbd> selects the marked intent · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> for several":"szukaj intencji i kart · <kbd>Enter</kbd> wybiera zaznaczoną intencję · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> wybiera kilka",
  "Search cleared":"Wyszukiwanie wyczyszczone",
  "Typing in SEARCH ranks intents and filters cards together (both languages).":"Pisanie w SZUKAJ układa intencje i filtruje karty jednocześnie (oba języki).",
  "One box for everything: typing ranks the intents in the panel and filters the cards below it, in both languages. <kbd>↓</kbd> <kbd>↑</kbd> walk the intents that match, skipping the ones already picked; <kbd>Shift</kbd>+<kbd>↑</kbd> jumps to the top of the list, and a second one crosses to the first card (<kbd>Shift</kbd>+<kbd>↓</kbd> works the same way down). <kbd>Enter</kbd> picks the marked intent: it fills <span class=\"fillmiss\">INTENT</span> and rings the linked cards <b class=\"t-go\">green</b>; <kbd>Ctrl</kbd>+<kbd>Enter</kbd> picks and keeps the box for the next one. <kbd>←</kbd> <kbd>→</kbd> step through the categories even from inside the box, and <kbd>Esc</kbd> clears.":"Jedno pole na wszystko: pisanie układa intencje w panelu i filtruje karty poniżej, w obu językach. <kbd>↓</kbd> <kbd>↑</kbd> przechodzą po pasujących intencjach, omijając już wybrane; <kbd>Shift</kbd>+<kbd>↑</kbd> skacze na początek listy, a drugi raz - na pierwszą kartę (<kbd>Shift</kbd>+<kbd>↓</kbd> działa tak samo w dół). <kbd>Enter</kbd> wybiera zaznaczoną intencję - wypełnia <span class=\"fillmiss\">INTENT</span> i obwodzi powiązane karty na <b class=\"t-go\">zielono</b>; <kbd>Ctrl</kbd>+<kbd>Enter</kbd> wybiera i zostawia pole na kolejną. <kbd>←</kbd> <kbd>→</kbd> przechodzą między kategoriami nawet z wnętrza pola, a <kbd>Esc</kbd> czyści.",

  "ROLE":"ROLA",
  "EN":"EN",
  "PL":"PL",
  "Etiuda":"Etiuda",
  "Etiuda catalog":"Katalog Etiudy",
  "A macro bank for live chat":"Bank makr do czatu na żywo",
  "Menu":"Menu",
  "Cards, the intent panel and the category bar":"Karty, panel intencji i pasek kategorii",
  "More tools":"Więcej narzędzi",
  "The tools this window is too narrow to show":"Narzędzia, na które to okno jest za wąskie",
  "Quick facts":"Szybkie fakty",
  "Fees, deadlines and limits":"Opłaty, terminy i limity",
  "Switch between the light and dark themes":"Przełącz między motywem jasnym a ciemnym",
  "Switch card language":"Przełącz język kart",
  "The language the macros are shown in, kept per tab":"Język, w którym pokazywane są makra, osobno dla każdej rozmowy",
  "Show English cards":"Pokaż karty po angielsku",
  "Show Polish cards":"Pokaż karty po polsku",
  "Scroll tabs left":"Przewiń rozmowy w lewo",
  "Scroll tabs right":"Przewiń rozmowy w prawo",
  "The new tab starts with cleared fields and your settings kept.":"Nowa rozmowa ma puste pola i zachowane ustawienia.",
  "New tab (same shared settings; cleared PAX, intent, ROLE, categories)":"Nowa rozmowa (te same wspólne ustawienia; wyczyszczone PAX, intencja, ROLE, kategorie)",
  "One tab per chat, each with its own PAX, intent, ROLE and categories":"Jedna rozmowa na czat, każda z własnym PAX, intencją, ROLE i kategoriami",
  "Click to switch, or drag to reorder":"Kliknij, aby przełączyć, lub przeciągnij, aby zmienić kolejność",
  "The name customers see, exactly as you type it":"Nazwa, którą widzą klienci, dokładnie tak, jak ją wpiszesz",
  "The customer's name as the chat gives it, filling {PAX} with the tidied first name":"Imię i nazwisko klienta w postaci z czatu, wypełnia {PAX} uporządkowanym imieniem",
  "{PAX} fills the first name even when the chat gives the full name.":"{PAX} wstawia samo imię, nawet gdy z czatu przychodzi imię i nazwisko.",
  "class":"klasa",
  "Who is on the chat, filling {ROLE} in internal comments":"Kto jest po drugiej stronie, wypełnia {ROLE} w komentarzach wewnętrznych",
  "booker, customer, account holder":"rezerwujący, klient, właściciel konta - wypełniają {ROLE} w komentarzach wewnętrznych",
  "Notches for the ROLE wheel, comma-separated; blanks and repeats are dropped":"Pozycje pokrętła ROLE po przecinku; puste i powtórzone są pomijane",
  "Intent list":"Lista intencji",
  "Click to pick, again to clear, and hold Ctrl for several":"Kliknij, aby wybrać, ponownie, aby wyczyścić, a Ctrl wybiera kilka",
  "Clear":"Wyczyść",
  "Clear PAX":"Wyczyść PAX",
  "Clear agent":"Wyczyść agenta",
  "Clear agent name":"Wyczyść imię agenta",
  "Clear customer name":"Wyczyść imię klienta",
  "Clear intents":"Wyczyść intencje",
  "Clear all selected intents":"Wyczyść wszystkie wybrane intencje",
  "All categories":"Wszystkie kategorie",
  "Pick a category":"Wybierz kategorię",
  "Show all categories; double-click to reset their order":"Pokaż wszystkie kategorie; kliknij dwukrotnie, aby przywrócić ich kolejność",
  "Filter by category; a green ring marks one that relates to the chosen intent":"Filtruj po kategoriach; zielona obwódka oznacza kategorię powiązaną z wybraną intencją",
  "Filter by category; a green ring marks one that relates to the chosen intent, and {KEY} shows every row":"Filtruj po kategoriach; zielona obwódka oznacza kategorię powiązaną z wybraną intencją, a {KEY} pokazuje wszystkie wiersze",
  "Supporting category":"Kategoria pomocnicza",
  "Linked to the selected intent":"Powiązana z wybraną intencją",
  "Hover here or hold Ctrl to show the intent panel":"Najedź tutaj lub przytrzymaj Ctrl, aby pokazać panel intencji",
  "Keep the panel docked even on a narrow window":"Utrzymuje panel zadokowany nawet przy wąskim oknie",
  "Lock the intent panel open":"Zablokuj panel intencji",
  "Double-click to reset the intent order":"Kliknij dwukrotnie, aby przywrócić kolejność intencji",
  "Drag to reorder":"Przeciągnij, aby zmienić kolejność",
  "Drag to reorder, or onto a category to move it there":"Przeciągnij, aby zmienić kolejność, albo na kategorię, aby ją tam przenieść",
  "Click to copy":"Kliknij, aby skopiować",
  "Click to copy full URL":"Kliknij, aby skopiować pełny adres",
  "Click to copy, or drag to reorder these":"Kliknij, aby skopiować, lub przeciągnij, aby zmienić kolejność",
  "Hide this card":"Ukryj tę kartę",

  "Show this card again":"Pokaż tę kartę ponownie",
  "Hide this intent":"Ukryj tę intencję",
  "Hide this intent: it greys out and drops to the bottom":"Ukryj tę intencję: zszarzeje i spadnie na koniec listy",
  "Show this intent again":"Pokaż tę intencję ponownie",
  "In Favourites":"W Ulubionych",
  "Edit this card":"Edytuj tę kartę",
  "Open the full editor":"Otwórz pełny edytor",
  "Edit quick facts":"Edytuj szybkie fakty",
  "Edit quick facts text":"Edytuj treść szybkich faktów",
  "Close this screen":"Zamknij ten ekran",
  "Dismiss":"Zamknij",
  "Back":"Wstecz",
  "Next":"Dalej",
  "Done":"Gotowe",
  "Save":"Zapisz",
  "Cancel":"Anuluj",
  "Delete":"Usuń",
  "Reset":"Przywróć",
  "Export":"Eksportuj",
  "Not now":"Nie teraz",
  "Welcome":"Witaj",
  "New here?":"Pierwszy raz tutaj?",
  "Skip tour":"Pomiń przewodnik",
  "Show tour":"Pokaż przewodnik",
  "Press Esc to leave the tour.":"Naciśnij Esc, aby wyjść z przewodnika.",
  "A guided walk through the main controls":"Przewodnik po głównych elementach",
  "Library…":"Biblioteka…",
  "Settings…":"Ustawienia…",
  "Show tour…":"Pokaż przewodnik…",
  "About Etiuda":"O Etiudzie",
  "Hide intent panel":"Ukryj panel intencji",
  "Show intent panel":"Pokaż panel intencji",
  "Lock intent panel":"Zablokuj panel intencji",
  "Unlock intent panel":"Odblokuj panel intencji",
  "Hide categories":"Ukryj kategorie",
  "Show categories":"Pokaż kategorie",
  "Lock categories":"Zablokuj kategorie",
  "Unlock categories":"Odblokuj kategorie",
  "Settings":"Ustawienia",
  "The language of the buttons and menus, not of the macros: those follow EN|PL in the header":"Język przycisków i menu, nie makr: te idą za przełącznikiem EN|PL w nagłówku",
  "Appearance":"Wygląd",
  "Theme":"Motyw",
  "Light":"Jasny",
  "Dark":"Ciemny",
  "System":"Systemowy",
  "System follows your computer's own setting.":"Systemowy podąża za ustawieniem Twojego komputera.",
  "Blur effects":"Efekty rozmycia",
  "Blurred panel backgrounds and the blur behind dialogs. Turn off if text reads less clearly, or the machine struggles.":"Rozmyte tło paneli i rozmycie za oknami dialogowymi. Wyłącz, jeśli tekst jest mniej czytelny albo komputer zwalnia.",
  "Animations":"Animacje",
  "Transitions, slides, and the cards re-sorting themselves. Switches itself off when your system asks for reduced motion.":"Przejścia, przesunięcia i samo przestawianie się kart. Wyłącza się samo, gdy system prosi o ograniczenie ruchu.",
  "Keyboard shortcuts":"Skróty klawiszowe",
  "An alternative: click, then press the key combo":"Skrót alternatywny: kliknij, a następnie naciśnij kombinację klawiszy",
  "Press the alternative (Esc to cancel, Backspace to clear)":"Naciśnij skrót alternatywny (Esc anuluje, Backspace usuwa)",
  "Alternative cleared":"Skrót alternatywny usunięty",
  "Back to the default":"Przywrócono domyślny skrót",
  "Reset defaults":"Przywróć domyślne",
  "Layout":"Układ",
  "Lock the intent panel":"Zablokuj panel intencji",
  "Keep it docked even when the window is narrow, instead of letting it hide itself.":"Panel zostaje zadokowany także przy wąskim oknie, zamiast chować się sam.",
  "Lock the category bar":"Zablokuj pasek kategorii",
  "Keep every category row visible, instead of collapsing to two lines.":"Wszystkie rzędy kategorii pozostają widoczne, zamiast zwijać się do dwóch linii.",
  "On":"Wł.",
  "Off":"Wył.",
  "Close":"Zamknij",
  "Interface language":"Język interfejsu",
  "Localisation":"Lokalizacja",
  "Theme follows the system":"Motyw podąża za systemem",
  "Animations reduced":"Animacje ograniczone",
  "Animations on":"Animacje włączone",
  "Blur effects on":"Efekty rozmycia włączone",
  "Blur effects off":"Efekty rozmycia wyłączone"
};
function uiLang(){
  const l=lsGet("pbUiLang");
  return (l && UI_STRINGS[l]) ? l : "en";       // an unknown or retired code reads English
}
/** English is the source text, so it IS the fallback - a missing key reads English, never
 *  blank and never the key name. That rule is what lets a language ship half-translated: the
 *  gaps read English rather than breaking, so a new language can land a section at a time. */
/* KEYED BY THE ENGLISH SOURCE, not symbolic names: the fallback IS the key, so a miss
   cannot render blank or leak "menu.library" to a passenger, and adding a language is
   filling in a column. The cost - editing English orphans its translation - is exactly
   what i18n-scan.js reports, loudly rather than silently. */
function t(en){
  const tab=UI_STRINGS[uiLang()];
  return (tab && tab[en]!=null) ? tab[en] : en;
}
/* TRANSLATE AT THE SINKS, not at 200 call sites: an attribute in markup, a chrome
   element's text, or a toast. SCOPED TO CHROME - the card list, the panel's rows and the
   facts panel hold CATALOG content, the customer's, never touched by a UI language; that
   is also why nothing here walks `document`. */
/* ONE ENGLISH WORD, TWO MEANINGS ("name": a person's in the header, a catalog's in
   maintenance). tc() tries a context-qualified key first, falls back to the plain one - a
   language pays nothing until it needs it. The separator is U+241F, which cannot occur in
   UI text, so a context key can never collide with a real one. */
const T_CTX="\u241f";
function tc(ctx,en){
  const tab=UI_STRINGS[uiLang()];
  if(tab){ const v=tab[ctx+T_CTX+en]; if(v!=null) return v; }
  return t(en);
}
/* POLISH COUNTS A NOUN THREE WAYS where English counts two: 1 karta, 2 karty, 5 kart, with the
   teens taking the last of those. The two plural forms are context keys on the plural, so a
   language holding one plural answers the same call with one string.
   EVERY NOUN KEY BELOW CARRIES A NON-BREAKING SPACE, invisible here: a count must not be left
   at the end of a line with its noun starting the next. */
function counted(n,one,many){
  if(n===1) return t(one).replace("{N}",n);
  const ten=n%10, hundred=n%100;
  const few = ten>=2 && ten<=4 && !(hundred>=12 && hundred<=14);
  return tc(few?"few":"many", many).replace("{N}",n);
}
/* ONE PLACE HOLDS THE NOUNS, and each screen brings its own key holding only their order and
   what sits between them - which is how a language that would not order them this way, or would
   not use the same preposition, says so. A count of nothing simply leaves its slot unmentioned. */
function catalogCountsLine(key,cardN,macroN,intentN,catN){
  return t(key)
    .replace("{CARDS}",counted(cardN,"{N} card","{N} cards"))
    .replace("{MACROS}",counted(macroN,"{N} macro","{N} macros"))
    .replace("{INTENTS}",counted(intentN,"{N} intent","{N} intents"))
    .replace("{CATEGORIES}",counted(catN,"{N} category","{N} categories"));
}
const I18N_ATTRS=["title","aria-label","placeholder"];
/* data-i18n-skip marks CATALOG text - an intent clause, a card title, a category name.
   The sweep neither translates nor descends into them, which lets it cover regions mixing
   engine words with the employer's; without it an intent named exactly like a UI string
   would be silently rewritten. */
function translateTree(root){
  /* NOT "return early on English". Every node this touched remembers its English source, and
     t() on English hands that source straight back - so running the sweep is exactly how the
     English is put back. Returning early meant a language could be entered and never left. */
  if(!root) return;
  const els=root.querySelectorAll ? root.querySelectorAll("*") : [];
  const all=root.nodeType===1 ? [root].concat(Array.prototype.slice.call(els)) : Array.prototype.slice.call(els);
  all.forEach(el=>{
    if(el.closest && el.closest("[data-i18n-skip]")) return;
    I18N_ATTRS.forEach(a=>{
      const v=el.getAttribute && el.getAttribute(a);
      if(!v) return;
      /* The ORIGINAL English is remembered on the element, so switching back - or switching to a
         third language - translates from the source rather than from the last translation. */
      const src=el.getAttribute("data-i18n-"+a) || v;
      const out=t(src);
      if(out!==v){ el.setAttribute("data-i18n-"+a, src); el.setAttribute(a, out); }
    });
    /* Text only where the element holds nothing but text: a button, a label, a heading. Anything
       with element children is left alone, because replacing its text would delete them. */
    if(el.children && el.children.length===0 && el.textContent && el.textContent.trim()){
      const src=el.getAttribute("data-i18n-text") || el.textContent.trim();
      const out=t(src);
      if(out!==el.textContent.trim()){ el.setAttribute("data-i18n-text", src); el.textContent=out; }
    }
    /* An element WITH children still has text of its own between them - halves a leaf rule
       can never reach - so each direct text node is swapped in place, the elements left
       where they were. A text node cannot carry an attribute, so it remembers its own
       original on itself. */
    else if(el.childNodes){
      Array.prototype.forEach.call(el.childNodes, n=>{
        if(n.nodeType!==3 || !n.nodeValue || !n.nodeValue.trim()) return;
        const raw=n.nodeValue, txt=raw.trim();
        const src=n.eI18nSrc || txt;
        const out=t(src);
        if(out!==txt){ n.eI18nSrc=src; n.nodeValue=raw.replace(txt, out); }
      });
    }
  });
}
/** The app's own furniture, never the catalog's content. */
function translateChrome(){
  /* #intentRail carries the engine's own labels AND the catalog's intent clauses; the
     clauses are marked data-i18n-skip where they are written, so the sweep is safe here. */
  ["header","#settingsMenu","#moreMenu","#modalCard","footer","#tourRoot",
   "#intentRail","#tourInvite","#sampleMark"].forEach(sel=>{
    const el=document.querySelector(sel);
    if(el) translateTree(el);
  });
}
function setUiLang(l){
  if(l && l!=="en" && UI_STRINGS[l]) lsSet("pbUiLang",l); else lsDel("pbUiLang");
  applyUiLang();
}
/* Every localised string is re-read here rather than at construction, so switching language
   repaints the app instead of asking for a reload. Anything built later reads t() itself. */
function applyUiLang(){
  document.documentElement.lang = uiLang();
  /* Re-render what the app builds from strings, then sweep the markup it does not. The order
     matters: syncSettingsMenu writes labels through t(), and the sweep translates whatever was
     authored in HTML. */
  syncSettingsMenu();
  syncMoreBtn();
  syncShortcutTitles();
  /* Surfaces translated at their CALL SITE (cards, panel, pills, tabs, legend) only
     change when drawn again, and changing language draws nothing by itself. The sweep
     handles what is already in the document; this rebuilds what must say something new. */
  /* applyCatsToGlobal leads: category labels can differ by language now, and every surface
     below reads the resolved CATS rather than the catalog. */
  /* References, never names looked up on window: a top-level function is a property of window
     in a classic script and is not one in a module, so a lookup by string turns quietly false
     and these six surfaces stop repainting with nothing thrown and nothing logged. */
  [applyCatsToGlobal,drawIntentRail,drawPills,drawTabs,syncRoleDrum,render].forEach(f=>{
    try{ f(); }catch(e){}
  });
  translateChrome();
  /* The name beside a dialog's title is CONTENT, so the sweep above rightly leaves it alone -
     and nothing else re-derived it, so an open editor kept naming its card in the language
     you had just left while the title itself changed. Re-read, not translated. */
  try{ refreshDialogName(); }catch(e){}
}
function systemTheme(){
  try{ return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"; }
  catch(e){ return "dark"; }
}
function themeChoice(){ const t=lsGet("pbTheme"); return (t==="light"||t==="dark") ? t : null; }
function applyTheme(){ document.documentElement.dataset.theme = themeChoice() || systemTheme(); }
try{ if(lsGet("pbUiLang")==="pl") document.documentElement.lang="pl"; }catch(e){}
applyTheme();
try{
  const _mq=matchMedia("(prefers-color-scheme: light)");
  const _onSys=()=>{ if(!themeChoice()) applyTheme(); };
  if(_mq.addEventListener) _mq.addEventListener("change",_onSys);
  else if(_mq.addListener) _mq.addListener(_onSys);      // older Safari
}catch(e){}
// ---- personal cards: stock built-ins in M; optional pack.baseCards (imported catalog)
// replaces M; edits/hides/customs in pack.overrides / .custom / .hidden. PAX and ROLE are
// per-tab session state, seeded in initTabs() from legacy localStorage if needed.
const BASE_CATS=Object.assign({},CATS);
let BASE_M=[];
/* The one place a card id is derived. A catalog FILE carries none, so anything comparing a
   stored id against an incoming catalog has to derive them the way the loader will.
   AN EXISTING id WINS: the importer disambiguates two cards sharing a category and title by
   suffixing the second, and re-deriving would hand both the first one's id - dropping the
   second card's star, hide and position on every activation. */
function catalogCardId(m){
  if(m && m.id) return m.id;
  return "b:"+((m&&m.c)||"open")+":"+((m&&m.t)||"Untitled");
}
function snapshotStockBaseCards(){
  return M.map(m=>{
    const o=Object.assign({},m);
    o.id=catalogCardId(m);
    o._base=1;
    return o;
  });
}
function normalizeBaseCardEntry(m){
  const o=Object.assign({},m||{});
  delete o._custom;
  delete o._overridden;
  delete o._base;
  if(!o.id) o.id=catalogCardId(o);
  o._base=1;
  return o;
}
/** Rebuild BASE_M from imported catalog (pack.baseCards) or stock M. */
function rebuildBaseCards(){
  if(Array.isArray(pack.baseCards)&&pack.baseCards.length){
    BASE_M=pack.baseCards.map(normalizeBaseCardEntry);
  } else {
    BASE_M=snapshotStockBaseCards();
  }
}
function emptyPack(){
  return {v:1,hidden:[],removed:[],removedCats:[],overrides:{},custom:[],catLabels:{},catLabelsPl:{},customCats:{},
    catRoles:{},catIcons:{},catColors:{},useCounts:{},
    favourites:[],intentFavourites:[],cardOrder:[],facts:null,intentHidden:[],intentRemoved:[],
    intentOverrides:{},intentCustom:[],
    baseCards:null};
}
let pack=emptyPack();
/* 1.5.0 renamed pack keys (macroOrder -> cardOrder, baseMacros -> baseCards), and every
   browser and standalone in circulation holds the OLD names - this tool is distributed by
   copying a file. Read either, KEEP WRITING BOTH: writing only the new name silently costs
   someone their ordering in an older build. Drop the shim only when no pre-1.5.0 build is
   in use. Returns true if anything was migrated. */
function migratePackKeys(p){
  if(!p||typeof p!=="object") return false;
  let did=false;
  if(!Array.isArray(p.cardOrder) && Array.isArray(p.macroOrder)){ p.cardOrder=p.macroOrder; did=true; }
  if(p.baseCards===undefined && p.baseMacros!==undefined){ p.baseCards=p.baseMacros; did=true; }
  return did;
}
let packMigrationFailed=false;
/* Shown only if the key rename could not be applied to what was stored. Etiuda still
   runs on defaults, but the user would find their arrangement gone and blame the update -
   so say what happened and offer the one real fix. Dismissible: the arrangement is what
   is lost, not the content. */
function showPackMigrationWarning(){
  if(!packMigrationFailed || document.getElementById("eMigrateWarn")) return;
  const d=document.createElement("div");
  d.id="eMigrateWarn";
  d.style.cssText="position:fixed;left:0;right:0;top:0;z-index:2147483646;background:#78350f;"
    +"color:#fff;font:14px/1.5 system-ui,Segoe UI,sans-serif;padding:14px 18px;"
    +"box-shadow:0 2px 14px rgba(0,0,0,.4)";
  d.innerHTML='<b>Your saved card arrangement could not be read.</b> This version renamed how that '
    +'arrangement is stored, and the existing copy could not be converted. Etiuda is running '
    +'normally and your catalog is untouched - only the personal ordering, hidden cards and '
    +'favourites in this browser are affected.'
    +'<div style="margin-top:10px">'
    +'<button id="eMigrateReset" style="font:600 13px system-ui;padding:7px 14px;border:0;'
    +'border-radius:7px;background:#fff;color:#78350f">Reset personal data</button>'
    +'<button id="eMigrateHide" style="font:600 13px system-ui;padding:7px 14px;border:0;'
    +'border-radius:7px;background:rgba(255,255,255,.18);color:#fff;margin-left:10px">Dismiss</button>'
    +'</div>';
  (document.body||document.documentElement).appendChild(d);
  const r=document.getElementById("eMigrateReset");
  if(r) r.onclick=()=>{
    try{ lsKeys().filter(k=>k.indexOf("pb")===0).forEach(k=>lsDel(k)); }catch(e){}
    try{ ssDel("pbSessionTabs"); }catch(e){}
    location.replace(location.href.split("#")[0]);
  };
  const h=document.getElementById("eMigrateHide");
  if(h) h.onclick=()=>d.remove();
}
/* ONE SHOT, and only where it cannot be wrong: this namespace holds nothing, and exactly ONE
   other pack is stranded in the storage area file:// pages share. Two would mean a machine
   with two catalogs on it, and guessing between them is worse than leaving both alone. Runs
   only for a build that HAS an embedded catalog - the bare engine's pack belongs to whatever
   catalog was imported into it, which is not this one. */
/* WHAT MAY CROSS A CATALOG BOUNDARY: everything addressed by CONTENT. A card id is derived
   from the card, so it either matches over there or is filtered out harmlessly - but a base
   intent is addressed by its INDEX, so carrying these hands another catalog's wording, stars
   and hiding to whatever intents happen to sit at those numbers. IntentOrder is out of
   NS_CARRY for the same reason, and baseCards would replace the card set wholesale. */
const NS_CARRY=["Pack","CatOrder","Cols","Floor"];
const NS_DROP_POSITIONAL=["intentOverrides","intentHidden","intentFavourites","intentRemoved","baseCards"];
function packWithoutPositional(raw){
  try{
    const p=JSON.parse(raw);
    if(!p||typeof p!=="object") return null;
    NS_DROP_POSITIONAL.forEach(k=>{ delete p[k]; });
    return JSON.stringify(p);
  }catch(e){ return null; }   // unparseable: loadPack could not have used it either
}
function adoptStrandedPack(){
  try{
    if(E_NS==="pb") return false;
    if(nsGet("Pack")) return false;
    const mine=nsKey("Pack");
    const found=lsKeys().filter(k=>k!==mine && /^pb[0-9a-z]*~Pack$/.test(k));
    if(found.length!==1) return false;
    const old=found[0].slice(0,-"Pack".length);
    let moved=0;
    NS_CARRY.forEach(n=>{
      let v=lsGet(old+n);
      if(v==null) return;
      if(n==="Pack"){ v=packWithoutPositional(v); if(v==null) return; }
      lsSet(nsKey(n),v); moved++;
    });
    // Deferred: the toast host does not exist this early in the boot.
    if(moved) setTimeout(()=>{ try{ toast(t("Restored your cards and stars from an earlier build.")); }catch(e){} },1400);
    return moved>0;
  }catch(e){ return false; }
}
function loadPack(){
  let p=null;
  adoptStrandedPack();
  try{ const raw=nsGet("Pack"); if(raw) p=JSON.parse(raw); }catch(e){}
  /* If the rename cannot be applied to what is stored, say so rather than starting quietly with
     an empty ordering - the user would see their arrangement gone with no explanation. The boot
     banner offers Reset, which is the honest remedy. */
  try{ migratePackKeys(p); }
  catch(e){ packMigrationFailed=true; try{ console.error("pack migration failed",e); }catch(_){} }
  pack=Object.assign(emptyPack(), p||{});
  if(!Array.isArray(pack.hidden)) pack.hidden=[];
  if(!pack.overrides||typeof pack.overrides!=="object") pack.overrides={};
  if(!Array.isArray(pack.custom)) pack.custom=[];
  if(!pack.catLabels||typeof pack.catLabels!=="object") pack.catLabels={};
  /* The user's Polish name for a category, beside their English one. Absent in every pack
     written before this, which is why it is normalised here rather than assumed. */
  if(!pack.catLabelsPl||typeof pack.catLabelsPl!=="object") pack.catLabelsPl={};
  /* Absent in older packs; both fall back to a name guess, so an upgrade shows icons at
     once and stores nothing until the user actually picks one. */
  if(!pack.catIcons||typeof pack.catIcons!=="object") pack.catIcons={};
  if(!pack.catColors||typeof pack.catColors!=="object") pack.catColors={};
  if(!pack.customCats||typeof pack.customCats!=="object") pack.customCats={};
  if(!Array.isArray(pack.intentHidden)) pack.intentHidden=[];
  if(!pack.intentOverrides||typeof pack.intentOverrides!=="object") pack.intentOverrides={};
  if(!Array.isArray(pack.intentCustom)) pack.intentCustom=[];
  if(!Array.isArray(pack.favourites)) pack.favourites=[];
  if(!Array.isArray(pack.intentFavourites)) pack.intentFavourites=[];
  if(!Array.isArray(pack.cardOrder)) pack.cardOrder=[];
  if(!pack.useCounts||typeof pack.useCounts!=="object"||Array.isArray(pack.useCounts)) pack.useCounts={};
  if(pack.facts!=null && typeof pack.facts!=="string") pack.facts=null;
  // null = follow the catalog; an array = the user has edited the list, [] included
  if(pack.who!=null){ if(!Array.isArray(pack.who)) pack.who=null; else pack.who=normWhoList(pack.who); }
  // Imported card catalog: null / non-array = use stock M
  if(pack.baseCards!=null && !Array.isArray(pack.baseCards)) pack.baseCards=null;
  if(Array.isArray(pack.baseCards)&&!pack.baseCards.length) pack.baseCards=null;
  migrateBpToCin();
}
// Boarding pass (bp) was merged into Check-in (cin). Remap saved packs so nothing
// still points at the removed category key.
function migrateBpToCin(){
  if(pack.catLabels && pack.catLabels.bp!=null){
    if(pack.catLabels.cin==null){
      pack.catLabels.cin = pack.catLabels.bp==="Boarding pass" ? "Check-in" : pack.catLabels.bp;
    }
    delete pack.catLabels.bp;
  }
  if(pack.customCats && pack.customCats.bp!=null){
    if(pack.customCats.cin==null) pack.customCats.cin = pack.customCats.bp;
    delete pack.customCats.bp;
  }
  (pack.custom||[]).forEach(m=>{ if(m && m.c==="bp") m.c="cin"; });
  Object.keys(pack.overrides||{}).forEach(id=>{
    const o=pack.overrides[id];
    if(o && o.c==="bp") o.c="cin";
  });
  Object.keys(pack.intentOverrides||{}).forEach(id=>{
    const o=pack.intentOverrides[id];
    if(o && o.cat==="bp") o.cat="cin";
    if(o && Array.isArray(o.cat)) o.cat=o.cat.map(k=>k==="bp"?"cin":k);
  });
  (pack.intentCustom||[]).forEach(c=>{
    if(!c) return;
    if(c.cat==="bp") c.cat="cin";
    if(Array.isArray(c.cat)) c.cat=c.cat.map(k=>k==="bp"?"cin":k);
  });
  // Drop orphan hide/override keys for the old built-in boarding-pass ids
  if(Array.isArray(pack.hidden)){
    pack.hidden=pack.hidden.map(id=>String(id).replace(/^b:bp:/,"b:cin:"));
  }
  if(Array.isArray(pack.favourites)){
    pack.favourites=pack.favourites.map(id=>String(id).replace(/^b:bp:/,"b:cin:"));
  }
  Object.keys(pack.overrides||{}).forEach(id=>{
    if(/^b:bp:/.test(id)){
      const neu=id.replace(/^b:bp:/,"b:cin:");
      if(!pack.overrides[neu]) pack.overrides[neu]=pack.overrides[id];
      delete pack.overrides[id];
    }
  });
}
// ---- favourites (★) ----------------------------------------------------------
function isFavourite(id){
  return !!(id && Array.isArray(pack.favourites) && pack.favourites.indexOf(id)>-1);
}
function toggleFavourite(id){
  if(!id) return;
  if(!Array.isArray(pack.favourites)) pack.favourites=[];
  const i=pack.favourites.indexOf(id);
  if(i>-1){
    pack.favourites.splice(i,1);
    toast("Removed from Favourites");
  } else {
    pack.favourites.push(id);
    /* Hidden and favourite are mutually exclusive - hiding strips the star, so starring has to
       lift the hide, or a greyed, bottom-sorted entry could sit under the Favourites landmark
       at the top of the list. */
    if(Array.isArray(pack.hidden)){
      const h=pack.hidden.indexOf(id);
      if(h>-1){
        pack.hidden.splice(h,1);
        /* AND clear the runtime flag, exactly as hideCard does - it is derived in rebuildCards,
           so lifting the hide only in storage leaves the card grey for the session with an
           eye that hides it afresh. Read from `cards`, never findCard(): that falls back to
           BASE_M, and a display flag on a catalog entry outlives the pack that owns it. */
        const m=(cards||[]).find(x=>x&&x.id===id);
        if(m) delete m._hidden;
      }
    }
    /* Does NOT touch cardOrder - the one record of where a card sits, and a move there is
       not undoable. The sort already lifts favourites, so the visible jump happens anyway,
       and unstarring puts the card back exactly where it was. */
    toast("Added to Favourites");
  }
  savePack();
  /* Prune and recount without a full rebuild: a star changes no pill - not a count, not a
     ring - so redrawing the bar could only cost (a pill mid-drag, a FLIP mid-flight). */
  syncFavouritesMeta();
  render();
}
// ---- intent favourites (★) ---------------------------------------------------
function isIntentFavourite(id){
  return !!(id && Array.isArray(pack.intentFavourites) && pack.intentFavourites.indexOf(id)>-1);
}
/** Keep intentOrder as [favourites…, regulars…] so rail + dropdown match; optional pin to top of favs.
 *  Hidden intents stay in this order (greyed in Manage) - filtered out only when drawing the rail/combo. */
/* Normaliser only: every live intent exactly once, invalid entries dropped, order
   otherwise untouched. Favourites are a DISPLAY band (intentRows) - intentOrder is purely
   the user's drag order, so unstarring is a true undo with nothing to remember. */
function syncIntentOrder(){
  if(!Array.isArray(intentOrder)) intentOrder=[];
  const seen={}, out=[];
  function place(i){
    i=+i;
    if(!Number.isInteger(i)||i<0||i>=SW_EN.length||seen[i]) return;
    seen[i]=1; out.push(i);
  }
  intentOrder.forEach(place);
  for(let i=0;i<SW_EN.length;i++) place(i);
  intentOrder=out;
  nsSet("IntentOrder",JSON.stringify(intentOrder));
}
/* Removal is the third state, below hidden: gone from the interface and from an export,
   recoverable by Reset because it lives in the pack and the catalog keeps the entry. A
   custom has nothing to recover from and is spliced for real - Reset wipes customs anyway,
   so "Reset brings it back" stays true either way. */
function removeCard(id){
  if(!id) return false;
  const m=findCard(id);
  const isCustom=!!(m&&m._custom);
  if(!ask(isCustom
    ? "Delete this custom card?\n\nIt disappears from Etiuda and from anything you export. The catalog has no version to restore."
    : "Delete this card?\n\nIt disappears from Etiuda and from anything you export. Reset restores it from the catalog.")) return false;
  if(isCustom) pack.custom=(pack.custom||[]).filter(x=>x&&x.id!==id);
  else {
    if(!Array.isArray(pack.removed)) pack.removed=[];
    if(pack.removed.indexOf(id)<0) pack.removed.push(id);
  }
  if(pack.overrides) delete pack.overrides[id];
  pack.hidden=(pack.hidden||[]).filter(x=>x!==id);
  pack.favourites=(pack.favourites||[]).filter(x=>x!==id);
  pack.cardOrder=(pack.cardOrder||[]).filter(x=>x!==id);
  cardOrderTouched();
  savePack(); rebuildCards();
  toast("Card deleted");
  return true;
}
/* No in-place title rename here - a card has a full editor, so there is one rename
   path. Its virtue, writing a partial override, lives on in overrideAgainstBase. */
/* CUSTOM INTENTS ARE ADDRESSED BY POSITION, so deleting one slides every later custom down
   a slot and every stored index above it points one intent to the right - a selection that
   silently becomes a DIFFERENT customer-facing clause, in this tab and in every other one.
   Only the custom branch needs this: a base intent is soft-removed and keeps its slot. */
function shiftIntentIdxAfterRemoval(at){
  const fix=a=>a.filter(i=>i!==at).map(i=>i>at?i-1:i);
  intentIdxs=fix(intentIdxs);
  intentOrder=fix(intentOrder);
  if(typeof tabs!=="undefined" && Array.isArray(tabs)){
    tabs.forEach(tb=>{ if(tb&&Array.isArray(tb.intentIdxs)) tb.intentIdxs=fix(tb.intentIdxs); });
    saveTabSession();
  }
  nsSet("IntentOrder",JSON.stringify(intentOrder));
}
function removeIntent(id){
  if(!id) return false;
  const idx=intentIdxFromId(id);
  const isCustom=idx>=0 && intentIsCustom(idx);
  if(!ask(isCustom
    ? "Delete this custom intent?"
    : "Delete this intent?\n\nIt disappears from Etiuda and from anything you export. Reset restores it from the catalog.")) return false;
  if(isCustom){
    pack.intentCustom=(pack.intentCustom||[]).filter(x=>x&&x.id!==id);
    shiftIntentIdxAfterRemoval(idx);
  }
  else {
    if(!Array.isArray(pack.intentRemoved)) pack.intentRemoved=[];
    if(pack.intentRemoved.indexOf(id)<0) pack.intentRemoved.push(id);
  }
  if(pack.intentOverrides) delete pack.intentOverrides[id];
  pack.intentHidden=(pack.intentHidden||[]).filter(x=>x!==id);
  pack.intentFavourites=(pack.intentFavourites||[]).filter(x=>x!==id);
  savePack();
  refreshAfterIntents();
  toast("Intent deleted");
  return true;
}
/** Hidden intents stay in the panel, greyed and at the bottom, and drop out of every search
 *  surface. Shared by the panel and Manage so the rule cannot drift between them. */
function setIntentHidden(id, hidden){
  if(!id) return;
  if(!Array.isArray(pack.intentHidden)) pack.intentHidden=[];
  const at=pack.intentHidden.indexOf(id);
  if(hidden){
    if(at<0) pack.intentHidden.push(id);
    // hidden and favourite are mutually exclusive, same rule as cards
    pack.intentFavourites=(pack.intentFavourites||[]).filter(x=>x!==id);
  } else if(at>-1){
    pack.intentHidden.splice(at,1);
  }
  savePack();
  /* refreshAfterIntents() unpacked so the expensive third can be skipped: render()
     rebuilds every card, and hiding an intent changes the list only through the SELECTION,
     which rebuildIntents() has just settled. Hiding now costs what starring costs. */
  const selBefore=intentIdxs.join(",");
  rebuildIntents();
  drawPills();
  // The rail's hide button flips around this call - the redraw must land inside it.
  drawIntentRail();
  if(intentIdxs.join(",")!==selBefore) render();
  toast(hidden ? "Intent hidden - greyed and moved to the bottom" : "Intent shown again");
}
/* Starring and unstarring touch nothing but pack.intentFavourites. Because favourites are a
   display band, an unstarred intent simply stops being lifted and reappears exactly where it
   sits in intentOrder - no stored slot, no restore step, nothing to keep in sync. */
function toggleIntentFavourite(id){
  if(!id) return;
  if(!Array.isArray(pack.intentFavourites)) pack.intentFavourites=[];
  const i=pack.intentFavourites.indexOf(id);
  if(i>-1){
    pack.intentFavourites.splice(i,1);
    toast("Intent removed from Favourites");
  } else {
    pack.intentFavourites.push(id);
    // starring lifts a hide, so the two states can never both be true
    pack.intentHidden=(pack.intentHidden||[]).filter(x=>x!==id);
    toast("Intent added to Favourites");
  }
  // Drop ids that no longer exist
  const alive=new Set();
  for(let j=0;j<SW_EN.length;j++){
    if(!isIntentHiddenIdx(j)) alive.add(intentIdAt(j));
  }
  pack.intentFavourites=pack.intentFavourites.filter(x=>alive.has(x));
  savePack();
  drawIntentRail();
}
function syncFavouritesMeta(){
  /* Departed ids take their stars and their tallies - but ONLY while a CATALOG is loaded.
     Pruning without one treats every card as deleted, so a single boot after an eject, a
     missing sibling or a failed import silently erases the lot. Custom cards do not count as
     a catalog: after an eject they are all that is left, and pruning against just them drops
     every star the catalog will bring back. */
  const alive=new Set((cards||[]).map(m=>m&&m.id).filter(Boolean));
  const hasCatalog=(cards||[]).some(m=>m&&!m._custom);
  if(hasCatalog) pack.favourites=(pack.favourites||[]).filter(id=>alive.has(id));
  if(hasCatalog && pack.useCounts && typeof pack.useCounts==="object"){
    Object.keys(pack.useCounts).forEach(id=>{ if(!alive.has(id)) delete pack.useCounts[id]; });
  }
  /* No virtual "fav" category: it bought one pill and cost an "...except fav" in thirty
     places - it was never a category. A star is a mark ON a card: it lifts the card where
     it lives. Stored packs may still carry "fav" for one boot - rebuildCards filters both
     lists against CATS. */
  recountMacros();
}
/* THE ONE PLACE THAT DECIDES WHERE A PUT-AWAY CARD MAY APPEAR: at the foot of its own
   category, and nowhere else. Not in All, because a card set aside does not belong among the
   ones that were not, and not in any search, because being offered is the thing you put it
   away to stop. So it wants a category chosen AND an empty box - together those mean "show me
   this shelf" rather than "find me something". Put-away is not a category of its own: the same
   ruling that took the Favourites pill away, and for the same reason. */
function cardInActiveCats(m,terms){
  if(!cats.length) return !(m&&m._hidden);
  if(m&&m._hidden && terms && terms.length) return false;
  return cats.some(k=>m.c===k);
}

// ---- at load: the footer's version, and the icons the prose slots hold ---------
try{ const _v=document.getElementById("eVer"); if(_v) _v.textContent=E_VERSION; }catch(e){}
/* Fills the footer's icon slots and, more importantly, #aboutInfo's - About is built by reading
   that element's innerHTML, so the icons have to be in it before anyone opens the dialog. */
try{ fillProseIcons(document); }catch(e){}

function applyBootCatalog(){
  /* One stored catalog is the source of truth, whether it came from Import or from accepting
     the sibling file. Falling back to the sibling covers the boot where it was just accepted
     but the copy could not be written (storage full), so the user still gets what they chose. */
  const stored=storedCatalog();
  if(stored){ eApplyCatalog(stored); return; }
  /* An embedded catalog outranks the sibling and loads without being asked - it is part
     of this file, already consented to. It sits BELOW a stored catalog, which is what
     makes "import something else" work and lets Reset fall back to the built-in content. */
  const emb=eEmbeddedCatalog();
  if(emb){ eApplyCatalog(emb); return; }
  const c=eCatalog();
  if(c && eCatalogAccepted(c)) eApplyCatalog(c);
}
applyBootCatalog();
// Snapshot built-in intents; runtime SW_* arrays are mutated in place so cards that
// hold sw:SW_EN keep working, and export stays a single source of truth.
const BASE_STORE={};
intentStoreKeys().forEach(k=>{ BASE_STORE[k]=SW_STORE[k].slice(); });
const BASE_N=BASE_STORE.en.length;
let intentOrder=[], intentOrderLoaded=false;
function intentIdAt(i){
  if(i<BASE_N) return "i:"+i;
  const c=(pack.intentCustom||[])[i-BASE_N];
  return c&&c.id ? c.id : "ui:"+i;
}
function isIntentHiddenId(id){ return (pack.intentHidden||[]).indexOf(id)>-1; }
/* The reverse of intentIdAt. Open-coded in two places before a third wanted it. */
function intentIdxOfId(id){
  for(let i=0;i<SW_EN.length;i++) if(intentIdAt(i)===String(id)) return i;
  return -1;
}
function isIntentHiddenIdx(i){ return isIntentHiddenId(intentIdAt(i)); }
function intentIsCustom(i){ return i>=BASE_N; }
function intentIsOverridden(i){
  return i<BASE_N && !!(pack.intentOverrides&&pack.intentOverrides["i:"+i]);
}
function rebuildIntents(){
  dropLabelStats();    // the labels are about to change; their word frequencies go with them
  for(let i=0;i<BASE_N;i++){
    const o=(pack.intentOverrides||{})["i:"+i]||{};
    INTENT_TEXT_FIELDS.forEach(f=>CONTENT_LANGS.forEach(l=>{
      const k=INTENT_FIELD_KEY[f][l], v=o[k];
      const kept=INTENT_BLANK_CLEARS[f] ? (v!=null) : (v!=null && v!=="");
      SW_STORE[k][i]= kept ? v : BASE_STORE[k][i];
    }));
  }
  intentStoreKeys().forEach(k=>{ SW_STORE[k].length=BASE_N; });
  (pack.intentCustom||[]).forEach(c=>{
    intentStoreKeys().forEach(k=>{ SW_STORE[k].push(c[k]||""); });
  });
  const n=SW_EN.length;
  if(!intentOrderLoaded){
    try{ intentOrder=JSON.parse(nsGet("IntentOrder")||"null")||[]; }catch(e){ intentOrder=[]; }
    intentOrderLoaded=true;
  }
  intentOrder=intentOrder.filter(i=>Number.isInteger(i)&&i>=0&&i<n);
  for(let i=0;i<n;i++) if(intentOrder.indexOf(i)<0) intentOrder.push(i);
  // Drop selection of hidden intents; keep full order for Manage list position
  intentIdxs=intentIdxs.filter(i=>intentOrder.indexOf(i)>-1 && !isIntentHiddenIdx(i));
  // Favourites first, then regulars (rail + dropdown share intentOrder)
  syncIntentOrder();
  syncIntentInput();
  drawIntentRail();
}
function refreshAfterIntents(){
  rebuildIntents();
  drawPills();
  render();
}
/* Bumped by the one hook every pack mutation already passes through, so a card's signature
   notices an edit, a star, a hide or a reorder without enumerating them. */
let ePackEpoch=0;
function savePack(){
  ePackEpoch++;
  /* Written under BOTH names - see migratePackKeys(): an older build opened against the
     same storage reads macroOrder/baseMacros and finds them. The duplicates are written
     here rather than kept on `pack`, so the live object carries the new vocabulary only. */
  let out=pack;
  try{
    out=Object.assign({},pack,{macroOrder:pack.cardOrder,baseMacros:pack.baseCards});
  }catch(e){ out=pack; }
  try{ nsSet("Pack",JSON.stringify(out)); }catch(e){ toast("Could not save, perhaps because the browser's storage is full."); }
  /* Every pack mutation lands here, so this is the one hook that cannot be forgotten. Wiring
     the watermark to each individual edit path instead would mean the next new one silently
     leaves a "sample" mark over content somebody has already started rewriting. */
  syncSampleMark();
}
function applyCatsToGlobal(){
  // Removed categories are skipped rather than deleted from BASE_CATS, so Reset brings the
  // catalog's own back. Custom ones are gone from pack.customCats outright - nothing to restore.
  const gone=new Set(pack.removedCats||[]);
  Object.keys(CATS).forEach(k=>{
    if(gone.has(k) || (!BASE_CATS[k] && !(pack.customCats&&pack.customCats[k]))) delete CATS[k];
  });
  /* Falling order of authority; every layer is something a PERSON wrote - the engine
     translates nothing. Polish: the user's Polish name, the catalog's, the user's English
     rename, the canonical. English: rename, then canonical. A name in the English box
     never appears as its own translation - only because nothing Polish was offered. */
  const pl=uiLang()==="pl";
  Object.keys(BASE_CATS).forEach(k=>{
    if(gone.has(k)) return;
    CATS[k]=(pl && (pack.catLabelsPl[k] || CAT_LABELS_PL[k]))
            || pack.catLabels[k] || BASE_CATS[k];
  });
  Object.keys(pack.customCats||{}).forEach(k=>{
    if(gone.has(k)) return;
    CATS[k]=(pl && pack.catLabelsPl[k]) || pack.catLabels[k] || pack.customCats[k] || k;
  });
  // Roles name categories, so they are re-resolved whenever the category set changes
  refreshCatRoles();
}
/** Delete an empty category. Empty-only everywhere, so no path silently destroys contents.
 *  No special-category guard: a category carries no roles, and the empty-only rule is what
 *  actually guards content. */
function removeCategory(k){
  if(!k) return false;
  if(cardCounts[k]){ toast("Move or delete the cards in this category first"); return false; }
  if(pack.customCats && pack.customCats[k]) delete pack.customCats[k];
  else {
    if(!Array.isArray(pack.removedCats)) pack.removedCats=[];
    if(pack.removedCats.indexOf(k)<0) pack.removedCats.push(k);
  }
  if(pack.catLabels) delete pack.catLabels[k];
  // ...and its Polish name, or re-creating the key would inherit a name nothing on screen explains
  if(pack.catLabelsPl) delete pack.catLabelsPl[k];
  // Drop its role too, or re-creating a category with the same key would inherit it
  if(pack.catRoles) delete pack.catRoles[k];
  // ...and its icon and colour, the other two override bags resetCategory knows, for the same reason
  if(pack.catIcons) delete pack.catIcons[k];
  if(pack.catColors) delete pack.catColors[k];
  catOrder=catOrder.filter(x=>x!==k);
  cats=cats.filter(x=>x!==k);
  nsSet("CatOrder",JSON.stringify(catOrder));
  savePack(); rebuildCards();
  toast("Category deleted");
  return true;
}
/* NAMING. A macro is one copyable segment - what a click sends; a card is the titled
   container holding one or more. All user-facing wording and the catalog format use those
   meanings. INTERNAL IDENTIFIERS STILL SAY THE OLD THING (cards[], cardOrder, findCard,
   rebuildCards) - numerous, invisible, and pack.cardOrder is a stored key. Reading
   `macro` in an identifier, think card; prefer the new words in anything a user reads. */
let cards=[];
/* Displayed counts are MACROS in the user's sense - what an agent chooses between.
   cardCounts keeps the container tally separately, and it is not cosmetic: it guards
   category deletion, since a card empty in this language contributes zero segments. */
let counts={}, cardCounts={};
/* cardLang, not lang: a pinned card splits into the same blocks whichever way the toggle
   points, so a tally that asked the toggle counted the wrong language's blocks for it. */
function macroBlockCount(m){ return m ? parts(m,cardLang(m)).length : 0; }
/* What ALL shows, so put-away is not in it. Each category's own count still carries them,
   because opening that category is where they appear. */
function totalMacroCount(){
  return (cards||[]).reduce((t,m)=>t+((m&&m._hidden)?0:macroBlockCount(m)),0);
}
/* Recomputed on language switch as well as on rebuild: segment counts are per-language, since a
   catalog may split a card into a different number of blocks in EN and PL. */
/* Per-category MATCH counts for the live query, null when nothing is typed: the pills
   already carry a number, so the number means matches while a query runs - the answer
   sits where you act on it. Same predicate as the list minus the category filter (the
   question is about categories you are NOT in); hidden stays out. Memoised on the query;
   recountMacros() drops the memo whenever `cards` is rebuilt. */
/* eSCatRank rides along: {cat: {tier, rank}} for the same query, built in the same pass because
   this loop has already filtered every card and the marginal cost is scoring the survivors.
   It is what lets the pill row lead with the category your query is ABOUT - see displayCatOrder. */
let eSCounts=null, eSCountsKey=null, eSCatRank=null;
function searchCounts(){
  const terms=cardSearchTerms();
  if(!terms.length){ eSCounts=null; eSCountsKey=null; eSCatRank=null; return null; }
  const key=terms.join(" ");
  if(key===eSCountsKey && eSCounts) return eSCounts;
  const out={__all:0};
  (cards||[]).forEach(m=>{
    if(!m || m._hidden) return;                 // a query never reaches one, so it never counts one
    if(!cardMatchesSearch(m,terms)) return;
    const n=macroBlockCount(m);
    out[m.c]=(out[m.c]||0)+n;
    out.__all+=n;
  });
  eSCounts=out; eSCountsKey=key;
  return out;
}
/* SEPARATE from searchCounts, its own memo key: the counts are cheap and per-keystroke,
   this scores every match and feeds the debounced ORDER. DAMPED SUM (best full, second
   half, third a third): one excellent card beats a pile of mediocre ones, several good
   still outweigh one - 1/i is the middle of sum and max. */
let eSCatRankKey=null;
function searchCatRank(){
  const terms=cardSearchTerms();
  if(!terms.length){ eSCatRank=null; eSCatRankKey=null; return null; }
  const key=terms.join(" ");
  if(key===eSCatRankKey && eSCatRank) return eSCatRank;
  const per={};
  const aterms=intentAffinityGroups();
  (cards||[]).forEach(m=>{
    if(!m || m._hidden) return;
    if(!cardMatchesSearch(m,terms)) return;
    const s=cardSearchScore(m,terms,aterms);
    const p=per[m.c] || (per[m.c]={tier:9, scores:[]});
    if(s.tier<p.tier) p.tier=s.tier;
    p.scores.push(s.score);
  });
  const rank={};
  Object.keys(per).forEach(k=>{
    const s=per[k].scores.sort((a,b)=>b-a);
    let v=0;
    for(let i=0;i<s.length;i++) v+=s[i]/(i+1);
    rank[k]={tier:per[k].tier, rank:v};
  });
  eSCatRank=rank; eSCatRankKey=key;
  return rank;
}
/** Update the numbers already on screen without rebuilding the row - drawPills() replaces every
 *  node, which would restart the regroup FLIP and drop drag state on every keystroke. */
/* THE PILL ROW CHANGES AS ONE THING: numbers, dimming and order land together on the
   settle - two truths about one query must not arrive at different moments. Between
   keystrokes it holds the last complete statement; the card list lands on the same
   settle, the answer arriving beside its summary. */
function syncPillCounts(){
  if(!pills) return;
  schedulePillOrder();
}
/** The numbers and the dimmed state, written in place. Used when nothing has to move - drawPills
 *  writes both itself when the row is rebuilt, so a reorder never needs this as well.
 *  A count changing digits changes the pill's WIDTH, and a snap there reads as a glitch the
 *  row's own FLIP never allows - so widths tween. Reads batched before writes: interleaved,
 *  every pill costs a forced layout. */
function writePillCounts(){
  if(!pills) return;
  const sc=searchCounts();
  const els=Array.prototype.slice.call(pills.querySelectorAll(".pill[data-k]"));
  const w0=els.map(el=>el.getBoundingClientRect().width);
  els.forEach(el=>{
    const k=el.dataset.k, b=el.querySelector("b");
    if(!b) return;
    const n = sc ? (k==="" ? (sc.__all||0) : (sc[k]||0))
                 : (k==="" ? totalMacroCount() : (counts[k]||0));
    b.textContent=String(n);
    el.classList.toggle("pill-nohit", !!sc && !n && k!=="");
  });
  tweenPillWidths(els, w0);
}
/* FLIP for the horizontal axis: start at the old width, force one layout, release to the
   new. Inline width is the animation and must leave when it ends, or the pill stops
   following its own content. The 1.5px floor is for fractional DPRs, where rounding makes
   every pill "change" on every pass. HEIGHT IS THE INVARIANT: frozen start widths in the
   new order can flip a row break, doubling the bar for the tween's length - so if applying
   them moves the bar's height at all, the whole width tween rolls back and only snaps. */
function tweenPillWidths(els, w0){
  const grew=[];
  /* scrollHeight, never offsetHeight: the auto-hidden bar wears max-height plus
     overflow:hidden, which clamps offsetHeight to two lines on BOTH reads - the guard went
     blind exactly where the clip put the rewrap out of sight, and the tween played it. */
  const hNat=pills.scrollHeight;
  els.forEach((el,i)=>{
    const w1=el.getBoundingClientRect().width;
    if(Math.abs(w1-w0[i])<1.5) return;
    el.style.transition="none";
    el.style.width=w0[i]+"px";
    grew.push({el, w:w1});
  });
  if(!grew.length) return;
  void pills.offsetHeight;
  if(pills.scrollHeight!==hNat){
    grew.forEach(g=>{ g.el.style.transition=""; g.el.style.width=""; });
    return;
  }
  /* Attached two frames on, once the render this rides on has painted: width is a
     main-thread animation and loses its opening to that paint - see animateTabInsert. */
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    grew.forEach(g=>{
      g.el.style.transition="width .18s "+E_EASE;
      g.el.style.width=g.w+"px";
      clearTimeout(g.el._eWT);
      g.el._eWT=setTimeout(()=>{ g.el.style.transition=""; g.el.style.width=""; },220);
    });
  }));
}
/* Counts live, ORDER settles at 400ms: live ordering rebuilt the bar per character
   (73-337ms) under the typing hand. 400 clears a deliberate pace's inter-key gap and the
   180ms FLIP, so a settle cannot begin while the last one animates. Non-typing paths
   arrive as a single call and settle once. */
let ePillOrderT=0;
function schedulePillOrder(){
  clearTimeout(ePillOrderT);
  ePillOrderT=setTimeout(syncPillOrder,400);
}
/** Settle NOW. Entering or leaving macro search is a deliberate act with nothing following it,
 *  so the row should answer immediately rather than sit 400ms behind a decision already made. */
function flushPillState(){
  clearTimeout(ePillOrderT);
  syncPillOrder();
}
/* THE SETTLE: everything the row says about the query lands here - order moved = full
   drawPills rebuild (numbers and dimming ride along); order unchanged = numbers written
   in place. Never a half-updated row. The rebuild is gated on the order actually
   differing, compared as a joined string - typing moves counts every keystroke and order
   rarely. Never mid-drag: a rebuild is the one thing a drag visibly breaks. */
function syncPillOrder(){
  if(!pills || (typeof dragState!=="undefined" && dragState)) return;
  const want=displayCatOrder(intentCats()).filter(k=>CATS[k]);
  const have=listPillKeys().filter(Boolean);
  // Nothing drawn yet (a boot's first render): the ordinary drawPills is about to do this anyway.
  if(!have || !have.length || want.join(" ")===have.join(" ")){ writePillCounts(); return; }
  const before=capturePills();
  drawPills();
  flipPills(before);
}
function recountMacros(){
  eSCountsKey=null; eSCatRank=null; eSCatRankKey=null;   // cards rebuilding; the memos are stale
  dropCatalogVocab();                     // and so are the vocabulary and its corrections
  dropIntentKeywords();                   // and the rare-keyword sets built from those cards
  counts={}; cardCounts={};
  (cards||[]).forEach(m=>{
    if(!m) return;
    /* Both count what is put away. cardCounts answers whether a category can be deleted,
       which is a question about the DATA; counts is what the pill shows, and opening that
       category is exactly where a put-away card appears. Only All leaves them out. */
    cardCounts[m.c]=(cardCounts[m.c]||0)+1;
    counts[m.c]=(counts[m.c]||0)+macroBlockCount(m);
  });
}
function rebuildCards(){
  applyCatsToGlobal();
  rebuildBaseCards();
  rebuildIntents();
  /* Hidden and removed are different states: HIDDEN stays listed - greyed, bottom, out of
     search, never ringed - visibly existing, which is what makes hiding reversible in
     practice; favourite status survives. REMOVED never enters `cards`: gone from the
     interface and from exports, back on Reset because the catalog still has it. */
  const hidden=new Set(pack.hidden||[]);
  const removed=new Set(pack.removed||[]);
  const ov=pack.overrides||{};
  cards=[];
  BASE_M.forEach(base=>{
    if(removed.has(base.id)) return;
    const o=ov[base.id];
    const m=o ? Object.assign({},base,o,{id:base.id,_base:1,_overridden:1})
              : Object.assign({},base);
    if(hidden.has(base.id)) m._hidden=1;
    cards.push(m);
  });
  (pack.custom||[]).forEach(m=>{
    if(!m||!m.id||removed.has(m.id)) return;
    const c=Object.assign({},m,{_custom:1});
    if(hidden.has(m.id)) c._hidden=1;
    cards.push(c);
  });
  syncFavouritesMeta();          // drops dead favourites, then recounts
  /* Every category that exists gets a pill, empty or not - requiring counts[k] made
     Manage list categories the header silently omitted. A 0 badge is honest and gives the
     first card of that kind somewhere to drop. */
  /* Migration off the retired "fav" pseudo-category: stored orders and filters carrying
     it drop it here on the first boot after the upgrade. */
  catOrder=catOrder.filter(k=>CATS[k]);
  Object.keys(CATS).forEach(k=>{
    if(catOrder.indexOf(k)<0) catOrder.push(k);
  });
  cats=cats.filter(k=>CATS[k]);
  drawPills();
  render();
}
function uid(prefix){
  return prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
}
function slugCat(name){
  const s=String(name||"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,28);
  return "uc_"+(s||"custom");
}
function findCard(id){
  return cards.find(m=>m.id===id)||BASE_M.find(m=>m.id===id)
    ||(pack.custom||[]).find(m=>m.id===id)||null;
}
function baseCard(id){ return BASE_M.find(m=>m.id===id)||null; }

// Card ↔ intent links. Built-ins store base indices (0..BASE_N-1); customs store
// stable ids ("i:4", "ui:…"). Matching always goes through intentIdAt().
function normalizeCardIntents(m){
  return (m&&m.intents?m.intents:[]).map(x=>{
    /* Resolve through intentIdAt, never hardcode "i:"+x: at or above BASE_N the intent is
       custom and its real id lives in pack.intentCustom - the literal made a dead link
       that silently did nothing. Below BASE_N the output is identical. Numeric links stay
       positional by nature; the editor writes string ids for exactly that reason. */
    if(typeof x==="number" && Number.isFinite(x)) return intentIdAt(x);
    return String(x);
  }).filter(Boolean);
}
/* THE definition of "this card belongs to this intent" - everything green derives from
   it. One function on purpose: two copies drifted the moment a third way of linking was
   added, and the pill and the cards inside it disagreed about the same intent. */
function cardLinksIntent(m,want){
  if(!m||m._hidden) return false;
  if(m.allIntents) return true;               // linked to every intent, card by card
  return normalizeCardIntents(m).indexOf(want)>-1;
}
function cardHitsSelectedIntent(m){
  if(!intentIdxs.length) return false;
  // A hidden entry is never ringed. It follows that it never sorts into a ring band either,
  // so hiding something genuinely gets it out of the way rather than only dimming it.
  return intentIdxs.some(i=>cardLinksIntent(m,intentIdAt(i)));
}
/* Blue: this card sits in a SUPPORTING category. ("Supporting" is the user-facing word;
   the stored key is `always`, kept for the format-1 contract - hence the identifiers.)
   Green wins: a card answering the question asked never also rings blue. */
function cardHitsAlwaysCat(m){
  return !!(intentIdxs.length && m && !m._hidden && isAlwaysCat(m.c) && !cardHitsSelectedIntent(m));
}
/* Lower rank sorts first: intentTop greens -> green+fav -> greens -> blue+fav -> blues
   -> rest. INTENT-TOP OUTRANKS A STAR inside the band: a star is a fact about the agent,
   intentTop is where this intent STARTS. The star still lifts within every band. NEVER
   key behaviour off catalog text - a rename must not move a card between bands. */
function intentHitRank(m){
  const hit=cardHitsSelectedIntent(m);
  if(hit){
    /* Star before "top of group", matching the band - see cmpCardDisplay. A filtered view has
       no band, so this is the same ruling reaching the same cards by the other path. */
    if(isFavourite(m&&m.id)) return 0;
    if(m&&m.intentTop) return 1;
    return 2;
  }
  if(cardHitsAlwaysCat(m)){
    if(isFavourite(m&&m.id)) return 3;
    return 4;
  }
  /* A star lifts within EVERY band - one undifferentiated rest-rank made starring an
     unlinked card move nothing while the star lit up. */
  if(isFavourite(m&&m.id)) return 5;
  return 6;
}
// Sort / drag band when an intent is on (numeric). When no intent, use displayBandKey.
function relevanceRank(m){
  if(intentIdxs.length) return intentHitRank(m);
  return isFavourite(m&&m.id) ? 0 : 1;
}
/* ---- What the list is showing: three questions render and the column layout both ask,
   in one place so they cannot drift. "All" = no pill active: the band and the favourites
   block are All-only - both LIFT cards out of their categories, and lifting inside a view
   that is already one category fragments it for nothing. */
function listIsAll(){ return !((cats||[]).length); }
/** The intent band: linked cards raised into a section of their own above the categories. */
function intentBandOn(){
  return !!(intentIdxs.length) && listIsAll() && !cardSearchTerms().length;
}
/** The favourites block, which follows the same rule and yields to the band. */
function favBlockOn(){
  return !intentIdxs.length && listIsAll() && !cardSearchTerms().length;
}
/** Is this card in the band right now? */
function inIntentBand(m){ return intentBandOn() && cardHitsSelectedIntent(m); }

/* Category order for GROUPING the list: with an intent, relevance order - list and bar
   agree about what the chat is about; without one, the drag order as always. Memoised per
   render: the comparator asks for this once per comparison. */
let eCatRel=null, eCatRelKey="";
function catRelIdx(c){
  if(!intentIdxs.length) return catSortIdx(c);
  const band=intentBandOn();
  const key=(band?"b|":"p|")+intentIdxs.join(",")+"|"+catOrder.length+"|"+Object.keys(CATS).length;
  if(eCatRelKey!==key || !eCatRel){
    eCatRel=new Map();
    /* WITH A BAND, A CATEGORY GETS NO CREDIT FOR BEING LINKED - the linked cards have LEFT
       it for the band, so ranking the remainder above the supporting groups ranks
       leftovers over the cards an agent needs in every chat. Dropping `specific` puts
       every remainder after every supporting group. The PILL BAR is deliberately
       unchanged - a pill says which categories the intent touches, still true; only the
       LIST regroups. */
    const hc=intentCats();
    displayCatOrder(band ? {specific:[], always:hc.always} : hc)
      .forEach((k,i)=>eCatRel.set(k,i));
    eCatRelKey=key;
  }
  const i=eCatRel.get(c||"");
  return i===undefined ? CAT_UNKNOWN : i;
}
function intentIdxFromId(id){
  id=String(id||"");
  if(id.indexOf("i:")===0){
    const n=+id.slice(2);
    return (Number.isInteger(n)&&n>=0&&n<BASE_N) ? n : -1;
  }
  const ix=(pack.intentCustom||[]).findIndex(x=>x&&x.id===id);
  return ix>=0 ? BASE_N+ix : -1;
}

loadPack();

// ---- agent identity ------------------------------------------------------------
// One field feeding two tokens: {AGENT} is the text verbatim, /{INIT} the lowercase initials.
// "John Smith" gives display "John Smith" and init "js"; "John S." gives "John S." and "js".
/* {AGENT} reproduces exactly what was typed: abbreviating the surname is one employer's
   policy, not a fact about support work, and a licensed engine must not bake it in.
   Whitespace still collapses - a double space is a typo, not a style. {INIT} is a
   different token doing a different job. */
function agentParts(raw){
  const s=String(raw||"").trim().replace(/\s+/g," ");
  if(!s) return {display:"",init:""};
  const w=s.split(" ").filter(Boolean);
  const first=w[0];
  const last=(w.length>1 ? w[w.length-1] : "").replace(/\.+$/,"");  // "G." -> "G" for the initial
  return {
    display: s,
    init: (first.charAt(0)+(last.charAt(0)||"")).toLowerCase()
  };
}
/* A FILL IS A BURST, NOT AN EVENT. {AGENT}, {PAX} and {ROLE} are substituted while the cards
   are built, so a keystroke in one of those boxes used to rebuild all of them - 40ms of
   Firefox per letter, and a pasted name arrived visibly behind the hand. The value is stored
   on the keystroke; only the card text waits for the pause. Nothing racy hides in the wait:
   a copy re-runs fill() from the source, so the clipboard never reads the screen. */
let eFillT=0;
function renderFillsSoon(){
  if(eFillT) clearTimeout(eFillT);
  eFillT=setTimeout(()=>{ eFillT=0; render(); },110);
}
// Starts empty, not with a name. A de-branded engine must not ship pre-filled with its
// author's identity, and the placeholder already says what the field is for.
agentEl.value = lsGet("pbAgent")!=null ? lsGet("pbAgent") : "";
function syncAgent(){
  lsSet("pbAgent",agentEl.value);
  const a=agentParts(agentEl.value);
  agentEl.title = a.display
    ? t("Customers see \"{NAME}\", and comments sign /{INIT}")
        .replace("{NAME}",a.display).replace("{INIT}",a.init)
    : t("The name customers see, exactly as you type it; comments sign with its initials");
  renderFillsSoon();
}
agentEl.oninput=syncAgent;

// ---- Comment actor ------------------------------------------------------------
// One list covering both booking comments and gift card comments.
const roleSel=$("#roleSel");
/* Suggestions only - the list never constrains what can be typed, which is what lets a catalog
   ship a short list without boxing anyone in (a group booking running past the last suggestion
   was the original reason, and it generalises). The list itself comes from whoOptions(). */
roleSel.value = "";
$("#theme").onclick=()=>{
  /* Flips whatever is on screen, which on a first click means flipping away from the system.
     Storing the result is what pins it: from here the OS no longer moves this page. Reset
     clears pbTheme with every other pb* key, so a wiped Etiuda follows the system again. */
  const cur=document.documentElement.dataset.theme||systemTheme();
  const nx=cur==="dark"?"light":"dark";
  document.documentElement.dataset.theme=nx; lsSet("pbTheme",nx);
  // Half a revolution per press, accumulating - see the #theme svg note in the stylesheet.
  const ic=document.querySelector("#theme svg");
  if(ic && !mgReduceMotion()){
    const turns=(+ic.dataset.eTurns||0)+1;
    ic.dataset.eTurns=turns;
    ic.style.transform="rotate("+(turns*180)+"deg)";
  }
};
function pillsWanted(){ return lsGet("pbPills")!=="0"; }
function pillsLocked(){ return lsGet("pbPillsLock")==="1"; }
function syncLayoutPrefs(){
  document.documentElement.classList.remove("e-pills-off");   // the head script's early call
  document.body.classList.toggle("pills-off", !pillsWanted());
  /* NO WARNING RING for a hidden panel or bar: --warn flags something WRONG, and a chosen
     preference is not. --warn/--warn-bg are read by nothing - kept, like the retired --e-c5:
     a warning colour will be wanted again, and it must mean a real fault (a catalog that
     failed to parse), never a preference set on purpose. */
  syncSettingsMenu();
}
let pillsBoxTimer=null;
/* THE SLOT'S HEIGHT IS THE ANIMATION - it sits in the sticky header, so gliding it
   carries the whole page. Measured, not declared: the ends are display:none and auto,
   which CSS cannot interpolate. Same FLIP discipline as flipPills, forced reflow included.
   `mutate` must land FINAL geometry synchronously - an intermediate layout glides to the
   wrong height. The transition is NOT in the sheet: a standing one would animate every
   step of a resize drag. */
function animatePillsBox(mutate,ms){
  ms=ms||180;
  const slot=pillsSlot();
  if(!slot || mgReduceMotion()){
    // No ride, but the header still changed height and the fixed panel is pinned to it.
    mutate();
    syncRailGeometry();
    return;
  }
  const box=()=>{
    const cs=getComputedStyle(slot);
    // A hidden slot is not a short slot: it reserves nothing, margin included.
    return cs.display==="none" ? {h:0,m:0}
      : {h:slot.getBoundingClientRect().height, m:parseFloat(cs.marginTop)||0};
  };
  const from=box();
  mutate();
  // Any override from a toggle still in flight has to go before the natural height can be read.
  slot.style.transition="none"; slot.style.height=""; slot.style.marginTop="";
  const to=box();
  const done=()=>{
    slot.classList.remove("pills-anim");
    slot.style.transition=""; slot.style.height=""; slot.style.marginTop="";
    syncRailGeometry();
  };
  clearTimeout(pillsBoxTimer);
  if(Math.abs(to.h-from.h)<1 && Math.abs(to.m-from.m)<1){ done(); return; }
  slot.classList.add("pills-anim");
  slot.style.height=from.h+"px"; slot.style.marginTop=from.m+"px";
  void slot.offsetHeight;                    // commit the start - see the note in flipPills
  slot.style.transition="height "+ms+"ms "+E_EASE+",margin-top "+ms+"ms "+E_EASE;
  slot.style.height=to.h+"px"; slot.style.marginTop=to.m+"px";
  /* The panel is fixed and positioned from the header's bottom edge - precisely the thing
     that is moving - so it is told every frame of the ride, not once. rAF stalls in a
     background tab, which is why the timer below has the last word either way. */
  const until=performance.now()+ms+20;
  const follow=()=>{
    syncRailGeometry();
    if(performance.now()<until) requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);
  pillsBoxTimer=setTimeout(done,ms+20);
}
function togglePills(){
  animatePillsBox(()=>{
    lsSet("pbPills", pillsWanted() ? "0" : "1");
    syncLayoutPrefs();
    if(pillsWanted()) document.body.classList.remove("pills-peek");
    // Both ways: showing derives the clip, hiding clears it - see syncPillsCollapse().
    syncPillsCollapse();
  });
  toast(pillsWanted()?"Categories shown":"Categories hidden");
}
function togglePillsLock(){
  animatePillsBox(()=>{
    lsSet("pbPillsLock", pillsLocked() ? "0" : "1");
    // Locking implies the category bar should be preferred on.
    if(pillsLocked() && !pillsWanted()) lsSet("pbPills","1");
    syncLayoutPrefs();
    syncPillsCollapse();
  });
  toast(pillsLocked() ? "Categories stay fully expanded" : "Categories may auto-collapse");
}
// Ctrl/Cmd: pills peek/expand + intent rail overlay when not docked.
function pillsSlot(){ return $("#pillsSlot"); }
let railEdgeHover=false, modifierHeld=false;
/* See applyRailPeek: the window a pointer has to cross the cards and land on the panel. */
const RAIL_REACH_MS=620;
let railSearchPeek=false, railReachT=0;
/* Touch's own door to the overlay: sticky, tap-to-open, tap-outside-to-close. Hover
   cannot be the model on a touch screen - see bindRailHit. */
let railTouchOpen=false;
function applyRailPeek(){
  if(railDocked()){
    document.body.classList.remove("rail-peek");
    return;
  }
  /* Suppressed refuses HOVER and nothing else: hover is ambient and fires when the cursor
     drifts - exactly what hiding is meant to stop; Ctrl is the panel's own multi-select
     gesture, the user reaching for it, and a modifier cannot be held by accident. */
  const suppressed = railSuppressed();
  /* Typing is a reach for the panel as much as the edge is, and just as deliberate as Ctrl,
     so it ignores suppression too. Derived from the mark rather than latched: the peek lasts
     exactly as long as the mark sits on an intent, which is also why it arrives with the
     resort - markSurface withholds that mark until the query has settled. */
  const searching = !!railQuery()
    && markSurface()==="intent";
  const show=!!(modifierHeld || railTouchOpen || searching || (railEdgeHover && !suppressed));
  /* THE REACH. A search peek ends when the mark leaves the intents, and hovering a macro moves
     the mark - so crossing the cards towards the panel would shut it before the pointer could
     arrive. It therefore stands RAIL_REACH_MS after the mark leaves: land on it and hover holds
     it, stay among the cards and it goes. The grace is the search peek's alone - a released
     Ctrl is a decision, and a decision is not a journey. */
  if(show){ clearTimeout(railReachT); railReachT=0; railSearchPeek=searching; }
  else if(railSearchPeek && document.body.classList.contains("rail-peek")){
    if(!railReachT) railReachT=setTimeout(()=>{
      railReachT=0; railSearchPeek=false; applyRailPeek();
    },RAIL_REACH_MS);
    return;
  }else{ clearTimeout(railReachT); railReachT=0; }
  document.body.classList.toggle("rail-peek", show);
  // Re-measure under the (possibly multi-row) header before painting the overlay
  if(show) scheduleRailGeometry();
  else if(show) syncRailGeometry();
}
function updateModifierPeek(e){
  const held=!!(e&&(e.ctrlKey||e.metaKey));
  modifierHeld=held;
  /* Shift rides along on the same event. It reveals the hide button on a hovered star and
     nothing else - it does NOT expand the category bar, which is Ctrl's other job here. */
  document.body.classList.toggle("shift-held", !!(e&&e.shiftKey));
  /* A body class rather than a redraw: the panel rows swap their star for a hide button while
     Ctrl is down, and doing that in CSS keeps it instant and keeps drawIntentRail out of the
     keyboard path entirely. */
  document.body.classList.toggle("ctrl-held", held);
  /* Ctrl expands the bar with no pointer movement at all, so nothing would re-evaluate the order:
     a cursor resting on the panel would sit there while the bar opened over it. Re-ask with the
     last known position. */
  requestAnimationFrame(applyOverlapOrder);
  const slot=pillsSlot();
  // --- category pills ---
  if(!pillsWanted()){
    document.body.classList.remove("pills-lines-expand");
    if(slot) slot.classList.remove("pills-expand");
    /* Only when it actually flips: this runs on EVERY keydown and keyup, and re-asserting
       the class would restart the glide on each keystroke of a held chord. .12s, the
       dropdown tier - a peek answers a held key; .18s is for deliberate toggles. */
    if(held!==document.body.classList.contains("pills-peek")){
      animatePillsBox(()=>document.body.classList.toggle("pills-peek", held),120);
    }
  } else {
    document.body.classList.remove("pills-peek");
    document.body.classList.toggle("pills-lines-expand", held);
    if(slot) slot.classList.toggle("pills-expand", held);
  }
  // --- intent rail overlay (not when docked in the grid) ---
  applyRailPeek();
  // Ctrl also expands pills: re-pin the rail under the full expanded block
  scheduleRailGeometry();
}
/* Arrowing to a category you cannot see: opens the clipped bar while you keep arrowing,
   then lets it retract. It cannot reuse `pills-expand` - updateModifierPeek re-asserts
   that class from modifier state on every keydown/keyup, so the next keystroke would
   strip it; a separate class sharing the same CSS keeps two mechanisms off one flag.
   Only when it would help: the bar must be clipped (never shoved at a user who hid it on
   purpose) and the destination genuinely below the fold. Once open, later presses skip
   the test and re-arm the timer - by then everything IS visible and the test would let
   it shut mid-cycle. */
let pillNavPeekTimer=0;
const PILL_PEEK_MS=1700;
function endPillNavPeek(){
  const slot=pillsSlot();
  clearTimeout(pillNavPeekTimer); pillNavPeekTimer=0;
  if(slot && slot.classList.contains("pills-navpeek")){
    slot.classList.remove("pills-navpeek");
    scheduleRailGeometry();
  }
}
function peekPillsForKey(key){
  const slot=pillsSlot();
  if(!slot || !slot.classList.contains("pills-overflow")) return;   // nothing is being clipped
  if(slot.classList.contains("pills-expand")) return;               // Ctrl already holds it open
  if(!slot.classList.contains("pills-navpeek")){
    const el=pills && pills.querySelector('.pill[data-k="'+cssEsc(key||"")+'"]');
    if(!el) return;
    // Below the clipped edge? Then it is the reason you cannot see where you just moved.
    if(el.getBoundingClientRect().bottom <= slot.getBoundingClientRect().bottom + 1) return;
    slot.classList.add("pills-navpeek");
    scheduleRailGeometry();
  }
  clearTimeout(pillNavPeekTimer);
  pillNavPeekTimer=setTimeout(endPillNavPeek, PILL_PEEK_MS);
}
function clearModifierPeek(){
  railEdgeHover=false;
  railTouchOpen=false;
  modifierHeld=false;
  document.body.classList.remove("pills-peek","pills-lines-expand","rail-peek","ctrl-held");
  const slot=pillsSlot();
  if(slot) slot.classList.remove("pills-expand");
  scheduleRailGeometry();
}
addEventListener("keydown",updateModifierPeek);
addEventListener("keyup",updateModifierPeek);
addEventListener("blur",clearModifierPeek);
window.addEventListener("blur",clearModifierPeek);
// Cap the category bar at two lines of layout space; extra rows overlay when expanded.
// Skipped when locked (⚙ → Lock categories).
function syncPillsCollapse(){
  const el=pills;
  const slot=pillsSlot();
  if(!el||!slot) return;
  document.documentElement.style.removeProperty("--e-pills-h");   // the bar is drawn: the head script's reservation is done
  const keepExpand=slot.classList.contains("pills-expand")||document.body.classList.contains("pills-lines-expand");
  /* CLEARED BEFORE ANY EARLY RETURN: pills-overflow left on a switched-off bar let Ctrl
     peek a bar wearing clipped-bar geometry - the slot reserved two lines, the pills
     flowed three. A bar that is not on screen clips nothing; say so, and the peek needs
     no overrides at all. */
  slot.classList.remove("pills-overflow","pills-expand");
  slot.style.removeProperty("--pills-2line");
  if(!pillsWanted()||document.body.classList.contains("pills-off")) return;
  // Locked: always full height in flow (no 2-line clip / overlay expand).
  if(pillsLocked()) return;
  const first=el.querySelector(".pill");
  if(!first) return;
  // Measure unconstrained height (overflow class removed → pills are in normal flow).
  void el.offsetHeight;
  const lineH=first.getBoundingClientRect().height;
  const styles=getComputedStyle(el);
  const gap=parseFloat(styles.rowGap||styles.gap)||6;
  const two=lineH*2+gap;
  const full=el.scrollHeight;
  /* The open bar is a popover; nothing here needs to know where it sits inside the
     header any more. */
  slot.style.removeProperty("--pills-full");
  if(full>two+1){
    slot.classList.add("pills-overflow");
    slot.style.setProperty("--pills-2line",two+"px");
    /* The open height must be a real length for the transition to run, and it can only be
       read with the open styles applied - padding and border are part of it. Measure with
       the transition suppressed, then hand the number to CSS. One forced layout, in a
       function already forcing one. */
    slot.classList.add("pills-measuring","pills-expand");
    const openH=el.getBoundingClientRect().height;
    slot.classList.remove("pills-expand");
    void el.offsetHeight;                    // land back on the closed height before animating
    slot.classList.remove("pills-measuring");
    slot.style.setProperty("--pills-full",openH+"px");
  }
  if(keepExpand) slot.classList.add("pills-expand");
}
function schedulePillsCollapse(){
  // Wait for rail-on / max-width layout to settle before measuring wrap height.
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    syncPillsCollapse();
    rememberPillsShape();
    scheduleRailGeometry();
  }));
}
// What the head script reserves on the next load: the slot's height at rest, per window width.
function rememberPillsShape(){
  const slot=pillsSlot();
  if(!slot||!pillsWanted()||document.body.classList.contains("pills-off")){ lsDel("pbHdrPills"); return; }
  lsSet("pbHdrPills", window.innerWidth+"x"+(Math.round(slot.getBoundingClientRect().height*10)/10));
}
/* No choreography - every way the panel comes or goes takes the same plain path: the
   layout lands frame-zero (cards move at once) and the panel fades in place. A departing
   panel keeps its last geometry (syncRailGeometry); an arriving one is held by rail-ready
   until its geometry is real (syncRailLayout). */
function toggleRail(){
  lsSet("pbRail", railWanted() ? "0" : "1");
  // Hiding the panel does not clear the pin preference (restored when shown again).
  syncRailLayout();
  drawIntentRail();
  render();
  syncLayoutPrefs();
  schedulePillsCollapse();
  toast(railWanted() ? "Intent panel shown" : "Intent panel hidden");
}
function toggleRailLock(){
  lsSet("pbRailLock", railLocked() ? "0" : "1");
  // Pinning implies the panel should be preferred on.
  if(railLocked() && !railWanted()) lsSet("pbRail","1");
  syncRailLayout();
  drawIntentRail();
  render();
  syncLayoutPrefs();
  schedulePillsCollapse();
  /* The hidden case needs the way back in the message itself: the control that undoes it lives in
     the panel, and the panel is what just went away. */
  toast(railLocked()
    ? (railWanted() ? "Intent panel locked - open, and fixed width"
                    : "Intent panel locked off - hold Ctrl to show it")
    : (railWanted() ? "Intent panel unlocked - may auto-hide, width draggable"
                    : "Intent panel unlocked - hover the left edge to peek"));
}
function syncRailPinBtn(){
  const btn=$("#railPinBtn");
  if(!btn) return;
  const on=railLocked();
  btn.classList.toggle("on", on);
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  /* THE PANEL STAYS AS IT IS - shown stays shown, hidden stays hidden, the width stays
     put. The title names whichever half is about to matter: locking a visible panel pins
     it open, locking a peeked one puts it away for good - and that case says where the
     way back is, since the button lives in the panel that just went. */
  const hidden = !railWanted();
  btn.title = t(on
    ? (hidden ? "Unlock - let the panel appear again when you hover the left edge"
              : "Unlock - allow auto-hide on narrow windows, and allow the width to be dragged")
    : (hidden ? "Lock - stop the panel appearing on hover (Ctrl still shows it)"
              : "Lock - keep the panel docked on narrow windows, and fix its width"));
  btn.setAttribute("aria-label", t(on ? "Unlock the intent panel" : "Lock the intent panel open and fix its width"));
  /* Redrawn rather than restyled: the icon IS the state. The markup ships the open cut so
     the first paint is right before this runs. */
  btn.innerHTML = on ? ICON_LOCK : ICON_LOCK_OPEN;
  syncRailResizeUI();
}
function syncSettingsMenu(){
  const pillsBtn=$("#menuPills");
  const railBtn=$("#menuRail");
  if(pillsBtn){
    pillsBtn.textContent = pillsWanted() ? t("Hide categories") : t("Show categories");
    // Avoid formatActionChord here during early boot (scReady may still be false).
    const hold=scReady?formatActionChord("expandPills"):"Hold Ctrl";
    pillsBtn.title = pillsWanted()
      ? (pillsLocked()
        ? t("Hide the category bar, which is locked fully expanded when shown")
        : t("Hide the category bar; {KEY} peeks while it is hidden").replace("{KEY}",hold))
      : t("Show the category bar under the header.");
  }
  if(railBtn){
    railBtn.textContent = railWanted() ? t("Hide intent panel") : t("Show intent panel");
    railBtn.title = t(railWanted()
      ? (railLocked()
        ? "Panel is locked open (always docked). Hide turns it off entirely."
        : "Prefer showing the intent panel when the window is wide. On narrow windows it auto-hides; hover the left edge or hold Ctrl to peek. Use the lock at the top of the panel, or Settings, to keep it open.")
      : "Intent panel off. Hold Ctrl to peek the intent list as an overlay.");
  }
  syncRailPinBtn();
}
function closeSettingsMenu(){
  const menu=$("#settingsMenu"), btn=$("#settingsBtn");
  if(menu) menu.hidden=true;
  if(btn){ btn.classList.remove("on"); btn.setAttribute("aria-expanded","false"); }
}
function openSettingsMenu(){
  const menu=$("#settingsMenu"), btn=$("#settingsBtn");
  if(!menu||!btn) return;
  closeFactsPanel();
  closeMoreMenu();
  syncSettingsMenu();
  menu.hidden=false;
  btn.classList.add("on");
  btn.setAttribute("aria-expanded","true");
}
/* ---- the >> chevron. Design note at #moreWrap in the markup. The one rule that
   matters: everything reads the LIVE computed state of the buttons themselves - no width
   appears in this code, so the ladder's rungs cannot drift from the chevron's idea of
   them; there is no second copy of the policy to go stale. */
function syncMoreBtn(){
  const wrapEl=$("#moreWrap"); if(!wrapEl) return;
  const facts=$("#factsBtn"), theme=$("#theme"), seg=$("#seg");
  const factsGone=!!facts && getComputedStyle(facts).display==="none";
  const themeGone=!!theme && getComputedStyle(theme).display==="none";
  const segGone=!!seg && getComputedStyle(seg).display==="none";
  const fRow=$("#moreFacts"), tRow=$("#moreTheme"), lRow=$("#moreLang");
  if(fRow) fRow.hidden=!factsGone;
  if(tRow) tRow.hidden=!themeGone;
  if(lRow){
    lRow.hidden=!segGone;
    /* The badge names the language you are IN - the folded seg shows the current language
       and switches on click, and one control must read the same behind whichever door it
       stands in. The TARGET goes in the title, where "what happens if I press" belongs. */
    const pl=(typeof lang!=="undefined" && lang==="pl");
    const badge=$("#moreLangBadge");
    if(badge) badge.textContent=pl?"PL":"EN";
    lRow.title=t(pl?"Polish cards - switch to English":"English cards - switch to Polish");
  }
  const any=factsGone||themeGone||segGone;
  /* Widening the window while the dropdown is open takes the reason for it away mid-look;
     the menu closes with the button rather than orphaning an open panel over nothing. */
  if(!any) closeMoreMenu();
  wrapEl.hidden=!any;
}
/* ---- the shed algorithm: the first row hides by MEASURING, not by width table. THE
   DECISION IS A PURE FUNCTION of row width, frozen naturals, tab count and the rail
   signal - it never reads its own output, so nothing oscillates. THE COVENANT: room for
   TABS_MIN_VISIBLE floor-width tabs before any chrome is asked to leave, cheapest first.
   Design note at the body.shed-* rules in the sheet. */
const TABS_MIN_VISIBLE=3;
/* Theme, then FACTS - the two chevron dwellers lead, because the chevron must never
   open on a single row: freed pixels with one lonely row behind the door is the same
   pointlessness wearing a different width. The fold follows; the whole seg is last. */
/* The wordmark is a rung priced by NEED on every device - not a media query, and NOT
   coupled to the digit fallback, which fires from tab count. Second-to-last: identity
   outlives function, yielding only to the seg's final retreat. It alone has a SECOND reason
   to go, deliberately not a rung and deliberately tab-count driven: the strip's own claim,
   which lives in applyTabWidths() because it must land in the same frame as the arrows. */
const SHED_ORDER=["shed-theme","shed-facts","shed-segfold","shed-wordmark","shed-seg"];
let eShedNat=null;   // natural widths - boot seeds them all; later passes refresh what is visible
function measureShedNaturals(){
  const w=el=>el?el.getBoundingClientRect().width:0;
  const seg=$("#seg"), segOn=$("#seg button.on")||$("#seg button");
  /* A reading is trusted only in the STATE the entry names - a folded seg measuring 43px
     "visible" once overwrote segFull's honest 86, each pass corrupting the next, and the
     header stripped itself bare. Validity, per entry, is the state check. */
  const segBoth=!!seg && w(seg)>0 && !!$("#seg button:not(.on)") &&
                getComputedStyle($("#seg button:not(.on)")).display!=="none";
  const m={
    theme:   w($("#theme")),
    segFull: segBoth ? w(seg) : 0,
    /* Gated like segFull above, and for the same reason: at the last rung the whole seg is
       display:none, so this measured 0 and the +2 smuggled a "valid" 2px past the merge,
       pricing the fold's return at 2 instead of ~40. */
    segFold: w(segOn)>0 ? w(segOn)+2 : 0,   // the fold keeps one button (+ borders)
    facts:   w($("#factsBtn")),
    chevron: w($("#settingsBtn")),       // same .btn.icbtn box; the chevron itself may be hidden
    wordmark: w($(".brand-long"))
  };
  /* Merge, never replace: 0 means "no valid reading this pass", not "zero pixels wide".
     Boot seeds every entry while everything is visible and unfolded; later passes refresh
     what is measurable in the right state (zoom resizes glyphs mid-session) and keep the
     last honest reading for the rest. */
  /* Whole pixels only - fractional naturals are the fuel of cross-engine flapping: two
     layouts can disagree by half a pixel, and a knife-edge fits() amplifies that into a
     per-frame decision flip. Ceiling is the conservative direction: overstating chrome
     sheds a hair early, and early is the invisible failure. */
  Object.keys(m).forEach(k=>{ m[k]=Math.ceil(m[k]); });
  if(!eShedNat){ eShedNat=m; return; }
  Object.keys(m).forEach(k=>{ if(m[k]>0) eShedNat[k]=m[k]; });
}

/* ---- shed choreography, the restrained layer. SURVIVORS GLIDE (FLIP; the strip rides
   as one box), LEAVERS FADE where they stand as position:fixed ghosts (the element is
   already display:none), ARRIVERS fade in, THE DOOR scales in. Two structural rules: the
   diff is scheduler ENTRY versus EXIT, never per-apply() - the algorithm probes candidate
   states inside one synchronous pass, so probes stay invisible and only the settled truth
   animates; and ghosts are fixed clones on <body>, transform/opacity only - they cannot
   resize anything the algorithm measures, and the ResizeObserver cannot hear them. */
/* The wordmark is MEASURED, so it may not transition for real - a width read mid-fade
   is input corruption; the cast animates a CLONE while the element goes display:none at
   frame one. The arrows are cast members for the same reason they share the wordmark's
   moment: a pop landing beside a fade is read as a second event. */
const SHED_CAST=["#theme","#factsBtn","#seg","#moreBtn",".brand-long","#tabsPrev","#tabsNext"];
function shedSnap(){
  const m={};
  SHED_CAST.concat(["#tabsWrap","#settingsWrap"]).forEach(sel=>{
    const el=$(sel); if(!el) return;
    const cs=getComputedStyle(el);
    m[sel]={ r:el.getBoundingClientRect(), vis:cs.display!=="none" && el.getBoundingClientRect().width>0 };
  });
  return m;
}
/* A CALLER HOLDING A SNAPSHOT SAYS SO, and applyTabWidths leaves the movement to it. Without
   this the wordmark moved twice on the paths that already choreograph (the header sync probes
   candidate states; the tab insert releases with its grow), and not at all on the paths that
   do not - the ResizeObserver re-fits the strip before the header sync has taken its before
   picture, so a window crossing the threshold snapped 58px in one frame. */
let shedHeld=0;
function shedAnimate(before){
  const go=shedStage(before);
  if(!go) return;
  void document.body.offsetWidth;   // the from-state is committed before any transition attaches
  go();
}
/* STAGED AND RELEASED APART, so a caller with an animation of its own can start the header in
   the SAME frame as it. The tab insert attaches its widths two frames late on purpose - a
   main-thread width animation loses its opening third otherwise - and a glide let go at the
   mutation ran 46ms ahead of the grow, which is long enough to read as the header moving
   first and the strip following. Staging still happens at the mutation: the from-state must
   be on screen before the row has been seen in its new shape. */
function shedStage(before){
  if(mgReduceMotion()) return null;
  const after=shedSnap();
  const EASE=E_EASE;
  const go=[];
  SHED_CAST.forEach(sel=>{
    const b=before[sel], a=after[sel], el=$(sel);
    if(!b||!a||!el) return;
    if(b.vis && !a.vis){
      const g=el.cloneNode(true);
      g.style.cssText="position:fixed;left:"+b.r.left+"px;top:"+b.r.top+"px;width:"+b.r.width
        +"px;height:"+b.r.height+"px;margin:0;z-index:200;pointer-events:none;opacity:1;"
        +"transition:opacity .16s ease";
      document.body.appendChild(g);
      go.push(()=>{ g.style.opacity="0"; setTimeout(()=>g.remove(), 200); });
    } else if(!b.vis && a.vis){
      el.style.transition="none";
      el.style.opacity="0";
      go.push(()=>{ el.style.transition="opacity .18s ease"; el.style.opacity="";
                    setTimeout(()=>{ el.style.transition=""; }, 220); });
    }
  });
  /* Survivors glide. */
  ["#tabsWrap","#seg","#settingsWrap","#moreBtn"].forEach(sel=>{
    const b=before[sel], a=after[sel], el=$(sel);
    if(!b||!a||!el||!b.vis||!a.vis) return;
    const dx=b.r.left-a.r.left;
    if(Math.abs(dx)<1) return;
    el.style.transition="none";
    el.style.transform="translateX("+dx+"px)";
    go.push(()=>{ el.style.transition="transform .2s "+EASE; el.style.transform="";
                  setTimeout(()=>{ el.style.transition=""; }, 240); });
  });
  /* The door opens with a small scale, layered over its arriver fade. */
  const bM=before["#moreBtn"], aM=after["#moreBtn"], elM=$("#moreBtn");
  if(bM&&aM&&elM&&!bM.vis&&aM.vis){
    elM.style.transition="none"; elM.style.transform="scale(.6)"; elM.style.opacity="0";
    go.push(()=>{ elM.style.transition="transform .18s "+EASE+",opacity .16s ease";
                  elM.style.transform=""; elM.style.opacity="";
                  setTimeout(()=>{ elM.style.transition=""; }, 220); });
  }
  return go.length ? (()=>{ for(let i=0;i<go.length;i++) go[i](); }) : null;
}
function syncHeaderShed(){
  const row=$(".row"), wrap=$("#tabsWrap"), bar=$("#tabsBar");
  if(!row||!wrap||!bar) return;
  /* THE ROW IS ASKED, NOT MODELLED: a summed chrome model ran 46px short of the real row
     and promised a covenant the layout could not honour. SHED while genuinely short
     (overflowing AND wrap below covenant); RETURN while the strip's measured room above
     the destination's covenant covers the control's frozen width plus 14px headroom.
     The strip is the row's one reservoir - the flexible AGENT field left for the second
     row, and took the second reservoir with it. */

  /* Each step applies its class and re-fits synchronously; the next iteration reads the
     settled result - monotone within a pass, bounded by the ladder, the two directions
     separated by the 14px band, so no width can satisfy both and oscillate. Frozen ceiled
     naturals price only the control that would RETURN - not on screen to measure - and
     ceiling errs toward staying in the chevron, the invisible failure. */
  if(!eShedNat || syncHeaderShed._refreshNat){ syncHeaderShed._refreshNat=false; measureShedNaturals(); }
  const N=eShedNat;
  /* The rail enters through row.clientWidth alone - no rail class is consulted: a second
     authority over the same buttons is what produced the divided-authority bugs. */
  /* THE COVENANT IS A LADDER, constants, blind to tab count (a second tab must not evict
     the theme button). Each sacrifice BUYS TOLERANCE - one covenant for every rung spaced
     the rungs only by the scraps each sacrifice freed. NEED in floor-tab units per k:
     3, 3, 2.75, 2, 2, 2 (5 equals 4: nothing left to shed, it only prices returns).
     Monotone non-increasing is the coherence requirement: a return lands 8px above its
     destination's OWN rung, so no state reached by a return can immediately re-shed. */
  /* The wordmark's rung is 2.0: it must leave clearly AFTER the rail undocks (~670px),
     not within eight pixels, or the two read as one event. Equal prices on adjacent rungs
     are safe - shedding one returns its width to the grant, so rungs may share a price but
     cannot fire together. NOT wired to the rail's own threshold: that moves with a
     draggable width, and coupling would hand the header a second authority. */
  const NEED=[TABS_MIN_VISIBLE,TABS_MIN_VISIBLE,2.75,2,2,2]
    .map(t=>Math.round(t*(TAB_FLOOR_W+3))+40+21);
  /* What returning one step would put back, by the step being LEFT (k -> k-1):
     1->0 theme; 2->1 facts; 3->2 the seg unfolds; 4->3 the wordmark; 5->4 the folded seg. */
  const returnCost=[N.theme, N.facts, N.segFull-N.segFold, N.wordmark, N.segFold];
  /* Overflow is the arrows' concern (updateTabOverflow) and no rung reads it. The one
     decision that does is the wordmark's, and it is taken there, not here. */
  /* The GRANT, not the wrap: the wrap is content-sized and lies in the roomy direction
     with few tabs - a 294px wrap "breached" a covenant the 500px grant met three times
     over. apply() re-fits before every read, so the grant is this candidate state's own. */
  const grant=()=>(typeof applyTabWidths!=="undefined" && applyTabWidths._grantW)||wrap.clientWidth;
  /* No decision before applyTabWidths publishes its first grant: the fallback wrap reads
     "desperately short" at any width, and the first pass would shed ALL chrome and burn
     the return epoch on garbage. drawTabs runs applyTabWidths then scheduleHeaderSync, so
     a deciding pass always follows with a real number. */
  if(typeof applyTabWidths==="undefined" || !applyTabWidths._grantW) return;
  /* Priced against the DESTINATION's rung: the strip's reservoir is whatever it holds above
     what the state being returned TO would insist on - a return from k=5 to k=4 only has to
     fund the folded seg against the two-tab rung, not the three-tab one. */
  const reclaimable=(target)=>Math.max(0, grant()-NEED[target]);
  let k=syncHeaderShed._k!=null?syncHeaderShed._k:0;
  const apply=()=>{
    SHED_ORDER.forEach((c,i)=>document.body.classList.toggle(c, i<k));
    applyTabWidths();   // settle the strip before re-reading
  };
  apply();   // make the DOM agree with _k before reading it (boot, or a stale class from elsewhere)
  /* THE CHEVRON NEVER OPENS ON A SINGLE ROW - a door is only worth a doorway when at
     least two things live behind it. The two dwellers hide as a PAIR (net ~+40px after the
     door's own cost) and k=1 is not a resting state, UNCONDITIONALLY: every exception
     tried meant two authorities hiding one button. The bump is upward - a step shed early
     is the invisible failure, a one-row chevron the visible one. */
  if(k===1){ k=2; apply(); }
  /* WIDTH ONLY - no over() term: the ladder is blind to tab count, so a new tab cannot
     evict a rung at an unchanged width. Short = grant below NEED[k]; return-eligible = above
     NEED[k]+8. One axis, one deadband per rung; a rung hides at the same width whether the
     strip holds one tab or twelve. Both closures read k live. The wordmark is the exception
     and pays for it in applyTabWidths, beside the arrows. */
  const shortNow=()=>grant()<NEED[k];
  if(shortNow()){
    while(k<SHED_ORDER.length && shortNow()){ k++; apply(); }
    if(k===1){ k=2; apply(); }   // a shed resting on the one-row rung completes the pair
  } else {
    /* RETURNS HAPPEN AT MOST ONCE PER INPUT EPOCH - the whole oscillation proof: any
       disagreement between two controllers cycles if the loser may retry, so the RETRY is
       what dies. An attempt runs only when the coin (quantized innerWidth, rail signal,
       storm/settled flag) differs from the last attempt's, and the coin is consumed by
       the ATTEMPT, not the outcome. Shedding stays immediate and un-gated - the covenant
       must never wait - and a shed state cannot ring alone: only a return hands back the
       width shedding would take again. innerWidth, not row.clientWidth: a vetoed state
       that summons a scrollbar would narrow the row, mint a fresh epoch and license its
       own retry. Quantized to 4px so zoom noise cannot mint epochs. The veto stays last:
       a return that leaves ANY overflow or dips within 8px of the covenant reverts on the
       spot. */
    /* The rail bit is the DOCKED state: a docked panel narrows the row, so docking changing is
       a genuine input change that re-licenses a return attempt. The old bit was the width
       signal, which no longer feeds any control decision. */
    /* Width and rail docking only - the tab count left the algorithm with the covenant's
       scaling, so it has no business minting return attempts either. */
    const epoch=Math.round(innerWidth/4)+"/"+(document.body.classList.contains("rail-on")?1:0);
    /* THE COVENANT IS THE ONLY CURRENCY - overflow is not consulted: a scrolling strip is
       the NORMAL resting state with many tabs, and gating on !over() kept six tabs' chrome
       shed at enormous widths. The epoch is consumed only when an attempt can start. */
    const roomy=()=>grant()>=NEED[k]+8;
    /* STORM AND SETTLED ARE SEPARATE COINS: returns must fire DURING the widening as sheds
       do during narrowing, but a mid-storm attempt against transient geometry must not
       spend the width's only try. A veto mid-drag costs nothing durable; the final width
       still gets one clean attempt on settled geometry. */
    const settled=!syncHeaderShed._lastResize || performance.now()-syncHeaderShed._lastResize>=250;
    if(!settled && !syncHeaderShed._settleTimer && typeof scheduleHeaderSync==="function"){
      syncHeaderShed._settleTimer=setTimeout(()=>{ syncHeaderShed._settleTimer=0; scheduleHeaderSync(); }, 280);
    }
    const coin=(settled?"s":"m")+epoch;
    if(syncHeaderShed._returnEpoch!==coin && roomy()){
      syncHeaderShed._returnEpoch=coin;   // consumed by the attempt, whatever happens next
      while(k>0 && roomy()){
        /* From k=2 the return is the PAIR - theme and Quick facts come back together, priced
           together - because stepping to k=1 would leave the chevron holding one row, the
           state the pair law exists to forbid. Above 2, single steps. */
        /* The pair's price is NET of the chevron: returning theme and facts also dismisses
           the door, so the row recovers its 40px - the gross sum overpriced the step and
           held the pair in the chevron ~50px of width longer than the veto would have. The
           veto still measures truth either way. */
        const step=(k===2)?2:1;
        const cost=(k===2)?(returnCost[0]+returnCost[1]-N.chevron):returnCost[k-1];
        if(reclaimable(k-step)<cost+14) break;
        k-=step; apply();
        if(!roomy()){ k+=step; apply(); break; }
      }
    }
  }
  syncHeaderShed._k=k;
}
function closeMoreMenu(){
  const m=$("#moreMenu"), b=$("#moreBtn");
  if(m) m.hidden=true;
  if(b){ b.classList.remove("on"); b.setAttribute("aria-expanded","false"); }
}
function openMoreMenu(){
  const m=$("#moreMenu"), b=$("#moreBtn");
  if(!m||!b) return;
  closeSettingsMenu(); closeFactsPanel();
  syncMoreBtn();   // rows reflect this instant's measurement, not the last resize's
  m.hidden=false;
  b.classList.add("on");
  b.setAttribute("aria-expanded","true");
}
/* The brand mark for anywhere that is not the header's own markup - the header keeps
   its copy inline so the tile paints on first parse. If the mark is ever redrawn, both
   change together or the About box quietly ships the old one. */
/* CLEARING TEXT AND CLEARING A SELECTION ARE NOT THE SAME ACT. The eraser is right for
   AGENT/PAX/ROLE - something typed being rubbed out - and wrong for chosen intents, where
   nothing was written: the selection is being started over. The second mark is the
   category set's `undo` arrow: the NAME misleads, the SHAPE is a loop back to the
   beginning - judge the drawing, not the constant it is stored under. Deliberately NOT
   the app's Reset: that has no icon, and if it ever grows one, it must not be this. */
const ICON_CLEAR_TEXT='<svg class="ic-x" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5.8 17.5l-3.6-3.6c-.8-.8-.8-2 0-2.8l8-8c.8-.8 2-.8 2.8 0l4.7 4.7c.8.8.8 2 0 2.8l-6.9 6.9"/><path d="M18.3 17.5H5.8"/><path d="M4.2 9.2l7.5 7.5"/></svg>';
const TILE_MARK='<svg viewBox="0 0 256 256" aria-hidden="true" focusable="false"><g transform="translate(-7.441 -7.441) scale(1.0581)"><path fill="currentColor" d="M190.65 89.21L191.65 89.01Q203.00 94.28 203.00 106.44L203.00 106.44Q203.00 112.91 200.21 118.54Q197.42 124.17 193.19 127.20Q188.96 130.24 183.03 131.64Q177.10 133.03 163.96 135.32L163.96 135.32Q175.81 140.40 175.81 152.85L175.81 152.85Q175.81 165.10 166.20 175.86Q156.59 186.62 139.11 193.69Q121.63 200.76 102.70 200.76L102.70 200.76Q92.44 200.76 83.53 198.47Q74.61 196.18 67.44 190.90Q60.27 185.62 56.64 178.10Q53.00 170.58 53.00 161.12L53.00 161.12Q53.00 131.54 94.33 118.19L94.33 118.19Q86.37 117.29 80.89 111.42Q75.41 105.54 75.41 96.58L75.41 96.58Q75.41 88.91 79.29 82.63Q83.18 76.36 91.94 69.48Q100.71 62.61 108.68 58.93Q116.65 55.24 127.00 55.24L127.00 55.24Q139.06 55.24 149.41 60.42L149.41 60.42L150.01 61.72Q149.22 63.51 147.62 73.12Q146.03 82.73 145.93 86.02L145.93 86.02L145.13 86.91L140.65 86.91L139.85 86.02L139.45 74.66Q131.49 66.50 119.83 66.50L119.83 66.50Q109.47 66.50 102.40 72.77Q95.33 79.05 95.33 88.91L95.33 88.91Q95.33 95.48 98.57 100.56Q101.80 105.64 106.83 108.03Q111.86 110.42 117.24 110.42L117.24 110.42Q119.24 110.42 122.32 109.92L122.32 109.92L123.12 110.72Q120.93 118.79 120.73 121.97L120.73 121.97Q117.44 121.38 114.35 121.38L114.35 121.38Q104.99 121.38 96.03 125.16Q87.06 128.95 82.08 137.16Q77.10 145.38 77.10 155.44L77.10 155.44Q77.10 165.60 81.93 173.42Q86.76 181.24 95.48 185.47Q104.20 189.70 116.35 189.70L116.35 189.70Q125.21 189.70 132.43 187.46Q139.65 185.22 145.28 180.84Q150.91 176.46 154.20 170.43Q157.48 164.40 157.48 157.53L157.48 157.53Q157.48 152.35 155.24 147.97Q153.00 143.59 148.82 141.55Q144.63 139.50 140.75 139.50L140.75 139.50Q137.76 139.50 134.47 140.75Q131.19 141.99 129.29 144.63Q127.40 147.27 126.75 149.12Q126.11 150.96 125.11 155.44L125.11 155.44L124.22 156.34L120.73 156.34L120.03 155.44L122.22 134.23Q128.80 127.85 136.32 125.46Q143.84 123.07 158.98 121.08L158.98 121.08Q173.12 119.28 180.49 117.59Q187.86 115.90 191.50 112.16Q195.13 108.43 195.13 103.65L195.13 103.65Q195.13 96.18 188.06 93.79L188.06 93.79L188.06 92.49L190.65 89.21Z"/></g></svg>';
// About Etiuda: elegant in-page modal with tool name + footer help/credits.
function openAbout(){
  /* Built from #aboutInfo plus a freshly rendered shortcut list. The legend cannot simply be
     cloned from the footer - it lives in an element with an id, and two of those in one
     document is a bug waiting to happen - so it is regenerated here from the same source. */
  const src=document.getElementById("aboutInfo");
  const info=src ? src.innerHTML : "";
  const keys='<b>'+esc(t("Keys"))+'</b> - '+keysLegendHtml()+' · '+esc(t("customise in"))
    +' <b><span data-icon="settings"></span> '+esc(t("→ Settings → Keyboard shortcuts"))+'</b>.<br><br>';
  openDialog({
    cls: "about-modal",
    title: "Etiuda",
    lead: '<span class="brand-tile about-tile" aria-hidden="true">'+TILE_MARK+'</span>',
    sub: t("About Etiuda · Version {V} · MIT License · © 2026 Maxim Gwiazda")
           .replace("{V}",E_VERSION),
    body: '<div class="about-body">'+keys+info+'</div>',
    actions: '<button type="button" class="btn primary" id="aboutClose">Close</button>',
    wire: ()=>{
      fillProseIcons(modalCard);
      const closeBtn=$("#aboutClose");
      if(closeBtn){
        /* Just dismissModal - the modifier class is the opener's business (openDialog resets
           the card's class list). */
        closeBtn.onclick=()=>dismissModal();
        try{ closeBtn.focus(); }catch(_){}
      }
    }
  });
}
/* The panel's size belongs to whoever dragged it, remembered between sessions. Stored
   as the inline width/height the browser's own handle writes - nothing to parse, and the
   CSS clamps do the rest: a tall-monitor save is capped by max-height on a laptop, which
   is why nothing is clamped here. Global, like the theme: a preference about this
   browser, not about a catalog's content. */
/* Measured from ITS OWN top - the facts button's bottom, not the header's: the panel
   overlays the pill bar, and anchoring to the header threw away that many pill rows of
   room. Top does not depend on height, so measuring the panel to size the panel is safe. */
function syncFactsGeometry(){
  const p=$("#factsPanel");
  if(!p||p.hidden) return;
  const r=p.getBoundingClientRect();
  /* Both edges the panel is pinned by, and neither is the window's. `top` is the button's bottom,
     `right` is the button's right - and because the panel is anchored at those, neither moves
     when its width or height changes, so measuring the panel to size the panel is safe. */
  const availH=Math.max(140, Math.round(window.innerHeight - r.top - 14));
  const availW=Math.max(320, Math.round(r.right - 14));
  const root=document.documentElement;
  root.style.setProperty("--facts-max", availH+"px");
  root.style.setProperty("--facts-maxw", availW+"px");
}
function restoreFactsSize(p){
  if(!p) return;
  const w=lsGet("pbFactsW"), h=lsGet("pbFactsH");
  if(w) p.style.width=w;
  if(h) p.style.height=h;
}
let factsSizeTimer=0;
function rememberFactsSize(p){
  if(!p) return;
  clearTimeout(factsSizeTimer);
  // Debounced: a ResizeObserver fires every frame of a drag, and none of those are the answer.
  factsSizeTimer=setTimeout(()=>{
    if(p.style.width) lsSet("pbFactsW", p.style.width);
    if(p.style.height) lsSet("pbFactsH", p.style.height);
  },180);
}
function factsPanelOpen(){
  const p=$("#factsPanel");
  return p && !p.hidden;
}
function closeFactsPanel(){
  const p=$("#factsPanel"), b=$("#factsBtn");
  exitFactsEdit(false);
  if(p) p.hidden=true;
  if(b){ b.classList.remove("on"); b.setAttribute("aria-expanded","false"); }
}
function openFactsPanel(){
  const p=$("#factsPanel"), b=$("#factsBtn");
  if(!p||!b) return;
  closeSettingsMenu();
  exitFactsEdit(false);
  renderFacts();
  restoreFactsSize(p);
  p.hidden=false;
  syncFactsGeometry();          // after it is visible - a hidden element has no rect to measure
  b.classList.add("on");
  b.setAttribute("aria-expanded","true");
  /* An edit that was interrupted rather than cancelled resumes where it stopped, so a stray
     click costs a reopen instead of the text. See exitFactsEdit. */
  if(typeof factsDraft!=="undefined" && factsDraft!=null){
    enterFactsEdit();
  }
}
function toggleFactsPanel(){
  if(factsPanelOpen()) closeFactsPanel(); else openFactsPanel();
}
/* Watched rather than hooked to pointerup: the resize handle is the browser's, so
   there is no event of our own, and a pointerup can land anywhere once the drag leaves
   the corner. Guarded on the panel being open, so the observer's first callback - fired
   on attach - does not write the size of a hidden element. */
if(typeof ResizeObserver==="function"){
  const fp=$("#factsPanel");
  if(fp) new ResizeObserver(()=>{ if(!fp.hidden) rememberFactsSize(fp); }).observe(fp);
}
$("#factsBtn").onclick=e=>{
  e.stopPropagation();
  toggleFactsPanel();
};
$("#settingsBtn").onclick=e=>{
  e.stopPropagation();
  const menu=$("#settingsMenu");
  if(!menu) return;
  if(menu.hidden) openSettingsMenu(); else closeSettingsMenu();
};
$("#settingsMenu").onclick=e=>{
  const b=e.target.closest("button[data-act]");
  if(!b) return;
  const act=b.dataset.act;
  // Add actions sit with the things they create, so this menu carries none of them.
  if(act==="settings"){ closeSettingsMenu(); openSettings(); }
  else if(act==="manage"){ closeSettingsMenu(); openManage(); }
  else if(act==="tour"){ closeSettingsMenu(); startTour(); }
  else if(act==="about"){ closeSettingsMenu(); openAbout(); }
  else if(act==="rail"){ toggleRail(); }
  else if(act==="pills"){ togglePills(); }
};
$("#moreBtn").onclick=e=>{
  e.stopPropagation();
  const m=$("#moreMenu");
  if(!m) return;
  if(m.hidden) openMoreMenu(); else closeMoreMenu();
};
$("#moreMenu").onclick=e=>{
  const b=e.target.closest("button[data-act]");
  if(!b) return;
  const act=b.dataset.act;
  // Delegation, exactly as the Menu stand-ins did it: the hidden button still works by
  // .click() while display:none, so there is ONE behaviour behind however many doors.
  if(act==="facts"){ closeMoreMenu(); const t=$("#factsBtn"); if(t) t.click(); }
  else if(act==="theme"){ closeMoreMenu(); const t=$("#theme"); if(t) t.click(); }
  /* The ACTIVE button, not the inactive one: the seg's own handler carries a fold-toggle
     - when a button is not rendered, any click means "switch to the other" - and a fully
     hidden seg reads as folded, so clicking the inactive one inverted the request into a
     perfect no-op. Clicking the active one lets the toggle do exactly its job. */
  else if(act==="lang"){ closeMoreMenu(); const t=$("#seg button.on")||$("#seg button"); if(t) t.click(); }
};
addEventListener("pointerdown",e=>{
  // Touching anything ends the keyboard peek - hover takes over from here.
  endPillNavPeek();
  const sw=$("#settingsWrap"), fw=$("#factsWrap"), mw=$("#moreWrap");
  if(sw && !sw.contains(e.target)) closeSettingsMenu();
  if(fw && !fw.contains(e.target)) closeFactsPanel();
  if(mw && !mw.contains(e.target)) closeMoreMenu();
});
addEventListener("keydown",e=>{
  if(e.key!=="Escape") return;
  if(tourActive()){
    endTour(false);
    e.stopPropagation(); e.preventDefault();
    return;
  }
  if($("#settingsMenu") && !$("#settingsMenu").hidden){
    closeSettingsMenu(); e.stopPropagation(); return;
  }
  if($("#moreMenu") && !$("#moreMenu").hidden){
    closeMoreMenu(); e.stopPropagation(); return;
  }
  if(factsPanelOpen()){
    closeFactsPanel(); e.stopPropagation();
  }
}, true);
/* Re-measure on the signals that change the inputs: window size (zoom fires resize
   too), the body class (the rail docking or leaving; the algorithm's own class writes are
   kept from ringing by the guard), and tab count via scheduleHeaderSync from drawTabs. Order
   is fixed here: the algorithm decides WHAT hides, then the chevron reads what hid.
   rAF-coalesced, so a drag costs one pass per frame at most. */
function wireHeaderShedSync(){
  let raf=0, belt=0;
  const run=()=>{
    if(raf){ cancelAnimationFrame(raf); raf=0; }
    if(belt){ clearTimeout(belt); belt=0; }
    /* Not mid-grow: a shed class toggling while the tabs transition re-lays the row under
       them - the first tab visibly jumped. The grow's completion re-asks against still
       boxes; dropping this pass loses nothing because that one always follows. */
    if(typeof tabInsertAnimating!=="undefined" && tabInsertAnimating) return;
    /* Choreography brackets BOTH syncs: the door's visibility is syncMoreBtn's to flip, so a
       diff closed before it would miss the door opening. Probes inside stay invisible. */
    const shedBefore=shedSnap();
    shedHeld++;
    try{ syncHeaderShed(); syncMoreBtn(); } finally { shedHeld--; }
    if(shedBefore) shedAnimate(shedBefore);
  };
  /* rAF plus a TIMEOUT BELT: rAF is fully suspended in a hidden document, so a page
     booted in a background tab parks its boot-time ask forever and the header never syncs
     until the first resize after focus. The belt fires even hidden (timers throttle but
     run); whichever of the two lands first cancels the other. */
  const ask=()=>{
    if(!raf) raf=requestAnimationFrame(run);
    if(!belt) belt=setTimeout(run, 200);
  };
  window.scheduleHeaderSync=ask;
  addEventListener("resize", ()=>{ syncHeaderShed._refreshNat=true; syncHeaderShed._lastResize=performance.now(); ask(); });
  document.addEventListener("visibilitychange", ask);   // surface from a background boot synced
  if(typeof MutationObserver==="function"){
    /* The algorithm writes body classes, which fires this observer once more; the second pass
       computes the same k from the same inputs, toggles nothing, and the observer goes quiet.
       Purity is the loop guard - the same property that makes the boundary flicker-free. */
    new MutationObserver(ask).observe(document.body,{attributes:true,attributeFilter:["class"]});
  }
  ask();   // boot state - the page can load already narrow, or already rail-hidden
}
wireHeaderShedSync();
syncLayoutPrefs();
// re-render so the filled value appears in every card as you type, not just on copy
pax.oninput=()=>{
  renderFillsSoon();
  scheduleTabSave();
};
function updateIntentPlaceholder(){
  if(!intentEl) return;
  intentEl.placeholder=t("search intents and cards");
  const ph=$("#intentPh");
  if(ph) ph.innerHTML=t("search intents and cards · <kbd>Enter</kbd> selects the marked intent · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> for several");
}
/* Dropping the query is the only "leaving" there is. Selected intents and the category
   filter are untouched; the rail un-sorts and un-greys. */
function clearSearchQuery(){
  if(intentEl) intentEl.value="";
  railSel=-1;
  clearTimeout(railSortT); railSortT=0;
  syncIntentInput();
  syncIntentClearBtns();
  syncShortcutTitles();
  drawIntentRail();
  render();
  flushPillState();
}
// Expand template tokens for search so queries match what agents *see* after fill().
// {GREET} is time-dependent ("Good evening" etc.) and is not stored literally in cards.
function expandSearchPlaceholders(s){
  let t=String(s==null?"":s);
  if(/\{GREET\}/i.test(t)){
    // Every variant at once, so "evening" or "wieczór" reaches the card whatever the clock says
    t=t.replace(/\{GREET\}/gi,
      GREET_WORDS);
  }
  // Other tokens: strip so they don't block matches; also include live filled text below
  t=t.replace(/\{PAX\}/gi," ")
     .replace(/\{INTENT\}/gi," ")
     .replace(/\{Z\}/gi," ")
     .replace(/\{AGENT\}/gi," ")
     .replace(/\{ROLE\}/gi," ")
     .replace(/\{INIT\}/gi," ")
     .replace(/\{ACTION\}/gi," ")
     .replace(/\{TOPIC\}/gi," ");
  return t;
}
/* Search fields: title, keys, meta (the category label), body (raw + expanded EN/PL +
   the currently filled display text, so live {GREET}/{PAX} match; the note rides last in
   body - see below). Ranking needs WHERE a term matched; the old single blob survives as
   idx.hay and matching still runs against it, so the split changes the order of results,
   never which results appear. Built-ins, overrides and customs reach here as one flat
   object, so a missing field is an empty string, not a special case. */
const SEARCH_FIELDS=["title","keys","meta","body"];
function normHay(parts){
  // Folded here as well as in splitWords, because the substring paths test against the raw
  // field / hay text and would otherwise be matching a different alphabet from the words.
  return foldDiacritics(parts.map(x=>String(x==null?"":x)).join(" ").toLowerCase())
    .replace(/\s+/g," ").trim();
}
/* THE STATIC HALF OF A HAYSTACK, cached on OBJECT IDENTITY - rebuildCards hands out
   fresh card objects on every edit, so a changed card is a different key and no
   invalidation logic exists to go stale (a version stamp would have to cover pax, agent,
   role, language, intents and the clock; identity cannot miss). Only pure functions of
   the card are cached; the category label and live fills stay in the live half.
   expandSearchPlaceholders is pure - if it ever reads live state, it moves too. WeakMap,
   so nothing leaks into exported JSON. */
const cardStaticHayCache=new WeakMap();
function cardStaticHay(m){
  const hit=cardStaticHayCache.get(m);
  if(hit) return hit;
  const st={
    title: normHay(cardFieldKeys("t").map(k=>m[k])),
    keys:  normHay(CARD_SHARED_FIELDS.map(k=>m[k])),
    /* bodyA and bodyB straddle the live copies so the assembled body keeps the ORIGINAL
       part order - raw, expanded, filled, note. Any other split reorders the text and
       changes which substrings span a boundary, and hay.indexOf reads across boundaries. */
    bodyA: normHay([m.en, m.pl, expandSearchPlaceholders(m.en), expandSearchPlaceholders(m.pl)]),
    bodyB: normHay(cardFieldKeys("note").map(k=>m[k]))
  };
  cardStaticHayCache.set(m,st);
  return st;
}
function cardSearchFields(m){
  if(!m) return {title:"",keys:"",meta:"",body:""};
  const st=cardStaticHay(m);
  // Live filled copy (current time-of-day greeting, pax name, intent, …)
  const live=[];
  try{
    if(m.en) live.push(fill(m.en,m));
    if(m.pl) live.push(fill(m.pl,m));
  }catch(_){}
  /* THE NOTE IS BODY, NOT META. Notes are operating warnings, largely NEGATIONS, so a
     word's presence there often means the reverse of relevance - in meta it made cards
     tier-0 for the very thing their note forbids. Demoted, not deleted: queries exist
     whose ONLY hit is the note, so it stays findable at weight 1, tier 1, "merely
     mentions it". meta is the CATEGORY NAME alone - its tier-0 gateway is deliberate.
     bodyB keeps the note LAST in the assembled body. */
  return {
    title: st.title,
    keys:  st.keys,
    /* Live, not cached: a category rename changes this without changing the card object. It is
       one short label, so recomputing it costs nothing worth caching. */
    meta:  normHay([CATS[m.c]||m.c||""]),
    /* Each group is already folded, collapsed and trimmed, so joining with single spaces
       reproduces the one-pass normHay byte for byte; filter(Boolean) keeps an empty group
       from introducing a double space. Verified against the pre-cache implementation. */
    body:  [st.bodyA, normHay(live), st.bodyB].filter(Boolean).join(" ")
  };
}
/* Card haystacks are big and search re-runs per keystroke across the catalog: memoise
   the fields and word splits per card, keyed on the joined text so the live {PAX}/{GREET}
   fills invalidate it - and an edit drops the entry anyway, since rebuildCards hands out
   fresh objects. WeakMap rather than a field, so nothing leaks into exported JSON. */
const cardWordCache=new WeakMap();
function cardSearchIndex(m){
  const fields=cardSearchFields(m);
  /* Plain join, not normHay: the four fields are already lowercased, collapsed and
     trimmed - re-running the regex over the body is a second full pass for nothing.
     Empties dropped so the join stays single-spaced, identical to the old single blob. */
  const hay=[fields.title,fields.keys,fields.meta,fields.body].filter(Boolean).join(" ");
  const c=cardWordCache.get(m);
  if(c && c.hay===hay) return c.idx;
  const idx={hay, fields, words:{}, allWords:splitWords(hay)};
  SEARCH_FIELDS.forEach(f=>{ idx.words[f]=splitWords(fields[f]); });
  if(m) cardWordCache.set(m,{hay,idx});   // set() throws on a non-object key
  return idx;
}
/* Terms must arrive already lowercased AND diacritic-folded - cardSearchTerms() is the one
   place that produces them, and the index is folded, so an unfolded term silently matches
   nothing. Any new caller must fold first rather than passing raw input straight in. */
function cardMatchesSearch(m, terms){
  if(!terms||!terms.length) return true;
  const idx=cardSearchIndex(m);
  const hay=idx.hay;
  // Same rule as the intent box: exact substring, or a word sharing enough of a prefix.
  if(terms.every(t=>hay.indexOf(t)!==-1)) return true;
  return terms.every(t => hay.indexOf(t)!==-1 || idx.allWords.some(w=>wordMatchesTerm(w,t)));
}
/** {tier, score} for one card against the typed terms. Lower tier first, then higher score.
    `aterms` is intentAffinityGroups(); render computes it once and passes it in. */
function cardSearchScore(m, terms, aterms){
  const idx=cardSearchIndex(m);
  const fieldHasAll={title:true, keys:true, meta:true, body:true};
  let score=0, strong=true;
  for(let i=0;i<terms.length;i++){
    const term=terms[i];
    let best=0, inStrongField=false;
    for(let f=0;f<SEARCH_FIELDS.length;f++){
      const field=SEARCH_FIELDS[f];
      const q=termFieldQuality(idx, field, term);
      if(!q){ fieldHasAll[field]=false; continue; }
      const v=q*FIELD_WEIGHT[field];
      if(v>best) best=v;
      if(field!=="body") inStrongField=true;
    }
    if(!inStrongField) strong=false;   // needed the body to match at all
    score+=best;
  }
  if(SEARCH_FIELDS.some(f=>fieldHasAll[f])) score*=SAME_FIELD_BONUS;
  /* Added AFTER the same-field multiplier, not before: proximity is a flat piece of evidence
     about where the words sit, and multiplying it by 1.5 as well would make one observation
     count one and a half times. */
  score+=proximityBonus(idx, terms);
  const title=idx.fields.title;
  if(terms.length>1 && title.indexOf(terms.join(" "))!==-1) score+=ADJACENT_BONUS;
  if(title.indexOf(terms[0])===0) score+=TITLE_START_BONUS;
  // How central is this entry to the selected intent, on top of how well it matches the query
  if(aterms===undefined) aterms=intentAffinityGroups();
  if(aterms.length) score+=cardIntentAffinity(m, aterms)*AFFINITY_W;
  /* Last, so it lifts the finished score rather than one component of it - and guarded by
     typeof, like intentAffinityGroups above, so the scoring stays callable outside the app
     (the search-eval harness runs this very function headless and supplies its own). */
  if(isFavourite(m&&m.id)) score*=FAV_BONUS;
  return {tier: strong?0:1, score};
}
intentEl.oninput=()=>{
  // The query never alters selected intents; picking is Enter's job.
  intentEl.classList.toggle("set", !!String(intentEl.value||"").trim());
  syncIntentClearBtns();
  entrySel=null; markEntrySel(); railSel=-1; railMarkUsed=false; semiKind=null;
  kbdNav(true);
  queueSearchSettle();
  scheduleTabSave();
};
/* A QUERY MEANS "SHOW ME THIS, WHEREVER IT IS", so the category filter drops - it can hide
   every match, and strand you in a category the arrow walk will not even stop at. ARMED here,
   DROPPED at the settle with the cards and the numbers: the bar moving to All while the list
   under it still showed the category was two answers to one question. Only the keystroke that
   STARTS a query arms it - a pill clicked mid-search has to stick - and typing over the whole
   box starts one, since select-all-and-retype is how a second search is made. */
intentEl.addEventListener("beforeinput",e=>{
  if(!cats.length) return;
  if(e.inputType && e.inputType.indexOf("insert")!==0) return;
  const q=String(intentEl.value||"");
  if(q.trim() && !(intentEl.selectionStart===0 && intentEl.selectionEnd===q.length)) return;
  catsDropArmed=true;
});
/* A keystroke paints NOTHING: rail order, pill row and the card list all land together at
   the settle - one statement about the finished query, nothing redrawn under the typing
   hand. Reaching for the arrows or Enter settles everything at once. */
function queueSearchSettle(){
  railSettled=false;
  railDecorate(false);
  railScheduleSort();
}
/* The box's own keydown, and stopImmediatePropagation keeps these keys from the document's
   shortcut handlers behind it. Down/Up walk the MATCHES from the mark - an arrow also
   settles a pending resort first, since reaching for the arrows says "I stopped typing".
   Enter takes the marked intent and hands the arrows to the cards; Ctrl+Enter takes it and
   keeps the box for the next name. Nothing marked - Enter releases focus to the cards. */
/* The caret lives at the end, where letters land. A bare click into the middle snaps
   back; a dragged SELECTION survives, because select-and-retype is a repair this box
   keeps. Deferred a tick: the browser sets the caret after these events fire. */
function pinSearchCaret(){
  if(!intentEl) return;
  const n=intentEl.value.length;
  if(intentEl.selectionStart===intentEl.selectionEnd && intentEl.selectionEnd!==n){
    try{ intentEl.setSelectionRange(n,n); }catch(_){}
  }
}
intentEl.addEventListener("mouseup",()=>setTimeout(pinSearchCaret,0));
intentEl.addEventListener("focus",()=>setTimeout(pinSearchCaret,0));
intentEl.addEventListener("keydown",e=>{
  if(e.altKey || e.metaKey) return;
  // The box's door onto the escape ladder.
  if(e.key==="Escape"){ e.preventDefault(); e.stopImmediatePropagation(); escapeLadderStep(); return; }
  /* THE BOX HAS NO CARET KEYS - a query is a probe, not a document, so ←/→ steer the
     categories from inside it exactly as they do from outside, and focus stops mattering
     to the arrows at all. Repair is the clear button, Esc, or Ctrl+A and retyping. The
     modified variants are RESERVED, not free: Shift may yet mean something here, and Ctrl
     already means "several" on the pills themselves - so both fall dead, and Home/End die
     with the caret they served. */
  if(e.key==="ArrowLeft"||e.key==="ArrowRight"){
    e.preventDefault(); e.stopImmediatePropagation();
    if(e.ctrlKey) return;                       // still reserved
    if(e.shiftKey){ runShortcut(e.key==="ArrowRight"?"navPillLast":"navPillFirst"); return; }
    runShortcut(e.key==="ArrowRight"?"navPillRight":"navPillLeft");
    return;
  }
  if(e.key==="Home"||e.key==="End"){ e.preventDefault(); e.stopImmediatePropagation(); return; }
  const q=String(intentEl.value||"").trim();
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){
    if(e.ctrlKey) { e.preventDefault(); e.stopImmediatePropagation(); return; }   // reserved
    if(e.shiftKey){
      e.preventDefault(); e.stopImmediatePropagation();
      if(railSortT) railSettle();
      runShortcut(e.key==="ArrowDown"?"markBottom":"markTop");
      return;
    }
    /* By markSurface, not semiKind alone - the surface test the decorator paints by. A
       card mark can outlive its claim (plain pick, then refocus): still walkable here. */
    if(markSurface()==="card"){
      e.preventDefault(); e.stopImmediatePropagation();
      kbdNav(true);
      navEntry(e.key==="ArrowDown"?1:-1);
      return;
    }
    if(!q && semiKind!=="intent") return;
    e.preventDefault(); e.stopImmediatePropagation();
    kbdNav(true);
    if(railSortT) railSettle();
    /* An empty intent surface hands the arrows to the cards rather than eating them - a
       query can match no intent at all, and the cards are then the only answer there is. */
    if(!railOrder.length){ semiKind="card"; navEntry(e.key==="ArrowDown"?1:-1); return; }
    semiKind="intent";
    railMarkUsed=false;
    if(entrySel){ entrySel=null; markEntrySel(); }
    const n=railOrder.length;
    const step=e.key==="ArrowDown"?1:-1;
    const from = railSel>=0 ? railSel : (railMarkIdx>=0?railOrder.indexOf(railMarkIdx):-1);
    const to = railStep(from<0 ? (step>0?-1:n) : from, step);
    if(to<0){ semiKind="card"; navEntry(step); return; }   // every row is picked: the cards are the only answer
    railSel=to;
    railDecorate(true);
    return;
  }
  if(e.key==="Enter"){
    if(!q && semiKind!=="intent") return;
    e.preventDefault(); e.stopImmediatePropagation();
    kbdNav(true);
    if(railSortT) railSettle();       // Enter takes what the settle marks, never a stale best
    const idx = railSel>=0 && railSel<railOrder.length ? railOrder[railSel] : railMarkIdx;
    if(idx<0 || (railMarkUsed && railSel<0)){ try{ intentEl.blur(); }catch(_){} return; }
    /* Inside a run a plain Enter still ADDS, then closes the run by hand - the copy
       shortcut is Enter's alter ego and mirrors this; see runShortcut. */
    const run = !e.ctrlKey && pickRun && intentIdxs.length>0;
    pickIntent(idx, !!e.ctrlKey || run);   // clears the query - the pick reveals the full view
    if(run){ railMarkUsed=true; semiKind=null; pickRun=false; }
    railSel=-1;
    if(!e.ctrlKey){ try{ intentEl.blur(); }catch(_){} }
    return;
  }
});

/* One full turn of the pick arrow, every click - see the .e-spin-pick note in the
   stylesheet. Restartable: a second click mid-spin rewinds and goes around again. */
function spinPickClear(btn){
  if(!btn) return;
  btn.classList.remove("e-spin-pick");
  void btn.offsetWidth;
  btn.classList.add("e-spin-pick");
  clearTimeout(btn._eSpinT);
  btn._eSpinT=setTimeout(()=>btn.classList.remove("e-spin-pick"),500);
}
const intentClearBtn=$("#intentClear");
if(intentClearBtn){
  intentClearBtn.onclick=e=>{
    e.preventDefault(); e.stopPropagation();
    /* Erase only - the intents' own exits are Esc and the rail. The button greys while
       the box is empty, and spaces count as content, erased rather than ignored. */
    clearSearchQuery();   // the same leaving as Esc, so the rail un-sorts and un-greys with the box
    try{ intentEl.focus(); }catch(_){}
  };
}
updateIntentPlaceholder();
// Clear × on search / agent / pax / who - always visible, disabled when empty
function bindFieldClear(input, btn, onClear){
  if(!input||!btn) return;
  /* .length, not .trim(). A field holding three spaces is NOT empty - it looks full, it behaves
     full, and the one control that could empty it was greying itself out. Whether the content is
     meaningful is a separate question from whether there is any. */
  function sync(){ btn.disabled=!String(input.value||"").length; }
  btn.addEventListener("click",e=>{
    e.preventDefault(); e.stopPropagation();
    if(btn.disabled) return;
    input.value="";
    if(typeof onClear==="function") onClear();
    else input.dispatchEvent(new Event("input",{bubbles:true}));
    sync();
    try{ input.focus(); }catch(_){}
  });
  input.addEventListener("input",sync);
  sync();
  return sync;
}
bindFieldClear(agentEl, $("#agentClear"), ()=>{ syncAgent(); });
bindFieldClear(pax, $("#paxClear"), ()=>{
  render();
  scheduleTabSave();
});
// language segmented control
const seg=$("#seg");
/* Split in two because applyTab() needs the first half only: it draws the pills and re-renders
   the list itself, once, after installing the whole tab. Calling setLang() from there would
   render twice and write the tab back while it is still being applied. */
/* The state and the thumb: everything a click must do in its own frame, and nothing that
   costs more than a class toggle. */
function applyLangState(l){
  lang = (l==="pl") ? "pl" : "en";
  /* Records the language ON SCREEN, not the last one deliberately chosen - written on a
     tab switch as well as a click: pick PL in tab 1, switch to an English tab, close the
     browser - reopening should resume in EN, the language actually being worked in. */
  lsSet("pbLang",lang);
  seg.querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.l===lang));
}
function applyLangHeavy(){
  syncShortcutTitles();
  drawIntentRail();    // the rail lists clauses in the language on screen
  recountMacros();   // segment counts are per-language
}
function applyLangUI(l){ cancelLangTail(); applyLangState(l); applyLangHeavy(); }
/* THE THUMB FIRST, THE LANGUAGE UNDER IT. The .on toggle is the whole receipt and the CSS
   slides the thumb for .18s; the rest of a switch is ~200ms of synchronous work in Firefox,
   which ate the slide whole and left it snapping (Chrome is fast enough that it never
   showed). Fired two thirds of the way in, where the easing has already spent 93% of its
   travel, so the rebuild lands after the eye has stopped following the thumb. Reduced motion
   has no slide to protect and runs it straight. Cancelled by a second click and by a tab
   switch, so an EN/PL/EN run rebuilds once. */
let eLangTailT=0;
function cancelLangTail(){ if(eLangTailT){ clearTimeout(eLangTailT); eLangTailT=0; } }
function setLang(l){
  applyLangState(l);
  const tail=()=>{
    applyLangHeavy();
    syncIntentInput();   // a listed intent re-maps to the other language
    if(typeof catOrder!=="undefined") drawPills();
    /* The fast path never calls render(): the list's structure is language-blind, so a
       full paint would spend a 40-60ms style pass re-inserting 6.7k unchanged nodes. The
       screenful rebuilds in place, the rest follows in chunks. Search stays a full render -
       relevance order is per-language. The viewport scan exits early because a rect read
       under content-visibility resolves the card it touches: measuring everything IS the
       burst being avoided. */
    if(cardSearchTerms().length || typeof list==="undefined" || !list
       || !list.querySelector(".card[data-id]") || (typeof cardDrag!=="undefined"&&cardDrag)){
      render();
    } else {
      cancelLangChunks();
      list.querySelectorAll(".list-sep.e-catsep span[data-k]").forEach(sp=>{
        const k=sp.getAttribute("data-k");
        sp.innerHTML=catIconSvg(k)+esc(CATS[k]||k||"");
      });
      const vh=(window.innerHeight||900)+240;
      const els=list.querySelectorAll(".card[data-id]");
      const nowIds=[], laterIds=[];
      let past=false;
      for(let k=0;k<els.length;k++){
        const id=els[k].getAttribute("data-id");
        if(past){ laterIds.push(id); continue; }
        const r=els[k].getBoundingClientRect();
        if(r.top>vh){ past=true; laterIds.push(id); }
        else if(r.bottom<-240) laterIds.push(id);
        else nowIds.push(id);
      }
      nowIds.forEach(rebuildCardInPlace);
      runLangChunks(laterIds);
    }
    // Language belongs to the active tab, so a switch is a tab edit like PAX or ROLE.
    scheduleTabSave();
  };
  cancelLangTail();
  let still=false;
  try{ still=matchMedia("(prefers-reduced-motion: reduce)").matches; }catch(e){}
  if(still){ tail(); return; }
  /* After the seg glide (180ms), plus the pick-tail's own +20 - the tail is quick now,
     but even a quick tail landing mid-glide costs the one animation this delay buys. */
  eLangTailT=setTimeout(()=>{ eLangTailT=0; tail(); },200);
}
/* Folded, only the active button is on screen, so a click there has to TOGGLE -
   clicking the language you are already in would read as broken. The fold is read back
   from the DOM, not the media query: the stylesheet owns the breakpoint, and asking the
   element whether its sibling is displayed cannot drift from it. */
function segFolded(){
  return [...seg.querySelectorAll("button")].some(b=>b.offsetParent===null);
}
seg.querySelectorAll("button").forEach(b=>b.onclick=()=>{
  const other=[...seg.querySelectorAll("button")].find(x=>x!==b);
  setLang(segFolded()&&other?other.dataset.l:b.dataset.l);
});
/* Retitle on resize: the tooltip has to describe what a click will DO, and that differs between
   the two layouts. Only the wording depends on the media query - the behaviour above does not. */
/* No labels: the placeholders name their fields outright (customer's name, agent's name,
   the drum's class), constant at every width, translated by the sweep. */

// category pills - order is user-arrangeable by dragging, and persists
const pills=$("#pills");
let catOrder=[];
try{ catOrder=JSON.parse(nsGet("CatOrder")||"null")||[]; }catch(e){ catOrder=[]; }
// Legacy: Boarding pass (bp) → Check-in (cin)
catOrder=catOrder.map(k=>k==="bp"?"cin":k).filter((k,i,a)=>a.indexOf(k)===i);
let dragState=null, suppressClick=false, swapLock=0;
applyCatsToGlobal();
// counts + cards filled after rebuildCards(); seed order from base cats first
catOrder=catOrder.filter(k=>CATS[k]);

/* The one-line category tag under an intent's name (panel, card editor, Manage).
   OPENER-role categories are left out: the role links them to every intent, and a label
   identical everywhere says nothing while hiding the differences. They still show where
   they ARE information: the pill's green ring, the editor's ticked chip. */
/* Derived: it names what will actually ring green. Role categories are left out - the
   link role puts them on every intent, and a label identical everywhere says nothing. */
function intentTagCats(i){
  /* Only categories this intent reaches SPECIFICALLY. A card flagged linked-to-every-intent puts
     its category on every intent, so naming it here would repeat the same word under every row -
     and a label identical everywhere tells you nothing while hiding the real differences. */
  const want=intentIdAt(i), out=[], seen={};
  (cards||[]).forEach(m=>{
    if(!m||!m.c||!CATS[m.c]||seen[m.c]) return;
    if(normalizeCardIntents(m).indexOf(want)<0) return;
    seen[m.c]=1; out.push(m.c);
  });
  return out;
}
function primaryCatLabel(i){
  return intentTagCats(i).map(k=>CATS[k]||k).filter(Boolean).join(" · ");
}
/* "Does this intent belong to this category", for floating matching intents to the top
   of the card editor's 42-entry list. Derived from card links like everything else - and
   the better answer: it floats at least as many intents per category as the declared
   field did, more for the busiest ones. */
function intentHasPrimaryCat(i, cat){
  return !!cat && categoriesForIntent(i).indexOf(cat)>-1;
}
// Categories the selected {INTENT}(s) touch: every category that
// has a card linked to that intent (so one intent can light up several green pills).

/* Green derives ENTIRELY from card links - a second declared source could disagree, and
   a category could ring green while every card inside stayed grey. Green means one thing:
   this category holds a card linked to this intent. */
function categoriesForIntent(i){
  const out=[], seen={};
  const add=k=>{ if(k&&!seen[k]&&CATS[k]){ seen[k]=1; out.push(k); } };
  const want=intentIdAt(i);
  (cards||[]).forEach(m=>{
    if(!m||!m.c) return;
    /* No exemption for SUPPORTING categories: green outranks blue, so a linked card greens
       its category even when it is marked supporting - otherwise card and pill disagree
       about the same intent. */
    if(cardLinksIntent(m,want)) add(m.c);
  });
  return out;
}
/* Picking a category RE-RANKS the panel, so a scrolled panel shows the middle of an
   order that has just been rewritten - the top is the only place the new ranking means
   anything. Smooth unless motion is turned down, by the app's usual test: a system asking
   for reduced motion is honoured whether or not the app's own box is ticked. */
function scrollRailTop(){
  const el=document.getElementById("intentRailList");
  if(!el || !el.scrollTop) return;
  try{ el.scrollTo({top:0, behavior: mgReduceMotion()?"auto":"smooth"}); }
  catch(e){ el.scrollTop=0; }
}
function intentCats(){
  if(!intentIdxs.length) return {specific:[],always:[]};
  const specific=[], seen={};
  intentIdxs.forEach(i=>{
    categoriesForIntent(i).forEach(k=>{
      if(!seen[k]){ seen[k]=1; specific.push(k); }
    });
  });
  /* No special case for the opener any more: it reaches this set as a real category link on
     each intent, the same way every other green category does. */
  return {specific, always:ALWAYS_CATS};
}

/* Ring band for pill ordering, same precedence as the ring classes in mk():
   1 intent-linked (green) · 2 supporting (blue) · 3 the rest. Numbering starts at 1 on
   purpose: it is a precedence, not a census. */
function pillBand(k, hc){
  if(!hc) return 3;
  if(hc.specific.indexOf(k)>-1) return 1;
  if(hc.always.indexOf(k)>-1) return 2;
  return 3;
}
/** Display order only - NEVER mutates catOrder, the drag order, which must survive
 *  intents, searches and clearing unchanged. WHILE A QUERY IS LIVE: empty categories sink,
 *  live ones order by the CARD SORT'S OWN aggregated keys - never by count, which cannot
 *  tell "about it" from "merely mentions it": bestTier, then the damped score sum.
 *  Dragged order stays the final tiebreak. The search band is the OUTER key, above the
 *  intent bands - while narrowing, a green category holding nothing is noise and a grey
 *  one holding five is where you are going. Stable, with `i` final. */
/* WHAT A SIGNAL IS WORTH, not which tier it lands in: points add, so a category BOTH
   linked and always-useful outranks one that is merely either - a tier had to pick.
   Behind the search tier: an asterisk cannot push a generically useful category over the
   one the query names. */
const CAT_PTS_INTENT=100;   // the selected intent links cards that live here
const CAT_PTS_ALWAYS=50;    // somebody marked this category useful in every chat
function catIntentPoints(k,hc){
  if(!hc) return 0;
  let p=0;
  if(hc.specific.indexOf(k)>-1) p+=CAT_PTS_INTENT;
  if(hc.always.indexOf(k)>-1)   p+=CAT_PTS_ALWAYS;
  return p;
}
function displayCatOrder(hc){
  const sc=searchCounts();
  if(!sc && !intentIdxs.length) return catOrder.slice();
  return catOrder
    .map((k,i)=>{
      const cr=sc ? searchCatRank() : null;
      const r=cr ? cr[k] : null;
      return {k, i,
        s:(sc && !(sc[k]||0)) ? 1 : 0,        // empty categories to the tail
        t:r?r.tier:9,                          // then the category your query is ABOUT
        /* Under an intent the search rank is absent, so the points carry the order. */
        v:r?r.rank:(intentIdxs.length?catIntentPoints(k,hc):0),
        b:pillBand(k,hc)};
    })
    .sort((a,b)=>(a.s-b.s) || (a.t-b.t) || (b.v-a.v) || (a.b-b.b) || (a.i-b.i))
    .map(o=>o.k);
}
/* A stable pseudorandom number from a string. Stable is the point: an icon or a colour picked
   by Math.random() would be a different one on every load, which is not an identity at all. */
function catHash(s){
  let h=0; s=String(s||"");
  for(let j=0;j<s.length;j++) h=(h*31+s.charCodeAt(j))|0;
  return Math.abs(h);
}
/* Identity slot, in falling order of authority: the user's own pick, then - for a
   catalog category - its position in the CATALOG's order, never catOrder, so colour
   follows the category and reordering pills repaints nothing. A user-made category gets a
   pseudorandom slot, so two added in a row are not palette neighbours. All ("") is
   chrome, not taxonomy, and gets no slot at all. */
/* A slot is legal only if the engine still DEALS it: a stored 5 kept resurrecting retired
   pink while a bare token count stood in for validity. The cycle is the only authority; an
   unrecognised slot falls through exactly as an absent one, giving the category the colour
   it would have had if pink never existed. */
function hueIsOffered(n){
  return n!=null && E_HUE_CYCLE.indexOf(n|0) >= 0;
}
function catSlot(id){
  if(!id) return -1;
  const ov=pack&&pack.catColors?pack.catColors[id]:null;
  if(hueIsOffered(ov)) return ov|0;
  const dec=CAT_COLORS_CATALOG[id];
  if(hueIsOffered(dec)) return dec|0;
  if(pack&&pack.customCats&&pack.customCats[id]!=null) return E_HUE_CYCLE[catHash(id)%E_HUE_CYCLE.length];
  const i=Object.keys(CATS).indexOf(id);
  /* Modulo the CYCLE's length, never the token count: they were the same number until pink
     left, and with a cycle of seven the wider range lands on index 7 and returns undefined. */
  return E_HUE_CYCLE[(i>-1?i:catHash(id))%E_HUE_CYCLE.length];
}
/* Falling order of authority: the user's own pick, then what the CATALOG declares,
   then a guess from the name, then the musical pool by hash - a maintained catalog
   arrives as its author intended, an unknown category still means something, and every
   category has a mark from the moment it exists. */
/* A category is OVERRIDDEN when any of the four things its editor writes differs from what
   the catalog declares. Presence is not enough: the icon and the colour are written on every
   save whether or not they changed, so a category saved once but never altered would
   otherwise offer to reset itself to what it already is. */
function categoryIsOverridden(k){
  if(!k || !pack) return false;
  const lab=(pack.catLabels||{})[k];
  if(lab && lab!==BASE_CATS[k]) return true;
  const labPl=(pack.catLabelsPl||{})[k];
  if(labPl && labPl!==CAT_LABELS_PL[k]) return true;
  const ic=(pack.catIcons||{})[k];
  if(ic!=null && ic!==CAT_ICONS_CATALOG[k]) return true;
  const col=(pack.catColors||{})[k];
  if(col!=null && col!==CAT_COLORS_CATALOG[k]) return true;
  /* The role is layer 3 like the four above, so Reset has to see it - see the note at
     refreshCatRoles(). Held as a boolean, and only a boolean overrides. */
  const role=(pack.catRoles||{})[k];
  if(role && typeof role.always==="boolean"
     && role.always!==(CATALOG_ROLES.always.indexOf(k)>-1)) return true;
  return false;
}
/* Drops all five, so the category answers to the catalog again. A custom category has no
   catalog version to fall back to, which is why its editor is never offered this. */
function resetCategory(k){
  if(!k || !pack) return;
  [ "catLabels","catLabelsPl","catIcons","catColors","catRoles" ].forEach(bag=>{
    if(pack[bag]) delete pack[bag][k];
  });
  savePack(); applyCatsToGlobal();
}
function catIconKey(id){
  if(!id) return null;
  const ov=pack&&pack.catIcons?pack.catIcons[id]:null;
  if(ov && CAT_ICONS[ov]) return ov;
  const dec=CAT_ICONS_CATALOG[id];
  if(dec && CAT_ICONS[dec]) return dec;
  /* The CANONICAL name, never CATS[id]: that one is localised, and hints written in English
     stop matching the moment the UI turns Polish - every guessed icon would fall through to
     the hash pool and the categories would change their marks on a language switch. */
  const label=String((pack&&pack.catLabels&&pack.catLabels[id]) || BASE_CATS[id]
                     || (pack&&pack.customCats&&pack.customCats[id]) || id);
  for(let i=0;i<CAT_ICON_HINTS.length;i++){
    if(CAT_ICON_HINTS[i][0].test(label)) return CAT_ICON_HINTS[i][1];
  }
  return CAT_ICON_MUSIC[catHash(id)%CAT_ICON_MUSIC.length];
}
function catIconSvg(id,cls){
  const k=catIconKey(id);
  if(!k||!CAT_ICONS[k]) return "";
  return '<svg class="'+(cls||"cat-ic")+'" viewBox="0 0 20 20" aria-hidden="true" focusable="false">'+catIconInner(k)+'</svg>';
}
/* drawPills() wraps this to repaint the tab accents; the wrapper sits beside syncTabAccent. */
function drawPillsCore(){
  /* The + button is the bar's one focusable control, and a redraw replaces its node
     UNDER a keyboard user's focus when the language key or the tab key redraws the bar's
     labels. Text fields keep focus through such a switch by not being redrawn; the +
     earns the same by hand. */
  const addHadFocus=document.activeElement&&document.activeElement.classList
    &&document.activeElement.classList.contains("pill-add");
  pills.innerHTML="";
  const hc=intentCats();
  const mk=(id,label,n,drag)=>{
    const b=document.createElement("div");
    let extra="";
    const on = id ? cats.indexOf(id)>-1 : cats.length===0;   // "All" is on when nothing is
    // Keep intent/always hints even when the pill is selected (combined with .on in CSS).
    if(id){
      if(hc.specific.indexOf(id)>-1) extra=" hint2";        // issue-relevant - green ring
      else if(hc.always.indexOf(id)>-1) extra=" hint";      // always needed - blue ring
    }
    b.className="pill"+(on?" on":"")+extra
      +((searchCounts() && id && !n) ? " pill-nohit" : "");
    // Count including 0 - an empty category gets a 0 badge rather than no badge.
    // esc(label): names come from catalogs and renames - Import promises the file is
    // "read as data, never executed", and an unescaped label here broke that promise.
    b.innerHTML=(id
        ?catIconSvg(id)
        :'<svg class="e-pillall" viewBox="0 0 20 20" aria-hidden="true" focusable="false">'+ICON_ALL+'</svg>')
      /* data-i18n-skip: a category name belongs to whoever wrote the catalog. #pills lives
         inside <header>, which translateChrome sweeps - without the marker, a label that
         collided with an engine string was silently rewritten the moment the interface
         went Polish. All is unaffected: its label goes through t() at the call site. */
      +'<span class="pill-lab" data-i18n-skip>'+esc(label)+'</span>'
      /* ONE SLOT, TWO STATES: the card count, and a pencil while Ctrl is held. The pencil
         replaces the COUNT, which every category pill has - so every category is editable,
         which earlier shapes could not manage. Deleting lives in the editor the pencil
         opens, greyed with a reason instead of simply not existing. Same mechanic as the
         panel's star-to-hide swap, same body class, same instant-CSS reason. */
      +(id
        ? '<span class="pill-r">'
          +((n||n===0)?'<b>'+n+'</b>':"")
          +'<span class="pill-e" data-editcat="'+esc(id)+'" title="'+esc(t("Edit this category's names, icon and colour"))+'" aria-label="'+esc(t("Edit this category"))+'">'+ICON_EDIT+'</span>'
          +'</span>'
        : ((n||n===0)?" <b>"+n+"</b>":""));
    b.dataset.k=id;
    const _cs=catSlot(id);
    if(_cs>=0) b.dataset.ec=_cs;
    if(id){
      let tip=t("Click to filter · Ctrl+click to add/remove · drag to reorder");
      /* Green describes what the category HOLDS - a card linked to the chosen intent. Blue
         describes the category itself. */
      tip+=" · "+t("hold Ctrl to edit it");
      if(extra.indexOf("hint2")>-1) tip+=" · "+t("Green ring: holds a card linked to the chosen intent");
      else if(extra.indexOf("hint")>-1) tip+=" · "+t("Blue ring: a supporting category");
      b.title=tip;
    }
    if(drag && dragState && dragState.moved && dragState.key===id) b.classList.add("dragging");
    b.onclick=ev=>{
      if(suppressClick){ suppressClick=false; return; }   // finished a drag, not a click
      catsDropArmed=false;                                 // chosen by hand outranks the arming
      /* Before the pill's own handler, and stopping the event dead: a Ctrl+click on a pill means
         "add this category to the selection", and the pencil sits inside the pill. */
      const ed=ev&&ev.target&&ev.target.closest?ev.target.closest("[data-editcat]"):null;
      if(ed){ ev.preventDefault(); ev.stopPropagation(); openCategoryEditor(ed.getAttribute("data-editcat"),true); return; }
      // Captured before cats changes, so the rail's echo animates from where it really was
      const railBefore=captureRail(), relBefore=railRelKeys();
      if(!id){ cats=[]; }                                  // "All" clears the filter
      else if(ev && (ev.ctrlKey||ev.metaKey)){             // ctrl+click adds/removes
        const at=cats.indexOf(id);
        if(at>-1) cats.splice(at,1); else cats.push(id);
      }
      else cats = (cats.length===1 && cats[0]===id) ? [] : [id];
      // Opening a category while an intent is selected → jump to its linked entries
      pendingScrollHit=!!intentIdxs.length;
      drawPills(); render();
      railEchoRedraw(railBefore, relBefore);
      scrollRailTop();
      scheduleTabSave();
    };
    // Pointer-based dragging. HTML5 drag-and-drop gave a no-drop cursor and never
    // fired drop; pointer events also let the list reorder live, under the cursor.
    if(drag) b.onpointerdown=e=>{
      if(e.pointerType==="touch") return;   // taps are taps - see the rail rows for the story
      if(e.button!==0) return;
      if(e.target.closest&&e.target.closest("[data-editcat]")) return;   // the pencil is not a drag handle
      // clear any stale suppression: a drag that ended over a different pill fires its
      // click on the container, so the flag would otherwise swallow the NEXT real click
      suppressClick=false;
      dragState={key:id,x:e.clientX,y:e.clientY,moved:false};
    };
    pills.appendChild(b);
  };
  const _sc=searchCounts();
  const PN=k=>_sc ? (k==="" ? (_sc.__all||0) : (_sc[k]||0))
                  : (k==="" ? totalMacroCount() : (counts[k]||0));
  mk("",t("All"),PN(""),false);   // cards, like every other pill - not cards
  // double-click "All" restores the original order
  pills.firstChild.title=t("Show all categories; double-click to reset their order");
  pills.firstChild.ondblclick=()=>animateReorder(()=>{
    catOrder=Object.keys(CATS);
    nsDel("CatOrder");
  });
  displayCatOrder(hc).forEach(k=>{
    if(!CATS[k]) return;
    mk(k,CATS[k],PN(k),true);          // empty categories included, with a 0 badge
  });
  /* "+" sits after the last category, mirroring Manage's. Appended outside catOrder and
     not draggable - a control, not a category. A real <button>, the bar's only focus
     stop: pills are drag-and-toggle surfaces, this one ACTS, and a button is what a click,
     a screen reader and Enter expect of it. Focus is not walked on this screen - Tab and
     Shift+Tab are bound, the owner's call - so a click is its way in. The drag logic keys
     off dataset.k, which this never carries. */
  const add=document.createElement("button");
  add.type="button";
  add.className="pill pill-add";
  add.innerHTML=ICON_PLUS;         // drawn, not typed - see .pill-add for why
  add.title=t("Add a category");
  add.setAttribute("aria-label",t("Add a category"));
  add.onclick=()=>startPillCatAdd(add);
  pills.appendChild(add);
  if(addHadFocus) add.focus();
  // Two rAFs: wait for layout after DOM rebuild, then measure overflow.
  schedulePillsCollapse();
}
/** Inline category creation from the pill strip. Same contract as the Manage chip: type,
 *  Enter to accept, Esc or an empty blur to cancel. */
function startPillCatAdd(addEl){
  if(!pills || pills.querySelector(".pill-new")) return;
  const wrap=document.createElement("div");
  wrap.className="pill pill-new";
  wrap.innerHTML='<input type="text" placeholder="'+esc(t("New category"))+'" spellcheck="false" autocomplete="off">';
  pills.insertBefore(wrap, addEl);
  addEl.hidden=true;
  const inp=wrap.querySelector("input");
  const finish=ok=>{
    const name=inp&&inp.value?inp.value.trim():"";
    wrap.remove();
    addEl.hidden=false;
    if(!ok||!name) return;
    ensureCustomCat(name);
    rebuildCards();
    toast("Category added");
  };
  inp.focus();
  /* Keyboard exits hand focus back to the +; a mouse-blur leaves it where the user
     clicked. Queried, not the captured addEl: accepting rebuilds the bar and the
     closure's node is detached - the query finds the fresh one (and IS the captured one
     on the cancel path, where nothing redraws). */
  const refocus=()=>{ const a=pills.querySelector(".pill-add")||addEl; a.focus(); };
  // stopPropagation, or Enter and Esc also reach the app's global shortcut handling
  inp.onkeydown=e=>{
    if(e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); finish(true); refocus(); }
    else if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); finish(false); refocus(); }
  };
  inp.onblur=()=>{ setTimeout(()=>{ if(document.activeElement!==inp) finish(!!(inp.value&&inp.value.trim())); },0); };
}

// FLIP: measure where every pill is, apply the change, then animate each one from
// its old box to its new one. Cheap, and it survives pills wrapping to a new line.
/* FLIP split in two halves so the capture can precede a state change that is not a
   simple mutate() callback - intent selection regroups the pills from several call
   sites, and those sites capture, change, redraw, then flip. Opt-in per call site rather
   than folded into drawPills(): most callers (tab restore, rename, wipe) should redraw
   instantly with no motion. */
/** Rects of every pill, keyed by category key. The "first" half of a FLIP. */
/* THE FLIPS ANSWER THE SWITCH AT THEIR CAPTURE: one handed nothing plays nothing, and every
   caller already treats an empty capture as "redraw, do not animate". Same in the two below. */
function capturePills(){
  if(mgReduceMotion()) return null;
  const before={};
  pills.querySelectorAll(".pill").forEach(p=>{ if(p.dataset.k) before[p.dataset.k]=p.getBoundingClientRect(); });
  return before;
}
/** The "invert and play" half. Call after the pills have been redrawn in their new order. */
/* READ EVERY POSITION FIRST, THEN WRITE EVERY TRANSFORM: a rect read after a style
   write forces a full layout PER PILL - interleaved, this was 25.6ms of a 180ms
   animation budget. Split, each pass is one layout. */
/* ---- THE PAINT PUMP ---------------------------------------------------------------------
   Some Firefox setups do not produce frames for a running CSS transition. The transition itself
   is fine: it starts, it reports the right duration, and it fires transitionend at the right
   moment - a log of transitionrun/start/end on .rail-item showed clean pairs ending at 180, 207
   and 218ms, matching Chrome exactly. What never happens is the painting in between, so the row
   sits at its inverted start position and then appears at the destination. Everything about it
   reads as "the animation did not run" and none of it is true.
   What proved it: an empty requestAnimationFrame loop, running and doing nothing else, makes
   every animation in the app correct. Turn the loop off and they break again. Diagnosed on
   Firefox 153 against Chrome 151 on the same machine, both reporting prefers-reduced-motion
   false, identical transition durations, hardware acceleration on, and a display running at
   roughly 233Hz - which is the territory these refresh-driver faults live in. Present as far
   back as 1.3.0, so it has never worked there.
   So: whenever an animation starts, keep asking for frames until a little after the last one
   began. A no-op rAF callback is close to free, it only runs while something is animating, and
   on a browser that ticks itself properly it changes nothing at all.
   Deadline rather than a counter, deliberately. Counting starts against ends means one missing
   transitioncancel leaks a permanent loop; a deadline that each new event pushes forward cannot
   leak, and the worst case is 500ms of empty callbacks after the last animation.
   500ms because the longest thing here is 220ms and this only has to outlive it. */
let ePumpUntil=0, ePumping=false;
function ePumpFrame(){
  if(performance.now()>=ePumpUntil){ ePumping=false; return; }
  requestAnimationFrame(ePumpFrame);
}
function eKickPump(){
  ePumpUntil=performance.now()+500;
  if(!ePumping){ ePumping=true; requestAnimationFrame(ePumpFrame); }
}
/* Capture phase, on the document: transitionrun and animationstart both bubble, but capture
   catches them even where a handler stops propagation. Reduced motion needs no guard - it
   produces no animations, so no events, so no pump. */
["transitionrun","animationstart"].forEach(function(t){
  document.addEventListener(t, eKickPump, true);
});

function flipPills(before){
  if(!before) return;
  const moved=[], deltas=[], wEls=[], wStarts=[];
  pills.querySelectorAll(".pill").forEach(p=>{
    const k=p.dataset.k, b=k&&before[k];
    if(!b) return;
    const a=p.getBoundingClientRect();
    /* Width changes ride the same flip - a selection bolds the name, a recount changes the
       digits, and either snapping while neighbours slide reads as a glitch. 1.5px floor:
       fractional DPRs round every pill differently on every pass. */
    if(Math.abs(b.width-a.width)>=1.5){ wEls.push(p); wStarts.push(b.width); p.dataset._eW=a.width; }
    // whole pixels only - fractional offsets put the text on a half-pixel and it blurs
    const dx=Math.round(b.left-a.left), dy=Math.round(b.top-a.top);
    if(!dx && !dy) return;
    moved.push(p); deltas.push(dx+"px,"+dy+"px");
  });

  /* WILL-CHANGE set with the INVERT - the forced reflow between the passes makes the
     layer exist before the animation starts; asked at animation time it buys nothing.
     Cleared with the transform: an idle layer is memory for nothing. Needed because this
     runs while the main thread is busy - Chrome composites animated transforms
     regardless, Firefox falls back to the main thread without the promotion. */
  moved.forEach((p,i)=>{
    p.style.transition="none";
    p.style.willChange="transform";
    p.style.transform="translate("+deltas[i]+")";
  });
  /* Width rides the SAME transition string as the slide - two tweens fighting over
     style.transition left whichever wrote last, and the other snapped. */
  const hNat=pills.scrollHeight;   // through the clip - see the note at tweenPillWidths
  wEls.forEach((p,i)=>{ if(moved.indexOf(p)<0) p.style.transition="none"; p.style.width=wStarts[i]+"px"; });
  if(!moved.length && !wEls.length) return;
  /* Commit the inverted position before attaching the transition. A frame is not a commitment:
     these elements were often created by the re-render a moment ago, and if the browser never
     computes a style with the transform applied it has no start value to animate from. Chrome
     happened to commit it inside the rAF and animated; Firefox did not, and the row simply
     appeared in its new place. One forced reflow, then attach and release in the same task -
     which also removes the rAF that a background tab would otherwise pause indefinitely. */
  void pills.offsetHeight;
  /* Height is the invariant - see tweenPillWidths. A rolled-back width still slides. */
  if(wEls.length && pills.scrollHeight!==hNat){
    wEls.forEach(p=>{ p.style.width=""; delete p.dataset._eW; });
    wEls.length=0;
  }
  const T=".18s "+E_EASE;
  moved.forEach(p=>{ p.style.transition="transform "+T+(wEls.indexOf(p)>=0?", width "+T:""); p.style.transform=""; });
  wEls.forEach(p=>{ if(moved.indexOf(p)<0) p.style.transition="width "+T; p.style.width=p.dataset._eW+"px"; });
  setTimeout(()=>{
    moved.forEach(p=>{ p.style.transition=""; p.style.transform=""; p.style.willChange=""; });
    wEls.forEach(p=>{ p.style.transition=""; p.style.width=""; delete p.dataset._eW; });
  },200);
}
function animateReorder(mutate){
  const before=capturePills();
  mutate();
  drawPills();
  flipPills(before);
}
/* FLIP for cards when an intent re-sorts them. Same two-half shape as the pills, but
   cards need guards the pills do not, because a card list is not a pill strip:
   - MEMBERSHIP must be identical. Macro search removes 175 of 199 entries; that is a filter,
     not a reorder, and there is nothing to interpolate for a card that no longer exists.
   - SIZE cap. In the All view an intent re-sort moves 197 cards a median of 1747px and a
     maximum of 42861px. A card crossing 42861px in a fifth of a second is a blur artifact,
     and it would mean 199 transform layers.
   - TRAVEL cap per card, for the same reason at the level of a single card.
   - VIEWPORT filter. Cards are ~274px tall, so about three are on screen; animating the rest
     is invisible work.
   - SCROLL-TOP only. pickIntent sets pendingScrollHit, and render() then smooth-scrolls to
     the first linked entry, which can be a 12000px journey. Animating card positions under a
     viewport travelling that far reads as chaos. Near the top that scroll is a no-op, which
     is exactly when the animation is worth having, so the two never run at once. */
/* No cap on how many cards are on the PAGE. The old 25-cap meant a real catalog never
   animated - the measurement was of the wrong thing: an intent pick moves ~200 cards,
   but only NINE are anywhere near the viewport. What has to be capped is TRANSFORMS,
   which the viewport filter and CARD_MOVE_MAX below already do - the same shape
   flipCardsAround() uses for star and hide. */
/* Travel cap at half a viewport (~1.5 cards): far enough to watch a card change
   places, not far enough to be mistaken for the page scrolling - long moves read as
   unwanted auto-scroll, never as swaps. */
const CARD_FLIP_TRAVEL_VH=0.5;
const CARD_FLIP_SCROLL_TOP=80;     // only when the auto-scroll will not move the view
function captureCards(){
  if(!list || mgReduceMotion() || pageScrollY()>CARD_FLIP_SCROLL_TOP) return null;
  const els=list.querySelectorAll(".card[data-id]");
  if(!els.length) return null;
  /* Positions for the cards near the viewport, plus the total count. The count is what
     tells a REORDER from a FILTER: a search removes most of the list, and there is
     nothing to interpolate for a card that no longer exists. The captured subset cannot
     say that - it is meant to be smaller than the list. */
  const margin=window.innerHeight;
  const tops={};
  let n=0;
  els.forEach(c=>{
    n++;
    const r=c.getBoundingClientRect();
    if(r.bottom>-margin && r.top<window.innerHeight+margin) tops[c.dataset.id]=r.top;
  });
  return {n:n, tops:tops};
}
function flipCards(before){
  if(!before || !list) return;
  const els=Array.prototype.slice.call(list.querySelectorAll(".card[data-id]"));
  // Identical membership only - a filter is not a reorder.
  if(!els.length || els.length!==before.n) return;
  /* Honest rects: the render that preceded this replaced every node, and
     content-visibility:auto resolves relevancy a frame later - a rect read now sees the
     220px estimate, not the card. Forcing the property on the watched cards makes their
     rects real; the scroll-top gate in captureCards() means nothing estimated sits above
     them, so real is also correct. Released with the transition cleanup, or on any bail. */
  const watched=[];
  els.forEach(c=>{ if(before.tops[c.dataset.id]!=null){ watched.push(c); c.style.contentVisibility="visible"; } });
  const release=()=>watched.forEach(c=>{ c.style.contentVisibility=""; });
  const limit=window.innerHeight*CARD_FLIP_TRAVEL_VH, margin=window.innerHeight;
  const moved=[], dys=[];
  watched.forEach(c=>{
    const b=before.tops[c.dataset.id];
    const r=c.getBoundingClientRect();
    if(r.bottom<-margin || r.top>window.innerHeight+margin) return;
    // whole pixels only - fractional offsets put the text on a half-pixel and it blurs
    const dy=Math.round(b-r.top);
    if(!dy || Math.abs(dy)>limit) return;
    moved.push(c); dys.push(dy);
  });
  if(!moved.length || moved.length>CARD_MOVE_MAX){ release(); return; }
  moved.forEach((c,i)=>{ c.style.transition="none"; c.style.willChange="transform";
                         c.style.transform="translateY("+dys[i]+"px)"; });
  const clear=()=>{ moved.forEach(c=>{ c.style.transition=""; c.style.transform=""; c.style.willChange=""; }); release(); };
  // Commit the invert before attaching the transition - see the note in flipPills().
  void list.offsetHeight;
  moved.forEach(c=>{ c.style.transition="transform .22s "+E_EASE; c.style.transform=""; });
  setTimeout(clear,280);
}
function movePill(from,to){
  animateReorder(()=>{ catOrder.splice(to,0,catOrder.splice(from,1)[0]); });
}

// Listeners live on the document, not the pill: drawPills() destroys and rebuilds the
// pills mid-drag, so anything bound to the element itself would die on the first swap.
addEventListener("pointermove",e=>{
  if(!dragState) return;
  if(!dragState.moved){
    if(Math.abs(e.clientX-dragState.x)+Math.abs(e.clientY-dragState.y)<5) return;
    dragState.moved=true;
    document.documentElement.classList.add("pilldrag");
    const el=pills.querySelector('.pill[data-k="'+dragState.key+'"]');
    if(el) el.classList.add("dragging");
  }
  // one swap at a time: without this the pill lands under the cursor again and the
  // two of them trade places over and over while the pointer sits still
  if(Date.now()-swapLock < 190) return;
  const under=document.elementFromPoint(e.clientX,e.clientY);
  const t=under && under.closest ? under.closest(".pill") : null;
  if(!t || !t.dataset.k || t.dataset.k===dragState.key) return;
  // With an intent selected the pills are grouped green → blue → rest, so only allow a
  // swap inside the same band. Across bands the pill would snap back to its group on the
  // next draw and the drop would look like it failed. (Same rule as card drag.)
  if(intentIdxs.length){
    const hc=intentCats();
    if(pillBand(dragState.key,hc)!==pillBand(t.dataset.k,hc)) return;
  }
  const from=catOrder.indexOf(dragState.key), to=catOrder.indexOf(t.dataset.k);
  if(from<0||to<0) return;
  swapLock=Date.now();
  movePill(from,to);                       // reorders live, each swap animated
},{passive:true});

addEventListener("pointerup",()=>{
  if(!dragState) return;
  if(dragState.moved){
    nsSet("CatOrder",JSON.stringify(catOrder));
    suppressClick=true;                    // don't let the release toggle the filter
    document.documentElement.classList.remove("pilldrag");
    pills.querySelectorAll(".pill").forEach(p=>p.classList.remove("dragging"));
  }
  dragState=null;
});
addEventListener("pointercancel",()=>{
  if(dragState && dragState.moved){
    document.documentElement.classList.remove("pilldrag");
    pills.querySelectorAll(".pill").forEach(p=>p.classList.remove("dragging"));
  }
  dragState=null;
});

/* A CARD KEYWORD REACHES ITS INTENTS ONLY IF IT IS RARE. The median intent inherits 40 of
   them, so handing over all of them matched 62 of 73 rows on two letters. Rarity is counted in
   INTENTS REACHED, the thing the list narrows: a word reaching twenty cannot narrow it, one
   reaching a single intent is the point. The cap also bounds the surprise - a term matches only
   keywords equal to it, and those survive only under the cap, so NO KEYSTROKE ADDS MORE ROWS
   THAN THIS. Self-policing: spread an acronym over too many cards and it drops out. */
const INTENT_KW_REACH_MAX=2;
let eIntentKw=null;                    // idx -> Set of rare keywords; dropped by recountMacros
/* Dropped from recountMacros; see setCatalogCatLooks. */
function dropIntentKeywords(){ eIntentKw=null; }
function intentKeywords(){
  if(eIntentKw) return eIntentKw;
  const per=new Map(), reach=new Map();
  (cards||[]).forEach(m=>{
    if(!m || m._hidden || !m.k) return;   // a hidden card lends no vocabulary, as in macro search
    const ws=splitWords(foldDiacritics(String(m.k).toLowerCase()));
    (m.intents||[]).forEach(i=>{
      let set=per.get(i); if(!set){ set=new Set(); per.set(i,set); }
      ws.forEach(w=>set.add(w));
    });
  });
  per.forEach(set=>set.forEach(w=>reach.set(w,(reach.get(w)||0)+1)));
  const out={};
  per.forEach((set,i)=>{
    const keep=new Set();
    set.forEach(w=>{ if(reach.get(w)<=INTENT_KW_REACH_MAX) keep.add(w); });
    out[i]=keep;
  });
  eIntentKw=out;
  return out;
}
// multi=true (ctrl held) toggles the clause in the set; otherwise it replaces it
/* THE RINGS WITHOUT THE REORDER. Measured in Firefox: toggling these classes across every
   card costs 2ms, while re-ordering the same cards costs 34ms of forced layout - so the
   answer to "did my click land" is separable from the work of moving the list, and only the
   first has to happen in the click's own frame. Uses the renderer's own two predicates; only
   the class names are stated twice, and they pair with the .card markup in render(). */
/* The clicked row answers for itself, in its own frame. The rail is redrawn and re-ordered
   by the scheduled half, and these elements are replaced when it is - this only spares the
   row you just pressed from sitting unlit while that runs. Sticky stays inert here: the
   stacked `top` arrives with the redraw. */
function paintRailSelection(){
  const box=$("#intentRailList");
  if(!box) return;
  const sel=new Set(intentIdxs.map(String));
  box.querySelectorAll(".rail-item[data-si]").forEach(el=>{
    el.classList.toggle("on", sel.has(el.dataset.si));
  });
}
/* A RING ARRIVES WITH THE CLICK AND LEAVES WITH THE CARD. Additions only: the cards that
   answer the new intent are usually below the fold, so clearing the outgoing rings here
   empties the visible list of green for the length of the tail - a blackout, when what
   actually happened is a handover. The stale rings clear in render(), which rebuilds the
   markup anyway, in the same frame the cards re-sort out of view.
   Write only where it CHANGES: a dozen cards gain a ring on a pick and two hundred do not,
   and an unconditional toggle dirties every one of them - restyle and repaint stolen from
   the animation starting in the same breath. */
function paintIntentRings(){
  if(!list) return;
  list.querySelectorAll(".card[data-id]").forEach(el=>{
    const m=findCard(el.getAttribute("data-id"));
    if(!m) return;
    const green=el.classList.contains("intent-hit");
    if(cardHitsSelectedIntent(m)){
      if(!green) el.classList.add("intent-hit");
      el.classList.remove("cat-hit");        // green wins, and CSS order would say otherwise
    } else if(!green && !el.classList.contains("cat-hit") && cardHitsAlwaysCat(m)){
      el.classList.add("cat-hit");
    }
  });
}
/* A PICK IS THREE ACTS, AND THEY DO NOT SHARE A THREAD. The rings answer in the click's own
   frame; the panel and the bar redraw and glide in the next; the card list - the expensive
   one - waits for that glide to finish. Measured in Firefox: the rail animation alone runs
   twelve clean frames from 204px to 6px, and the same animation with the list rebuild beside
   it manages three, because a 100ms rebuild plus the paint of 253 cards eats the frames the
   transition needed. Chrome is fast enough that the overlap never showed.
   Cancelled by the next pick, so a Ctrl run renders once at the end. rAF with a timeout
   behind it: rAF does not run in a hidden tab, and a pick made just before a tab switch must
   still land - there the belt runs both acts back to back, which is the right answer when
   nothing is being watched. */
let ePickTailRAF=0, ePickTailT=0, ePickTailT2=0;
function schedulePickTail(paint, settle){
  cancelPickTail();
  let done=false;
  const run=()=>{
    if(done) return;
    done=true;
    if(ePickTailRAF) cancelAnimationFrame(ePickTailRAF);
    if(ePickTailT) clearTimeout(ePickTailT);
    ePickTailRAF=0; ePickTailT=0;
    const glideMs=paint()||0;
    ePickTailT2=setTimeout(()=>{ ePickTailT2=0; settle(); }, glideMs?glideMs+20:0);
  };
  ePickTailRAF=requestAnimationFrame(run);
  ePickTailT=setTimeout(run,32);
}
function cancelPickTail(){
  if(ePickTailRAF) cancelAnimationFrame(ePickTailRAF);
  if(ePickTailT) clearTimeout(ePickTailT);
  if(ePickTailT2) clearTimeout(ePickTailT2);
  ePickTailRAF=0; ePickTailT=0; ePickTailT2=0;
}
function pickIntent(idx,multi){
  // A plain pick consumes the semi-selection and ends any run; Ctrl means "and more".
  if(!multi){ railMarkUsed=true; semiKind=null; pickRun=false; }
  /* "And more" must be a CLAIM, not a leftover: the typed flow arrives surfaceless, and
     the card mark a render would then plant takes the arrows with it (markSurface reads a
     bare entrySel as card). Claimed the way railHoverClaim claims, so the rail walks on. */
  else{ pickRun=true; semiKind="intent"; railMarkUsed=false;
        if(entrySel){ entrySel=null; markEntrySel(); } }
  const pillsBefore=capturePills();   // pills regroup into bands below - animate the move
  const cardsBefore=captureCards();   // cards re-sort too; guards inside decide if it animates
  const railBefore=captureRail();     // chosen intents rise to the top of the panel
  if(multi){
    const at=intentIdxs.indexOf(idx);
    // Preserve pick order for {INTENT} and comment {ACTION}/{TOPIC} (no re-sort)
    if(at>-1) intentIdxs.splice(at,1); else intentIdxs.push(idx);
  } else {
    intentIdxs=[idx];
  }
  intentText="";
  /* CATEGORY FILTER AND QUERY BOTH DROP - an intent's cards span categories, and both
     filters hide what was just asked for: the pick's meaning is "show me this intent's
     full view". A query that survives the pick shows a filtered sliver of the linked
     cards, which stings more than the lost text. */
  if(intentIdxs.length){
    cats=[];
    if(intentEl && intentEl.value){ intentEl.value=""; railSel=-1; }
  }
  // Scroll to linked cards when the list already shows them (All, or the right cat).
  pendingScrollHit=!!intentIdxs.length;
  syncIntentInput();
  /* THE ANSWER IN THIS FRAME, THE WORK IN THE NEXT, AND THE ANIMATIONS AFTER IT. The rings
     and the box are the click's receipt and cost 2ms, so they land immediately. Everything
     expensive is scheduled - and the three flips go WITH it, after the rebuild rather than
     before, because a transition started on this side of a 100ms rebuild spends its middle
     on a blocked thread and arrives looking like a jump. On the far side the thread is free
     and they play whole. The captures are still valid: nothing between the two frames moves
     a pill, a row or a card. */
  paintIntentRings(); paintRailSelection();
  schedulePickTail(()=>{
    drawPills(); drawIntentRail();
    if(multi && pickRun){
      // The resting mark for the next pick: the first unpicked row of the fresh order.
      let nm=-1;
      for(let i=0;i<railOrder.length;i++){ if(intentIdxs.indexOf(railOrder[i])<0){ nm=railOrder[i]; break; } }
      railMarkIdx = nm>=0 ? nm : (railOrder.length?railOrder[0]:-1);
      railSel=-1;
      railDecorate(true);
    }
    flipPills(pillsBefore);
    // The rows just selected must animate however far they came - see flipRail().
    return flipRail(railBefore,new Set(intentIdxs.map(String)));
  },()=>{ render(); flipCards(cardsBefore);
           // unpicking the last one is a clear - see clearIntents()
           if(!intentIdxs.length) scrollPageTop(); });
  scheduleTabSave();
}

// ---- intent side rail. pbRail "0" = prefer off; wanted docks if wide enough OR
// locked open, else auto-hide with left-edge hover / Ctrl reveal. Dock threshold: 2.5
// panel widths, derived from --rail-max so a width change moves it - the old hardcoded
// 1400px matched .shell's max and undocked on every 1366/1440 laptop.
/* The user's width, applied before the dock threshold is computed - the threshold IS
   2.5x the panel width, so it must see the width the user chose. Clamped at both ends
   because the threshold is derived: an unbounded panel would push the auto-hide point
   past any real window and never dock at all. */
const RAIL_W_MIN=200, RAIL_W_MAX=520;
function railStoredWidth(){
  const v=parseFloat(lsGet("pbRailW")||"");
  return (v>=RAIL_W_MIN && v<=RAIL_W_MAX) ? v : 0;
}
function applyRailWidth(px){
  document.documentElement.style.setProperty("--rail-max", Math.round(px)+"px");
}
function applyStoredRailWidth(){ const w=railStoredWidth(); if(w) applyRailWidth(w); }
applyStoredRailWidth();
function railMaxWidth(){
  const v=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--rail-max"));
  return v>0 ? v : 268;
}
/* THE THRESHOLD IS THE COLUMN THE PANEL WOULD COST. Docked, the panel and its gap come out of
   the card box, so there is a band of window widths where the panel is the only reason a second
   column will not fit. The threshold is the bottom of that band: dock while the columns still
   fit beside the panel, hide the moment they would not. Derived rather than a ratio, because
   every term is something the user can move - the panel is draggable, the column floor is a
   slider, and the rem follows zoom. Single-column mode asks for one column, not two. */
const RAIL_DOCK_COLS=2;
/* THE COUNT MUST NEVER RISE AS THE WINDOW NARROWS. Docking costs the panel's footprint, so there
   is a band where keeping it shows one column while hiding it would show two; dock above that
   band and the sequence only falls. Half that footprint was tried as slack and rejected the same
   day: it puts the panel back inside the band, and shrinking then took the list from one column
   up to two. The room left once the panel hides IS its footprint, so that room and the rise are
   one fact from two sides, and there is nothing here to tune. */
function railDockMin(){
  const cs=getComputedStyle(document.documentElement);
  const px=(name,fallback)=>{ const v=parseFloat(cs.getPropertyValue(name)); return v>0?v:fallback; };
  const n=(colMode()==="1") ? 1 : RAIL_DOCK_COLS;
  const floor=colFloor();
  const rem=remPx();
  const need=n*floor*rem + (n-1)*COL_GAP;              // the card box those columns want
  const cost=railMaxWidth() + px("--rail-gap",18);      // what docking takes out of it
  /* THE REST IS ASKED, NOT ADDED UP. Between the window edge and the card box sit the page
     padding and a stable scrollbar gutter, and the gutter is a number no sum can know - it is
     the platform's, and `scrollbar-gutter:stable` means it is reserved whether or not anything
     scrolls. Summing the terms we can name came out 10px short here, which put the panel back
     in the band it was meant to leave. Constant by that same rule, so measuring it once per
     rebuild is enough. */
  const box=colBoxWidth();
  const chrome = box ? (window.innerWidth - box + (railDocked() ? 0 : cost))
                     : (cost + 2*px("--app-pad",14));
  return Math.round(need + chrome);
}
/* BUILT AT BOOT, not here: the terms above are declared further down the file, and nothing
   reads the panel's dock state before rebuildRailMQ() runs. Null until then, which reads as
   "does not fit" - the same answer the invisible pre-ready panel is already giving. */
let RAIL_DOCK_MIN=0;
let RAIL_MQ=null;
function railWanted(){ return lsGet("pbRail")!=="0"; }
// Auto-hide is the default (pbRailLock "1" opts into locking open). Settings and the panel's
// pin lock it open; the threshold is railDockMin() above.
function railLocked(){ return lsGet("pbRailLock")==="1"; }
function railFits(){ return !!RAIL_MQ && RAIL_MQ.matches; }
function railDocked(){ return railWanted() && (railFits() || railLocked()); }
/* Peek-on-hover covers BOTH ways of not being docked: switched off in Settings used to
   kill the edge, leaving only Ctrl. Off-but-reachable is a state worth having - "not
   eating my width" is not "never show me this" - so anything not docked peeks, unless
   the lock says otherwise. */
function railAutoHide(){ return !railLocked() && (!railWanted() || !railFits()); }
/* Hidden AND locked means the panel never appears BY ITSELF: no column, no hover. Ctrl still
   shows it, deliberately - see applyRailPeek. That is what the lock's sentence actually says:
   THE PANEL STAYS AS IT IS, meaning it does not change on its own. Asking for it is not it
   changing. */
function railSuppressed(){ return !railWanted() && railLocked(); }
// True when the panel is visible in any form (docked column or overlay peek).
function railActive(){ return railDocked() || document.body.classList.contains("rail-peek"); }
// Bottom edge the fixed rail must clear: sticky header, plus expanded category
// pills (they overlay outside the header box on Ctrl/hover, so header height alone
// is not enough and the panel would cover the lower pill rows).
/* Which overlapping surface is in front follows the pointer; over BOTH or NEITHER,
   leave it exactly as it is - the shared strip is where flipping would change the answer
   under a still cursor, and leaving it alone is free hysteresis. GEOMETRY, not :hover:
   the covered surface receives no hover events, so the DOM can only ever name the one
   already in front. */
/* Rows, by distinct top edges, counted from the CHILDREN - a pill-size change cannot
   quietly turn four rows into five while the eye still sees four. Rounded to the pixel:
   flex-wrap aligns to a hair. The bar is clipped, not reflowed, when collapsed, so this
   reports the count the bar WOULD have open - which is the question. Called last, after
   the cheap rect test: it walks every pill. */
/* DOES THE BAR REACH THE INTENTS - asked of the GEOMETRY, not a row-count proxy that
   drifts with zoom. Not the head's lock/clear: chrome, and swapping the stack for it
   jumps the bar while nothing readable is hidden. Tested against the LIST CONTAINER, not
   the first row - the container's top IS where intents start and it is scroll-proof.
   Both axes, because the two always share rows. */
function railIntentsCovered(p){
  const box=document.getElementById("intentRailList");
  if(!box || box.offsetParent===null) return false;
  const b=box.getBoundingClientRect();
  if(!b.width || !b.height) return false;
  return b.top<p.bottom && b.bottom>p.top && b.left<p.right && b.right>p.left;
}
let overlapPt=null, overlapRAF=0;
function applyOverlapOrder(){
  const body=document.body;
  /* Either way the panel can be on screen: rail-on is DOCKED, rail-peek the Ctrl/edge
     overlay. Only the docked one was admitted here, so the arbitration returned on its
     first line in exactly the case it exists for - an unlocked panel, peeked open over an
     expanded bar. */
  if(!(body.classList.contains("rail-on") || body.classList.contains("rail-peek")) || !overlapPt) return;
  const rail=document.getElementById("intentRail");
  const pills=document.querySelector(".pills-slot .pills");
  if(!rail||!pills) return;
  const r=rail.getBoundingClientRect(), p=pills.getBoundingClientRect();
  /* They have to actually meet. A collapsed bar never reaches the panel, so this is also what
     stops a decision being taken when there is nothing to decide. Cheap, and checked first. */
  if(!(r.left<p.right && p.left<r.right && r.top<p.bottom && p.top<r.bottom)) return;
  /* AND it has to reach the intents themselves. Covering the panel's caption, hint or buttons is
     not a conflict worth shuffling the stack for - only a hidden intent is. */
  if(!railIntentsCovered(p)) return;
  const inR=overlapPt.x>=r.left&&overlapPt.x<=r.right&&overlapPt.y>=r.top&&overlapPt.y<=r.bottom;
  const inP=overlapPt.x>=p.left&&overlapPt.x<=p.right&&overlapPt.y>=p.top&&overlapPt.y<=p.bottom;
  if(inR&&!inP) body.classList.add("rail-over-pills");
  else if(inP&&!inR) body.classList.remove("rail-over-pills");
}
/* Coalesced to one frame: mousemove fires far faster than anything can be seen, and this reads two
   bounding boxes. */
function scheduleOverlapOrder(){
  if(overlapRAF) return;
  overlapRAF=requestAnimationFrame(()=>{ overlapRAF=0; applyOverlapOrder(); });
}
addEventListener("mousemove",e=>{
  overlapPt={x:e.clientX,y:e.clientY};
  scheduleOverlapOrder();
},{passive:true});
/* AND WHENEVER THE BAR ITSELF MOVES: a peek is press-Ctrl, look, release - pointer
   perfectly still - and the one pass the keypress scheduled ran mid-transition, before
   the bar reached the intents, so "no conflict" stood for the whole peek. A
   ResizeObserver on the bar catches the transition's end and every other way the bar
   changes height, with nothing having to remember to call this. The last known pointer
   position is still the input; only the trigger is new. */
function watchPillBarHeight(){
  const bar=document.getElementById("pills");
  if(!bar || typeof ResizeObserver!=="function") return;
  new ResizeObserver(scheduleOverlapOrder).observe(bar);
}
watchPillBarHeight();
function railClearanceTop(){
  let bottom=0;
  const header=document.querySelector("header");
  if(header) bottom=Math.max(bottom, header.getBoundingClientRect().bottom);
  /* The pill bar is deliberately NOT measured here: expanding it does not grow the
     header - the slot holds two lines and the pills overlay what is below, so the panel
     clears the header only and the expanded bar draws over it (docked sits one z below
     the pills; a peek stays above at 55). When they overlap, the cursor decides - see
     applyOverlapOrder. */
  return Math.ceil(bottom) + 8;
}
// Fixed rail geometry: clear header + any expanded pills (docked + peek).
// Docked also aligns left/width to .rail-slot so page scroll never shifts it.
function syncRailGeometry(){
  const root=document.documentElement;
  /* Until this has run once, --rail-top/left are unset and the CSS falls back to the
     window's own corner - the panel painted there and then jumped, exactly where the
     fade-in should be. rail-ready holds it invisible until a real position exists; the
     first appearance is in place, and it fades. */
  document.body.classList.add("rail-ready");
  const top=railClearanceTop();
  const h=Math.max(160, Math.round(window.innerHeight - top - 8));
  root.style.setProperty("--rail-top", top + "px");
  root.style.setProperty("--rail-h", h + "px");

  const slot=$("#railSlot")||document.querySelector(".rail-slot");
  const dockedNow=railDocked();
  if(slot && dockedNow){
    /* Only the LEFT edge is measured. The width was measured too and raced the column's
       animation - sampled half-open, the panel pinned to whatever width it caught. Nothing
       to measure any more: the column is exactly var(--rail-max), known rather than
       sampled. The left edge is safe at any moment - the first column starts at the
       shell's content-box edge whatever its width. */
    const slotRect=slot.getBoundingClientRect();
    root.style.setProperty("--rail-left", Math.round(slotRect.left) + "px");
  }
  /* --rail-x is "wherever the panel is right now" - the only left the BASE rule reads.
     Docked and peek sit at different x, and without this a dismissed peek snapped
     sideways the instant a state class dropped. Written only while the panel is VISIBLE:
     a panel already fading keeps the x it was using. */
  if(document.body.classList.contains("rail-on")||document.body.classList.contains("rail-peek")){
    root.style.setProperty("--rail-x", dockedNow
      ? (getComputedStyle(root).getPropertyValue("--rail-left").trim()||"10px")
      : "10px");
  }
  /* Deliberately no else clearing these: removing them mid-fade yanked the ground from a
     departing panel (the base rule reads them). Leaving the last values costs nothing -
     the peek overlay sets its own left and width. */
}
function scheduleRailGeometry(){
  // Two frames: wait for pills expand / header layout to settle first
  requestAnimationFrame(()=>requestAnimationFrame(syncRailGeometry));
  /* And a timeout that does not depend on rAF: rAF is paused in a background tab, and
     the panel is held invisible until this has run once - a background boot would have no
     intent panel until focus. Running twice is harmless; only derived values are written. */
  setTimeout(syncRailGeometry,60);
}
/* Holds a departing panel still for the frame that undocking spends relaying the list, then
   lets it fade - see body.rail-parting. The timeout is the same insurance scheduleRailGeometry
   carries: rAF does not run in a hidden tab, and a panel pinned for ever would be worse than
   an unanimated one. Idempotent, so both paths may fire. */
let railPartT=0;
function railPartHold(){
  document.body.classList.add("rail-parting");
  const go=()=>{ if(railPartT){ clearTimeout(railPartT); railPartT=0; }
                 document.body.classList.remove("rail-parting"); };
  /* Released on the first CHEAP frame rather than after a fixed count: the frame that relays
     the list is the long one and nobody knows in advance which it will be - two frames landed
     inside it and the fade still opened at 14%. A short gap from the frame before means the
     thread is free again. Five frames is the ceiling, so a busy tab still lets go. */
  let n=0, last=0;
  const wait=()=>{
    const now=performance.now();
    if(last && now-last<34){ go(); return; }
    last=now;
    if(++n>5){ go(); return; }
    requestAnimationFrame(wait);
  };
  requestAnimationFrame(wait);
  railPartT=setTimeout(go,140);
}
function syncRailLayout(){
  const wasVisible=document.body.classList.contains("rail-on")||document.body.classList.contains("rail-peek");
  const docked=railDocked();
  const autoHide=railAutoHide();
  document.body.classList.toggle("rail-on", docked);
  document.body.classList.toggle("rail-auto-hide", autoHide);
  if(docked){
    railEdgeHover=false;
    railTouchOpen=false;
  } else if(!autoHide){
    // Not auto-hide (settings-off, or locked handled above): edge hover does not apply
    railEdgeHover=false;
    railTouchOpen=false;
  }
  applyRailPeek();
  if(wasVisible && !(document.body.classList.contains("rail-on")
                     ||document.body.classList.contains("rail-peek"))) railPartHold();
  /* Coming back from hidden is the same problem as boot: rail-on lands immediately, the
     docked column exists a frame later, so the panel appeared at its fallback and jumped,
     drowning the fade. Dropping rail-ready holds it invisible for those two frames;
     scheduleRailGeometry() puts it back once there is a real position. */
  if(!wasVisible && (document.body.classList.contains("rail-on")||document.body.classList.contains("rail-peek"))){
    document.body.classList.remove("rail-ready");
  }
  const hit=$("#railHit");
  if(hit){
    hit.hidden=!autoHide;
    /* When neither applies the zone is hidden anyway, but the title still has to be true for the
       moment between states - and "Hold Ctrl" is a lie once the panel is locked away. */
    hit.title=t(autoHide
      ? "Hover here or hold Ctrl to show the intent panel"
      : "Hold Ctrl to show intents");
  }
  scheduleRailGeometry();
  syncRailPinBtn();
  syncSettingsMenu();
  schedulePillsCollapse();
  return docked;
}
/* Named, so rebuildRailMQ can move it to the new query. An anonymous listener could be added but
   never removed, and every resize would leave another one behind. */
function onRailMQChange(){
  syncRailLayout();
  drawIntentRail();
  render();
}
/* Call after anything the threshold is derived from: the panel's width, the column floor, the
   column mode. Re-reading is cheap; churning a matchMedia is not, so nothing calls this per
   pointer-move - see the drag handle, which rebuilds on release. */
function rebuildRailMQ(){
  if(RAIL_MQ){ try{ RAIL_MQ.removeEventListener("change",onRailMQChange); }catch(e){} }
  RAIL_DOCK_MIN=railDockMin();
  RAIL_MQ=matchMedia("(min-width:"+RAIL_DOCK_MIN+"px)");
  RAIL_MQ.addEventListener("change",onRailMQChange);
}

/* The handle itself. Appended rather than written into the markup so the panel's HTML stays what
   it was; nothing else needs to know this exists. */
function syncRailResizeUI(){
  const rail=$("#intentRail");
  if(rail) rail.classList.toggle("rail-fixed", railLocked());
}
function buildRailResizer(){
  const rail=$("#intentRail");
  if(!rail) return;
  const h=document.createElement("div");
  h.className="rail-resize"; h.id="railResize"; h.setAttribute("aria-hidden","true");
  rail.appendChild(h);
  let startX=0, startW=0, dragging=false;
  h.addEventListener("pointerdown",e=>{
    if(railLocked()) return;
    dragging=true; startX=e.clientX; startW=railMaxWidth();
    try{ h.setPointerCapture(e.pointerId); }catch(_){}
    document.documentElement.classList.add("raildrag");
    e.preventDefault();
  });
  h.addEventListener("pointermove",e=>{
    if(!dragging) return;
    applyRailWidth(Math.min(RAIL_W_MAX, Math.max(RAIL_W_MIN, startW + (e.clientX-startX))));
  });
  /* The threshold is rebuilt on RELEASE, not on every move: matchMedia is cheap to read and not
     cheap to churn, and a half-dragged width is not a state anything should react to. */
  function end(e){
    if(!dragging) return;
    dragging=false;
    try{ h.releasePointerCapture(e.pointerId); }catch(_){}
    document.documentElement.classList.remove("raildrag");
    lsSet("pbRailW", String(Math.round(railMaxWidth())));
    rebuildRailMQ();
    syncRailLayout();
    scheduleRailGeometry();
  }
  h.addEventListener("pointerup",end);
  h.addEventListener("pointercancel",end);
  /* Double-click returns to the stylesheet's own width, which is the only way back to a default
     once it has been dragged - there is no reset control and this panel has no room for one. */
  h.addEventListener("dblclick",()=>{
    if(railLocked()) return;
    document.documentElement.style.removeProperty("--rail-max");
    lsSet("pbRailW","");
    rebuildRailMQ(); syncRailLayout();
    toast("Intent panel width reset");
  });
  syncRailResizeUI();
}
buildRailResizer();
// Horizontal page shift (zoom, scrollbar appear) - keep left edge aligned
/* Elevated only while something is under it - see the header rule. Threshold 2px, so a
   resting page with sub-pixel scroll does not sit lit. Read from three places because
   which one moves depends on the layout; the greatest wins, so this survives a change. */
function syncHeaderElevation(){
  const y=Math.max(window.scrollY||0, pageScrollY());
  document.body.classList.toggle("e-scrolled", y>2);
}
/* BOUND TO THE SCROLLER, not the window: a scroll event fired at an element never reaches
   the window, so both of these go deaf the moment the page stops being the scroller. */
function wirePageScroll(){
  const el=pageScroller();
  const on=f=>{ if(el) el.addEventListener("scroll", f, {passive:true}); };
  on(syncHeaderElevation);
  on(()=>{ if(railDocked()) syncRailGeometry(); });
  on(scheduleCutScan);          // cards arriving from below have never been measured
  syncHeaderElevation();
}
wirePageScroll();
/* Observed, not enumerated: the pill bar changes height without a resize (filtering
   and renames reflow the rows), and every explicit caller was a place someone
   remembered - the forgotten ones left --rail-top stale. The observer catches every
   cause, including ones added later. */
if(typeof ResizeObserver==="function"){
  // The header moving changes where the panel starts, so its headroom is recomputed with the rail's.
  const railRO=new ResizeObserver(()=>{ scheduleRailGeometry(); syncFactsGeometry(); });
  ["header","#pillsSlot","#pills"].forEach(sel=>{
    const el=document.querySelector(sel);
    if(el) railRO.observe(el);
  });
  /* WHAT IS CUT IS A QUESTION ABOUT WIDTH, and the panel's own width answers to a drag handle
     as well as to the window. Observed rather than hung off the drag, which is one of several
     ways it changes; the scan is rAF-coalesced, so a drag costs one pass per frame. */
  const listEl=document.getElementById("intentRailList");
  if(listEl) new ResizeObserver(()=>scheduleCutScan()).observe(listEl);
}
// Ctrl/Cmd+wheel on a scrollable would zoom the page; scroll that element instead.
function bindCtrlWheelScroll(el, opts){
  if(!el) return;
  const isActive=opts&&opts.isActive;
  const scrollEl=opts&&opts.scrollEl;
  const force=opts&&opts.force;
  el.addEventListener("wheel",e=>{
    if(!(e.ctrlKey||e.metaKey) && !(typeof force==="function" && force(e))) return;
    if(typeof isActive==="function" && !isActive()) return;
    const target=(typeof scrollEl==="function" ? scrollEl() : scrollEl) || el;
    if(!target) return;
    e.preventDefault();
    let dy=e.deltaY;
    if(e.deltaMode===1) dy*=16;          // lines → px
    else if(e.deltaMode===2) dy*=target.clientHeight||1; // pages
    target.scrollTop+=dy;
  },{passive:false});
}
// Intent side panel
bindCtrlWheelScroll($("#intentRail"),{
  isActive:()=>railActive(),
  scrollEl:()=>$("#intentRailList")||$("#intentRail"),
  /* A pinned row sits above the scroller, so a wheel over it reaches nothing that scrolls;
     forwarded, the list moves under the hand as it did when the row was inside it. */
  force:e=>!!(e.target&&e.target.closest&&e.target.closest(".rail-item.on"))
});
// Left-edge hover (only while auto-hidden for space).
// Hit strip and panel are siblings, so keep peek while either is hovered
// (with a short leave delay so the pointer can move hit → panel).
function bindRailHit(){
  const hit=$("#railHit");
  const rail=$("#intentRail");
  if(!hit) return;
  let leaveT=0;
  function overRailZone(node){
    if(!node||node.nodeType!==1) return false;
    return hit===node||hit.contains(node)||(rail&&(rail===node||rail.contains(node)));
  }
  /* TOUCH GETS ITS OWN DOOR. Hover is a fiction on a touch screen: a tap synthesizes
     enter and leave in one burst and :hover sticks to the last tap - the overlay flapped
     and taps inside it died against hover bookkeeping. Touch pointers are excluded from
     the hover machinery and get a sticky state: tap the strip - open; tap outside -
     closed. Fine pointers keep the ambient hover unchanged. */
  function enterRailZone(e){
    if(e&&e.pointerType==="touch") return;
    if(!railAutoHide()) return;
    clearTimeout(leaveT);
    railEdgeHover=true;
    applyRailPeek();
  }
  function leaveRailZone(e){
    if(e&&e.pointerType==="touch") return;
    if(overRailZone(e.relatedTarget)) return;
    clearTimeout(leaveT);
    leaveT=setTimeout(()=>{
      // Still over hit or open panel? (covers relatedTarget=null gaps)
      if(hit.matches(":hover")||(rail&&rail.matches(":hover"))) return;
      railEdgeHover=false;
      applyRailPeek();
    }, 80);
  }
  hit.addEventListener("pointerenter",enterRailZone);
  hit.addEventListener("pointerleave",leaveRailZone);
  if(rail){
    rail.addEventListener("pointerenter",enterRailZone);
    rail.addEventListener("pointerleave",leaveRailZone);
  }
  // The sticky door. pointerup, so a scroll that merely starts on the strip does not toggle.
  hit.addEventListener("pointerup",e=>{
    if(e.pointerType!=="touch") return;
    if(!railAutoHide()) return;
    railTouchOpen=!railTouchOpen;
    applyRailPeek();
  });
  /* Outside-tap closes. Capture phase, so a handler inside the page stopping propagation
     cannot strand the panel open; the rail zone itself (strip included) never closes from
     here - the strip toggle above owns that. */
  addEventListener("pointerdown",e=>{
    if(e.pointerType!=="touch"||!railTouchOpen) return;
    if(overRailZone(e.target)) return;
    railTouchOpen=false;
    applyRailPeek();
  },true);
}
bindRailHit();

let railDrag=null, railSwapLock=0, railSuppressClick=false;
function animateRailReorder(mutate){
  const box=$("#intentRailList");
  if(!box || mgReduceMotion()){ mutate(); drawIntentRail(); return; }
  const before={};
  box.querySelectorAll(".rail-item").forEach(p=>{ before[p.dataset.si]=p.getBoundingClientRect(); });
  mutate();
  drawIntentRail();
  const moved=[];
  box.querySelectorAll(".rail-item").forEach(p=>{
    const k=p.dataset.si, b=k!=null&&before[k];
    if(!b) return;
    const a=p.getBoundingClientRect();
    const dx=Math.round(b.left-a.left), dy=Math.round(b.top-a.top);
    if(!dx && !dy) return;
    p.style.transition="none";
    p.style.willChange="transform";     // see the note in flipPills
    p.style.transform="translate("+dx+"px,"+dy+"px)";
    moved.push(p);
  });
  if(!moved.length) return;
  /* Commit the invert before attaching the transition - see the note at flipPills():
     without a computed start value Firefox shows the end state. Same-task attach also
     avoids the background-tab rAF pause. */
  void box.offsetHeight;
  moved.forEach(p=>{ p.style.transition="transform .18s "+E_EASE; p.style.transform=""; });
  setTimeout(()=>moved.forEach(p=>{ p.style.transition=""; p.style.transform=""; p.style.willChange=""; }),200);
}
function moveIntent(from,to){
  // from/to are positions in intentOrder; only allow within same fav/regular band
  const a=intentOrder[from], b=intentOrder[to];
  if(a==null||b==null) return;
  if(!!isIntentFavourite(intentIdAt(a))!==!!isIntentFavourite(intentIdAt(b))) return;
  animateRailReorder(()=>{ intentOrder.splice(to,0,intentOrder.splice(from,1)[0]); });
}
/* Rail display order only - NEVER mutates intentOrder. SELECTION OUTRANKS FAVOURITE -
   the opposite of the pills, and deliberate: a selection answers "what is this chat
   about", the sharper signal; green here means IS the selection. Within every band a
   favourite still leads; within the relevance bands rows group by claiming category in
   selection order, then exact colour signature (railRelGroup). Stable throughout, so the
   dragged order survives. */
/* Every row currently wearing the echo, read BEFORE a category change - the flip's
   keep set must cover the rows about to LOSE the mark as well as those about to gain it:
   both movements explain the click, so both are exempt from the travel cap. */
function railRelKeys(){
  const out=[];
  document.querySelectorAll("#intentRailList .rail-item.rail-rel").forEach(el=>out.push(el.dataset.si));
  return out;
}
/* Category clicks animate the rail the way intent picks do: capture, change, redraw, flip.
   One helper so the three ways of changing the filter (pill click, ←/→, All) cannot drift. */
function railEchoRedraw(railBefore, relBefore){
  drawIntentRail();
  const keep=new Set(relBefore||[]);
  railRelKeys().forEach(k=>keep.add(k));
  flipRail(railBefore, keep);
}
/* Which SELECTED categories hold a card linked to this intent - the exact inverse of
   categoriesForIntent(), so the rail's echo and the pills' rings can never disagree.
   Recomputed once per draw into railRelNow: the banding and the row loop both need it,
   and categoriesForIntent walks every card. */
var railRelNow={}, railRelGroup={};
function railRelRefresh(){
  railRelNow={};
  railRelGroup={};
  const sel=(cats||[]).filter(Boolean);
  if(!sel.length) return;
  intentOrder.forEach(i=>{
    const ks=categoriesForIntent(i);
    /* A SUPPORTING category is useful whatever the intent - its definition - so the echo
       lets it claim every intent, exactly as a blanket-linked category already does
       through its cards. Without this, Security lit only its card-linked slice while
       Openers lit the whole rail, and those two are the same kind of thing. */
    const hit=sel.filter(k=>isAlwaysCat(k)||ks.indexOf(k)>-1);
    if(hit.length){
      railRelNow[i]=hit;
      /* Sort key: DEPTH FIRST - the more selected categories claim an intent, the higher
         (A+B+C · A+B · A · B, every intent beside its siblings); within a depth, colour
         blocks in selection order, then the exact signature. 99-minus-count so deeper
         sorts lexicographically earlier. */
      railRelGroup[i]=String(99-hit.length).padStart(2,"0")
        +String(sel.indexOf(hit[0])).padStart(2,"0")+"|"+hit.join(",");
    }
  });
}
/* Bands, in order: selected favourite · selected · FAVOURITES · colour groups · the
   rest. Favourites are a privileged bracket group: one gold bracket, present regardless
   of selection, above every colour group - a favourite never appears inside a colour
   group; the gold outranks the hue. A selected INTENT still outranks everything: it
   names what the chat is about. */
function railBand(r){
  if(r.hidden) return 9;                       // hidden sits below every other band
  if(r.picked) return r.fav?0:1;
  if(r.fav) return 2;
  if(railRelNow[r.idx]) return 3;
  return 4;
}
/* Graded, not boolean, because a sort needs an ordering where a filter needs a yes. Same
   vocabulary: the four display fields plus the rare-keyword lane. Every term must land
   somewhere or the row scores 0. */
function railScore(r, terms){
  const hay=foldDiacritics((String(r.t||"")+" "+String(r.clause||"")+" "
    +String(r.alt||"")+" "+String(r.also||"")).toLowerCase());
  const words=splitWords(hay);
  let s=0;
  for(const t of terms){
    let q=0;
    if(words.indexOf(t)>-1) q=3;
    else if(hay.indexOf(t)!==-1) q=2;
    else if(words.some(w=>wordMatchesTerm(w,t))) q=2;
    else if(r.kw && r.kw.has(t)) q=1;
    if(!q) return 0;
    s+=q;
  }
  return s;
}
function displayIntentRows(){
  railRelRefresh();
  const rows=intentRows(true);                 // the panel shows hidden intents, greyed
  /* Match tier BEFORE band: a selected category must not push matches under its bracketed
     rows. Bands still pin picked and sink hidden, brackets still group - inside a tier.
     With no query the tier collapses and this is exactly the old order. */
  const terms=railQuery()?splitWords(railQuery()):[];
  const scored=rows
    // picked and favourite rows take no colour-group key: their bands are their whole story
    .map((r,i)=>({r, i, b:railBand(r), g:(r.picked||r.fav)?"":(railRelGroup[r.idx]||""),
                  s:terms.length?railScore(r,terms):0}))
    .map(o=>({...o, mt: !terms.length?0 : o.r.picked?0 : o.r.hidden?2 : (o.s>0?0:1)}))
    .sort((a,b)=>(a.mt-b.mt) || (a.b-b.b) || (b.s-a.s) || (a.g<b.g?-1:a.g>b.g?1:0) || (a.i-b.i));
  /* One pass owns all the derived state: who matched (grey the rest), what the arrows walk
     (matches only), and the row Enter takes - the first unpicked match in sorted order. */
  /* Without a query the mark is not this pass's to give or take - a hover claim must
     survive redraws it did not cause, or a category walk wipes the mark mid-walk. */
  railOrder=[]; railMatch=terms.length?new Set():null;
  if(terms.length) railMarkIdx=-1;
  scored.forEach(o=>{
    if(o.r.hidden) return;
    if(o.s>0){
      railMatch.add(o.r.idx);
      if(railMarkIdx<0 && !o.r.picked) railMarkIdx=o.r.idx;
      railOrder.push(o.r.idx);
    } else if(!terms.length) railOrder.push(o.r.idx);
  });
  return scored.map(o=>o.r);
}
/* The pills' rule with the pills' number: counts land per keystroke, ORDER settles 400ms
   after the last one, so a resort never runs under the typing hand. The move rides
   flipRail - the pick path's Firefox-proofed pass - with matches exempt from the travel
   cap, since rising to the top is the story. */
const RAIL_SORT_MS=400;
function railScheduleSort(){
  clearTimeout(railSortT);
  railSortT=setTimeout(railSettle, RAIL_SORT_MS);
}
function railSettle(){
  clearTimeout(railSortT); railSortT=0;
  if(typeof dragState!=="undefined" && dragState) return;   // never mid-drag, as with pills
  /* The armed filter drops here, so the bar, the numbers and the cards state one thing at one
     moment. Nothing to drop if the box ended up empty again: a letter typed and erased is not
     a query, and the category it was armed against never asked to go. */
  if(catsDropArmed){
    catsDropArmed=false;
    if(String(intentEl.value||"").trim()){
      cats=[];
      if(pills) pills.querySelectorAll(".pill").forEach(b=>b.classList.toggle("on", !b.dataset.k));
      scheduleTabSave();
    }
  }
  /* The heavy card render first, the glides after it - a transition started before a long
     rebuild spends its middle on a blocked thread. flushPillState AFTER render: render's
     own count sync would otherwise re-arm the pill timer 400ms past this settle. */
  render();
  flushPillState();
  const markedIdx=(railSel>=0 && railSel<railOrder.length)?railOrder[railSel]:-1;
  /* A query's answer starts at the top - the matches rise there - so the list goes there before
     the capture, and the glide is judged against the window the user will actually see. Only a
     query: a letter typed and erased puts nothing at the top that was not there. */
  const box=$("#intentRailList");
  if(box && String(intentEl.value||"").trim()) box.scrollTop=0;
  const before=captureRail();
  drawIntentRail();
  flipRail(before, railMatch?new Set([...railMatch].map(String)):null);
  railSel = markedIdx>=0 ? railOrder.indexOf(markedIdx) : -1;
  railSettled=true;                 // mark and movement land as one statement
  railDecorate(false);
}
/* Classes only - the 2ms kind of work. The mark PERSISTS through focus loss (EN/PL, theme,
   background clicks); it hides while a resort is pending, and once consumed it waits for
   typing or an arrow. Grey rows are inactive: skipped by railOrder, not by the mouse. */
function railDecorate(scrollTo){
  const box=$("#intentRailList"); if(!box) return;
  const q=railQuery();
  const idx = railSel>=0 && railSel<railOrder.length ? railOrder[railSel] : railMarkIdx;
  const selIdx=(markSurface()==="intent")?String(idx):null;
  box.querySelectorAll(".rail-item[data-si]").forEach(el=>{
    el.classList.toggle("rail-nohit",
      !!q && railMatch && !railMatch.has(+el.dataset.si) && !el.classList.contains("on"));
    const k=el.dataset.si===selIdx;
    el.classList.toggle("rail-kbd", k);
    // not a pinned row: it sits above the scroller, and revealing it would scroll the list to the top
    if(k && scrollTo && !el.classList.contains("on")){ try{ el.scrollIntoView({block:"nearest"}); }catch(_){}
    }
  });
  applyRailPeek();   // the mark moved; the peek follows
}
/* What a row's MARKUP depends on. Not `picked`: which row wears .on is exactly what a pick
   changes, and keeping it out of the signature is what lets a pick reuse every row. */
function railRowSig(r){
  return (r.hidden?"h":"")+(r.fav?"f":"")+(r.custom?"c":"")+"|"+r.t+"|"+(r.tag||"");
}
/* Rows keyed by intent index, or null when anything about the SET changed - a rename, a
   hide, an intent added or removed. Null means build from scratch. */
function railReuseMap(box,rows){
  const have=box.querySelectorAll(".rail-item");
  if(have.length!==rows.length) return null;
  const map=new Map();
  for(let i=0;i<have.length;i++) map.set(have[i].dataset.si,have[i]);
  for(let i=0;i<rows.length;i++){
    const el=map.get(String(rows[i].idx));
    if(!el || el.dataset.sig!==railRowSig(rows[i])) return null;
  }
  return map;
}
/* Everything about a row that a pick DOES change, in one place because both the build and
   the reuse call it. Clears first: a reused row may be dropping an accent, not gaining one,
   and the bracket classes are only ever added by the pass below. */
function railPaintRow(b,r,relRows){
  b.classList.toggle("on",!!r.picked);
  b.classList.toggle("dragging",!!(railDrag&&railDrag.moved&&railDrag.key===String(r.idx)));
  b.classList.remove("rail-rel","rr-open","rr-cont");
  b.style.removeProperty("--rail-rel-img");
  b.style.removeProperty("--rr-h");
  b.style.removeProperty("--rr-y");
  b.removeAttribute("data-ec");
  /* Echo hue: one matching selected category -> its solid hue via data-ec; several ->
     the tabs' blend in selection order. The class arrives only WITH a resolved hue - a
     slotless category must not inherit a stray --ecat. A PICKED row wears NO accent
     (selection already speaks); a FAVOURITE row wears the GOLD bracket through the same
     crescent machinery, sig FAV, so favourites fuse with each other, never with colour. */
  if(r.fav && !r.picked){
    b.classList.add("rail-rel");
    b.style.setProperty("--rail-rel-img","linear-gradient(var(--fav),var(--fav))");
    relRows.push({el:b, sig:"FAV"});
  }else if(railRelNow[r.idx] && !r.picked){
    const slots=railRelNow[r.idx].map(k=>catSlot(k)).filter(s=>s>=0);
    if(slots.length){
      b.classList.add("rail-rel");
      if(slots.length>1){
        b.style.setProperty("--rail-rel-img",
          "linear-gradient(180deg,"+slots.map(s=>"var(--e-c"+s+")").join(",")+")");
      }else{
        b.dataset.ec=String(slots[0]);
      }
      relRows.push({el:b, sig:slots.join(",")});
    }else relRows.push(null);
  }else{
    relRows.push(null);
  }
  // Drag band is the DISPLAY band, not just the favourite class: the panel re-derives
  // chosen-first, echoed-above-unechoed, grouped by colour signature - a drag across any
  // of those boundaries would snap back on the next draw, so the key carries the full
  // group. Hidden is part of the band (a hidden row cannot rise above a visible one).
  // Picked rows and favourites carry no group: picked-ness and the gold band ARE theirs.
  b.dataset.band=(r.hidden?"h":(r.fav?"1":"0"))+"-"+(r.picked?"1":"0")
    +((railRelGroup[r.idx]&&!r.picked&&!r.fav)?("r"+railRelGroup[r.idx]):"");
}
/* Bracket pass: consecutive rows sharing an accent signature become one mark -
   rr-open on a row continued below, rr-cont on a row continuing the one above; the CSS
   turns the pair into straight joints, capsule ends only at the run's edges. Adjacency
   in relRows IS DOM adjacency, and a null (unechoed row) breaks the run. */
function railBracketPass(relRows){
  for(let i=0;i<relRows.length;i++){
    const cur=relRows[i], next=relRows[i+1];
    if(!cur) continue;
    if(next && next.sig===cur.sig){
      cur.el.classList.add("rr-open");
      next.el.classList.add("rr-cont");
    }
  }
  /* One gradient per RUN: per-row pseudos restarted the blend and the arm striped.
     Measured after layout, handed down as --rr-h/--rr-y; a continuation's pseudo starts
     2px above its row (the gap bridge). One forced layout for the pass, then style-only
     writes. */
  for(let s=0;s<relRows.length;s++){
    if(!relRows[s]) continue;
    let e=s;
    while(relRows[e+1] && relRows[e+1].sig===relRows[s].sig) e++;
    if(e>s){
      const top0=relRows[s].el.offsetTop;
      const lastEl=relRows[e].el;
      const runH=lastEl.offsetTop+lastEl.offsetHeight-top0;
      for(let j=s;j<=e;j++){
        const el=relRows[j].el, bridge=(j>s)?2:0;
        el.style.setProperty("--rr-h",runH+"px");
        el.style.setProperty("--rr-y",(-(el.offsetTop-bridge-top0))+"px");
      }
    }
    s=e;
  }
}
/* THE SIGNATURE PROBLEM: to know whether a card's markup changed we must not build it, since
   building it is the cost being avoided. So every input is read instead - and the awkward one
   is the filled text, which depends on the agent's name, the clock and the SELECTED INTENT.
   A canary carrying every token is filled per card; cards whose text holds no token (250 of
   257 in the working catalog) short-circuit to a constant and survive every pick. */
const CARD_TOKEN_RE=/\{(GREET|AGENT|PAX|ROLE|INIT|INTENT|ACTION|TOPIC|Z|DAYPART)/;
const TOKEN_CANARY="{GREET}{AGENT}{PAX}{ROLE}{INIT}{INTENT}{ACTION}{TOPIC}{Z}x{DAYPART:a|b|c}";
function cardFillKey(m){
  const raw=String(m&&m.en||"")+String(m&&m.pl||"");
  if(!CARD_TOKEN_RE.test(raw)) return "";
  try{ return fill(TOKEN_CANARY,m); }catch(e){ return "?"+ePackEpoch; }
}
function drawIntentRail(){ drawIntentRailCore(); syncRailCount(); railDecorate(false); scheduleCutScan(); }
/* HOW MANY, AND HOW MANY PUT AWAY - the two questions a list of intents is asked. Counted over
   live intents rather than off pack.intentHidden, which keeps ids of intents that are gone.
   Composed through t() and skipped by the sweep, which cannot rebuild half a string. */
function syncRailCount(){
  const el=document.getElementById("railCount");
  if(!el) return;
  const n=SW_EN.length;
  let hid=0;
  for(let i=0;i<n;i++) if(isIntentHiddenIdx(i)) hid++;
  const txt=String(n);
  if(el.textContent!==txt) el.textContent=txt;
  const hidEl=document.getElementById("railHidden");
  if(hidEl){
    const ht=hid ? t("{N} hidden").replace("{N}",hid) : "";
    if(hidEl.textContent!==ht) hidEl.textContent=ht;
    hidEl.hidden=!hid;
  }
}
/* Hover IS the mark. Entering a row claims the one mark for the intents - by idx, not
   position, so grey rows a mouse may still choose mark too; entering a card block claims
   it for the cards. Each claim clears the other surface, which is the whole point. */
function railHoverClaim(e){
  kbdNav(false);            // riding mousemove, this IS real pointer motion
  const el=e.target.closest(".rail-item[data-si]");
  if(!el || el.classList.contains("on")) return;
  if(typeof dragState!=="undefined" && dragState) return;
  semiKind="intent";
  railMarkIdx=+el.dataset.si;
  railSel=railOrder.indexOf(railMarkIdx);
  railMarkUsed=false;
  if(entrySel){ entrySel=null; markEntrySel(); }
  railDecorate(false);
}
function cardHoverClaim(e){
  kbdNav(false);
  const el=e.target.closest(".txt[data-v]");
  if(!el) return;
  if(typeof dragState!=="undefined" && dragState) return;
  const card=el.closest(".card[data-id]");
  if(!card) return;
  if(entrySel && entrySel.id===card.dataset.id && entrySel.vi===+el.dataset.v){
    if(semiKind!=="card"){ semiKind="card"; railDecorate(false); }
    return;
  }
  semiKind="card";
  entrySel={id:card.dataset.id, vi:+el.dataset.v};
  markEntrySel();
  railDecorate(false);
}
/* mousemove, not mouseover: a row sliding under a RESTING pointer fires mouseover but
   never mousemove, so the pointer's own motion is the only thing that can claim - and the
   global mousemove above has already lowered e-kbdnav by the time these run. */
addEventListener("load",()=>{ setTimeout(()=>{
  const l=$("#list"), r=$("#intentRailList");
  if(l) l.addEventListener("mousemove",cardHoverClaim,{passive:true});
  if(r) r.addEventListener("mousemove",railHoverClaim,{passive:true});
},0); });
function drawIntentRailCore(){
  const box=$("#intentRailList");
  if(!box) return;
  syncIntentOrder();
  // Clearing innerHTML collapses the scroller and drops scrollTop to 0, which both loses the
  // user's place and makes the reorder animation measure against the wrong geometry.
  const keepScroll=box.scrollTop;
  const rows=displayIntentRows();
  const relRows=[];   // one entry per row, {el,sig} for echoed rows, null gaps - bracket pass below
  /* THE PICK PATH. Rebuilding all 72 rows made Firefox repaint every masked bracket, which
     is the stutter the eye catches on a pick. Same rows, moved and repainted instead. */
  const reuse=railReuseMap(box,rows);
  if(reuse){
    let cursor=box.firstChild;
    rows.forEach(r=>{
      const b=reuse.get(String(r.idx));
      if(b===cursor) cursor=cursor.nextSibling;
      else box.insertBefore(b,cursor);
      railPaintRow(b,r,relRows);
    });
    railBracketPass(relRows);
    box.scrollTop=keepScroll;
    stackPinnedIntents(box);
    syncIntentClearBtns();
    return;
  }
  box.innerHTML="";
  rows.forEach(r=>{
    const b=document.createElement("button");
    b.type="button";
    b.className="rail-item"+(r.fav?" is-fav":"")+(r.hidden?" is-hidden":"");
    b.dataset.si=String(r.idx);
    b.dataset.sig=railRowSig(r);
    railPaintRow(b,r,relRows);
    const badge=r.custom?'<span class="rail-badge" title="'+esc(t("Changed or added by you, not what the catalog shipped"))+'">'+esc(t("mod"))+'</span>':"";
    const favTip=t(r.fav?"Remove from Favourites":"Add to Favourites");
    /* One button slot, three jobs: hidden rows offer only "show again" (a hidden intent
       cannot be a favourite), visible rows show the star and swap it for hide while Ctrl
       is held (CSS, .ctrl-held) - how you hide an intent without opening Manage. */
    const btn = r.hidden
      ? '<span class="rail-fav rail-unhide" data-show-intent="'+esc(r.id)+'" title="'+esc(t("Show this intent again"))+'" aria-label="'+esc(t("Show this intent again"))+'">'+ICON_EYE_SHUT+'</span>'
      : '<span class="rail-fav'+(r.fav?" on":"")+'" data-fav-intent="'+esc(r.id)+'" title="'+esc(favTip)+' · '+esc(t("hold Ctrl to edit, Shift to hide"))+'" aria-label="'+esc(favTip)+'" aria-pressed="'+(r.fav?"true":"false")+'">'+(r.fav?ICON_STAR_ON:ICON_STAR_OFF)+'</span>'
        +'<span class="rail-fav rail-edit" data-edit-intent="'+esc(r.id)+'" title="'+esc(t("Edit this intent"))+'" aria-label="'+esc(t("Edit this intent"))+'">'+ICON_EDIT+'</span>'
        +'<span class="rail-fav rail-hide" data-hide-intent="'+esc(r.id)+'" title="'+esc(t("Hide this intent: it greys out and drops to the bottom"))+'" aria-label="'+esc(t("Hide this intent"))+'">'+ICON_EYE_OPEN+'</span>';
    /* data-i18n-skip: the clause and its tag are the catalog's words. The badge inside is the
       engine's, so it is translated here rather than left for a sweep that will not enter. */
    b.innerHTML='<span class="rail-t cut-peek" data-i18n-skip>'+esc(r.t)+badge+'</span>'
      +(r.tag?'<span class="rail-tag cut-peek" data-i18n-skip>'+esc(r.tag)+'</span>':"")
      +btn;
    b.onpointerdown=e=>{
      /* Touch never starts a drag: a fingertip jitters past the 5px threshold on an
         ordinary tap, so every tap became a micro-drag, armed the click suppression, and
         the suppression ate the NEXT tap too - the whole panel read as dead on a touch
         screen. Reordering stays a fine-pointer affair; taps must always be taps. */
      if(e.pointerType==="touch") return;
      if(e.target.closest&&e.target.closest("[data-fav-intent],[data-hide-intent],[data-show-intent],[data-edit-intent]")) return;
      if(e.button!==0) return;
      railSuppressClick=false;
      railDrag={key:String(r.idx),band:b.dataset.band,x:e.clientX,y:e.clientY,moved:false};
    };
    /* Tracks whether the cursor is on the button slot, so Ctrl only swaps star-for-hide
       when actually pointing at it. Driven from the row's pointermove, not the button's
       enter/leave: hiding the star under the cursor would fire pointerleave and flicker.
       .rail-hide also carries .rail-fav, so the match survives the swap. */
    b.onpointermove=e=>{
      /* Self-heal the modifier classes: pointer events carry the real modifier state, so a
         ctrl-held left behind by a lost keyup is corrected the moment the cursor moves -
         before it can reach the slot. Guarded on a genuine mismatch: one classList read
         per move. */
      if(!!(e.ctrlKey||e.metaKey)!==document.body.classList.contains("ctrl-held")
         || !!e.shiftKey!==document.body.classList.contains("shift-held")){
        updateModifierPeek(e);
      }
      const on=!!(e.target.closest && e.target.closest(".rail-fav"));
      b.classList.toggle("slot-hot", on);
    };
    b.onpointerleave=()=>b.classList.remove("slot-hot");
    box.appendChild(b);
  });
  railBracketPass(relRows);
  /* "+ Intent" as a dashed row at the end of the list rather than a header button, matching
     the add-card at the end of the card list. Not a .rail-item, so it stays out of drag,
     selection and the band logic. */
  const add=document.createElement("button");
  add.type="button";
  add.className="rail-add";
  add.id="railAddIntent";
  add.innerHTML='<span class="ra-plus">+</span><span>'+esc(t("Add an intent"))+'</span>';
  add.title=t("Create a custom intent");
  add.onclick=()=>openIntentEditor(null);
  box.appendChild(add);
  box.scrollTop=keepScroll;
  stackPinnedIntents(box);
  syncIntentClearBtns();
}
/* Selected intents PIN to the scroller's top rather than merely sorting there -
   sorting alone made the row you just chose the one that vanished (it jumped to the top,
   off screen). The offsets are computed, not declared: a row is one line or two depending
   on its category tag, so a constant top would stack them on each other; each pinned row
   is offset by the real heights of those above it, plus the flex gap. */
const RAIL_GAP_PX=2;
/* UNPINNING MUST GIVE THE OFFSET BACK. Only .on is position:absolute; every other row is
   position:relative, so an inline top left behind by a previous pin does not sit idle - it
   slides that row down over its neighbour and opens a gap where it belongs. Cleared in its
   own pass, before any measuring, so no write lands between a read and the next row. */
function stackPinnedIntents(box){
  if(!box) return;
  box.querySelectorAll(".rail-item:not(.on)").forEach(el=>{ if(el.style.top) el.style.top=""; });
  // the lane before the heights: a pinned row's width, and so its line count, depends on it
  box.style.setProperty("--rail-sb", (box.offsetWidth-box.clientWidth)+"px");
  let off=0;
  /* Read every height before writing any top: interleaved, each write costs the next read a
     whole layout. Same two-pass rule as flipPills. */
  const stack=Array.from(box.querySelectorAll(".rail-item.on"));
  const tall=stack.map(el=>el.getBoundingClientRect().height);
  stack.forEach((el,i)=>{ el.style.top=off+"px"; off+=tall[i]+RAIL_GAP_PX; });
  box.style.setProperty("--rail-shelf", off+"px");   // the list starts below the stack - see .rail-body
}
/* FLIP for the panel, same two-half shape as the pills. offsetTop, not
   getBoundingClientRect - independent of the panel's own scroll. Travel capped at half
   the visible panel: longer reads as the panel scrolling, not a row moving. */
const RAIL_FLIP_TRAVEL=0.5;
function captureRail(){
  const box=$("#intentRailList");
  if(!box || mgReduceMotion()) return null;
  const before={};
  box.querySelectorAll(".rail-item[data-si]").forEach(el=>{
    before[el.dataset.si]={y:el.offsetTop, on:el.classList.contains("on")};
  });
  return before;
}
/* Same two-pass rule as flipPills, and the same reason: interleaved reads cost one
   full layout per row. `keep` names rows that must animate however far they travel -
   selecting sends a row to the TOP, a journey past the travel cap, and the one movement
   that explains the click was the only row that jumped. The cap still applies to the
   rest, where a long slide reads as the panel scrolling. Long journeys also get a little
   longer to make them, or they read as a flicker rather than travel. */
function flipRail(before,keep){
  if(!before) return;
  const box=$("#intentRailList");
  if(!box) return;
  const h=box.clientHeight||0, st=box.scrollTop||0;
  if(!h) return;
  const limit=h*RAIL_FLIP_TRAVEL;
  /* Offsets are in .rail-body, where the pinned rows sit above the list: the scroller's
     window starts at the list's own offset, and a pinned row is on screen by construction. */
  const top=box.offsetTop+st;
  const seen=(y,hgt,pinned)=> pinned || ((y+hgt)>top && y<top+h);
  const moved=[], dys=[], entered=[];
  box.querySelectorAll(".rail-item[data-si]").forEach(el=>{
    const b=before[el.dataset.si];
    if(b==null) return;
    const a=el.offsetTop;
    // whole pixels only - fractional offsets put the text on a half-pixel and it blurs
    const dy=Math.round(b.y-a);
    if(!dy) return;
    const hgt=el.offsetHeight;
    const seenAfter=seen(a,hgt,el.classList.contains("on"));
    const seenBefore=seen(b.y,hgt,b.on);
    if(!seenAfter && !seenBefore) return;
    /* Exempt from the cap only rows ON SCREEN to begin with - a clickable row is a visible
       one, and it bounds the journey to the panel's height; an exempt row sliding in from
       off-screen read as the interface lurching. Off-screen arrivals ENTER instead - a
       short fade at their final position: banning their travel while giving them no entry
       made equal-sized relevance swaps produce NO motion at all, which read as failure. */
    const exempt=seenBefore && keep && keep.has(String(el.dataset.si));
    if(Math.abs(dy)>limit && !exempt){
      if(seenAfter && !seenBefore) entered.push(el);
      return;
    }
    moved.push(el); dys.push(dy);
  });
  moved.forEach((el,i)=>{
    el.style.transition="none";
    el.style.willChange="transform";     // see the note in flipPills
    el.style.transform="translateY("+dys[i]+"px)";
  });
  entered.forEach(el=>{
    el.style.transition="none";
    el.style.opacity="0";
  });
  if(!moved.length && !entered.length) return;
  const far=Math.max.apply(null,dys.map(Math.abs));
  const dur=far>limit ? Math.min(.30, .18+far/6000) : .18;
  /* Commit the invert before attaching the transition - see the note at flipPills():
     without a computed start value Firefox shows the end state. Same-task attach also
     avoids the background-tab rAF pause. */
  void box.offsetHeight;
  moved.forEach(el=>{ el.style.transition="transform "+dur+"s "+E_EASE; el.style.transform=""; });
  entered.forEach(el=>{ el.style.transition="opacity "+dur+"s "+E_EASE; el.style.opacity=""; });
  // clear the inline styles once done so nothing stays on a composited layer
  setTimeout(()=>{
    moved.forEach(el=>{ el.style.transition=""; el.style.transform=""; el.style.willChange=""; });
    entered.forEach(el=>{ el.style.transition=""; el.style.opacity=""; });
  },dur*1000+20);
  return dur*1000;   // the caller waits this out before touching the main thread again
}
const intentRailEl=$("#intentRail");
if(intentRailEl){
  intentRailEl.addEventListener("click",e=>{
    if(railSuppressClick){ railSuppressClick=false; return; }
    if(e.target.closest("#railPinBtn")){
      e.preventDefault(); e.stopPropagation();
      toggleRailLock();
      // The click that changes the state is the one that plays it - boot's sync stays still.
      const b=e.target.closest("#railPinBtn");
      b.classList.remove("e-lock-shut","e-lock-open");
      void b.offsetWidth;
      b.classList.add(railLocked()?"e-lock-shut":"e-lock-open");
      clearTimeout(b._eLockT);
      b._eLockT=setTimeout(()=>b.classList.remove("e-lock-shut","e-lock-open"),220);
      return;
    }
    // "+ Intent" is now the dashed row at the end of the list (see #railAddIntent), which
    // binds its own onclick - nothing to handle here.
    /* The one button slot, handled in one place. All three actions - star, hide, show
       again - MOVE the row, so all three animate; the two destructive ones used to be the
       only actions in the panel giving no account of themselves.
       Which action a click means is decided by the modifier ON THIS EVENT, never by which
       glyph is painted: body.ctrl-held is set on keydown, cleared on keyup, and a keyup
       does not always arrive (a browser shortcut, focus moving to a dialog) - the class
       then stays on, the star silently becomes hide, and a click meant as a star greys
       the intent: "sometimes hides by itself", caused minutes earlier, unreproducible.
       e.ctrlKey is sampled from the click and cannot go stale; the glyph swap is purely
       cosmetic - a click landing on the "wrong" glyph still does what the modifier says. */
    const slotEl=e.target.closest("[data-fav-intent],[data-hide-intent],[data-show-intent],[data-edit-intent]");
    if(slotEl){
      e.preventDefault(); e.stopPropagation();
      const row=slotEl.closest(".rail-item");
      // A hidden row offers "show again" only - Ctrl has nothing to mean there.
      let act=slotEl;
      if(!slotEl.hasAttribute("data-show-intent")){
        const want=(e.ctrlKey||e.metaKey) ? "[data-edit-intent]"
                 : e.shiftKey             ? "[data-hide-intent]"
                 :                          "[data-fav-intent]";
        act=(row&&row.querySelector(want))||slotEl;
      }
      const aid=act.getAttribute("data-fav-intent")||act.getAttribute("data-hide-intent")
        ||act.getAttribute("data-show-intent")||act.getAttribute("data-edit-intent");
      /* Editing opens a dialog and moves nothing, so it returns before the FLIP bookkeeping
         below - which exists to animate a row travelling to the top or the bottom. */
      if(act.hasAttribute("data-edit-intent")){
        const ei=intentIdxFromId(aid);
        if(ei>=0) openIntentEditor(ei);
        return;
      }
      /* Exempt the acted-on row from the travel cap, exactly as a picked one: it goes to
         the TOP (star) or the BOTTOM (hide), a journey past half the panel, and the cap
         was suppressing the one movement that explains what just happened. flipRail
         honours the exemption only for rows on screen to begin with, so travel stays
         bounded by the panel height. */
      const aIdx=intentIdxFromId(aid);
      const before=captureRail();
      if(act.hasAttribute("data-fav-intent")) toggleIntentFavourite(aid);
      else setIntentHidden(aid, act.hasAttribute("data-hide-intent"));
      flipRail(before, aIdx>=0?new Set([String(aIdx)]):null);
      return;
    }
    if(e.target.closest("#intentRailClear")){
      clearIntents();
      spinPickClear(e.target.closest("#intentRailClear"));
      return;
    }
    const btn=e.target.closest(".rail-item[data-si]");
    if(!btn) return;
    const si=+btn.dataset.si;
    if(e.ctrlKey||e.metaKey || intentIdxs.indexOf(si)>-1) pickIntent(si,true);
    else pickIntent(si,false);
    toast(intentIdxs.length ? t("{INTENT} set -")+" "+intentFor() : t("{INTENT} cleared"));
  });
  // double-click the title to restore original intent order (favs still pin on top)
  const railTitle=intentRailEl.querySelector(".rail-head b");
  if(railTitle) railTitle.ondblclick=()=>{
    animateRailReorder(()=>{
      intentOrder=[];
      for(let i=0;i<SW_EN.length;i++) intentOrder.push(i);
      intentOrderLoaded=true;
      syncIntentOrder();
    });
    drawIntentRail();
    toast("Intent order reset");
  };
}
addEventListener("pointermove",e=>{
  if(!railDrag) return;
  if(!railDrag.moved){
    if(Math.abs(e.clientX-railDrag.x)+Math.abs(e.clientY-railDrag.y)<5) return;
    railDrag.moved=true;
    document.documentElement.classList.add("raildrag");
    const el=$("#intentRailList")&&$("#intentRailList").querySelector('.rail-item[data-si="'+railDrag.key+'"]');
    if(el) el.classList.add("dragging");
  }
  if(Date.now()-railSwapLock < 190) return;
  const under=document.elementFromPoint(e.clientX,e.clientY);
  const t=under && under.closest ? under.closest(".rail-item") : null;
  if(!t || t.dataset.si===railDrag.key) return;
  // Same class only: favourites among favourites, regulars among regulars
  if(railDrag.band!=null && t.dataset.band!=null && railDrag.band!==t.dataset.band) return;
  const from=intentOrder.indexOf(+railDrag.key), to=intentOrder.indexOf(+t.dataset.si);
  if(from<0||to<0) return;
  railSwapLock=Date.now();
  moveIntent(from,to);
},{passive:true});
function endRailDrag(){
  if(!railDrag) return;
  const didMove=!!railDrag.moved;
  // Clear drag state BEFORE redraw - drawIntentRail() re-applies .dragging while
  // railDrag.moved is still true, which left items stuck grey after drop.
  railDrag=null;
  document.documentElement.classList.remove("raildrag");
  const box=$("#intentRailList");
  if(box) box.querySelectorAll(".rail-item").forEach(p=>p.classList.remove("dragging"));
  if(didMove){
    nsSet("IntentOrder",JSON.stringify(intentOrder));
    railSuppressClick=true;
    drawIntentRail(); // the rail follows the new order (no ghost drag style)
  }
}
addEventListener("pointerup",endRailDrag);
addEventListener("pointercancel",endRailDrag);
/* A FINGER ON A PINNED ROW. The row sits above the scroller, so a pan there reaches nothing
   that scrolls and the browser would take the page; touch-action:none on the row stops that,
   and this moves the list by the finger's travel. Past the tap threshold the click is
   suppressed for the length of the gesture, or a scroll would also unpick the row it began on. */
let railPan=null;
addEventListener("pointerdown",e=>{
  if(e.pointerType!=="touch") return;
  if(!(e.target&&e.target.closest&&e.target.closest("#intentRailList .rail-item.on"))) return;
  railPan={id:e.pointerId,y:e.clientY,moved:false};
},{passive:true});
addEventListener("pointermove",e=>{
  if(!railPan||e.pointerId!==railPan.id) return;
  const box=$("#intentRailList"); if(!box) return;
  const dy=e.clientY-railPan.y;
  if(!railPan.moved && Math.abs(dy)<5) return;
  railPan.moved=true; railSuppressClick=true;
  box.scrollTop-=dy; railPan.y=e.clientY;
},{passive:true});
function endRailPan(e){
  if(!railPan||e.pointerId!==railPan.id) return;
  railPan=null;
  // a click, if the browser sends one, arrives before this runs; if none comes, the flag must not wait for the next tap
  setTimeout(()=>{ railSuppressClick=false; },0);
}
addEventListener("pointerup",endRailPan);
addEventListener("pointercancel",endRailPan);

/* CSS does the normal case; this slides the list back only when it would spill.
   documentElement.clientWidth, NOT innerWidth: an overflowing list puts the page into
   horizontal scroll, and innerWidth then reports the widened document - the correction
   chases the problem it is fixing and never settles. The nudge is a delta on the SAME
   calc the stylesheet uses, so the centring stays in one place. */

/* The role is a DRUM - a slot wheel over whoOptions() with an empty notch that clears.
   The mouse wheel and the arrow keys turn it; the hidden roleSel stays the one value
   {ROLE} reads, so everything downstream is untouched by the control's shape. */
/* The notches, and the ONE list both the wheel and its display read. A stored role the
   catalog no longer offers joins the wheel rather than vanishing from it: it still fills
   {ROLE}, so a drum showing the empty notch would be lying, and stepping away drops it. */
function roleOpts(){
  const opts=[""].concat(whoOptions());
  const v=roleSel.value;
  if(v && opts.indexOf(v)<0) opts.push(v);
  return opts;
}
function syncRoleDrum(){
  const d=$("#roleDrum"); if(!d) return;
  const opts=roleOpts();
  let i=opts.indexOf(roleSel.value); if(i<0) i=0;
  const lab=v=>v===""?t("class"):v;
  const n=opts.length;
  d.querySelector(".rd-prev").textContent=lab(opts[(i-1+n)%n]);
  const c=d.querySelector(".rd-cur");
  c.textContent=lab(opts[i]);
  c.classList.toggle("rd-empty", opts[i]==="");
  d.querySelector(".rd-next").textContent=lab(opts[(i+1)%n]);
  d.setAttribute("aria-valuetext", lab(opts[i]));
}
function stepRoleDrum(dir){
  const d=$("#roleDrum"); if(!d) return;
  const opts=roleOpts();
  let i=opts.indexOf(roleSel.value); if(i<0) i=0;
  roleSel.value=opts[(i+dir+opts.length)%opts.length];
  syncRoleDrum();
  const tr=d.querySelector(".rd-track");
  tr.classList.remove("rd-up","rd-down"); void tr.offsetWidth;
  tr.classList.add(dir>0?"rd-up":"rd-down");
  render();
  scheduleTabSave();
}
function wireRoleDrum(){
  const d=$("#roleDrum"); if(!d) return;
  d.addEventListener("wheel",e=>{ e.preventDefault(); stepRoleDrum(e.deltaY>0?1:-1); },{passive:false});
  /* A CLICK IS THE ONLY ROUTE A FINGER HAS - no wheel, no arrow keys - so it advances a
     notch, and the wheel cycles, which means every value stays reachable from a tap. */
  d.addEventListener("click",()=>{ stepRoleDrum(1); });
  d.addEventListener("keydown",e=>{
    if(e.key!=="ArrowDown"&&e.key!=="ArrowUp") return;
    if(e.ctrlKey||e.metaKey||e.altKey||e.shiftKey) return;   // those belong to the card list
    e.preventDefault();
    /* STOP HERE. The window dispatcher skips real fields via typingInField(), and a div is
       not one - unstopped, one arrow turned the drum AND walked the cards behind it. */
    e.stopPropagation();
    stepRoleDrum(e.key==="ArrowDown"?1:-1);
  });
  syncRoleDrum();
}
wireRoleDrum();
// Keep the header box showing whatever {INTENT} currently resolves to.
function intentIsSet(){
  // Clear buttons stay inactive on bare mode switch (/) until there is real content
  return intentIdxs.length>0
    || !!(intentText&&String(intentText).trim())
    /* .length on the visible box, while intentText stays trimmed: intentText is a
       resolved value, but the BOX is what the user is looking at, and spaces in it are
       characters they typed and can see. Trimming here disabled the × and made Escape a
       no-op on a field that was plainly not empty. */
    || !!(intentEl&&String(intentEl.value||"").length);
}
function syncIntentClearBtns(){
  // The rail's arrow never disables - killing it the frame a clear lands kills the spin.
  const railBtn=$("#intentRailClear");
  if(railBtn){ railBtn.hidden=false; railBtn.disabled=false; }
  const fab=$("#clearIntentsFab");
  if(fab){
    const n=intentIdxs.length;
    fab.classList.toggle("on",n>0);
    fab.classList.toggle("many",n>1);
    fab.setAttribute("aria-hidden",n?"false":"true");
    fab.tabIndex=n?0:-1;
    fab.querySelector(".fab-n").textContent=n>1?String(n):"";
    fab.title=n>1 ? t("Clear the chosen intents ({N})").replace("{N}",n) : t("Clear the intent");
    fab.setAttribute("aria-label",fab.title);
    fab.onclick=()=>clearIntents();
  }
  const boxBtn=$("#intentClear");
  if(boxBtn){
    boxBtn.hidden=false;
    // Greys on exactly one question: is there text to rub out?
    boxBtn.disabled=!String(intentEl.value||"").length;
    boxBtn.title=t("Clear search text");
    boxBtn.innerHTML=ICON_CLEAR_TEXT;
  }
}
function clearIntents(){
  if(!intentIsSet()) return false;
  const pillsBefore=capturePills();   // bands collapse back to catOrder - animate the move
  const cardsBefore=captureCards();
  /* The list goes to its top before the capture, as a settled query does: the order it returns
     to begins there, and the glide is judged against the window the user will see. */
  const railBox=$("#intentRailList"); if(railBox) railBox.scrollTop=0;
  const railBefore=captureRail();     // panel returns to its dragged order
  intentIdxs=[]; intentText="";
  railSel=-1; railMarkUsed=false; pickRun=false;   // the selection goes and the offer re-opens; the QUERY stays
  syncIntentInput();
  drawPills();
  flipPills(pillsBefore);
  drawIntentRail();
  flipRail(railBefore);
  render();
  flipCards(cardsBefore);
  /* THE SAME ARRIVAL AS THE PICK, in reverse: the list re-sorts back to its resting order
     under a viewport parked wherever the intent's answer was, and that order begins at the
     top. The other two ways out of a selection do this too. */
  scrollPageTop();
  scheduleTabSave();
  toast("{INTENT} cleared");
  return true;
}
// Esc from INTENT box: leave search mode, wipe query, cancel all intents
/* Escape sheds ONE thing per press. It used to be nuclear - mode, query AND intents
   in one press, so recovering from a mis-typed mode cost the intents. Two steps now:
     1. in macro search -> leave it, intents survive
     2. otherwise      -> clear the intents (clearIntents owns that, and its toast)
   Returns false when there was nothing left to shed, so callers can fall through. */
function intentEscapeStep(){
  /* Escape also LEAVES the box: whatever else this press sheds, focus returns to the
     page so ←/→ resume walking the categories at once - the box holding on made the
     arrows dead exactly when you had just said "never mind" and reached for them. */
  if(typeof intentEl!=="undefined" && intentEl && document.activeElement===intentEl) intentEl.blur();
  if(String((intentEl&&intentEl.value)||"").trim()){
    clearSearchQuery();
    toast("Search cleared");
    return true;
  }
  /* intentIsSet answers false while searching, so ask the selection directly */
  if(intentIdxs.length || intentText){
    return clearIntents();
  }
  return false;
}
/* THE LADDER ITSELF. Two doors reach it - the shortcut and the intent box's own key
   handler - and they must climb the same rungs or a press means different things
   depending on where the caret happens to be. */
function escapeLadderStep(){
  if(intentEscapeStep()) return true;
  return escCloseAllTabsStep();
}
function syncIntentInput(){
  // The box holds the query; the selection lives in the rail, never written over the text.
  intentEl.classList.toggle("set", intentIdxs.length>0 || !!String(intentEl.value||"").trim());
  syncIntentClearBtns();
}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
/* esc() first, THEN swap the fences for tags - never the other way round. split/join rather than
   a regex so the control characters need no escaping to read. Only fill(...,true) produces
   fences, and it always writes them in pairs, so the result cannot be unbalanced. */
function escFilled(s){
  return esc(s).split(FILL_A).join('<span class="fillx">').split(FILL_B).join("</span>")
                .split(FILL_M_A).join('<span class="fillmiss">').split(FILL_M_B).join("</span>");
}
/* The floating door's two states: it names the category it would file into when exactly one is
   filtered, and asks for one when not. Hidden only when there is no category to file into at
   all, which is an empty Etiuda. */
function syncAddFab(){
  const b=document.getElementById("addCardFab");
  if(!b) return;
  const one=(cats.length===1 && CATS[cats[0]]) ? cats[0] : null;
  b.hidden=!Object.keys(CATS).length;
  // The one place a new card is asked for outright: the chosen category holds none.
  b.classList.toggle("nudge", !!one && !cardCounts[one]);
  b.title=one ? t("Create a card in {CAT}").replace("{CAT}",CATS[one]) : t("Create a card");
  b.setAttribute("aria-label", b.title);
  b.onclick=()=>openCardEditor(null, one);
}


/* The FIRST render precedes layout, so the list measures zero wide, Auto resolves to
   one column, and nothing happens until the next redraw - wait a frame and ask again.
   Bounded: a genuinely zero-wide list (a hidden tab) would otherwise re-ask forever. */
let colTries=0;
/* Card nodes, kept by id between renders. Cleared wholesale when it outgrows the list so a
   catalog swap cannot leave the old one's cards alive in here. */
let cardPool=new Map();
const cardTpl=document.createElement("template");
function parseCardHtml(html){
  cardTpl.innerHTML=html;
  return cardTpl.content.firstElementChild;
}
/* Everything a PICK changes, and nothing else - the rest lives in the signature and forces a
   rebuild instead. Kept beside the builder that writes the same markup, or the two drift. */
function patchCard(el,it){
  el.className="card"+(it.hidden?" is-hidden":"")+(it.hit?" intent-hit":"")
    +(it.catHit?" cat-hit":"")+(it.dragging?" dragging":"");
  el.setAttribute("title",it.dragTip);
  el.setAttribute("data-i",it.i);
  el.setAttribute("data-rank",it.band);
  const head=el.querySelector(".chead");
  if(!head) return;
  const anchor=head.querySelector(".ccat");
  if(!anchor) return;
  let hitB=head.querySelector(".cbadge.hit"), catB=head.querySelector(".cbadge.cat");
  if(it.hit && !hitB){ hitB=parseCardHtml(it.hitBadge); anchor.insertAdjacentElement("afterend",hitB); }
  else if(!it.hit && hitB){ hitB.remove(); hitB=null; }
  if(it.catHit && !catB){ catB=parseCardHtml(it.catBadge); (hitB||anchor).insertAdjacentElement("afterend",catB); }
  else if(!it.catHit && catB){ catB.remove(); }
}
/* A language flip changes every card's bytes but nothing structural, so the tail never
   calls render(): the screenful rebuilds in place, the rest follows in chunks, and the
   category separators swap their text. Each rebuilt card gets the exact signature a full
   render would write, so the pool stays honest and any interleaved render heals the rest. */
/* A FRESH CARD NODE PAINTS ONCE AT ITS ESTIMATE. content-visibility lays a new node out at
   the 220px stub and resolves it a frame later; kept nodes carry a remembered size, fresh ones
   do not - so a rebuild that touches what is on screen (a typed pick clears the query, and
   with it every signature) shows one frame of uniform stubs, then the cards. Forced real here,
   in the same task as the insertion, and handed back two frames on. The glides force their
   watched cards the same way and release later; the double release is idempotent. */
let eFreshHeld=[], eFreshR=0;
function holdFresh(el){
  if(el.style.contentVisibility) return;
  el.style.contentVisibility="visible";
  eFreshHeld.push(el);
  if(eFreshR) return;
  eFreshR=requestAnimationFrame(()=>requestAnimationFrame(()=>{
    eFreshR=0;
    const held=eFreshHeld; eFreshHeld=[];
    held.forEach(x=>{ if(x.style.contentVisibility==="visible") x.style.contentVisibility=""; });
  }));
}
// Estimate rects are enough to shortlist: a card within a viewport of the screen is forced.
function settleFreshCards(){
  if(!list) return;
  const vh=window.innerHeight, margin=vh;
  list.querySelectorAll(".card[data-id]").forEach(el=>{
    if(el.style.contentVisibility) return;
    const r=el.getBoundingClientRect();
    if(r.bottom<-margin || r.top>vh+margin) return;
    holdFresh(el);
  });
}
let eLangChunkR=0;
function cancelLangChunks(){
  if(eLangChunkR){ cancelAnimationFrame(eLangChunkR); eLangChunkR=0; }
}
function rebuildCardInPlace(id){
  const m=findCard(id), el=cardPool.get(id);
  if(!m || !el || !el.isConnected) return;
  const renderKey=String(uiLang())+"|"+lang+"|"+cardSearchTerms().join(" ");
  const b=cardBodyHtml(m, +el.getAttribute("data-i")||0,
    {hit:cardHitsSelectedIntent(m), catHit:cardHitsAlwaysCat(m), fav:isFavourite(m.id),
     band:displayBandKey(m), other:lang==="en"?"pl":"en",
     dragTip:t(intentIdxs.length
       ? "Drag header to reorder within the same highlight group"
       : "Drag header to reorder within the same highlight group; same category only")});
  const fresh=parseCardHtml(b.cardH);
  if(!fresh) return;
  fresh.__sig=ePackEpoch+"|"+renderKey+"|"+cardFillKey(m)
    +"|"+(entrySel&&entrySel.id===m.id?entrySel.vi:-1);
  const ord=el.getAttribute("data-ord");
  if(ord!=null) fresh.setAttribute("data-ord",ord);
  const was=el.getBoundingClientRect(), vh=window.innerHeight;
  el.replaceWith(fresh);
  if(was.bottom>-vh && was.top<2*vh) holdFresh(fresh);   // see the note at holdFresh()
  cardPool.set(id,fresh);
}
function runLangChunks(ids){
  const step=()=>{
    eLangChunkR=0;
    ids.splice(0,28).forEach(rebuildCardInPlace);
    if(ids.length) eLangChunkR=requestAnimationFrame(step);
  };
  cancelLangChunks();
  if(ids.length) eLangChunkR=requestAnimationFrame(step);
}
/* Separators are rebuilt every render - there are a handful and they depend on their
   neighbours. Cards are kept unless their signature moved. */
function paintList(spellNote,items){
  if(cardPool.size>2000) cardPool=new Map();
  const frag=document.createDocumentFragment();
  const add=html=>{ if(!html) return; cardTpl.innerHTML=html;
    while(cardTpl.content.firstChild) frag.appendChild(cardTpl.content.firstChild); };
  add(spellNote);
  for(let k=0;k<items.length;k++){
    const it=items[k];
    add(it.sepH);
    if(!it.id) continue;
    let el=cardPool.get(it.id);
    if(!el || el.__sig!==it.sig){
      el=parseCardHtml(it.cardH);
      if(!el) continue;
      el.__sig=it.sig;
      cardPool.set(it.id,el);
    }else{
      patchCard(el,it);
    }
    frag.appendChild(el);
  }
  /* Verification hook: with it on, every kept card is rebuilt and compared. Off in normal
     use - it exists so the probe can prove the pool rather than sample it. */
  if(window.__verifyPool) verifyPool(items);
  list.replaceChildren(frag);
}
/* setAttribute APPENDS on a kept node where the builder interleaves, so serialisation order
   differs while the attribute set does not. CSS and dataset are order-blind; compare sorted. */
function normAttrOrder(el){
  return el.outerHTML.replace(/<([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)(\s*\/?)>/g,
    (m,name,attrs,close)=>{
      /* data-ord is stamped by the column dealer AFTER paint, so a kept node carries it and a
         fresh parse does not. It is not part of what the builder wrote. */
      const got=((attrs||"").match(/[\w:-]+(?:="[^"]*")?/g)||[]).filter(a=>a.indexOf("data-ord")!==0);
      return "<"+name+(got.length?" "+got.sort().join(" "):"")+close+">";
    });
}
function verifyPool(items){
  const bad=[];
  items.forEach(it=>{
    if(!it.id) return;
    const el=cardPool.get(it.id);
    if(!el) return;
    const fresh=parseCardHtml(it.cardH);
    if(fresh && normAttrOrder(fresh)!==normAttrOrder(el))
      bad.push({id:it.id,want:fresh.outerHTML,got:el.outerHTML});
  });
  window.__poolMismatch=bad;
}
function applyCardColumns(){
  if(!list) return;
  list.classList.remove("cols");
  list.style.removeProperty("--col-n");
  list.style.removeProperty("grid-template-rows");
  if(colMode()==="auto" && !colBoxWidth() && colTries<6){
    colTries++;
    requestAnimationFrame(applyCardColumns);
    return;
  }
  colTries=0;
  let n=colCount();
  colSetLastN(n);                    // what the WIDTH allows, which is what a resize compares
  if(n<2) return;

  /* THE FLAT ORDER, stamped before a single node moves: dealing puts the DOM into
     column order, so querySelectorAll no longer returns cards in the order the list
     means. Everything that walks the list in sequence reads this instead. */
  let ord=0;
  list.querySelectorAll(".card[data-id]").forEach(c=>{ c.dataset.ord=ord++; });

  const kids=[].slice.call(list.children);
  if(!kids.length) return;

  /* THE RESTRUCTURING HAPPENS OFF THE PAGE: attached, every node move invalidates style
     on a live list (160 of a 200ms render); detached, it is bookkeeping and one reflow on
     return. The list is put back before anything MEASURES it - a detached element has no
     geometry. */
  const _parent=list.parentNode, _next=list.nextSibling;
  if(_parent) _parent.removeChild(list);

  /* .e-span marks a SEMI-GROUP - a lifted set, not a shelf. Only the intent band wears it
     and spans the columns: it is an answer, not a home, and dealing an answer into one column
     buries it. The favourites block is a shelf like any category and is dealt with them. */
  const kinds=kids.map(el=>el.matches(".e-span") ? "bandsep"
                        : el.matches(COL_SEP) ? "sep"
                        : el.classList.contains("card") ? "card" : "other");
  const plan=colPlan(kinds,n);
  /* Put the list back before leaving: every exit between the detach and the reattach has to,
     or the card list simply stops existing. */
  if(plan.mode==="none" && !plan.band){ if(_parent) _parent.insertBefore(list,_next); return; }
  /* THE WIDTH SAYS HOW MANY FIT; THE PLAN SAYS HOW MANY THERE ARE. Asking only the width gave
     three columns to two things and left one empty, with both cards a third of the list wide
     for no reason - and a group is dealt whole, so two groups can never fill three columns
     however wide the window is. The band shares the columns, so it speaks for itself. ACROSS A
     DIVIDER each side is dealt from the first column on its own, so the wider side is what
     there is: counting both sides gave four columns to two and two, and filled two. */
  const _units = plan.mode==="groups" ? plan.runs.length
               : plan.divider>=0 ? Math.max(plan.before.length, plan.after.length)
               : (plan.cards||[]).length;
  const _band = plan.band ? plan.band.items.filter(i=>kinds[i]==="card").length : 0;
  n=Math.max(1,Math.min(n,Math.max(_units,_band)));
  if(n<2){ if(_parent) _parent.insertBefore(list,_next); return; }

  /* The band first and full width, with its own columns inside. Its heading spans those. */
  const boxes=[];
  const anchor=plan.trail.length?kids[plan.trail[0]]:null;
  for(let i=0;i<n;i++){
    const c=document.createElement("div");
    c.className="col";
    if(anchor) list.insertBefore(c,anchor); else list.appendChild(c);
    boxes.push(c);
  }

  /* THE BAND SHARES THE COLUMNS rather than sitting in a box of its own: a box is as
     tall as its TALLEST inner column, so the shorter band columns left dead space and
     every category below began at that line. Sharing means each column's categories start
     where its band cards ended; the heading still spans - it describes all of them. */
  let bandSepEl=null, bandShown=0;
  if(plan.band){
    const bandCards=[];
    for(let m=0;m<plan.band.items.length;m++){
      const el=kids[plan.band.items[m]];
      if(el.classList.contains("card")) bandCards.push(el);
      else { bandSepEl=el; list.insertBefore(el, boxes[0]); }
    }
    for(let m=0;m<bandCards.length;m++) boxes[m%n].appendChild(bandCards[m]);
    bandShown=bandCards.length;
    /* The heading's PLACEMENT waits until the end of this function: it measures the
       heading, and the top margin is only zeroed by a rule that needs it to be the list's
       first child - which it is not yet, with everything undealt still in front of it. */
  }

  if(plan.mode==="groups"){
    for(let i=0;i<plan.runs.length;i++){
      const g=document.createElement("div");
      g.className="cgroup";
      for(let m=0;m<plan.runs[i].items.length;m++) g.appendChild(kids[plan.runs[i].items[m]]);
      boxes[i%n].appendChild(g);
    }
  }else{
    /* Whatever is not a card - a lone category's separator, a spelling note - sits above the
       columns and spans them. */
    for(let i=0;i<plan.lead.length;i++) list.insertBefore(kids[plan.lead[i]],boxes[0]);
    if(plan.divider>=0){
      for(let i=0;i<plan.before.length;i++) boxes[i%n].appendChild(kids[plan.before[i]]);
      const div=kids[plan.divider];   // spans by the grid's own rule for anything that is not a column
      if(anchor) list.insertBefore(div,anchor); else list.appendChild(div);
      const below=[];
      for(let i=0;i<n;i++){
        const c=document.createElement("div");
        c.className="col";
        if(anchor) list.insertBefore(c,anchor); else list.appendChild(c);
        below.push(c);
      }
      for(let i=0;i<plan.after.length;i++) below[i%n].appendChild(kids[plan.after[i]]);
    }else{
      for(let i=0;i<plan.cards.length;i++) boxes[i%n].appendChild(kids[plan.cards[i]]);
    }
  }

  list.style.setProperty("--col-n",n);
  list.classList.add("cols");
  if(_parent) _parent.insertBefore(list,_next);   // back on the page, one reflow, before measuring

  /* THE HEADING'S PLACEMENT, last of all - once everything is dealt it is genuinely the
     first child and the grid is on, so what is measured is what paints. A heading spans
     ONLY the columns its cards fill; the columns past it span both rows and start level
     with it. k comes from the GROUP'S size, not the rendered count - a collapsed band
     renders none and must not claim the width. ROW ONE IS PINNED IN PIXELS: a spanning
     item contributes its intrinsic size to every track it covers, and min-content let a
     column of cards grow row one thousands of px tall. Safe to measure:
     align-items:start never stretches an item by its track. */
  if(bandSepEl){
    const badgeEl=bandSepEl.querySelector(".sep-n");
    const badge=badgeEl ? parseInt(badgeEl.textContent,10) : NaN;
    const total=isFinite(badge) ? badge : bandShown;
    const k=Math.min(Math.max(bandShown,total),n);
    if(k>0 && k<n){
      bandSepEl.style.gridColumn="1 / span "+k;
      bandSepEl.style.gridRow="1";
      for(let i=0;i<n;i++){
        boxes[i].style.gridColumn=String(i+1);
        boxes[i].style.gridRow = (i<k) ? "2" : "1 / span 2";
      }
      const sc=getComputedStyle(bandSepEl);
      const h=bandSepEl.getBoundingClientRect().height
             +(parseFloat(sc.marginTop)||0)+(parseFloat(sc.marginBottom)||0);
      list.style.gridTemplateRows=Math.ceil(h)+"px auto";
    }
  }
}

/* Auto reads the available width, so a resized window can want a different count. Re-render
   rather than re-shuffle: render() is the only thing that knows the flat order. */
let colResizeT=null;
addEventListener("resize",()=>{
  clearTimeout(colResizeT);
  colResizeT=setTimeout(()=>{ if(colCount()!==colLastN) render(); },160);
});
/* Where colAvailW comes from. Reading inside the callback is free - the observer fires
   after layout - and it also catches the widths a resize never reports: the panel docking,
   its drag, the shell's own animation. Re-deals only when the COUNT changes, so a render
   here cannot feed itself: dealing changes the list's height, never the box's width. */
if(typeof ResizeObserver==="function" && list && list.parentNode){
  new ResizeObserver(()=>{
    const w=list.parentNode.clientWidth||0;
    if(w===colAvailW) return;
    colSetAvailW(w);
    if(colCount()!==colLastN) requestAnimationFrame(()=>render());
  }).observe(list.parentNode);
}

/* The card body, extracted so a language flip can rebuild one card at a time - the
   render map and the flip's idle chunks must write the same bytes (verifyPool checks).
   ctx carries the map's per-card locals; everything else the body reads is global. */
function cardBodyHtml(m,i,ctx){
  const hit=ctx.hit, catHit=ctx.catHit, fav=ctx.fav, band=ctx.band,
        other=ctx.other, dragTip=ctx.dragTip;
  let cardH="";
    cardH+='<div class="card'+(m._hidden?" is-hidden":"")+(hit?" intent-hit":"")+(catHit?" cat-hit":"")
      +(cardDrag&&cardDrag.moved&&cardDrag.key===m.id?" dragging":"")
      +'" data-i="'+i+'" data-id="'+esc(m.id||'')+'" data-rank="'+esc(band)+'"'
      +(catSlot(m.c)>=0?' data-ec="'+catSlot(m.c)+'"':'')
      +' title="'+esc(dragTip)+'">';
    cardH+='<div class="chead">';
    /* data-i18n-skip: a card title and a category name are the employer's content. Nothing
       sweeps the card list today, but the marker travels with the markup if anything ever does. */
    cardH+='<span class="ctitle" data-i18n-skip>'+esc(cardTitle(m))+'</span><span class="ccat" data-i18n-skip>'+catIconSvg(m.c)+esc(CATS[m.c]||m.c||"")+'</span>';
    /* Captured rather than appended inline: a kept card has its badges added and removed by
       patchCard(), and they must be the same bytes a rebuild would have written. */
    const hitBadge='<span class="cbadge hit" title="'+esc(t("Linked to the selected intent"))+'">'+esc(t("int"))+'</span>';
    const catBadge='<span class="cbadge cat" title="'+esc(t("In a supporting category, relevant regardless of the intent"))+'">'+esc(t("sup"))+'</span>';
    if(hit) cardH+=hitBadge;
    if(catHit) cardH+=catBadge;
    if(fav) cardH+='<span class="cbadge fav" title="'+esc(t("In Favourites"))+'">'+esc(t("fav"))+'</span>';
    /* Moved counts as edited now that order is content: the card differs from the one
       the catalog shipped, even though its words do not. So does a card of your own. */
    if(m._custom || m._overridden || movedCardIds().has(m.id))
      cardH+='<span class="cbadge ed" title="'+esc(t("Changed or added by you, not what the catalog shipped"))+'">'+esc(t("mod"))+'</span>';
    const favTip=t(fav?"Remove from Favourites":"Add to Favourites");
    /* Hide is a toggle now that hidden entries stay on the list - the card itself is where you
       undo it. Delete lives only in Manage, so an irreversible action is never one stray click
       away while you are working a chat. */
    const hideTip=t(m._hidden
      ? "Show this card again"
      : (fav ? "Put this card away: it greys out at the foot of this category and loses its star"
             : "Put this card away: it greys out at the foot of this category"));
    const _note=noteFor(m);
    cardH+='<span class="cacts">'
      +(_note ? '<button type="button" data-act="note" title="'+esc(t("Internal note"))+'" aria-label="'+esc(t("Internal note"))+'" aria-expanded="false">'+_svg("ic",_NOTE)+'</button>' : '')
      +'<button type="button" data-act="edit" title="'+esc(t("Edit this card"))+'" aria-label="'+esc(t("Edit this card"))+'">'+ICON_EDIT+'</button>'
      +'<button type="button" class="'+(m._hidden?"":"danger")+'" data-act="hide" title="'+esc(hideTip)+'" aria-label="'+esc(hideTip)+'">'+(m._hidden?ICON_EYE_SHUT:ICON_EYE_OPEN)+'</button>'
      +'<button type="button" class="star-btn'+(fav?" on":"")+'" data-act="fav" title="'+esc(favTip)+'" aria-label="'+esc(favTip)+'" aria-pressed="'+(fav?"true":"false")+'">'+(fav?ICON_STAR_ON:ICON_STAR_OFF)+'</button>'
      +'</span></div>';
    /* A pinned card shows the version it speaks, not the one the toggle names. */
    const _L=cardLang(m);
    const ps=parts(m,_L), cls=_L==="pl"?" plx":"";
    if(ps.length){
      // _L, never lang: on a pinned card the badge must name the language actually shown.
      const many=ps.length>1, word=m.seq?t("STEP"):_L.toUpperCase();
      cardH+=ps.map((p,vi)=>{
        const on=entrySel&&entrySel.id===m.id&&entrySel.vi===vi?" sel":"";
        // role=button tells assistive tech these blocks act, not just read. No tabindex on
        // purpose: 200+ stops would swamp the tab order, and ↑↓/Enter already drive them.
        return '<div class="txt'+cls+on+'" role="button" data-v="'+vi+'"'+(many?' title="'+esc(t("Click to copy, or drag to reorder these"))+'"':' title="'+esc(t("Click to copy"))+'"')+'>'+
        '<span class="tag">'+word+(many?" "+(vi+1)+"/"+ps.length:"")+'</span>'+
        escFilled(fill(p,m,true))+'</div>';
      }).join("");
    } else {
      // a one-language card, which the maintenance panel counts: the other language's text is all it has
      cardH+='<div class="miss">'+esc(t("No {LANG} version for this card").replace("{LANG}",_L.toUpperCase()))
         +' - '+esc(t("switch to {LANG} to use it").replace("{LANG}",other.toUpperCase()))+'.</div>';
    }
    // In-card chips only when the side rail is off - otherwise the left panel is the list.
    const sws=(lang==="pl"?(m.swpl||m.sw):(m.sw||m.swpl));
    if(sws && !railActive()){
      // How-to on the tooltip: this strip sits inside a card the agent is reading at speed
      cardH+='<div class="swap" title="Click to pick, again to clear, and hold Ctrl for several"><b>Set {INTENT}</b> '+
        intentOrder.filter(si=>!isIntentHiddenIdx(si)).map(si=>{
          const s=sws[si]; if(s==null) return "";
          return '<code'+(intentIdxs.indexOf(si)>-1?' class="on"':'')+' data-si="'+si+'">'+
            esc(s)+'</code>';
        }).join("")+'</div>';
    }
    cardH+='</div>';
  return {cardH:cardH, hitBadge:hitBadge, catBadge:catBadge};
}
/* THE NOTE IS A CALLOUT, NOT A BOX ON THE CARD: the tour's card, placed by the tour's rules
   with the whole card as the spotlight and never over it, and the tour's arrow landing on the
   card's edge. It closes on anything that moves the ground under it - a click elsewhere, Esc,
   a scroll, a resize, a render - so it can never be stale. */
let notePaneEl=null, noteArrowEl=null, notePaneBtn=null;
function notePaneOpen(){ return !!notePaneEl; }
function closeNotePane(){
  if(notePaneEl){ notePaneEl.remove(); notePaneEl=null; }
  if(noteArrowEl){ noteArrowEl.remove(); noteArrowEl=null; }
  if(notePaneBtn){ notePaneBtn.setAttribute("aria-expanded","false"); notePaneBtn=null; }
}
function toggleNotePane(btn, id){
  if(notePaneBtn===btn){ closeNotePane(); return; }
  openNotePane(btn.closest(".card"), id, btn);
}
function openNotePane(card, id, btn){
  closeNotePane();
  const m=findCard(id), note=m&&noteFor(m);
  if(!card||!note) return;
  const pane=document.createElement("div");
  pane.className="tour-card note-pane"; pane.id="notePane"; pane.setAttribute("role","note");
  // A token named in a note wears the chip the macro gives it, not its braces.
  pane.innerHTML='<h3>'+esc(cardTitle(m))+'</h3><p>'+esc(note).replace(/\{([A-Z_]+)\}/g,'<span class="fillmiss">$1</span>')+'</p>';
  document.body.appendChild(pane);
  const vw=innerWidth, vh=innerHeight, pad=4, gap=44, cr=card.getBoundingClientRect();
  const hole={top:cr.top-pad,left:cr.left-pad,width:cr.width+pad*2,height:cr.height+pad*2};
  const w=Math.min(320,vw-28); pane.style.width=w+"px";
  const h=pane.offsetHeight;
  const clampX=x=>Math.max(14,Math.min(vw-w-14,x)), sideTop=Math.max(12,Math.min(vh-h-12,hole.top));
  const rightX=hole.left+hole.width+gap, leftX=hole.left-w-gap;
  let place, top, left;
  if(rightX+w<vw-10){ place="side"; left=rightX; top=sideTop; }
  else if(hole.top+hole.height+gap+h<vh-10){ place="below"; top=hole.top+hole.height+gap; left=clampX(hole.left+hole.width/2-w/2); }
  else if(hole.top-h-gap>10){ place="above"; top=hole.top-h-gap; left=clampX(hole.left+hole.width/2-w/2); }
  else if(leftX>=14){ place="side"; left=leftX; top=sideTop; }
  else { place="center"; top=Math.max(12,Math.min(vh-h-12,hole.top+40)); left=clampX(hole.left+hole.width/2-w/2); }
  pane.style.top=top+"px"; pane.style.left=left+"px";
  const route=place!=="center" ? tourArrowRoute({top,left,width:w,height:h},hole,place,0) : null;
  if(route){
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("class","tour-arrow note-arrow");
    svg.innerHTML='<path class="tour-shaft" pathLength="1"/><path class="tour-head"/>';
    document.body.appendChild(svg);
    drawTourArrow(svg,route,true);
    noteArrowEl=svg;
  }
  notePaneEl=pane; notePaneBtn=btn||null; if(btn) btn.setAttribute("aria-expanded","true");
  requestAnimationFrame(()=>{ if(notePaneEl===pane){ pane.classList.add("in"); if(noteArrowEl) noteArrowEl.classList.add("show"); } });
}
/* Hover opens the note where the switch is on and a hover exists; a rest of a third of a second,
   so a sweep across the list opens nothing. Leaving the card closes it unless the pointer went
   into the pane, and leaving the pane closes it unless it went back to the card. */
let noteHoverT=0, noteHoverCard=null;
function noteHoverOn(){ return document.body.classList.contains("note-hover") && matchMedia("(hover:hover)").matches; }
function noteHoverLeave(to){
  clearTimeout(noteHoverT); noteHoverT=0;
  if(to && ((to.closest && to.closest(".note-pane")) || (noteHoverCard && noteHoverCard.contains(to)))) return;
  noteHoverCard=null;
  if(notePaneEl && !notePaneBtn) closeNotePane();
}
document.addEventListener("mouseover",e=>{
  if(!noteHoverOn()) return;
  const pane=e.target.closest(".note-pane");
  if(pane) return;
  const card=e.target.closest("#list .card[data-id]");
  if(!card){ noteHoverLeave(e.target); return; }
  if(card===noteHoverCard) return;
  noteHoverLeave(null);
  noteHoverCard=card;
  if(!card.querySelector('[data-act="note"]')) return;
  noteHoverT=setTimeout(()=>{ noteHoverT=0; if(noteHoverCard===card && noteHoverOn()) openNotePane(card, card.dataset.id, null); },300);
});
document.addEventListener("mouseout",e=>{
  if(!noteHoverCard && !notePaneEl) return;
  const to=e.relatedTarget;
  const from=e.target.closest(".note-pane") || e.target.closest("#list .card[data-id]");
  if(from && !(to && from.contains(to))) noteHoverLeave(to);
});
document.addEventListener("click",e=>{
  if(notePaneEl && !notePaneEl.contains(e.target) && !(notePaneBtn&&notePaneBtn.contains(e.target))) closeNotePane();
},true);
addEventListener("scroll",()=>{ if(notePaneEl) closeNotePane(); },true);
addEventListener("resize",()=>{ if(notePaneEl) closeNotePane(); });
function render(){
  closeNotePane();
  cancelLangChunks();
  const terms=cardSearchTerms();
  syncPillCounts();
  ensureCardOrder();
  // Filter first, order second, so scoring only ever touches entries that already matched.
  const hits=cards.filter(m=>{
    if(!cardInActiveCats(m,terms)) return false;
    // Macro search: title + keywords + notes + full EN/PL text (not titles only)
    return cardMatchesSearch(m, terms);
  });
  // Also read below, to place the tier separator between the two groups.
  const sc=new Map();
  if(terms.length){
    /* Sort key: intent band -> tier -> score -> cmpCardDisplay.
       BAND: linkage is a band, not a tiebreaker - as a tiebreaker the linked entries
       interleaved with textually higher-scoring cards and the green rings scattered, so
       the sort and the colours disagreed. An intent states what the customer wants; the
       query narrows within it. Same predicate as the green ring, so customs are covered
       by construction; with no intent every card lands in band 1 and this is inert.
       TIER/SCORE: category order cannot be the outer key - it is what buried the real
       answers. cmpCardDisplay breaks the last tie; catOrder/cardOrder are read, never
       mutated - the pill regroup's own contract. */
    const aterms=intentAffinityGroups();  // once per render, not once per card
    hits.forEach(m=>{
      const s=cardSearchScore(m, terms, aterms);
      s.band=(intentIdxs.length && cardHitsSelectedIntent(m)) ? 0 : 1;
      sc.set(m, s);
    });
    shown=hits.sort((a,b)=>{
      const A=sc.get(a), B=sc.get(b);
      if(A.band!==B.band) return A.band-B.band;
      if(A.tier!==B.tier) return A.tier-B.tier;
      if(A.score!==B.score) return B.score-A.score;
      return cmpCardDisplay(a,b);
    });
  }else{
    // Intent bands / category+fav groups, then manual order within each band.
    shown=hits.sort(cmpCardDisplay);
  }

  if(!shown.length){
    /* An empty category needs no prose: the add-card is the whole answer and already
       names the category, so it becomes the first (only) card. The message stays where no
       add-card can stand in - a search with no hits, or All on an empty Etiuda. */
    const oneCat=(cats.length===1) ? cats[0] : null;
    /* A completely empty Etiuda gets a way in, not just a statement of fact - the sample is
       the fastest route to understanding what any of this is for. */
    const wholeThingEmpty=!cards.length && !cats.length;
    /* A clause following a button brings its own leading space unless it opens with punctuation:
       Polish closes these with a comma, and a space written into the markup floats it off the chip. */
    const afterBtn=c=>(/^[,.;:!?]/.test(c)?"":" ")+esc(c);
    list.innerHTML=terms.length
      ? '<div class="empty">'+esc(t("No cards match."))+'<br><br>'
        +esc(t("Press"))+' <kbd>Esc</kbd> '+esc(t("to clear macro search and intents."))+'</div>'
      : (wholeThingEmpty
        ? '<div class="empty">'+esc(t("Etiuda is empty."))+'<br><br>'
          /* A first run has no menu habits yet, and Import is the route someone who downloaded
             the file is looking for - so it is a button here, not the name of one elsewhere. */
          +esc(t(sampleReady() ? "Add a card to a category," : "Add a card to a category, or"))
          +' <button type="button" class="btn" id="emptyImport">'+esc(t("import a catalog"))+'</button>'
          /* Both branches close on words: a sentence ending on a button chip reads as unfinished,
             and a bare full stop after one reads as a stray mark. */
          +(sampleReady()
            ? ' '+esc(t("or"))
              +' <button type="button" class="btn" id="emptySample">'+esc(t("load a sample catalog"))+'</button>'
              +afterBtn(t("to see how it works."))
            : afterBtn(t("you already have.")))
          /* Said here because here is where it goes wrong - and WHICH answer is right depends on
             where the copy runs, the same split the boot script's storage advice makes. On a disk
             the usual fault is a catalog beside Etiuda under the wrong name, and an unexplained
             empty screen reads as broken software; opened from a link there is no file beside it,
             so that rule would be advice about a machine the reader is not using. */
          +'<br><br><span style="font-size:12.5px;opacity:.75">'
          +(location.protocol==="file:"
            ? esc(t("A catalog file next to Etiuda loads by itself when it is called"))+' '
              +'<code>etiuda-catalog.js</code>. '
              +esc(t("Under any other name, bring it in with the button above."))
            : esc(t("The catalog you import stays in this browser, ready whenever you come back.")))
          +'</span></div>'
        /* A chosen category with nothing in it: the same quiet drawing as the other empty
           states, but the category's own icon, so it says WHICH shelf is bare. Only when the
           category really holds no cards; filtered to nothing is a different sentence, and
           there is none to write for it. */
        : (oneCat
          ? (cardCounts[oneCat] ? "" : '<div class="empty empty-cat">'+catIconSvg(oneCat,"cat-ic empty-ic")
              +esc(t("This category is empty."))+'<br><br>'
              +esc(t("Press"))+' '+chordChips("newCard")+' '
              +esc(t("to create a card here."))+'</div>')
          : '<div class="empty">'+esc(t("Nothing here yet."))+'</div>'));
    const es=$("#emptySample");
    if(es) es.onclick=()=>loadSampleCatalog();
    const ei=$("#emptyImport");
    if(ei) ei.onclick=importCatalogHere;
    syncAddFab();
    applyCardColumns();
    pendingScrollHit=false;
    entrySel=null;
    return;
  }
  const other = lang==="en" ? "pl" : "en";
  /* One separator, marking whichever boundary is the meaningful one: with an intent the
     linked / not-linked edge (the band); without one the "about it" / "merely mentions
     it" edge (the tier). Never both - two lines in a result list reads as structure the
     user has to decode. */
  const sepByBand = terms.length && intentIdxs.length;
  const sepGroup = m => { const s=sc.get(m)||{}; return sepByBand ? s.band : s.tier; };
  const sepLabel = t(sepByBand ? "not linked to your intent" : "also mentions your search");
  const dragTip = terms.length
    ? t("A search ranks the cards by relevance; clear it to order them yourself")
    : t(intentIdxs.length
        ? "Drag header to reorder within the same highlight group"
        : "Drag header to reorder within the same highlight group; same category only");
  /* Landmarks show whenever the list is RESTING: macro search is relevance-ordered and
     carries its own tier separator above, so a query hides them; an intent only changes what
     the first landmark is, it does not remove them all. The hidden tail is one "put away"
     zone and gets no labels. */
  const groupList = !terms.length;
  /* Owning up to a spelling fix, ahead of everything the list holds. Prepending it costs the
     first landmark its `:first-child` zero top margin, which is right: there is content above
     it now, so the gap it was suppressing is the gap it should have. */
  const spellNote=(eSpellFix&&eSpellFix.length)
    ? '<div class="e-spellfix">'+esc(t("Searched for"))+' '+eSpellFix.map(f=>'<b>'+esc(f.to)+'</b>').join(" "+esc(t("and"))+" ")
      +' · '+esc(t("you typed"))+' '+eSpellFix.map(f=>esc(f.from)).join(" "+esc(t("and"))+" ")+'</div>'
    : "";
  /* One pass for the counts the separators show. Done here rather than inside the map
     because a separator is emitted before its cards, so the number has to exist first. */
  const groupN={};
  if(groupList) shown.forEach(m=>{
    const k=groupKeyOf(m); groupN[k]=(groupN[k]||0)+1; });
  /* A lone category is no landmark: its heading only repeats the pill, and a fold on the one
     group on screen would blank it. The band and favourites headings stay: they say why. */
  const gk=Object.keys(groupN);
  const soloCat=gk.length===1 && gk[0]!==COLLAPSE_BAND && gk[0]!==COLLAPSE_FAV;
  /* ITEMS, not one string: a separator is rebuilt every render and a card may be KEPT,
     so the two are carried apart even though they are joined again right below. */
  /* Shared by every card this render: the two languages, the search terms and the drag tip.
     Per-card inputs ride on cardFillKey(). */
  /* dragTip is deliberately ABSENT: it names the current selection, so signing it would
     rebuild all 257 cards on the very action this exists to make cheap. patchCard sets it. */
  const renderKey=String(uiLang())+"|"+String(typeof lang!=="undefined"?lang:"")
    +"|"+terms.join(" ");
  const items=shown.map((m,i)=>{
    const hit=cardHitsSelectedIntent(m);
    const catHit=cardHitsAlwaysCat(m);
    const fav=isFavourite(m.id);
    const band=displayBandKey(m);
    let sepH="";
    /* The list is sorted 0 then 1 on whichever key sepGroup picks, so there is exactly
       one transition. Sits between cards and takes no part in drag or focus logic - card
       drag resolves through .closest(".card"), block focus walks .txt; this is neither. */
    if(terms.length && i>0 && sepGroup(shown[i-1])===0 && sepGroup(m)===1){
      sepH+='<div class="list-sep"><i></i><span>'+esc(sepLabel)+'</span><i></i></div>';
    }
    /* Resting landmarks: the favourites header, the INTENT band header, then a category
       separator at every change below - all between cards, no part in drag or focus.
       Category changes INSIDE a band are deliberately silent: everything under that
       heading is there for the same reason, and the categories resume when it ends. */
    if(groupList && !soloCat){
      const prevM=i>0?shown[i-1]:null;
      /* Gated on the BLOCK, not on the star. Without favBlockOn() here, a starred card in a
         filtered view still counted as ending a favourites block that was never drawn, and
         the category separator fired a second time under it. */
      const prevFav=!!(favBlockOn() && prevM && isFavourite(prevM.id));
      const band=inIntentBand(m), prevBand=prevM?inIntentBand(prevM):false;
      const fav=favBlockOn() && isFavourite(m.id);
      if(band && i===0){
        /* The band spans every column rather than being dealt into one - it is a result set,
           not a shelf, and burying the most relevant cards in column one would be the whole
           point of the exercise undone. FOLDED there is no set to bury: the heading takes a
           column like any other and the categories come up beside it, which is what folding
           was asked for. `e-bandsep` is what the column layout keys on. */
        sepH+='<div class="list-sep e-catsep e-bandsep'+(isCollapsed(COLLAPSE_BAND)?'':' e-span')
          +'"><span>'+ICON_INTENT_LINK
          +esc(t("Matching your intent"))+'</span>'
          +collapseCtrlHtml(COLLAPSE_BAND,groupN[COLLAPSE_BAND]||0)+'</div>';
      }else if(fav && i===0){
        sepH+='<div class="list-sep e-favsep"><span><svg class="e-favstar" viewBox="0 0 20 20" aria-hidden="true" focusable="false">'+_STAR+'</svg>'+esc(t("Favourites"))+'</span>'
          +collapseCtrlHtml(COLLAPSE_FAV,groupN[COLLAPSE_FAV]||0)+'</div>';
      }else if(!band && !fav && (!prevM || prevBand || prevFav || prevM.c!==m.c)){
        const _sl=catSlot(m.c);
        sepH+='<div class="list-sep e-catsep"><span data-k="'+esc(m.c||"")+'"'+(_sl>=0?' data-ec="'+_sl+'"':'')+'>'
          +catIconSvg(m.c)+esc(CATS[m.c]||m.c||"")+'</span>'
          +collapseCtrlHtml(String(m.c||""),groupN[String(m.c||"")]||0)+'</div>';
      }
    }
    /* FOLDED: the heading is already in h, so returning here keeps the landmark and
       drops everything under it. Gated on groupList, so a search - which draws no
       groups at all - can never hide a hit behind a fold. */
    /* Folded: the heading is in sepH and there is no card to keep, so the item carries no id. */
    if(groupList && !soloCat && isCollapsed(groupKeyOf(m)))
      return {sepH:sepH, cardH:"", id:null};
    const built=cardBodyHtml(m,i,{hit:hit,catHit:catHit,fav:fav,band:band,other:other,dragTip:dragTip});
    return {sepH:sepH, cardH:built.cardH, id:m.id,
      sig:ePackEpoch+"|"+renderKey+"|"+cardFillKey(m)
        +"|"+(entrySel&&entrySel.id===m.id?entrySel.vi:-1),
      hit:hit, catHit:catHit, hidden:!!m._hidden, i:i, band:band,
      dragging:!!(cardDrag&&cardDrag.moved&&cardDrag.key===m.id),
      hitBadge:built.hitBadge, catBadge:built.catBadge, dragTip:dragTip};
  });
  paintList(spellNote,items);
  syncAddFab();
  /* Last thing before anything measures the list: everything above builds one flat
     sequence, and this is the only step that knows about columns. */
  applyCardColumns();
  settleFreshCards();
  eApplyRecency();

  // Drop focus if that block disappeared after filter/reorder
  if(entrySel && !list.querySelector('.card[data-id="'+cssEsc(entrySel.id)+'"] .txt[data-v="'+entrySel.vi+'"]')){
    entrySel=null;
  }

  if(pendingScrollHit){
    pendingScrollHit=false;
    // Wait a frame so layout has the new cards, then reveal the first intent-linked entry.
    requestAnimationFrame(()=>{
      /* The FIRST intent-hit, deliberately - with an openers category that is an opener, and
         that is the point: the cold open adapted to this intent is worth seeing first.
         Aiming past the openers at the first intent-specific card was tried and reverted.
         The scroll tolerates a standing category filter: it looks for a linked card and
         does nothing when the filter hides them all. */
      const hit=list.querySelector(".card.intent-hit .txt[data-v]");
      if(!hit) return;
      const card=hit.closest(".card[data-id]");
      /* The reveal is for the eyes; the mark follows only when the cards hold the arrows.
         An armed run keeps them on the rail, and a mark nothing walks must never show. */
      if(card && semiKind!=="intent") entrySel={id:card.dataset.id, vi:+hit.dataset.v};
      markEntrySel();
      /* Only scroll if the entry is not already ON SCREEN - centring unconditionally slid
         the list hundreds of px to move a card already readable, which is what read as
         juddering. The header is sticky, so "visible" starts at its underside, not 0. */
      const hdr=document.querySelector("header");
      const top=(hdr?hdr.getBoundingClientRect().bottom:0)+12;
      const r=hit.getBoundingClientRect();
      if(r.top>=top && r.bottom<=window.innerHeight-12) return;
      /* With a band the answer is AT THE TOP by construction - go there, no hunting. */
      const target=intentBandOn() ? (list.querySelector(".e-bandsep") || hit) : hit;
      // The first thing in the list means the top of the page - see scrollPageTop().
      const firstBlock=list.querySelector(".card, .e-bandsep");
      if(firstBlock && (firstBlock===target || firstBlock.contains(target) || target.contains(firstBlock))){
        scrollPageTop(); return;
      }
      target.scrollIntoView({block:intentBandOn()?"start":"center",behavior:"smooth"});
    });
  } else {
    markEntrySel();
  }
  /* Scheduled, not immediate: a title's width is not settled until its column is dealt and
     the card it sits in has been laid out. */
  scheduleCutScan();
}

/** Cards in the order the LIST means, which is only document order while there is one
 *  column. See the stamping in applyCardColumns(). */
function listCardsOrdered(){
  if(!list) return [];
  const a=Array.prototype.slice.call(list.querySelectorAll(".card[data-id]"));
  if(!list.classList.contains("cols")) return a;
  return a.sort((x,y)=>(+x.dataset.ord||0)-(+y.dataset.ord||0));
}
/** All copyable blocks in list order (alts, steps, or single body). */
function listEntryEls(){
  const out=[];
  listCardsOrdered().forEach(c=>{
    Array.prototype.slice.call(c.querySelectorAll(".txt[data-v]")).forEach(t=>out.push(t));
  });
  return out;
}
function markEntrySel(){
  if(!list) return;
  list.querySelectorAll(".txt.sel").forEach(el=>el.classList.remove("sel"));
  if(!entrySel) return;
  const el=list.querySelector('.card[data-id="'+cssEsc(entrySel.id)+'"] .txt[data-v="'+entrySel.vi+'"]');
  if(el) el.classList.add("sel");
  else entrySel=null;
}
function setEntrySel(id, vi, opts){
  opts=opts||{};
  if(id==null){ entrySel=null; markEntrySel(); return; }
  entrySel={id:String(id), vi:+vi||0};
  markEntrySel();
  if(opts.scroll && list){
    const el=list.querySelector('.card[data-id="'+cssEsc(entrySel.id)+'"] .txt[data-v="'+entrySel.vi+'"]');
    if(el) el.scrollIntoView({block:opts.block||"nearest", behavior:opts.smooth===false?"auto":"smooth"});
  }
  scheduleTabSave();
}
/* THE PAGE'S SCROLLER IS AN ELEMENT, not the window: the frame is fixed and one region under
   the header scrolls. Asked for rather than cached, because a stale node scrolls nothing.
   The fallbacks are for a document that never got the shell. */
function pageScroller(){
  return document.getElementById("pageScroll") || document.scrollingElement || document.documentElement;
}
function pageScrollY(){ const el=pageScroller(); return (el&&el.scrollTop)||0; }
/* THE PAGE KEYS: the browser answered these while the window was the scroller and cannot now,
   because the scrolling element is never the focused one. Instant, like the keys they stand
   in for. Which of them survive a caret is the callers' business, not this one's. */
function pageKeyScroll(key){
  const sc=pageScroller(), page=Math.max(120, sc.clientHeight-60);
  const dy = key==="PageDown" ?  page : key==="PageUp" ? -page
           : key==="End"      ?  sc.scrollHeight : key==="Home" ? -sc.scrollHeight : null;
  if(dy==null) return false;
  sc.scrollBy({top:dy, left:0, behavior:"auto"});
  return true;
}
/* Landing on the FIRST macro means the top of the page, not merely far enough up to see
   it: scroll-margin-top stops short - correct for every other entry, wrong for this one,
   because nothing above it is worth hiding and arriving at the beginning should look like
   the beginning. Every way of arriving there uses this. */
function scrollPageTop(){
  const el=pageScroller();
  try{ el.scrollTo({top:0, left:0, behavior:"smooth"}); }
  catch(_){ try{ el.scrollTop=0; }catch(__){} }
}
/** Navigate focus across every copyable block (not whole cards). */
function navEntry(dir){
  const els=listEntryEls();
  if(!els.length) return false;
  let i=els.findIndex(el=>{
    if(!entrySel) return false;
    const card=el.closest(".card[data-id]");
    return card&&card.dataset.id===entrySel.id && +el.dataset.v===entrySel.vi;
  });
  /* Wraps, like navPill - it used to CLAMP, a dead stop at both ends, and the two lists
     sat side by side behaving differently: the kind of inconsistency you feel long before
     you can name it. */
  if(i<0) i=dir>0?0:els.length-1;
  else i=((i+dir)%els.length+els.length)%els.length;
  const el=els[i];
  const card=el.closest(".card[data-id]");
  if(!card) return false;
  setEntrySel(card.dataset.id, +el.dataset.v, {scroll:i>0});
  if(i===0) scrollPageTop();
  return true;
}
/** Pill keys in on-screen order (All = "", then category order). [data-k] rather than
 *  .pill: the trailing "+" and the inline input are pills by class but not categories -
 *  mapped to "" they were indistinguishable from All (a real key), so ←/→ landed on the
 *  "+" and read as a dead press. Selecting on the attribute means a new control added to
 *  the strip cannot rejoin the keyboard cycle by accident. */
function listPillKeys(){
  if(!pills) return [];
  return Array.prototype.map.call(pills.querySelectorAll(".pill[data-k]"), el=>el.dataset.k);
}
/** ←/→ cycle category filter like a plain click (single pill; All clears filter). */
/* SHIFT IS THE SAME AXIS, ALL THE WAY - the compass's amplitude. The walkable set is
   navPill's own, so a search that hides empty categories hides them here too; All is
   skipped because "first category" means a category. */
function navPillEnd(dir){
  let keys=listPillKeys();
  if(!keys.length) return false;
  const sc=searchCounts();
  if(sc){
    const live=keys.filter(k=>!k || (sc[k]||0)>0);
    if(live.length>1) keys=live;
  }
  const real=keys.filter(Boolean);
  if(!real.length) return false;
  const k=dir>0?real[real.length-1]:real[0];
  if(cats.length===1 && cats[0]===k) return true;
  const railBefore=captureRail(), relBefore=railRelKeys();
  cats=[k];
  pendingScrollHit=!!intentIdxs.length;
  drawPills();
  render();
  railEchoRedraw(railBefore, relBefore);
  peekPillsForKey(k);
  scheduleTabSave();
  return true;
}
/* The mark to the far end of its own surface - and, when it is already there, across to
   the other surface's matching end. That second press is the only way to reach the cards
   without accepting an intent, and it is symmetric: the same press comes back. A surface
   with nothing active refuses the crossing, because grey means inactive. */
/* WHERE THE MARK IS, by the same test the decorator paints by - semiKind alone is not
   the answer: the mark a query puts on the best intent claims no surface, so it reads as
   null while being plainly visible. */
function markSurface(){
  if(semiKind==="card" || entrySel) return entrySel?"card":null;
  if(railMarkUsed) return null;
  const idx = railSel>=0 && railSel<railOrder.length ? railOrder[railSel] : railMarkIdx;
  if(idx<0) return null;
  return (railSel>=0 || semiKind==="intent" || (railQuery() && railSettled)) ? "intent" : null;
}
function markEnd(dir){
  const endPos=railStep(dir>0?railOrder.length:-1, dir>0?-1:1);   // the last or first UNPICKED row
  const railHas=endPos>=0;
  const els=listEntryEls();
  const cardHas=els.length>0;
  const onIntent = markSurface()==="intent";
  const atEnd = onIntent
    ? (railHas && railOrder.indexOf(railSel>=0?railOrder[railSel]:railMarkIdx)===endPos)
    : (!!entrySel && els.length
        && els[dir>0?els.length-1:0].closest(".card[data-id]").dataset.id===entrySel.id
        && +els[dir>0?els.length-1:0].dataset.v===entrySel.vi);
  let toIntent = onIntent ? !atEnd : atEnd;
  if(toIntent && !railHas) return !!onIntent;     // nothing to cross to - stay put
  if(!toIntent && !cardHas) return !!onIntent;
  kbdNav(true);
  if(toIntent){
    semiKind="intent"; railMarkUsed=false;
    if(entrySel){ entrySel=null; markEntrySel(); }
    railSel = endPos;
    railMarkIdx = railOrder[railSel];
    railDecorate(true);
  }else{
    semiKind="card"; railSel=-1;
    railDecorate(false);
    const el=els[dir>0?els.length-1:0];
    const card=el.closest(".card[data-id]");
    setEntrySel(card.dataset.id, +el.dataset.v, {scroll:dir>0, block:"nearest"});
    if(dir<0) scrollPageTop();
  }
  return true;
}
function navPill(dir){
  let keys=listPillKeys();
  if(!keys.length) return false;
  /* While a query is live, walk only the categories that contain matches - 25
     categories and a two-hit query meant pressing through twenty empty ones. All stays
     reachable always (empty key); the restriction drops if it would leave only All. */
  const sc=searchCounts();
  if(sc){
    const live=keys.filter(k=>!k || (sc[k]||0)>0);
    if(live.length>1) keys=live;
  }
  let i;
  if(!cats.length) i=0; // All
  else {
    i=keys.findIndex(k=>k && cats.indexOf(k)>-1);
    if(i<0) i=0;
  }
  const n=keys.length;
  i=((i+dir)%n+n)%n;
  const k=keys[i];
  // Captured before cats changes - see the pill click handler, same shape
  const railBefore=captureRail(), relBefore=railRelKeys();
  if(!k) cats=[];
  else cats=[k];
  pendingScrollHit=!!intentIdxs.length;
  drawPills();
  render();
  railEchoRedraw(railBefore, relBefore);
  // after drawPills, so the pill being measured is the one now on screen
  peekPillsForKey(k);
  /* The category walk moves the FILTER and nothing else - seeding the first block here
     minted a second mark and stole the surface from an intent mark the arrows were
     following. A card mark that survives the filter keeps working; one that does not is
     nulled by the render's own re-validation; with no mark, navEntry starts from the top
     on its own. */
  scheduleTabSave();
  return true;
}
/** Copy the focused block (or other language at the same part index). */
function copyEntrySel(otherLang){
  if(!entrySel) return false;
  const m=findCard(entrySel.id)||shown.find(x=>x&&x.id===entrySel.id);
  if(!m) return false;
  /* The pinned language is what is on screen, so it is what a copy means - and what the
     other-language shortcut flips away from. */
  const shown_l=cardLang(m);
  const l=otherLang?(shown_l==="en"?"pl":"en"):shown_l;
  const ps=parts(m,l);
  if(!ps.length){ toast(t("No {LANG} version for this card").replace("{LANG}",l.toUpperCase())); return true; }
  const vi=Math.max(0, Math.min(ps.length-1, entrySel.vi|0));
  bumpUseCount(entrySel.id);
  copy(fill(ps[vi],m,0,l), copiedToastMsg(m, l, vi, ps.length));
  eCopyFeedback(entrySel.id);   // wash the selected block + recency trace, same as a click
  return true;
}
// ---- card drag-reorder (within same relevance band only) ----------------
let cardDrag=null, cardSwapLock=0, cardSuppressClick=false;
/* How far the pointer must travel AGAINST the last swap before that swap can be undone. Above
   pointer jitter (a +/-1px wobble must not release the lockout) and far below any movement made
   on purpose. See the partner lockout in the pointermove handler. */
const CARD_DRAG_REVERSE=8;
function cssEsc(s){
  if(window.CSS&&typeof CSS.escape==="function") return CSS.escape(s);
  return String(s).replace(/[^a-zA-Z0-9_-]/g,ch=>"\\"+ch);
}
/* Star and hide MOVE a card, and without motion the acted-on card appears to vanish -
   the one thing an undoable action should never look like. The intent-pick FLIP cannot
   be reused: that one refuses above 25 cards because an intent reshuffles the whole
   list; this moves ONE card plus the neighbours closing its gap. So the cap here is on
   what gets TRANSFORMED: cards within half a screen, moves shorter than one viewport, at
   most CARD_MOVE_MAX of them. A card leaving for far off-screen is not animated - the
   gap closing behind it still says where it went. */
const CARD_MOVE_MAX=40;
function flipCardsAround(mutate,opts){
  if(!list || mgReduceMotion()){ mutate(); return; }
  const vh=window.innerHeight, margin=vh*0.5;
  /* clampTravel (the fold path only): everything below a folded group is one rigid
     block whose true travel is the group's height - one to five viewports, far past the
     teleport cap, so the glide never played and a fold just blinked. Clamping starts the
     block at most this many pixels from where it lands - the same settle the card swap
     plays, in the direction the shelf closed, never the full-distance blur the cap
     forbids. Star and hide pass nothing and keep the strict cap: their movers travel
     alone, and a lone card teleporting reads as scrolling. A clamped fold also CAPTURES
     the whole list: a collapse lands cards from a group-height below, and an arrival
     with no before-rect cannot animate. Capturing is one rect per card on the laid-out
     old tree - cheap; what must stay bounded is FORCING rects real after the re-render,
     so the estimate rects narrow the watch first and only cards that can land near the
     viewport get forced. */
  const clamp=opts&&opts.clampTravel;
  /* Only while the watched window reaches the columns' first cards. The re-render
     replaces every node and content-visibility resolves relevancy a frame later - a rect
     read straight afterwards is the 220px estimate. Forcing the watched cards real is not
     enough: their positions still ride on every estimated card ABOVE them in the column,
     and that offset has a hide's exact signature (one uniform card height). Near the top
     nothing sits above to estimate - and that is where star and hide are used: the
     favourites block. Scrolled deep, the honest options are a full layout (the exact
     cost content-visibility avoids) or no animation; the card takes its new place - the
     standing preference over animating from offsets that never existed. */
  if(list.getBoundingClientRect().top<=-margin){ mutate(); return; }
  const before={};
  // READ pass, then the mutation, then a READ pass and a WRITE pass - never interleaved.
  list.querySelectorAll(".card[data-id]").forEach(el=>{
    const r=el.getBoundingClientRect();
    if(clamp || (r.bottom>-margin && r.top<vh+margin)) before[el.dataset.id]=r.top;
  });
  mutate();                                   // the toggles mutate AND re-render
  const watched=[];
  list.querySelectorAll(".card[data-id]").forEach(el=>{
    if(before[el.dataset.id]==null) return;
    if(clamp){
      const r=el.getBoundingClientRect();     // estimate rect - only good enough to shortlist
      if(r.bottom<-1.5*vh || r.top>2.5*vh) return;
    }
    watched.push(el); el.style.contentVisibility="visible";
  });
  const release=()=>watched.forEach(el=>{ el.style.contentVisibility=""; });
  const moved=[], dys=[];
  watched.forEach(el=>{
    const b=before[el.dataset.id];
    const r=el.getBoundingClientRect();
    if(r.bottom<-margin || r.top>vh+margin) return;
    // whole pixels only - a fractional offset puts the text on a half-pixel and it blurs
    let dy=Math.round(b-r.top);
    if(!dy) return;
    if(Math.abs(dy)>vh && !clamp) return;
    if(clamp && Math.abs(dy)>clamp) dy=(dy>0?clamp:-clamp);
    moved.push(el); dys.push(dy);
  });
  if(!moved.length || moved.length>CARD_MOVE_MAX){ release(); return; }
  moved.forEach((el,i)=>{ el.style.transition="none"; el.style.willChange="transform";
                          el.style.transform="translateY("+dys[i]+"px)"; });
  /* Commit the invert before attaching the transition - see the note at flipPills():
     without a computed start value Firefox shows the end state. One forced reflow for
     the whole list, then attach and release in the same task. */
  void (list||document.body).offsetHeight;
  const clear=()=>{ moved.forEach(el=>{ el.style.transition=""; el.style.transform=""; el.style.willChange=""; }); release(); };
  moved.forEach(el=>{ el.style.transition="transform .18s "+E_EASE; el.style.transform=""; });
  setTimeout(clear,240);
}
/* Fold and unfold move: the survivors glide through flipCardsAround exactly as for a
   star or hide; the cards an unfold reveals are the ids the render added - no knowledge
   of the group needed - and rise in from their heading. A collapse adds nothing, so only
   the glide plays: the gap closing behind the group is the exit. The fresh chevron is
   handed an animation that finishes the turn from the old state. */
function animateFoldToggle(key){
  const had=new Set();
  if(list) list.querySelectorAll(".card[data-id]").forEach(el=>had.add(el.dataset.id));
  flipCardsAround(()=>{ toggleCollapsed(key); render(); },{clampTravel:180});
  if(!list || mgReduceMotion()) return;
  const fold=list.querySelector('.sep-fold[data-fold-key="'+cssEsc(key)+'"]');
  if(fold){
    const turn=isCollapsed(key)?"e-turn-shut":"e-turn-open";
    fold.classList.add(turn);
    setTimeout(()=>fold.classList.remove(turn),220);
  }
  const fresh=[];
  list.querySelectorAll(".card[data-id]").forEach(el=>{ if(!had.has(el.dataset.id)) fresh.push(el); });
  if(!fresh.length) return;
  fresh.forEach(el=>el.classList.add("e-unfolding"));
  setTimeout(()=>fresh.forEach(el=>el.classList.remove("e-unfolding")),260);
}
/* A swap during a drag no longer re-renders the list. Two bugs shared that root -
   "cards far from the drag wobble, and on Firefox nothing animates at all": render()
   replaces every node, and content-visibility:auto resolves relevancy a frame AFTER
   creation, so rects read straight after the rebuild are 220px estimates - on an
   adjacent swap, 251 of 253 cards reported a bogus delta and got a transform layer.
   Chrome showed distant wobble; Firefox dropped the animation whole. The re-render per
   crossing was also most of what made dragging heavy.
   So the swap MOVES THE DOM NODES exactly as far as the data order moved, and measures
   only the cards between the two positions - live elements, real geometry. THE MARKS
   make it dealing-agnostic: every affected card's current DOM position is marked and the
   rotated sequence poured back into the same marks - reproducing what a full re-deal
   would produce in every column shape without knowing which is on screen. dataset.ord
   follows the marks, so listCardsOrdered() stays truthful; the dragged card keeps its
   node, so .dragging survives without re-application. */
function animateCardReorder(fromId,toId){
  if(!moveCardOrder(fromId,toId)) return;
  if(!list || mgReduceMotion()){ render(); return; }
  const ordered=listCardsOrdered();
  let fromI=-1, toI=-1;
  ordered.forEach((el,i)=>{
    if(el.dataset.id===fromId) fromI=i;
    if(el.dataset.id===toId) toI=i;
  });
  if(fromI<0||toI<0||fromI===toI){ render(); return; }   // stale DOM - take the full path
  const lo=Math.min(fromI,toI), hi=Math.max(fromI,toI);
  const span=ordered.slice(lo,hi+1);
  const before=span.map(el=>el.getBoundingClientRect());
  const marks=span.map(el=>{
    const m=document.createComment("slot");
    el.parentNode.insertBefore(m,el);
    return m;
  });
  const seq=span.slice();
  seq.splice(toI-lo,0,seq.splice(fromI-lo,1)[0]);       // the same rotation the data order made
  const ords=span.map(el=>el.dataset.ord);
  seq.forEach((el,i)=>{ marks[i].parentNode.insertBefore(el,marks[i]); el.dataset.ord=ords[i]; });
  marks.forEach(m=>m.remove());
  // Read every position first, then write every transform: a rect read after a style write
  // forces a fresh layout to answer it, which is one full layout per card.
  const vh=window.innerHeight, margin=vh;
  const moved=[], deltas=[];
  span.forEach((el,i)=>{
    const b=before[i], a=el.getBoundingClientRect();
    if((b.bottom<-margin||b.top>vh+margin)&&(a.bottom<-margin||a.top>vh+margin)) return;
    const dx=Math.round(b.left-a.left), dy=Math.round(b.top-a.top);
    if(!dx && !dy) return;
    moved.push(el); deltas.push(dx+"px,"+dy+"px");
  });
  if(!moved.length || moved.length>CARD_MOVE_MAX) return;
  moved.forEach((p,i)=>{ p.style.transition="none"; p.style.willChange="transform";
                         p.style.transform="translate("+deltas[i]+")"; });
  /* Commit the invert before attaching the transition - see the note at flipPills():
     without a computed start value Firefox shows the end state. Same-task attach also
     avoids the background-tab rAF pause. */
  void list.offsetHeight;
  moved.forEach(p=>{ p.style.transition="transform .18s "+E_EASE; p.style.transform=""; });
  setTimeout(()=>moved.forEach(p=>{ p.style.transition=""; p.style.transform=""; p.style.willChange=""; }),200);
}
// ---- alt/seq block drag-reorder (within one card) -----------------------
let txtDrag=null, txtSwapLock=0, txtSuppressClick=false;
if(list){
  list.addEventListener("pointerdown",e=>{
    if(e.button!==0) return;
    // Alt/seq block drag (only when multiple parts)
    const txt=e.target.closest(".txt[data-v]");
    if(txt){
      const card=txt.closest(".card[data-id]");
      if(card){
        const m=findCard(card.dataset.id);
        const n=m&&m.alt?parts(m,cardLang(m)).length:0;
        if(n>1){
          try{ e.preventDefault(); }catch(_){}
          txtSuppressClick=false;
          txtDrag={mid:card.dataset.id, vi:+txt.dataset.v, x:e.clientX, y:e.clientY, moved:false};
          return;
        }
      }
      return; // single-block txt: leave for click-to-copy; no card drag
    }
    // Card drag from header chrome only - not action buttons, copy blocks, or intent chips
    if(e.target.closest(".cacts, .txt, .swap, button, a, code, input, textarea, select")) return;
    const card=e.target.closest(".card[data-id]");
    if(!card) return;
    // Relevance-ranked list while searching: never start a card drag (see moveCardOrder)
    if(cardSearchTerms().length) return;
    if(!e.target.closest(".chead") && e.target.closest(".note")) return;
    // Avoid browser text-selection while preparing a drag (empty padding between blocks)
    try{ e.preventDefault(); }catch(_){}
    cardSuppressClick=false;
    // partner = the card most recently swapped with; it is refused a swap back while the pointer
    // is still inside it, which is what lets the swap fire at the target's edge without thrashing.
    cardDrag={key:card.dataset.id, rank:card.dataset.rank, x:e.clientX, y:e.clientY, moved:false,
              partner:null, partnerAxis:"y", partnerDir:0, partnerPos:0};
  });
}
addEventListener("pointermove",e=>{
  // --- alt/seq block reorder ---
  if(txtDrag){
    if(!txtDrag.moved){
      if(Math.abs(e.clientX-txtDrag.x)+Math.abs(e.clientY-txtDrag.y)<6) return;
      txtDrag.moved=true;
      document.documentElement.classList.add("txtdrag");
      try{ const s=window.getSelection&&window.getSelection(); if(s&&s.removeAllRanges) s.removeAllRanges(); }catch(_){}
      const el=list&&list.querySelector('.card[data-id="'+cssEsc(txtDrag.mid)+'"] .txt[data-v="'+txtDrag.vi+'"]');
      if(el) el.classList.add("dragging");
    }
    if(Date.now()-txtSwapLock<190) return;
    const under=document.elementFromPoint(e.clientX,e.clientY);
    const t=under&&under.closest?under.closest(".txt[data-v]"):null;
    if(!t) return;
    const card=t.closest(".card[data-id]");
    if(!card||card.dataset.id!==txtDrag.mid) return;
    const toVi=+t.dataset.v;
    if(!Number.isInteger(toVi)||toVi===txtDrag.vi) return;
    // Swap as soon as the pointer is over the other block (not midpoint). Lock avoids thrash.
    txtSwapLock=Date.now();
    const fromVi=txtDrag.vi;
    if(animateTxtReorder(txtDrag.mid, fromVi, toVi)){
      txtDrag.vi=toVi;
      if(entrySel&&entrySel.id===txtDrag.mid&&entrySel.vi===fromVi) entrySel={id:txtDrag.mid, vi:toVi};
      markEntrySel();
    }
    return;
  }
  // --- whole-card reorder ---
  if(!cardDrag) return;
  if(!cardDrag.moved){
    if(Math.abs(e.clientX-cardDrag.x)+Math.abs(e.clientY-cardDrag.y)<6) return;
    cardDrag.moved=true;
    document.documentElement.classList.add("carddrag");
    try{ const s=window.getSelection&&window.getSelection(); if(s&&s.removeAllRanges) s.removeAllRanges(); }catch(_){}
    const el=list&&list.querySelector('.card[data-id="'+cssEsc(cardDrag.key)+'"]');
    if(el) el.classList.add("dragging");
  }
  if(Date.now()-cardSwapLock<190) return;
  const under=document.elementFromPoint(e.clientX,e.clientY);
  const t=under&&under.closest?under.closest(".card[data-id]"):null;
  if(!t||t.dataset.id===cardDrag.key) return;
  // Only swap within the same highlight band (green / blue / fav combos / regular)
  if(String(t.dataset.rank)!==String(cardDrag.rank)) return;
  /* Swap the moment the pointer touches the target, exactly as the intent panel does. A
     midpoint test stopped the thrash but charged ~121px of dragging before anything
     moved; a bare edge thrashed. What prevents thrash is not distance but refusing to
     swap BACK with the card just swapped - oscillation IS that pair trading places;
     block it and the edge is stable, and a genuine change of direction still resolves.
     Chosen over a direction lock, which keys off the sign of pointer movement and flaps
     on jittery input; this test is purely positional. The 190ms lock above stays: it
     covers the FLIP, so geometry is never read mid-transform.
     The lockout MUST release on a deliberate reversal, or it blocks undo: after a swap
     the pointer sits inside the partner, so putting a card straight back needed dragging
     clear of a whole card first. Moving CARD_DRAG_REVERSE px against the swap releases
     it; jitter never travels that far in one direction.
     THE AXIS IS PART OF THE LOCKOUT: the band deals round-robin, so order-neighbours sit
     side by side - a horizontal swap measured on clientY can never release, and a
     top/bottom "still inside" is true for the whole row. The swap's own geometry names
     the axis: whichever separates the two centres more. */
  const relPos=cardDrag.partnerAxis==="x"?e.clientX:e.clientY;
  if(cardDrag.partner!=null && cardDrag.partnerDir &&
     (relPos-cardDrag.partnerPos)*cardDrag.partnerDir < -CARD_DRAG_REVERSE){
    cardDrag.partner=null;
  }
  if(cardDrag.partner===t.dataset.id){
    const pr=t.getBoundingClientRect();
    const inside=cardDrag.partnerAxis==="x"
      ? (e.clientX>=pr.left && e.clientX<pr.right)
      : (e.clientY>=pr.top && e.clientY<pr.bottom);
    if(inside) return;   // still inside it - this is the swap back
  }
  /* Ordered, not document order: with columns on the two disagree, and a drag would then
     reorder against a sequence the user cannot see. */
  const cards=listCardsOrdered();
  const fromEl=list&&list.querySelector('.card[data-id="'+cssEsc(cardDrag.key)+'"]');
  const fromI=fromEl?cards.indexOf(fromEl):-1;
  const toI=cards.indexOf(t);
  if(fromI<0||toI<0||fromI===toI) return;
  const fromR=fromEl.getBoundingClientRect(), toR=t.getBoundingClientRect();
  const ddx=(toR.left+toR.width/2)-(fromR.left+fromR.width/2);
  const ddy=(toR.top+toR.height/2)-(fromR.top+fromR.height/2);
  const horiz=Math.abs(ddx)>Math.abs(ddy);
  cardSwapLock=Date.now();
  cardDrag.partner=t.dataset.id;
  cardDrag.partnerAxis=horiz?"x":"y";
  cardDrag.partnerDir=horiz?(ddx>0?1:-1):(ddy>0?1:-1);
  cardDrag.partnerPos=horiz?e.clientX:e.clientY;
  animateCardReorder(cardDrag.key, t.dataset.id);
},{passive:true});
function endCardDrag(){
  if(txtDrag){
    const didMove=!!txtDrag.moved;
    txtDrag=null;
    document.documentElement.classList.remove("txtdrag");
    if(list) list.querySelectorAll(".txt").forEach(p=>p.classList.remove("dragging"));
    if(didMove) txtSuppressClick=true;
    return;
  }
  if(!cardDrag) return;
  const didMove=!!cardDrag.moved;
  cardDrag=null;
  document.documentElement.classList.remove("carddrag");
  if(list) list.querySelectorAll(".card").forEach(p=>p.classList.remove("dragging"));
  if(didMove){
    cardSuppressClick=true;
    savePack();
  }
}
addEventListener("pointerup",endCardDrag);
addEventListener("pointercancel",endCardDrag);

list.addEventListener("click",e=>{
  /* The fold control, before the drag guards below it. A separator takes no part in drag or
     focus logic, so a click here cannot be a suppressed drag and must not be swallowed by the
     checks that exist for cards. */
  const fold=e.target.closest(".sep-fold[data-fold-key]");
  if(fold){
    e.preventDefault(); e.stopPropagation();
    animateFoldToggle(fold.getAttribute("data-fold-key"));
    return;
  }
  if(cardSuppressClick){ cardSuppressClick=false; return; }
  if(txtSuppressClick){ txtSuppressClick=false; return; }
  const actBtn=e.target.closest(".cacts button");
  if(actBtn){
    e.preventDefault(); e.stopPropagation();
    const card=actBtn.closest(".card");
    const id=card && card.dataset.id;
    const act=actBtn.dataset.act;
    // Both of these move the card, so both animate the move - see flipCardsAround().
    if(act==="fav"){ if(id) flipCardsAround(()=>toggleFavourite(id)); }
    else if(act==="edit") openCardEditor(id);
    else if(act==="note") toggleNotePane(actBtn, id);
    else if(act==="hide") flipCardsAround(()=>hideCard(id));
    else if(act==="delete") deleteCustomCard(id);
    return;
  }
  const code=e.target.closest(".swap code");
  if(code){
    const si=+code.dataset.si;
    // Active chip (or its ✕): drop just that intent, keep any others.
    // Ctrl/Cmd+click on an inactive chip adds it; plain click on inactive replaces the set.
    if(e.ctrlKey||e.metaKey || intentIdxs.indexOf(si)>-1) pickIntent(si,true);
    else pickIntent(si,false);
    toast(intentIdxs.length ? t("{INTENT} set -")+" "+intentFor() : t("{INTENT} cleared"));
    return;
  }
  /* `txtEl`, not `t`: t() is the translation function, and a const of that name puts the
     whole scope - including the toast above - in its temporal dead zone. */
  const txtEl=e.target.closest(".txt[data-v]");
  if(!txtEl) return;
  const card=txtEl.closest(".card[data-id]");
  if(!card) return;
  const mid=card.dataset.id;
  const m=findCard(mid)||shown[+card.dataset.i];
  if(!m) return;
  /* WHAT IS SHOWN IS WHAT IS COPIED. Asking the toggle here copied the other language's
     text off a pinned card, which reads correctly on screen and lands wrong in the chat. */
  const cl=cardLang(m);
  const ps=parts(m,cl), vi=+txtEl.dataset.v;
  if(!ps.length||vi<0||vi>=ps.length) return;
  setEntrySel(mid, vi); // focus this block only - never rebuild the list under the cursor
  // Show the selection ring straight away even though the pointer is still on the block;
  // it answers hover again once the pointer leaves and comes back.
  txtEl.classList.add("just-picked");
  txtEl.addEventListener("pointerleave", ()=>txtEl.classList.remove("just-picked"), {once:true});
  bumpUseCount(mid);
  copy(fill(ps[vi],m), copiedToastMsg(m, cl, vi, ps.length));
});

/* ONE SENTENCE, BUILT ONCE, for both copy routes: glued from fragments it stays English in
   a Polish interface however well toast() translates, and two gluings disagree about the
   same card. The language code is not translated: EN and PL name the card's language, not
   the interface's. */
function copiedToastMsg(m, lang, vi, total){
  const code=String(lang||"").toUpperCase();
  const where=m&&m.seq ? code+" "+t("step")+" "+(vi+1)+"/"+total
                       : code+(total>1 ? " "+(vi+1)+"/"+total : "");
  return t("Copied {WHAT} from {TITLE}").replace("{WHAT}",where).replace("{TITLE}",cardTitle(m));
}
/* Local copy counter: one integer per card id, stored in the pack, never exported and
   never sent anywhere (nothing in this file could send it). Answers two questions
   nothing else can: which phrases earn their place - a count on the Manage rows - and
   how often the tool is actually used, the honest denominator for any time-saved
   estimate. Reset clears it with everything else. */
function bumpUseCount(id){
  if(!id) return;
  if(!pack.useCounts||typeof pack.useCounts!=="object") pack.useCounts={};
  pack.useCounts[id]=(pack.useCounts[id]|0)+1;
  savePack();
}
function copy(text,msg){
  // Copying consumes the semi-selection - every copy, click or keyboard, funnels through here.
  railMarkUsed=true; semiKind=null;
  railDecorate(false);
  const done=()=>toast(msg);
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(text).then(done,()=>fallback(text,done));
  } else fallback(text,done);
}
function fallback(text,cb){
  const ta=document.createElement("textarea");
  ta.value=text; ta.style.cssText="position:fixed;opacity:0";
  document.body.appendChild(ta); ta.select();
  try{document.execCommand("copy");cb();}catch(e){toast("The browser blocked the copy, so select the text yourself.");}
  ta.remove();
}
let tt;
function ask(m){ return confirm(t(m)); }
const TOAST_MS=1700;
var toastSerial=0;
function toast(m){
  toastSerial++;
  /* Every message the app speaks passes through here, so this is the one place a toast needs
     translating - not fifty call sites. */
  m=t(m);
  const el=$("#toast"); el.textContent=m; markCut(el); el.classList.add("show");
  clearTimeout(tt); tt=setTimeout(()=>el.classList.remove("show"),TOAST_MS);
}

// Quick facts: editable personal text (pack.facts); default is built-in FACTS.
// View mode: URL-like tokens are one-click copy (display without https://, copy with).
function getFactsText(){
  if(pack && typeof pack.facts==="string") return pack.facts;
  return FACTS;
}
function factsIsCustom(){
  return !!(pack && typeof pack.facts==="string" && pack.facts!==FACTS);
}
function renderFacts(){
  const el=$("#facts");
  if(!el) return;
  const s=getFactsText();
  // Host + optional path (no scheme). Avoid short false positives like "e.g."
  const re=/(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:[a-z]{2,})(?:\/[^\s]*)?/gi;
  let html="", last=0, m;
  while((m=re.exec(s))){
    const raw=m[0];
    // Skip "fee-like" leftovers if any; require a real TLD segment of letters only
    if(!/\.[a-z]{2,}(?:\/|$)/i.test(raw)) continue;
    /* Filenames are not links: "etiuda-catalog.js" parses as host + TLD, and the sample
       facts mention filenames - they rendered as copyable https:// phantoms. A known file
       extension with no path after it is a file somebody typed, not a site. */
    if(!/\//.test(raw) &&
       /\.(?:m?jsx?|json|html?|css|txt|md|pdf|docx?|xlsx?|pptx?|csv|xml|ya?ml|ini|log|zip|rar|7z|exe|msi|bat|cmd|ps1|png|jpe?g|gif|svg|webp|ico|mp[34]|wav)$/i.test(raw)) continue;
    const full=/^https?:\/\//i.test(raw) ? raw : "https://"+raw;
    html+=esc(s.slice(last,m.index));
    html+='<span class="fact-link" role="button" tabindex="0" data-copy="'+esc(full)+'" title="'+esc(t("Click to copy full URL"))+'">'+esc(raw)+'</span>';
    last=m.index+raw.length;
  }
  html+=esc(s.slice(last));
  el.innerHTML=html;
}
function setFactsEditMode(on){
  const panel=$("#factsPanel");
  const editBtn=$("#factsEditBtn"), saveBtn=$("#factsSaveBtn"), cancelBtn=$("#factsCancelBtn"), resetBtn=$("#factsResetBtn");
  if(panel) panel.classList.toggle("editing", !!on);
  if(editBtn) editBtn.hidden=!!on;
  if(saveBtn) saveBtn.hidden=!on;
  if(cancelBtn) cancelBtn.hidden=!on;
  if(resetBtn) resetBtn.hidden=!on;
}
/* AN INTERRUPTED EDIT IS KEPT, NOT DROPPED. Cancel and Esc SAY discard, and the draft
   goes; closing the panel does not mean it, so the text is kept in memory and the panel
   reopens straight into edit. Nothing touches storage - Save remains the only commit. */
let factsDraft=null;
function exitFactsEdit(save,discard){
  const panel=$("#factsPanel");
  if(!panel||!panel.classList.contains("editing")) return;
  const ta=$("#factsEdit");
  if(save){
    const next=ta?ta.value:getFactsText();
    if(next===FACTS) pack.facts=null;
    else pack.facts=next;
    savePack();
    renderFacts();
    factsDraft=null;
    toast(factsIsCustom()?"Quick facts saved":"Quick facts match built-in default");
  }else if(discard){
    factsDraft=null;
  }else{
    // Interrupted: remember it only if it actually differs from what is stored.
    const cur=ta?ta.value:null;
    factsDraft=(cur!=null && cur!==getFactsText()) ? cur : null;
  }
  setFactsEditMode(false);
}
function enterFactsEdit(){
  const ta=$("#factsEdit");
  if(!ta) return;
  // A draft only exists when a previous edit was interrupted rather than cancelled.
  ta.value=(factsDraft!=null) ? factsDraft : getFactsText();
  setFactsEditMode(true);
  try{ ta.focus(); ta.setSelectionRange(0,0); }catch(_){ try{ ta.focus(); }catch(__){} }
}
function wireFactsCopy(){
  const el=$("#facts");
  if(!el || el._factsCopyWired) return;
  el._factsCopyWired=1;
  el.addEventListener("click",e=>{
    const a=e.target.closest(".fact-link");
    if(!a) return;
    e.preventDefault();
    copy(a.getAttribute("data-copy")||a.textContent, "Link copied");
  });
  el.addEventListener("keydown",e=>{
    if(e.key!=="Enter" && e.key!==" ") return;
    const a=e.target.closest(".fact-link");
    if(!a) return;
    e.preventDefault();
    copy(a.getAttribute("data-copy")||a.textContent, "Link copied");
  });
}
function wireFactsEditor(){
  const editBtn=$("#factsEditBtn"), saveBtn=$("#factsSaveBtn"), cancelBtn=$("#factsCancelBtn"), resetBtn=$("#factsResetBtn");
  const ta=$("#factsEdit");
  if(editBtn) editBtn.onclick=e=>{ e.stopPropagation(); enterFactsEdit(); };
  if(saveBtn) saveBtn.onclick=e=>{ e.stopPropagation(); exitFactsEdit(true); };
  // Cancel MEANS discard - the draft goes with it. See exitFactsEdit.
  if(cancelBtn) cancelBtn.onclick=e=>{ e.stopPropagation(); exitFactsEdit(false,true); };
  if(resetBtn) resetBtn.onclick=e=>{
    e.stopPropagation();
    if(!ask("Restore built-in quick facts? Your edited text will be discarded.")) return;
    pack.facts=null;
    savePack();
    factsDraft=null;                 // the confirm said discarded; mean it
    if(ta) ta.value=FACTS;
    renderFacts();
    setFactsEditMode(false);
    toast("Built-in quick facts restored");
  };
  if(ta){
    ta.addEventListener("keydown",e=>{
      /* A plain printable key is text here, never a shortcut: this is the one prose field
         outside a dialog, and the language key is a slash. */
      if(!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length===1){ e.stopPropagation(); return; }
      // Ctrl/Cmd+S saves; Esc cancels edit (does not clear intents)
      if((e.ctrlKey||e.metaKey) && (e.key==="s"||e.key==="S")){
        e.preventDefault(); e.stopPropagation();
        exitFactsEdit(true);
        return;
      }
      if(e.key==="Escape"){
        e.preventDefault(); e.stopPropagation();
        exitFactsEdit(false,true);   // Esc is the keyboard's Cancel: an explicit discard
      }
    });
  }
}
renderFacts();
wireFactsCopy();
wireFactsEditor();

// ---- running a shortcut: the dispatcher reaches the whole app, so it stays here -------
function runShortcut(id){
  if(id==="langToggle"){ setLang(lang==="en"?"pl":"en"); return true; }
  if(id==="tabNext"){ stepTab(1); return true; }
  if(id==="tabNew"){ addTab(); return true; }
  if(id==="maintenance"){ closeLooseOverlays(); openMaintenance(); return true; }
  if(id==="quickFacts"){ toggleFactsPanel(); return true; }
  if(id==="newCard"){ const b=$("#addCardFab"); if(!b||b.hidden) return false; closeLooseOverlays(); b.click(); return true; }
  if(id==="selectSearch"){
    if(!intentEl) return false;
    closeLooseOverlays();
    try{ intentEl.focus({preventScroll:true}); }catch(_){ try{ intentEl.focus(); }catch(__){} }
    try{ intentEl.select(); }catch(_){}
    return true;
  }
  if(id==="focusPax"){ pax.focus(); pax.select(); return true; }
  if(id==="focusRole"){ const d=$("#roleDrum"); if(d) d.focus(); return true; }
  if(id==="toggleRail"){ toggleRail(); return true; }
  if(id==="togglePills"){ togglePills(); return true; }
  /* Unhandled when no editor is open, or when the arrow is at its end, so the key falls
     through instead of being silently swallowed. */
  if(id==="edPrevEntry"||id==="edNextEntry"){
    const b=$(id==="edPrevEntry"?"#edPrev":"#edNext");
    if(!b||b.disabled) return false;
    b.click();
    return true;
  }
  if(id==="edPrevLang") return edStepLang(-1);
  if(id==="edNextLang") return edStepLang(1);
  if(id==="clearIntent"){
    clearIntents();
    return true;
  }
  if(id==="allCats"){
    const railBefore=captureRail(), relBefore=railRelKeys();
    cats=[]; drawPills(); render();
    railEchoRedraw(railBefore, relBefore);
    toast("All categories");
    return true;
  }
  if(id==="navUp"||id==="navDown"){
    kbdNav(true);
    if(semiKind==="intent" && !railMarkUsed && (railSel>=0 || railMarkIdx>=0)){
      const n=railOrder.length;
      if(n){
        const step=id==="navDown"?1:-1;
        const from=railSel>=0?railSel:railOrder.indexOf(railMarkIdx);
        const to=railStep(from<0 ? (step>0?-1:n) : from, step);
        if(to>=0){
          railSel=to;
          railMarkIdx=railOrder[railSel];
          railDecorate(true);
          return true;
        }
      }
    }
    semiKind="card";
    navEntry(id==="navDown"?1:-1);
    return true;
  }
  if(id==="navPillLeft"||id==="navPillRight"){
    navPill(id==="navPillRight"?1:-1);
    return true;
  }
  if(id==="markTop"||id==="markBottom"){
    kbdNav(true);
    return markEnd(id==="markBottom"?1:-1);
  }
  if(id==="navPillFirst"||id==="navPillLast"){
    return navPillEnd(id==="navPillLast"?1:-1);
  }
  if(id==="copy"||id==="copyOther"){
    kbdNav(true);
    // The mark's surface decides what Enter means: an intent mark is picked, a card copied.
    if(id==="copy" && semiKind==="intent" && railMarkIdx>=0 && !railMarkUsed){
      const idx = railSel>=0 && railSel<railOrder.length ? railOrder[railSel] : railMarkIdx;
      // Enter's alter ego: inside a run it ADDS and closes, exactly as the key does.
      const run = pickRun && intentIdxs.length>0;
      pickIntent(idx, run);
      if(run){ railMarkUsed=true; semiKind=null; pickRun=false; }
      return true;
    }
    if(!entrySel){
      // Nothing focused yet - focus first block then copy (Enter after open)
      if(!navEntry(1)) return false;
    }
    return copyEntrySel(id==="copyOther");
  }
  if(id==="escape"){
    if(notePaneOpen()){ closeNotePane(); return true; }
    if(factsPanelOpen()){ closeFactsPanel(); return true; }
    if($("#settingsMenu")&&!$("#settingsMenu").hidden){ closeSettingsMenu(); return true; }
    escapeLadderStep();
    return true;
  }
  return false;
}
/* Reaching for the search box dismisses the loose overlays: quick facts and the settings
   menu hang off the header directly over the box and the first cards, and neither is a mode
   you leave deliberately - a keystroke aimed somewhere else says you are done with them.
   DIALOGS ARE NOT INCLUDED, deliberately: they are modal, they hold unsaved work, and the
   global keydown returns before ever reaching here while one is open. */
function closeLooseOverlays(){
  if($("#settingsMenu") && !$("#settingsMenu").hidden){
    closeSettingsMenu();
  }
  if(factsPanelOpen()){
    closeFactsPanel();
  }
  closeNotePane();
}
function typingInField(){
  const a=document.activeElement;
  if(!a) return false;
  if(a.isContentEditable) return true;
  const tag=(a.tagName||"").toLowerCase();
  return tag==="input"||tag==="textarea"||tag==="select";
}
/* THE SETTINGS SCREEN. One test decides what belongs: would you set it once and
   forget it? Anything touched weekly is a Menu item or a header control; Data stays in
   the LIBRARY, About in About, diagnostics behind F2 - a second door repeats Clear local
   memory's old mistake. BUILT FROM THE SHARED VOCABULARY: accHtml/wireAcc for sections,
   .seg for switches, modalResize, wireShortcutsList - the next screen takes these rather
   than growing a fourth pair. THE LOCKS LIVE HERE, hide/show does not: a lock is a
   standing preference; "hide it now" is situational and stays in the Menu. Same split
   for the category bar. */
function settingsBodyHtml(){
  /* The row hint says what the setting IS; the option tip says what THIS choice DOES, which
     is the half a two-word button cannot carry. Optional - a seg without tips renders as before. */
  const seg=(name,opts,cur)=>'<div class="seg set-seg" data-seg="'+name+'" data-n="'+opts.length+'">'+
    opts.map(o=>'<button type="button" data-val="'+esc(o.v)+'"'+
      (o.tip?' title="'+esc(o.tip)+'"':'')+(o.v===cur?' class="on"':'')+'>'+esc(o.t)+'</button>').join("")+
    '</div>';
  const row=(label,hint,control)=>'<div class="set-row"><div class="set-label">'+esc(label)+
    (hint?'<small>'+esc(hint)+'</small>':'')+'</div><div class="set-ctl">'+control+'</div></div>';
  const onoff=(name,on,tipOn,tipOff)=>seg(name,[{v:"off",t:t("Off"),tip:tipOff},
                                              {v:"on",t:t("On"),tip:tipOn}],on?"on":"off");
  const themeCur=themeChoice() || "system";
  const langSel='<select id="setUiLang" aria-label="'+esc(t("Interface language"))+'"'+
    ' title="'+esc(t("Changes every label in Etiuda, never the cards themselves"))+'">'+
    UI_LANGS.map(l=>'<option value="'+esc(l.code)+'"'+(l.code===uiLang()?" selected":"")+'>'+esc(l.label)+'</option>').join("")+
    '</select>';
  const curLang=(UI_LANGS.filter(l=>l.code===uiLang())[0]||UI_LANGS[0]).label;
  return accHtml("language", t("Localisation"),
      row(t("Interface language"),
          t("The language of the buttons and menus, not of the macros: those follow EN|PL in the header"),
          langSel),
      curLang,
      t("What language Etiuda's own buttons, menus and messages are written in"))+
    accHtml("appearance", t("Appearance"),
      row(t("Theme"), t("System follows your computer's own setting."),
          seg("theme",[{v:"light",t:t("Light"),
                        tip:t("Always the light palette, whatever the computer asks for")},
                       {v:"dark",t:t("Dark"),
                        tip:t("Always the dark palette, whatever the computer asks for")},
                       {v:"system",t:t("System"),
                        tip:t("Follows your computer's light or dark setting, and changes with it")}], themeCur))+
      row(t("Blur effects"),
          t("Blurred panel backgrounds and the blur behind dialogs. Turn off if text reads less clearly, or the machine struggles."),
          onoff("glass", !document.body.classList.contains("glass-off"),
                t("Panels and the dialog backdrop stay blurred"),
                t("Panels go flat and opaque, and a dialog only darkens what is behind it")))+
      /* Reads as what it GIVES, and the stored key still reads as what it takes away - it is
         inverted here alone, so an existing choice survives the rename. */
      row(t("Animations"),
          t("Transitions, slides, and the cards re-sorting themselves. Switches itself off when your system asks for reduced motion."),
          onoff("motion", lsGet("pbMotionOff")!=="1",
                t("Everything moves as it was drawn to"),
                t("Nothing moves; every change lands at once"))),
      null,
      t("Theme, blur effects and animations"))+
    accHtml("layout", t("Layout"),
      row(t("Columns"),
          t("How many columns of cards to show. Auto fits as many as the window has room for."),
          seg("cols",[{v:"1",t:t("1"),tip:t("Always a single column")},
                      {v:"2",t:t("2"),tip:t("Always two columns, however wide the window is")},
                      {v:"auto",t:t("Auto"),tip:t("As many as fit without making a column too narrow to read")}],
              colMode()))+
      row(t("Narrowest column"),
          t("How narrow a column may get before Auto drops one. Wider means fewer, roomier columns."),
          '<div class="set-slider"><input type="range" id="setColFloor" min="'+COL_FLOOR_MIN+
            '" max="'+COL_FLOOR_MAX+'" step="'+COL_FLOOR_STEP+'" value="'+colFloor()+
            '" aria-label="'+esc(t("Narrowest column"))+'">'+
            '<output id="setColFloorOut">'+Math.round(colFloor()*remPx())+'px</output></div>')+
      row(t("Lock the intent panel"),
          t("Keep it docked even when the window is narrow, instead of letting it hide itself."),
          onoff("raillock", railLocked(),
                t("The panel stays docked at any window width"),
                t("The panel hides itself when the window gets narrow")))+
      row(t("Lock the category bar"),
          t("Keep every category row visible, instead of collapsing to two lines."),
          onoff("pillslock", pillsLocked(),
                t("Every category row stays visible"),
                t("The bar keeps two rows, and Ctrl peeks at the others")))+
      row(t("Notes on hover"),
          t("Open a card's internal note when the pointer rests on the card."),
          onoff("notehover", document.body.classList.contains("note-hover"),
                t("The note opens by itself, and the card shows no i"),
                t("The i on the card opens the note"))),
      null,
      t("What stays docked, and what may hide itself when space is short"))+
    accHtml("keys", t("Keyboard shortcuts"),
      '<div class="sc-list" id="scListInline"></div>',
      /* ",null" is the next ARGUMENT - "+null" concatenates and prints the characters "null"
         on the page. The neighbouring call has the same null in the same position. */
      null,
      t("Rebind any key combo. The keys the app itself needs are listed as fixed."));
}
function paintSettings(){
  const box=modalCard.querySelector("#setBody");
  if(!box) return;
  box.innerHTML=settingsBodyHtml();
  wireAcc(box, id=>{ if(id==="keys") paintKeysInline(); });
  paintKeysInline();
  /* Live while dragging: the whole point is watching the columns re-form, and a value that
     only lands on release makes the slider feel like a form field rather than a control. */
  syncColFloorRow();
  const cf=box.querySelector("#setColFloor"), cfo=box.querySelector("#setColFloorOut");
  if(cf){
    cf.oninput=()=>{
      const v=+cf.value;
      if(cfo) cfo.textContent=Math.round(v*remPx())+"px";
      nsSet("Floor",String(v));
      /* The floor is a term of the dock threshold: a wider column means the panel has to give
         way sooner. Rebuilt here so the panel answers the new setting without a reload. */
      rebuildRailMQ(); syncRailLayout();
      render();
    };
  }
  box.querySelectorAll(".set-seg").forEach(sbox=>{
    sbox.querySelectorAll("button").forEach(b=>{
      b.onclick=()=>{
        const seg=sbox.getAttribute("data-seg"), v=b.getAttribute("data-val"), on=(v==="on");
        /* THE CLASS MOVES, THE ELEMENT STAYS: a rebuilt seg arrives with .on already on the
           right button - the thumb is born at its destination with nothing to travel
           from. The header's switch animates for exactly the opposite reason - one
           element, only the class moves. Do that here, and the effect follows. */
        if(b.classList.contains("on")) return;
        sbox.querySelectorAll("button").forEach(x=>x.classList.remove("on"));
        b.classList.add("on");
        if(seg==="theme"){
          /* "System" is not a new mode - it is the state pbTheme is in before anyone touches
             the header toggle, which until now could never be returned to without wiping
             storage. Deleting the key restores it. */
          if(v==="system") lsDel("pbTheme"); else lsSet("pbTheme",v);
          applyTheme();
          if(v==="system") toast(t("Theme follows the system"));
        }
        else if(seg==="cols"){
          nsSet("Cols",v);
          rebuildRailMQ(); syncRailLayout();   // single column asks the panel for less room
          render();
          syncColFloorRow();
          toast(v==="auto"?t("Columns fit the window"):(v==="1"?t("Single column"):t("Two columns")));
        }
        else if(seg==="glass"){
          document.body.classList.toggle("glass-off",!on);
          if(!on) lsSet("pbGlassOff","1"); else lsDel("pbGlassOff");
          toast(on?t("Blur effects on"):t("Blur effects off"));
        }
        else if(seg==="motion"){
          if(on) lsDel("pbMotionOff"); else lsSet("pbMotionOff","1");
          toast(on?t("Animations reduced"):t("Animations on"));
        }
        /* The locks call the app's own togglers rather than writing their keys, so the Menu
           label, the panel and the pin button all follow exactly as they do from the Menu -
           one act, one code path, two doors that cannot drift. */
        else if(seg==="notehover"){
          document.body.classList.toggle("note-hover",on);
          if(on) lsDel("pbNoteHover"); else lsSet("pbNoteHover","0");
          closeNotePane();
          toast(on?t("Notes open on hover"):t("Notes open from the i"));
        }
        else if(seg==="raillock"){ if(railLocked()!==on) toggleRailLock(); }
        else if(seg==="pillslock"){ if(pillsLocked()!==on) togglePillsLock(); }
        /* No repaint: the class above is the whole visual change, and rebuilding would undo
           the slide it just started. Nothing else in the dialog depends on these values. */
      };
    });
  });
  /* The language list is a select, not a switch: it holds two entries today and is meant to
     hold seven, and a sliding thumb stops being a control the moment it cannot show its
     options at once. Repaints in place - every label in the dialog changes. */
  const ls=$("#setUiLang");
  if(ls) ls.onchange=()=>{
    setUiLang(ls.value);
    const name=(UI_LANGS.filter(l=>l.code===uiLang())[0]||{}).label||ls.value;
    /* The WHOLE card, not just the body: the heading, the sub-line and the Close button are
       outside #setBody, so repainting the body alone left an English "Settings" over Polish
       sections. openSettings() with no argument keeps whichever section is open. */
    modalResize(()=>openSettings());
    toast(t("Interface language")+": "+name);
  };
}
function paintKeysInline(){
  const box=modalCard.querySelector("#scListInline");
  if(box) wireShortcutsList(box, paintKeysInline);
}

/* The floor decides how many columns AUTO fits, and nothing at all when the count is fixed.
   Greyed and disabled rather than hidden: a control that vanishes makes the screen jump and
   leaves no clue the setting exists, while a dimmed one says "this belongs to Auto". */
function syncColFloorRow(){
  const sl=document.querySelector("#setColFloor");
  if(!sl) return;
  const auto=colMode()==="auto";
  sl.disabled=!auto;
  const row=sl.closest(".set-row");
  if(row) row.classList.toggle("set-row-off",!auto);
}

/* EVERY SETTING, and nothing that is not one: preferences are a handful of cheap
   keys; a card edit, a favourite, a hidden entry or a hand-sorted order is WORK, and
   none of it is touched here - the distinction that lets this be one button. The confirm
   says so out loud, because a reset beside Close is what a person clicks meaning to
   dismiss. Shortcut keys are cleared inline: a reset of its own would ask a second question,
   and two confirms for one decision teaches clicking through both. */
function resetAllSettings(){
  if(!ask("Put every setting back to its default? Your cards, edits, favourites and order are not touched.")) return;
  ["pbTheme","pbGlassOff","pbMotionOff","pbUiLang","pbPillsLock","pbRailLock","pbPills","pbRail",
   "pbShortcuts","pbHdrPills","pbNoteHover"].forEach(k=>{ try{ lsDel(k); }catch(e){} });
  document.body.classList.add("note-hover");
  try{ nsDel("Cols"); nsDel("Floor"); }catch(e){}
  document.body.classList.remove("glass-off");
  try{ loadShortcuts(); }catch(e){}
  try{ applyTheme(); }catch(e){}
  try{ applyUiLang(); }catch(e){}
  try{ syncRailLayout(); }catch(e){}
  try{ drawPills(); }catch(e){}
  try{ render(); }catch(e){}
  paintSettings();
  toast("Settings reset");
}
function openSettings(section){
  scCaptureId=null;
  /* Opened AT a section when something else sends you here - the maintenance panel's way back,
     for instance. Exclusive, so naming one closes whatever stood open. */
  if(section){ accOpen.clear(); accOpen.add(section); }
  openDialog({
    title: t("Settings"),
    body: '<div id="setBody"></div>',
    /* Reset sits FIRST and stays secondary, with Close primary on the right: the
       destructive action should never be the one the eye lands on, nor the one a
       reflex click finds when the intent was to dismiss. */
    actions: '<button type="button" class="btn" id="setReset" title="'+
      esc(t("Put every setting on this screen back to what it ships with. Cards and edits are not affected."))+
      '">'+esc(t("Reset defaults"))+'</button>'+
      '<button type="button" class="btn primary" id="setClose">'+esc(t("Close"))+'</button>',
    wire: ()=>{
      paintSettings();
      const c=$("#setClose");
      if(c) c.onclick=()=>dismissModal();
      const rs=$("#setReset");
      if(rs) rs.onclick=resetAllSettings;
    }
  });
}
/* The list, its capture handling and its reset are ONE component, rendered into whatever
   container asks - the Settings accordion today, any future surface tomorrow - so a
   rebinding made anywhere behaves identically. */
function shortcutsListHtml(){
  const bind=(d,slot)=>{
    const fixed=!!d.fixed, listening=scCaptureId===d.id&&scCaptureSlot===slot;
    const c=slot===2?scChord2(d.id):scChord(d.id), empty=!c||(!c.code&&!c.key);
    const shown=slot===2?formatChord(c):formatActionChord(d.id);
    // a caption longer than the slot shrinks its type rather than the slot growing
    return '<button type="button" class="sc-bind'+(fixed?" fixed":"")+(listening?" listening":"")+(slot===2?" sc-alt":"")+(empty?" sc-empty":"")+(shown.length>7?" sc-long":"")+
      '" data-bind="'+esc(d.id)+'" data-slot="'+slot+'"'+
      (fixed?" disabled":' title="'+esc(t(slot===2?"An alternative: click, then press the key combo":"Click, then press the new key combo"))+'"')+'>'+
      (listening?esc(t("Press keys…")):(empty?esc(t("none")):esc(shown)))+'</button>';
  };
  const row=d=>{
    return '<div class="sc-row" data-sc="'+esc(d.id)+'">'+
      '<div class="sc-label">'+esc(t(d.label))+
        (d.hint?'<small>'+esc(t(d.hint))+'</small>':'')+
      '</div><div class="sc-binds">'+bind(d,1)+(d.fixed?"":bind(d,2))+'</div></div>';
  };
  /* Rebindable rows first, fixed rows grouped under their own separator - the split is the
     explanation a per-row tooltip could not give: tooltips on disabled buttons never reach
     keyboard or touch users, and the WHY is one fact shared by all of these, so it is said
     once, visibly, where the group starts. Render-level split only; SC_DEFS keeps its order. */
  return SC_DEFS.filter(d=>!d.fixed).map(row).join("")+
    '<div class="sc-sep">'+esc(t("Fixed keys"))+
      '<small>'+esc(t("The grammar the rest stands on: Esc is how key capture itself cancels, arrows and Enter keep their native meanings, and a held Ctrl is a hold, not a chord."))+'</small>'+
    '</div>'+
    SC_DEFS.filter(d=>d.fixed).map(row).join("");
}
/* The capture state is the list's rather than the chord model's: what it is listening
   for, and for which of the two slots. */
var scCaptureId=null, scCaptureSlot=1;
/** Paints the list into `box` and wires capture. `repaint` is how the component asks its host
 *  to draw again - the host owns the surrounding markup, so it decides what redrawing means. */
/* Whichever surface last painted the list owns the repaint - a rebinding must repaint in
   place, never throw the user into a different screen on a keystroke. */
let scRepaint=null;
function wireShortcutsList(box, repaint){
  if(!box) return;
  scRepaint=repaint;
  box.innerHTML=shortcutsListHtml();
  box.querySelectorAll("[data-bind]").forEach(btn=>{
    if(btn.disabled) return;
    btn.onclick=()=>{
      scCaptureId=btn.getAttribute("data-bind");
      scCaptureSlot=+btn.getAttribute("data-slot")||1;
      repaint();
      toast(scCaptureSlot===2?"Press the alternative (Esc to cancel, Backspace to clear)":"Press the new shortcut (Esc to cancel, Backspace for the default)");
    };
  });
}
/* Both doors (Library and Maintenance) open onto this pair. FORGETTING WHAT YOU MADE AND
   PUTTING THE CATALOG DOWN ARE TWO ACTS: one button doing both charged the common one the
   price of the rare one. The prefix filter is load-bearing - file:// pages can share one
   storage area, and another local page's keys must be left alone. The reload is what
   actually empties the engine: the catalog is applied once at boot. */
const CATALOG_KEEP=[E_CATALOG_STORE,E_CATALOG_KEY,nsKey("Sample")];
/* WHOSE KEYS ARE THESE. Preferences are bare and deliberately machine-wide - a theme is
   shared, a catalog is not - so Reset forgets them wherever they were set. Everything else
   is namespaced, and the trap is that the plain engine's own namespace IS the bare "pb":
   its prefix therefore also matches every OTHER copy's "pb<hash>~" keys, and a Reset run in
   one build was deleting a neighbouring copy's catalog, pack, stars and order. */
const E_PREF_KEYS=["pbTheme","pbGlassOff","pbMotionOff","pbUiLang","pbLang","pbAgent","pbPax","pbNoteHover",
  "pbWho","pbPills","pbPillsLock","pbRail","pbRailLock","pbRailW","pbCollapsed","pbFactsW",
  "pbFactsH","pbShortcuts","pbHdrPills"];
function eKeyIsPref(k){ return E_PREF_KEYS.indexOf(k)>-1 || k.indexOf("pbTour")===0; }
function eKeyIsMine(k){
  return k.indexOf(E_NS)===0 && (E_NS!=="pb" || !/^pb[0-9a-z]+~/.test(k));
}
function clearLocalMemory(){
  /* One t() per line, and every space kept OUTSIDE the key: a key with a trailing space
     can never be matched against the source, because what the scanner reads it trims. */
  if(!ask(t("Clear Etiuda's local memory in this browser?")+"\n\n"
    +t("Removes every personal card, intent, edit, hide, category rename and quick-facts edit,")+" "
    +t("and forgets your agent name, theme and layout choices.")+" "
    +t("Catalog files on disk are not touched.")+"\n\n"
    +t("The loaded catalog stays, and Etiuda restarts with it."))) return;
  /* Latch first, delete second - see eWiping: the reload does not stop timers, and a
     pending debounced save would write its key straight back. Cancelling the known timer as
     well is not redundant: the latch stops the write, this stops the work. */
  mgReopenAfterReload();            // before the latch, which ssSet obeys
  eWipeLatch();
  clearTimeout(tabSaveTimer);
  /* The watched-file HANDLE lives in IndexedDB, so a key sweep cannot reach it: deleting
     only WatchName left a live watch the interface no longer showed any control for, still
     free to announce an update about a file nobody could stop watching. */
  let watchGone=null;
  try{ watchGone=eWatchClear(); }catch(e){}
  try{ lsKeys().filter(k=>(eKeyIsMine(k)||eKeyIsPref(k)) && CATALOG_KEEP.indexOf(k)<0)
         .forEach(k=>lsDel(k)); }catch(e){}
  ssDel(TAB_KEY);
  /* The reload waits for that delete, which is asynchronous and would otherwise be abandoned
     mid-transaction - but never for long: a wipe the user asked for must not hang on it. */
  if(watchGone && typeof watchGone.then==="function"){
    let done=false;
    const go=()=>{ if(!done){ done=true; location.reload(); } };
    watchGone.then(go,go);
    setTimeout(go,600);
  } else location.reload();
}
/* The other half. The personal layers go WITH the catalog because they only mean anything
   against its cards - the same reasoning activateCatalog applies when one catalog replaces
   another. Preferences stay: a name, a theme and a layout are yours, not the catalog's. */
function ejectCatalog(){
  if(!ask(t("Eject the catalog from this browser?")+"\n\n"
    +t("Your own cards, edits, stars and card order are KEPT, and come back where they were when you load this catalog again.")+" "
    +t("Loading a different catalog clears them, because they were written against this one.")+"\n\n"
    +t("Your agent name, theme and layout choices stay, and catalog files on disk are not touched.")+"\n\n"
    +t("Etiuda restarts empty. If a catalog file sits beside it you will be asked whether to load it."))) return;
  /* The ONE personal field that has to go: an older import route stored the catalog itself
     here, and BASE_M is built from it, so leaving it would hand the cards straight back. */
  pack.baseCards=null;
  savePack();                       // written BEFORE the latch, or the change never lands
  mgReopenAfterReload();            // and so is this, for the same reason
  eWipeLatch();
  clearTimeout(tabSaveTimer);
  CATALOG_KEEP.forEach(k=>lsDel(k));
  nsDel("CatalogNo");
  ssDel(TAB_KEY);
  location.reload();
}

/* A rescue that must also survive the NEXT boot: applied here, before anything glass is
   drawn, and readable in the maintenance panel. */
try{ if(lsGet("pbGlassOff")==="1") document.body.classList.add("glass-off"); }catch(e){}
try{ if(lsGet("pbNoteHover")!=="0") document.body.classList.add("note-hover"); }catch(e){}

// ---- modal: edit / manage / export -------------------------------------------
const modalEl=$("#modal"), modalCard=$("#modalCard");
function modalOpen(){ return !modalEl.hidden; }
/** Every dialog's heading with the close control built in - one helper, so the bar
 *  cannot drift between four dialogs and a fifth gets it for nothing. The X LEAVES THIS
 *  SCREEN - for a dialog opened from another, that means back to it (see dismissModal):
 *  "close the stack" put the card editor's X on the main screen while Cancel went back
 *  to Manage - two controls meaning "never mind" landing in two different places. */
/* ---- SHARED MODAL BEHAVIOUR ---------------------------------------------------------------
   One implementation per behaviour, reused by every dialog. The height animator is the case
   in point: it operates on modalCard and nothing else, so it lives here rather than among
   any one dialog's code wearing its prefix. */
/* Which sections are open, by id. A Set like the Library's mgOpen, for the same reason: the
   state belongs to the user's session, not to the markup that gets rebuilt under it.
   Settings holds at most one - mgAccordion shuts the rest. */
/* Interface language leads: it is the reason most people open Settings the first time,
   and the only section whose effect is visible the moment it changes. */
const accOpen=new Set(["language"]);
/* Native disclosure, like Manage's sections and the editors' folds: the keyboard handling and
   the expanded state come from the element. `bodyHtml` is TRUSTED markup, the rest escaped. */
function accHtml(id,title,bodyHtml,note,tip){
  return '<details class="acc" data-acc="'+esc(id)+'"'+(accOpen.has(id)?" open":"")+'>'+
    '<summary'+(tip?' title="'+esc(tip)+'"':'')+'>'+
      '<span class="acc-tw" aria-hidden="true">'+ICON_CHEVRON_R+'</span>'+
      '<span class="acc-title">'+esc(title)+'</span>'+
      (note?'<span class="acc-note">'+esc(note)+'</span>':'')+
    '</summary>'+
    '<div class="acc-body">'+bodyHtml+'</div>'+
  '</details>';
}
/* ---- ONE COLLAPSIBLE SECTION FOR FORM DIALOGS ----------------------------------------------
   Anything that opens a form dialog calls this rather than writing the markup again: the
   marker, the summary and the aria wiring arrive together or not at all.
   `body` and `sum` are TRUSTED markup - callers esc() what they put in a summary. `label`
   is plain ENGLISH and must stay that way: translateTree remembers each node's English
   source and t() has no reverse lookup, so a label baked through t() at build time is
   stuck in whatever language the dialog was opened in. (Said WITHOUT the literal call:
   i18n-scan reads translator calls straight out of the file and cannot tell a comment from
   code, so a quoted example in prose becomes a phantom missing translation.) */
function mfSec(o){
  return '<details class="mf mf-fold'+(o.cls?" "+o.cls:"")+'" data-fold="'+esc(o.key)+'"'+
      (o.open?" open":"")+'><summary>'+
      '<span class="acc-tw" aria-hidden="true">'+ICON_CHEVRON_R+'</span>'+
      '<span class="mf-lab">'+esc(o.label)+'</span>'+
      (o.sum==null ? "" :
        '<span class="mf-sum"'+(o.sumId?' id="'+esc(o.sumId)+'"':"")+
        (o.sumSkip?' data-i18n-skip':"")+'>'+o.sum+'</span>')+
    '</summary>'+o.body+'</details>';
}
/* ---- A CATEGORY IN THE LIBRARY'S TREE OPENS. Plain rows rather than a disclosure - see the
   note by .mg-cat - and no accordion either: a tree is reorganised rather than read, so
   several categories standing open at once is the point. */
function catToggle(el, key){
  if(!el) return;
  const open=!mgOpen.has(key);
  if(open) mgOpen.add(key); else mgOpen.delete(key);
  modalResize(()=>{
    el.classList.toggle("is-open", open);
    const body=el.querySelector(".mg-cat-body");
    if(body) body.hidden=!open;
    const btn=el.querySelector("[aria-expanded]");
    if(btn){
      btn.setAttribute("aria-expanded", open?"true":"false");
      btn.title=t(open?"Collapse":"Expand");
    }
  });
}
/** ONE PASS, as Manage does it. A two-phase version - the outgoing section folding away
 *  before the incoming one opened - was tried and judged more tiring to watch than the single
 *  movement; the twisty rotating on both rows carries the change instead. Do not re-propose
 *  the bounce. */
/* ONE WIRING FOR EVERY FOLD FAMILY - Settings' .acc, the editors' .mf-fold, Manage's sections.
   The summary records the height on the way in, because `toggle` fires after the flip: pointerdown,
   and keydown because Enter and Space on a summary never fire pointerdown. Observing, not
   intercepting - the disclosure, its keys and its aria stay native. `before` runs on every toggle,
   sibling-shut included, so an open-set stays true; `after` only for the fold the user turned. A
   programmatic open, with no press before it, animates nothing, which is right. */
function wireFolds(scope, sel, accSel, before, after){
  scope.querySelectorAll(sel).forEach(d=>{
    const sum=d.querySelector("summary");
    if(sum){
      sum.addEventListener("pointerdown",mgPinCard);
      sum.addEventListener("keydown",e=>{
        if(e.key==="Enter"||e.key===" "||e.key==="Spacebar") mgPinCard();
      });
    }
    d.addEventListener("toggle",()=>{
      if(before) before(d);
      if(d._accordion) return;                 // shut by its sibling opening; that one animates
      mgAccordion(d,accSel,scope);
      animateModalHeightFrom(mgPendingH); mgPendingH=null;
      if(after) after(d);
    });
  });
}
function wireAcc(root, onToggle){
  wireFolds(root,"details.acc","details.acc",
    d=>{ const k=d.getAttribute("data-acc"); if(d.open) accOpen.add(k); else accOpen.delete(k); },
    onToggle ? d=>onToggle(d.getAttribute("data-acc"), d.open) : null);
}
/* ---- ONE OPENER FOR EVERY DIALOG. The WINDOW was always shared; what each dialog
   repeated was the four lines that OPEN it, and anything added to the opening sequence
   had to be added four times - the fourth gets forgotten. Focus handling, a modifier
   class, an aria hook all land in one place. Not a base class, deliberately: dialogs
   differ in exactly what they contain and wire, and a class would grow to fit Manage,
   leaving the others carrying hooks they never use. Behaviour is shared by calling one
   function; structure by passing arguments. */
/* WHAT THIS DIALOG IS EDITING, as a function rather than a string: Save keeps the screen
   open, so the heading has to be able to re-read a name the user has just changed. */
let modalNameFn=null;
function setDialogName(name){
  const h=modalCard&&modalCard.querySelector("h2");
  if(!h) return;
  const old=h.querySelector(".modal-name");
  if(old) old.remove();
  if(!name) return;
  const sp=document.createElement("span");
  sp.className="modal-name"; sp.textContent=name;
  h.insertBefore(sp, h.querySelector(".modal-nav")||h.querySelector("#modalX")||null);
}
function refreshDialogName(){ if(modalNameFn) setDialogName(modalNameFn()||""); }
/* RESET IS ALWAYS ON THE ROW, and answers a question that changes while the dialog is open:
   Save can give it something to discard. Rendering it only when there was something meant it
   appeared out of nowhere, and not until the next open, since Save does not rebuild the
   actions. The tooltip changes with the state, because "why is this off" has two answers. */
let modalResetFn=null, modalResetOn="", modalResetOff="";
function refreshDialogReset(){
  const b=modalCard&&modalCard.querySelector(".mf-reset");
  if(!b||!modalResetFn) return;
  const live=!!modalResetFn();
  b.disabled=!live;
  b.title=t(live?modalResetOn:modalResetOff);
}
/** Both halves of a heading that has to keep up with its own screen. */
function refreshDialogChrome(){ refreshDialogName(); refreshDialogReset(); }
function openDialog(cfg){
  if(!modalEl||!modalCard) return;
  /* WHERE THE KEYBOARD CAME FROM. Closing wipes the card, so whatever had focus goes with it
     and the next Tab starts from the top of the document. A dialog opened over another keeps
     the first opener: the screen underneath is about to be rebuilt. */
  if(modalEl.hidden){
    let from=document.activeElement;
    /* A ROW IN A MENU IS NOT SOMEWHERE TO GO BACK TO: the menu shuts as the dialog opens, and
       focus on a hidden control is focus on nothing. The door it stood behind is still there. */
    const wrap=(from && from.closest) ? from.closest(".menu-wrap") : null;
    if(wrap) from=wrap.querySelector(":scope > button")||from;
    modalOpener=(from && from!==document.body && from!==document.documentElement) ? from : null;
  }
  setModalBack(cfg.back||null);
  modalNameFn=(typeof cfg.name==="function")?cfg.name:(cfg.name?()=>cfg.name:null);
  modalResetFn=(typeof cfg.resettable==="function")?cfg.resettable:null;
  modalResetOn=cfg.resetOn||"";
  modalResetOff=cfg.resetOff||"";
  /* THE CARD IS RESET, not added to. Modifier classes used to be removed by closeModal() - but
     a dialog opened OVER another never passes through it, so About's type scale could follow
     you into Maintenance. Rebuilding the class list from the base makes that impossible. */
  modalCard.className="modal-card"+(cfg.cls?" "+cfg.cls:"");
  modalCard.innerHTML=
    modalHead(t(cfg.title), cfg.lead, cfg.nav, modalNameFn?(modalNameFn()||""):"")+
    (cfg.sub?'<p class="modal-sub">'+cfg.sub+'</p>':"")+
    (cfg.body||"")+
    (cfg.actions?'<div class="modal-actions">'+cfg.actions+'</div>':"");
  modalEl.hidden=false;
  if(typeof cfg.wire==="function") cfg.wire();
  refreshDialogReset();     // the button is rendered enabled; this decides what it really is
  /* The dialog is swept AFTER its wiring, so anything the wire step injected is translated too.
     Every dialog goes through this function, which is what makes one line enough. */
  translateTree(modalCard);
  dressDialogInputs(modalCard);
  markCutText(modalCard);
}
/* EVERY LINE THAT CAN BE CUT, and two rules holding the pass together. READ ALL, THEN WRITE
   ALL, as writePillCounts does, or each element costs its own layout. And NEVER REACH INSIDE
   A CARD THE PAGE HAS NOT LAID OUT: asking a title below the fold for its width forces the
   layout content-visibility:auto exists to skip, and at 261 cards a whole-list pass took a
   render from 17ms to 70ms. A card's own box is laid out either way, so its rect is cheap;
   the rest are measured when the scroll brings them in. */
const CUT_SEL=".ctitle,.ccat,.modal-name,.mg-card-lab,.mg-count,.acc-note,.mf-sum,"
  +"#toast,#intentPh,#roleDrum span,.tab-label>span,.fills input,"
  +".mf input:not([type]),.mf input[type=text],.rail-t,.rail-tag";
const CUT_MARGIN=400;
/* SUB-PIXEL, BECAUSE THE ELLIPSIS IS: scrollWidth and clientWidth are whole numbers, so a
   line overflowing by less than a pixel rounds to no overflow at all and the dots get drawn
   where nothing here can see them. A Range gives the text its true width, the rect less
   padding gives the box. Blink lays out in 64ths, so 0.01 is under anything real. */
const cutRange=document.createRange();
const CUT_EPS=.01;
/* A CARET'S WIDTH OF SLACK, for the scroll geometry alone: a field scrolled hard against its
   end still reports a pixel left to go, which is the room the caret is holding, and a cut
   narrower than the caret is nothing to fade. */
const CUT_SLACK=1.5;
/* A PLACEHOLDER IS IN NO MEASUREMENT THE ELEMENT OFFERS. The Range cannot reach into an input
   at all, and scrollWidth ignores a placeholder entirely, so the canvas measures the same
   string in the same font: sub-pixel, and without a layout. One context for every field, so
   the spacing is written each time - "normal" is not a length it accepts, and the last real
   value would stand in its place. */
const cutInk=document.createElement("canvas").getContext("2d");
/* WHICH SIDES ARE CUT. `hid` is how much text is hidden to the LEFT, and a field knows its own:
   it has scrolled exactly that far, which is what puts the fade behind the caret instead of
   over it. Anything else hides its overflow wherever its alignment sends it. */
function cutSides(el){
  const cs=getComputedStyle(el);
  const box=el.getBoundingClientRect().width
    -parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight)
    -parseFloat(cs.borderLeftWidth)-parseFloat(cs.borderRightWidth);
  if(box<=0) return {l:false,r:false};   // display:none, or nothing laid out yet
  let over, hid;
  if(el.tagName==="INPUT"){
    /* The FIELD'S OWN numbers while it holds a value: scrollLeft rides exactly this overflow,
       and a second measurement of the same string lands a pixel off - enough to claim a fade
       on the side the text has not reached. A placeholder never scrolls, so it needs neither. */
    if(el.value){
      const max=el.scrollWidth-el.clientWidth;
      return {l:el.scrollLeft>CUT_SLACK, r:el.scrollLeft<max-CUT_SLACK};
    }
    cutInk.font=cs.fontStyle+" "+cs.fontWeight+" "+cs.fontSize+" "+cs.fontFamily;
    cutInk.letterSpacing=cs.letterSpacing==="normal"?"0px":cs.letterSpacing;
    return {l:false, r:cutInk.measureText(el.placeholder||"").width-box>CUT_EPS};
  }else{
    cutRange.selectNodeContents(el);
    over=cutRange.getBoundingClientRect().width-box;
    const a=cs.textAlign;
    hid=a==="center" ? over/2 : (a==="right"||a==="end") ? over : 0;
  }
  return {l:hid>CUT_EPS, r:over-hid>CUT_EPS};
}
function applyCut(el,c){
  el.classList.toggle("is-cut", c.l||c.r);
  el.classList.toggle("cut-l", c.l);
  el.classList.toggle("cut-r", c.r);
  /* A line the reader cannot finish can be read on hover, and only then: a tooltip repeating a
     line that is whole on screen is noise. Empty rather than absent, or it would fly its
     ancestor's - see the note at the card's note. */
  if(el.classList.contains("cut-peek")) el.title=(c.l||c.r) ? el.textContent.trim() : "";
}
function markCut(el){
  if(el) applyCut(el,cutSides(el));
}
/* Wraps each of a dialog's text inputs once - see .mf .field-wrap. Before anything focuses a
   field: moving a focused element drops its focus. */
function dressDialogInputs(root){
  (root||document).querySelectorAll(".mf input:not([type]),.mf input[type=text]").forEach(i=>{
    if(i.parentElement && i.parentElement.classList.contains("field-wrap")) return;
    const w=document.createElement("span"); w.className="field-wrap";
    i.parentNode.insertBefore(w,i); w.appendChild(i);
  });
}
function markCutText(root){
  const all=(root||document).querySelectorAll(CUT_SEL);
  if(!all.length) return;
  const top=-CUT_MARGIN, bottom=innerHeight+CUT_MARGIN, live=[];
  for(let i=0;i<all.length;i++){
    const el=all[i], card=el.closest?el.closest(".card"):null;
    if(card){
      const r=card.getBoundingClientRect();
      if(r.bottom<top || r.top>bottom) continue;
    }
    live.push(el);
  }
  const cut=[];
  for(let i=0;i<live.length;i++) cut.push(cutSides(live[i]));
  for(let i=0;i<live.length;i++) applyCut(live[i],cut[i]);
}
/* One pass per frame however many callers ask, and a frame late on purpose: a card rebuilt in
   this task reports its estimated size until content-visibility resolves it. */
let cutScanT=0;
function scheduleCutScan(){
  if(cutScanT) return;
  cutScanT=1;
  const run=()=>{ cutScanT=0; markCutText(); };
  afterPaint(run);
}
/* A FIELD RE-MEASURES ON ITS OWN EVENTS. No rebuild follows a keystroke, and an input scrolls
   its own text, so which side is cut changes with nothing else on the page moving. focus
   catches the clear button, which ends by focusing the field it emptied. */
["#pax","#intent","#agent"].forEach(sel=>{
  const el=$(sel); if(!el) return;
  ["input","scroll","focus","blur"].forEach(t=>
    el.addEventListener(t,()=>markCut(el),{passive:true}));
});
// Dialog inputs come and go with their dialogs, so their events are taken at the document.
["input","scroll","focus","blur"].forEach(t=>
  document.addEventListener(t,e=>{ const el=e.target;
    if(el && el.matches && el.matches(".mf input:not([type]),.mf input[type=text]")) markCut(el);
  },{passive:true,capture:true}));
/* A click handler runs AFTER the browser has dropped :active, so anything slow inside it
   holds the PRESSED pixels on screen until it returns - the state is already gone from the
   DOM and no frame can say so. Measured on Save at 375ms with the CPU throttled fourfold,
   which is what "the button sticks" actually is. Two frames: one to schedule, one that runs
   after the released look has been painted. */
function afterPaint(fn){
  if(typeof requestAnimationFrame!=="function"){ fn(); return; }
  requestAnimationFrame(()=>requestAnimationFrame(fn));
}
function modalResize(mutate){
  const card=modalCard;
  if(!card){ mutate(); return; }
  const before=card.getBoundingClientRect().height;
  mutate();
  animateModalHeightFrom(before);
}
/* PREV / NEXT IN AN EDITOR. One reviewer walking a catalog should not have to close and
   reopen for every entry. The list walked is the one ON SCREEN, so a filtered or searched
   view steps through what it shows rather than through the whole catalog. */
function edNavHtml(){
  /* The shortcut is named in the tooltip: the arrows are how it is found, and an icon
     cannot say Alt. */
  const lp=t("Previous")+" \u00b7 "+formatActionChord("edPrevEntry"),
        ln=tc("editor","Next")+" \u00b7 "+formatActionChord("edNextEntry");
  return '<span class="modal-nav">'
    +'<button type="button" class="modal-x nav-up" id="edPrev" title="'+esc(lp)
    +'" aria-label="'+esc(t("Previous"))+'">'+ICON_CHEVRON_R+'</button>'
    +'<button type="button" class="modal-x nav-dn" id="edNext" title="'+esc(ln)
    +'" aria-label="'+esc(tc("editor","Next"))+'">'+ICON_CHEVRON_R+'</button></span>';
}
/* Read off the CONTROLS rather than from each editor's own fields: three editors with
   different shapes all answer "has anything been typed" the same way, and a field added
   later is covered without being registered anywhere. */
let edBaseline="";
function edFormState(){
  if(!modalCard) return "";
  const out=[];
  modalCard.querySelectorAll("input,textarea,select").forEach(el=>{
    out.push((el.type==="checkbox"||el.type==="radio")?(el.checked?"1":"0"):String(el.value||""));
  });
  // segmented controls are buttons, not fields - the chosen one carries .on and its value
  modalCard.querySelectorAll(".on[data-v]").forEach(el=>out.push(String(el.dataset.v||"")));
  return out.join("\u0001");
}
function edMarkClean(){ edBaseline=edFormState(); }
function edDirty(){ return edFormState()!==edBaseline; }
/* `list` is what is on screen, `cur` the entry being edited, `go` opens a neighbour. The
   ends disable rather than wrap, so a dead arrow is how you know you are at one. */
/* NAVIGATION SAYS THE SUBJECT CHANGED, and the subject is the name. Only the name moves: the
   dialog is identical between entries, so moving the body would claim everything changed.
   .modal-body is mounted by an observer and is absent in this tick - measuring the height
   synchronously travels towards a card whose body has not arrived and is yanked back when it
   does. A microtask lands after the observer, still before paint. */
function edNavTo(run){
  const card=modalCard;
  const before=card?card.getBoundingClientRect().height:null;
  run();
  Promise.resolve().then(()=>{
    if(!mgReduceMotion()){
      const n=modalCard&&modalCard.querySelector("h2 .modal-name");
      if(n){ n.removeAttribute("data-ed"); void n.offsetWidth; n.setAttribute("data-ed","flip"); }
    }
    if(before!=null) animateModalHeightFrom(before);
  });
}
function edWireNav(list,cur,go){
  edMarkClean();
  const i=list.indexOf(cur);
  const step=d=>{
    const j=i+d;
    if(i<0||j<0||j>=list.length) return;
    if(edDirty() && !ask(t("This card has unsaved changes. Leave it without saving?"))) return;
    edNavTo(()=>go(list[j]));
  };
  const p=$("#edPrev"), n=$("#edNext");
  if(p){ p.disabled=(i<=0); p.onclick=()=>step(-1); }
  if(n){ n.disabled=(i<0||i>=list.length-1); n.onclick=()=>step(1); }
}
/* A LINE WITH ENDS, exactly as the entry arrows above: a dead key is how you know you are at
   one, and one axis wrapping while the other stopped would make the pair mean two things.
   Clicks the tab rather than moving the class itself, so the sweep and its direction come
   from the one handler that owns them. */
function edStepLang(dir){
  const strip=modalCard&&modalCard.querySelector(".lang-tabs");
  if(!strip) return false;
  const tabs=Array.prototype.slice.call(strip.querySelectorAll("button[data-l]"));
  let i=tabs.findIndex(x=>x.classList.contains("on"));
  if(i<0) i=0;
  const j=i+dir;
  if(j<0||j>=tabs.length) return false;
  tabs[j].click();
  return true;
}
function modalHead(title, lead, nav, name){
  /* `lead` goes INSIDE the h2, before the title, so the heading's own flex row places it - the
     row is already display:flex with gap:10px and the close button on margin-left:auto, so a mark
     dropped in front needs no layout of its own. */
  /* The title is WRAPPED, not bare: loose text in a flex row is an anonymous item that
     shrinks like any other, and text-wrap:balance then splits it into two tidy halves the
     moment it does. A span can be told to refuse. */
  return '<h2 id="modalTitle">'+(lead||"")+'<span class="modal-t">'+esc(title)+'</span>'+
    (name?'<span class="modal-name">'+esc(name)+'</span>':'')+(nav||"")+
    '<button type="button" class="modal-x" id="modalX" title="Close this screen" '+
    'aria-label="Close this screen">'+ICON_X+'</button></h2>';
}
/* Delegated once, so it survives every innerHTML rebuild without being rewired. */
modalCard.addEventListener("click",e=>{
  if(e.target.closest && e.target.closest("#modalX")) dismissModal();
});
/* Where "leave this screen" goes for the dialog on screen NOW; null means nothing
   behind it, so leaving closes the modal. Set by whichever dialog knows it was opened
   from another; cleared by every dialog as it writes itself into the card, so it cannot
   outlive its screen. Kept here rather than in each opener's closure because three
   controls consume it - the X, Escape and the backdrop - and delegated handlers cannot
   see a closure. */
let modalBack=null;
function setModalBack(fn){ modalBack=(typeof fn==="function")?fn:null; }
/** X, Escape and the backdrop all mean "never mind", so all three land where Cancel lands.
 *  Consumed on use: the parent redraws and sets its own, and a hook that survived its screen
 *  would be worse than none. */
function dismissModal(){
  const back=modalBack;
  modalBack=null;
  if(back) back(); else closeModal();
}
/* A flex column with a scrolling middle, so the scrollbar sits beside the content it
   moves - not running past the pinned heading and actions where nothing scrolls. Wrapped
   by an observer rather than in each dialog's markup: four dialogs build their own HTML
   and Manage rebuilds on every action; the observer catches all of them, and any fifth. */
function mountModalBody(){
  if(!modalCard.firstElementChild) return;
  if(modalCard.querySelector(":scope > .modal-body")) return;
  const kids=Array.prototype.slice.call(modalCard.children);
  const head=kids.filter(k=>k.tagName==="H2")[0];
  const acts=kids.filter(k=>k.classList.contains("modal-actions"))[0];
  const middle=kids.filter(k=>k!==head && k!==acts);
  if(!middle.length) return;
  const body=document.createElement("div");
  body.className="modal-body";
  modalCard.insertBefore(body, acts||null);
  middle.forEach(k=>body.appendChild(k));
}
new MutationObserver(mountModalBody).observe(modalCard,{childList:true});
var modalOpener=null;
function closeModal(){
  scCaptureId=null;
  modalBack=null;
  modalEl.hidden=true;
  modalCard.classList.remove("about-modal","mt-modal");
  modalCard.innerHTML="";
  const back=modalOpener;
  modalOpener=null;
  // Gone if its own screen was rebuilt while the dialog stood over it.
  if(back && document.contains(back) && typeof back.focus==="function"){
    try{ back.focus({preventScroll:true}); }catch(e){ try{ back.focus(); }catch(e2){} }
  }
}
/* THE CARD IS THE WHOLE KEYBOARD while it is up: the markup says aria-modal, and the scrim
   takes the mouse, but Tab walked off the card and into the header behind it - reachable and
   pressable, with nothing on screen to say where the caret had gone. Returns the far end when
   focus is leaving, and null when it is not, so an ordinary Tab inside the card is untouched. */
const MODAL_TABBABLE="a[href],button:not([disabled]),input:not([disabled]),"
  +"select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex='-1'])";
function modalTabTarget(back){
  if(!modalCard) return null;
  const els=Array.prototype.filter.call(modalCard.querySelectorAll(MODAL_TABBABLE),
    el=>el.offsetWidth>0 || el.offsetHeight>0 || el===document.activeElement);
  if(!els.length) return null;
  const at=document.activeElement;
  if(!modalCard.contains(at)) return back?els[els.length-1]:els[0];
  if(back && at===els[0]) return els[els.length-1];
  if(!back && at===els[els.length-1]) return els[0];
  return null;
}
/* THE SCRIM DOES NOT CLOSE. Every dialog here carries an X, and the editors carry Cancel and
   Save: a click that lands beside the card is a miss, not an instruction, and answering it by
   throwing away an edit costs more than the one it saves. Escape still closes - that is the
   keyboard's X, not a stray. */

// Capture rebinds while the shortcuts modal is open (capture phase)
addEventListener("keydown",e=>{
  if(!scCaptureId||!modalOpen()) return;
  if(e.key==="Escape"){
    e.preventDefault(); e.stopPropagation();
    scCaptureId=null;
    if(scRepaint) scRepaint();
    return;
  }
  const id=scCaptureId, slot=scCaptureSlot;
  if(e.key==="Backspace"||e.key==="Delete"){
    e.preventDefault(); e.stopPropagation();
    const d=SC_DEFS.find(x=>x.id===id);
    if(slot===2) scMap2[id]=emptyChord(); else scMap[id]=cloneChord(d.def);
    scCaptureId=null; saveShortcuts(); if(scRepaint) scRepaint();
    toast(slot===2?"Alternative cleared":"Back to the default");
    return;
  }
  const chord=chordFromEvent(e);
  if(!chord) return;
  e.preventDefault(); e.stopPropagation();
  /* THE FIXED KEYS ARE NOT ON OFFER: the list says they keep their own meanings, and the sweep
     below cannot take a chord back off one - it skips them. Refusing the capture is what keeps
     that promise; the row stays open for another key. */
  const fixedOwner=SC_DEFS.find(d=>d.fixed && (chordsEqual(d.def,chord)||chordsEqual(d.def2,chord)));
  if(fixedOwner){
    toast(t("{KEY} is fixed and keeps its own meaning").replace("{KEY}",formatChord(chord)));
    return;
  }
  // The chord leaves whichever slot held it, on any action: the taken slot returns to its default.
  SC_DEFS.forEach(d=>{
    if(d.fixed) return;
    if(!(d.id===id&&slot===1) && chordsEqual(scMap[d.id],chord)) scMap[d.id]=cloneChord(d.def);
    if(!(d.id===id&&slot===2) && chordsEqual(scMap2[d.id],chord)) scMap2[d.id]=emptyChord();
  });
  if(slot===2) scMap2[id]=chord; else scMap[id]=chord;
  scCaptureId=null;
  saveShortcuts();
  if(scRepaint) scRepaint();
  toast(t("Saved {KEY}").replace("{KEY}",formatChord(chord)));
}, true);

loadShortcuts();

addEventListener("keydown",e=>{
  if(scCaptureId) return;

  if(tourActive()){
    if(e.key==="Escape" || eventMatchesAction(e,"escape")){
      e.preventDefault();
      endTour(false);
    }

    // ←/→ move the selection across the tour buttons; Enter presses the selected one.
    if(e.key==="ArrowRight"){
      e.preventDefault();
      moveTourFocus(1);
    } else if(e.key==="ArrowLeft"){
      e.preventDefault();
      moveTourFocus(-1);
    } else if(e.key==="Enter"){
      e.preventDefault();
      activateTourFocus();
    }
    return;
  }

  if(modalOpen()){
    // Escape is the keyboard's X, and goes where the X goes - back one screen, then out.
    if(e.key==="Escape"){ e.preventDefault(); dismissModal(); }
    /* A rescue must be reachable from anywhere - including from inside a dialog, where a
       misbehaving Etiuda is often being poked. It swaps into the modal the way the
       Library's sub-dialogs do, and closing RETURNS to the swapped-out screen: the
       Library and the shortcuts list are recognised by their own furniture and reopened;
       anything else closes outright. */
    else if(eventMatchesAction(e,"maintenance")){
      e.preventDefault();
      const back=$("#mgClose")?(()=>openManage())
        :$("#setBody")?(()=>openSettings("keys"))
        :null;
      openMaintenance(back);
    }
    /* AND THE EDITORS KEEP THEIR OWN ARROWS. Everything else stays suppressed - a dialog
       holds unsaved work and the main screen's keys have no meaning over it - but walking
       to the next card is what these two are FOR, and they exist nowhere else. */
    else if(eventMatchesAction(e,"edPrevEntry")){ e.preventDefault(); runShortcut("edPrevEntry"); }
    else if(eventMatchesAction(e,"edNextEntry")){ e.preventDefault(); runShortcut("edNextEntry"); }
    /* Swallowed whether or not it lands, unlike on the main screen: at the last tab the key
       has nothing to do, and letting it through would be the browser leaving the editor. */
    else if(eventMatchesAction(e,"edPrevLang")){ e.preventDefault(); runShortcut("edPrevLang"); }
    else if(eventMatchesAction(e,"edNextLang")){ e.preventDefault(); runShortcut("edNextLang"); }
    else if(e.key==="Tab"){
      const to=modalTabTarget(e.shiftKey);
      if(to){ e.preventDefault(); try{ to.focus({preventScroll:true}); }catch(x){ to.focus(); } }
    }
    return;
  }


  if(eventMatchesAction(e,"escape")){
    if($("#settingsMenu")&&!$("#settingsMenu").hidden){
      e.preventDefault(); closeSettingsMenu(); return;
    }
    if(factsPanelOpen()){ e.preventDefault(); closeFactsPanel(); return; }
  }

  const inField=typingInField();
  for(let i=0;i<SC_DEFS.length;i++){
    const d=SC_DEFS[i];
    if(d.fixed) continue;
    if(!eventMatchesAction(e,d.id)) continue;
    if(inField&&!d.inField) continue;
    // runShortcut may return false to decline (an editor arrow with no editor open)
    if(runShortcut(d.id)!==false){
      e.preventDefault();
      return;
    }
  }

  /* After the rebindable pass, so a binding placed on one of these still wins. Page up and
     down run from inside the search box too - a caret in a single-line field has no use for
     them - while Home and End keep their meaning there, behind the guard below. */
  const plain=!e.ctrlKey && !e.altKey && !e.metaKey;
  if(plain && (e.key==="PageDown"||e.key==="PageUp") && pageKeyScroll(e.key)){ e.preventDefault(); return; }
  if(inField) return;
  if(plain && (e.key==="Home"||e.key==="End") && pageKeyScroll(e.key)){ e.preventDefault(); return; }
  if(eventMatchesAction(e,"navUp")){ e.preventDefault(); runShortcut("navUp"); return; }
  if(eventMatchesAction(e,"navDown")){ e.preventDefault(); runShortcut("navDown"); return; }
  if(eventMatchesAction(e,"markTop")){ e.preventDefault(); runShortcut("markTop"); return; }
  if(eventMatchesAction(e,"markBottom")){ e.preventDefault(); runShortcut("markBottom"); return; }
  if(eventMatchesAction(e,"navPillFirst")){ e.preventDefault(); runShortcut("navPillFirst"); return; }
  if(eventMatchesAction(e,"navPillLast")){ e.preventDefault(); runShortcut("navPillLast"); return; }
  if(eventMatchesAction(e,"navPillLeft")){ e.preventDefault(); runShortcut("navPillLeft"); return; }
  if(eventMatchesAction(e,"navPillRight")){ e.preventDefault(); runShortcut("navPillRight"); return; }
  if(eventMatchesAction(e,"copyOther")){ e.preventDefault(); runShortcut("copyOther"); return; }
  if(eventMatchesAction(e,"copy")){ e.preventDefault(); runShortcut("copy"); return; }
  if(eventMatchesAction(e,"escape")){ e.preventDefault(); runShortcut("escape"); return; }

  // Nothing focused (e.g. clicked empty space): printable keys go straight into INTENT.
  // First character is inserted manually because focus alone would swallow this keydown.
  if(e.ctrlKey||e.altKey||e.metaKey) return;
  if(e.key.length!==1) return;
  if(!intentEl) return;
  e.preventDefault();
  closeLooseOverlays();
  try{ intentEl.focus({preventScroll:true}); }catch(_){ try{ intentEl.focus(); }catch(__){} }
  /* No special case for any bound printable key here: the dispatch loop above owns every
     binding and returns before this point. A hardcoded key here survives rebinds and makes the
     shortcuts screen a liar - a key that reaches this line is an ordinary character and
     gets typed. */
  const v=String(intentEl.value||"");
  const start=intentEl.selectionStart==null?v.length:intentEl.selectionStart;
  const end=intentEl.selectionEnd==null?v.length:intentEl.selectionEnd;
  intentEl.value=v.slice(0,start)+e.key+v.slice(end);
  const caret=start+e.key.length;
  try{ intentEl.setSelectionRange(caret,caret); }catch(_){}
  intentEl.dispatchEvent(new Event("input",{bubbles:true}));
});

/** The card editor's variant. Two differences from the intent picker, both because a card is
 *  not an intent: it lists EVERY category including supporting ones, since a card genuinely
 *  lives in one of those, and exactly one chip is on at a time. */
function cardCatPickHtml(selected){
  const sel=String(selected||"");
  const chips=Object.keys(CATS)
    .sort((a,b)=>catSortIdx(a)-catSortIdx(b))
    .map(k=>{
      const on=k===sel;
      return '<button type="button" class="cat-chip'+(on?" on":"")+'" data-k="'+esc(k)+'" aria-pressed="'+(on?"true":"false")+'">'+
        catIconSvg(k,"cat-ic")+esc(CATS[k])+'</button>';
    }).join("");
  /* "+" last, after the categories, exactly where the pill strip puts its own. Without it the
     only answer to "this card belongs somewhere that does not exist yet" was to abandon the
     dialog, make the category in the strip, and come back - and the edit in progress was the
     price. No data-k, so the radio logic below skips it; it is a control, not a category. */
  return chips+
    '<button type="button" class="cat-chip cat-chip-add" title="'+esc(t("Add a category"))+
    '" aria-label="'+esc(t("Add a category"))+'">'+ICON_PLUS+'</button>';
}
function readCardCatPick(){
  const on=$("#meCatPick") && $("#meCatPick").querySelector(".cat-chip.on[data-k]");
  return on ? on.getAttribute("data-k") : "";
}
/** `single` makes the picker a radio group: clicking a chip moves the selection instead of
 *  adding to it, and clicking the one already on is a no-op - there is no valid "no category"
 *  state for a card, so nothing may deselect the last chip. `box._onPick` fires only on a
 *  real change. */
function bindCatPick(box,single){
  if(!box||box._catPickBound) return;
  box._catPickBound=1;
  box.addEventListener("click",e=>{
    const addBtn=e.target.closest(".cat-chip-add");
    if(addBtn&&box.contains(addBtn)){ e.preventDefault(); startChipCatAdd(box,addBtn); return; }
    const chip=e.target.closest(".cat-chip[data-k]");
    if(!chip||!box.contains(chip)) return;
    e.preventDefault();
    if(single){
      if(chip.classList.contains("on")) return;
      box.querySelectorAll(".cat-chip.on[data-k]").forEach(c=>{
        c.classList.remove("on"); c.setAttribute("aria-pressed","false");
      });
      chip.classList.add("on"); chip.setAttribute("aria-pressed","true");
      if(typeof box._onPick==="function") box._onPick(chip.getAttribute("data-k"));
      return;
    }
    const on=chip.classList.toggle("on");
    chip.setAttribute("aria-pressed", on?"true":"false");
  });
}

/** Inline category creation - the pill strip's "+" contract: type, Enter accepts, Esc
 *  or an empty blur cancels. ACCEPTING SELECTS the new category - you are filing the
 *  card in front of you: the picker is redrawn from cardCatPickHtml(key), sorted with
 *  the selection moved in one step (safe: the click handler is delegated on the box).
 *  Single-select by construction; a multi-select picker would need its selection
 *  preserved across the redraw. STOPPROPAGATION IS NOT OPTIONAL: this input lives inside
 *  a modal - Escape would close the editor and lose the edit, and Enter can reach the
 *  dialog's default action. Both keys are handled and stopped. */
function startChipCatAdd(box,addEl){
  if(!box||box.querySelector(".cat-chip-new")) return;
  const wrap=document.createElement("span");
  wrap.className="cat-chip cat-chip-new";
  const inp=document.createElement("input");
  inp.type="text";
  inp.spellcheck=false;
  inp.autocomplete="off";
  inp.placeholder=t("New category");
  wrap.appendChild(inp);
  box.insertBefore(wrap,addEl);
  addEl.hidden=true;
  const finish=ok=>{
    const name=inp&&inp.value?inp.value.trim():"";
    wrap.remove();
    addEl.hidden=false;
    if(!ok||!name) return;
    const key=ensureCustomCat(name);
    box.innerHTML=cardCatPickHtml(key);
    if(typeof box._onPick==="function") box._onPick(key);
    rebuildCards();          // the strip behind the dialog has to gain the pill too
    toast("Category added");
  };
  inp.focus();
  /* Re-queried rather than using the captured addEl: accepting redraws the picker, so the node
     the closure holds is detached by then. On the cancel path nothing redraws and the query
     finds the same button back again. */
  const refocus=()=>{ const a=box.querySelector(".cat-chip-add"); if(a) a.focus(); };
  inp.onkeydown=e=>{
    if(e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); finish(true); refocus(); }
    else if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); finish(false); refocus(); }
  };
  inp.onblur=()=>{ setTimeout(()=>{ if(document.activeElement!==inp) finish(!!(inp.value&&inp.value.trim())); },0); };
}

function intentPickHtml(selectedIds, preferCat){
  const sel=new Set((selectedIds||[]).map(String));
  // Prefer intents whose primary category matches the card category, then the rest.
  const order=intentOrder.filter(i=>!isIntentHiddenIdx(i)).slice().sort((a,b)=>{
    const am=preferCat&&intentHasPrimaryCat(a,preferCat)?0:1;
    const bm=preferCat&&intentHasPrimaryCat(b,preferCat)?0:1;
    if(am!==bm) return am-bm;
    return intentOrder.indexOf(a)-intentOrder.indexOf(b);
  });
  const rows=order.map(i=>{
    const id=intentIdAt(i);
    const on=sel.has(id);
    const label=intentNavName(i)||("(empty)");
    const cats=primaryCatLabel(i);
    return '<label class="'+(on?"on":"")+'">'+
      '<input type="checkbox" value="'+esc(id)+'"'+(on?" checked":"")+'>'+
      '<span class="ip-body"><span class="ip-t">'+esc(label)+'</span>'+
      '<span class="ip-cat">'+esc(cats)+'</span></span></label>';
  }).join("");
  return rows || '<div class="manage-empty">'+esc(t("No intents available."))+'</div>';
}
function readMeIntentIds(){
  return Array.from(document.querySelectorAll("#meIntents input[type=checkbox]:checked"))
    .map(el=>el.value).filter(Boolean);
}
function syncMeIntentPick(){
  const box=$("#meIntents");
  if(!box) return;
  box.querySelectorAll("label").forEach(lab=>{
    const cb=lab.querySelector("input");
    lab.classList.toggle("on", !!(cb&&cb.checked));
  });
  const ids=readMeIntentIds();
  /* The fold is closed by default, so the summary is the only way to see what a card links to
     without opening it - and a NAME says more than a number. One or two fit: the row holds
     about 64 characters against a median topic of 21, so a pair of typical ones sits inside
     it. Three would not, and would not help either: naming two of five arbitrarily tells you
     less than counting all five. Falls back to the count if a link outlives its intent. */
  const sum=$("#meIntentSum");
  if(sum){
    const count=counted(ids.length,"{N} intent","{N} intents");
    let txt=t("none");
    if(ids.length){
      const named=ids.length<=2
        ? ids.map(id=>{ const i=intentIdxOfId(id); return i>-1?intentNavName(i):""; }).filter(Boolean)
        : [];
      txt=named.length===ids.length ? named.join(" · ") : count;
    }
    sum.textContent=txt;
  }
}
function refreshMeIntentList(keepChecked){
  const box=$("#meIntents");
  if(!box) return;
  const selected=keepChecked||readMeIntentIds();
  const c=readCardCatPick();
  box.innerHTML=intentPickHtml(selected, c);
  syncMeIntentPick();
}
function storeIntentIds(ids){
  return (ids||[]).map(id=>{
    if(String(id).indexOf("i:")===0){
      const n=+String(id).slice(2);
      if(Number.isInteger(n)&&n>=0&&n<BASE_N) return n;
    }
    return id;
  });
}

/** presetCat is the category a NEW card lands in - from the "+" on a category row in Manage,
 *  or from the add-card at the end of a filtered list. A new card always arrives with a
 *  category, so this editor does not offer a picker for one; an existing card keeps its
 *  select, because that is the only way to move a card between categories.
 *  fromManage returns to Manage when the editor closes, the same contract as the intent editor. */
/* ONE PANEL PER CONTENT LANGUAGE, rather than a row of boxes per field. Four fields times three
   languages is twelve boxes on one screen; four fields behind three tabs is four. The strip is
   .seg, so a third language costs a data-n and nothing else. */
function meFieldId(field,l){ return langFieldId("me",field,l); }
/* A LABEL AND AN UNDERLINE, never the segmented control. .seg is what the header uses to SET
   the working language, and the Advanced fold has a pin that sets a card language for good, so
   a filled pill here reads as a third setting. An underline is the one idiom that means "same
   thing, other view". Endonyms, deliberately: a language names itself in every interface.
   SHARED BY EVERY EDITOR that holds more than one language - cards, intents, categories - so a
   new language reaches all three at once and none of them drifts into its own idiom. */
function langTabs(){
  return '<div class="lang-tabs" role="tablist" title="'
    +esc(t("Switch the language being edited")+" · "+formatActionChord("edPrevLang")
         +" / "+formatActionChord("edNextLang"))+'">'
    +'<span class="lang-tabs-lab">'+esc(t("Editing"))+'</span>'
    +CONTENT_LANGS.map((l,i)=>'<button type="button" role="tab" data-i18n-skip data-l="'+esc(l)+'"'
      +(i?"":' class="on"')+'>'+esc(langEndonym(l))+'</button>').join("")
    +'</div>';
}
/* Panes are SIBLINGS of their strip. That is what lets one listener serve every dialog without
   knowing which is open. */
function langPane(l,i,body){
  return '<div class="lang-pane'+(i?"":" on")+'" data-l="'+esc(l)+'">'+body+'</div>';
}
function langFieldId(prefix,field,l){ return prefix+"_"+field+"_"+l; }
/* MARKED UNTIL TOUCHED, and the fold above it marked too - a mark inside a closed fold cannot
   be seen. Idempotent, because the field Save lands on is also one of the fields Save marks,
   and two clear-listeners on one box would leave the class behind. `ev` is what counts as
   touching it: a keystroke for a field, a click for a picker. */
function markMissing(el, ev){
  if(!el || el.classList.contains("is-missing")) return;
  const kind=ev||"input";
  el.classList.add("is-missing");
  const fold=el.closest?el.closest("details.mf-fold"):null;
  if(fold) fold.classList.add("mf-missing");
  const clear=()=>{
    el.classList.remove("is-missing");
    el.removeEventListener(kind,clear);
    if(fold && !fold.querySelector(".is-missing")) fold.classList.remove("mf-missing");
  };
  el.addEventListener(kind,clear);
}
/* ALL OF THEM, NOT THE FIRST: a form with two gaps was two rejected Saves, each teaching one.
   Everything empty is marked; the dialog LANDS on the first, which is the one whose tab or
   fold opens. With one gap the toast still names it - with several, only the marks can. */
function edReportMissing(items){
  if(!items.length) return false;
  items.forEach(it=>it.mark());
  items[0].land();
  toast(items.length===1 ? items[0].msg : "Some required fields are empty");
  return true;
}
/* Naming the tab as well as the box: a validation message about a field nobody can see is a
   dead end. Every caller is a failed Save, which is why it marks as well as lands. */
function langFocus(id,l){
  const el=document.getElementById(id);
  const pane=el&&el.closest?el.closest(".lang-pane"):null;
  const strip=pane&&pane.parentNode?pane.parentNode.querySelector(".lang-tabs"):null;
  const b=strip?strip.querySelector('button[data-l="'+cssEsc(l)+'"]'):null;
  if(b) b.click();
  if(!el) return;
  el.focus();
  markMissing(el);
}
document.addEventListener("click",e=>{
  const b=e.target&&e.target.closest&&e.target.closest(".lang-tabs button[data-l]");
  if(!b) return;
  const strip=b.closest(".lang-tabs"), l=b.getAttribute("data-l");
  const tabs=Array.prototype.slice.call(strip.querySelectorAll("button[data-l]"));
  /* Which way the sweep travels, read BEFORE the class moves. The setting is asked here rather
     than in CSS because mgReduceMotion() covers the Settings switch as well as the system one. */
  const was=tabs.findIndex(x=>x.classList.contains("on")), now=tabs.indexOf(b);
  const still=mgReduceMotion();
  const dir=(still||was<0||now===was) ? "" : (now>was ? "lang-in-next" : "lang-in-prev");
  tabs.forEach(x=>x.classList.toggle("on",x===b));
  const scope=strip.parentNode;
  if(scope) scope.querySelectorAll(".lang-pane[data-l]").forEach(p=>{
    if(p.parentNode!==scope) return;
    const on=p.dataset.l===l;
    /* Cleared before the display change, so the next swap in the same direction restarts the
       animation rather than finding the class already there and doing nothing. */
    p.classList.remove("lang-in-next","lang-in-prev");
    p.classList.toggle("on",on);
    if(on && dir) p.classList.add(dir);
  });
},true);
const LANG_ENDONYM={en:"English",pl:"Polski",uk:"\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430"};
function langEndonym(l){ return LANG_ENDONYM[l]||String(l||"").toUpperCase(); }
function meLangPanel(m,l,i){
  const id=f=>meFieldId(f,l), v=f=>esc(cardText(m,f,l));
  /* Each placeholder says what its LABEL does not: what the box is for, what the text becomes,
     and who reads it. A placeholder that repeats its label is decoration. */
  return langPane(l,i,""
    +'<div class="mf"><label>Title</label><input id="'+id("t")+'" value="'+v("t")+'"'
      +' autocomplete="off" placeholder="'+esc(t("a short name you will recognise"))+'"></div>'
    +'<div class="mf"><label>'+esc(t("Macro"))+'</label>'
    +'<textarea id="'+id("body")+'" spellcheck="true"'
      +' placeholder="'+esc(t("the text the customer receives"))+'">'+v("body")+'</textarea></div>'
    +'<div class="mf"><label>Note</label>'
      +'<input id="'+id("note")+'" value="'+v("note")+'"'
      +' autocomplete="off" placeholder="'+esc(t("guidance for you, never sent"))+'"></div>');
}
/* ITS OWN SECTION, not a fourth field under the tabs: keywords are one bag for the card rather
   than one per language, and they were the only thing in Content that did not answer to the tab
   above them - which the language sweep made plain, everything moving but this. No label and no
   note: the section heading is the only name the box needs. */
function meSharedFields(m){
  return '<div class="mf mf-shared">'
    +'<input id="me_k" value="'+esc(String(m&&m.k||""))+'" autocomplete="off" placeholder="extra words for search"></div>';
}
/* THE SAME RULING AS THE LINKED INTENTS FOLD, and for the same reason: the words themselves say
   more than a count, but an arbitrary few of many say less than counting all of them. The row
   holds about 64 characters, so most bags show whole and only long ones fall back to a tally. */
function meKeysSummary(m){
  const raw=String((m&&m.k)||"").trim().replace(/\s+/g," ");
  if(!raw) return t("none");
  if(raw.length<=64) return raw;
  const n=raw.split(" ").length;
  return n===1 ? t("1 word") : t("{N} words").replace("{N}",n);
}
function meFocusField(field,l){ langFocus(meFieldId(field,l),l); }
/* THE SAME LANDING AS A MISSING FIELD, for the one required thing that is not a field: open
   the fold hiding it, then mark it until a chip is chosen. */
function meFocusCat(){
  const box=$("#meCatPick");
  if(!box) return;
  const fold=box.closest("details.mf-fold");
  if(fold && !fold.open) fold.open=true;      // its own toggle handler shuts the siblings
  markMissing(box,"click");
}
/** What a closed fold says about itself, so shutting one never hides that something is set. */
/* The pin is read in two places that MUST agree. They did not, which is how the summary
   came to be the only part of the dialog that could not see it. */
function readMeLockLang(){
  const box=$("#meLockLang");
  if(!box||!box.checked) return "";
  return ((($("#meLockSeg .on")||{}).dataset||{}).v)||"en";
}
/* The card's NAME is in the heading, so repeating it here said nothing twice. What a shut
   fold genuinely hides is whether a language is missing, which is invisible everywhere else
   and is the one thing worth catching while walking a catalog. */
function meLangSummary(m){
  const have=CONTENT_LANGS.filter(l=>String((m&&m[cardFieldKey("body",l)])||"").trim());
  if(!have.length) return t("no text yet");
  const names=have.map(l=>l.toUpperCase()).join(" + ");
  return have.length===CONTENT_LANGS.length ? names : t("{L} only").replace("{L}",names);
}
function meAdvSummary(m){
  const on=[];
  if(m&&m.alt) on.push(t(m.seq?"steps":"alt"));
  if(m&&m.firstOnly) on.push(t("first name"));
  if(paxVocOn(m)) on.push(t("vocative"));
  if(m&&m.allIntents) on.push(t("every intent"));
  if(m&&m.intentTop) on.push(t("top"));
  /* The pin is a toggle like the rest and was the only one leaving no trace. It carries a
     VALUE, so the summary names the language rather than just reporting that one is set. */
  if(m&&(m.lockLang==="en"||m.lockLang==="pl"))
    on.push(t("{L} only").replace("{L}",m.lockLang.toUpperCase()));
  return on.length?on.join(" \u00b7 "):t("nothing set");
}
function openCardEditor(id, presetCat, fromManage){
  const isNew=!id;
  let savedId=id;
  const existing=id?findCard(id):null;
  const base=id?baseCard(id):null;
  // Imported catalog entries may keep old u: ids but live in BASE_M - treat as built-in
  const isCustom=!base && (!!(existing&&existing._custom) || (id&&String(id).indexOf("u:")===0));
  /* EMPTY when nothing sent one, rather than the first category: a card silently filed under
     whatever happens to sort first is worse than a Save that asks. The picker below shows it. */
  const startCat=(presetCat && CATS[presetCat]) ? presetCat : "";
  const m=existing||{t:"",c:startCat,en:"",pl:"",note:"",k:"",alt:0,firstOnly:0,intents:[]};
  const linked=normalizeCardIntents(m);
  const backToManage=!!fromManage;
  function doneCardEditor(){
    if(backToManage) openManage();
    else closeModal();
  }
  openDialog({
    /* IN THE CONFIG, not set before the call: openDialog assigns the back handler as
       its first line, so setting one beforehand is overwritten by the absence of one
       here - which is how Escape came to close outright where Cancel went back. */
    back: backToManage?doneCardEditor:null,
    title: isNew?"New card":"Edit card",
    /* Read through savedId so a card saved for the first time names itself at once. */
    name: ()=>{ const c=savedId?findCard(savedId):null; return c?cardTitle(c):""; },
    resettable: ()=>!!(baseCard(savedId) && pack.overrides[savedId]),
    resetOn: "Discard your edits and restore the catalog wording.",
    resetOff: isCustom||isNew ? "This is yours, so the catalog has no version to restore." : "Nothing to discard - this matches the catalog.",
    // A new card has no neighbours yet.
    nav: isNew?"":edNavHtml(),
    body:
    /* The card itself - title, both languages, note and keywords - in one fold at the top, open
       by default because it is what you came here for. Folding it is what makes the dialog short
       enough to see whole: with it shut, Category, Linked intents and Advanced all fit on screen
       at once. Its summary is the title, so a closed fold still says which card this is. */
    mfSec({key:"text", cls:"mf-main", open:true, label:"Content",
      sum:esc(meLangSummary(m)), sumId:"meTextSum", sumSkip:true,
      body:
      langTabs()+CONTENT_LANGS.map((l,i)=>meLangPanel(m,l,i)).join("")})+
    mfSec({key:"keys", label:"Keywords",
      sum:esc(meKeysSummary(m)), sumId:"meKeysSum", sumSkip:true,
      body:meSharedFields(m)})+
    /* Category and Linked intents open CLOSED. They are the two tallest blocks in the dialog and
       between them they pushed the macro text - the thing you almost always came here to edit -
       below the fold. Each summary carries what is inside it, so collapsed does not mean unknown:
       you can read the category and the number of links without opening anything. They keep their
       position above the text, because that is the reading order of a card. */
    /* A NEW CARD GETS THE PICKER TOO. Every other card treats its category as a field; only
       the one being made had it decided by the door, which stopped being one door. */
    mfSec({key:"cat", label:"Category",
      sum:(m.c&&CATS[m.c]) ? catIconSvg(m.c,"cat-ic")+esc(CATS[m.c]) : esc(t("none")),
      sumId:"meCatSum", sumSkip:true,
      body:
      '<div class="cat-pick" id="meCatPick">'+cardCatPickHtml(m.c)+'</div>'})+
    mfSec({key:"intents", label:"Linked intents",
      sum:"", sumId:"meIntentSum",
      body:'<div class="intent-pick" id="meIntents">'+intentPickHtml(linked, m.c)+'</div>'})+

    /* The flags fold under "Advanced" - the least-touched part by a distance, and open
       they pushed the buttons below the fold. Favourite and Hidden were here briefly and
       removed: they are not edits - one click on the card or in Manage - and a toggle
       behind a Save button is not a toggle. Delete stays: destructive belongs where you
       can see the whole card before doing it. */
    mfSec({key:"adv", label:"Advanced",
      sum:esc(meAdvSummary(m)), sumId:"meAdvSum",
      body:(function(){
        /* `rows`, not `t`: this list is built out of t() calls. */
        const rows=[];
        /* The label names a token, so it draws the token the way a card does rather than
           spelling it in braces. Escape first, substitute after: the tag is markup and the
           label is not, and {PAX} survives escaping unchanged. */
        const paxTag='<span class="fillmiss">PAX</span>';
        /* And the green tag as a card wears it, so a flag about intents names the mark rather
           than a word for it. Its own title glosses the abbreviation. */
        const intTag='<span class="cbadge hit" title="'+esc(t("Intent"))+'">'+esc(t("int"))+'</span>';
        const box=(id,on,dis,tip,label)=>rows.push('<label title="'+esc(t(tip))+'">'
          +'<input type="checkbox" id="'+id+'"'+(on?" checked":"")+(dis?" disabled":"")+'> '
          +esc(t(label)).split("{PAX}").join(paxTag).split("{INT}").join(intTag)+'</label>');
        box("meAlt",m.alt,false,"Blank lines split the text into separately copyable alternatives.",
            "Split by blank lines into alternatives");
        box("meSeq",m.seq,!m.alt,"Numbers the alternatives as ordered steps.",
            "Ordered sequence (STEP badges)");
        box("meFirst",m.firstOnly,false,"{PAX} fills the first name even when the chat gives the full name.",
            "{PAX} as first name only");
        box("meVoc",paxVocOn(m),false,
            "Polish only: declines the name into the vocative, the form Polish uses to address someone. Only the first name declines; a surname is left as written.",
            "{PAX} in the vocative");
        box("meAllIntents",m.allIntents,false,
            "Rings green under every intent - for text that always applies, like an opener.",
            "Linked to every {INT}");
        box("meIntentTop",m.intentTop,false,
            "Sorts above the other linked cards when an intent is picked.",
            "Top of the {INT} group");
        /* THE LANGUAGE PIN. Off by default, and off means "follow the EN/PL toggle", which is
           what every card did before this existed. On, the card shows that version and resolves
           every token in it whatever the toggle says - which is what an internal comment wants,
           since a comment is English on every desk. The switcher greys out while the pin is off
           rather than disappearing: a control that vanishes leaves no clue the setting exists. */
        const pinned=(m.lockLang==="en"||m.lockLang==="pl") ? m.lockLang : "";
        const pin='<div class="mf-pin'+(pinned?"":" off")+'" id="meLockRow">'
          +'<label title="'+esc(t("The card keeps this language whatever the EN|PL toggle says, tokens included"))+'">'
          +'<input type="checkbox" id="meLockLang"'+(pinned?" checked":"")+'> '
          +esc(t("Always one language"))+'</label>'
          +'<div class="seg mf-pin-seg" id="meLockSeg">'
          +'<button type="button" data-v="en"'+((pinned||"en")==="en"?' class="on"':'')+'>EN</button>'
          +'<button type="button" data-v="pl"'+(pinned==="pl"?' class="on"':'')+'>PL</button>'
          +'</div></div>';
        /* The pin is the seventh cell, so four rows put alternatives, steps and the two
           {PAX} boxes down the left, and the two intent boxes and the pin down the right. */
        const cells=rows.concat([pin]);
        return '<div class="mf-cols" style="grid-template-rows:repeat('
          +Math.ceil(cells.length/2)+',auto)">'+cells.join("")+'</div>';
      })()})
    ,actions:
      // Pushed to the far left by .mf-del, away from Save - a destructive action should not sit
      // under the thumb that is heading for the primary button.
      /* Delete and Reset are both "undo my work", so they sit together at the left, away from
         Save. Reset only exists when there is something to reset, which is why it is the one
         button whose absence must not move the others - .mf-left holds the pair. */
      '<span class="mf-left">'+
        (isNew ? "" : '<button type="button" class="btn danger mf-del" id="meDelete" '+
          'title="Delete this card: a built-in one returns on Reset, one you made does not">Delete</button>')+
        '<button type="button" class="btn mf-reset" id="meReset">Reset</button>'+
      '</span>'+
      '<button type="button" class="btn" id="meCancel" title="Close without saving any change">Cancel</button>'+
      '<button type="button" class="btn primary" id="meSave" title="Save this card on this computer">Save</button>'
  });
  $("#meCancel").onclick=doneCardEditor;
  function syncMeSeqEnabled(){
    const altEl=$("#meAlt"), seqEl=$("#meSeq");
    if(!altEl||!seqEl) return;
    if(!altEl.checked){ seqEl.checked=false; seqEl.disabled=true; }
    else seqEl.disabled=false;
  }
  if($("#meAlt")) $("#meAlt").onchange=syncMeSeqEnabled;
  syncMeSeqEnabled();
  /* A summary that goes stale is worse than none: type a note, fold the section, and it would
     still read "none". Recomputed from the live fields on every edit. */
  (function syncMeFoldSummaries(){
    const mePrimary=CONTENT_LANGS[0];
    const read=()=>{
      const cur={note:($("#"+meFieldId("note",mePrimary))||{}).value||"",
        k:($("#me_k")||{}).value||"", lockLang:readMeLockLang()};
      CARD_FLAGS.forEach(f=>{ const el=$("#"+CARD_FLAG_BOX[f]); cur[f]=el&&el.checked?1:0; });
      return cur;
    };
    const upd=()=>{
      const cur=read();
      const d=$("#meTextSum");
      if(d){
        const live={};
        CONTENT_LANGS.forEach(l=>{ const el=$("#"+meFieldId("body",l));
          live[cardFieldKey("body",l)]=el?el.value:""; });
        d.textContent=meLangSummary(live);
      }
      const a=$("#meAdvSum"); if(a) a.textContent=meAdvSummary(cur);
      const k=$("#meKeysSum"); if(k) k.textContent=meKeysSummary(cur);
    };
    // every language's boxes, so the summary follows whichever tab is being typed in
    document.querySelectorAll(".lang-pane input, .lang-pane textarea")
      .forEach(el=>el.addEventListener("input",upd));
    // the keyword box sits outside every pane now, so it needs naming here
    (function(){ const kb=$("#me_k"); if(kb) kb.addEventListener("input",upd); })();
    CARD_FLAGS.forEach(f=>{
      const el=$("#"+CARD_FLAG_BOX[f]); if(el) el.addEventListener("change",upd);
    });
    /* The pin greys its own switcher, and the switcher moves its own class - the same
       "the class moves, the element stays" rule the Settings segs follow. */
    const pinBox=$("#meLockLang"), pinRow=$("#meLockRow"), pinSeg=$("#meLockSeg");
    if(pinBox && pinRow){
      pinBox.addEventListener("change",()=>{ pinRow.classList.toggle("off",!pinBox.checked); upd(); });
    }
    if(pinSeg){
      pinSeg.addEventListener("click",e=>{
        const b=e.target.closest("button[data-v]"); if(!b||b.classList.contains("on")) return;
        e.preventDefault();
        pinSeg.querySelectorAll("button").forEach(x=>x.classList.remove("on"));
        b.classList.add("on"); upd();
      });
    }
    upd();
  })();
  if($("#meDelete")) $("#meDelete").onclick=()=>{
    // removeCard() owns the confirm and the built-in / custom split, so this cannot drift from
    // what the same action does in Manage.
    // doneCardEditor() already returns to Manage when the editor was opened from it.
    if(removeCard(id)){ render(); drawPills(); doneCardEditor(); }
  };
  $("#meIntents").onclick=e=>{
    if(e.target&&e.target.matches&&e.target.matches("input[type=checkbox]")) syncMeIntentPick();
  };
  /* Only present when editing - a new card's category is fixed by where you added it.
     Creating INTENTS from inside this dialog stays out: an intent invented mid-edit is
     vocabulary, reached in a click from the main UI or Manage. A category wanted mid-edit
     is a statement about THIS card, and leaving to make one meant losing the edit - so the
     "+" chip is here, the same control as the strip's, wired to the same ensureCustomCat. */
  const meCatBox=$("#meCatPick");
  if(meCatBox){
    // Moving the card re-scopes the intent list, so rebuild it on a real change only
    meCatBox._onPick=k=>{
      const sum=$("#meCatSum"); if(sum) sum.innerHTML=catIconSvg(k,"cat-ic")+esc(CATS[k]||k||"");
      refreshMeIntentList(readMeIntentIds());
    };
    bindCatPick(meCatBox, true);
  }
  /* Reuses Manage's height animation wholesale - same modal card, same problem. mgPinCard()
     freezes the current height on the way in so the <details> toggle has something to grow from,
     and the toggle handler animates to the new one. */
  wireFolds(modalCard,"details.mf-fold","details.mf-fold");
  syncMeIntentPick();
  if($("#meReset")) $("#meReset").onclick=()=>{
    delete pack.overrides[id];
    savePack(); rebuildCards(); doneCardEditor();
    toast(t("Restored original -")+" "+(base.t||id));
  };
  $("#meSave").onclick=()=>{
    /* Every language's text straight off the table, so a new language adds no line here. */
    const text={};
    CARD_TEXT_FIELDS.forEach(f=>CONTENT_LANGS.forEach(l=>{
      const el=$("#"+meFieldId(f,l)), key=cardFieldKey(f,l);
      if(el&&key) text[key]=String(el.value||"").trim();
    }));
    CARD_SHARED_FIELDS.forEach(f=>{
      const el=$("#me_"+f);
      if(el) text[f]=String(el.value||"").trim();
    });
    const primary=CONTENT_LANGS[0];
    const t=text[cardFieldKey("t",primary)]||"";
    // No picker on a new card - the category is whichever one you added it from
    const c=readCardCatPick()||startCat;
    const intentIds=readMeIntentIds();
    const alt=$("#meAlt").checked?1:0;
    const seq=(alt && $("#meSeq")&&$("#meSeq").checked)?1:0;
    const firstOnly=$("#meFirst").checked?1:0;
    const paxVoc=$("#meVoc").checked?1:0;
    const allIntents=$("#meAllIntents").checked?1:0;
    const intentTop=$("#meIntentTop").checked?1:0;
    const lockLang=readMeLockLang();
    /* ONLY THE PRIMARY IS REQUIRED. A missing translation falls back to it when the card is
       read (see cardLang), so demanding both taxed every card for a language the desk may not
       write. In reading order, so the dialog lands on the topmost gap. */
    const need=[];
    const fld=(field,msg)=>({msg:msg,
      mark:()=>markMissing($("#"+meFieldId(field,primary))),
      land:()=>meFocusField(field,primary)});
    if(!t) need.push(fld("t","Title is required"));
    if(!text[cardFieldKey("body",primary)]) need.push(fld("body","Macro text is required"));
    if(!c||!CATS[c]) need.push({msg:"Pick a category",
      mark:()=>markMissing($("#meCatPick"),"click"), land:meFocusCat});
    if(edReportMissing(need)) return;
    // Linking is enough: categoriesForIntent() unions this card's category onto each intent.
    const intentsStored=storeIntentIds(intentIds);
    if(isNew || isCustom){
      /* A custom entry is REPLACED wholesale, so every flag has to be written here. allIntents
         and intentTop were missing, which silently stripped them from any custom card that had
         them the first time it was edited. Built-ins never had the bug: their override is
         partial and Object.assign keeps whatever the base declares. */
      const entry=Object.assign({id:isNew?(savedId=uid("u:")):(id),c},text,
        {alt,seq,firstOnly,paxVoc,allIntents,intentTop,lockLang,intents:intentsStored});
      cardStorageKeys().forEach(f=>{
        if(!entry[f] && cardRequiredKeys().indexOf(f)<0) delete entry[f];
      });
      /* paxVoc is deliberately absent from this sweep - see CARD_BOOL_FLAGS. */
      CARD_BOOL_FLAGS.forEach(f=>{ if(!entry[f]) delete entry[f]; });
      if(!entry.lockLang) delete entry.lockLang;
      if(!entry.intents||!entry.intents.length) delete entry.intents;
      if(isNew) pack.custom.push(entry);
      else {
        const ix=pack.custom.findIndex(x=>x.id===id);
        if(ix>-1) pack.custom[ix]=entry; else pack.custom.push(entry);
      }
    } else {
      const full=Object.assign({c},text,{intents:intentsStored,
        alt:alt?1:0, seq:seq?1:0, firstOnly:firstOnly?1:0, paxVoc, allIntents, intentTop, lockLang});
      const o=overrideAgainstBase(baseCard(id), full);
      // Nothing differs from the catalog any more - drop the override so the badge clears too
      if(Object.keys(o).length) pack.overrides[id]=o; else delete pack.overrides[id];
    }
    /* Saving no longer closes - that is the X's job alone. A NEW card is re-opened on
       itself, or a second Save would add a second copy of it. edMarkClean is NOT deferred:
       it is cheap, and leaving it a frame behind opens a window where walking to the next
       card asks about changes that are already saved. */
    if(!isNew) edMarkClean();
    afterPaint(()=>{
      savePack(); rebuildCards();
      toast(isNew?"Card added":"Card saved");
      if(isNew) openCardEditor(savedId,null,fromManage);
      else refreshDialogChrome();   // the title may have changed, and Reset may have woken
    });
  };
  /* WHICHEVER LIST YOU CAME FROM. The main screen can show every card at once, so there the
     arrows walk what is on screen - filtered, searched, sorted. The LIBRARY has no All: it
     only ever shows one category at a time, so there they walk that category and stop at
     its edge. Reading the main list from the Library also disabled both arrows outright
     whenever a filter excluded the card being edited. */
  edWireNav((fromManage ? mgCardsIn(m.c) : shown).map(x=>x&&x.id).filter(Boolean), id,
            nid=>openCardEditor(nid,null,fromManage));
  // Guarded: the dialog can be gone by the time this fires, and an unguarded .focus() on the
  // missing field throws an uncaught TypeError. Same for the intent editor below.
  /* Not during the tour. The tour drives its own buttons from real DOM focus - that is how the
     arrow keys move between Skip, Back and Next - so a dialog grabbing a text field takes the
     keyboard away from it, and the caret landing in Title also reads as "start typing here",
     which is the opposite of what a showcase step is asking for. */
  setTimeout(()=>{
    if(tourActive()) return;
    const el=$("#"+meFieldId("t",CONTENT_LANGS[0])); if(el) el.focus();
  },30);
}

function ensureCustomCat(name){
  applyCatsToGlobal();
  // reuse existing label match
  const hit=Object.keys(CATS).find(k=>CATS[k].toLowerCase()===name.toLowerCase());
  if(hit) return hit;
  let key=slugCat(name);
  if(CATS[key]||BASE_CATS[key]||(pack.customCats&&pack.customCats[key])) key=uid("uc_");
  pack.customCats[key]=name;
  pack.catLabels[key]=name;
  savePack();
  applyCatsToGlobal();
  if(catOrder.indexOf(key)<0) catOrder.push(key);
  nsSet("CatOrder",JSON.stringify(catOrder));
  return key;
}

/** Toggle: hidden entries stay on the list, so the same button undoes it.
 *  Hiding also drops the favourite - the two states are mutually exclusive, since a favourite
 *  is something you want surfaced and hidden is the opposite. The star does not come back on
 *  un-hiding: it was removed deliberately, and silently restoring it would be a surprise.
 *  Any text override is left alone - hiding is about visibility, not about discarding work. */
function hideCard(id){
  if(!id) return;
  if(!Array.isArray(pack.hidden)) pack.hidden=[];
  const at=pack.hidden.indexOf(id);
  const nowHidden=at<0;
  if(at>-1){ pack.hidden.splice(at,1); toast("Shown again"); }
  else {
    pack.hidden.push(id);
    let lostStar=false;
    if(Array.isArray(pack.favourites)){
      const f=pack.favourites.indexOf(id);
      if(f>-1){ pack.favourites.splice(f,1); lostStar=true; }
    }
    toast(lostStar ? "Put away - greyed at the foot of its category, unfavourited"
                   : "Put away - greyed at the foot of its category");
  }
  savePack();
  /* Flip the flag in place: rebuildCards() re-derives everything for a change that
     alters none of it, and its cost lands inside the FLIP's own window - the first third
     of the journey was over before anything painted, which is what made hiding less
     smooth than starring. Symmetric with toggleFavourite() on purpose: same row, same
     move, same animation. Read from `cards`, never findCard(): that falls back to
     BASE_M, and a display flag on a catalog entry outlives the pack that owns it. */
  const m=(cards||[]).find(x=>x&&x.id===id);
  if(m){ if(nowHidden) m._hidden=1; else delete m._hidden; }
  /* The pills and the vocabulary both read what is put away: All loses the card from its
     count, its own category keeps it, and it lends no words to search. */
  recountMacros();
  syncFavouritesMeta();   // hiding strips the star
  drawPills();
  render();
}

function deleteCustomCard(id){
  if(!id) return;
  if(!ask("Delete this custom card permanently?")) return;
  pack.custom=(pack.custom||[]).filter(m=>m.id!==id);
  pack.hidden=(pack.hidden||[]).filter(x=>x!==id);
  savePack(); rebuildCards();
  toast("Custom card deleted");
}

/* Which <details> in Manage are expanded. Held here rather than read off the DOM
   because openManage() re-renders after each edit - without it, hiding one card slammed
   every open group shut. Deliberately not persisted: it restarts with the browser;
   staying put MID-SESSION is what matters. Catalog & data starts open - all-shut showed
   four closed headings and no answer to what brings most people here (what is loaded,
   how to get a copy out), and it is the only section that fits on screen whole. */
const mgOpen=new Set(["data"]);

/** One collapsible Manage section. `body` is trusted markup; `title` is not. */
function mgSec(key,title,body,count){
  return '<details class="manage-sec" data-mg="'+esc(key)+'"'+(mgOpen.has(key)?" open":"")+'>'+
    '<summary><span class="acc-tw" aria-hidden="true">'+ICON_CHEVRON_R+'</span><h3>'+esc(title)+'</h3>'+
      (count!=null?'<span class="mg-count">'+esc(String(count))+'</span>':'')+
    '</summary>'+
    '<div class="manage-secbody">'+body+'</div></details>';
}

/* What a row can be dragged past. Manage always groups by category, so its band is
   category + favourite + hidden regardless of whether an intent happens to be selected -
   unlike the card list, whose band collapses to relevance rank while an intent is on. */
function mgCardBand(m){
  return String(m&&m.c||"")+"|"+(isFavourite(m&&m.id)?"1":"0")+"|"+((m&&m._hidden)?"1":"0");
}

/** A card inside the category tree. Hidden rows are greyed; the star is inert on them, so
 *  the only way back is the closed eye - the rule the intent rows already follow. */
function mgCardRow(m){
  const hid=!!m._hidden, fav=isFavourite(m.id);
  const badge=(m._custom || m._overridden || movedCardIds().has(m.id))
    ?'<span class="cbadge ed mg-badge" title="'+esc(t("Changed or added by you, not what the catalog shipped"))+'">'+esc(t("mod"))+'</span>':"";
  // Local copy count - absent until the first copy, so unused rows stay quiet rather than
  // wearing a "0" that reads as an accusation before anyone has worked a shift with it.
  const uses=(pack.useCounts&&pack.useCounts[m.id])|0;
  const useBadge=uses?'<span class="mg-uses" title="Copied '+uses+' time'+(uses===1?'':'s')
    +' in this browser">'+uses+'×</span>':"";
  const favTip=fav?"Remove from Favourites":"Add to Favourites";
  const hideShow=hid
    ?'<button type="button" data-show-card="'+esc(m.id)+'" title="Show this card again" aria-label="Show this card again">'+ICON_EYE_SHUT+'</button>'
    :'<button type="button" data-hide-card="'+esc(m.id)+'" title="Put this card away: it greys out at the foot of this category" aria-label="Put this card away">'+ICON_EYE_OPEN+'</button>';
  /* The title is plain text, not a field. Renaming lives behind ✎ and nowhere else: a card
     already has a full editor, so a second path to the same value was two ways to do one thing,
     and the row is cleaner as drag surface end to end. Categories keep their inline rename
     because they have no editor to send you to. */
  return '<div class="manage-row mg-card'+(hid?" is-hidden":"")+'" data-cardrow="'+esc(m.id)+'"'+
      ' data-band="'+esc(mgCardBand(m))+'" title="Drag to reorder, or onto a category to move it there">'+
    '<span class="mg-card-lab">'+esc(cardTitle(m)||"")+'</span>'+badge+useBadge+
    '<span class="cacts">'+
      '<button type="button" data-edit-card="'+esc(m.id)+'" title="Open the full editor" aria-label="Edit card">'+ICON_EDIT+'</button>'+
      hideShow+
      '<button type="button" class="danger mg-trash" data-remove-card="'+esc(m.id)+'" title="Delete this card" aria-label="Delete card">'+ICON_TRASH+'</button>'+
      '<button type="button" class="star-btn'+(fav?" on":"")+'" data-fav-card="'+esc(m.id)+'" title="'+esc(favTip)+'" aria-label="'+esc(favTip)+'" aria-pressed="'+(fav?"true":"false")+'">'+(fav?ICON_STAR_ON:ICON_STAR_OFF)+'</button>'+
    '</span></div>';
}

/* The order cards take inside a category here. Named because the editor's arrows must
   agree with the tree they were opened from - two views disagreeing about what "next"
   means is the same fault the tiebreak comment below already describes. */
function mgCardCmp(a,b){
  return ((a.m._hidden?1:0)-(b.m._hidden?1:0)) ||
         ((isFavourite(a.m.id)?0:1)-(isFavourite(b.m.id)?0:1)) ||
         (cardOrderIdx(a.m.id)-cardOrderIdx(b.m.id)) ||
         (a.i-b.i);
}
function mgCardsIn(k){
  return (cards||[]).map((m,i)=>({m,i})).filter(o=>o.m&&o.m.c===k)
    .sort(mgCardCmp).map(o=>o.m);
}
/** The category -> card tree. Categories run in catOrder - dragging here and dragging
 *  a pill mean the same thing; inside a category, hidden sinks and favourites rise,
 *  matching the card list. Plain rows and an explicit toggle button, not <details>/
 *  <summary>: a summary hijacks every click inside it (an inline rename field could not
 *  take a caret) and is not a sane thing to drag. Disclosure lives in mgOpen either way. */
function mgCatTree(){
  const known=Object.keys(CATS);
  known.sort((a,b)=>catSortIdx(a)-catSortIdx(b));
  const byCat={};
  known.forEach(k=>{ byCat[k]=[]; });
  const orphans=[];
  (cards||[]).forEach((m,i)=>{
    const row={m,i};
    if(byCat[m.c]) byCat[m.c].push(row); else orphans.push(row);
  });
  /* The tiebreak is pack.cardOrder, NOT the position in `cards`: `cards` is filled in
     catalog order then customs and nothing re-sorts it by the user's arrangement, while
     cardOrder is the record the card list itself sorts by (cmpCardDisplay's final
     tiebreak). Reading `a.i-b.i` here made a drag persist for the list and snap back in
     Manage - two views disagreeing about what "order" means. One record, both views. */
  const order=list=>list.sort(mgCardCmp).map(o=>mgCardRow(o.m)).join("");

  const group=(k,rows,fixed,label)=>{
    const n=rows.length;                      // CARDS - guards the delete x below
    const nMac=rows.reduce((sum,o)=>sum+macroBlockCount(o.m),0);   // cards - what the badge shows
    const key="cat:"+k;
    const op=mgOpen.has(key);
    /* Text, not a rename field - the pencil's editor owns name, icon and colour together. */
    const name='<span class="mg-cat-fixed">'+esc(label)+'</span>';
    /* × only on an empty category - the same rule the header pill uses, so no route anywhere
       in the UI deletes a category with cards still in it. */
    const x=(!n && k!=="__orphan")
      ?'<button type="button" class="mg-cat-x2 icbtn" data-delcat="'+esc(k)+'" title="Delete this empty category" aria-label="Delete category">'+ICON_TRASH+'</button>':"";
    const add=k==="__orphan" ? ""
      :(function(){ const tip=esc(t("Add a card to {CAT}").replace("{CAT}",label));
         return '<button type="button" class="mg-cat-add2 icbtn" data-add-card="'+esc(k)+'" title="'+tip+'" aria-label="'+tip+'">'+ICON_PLUS+'</button>'; })();
    /* The pencil opens the whole category - name, icon, colour - the way the card rows do.
       The inline name field beside it stays: a rename is one keystroke away and a dialog for
       one word would be a step backwards. */
    const editc=k==="__orphan" ? ""
      :'<button type="button" class="mg-cat-edit2 icbtn" data-editcat="'+esc(k)+'" title="'+esc(t("Edit this category's names, icon and colour"))+'" aria-label="Edit category">'+ICON_EDIT+'</button>';
    /* Role toggles. The rings they control are the two things about Etiuda that are least
       guessable, so the tooltips say what each does rather than naming the role. Both report
       state through .on, like the star and the eye. */

    const alwaysOn=isAlwaysCat(k);
    const roles=k==="__orphan" ? "" :
      '<button type="button" class="mg-role'+(alwaysOn?" on":"")+'" data-role-always="'+esc(k)+'" aria-pressed="'+(alwaysOn?"true":"false")+'" '+
        'title="'+(alwaysOn
          ? t("Supporting category, relevant regardless of the intent")
          : t("Make this a supporting category, relevant regardless of the intent"))+'" aria-label="'+esc(t("Supporting category"))+'">'+ICON_ROLE_ALWAYS+'</button>';
    return '<div class="mg-cat'+(op?" is-open":"")+'" data-cat="'+esc(k)+'">'+
      '<div class="mg-cat-row"'+(k==="__orphan"?"":' data-crow="'+esc(k)+'" title="Drag to reorder"')+'>'+
        '<button type="button" class="mg-tw" data-toggle="'+esc(key)+'" aria-expanded="'+(op?"true":"false")+'" '+
          'title="'+esc(t(op?"Collapse":"Expand"))+'" aria-label="'+esc(t(op?"Collapse":"Expand"))+' '+esc(label)+'">'+ICON_CHEVRON_R+'</button>'+
        name+'<span class="mg-cat-n">'+nMac+'</span>'+
        /* Edit first, matching the card row (edit, hide, delete, star) - the primary action on
           the thing this row names should sit in the same place in both. The role toggle follows
           it rather than leading. */
        '<span class="mg-cat-acts">'+editc+roles+add+x+'</span>'+
      '</div>'+
      '<div class="mg-cat-body"'+(op?"":" hidden")+'>'+
        (n?order(rows):'<div class="manage-empty">'+esc(t("Empty."))+'</div>')+
      '</div></div>';
  };

  const groups=known.map(k=>group(k,byCat[k],false,CATS[k])).join("");
  const stray=orphans.length ? group("__orphan",orphans,true,t("Uncategorised")) : "";
  return '<div class="mg-tree">'+(groups+stray||'<div class="manage-empty">'+esc(t("No categories."))+'</div>')+'</div>';
}

/* ---- Reordering inside Manage: pointer-based and bound to the document - the swap
   rewrites the row order, and anything bound to a row dies the moment it moves. Two
   lists, both shared with the app: categories write catOrder (the pills' own list),
   cards write pack.cardOrder (the card list's) - a drag here changes the order
   everywhere, the whole point of doing it from Manage. Only the grip starts a drag: the
   rest of a row is a rename field, a toggle or an action. */
let mgDrag=null, mgSwapLock=0;
function mgSiblingIdx(el){
  return el&&el.parentNode ? Array.prototype.indexOf.call(el.parentNode.children, el) : -1;
}
/* No midpoint test: a row swaps as soon as the pointer is over it, as in the intent
   panel. The midpoint rule exists for the CARD list, where ~274px entries trade places
   under a stationary cursor; Manage rows are ~30px, rail scale, so the swap lock alone
   is enough and waiting for the centre just makes the drag feel sticky. */
/** FLIP, scoped to one container - the same capture / invert / play the pills and the card list
 *  use. None of the card-list guards apply here: Manage moves the row itself instead of
 *  re-rendering, so membership is identical by construction and nothing can travel further than
 *  the list is tall. */
/* Any tree-changing action re-runs openManage(), which rebuilds the dialog from
   innerHTML - throwing away the scroll position (hiding the fortieth card snapped the
   list to the top) and any chance of animating. This keeps both: scroll restored on the
   two boxes that actually scroll, rows re-found by card id across the rebuild. mgFlip()
   cannot serve here - it holds element references, fine within one render, useless
   across one. */
/* Manage rebuilds its rows on every action, and a rebuilt row measures fresh. */
function mgRefreshAround(mutate){
  const treeBefore=modalCard.querySelector(".mg-tree");
  const keepTree=treeBefore?treeBefore.scrollTop:0;
  const bodyBefore=modalCard.querySelector(".modal-body");
  const keepCard=bodyBefore?bodyBefore.scrollTop:0;
  /* Rows in BOTH lists: cards live in a scrolling .mg-tree, intents in a plain list that scrolls
     with the dialog. Keyed by id, since openManage replaces every element. */
  const ROWS="[data-cardrow],[data-introw]";
  const rowKey=el=>el.getAttribute("data-cardrow")||el.getAttribute("data-introw");
  const before={};
  if(!mgReduceMotion()){
    modalCard.querySelectorAll(ROWS).forEach(el=>{
      if(!el.offsetParent) return;                  // inside a collapsed section
      before[rowKey(el)]=el.getBoundingClientRect().top;
    });
  }
  mutate();
  dressDialogInputs(modalCard);
  markCutText(modalCard);        // rebuilt rows measure fresh - see markCutText()
  openManage();
  /* Settle the DOM before measuring a pixel: the wrapper that moves the middle into
     .modal-body runs from a MutationObserver - a microtask AFTER this function - so
     measuring first read an unwrapped dialog (13px out) and then had every row
     RE-PARENTED underneath the animation, cancelling it outright. Idempotent, so the
     observer then finds nothing to do. */
  mountModalBody();
  const tree=modalCard.querySelector(".mg-tree");
  if(tree) tree.scrollTop=keepTree;
  const bodyAfter=modalCard.querySelector(".modal-body");
  if(bodyAfter) bodyAfter.scrollTop=keepCard;
  if(mgReduceMotion()) return;
  /* Clip each row against whatever actually scrolls around it - the tree for a card, the dialog
     body for an intent - so a row animating in one list is never measured against the other. */
  const bodyBox=(modalCard.querySelector(".modal-body")||modalCard).getBoundingClientRect();
  const moved=[], dys=[];
  modalCard.querySelectorAll(ROWS).forEach(el=>{
    const b=before[rowKey(el)];
    if(b==null || !el.offsetParent) return;
    const holder=el.closest(".mg-tree");
    const box=holder?holder.getBoundingClientRect():bodyBox;
    const r=el.getBoundingClientRect();
    if(r.bottom<box.top-40 || r.top>box.bottom+40) return;
    const dy=Math.round(b-r.top);
    if(!dy || Math.abs(dy)>box.height) return;
    moved.push(el); dys.push(dy);
  });
  if(!moved.length || moved.length>60) return;
  moved.forEach((el,i)=>{ el.style.transition="none"; el.style.willChange="transform";
                          el.style.transform="translateY("+dys[i]+"px)"; });
  /* Commit the invert before attaching the transition - see the note at flipPills():
     without a computed start value Firefox shows the end state. Same-task attach also
     avoids the background-tab rAF pause. */
  void modalCard.offsetHeight;
  const clear=()=>moved.forEach(el=>{ el.style.transition=""; el.style.transform=""; el.style.willChange=""; });
  moved.forEach(el=>{ el.style.transition="transform .18s "+E_EASE; el.style.transform=""; });
  setTimeout(clear,240);
}
function mgFlip(container,mutate){
  const rows=Array.prototype.slice.call(container.children);
  const before=rows.map(el=>el.getBoundingClientRect());
  mutate();
  const moved=[];
  rows.forEach((el,i)=>{
    const a=el.getBoundingClientRect();
    const dx=Math.round(before[i].left-a.left), dy=Math.round(before[i].top-a.top);
    if(!dx && !dy) return;
    el.style.transition="none";
    el.style.willChange="transform";    // see the note in flipPills
    el.style.transform="translate("+dx+"px,"+dy+"px)";
    moved.push(el);
  });
  if(!moved.length) return;
  const clear=()=>moved.forEach(el=>{ el.style.transition=""; el.style.transform=""; el.style.willChange=""; });
  /* Commit the invert before attaching the transition - see the note at flipPills():
     without a computed start value Firefox shows the end state. Same-task attach also
     avoids the background-tab rAF pause. */
  void container.offsetHeight;
  moved.forEach(el=>{ el.style.transition="transform .18s "+E_EASE; el.style.transform=""; });
  setTimeout(clear,200);
}
/* The Manage dialog grows and shrinks as sections open, and jumping straight to the new size is
   the jarring part - the eye loses its place because nothing connects the two states.
   Animating the CARD, not the section, is deliberate: the two disclosure mechanisms differ (the
   sections are native <details>, the category tree is a hidden div), the browsers disagree about
   how a closed <details> lays out its children, and `height:auto` is not animatable without
   `interpolate-size`, which Firefox does not have. The card is one element whose before and
   after heights can simply be measured, which works the same everywhere.

   `overflow:hidden` for the duration stops a scrollbar flickering in and out while the height
   passes through the max-height threshold; scrollTop is preserved because setting an explicit
   height on a scrolled container would otherwise reset it. Cleanup runs from a plain setTimeout
   as well as transitionend - rAF is paused in a background tab, and a card left with an inline
   height would then never resize again. */
let mgPendingH=null, mgPinTimer=null;
/* USER FIRST, THEN THE SYSTEM: this gated nine animation sites and asked only the
   OS - no way to calm the app on a machine whose OS says nothing. The preference can
   only ADD quiet, never remove it: a system asking for reduced motion is honoured even
   with the box unticked - an accessibility request is not ours to overrule. */
function mgReduceMotion(){
  try{
    if(lsGet("pbMotionOff")==="1") return true;
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  }catch(e){ return false; }
}
/* PIN BEFORE THE STATE CHANGES: `toggle` fires asynchronously, so between the element
   opening and the handler running the browser has laid out AND PAINTED the full new
   height - snapping back then reads as expand-snap-animate, a stutter at the start of
   every open. Pinned first, the expanded state is never painted at all. */
function mgPinCard(){
  const card=modalCard;
  if(card==null || mgReduceMotion()) return null;
  const h=card.getBoundingClientRect().height;
  mgPendingH=h;
  card.style.transition="none";
  card.style.overflow="hidden";
  card.style.height=h+"px";
  /* Failsafe only. A pointerdown that never becomes a toggle (dragged off the summary, or the
     dialog re-rendered underneath) would otherwise leave the card stuck at a fixed height.
     Generous, because expiring early just restores the old jumpy behaviour for that one click. */
  clearTimeout(mgPinTimer);
  mgPinTimer=setTimeout(mgReleaseCard,1000);
  return h;
}
/* THE LIVE HEIGHT RUN, so a new one can kill the last. Every run arms two hooks - a
   transitionend listener and a failsafe timeout - and uncancelled they outlive the run that
   made them: toggle a second section inside the window and the FIRST run's failsafe fires
   part-way into the SECOND animation, mgReleaseCard clears height and transition, and the
   card jumps the rest of the way in a single frame. */
let mgHeightRun=null;
function mgStopHeightRun(){
  const r=mgHeightRun;
  if(!r) return;
  mgHeightRun=null;
  r.dead=true;                       // a start() still queued behind rAF gives up quietly
  clearTimeout(r.timer);
  if(r.onEnd) r.card.removeEventListener("transitionend", r.onEnd);
}
function mgReleaseCard(){
  clearTimeout(mgPinTimer);
  mgStopHeightRun();
  const card=modalCard;
  if(!card) return;
  card.style.transition=""; card.style.height=""; card.style.overflow="";
  mgPendingH=null;
}
/** Accordion: opening one section shuts its siblings - with two or three open, the one
 *  just expanded arrived below the fold. One open section keeps the dialog readable and
 *  usually scroll-free. Closes SILENTLY (`_accordion` guard) so the siblings' own toggle
 *  handlers do not each animate the height; the opener measures the finished state and
 *  animates once. */
function mgAccordion(opened, selector, scope){
  if(!opened || !opened.open) return;
  (scope||document).querySelectorAll(selector).forEach(d=>{
    if(d===opened || !d.open) return;
    d._accordion=true;
    d.open=false;
    d._accordion=false;
  });
}
function animateModalHeightFrom(before){
  const card=modalCard;
  if(card==null || before==null || mgReduceMotion()){ mgPendingH=null; return; }
  clearTimeout(mgPinTimer);
  mgStopHeightRun();                            // whatever was in flight is not this run
  // The card itself no longer scrolls - its middle section does. See mountModalBody().
  const scroller=card.querySelector(".modal-body");
  const keepScroll=scroller?scroller.scrollTop:0;
  /* Measure the target while pinned: release to auto, read, put the start height straight back.
     All three happen in one task with no yield, so nothing is painted in between - max-height
     still applies during the read, so `after` is the clamped height the card will really take. */
  card.style.height="auto";
  const after=card.getBoundingClientRect().height;
  card.style.height=before+"px";
  if(Math.abs(after-before)<2){ mgReleaseCard(); return; }
  void card.offsetHeight;                       // commit the start height before transitioning
  const run={dead:false, timer:null, card:card, onEnd:null};
  mgHeightRun=run;
  const done=()=>{
    if(run.dead) return;
    mgReleaseCard();                            // which stops this run, listener and timer both
    if(scroller) scroller.scrollTop=keepScroll;
  };
  /* THE CARD'S OWN HEIGHT, nothing else. transitionend BUBBLES, and the twisty rotating on
     an accordion row inside this card otherwise ends the run early - unnoticed, because the
     easing is front-loaded, but it leaves the failsafe armed with nothing left to guard. */
  run.onEnd=e=>{ if(e.target===card && e.propertyName==="height") done(); };
  /* Start on the NEXT frame: a shut <details>' content has never been laid out, so the
     first expand pays for all of it exactly where the transition should begin - the
     first frame lands late and the motion hitches. A frame's wait moves that work before
     the height starts changing; the card is pinned throughout. rAF pauses in a background
     tab, so a timeout runs the same guarded start. */
  let started=false;
  const start=()=>{
    if(started||run.dead) return;
    started=true;
    card.style.transition="height .2s "+E_EASE;
    card.style.height=after+"px";
    card.addEventListener("transitionend",run.onEnd);
    run.timer=setTimeout(done,320);             // counts from the real start, not from the pin
  };
  requestAnimationFrame(start);
  setTimeout(start,32);
}
function mgDomMove(fromEl,toEl){
  const fi=mgSiblingIdx(fromEl), ti=mgSiblingIdx(toEl);
  if(fi<0||ti<0) return;
  mgFlip(fromEl.parentNode,()=>{
    if(fi<ti) toEl.parentNode.insertBefore(fromEl, toEl.nextSibling);
    else toEl.parentNode.insertBefore(fromEl, toEl);
  });
}
function mgMoveCatOrder(fromKey,toKey){
  const from=catOrder.indexOf(fromKey), to=catOrder.indexOf(toKey);
  if(from<0||to<0||from===to) return false;
  catOrder.splice(to,0,catOrder.splice(from,1)[0]);
  return true;
}
/** Move a card into another category by dropping it there. A category is ordinary card
 *  data, written like every single-field edit: a PARTIAL override for a built-in - and
 *  dragging a card back to where the catalog put it removes the override, clearing the
 *  "edited" badge; customs own their `c` directly. Placed at the END of the target in
 *  pack.cardOrder: dropping into a container appends - the one rule that reads the same
 *  collapsed, empty or open; favourites still rise within the category by themselves.
 *  `findCard` still reports the OLD category until rebuildCards() runs - exactly what
 *  the position scan wants: every other card's `c` is untouched. */
function mgMoveCardToCategory(id, catKey){
  if(!id || !catKey || catKey==="__orphan" || !CATS[catKey]) return false;
  const m=findCard(id);
  if(!m || m.c===catKey) return false;
  if(m._custom){
    const ix=(pack.custom||[]).findIndex(x=>x&&x.id===id);
    if(ix<0) return false;
    pack.custom[ix].c=catKey;
  } else {
    const base=baseCard(id);
    if(!pack.overrides) pack.overrides={};
    const o=Object.assign({},pack.overrides[id]||{});
    if(base && base.c===catKey) delete o.c; else o.c=catKey;
    if(Object.keys(o).length) pack.overrides[id]=o; else delete pack.overrides[id];
  }
  ensureCardOrder();
  const from=pack.cardOrder.indexOf(id);
  if(from>=0){
    pack.cardOrder.splice(from,1);
    let at=-1;
    pack.cardOrder.forEach((oid,i)=>{
      const om=findCard(oid);
      if(om && om.id!==id && om.c===catKey) at=i;
    });
    pack.cardOrder.splice(at+1,0,id);
    cardOrderTouched();
  }
  return true;
}
function mgClearDropTarget(){
  document.querySelectorAll(".mg-cat.mg-drop").forEach(el=>el.classList.remove("mg-drop"));
}
/** Band for an intent row: hidden sinks, favourites lead, the rest follow - the order the
 *  Library already renders and the panel already sorts. Read live, never from the attribute. */
function mgIntentBand(iid){
  const i=intentIdxFromId(iid);
  if(i<0) return "x";
  if(isIntentHiddenIdx(i)) return "h";
  return isIntentFavourite(iid)?"f":"r";
}
/** Same-band only, like mgMoveCardOrder. intentOrder holds INDICES, so the ids coming off the
 *  rows are resolved to indices first and their positions in the order array are what move. */
function mgMoveIntentOrder(fromId,toId){
  if(mgIntentBand(fromId)!==mgIntentBand(toId)) return false;
  const fi=intentIdxFromId(fromId), ti=intentIdxFromId(toId);
  if(fi<0||ti<0) return false;
  const from=intentOrder.indexOf(fi), to=intentOrder.indexOf(ti);
  if(from<0||to<0||from===to) return false;
  intentOrder.splice(to,0,intentOrder.splice(from,1)[0]);
  return true;
}
/** Same-band only, and the band is checked against live state rather than the rendered
 *  attribute, so a stale row cannot smuggle a favourite past a plain entry. */
function mgMoveCardOrder(fromId,toId){
  ensureCardOrder();
  const a=findCard(fromId), b=findCard(toId);
  if(!a||!b||mgCardBand(a)!==mgCardBand(b)) return false;
  const from=pack.cardOrder.indexOf(fromId), to=pack.cardOrder.indexOf(toId);
  if(from<0||to<0||from===to) return false;
  pack.cardOrder.splice(to,0,pack.cardOrder.splice(from,1)[0]);
  cardOrderTouched();   // a reorder keeps the length - see cardOrderPos
  return true;
}
addEventListener("pointerdown",e=>{
  if(e.button!==0 || !modalOpen() || !e.target.closest) return;
  /* The row is the handle, minus everything that has its own job - the same rule the card list
     uses for its header. A card row is grabbable across its whole width including the title,
     which is plain text; a category row still excludes its rename field through the selector
     below. preventDefault() at the end is what stops a drag from starting a text selection. */
  if(e.target.closest("input,button,select,textarea,a")) return;
  const crow=e.target.closest(".mg-cat-row[data-crow]");
  const mrow=e.target.closest(".manage-row.mg-card[data-cardrow]");
  const irow=e.target.closest(".manage-row[data-introw]");
  if(crow) mgDrag={kind:"cat", key:crow.getAttribute("data-crow"), el:crow.closest(".mg-cat")};
  else if(mrow) mgDrag={kind:"card", key:mrow.getAttribute("data-cardrow"), el:mrow};
  else if(irow) mgDrag={kind:"intent", key:irow.getAttribute("data-introw"), el:irow};
  else return;
  mgClearDropTarget();   // a drag cancelled by the system never reaches pointerup; start clean
  mgDrag.x=e.clientX; mgDrag.y=e.clientY; mgDrag.moved=false; mgDrag.dropCat=null;
  try{ e.preventDefault(); }catch(_){}
});
addEventListener("pointermove",e=>{
  if(!mgDrag) return;
  if(!mgDrag.moved){
    if(Math.abs(e.clientX-mgDrag.x)+Math.abs(e.clientY-mgDrag.y)<5) return;
    mgDrag.moved=true;
    document.documentElement.classList.add("mgdrag");
    if(mgDrag.el) mgDrag.el.classList.add("dragging");
    try{ const s=window.getSelection&&window.getSelection(); if(s&&s.removeAllRanges) s.removeAllRanges(); }catch(_){}
  }
  // One swap at a time, and long enough to cover the 180ms FLIP - otherwise the next
  // elementFromPoint reads a row mid-transform and the pair trade places repeatedly.
  if(Date.now()-mgSwapLock<190) return;
  const under=document.elementFromPoint(e.clientX,e.clientY);
  if(!under||!under.closest) return;
  if(mgDrag.kind==="intent"){
    /* The simplest of the three: one flat list, no groups to cross and nothing to re-parent, so
       a reorder is the only gesture and it is live all the way. */
    const row=under.closest(".manage-row[data-introw]");
    if(!row||row===mgDrag.el) return;
    if(row.parentNode!==mgDrag.el.parentNode) return;
    if(row.getAttribute("data-band")!==mgDrag.el.getAttribute("data-band")) return;
    if(!mgMoveIntentOrder(mgDrag.key,row.getAttribute("data-introw"))) return;
    mgSwapLock=Date.now();
    mgDomMove(mgDrag.el,row);
    return;
  }
  if(mgDrag.kind==="cat"){
    const row=under.closest(".mg-cat-row[data-crow]");
    if(!row) return;
    const key=row.getAttribute("data-crow");
    if(key===mgDrag.key) return;
    /* Point at the header row but move the whole group, so an expanded category carries its
       cards with it - and so an open category's tall body is not itself a drop target. */
    const toEl=row.closest(".mg-cat");
    if(!toEl||toEl.parentNode!==mgDrag.el.parentNode) return;
    if(!mgMoveCatOrder(mgDrag.key,key)) return;
    mgSwapLock=Date.now();
    mgDomMove(mgDrag.el,toEl);
  } else {
    /* Crossing INTO another category is decided here and applied on RELEASE, unlike a
       reorder, which is live. Three reasons: the target is often collapsed (no row to
       slot into, nothing worth animating); re-parenting mid-gesture is how a drag loses
       its element; and the FLIP measures one container, not two. Highlight and commit
       once - you are dropping into a thing, not swapping with a neighbour. */
    const grp=under.closest(".mg-cat[data-cat]");
    const home=mgDrag.el.closest(".mg-cat[data-cat]");
    const gk=grp?grp.getAttribute("data-cat"):null;
    // "Uncategorised" is a rendering of cards whose category is gone, not a category - you can
    // drag OUT of it, never into it.
    if(grp && home && grp!==home && gk && gk!=="__orphan"){
      if(mgDrag.dropCat!==gk){
        mgClearDropTarget();
        grp.classList.add("mg-drop");
        mgDrag.dropCat=gk;
      }
      return;
    }
    if(mgDrag.dropCat){ mgClearDropTarget(); mgDrag.dropCat=null; }

    const row=under.closest(".manage-row.mg-card[data-cardrow]");
    if(!row||row===mgDrag.el) return;
    if(row.parentNode!==mgDrag.el.parentNode) return;          // reorder never leaves its category
    if(row.getAttribute("data-band")!==mgDrag.el.getAttribute("data-band")) return;
    if(!mgMoveCardOrder(mgDrag.key,row.getAttribute("data-cardrow"))) return;
    mgSwapLock=Date.now();
    mgDomMove(mgDrag.el,row);
  }
},{passive:true});
/* Named and bound to BOTH pointerup and pointercancel - every drag in the file carries
   the cancel half. A cancelled pointer (a touch taken by a browser gesture, a pointer lost
   to another window) otherwise strands three things: `html.mgdrag`, which puts
   user-select:none on the whole document; the row's `dragging` class; and a live mgDrag,
   so the global pointermove keeps reordering rows under a button nobody is holding. */
function endMgDrag(){
  if(!mgDrag) return;
  const {kind,moved,key,dropCat}=mgDrag;
  document.documentElement.classList.remove("mgdrag");
  if(mgDrag.el) mgDrag.el.classList.remove("dragging");
  mgClearDropTarget();
  mgDrag=null;
  if(!moved) return;
  /* A category change rewrites the card's data, not just an order array, so it needs the full
     round: rebuild, repaint the list and the pills (the counts moved), and re-render the tree
     because the row now belongs under a different parent. The target is opened first, so the
     card is visible where it landed rather than swallowed by a collapsed group. */
  if(kind==="card" && dropCat){
    if(mgMoveCardToCategory(key,dropCat)){
      savePack(); rebuildCards();
      recountMacros();
      mgOpen.add("cat:"+dropCat);
      render(); drawPills(); openManage();
      toast(t("Moved to")+" "+(CATS[dropCat]||dropCat));
    }
    return;
  }
  /* Persist once, at the end - the order arrays are mutated live so the rows follow the
     cursor, but a write per swap would be a write per 170ms of dragging. */
  if(kind==="cat"){ nsSet("CatOrder",JSON.stringify(catOrder)); drawPills(); }
  /* intentOrder is its own stored key, not part of the pack, and the PANEL has to be redrawn -
     it renders from the same array, so leaving it alone would show two different orders for the
     same list depending on which one you happened to be looking at. */
  else if(kind==="intent"){
    syncIntentOrder();
    drawIntentRail();
  }
  else savePack();
  render();
}
addEventListener("pointerup",endMgDrag);
addEventListener("pointercancel",endMgDrag);

/** Inline category creation at the foot of the tree. Same contract as the "+" pill in the
 *  header - type, Enter to accept, Esc or an empty blur to cancel - rather than a dialog for
 *  one text field. The row is appended to the tree itself so the new category appears where it
 *  will actually live, and the tree scrolls to it. */
function startMgCatAdd(){
  const tree=modalCard&&modalCard.querySelector(".mg-tree");
  if(!tree || tree.querySelector(".mg-cat-new")) return;
  const wrap=document.createElement("div");
  wrap.className="mg-cat mg-cat-new";
  wrap.innerHTML='<div class="mg-cat-row"><span class="mg-tw" aria-hidden="true">'+ICON_CHEVRON_R+'</span>'+
    '<input type="text" class="mg-cat-lab2" id="mgNewCat" placeholder="New category" '+
    'spellcheck="false" autocomplete="off" aria-label="New category name"></div>';
  tree.appendChild(wrap);
  tree.scrollTop=tree.scrollHeight;
  const inp=wrap.querySelector("#mgNewCat");
  if(!inp) return;
  let done=false;
  const finish=ok=>{
    if(done) return;
    done=true;
    const name=inp.value.trim();
    wrap.remove();
    if(!ok||!name) return;
    const key=ensureCustomCat(name);
    rebuildCards(); drawPills();
    mgOpen.add("cat:"+key);        // open it, so the "+" that adds its first card is right there
    openManage();
    toast("Category added");
  };
  inp.focus();
  inp.onkeydown=e=>{
    if(e.key==="Enter"){ e.preventDefault(); finish(true); }
    else if(e.key==="Escape"){ e.preventDefault(); finish(false); }
  };
  inp.onblur=()=>{ setTimeout(()=>{ if(document.activeElement!==inp) finish(true); }, 0); };
}

/* The screen's user-facing name is "LIBRARY". The identifiers - openManage, mg*,
   fromManage - keep their stem on purpose: code names track the code they touch, and
   "Manage" in the comments below is this function's own shorthand, not the label on the
   door. */
/** "Show all hidden (n)" for one of the two lists. Disabled at zero rather than absent: a
 *  control that vanishes teaches nothing, and its greyed "(0)" is the answer to the question
 *  that would otherwise send you hunting through the list for something that is not there. */
function tipShowHidden(kind,n){
  if(!n) return t("Nothing is hidden");
  return kind==="cards" ? t("Un-hide every hidden card") : t("Un-hide every hidden intent");
}
function mgShowHiddenBtn(kind,n){
  return '<button type="button" class="btn" data-show-hidden="'+esc(kind)+'"'+(n?"":" disabled")+
    ' title="'+esc(tipShowHidden(kind,n))+'">'+
    esc(t('Show all hidden'))+' ('+n+')</button>';
}
function openManage(){
  applyCatsToGlobal();

  /* Full intentOrder, minus deleted ones - hidden stay in place, greyed, with a closed eye.
     The removed filter matters here: Manage is the one surface that shows hidden rows, and
     without it a deleted intent would still be listed and re-editable from this dialog. */
  const mgGoneIntents=new Set(pack.intentRemoved||[]);
  /* Same banding every other surface uses - favourites lifted, hidden sunk, dragged
     order kept within bands. Manage read the raw intentOrder instead, so starring here
     moved nothing while the panel moved it to the top. Built here rather than from
     intentRows() on purpose: that helper drops rows with no label in the current
     language - right for a search surface, wrong for the screen where you would FIX one. */
  const mgIntentIdxs=intentOrder
    .filter(i=>!mgGoneIntents.has(intentIdAt(i)))
    .map((i,n)=>({i,n}))
    .sort((a,b)=>{
      const ha=isIntentHiddenIdx(a.i)?1:0, hb=isIntentHiddenIdx(b.i)?1:0;
      if(ha!==hb) return ha-hb;
      const fa=isIntentFavourite(intentIdAt(a.i))?0:1, fb=isIntentFavourite(intentIdAt(b.i))?0:1;
      if(fa!==fb) return fa-fb;
      return a.n-b.n;
    })
    .map(x=>x.i);
  const intentListRows=mgIntentIdxs.map(i=>{
    const iid=intentIdAt(i);
    const hid=isIntentHiddenIdx(i);
    const fav=isIntentFavourite(iid);
    const badge=(intentIsCustom(i)||intentIsOverridden(i))?' <span class="cbadge ed" title="'+esc(t("Changed or added by you, not what the catalog shipped"))+'">'+esc(t("mod"))+'</span>':"";
    const catLab=primaryCatLabel(i)||"";
    const favTip=fav?"Remove from Favourites":"Add to Favourites";
    /* Hide toggles; delete is separate and lives only here. Both built-in and custom intents
       can be deleted now - a built-in goes to pack.intentRemoved and comes back on Reset. */
    const hideShow=hid
      ?'<button type="button" data-show-intent="'+esc(iid)+'" title="Show this intent again" aria-label="Show this intent again">'+ICON_EYE_SHUT+'</button>'
      :'<button type="button" data-hide-intent="'+esc(iid)+'" title="Hide this intent: it greys out and drops to the bottom" aria-label="Hide this intent">'+ICON_EYE_OPEN+'</button>';
    const trash='<button type="button" class="danger mg-trash" data-remove-intent="'+esc(iid)+'" title="Delete this intent" aria-label="Delete this intent">'+ICON_TRASH+'</button>';
    /* data-introw so mgRefreshAround() can find this row again after openManage() has replaced
       every element - the same job data-cardrow does in the tree. */
    /* data-band mirrors the card rows: a drag may only swap inside its own band, so hidden
       entries cannot be dragged up among the live ones and a favourite cannot be dragged out of
       the favourites - the same rule moveIntent() enforces for the panel, so the two surfaces
       cannot disagree about what order means. Checked again against live state in
       mgMoveIntentOrder, so a stale attribute cannot smuggle a row past its band. */
    return '<div class="manage-row'+(hid?" is-hidden":"")+'" data-introw="'+esc(iid)+'"'+
      ' data-band="'+(hid?"h":(fav?"f":"r"))+'"><span>'+esc(intentNavName(i)||"")+badge+
      (catLab?' <span style="color:var(--dim);font:11px var(--mono)">'+esc(catLab)+'</span>':'')+'</span>'+
      '<span class="cacts">'+
        '<button type="button" data-edit-intent-mg="'+i+'" title="Edit intent" aria-label="Edit intent">'+ICON_EDIT+'</button>'+
        hideShow+
        trash+
        '<button type="button" class="star-btn'+(fav?" on":"")+'" data-fav-intent-mg="'+esc(iid)+'" title="'+esc(favTip)+'" aria-label="'+esc(favTip)+'" aria-pressed="'+(fav?"true":"false")+'">'+(fav?ICON_STAR_ON:ICON_STAR_OFF)+'</button>'+
      '</span></div>';
  }).join("")||'<div class="manage-empty">'+esc(t("No intents."))+'</div>';

  const catCount=Object.keys(CATS).length;
  /* Hiding is the one personal act with no way back at scale: hidden things are
     invisible BY DESIGN, accumulate quietly, and cannot be undone by finding them -
     finding them is the problem; the only other cure, Clear local memory, is a cliff
     where a step was wanted. The count is IN the label, so a greyed "(0)" answers "did I
     hide anything?" by itself. Not danger-red: showing again destroys nothing.
     NO equivalent for favourites, weighed and declined: a star is visible, leads every
     list, and is curated over months - bulk-erasing it is a real loss with no undo,
     against a need that almost never arises. */
  const hiddenCardCount=(cards||[]).filter(m=>m&&m._hidden).length;
  const hiddenIntentCount=mgIntentIdxs.filter(i=>isIntentHiddenIdx(i)).length;

  const mgBody=''+
    mgSec("catmac","Categories & cards",
      mgCatTree()+
      '<div class="cat-new" style="margin-top:8px">'+
        '<button type="button" class="btn primary" id="mgAddCat" title="Create a new category">New category</button>'+
        mgShowHiddenBtn("cards",hiddenCardCount)+'</div>',
      catalogCountsLine("{MACROS} in {CARDS}, {CATEGORIES}",
        (cards||[]).length, totalMacroCount(), 0, catCount))+
    mgSec("intents","Intents",
      '<div class="mg-intents">'+intentListRows+'</div>'+
      '<div class="cat-new" style="margin-top:8px">'+
        '<button type="button" class="btn primary" id="mgAddIntent" title="Write a new clause for {INTENT}">New intent</button>'+
        mgShowHiddenBtn("intents",hiddenIntentCount)+'</div>',
      mgIntentIdxs.length)+
    /* Its own section, between the two lists it belongs with and the library-wide operations
       below. It is content in exactly the way categories, cards and intents are - the words a
       desk uses for who it is talking to - not a setting about the catalog file. */
    mgSec("who","ROLE suggestions",
      '<div class="mf" style="margin-bottom:0">'+
        '<input type="text" id="mgWho" spellcheck="false" autocomplete="off" '+
          'placeholder="booker, customer, account holder" '+
          'title="Notches for the ROLE wheel, comma-separated; blanks and repeats are dropped" '+
          'value="'+esc(whoOptions().join(", "))+'">'+
      '</div>',
      whoOptions().length)+
    /* Catalog and Reset merged. Everything here acts on the whole library rather than on one
       entry - what is loaded, taking a copy out, bringing one in, and throwing the lot away -
       which is exactly the line that separates it from the two sections above. Not called
       "administrative" or "compliance": nothing is gated and nobody is being administered. */
    mgSec("data","Catalog & data",
      (function(){
        /* Report what is actually APPLIED, not what happens to be stored. A catalog can be live
           without a stored copy (accepted before 1.0's store existed, or a failed write), and
           showing "no catalog loaded" over 199 visible cards is worse than useless. */
        const applied=(typeof E_CATALOG_NAME!=="undefined" && E_CATALOG_NAME) ? E_CATALOG_NAME : "";
        if(!applied && !(cards||[]).length)
          return '<p class="manage-empty" style="margin-top:0;color:var(--dim)">No catalog loaded - Etiuda is empty.</p>';
        const ver=(E_CATALOG_VERSION!=null)?' · '+esc(catalogVersionLabel(E_CATALOG_VERSION)):'';
        /* MACROS, not "blocks": a macro is one copyable segment, a card is the container
           holding one or more, and every count a user sees counts macros. No "Loaded:"
           ceremony - the green line and bold name already say it, and the extra words cost
           the line its fit at 550px. The date stays: it is the one thing here you cannot
           work out by looking at the catalog. */
        return '<p class="manage-empty" style="margin-top:0;color:var(--go)"><b>'
          +esc(applied||"Unnamed catalog")+'</b>'+ver
          +' · '+esc(catalogCountsLine("{CARDS} · {MACROS} · {INTENTS} · {CATEGORIES}",
              (cards||[]).length, totalMacroCount(), mgIntentIdxs.length, catCount))+'</p>';
      })()+
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">'+
        '<button type="button" class="btn primary" id="mgImportCatalog" title="Load a catalog file from disk: it is read as data, never executed. It replaces what is loaded now, and nothing on disk changes.">Import catalog…</button>'+
        '<button type="button" class="btn" id="mgExportCatalog" title="Save everything loaded now as a catalog file, your edits merged in">Export catalog…</button>'+
        '<button type="button" class="btn" id="mgExportHtml" title="Bake the catalog into one HTML file that needs nothing beside it">Build integrated copy…</button>'+
        /* No "Load sample" here. The demo belongs where somebody has nothing yet - the empty
           card list and the first-run invite, which appear only when there is nothing to
           lose. In this row it sat among Export, Import and Build, all things you do WITH
           your catalog, and read as a fourth - while actually replacing the catalog. */
      '</div>'+
      /* Only where a handle can exist, and only once one does: an empty promise to watch
         something is worse than no row at all. */
      ((eWatchSupported()&&eWatchName())
        ? '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:10px">'
          +'<span style="color:var(--dim)">'+esc(t("Watching"))+' <code>'+esc(eWatchName())+'</code></span>'
          +'<button type="button" class="btn" id="mgWatchCheck" title="Read that file again and offer it if it has changed">'+esc(t("Check for updates"))+'</button>'
          +'<button type="button" class="btn" id="mgWatchStop">'+esc(t("Stop watching"))+'</button>'
          +'</div>'
        : '')+
      // Set apart by a rule: the three above are reversible, these two are not. Same flex row
      // as the one above it - a block container gives adjacent buttons no gap at all.
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:14px;padding-top:12px;border-top:1px solid var(--line)">'+
        '<button type="button" class="btn danger" id="mgWipe" title="Forget every personal card, edit, hide, rename and layout choice in this browser; the loaded catalog stays. It is also how you bring back anything you deleted.">Clear local memory…</button>'+
        '<button type="button" class="btn danger" id="mgEject" title="Put the catalog down and restart empty. Your cards, edits, name, theme and layout all stay.">Eject catalog…</button>'+
      '</div>')+
    '';
  openDialog({
    title: "Library",
    /* Every section here is about one catalog, and the only place that says WHICH is inside
       "Catalog & data" - the last fold, shut unless you opened it. So the heading carries the
       name for the same reason the editors carry theirs: it scopes the screen you are on.
       Nothing when there is no catalog; the empty state inside says that better. */
    name: ()=>(typeof E_CATALOG_NAME!=="undefined" && E_CATALOG_NAME) ? E_CATALOG_NAME : "",
    body: mgBody,
    actions: '<button type="button" class="btn" id="mgClose">Close</button>',
    wire: wireManage
  });
  function wireManage(){
  $("#mgClose").onclick=closeModal;
  $("#mgAddIntent").onclick=()=>openIntentEditor(null, true);
  $("#mgAddCat").onclick=()=>startMgCatAdd();
  $("#mgExportCatalog").onclick=()=>exportCatalog();
  /* Commit on change (blur or Enter), not per keystroke - a half-typed word is not a list.
     Matching the catalog's own list stores null rather than a copy, so the entry keeps
     following the catalog and a later import is not shadowed by a stale duplicate. */
  if($("#mgWho")) $("#mgWho").onchange=function(){
    const next=normWhoList(this.value);
    pack.who = (next.join("\u0000")===WHO_BASE.join("\u0000")) ? null : next;
    savePack();
    this.value=whoOptions().join(", ");     // show what was actually kept
    syncRoleDrum();   // the drum turns over the new list
  };
  if($("#mgExportHtml")) $("#mgExportHtml").onclick=()=>exportHtml();
  $("#mgImportCatalog").onclick=importCatalogHere;
  if($("#mgWatchCheck")) $("#mgWatchCheck").onclick=()=>eCheckWatchedFile(true);
  if($("#mgWatchStop")) $("#mgWatchStop").onclick=()=>{
    eWatchClear().then(()=>toast(t("No longer watching that file.")));
  };
  // The wipe itself lives in clearLocalMemory() - one code path shared with Maintenance.
  $("#mgWipe").onclick=clearLocalMemory;
  $("#mgEject").onclick=ejectCatalog;
  /* Remember which groups are open, so the re-render after every edit does not shut them.
     Written on toggle rather than read back later because openManage() replaces the nodes. */
  wireFolds(modalCard,"details[data-mg]","details.manage-sec",
    d=>{ const k=d.getAttribute("data-mg"); if(d.open) mgOpen.add(k); else mgOpen.delete(k); });
  /* Expand / collapse a category. Only this button toggles - clicking the name edits it, and
     the row itself is a drag handle, so there is no ambiguous "click anywhere" target. */
  modalCard.querySelectorAll("[data-toggle]").forEach(btn=>{
    btn.onclick=e=>{
      e.preventDefault(); e.stopPropagation();
      // pinned like the sections; catToggle does its own measuring inside modalResize
      mgPinCard();
      catToggle(btn.closest(".mg-cat"), btn.getAttribute("data-toggle"));
    };
  });

  // ---- card rows in the category tree
  /* Role toggles. Both repaint the pills and the cards, because the rings they control are on
     screen behind the dialog - the point of the toggle is watching that change. */
  modalCard.querySelectorAll("[data-role-always]").forEach(btn=>{
    btn.onclick=()=>{
      const k=btn.getAttribute("data-role-always");
      mgRefreshAround(()=>{
        setCatAlways(k,!isAlwaysCat(k));
        rebuildCards(); drawPills(); render();
        toast((CATS[k]||k)+" "+t(isAlwaysCat(k)?"is now a supporting category"
                                       :"is an ordinary category"));
      });
    };
  });
  modalCard.querySelectorAll("[data-add-card]").forEach(btn=>{
    // New cards are created inside a category, so the editor needs no category picker
    btn.onclick=()=>openCardEditor(null, btn.getAttribute("data-add-card"), true);
  });
  modalCard.querySelectorAll("[data-edit-card]").forEach(btn=>{
    btn.onclick=()=>openCardEditor(btn.getAttribute("data-edit-card"), null, true);
  });
  modalCard.querySelectorAll("[data-editcat]").forEach(btn=>{
    btn.onclick=()=>openCategoryEditor(btn.getAttribute("data-editcat"));
  });
  // hideCard is the same toggle the card uses, so the un-favourite rule cannot drift apart
  modalCard.querySelectorAll("[data-hide-card],[data-show-card]").forEach(btn=>{
    btn.onclick=()=>{
      /* No render()/openManage() after this: mgRefreshAround() rebuilds the dialog itself,
         and a SECOND rebuild replaced every row the animation had just set up -
         cancelling it and losing the scroll. The bare render() that sat here was the
         same mistake one level down: hideCard() already ends in render(). Every mutator
         called from Manage repaints what it changed - do not add a repaint after one. */
      mgRefreshAround(()=>hideCard(btn.getAttribute("data-hide-card")||btn.getAttribute("data-show-card")));
    };
  });
  modalCard.querySelectorAll("[data-remove-card]").forEach(btn=>{
    btn.onclick=()=>{ const id=btn.getAttribute("data-remove-card");
      // Confirm FIRST, outside the animation: a cancelled delete must not re-render anything.
      if(!findCard(id)) return;
      mgRefreshAround(()=>{ removeCard(id); }); };   // removeCard ends in rebuildCards()
  });
  modalCard.querySelectorAll("[data-fav-card]").forEach(btn=>{
    btn.onclick=()=>mgRefreshAround(()=>toggleFavourite(btn.getAttribute("data-fav-card")));
  });
  modalCard.querySelectorAll("[data-edit-intent-mg]").forEach(btn=>{
    btn.onclick=()=>openIntentEditor(+btn.getAttribute("data-edit-intent-mg"), true);
  });
  modalCard.querySelectorAll("[data-fav-intent-mg]").forEach(btn=>{
    // Starring lifts an intent to the top of the list, so it animates like every other move.
    btn.onclick=()=>mgRefreshAround(()=>toggleIntentFavourite(btn.getAttribute("data-fav-intent-mg")));
  });
  /* Both use setIntentHidden, so Manage and the panel cannot drift apart on the rule, and both
     go through mgRefreshAround for the same reason the star does: hiding sends a row to the
     bottom of the list, which is the longest move Manage makes and was the one that jumped. */
  /* Un-hide every hidden card, or every hidden intent. No confirm: it destroys nothing,
     and each one can be hidden again with the eye it came from. Routed through the SAME
     per-item functions the eye buttons call - hideCard also clears the runtime flag,
     setIntentHidden also touches the order - reproducing either here is how paths drift. */
  modalCard.querySelectorAll("[data-show-hidden]").forEach(btn=>{
    btn.onclick=()=>{
      const kind=btn.getAttribute("data-show-hidden");
      if(kind==="cards"){
        const ids=(cards||[]).filter(m=>m&&m._hidden).map(m=>m.id);
        if(!ids.length) return;
        ids.forEach(id=>hideCard(id));            // a toggle, and every one of these IS hidden
        toast(ids.length===1?t("1 card shown again")
                    :t("{N} cards shown again").replace("{N}",ids.length));
      }else{
        const ids=(pack.intentHidden||[]).slice();
        if(!ids.length) return;
        ids.forEach(id=>setIntentHidden(id,false));
        toast(ids.length===1?t("1 intent shown again")
                    :t("{N} intents shown again").replace("{N}",ids.length));
      }
      openManage();
    };
  });
  modalCard.querySelectorAll("[data-hide-intent]").forEach(btn=>{
    btn.onclick=()=>mgRefreshAround(()=>setIntentHidden(btn.getAttribute("data-hide-intent"), true));
  });
  modalCard.querySelectorAll("[data-show-intent]").forEach(btn=>{
    btn.onclick=()=>mgRefreshAround(()=>setIntentHidden(btn.getAttribute("data-show-intent"), false));
  });
  modalCard.querySelectorAll("[data-remove-intent]").forEach(btn=>{
    btn.onclick=()=>{ if(removeIntent(btn.getAttribute("data-remove-intent"))) openManage(); };
  });
  /* One deletion path for categories everywhere: removeCategory() owns the empty-only rule,
     the built-in / custom split, so the pill and this button cannot
     disagree about what is deletable. */
  modalCard.querySelectorAll("[data-delcat]").forEach(btn=>{
    btn.onclick=e=>{
      e.preventDefault(); e.stopPropagation();
      const k=btn.getAttribute("data-delcat");
      if(cardCounts[k]){ toast("Move or delete cards in this category first"); return; }
      if(!ask("Delete this empty category?\n\nA Reset restores it from the catalog.")) return;
      if(removeCategory(k)){ mgOpen.delete("cat:"+k); drawPills(); render(); openManage(); }
    };
  });
  }
}

// ---- Macros JSON (compliance access / backup) --------------------------------
// Format v1 pretty-printed JSON (editable in Notepad / any text editor):
// {
//   "format": 1,
//   "kind": "playbook-cards",
//   "exported": "ISO date",
//   "cards": [
//     { "id","c","t","en","pl", optional: text fields per cardStorageKeys() - today
//       "k","note","notePl","tPl" - plus "lockLang","alt","seq","firstOnly","paxVoc",
//       "allIntents","intentTop","intents" }
//   ]
// }
// Flag fields are 0/1. intents: numbers (base index) and/or strings ("i:0").
// Legacy kind "playbook-quality-cards" is still accepted on import.
function cardToExportPlain(m){
  // Effective wording only (local edits already merged into m; no runtime badges)
  const o={
    id:m.id||("b:"+(m.c||"open")+":"+(m.t||"Untitled")),
    c:m.c||"open",
    t:m.t||"",
    en:m.en||"",
    pl:m.pl||""
  };
  /* Every optional translation the table knows about; the required keys are written above. */
  cardStorageKeys().forEach(f=>{
    if(cardRequiredKeys().indexOf(f)>-1) return;
    if(m[f]) o[f]=m[f];
  });
  CARD_PLAIN_FIELDS.forEach(f=>{ if(m[f]) o[f]=m[f]; });
  if(m.alt) o.alt=1;
  if(m.seq) o.seq=1;
  if(m.firstOnly) o.firstOnly=1;
  // 0 is meaningful here, so this writes whenever the flag is SET rather than when it is true.
  if(m.paxVoc!=null) o.paxVoc=(+m.paxVoc)?1:0;
  if(m.allIntents) o.allIntents=1;
  if(m.intentTop) o.intentTop=1;
  if(Array.isArray(m.intents)&&m.intents.length) o.intents=m.intents.slice();
  return o;
}
/* One export, and it writes a full catalog - see exportCatalog. The cards-only
   "playbook-cards" kind is still accepted on import, so pre-1.0 files keep working. */
function truthyFlag(v){
  return v===1||v===true||v==="1"||v==="true";
}
function isMacrosJsonKind(kind){
  // "playbook-catalog" is the 1.0 format; the two older kinds are pre-1.0 cards-only files
  return kind==null||kind==="playbook-catalog"||kind==="playbook-cards"||kind==="playbook-quality-cards";
}
/** Validation split out of the text parser so a catalog can reuse it on already-parsed data. */
function parseMacrosData(data){
  let items=null;
  if(Array.isArray(data)) items=data;
  else if(data&&typeof data==="object"&&Array.isArray(data.cards)) items=data.cards;
  else throw new Error("expected { cards: [...] } or an array of cards");
  if(data&&typeof data==="object"&&!Array.isArray(data)&&data.kind!=null&&!isMacrosJsonKind(data.kind)){
    throw new Error("unexpected kind (want playbook-cards)");
  }
  if(data&&typeof data==="object"&&!Array.isArray(data)&&data.format!=null&&+data.format!==1){
    throw new Error("unsupported format version "+data.format);
  }
  const out=[];
  items.forEach((rawM,bi)=>{
    if(!rawM||typeof rawM!=="object") throw new Error("card "+(bi+1)+": not an object");
    const title=String(rawM.t!=null?rawM.t:(rawM.title!=null?rawM.title:"")).trim();
    const cat=String(rawM.c!=null?rawM.c:(rawM.category!=null?rawM.category:"open")).trim()||"open";
    const en=String(rawM.en!=null?rawM.en:"");
    const pl=String(rawM.pl!=null?rawM.pl:"");
    if(!title) throw new Error("card "+(bi+1)+": title (t) is required");
    /* ONLY THE PRIMARY IS REQUIRED, the rule the editor states and the reader relies on: a
       missing translation falls back (see cardLang). Demanding both here refused a file this
       app had just written, since a card with no Polish is exported with an empty one. */
    if(!en.trim()) throw new Error("card "+(bi+1)+' ("'+title+'"): English (en) is required');
    let id=String(rawM.id!=null?rawM.id:"").trim();
    if(!id) id="b:"+cat+":"+title;
    const entry={id,c:cat,t:title,en,pl};
    /* A pin names a language or it does not exist: anything else would silence a card in a
       language nothing can select. */
    const lk=String(rawM.lockLang!=null?rawM.lockLang:"").trim();
    if(lk==="en"||lk==="pl") entry.lockLang=lk;
    /* Optional translations, straight off the table - the required keys are read above. A key
       missing from the table is dropped here, which is the whitelist working as intended. */
    cardStorageKeys().forEach(f=>{
      if(cardRequiredKeys().indexOf(f)>-1) return;
      let v=rawM[f];
      if(v==null && CARD_KEY_ALIAS[f]!=null) v=rawM[CARD_KEY_ALIAS[f]];
      v=String(v!=null?v:"").trim();
      if(v) entry[f]=v;
    });
    if(truthyFlag(rawM.alt)) entry.alt=1;
    if(truthyFlag(rawM.seq)) entry.seq=1;
    if(truthyFlag(rawM.firstOnly)) entry.firstOnly=1;
    if(rawM.paxVoc!=null) entry.paxVoc=truthyFlag(rawM.paxVoc)?1:0;
    if(truthyFlag(rawM.allIntents)) entry.allIntents=1;
    if(truthyFlag(rawM.intentTop)) entry.intentTop=1;
    if(Array.isArray(rawM.intents)&&rawM.intents.length){
      entry.intents=rawM.intents.map(x=>{
        if(typeof x==="number"&&Number.isFinite(x)) return x;
        const s=String(x).trim();
        if(/^\d+$/.test(s)) return +s;
        return s;
      }).filter(x=>x!==""&&x!=null);
    }
    out.push(entry);
  });
  // Stable ids if duplicates
  const seen={};
  out.forEach(m=>{
    let id=m.id;
    if(!seen[id]){ seen[id]=1; return; }
    let n=2, cand;
    do{ cand=id+"~"+n; n++; }while(seen[cand]);
    seen[cand]=1;
    m.id=cand;
  });
  return out;
}
/* ---- one catalog format, one export, one import -----------------------------------------
   A catalog carries everything Etiuda has no content of its own for: cards, intents,
   categories and quick facts. Export writes it; Import reads it; the auto-load path reads the
   same file. The file is `.js` only because that is the one envelope a page opened from
   file:// can read on its own (measured blocked for .json on Firefox, Chrome and Edge alike).
   The payload inside is plain JSON, and **import parses it, never executes it** - so the only
   path that ever runs catalog code is the sibling auto-load, which the user consents to. */
/** The intents block of an export. Separate so the optional Polish topic can be omitted
 *  rather than written as undefined. */
function intentsExport(keep){
  const out={en:keep.map(i=>SW_EN[i]), pl:keep.map(i=>SW_PL[i]),
             cmt:keep.map(i=>SW_CMT[i]), topic:keep.map(i=>SW_TOPIC[i])};
  if(keep.some(i=>SW_TOPIC_PL[i])) out.topicPl=keep.map(i=>SW_TOPIC_PL[i]||"");
  if(keep.some(i=>SW_CMT_PL[i])) out.cmtPl=keep.map(i=>SW_CMT_PL[i]||"");
  return out;
}
function currentCatalog(nameOverride){
  rebuildCards();
  const cats={}, catsPl={};
  Object.keys(CATS).forEach(k=>{
    /* THE CANONICAL NAME, never what the screen currently shows: CATS holds whatever the
       interface language resolved to, and exporting that would write Polish into the field every
       engine reads. Both names come out the same way they go in - the user's own, else the
       catalog's - so an export round-trips whatever the category editor was showing. */
    cats[k]=(pack.catLabels && pack.catLabels[k]) || BASE_CATS[k]
            || (pack.customCats && pack.customCats[k]) || CATS[k];
    const plName=(pack.catLabelsPl && pack.catLabelsPl[k]) || CAT_LABELS_PL[k];
    if(plName) catsPl[k]=plName;
  });
  /* Card -> intent links are ids at runtime ("i:4", "ui:…"). Emit positional indices instead:
     in the exported catalog every intent becomes a base intent numbered by its position, so a
     custom intent that was "ui:34" is simply index 34 to whoever loads the file. */
  /* Removed intents must not travel - and dropping them renumbers everything after, so build
     the surviving list first and remap every card link through it. Exporting the raw SW_*
     arrays would have shipped deleted intents and left the surviving links pointing at the
     wrong ones. Removed cards need no filter: they never enter `cards` at all. */
  const keep=[];
  const goneIntents=new Set(pack.intentRemoved||[]);
  for(let i=0;i<SW_EN.length;i++){ if(!goneIntents.has(intentIdAt(i))) keep.push(i); }
  const remap={};
  keep.forEach((oldIdx,newIdx)=>{ remap[oldIdx]=newIdx; });
  /* Cards are emitted in pack.cardOrder - the user's own arrangement IS the catalog's
     order. NOT the rendered order: the on-screen list layers favourites, intent bands and
     search rank on top, and baking those in would mean starring a card moved its house. */
  const list=(cards||[]).slice()
    .sort((a,b)=>cardOrderIdx(a&&a.id)-cardOrderIdx(b&&b.id))
    .map(m=>{
    const o=cardToExportPlain(m);
    const idx=normalizeCardIntents(m)
      .map(id=>intentIdxFromId(id))
      .filter(i=>i>=0 && remap[i]!=null)
      .map(i=>remap[i]);
    if(idx.length) o.intents=idx; else delete o.intents;
    return o;
  });
  const out={
    format:1,
    kind:"playbook-catalog",
    // Named at export time, so the name and the filename are decided in one place
    name:(nameOverride||E_CATALOG_NAME||"Etiuda catalog"),
    exported:new Date().toISOString(),
    categories:cats,
    /* Absent, not empty, when the catalog has no Polish names - for the same reason topicPl is
       below: a catalog that never used them should not grow an empty map for having been
       exported by a newer engine. Deleted after the literal, since a key assigned undefined
       still exists. */
    categoriesPl:catsPl,
    /* Always written out, even when they match the engine defaults: an export is a
       complete, self-describing catalog - implicit roles make a file that only behaves
       because its keys happen to collide with the defaults, the exact trap this
       mechanism closes. Filtered to surviving categories, so a deleted one cannot be
       exported as a role. */
    /* The look of every surviving category, resolved through the same chain the screen
       uses - your pick, else the catalog's, else the name guess - and written out for
       all of them, for the same reason as the roles: complete and self-describing, never
       right-by-lucky-guess. Icon KEYS, never drawings: the pictures stay in the engine. */
    icons:(()=>{ const o={}; Object.keys(cats).forEach(k=>{ const v=catIconKey(k); if(v) o[k]=v; }); return o; })(),
    colors:(()=>{ const o={}; Object.keys(cats).forEach(k=>{ const v=catSlot(k); if(v>=0) o[k]=v; }); return o; })(),
    roles:{ always:ALWAYS_CATS.filter(k=>cats[k]),
            /* `opener` is not written: the role no longer exists. An older build reading this
               file simply finds none declared, which is the correct outcome - its cards carry
               their own "linked to every intent" flag either way. */ },
    /* No `cat`: nothing reads it to decide anything - it was written only so a catalog
       round-tripped, and an export from here does not carry it. */
    /* topicPl is ABSENT, not empty, when no intent has one - `{topicPl:undefined}` still
       creates the key, and a catalog that never used Polish topics should not grow an array of
       empty strings just for having been exported by a newer engine. */
    intents:intentsExport(keep),
    cards:list,
    // The effective list, so an export round-trips the user's edits like every other field
    who:whoOptions().slice(),
    /* An empty string is an answer - the panel was cleared on purpose - and only an unset
       one means "never written". Both read as unset here, so a deliberate blank arrived at
       the next desk as the built-in paragraph. */
    facts:(pack.facts!=null)?pack.facts:FACTS
  };
  /* An edition number round-trips unchanged - bumping it is the author's call, not the
     export's. Taken from the applied catalog, which is the only place that knows it: the
     live SW arrays and M carry content, not metadata. */
  if(E_CATALOG_VERSION!=null) out.version=E_CATALOG_VERSION;
  if(!Object.keys(out.categoriesPl).length) delete out.categoriesPl;
  return out;
}
/* Filename from the catalog's name. Accents are folded rather than dropped (so "Zażółć" gives
   "zazolc", not "z"), and everything that is not a letter or digit becomes a hyphen - the
   intersection of what Windows, macOS and Linux all accept, since a catalog gets emailed
   around. Capped so a rambling name cannot produce a filename a filesystem refuses. */
/* Macros (copyable segments) in a raw catalog object, for previews of a file that is not loaded
   yet - the live app uses recountMacros() instead. Counts EN, which is the required language. */
function catalogMacroCount(c){
  return ((c&&c.cards)||[]).reduce((t,m)=>{
    if(!m||!m.en) return t;
    return t + (m.alt ? splitPartsRaw(m.en).length : 1);
  },0);
}
function catalogFileSlug(name){
  /* NFD splits a base letter from its accent, but only for letters that HAVE one. Polish ł is
     its own codepoint with nothing to strip, so it survived NFD and then became a hyphen -
     "Zażółć" came out "zazo-c". These are the Latin letters that need transliterating rather
     than decomposing; the rest of the alphabet is handled by NFD above. */
  const s=String(name||"")
    .normalize("NFD").replace(/[̀-ͯ]/g,"")
    /* Apostrophes are ELIDED, not separated: "John's" is one word and must slug to "johns".
       Letting the catch-all below turn it into a hyphen produced "max-s", which reads as a
       stray initial. Both the typographic and the typed form, since a name can arrive either
       way. */
    .replace(/['’]/g,"")
    .replace(/[łŁ]/g,"l").replace(/[đĐ]/g,"d").replace(/[øØ]/g,"o")
    .replace(/[æÆ]/g,"ae").replace(/[œŒ]/g,"oe").replace(/[þÞ]/g,"th").replace(/ß/g,"ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"")
    .slice(0,60)
    .replace(/-+$/,"");
  return s || "etiuda-catalog";
}
/* A build's filename is just the name, slugged. No "-etiuda" tag: the extension already
   says what the file is, the default name carries the word anyway, and appending it to a
   name the user chose is the app overruling them about their own file. */
/* The one place the agent's identity serves anything but {AGENT}: a build is a
   personal artifact, and the default name says who made it and when. First word only -
   the part that takes the possessive; a trailing dot is dropped so an initial gives
   "M's", not "M.'s". Empty AGENT box = "Custom". The date is formatted explicitly:
   toLocaleDateString follows the machine's locale and names the same build differently
   on a colleague's laptop. */
function buildDefaultName(){
  const a=agentParts(agentEl.value);
  const first=a.display ? String(a.display).split(" ")[0].replace(/[.,;:]+$/,"") : "";
  const d=new Date();
  const date=d.getDate()+"."+String(d.getMonth()+1).padStart(2,"0")+"."+d.getFullYear();
  return (first ? first+"'s" : "Custom")+" Etiuda Build "+date;
}
/* No export numbering (-2, -3): it defeated the default name - the whole point of
   defaulting to "Etiuda catalog" is that accepting it yields etiuda-catalog.js, the one
   filename that loads by itself, and the second export of the day silently produced a file
   that does nothing when dropped beside the engine. The browsers also handle the collision
   better than a page can: Chromium's Save dialog warns before overwriting, Firefox appends
   "(1)" - neither loses a file, and both tell the user, which the silent -2 never did. */
/** Write the file. Where it lands is the browser's call, not ours: a page cannot choose a
 *  directory. showSaveFilePicker at least hands the user a real Save dialog that opens where
 *  they last saved, so the file can go beside Etiuda.html without a trip through Downloads.
 *  Chromium has it; Firefox does not, and falls back to an ordinary download. */
function saveCatalogFile(name, text){
  if(typeof window.showSaveFilePicker==="function"){
    return window.showSaveFilePicker({
        suggestedName:name,
        types:[{description:"Etiuda catalog", accept:{"text/javascript":[".js"]}}]
      })
      .then(h=>h.createWritable().then(w=>w.write(text).then(()=>w.close()).then(()=>h.name||name)))
      .catch(e=>{
        if(e && (e.name==="AbortError"||e.name==="NotAllowedError")) return null;  // cancelled
        return downloadCatalogFile(name, text);        // unsupported here - fall back
      });
  }
  return Promise.resolve(downloadCatalogFile(name, text));
}
function downloadCatalogFile(name, text){
  const blob=new Blob([text],{type:"text/javascript;charset=utf-8"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=name;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  return name;
}
/** Small modal of its own rather than the shared one, so it can sit on top of Manage without
 *  destroying it - the same trick the sibling-catalog offer uses. */
/** @param mode "catalog" (a .js catalog file) or "html" (a standalone build). It decides the
 *  wording and the previewed filename - the two exports produce different things and the
 *  preview has to say which, or it quietly promises a .js and hands over an .html. */
function askCatalogName(initial, onOk, mode){
  const html=mode==="html";
  const wrap=document.createElement("div");
  wrap.className="modal";
  wrap.id="eNameModal";
  wrap.innerHTML='<div class="modal-bg"></div><div class="modal-card">'
    +'<h2>'+esc(html?t("Name this build"):t("Name this catalog"))+'</h2>'
    /* No explanatory paragraph. "Name this catalog" over a live filename preview is the
       whole instruction: what the name does is demonstrated by the preview under the box,
       and what to do with the file belongs to the button that opened this dialog. */
    +'<div class="mf"><input id="eNameInp" autocomplete="off" spellcheck="false" placeholder="Etiuda catalog"></div>'
    +'<p class="modal-sub" id="eNamePreview" style="margin:2px 0 0"></p>'
    +'<div class="modal-actions">'
    +'<button type="button" class="btn" id="eNameNo">Cancel</button>'
    +'<button type="button" class="btn primary" id="eNameYes">Export</button>'
    +'</div></div>';
  document.body.appendChild(wrap);
  /* Appended straight to <body>, so the chrome roots never see it - swept here instead,
     at the one moment it exists. */
  translateTree(wrap);
  const inp=wrap.querySelector("#eNameInp");
  const prev=wrap.querySelector("#eNamePreview");
  const close=()=>{ document.removeEventListener("keydown", onKey, true); wrap.remove(); };
  const sync=()=>{
    const slug=catalogFileSlug(inp.value||initial);
    prev.textContent=t("Saves as")+" "+slug+(html ? ".html" : ".js");
  };
  const ok=()=>{ const v=inp.value.trim()||initial||"Etiuda catalog"; close(); onOk(v); };
  function onKey(e){
    if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); close(); }
    else if(e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); ok(); }
  }
  document.addEventListener("keydown", onKey, true);
  inp.value=initial||"";
  inp.oninput=sync; sync();
  wrap.querySelector("#eNameNo").onclick=close;
  wrap.querySelector("#eNameYes").onclick=ok;
  setTimeout(()=>{ inp.focus(); try{ inp.select(); }catch(_){} },30);
}
function exportCatalog(){
  if(!(cards||[]).length){ toast("The catalog is empty, so there is nothing to export."); return; }
  /* Defaults to the name whose slug IS the auto-load filename - accepting it produces
     etiuda-catalog.js, the file that loads by itself beside Etiuda.html, with no rename
     step to explain. Pre-selected, so typing replaces it. Deliberately NOT the loaded
     catalog's own name: a file named after the catalog is a fine backup and does exactly
     nothing when dropped next to the engine. */
  askCatalogName("Etiuda catalog", name=>{
    const c=currentCatalog(name);
    const slug=catalogFileSlug(c.name);
    const file=slug+".js";
    /* One of a thing says so. The header is read by whoever opens the file, and stays English
       like the rest of this comment: it describes the format, not the interface. */
    const num=(v,one,many)=>v+" "+(v===1?one:many);
    const head="/* Etiuda catalog - "+String(c.name).replace(/\*\//g,"")+"\n"
      +"   "+num(catalogMacroCount(c),"macro","macros")+" in "+num(c.cards.length,"card","cards")
      +" · "+num(c.intents.en.length,"intent","intents")
      +" · "+num(Object.keys(c.categories).length,"category","categories")+"\n"
      +"   To load it: Library > Import catalog. Any filename, any folder.\n"
      +"   A file named etiuda-catalog.js beside Etiuda.html also loads on launch. */\n";
    const js=head+"window.PB_CATALOG = "+JSON.stringify(c,null,1)+";\n";
    saveCatalogFile(file, js).then(saved=>{
      if(!saved) return;                              // cancelled in the browser's Save dialog
      toast(catalogCountsLine("Exported {FILE} with {MACROS} in {CARDS}",
        c.cards.length, catalogMacroCount(c), 0, 0).replace("{FILE}",saved));
    });
  });
}
/* Export HTML - one self-contained file with the current catalog baked in. Opens with
   the content already loaded, needs no sibling, and Reset returns to that content, because
   the catalog is part of the file rather than part of the browser.
   Built from E_SELF - the DOM serialised before the app touched it - NEVER by fetching
   our own source: fetch(location.href) on file:// works in Firefox and is refused by
   Chromium, so it works at home and fails silently at work. */
function exportHtml(){
  if(!(cards||[]).length){ toast("The catalog is empty, so there is nothing to build."); return; }
  if(!E_SELF){ toast("Could not read this page's own source"); return; }
  askCatalogName(buildDefaultName(), name=>{
    const c=currentCatalog(name);
    /* "<" escaped throughout, so no string inside the catalog can close the <script> block
       early. \\u003c is valid JSON and parses straight back to "<". */
    const json=JSON.stringify(c).replace(/</g,"\\u003c");
    const slot=/(<script\b[^>]*\bid="eEmbedded"[^>]*>)([\s\S]*?)(<\/script>)/i;
    if(!slot.test(E_SELF)){ toast("Could not find the embedded-catalog slot"); return; }
    // Function replacement, so $& and friends inside the JSON are never treated as patterns
    const html=E_SELF.replace(slot,(m,open,old,close)=>open+json+close);
    const file=catalogFileSlug(c.name)+".html";
    const blob=new Blob([html],{type:"text/html;charset=utf-8"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=file;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),2000);
    toast(catalogCountsLine("Built {FILE} with {MACROS} inside",
        0, catalogMacroCount(c), 0, 0).replace("{FILE}",file));
  }, "html");
}
/** Accepts a 1.0 catalog (.js or bare JSON) or a pre-1.0 cards-only file. Parses, never runs. */
function parseCatalogFile(text){
  let raw=String(text||"").replace(/^﻿/,"").trim();
  if(!raw) throw new Error("file is empty");
  // Strip the `window.PB_CATALOG =` wrapper if present, leaving the JSON payload
  const at=raw.indexOf("PB_CATALOG");
  if(at>-1){
    const eq=raw.indexOf("=",at);
    if(eq>-1) raw=raw.slice(eq+1).trim().replace(/;\s*$/,"");
  }
  let data;
  try{ data=JSON.parse(raw); }
  catch(e){ throw new Error("not a catalog - "+(e&&e.message?e.message:"could not parse")); }
  const cardsOut=parseMacrosData(data);            // validates every card, dedupes ids
  if(!cardsOut.length) throw new Error("no cards in file");
  const cat={ format:1, kind:"playbook-catalog",
              name:(data&&data.name)?String(data.name):"Imported catalog",
              categories:{}, intents:null, cards:cardsOut,
              facts:(data&&typeof data.facts==="string")?data.facts:"" };
  /* Carried when declared, like roles and who (remember: this object is a WHITELIST - see
     the note below). An edition number the author stamps on the file; the offer dialog and
     Manage show it, so a maintainer can tell at a glance which edition a desk is running. */
  if(data&&data.version!=null) cat.version=String(data.version);
  if(data&&data.categories&&typeof data.categories==="object"){
    Object.keys(data.categories).forEach(k=>{
      /* "fav" stays refused on the way IN. The virtual category it collided with is gone,
         so nothing here would break any more - but the catalog linter still reserves the
         key, and an importer that quietly accepts what the linter rejects is two
         contracts where there should be one. Loosening it is a catalog-format decision
         and belongs to a catalog-format release. */
      if(k!=="fav") cat.categories[k]=String(data.categories[k]||k);
    });
  }
  /* Carried like the English names and refusing the same key. Without it an IMPORTED catalog
     shows English categories under a Polish interface while the sibling auto-load, which never
     passes through here, shows Polish - and the category editor offers an empty Polish field. */
  if(data&&data.categoriesPl&&typeof data.categoriesPl==="object"){
    cat.categoriesPl={};
    Object.keys(data.categoriesPl).forEach(k=>{
      const v=String(data.categoriesPl[k]==null?"":data.categoriesPl[k]).trim();
      if(k!=="fav" && v) cat.categoriesPl[k]=v;
    });
  }
  /* Carried through, but only if the file declares it: a pre-roles catalog must stay undeclared
     rather than be stamped with the current session's roles, which may belong to another catalog
     entirely. `roles.opener` is dropped here - that role no longer exists. */
  if(data&&data.roles&&typeof data.roles==="object"){
    cat.roles={ always:Array.isArray(data.roles.always)?data.roles.always.map(String):[] };
  }
  /* Carried through like roles, and only when declared, so a pre-`who` catalog stays
     undeclared rather than inheriting the current session's list.
     NOTE: `cat` above is a WHITELIST - it copies named fields and drops everything else.
     Every new top-level catalog field must be added here AND to currentCatalog(), or
     Import silently discards it while the sibling auto-load (which bypasses this parser)
     keeps it - a mismatch that looks like the catalog's own fault. */
  /* Category looks, carried like roles and only when declared. Deliberately NOT validated
     against this engine's CAT_ICONS here: an import should preserve what the file said, and a
     key this build cannot draw is dropped later, at eApplyCatalog, so re-exporting from a
     newer catalog on an older build does not quietly strip icons it merely does not know yet. */
  if(data&&data.icons&&typeof data.icons==="object"){
    cat.icons={};
    Object.keys(data.icons).forEach(k=>{ const v=String(data.icons[k]||""); if(v) cat.icons[k]=v; });
  }
  if(data&&data.colors&&typeof data.colors==="object"){
    cat.colors={};
    Object.keys(data.colors).forEach(k=>{
      const n=parseInt(data.colors[k],10);
      if(hueIsOffered(n)) cat.colors[k]=n;
    });
  }
  if(data&&Array.isArray(data.who)) cat.who=normWhoList(data.who);
  const i=data&&data.intents;
  if(i&&Array.isArray(i.en)&&i.en.length){
    const n=i.en.length;
    const arr=(a,fill)=>{ const out=(Array.isArray(a)?a.slice(0,n):[]).map(x=>String(x==null?"":x));
                          while(out.length<n) out.push(fill); return out; };
    /* The optional Polish columns are carried only when the file declares them, exactly
       as the export writes them - absent, not empty. topicPl was missing here, so a catalog
       exported WITH Polish topics lost them on the way back in. */
    cat.intents={ en:arr(i.en,""), pl:arr(i.pl,""),
                  cat:(Array.isArray(i.cat)?i.cat.slice(0,n):[]), cmt:arr(i.cmt,""), topic:arr(i.topic,"") };
    if(Array.isArray(i.topicPl)) cat.intents.topicPl=arr(i.topicPl,"");
    if(Array.isArray(i.cmtPl)) cat.intents.cmtPl=arr(i.cmtPl,"");
    while(cat.intents.cat.length<n) cat.intents.cat.push(Object.keys(cat.categories)[0]||"gen");
  }
  // A pre-1.0 cards-only file carries no categories; keep whatever is loaded rather than blanking
  if(!Object.keys(cat.categories).length){
    Object.keys(CATS).forEach(k=>{ cat.categories[k]=CATS[k]; });
  }
  if(!cat.intents){
    cat.intents={en:SW_EN.slice(),pl:SW_PL.slice(),cmt:SW_CMT.slice(),topic:SW_TOPIC.slice(),
                 cmtPl:SW_CMT_PL.slice(),topicPl:SW_TOPIC_PL.slice()};
  }
  if(!cat.facts) cat.facts=(pack.facts!=null&&pack.facts!=="")?pack.facts:FACTS;
  return cat;
}
/** Make a catalog the active one. Reloads, because BASE_N is fixed at boot and cannot grow. */
/* The same catalog moving forward is not a different catalog arriving. Name is what the
   author controls and what an agent recognises, so it decides. Ids being category+title,
   a false match can only reach a card that is the same card anyway. */
function isCatalogUpdate(incoming,active){
  if(!incoming||!active) return false;
  const a=String(incoming.name||"").trim().toLowerCase();
  const b=String(active.name||"").trim().toLowerCase();
  return !!a && a===b;
}
/* AGE IS CLAIMED ONLY WHERE IT CAN BE READ. The edition is the catalog's own string, so only
   the form this app writes - a date with an optional letter - can be ordered. Anything else is
   not evidence of age, and the offer then says exactly what it said before. */
const EDITION_DATED=/^[0-9]{4}-[0-9]{2}-[0-9]{2}[a-z]?$/;
function catalogEditionOlder(incoming,active){
  const a=String(incoming==null?"":incoming).trim();
  const b=String(active==null?"":active).trim();
  if(!EDITION_DATED.test(a)||!EDITION_DATED.test(b)) return false;
  return a<b;
}
/* keepPersonal is the caller saying THIS IS AN UPDATE. Default is to drop, because personal
   layers were written against the catalog being replaced and mean nothing against another. */
function activateCatalog(c,opts){
  const keep=!!(opts&&opts.keepPersonal);
  /* THE CATALOG LANDS BEFORE ANYTHING IS PRUNED FOR IT. The personal layers below are
     filtered down to ids the INCOMING catalog knows, which for a different catalog is
     nearly nothing - so doing that first and discovering afterwards that the catalog could
     not be written left the old catalog standing over emptied stars, hides and order. */
  if(!storeCatalog(c)) return false;
  if(!keep){
    pack.overrides={};
    pack.custom=[];
    /* The ROLE list is the same kind of thing: an edit made against the previous catalog's
       vocabulary. Left in place it silently shadowed the incoming catalog's own `who`, so
       importing a catalog appeared to ignore its suggestions entirely. */
    pack.who=null;
    /* Addressed by INDEX, so against another catalog they mean whatever now sits at those
       numbers - see the note at NS_DROP_POSITIONAL. The order is a list of indices too. */
    pack.intentOverrides={};
    pack.intentCustom=[];
    pack.intentHidden=[];
    pack.intentFavourites=[];
    pack.intentRemoved=[];
    nsDel("IntentOrder");
  }
  pack.baseCards=null;
  /* Derived, not read: m.id is absent on a catalog card, so reading it gave a set holding
     one undefined and quietly emptied all three lists on every activation. */
  const alive=new Set((c.cards||[]).map(catalogCardId));
  (pack.custom||[]).forEach(m=>{ if(m&&m.id) alive.add(m.id); });
  // An edit whose card the update removed has nothing left to apply to.
  if(keep) Object.keys(pack.overrides||{}).forEach(id=>{
    if(!alive.has(id)) delete pack.overrides[id];
  });
  pack.hidden=(pack.hidden||[]).filter(id=>alive.has(id));
  pack.favourites=(pack.favourites||[]).filter(id=>alive.has(id));
  pack.cardOrder=(pack.cardOrder||[]).filter(id=>alive.has(id));
  cardOrderTouched();
  savePack();
  nsDel("CatalogNo");
  /* Set here rather than in loadSampleCatalog(), because EVERY route to a catalog passes
     through this function - the sample button, an import, accepting the sibling file. Loading
     anything without the flag therefore clears the watermark by itself, with no path that can
     leave it stranded over real content. */
  try{
    if(c && c.sample) nsSet("Sample","1");
    else nsDel("Sample");
  }catch(e){}
  /* A CATALOG ARRIVES ON A CLEAN DESK. Selected intents are stored by INDEX, so an index
     points at whatever intent now sits there: all per-tab state goes, updates included.
     What the agent owns is not per-tab and is untouched.
     DELETING IS NOT ENOUGH: reload fires beforeunload, which saves the session back over the
     delete. The latch stops it - ssSet honours eWiping, ssDel does not - so it goes up AFTER
     the catalog is written, and nothing may persist between here and the reload. */
  try{ clearTimeout(tabSaveTimer); ssDel(TAB_KEY); eWipeLatch(); }catch(e){}
  location.reload();
  return true;
}
/** True while the sample is still, word for word, the one that shipped. The test is
 *  "would an export differ from the sample?" - edits, additions, deletions, renames,
 *  role and quick-facts changes all clear the watermark: you have started making it
 *  yours. Ordering, favourites and hiding change none of it - they say where an entry
 *  sits, not what is in the file - so they leave the warning alone. */
function sampleUntouched(){
  const p=pack||{};
  const noKeys=o=>!o||Object.keys(o).length===0;
  const noItems=a=>!Array.isArray(a)||a.length===0;
  return noKeys(p.overrides) && noItems(p.custom) &&
         noItems(p.removed) && noItems(p.removedCats) && noItems(p.intentRemoved) &&
         noKeys(p.catLabels) && noKeys(p.customCats) && noKeys(p.catRoles) &&
         noKeys(p.intentOverrides) && noItems(p.intentCustom) &&
         p.facts==null && p.who==null &&
         /* Order is content, so a reordered sample is no longer the sample as shipped.
            Reversible by construction: drag it back and this returns to true. */
         cardOrderIsBase();
}
/** Watermark visibility. The flag is read from storage rather than the live catalog because it
 *  has to survive activateCatalog()'s reload, and because a Reset wipes every pb* key - so a
 *  reset Etiuda cannot come back still marked. */
function syncSampleMark(){
  const el=document.getElementById("sampleMark");
  if(!el) return;
  let on=false;
  on=nsGet("Sample")==="1";
  el.hidden=!(on && (cards||[]).length>0 && sampleUntouched());
}
// The sample is a sibling file, so it can simply not be there - every route offering it asks here.
function sampleReady(){ return typeof PB_SAMPLE!=="undefined" && !!PB_SAMPLE; }
/* Routes through activateCatalog() like any import - a real catalog you keep and can edit,
   not a temporary illusion. It NEVER replaces a loaded catalog: activateCatalog() drops every
   override and custom, and wanting the demo on top of real content is not a thing anyone wants
   - Reset first. The caller already fires only on an empty Etiuda; the rule is stated here so
   a route added later cannot get around it. */
function loadSampleCatalog(){
  if((cards||[]).length || !sampleReady()) return false;
  return activateCatalog(JSON.parse(JSON.stringify(PB_SAMPLE)),{keepPersonal:false});
}
/* Asks, and hands back what to activate rather than activating: the picker route has to
   store its handle BEFORE the reload that activateCatalog() ends in, or it is never kept. */
function catalogFromFileText(text,fileName){
      try{
        const c=parseCatalogFile(String(text||""));
        const updating=isCatalogUpdate(c,storedCatalog());
        const msg=t("Import catalog")+"\n\n"+
          t("Load this catalog on this browser:")+"\n"+fileName+"\n\n"+
          catalogCountsLine("{MACROS} in {CARDS} · {INTENTS} · {CATEGORIES}",
            c.cards.length, catalogMacroCount(c), c.intents.en.length,
            Object.keys(c.categories).length)+"\n\n"+
          (updating
            ? t("This is a newer copy of the catalog you already have, so your own cards and edits are kept.")
            : t("It replaces the catalog loaded now. Personal card edits and custom cards on this")+" "+
              t("browser are cleared, because they belong to the catalog they were written against."))+"\n\n"+
          t("Nothing on disk is changed. Etiuda reloads to apply it.")+"\n\n"+t("Continue?");
        if(!ask(msg)) return null;
        return {c:c,keepPersonal:updating};
      }catch(e){
        toast(t("Import failed -")+" "+(e&&e.message?e.message:"invalid file"));
        return null;
      }
}
/* The plain input, which is all Firefox has. It also puts down any watch: the file being
   watched is no longer the file this catalog came from. */
/* THE import route, wherever it is offered from. The picker where there is one: it is the only
   route that yields a handle, so choosing it here is what makes the watch available at all. */
function importCatalogHere(){
  if(eWatchSupported()) importCatalogPicked(); else importCatalogFile();
}
function importCatalogFile(){
  const inp=document.createElement("input");
  inp.type="file";
  inp.accept=".js,.json,text/javascript,application/json,text/plain";
  inp.onchange=()=>{
    const f=inp.files&&inp.files[0];
    if(!f) return;
    const reader=new FileReader();
    reader.onload=()=>{
      const plan=catalogFromFileText(String(reader.result||""),f.name);
      if(!plan) return;
      eWatchClear().then(()=>activateCatalog(plan.c,{keepPersonal:plan.keepPersonal}));
    };
    reader.onerror=()=>toast("Could not read file");
    reader.readAsText(f);
  };
  inp.click();
}
/* The picker returns a HANDLE - the same dialog to the user, but what comes back can be
   kept and re-read later, which is the whole update channel. Cancelling rejects with
   AbortError rather than resolving empty, so the catch is also the cancel path. */
function importCatalogPicked(){
  let handle=null;
  window.showOpenFilePicker({
    multiple:false,
    types:[{description:"Etiuda catalog",accept:{"text/javascript":[".js"],"application/json":[".json"]}}]
  }).then(picked=>{
    handle=picked&&picked[0];
    return handle?handle.getFile():null;
  }).then(f=>{
    if(!f) return null;
    return f.text().then(text=>{
      const plan=catalogFromFileText(text,f.name);
      if(!plan) return null;
      nsSet("WatchName",f.name);
      nsSet("WatchSeen",String(f.lastModified||0));
      nsDel("WatchNo");
      return eWatchPut(handle).then(()=>activateCatalog(plan.c,{keepPersonal:plan.keepPersonal}));
    });
  }).catch(e=>{
    if(e && e.name==="AbortError") return;
    toast(t("Import failed -")+" "+((e&&e.message)?e.message:"invalid file"));
  });
}


// ---- booking tabs (shared settings; per-tab language / PAX / intent / ROLE / cats / search) --
const TAB_KEY="pbSessionTabs";
let tabs=[], activeTabId=null;
let tabSaveTimer=null;

function blankTab(){
  return {
    id:"t"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    title:"",
    /* Seeded from the language on screen, which at boot is the one restored from storage and
       thereafter is the active tab's. So a new tab opens in the language you are already working
       in, and a fresh launch resumes where you left off - neither snaps back to English. */
    lang:lang,
    pax:"",
    intentIdxs:[],
    intentText:"",
    intentBox:"",
    who:"",
    cats:[],
    entrySel:null,
    scrollY:0
  };
}
function tabLabel(tb, i){
  // tb.title is IGNORED on purpose - renaming is retired, but sessions saved before that
  // may still carry titles (inert, not poisonous); a tab is named by the person in it, or
  // by its number.
  if(tb&&tb.pax&&String(tb.pax).trim()){
    return String(tb.pax).trim().split(/\s+/)[0];
  }
  /* The default name is the one thing on a tab the engine wrote, so it translates - and the
     translation is why it does not always fit. TAB_FLOOR_W is the width at which "Tab 99"
     stands whole, with a tenth of a pixel over; "Rozmowa 99" wants 38px more than the floor
     leaves, so a full Polish strip fades its numbered tabs like any other name. */
  return t("Tab")+" "+((i!=null?i:tabs.indexOf(tb))+1);
}
function snapshotActiveTab(){
  if(!activeTabId) return;
  const t=tabs.find(x=>x.id===activeTabId);
  if(!t) return;
  t.lang=lang;
  t.pax=pax?pax.value:"";
  t.intentIdxs=intentIdxs.slice();
  t.intentText=intentText;
  t.intentBox=intentEl?intentEl.value:"";
  t.who=roleSel?roleSel.value:"";
  t.cats=cats.slice();
  t.entrySel=entrySel?{id:entrySel.id, vi:entrySel.vi}:null;
  t.scrollY=pageScrollY();
}
function saveTabSession(){
  snapshotActiveTab();
  try{
    ssSet(TAB_KEY, JSON.stringify({v:1, tabs:tabs, activeTabId:activeTabId}));
  }catch(e){}
}
function scheduleTabSave(){
  snapshotActiveTab();
  drawTabs();
  clearTimeout(tabSaveTimer);
  tabSaveTimer=setTimeout(saveTabSession, 250);
}
function loadTabSession(){
  try{
    const data=JSON.parse(ssGet(TAB_KEY)||"null");
    if(!data||!Array.isArray(data.tabs)||!data.tabs.length) return false;
    /* Restored state is validated against the catalog that is loaded NOW - sessionStorage
       is per origin, and on file:// that means per folder, so a standalone build picks up
       whatever a previous Etiuda left in that tab.
       An unknown category filter is the dangerous one: cardInActiveCats() matches nothing,
       drawPills() draws no pill to un-click, and the empty screen survives reloads.
       Out-of-range intent indices go the same way: they point into a shorter SW_* array. */
    /* A tab saved against the retired Favourites pill fails this and drops its filter, so the
       tab opens on All - where its favourites now lead the list anyway. */
    const catOk=k=>!!CATS[k];
    const intentOk=i=>Number.isInteger(i)&&i>=0&&i<SW_EN.length;
    tabs=data.tabs.map(t=>Object.assign(blankTab(), t, {
      // Honour a stored value; a record from before tabs carried a language falls back to the
      // restored last-used one rather than being forced to English.
      lang:(t.lang==="pl"||t.lang==="en")?t.lang:lang,
      intentIdxs:Array.isArray(t.intentIdxs)?t.intentIdxs.filter(intentOk):[],
      cats:Array.isArray(t.cats)?t.cats.filter(catOk):[]
    }));
    activeTabId=data.activeTabId;
    if(!tabs.some(t=>t.id===activeTabId)) activeTabId=tabs[0].id;
    return true;
  }catch(e){ return false; }
}
function applyTab(tb){
  if(!tb) return;
  activeTabId=tb.id;
  if(pax) pax.value=tb.pax||"";
  if(roleSel) roleSel.value=tb.who||"";
  intentIdxs=Array.isArray(tb.intentIdxs)?tb.intentIdxs.slice().filter(i=>Number.isInteger(i)&&i>=0&&i<SW_EN.length):[];
  intentText=tb.intentText||"";
  cats=Array.isArray(tb.cats)?tb.cats.slice():[];
  if(tb.entrySel&&tb.entrySel.id!=null){
    entrySel={id:String(tb.entrySel.id), vi:+tb.entrySel.vi||0};
  } else {
    entrySel=null;
  }
  pickRun=false;   // a run does not span tabs

  // Before the intent sync below: the placeholder, the dropdown and {INTENT} are all per-language.
  applyLangUI(tb.lang);
  updateIntentPlaceholder();
  if(intentEl){
    intentEl.value=tb.intentBox||"";
    intentEl.classList.toggle("set", !!(tb.intentBox&&String(tb.intentBox).trim())||intentIdxs.length>0);
  }
  syncIntentClearBtns();
  syncRoleDrum();   // the drum shows the tab's own role

  // Refresh clear-button disabled states without firing oninput (avoids re-entrant tab save)
  const paxClear=$("#paxClear"); if(paxClear) paxClear.disabled=!String(pax&&pax.value||"").length;

  drawPills();
  drawIntentRail();
  render();
  drawTabs();
  requestAnimationFrame(()=>{
    try{ pageScroller().scrollTop=tb.scrollY||0; }catch(_){}
    scheduleRailGeometry();
    /* After drawTabs, so the element measured is the one now on screen. A tab you switch to
       must be visible even when it sits off the end of a scrolled strip - otherwise the
       selection moves somewhere you cannot see, which is the one thing a scrolling strip can
       get badly wrong. */
    scrollTabIntoView(tb.id);
  });
}
function switchTab(id){
  if(!id||id===activeTabId) return;
  snapshotActiveTab();
  const t=tabs.find(x=>x.id===id);
  if(!t) return;
  applyTab(t);
  saveTabSession();
}
/* Wraps, and a lone tab is a handled no-op rather than a fall-through: the key must never
   walk focus on one tab and switch on two. */
function stepTab(dir){
  if(tabs.length<2) return;
  const i=tabs.findIndex(x=>x.id===activeTabId);
  switchTab(tabs[(i+dir+tabs.length)%tabs.length].id);
}
/* A new tab GROWS into place - WIDTH, not transform. The tabs do not merely move, they
   RESIZE: applyTabWidths divides the strip evenly, and scaling a tab horizontally would
   squash its label. Animating a layout property is normally forbidden - it is why the card
   list uses transforms - but the exception is bounded: only tabs ABOVE the width floor
   resize, roughly available width over TAB_FLOOR_W of them, and once the strip is at the
   floor and scrolling, opening a tab resizes nothing and only the newcomer animates. If
   the insert ever reads heavy on a wide window with many tabs, this is the line to
   revisit.
   The strip's own width is animated too: applyTabWidths sets it explicitly, and left to
   jump it would put the + button in its final place a fifth of a second before the tab
   that pushed it there had arrived.
   Targets are READ OFF the elements rather than recomputed: applyTabWidths has already
   written the finished geometry inline by the time mutate() returns, so there is one
   formula for a tab's width and not two that can drift apart. */
const TAB_EASE=E_EASE;
// Set while the strip is mid-animation, so fitTabLabels leaves the labels alone - see there.
let tabInsertAnimating=false;
const TAB_GROW=["width","max-width","min-width","flex-basis"].map(k=>k+" .19s "+TAB_EASE).join(",")
  +",opacity .16s ease";
function animateTabInsert(mutate){
  const bar=$("#tabsBar");
  if(!bar || mgReduceMotion()){ mutate(); return; }
  const was={}, barWas=bar.getBoundingClientRect().width;
  bar.querySelectorAll(".tab[data-tid]").forEach(el=>{
    was[el.dataset.tid]=el.getBoundingClientRect().width;
  });
  /* THE HEADER MOVES WITH THE STRIP, NOT BESIDE IT. A tab that takes the wordmark rebuilds
     the row inside mutate(), and the strip's left edge jumped 58px in a single frame while
     the grow began 20ms later - two events where the eye wants one. Staged at the mutation
     rather than in the grow's rAF, because by then the jump has already been painted; a
     glide is a transform and needs none of the wait a width animation does. Same curve. */
  const shedBefore=shedSnap();
  shedHeld++;
  try{ mutate(); } finally { shedHeld--; }
  const shedGo=shedBefore?shedStage(shedBefore):null;
  const els=[].slice.call(bar.querySelectorAll(".tab[data-tid]"));
  if(!els.length) return;
  const to=els.map(el=>({fl:el.style.flex, w:el.style.width,
                         mx:el.style.maxWidth, mn:el.style.minWidth}));
  const barTo={fl:bar.style.flex, w:bar.style.width,
               mx:bar.style.maxWidth, mn:bar.style.minWidth};
  /* Read on the settled FINAL geometry mutate() just wrote, before the from-state rewinds
     it: will the finished strip overflow? If so, the new tab's home is past the aperture's
     right edge, and without help the whole grow plays off-screen - the strip snaps to it
     at completion and the tab simply appears. So PIN the right edge for the duration: the
     newcomer unfurls out of the right wall while the older tabs slide left to make room,
     which is also how Firefox's own strip stages an insert. Pinning is per-frame because
     scrollWidth grows every frame of the transition, and the assignment clamps itself. */
  const pinEnd=bar.scrollWidth-bar.clientWidth>TAB_SCROLL_EPS;
  const set=(el,fl,w)=>{ el.style.flex="0 0 "+fl; el.style.width=w;
                         el.style.maxWidth=w; el.style.minWidth=w; };
  tabInsertAnimating=true;
  els.forEach(el=>{
    const w0=was[el.dataset.tid];
    el.style.transition="none";
    if(w0==null){
      /* The new one. min-width goes to 0 as well or the tab's own floor holds it open, and
         overflow is clipped so the label does not spill out of a box that is not there yet. */
      set(el,"0px","0px");
      el.style.opacity="0";
      el.style.overflow="hidden";
    } else {
      set(el,w0+"px",w0+"px");
    }
  });
  bar.style.transition="none";
  set(bar, barWas+"px", barWas+"px");
  // Commit the start before attaching the transition - see the note in flipPills().
  void bar.offsetHeight;
  if(pinEnd){ cancelTabScroll(); bar.scrollLeft=bar.scrollWidth; }   // staged before first paint
  /* ATTACHED AFTER THE REBUILT FRAME HAS PAINTED, two frames on. Width is a main-thread
     animation: attached in this task it starts at the style flush, and the first paint of the
     new tab's list, a full render, eats its opening third - Firefox drew seven widths of a
     .19s grow. Transform glides ride the compositor and need no such wait. */
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
  els.forEach((el,i)=>{
    el.style.transition=TAB_GROW;
    el.style.flex=to[i].fl; el.style.width=to[i].w;
    el.style.maxWidth=to[i].mx; el.style.minWidth=to[i].mn;
    el.style.opacity="";
  });
  bar.style.transition=TAB_GROW;
  bar.style.flex=barTo.fl; bar.style.width=barTo.w;
  bar.style.maxWidth=barTo.mx; bar.style.minWidth=barTo.mn;
  if(shedGo) shedGo();          // the header lets go in this frame, not the one it was staged in
  if(pinEnd){
    (function pin(){                   // an in-flight arrow press would fight the pin frame by frame
      if(!tabInsertAnimating) return;
      bar.scrollLeft=bar.scrollWidth;
      requestAnimationFrame(pin);
    })();
  }
  // Hand the inline styles back afterwards, then fit the labels once, to boxes that have stopped.
  setTimeout(()=>{
    els.forEach(el=>{ el.style.transition=""; el.style.opacity=""; el.style.overflow=""; });
    bar.style.transition="";
    tabInsertAnimating=false;
    fitTabLabels();
    /* Everything that declined to run mid-animation settles here, against boxes that have
       stopped moving: the overflow measurement (arrows, class, disabled states) and the reveal
       of the tab that was just opened - which, on a strip already scrolled elsewhere, is the
       one moment the reveal genuinely matters. */
    updateTabOverflow();
    if(activeTabId) scrollTabIntoView(activeTabId);
    /* The header shed sync deferred itself while the grow ran - adding a tab can change the
       shed step, and a class toggle mid-animation re-lays the row under the moving tabs.
       Nothing that moves the row runs until the boxes stop. */
    if(typeof scheduleHeaderSync==="function") scheduleHeaderSync();
  },230);
  }));
}
function addTab(){
  snapshotActiveTab();
  const t=blankTab();
  // applyTab() redraws the strip, so the whole insert happens inside the one capture
  animateTabInsert(()=>{ tabs.push(t); applyTab(t); });
  saveTabSession();
  try{ intentEl&&intentEl.focus({preventScroll:true}); }catch(_){}
  toast("The new tab starts with cleared fields and your settings kept.");
}
function closeTab(id, ev){
  if(ev){ ev.preventDefault(); ev.stopPropagation(); }
  const idx=tabs.findIndex(x=>x.id===id);
  if(idx<0) return;
  if(tabs.length===1){
    const keepId=tabs[0].id;
    tabs[0]=Object.assign(blankTab(),{id:keepId});
    applyTab(tabs[0]);
    saveTabSession();
    toast("Tab cleared");
    return;
  }
  const wasActive=id===activeTabId;
  tabs.splice(idx,1);
  if(wasActive){
    applyTab(tabs[Math.max(0, idx-1)]);
  } else {
    drawTabs();
  }
  saveTabSession();
}
/* THE LAST THING ESCAPE CAN SHED IS THE DESK, AND IT ASKS FIRST. Every rung above this one
   gives back something a keystroke rebuilds - a panel, a mode, a selection. This one drops
   every open conversation's PAX, ROLE, filter and box at once and nothing brings them back,
   so a stray press must not reach it. The second press has to land while the toast that
   asked for it is still up, which is what TAB_WIPE_MS matches. */
const TAB_WIPE_MS=TOAST_MS;
let tabWipeArmedAt=0, tabWipeToast=-1;
function tabHasWork(tb){
  if(!tb) return false;
  return !!(String(tb.pax||"").trim() || String(tb.intentBox||"").trim()
    || String(tb.who||"").trim() || String(tb.intentText||"").trim()
    || (tb.cats&&tb.cats.length) || (tb.intentIdxs&&tb.intentIdxs.length));
}
/* One blank tab is what "all closed" means - the same end state closing the last tab
   already produces, and it keeps that tab's id so the strip does not blink. */
function closeAllTabs(){
  const keepId=tabs[0]?tabs[0].id:null;
  tabs=[keepId?Object.assign(blankTab(),{id:keepId}):blankTab()];
  applyTab(tabs[0]);
  saveTabSession();
  toast("All tabs closed");
}
function escCloseAllTabsStep(){
  snapshotActiveTab();
  if(tabs.length<=1 && !tabHasWork(tabs[0])){ tabWipeArmedAt=0; return false; }
  const now=Date.now();
  /* THE ASKING TOAST IS THE WINDOW. Time alone let a second Escape land on a message that
     had already been replaced by another, wiping every tab with nothing on screen asking. */
  if(now-tabWipeArmedAt>TAB_WIPE_MS || toastSerial!==tabWipeToast){
    toast("Press Esc again to close all tabs");
    tabWipeArmedAt=now; tabWipeToast=toastSerial;
    return true;
  }
  tabWipeArmedAt=0;
  closeAllTabs();
  return true;
}
let tabDrag=null, tabSwapLock=0, tabSuppressClick=false;
function animateTabReorder(mutate){
  const bar=$("#tabsBar");
  if(!bar || mgReduceMotion()){ mutate(); drawTabs(); return; }
  const before={};
  bar.querySelectorAll(".tab[data-tid]").forEach(el=>{
    before[el.dataset.tid]=el.getBoundingClientRect();
  });
  mutate();
  drawTabs();
  const moved=[];
  bar.querySelectorAll(".tab[data-tid]").forEach(el=>{
    const id=el.dataset.tid, b=id&&before[id];
    if(!b) return;
    const a=el.getBoundingClientRect();
    const dx=Math.round(b.left-a.left), dy=Math.round(b.top-a.top);
    if(!dx && !dy) return;
    el.style.transition="none";
    el.style.willChange="transform";    // see the note in flipPills
    el.style.transform="translate("+dx+"px,"+dy+"px)";
    moved.push(el);
  });
  if(!moved.length) return;
  /* Commit the invert before attaching the transition - see the note at flipPills():
     without a computed start value Firefox shows the end state. Same-task attach also
     avoids the background-tab rAF pause. */
  void bar.offsetHeight;
  moved.forEach(el=>{
    el.style.transition="transform .18s "+E_EASE;
    el.style.transform="";
    setTimeout(()=>moved.forEach(el=>{ el.style.transition=""; el.style.transform=""; el.style.willChange=""; }),200);
  });
}
function moveTab(from,to){
  if(from===to||from<0||to<0) return;
  animateTabReorder(()=>{ tabs.splice(to,0,tabs.splice(from,1)[0]); });
}
function endTabDrag(){
  if(!tabDrag) return;
  const didMove=!!tabDrag.moved;
  tabDrag=null;
  document.documentElement.classList.remove("tabdrag");
  const bar=$("#tabsBar");
  if(bar) bar.querySelectorAll(".tab").forEach(el=>el.classList.remove("dragging"));
  if(didMove){
    tabSuppressClick=true;
    saveTabSession();
  }
}
/** Equal tab widths (clamped 52-210). Bar width tracks the tab strip so + (sibling) never
 *  slides left over tab outlines when the window keeps shrinking past min tab width.
 *  Wordmark collapse: below 560px only the Etiuda tile remains, so reserve the wordmark's whole
 *  width plus its flex gap - tab widths stay stable while the strip moves toward the tile. */
/* THE FLOOR - how narrow a tab may get before the strip scrolls instead. Above it, tabs
   shrink with the window - the behaviour worth keeping; below it the row scrolls and tabs
   hold their size. 100 is where "Tab 99" fits whole beside its close chip and the
   category dot's 12px inset: a default title is always said in full. Keep .tab's
   min-width in step. */
let TAB_FLOOR_W=100;
/* Scroll state is a MEASUREMENT, never a tab count: four tabs overflow in a narrow window and
   not in a wide one, so asking the pixels is the only version of this that is right at every
   size. EPS absorbs sub-pixel layout, which otherwise leaves an arrow enabled at a hard edge
   that cannot move - Firefox's own widget carries the same guard for the same reason. */
const TAB_SCROLL_EPS=1;
function updateTabOverflow(){
  const bar=$("#tabsBar"), wrap=$("#tabsWrap");
  if(!bar||!wrap) return;
  /* NOTHING here runs while the insert grow is in flight - not the reflow, not the class
     toggle, not the disabled states. The new tab's inter-tab margin lands instantly while
     the widths animate, so for the first frames the strip measures overflowing by a
     transient sliver; the ResizeObserver sees every animated frame, and flipping
     .tabs-over mid-grow pops the arrows in and shoves the whole row sideways, then undoes
     it as the animation catches up. The settle this skips runs when the animation hands
     its inline styles back, against boxes that have stopped moving. */
  if(typeof tabInsertAnimating!=="undefined" && tabInsertAnimating) return;
  const over=bar.scrollWidth-bar.clientWidth>TAB_SCROLL_EPS;
  const changed=wrap.classList.contains("tabs-over")!==over;
  wrap.classList.toggle("tabs-over", over);
  /* Crossing the threshold changes how much room the row has, because the arrows appear or go.
     One more pass settles it - the guard stops at one, because a layout that does not converge
     in a single step is a bug to see rather than to mask, which is the rule applyTabWidths'
     own fixpoint already follows. */
  if(changed && !updateTabOverflow._reflow){
    updateTabOverflow._reflow=true;
    try{ applyTabWidths(); } finally { updateTabOverflow._reflow=false; }
  }
  const prev=$("#tabsPrev"), next=$("#tabsNext");
  if(prev) prev.disabled=!over || bar.scrollLeft<=TAB_SCROLL_EPS;
  if(next) next.disabled=!over || bar.scrollLeft>=bar.scrollWidth-bar.clientWidth-TAB_SCROLL_EPS;
}
/* Bring a tab fully into view. `nearest` on both axes deliberately: it scrolls the minimum
   needed and does nothing when the tab is already visible, so switching between two tabs that
   both fit never slides the strip - the same restraint the card list's auto-scroll learned. */
function scrollTabIntoView(id){
  const bar=$("#tabsBar"); if(!bar) return;
  /* Not mid-grow. Fired from applyTab's rAF, the reveal measures the strip in its FROM
     state, scrolls by the transient overhang, and unwinds frame by frame as the bar
     outgrows the content. The grow's completion re-runs this against settled boxes. */
  if(typeof tabInsertAnimating!=="undefined" && tabInsertAnimating) return;
  // data-tid, not data-id - drawTabs names it that, and the card list's data-id is a different thing
  const el=bar.querySelector('.tab[data-tid="'+cssEsc(id)+'"]');
  if(!el) return;
  /* Arithmetic on the container rather than scrollIntoView(). drawTabs writes the tab
     widths in a rAF of its own, so the DOM call resolved against unsettled geometry and
     landed one switch LATE - and its behaviour across engines is one more thing to be sure
     of. Two rect reads and a delta are deterministic, force the layout they depend on, and
     do nothing when the tab is already fully visible - the property that keeps switching
     between two visible tabs from sliding the strip. */
  cancelTabScroll();   // a reveal outranks an in-flight arrow press; letting both run tears the strip
  const er=el.getBoundingClientRect(), br=bar.getBoundingClientRect();
  if(er.left<br.left)        bar.scrollLeft-=(br.left-er.left);
  else if(er.right>br.right) bar.scrollLeft+=(er.right-br.right);
  updateTabOverflow();
}
/* ONE rAF ANIMATOR drives every deliberate strip scroll, instead of scrollBy({behavior:
   "smooth"}). Three reasons, each carrying its own scar:
     - the platform smooth scroll is a black box that some Firefox profiles never paint - the
       paint-pump problem, and a scroll animation fires neither transitionrun nor animationstart,
       so the engine's pump never engages for it. An rAF loop IS its own pump.
     - consecutive presses must accumulate from the PENDING target: restarting from the current
       position makes the second press spend itself re-covering the first one's remaining
       distance, which reads as the button going soft.
     - it is cancellable at a defined point, so the reveal-on-switch and the trackpad can take
       over without fighting an in-flight animation - the exact class of race that made
       scrollIntoView land one switch late.
   Ease-out cubic, TAB_EASE's family: all of the speed at the start, so the press answers the
   finger, and the landing is what gets the time. */
let eTabScrollAnim=null;
function cancelTabScroll(){
  if(eTabScrollAnim){ cancelAnimationFrame(eTabScrollAnim.raf); eTabScrollAnim=null; }
}
function animateTabScroll(target){
  const bar=$("#tabsBar"); if(!bar) return;
  target=Math.max(0, Math.min(bar.scrollWidth-bar.clientWidth, target));
  cancelTabScroll();
  const from=bar.scrollLeft, dist=target-from;
  if(Math.abs(dist)<1 || mgReduceMotion()){ bar.scrollLeft=target; return; }
  const DUR=220, ease=x=>1-Math.pow(1-x,3);
  const anim={target, raf:0};
  let t0=null;
  function step(now){
    if(t0===null) t0=now;
    const p=Math.min(1,(now-t0)/DUR);
    bar.scrollLeft=from+dist*ease(p);
    if(p<1 && eTabScrollAnim===anim) anim.raf=requestAnimationFrame(step);
    else if(eTabScrollAnim===anim) eTabScrollAnim=null;
  }
  anim.raf=requestAnimationFrame(step);
  eTabScrollAnim=anim;
}
/* One button press moves by most of a strip, not by a fixed pixel step: the strip is the unit
   the eye reads, and a 20px nudge on a 400px row needs twenty presses. The overlap keeps one
   tab of context across the jump so nothing is skipped unseen. */
function scrollTabsBy(dir){
  const bar=$("#tabsBar"); if(!bar) return;
  const base=eTabScrollAnim ? eTabScrollAnim.target : bar.scrollLeft;
  animateTabScroll(base + dir*Math.max(80, bar.clientWidth-60));
}
function bindTabScroll(){
  const bar=$("#tabsBar"), prev=$("#tabsPrev"), next=$("#tabsNext");
  if(!bar||bindTabScroll._done) return;
  bindTabScroll._done=true;
  if(prev) prev.onclick=()=>scrollTabsBy(-1);
  if(next) next.onclick=()=>scrollTabsBy(1);
  bar.addEventListener("scroll", updateTabOverflow, {passive:true});
  /* A vertical wheel over a horizontal strip scrolls it sideways - the gesture people already
     have for this, and what every browser's own tab bar does. Only when the strip actually
     overflows, so a wheel over a short row still scrolls the page underneath. */
  bar.addEventListener("wheel", e=>{
    if(bar.scrollWidth-bar.clientWidth<=TAB_SCROLL_EPS) return;
    if(Math.abs(e.deltaY)<=Math.abs(e.deltaX)) return;
    e.preventDefault();
    /* deltaMode is not decoration. Firefox notched wheels report LINES (deltaY = ±3,
       mode 1), so the raw value that scrolls a whole notch's worth in Chrome moves this
       strip three pixels there. Pages (mode 2) get the visible strip. */
    let d=e.deltaY;
    if(e.deltaMode===1) d*=24; else if(e.deltaMode===2) d*=bar.clientWidth;
    /* Notch-sized packets ride the animator, and accumulate exactly as the arrows do - three
       quick clicks of a wheel are three steps of one journey, not three restarts. Continuous
       pixel-mode packets (trackpads) write directly: the gesture is already an animation, and
       easing every 2px parcel would put lag between finger and strip. */
    if(Math.abs(d)>=50){
      const base=eTabScrollAnim ? eTabScrollAnim.target : bar.scrollLeft;
      animateTabScroll(base+d);
    } else {
      cancelTabScroll();
      bar.scrollLeft+=d;
    }
  }, {passive:false});
  if(typeof ResizeObserver==="function"){
    const ro=new ResizeObserver(()=>{
      if(typeof tabInsertAnimating!=="undefined" && tabInsertAnimating) return;
      /* The wrap's width changes UNDER the strip with no window resize - the rail docking,
         the wordmark leaving, the Ctrl overlap rung - and a bar holding the width
         computed for the OLD room pushes the + into the row's tools. Re-fit whenever the
         wrap is not the width the last pass produced; the ringing guard is exact:
         applyTabWidths records the wrap width it made, an unchanged re-fit records the
         same number, and the observer goes quiet. */
      const w=$("#tabsWrap");
      if(w && Math.abs(w.clientWidth-(applyTabWidths._wrapW||0))>1) applyTabWidths();
      else updateTabOverflow();
    });
    ro.observe(bar);
    const wrap=$("#tabsWrap"); if(wrap) ro.observe(wrap);
  }
}
function applyTabWidths(){
  const bar=$("#tabsBar");
  const wrap=$("#tabsWrap")||(bar&&bar.parentElement);
  if(!bar||!wrap) return;
  const tabEls=[].slice.call(bar.querySelectorAll(".tab"));
  const n=tabEls.length;
  if(!n) return;
  const tabMargin=3;   // .tab margin-right (last tab 0 - see CSS)
  const barPadX=0;     // .tabs-bar has no padding (folder look)
  const add=wrap.querySelector(".tab-add");
  const addW=add?(add.getBoundingClientRect().width+(parseFloat(getComputedStyle(add).marginLeft)||0)):24;   // the rect stops at the border; the margin is the strip's too
  // Space for tabs = wrap minus + (bar no longer flex-shrinks under the +).
  /* The inter-tab margins are NOT subtracted here: every comparison below puts them on
     the other side of the inequality (n*w+margins vs hardAvail), and subtracting them up
     front as "chrome" counts them twice. */
  const margins=(n>0? (n-1)*tabMargin : 0); // last tab margin-right is 0
  /* The ARROWS are chrome too, and cost the row their width exactly as the + does. The
     + must never leave, so its space is reserved always; the arrows' whenever they show.
     Reading the class rather than predicting it keeps this one-directional:
     updateTabOverflow sets it from a measurement at the END of this function, and a
     change there asks for one more pass, which settles - the space is already there. */
  const NAV_W=40;   // 2 x .tabs-nav width - keep in step with the stylesheet
  /* MEASURE UNDER ZERO PRESSURE. The wrap is flex-basis:auto - content-sized - so reading
     it cold returns an ECHO of whatever bar this function wrote last time; and probing
     with a GIANT bar squeezes every sibling in proportion to what it currently holds, so
     the grant depends on the layout the pass STARTED from - two fixed points per shed
     state, and every decision rule reading the strip flipped between them at rAF speed.
     So ask with NOTHING instead: bar at zero width. No sibling is squeezed - everyone sits
     at natural size - and the zero-pressure layout is UNIQUE, so the measurement cannot
     depend on history. The ceiling is then simply the wrap plus the row's leftover free
     space, both read directly; gaps and paddings are implicit in the geometry rather than
     hand-modelled. Floored, so sub-pixel noise cannot flip a knife edge. One extra reflow
     inside one synchronous pass; nothing paints. */
  /* The CAP breathes with the window: 15% is 210 exactly at the app's own 1400px ceiling,
     so wide screens see no change and narrowing ones watch the tabs ease down in step
     rather than resist and snap. */
  const wCap=Math.min(210, Math.floor(innerWidth*0.15));
  /* THE CAP MAY NEVER UNDERCUT THE FLOOR. Below ~667px the 15% cap falls under TAB_FLOOR_W,
     and a min() applied last let it win: tabs sank beneath the floor and labels truncated
     where the floor promises they never do. Cap first, floor last, and only here - the three
     shares below all pass through this. */
  const boundW=share=>Math.max(TAB_FLOOR_W, Math.min(wCap, share));
  bar.style.transition="";
  /* The probe has a side effect the layout alone does not show: while the bar is momentarily
     at zero width its scroll range is zero, and the browser CLAMPS scrollLeft to 0 -
     permanently, because a later legal range does not restore a clamped position. Every
     drawTabs was therefore silently resetting a scrolled strip (found when drag auto-scroll
     could not hold a position: each swap redrew, each redraw zeroed). The position is STATE,
     not layout; save it across the probe and put it back once the real width is in place. */
  const stash=(typeof drawTabs!=="undefined" && drawTabs._keepScroll!=null)?drawTabs._keepScroll:null;
  const stashEnd=(typeof drawTabs!=="undefined" && drawTabs._keepAtEnd===true);
  if(typeof drawTabs!=="undefined"){ drawTabs._keepScroll=null; drawTabs._keepAtEnd=null; }
  const sl0=(stash!=null)?stash:bar.scrollLeft;   // the pre-wipe reading outranks a possibly-clamped live one
  /* End-anchoring: computed from the stash when there is one, else from the live geometry
     BEFORE the probe distorts it. Not-overflowing counts as NOT at the end - otherwise a
     fitting strip that grows into overflow would leap to the far side instead of letting the
     insert pin stage the reveal. */
  const wasAtEnd=(stash!=null)?stashEnd
    :((bar.scrollWidth-bar.clientWidth>1)&&(sl0>=bar.scrollWidth-bar.clientWidth-1));
  bar.style.flex="0 0 0px"; bar.style.width="0px";
  bar.style.minWidth="0px"; bar.style.maxWidth="0px";
  /* Asked twice when the wordmark moves, so the second answer is the settled one. Valid to
     repeat only because the bar is still at zero: the zero-pressure layout is unique. */
  const askGrant=()=>{
    const rowEl=$(".row")||wrap.parentElement;
    const rowRect=rowEl.getBoundingClientRect();
    const rowPadR=parseFloat(getComputedStyle(rowEl).paddingRight)||0;
    let lastRight=0;
    for(const c of rowEl.children){ const r=c.getBoundingClientRect(); if(r.right>lastRight) lastRight=r.right; }
    return Math.floor(wrap.clientWidth+Math.max(0,(rowRect.right-rowPadR)-lastRight));
  };
  let grantW=askGrant();
  /* THE WORDMARK GOES WHEN THE STRIP RUNS OUT OF ROOM, AND IT IS DECIDED HERE, beside the
     arrows rather than in the shed a second later. Deciding the arrows first published a
     scrolling strip on a grant about to grow by the wordmark: the arrows appeared, the shed
     took the name when the insert animation ended, and the arrows left again - 56 frames of
     it. ASKED WITH THE WORDMARK SHOWN whatever is on screen, since its own width is what the
     strip would gain; a live reading fits, hands it back, stops fitting, and rings. */
  const wmW=(typeof eShedNat!=="undefined" && eShedNat && eShedNat.wordmark>0) ? eShedNat.wordmark : 0;
  const wasTight=document.body.classList.contains("strip-tight");
  let shedOwn=null;
  if(wmW>0){
    const floorNeed=n*TAB_FLOOR_W+(n>0?(n-1)*tabMargin:0)+barPadX;
    const shown=(grantW-(wasTight?wmW:0))-addW;
    const tight=wasTight ? shown<floorNeed+8 : shown<floorNeed;   // 8px back, as the rungs use
    if(tight!==wasTight){
      /* Taken BEFORE the toggle and played at the foot, once the arrows have been decided too:
         the two are one movement or they are two events. */
      if(!shedHeld) shedOwn=shedSnap();
      document.body.classList.toggle("strip-tight",tight);
      grantW=askGrant();
    }
  }
  /* Published for the shed algorithm: the GRANT is the strip's potential room, and it is
     the only honest thing to hold against the covenant. The wrap's clientWidth is merely
     current CONTENT - two capped tabs in a maximized window measure ~294px while the row
     would grant 500+ - and holding content against the covenant vetoes legitimate returns
     whenever few tabs keep the content small. Room available, not room used. */
  applyTabWidths._grantW=grantW;
  /* TWO-PHASE, ARROWS DECIDED BY ARITHMETIC ALONE. Phase one assumes no arrows and asks
     whether the content fits the room; only if it cannot is the room recomputed with the
     arrow slots reserved. The decision consults content versus grant - both pure functions
     of (viewport, shed state, tab count) - and never the arrows' current visibility, which
     is a RESULT of this computation and must not be an input to it. */
  const availNoNav=Math.max(0, grantW-addW);
  const wNoNav=boundW(Math.floor((availNoNav-margins)/n));
  const fitsNoNav=(n*wNoNav+margins+barPadX)<=availNoNav;
  const hardAvail=fitsNoNav ? availNoNav : Math.max(0, availNoNav-NAV_W);
  const preferAvail=hardAvail;
  /* THE FLOOR IS WHERE SHRINKING STOPS AND SCROLLING STARTS. Tabs still narrow as the
     window narrows - that part stays. At the floor, everything that does not fit is
     reached by scrolling, instead of being squeezed unreadable or clipped off the end. */
  /* The margins come out of the share, not off the total: nothing squeezes any more, so a
     share computed from the raw width overflows by exactly the margin total and the
     arrows appear a whole tab before they are needed. */
  const w=boundW(Math.floor((preferAvail-margins)/n));
  /* Content first, then the row's own limit. When the content is wider than the row the bar
     takes the full available width and scrolls inside it; when it is narrower the bar shrinks
     to the content so the + button still sits immediately after the last tab rather than
     floating at the end of an empty strip. */
  const contentW=n*w+margins+barPadX;
  const barW=Math.min(contentW, hardAvail);
  bar.style.flex="0 0 "+barW+"px";
  bar.style.width=barW+"px";
  bar.style.minWidth=barW+"px";
  bar.style.maxWidth=barW+"px";
  tabEls.forEach(el=>{
    el.style.flex="0 0 "+w+"px";
    el.style.width=w+"px";
    el.style.maxWidth=w+"px";
    el.style.minWidth=w+"px";   // w, not a literal - boundW above already applied the floor
  });
  bar.scrollLeft=sl0;   /* first restore - the staircase below reads geometry and must not read
                           it at the probe's clamped zero; the FINAL restore comes after
                           the staircase, because shrinking the bar grows the scroll range
                           and a position restored before that lands short of the end by
                           exactly the correction. */
  updateTabOverflow();
  /* THE PROBE'S GRANT IS OPTIMISTIC BY A HAIR; the settled geometry gets the last word.
     Flex distributes shortage in proportion to basis, so the ceiling ask pulls slightly
     more out of the siblings than the real, smaller request will hold - the + ends a few
     px outside the wrap. After the real write, read where the LAST piece of chrome
     landed and take any overhang straight off the bar. Tabs keep their widths (a
     narrower bar is simply more scrolling); _wrapW records the corrected state, which
     keeps the ResizeObserver quiet. */
  if(add){
    /* A STAIRCASE, NOT A STEP. Shrinking the bar by the overhang does not remove the
       overhang: the smaller request lets every sibling reclaim a share of what was
       released, and ~0.7 of it survives each exact step - the row's geometry, not a bug.
       Eight steps bound the remainder below sub-pixel for anything a header can produce;
       the loop also stops the moment the overhang is under half a pixel, and in the wide
       case the first measurement is already there. */
    let bw=barW;
    for(let i=0;i<10;i++){
      const overhang=add.getBoundingClientRect().right-wrap.getBoundingClientRect().right;
      if(overhang<=0.5) break;
      /* 1.5x, not 1x: an exact step leaves ~0.7 of the overhang behind, so eight exact steps
         still carried pixels across a large resize. Overshooting by half kills the tail in
         two or three steps; the worst case is a bar a couple of pixels narrower than
         optimum - a sliver more scrolling inside the strip, invisible - where the
         undershoot's failure was chrome outside the wrap. Err toward the failure that
         cannot be seen. */
      bw=Math.max(40, bw-Math.ceil(overhang*1.5));
      bar.style.flex="0 0 "+bw+"px"; bar.style.width=bw+"px";
      bar.style.minWidth=bw+"px";    bar.style.maxWidth=bw+"px";
    }
    if(bw!==barW) updateTabOverflow();
    /* THE SHARE ANSWERS TO THE SETTLED BAR. The tab widths above were computed against the
       probe's optimistic grant; when the staircase takes the bar down to the room the row
       actually kept, tabs sized for the bigger room leave the strip scrolling a handful of
       oversized tabs. One corrective re-share against the final bar: floor-bounded, so it
       either fits outright or sits honestly at the floor and scrolls only the floor's own
       overflow. */
    if(bw<contentW-1){
      const w2=boundW(Math.floor((bw-margins-barPadX)/n));
      if(w2<w){
        tabEls.forEach(el=>{
          el.style.flex="0 0 "+w2+"px"; el.style.width=w2+"px";
          el.style.maxWidth=w2+"px";    el.style.minWidth=w2+"px";
        });
        updateTabOverflow();
      }
    }
  }
  /* The last word on the scroll position, against the FINAL geometry. A strip that was at its
     end goes to the NEW end - scrollWidth self-clamps to the maximum, wherever the redraw and
     the staircase moved it. Anything else restores the number, clamped by the browser. */
  bar.scrollLeft=wasAtEnd ? bar.scrollWidth : sl0;
  updateTabOverflow();
  // What this pass made of the wrap - the ResizeObserver in bindTabScroll compares against it.
  applyTabWidths._wrapW=wrap.clientWidth;
  if(shedOwn) shedAnimate(shedOwn);
}

/** Tab labels: the whole name, always. What will not fit is faded off by the sweep that
 *  cuts every other line in the app, and the tooltip carries what the fade took. */
function fitTabLabels(){
  const bar=$("#tabsBar");
  if(!bar) return;
  /* Not while a tab is growing in. drawTabs() schedules one of these on the next frame, which
     lands mid-animation and measures boxes still moving, fitting every label to a half-width
     tab. The fit is already done for the FINISHED widths by the synchronous call inside
     drawTabs; nothing changes until the boxes stop. animateTabInsert() clears the flag and
     calls this once at the end. */
  if(tabInsertAnimating) return;
  const tabEls=[].slice.call(bar.querySelectorAll(".tab"));
  if(!tabEls.length) return;

  applyTabWidths();

  const rows=[];
  tabEls.forEach((el,i)=>{
    const idx=tabs.findIndex(x=>x.id===el.dataset.tid);
    const ti=idx>=0?idx:i;
    /* `tb`, not `t`: t() is the translation function, and a local of that name breaks
       every translated string in the same scope rather than the line that declares it. */
    const tb=idx>=0?tabs[idx]:null;
    const name=tabLabel(tb, ti);
    const span=el.querySelector(".tab-label>span");
    if(!span) return;
    if(span.textContent!==name) span.textContent=name;
    rows.push({el:el,span:span,name:name});
  });
  /* Every name written before any is measured: a read between two writes lays the strip out
     again for each tab, which is the rule writePillCounts follows for the same reason. */
  for(let i=0;i<rows.length;i++){
    const r=rows[i], c=cutSides(r.span), cut=c.l||c.r;
    applyCut(r.span,c);
    /* A name the strip has faded has nowhere else to be read, so the tooltip carries it. */
    r.el.title=(cut ? r.name+" · " : "")+t("Click to switch, or drag to reorder");
  }
}
/* One swatch per filtered category, in the order they were picked: one paints the dot its
   own hue flat, several blend across it. No filter at all returns nothing - the dot falls
   back to white, because the tab is showing everything and no hue is truer than any other. */
function tabAccentSlots(list){
  const c=(list||[]).filter(Boolean);
  return c.map(id=>catSlot(id)).filter(n=>n>=0);
}
/* The first category travels as data-ec, through the same [data-ec] -> --ecat plumbing
   the pills and cards already use, so nothing here knows what colour it is. The rest can't:
   a gradient is one value built from many, so it is composed here - still out of the same
   --e-c* tokens, so the themes keep control of the actual colours. */
function syncTabAccent(){
  document.querySelectorAll(".tab").forEach(el=>{
    /* The SELECTED tab's filter lives in `cats`, not in its stored object: that copy is only
       written back when the tab is saved, so reading it here would show the previous state
       until something else triggered a save. Every other tab has nothing live to read and
       its stored cats are exactly right. */
    let list;
    if(el.classList.contains("on")){
      list=(typeof cats!=="undefined"&&cats)?cats:[];
    }else{
      const tb=(typeof tabs!=="undefined"&&tabs)?tabs.find(x=>x.id===el.dataset.tid):null;
      list=(tb&&Array.isArray(tb.cats))?tb.cats:[];
    }
    const n=tabAccentSlots(list);
    delete el.dataset.ec;
    el.style.removeProperty("--tab-accent-img");
    if(n.length>=1) el.dataset.ec=String(n[0]);
    if(n.length>1){
      el.style.setProperty("--tab-accent-img",
        "linear-gradient(90deg,"+n.map(i=>"var(--e-c"+i+")").join(",")+")");
    }
  });
}
/* drawPills and drawTabs are wrappers and the Core functions do the drawing, which is
   drawIntentRail's shape: an accent follows every redraw of either bar, and an early return
   inside a Core must not skip it. The wrapping is a declaration rather than an assignment to
   the name, because an imported binding cannot be assigned. */
function drawPills(){ const r=drawPillsCore.apply(this,arguments); syncTabAccent(); return r; }
function drawTabs(){ const r=drawTabsCore.apply(this,arguments); syncTabAccent(); return r; }
function tabAddTitle(){
  return t("New tab (same shared settings; cleared PAX, intent, ROLE, categories)")+" ("+formatActionChord("tabNew")+")";
}
function drawTabsCore(){
  const bar=$("#tabsBar");
  if(!bar) return;
  /* Stash the scroll BEFORE the wipe. The innerHTML rebuild leaves the bar briefly holding
     children at their stylesheet widths, and if those happen to fit inside the bar's stale
     inline width, the first layout in that window clamps scrollLeft to 0 - before
     applyTabWidths' own preservation can read it. With the stash, closing the last tab
     from the far end restores the old maximum, the browser clamps it to the NEW maximum,
     and the strip lands scrolled all the way right with the new last tab whole. */
  drawTabs._keepScroll=bar.scrollLeft;
  /* AND whether that position meant "at the end" - because the end is a PLACE, not a
     number. A redraw can legitimately move the maximum (closing a tab shrinks content; a
     shed step returning the wordmark narrows the wrap), and a preserved NUMBER then
     lands short of the moved end by exactly the delta. A strip that was at its end stays
     at its end. */
  drawTabs._keepAtEnd=(bar.scrollWidth-bar.clientWidth>1)&&(bar.scrollLeft>=bar.scrollWidth-bar.clientWidth-1);
  bar.innerHTML="";
  tabs.forEach((tb,i)=>{
    const b=document.createElement("div");
    b.className="tab"
      +(tb.id===activeTabId?" on":"")
      +(tabDrag&&tabDrag.moved&&tabDrag.key===tb.id?" dragging":"");
    b.dataset.tid=tb.id;
    b.title=t("Click to switch, or drag to reorder");
    const lab=document.createElement("span");
    lab.className="tab-label";
    const name=tabLabel(tb,i);
    const labViz=document.createElement("span");
    labViz.textContent=name;
    lab.appendChild(labViz);
    const x=document.createElement("button");
    x.type="button";
    x.className="tab-x";
    x.title=t(tabs.length===1?"Clear tab fields":"Close tab");
    x.setAttribute("aria-label", t(tabs.length===1?"Clear tab":"Close tab"));
    x.innerHTML=ICON_TAB_X;
    x.onclick=e=>closeTab(tb.id,e);
    b.appendChild(lab);
    b.appendChild(x);
    b.onpointerdown=e=>{
      if(e.pointerType==="touch") return;   // taps are taps - see the rail rows for the story
      if(e.button!==0) return;
      if(e.target.closest(".tab-x")) return;
      tabSuppressClick=false;
      tabDrag={key:tb.id,x:e.clientX,y:e.clientY,moved:false};
    };
    b.onclick=e=>{
      if(tabSuppressClick){ tabSuppressClick=false; return; }
      if(e.target.closest(".tab-x")) return;
      switchTab(tb.id);
    };
    bar.appendChild(b);
  });
  const wrap=$("#tabsWrap")||bar.parentElement;
  // Rebuild + outside .tabs-bar so overflow:hidden never clips it when tabs are at min-width
  if(wrap){
    wrap.querySelectorAll(".tab-add").forEach(el=>el.remove());
    const add=document.createElement("button");
    add.type="button";
    add.className="tab-add";
    add.title=tabAddTitle();
    add.setAttribute("aria-label",t("Add tab"));
    add.innerHTML='<span class="tab-add-mark">'+ICON_TAB_ADD+'</span>';
    /* Never disabled: the + is the one control that must always work - see addTab(). */
    add.onclick=()=>addTab();
    wrap.appendChild(add);
  }
  bindTabScroll();
  // Measure after layout; rAF covers first paint / flex settling
  fitTabLabels();
  requestAnimationFrame(fitTabLabels);
  // NOT because tab count decides anything - the covenant is a constant, and opening a tab
  // must never move header furniture. This re-ask exists because a redraw can land after a
  // width change the debounced resize pass has not yet absorbed; on unchanged inputs the
  // sync is a pure no-op. Coalesced, so a burst of redraws costs one pass.
  if(typeof scheduleHeaderSync==="function") scheduleHeaderSync();
}
// Re-fit tab labels when the window (or bar) width changes - names and their stubs
// Document-level listeners: drawTabs rebuilds nodes mid-drag
/* The swap test, shared by the pointermove handler and the edge auto-scroll loop below. Client
   coordinates against live layout throughout, which is what lets it keep working while the
   strip scrolls under the pointer. */
function tabDragCheck(cx,cy){
  if(!tabDrag||!tabDrag.moved) return;
  if(Date.now()-tabSwapLock<120) return;
  const under=document.elementFromPoint(cx,cy);
  const t=under&&under.closest?under.closest(".tab[data-tid]"):null;
  if(!t||t.dataset.tid===tabDrag.key) return;
  const from=tabs.findIndex(x=>x.id===tabDrag.key);
  const to=tabs.findIndex(x=>x.id===t.dataset.tid);
  if(from<0||to<0||from===to) return;
  // Swap once the pointer reaches ~1/4 into the other tab (not the far edge alone).
  const rect=t.getBoundingClientRect();
  const q=rect.width*0.25;
  if(from<to && cx<rect.left+q) return;          // dragging right: past left quarter
  if(from>to && cx>rect.right-q) return;         // dragging left: past right quarter
  tabSwapLock=Date.now();
  moveTab(from,to);
}
/* EDGE AUTO-SCROLL. Once the strip scrolls, a drag target can be BEHIND the aperture -
   elementFromPoint at the edge returns the arrow or the wall, and the drag stalls with no
   way to reach a hidden tab. So a drag held near either edge of the bar scrolls it, faster
   the deeper into the zone, exactly as every browser's own strip does.
   The loop re-runs the swap test with the pointer's LAST position each frame: the strip
   moving under a stationary pointer changes what is under it, and without the re-test
   autoscroll carries the drag past its target until the hand moves again. */
function tabDragAutoScroll(){
  if(!tabDrag||!tabDrag.moved) return;
  const bar=$("#tabsBar");
  if(bar && tabDrag.cx!=null){
    const br=bar.getBoundingClientRect(), ZONE=28;
    let v=0;
    if(tabDrag.cx<br.left+ZONE)       v=-Math.min(12, 3+(br.left+ZONE-tabDrag.cx)/4);
    else if(tabDrag.cx>br.right-ZONE) v= Math.min(12, 3+(tabDrag.cx-(br.right-ZONE))/4);
    if(v){
      cancelTabScroll();               // an arrow press must not fight the drag
      bar.scrollLeft+=v;
      /* Check even when the strip is pinned at its end and the assignment moved nothing: the
         pointer is parked over a real target there, and gating the check on scroll
         movement leaves the drag stalled one tab short of the far edge. The swap lock
         already bounds the rate. */
      tabDragCheck(tabDrag.cx, tabDrag.cy);
    }
  }
  requestAnimationFrame(tabDragAutoScroll);
}
addEventListener("pointermove",e=>{
  if(!tabDrag) return;
  if(!tabDrag.moved){
    if(Math.abs(e.clientX-tabDrag.x)+Math.abs(e.clientY-tabDrag.y)<5) return;
    tabDrag.moved=true;
    document.documentElement.classList.add("tabdrag");
    const el=$("#tabsBar")&&$("#tabsBar").querySelector('.tab[data-tid="'+tabDrag.key+'"]');
    if(el) el.classList.add("dragging");
    requestAnimationFrame(tabDragAutoScroll);
  }
  tabDrag.cx=e.clientX; tabDrag.cy=e.clientY;
  tabDragCheck(e.clientX,e.clientY);
},{passive:true});
addEventListener("pointerup",endTabDrag);
addEventListener("pointercancel",endTabDrag);
function initTabs(){
  if(!loadTabSession()){
    const t=blankTab();
    // Seed first tab from legacy single-session storage (one-time migration)
    try{
      if(lsGet("pbPax")) t.pax=lsGet("pbPax");
      if(lsGet("pbWho")) t.who=lsGet("pbWho");
    }catch(_){}
    tabs=[t];
    activeTabId=t.id;
  }
  const cur=tabs.find(x=>x.id===activeTabId)||tabs[0];
  applyTab(cur);
  saveTabSession();
  addEventListener("beforeunload", saveTabSession);
}

rebuildCards();
syncAgent();
applyLangUI(lang);   // initTabs() -> applyTab() installs the tab's own language and renders
rebuildRailMQ();     // the dock threshold, now that the column geometry it reads is declared
syncRailLayout();
/* Collapse the category bar NOW, in the same task as the first render. drawPills()
   ends in schedulePillsCollapse(), which waits two rAFs to measure a settled layout -
   right for a resize, wrong for boot, where syncRailLayout() settled it synchronously a
   line above: the wait painted two frames of a full-height bar, and everything below
   jumped when the clip arrived. The scheduled pass still runs and corrects anything that
   settles late; this one only makes sure the first frame is not wrong. */
syncPillsCollapse();
drawIntentRail();
initTabs();
/* Boot is painted, so a saved interface language may repaint the chrome. Two frames, so the
   first paint and the frame that settles after it are both behind us. With a timeout behind
   THAT, because rAF DOES NOT RUN IN A HIDDEN TAB: restored into a background tab the class
   would never arrive - the same trap that kept schedulePillsCollapse's two-frame wait from
   ever firing there. First one wins. */
let eReadyDone=false;
function markEReady(){
  if(eReadyDone) return;
  eReadyDone=true;
  /* A saved interface language repaints the chrome once the markup exists. The HTML ships
     English, so this is the only moment a Polish build stops looking English. */
  applyUiLang();
}
requestAnimationFrame(()=>requestAnimationFrame(markEReady));
setTimeout(markEReady,300);

// On open: focus the first copyable entry so ↑↓ work immediately (no INTENT capture).
// INTENT still receives typing when the user starts typing (global keydown → intent field).
function focusFirstEntryOnOpen(){
  try{
    const a=document.activeElement;
    if(a&&a!==document.body&&typeof a.blur==="function") a.blur();
  }catch(_){}
  const els=listEntryEls();
  if(!els.length) return;
  const el=els[0];
  const card=el.closest(".card[data-id]");
  if(!card) return;
  setEntrySel(card.dataset.id, +el.dataset.v, {scroll:false, smooth:false});
}
// Back-compat name used after tour
function focusIntentOnOpen(){ focusFirstEntryOnOpen(); }
focusFirstEntryOnOpen();
// Re-assert after layout (paint / sticky chrome can steal focus)
requestAnimationFrame(()=>requestAnimationFrame(focusFirstEntryOnOpen));

// A shift crosses 12:00 or 18:00 with the page still open - re-render on the boundary
// so the greeting never goes stale mid-session.
let lastGreet=greeting();
setInterval(()=>{ const g=greeting(); if(g!==lastGreet){ lastGreet=g; render(); } }, 30000);

// ---- at load: the tour wiring and its first-run invite, and the sample mark --------
wireTourUi();
syncSampleMark();
maybeShowTourInvite();
/* A catalog sitting beside Etiuda is offered, never forced. Asked once per signature:
   accept it and it loads silently from then on, change it and you are asked again, so what
   you are running is always something you agreed to. Declining is remembered too, so the
   bar does not nag on every launch. */
function eOfferCatalog(){
  // An integrated build carries its own content; a sibling file is not its business
  if(eEmbeddedCatalog()) return;
  const c=eCatalog();
  if(!c) return;
  if(!storedCatalog() && eCatalogAccepted(c)) return;
  eOfferCatalogDialog(c,{
    foundHtml:esc(t("Located as"))+' <code>etiuda-catalog.js</code>.',
    refusedKey:"CatalogNo",
    accept:(sig,updating)=>{ lsSet(E_CATALOG_KEY,sig); return activateCatalog(c,{keepPersonal:updating}); }
  });
}
/* Both channels end here: same guards, same wording, same promise about what is kept.
   Returns whether anything was actually put on screen, which is how an explicit check
   knows to say the file matched. */
function eOfferCatalogDialog(c,src){
  const sig=eCatalogSignature(c);
  /* Silent when the sibling is already what is loaded. Offered when nothing is loaded, and
     also when something different is loaded - editing the sibling file, or importing another
     catalog, both surface here rather than being applied behind the user's back. */
  const active=storedCatalog();
  if(active && eCatalogSignature(active)===sig) return false;
  /* A refusal is remembered so boot does not nag, but ASKING outranks it: an explicit check
     that answered "already have it" about a file you declined would simply be untrue. */
  if(!src.force && src.refusedKey && nsGet(src.refusedKey)===sig) return false;
  if(document.getElementById("eCatalogModal")) return false;
  const replacing=!!active;
  const updating=isCatalogUpdate(c,active);
  const older=updating && catalogEditionOlder(c.version, active.version);
  const n=(c.cards||[]).length,
        i=((c.intents||{}).en||[]).length,
        k=Object.keys(c.categories||{}).length;
  const wrap=document.createElement("div");
  wrap.className="modal";
  wrap.id="eCatalogModal";
  wrap.innerHTML='<div class="modal-bg"></div><div class="modal-card">'
    +'<h2>'+esc(t(older?"Older catalog found":updating?"Updated catalog found"
        :replacing?"Different catalog found":"Load catalog?"))+'</h2>'
    +(replacing
        ? '<p class="modal-sub">'+esc(t(older
            ? "The file beside Etiuda is an earlier edition than the one you have."
            : updating
            ? "The catalog beside Etiuda has changed since you loaded it."
            : "The file beside Etiuda no longer matches what is loaded."))+'</p>'
        : '')
    /* Name and edition on one line, counts on the next. The date belongs with the name - the
       two together are WHICH catalog this is, and the counts are how big it is - and moving it
       up also takes about ninety pixels off a line that was wrapping at 430px and stranding
       "categories" on its own. */
    +'<div class="about-body"><b>'+esc(String(c.name||"Catalog"))+'</b>'
    +(c.version!=null?' · '+esc(catalogVersionLabel(c.version)):'')
    +(updating && active.version!=null && String(active.version)!==String(c.version)
        ? '<div class="ec-counts">'+esc(t("You have {V}.")).replace("{V}",esc(catalogVersionLabel(active.version)))+'</div>'
        : '')
    // Non-breaking spaces still hold each number to its noun, so any break lands on a separator.
    +'<div class="ec-counts">'
    /* A single text node, which the sweep cannot reach inside: the line is built from counted
       noun phrases and the key carries only their order. */
    +catalogCountsLine("{CARDS} · {MACROS} · {INTENTS} · {CATEGORIES}",
       n, catalogMacroCount(c), i, k)
    +'</div></div>'
    /* The filename is an element, so this paragraph is not a leaf and the sweep would skip
       it - each half is translated where it is written, and the <code> stays between them. */
    +'<p class="modal-sub" style="margin:10px 0 0">'+src.foundHtml
    +(replacing?' '+esc(t(updating?"Your own cards and edits are kept.":"Loading it replaces the catalog you have now.")):'')+'</p>'
    +'<div class="modal-actions">'
    +'<button type="button" class="btn" id="ecNo">'+esc(t(replacing?"Keep current":"Start empty"))+'</button>'
    +'<button type="button" class="btn primary" id="ecYes">'+esc(t(older?"Load it anyway":updating?"Load the update":replacing?"Load it":"Load catalog"))+'</button>'
    +'</div></div>';
  document.body.appendChild(wrap);
  /* Whichever way this closes without loading, the "New here?" invite takes its turn - it was
     held back while this was open, and it is the only thing left offering a way in. */
  const close=()=>{
    document.removeEventListener("keydown", onKey, true);
    wrap.remove();
    maybeShowTourInvite();
  };
  /* Esc closes without recording a refusal, so a stray keypress cannot permanently suppress
     the offer - it simply returns next launch. Only the explicit "Start empty" is remembered.
     Captured and stopped so the app's own Esc handling does not also fire underneath. */
  function onKey(e){
    if(e.key!=="Escape") return;
    e.preventDefault(); e.stopPropagation();
    close();
  }
  document.addEventListener("keydown", onKey, true);
  /* Reloads on success, so nothing after it runs, and the invite appears on the far side by
     itself, reading the loaded catalog and offering the plain tour rather than the sample.
     Storage that refuses the catalog returns false instead, and the offer has to come down:
     left standing over its own failure toast it reads as a button that does nothing. */
  wrap.querySelector("#ecYes").onclick=()=>{ if(src.accept(sig,updating)===false) close(); };
  wrap.querySelector("#ecNo").onclick=()=>{
    if(src.refusedKey) nsSet(src.refusedKey,sig);
    close();
    toast(replacing?"Keeping the loaded catalog.":"Starting empty. Load one any time from the Library.");
  };
  const yes=wrap.querySelector("#ecYes");
  if(yes && typeof yes.focus==="function") yes.focus();
  return true;
}
/* The watched file. Silent at boot and only while the browser still holds permission:
   re-granting needs a user gesture, which is what `interactive` supplies. The stored edit
   time is a skip, not the answer - the signature decides whether anything really changed. */
function eCheckWatchedFile(interactive){
  if(!eWatchSupported()) return;
  if(document.getElementById("eCatalogModal")) return;
  eWatchGet().then(h=>{
    if(!h){ if(interactive) toast(t("No catalog file is being watched.")); return null; }
    const q=h.queryPermission?h.queryPermission({mode:"read"}):"granted";
    return Promise.resolve(q).then(state=>{
      if(state==="granted") return h;
      if(!interactive) return null;
      return h.requestPermission({mode:"read"}).then(v=>v==="granted"?h:null);
    }).then(ok=>{
      if(!ok){ if(interactive) toast(t("Etiuda needs permission to read that file again.")); return null; }
      return ok.getFile().then(f=>{
        const seen=nsGet("WatchSeen");
        if(!interactive && seen && String(f.lastModified||0)===seen) return null;
        nsSet("WatchSeen",String(f.lastModified||0));
        return f.text().then(text=>{
          let c=null;
          try{ c=parseCatalogFile(text); }
          catch(e){ if(interactive) toast(t("That file is not a catalog Etiuda can read.")); return null; }
          const shown=eOfferCatalogDialog(c,{
            foundHtml:esc(t("Located as"))+' <code>'+esc(eWatchName()||f.name)+'</code>.',
            refusedKey:"WatchNo", force:!!interactive,
            accept:(sig,updating)=>activateCatalog(c,{keepPersonal:updating})
          });
          if(!shown && interactive) toast(t("That file matches the catalog you already have."));
          return null;
        });
      });
    });
  }).catch(()=>{ if(interactive) toast(t("Could not read the watched file.")); });
}
eOfferCatalog();
/* The sibling channel is synchronous and free, so it goes first and this only speaks if it
   left the screen clear. */
setTimeout(()=>{ try{ eCheckWatchedFile(false); }catch(e){} }, 900);

/* ---- Macro search is a drill-down, not a resting state: entered for one lookup, it
   stays until something leaves it - and the first act after stepping away is almost
   always a NEW chat, which begins with an intent. So: return to the window with the
   query box untouched, and the box goes back to intents on its own. Three guards, each
   the difference between helpful and infuriating: only when the query is EMPTY (nothing
   typed is ever discarded); only after a real absence (30s - alt-tabbing to read a
   booking leaves the mode alone); only from macro mode. blur/focus, not
   visibilitychange: switching to the chat window does not always hide the tab. */



/* ---- Star pop. The moment a favourite turns ON, its own star blooms from the button and
   fades - _STAR, the same path the button draws, so the two can never drift apart. Wired on
   the CAPTURE phase: the button must be read before the app's own click handler toggles the
   state and re-renders the row, after which the node may already be replaced. The bloom is a
   fixed overlay for the same reason - it outlives the re-render. Turning a favourite OFF is
   not a celebration, and reduced motion never spawns one.
   MATCH THE STAR, DO NOT EXCLUDE ITS SIBLINGS: edit, hide and unhide all wear .rail-fav for
   the shared geometry, so a blacklist grows a bug every time one is added. data-fav-intent
   is carried by the star alone. */
document.addEventListener("click",e=>{
  if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const b=e.target&&e.target.closest&&e.target.closest(".star-btn,.rail-fav[data-fav-intent]");
  if(!b||b.classList.contains("on")) return;
  const r=b.getBoundingClientRect();
  const d=document.createElement("div");
  d.className="e-star-pop";
  d.style.left=(r.left+r.width/2)+"px";
  d.style.top=(r.top+r.height/2)+"px";
  d.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true">'+_STAR+'</svg>';
  document.body.appendChild(d);
  d.addEventListener("animationend",()=>d.remove());
  setTimeout(()=>{ if(d.parentNode) d.remove(); },800);
},true);

/* ---- Eye pop: a hide closes an eye, a return opens one, in the buttons' own strokes and the
   button's colour, spawned like the star pop; a card's hide button says which way by its class,
   danger while the card is visible. READ ON THE NEAR SIDE, DRAWN AFTER THE PAINT: rect and
   colour are taken on the capture phase, before the row is replaced; the overlay is added two
   frames on, once the rebuilt list has painted, because the lid is a path animation on the main
   thread and Firefox drops its first frames under that paint. The star rides the compositor. */
let eEyePopN=0;
document.addEventListener("click",e=>{
  if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const b=e.target&&e.target.closest&&e.target.closest('[data-act="hide"],[data-hide-intent],[data-show-intent],[data-hide-card],[data-show-card]');
  if(!b) return;
  const opening=b.hasAttribute("data-show-intent")||b.hasAttribute("data-show-card")
    ||(b.getAttribute("data-act")==="hide" && !b.classList.contains("danger"));
  const r=b.getBoundingClientRect();
  const colour=getComputedStyle(b).color;
  /* The button's own small eye would show through the pop's open one and read as a second
     pupil under the lid, so it steps aside while the pop plays. The row usually re-renders
     the button before the pop ends; if this one survives, it comes back. */
  const ic=b.querySelector("svg"); if(ic) ic.style.visibility="hidden";
  requestAnimationFrame(()=>requestAnimationFrame(()=>{   // after the rebuilt frame has painted - see animateTabInsert
    const d=document.createElement("div");
    d.className="e-eye-pop"+(opening?" open":"");
    d.style.color=colour;
    d.style.left=(r.left+r.width/2)+"px";
    d.style.top=(r.top+r.height/2)+"px";
    const clip="eEyeClip"+(++eEyePopN);   // one clip per pop: two pops can be in flight
    d.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true"><clipPath id="'+clip+'"><path class="lid"/></clipPath>'
      +'<circle class="pupil" cx="10" cy="10" r="2.5" clip-path="url(#'+clip+')"/>'
      +'<path class="lid"/><g class="lashes"><path d="M3.5 12.07l-1.4 1.9"/><path d="M7.2 13.64l-0.7 2.3"/><path d="M12.8 13.64l0.7 2.3"/><path d="M16.5 12.07l1.4 1.9"/></g></svg>';
    document.body.appendChild(d);
    const done=()=>{ d.remove(); if(ic&&ic.isConnected) ic.style.visibility=""; };
    d.querySelector("svg").addEventListener("animationend",e=>{ if(e.target===e.currentTarget) done(); });
    setTimeout(()=>{ if(d.parentNode) done(); },1000);
  }));
},true);

/* ---- Copy wash. Clicking a macro washes THAT block success-green while the toast below
   carries the words - the WHERE at the fingertip, the WHAT where it always was. Click only:
   a keyboard copy already holds the selection ring on the very block it copies. The
   pointerdown distance check keeps a drag-reorder quiet - the app suppresses the copy on a
   drag, so the wash must not fire either. Bubble phase: the app's own handler goes first. */
let eWashDownX=0,eWashDownY=0;
document.addEventListener("pointerdown",e=>{ eWashDownX=e.clientX; eWashDownY=e.clientY; },true);
function eWashOver(el){
  if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r=el.getBoundingClientRect();
  const d=document.createElement("div");
  d.className="e-copy-wash";
  d.style.left=r.left+"px"; d.style.top=r.top+"px";
  d.style.width=r.width+"px"; d.style.height=r.height+"px";
  document.body.appendChild(d);
  d.addEventListener("animationend",()=>d.remove());
  setTimeout(()=>{ if(d.parentNode) d.remove(); },900);
}
document.addEventListener("click",e=>{
  if(Math.hypot(e.clientX-eWashDownX,e.clientY-eWashDownY)>5) return;
  const t=e.target&&e.target.closest&&e.target.closest(".txt");
  if(!t) return;
  eWashOver(t);
  const card=t.closest(".card[data-id]");
  if(card) eNoteRecent(card.dataset.id);
});
/* Keyboard copies answer the same way - copyEntrySel calls this after a successful copy, so
   Enter (or any rebound copy key) washes the selected block exactly like a click. */
function eCopyFeedback(id){
  const sel=document.querySelector(".txt.sel");
  if(sel) eWashOver(sel);
  eNoteRecent(id);
}

/* ---- Recency trace. The last three copied cards keep a short green tick (CSS above),
   newest strongest. Session-only ON PURPOSE - it is a trace of this shift, not a record,
   so it lives in a variable and dies with the tab. render() re-applies the marks.
   `var`, not `let`, plus the guard below: boot's FIRST render() calls eApplyRecency
   before this line has executed. A hoisted function meeting a `let` in its dead zone threw,
   the boot guard read the throw as a corrupt-state crash and cleared storage, and Etiuda
   ate its own catalog acceptance in an accept-reload-offer loop. */
var eRecentIds=[];
function eApplyRecency(){
  if(!eRecentIds) return;   /* boot-order guard - see above */
  document.querySelectorAll("#list .card[data-erec]").forEach(c=>c.removeAttribute("data-erec"));
  eRecentIds.forEach((id,i)=>{
    const c=list.querySelector('.card[data-id="'+cssEsc(id)+'"]');
    if(c) c.setAttribute("data-erec",String(i+1));
  });
}
function eNoteRecent(id){
  if(!id) return;
  eRecentIds=eRecentIds.filter(x=>x!==id);
  eRecentIds.unshift(id);
  eRecentIds=eRecentIds.slice(0,3);
  eApplyRecency();
}


/* ---- ONE RESIZE LISTENER ------------------------------------------------------------------
   One listener, one place, a stated order: cheap flags first, text swaps, then the
   rAF-debounced geometry, then things that read finished layout. Every member is
   idempotent or self-debouncing, so the cost per event is what it always was. The old
   matchMedia(max-width:720px) change listener is folded in too: resize fires on every
   threshold crossing, and unlike matchMedia it also fires in emulated viewports. */
addEventListener("resize",()=>{
  syncHeaderElevation();                                // cheap flag, no layout read
  syncShortcutTitles();   // seg fold retitles EN/PL
  schedulePillsCollapse();                              // rAF: pill bar two-line measure
  scheduleRailGeometry();                               // rAF: rail top + dock threshold
  syncFactsGeometry();                                  // facts panel max size
  fitTabLabels();  // tabs: names re-fit, cap breathes
  if(tourActive()) scheduleTourPlace();                 // spotlight follows its target
  mtRefreshLive();                                      // maintenance readings, while open
  scheduleCutScan();                                    // what fits changed, so what is cut did
},{passive:true});

/* Last line of the app, on purpose: reaching it is the definition of a successful boot.
   The guard at the top of the file waits for this and offers a way out if it never comes. */
try{ if(typeof E_BOOT_OK==="function") E_BOOT_OK(); }catch(e){}
// After boot, so the warning sits over a working Etiuda rather than an empty frame.
try{ showPackMigrationWarning(); }catch(e){}
/* Back where you were. Consumed on read so a later refresh does not keep reopening it, and
   never over the catalog offer: being asked whether to load a file is the more urgent
   question, and it is the one that appears after an eject. */
try{
  if(ssGet(MG_REOPEN)){
    ssDel(MG_REOPEN);
    if(!document.getElementById("eCatalogModal")) openManage();
  }
}catch(e){}
