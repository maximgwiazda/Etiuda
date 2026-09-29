import { lsGet, lsSet, lsDel } from "./storage.js";
import { markCut } from "./cut-text.js";
import { $ } from "./dom.js";
import { esc } from "./esc.js";
import { cutLeaves, dismissNode, mgReduceMotion, M_MS } from "./motion.js";
import { ICON_LINT_WARNING } from "./icons.js";

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
  "The card keeps this language whatever the EN|PL toggle says, tokens included":"Karta i jej tokeny zostają w tym języku niezależnie od przełącznika EN|PL",
  "Fold this group away":"Zwiń tę grupę",
  "Show these cards":"Pokaż te karty",
  "Matching your intent":"Pasujące do intencji",
  "Settings reset":"Przywrócono ustawienia domyślne",
  "Put every setting on this screen back to what it ships with. Cards and edits are not affected.":"Przywraca domyślne wartości wszystkich ustawień na tym ekranie. Karty i zmiany w nich zostają nienaruszone.",
  "maintenance␟hidden":"ukryte",
  "maintenance␟starred":"ulubione",
  "maintenance␟edited":"zmienione",
  "maintenance␟yours":"własne",
  "maintenance␟cards":"karty",
  "maintenance␟intents":"intencje",
  "maintenance␟content languages":"języki treści",
  "maintenance␟cards in one language":"karty w jednym języku",
  "maintenance␟scroll region":"obszar przewijania",
  "maintenance␟locked open":"otwarte na stałe",
  "maintenance␟nothing":"nic",
  "maintenance␟categories renamed":"zmienione nazwy kategorii",
  "maintenance␟list width":"szerokość listy",
  "maintenance␟Catalog file":"Plik katalogu",
  "maintenance␟file":"plik",
  "maintenance␟copy":"kopia",
  "maintenance␟folder":"folder",
  "maintenance␟id":"identyfikator",
  "maintenance␟signature":"podpis",
  "maintenance␟beside this page":"obok tej strony",
  "maintenance␟imported into this browser":"wczytany do tej przeglądarki",
  "maintenance␟the chosen catalog folder's":"z folderu katalogów wybranego w Ustawieniach",
  "maintenance␟the program's own":"dołączona do programu",
  "maintenance␟found beside the program":"znaleziona obok programu",
  "maintenance␟inside the program":"wewnątrz programu",
  "maintenance␟a file opened by hand":"plik otwarty ręcznie",
  "maintenance␟(none loaded)":"(nie wczytano)",
  "maintenance␟signed":"podpisany",
  "maintenance␟unsigned":"niepodpisany",
  "maintenance␟changed since signed":"zmieniony po podpisaniu",
  "maintenance␟key not known here":"klucz nieznany temu komputerowi",
  "maintenance␟Desk":"Stanowisko",
  "maintenance␟catalog folder":"folder katalogów",
  "maintenance␟tour":"przewodnik",
  "maintenance␟under way":"w toku",
  "maintenance␟offered at the next start":"zaproponowany przy następnym uruchomieniu",
  "maintenance␟seen or declined":"obejrzany lub odrzucony",
  "maintenance␟this start":"to uruchomienie",
  "maintenance␟after a crash":"po awarii",
  "maintenance␟ordinary":"zwykłe",
  "maintenance␟desk backup":"kopia zapasowa danych",
  "maintenance␟not needed":"niepotrzebna",
  "maintenance␟statistics":"statystyki",
  "Columns":"Kolumny",
  "Auto":"Auto",
  "How many columns of cards to show. Auto fits as many as the window has room for.":"Liczba kolumn z kartami. Auto pokazuje tyle, ile zmieści okno.",
  "Always a single column":"Zawsze jedna kolumna",
  "Always two columns, however wide the window is":"Zawsze dwie kolumny, niezależnie od szerokości okna",
  "As many as fit without making a column too narrow to read":"Tyle kolumn, ile zmieści okno, a każda wciąż wygodna do czytania",
  "Narrowest column":"Najwęższa kolumna",
  "How narrow a column may get before Auto drops one. Wider means fewer, roomier columns.":"Szerokość, poniżej której Auto zmniejsza liczbę kolumn. Większa wartość to mniej kolumn, ale szerszych.",
  "Columns fit the window":"Kolumny dopasowane do okna",
  "Single column":"Jedna kolumna",
  "Two columns":"Dwie kolumny",
  "maintenance␟Layout":"Układ",
  "maintenance␟window":"okno",
  "maintenance␟columns":"kolumny",
  "maintenance␟narrowest column":"najwęższa kolumna",
  "maintenance␟card / text width":"szerokość karty / tekstu",
  "maintenance␟right padding":"prawy margines wewnętrzny",
  "INIT":"INICJAŁY",
  "GREET":"POWITANIE",
  "ACTION":"CZYNNOŚĆ",
  "TOPIC":"TEMAT",
  "DAYPART":"PORA DNIA",
  "Intent panel locked - open, and fixed width":"Panel intencji zablokowany: zawsze otwarty, o stałej szerokości",
  "Intent panel locked off - hold Ctrl to show it":"Panel intencji ukryty na stałe; pokazuje się po przytrzymaniu Ctrl",
  "Intent panel unlocked - may auto-hide, width draggable":"Panel intencji odblokowany: może się chować, a jego szerokość można zmieniać przeciąganiem",
  "Intent panel unlocked - hover the left edge to peek":"Panel intencji odblokowany: pokazuje się po najechaniu na lewą krawędź",
  "Unlock - let the panel appear again when you hover the left edge":"Odblokuj: panel znów pokaże się po najechaniu na lewą krawędź",
  "Unlock - allow auto-hide on narrow windows, and allow the width to be dragged":"Odblokuj: w wąskich oknach panel będzie się chował, a jego szerokość da się zmieniać przeciąganiem",
  "Lock - stop the panel appearing on hover (Ctrl still shows it)":"Zablokuj: panel pokaże się tylko po przytrzymaniu Ctrl, nie po najechaniu",
  "Hide the category bar, which is locked fully expanded when shown":"Ukryj pasek kategorii, który po pokazaniu pozostaje w pełni rozwinięty",
  "Hide the category bar; {KEY} peeks while it is hidden":"Ukryj pasek kategorii; {KEY} pozwala zerknąć, gdy jest ukryty",
  "Show the category bar under the header.":"Pokaż pasek kategorii pod nagłówkiem.",
  "Allow the category bar to auto-collapse to two lines when there are many categories.":"Przy wielu kategoriach pasek zwija się do dwóch rzędów.",
  "Keep all category rows visible (no 2-line auto-collapse).":"Wszystkie rzędy kategorii zostają widoczne, bez zwijania do dwóch.",
  "Allow the intent panel to auto-hide on narrow windows (hover left edge or hold Ctrl to peek).":"W wąskich oknach panel intencji chowa się sam i pokazuje po najechaniu na lewą krawędź albo przytrzymaniu Ctrl.",
  "Keep the intent panel docked even when the window is narrow. Same as the lock at the top of the panel.":"Panel intencji zostaje zadokowany także w wąskim oknie, tak samo jak przy blokadzie na górze panelu.",
  "maintenance␟name":"nazwa",
  "customer's name":"imię klienta",
  "agent's name":"imię agenta",
  "Role class":"Klasa roli",
  "Create a card":"Utwórz kartę",
  "Create a card in {CAT}":"Utwórz kartę w kategorii {CAT}",
  "A different word may do better.":"Inne słowo może trafić lepiej.",
  "Press":"Naciśnij",
  "{KEY} clears the search and the intents and shows every card.":"{KEY} czyści wyszukiwanie i intencje i pokazuje wszystkie karty.",
  "Etiuda is ready for its first replies.":"Etiuda czeka na pierwsze odpowiedzi.",
  "Add a card to a category, or":"Dodaj kartę do kategorii albo",
  "you already have.":", który już istnieje.",
  "A catalog file next to Etiuda loads by itself when it is called":"Plik katalogu leżący obok Etiudy wczytuje się sam, gdy nazywa się",
  "Under any other name, bring it in with the button above.":"Plik o innej nazwie można wczytać przyciskiem powyżej.",
  "Catalogs":"Katalogi",
  "Loaded":"Wczytany",
  "Newer":"Nowszy",
  "Written after the catalog you have":"Zapisany później niż wczytany katalog",
  "Open this folder":"Otwórz ten folder",
  "Change folder…":"Zmień folder…",
  "Eject":"Odłącz",
  "Load":"Wczytaj",
  "Choose the folder Etiuda reads catalogs from":"Wybierz folder, z którego Etiuda czyta katalogi",
  "That setting could not be saved.":"Nie udało się zapisać tego ustawienia.",
  "{FILE} is not a catalog Etiuda can read.":"{FILE} nie jest katalogiem, który Etiuda potrafi odczytać.",
  "{FILE} could not be read.":"Nie udało się odczytać pliku {FILE}.",
  "{FILE} could not be saved.":"Nie udało się zapisać pliku {FILE}.",
  "Add a card to {CAT}":"Dodaj kartę do kategorii {CAT}",
  "Clear search text":"Wyczyść tekst wyszukiwania",
  "not linked to your intent":"niepowiązane z wybraną intencją",
  "also mentions your search":"zawierają też szukane słowa",
  "A search ranks the cards by relevance; clear it to order them yourself":"Wyszukiwanie porządkuje karty według trafności; po jego wyczyszczeniu kolejność można ustawić ręcznie",
  "Drag header to reorder within the same highlight group":"Przeciągnij nagłówek, aby zmienić kolejność wśród kart o tym samym wyróżnieniu",
  "Drag header to reorder within the same highlight group; same category only":"Przeciągnij nagłówek, aby zmienić kolejność wśród kart o tym samym wyróżnieniu i w tej samej kategorii",
  "{N} hidden":"ukrytych: {N}",
  "none":"brak",
  "Split by blank lines into alternatives":"Warianty oddzielone pustymi liniami",
  "Ordered sequence (STEP badges)":"Kolejne kroki (znaczniki KROK)",
  "{PAX} as first name only":"{PAX} jako samo imię",
  "Linked to every {INT}":"Powiązanie ze wszystkimi {INT}",
  "Top of the {INT} group":"Na górze grupy {INT}",
  "steps":"kroki",
  "alt":"alt",
  /* Two senses, one English phrase: the agent typing their own name is asked for a first
     name, and a card flag says the customer's token is cut down to one. The second takes a
     context key, because Polish cannot say both with one word. */
  "first name":"imię",
  "pax␟first name":"tylko imię",
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
  "Un-hide every hidden card":"Pokaż wszystkie ukryte karty",
  "Un-hide every hidden intent":"Pokaż wszystkie ukryte intencje",
  "Nothing is hidden":"Nic nie jest ukryte",
  "Engine":"Silnik",
  "Catalog":"Katalog",
  "Storage":"Pamięć",
  "Display":"Wyświetlanie",
  "Personal state":"Dane własne",
  "version":"wersja",
  "running from":"uruchomiona z",
  "running in":"uruchomiona w",
  "showing":"pokazywane",
  "file watch":"obserwacja pliku",
  "not supported here":"nieobsługiwane w tej przeglądarce",
  "unknown":"nieznana",
  "local memory used":"użyta pamięć lokalna",
  "theme":"motyw",
  "edition":"wydanie",
  "cards / macros":"karty / makra",
  "intents / categories":"intencje / kategorie",
  "layout rungs":"szczeble układu",
  "reduced motion":"ograniczone animacje",
  "state":"stan",
  "panel width cap":"limit szerokości panelu",
  "dock threshold":"próg dokowania",
  "shortcuts rebound":"zmienione skróty",
  "tabs":"rozmowy",
  "sample untouched":"przykładowy katalog bez zmian",
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
  "IN-MEMORY ONLY - edits last only until this tab closes":"TYLKO W PAMIĘCI: zmiany zostają do zamknięcia tej karty przeglądarki",
  "IN-MEMORY ONLY":"TYLKO W PAMIĘCI",
  "host":"środowisko",
  "desktop app":"aplikacja na komputer",
  "browser":"przeglądarka",
  "desk file":"plik z danymi",
  "last saved":"ostatni zapis",
  "not saved since":"brak zapisu od",
  "ACTIVE":"AKTYWNE",
  "Tab":"Rozmowa",
  "Step 1":"Krok 1",
  "STEP":"KROK",
  "step":"krok",
  "Ready to paste: {TITLE}, {WHAT}":"Gotowe do wklejenia: {TITLE}, {WHAT}",
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
  "Clear tab fields":"Wyczyść pola rozmowy",
  "Close tab":"Zamknij rozmowę",
  "Clear tab":"Wyczyść rozmowę",
  "Add tab":"Dodaj rozmowę",
  "and":"i",
  "Searched for":"Szukano",
  "you typed":"wpisano",
  "Drag to reorder: intents in the side panel (double-click its title to reset), a card header within its highlight group (intent-linked / favourited / both / regular), or alternative and step macros inside a card (EN and PL stay aligned). Show or hide the panel from the":"Przeciągnij, aby zmienić kolejność: intencje w panelu bocznym (kliknij dwukrotnie jego tytuł, aby ją przywrócić), nagłówek karty wśród kart o tym samym wyróżnieniu (powiązane z intencją / ulubione / oba / zwykłe) albo warianty i kroki wewnątrz karty (EN i PL pozostają zgodne). Panel można pokazać lub ukryć z",
  "Quick facts - fees and deadlines.":"Szybkie fakty - opłaty i terminy.",
  "- cards, intent panel, category pills, shortcuts.":"- karty, panel intencji, pasek kategorii, skróty.",
  "toggles theme.":"przełącza motyw.",
  "Toggle theme":"Przełącz motyw",
  "Switch language":"Przełącz język kart",
  "int":"int",
  "In a supporting category, relevant regardless of the intent":"W kategorii wspierającej, przydatna niezależnie od intencji",
  "sup":"wsp",
  "fav":"fav",
  "mod":"mod",
  "Put this card away: it greys out at the foot of this category and loses its star":"Odłóż tę kartę: trafi, wyszarzona, na koniec swojej kategorii i straci gwiazdkę",
  "Put this card away: it greys out at the foot of this category":"Odłóż tę kartę: trafi, wyszarzona, na koniec swojej kategorii",
  "Put this card away":"Odłóż tę kartę",
  "Changed or added by you, not what the catalog shipped":"Zmienione lub dodane na tym komputerze, nie z katalogu",
  "Add an intent":"Dodaj intencję",
  "Remove from Favourites":"Usuń z Ulubionych",
  "Add to Favourites":"Dodaj do Ulubionych",
  "Lock - keep the panel docked on narrow windows, and fix its width":"Zablokuj: panel zostanie zadokowany także w wąskich oknach, ze stałą szerokością",
  "Unlock the intent panel":"Odblokuj panel intencji",
  "Lock the intent panel open and fix its width":"Zablokuj panel intencji w pozycji otwartej, ze stałą szerokością",
  "Hold Ctrl to show intents":"Przytrzymaj Ctrl, aby pokazać intencje",
  "Click · drag to reorder ·":"Kliknij · przeciągnij kolejność ·",
  "for several":"dla kilku",
  "English":"English",
  "Polski":"Polski",
  "Maxim Gwiazda":"Maxim Gwiazda",
  "Etiuda Source-Available Licence 1.0":"Etiuda Source-Available Licence 1.0",
  "Created by":"Autor:",
  "· free for personal use":"· bezpłatnie do użytku osobistego",
  "Finish":"Zakończ",
  "Welcome to Etiuda":"Witamy w Etiudzie",
  "Your agent name":"Nazwa agenta",
  "Conversations":"Rozmowy",
  "Customer name and role":"Imię klienta i rola",
  "Intent clause":"Fraza intencji",
  "Category pills":"Pasek kategorii",
  "Intent panel":"Panel intencji",
  "Cards":"Karty",
  "A card's buttons":"Przyciski karty",
  "A card of your own":"Własna karta",
  "The card editor":"Edytor karty",
  "English / Polish":"Angielski / polski",
  "Light and dark":"Jasny i ciemny",
  "Ready for the first customer":"Gotowe na pierwszego klienta",
  "Type the name customers should see, exactly as you want it to appear; <span class=\"fillmiss\">AGENT</span> reproduces it verbatim. Internal comments sign with your initials as /<span class=\"fillmiss\">INIT</span>.":"Wpisz imię, które mają widzieć klienci, dokładnie w takiej formie, w jakiej ma się pojawiać; <span class=\"fillmiss\">AGENT</span> wstawia je bez zmian. Komentarze wewnętrzne są podpisywane inicjałami agenta w postaci /<span class=\"fillmiss\">INIT</span>.",
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
  "No catalog loaded - Etiuda is empty.":"Nie wczytano katalogu, więc Etiuda jest pusta.",
  "About Etiuda · Version {V} · <span class='nw'>Etiuda Source-Available Licence 1.0</span>, free for personal use · © 2026 Maxim Gwiazda":"O Etiudzie · Wersja {V} · <span class='nw'>Etiuda Source-Available Licence 1.0</span>, bezpłatnie do użytku osobistego · © 2026 Maxim Gwiazda",
  "Toggle language":"Przełącz język",
  "Next tab":"Następna rozmowa",
  "New tab":"Nowa rozmowa",
  "Open the Menu":"Otwórz Menu",
  "Your name":"Nazwa agenta",
  "Personal":"Osobiste",
  "Last sync":"Ostatnia synchronizacja",
  "Later":"Później",
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
  "Open the editor for a new card, in the chosen category":"Otwiera edytor nowej karty w wybranej kategorii",
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
  "Polish only: declines the name into the vocative, the form Polish uses to address someone. Only the first name declines; a surname is left as written.":"Dotyczy tylko polskiego: imię pojawia się w wołaczu, na przykład Anno. Nazwisko się nie odmienia i zostaje tak, jak je wpisano.",
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
  "Switch to the next tab, round to the first after the last":"Przełącza na następną rozmowę, a po ostatniej wraca do pierwszej",
  "Open a tab for a new customer":"Otwiera rozmowę dla nowego klienta",
  "Open or close the fees panel":"Otwiera lub zamyka panel opłat",
  "Open or close the Menu, from anywhere on the screen":"Otwiera lub zamyka Menu, z dowolnego miejsca na ekranie",
  "Edit the customer first name":"Edytuje imię klienta",
  "Edit the comment actor":"Edytuje ROLE do komentarzy wewnętrznych",
  "Show or hide the left intent list":"Pokazuje lub ukrywa lewą listę intencji",
  "Show or hide the category bar":"Pokazuje lub ukrywa pasek kategorii",
  "Deselect every chosen intent":"Odznacza wszystkie wybrane intencje",
  "Clear the category filter":"Czyści filtr kategorii",
  "Hold Ctrl (Cmd on Mac): show the pills when hidden, or expand them past two rows":"Przytrzymaj Ctrl (Cmd na Macu): pokazuje ukryte kategorie lub rozwija je poza dwa rzędy",
  "Readings about this machine, and rescue switches":"Odczyty o tym komputerze i przełączniki ratunkowe",
  "Select everything in the INTENT / MACRO box, without clicking into it first":"Zaznacza całą treść pola INTENT / MACRO bez klikania w nie",
  "Move focus to the previous copyable macro (alt / step / single)":"Przenosi kursor na poprzednie makro do skopiowania (wariant / krok / pojedyncze)",
  "Move focus to the next copyable macro (alt / step / single)":"Przenosi kursor na następne makro do skopiowania (wariant / krok / pojedyncze)",
  "Select the previous category pill (All, then the categories)":"Wybiera poprzednią kategorię (Wszystkie, potem kategorie)",
  "Select the next category pill (All, then the categories)":"Wybiera następną kategorię (Wszystkie, potem kategorie)",
  "Move the mark to the top of its list, then across to the other one":"Przenosi zaznaczenie na początek bieżącej listy, a kolejne naciśnięcie na drugą listę",
  "Move the mark to the bottom of its list, then across to the other one":"Przenosi zaznaczenie na koniec bieżącej listy, a kolejne naciśnięcie na drugą listę",
  "Select the first category, skipping All and any the search has emptied":"Wybiera pierwszą kategorię, pomijając Wszystkie i te opróżnione przez wyszukiwanie",
  "Select the last category, skipping any the search has emptied":"Wybiera ostatnią kategorię, pomijając te opróżnione przez wyszukiwanie",
  "Copy the focused macro in the active language":"Kopiuje zaznaczone makro w aktywnym języku",
  "Copy the focused macro in the other language":"Kopiuje zaznaczone makro w drugim języku",
  "Sheds one thing per press: panels, then search, then intents, then all tabs":"Każde naciśnięcie zamyka lub czyści jedną rzecz: panele, wyszukiwanie, intencje, a na końcu wszystkie rozmowy",
  "Customers see \"{NAME}\", and comments sign /{INIT}":"Klienci widzą \"{NAME}\", a komentarze podpisują się /{INIT}",
  "The name customers see, exactly as you type it; comments sign with its initials":"Nazwa, którą widzą klienci, w dokładnie takiej formie, w jakiej została wpisana; komentarze podpisują się jej inicjałami",
  "Panel is locked open (always docked). Hide turns it off entirely.":"Panel jest zablokowany w pozycji otwartej, zawsze zadokowany. Przycisk Ukryj wyłącza go całkowicie.",
  "Prefer showing the intent panel when the window is wide. On narrow windows it auto-hides; hover the left edge or hold Ctrl to peek. Use the lock at the top of the panel, or Settings, to keep it open.":"Panel intencji jest widoczny, gdy okno jest szerokie. W wąskich oknach chowa się sam; wystarczy najechać na lewą krawędź albo przytrzymać Ctrl, aby go podejrzeć. Otwarty utrzymuje go blokada na górze panelu albo Ustawienia.",
  "Intent panel off. Hold Ctrl to peek the intent list as an overlay.":"Panel intencji wyłączony. Przytrzymaj Ctrl, aby zobaczyć listę intencji nad kartami.",
  "Polish cards - switch to English":"Karty po polsku (przełącz na angielski)",
  "{LANG} cards - switch to {NEXT}":"Karty: {LANG} (przełącz na {NEXT})",
  "English cards - switch to Polish":"Karty po angielsku (przełącz na polski)",
  "Click to filter · Ctrl+click to add/remove · drag to reorder":"Kliknij, aby filtrować · Ctrl+kliknij, aby dodać lub usunąć · przeciągnij, aby zmienić kolejność",
  "Green ring: holds a card linked to the chosen intent":"Zielona obwódka: zawiera kartę powiązaną z wybraną intencją",
  "Blue ring: a supporting category":"Niebieska obwódka: kategoria wspierająca",
  "Click any macro to copy":"Kliknij dowolne makro, aby skopiować",
  "… are alternatives, copied one at a time.":"… to warianty, kopiowane pojedynczo.",
  "fills from the name box;":"wypełnia się z pola imienia;",
  "from the agent name;":"z nazwy agenta;",
  "from the side panel, from the chips under the opener when the panel is off, or from what you type. A listed intent follows EN|PL; typed text does not. Typing in SEARCH ranks intents and filters cards in both languages.":"z panelu bocznego, z przycisków intencji pod kartą powitalną, gdy panel jest ukryty, albo z wpisanego tekstu. Intencja z listy zmienia się razem z EN|PL; tekst wpisany ręcznie już nie. Tekst wpisany w SZUKAJ szereguje intencje i filtruje karty w obu językach.",
  "is the subject of the chat as a noun phrase: where":"to temat rozmowy nazwany rzeczownikiem: tam, gdzie",
  "names an act, this names a thing.":"nazywa czynność, ten token nazywa rzecz.",
  "is what was DONE, for internal comments. Both are set per intent in its editor.":"to opis tego, co ZOSTAŁO ZROBIONE, do komentarzy wewnętrznych. Oba ustawia się przy każdej intencji, w jej edytorze.",
  "just that macro":"tylko to makro",
  "- cards badged":"- karty oznaczone",
  "are alternatives and copy one at a time.":"to warianty i kopiują się pojedynczo.",
  "Older catalog found":"Znaleziono starszy katalog",
  "Load it anyway":"Wczytaj mimo to",
  "Updated catalog found":"Jest nowsza wersja katalogu",
  "Watching":"Obserwowany:",
  "Check for updates":"Sprawdź aktualizacje",
  "Read that file again and offer it if it has changed":"Czyta ten plik ponownie i proponuje go, jeśli się zmienił",
  "Stop watching":"Przestań obserwować",
  "No longer watching that file.":"Ten plik nie jest już obserwowany.",
  "No catalog file is being watched.":"Żaden plik katalogu nie jest obserwowany.",
  "Etiuda needs permission to read that file again.":"Etiuda potrzebuje ponownej zgody na odczyt tego pliku.",
  "That file is not a catalog Etiuda can read.":"Tego pliku Etiuda nie potrafi odczytać jako katalogu.",
  "That file matches the catalog you already have.":"Ten plik jest taki sam jak wczytany katalog.",
  "Could not read the watched file.":"Nie udało się odczytać obserwowanego pliku.",
  "Your own cards and edits are kept.":"Własne karty i zmiany zostają.",
  "Load the update":"Wczytaj aktualizację",
  "You have {V}.":"Wczytane: {V}.",
  "Load catalog?":"Wczytać katalog?",
  "Replace catalog?":"Zastąpić katalog?",
  "Located as {FILE}.":"Znaleziony jako {FILE}.",
  "Located as {FILE} in {FOLDER}.":"Znaleziony jako {FILE} w {FOLDER}.",
  "{FILE} comes with Etiuda.":"{FILE} jest dołączony do Etiudy.",
  "{FILE} in {FOLDER}":"{FILE} w {FOLDER}",
  "Catalog file":"Plik katalogu",
  "Card added":"Dodano kartę",
  "Card saved":"Zapisano kartę",
  "Intent added":"Dodano intencję",
  "Intent saved":"Zapisano intencję",
  "Intent shown again":"Intencja pokazana ponownie",
  "Intent hidden - greyed and moved to the bottom":"Ukryto intencję: jest wyszarzona na dole listy",
  "Put away - greyed at the foot of its category":"Odłożono kartę: jest wyszarzona na końcu swojej kategorii",
  "Put away - greyed at the foot of its category, unfavourited":"Odłożono kartę: jest wyszarzona na końcu swojej kategorii i nie ma już gwiazdki",
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
  "Quick facts saved":"Zapisano szybkie fakty",
  "Quick facts match built-in default":"Szybkie fakty zgodne z wbudowanymi",
  "is now a supporting category":"jest teraz kategorią wspierającą",
  "is an ordinary category":"jest zwykłą kategorią",
  "No {LANG} version for this card":"Ta karta nie ma jeszcze wersji {LANG}",
  "switch to {LANG} to use it":"przełącz na {LANG}, aby jej użyć",
  "Intent: {NAME}":"Intencja: {NAME}",
  "Intents: {NAMES}":"Intencje: {NAMES}",
  "Changes every label in Etiuda, never the cards themselves":"Zmienia napisy na przyciskach i w menu Etiudy, nigdy treść kart",
  "Theme, blur effects and animations":"Motyw, efekty rozmycia i animacje",
  "What stays docked, and what may hide itself when space is short":"Co pozostaje zadokowane, a co może się schować, gdy brakuje miejsca",
  "Rebind any key combo. The keys the app itself needs are listed as fixed.":"Każdy skrót można zmienić. Klawisze potrzebne samej Etiudzie są oznaczone jako stałe.",
  "Always the light palette, whatever the computer asks for":"Zawsze jasna paleta, niezależnie od ustawień komputera",
  "Always the dark palette, whatever the computer asks for":"Zawsze ciemna paleta, niezależnie od ustawień komputera",
  "Follows your computer's light or dark setting, and changes with it":"Zgodnie z jasnym lub ciemnym motywem komputera, także po jego zmianie",
  "Panels and the dialog backdrop stay blurred":"Panele i tło za oknami dialogowymi pozostają rozmyte",
  "Panels go flat and opaque, and a dialog only darkens what is behind it":"Panele stają się płaskie i nieprzezroczyste, a okno dialogowe tylko przyciemnia to, co za nim",
  "Everything moves as it was drawn to":"Wszystko porusza się tak, jak zaprojektowano",
  "Nothing moves; every change lands at once":"Bez ruchu; każda zmiana pojawia się od razu",
  "The panel stays docked at any window width":"Panel pozostaje zadokowany przy każdej szerokości okna",
  "The panel hides itself when the window gets narrow":"Panel chowa się, gdy okno staje się wąskie",
  "Every category row stays visible":"Każdy rząd kategorii pozostaje widoczny",
  "The bar keeps two rows, and Ctrl peeks at the others":"Pasek ma dwa rzędy, a Ctrl pokazuje pozostałe",
  "Click, then press the new key combo":"Kliknij, a następnie naciśnij nową kombinację klawiszy",
  "Press keys…":"Naciśnij klawisze…",
  "Fixed keys":"Klawisze stałe",
  "The grammar the rest stands on: Esc is how key capture itself cancels, arrows and Enter keep their native meanings, and a held Ctrl is a hold, not a chord.":"Zasady, na których opiera się reszta: Esc anuluje samo przechwytywanie klawiszy, strzałki i Enter zachowują swoje zwykłe znaczenie, a przytrzymany Ctrl to przytrzymanie, nie skrót.",
  "Keep current":"Zachowaj obecny",
  "Load it":"Wczytaj",
  "Load catalog":"Wczytaj katalog",
  "Show all hidden":"Pokaż wszystkie ukryte",
  "English cards - click, or press":"Karty po angielsku - kliknij lub naciśnij",
  "Polish cards - click, or press":"Karty po polsku - kliknij lub naciśnij",
  "toggles":"przełącza",
  "Library":"Biblioteka",
  "Maintenance":"Konserwacja",
  "Moved to":"Przeniesiono do",
  "Restored original -":"Przywrócono oryginał -",
  "Edit, hide or restore every card, intent and category":"Edycja, ukrywanie i przywracanie kart, intencji i kategorii",
  "Add a category":"Dodaj kategorię",
  "New category":"Nowa kategoria",
  "New category…":"Nowa kategoria…",
  "New category name":"Nazwa nowej kategorii",
  "Create a new category":"Utwórz nową kategorię",
  "Move or delete cards in this category first":"Kategorię można usunąć, gdy jej karty zostaną przeniesione albo usunięte",
  "Move or delete the cards in this category first":"Kategorię można usunąć, gdy jej karty zostaną przeniesione albo usunięte",
  "Create a card in":"Utwórz kartę w",
  "Delete card":"Usuń kartę",
  "Delete this card":"Usuń tę kartę",
  "New intent":"Nowa intencja",
  "New intent…":"Nowa intencja…",
  "Create a custom intent":"Utwórz własną intencję",
  "Write a new clause for {INTENT}":"Napisz nową frazę dla {INTENT}",
  "Delete this intent":"Usuń tę intencję",
  "Export…":"Eksportuj…",
  "Clear local memory":"Wyczyść pamięć lokalną",
  "Eject catalog":"Odłącz katalog",
  "Catalog ejected":"Odłączono katalog",
  "Local memory cleared":"Wyczyszczono pamięć lokalną",
  "Loading a catalog erases the cards you made without one. Export them as a catalog of their own first?":"Wczytanie katalogu usunie karty utworzone bez katalogu. Najpierw wyeksportować je jako osobny katalog?",
  "Load anyway":"Wczytaj mimo to",
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
  "Restored your cards and stars from an earlier build.":"Przywrócono własne karty i gwiazdki z wcześniejszej wersji.",
  "Your intent edits and stars are set aside: this catalog cannot say which intent each belongs to.":"Odłożono własne zmiany i gwiazdki przy intencjach: ten katalog nie wskazuje, której intencji dotyczą.",
  "Edited cards this catalog does not have are kept as your own: {CARDS}.":"Zmienione karty, których ten katalog nie ma, zostają jako własne: {CARDS}.",
  "Starred cards this catalog does not have are off your list: {CARDS}.":"Karty z gwiazdką, których ten katalog nie ma, znikają z listy: {CARDS}.",
  "Forget every personal card, edit, hide, rename and layout choice in this browser; the loaded catalog stays. It is also how you bring back anything you deleted.":"Zapomina wszystkie własne karty, zmiany, ukrycia, zmiany nazw i ustawienia układu w tej przeglądarce; wczytany katalog zostaje. W ten sposób wraca też wszystko, co usunięto.",
  "Forget every personal card, edit, hide, rename and layout choice on this computer; the loaded catalog stays. It is also how you bring back anything you deleted.":"Zapomina wszystkie własne karty, zmiany, ukrycia, zmiany nazw i ustawienia układu na tym komputerze; wczytany katalog zostaje. W ten sposób wraca też wszystko, co usunięto.",
  "Put the catalog down and restart empty. Your cards, edits, name, theme and layout all stay.":"Odłącza katalog i uruchamia Etiudę bez niego. Własne karty, zmiany, nazwa, motyw i układ zostają.",
  "Your own cards, edits, stars and card order are KEPT - load this catalog again":"Twoje własne karty, zmiany, gwiazdki i kolejność kart ZOSTAJĄ - wczytaj ten katalog ponownie,",
  "Save everything loaded now as a catalog file, your edits merged in":"Zapisuje wszystko, co wczytane, jako plik katalogu, razem z własnymi zmianami",
  "Load a catalog file from disk: it is read as data, never executed. It replaces what is loaded now, and nothing on disk changes.":"Wczytuje plik katalogu z dysku jako same dane, bez uruchamiania czegokolwiek. Zastępuje obecny katalog, a pliki na dysku zostają bez zmian.",
  "Bake the catalog into one HTML file that needs nothing beside it":"Zapisuje katalog w jednym samodzielnym pliku HTML",
  "Reset personal data":"Wyczyść dane własne",
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
  "Discard your changes and restore the catalog's category.":"Odrzuca zmiany i przywraca kategorię z katalogu.",
  "Nothing to discard - this matches the catalog.":"Wszystko jest zgodne z katalogiem.",
  "This is yours, so the catalog has no version to restore.":"To własna pozycja, więc katalog nie ma jej wersji do przywrócenia.",
  "Category reset":"Przywrócono kategorię z katalogu",
  "Delete this empty category":"Usuń tę pustą kategorię",
  "Edit category":"Edytuj kategorię",
  "Title":"Tytuł",
  "Icon":"Ikona",
  "Colour":"Kolor",
  "Macro":"Makro",
  "Clause":"Fraza",
  "Comment action":"Czynność do komentarza",
  "Clause is required":"Wpisz frazę",
  "Category name":"Nazwa kategorii",
  "Name":"Nazwa",
  "Editing":"Edycja",
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
  "a short name you will recognise":"krótka, łatwa do rozpoznania nazwa",
  "the text the customer receives":"tekst, który otrzyma klient",
  "guidance for you, never sent":"wskazówka dla agenta, nigdy niewysyłana",
  "Note":"Notatka",
  "Blank lines split the text into separately copyable alternatives.":"Puste linie dzielą tekst na osobno kopiowane warianty.",
  "Numbers the alternatives as ordered steps.":"Numeruje warianty jako kolejne kroki.",
  "Rings green under every intent - for text that always applies, like an opener.":"Świeci na zielono przy każdej intencji. Do tekstu, który pasuje zawsze, na przykład powitania.",
  "Sorts above the other linked cards when an intent is picked.":"Po wybraniu intencji stoi przed pozostałymi powiązanymi kartami.",
  "Save changes":"Zapisz zmiany",
  "Discard changes":"Odrzuć zmiany",
  "Close without saving any change":"Zamknij bez zapisywania zmian",
  "Save this card on this computer":"Zapisz tę kartę na tym komputerze",
  "Save this intent on this computer":"Zapisz tę intencję na tym komputerze",
  "Delete this card: a built-in one returns on Reset, one you made does not":"Usuń tę kartę: wbudowana wróci po zresetowaniu, własna nie",
  "Delete this intent: a built-in one returns on Reset, one you made does not":"Usuń tę intencję: wbudowana wróci po zresetowaniu, własna nie",
  "Discard your edits and restore the catalog wording.":"Odrzuca zmiany i przywraca treść z katalogu.",
  "Restore built-in quick facts":"Przywróć wbudowane szybkie fakty",
  "Delete this custom card permanently?":"Usunąć tę własną kartę na stałe?",
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
  "{N} card awaiting {LANG}":"{N} karta czeka na {LANG}",
  "{N} cards awaiting {LANG}":"{N} kart czeka na {LANG}",
  "few␟{N} cards awaiting {LANG}":"{N} karty czekają na {LANG}",
  "many␟{N} cards awaiting {LANG}":"{N} kart czeka na {LANG}",
  "Copied {N} time on this computer":"Skopiowano {N} raz na tym komputerze",
  "Copied {N} times on this computer":"Skopiowano {N} razy na tym komputerze",
  "few␟Copied {N} times on this computer":"Skopiowano {N} razy na tym komputerze",
  "many␟Copied {N} times on this computer":"Skopiowano {N} razy na tym komputerze",
  "Copied {N} time in this browser":"Skopiowano {N} raz w tej przeglądarce",
  "Copied {N} times in this browser":"Skopiowano {N} razy w tej przeglądarce",
  "few␟Copied {N} times in this browser":"Skopiowano {N} razy w tej przeglądarce",
  "many␟Copied {N} times in this browser":"Skopiowano {N} razy w tej przeglądarce",
  "{CARDS} · {MACROS} · {INTENTS} · {CATEGORIES}":"{CARDS} · {MACROS} · {INTENTS} · {CATEGORIES}",
  "{MACROS} in {CARDS}, {CATEGORIES}":"{MACROS}, {CARDS}, {CATEGORIES}",
  "{MACROS} in {CARDS} · {INTENTS} · {CATEGORIES}":"{MACROS} · {CARDS} · {INTENTS} · {CATEGORIES}",
  "Built {FILE} with {MACROS} inside":"Zbudowano {FILE}: {MACROS}",
  "Exported {FILE} with {MACROS} in {CARDS}":"Wyeksportowano {FILE}: {MACROS}, {CARDS}",
  "Card deleted":"Usunięto kartę",
  "Undo":"Cofnij",
  "Moved on without saving the changes":"Opuszczono wpis bez zapisania zmian",
  "Custom card deleted":"Usunięto własną kartę",
  "Category added":"Dodano kategorię",
  "Category deleted":"Usunięto kategorię",
  "Category updated":"Zapisano zmiany w kategorii",
  "Intent added to Favourites":"Dodano intencję do Ulubionych",
  "Intent removed from Favourites":"Usunięto intencję z Ulubionych",
  "Intent deleted":"Usunięto intencję",
  "Intent restored to original":"Przywrócono pierwotną intencję",
  "Intent not found":"Nie znaleziono intencji",
  "Intent order reset":"Przywrócono kolejność intencji",
  "Intent panel width reset":"Przywrócono szerokość panelu intencji",
  "Added to Favourites":"Dodano do Ulubionych",
  "Removed from Favourites":"Usunięto z Ulubionych",
  "Shown again":"Pokazano ponownie",
  "Tab cleared":"Wyczyszczono rozmowę",
  "no text yet":"jeszcze bez tekstu",
  "Copy the report: counts and environment only, never your content":"Skopiuj raport: tylko liczby i dane o środowisku, nigdy treść kart",
  "All tabs closed":"Zamknięto wszystkie rozmowy",
  "Press Esc again to close all tabs":"Naciśnij Esc ponownie, aby zamknąć wszystkie rozmowy",
  "{INTENT} cleared":"Wyczyszczono {INTENT}",
  "Shortcuts reset":"Przywrócono domyślne skróty",
  "Press the new shortcut (Esc to cancel, Backspace for the default)":"Naciśnij nowy skrót (Esc anuluje, Backspace przywraca domyślny)",
  "Built-in quick facts restored":"Przywrócono wbudowane szybkie fakty",
  "Selecting the text on the card and pressing Ctrl+C copies this one; the browser kept the clipboard closed.":"Tę odpowiedź można skopiować, zaznaczając jej tekst na karcie i naciskając Ctrl+C; przeglądarka nie dała dostępu do schowka.",
  "Selecting the text on the card and pressing Ctrl+C copies this one; the clipboard would not take it just now.":"Tę odpowiedź można skopiować, zaznaczając jej tekst na karcie i naciskając Ctrl+C; schowek tym razem jej nie przyjął.",
  "Some required fields are empty":"Uzupełnij wymagane pola",
  "Title is required":"Wpisz tytuł",
  "Macro text is required":"Wpisz tekst makra",
  "Export is ready once the catalog holds a card.":"Eksport będzie możliwy, gdy w katalogu pojawią się karty.",
  "The catalog is empty, so there is nothing to build.":"Zbudowanie pliku będzie możliwe, gdy w katalogu pojawią się karty.",
  "Could not read file":"Nie udało się odczytać pliku",
  "Could not read this page's own source":"Nie udało się odczytać źródła tej strony",
  "Changes since {TIME} are not saved.":"Zmiany wprowadzone od {TIME} nie są zapisane.",
  "Etiuda cannot write {FILE}, so they last only until it closes. The next save that succeeds writes them all.":"Etiuda nie może zapisać pliku {FILE}, więc zmiany przetrwają tylko do jej zamknięcia. Pierwszy udany zapis utrwali je wszystkie.",
  "This browser is refusing to store them, perhaps because its storage is full, so they last only until this tab closes.":"Przeglądarka nie przyjmuje ich do pamięci, być może z braku miejsca, więc przetrwają tylko do zamknięcia tej karty.",
  "Your changes are saved again.":"Zmiany są już bezpiecznie zapisane.",
  "Etiuda could not read its saved file.":"Etiuda nie mogła odczytać swojego pliku z zapisanymi danymi.",
  "The file is kept unchanged at {FILE}, and Etiuda has opened the copy saved {TIME}.":"Plik został odłożony bez zmian jako {FILE}, a Etiuda otworzyła kopię zapisaną {TIME}.",
  "The file is kept unchanged at {FILE}, and Etiuda has started afresh.":"Plik został odłożony bez zmian jako {FILE}, a Etiuda zaczęła od nowa.",
  "Could not save shortcuts":"Nie udało się zapisać skrótów",
  "Could not save the catalog, perhaps because the browser's storage is full.":"Nie udało się zapisać katalogu; możliwe, że pamięć przeglądarki jest pełna.",
  "Could not save the catalog, because Etiuda cannot write {FILE}.":"Nie udało się zachować katalogu: Etiuda nie może zapisać pliku {FILE}.",
  "This browser is not storing anything, so a catalog cannot be kept here":"Ta przeglądarka niczego nie zapisuje, więc nie można tu zachować katalogu",
  "Could not find the embedded-catalog slot":"Nie znaleziono miejsca na wbudowany katalog",
  "Copy report":"Kopiuj raport",
  "Link copied":"Skopiowano link",
  "Report copied":"Skopiowano raport",
  "Nothing here yet.":"Jeszcze nic tu nie ma.",
  "Empty.":"Pusto.",
  "No categories.":"Brak kategorii.",
  "No intents.":"Brak intencji.",
  "No intents available.":"Brak dostępnych intencji.",
  "Uncategorised":"Bez kategorii",
  "Reset shortcuts":"Przywróć skróty",
  "What Etiuda is, and every keyboard shortcut":"Czym jest Etiuda i wszystkie skróty klawiszowe",
  "Interface language, appearance and keyboard shortcuts":"Język interfejsu, wygląd i skróty klawiszowe",
  "Hide the category bar; hold Ctrl to peek at it while hidden":"Ukryj pasek kategorii; przytrzymaj Ctrl, aby na niego zerknąć",
  "Hide the intent panel; its chips then appear on the first card that uses {INTENT}":"Ukryj panel intencji; przyciski intencji pojawią się wtedy na pierwszej karcie, która używa {INTENT}",
  "AGENT":"AGENT",
  "PAX":"PAX",
  "INTENT":"INTENCJA",
  "Intents arrive with a catalog.":"Intencje przynosi katalog.",
  "search intents and cards":"szukaj intencji i kart",
  "Search":"Szukaj",
  "One search: intents rank in the panel, cards filter below":"Jedno wyszukiwanie: intencje szeregują się w panelu, a karty poniżej są filtrowane",
  "search intents and cards · <kbd>Enter</kbd> selects the marked intent · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> for several":"szukaj intencji i kart · <kbd>Enter</kbd> wybiera zaznaczoną intencję · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> wybiera kilka",
  "Search cleared":"Wyczyszczono wyszukiwanie",
  "Typing in SEARCH ranks intents and filters cards together (both languages).":"Tekst wpisany w SZUKAJ szereguje intencje i jednocześnie filtruje karty, w obu językach.",

  "ROLE":"ROLA",
  "EN":"EN",
  "PL":"PL",
  "Etiuda":"Etiuda",
  "Etiuda catalog":"Katalog Etiudy",
  "Ready replies, beside any chat":"Gotowe odpowiedzi, obok każdego czatu",
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
  "Show {LANG} cards":"Pokaż karty: {LANG}",
  "English cards":"Karty po angielsku",
  "Polish cards":"Karty po polsku",
  "{LANG} cards":"Karty: {LANG}",
  "Showing {LANG} cards; click or press {KEY} for {NEXT}":"Widoczne karty: {LANG}; kliknij albo naciśnij {KEY}, aby przejść na {NEXT}",
  "Showing English cards; click or press {KEY} for Polish":"Widoczne karty po angielsku; kliknij albo naciśnij {KEY}, aby przejść na polski",
  "Showing Polish cards; click or press {KEY} for English":"Widoczne karty po polsku; kliknij albo naciśnij {KEY}, aby przejść na angielski",
  "Scroll tabs left":"Przewiń rozmowy w lewo",
  "Scroll tabs right":"Przewiń rozmowy w prawo",
  "The new tab starts with cleared fields and your settings kept.":"Nowa rozmowa ma puste pola i zachowane ustawienia.",
  "New tab (same shared settings; cleared PAX, intent, ROLE, categories)":"Nowa rozmowa (te same wspólne ustawienia; wyczyszczone PAX, intencja, ROLE, kategorie)",
  "One tab for each customer you are talking to, each with its own PAX, intent, ROLE and categories":"Osobna rozmowa dla każdego klienta, z własnym PAX, intencją, ROLE i kategoriami",
  "Click to switch, or drag to reorder":"Kliknij, aby przełączyć, lub przeciągnij, aby zmienić kolejność",
  "The name customers see, and the language Etiuda's own buttons and menus are written in":"Nazwa, którą widzą klienci, i język przycisków oraz menu samej Etiudy",
  "The customer's name as the chat gives it, filling {PAX} with the tidied first name":"Imię i nazwisko klienta w postaci z czatu; {PAX} dostaje z nich uporządkowane imię",
  "{PAX} fills the first name even when the chat gives the full name.":"{PAX} wstawia samo imię, nawet gdy z czatu przychodzi imię i nazwisko.",
  "class":"klasa",
  "Who is on the chat, filling {ROLE} in internal comments":"Kto jest po drugiej stronie czatu. Wypełnia {ROLE} w komentarzach wewnętrznych.",
  "booker, customer, account holder":"rezerwujący, klient, właściciel konta",
  "Notches for the ROLE wheel, comma-separated; blanks and repeats are dropped":"Pozycje pokrętła ROLE po przecinku; puste i powtórzone są pomijane",
  "Intent list":"Lista intencji",
  "Click to pick, again to clear, and hold Ctrl for several":"Kliknij, aby wybrać, i ponownie, aby odznaczyć; z Ctrl można wybrać kilka",
  "Set {INTENT}":"Ustaw {INTENT}",
  "Clear":"Wyczyść",
  "Clear PAX":"Wyczyść PAX",
  "Clear agent":"Wyczyść nazwę agenta",
  "Clear agent name":"Wyczyść nazwę agenta",
  "Clear customer name":"Wyczyść imię klienta",
  "Clear intents":"Wyczyść intencje",
  "Clear all selected intents":"Wyczyść wszystkie wybrane intencje",
  "All categories":"Wszystkie kategorie",
  "Pick a category":"Wybierz kategorię",
  "Show all categories; double-click to reset their order":"Pokaż wszystkie kategorie; kliknij dwukrotnie, aby przywrócić ich kolejność",
  "Filter by category; a green ring marks one that relates to the chosen intent":"Filtruj według kategorii; zielona obwódka oznacza kategorię powiązaną z wybraną intencją",
  "Filter by category; a green ring marks one that relates to the chosen intent, and {KEY} shows every row":"Filtruj według kategorii; zielona obwódka oznacza kategorię powiązaną z wybraną intencją, a {KEY} pokazuje wszystkie rzędy",
  "Supporting category":"Kategoria wspierająca",
  "Linked to the selected intent":"Powiązana z wybraną intencją",
  "Hover here or hold Ctrl to show the intent panel":"Najedź tutaj lub przytrzymaj Ctrl, aby pokazać panel intencji",
  "Keep the panel docked even on a narrow window":"Utrzymuje panel zadokowany nawet przy wąskim oknie",
  "Lock the intent panel open":"Zablokuj panel intencji",
  "Double-click to reset the intent order":"Kliknij dwukrotnie, aby przywrócić kolejność intencji",
  "Drag to reorder":"Przeciągnij, aby zmienić kolejność",
  "Drag to reorder, or onto a category to move it there":"Przeciągnij, aby zmienić kolejność, albo upuść na kategorii, aby przenieść tam kartę",
  "Click to copy":"Kliknij, aby skopiować",
  "Click to copy full URL":"Kliknij, aby skopiować pełny adres",
  "Click to copy, or drag to reorder these":"Kliknij, aby skopiować, lub przeciągnij, aby zmienić kolejność",
  "Hide this card":"Ukryj tę kartę",

  "Show this card again":"Pokaż tę kartę ponownie",
  "Hide this intent":"Ukryj tę intencję",
  "Hide this intent: it greys out and drops to the bottom":"Ukryj tę intencję: trafi, wyszarzona, na koniec listy",
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
  "Welcome":"Witamy",
  "Skip tour":"Pomiń przewodnik",
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
  "The language of the buttons and menus, not of the macros: those follow EN|PL in the header":"Język przycisków i menu, nie makr: język makr zmienia przełącznik EN|PL w nagłówku",
  "Appearance":"Wygląd",
  "Theme":"Motyw",
  "Light":"Jasny",
  "Dark":"Ciemny",
  "System":"Systemowy",
  "System follows your computer's own setting.":"Systemowy: zgodnie z ustawieniem tego komputera.",
  "Blur effects":"Efekty rozmycia",
  "Blurred panel backgrounds and the blur behind dialogs. Turn off if text reads less clearly, or the machine struggles.":"Rozmyte tło paneli i rozmycie za oknami dialogowymi. Warto je wyłączyć, jeśli tekst traci czytelność albo komputer zwalnia.",
  "Animations":"Animacje",
  "Transitions, slides, and the cards re-sorting themselves. Switches itself off when your system asks for reduced motion.":"Przejścia, przesunięcia i przestawianie się kart. Ustawienie wyłącza się samo, gdy system prosi o ograniczenie ruchu.",
  "Keyboard shortcuts":"Skróty klawiszowe",
  "An alternative: click, then press the key combo":"Skrót alternatywny: kliknij, a następnie naciśnij kombinację klawiszy",
  "Press the alternative (Esc to cancel, Backspace to clear)":"Naciśnij skrót alternatywny (Esc anuluje, Backspace usuwa)",
  "Alternative cleared":"Usunięto skrót alternatywny",
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
  "Minimise":"Minimalizuj",
  "Maximise":"Maksymalizuj",
  "Restore":"Przywróć",
  "Interface language":"Język interfejsu",
  "Theme follows the system":"Motyw zgodny z systemem",
  "Animations reduced":"Animacje ograniczone",
  "Animations on":"Animacje włączone",
  "Blur effects on":"Efekty rozmycia włączone",
  "Blur effects off":"Efekty rozmycia wyłączone",
  "How should your replies be signed?":"Jak podpisywać odpowiedzi?",
  "Customers see it at the foot of every reply. It can be changed at any time in Settings.":"Tak podpis zobaczą klienci pod każdą odpowiedzią. Zmienić go można w każdej chwili w Ustawieniach.",
  "for instance, Kate":"na przykład Kasia",
  "Kate":"Kasia",
  "Sign with this":"Podpisz",
  "Beside the customer's name there is now a wheel: it chooses who in the team this reply names.":"Obok imienia klienta jest teraz kółko: wybiera się nim osobę z zespołu, którą wymienia ta odpowiedź.",
  "No catalog loaded":"Nie wczytano katalogu",
  "This catalog has changed since it was loaded.":"Ten katalog zmienił się od czasu wczytania.",
  "This file is an earlier edition than the one loaded now.":"Ten plik to wcześniejsze wydanie niż wczytane teraz.",
  "The tour of Etiuda's controls, one at a time":"Przewodnik po Etiudzie, krok po kroku",
  "The tour waits in the Menu, under Show tour…":"Przewodnik czeka w Menu, pod Pokaż przewodnik…",
  "To begin, the name your replies are signed with. Customers see it at the foot of each one, and it can be changed at any time in Settings.":"Na początek podpis: imię, które klienci zobaczą pod każdą odpowiedzią. Można je zmienić w każdej chwili w Ustawieniach.",
  "A catalog of replies":"Katalog odpowiedzi",
  "Replies come in a catalog. Click <b>Load a catalog</b> under the logo and choose the team's catalog in {FOLDER}. The tour carries on as soon as it is in place.":"Gotowe odpowiedzi przynosi katalog. Proszę kliknąć <b>wczytaj katalog</b> pod logo i wybrać katalog zespołu z folderu {FOLDER}. Przewodnik poprowadzi dalej, gdy tylko katalog będzie na miejscu.",
  "Replies come in a catalog. Click <b>Load a catalog</b> under the logo and choose the catalog file. The tour carries on as soon as it is in place, and the catalog stays in this browser, ready whenever you come back.":"Gotowe odpowiedzi przynosi katalog. Proszę kliknąć <b>wczytaj katalog</b> pod logo i wybrać plik katalogu. Przewodnik poprowadzi dalej, gdy tylko katalog będzie na miejscu, a sam katalog zostanie w tej przeglądarce i poczeka na każdy powrót.",
  "comes with Etiuda":"dołączony do Etiudy",
  "Signed":"Podpisany",
  "Unsigned":"Niepodpisany",
  "This file is signed with the key {KEY}.":"Ten plik podpisano kluczem {KEY}.",
  "This file has changed since it was signed.":"Ten plik zmienił się od czasu podpisania.",
  "This file is signed with a key this computer does not know.":"Ten plik podpisano kluczem, którego nie zna ten komputer.",
  "The catalog loaded now is signed, and this edition is not.":"Wczytany teraz katalog jest podpisany, a to wydanie nie.",
  "The customer's name goes here as the chat gives it, surname and capitals included, and every reply greets them by first name, in Polish in the vocative (ANNA KOWALSKA becomes <b>Anno</b>). The wheel beside it says who is on the chat, for internal comments.":"Tu wkleja się imię klienta prosto z czatu, z nazwiskiem i wielkimi literami, a każda odpowiedź zwraca się do niego po imieniu, po polsku w wołaczu (z ANNY KOWALSKIEJ robi się <b>Anno</b>). Kółko obok określa, kto jest po drugiej stronie czatu, na użytek komentarzy wewnętrznych.",
  "The customer's name":"Imię klienta",
  "The customer's name goes here as the chat gives it, surname and capitals included, and every reply greets them by first name, in Polish in the vocative (ANNA KOWALSKA becomes <b>Anno</b>).":"Tu wkleja się imię klienta prosto z czatu, z nazwiskiem i wielkimi literami, a każda odpowiedź zwraca się do niego po imieniu, po polsku w wołaczu (z ANNY KOWALSKIEJ robi się <b>Anno</b>).",
  "A word near what the customer means, such as 'refund', is enough: the intents on the left rank themselves and the cards narrow to match, in both languages. <kbd>Enter</kbd> picks the marked intent, and <kbd>Esc</kbd> clears the box.":"Wystarczy słowo bliskie temu, o co pyta klient, na przykład 'zwrot': intencje po lewej ułożą się według trafności, a karty zawężą do pasujących, w obu językach. <kbd>Enter</kbd> wybiera zaznaczoną intencję, a <kbd>Esc</kbd> czyści pole.",
  "An intent names what the customer has come about. A click on one brings its replies forward, ringed <b class=\"t-go\">green</b>, with its phrase filling <span class=\"fillmiss\">INTENT</span> wherever a reply uses it. <kbd>Ctrl</kbd>+click picks several, and the star keeps the ones used most at the top.":"Intencja mówi, z czym klient przychodzi. Kliknięcie którejś wysuwa jej odpowiedzi do przodu, obwiedzione na <b class=\"t-go\">zielono</b>, a jej fraza trafia wszędzie tam, gdzie w odpowiedzi stoi <span class=\"fillmiss\">INTENT</span>. <kbd>Ctrl</kbd>+kliknięcie wybiera kilka, a gwiazdka trzyma na górze te używane najczęściej.",
  "A click on a reply copies the whole of it, greeting, name and signature filled in, ready to paste into the chat. A card marked <b>1/2</b> or <b>STEP 1/3</b> holds several, each copied on its own. <kbd>↑</kbd> <kbd>↓</kbd> and <kbd>Enter</kbd> do the same from the keyboard.":"Kliknięcie odpowiedzi kopiuje ją w całości, z powitaniem, imieniem i podpisem, gotową do wklejenia w czacie. Karta z oznaczeniem <b>1/2</b> albo <b>KROK 1/3</b> mieści kilka odpowiedzi, a każdą kopiuje się osobno. Z klawiatury to samo robią <kbd>↑</kbd> <kbd>↓</kbd> i <kbd>Enter</kbd>.",
  "A click on a category shows only its cards, and <kbd>Ctrl</kbd>+click keeps several. A <b class=\"t-go\">green</b> ring marks one holding a card for the chosen intent, and a <b class=\"t-acc\">blue</b> one a supporting category, useful for any question.":"Kliknięcie kategorii zostawia tylko jej karty, a <kbd>Ctrl</kbd>+kliknięcie pozwala wybrać kilka. <b class=\"t-go\">Zielona</b> obwódka oznacza kategorię z kartą dla wybranej intencji, a <b class=\"t-acc\">niebieska</b> kategorię wspierającą, przydatną przy każdym pytaniu.",
  "Each customer on the chat gets a tab of their own here, with their name, intent and language, so a reply never carries the wrong name. <b>+</b> or {NEW} opens another conversation, and {KEY} moves between them.":"Każdy klient na czacie ma tu osobną rozmowę, z własnym imieniem, intencją i językiem, więc żadna odpowiedź nie pójdzie z cudzym imieniem. Kolejną rozmowę otwiera <b>+</b> albo skrót {NEW}, a {KEY} przełącza między nimi.",
  "Replies in this conversation follow the language chosen here, so each customer is answered in their own. {KEY} switches it from anywhere.":"Odpowiedzi w tej rozmowie idą w języku wybranym tutaj, więc każdy klient dostaje odpowiedź w swoim. {KEY} przełącza język z dowolnego miejsca.",
  "The star lifts a card to the top of its category, and under <span class=\"t-pill\"><span data-icon=\"all\"></span>All</span> into <b class=\"t-fav\"><span data-icon=\"star\"></span>Favourites</b>.<br>The eye puts it away, greyed at the foot of its category, and brings it back from there.<br>The pencil opens it for editing, and <b>Reset</b> in the editor brings back the catalog's own words.<br>Click the pencil on this card.":"Gwiazdka przenosi kartę na początek jej kategorii, a w widoku <span class=\"t-pill\"><span data-icon=\"all\"></span>Wszystkie</span> do <b class=\"t-fav\"><span data-icon=\"star\"></span>Ulubionych</b>.<br>Oko odkłada ją na bok, szarą, na dół kategorii, i stamtąd też ją przywraca.<br>Ołówek otwiera ją do poprawek, a <b>Przywróć</b> w edytorze wraca do treści z katalogu.<br>Proszę kliknąć ołówek na tej karcie.",
  "<span class=\"t-sec\">Content</span> holds the text in both languages and the internal note; the folds below hold the keywords, the category, the linked intents and the finer settings. <b>Cancel</b> leaves everything as it was.":"<span class=\"t-sec\">Treść</span> to tekst w obu językach i notatka wewnętrzna; w zwiniętych sekcjach poniżej są słowa kluczowe, kategoria, powiązane intencje i ustawienia zaawansowane. <b>Anuluj</b> zostawia wszystko bez zmian.",
  "Click <b>+</b> to write a card of your own, in the category open now or in any other chosen in the editor.":"Proszę kliknąć <b>+</b>, żeby napisać własną kartę: trafi do otwartej teraz kategorii albo do innej, wybranej w edytorze.",
  "A new card":"Nowa karta",
  "A blank card: the reply in both languages, a title and a category. <b>Save</b> keeps it, and <b>Cancel</b> leaves nothing behind.":"Pusta karta: odpowiedź w obu językach, tytuł i kategoria. <b>Zapisz</b> zachowuje kartę, a <b>Anuluj</b> nie zostawia po niej śladu.",
  "A click on a link copies it whole, and the text is yours to edit; it stays on this computer.":"Kliknięcie odnośnika kopiuje cały adres, a treść można zmieniać po swojemu; zostaje na tym komputerze.",
  "A click on a link copies it whole, and the text is yours to edit; it stays in this browser.":"Kliknięcie odnośnika kopiuje cały adres, a treść można zmieniać po swojemu; zostaje w tej przeglądarce.",
  "Click <b>Quick facts</b> to open the links and figures worth having to hand.":"Proszę otworzyć <b>Szybkie fakty</b>: odnośniki i liczby, które warto mieć pod ręką w rozmowie.",
  "Close them when ready, with the same button or a click outside, and the tour carries on.":"Kiedy wszystko jasne, proszę je zamknąć tym samym przyciskiem albo kliknięciem obok, a przewodnik poprowadzi dalej.",
  "This switches between light and dark. Etiuda follows the system until the first click, and keeps the choice from then on.":"Ten przycisk zmienia motyw z jasnego na ciemny i z powrotem. Do pierwszego kliknięcia Etiuda idzie za ustawieniem systemu, a potem pamięta wybór.",
  "Everything that is not a card: the Library, Settings, the panels' switches, and this tour again under <b>Show tour…</b>.":"Wszystko, co nie jest kartą: Biblioteka, Ustawienia, przełączniki paneli i ten przewodnik, pod <b>Pokaż przewodnik…</b>.",
  "Click <b>Menu</b>: the rest of Etiuda opens from there.":"Proszę kliknąć <b>Menu</b>: stamtąd otwiera się cała reszta Etiudy.",
  "Click <b>Library</b> in the Menu: the whole catalog is there.":"Cały katalog jest w <b>Bibliotece</b>; proszę ją otworzyć z Menu.",
  "<b><span data-icon=\"settings\"></span> → Library</b> holds every card, intent and category, to add, edit, hide or move. Catalogs are loaded here too, and your own improvements go out from here as a file for whoever keeps the wording.":"<b><span data-icon=\"settings\"></span> → Biblioteka</b> mieści każdą kartę, intencję i kategorię, do dodania, edycji, ukrycia albo przeniesienia. Tu wczytuje się też katalogi i stąd wysyła się własne poprawki, jako plik dla osoby, która dba o treść.",
  "<b><span data-icon=\"settings\"></span> → Settings</b>: your name, the language of the buttons, the look and the shortcuts. Nothing here touches a card.":"<b><span data-icon=\"settings\"></span> → Ustawienia</b>: nazwa agenta, język przycisków, wygląd i skróty. Nic tutaj nie zmienia kart.",
  "One more window: open the <span data-icon=\"settings\"></span> Menu again and click <b>Settings</b>.":"Jeszcze jedno okno: proszę znów otworzyć <span data-icon=\"settings\"></span> Menu i wybrać <b>Ustawienia</b>.",
  "Once the window is open, the tour goes inside with it.":"Po otwarciu okna przewodnik zajrzy do środka.",
  "The tour carries on once this window is closed.":"Przewodnik ruszy dalej, gdy to okno się zamknie.",
  "That is the whole tour. <b>Show tour…</b> in the <span data-icon=\"settings\"></span> Menu brings it back, and <b>About Etiuda</b> lists every shortcut.":"To cały przewodnik. <b>Pokaż przewodnik…</b> w <span data-icon=\"settings\"></span> Menu otwiera go ponownie, a w <b>O Etiudzie</b> są wszystkie skróty.",
  "load a catalog":"wczytaj katalog",
  "Etiuda offers you the newest catalog from {FOLDER}; a catalog kept anywhere else loads with the button above.":"Etiuda proponuje najnowszy katalog z {FOLDER}; katalog z innego miejsca można wczytać przyciskiem powyżej.",
  "The catalog you load stays in this browser, ready whenever you come back.":"Wczytany katalog zostaje w tej przeglądarce i czeka na powrót.",
  "Load catalog…":"Wczytaj katalog…",
  "The catalog could not be loaded:":"Nie udało się wczytać katalogu:",
  "Catalogs in {FOLDER} appear here: load one from anywhere else, or put its file in the folder.":"Tu pojawią się katalogi z {FOLDER}: wystarczy wczytać katalog z innego miejsca albo umieścić plik w tym folderze."
};
// Is this a language this build carries? The table itself stays private to this file.
function uiLangKnown(l){ return !!(l && UI_STRINGS[l]); }
/* THE SYSTEM'S LANGUAGE WHERE NOTHING IS STORED: the browser's own list, which a shell takes from
   the Windows display language, first code this build has words for. A stored choice always wins,
   English included, so choosing English on a Polish Windows is kept. */
function systemUiLang(){
  let list=[];
  try{ list=(navigator.languages&&navigator.languages.length)?navigator.languages:[navigator.language]; }catch(e){}
  for(const tag of list){
    const code=String(tag||"").toLowerCase().split("-")[0];
    if(code==="en" || uiLangKnown(code)) return code;
  }
  return "en";
}
function uiLang(){
  const l=lsGet("eUiLang");
  if(l==="en" || uiLangKnown(l)) return l;
  return systemUiLang();                        // nothing stored, or a retired code
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
/* AN ACT THAT CAN BE UNDONE HAPPENS AT ONCE, and this bubble at the foot of the window offers the
   way back: over any dialog, until another act replaces it or UNDO_MS passes. */
const UNDO_MS=10000;
let undoTimer=0;
function offerUndo(said, undo){
  const was=$("#eUndo"); if(was) was.remove();
  clearTimeout(undoTimer);
  const el=document.createElement("div");
  el.className="bub bub-ask e-undo";
  el.id="eUndo";
  el.setAttribute("role","status");
  el.setAttribute("data-side","none");
  el.innerHTML='<p>'+esc(t(said))+'</p>'
    +'<div class="tour-actions"><button type="button" class="btn primary" id="eUndoBtn">'+esc(t("Undo"))+'</button></div>';
  cutLeaves();
  document.body.appendChild(el);
  const close=()=>{ clearTimeout(undoTimer); dismissNode(el); };
  el.querySelector("#eUndoBtn").onclick=()=>{ close(); undo(); };
  el.addEventListener("keydown",e=>{
    if(e.key!=="Escape") return;
    e.preventDefault(); e.stopPropagation(); close();
  });
  undoTimer=setTimeout(close,UNDO_MS);
}
let tt;
const TOAST_MS=1700;
// The one toast that asks for an action (mark.js) holds this long; every other, TOAST_MS.
const TOAST_HAND_MS=6000;
// A refusal holds longer: it is read to the end, and it names what to do next.
const TOAST_REFUSAL_MS=5000;
var toastSerial=0;
let toastSwap=0;
/* ABOVE THE FOOTER where the footer is on screen, which on an empty desk it is: never over its words. */
function placeToast(el){
  const f=document.querySelector("footer"), r=f && f.getBoundingClientRect();
  const lift=(r && r.height && r.top<innerHeight) ? Math.round(innerHeight-r.top) : 0;
  el.style.bottom=lift ? (lift+8)+"px" : "";
}
function toast(m, ms, refusal){
  toastSerial++;
  /* Every message the app speaks passes through here, so this is the one place a toast needs
     translating - not fifty call sites. */
  m=t(m);
  const el=$("#toast");
  const put=()=>{
    el.classList.remove("swap");
    el.classList.toggle("refusal",!!refusal);
    if(refusal) el.innerHTML=ICON_LINT_WARNING+'<span>'+esc(m)+'</span>';
    else el.textContent=m;
    placeToast(el); markCut(el); el.classList.add("show");
  };
  /* A TOAST ARRIVING OVER ONE THAT SHOWS dips out on the dismiss tier and comes back with its new
     words, rather than rewriting them in place and snapping the pill to its new width. */
  const dip=el.classList.contains("show") && !mgReduceMotion();
  clearTimeout(tt); clearTimeout(toastSwap);
  if(dip){ el.classList.add("swap"); toastSwap=setTimeout(put,M_MS.dismiss); }
  else put();
  tt=setTimeout(()=>el.classList.remove("show"),(ms||TOAST_MS)+(dip?M_MS.dismiss:0));
}
/* A REFUSAL IS NOT A CONFIRMATION: its own ground and the warning glyph, and a longer life. */
function toastRefusal(m){ toast(m, TOAST_REFUSAL_MS, true); }
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
/* THE AWAITING COUNT IN THE SAME REGISTER, and a key of its own because it carries a language as
   well as a number. The noun is still cards, deliberately: the number is a SUBSET of the count
   beside it, and dropping it left Polish a bare numeral with no subject. {LANG} IS THE CODE IN
   CAPITALS, the way the engine names a language a card has no version in ("No {LANG} version for
   this card"); an endonym belongs to a switcher, where a language is chosen rather than reported.
   Both spaces round it are no-break, for the reason written over the nouns above. */
function catalogAwaitingLine(n,lang){
  return counted(n,"{N} card awaiting {LANG}","{N} cards awaiting {LANG}")
    .split("{LANG}").join(String(lang||"").toUpperCase());
}
/* A FILE'S OWN DATE AND TIME, formatted explicitly rather than by locale: toLocaleDateString
   follows the machine rather than the interface language, so one file would read two ways on two
   desks. Day first, both parts padded, and the time as well as the date because two catalogs
   saved on the same day are told apart by nothing else. Empty for a file with no time. */
function fileStamp(ms){
  const n=+ms||0;
  if(!n) return "";
  const d=new Date(n), p=v=>String(v).padStart(2,"0");
  return p(d.getDate())+"."+p(d.getMonth()+1)+"."+d.getFullYear()+" "+p(d.getHours())+":"+p(d.getMinutes());
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
  ["header","#settingsMenu","#modalCard","footer","#tourRoot",
   "#intentRail","#sampleMark"].forEach(sel=>{
    const el=document.querySelector(sel);
    if(el) translateTree(el);
  });
}

export {
  UI_LANGS,
  uiLangKnown,
  uiLang,
  systemUiLang,
  t,
  offerUndo,
  tc,
  counted,
  catalogCountsLine,
  catalogAwaitingLine,
  fileStamp,
  translateTree,
  translateChrome,
  toast,
  toastRefusal,
  TOAST_MS,
  TOAST_HAND_MS,
  toastSerial
};
