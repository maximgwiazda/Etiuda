import { lsGet, lsSet, lsDel } from "./storage.js";
import { markCut } from "./cut-text.js";
import { $, originOf } from "./dom.js";
import { hangBubble } from "./bubble.js";
import { esc } from "./esc.js";
import { cutLeaves, dismissNode, mgReduceMotion, M_MS } from "./motion.js";
import { ICON_LINT_WARNING, ICON_STAMP, ICON_X } from "./icons.js";

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
  "maintenance␟the chosen catalog folder's":"z folderu z plikami katalogów wybranego w Ustawieniach",
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
  "maintenance␟catalog folder":"folder z plikami katalogów",
  "maintenance␟tour":"przewodnik",
  "maintenance␟under way":"w toku",
  "maintenance␟offered at the next start":"zaproponowany przy następnym uruchomieniu",
  "maintenance␟seen or declined":"obejrzany lub odrzucony",
  "maintenance␟this start":"to uruchomienie",
  "maintenance␟after a crash":"po awarii",
  "maintenance␟last crash":"ostatnia awaria",
  "maintenance␟ordinary":"zwykłe",
  "maintenance␟desk backup":"kopia zapasowa danych",
  "maintenance␟not needed":"niepotrzebna",
  "maintenance␟statistics":"statystyki",
  "Columns":"Kolumny",
  "What stays docked":"Co pozostaje zadokowane",
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
  "customer's name":"imię klienta",
  "Role class":"Klasa roli",
  "Create a card":"Utwórz kartę",
  "Create a card in {CAT}":"Utwórz kartę w kategorii {CAT}",
  "A different word may do better.":"Inne słowo może trafić lepiej.",
  "The words you selected. Type to change them.":"Zaznaczone słowa. Można je zmienić, pisząc.",
  "Your own words?":"Własne słowa?",
  "Fix spelling":"Popraw pisownię",
  "Shorter":"Krócej",
  "Friendlier":"Przyjaźniej",
  "More formal":"Bardziej oficjalnie",
  "Into Polish":"Na polski",
  "Into English":"Na angielski",
  "A press sends only the words above to {ADDRESS}, your organisation's AI service.":"Kliknięcie wysyła tylko powyższe słowa do {ADDRESS}, usługi AI organizacji.",
  "You selected":"Zaznaczony tekst",
  "Sent to {ADDRESS}: only the words you selected. Read the result before you send it.":"Do {ADDRESS} trafiły tylko zaznaczone słowa. Wynik należy przeczytać przed wysłaniem.",
  "Enter puts it in place of your selection":"Enter wstawia go w miejsce zaznaczenia",
  "Back to the replies":"Wróć do odpowiedzi",
  "Waiting for the service at {ADDRESS}…":"Oczekiwanie na usługę pod adresem {ADDRESS}…",
  "Reword":"Przeredaguj",
  "Reword this card":"Przeredaguj tę kartę",
  "Or say how, then press Enter":"Albo opis zmiany, potem Enter",
  "Sends this card's words to {ADDRESS}. The card itself changes only if you approve the result.":"Wysyła treść tej karty do {ADDRESS}. Sama karta zmieni się tylko po zatwierdzeniu wyniku.",
  "Reworded: {ACT}":"Przeredagowano: {ACT}",
  "Reworded as described":"Przeredagowano według opisu",
  "Not saved.":"Niezapisane.",
  "Shown until Etiuda is next opened, unless you approve it.":"Widoczne do ponownego uruchomienia Etiudy, chyba że zostanie zatwierdzone.",
  "Approve":"Zatwierdź",
  "Keep these words as your own edit of the card":"Zachowaj tę treść jako własną zmianę karty",
  "Revert":"Przywróć",
  "Show the card as it was":"Pokaż kartę w pierwotnej postaci",
  "The result lost a name this card fills in, or one of its steps, so it is not shown. The card is as it was; another try may keep them.":"W wyniku zabrakło nazwy, którą karta wypełnia, albo jednego z jej kroków, więc nie został pokazany. Karta pozostała bez zmian; kolejna próba może je zachować.",
  "The service at {ADDRESS} did not answer in time. Your words are as you wrote them.":"Usługa pod adresem {ADDRESS} nie odpowiedziała na czas. Zaznaczony tekst pozostał bez zmian.",
  "The service at {ADDRESS} did not answer in time. The card is as it was.":"Usługa pod adresem {ADDRESS} nie odpowiedziała na czas. Karta pozostała bez zmian.",
  "The service at {ADDRESS} is busy; a later try may go through. Your words are as you wrote them.":"Usługa pod adresem {ADDRESS} jest zajęta; późniejsza próba może się udać. Zaznaczony tekst pozostał bez zmian.",
  "The service at {ADDRESS} is busy; a later try may go through. The card is as it was.":"Usługa pod adresem {ADDRESS} jest zajęta; późniejsza próba może się udać. Karta pozostała bez zmian.",
  "No result came back from {ADDRESS}. Your words are as you wrote them.":"Z adresu {ADDRESS} nie nadszedł wynik. Zaznaczony tekst pozostał bez zmian.",
  "No result came back from {ADDRESS}. The card is as it was.":"Z adresu {ADDRESS} nie nadszedł wynik. Karta pozostała bez zmian.",
  "The service at {ADDRESS} failed three times in a row, so Etiuda waits before asking it again; nothing was sent. Your words are as you wrote them.":"Usługa pod adresem {ADDRESS} zawiodła trzy razy z rzędu, więc Etiuda odczeka, zanim znów się do niej zwróci; nic nie zostało wysłane. Zaznaczony tekst pozostał bez zmian.",
  "The service at {ADDRESS} failed three times in a row, so Etiuda waits before asking it again; nothing was sent. The card is as it was.":"Usługa pod adresem {ADDRESS} zawiodła trzy razy z rzędu, więc Etiuda odczeka, zanim znów się do niej zwróci; nic nie zostało wysłane. Karta pozostała bez zmian.",
  "These words are over 4000 characters, more than can be sent, so nothing was sent. Your words are as you wrote them.":"Tekst ma ponad 4000 znaków, więcej, niż można wysłać, więc nic nie zostało wysłane. Zaznaczony tekst pozostał bez zmian.",
  "These words are over 4000 characters, more than can be sent, so nothing was sent. The card is as it was.":"Tekst ma ponad 4000 znaków, więcej, niż można wysłać, więc nic nie zostało wysłane. Karta pozostała bez zmian.",
  "Rewording is turned off on this computer, so nothing was sent. Your words are as you wrote them.":"Przeredagowanie jest wyłączone na tym komputerze, więc nic nie zostało wysłane. Zaznaczony tekst pozostał bez zmian.",
  "Rewording is turned off on this computer, so nothing was sent. The card is as it was.":"Przeredagowanie jest wyłączone na tym komputerze, więc nic nie zostało wysłane. Karta pozostała bez zmian.",
  "The organisation's model is no longer set, so nothing was sent. Your words are as you wrote them.":"Model organizacji nie jest już ustawiony, więc nic nie zostało wysłane. Zaznaczony tekst pozostał bez zmian.",
  "The organisation's model is no longer set, so nothing was sent. The card is as it was.":"Model organizacji nie jest już ustawiony, więc nic nie zostało wysłane. Karta pozostała bez zmian.",
  "Rewording is not available just now, so nothing was sent. Your words are as you wrote them.":"Przeredagowanie jest teraz niedostępne, więc nic nie zostało wysłane. Zaznaczony tekst pozostał bez zmian.",
  "Rewording is not available just now, so nothing was sent. The card is as it was.":"Przeredagowanie jest teraz niedostępne, więc nic nie zostało wysłane. Karta pozostała bez zmian.",
  "The result came back empty, so it is not shown. The card is as it was; another try may do better.":"Wynik nadszedł pusty, więc nie został pokazany. Karta pozostała bez zmian; kolejna próba może się udać.",
  "One of this card's alternatives came back with no words, so the result is not shown. The card is as it was; another try may do better.":"Jeden z wariantów karty wrócił bez treści, więc wynik nie został pokazany. Karta pozostała bez zmian; kolejna próba może się udać.",
  "Rewording":"Przeredagowanie",
  "Reword on cards and Your own words? in Quick replies send the card's words or the selected words to the organisation's model at {ADDRESS}, only when pressed. Turned off, both are gone and nothing is sent; the choice is yours, on this computer.":"Przycisk Przeredaguj na kartach i Własne słowa? w Szybkich odpowiedziach wysyłają treść karty albo zaznaczony tekst do modelu organizacji pod adresem {ADDRESS}, tylko po kliknięciu. Po wyłączeniu oba znikają i nic nie jest wysyłane; to osobisty wybór na tym komputerze.",
  "Press":"Naciśnij",
  "{KEY} clears the search and the intents and shows every card.":"{KEY} czyści wyszukiwanie i intencje i pokazuje wszystkie karty.",
  "Etiuda is ready for its first replies.":"Etiuda czeka na pierwsze odpowiedzi.",
  "Most people answer from their team's catalog. Joining the team brings it to this desk, with every update after.":"Większość osób odpowiada z katalogu swojego zespołu. Po dołączeniu do zespołu katalog trafia na to stanowisko, a z nim każda kolejna aktualizacja.",
  "Join your team":"Dołącz do zespołu",
  "No invitation yet? The team's lead sends one.":"Nie ma jeszcze zaproszenia? Wysyła je lider zespołu.",
  "Working on your own?":"Praca bez zespołu?",
  "Catalog files":"Pliki katalogów",
  "Loaded":"Wczytany",
  "Newer":"Nowszy",
  "Written after the catalog you have":"Zapisany później niż wczytany katalog",
  "Open this folder":"Otwórz ten folder",
  "Change folder…":"Zmień folder…",
  "Catalog files are read from {PATH}":"Pliki katalogów są wczytywane z folderu {PATH}",
  "Open folder":"Otwórz folder",
  "In use":"W użyciu",
  "Published by the team's lead; everyone on the team works from the same edition.":"Publikuje je lider zespołu; cały zespół pracuje na tym samym wydaniu.",
  "Your own; one marked Private is never sent to the team.":"Własne; katalog oznaczony jako Prywatny nigdy nie trafia do zespołu.",
  "Signed by the lead":"Podpis lidera",
  "Not signed":"Bez podpisu",
  "Set aside":"Odłożony",
  "(your own)":"(własny)",
  "Eject":"Odłącz",
  "Load":"Wczytaj",
  "Choose the folder Etiuda reads catalog files from":"Wybierz folder, z którego Etiuda czyta pliki katalogów",
  "That setting could not be saved.":"Nie udało się zapisać tego ustawienia.",
  "{FILE} is not a catalog file Etiuda can read.":"{FILE} nie jest plikiem katalogu, który Etiuda potrafi odczytać.",
  "This edition needs Etiuda {VERSION} or newer, so it is kept but not used yet, and the edition in use stays as it is. Once a newer Etiuda is installed, the new edition is offered here.":"To wydanie wymaga Etiudy w wersji {VERSION} lub nowszej, więc zostało zachowane, ale nie jest jeszcze używane, a obecne wydanie działa dalej bez zmian. Po zainstalowaniu nowszej wersji Etiudy nowe wydanie pojawi się tutaj.",
  "{FILE} could not be read.":"Nie udało się odczytać pliku {FILE}.",
  "This computer may not read {FILE}, so nothing was loaded. A copy saved where it may read, such as Documents, can be picked instead.":"Ten komputer nie ma uprawnień do odczytu pliku {FILE}, więc nic nie wczytano. Wystarczy wybrać kopię zapisaną tam, gdzie odczyt jest możliwy, na przykład w Dokumentach.",
  "{FILE} is no longer where it was, so nothing was loaded. Pick it again from where it is now.":"Pliku {FILE} nie ma już w tym miejscu, więc nic nie wczytano. Wystarczy wybrać go ponownie tam, gdzie jest teraz.",
  "Another program holds {FILE} open, so nothing was loaded. Once it is closed there, pick it again.":"Plik {FILE} jest otwarty w innym programie, więc nic nie wczytano. Po zamknięciu go tam wystarczy wybrać go ponownie.",
  "{FILE} is empty, so nothing was loaded.":"Plik {FILE} jest pusty, więc nic nie wczytano.",
  "{FILE} could not be read from the disk ({CODE}), so nothing was loaded. Try again once the disk answers, or pick a copy from elsewhere.":"Pliku {FILE} nie udało się odczytać z dysku ({CODE}), więc nic nie wczytano. Wystarczy spróbować ponownie, gdy dysk będzie dostępny, albo wybrać kopię z innego miejsca.",
  "The team's folder does not answer from this computer just now, so it was not opened. Open it again once it can be reached: with the network drive connected, or the program that syncs it running.":"Folder zespołu nie odpowiada teraz z tego komputera, więc go nie otwarto. Wystarczy otworzyć go ponownie, gdy będzie osiągalny: po podłączeniu dysku sieciowego albo uruchomieniu programu, który go synchronizuje.",
  "Settings names a file where the team's folder should be, so nothing was opened. The folder can be chosen again from the Library.":"W Ustawieniach wskazano plik tam, gdzie powinien być folder zespołu, więc niczego nie otwarto. Folder można wybrać ponownie w Bibliotece.",
  "This computer did not open the team's folder just now. Clicking the link again tries again.":"Ten komputer nie otworzył teraz folderu zespołu. Można spróbować ponownie, klikając ten sam odnośnik.",
  "{FILE} could not be saved.":"Nie udało się zapisać pliku {FILE}.",
  "Add a card to {CAT}":"Dodaj kartę do kategorii {CAT}",
  "Clear search text":"Wyczyść tekst wyszukiwania",
  "not linked to your intent":"niepowiązane z wybraną intencją",
  "also mentions your search":"zawierają też szukane słowa",
  "Close in meaning":"Bliskie znaczeniem",
  "A search ranks the cards by relevance; clear it to order them yourself":"Wyszukiwanie porządkuje karty według trafności; po jego wyczyszczeniu kolejność można ustawić ręcznie",
  "Drag header to reorder within the same highlight group":"Przeciągnij nagłówek, aby zmienić kolejność wśród kart o tym samym wyróżnieniu",
  "Drag header to reorder within the same highlight group; same category only":"Przeciągnij nagłówek, aby zmienić kolejność wśród kart o tym samym wyróżnieniu i w tej samej kategorii",
  "{N} hidden":"ukrytych: {N}",
  "none":"brak",
  "Alternatives, split by blank lines":"Warianty oddzielone pustymi liniami",
  "Steps, in order (STEP badges)":"Kolejne kroki (znaczniki KROK)",
  "{PAX} as first name only":"{PAX} jako samo imię",
  "Wears {INT} under every intent":"Oznaczenie {INT} przy każdej intencji",
  "First among the cards marked {INT}":"Pierwsza wśród kart oznaczonych {INT}",
  "steps":"kroki",
  "alt":"alt",
  /* Two senses, one English phrase: the agent typing their own name is asked for a first
     name, and a card flag says the customer's token is cut down to one. The second takes a
     context key, because Polish cannot say both with one word. */
  "first name":"imię",
  "pax␟first name":"tylko imię",
  "every intent":"wszystkie intencje",
  "top":"góra",
  "{L} only":"tylko {L}",
  "nothing set":"nic nie ustawiono",
  "Unnamed catalog":"Katalog bez nazwy",
  "The team has taken up this catalog":"Zespół przyjął ten katalog",
  "{LEAD} made {TITLE} a team catalog, edition {N}, so everyone on the team now works from it.":"{LEAD} publikuje teraz {TITLE} jako katalog zespołowy, wydanie {N}, więc cały zespół z niego korzysta.",
  "{TITLE} is now a team catalog, edition {N}, so everyone on the team works from it.":"{TITLE} jest teraz katalogiem zespołowym, wydanie {N}, więc cały zespół z niego korzysta.",
  "Switch, and the team's edition is the one in use here. Your own {TITLE} stays on this desk, under personal catalogs, whichever you choose.":"Po przełączeniu w użyciu jest tu wydanie zespołu. Własny katalog {TITLE} zostaje na tym stanowisku, w katalogach osobistych, niezależnie od wyboru.",
  "Keep both":"Zachowaj oba",
  "Switch to the team's":"Przełącz na zespołowy",
  "Team catalogs":"Katalogi zespołowe",
  "Personal catalogs":"Katalogi osobiste",
  "The team now publishes this catalog as {TITLE}, edition {N}, since {DATE}.":"Zespół publikuje teraz ten katalog jako {TITLE}, wydanie {N}, od {DATE}.",
  "Made from your own {TITLE} by {LEAD}":"Powstał z własnego katalogu {TITLE}; publikuje {LEAD}",
  "Made from your own {TITLE}":"Powstał z własnego katalogu {TITLE}",
  "Put back in use":"Przywróć do użycia",
  "Your own {TITLE} is in use again.":"Własny katalog {TITLE} znów jest w użyciu.",
  "The catalog in use has changes not yet exported. Put your own {TITLE} back in use? The changes are set aside under Personal catalogs, not lost.":"Katalog w użyciu ma zmiany, których jeszcze nie wyeksportowano. Przywrócić do użycia własny katalog {TITLE}? Zmiany zostaną odłożone w katalogach osobistych i nie przepadną.",
  "The catalog in use could not be set aside safely, so nothing has changed. It can be tried again.":"Nie dało się bezpiecznie odłożyć katalogu w użyciu, więc nic się nie zmieniło. Można spróbować ponownie.",
  "Your own {TITLE} could not be put back in use, so the catalog in use stays in use. It can be tried again.":"Nie dało się przywrócić do użycia własnego katalogu {TITLE}, więc katalog w użyciu nadal jest w użyciu. Można spróbować ponownie.",
  "The changes set aside are under Personal catalogs.":"Odłożone zmiany są w katalogach osobistych.",
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
  "rev":"wersja",
  "cards / replies":"karty / odpowiedzi",
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
  "STEP":"KROK",
  "step":"krok",
  "Ready to paste: {TITLE}, {WHAT}":"Gotowe do wklejenia: {TITLE}, {WHAT}",
  "A commitment, ready to paste: {TITLE}, {WHAT}":"Gotowe do wklejenia zobowiązanie: {TITLE}, {WHAT}",
  "Copied: paste it into the chat with Ctrl+V. Next time, {KEYS} opens Quick replies over any window and pastes the one chosen.":"Skopiowano: wystarczy wkleić odpowiedź w czacie skrótem Ctrl+V. Następnym razem {KEYS} otworzy Szybkie odpowiedzi nad dowolnym oknem i wklei wybraną.",
  "All":"Wszystkie",
  "cards":"karty",
  "categories":"kategorie",
  "intent":"intencja",
  "copy":"kopiuj",
  "facts":"fakty",
  "rail":"panel",
  "clear":"wyczyść",
  "Clear tab fields":"Wyczyść pola rozmowy",
  "Close tab":"Zamknij rozmowę",
  "Clear tab":"Wyczyść rozmowę",
  "Add tab":"Dodaj rozmowę",
  "and":"i",
  "Searched for":"Szukano",
  "you typed":"wpisano",
  "Toggle theme":"Przełącz motyw",
  "Switch language":"Przełącz język kart",
  "Linked":"Powiązana",
  "In a supporting category, relevant regardless of the intent":"W kategorii wspierającej, przydatna niezależnie od intencji",
  "Also helps":"Także przydatna",
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
  "English":"English",
  "Polski":"Polski",
  "Max Gwiazda":"Max Gwiazda",
  "Etiuda Source-Available Licence 1.0":"Etiuda Source-Available Licence 1.0",
  "Created by":"Autor:",
  "· free for personal use":"· bezpłatnie do użytku osobistego",
  "Finish":"Zakończ",
  "Welcome to Etiuda":"Witamy w Etiudzie",
  "Conversations":"Rozmowy",
  "Customer name and role":"Imię klienta i rola",
  "The category bar":"Pasek kategorii",
  "Intent panel":"Panel intencji",
  "Cards":"Karty",
  "A card's buttons":"Przyciski karty",
  "A card of your own":"Własna karta",
  "The card editor":"Edytor karty",
  "English / Polish":"Angielski / polski",
  "Light and dark":"Jasny i ciemny",
  "Ready for the first customer":"Gotowe na pierwszego klienta",
  "Ready to practise":"Gotowe do ćwiczeń",
  "Categories & cards":"Kategorie i karty",
  "Intent":"Intencja",
  "Intents":"Intencje",
  "ROLE suggestions":"Podpowiedzi ROLE",
  "Catalog & data":"Katalog i dane",
  "Search the library":"Szukaj w Bibliotece",
  "Each category with its cards, its place in the order, and whether it supports every intent.":"Każda kategoria z kartami, jej miejsce w kolejności i to, czy wspiera każdą intencję.",
  "Favourites first, hidden intents at the foot.":"Najpierw ulubione, ukryte intencje na końcu.",
  "Intents: {N}.":"Intencje: {N}.",
  "Cards linked to every intent: {N}.":"Karty powiązane ze wszystkimi intencjami: {N}.",
  "Cards in this category: {N}":"Karty w tej kategorii: {N}",
  "Nothing in the Library matches this search.":"Nic w Bibliotece nie pasuje do tego wyszukiwania.",
  "Beside each, the cards linked to it.":"Przy każdej widać powiązane z nią karty.",
  "Linked cards":"Powiązane karty",
  "no cards yet":"jeszcze bez kart",
  "Linked cards: {N}":"Powiązane karty: {N}",
  "Opens with":"Początek",
  "Languages":"Języki",
  "Sent, 30 days":"Wysłane, 30 dni",
  "Source":"Źródło",
  "Date modified":"Data zmiany",
  "catalog":"katalog",
  "changed here":"zmieniona tu",
  "one":"jedna",
  "{N} alternatives":"warianty: {N}",
  "{N} steps":"kroki: {N}",
  "Sorts the cards inside each category by this column":"Sortuje karty w każdej kategorii według tej kolumny",
  "Sorted by {COLUMN}, {WAY}. A third click on the heading brings back the catalog's order, and dragging with it.":"Posortowano według kolumny {COLUMN}, {WAY}. Trzecie kliknięcie nagłówka przywraca kolejność z katalogu, a z nią przeciąganie.",
  "ascending":"rosnąco",
  "descending":"malejąco",
  "The names the ROLE wheel offers, in the order it offers them. Dragging a name moves it.":"Nazwy, które podpowiada pokrętło ROLE, w kolejności, w jakiej je podaje. Przeciągnięcie nazwy zmienia jej miejsce.",
  "Add a name":"Dodaj nazwę",
  "Enter adds it; commas between names add several":"Enter dodaje; kilka nazw rozdziela się przecinkami",
  "Take {NAME} off the wheel":"Usuń {NAME} z pokrętła",
  "Move {NAME}":"Przesuń {NAME}",
  "Taken off the wheel: {NAME}.":"Usunięto z pokrętła: {NAME}.",
  "On the wheel":"Na pokrętle",
  "How it reads":"Jak to brzmi",
  "Cards that say the ROLE: {N}":"Karty z ROLE: {N}",
  "No card says the ROLE yet.":"Żadna karta nie używa jeszcze ROLE.",
  "Opens this card's editor":"Otwiera edycję tej karty",
  "The catalog in use on this desk, and loading another catalog file.":"Katalog używany na tym stanowisku i wczytanie innego pliku katalogu.",
  "Health":"Stan",
  "Engine and display":"Silnik i ekran",
  "What runs Etiuda here, and what the screen offers it.":"Co uruchamia tu Etiudę i co daje jej ekran.",
  "The catalog in use, and the file it came from.":"Używany katalog i plik, z którego pochodzi.",
  "Storage and desk":"Pamięć i stanowisko",
  "Where the desk keeps its memory, and its own state.":"Gdzie stanowisko przechowuje swoją pamięć i własny stan.",
  "Layout and intent panel":"Układ i panel intencji",
  "How the window is laid out, and the intent panel.":"Układ okna i panel intencji.",
  "What you have made your own on this desk.":"Własne zmiany na tym stanowisku.",
  "Open Data and defaults":"Otwórz Dane i ustawienia domyślne",
  "Content":"Treść",
  "Category":"Kategoria",
  "Linked intents":"Powiązane intencje",
  "Advanced":"Zaawansowane",
  "Favourites":"Ulubione",
  "Sample catalog":"Przykładowy katalog",
  "Evaluation copy, published without a licence. Everything works as usual; the team's lead can replace it with an edition published under a licence.":"Wersja do oceny, opublikowana bez licencji. Wszystko działa jak zwykle; lider zespołu może ją zastąpić wydaniem opublikowanym na licencji.",
  "Published by a version of Studio newer than its licence covers. Everything works as usual; the team's lead can replace it with an edition the licence covers.":"Opublikowane przez wersję Studia nowszą niż ta, którą obejmuje licencja. Wszystko działa jak zwykle; lider zespołu może je zastąpić wydaniem objętym licencją.",
  "the version on this computer":"wersja na tym komputerze",
  "Built on {DATE}":"z {DATE}",
  "New in this version":"Co nowego w tej wersji",
  "The team's catalog in editions.":"Nowe wydania katalogu.",
  "When the catalog changes, the desk offers the new edition and shows, card by card, what changed, before anything is loaded.":"Gdy pojawi się nowe wydanie katalogu zespołu, stanowisko je proponuje i jeszcze przed wczytaniem pokazuje, karta po karcie, co się zmieniło.",
  "Signed by the team's lead.":"Podpis lidera zespołu.",
  "A desk that joins a team keeps its lead's key and checks every later edition against it, and a file changed after signing never goes unnoticed.":"Stanowisko, które dołącza do zespołu, zapamiętuje klucz lidera i według niego sprawdza każde kolejne wydanie, więc plik zmieniony po podpisaniu nie przejdzie niezauważony.",
  "The timeline.":"Oś czasu.",
  "Space turns from the cards to the timeline of the conversation in front: what has been sent, the last reply whole, and what can follow it. Space again brings the cards back.":"Spacja przenosi od kart do osi czasu bieżącej rozmowy: widać, co już wysłano, ostatnią odpowiedź w całości i to, co może po niej nastąpić. Ponowna spacja wraca do kart.",
  "Next replies on {KEY1} to {KEY4}.":"Kolejne odpowiedzi pod {KEY1} do {KEY4}.",
  "After each reply sent, up to four that can follow wait one key each: the catalog's own first, then those this desk has learnt.":"Po każdej wysłanej odpowiedzi czekają do czterech następnych, każda pod własnym klawiszem: najpierw te z katalogu, potem te z praktyki tego stanowiska.",
  "Etiuda End-User Licence Agreement":"Umowa licencyjna Etiudy",
  "Read the licence":"Przeczytaj umowę",
  "Earlier versions of Etiuda":"Poprzednie wersje Etiudy",
  "{VERSION}, built on {DATE}":"{VERSION}, z {DATE}",
  "Up to 1.16.7.":"Do wersji 1.16.7.",
  "Etiuda as a single file, opened in a web browser, under the MIT licence. The last of them, 1.16.7, still opens at etiuda.dev/v1.":"Etiuda w jednym pliku, otwierana w przeglądarce, na licencji MIT. Ostatnia z nich, 1.16.7, wciąż otwiera się pod adresem etiuda.dev/v1.",
  "about␟Back":"Wróć",
  "Toggle language":"Przełącz język",
  "Next tab":"Następna rozmowa",
  "Previous tab":"Poprzednia rozmowa",
  "New tab":"Nowa rozmowa",
  "New chat":"Nowa rozmowa",
  "Rename tab":"Zmień nazwę rozmowy",
  "Tab name":"Nazwa rozmowy",
  "Use the automatic name":"Przywróć nazwę automatyczną",
  "Names the tab after the customer's first name, or New chat while there is none.":"Nadaje rozmowie imię klienta, a dopóki go nie ma, nazwę Nowa rozmowa.",
  "Open the Menu":"Otwórz Menu",
  "Your name":"Imię agenta",
  "Personal":"Osobiste",
  "Later":"Później",
  "Etiuda {VERSION} is available":"Dostępna jest Etiuda {VERSION}",
  "See what's new":"Co nowego",
  "Opens the page of this release":"Otwiera stronę tego wydania",
  "A newer Etiuda is available: {VERSION}":"Dostępna jest nowsza Etiuda: {VERSION}",
  "This version: {VERSION}":"Ta wersja: {VERSION}",
  "Newest available: {VERSION}":"Najnowsza dostępna: {VERSION}",
  "This is the newest version.":"To najnowsza wersja.",
  "No version newer than this build has been published.":"Nie opublikowano wersji nowszej niż ta.",
  "Whether a newer version exists could not be checked just now. This one works as it is.":"Nie udało się teraz sprawdzić, czy jest nowsza wersja. Ta działa bez zmian.",
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
  "Stack a card's replies":"Odpowiedzi karty w stosie",
  "A card holding several replies shows the first, with the others behind it until the pointer rests on the card or the arrow keys reach it.":"Karta z kilkoma odpowiedziami pokazuje pierwszą, a pozostałe trzyma pod spodem, dopóki nie spocznie na niej wskaźnik albo nie dotrze się do niej strzałkami.",
  "The first reply in front, the others laid out under the pointer":"Pierwsza odpowiedź z przodu, pozostałe rozkładają się pod kursorem",
  "Every reply laid out on the card, one below the other":"Każda odpowiedź leży na karcie, jedna pod drugą",
  "Replies stack behind the first":"Odpowiedzi chowają się za pierwszą",
  "Replies laid out one below the other":"Odpowiedzi leżą jedna pod drugą",
  "Clear the chosen intents ({N})":"Wyczyść wybrane intencje ({N})",
  "Reveal / expand categories":"Pokaż / rozwiń kategorie",
  "Maintenance panel":"Panel konserwacji",
  "new key":"nowy skrót",
  "Rename":"Zmień nazwę",
  "Rename the focused card, intent or category":"Zmienia nazwę zaznaczonej karty, intencji lub kategorii",
  "Select search text":"Zaznacz tekst wyszukiwania",
  "{PAX} in the vocative":"{PAX} w wołaczu",
  "Customer's gender":"Płeć klienta",
  "male, read from the name":"męska, odczytana z imienia",
  "female, read from the name":"żeńska, odczytana z imienia",
  "nonbinary, as the name leaves it open":"niebinarna, bo imię tego nie rozstrzyga",
  "nonbinary, until a name is typed":"niebinarna, do czasu wpisania imienia",
  "male, set by hand":"męska, ustawiona ręcznie",
  "female, set by hand":"żeńska, ustawiona ręcznie",
  "nonbinary, set by hand":"niebinarna, ustawiona ręcznie",
  "Gender, read from the first name. A click or the wheel changes it.":"Płeć odczytana z imienia. Kliknięcie lub kółko myszy ją zmienia.",
  "Gender, nonbinary while the name leaves it open. A click or the wheel changes it.":"Płeć niebinarna, dopóki imię tego nie rozstrzyga. Kliknięcie lub kółko myszy ją zmienia.",
  "Gender, set by hand. A new name is read afresh.":"Płeć ustawiona ręcznie. Nowe imię zostanie odczytane od nowa.",
  "GENDER":"PŁEĆ",
  "NAME":"IMIĘ I NAZWISKO",
  "Manual override of {PAX}":"Ręczne ustawienie {PAX}",
  "{PAX} takes the catalog's address for customers.":"{PAX} przyjmuje zwrot do klientów ustalony w katalogu.",
  "For a card that sets {PAX} its own way, such as a note that mentions the customer rather than addressing them.":"Dla karty, która ustawia {PAX} po swojemu, na przykład notatki, która wspomina o kliencie, a nie zwraca się do niego.",
  "override":"ręcznie",
  "Polish only: declines the name into the vocative, the form Polish uses to address someone. Only the first name declines; a surname is left as written.":"Dotyczy tylko polskiego: imię pojawia się w wołaczu, na przykład Anno. Nazwisko się nie odmienia i zostaje tak, jak je wpisano.",
  "vocative":"wołacz",
  "Pani or Pan, with the first name":"Pani lub Pan z imieniem",
  "Pani or Pan, with the surname":"Pani lub Pan z nazwiskiem",
  "By name":"Po imieniu",
  "No name":"Bez imienia",
  "Title and surname":"Tytuł i nazwisko",
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
  "Switch to the previous tab, round to the last after the first":"Przełącza na poprzednią rozmowę, a po pierwszej wraca do ostatniej",
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
  "Select everything in the search box, without clicking into it first":"Zaznacza całą treść pola wyszukiwania bez klikania w nie",
  "Move focus to the previous reply to copy (alternative, step or single)":"Przenosi kursor na poprzednią odpowiedź do skopiowania (wariant, krok lub pojedyncza)",
  "Move focus to the next reply to copy (alternative, step or single)":"Przenosi kursor na następną odpowiedź do skopiowania (wariant, krok lub pojedyncza)",
  "Select the previous category pill (All, then the categories)":"Wybiera poprzednią kategorię (Wszystkie, potem kategorie)",
  "Select the next category pill (All, then the categories)":"Wybiera następną kategorię (Wszystkie, potem kategorie)",
  "Move the mark to the top of its list, then across to the other one":"Przenosi zaznaczenie na początek bieżącej listy, a kolejne naciśnięcie na drugą listę",
  "Move the mark to the bottom of its list, then across to the other one":"Przenosi zaznaczenie na koniec bieżącej listy, a kolejne naciśnięcie na drugą listę",
  "Select the first category, skipping All and any the search has emptied":"Wybiera pierwszą kategorię, pomijając Wszystkie i te opróżnione przez wyszukiwanie",
  "Select the last category, skipping any the search has emptied":"Wybiera ostatnią kategorię, pomijając te opróżnione przez wyszukiwanie",
  "Copy the focused reply in the active language":"Kopiuje zaznaczoną odpowiedź w aktywnym języku",
  "Copy the focused reply in the other language":"Kopiuje zaznaczoną odpowiedź w drugim języku",
  "Sheds one thing per press: panels, then search, then intents, then all tabs":"Każde naciśnięcie zamyka lub czyści jedną rzecz: panele, wyszukiwanie, intencje, a na końcu wszystkie rozmowy",
  "Panel is locked open (always docked). Hide turns it off entirely.":"Panel jest zablokowany w pozycji otwartej, zawsze zadokowany. Przycisk Ukryj wyłącza go całkowicie.",
  "Prefer showing the intent panel when the window is wide. On narrow windows it auto-hides; hover the left edge or hold Ctrl to peek. Use the lock at the top of the panel, or Settings, to keep it open.":"Panel intencji jest widoczny, gdy okno jest szerokie. W wąskich oknach chowa się sam; wystarczy najechać na lewą krawędź albo przytrzymać Ctrl, aby go podejrzeć. Otwarty utrzymuje go blokada na górze panelu albo Ustawienia.",
  "Intent panel off. Hold Ctrl to peek the intent list as an overlay.":"Panel intencji wyłączony. Przytrzymaj Ctrl, aby zobaczyć listę intencji nad kartami.",
  "Polish cards - switch to English":"Karty po polsku (przełącz na angielski)",
  "{LANG} cards - switch to {NEXT}":"Karty: {LANG} (przełącz na {NEXT})",
  "English cards - switch to Polish":"Karty po angielsku (przełącz na polski)",
  "Click to filter · Ctrl+click to add/remove · drag to reorder":"Kliknij, aby filtrować · Ctrl+kliknij, aby dodać lub usunąć · przeciągnij, aby zmienić kolejność",
  "Green ring: holds a card linked to the chosen intent":"Zielona obwódka: zawiera kartę powiązaną z wybraną intencją",
  "Blue ring: a supporting category":"Niebieska obwódka: kategoria wspierająca",
  "Older catalog file found":"Znaleziono starszy plik katalogu",
  "Load it anyway":"Wczytaj mimo to",
  "This edition is older than the one in use on this desk, so some of its replies may be out of date.":"To wydanie jest starsze niż to, którego się tu używa, więc część odpowiedzi może być nieaktualna.",
  "By its own edition number, this file is older than the catalog in use on this desk.":"Według własnego numeru wydania ten plik jest starszy niż katalog używany na tym stanowisku.",
  "Open the older edition":"Otwórz starsze wydanie",
  "Keep the newer one":"Zostaw nowsze",
  "This file is signed with the key {KEY}, which is not the team lead's.":"Ten plik jest podpisany kluczem {KEY}, który nie jest kluczem lidera zespołu.",
  "This file comes from outside the team.":"Ten plik pochodzi spoza zespołu.",
  "Updated catalog file found":"Jest nowszy plik katalogu",
  "Watching":"Obserwowany:",
  "Check for updates":"Sprawdź aktualizacje",
  "Read that file again and offer it if it has changed":"Czyta ten plik ponownie i proponuje go, jeśli się zmienił",
  "Stop watching":"Przestań obserwować",
  "No longer watching that file.":"Ten plik nie jest już obserwowany.",
  "No catalog file is being watched.":"Żaden plik katalogu nie jest obserwowany.",
  "Etiuda needs permission to read that file again.":"Etiuda potrzebuje ponownej zgody na odczyt tego pliku.",
  "That is not a catalog file Etiuda can read.":"To nie jest plik katalogu, który Etiuda potrafi odczytać.",
  "That file matches the catalog you already have.":"Ten plik jest taki sam jak wczytany katalog.",
  "Could not read the watched file.":"Nie udało się odczytać obserwowanego pliku.",
  "Your own cards and edits are kept.":"Własne karty i zmiany zostają.",
  "Load the new edition":"Wczytaj nowe wydanie",
  "You have {E}.":"Wczytane: {E}.",
  "You have rev {R}.":"Wczytane: wersja {R}.",
  "rev {R}":"wersja {R}",
  "Note for this edition":"Notatka do tego wydania",
  "{N} changed":"{N} zmieniona",
  "few␟{N} changed":"{N} zmienione",
  "many␟{N} changed":"{N} zmienionych",
  "{N} new":"{N} nowa",
  "few␟{N} new":"{N} nowe",
  "many␟{N} new":"{N} nowych",
  "{N} restored":"{N} przywrócona",
  "few␟{N} restored":"{N} przywrócone",
  "many␟{N} restored":"{N} przywróconych",
  "{N} retired":"{N} wycofana",
  "few␟{N} retired":"{N} wycofane",
  "many␟{N} retired":"{N} wycofanych",
  "{N} removed":"{N} usunięta",
  "few␟{N} removed":"{N} usunięte",
  "many␟{N} removed":"{N} usuniętych",
  "changed":"zmieniona",
  "new":"nowa",
  "restored":"przywrócona",
  "retired":"wycofana",
  "removed":"usunięta",
  "you have your own version":"jest własna wersja",
  "the team's new text":"nowa treść zespołu",
  "now commits the firm":"teraz zobowiązuje firmę",
  "no longer commits the firm":"już nie zobowiązuje firmy",
  "commits the firm in new words":"zobowiązuje firmę w nowym brzmieniu",
  "commits the firm":"zobowiązuje firmę",
  "It comes back with your star and your edits.":"Wróci z gwiazdką i własnymi zmianami.",
  "and {N} more":"i {N} więcej",
  "Show the differences":"Pokaż różnice",
  "What is new in edition {E}":"Co nowego w wydaniu {E}",
  "What is new in rev {R}":"Co nowego w wersji {R}",
  "Was":"Było",
  "Becomes":"Będzie",
  "Your version":"Własna wersja",
  "Text":"Treść",
  "Take the team's new text":"Weź nową treść zespołu",
  "Keep mine":"Zostaw moją",
  "Edition {E} is waiting to be loaded; the offer is under the catalog's name.":"Wydanie {E} czeka na wczytanie; propozycja jest pod nazwą katalogu.",
  "Rev {R} is waiting to be loaded; the offer is under the catalog's name.":"Wersja {R} czeka na wczytanie; propozycja jest pod nazwą katalogu.",
  "Show edition {E}, waiting to be loaded":"Pokaż wydanie {E}, które czeka na wczytanie",
  "Show rev {R}, waiting to be loaded":"Pokaż wersję {R}, która czeka na wczytanie",
  "This desk carries on as it is until the update is loaded.":"Do wczytania aktualizacji stanowisko działa bez zmian.",
  "Edition {E} loaded: {COUNTS}":"Wczytano wydanie {E}: {COUNTS}",
  "Rev {R} loaded: {COUNTS}":"Wczytano wersję {R}: {COUNTS}",
  "Changed in edition {E}":"Zmieniona w wydaniu {E}",
  "Changed in rev {R}":"Zmieniona w wersji {R}",
  "New in edition {E}":"Nowa w wydaniu {E}",
  "New in rev {R}":"Nowa w wersji {R}",
  "Changes in {E}":"Zmiany w {E}",
  "Changes in rev {R}":"Zmiany w wersji {R}",
  "Only the cards edition {E} changed or added":"Tylko karty zmienione lub dodane w wydaniu {E}",
  "Only the cards rev {R} changed or added":"Tylko karty zmienione lub dodane w wersji {R}",
  "Cards edition {E} changed or added: {N}.":"Karty zmienione lub dodane w wydaniu {E}: {N}.",
  "Cards rev {R} changed or added: {N}.":"Karty zmienione lub dodane w wersji {R}: {N}.",
  "before:":"wcześniej:",
  "now:":"teraz:",
  "Load catalog file?":"Wczytać plik katalogu?",
  "Replace catalog?":"Zastąpić katalog?",
  "Located as {FILE}.":"Znaleziony jako {FILE}.",
  "Located as {FILE} in {FOLDER}.":"Znaleziony jako {FILE} w {FOLDER}.",
  "{FILE} comes with Etiuda.":"{FILE} jest dołączony do Etiudy.",
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
  "Quick facts are yours to write.\n\nThe pencil above opens them for editing:\nfees, deadlines, links, anything used often.\n\nA catalog can bring its own,\nand loading it replaces what is here.\n\nWhat is typed here stays on this computer.":"Szybkie fakty można uzupełnić samodzielnie.\n\nOłówek powyżej otwiera je do edycji:\nopłaty, terminy, odnośniki, wszystko, czego często się używa.\n\nKatalog może zawierać własne,\na jego wczytanie zastępuje to, co jest tutaj.\n\nTo, co się tu wpisze, zostaje na tym komputerze.",
  "Quick facts are yours to write.\n\nThe pencil above opens them for editing:\nfees, deadlines, links, anything used often.\n\nA catalog can bring its own,\nand loading it replaces what is here.\n\nWhat is typed here stays in this browser.":"Szybkie fakty można uzupełnić samodzielnie.\n\nOłówek powyżej otwiera je do edycji:\nopłaty, terminy, odnośniki, wszystko, czego często się używa.\n\nKatalog może zawierać własne,\na jego wczytanie zastępuje to, co jest tutaj.\n\nTo, co się tu wpisze, zostaje w tej przeglądarce.",
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
  "Load catalog file":"Wczytaj plik katalogu",
  "Show all hidden":"Pokaż wszystkie ukryte",
  "toggles":"przełącza",
  "Library":"Biblioteka",
  "Maintenance":"Konserwacja",
  "Maintenance can open once the edit in progress is saved or cancelled.":"Konserwację można otworzyć po zapisaniu lub anulowaniu bieżącej edycji.",
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
  "Delete card":"Usuń kartę",
  /* The copywriter's words, for the Library's Delete and the editors' alike, this and "Delete this intent" */
  "Delete this card":"Usuń tę kartę",
  "New intent":"Nowa intencja",
  "New intent…":"Nowa intencja…",
  "Create a custom intent":"Utwórz własną intencję",
  "Write a new clause for {INTENT}":"Napisz nową frazę dla {INTENT}",
  "Delete this intent":"Usuń tę intencję",
  "Export…":"Eksportuj…",
  "Clear local changes":"Wyczyść zmiany lokalne",
  "Bring back local changes":"Przywróć zmiany lokalne",
  "These changes stay on this desk until Etiuda closes; when it opens again, the catalog is as delivered.":"Zmiany zostają na tym stanowisku do zamknięcia Etiudy; po ponownym uruchomieniu katalog jest taki, jak został dostarczony.",
  "Removes every change made to the content on this computer, so the catalog reads as delivered.":"Usuwa wszystkie zmiany treści wprowadzone na tym komputerze, więc katalog wygląda tak, jak go dostarczono.",
  "Clear local changes?":"Wyczyścić zmiany lokalne?",
  "Every change made to the content on this computer goes: your edits to cards, your own cards and intents, changes to categories, roles and variables, and stars, hidden cards and the order of cards. The catalog is left as delivered.":"Znikną wszystkie zmiany treści wprowadzone na tym komputerze: własne zmiany w kartach, własne karty i intencje, zmiany kategorii, ról i zmiennych oraz gwiazdki, ukryte karty i kolejność kart. Katalog zostanie taki, jak go dostarczono.",
  "On a team, the changes this desk shared with the team's lead go too, any the lead has not yet reviewed included.":"W zespole znikają też zmiany, które to stanowisko udostępniło liderowi zespołu, także te, których lider jeszcze nie przejrzał.",
  "The catalog file, the team, the licence, the folder setting and the agent's name stay. Undo brings the changes back on this desk until Etiuda closes; after a restart, nothing comes back.":"Plik katalogu, zespół, licencja, ustawienie folderu i imię agenta zostają. Przycisk Cofnij przywraca zmiany na tym stanowisku do zamknięcia Etiudy; po ponownym uruchomieniu nic już nie wróci.",
  "Loads a catalog file from this computer.":"Wczytuje plik katalogu z tego komputera.",
  "Eject catalog":"Odłącz katalog",
  "Catalog ejected":"Odłączono katalog",
  "Local changes cleared":"Wyczyszczono zmiany lokalne",
  "Loading a catalog file erases the cards you made with no catalog loaded. Export them as a catalog file of their own first?":"Wczytanie pliku katalogu usunie karty utworzone bez wczytanego katalogu. Najpierw wyeksportować je jako osobny plik katalogu?",
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
  "Switch between the desk and the editor":"Przełącz między kartami a edytorem",
  "A newer edition changed this card while it was open. Save keeps what is written here; Reset takes the new edition's.":"Nowe wydanie zmieniło tę kartę, gdy była otwarta. Zapisz zachowa to, co jest tutaj; Przywróć weźmie wersję z nowego wydania.",
  "This card is no longer in the catalog, so nothing here can be saved. The text can still be copied.":"Tej karty nie ma już w katalogu, więc niczego tu nie da się zapisać. Tekst można nadal skopiować.",
  "This card changed elsewhere while it was open. Save keeps what is written here; Cancel leaves the change made there.":"Ta karta zmieniła się gdzie indziej, gdy była otwarta. Zapisz zachowa to, co jest tutaj; Anuluj zostawi tamtą zmianę.",
  "A newer edition changed this intent while it was open. Save keeps what is written here; Reset takes the new edition's.":"Nowe wydanie zmieniło tę intencję, gdy była otwarta. Zapisz zachowa to, co jest tutaj; Przywróć weźmie wersję z nowego wydania.",
  "This intent is no longer in the catalog, so nothing here can be saved. The text can still be copied.":"Tej intencji nie ma już w katalogu, więc niczego tu nie da się zapisać. Tekst można nadal skopiować.",
  "This intent changed elsewhere while it was open. Save keeps what is written here; Cancel leaves the change made there.":"Ta intencja zmieniła się gdzie indziej, gdy była otwarta. Zapisz zachowa to, co jest tutaj; Anuluj zostawi tamtą zmianę.",
  "A newer edition changed this category while it was open. Save keeps what is written here; Reset takes the new edition's.":"Nowe wydanie zmieniło tę kategorię, gdy była otwarta. Zapisz zachowa to, co jest tutaj; Przywróć weźmie wersję z nowego wydania.",
  "This category is no longer in the catalog, so nothing here can be saved. The text can still be copied.":"Tej kategorii nie ma już w katalogu, więc niczego tu nie da się zapisać. Tekst można nadal skopiować.",
  "This category changed elsewhere while it was open. Save keeps what is written here; Cancel leaves the change made there.":"Ta kategoria zmieniła się gdzie indziej, gdy była otwarta. Zapisz zachowa to, co jest tutaj; Anuluj zostawi tamtą zmianę.",
  "Moves the keyboard between the cards and an open editor":"Przenosi klawiaturę między kartami a otwartym edytorem",
  "Editor: next language":"Edytor: następny język",
  "In an editor: the language tab before this one":"W edytorze: poprzedni język",
  "In an editor: the language tab after this one":"W edytorze: następny język",
  "Switch the language being edited":"Przełącz edytowany język",
  "Your intent edits and stars are set aside: this catalog cannot say which intent each belongs to.":"Odłożono własne zmiany i gwiazdki przy intencjach: ten katalog nie wskazuje, której intencji dotyczą.",
  "Edited cards this catalog does not have are kept as your own: {CARDS}.":"Zmienione karty, których ten katalog nie ma, zostają jako własne: {CARDS}.",
  "Starred cards this catalog does not have are off your list: {CARDS}.":"Karty z gwiazdką, których ten katalog nie ma, znikają z listy: {CARDS}.",
  "Save everything loaded now as a catalog file, your edits merged in":"Zapisuje wszystko, co wczytane, jako plik katalogu, razem z własnymi zmianami",
  "Load a catalog file from disk: it is read as data, never executed. It replaces what is loaded now, and nothing on disk changes.":"Wczytuje plik katalogu z dysku jako same dane, bez uruchamiania czegokolwiek. Zastępuje obecny katalog, a pliki na dysku zostają bez zmian.",
  "Reset personal data":"Wyczyść dane własne",
  "The saved card arrangement could not be read.":"Nie udało się odczytać zapisanego układu kart.",
  "This version stores the arrangement in a new way, and the copy kept here could not be converted. The catalog is untouched and Etiuda runs as usual; only the card order, hidden cards and favourites kept here are affected. Reset personal data clears them and starts afresh.":"Ta wersja przechowuje układ w nowy sposób, a zapisanej tutaj kopii nie dało się przekształcić. Katalog jest nienaruszony, a Etiuda działa normalnie; zmiana dotyczy tylko zapisanych tutaj: kolejności kart, ukrytych kart i ulubionych. Wyczyść dane własne usuwa je i pozwala zacząć od nowa.",
  "Reset Etiuda":"Zresetuj Etiudę",
  "Returns this desk to a fresh install, keeping only the licence.":"Przywraca stanowisko do stanu po świeżej instalacji; zostaje tylko licencja.",
  "Reset Etiuda?":"Zresetować Etiudę?",
  "Reset removes every catalog file in Etiuda's own folder, the team, the agent's name, settings, open conversations and every local change. Catalog files in any other folder stay, and so does the licence.":"Reset usuwa każdy plik katalogu z własnego folderu Etiudy, zespół, imię agenta, ustawienia, otwarte rozmowy i wszystkie zmiany lokalne. Pliki katalogów w każdym innym folderze zostają, podobnie jak licencja.",
  "There is no Undo. Joining the team again takes a new invitation from its lead.":"Tego nie da się cofnąć. Ponowne dołączenie do zespołu wymaga nowego zaproszenia od lidera.",
  "Type RESET to confirm.":"Do potwierdzenia trzeba wpisać RESET.",
  "Etiuda is starting again as freshly installed.":"Etiuda uruchamia się ponownie jak po świeżej instalacji.",
  "The reset of Etiuda did not finish. Could not be removed, perhaps in use by another program or an open folder: {PATH}.":"Reset Etiudy nie został dokończony. Nie udało się usunąć elementów, których być może używa inny program albo otwarty folder: {PATH}.",
  "Trying again finishes it once they are closed; stopping it keeps this desk as it is now.":"Ponowna próba dokończy reset po ich zamknięciu; przerwanie zostawi stanowisko w obecnym stanie.",
  "Try again":"Spróbuj ponownie",
  "Stop the reset":"Przerwij reset",
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
  "Reply":"Odpowiedź",
  "the greeting for the time of day":"powitanie dobrane do pory dnia",
  "the customer's name":"imię klienta",
  "the customer's full name":"imię i nazwisko klienta",
  "the name customers see":"nazwa, którą widzą klienci",
  "the initials of the name customers see":"inicjały nazwy, którą widzą klienci",
  "who is on the chat":"kto jest po drugiej stronie czatu",
  "the intent chosen in this conversation":"intencja wybrana w tej rozmowie",
  "what was done, for internal comments":"co zostało zrobione, do komentarzy wewnętrznych",
  "the topic of the chosen intent":"temat wybranej intencji",
  "z or ze, to suit the word after it":"z albo ze, zależnie od następnego słowa",
  "words chosen by the time of day":"słowa dobrane do pory dnia",
  "filled by this catalog":"wypełnia je katalog",
  "Perhaps {SUGGESTED}, {WHAT}?":"Może chodzi o {SUGGESTED}, czyli {WHAT}?",
  "{TOKEN} is not a variable this catalog fills, so the customer would see it as typed, braces and all.":"Zmiennej {TOKEN} katalog nie wypełnia, więc klient zobaczyłby ją dosłownie, razem z nawiasami.",
  "{TOKEN} goes out exactly as typed":"{TOKEN} trafi do klienta dosłownie",
  "This catalog fills no variable by that name.":"Katalog nie ma zmiennej o tej nazwie.",
  "Change it to {SUGGESTED}":"Zamień na {SUGGESTED}",
  "Leave it as it is":"Zostaw tak, jak jest",
  "{TAB} still has the earlier text":"W zakładce {TAB} jest jeszcze dawny tekst",
  "Copied in that language, the card goes out as it was before this edit.":"Skopiowana w tym języku karta wyjdzie w dawnej postaci, bez tej zmiany.",
  "Open {TAB}":"Otwórz {TAB}",
  "{AT} of {ALL} · F8: next":"{AT} z {ALL} · F8: następna",
  "Changed to {SUGGESTED}. Still to answer: {N}. F8: next":"Zamieniono na {SUGGESTED}. Do rozstrzygnięcia: {N}. F8: następna",
  "Left as it is. Still to answer: {N}. F8: next":"Zostawiono bez zmian. Do rozstrzygnięcia: {N}. F8: następna",
  "Every finding is answered.":"Wszystkie uwagi są rozstrzygnięte.",
  "Finding: {HEADING}":"Uwaga: {HEADING}",
  "Finding {AT} of {ALL}: {HEADING}":"Uwaga {AT} z {ALL}: {HEADING}",
  "Clause":"Fraza",
  "Comment action":"Czynność do komentarza",
  "Clause is required":"Wpisz frazę",
  "Category name":"Nazwa kategorii",
  "Name":"Nazwa",
  "Editing":"Edycja",
  "Keywords":"S\u0142owa kluczowe",
  "1 word":"1 s\u0142owo",
  "{N} words":"s\u0142\u00f3w: {N}",
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
  "Discard your edits and restore the catalog wording.":"Odrzuca zmiany i przywraca treść z katalogu.",
  "Restore built-in quick facts":"Przywróć wbudowane szybkie fakty",
  "{KEY} is fixed and keeps its own meaning":"{KEY} to klawisz stały i zachowuje swoje znaczenie",
  "Saved {KEY}":"Zapisano {KEY}",
  "{KEY} is needed for typing, so it cannot be a shortcut, and nothing was changed. An F key, or a combination with Ctrl or Alt, will do.":"{KEY} jest potrzebny do pisania, więc nie może być skrótem, i nic nie zmieniono. Można wybrać klawisz F albo połączenie z Ctrl lub Alt.",
  "This key is needed for typing, so it cannot be a shortcut, and nothing was changed. An F key, or a combination with Ctrl or Alt, will do.":"Ten klawisz jest potrzebny do pisania, więc nie może być skrótem, i nic nie zmieniono. Można wybrać klawisz F albo połączenie z Ctrl lub Alt.",
  "{N} card":"{N} karta",
  "{N} cards":"{N} kart",
  "few␟{N} cards":"{N} karty",
  "many␟{N} cards":"{N} kart",
  "{N} reply":"{N} odpowiedź",
  "{N} replies":"{N} odpowiedzi",
  "few␟{N} replies":"{N} odpowiedzi",
  "many␟{N} replies":"{N} odpowiedzi",
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
  "Exported {FILE} with {MACROS} in {CARDS}":"Wyeksportowano {FILE}: {MACROS}, {CARDS}",
  "Card deleted":"Usunięto kartę",
  "Undo":"Cofnij",
  "Take back what was just done, while its Undo button is on screen":"Cofa to, co przed chwilą zrobiono, dopóki widać przycisk Cofnij",
  "Moved on without saving the changes":"Opuszczono wpis bez zapisania zmian",
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
  "Copy":"Kopiuj",
  "Copy the {LANG} version":"Kopiuj wersję {LANG}",
  "Show the note":"Pokaż notatkę",
  "Fold every group":"Zwiń wszystkie grupy",
  "Unfold every group":"Rozwiń wszystkie grupy",
  "Pick this intent":"Wybierz tę intencję",
  "Drop this intent":"Odznacz tę intencję",
  "Pick it with the others":"Dodaj ją do wybranych",
  "Show only this category":"Pokaż tylko tę kategorię",
  "Show every category":"Pokaż wszystkie kategorie",
  "Add it to the filter":"Dodaj ją do filtra",
  "Take it out of the filter":"Usuń ją z filtra",
  "Close this tab":"Zamknij tę rozmowę",
  "Close the other tabs":"Zamknij pozostałe rozmowy",
  "Reopen the last closed tab":"Przywróć ostatnio zamkniętą rozmowę",
  "Close Etiuda":"Zamknij Etiudę",
  "Close Etiuda? A conversation is still in progress, and closing forgets it.":"Zamknąć Etiudę? Rozmowa jest jeszcze w toku, a zamknięcie ją usunie.",
  "Close Etiuda? {N} conversations are still in progress, and closing forgets them.":"Zamknąć Etiudę? Rozmów w toku: {N}. Zamknięcie je usunie.",
  "Close Etiuda; it asks first while a conversation is in progress":"Zamyka Etiudę; gdy jakaś rozmowa jest w toku, najpierw pyta",
  "no text yet":"jeszcze bez tekstu",
  "Copy the report: counts and environment only, never your content":"Skopiuj raport: tylko liczby i dane o środowisku, nigdy treść kart",
  "All tabs closed":"Zamknięto wszystkie rozmowy",
  "Press Esc again to close all tabs":"Naciśnij Esc ponownie, aby zamknąć wszystkie rozmowy",
  "{INTENT} cleared":"Wyczyszczono {INTENT}",
  "Shortcuts reset":"Przywrócono domyślne skróty",
  "Press the new shortcut (Esc to cancel, Ctrl+Backspace for the default)":"Oczekiwanie na nowy skrót (Esc anuluje, Ctrl+Backspace przywraca domyślny)",
  "Built-in quick facts restored":"Przywrócono wbudowane szybkie fakty",
  "Selecting the text on the card and pressing Ctrl+C copies this one; the browser kept the clipboard closed.":"Tę odpowiedź można skopiować, zaznaczając jej tekst na karcie i naciskając Ctrl+C; przeglądarka nie dała dostępu do schowka.",
  "Selecting the text on the card and pressing Ctrl+C copies this one; the clipboard would not take it just now.":"Tę odpowiedź można skopiować, zaznaczając jej tekst na karcie i naciskając Ctrl+C; schowek tym razem jej nie przyjął.",
  "Some required fields are empty":"Uzupełnij wymagane pola",
  "Title is required":"Wpisz tytuł",
  "Reply text is required":"Wpisz treść odpowiedzi",
  "Export is ready once the catalog holds a card.":"Eksport będzie możliwy, gdy w katalogu pojawią się karty.",
  "Changes since {TIME} are not saved.":"Zmiany wprowadzone od {TIME} nie są zapisane.",
  "Etiuda cannot write {FILE}, so they last only until it closes. The next save that succeeds writes them all.":"Etiuda nie może zapisać pliku {FILE}, więc zmiany przetrwają tylko do jej zamknięcia. Pierwszy udany zapis utrwali je wszystkie.",
  "This browser is refusing to store them, perhaps because its storage is full, so they last only until this tab closes.":"Przeglądarka nie przyjmuje ich do pamięci, być może z braku miejsca, więc przetrwają tylko do zamknięcia tej karty.",
  "Your changes are saved again.":"Zmiany są już bezpiecznie zapisane.",
  "Etiuda could not read its saved file.":"Etiuda nie mogła odczytać swojego pliku z zapisanymi danymi.",
  "The file is kept unchanged at {FILE}, and Etiuda has opened the copy saved {TIME}.":"Plik został odłożony bez zmian jako {FILE}, a Etiuda otworzyła kopię zapisaną {TIME}.",
  "The file is kept unchanged at {FILE}, and Etiuda has started afresh.":"Plik został odłożony bez zmian jako {FILE}, a Etiuda zaczęła od nowa.",
  "This desk's settings were saved by Etiuda {VERSION} or newer, so this version leaves them untouched and does not start over.":"Ustawienia tego stanowiska zapisała Etiuda w wersji {VERSION} lub nowszej, więc ta wersja zostawia je nietknięte i nie zaczyna od nowa.",
  "Installing Etiuda {VERSION} or newer opens them as they were.":"Po zainstalowaniu Etiudy w wersji {VERSION} lub nowszej otworzą się bez zmian.",
  "This desk's settings were saved by a newer Etiuda, so this version leaves them untouched and does not start over.":"Ustawienia tego stanowiska zapisała nowsza wersja Etiudy, więc ta wersja zostawia je nietknięte i nie zaczyna od nowa.",
  "Installing the newest Etiuda opens them as they were.":"Po zainstalowaniu najnowszej wersji Etiudy otworzą się bez zmian.",
  "Could not save shortcuts":"Nie udało się zapisać skrótów",
  "Could not save the catalog, perhaps because the browser's storage is full.":"Nie udało się zapisać katalogu; możliwe, że pamięć przeglądarki jest pełna.",
  "Could not save the catalog file, because Etiuda cannot write {FILE}.":"Nie udało się zapisać pliku katalogu: Etiuda nie może zapisywać do {FILE}.",
  "This browser is not storing anything, so a catalog cannot be kept here":"Ta przeglądarka niczego nie zapisuje, więc nie można tu zachować katalogu",
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
  "This version of Etiuda, what is new in it, and its licence":"Ta wersja Etiudy, jej nowości i licencja",
  "Interface language, appearance and keyboard shortcuts":"Język interfejsu, wygląd i skróty klawiszowe",
  "Hide the category bar; hold Ctrl to peek at it while hidden":"Ukryj pasek kategorii; przytrzymaj Ctrl, aby na niego zerknąć",
  "Hide the intent panel; its chips then appear on the first card that uses {INTENT}":"Ukryj panel intencji; przyciski intencji pojawią się wtedy na pierwszej karcie, która używa INTENCJA",
  "AGENT":"AGENT",
  "PAX":"PAX",
  "INTENT":"INTENCJA",
  "Intents arrive with a catalog.":"Intencje przynosi katalog.",
  "Search intents and cards":"Wyszukiwanie intencji i kart",
  "Search":"Szukaj",
  "One search: intents rank in the panel, cards filter below":"Jedno wyszukiwanie: intencje szeregują się w panelu, a karty poniżej są filtrowane",
  "<kbd>Enter</kbd> to choose<span class='ph-dot'>·</span><kbd>Ctrl</kbd>+<kbd>Enter</kbd> for several":"<kbd>Enter</kbd> wybiera<span class='ph-dot'>·</span><kbd>Ctrl</kbd>+<kbd>Enter</kbd> wybiera kilka",
  "Search cleared":"Wyczyszczono wyszukiwanie",

  "ROLE":"ROLA",
  "EN":"EN",
  "PL":"PL",
  "Etiuda":"Etiuda",
  "Etiuda catalog file":"Plik katalogu Etiudy",
  "Ready replies, beside any chat":"Gotowe odpowiedzi, obok każdego czatu",
  "Menu":"Menu",
  "Cards, the intent panel and the category bar":"Karty, panel intencji i pasek kategorii",
  "More tools":"Więcej narzędzi",
  "The tools this window is too narrow to show":"Narzędzia, na które to okno jest za wąskie",
  "Quick facts":"Szybkie fakty",
  "Fees, deadlines and limits":"Opłaty, terminy i limity",
  "Switch between the light and dark themes":"Przełącz między motywem jasnym a ciemnym",
  "Switch card language":"Przełącz język kart",
  "The language the replies are shown in, kept per tab":"Język, w którym pokazywane są odpowiedzi, osobno dla każdej rozmowy",
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
  "Open tabs":"Otwarte zakładki",
  "All open tabs":"Wszystkie otwarte zakładki",
  "The new tab starts with cleared fields and your settings kept.":"Nowa rozmowa ma puste pola i zachowane ustawienia.",
  "New tab (same shared settings; cleared PAX, intent, ROLE, categories)":"Nowa rozmowa (te same wspólne ustawienia; wyczyszczone PAX, intencja, ROLE, kategorie)",
  "One tab for each customer you are talking to, each with its own PAX, intent, ROLE and categories":"Osobna rozmowa dla każdego klienta, z własnym PAX, intencją, ROLE i kategoriami",
  "Click to switch, or drag to reorder":"Kliknij, aby przełączyć, lub przeciągnij, aby zmienić kolejność",
  "The name customers see, and the language Etiuda's own buttons and menus are written in":"Nazwa, którą widzą klienci, i język przycisków oraz menu samej Etiudy",
  "The customer's name as the chat gives it, filling {PAX} with the tidied first name":"Imię i nazwisko klienta w postaci z czatu; {PAX} dostaje z nich uporządkowane imię",
  "{PAX} fills the first name even when the chat gives the full name.":"{PAX} wstawia samo imię, nawet gdy z czatu przychodzi imię i nazwisko.",
  "class":"klasa",
  "Who is on the chat, filling {ROLE} in internal comments":"Kto jest po drugiej stronie czatu. Wypełnia {ROLE} w komentarzach wewnętrznych.",
  "Intent list":"Lista intencji",
  "Click to pick, again to clear, and hold Ctrl for several":"Kliknij, aby wybrać, i ponownie, aby odznaczyć; z Ctrl można wybrać kilka",
  "Set {INTENT}":"Ustaw {INTENT}",
  "Clear":"Wyczyść",
  "Clear PAX":"Wyczyść PAX",
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
  "Drag to reorder, or onto a category to move it there":"Przeciągnięcie zmienia kolejność, a upuszczenie na kategorii przenosi tam kartę.",
  "Dragging waits for the catalog's order: a third click on the sorted heading brings it back.":"Przeciąganie wraca razem z kolejnością z katalogu, którą przywraca trzecie kliknięcie posortowanego nagłówka.",
  "Click to copy":"Kliknij, aby skopiować",
  "Click to copy full URL":"Kliknij, aby skopiować pełny adres",
  "Click to copy, or drag to reorder these":"Kliknij, aby skopiować, lub przeciągnij, aby zmienić kolejność",

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
  "Minimise this editor":"Zminimalizuj ten edytor",
  "Bring back the minimised editor":"Przywróć zminimalizowany edytor",
  "Choose a minimised editor":"Wybierz zminimalizowany edytor",
  "Its unsaved changes are kept":"Jego niezapisane zmiany są zachowane",
  "Unsaved changes in them are kept":"Niezapisane zmiany w nich są zachowane",
  "Dismiss":"Zamknij",
  "Back":"Wstecz",
  "Next":"Dalej",
  "Done":"Gotowe",
  "This looks wrong":"Coś się nie zgadza",
  "Sent to the lead":"Przekazano liderowi zespołu",
  "The lead will see it in Studio, and the answer comes with the team's next edition. If you know what is wrong, add it here; it is fine not to know.":"Lider zespołu zobaczy to w Studio, a odpowiedź przyjdzie z następnym wydaniem zespołu. Jeśli wiadomo, co się nie zgadza, można to tu dopisać; nie trzeba tego wiedzieć.",
  "What looks wrong (optional), then Enter":"Co się nie zgadza (nieobowiązkowo), potem Enter",
  "Take it back":"Wycofaj",
  "With the lead":"U lidera",
  "Answered":"Jest odpowiedź",
  "The lead has answered":"Jest odpowiedź lidera zespołu",
  "Left as it is.":"Bez zmian.",
  "The card has been mended.":"Kartę poprawiono.",
  "The note can be up to 500 characters long.":"Notatka może mieć najwyżej 500 znaków.",
  "The note holds a character it cannot keep, such as a line break or a tab.":"Notatka zawiera znak, którego nie może zachować, na przykład podział wiersza lub tabulator.",
  "This desk has already sent as many flags on this catalog as it can, so this one was not sent.":"To stanowisko wysłało już tyle zgłoszeń do tego katalogu, ile może, więc tego nie wysłano.",
  "Room comes back as the lead answers.":"Miejsce zwalnia się, gdy lider zespołu odpowiada.",
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
  "Continue the tour ({N} of {OF})":"Wróć do przewodnika (krok {N} z {OF})",
  "About Etiuda":"O Etiudzie",
  "Hide intent panel":"Ukryj panel intencji",
  "Show intent panel":"Pokaż panel intencji",
  "Hide categories":"Ukryj kategorie",
  "Show categories":"Pokaż kategorie",
  "Settings":"Ustawienia",
  "AI":"AI",
  "Suggest intents with the built-in model":"Propozycje intencji przy użyciu wbudowanego modelu",
  "Reads the selected message on this computer and suggests the intents it is closest to. Off, suggestions come from matching words.":"Odczytuje zaznaczoną wiadomość na tym komputerze i proponuje najbliższe jej intencje. Wyłączone: propozycje wynikają z dopasowania słów.",
  "The model ranks the suggestions; nothing leaves this computer":"Model ustala kolejność propozycji; nic nie opuszcza tego komputera",
  "Suggestions come from matching words, and the model stays unloaded":"Propozycje wynikają z dopasowania słów, a model nie jest wczytywany",
  "Suggestions from the built-in model":"Propozycje z wbudowanego modelu",
  "Suggestions from matching words":"Propozycje z dopasowania słów",
  "The model built into Etiuda, which works on this computer alone.":"Model wbudowany w Etiudę, działający wyłącznie na tym komputerze.",
  "Search by meaning with the built-in model":"Wyszukiwanie według znaczenia przy użyciu wbudowanego modelu",
  "From the third letter typed, the main search adds the cards and intents closest in meaning after those that match the words, ranked by the model on this computer. Off, it matches words only.":"Od trzeciej wpisanej litery główne wyszukiwanie pokazuje, po wynikach pasujących do słów, karty i intencje najbliższe znaczeniem, uporządkowane przez model na tym komputerze. Wyłączone dopasowuje tylko słowa.",
  "Preparing the catalog for search by meaning; word search works meanwhile.":"Trwa przygotowanie katalogu do wyszukiwania według znaczenia; w tym czasie działa wyszukiwanie po słowach.",
  "The model ranks the search beside word matches; nothing leaves this computer":"Model porządkuje wyniki obok dopasowań słów; nic nie opuszcza tego komputera",
  "Off, it matches words only.":"Wyłączone dopasowuje tylko słowa.",
  /* The organisation's model (board 992): the copywriter's words, 2026-11-11, but for the lines marked as placeholders. */
  "Suggest intents with the organisation's model":"Propozycje intencji przy użyciu modelu organizacji",
  "Sends the selected message, with up to 12 short pieces of the cards being ranked, to the organisation's model at {HOST} and suggests the intents it is closest to. Off, suggestions come from matching words.":"Wysyła zaznaczoną wiadomość, razem z najwyżej 12 krótkimi fragmentami porządkowanych kart, do modelu organizacji pod adresem {HOST} i proponuje najbliższe jej intencje. Wyłączone: propozycje wynikają z dopasowania słów.",
  "The organisation's model ranks the suggestions; the selected message and up to 12 short pieces of the cards are sent to {HOST}.":"Model organizacji ustala kolejność propozycji; zaznaczona wiadomość i najwyżej 12 krótkich fragmentów kart trafiają do {HOST}.",
  "Suggestions from the organisation's model":"Propozycje z modelu organizacji",
  "Search by meaning with the organisation's model":"Wyszukiwanie według znaczenia przy użyciu modelu organizacji",
  "From the third letter typed, the main search adds the cards and intents closest in meaning after those that match the words, ranked by the organisation's model at {HOST}, to which the search text is sent with up to 12 short pieces of the cards being ranked. Off, it matches words only.":"Od trzeciej wpisanej litery główne wyszukiwanie pokazuje, po wynikach pasujących do słów, karty i intencje najbliższe znaczeniem, uporządkowane przez model organizacji pod adresem {HOST}, do którego trafia tekst wyszukiwania razem z najwyżej 12 krótkimi fragmentami porządkowanych kart. Wyłączone dopasowuje tylko słowa.",
  "The organisation's model ranks the search beside word matches; the search text and up to 12 short pieces of the cards are sent to {HOST}.":"Model organizacji porządkuje wyniki obok dopasowań słów; tekst wyszukiwania i najwyżej 12 krótkich fragmentów kart trafiają do {HOST}.",
  "The model that ranks search and suggestions":"Model, który ustala kolejność wyszukiwania i propozycji",
  "Built-in, on this computer":"Wbudowany, na tym komputerze",
  "The organisation's":"Model organizacji",
  "The built-in model sends nothing anywhere.":"Wbudowany model niczego nigdzie nie wysyła.",
  "The search text, the selected message the suggestions are made from and up to 12 short pieces of the cards being ranked are sent to {HOST}, and nowhere else.":"Tekst wyszukiwania, zaznaczona wiadomość, z której powstają propozycje, i najwyżej 12 krótkich fragmentów porządkowanych kart trafiają do {HOST} i nigdzie indziej.",
  "The search text, the selected message the suggestions are made from and up to 12 short pieces of the cards being ranked are sent to {HOST}, and nowhere else; so, at your press, are the words or the card you ask it to reword.":"Tekst wyszukiwania, zaznaczona wiadomość, z której powstają propozycje, i najwyżej 12 krótkich fragmentów porządkowanych kart trafiają do {HOST} i nigdzie indziej; po kliknięciu trafia tam też tekst albo karta do przeredagowania.",
  "Set by the organisation":"Ustawione przez organizację",
  "Whoever manages Etiuda for the organisation can change this.":"Zmienić to może osoba, która zarządza Etiudą w organizacji.",
  "Group Policy names an AI service setting Etiuda cannot use, so it is ignored: {NAME}":"Zasady grupy ustawiają dla usługi AI wartość, której Etiuda nie może użyć, więc zostaje pominięta: {NAME}",
  "Service":"Usługa",
  "Another OpenAI-compatible service":"Usługa zgodna z OpenAI",
  "Address":"Adres",
  "Left empty, the service's own address is used: {URL}":"Puste pole oznacza własny adres usługi: {URL}",
  "Needed for this service: the full https address the organisation gives for it.":"Wymagany dla tej usługi: pełny adres https, który podaje dla niej organizacja.",
  "Model":"Model",
  "The model's name exactly as the service lists it.":"Nazwa modelu dokładnie taka, jak podaje ją usługa.",
  "Key":"Klucz",
  "Kept on this computer, sealed by the system for this account, and never written to a log.":"Przechowywany na tym komputerze, zapieczętowany przez system dla tego konta i nigdy niezapisywany w dzienniku.",
  "A key is kept. Typing a new one replaces it.":"Klucz jest zachowany. Wpisanie nowego go zastępuje.",
  "Test the connection":"Sprawdź połączenie",
  "Asks the model for a one-word answer. Nothing from the catalog or a conversation is sent.":"Prosi model o odpowiedź jednym słowem. Nic z katalogu ani z rozmowy nie jest wysyłane.",
  "Testing…":"Sprawdzanie…",
  "Connected: {HOST} answered, model {MODEL}.":"Połączono: {HOST} odpowiada, model {MODEL}.",
  "Connected: {HOST} answered in {SECONDS} s, model {MODEL}.":"Połączono: {HOST}, odpowiedź w {SECONDS} s, model {MODEL}.",
  "organisation's model too slow to reorder":"model organizacji zbyt wolny, by zmieniać kolejność",
  "{HOST} usually takes more than 4 seconds to answer, too long to reorder a list already being read, so the built-in model's order stands, and the desk still sends one query a minute to {HOST}.":"{HOST} na ogół odpowiada dłużej niż 4 sekundy, za długo, by zmieniać kolejność listy, która jest już czytana, więc zostaje kolejność modelu wbudowanego, a stanowisko nadal wysyła do {HOST} jedno zapytanie na minutę.",
  "{HOST} usually takes more than 4 seconds to answer, too long to reorder a list already being read, so the word matches' order stands, and the desk still sends one query a minute to {HOST}.":"{HOST} na ogół odpowiada dłużej niż 4 sekundy, za długo, by zmieniać kolejność listy, która jest już czytana, więc zostaje kolejność dopasowań słów, a stanowisko nadal wysyła do {HOST} jedno zapytanie na minutę.",
  "The AI service is set by the organisation's Group Policy, so this setting cannot be changed here.":"Usługę AI ustawiono w zasadach grupy organizacji, więc tego ustawienia nie można tu zmienić.",
  "The AI service named in the settings is not one Etiuda knows, so nothing was sent: {NAME}":"Etiuda nie zna usługi AI wskazanej w ustawieniach, więc nic nie zostało wysłane: {NAME}",
  "The AI service's address must be a full https address with no user name, query or fragment, so nothing was sent: {URL}":"Adres usługi AI musi być pełnym adresem https, bez nazwy użytkownika, zapytania i fragmentu, więc nic nie zostało wysłane: {URL}",
  "This computer cannot keep the AI service's key for this account: no keyring is open to seal it, so the key was not kept.":"Na tym komputerze nie da się przechować klucza usługi AI dla tego konta: żaden magazyn kluczy nie jest otwarty, by go zapieczętować, więc klucz nie został zachowany.",
  "No AI service is set up yet. One is chosen from the Menu, under Settings, then Data and defaults.":"Usługa AI nie jest jeszcze ustawiona. Wybiera się ją z menu, w Ustawieniach, w części Dane i ustawienia domyślne.",
  "No model is named for the AI service, so nothing was sent. The model is named from the Menu, under Settings, then Data and defaults.":"Dla usługi AI nie wskazano modelu, więc nic nie zostało wysłane. Model wskazuje się z menu, w Ustawieniach, w części Dane i ustawienia domyślne.",
  "The organisation's Group Policy sets the AI service's key, and that key goes only to the address the policy sets or to the service's own, never to an address typed here, so nothing was sent.":"Klucz usługi AI ustawiono w zasadach grupy organizacji, a ten klucz trafia tylko pod adres z tych zasad albo pod własny adres usługi, nigdy pod adres wpisany tutaj, więc nic nie zostało wysłane.",
  "Your organisation has set a key for an AI service without naming the service, so nothing is sent. Its IT department can name it.":"Organizacja ustawiła klucz do usługi AI, ale nie wskazała tej usługi, więc nic nie jest wysyłane. Może ją wskazać dział IT organizacji.",
  "Not sent: the organisation set a key without naming its service.":"Nie wysłano: organizacja ustawiła klucz bez wskazania usługi.",
  "The AI service did not answer in time, so the request was given up.":"Usługa AI nie odpowiedziała na czas, więc zapytanie przerwano.",
  "The AI service is busy and asked Etiuda to wait; a later try may go through.":"Usługa AI jest zajęta i poprosiła Etiudę o odczekanie; późniejsza próba może się udać.",
  "organisation's model":"model organizacji",
  "The organisation's model at {HOST} ranks the search and the suggestions. The search text, the selected message the suggestions are made from, and up to 12 short pieces of the cards being ranked are sent there.":"Model organizacji pod adresem {HOST} ustala kolejność wyszukiwania i propozycji. Trafia tam tekst wyszukiwania, zaznaczona wiadomość, z której powstają propozycje, i najwyżej 12 krótkich fragmentów porządkowanych kart.",
  "The organisation's model at {HOST} ranks the search. The search text is sent there, with up to 12 short pieces of the cards being ranked.":"Model organizacji pod adresem {HOST} ustala kolejność wyszukiwania. Trafia tam tekst wyszukiwania, razem z najwyżej 12 krótkimi fragmentami porządkowanych kart.",
  "The organisation's model at {HOST} ranks the suggestions. The selected message they are made from is sent there, with up to 12 short pieces of the cards being ranked.":"Model organizacji pod adresem {HOST} ustala kolejność propozycji. Trafia tam zaznaczona wiadomość, z której powstają, razem z najwyżej 12 krótkimi fragmentami porządkowanych kart.",
  "At your press, the words or the card you ask it to reword go there too.":"Po kliknięciu trafia tam też tekst albo karta do przeredagowania.",
  "The organisation's model at {HOST} is set, and with both switches and Rewording off, nothing is sent to it.":"Model organizacji pod adresem {HOST} jest ustawiony, a przy wyłączonych obu przełącznikach i Przeredagowaniu nic do niego nie trafia.",
  "The organisation's model at {HOST} is set. With both switches off, only the words or the card you ask it to reword are sent to it, at your press.":"Model organizacji pod adresem {HOST} jest ustawiony. Przy wyłączonych obu przełącznikach trafia do niego tylko, po kliknięciu, tekst albo karta do przeredagowania.",
  "organisation's model not answering, built-in model ranking":"model organizacji nie odpowiada, kolejność ustala model wbudowany",
  "{HOST} has not answered three times in a row, so the built-in model ranks on this computer, sending nothing, and the desk asks {HOST} again in a minute.":"{HOST} nie odpowiedział trzy razy z rzędu, więc kolejność ustala model wbudowany na tym komputerze, niczego nie wysyłając, a stanowisko zapyta {HOST} ponownie za minutę.",
  "organisation's model not answering, word matches only":"model organizacji nie odpowiada, tylko dopasowanie słów",
  "{HOST} has not answered three times in a row, so the search matches words alone, and the desk asks {HOST} again in a minute.":"{HOST} nie odpowiedział trzy razy z rzędu, więc wyszukiwanie dopasowuje tylko słowa, a stanowisko zapyta {HOST} ponownie za minutę.",
  "Until the service, its address, the model and the key are all filled in, the built-in model ranks and nothing is sent.":"Dopóki usługa, jej adres, model i klucz nie są uzupełnione, kolejność ustala model wbudowany i nic nie jest wysyłane.",
  "That model name could not be kept, so the one before stands.":"Tej nazwy modelu nie udało się zachować, więc obowiązuje poprzednia.",
  "That key could not be kept, so the one before stands.":"Tego klucza nie udało się zachować, więc obowiązuje poprzedni.",
  "The setting could not be saved just now.":"Tego ustawienia nie udało się teraz zapisać.",
  // placeholder: Claudette, this line, which her words do not cover
  "No key is kept for this address, so nothing was sent.":"Dla tego adresu nie zachowano klucza, więc nic nie zostało wysłane.",
  "The key kept here was given for the previous service or address, so it was forgotten rather than sent to this one. The key for this one goes in the Key field.":"Zachowany klucz podano dla poprzedniej usługi lub adresu, więc został usunięty, zamiast trafić pod ten adres. Klucz dla tego adresu wpisuje się w polu Klucz.",
  "{HOST} could not be reached, so the connection is not confirmed.":"Nie udało się połączyć z {HOST}, więc połączenie nie zostało potwierdzone.",
  "{HOST} answered with an error, so the connection is not confirmed.":"{HOST} odpowiedział błędem, więc połączenie nie zostało potwierdzone.",
  "General":"Ogólne",
  "Notifications":"Powiadomienia",
  "Notifications from Etiuda, also while its window is closed.":"Powiadomienia od Etiudy, także gdy jej okno jest zamknięte.",
  "Tell me when":"Powiadamiaj, gdy",
  "The team's lead publishes a new edition":"Lider zespołu publikuje nowe wydanie",
  "A new catalog arrives from the team":"Od zespołu przychodzi nowy katalog",
  "{LEAD} published a new edition":"Nowe wydanie od lidera zespołu: {LEAD}",
  "The team's lead published a new edition":"Nowe wydanie od lidera zespołu",
  "{CATALOG}, edition {EDITION}. Nothing is loaded until it is looked at.":"{CATALOG}, wydanie {EDITION}. Nic nie zostanie wczytane przed przejrzeniem.",
  "{CATALOG}. Nothing is loaded until it is looked at.":"{CATALOG}. Nic nie zostanie wczytane przed przejrzeniem.",
  "Show what changed":"Pokaż zmiany",
  "A new catalog from {LEAD}":"Nowy katalog od lidera zespołu: {LEAD}",
  "A new catalog from the team's lead":"Nowy katalog od lidera zespołu",
  "{CATALOG} is in the Library, ready to open.":"{CATALOG} jest w Bibliotece i można go otworzyć.",
  "Teams and keys":"Zespoły i klucze",
  "Data and defaults":"Dane i ustawienia domyślne",
  "About":"O programie",
  "Search settings":"Szukaj w ustawieniach",
  "All settings":"Wszystkie ustawienia",
  "Every setting Etiuda has, on one page.":"Wszystkie ustawienia Etiudy na jednej stronie.",
  "As the desk will look":"Tak będzie wyglądać stanowisko",
  "A drawing that follows these settings as they change. It is only for looking at.":"Rysunek zmienia się razem z tymi ustawieniami i służy tylko do podglądu.",
  "Opens this section alone":"Otwiera tylko tę sekcję",
  "No setting matches this search.":"Żadne ustawienie nie pasuje do tego wyszukiwania.",
  "Open":"Otwórz",
  "Starting and closing":"Uruchamianie i zamykanie",
  "Start with Windows":"Uruchamiaj razem z systemem Windows",
  "Etiuda starts in the tray when this Windows account signs in.":"Etiuda uruchamia się w zasobniku po zalogowaniu do tego konta Windows.",
  "When the window closes":"Po zamknięciu okna",
  "Stay in the tray":"Zostaje w zasobniku",
  "Say so at the first close":"Informuj przy pierwszym zamknięciu",
  "Once each start, a blue bubble over the tray icon says Etiuda keeps running there. Don't show again in the bubble turns this off.":"Raz po każdym uruchomieniu niebieski dymek nad ikoną w zasobniku informuje, że Etiuda działa tam dalej. Przycisk Nie pokazuj więcej w dymku wyłącza tę opcję.",
  "Quit":"Kończy działanie",
  "Closing the window will quit Etiuda.":"Zamknięcie okna zakończy działanie Etiudy.",
  "In the tray, Etiuda still answers its shortcut and shows notifications.":"W zasobniku Etiuda nadal reaguje na swój skrót i pokazuje powiadomienia.",
  "How the app looks and moves.":"Jak program wygląda i jak się porusza.",
  "How the screen is laid out.":"Jak rozłożony jest ekran.",
  "Every shortcut, and how to change it.":"Wszystkie skróty i sposób ich zmiany.",
  "What the app tells you, also while its window is closed.":"O czym program powiadamia, także gdy jego okno jest zamknięte.",
  "The team this desk is on, and how its changes reach the team.":"Zespół tego stanowiska i sposób, w jaki jego zmiany trafiają do zespołu.",
  "Putting settings back, and what the app keeps on this computer.":"Przywracanie ustawień i to, co program przechowuje na tym komputerze.",
  "The version, the licence and the tour.":"Wersja, licencja i przewodnik.",
  "A shortcut can be changed to an F key or a combination with Ctrl or Alt, since keys needed for typing stay with typing; the keys Etiuda itself needs are shown as fixed.":"Skrót można zmienić na klawisz F albo połączenie z Ctrl lub Alt, bo klawisze potrzebne do pisania zostają do pisania; klawisze, których Etiuda potrzebuje sama, są oznaczone jako stałe.",
  "Puts every setting back as it ships. Cards and your edits are not touched.":"Przywraca wszystkie ustawienia do stanu wyjściowego. Karty i własne zmiany zostają bez zmian.",
  "What this computer reports, and ways to set things right.":"Co raportuje ten komputer i jak przywrócić porządek.",
  "Reset defaults is in Settings, under Data and defaults, and Clear local changes is in the Library, under Catalog & data.":"Przywróć domyślne jest w Ustawieniach, w części Dane i ustawienia domyślne, a Wyczyść zmiany lokalne w Bibliotece, w części Katalog i dane.",
  "Readings":"Odczyty",
  "Last start":"Ostatnie uruchomienie",
  "Last crash":"Ostatnia awaria",
  "none recorded":"brak zapisów",
  "Saving":"Zapisywanie",
  "saved {TIME}":"zapisano {TIME}",
  "File watch":"Obserwacja pliku",
  "relay reachable":"przekaźnik osiągalny",
  "relay out of reach":"przekaźnik nieosiągalny",
  "synced {TIME}":"zsynchronizowano {TIME}",
  "The language of the buttons and menus, not of the replies: those follow EN|PL in the header":"Język przycisków i menu, nie odpowiedzi: ich język zmienia przełącznik EN|PL w nagłówku",
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
  "Press the alternative (Esc to cancel, Ctrl+Backspace to clear)":"Oczekiwanie na skrót alternatywny (Esc anuluje, Ctrl+Backspace usuwa)",
  "Alternative cleared":"Usunięto skrót alternatywny",
  "Back to the default":"Przywrócono domyślny skrót",
  "Type a word to find a reply":"Wpisz słowo, by znaleźć odpowiedź",
  "Replies":"Odpowiedzi",
  "The reply copied last":"Ostatnio skopiowana odpowiedź",
  "{N} reply":"{N} odpowiedź",
  "{N} replies":"{N} odpowiedzi",
  "few␟{N} replies":"{N} odpowiedzi",
  "many␟{N} replies":"{N} odpowiedzi",
  "{SHOWN} of {COUNT}":"{SHOWN} z {COUNT}",
  "Etiuda fills the reply in for this conversation":"Etiuda dopasuje odpowiedź do tej rozmowy",
  "Click to switch replies to the next language":"Kliknięcie przełącza odpowiedzi na następny język",
  "{KEY} copies, and pastes where it can":"{KEY} wkleja lub kopiuje",
  "{KEY} in {LANG}":"{KEY} w języku {LANG}",
  "{KEY} closes":"{KEY} zamyka",
  "Pasted":"Wklejono",
  "Copied, press Ctrl+V":"Skopiowano: Ctrl+V wklei odpowiedź",
  "{KEYS} belongs to another program just now.":"{KEYS} należy teraz do innego programu.",
  "A combination of Etiuda's own, chosen in Settings, opens Quick replies over any window.":"Własna kombinacja Etiudy, wybrana w Ustawieniach, otwiera Szybkie odpowiedzi nad dowolnym oknem.",
  "Choose a combination":"Wybierz kombinację",
  "The replies beside the pointer, over any program: {KEYS} brings them from anywhere, and Settings is where the combination is changed.":"Odpowiedzi obok wskaźnika, nad każdym programem: kombinacja {KEYS} przywołuje je z dowolnego miejsca, a zmienić ją można w Ustawieniach.",
  "The replies beside the pointer, over any program; a combination that brings them from anywhere is chosen in Settings.":"Odpowiedzi obok wskaźnika, nad każdym programem; kombinację, która przywoła je z dowolnego miejsca, wybiera się w Ustawieniach.",
  "A conversation":"Rozmowa",
  "The next steps are about a conversation. Click a conversation's tab to carry on.":"Kolejne kroki dotyczą rozmowy. Proszę kliknąć zakładkę rozmowy, aby przejść dalej.",
  "Quick replies":"Szybkie odpowiedzi",
  "A word finds the reply. <kbd>Enter</kbd> copies it, and pastes it into the window you were in wherever Windows allows. <kbd>Esc</kbd> closes Quick replies.":"Wystarczy wpisać słowo. <kbd>Enter</kbd> kopiuje odpowiedź i wkleja ją do poprzedniego okna, jeśli Windows na to pozwala. <kbd>Esc</kbd> zamyka Szybkie odpowiedzi.",
  "{KEY} opens Quick replies over any program, beside the pointer. To try it, press {KEY} or click <b>Quick replies</b> here.":"{KEY} otwiera Szybkie odpowiedzi nad każdym programem, obok wskaźnika. Aby spróbować, proszę nacisnąć {KEY} albo kliknąć tu <b>Szybkie odpowiedzi</b>.",
  "Suggested":"Propozycje",
  "Intents suggested from the text selected before Quick replies opened. None is chosen until one is clicked.":"Intencje zaproponowane na podstawie tekstu zaznaczonego przed otwarciem Szybkich odpowiedzi. Żadna nie jest wybrana, dopóki się jej nie kliknie.",
  "Suggestions taken: {N}":"Wybrane propozycje: {N}",
  "Openings with suggestions: {N}":"Otwarcia z propozycjami: {N}",
  "When Quick replies opens with a customer's message selected in another program, and the message points clearly enough at some intents, up to five of them are suggested above the list. None is chosen until one is clicked. The selected text is read only as Quick replies opens, and never kept or sent; the statistics count only how often suggestions appeared and how many were taken.":"Gdy otwierają się Szybkie odpowiedzi, a w innym programie jest zaznaczona wiadomość klienta wyraźnie wskazująca na jakieś intencje, nad listą pojawia się do pięciu z nich. Żadna nie jest wybrana, dopóki się jej nie kliknie. Zaznaczony tekst jest odczytywany tylko przy otwarciu Szybkich odpowiedzi i nigdy nie jest zapisywany ani wysyłany; statystyki liczą jedynie, ile razy pojawiły się propozycje i ile z nich wybrano.",
  "When Quick replies opens with a customer's message selected in another program, and the message points clearly enough at some intents, up to five of them are suggested above the list. None is chosen until one is clicked. While the organisation's model is on, the selected text, at most its first 1,500 characters, is sent to {HOST} as Quick replies opens, with up to 12 short pieces of the cards being ranked, so that the model there can suggest the intents; this desk keeps no copy of it. The statistics count only how often suggestions appeared and how many were taken.":"Gdy otwierają się Szybkie odpowiedzi, a w innym programie jest zaznaczona wiadomość klienta wyraźnie wskazująca na jakieś intencje, nad listą pojawia się do pięciu z nich. Żadna nie jest wybrana, dopóki się jej nie kliknie. Gdy włączony jest model organizacji, zaznaczony tekst, najwyżej 1500 pierwszych znaków, trafia przy otwarciu Szybkich odpowiedzi do {HOST}, razem z najwyżej 12 krótkimi fragmentami porządkowanych kart, aby tamtejszy model mógł zaproponować intencje; to stanowisko nie zachowuje jego kopii. Statystyki liczą jedynie, ile razy pojawiły się propozycje i ile z nich wybrano.",
  "Works from any program; Enter copies a reply and pastes it into the window you were in, wherever Windows allows.":"Działa w każdym programie; Enter kopiuje odpowiedź i wkleja ją do poprzedniego okna, jeśli Windows na to pozwala.",
  "Another program uses this combination just now; a different one will do.":"Tej kombinacji używa teraz inny program; wybór innej to rozwiąże.",
  "{KEYS} already belongs to another program; a different combination will do.":"{KEYS} należy już do innego programu; wybór innej kombinacji to rozwiąże.",
  "Browsers and chat tools already answer most combinations like {KEYS}; Ctrl+Shift with Space or a function key stays free.":"Przeglądarki i czaty same reagują na większość kombinacji takich jak {KEYS}; Ctrl+Shift ze spacją lub klawiszem funkcyjnym pozostaje wolne.",
  "{KEYS} types accented letters on many keyboards; Ctrl+Shift with Space or a function key stays free.":"{KEYS} wpisuje na wielu klawiaturach litery z ogonkami; Ctrl+Shift ze spacją lub klawiszem funkcyjnym pozostaje wolne.",
  "{KEYS} alone would stop that key typing; with Ctrl or Alt it will do.":"Samo {KEYS} przestałoby wtedy pisać; z Ctrl lub Alt się sprawdzi.",
  "Windows keeps {KEYS} for itself; Ctrl+Shift with Space or a function key stays free.":"Windows zachowuje {KEYS} dla siebie; Ctrl+Shift ze spacją lub klawiszem funkcyjnym pozostaje wolne.",
  "Etiuda takes a letter, a digit, Space or a function key, with Ctrl, Alt or Shift.":"Etiuda przyjmuje literę, cyfrę, spację lub klawisz funkcyjny, z Ctrl, Alt lub Shift.",
  "Press the new combination (Esc to cancel, Backspace for the default, Delete for none)":"Naciśnij nową kombinację (Esc anuluje, Backspace przywraca domyślną, Delete wyłącza)",
  "The hotkey is off":"Skrót jest wyłączony",
  "Reset defaults":"Przywróć domyślne",
  "Layout":"Układ",
  "Lock the intent panel":"Zablokuj panel intencji",
  "Keep it docked even when the window is narrow, instead of letting it hide itself.":"Panel zostaje zadokowany także przy wąskim oknie, zamiast chować się sam.",
  "Lock the category bar":"Zablokuj pasek kategorii",
  "Keep every category row visible, instead of collapsing to two lines.":"Wszystkie rzędy kategorii pozostają widoczne, zamiast zwijać się do dwóch linii.",
  "On":"Włączone",
  "Off":"Wyłączone",
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
  "The network proxy asks for a sign-in":"Serwer proxy w sieci prosi o zalogowanie",
  "The proxy asked again, so the user name or password may need another look.":"Serwer proxy zapytał ponownie, więc nazwę użytkownika lub hasło warto sprawdzić jeszcze raz.",
  "User name":"Nazwa użytkownika",
  "Password":"Hasło",
  "Beside the customer's name there is now a wheel: it chooses who in the team this reply names.":"Obok imienia klienta jest teraz kółko: wybiera się nim osobę z zespołu, którą wymienia ta odpowiedź.",
  "No catalog loaded":"Nie wczytano katalogu",
  "Test service":"Usługa testowa",
  "This catalog has changed since it was loaded.":"Ten katalog zmienił się od czasu wczytania.",
  "This file is an earlier edition than the one loaded now.":"Ten plik to wcześniejsze wydanie niż wczytane teraz.",
  "The tour of Etiuda's controls, one at a time":"Przewodnik po Etiudzie, krok po kroku",
  "The tour waits in the Menu, under Show tour…":"Przewodnik czeka w Menu, pod Pokaż przewodnik…",
  "To begin, the name your replies are signed with. Customers see it at the foot of each one, and it can be changed at any time in Settings, under Account.":"Na początek podpis: imię, które klienci zobaczą pod każdą odpowiedzią. Można je zmienić w każdej chwili w Ustawieniach, w części Konto.",
  "A catalog of replies":"Katalog odpowiedzi",
  "Replies come in a catalog. Click <b>Next</b> to open the practice catalog in {FOLDER} and try Etiuda before your team's own arrives, or <b>Load catalog file</b> to choose another.":"Odpowiedzi są w katalogu. Proszę kliknąć <b>Dalej</b>, aby otworzyć przykładowy katalog z folderu {FOLDER} i wypróbować Etiudę, zanim dotrze katalog zespołu, albo <b>Wczytaj plik katalogu</b>, aby wybrać inny.",
  "Replies come in a catalog. Click <b>Next</b> to open {FILE} in {FOLDER}, or <b>Load catalog file</b> to choose another.":"Gotowe odpowiedzi przynosi katalog. Proszę kliknąć <b>Dalej</b>, aby otworzyć {FILE} z folderu {FOLDER}, albo <b>Wczytaj plik katalogu</b>, żeby wybrać inny.",
  "Replies come in a catalog. Click <b>Load catalog file</b> and choose the team's catalog file in {FOLDER}; <b>Next</b> stays off until a catalog is in place.":"Gotowe odpowiedzi przynosi katalog. Proszę kliknąć <b>Wczytaj plik katalogu</b> i wybrać plik katalogu zespołu z folderu {FOLDER}; przycisk <b>Dalej</b> jest nieaktywny, dopóki katalog nie zostanie wczytany.",
  "Replies come in a catalog. Click <b>Load catalog file</b> and choose the file; <b>Next</b> stays off until a catalog is in place, and the catalog stays in this browser, ready whenever you come back.":"Gotowe odpowiedzi przynosi katalog. Proszę kliknąć <b>Wczytaj plik katalogu</b> i wybrać plik; przycisk <b>Dalej</b> jest nieaktywny, dopóki katalog nie zostanie wczytany, a sam katalog zostanie w tej przeglądarce i poczeka na każdy powrót.",
  "comes with Etiuda":"dołączony do Etiudy",
  "Signed":"Podpisany",
  "Unsigned":"Niepodpisany",
  "This file is signed with the key {KEY}.":"Ten plik podpisano kluczem {KEY}.",
  "This file has changed since it was signed.":"Ten plik zmienił się od czasu podpisania.",
  "This file is signed with a key this computer does not know.":"Ten plik podpisano kluczem, którego nie zna ten komputer.",
  "The catalog loaded now is signed, and this edition is not.":"Wczytany teraz katalog jest podpisany, a to wydanie nie.",
  "The customer's name goes here as the chat gives it, surname and capitals included, and every reply greets them by first name, in Polish in the vocative (ANNA KOWALSKA becomes <b>Anno</b>). The wheel beside it chooses who in the team this reply names.":"Tu wkleja się imię klienta prosto z czatu, z nazwiskiem i wielkimi literami, a każda odpowiedź zwraca się do tej osoby po imieniu, po polsku w wołaczu (ANNA KOWALSKA zamienia się w <b>Anno</b>). Kółko obok wybiera osobę z zespołu, którą wymienia ta odpowiedź.",
  "The customer's name":"Imię klienta",
  "The customer's name goes here as the chat gives it, surname and capitals included, and every reply greets them by first name, in Polish in the vocative (ANNA KOWALSKA becomes <b>Anno</b>).":"Tu wkleja się imię klienta prosto z czatu, z nazwiskiem i wielkimi literami, a każda odpowiedź zwraca się do tej osoby po imieniu, po polsku w wołaczu (ANNA KOWALSKA zamienia się w <b>Anno</b>).",
  "A word near what the customer means, such as 'refund', is enough: the intents on the left rank themselves and the cards narrow to match, in both languages. <kbd>Enter</kbd> picks the marked intent, and <kbd>Esc</kbd> clears the box.":"Wystarczy słowo bliskie temu, o co pyta klient, na przykład 'zwrot': intencje po lewej ułożą się według trafności, a karty zawężą do pasujących, w obu językach. <kbd>Enter</kbd> wybiera zaznaczoną intencję, a <kbd>Esc</kbd> czyści pole.",
  "An intent names what the customer has come about. A click on one brings its replies forward, ringed <b class=\"t-go\">green</b>, with its phrase filling <span class=\"fillmiss\">INTENT</span> wherever a reply uses it. <kbd>Ctrl</kbd>+click picks several, and the star keeps the ones used most at the top.":"Intencja mówi, z czym klient przychodzi. Kliknięcie którejś wysuwa jej odpowiedzi do przodu, obwiedzione na <b class=\"t-go\">zielono</b>, a jej fraza trafia wszędzie tam, gdzie w odpowiedzi stoi <span class=\"fillmiss\">INTENCJA</span>. <kbd>Ctrl</kbd>+kliknięcie wybiera kilka, a gwiazdka trzyma na górze te używane najczęściej.",
  "A click on a reply copies the whole of it, greeting, name and signature filled in, ready to paste into the chat. A card marked <b>1/2</b> or <b>STEP 1/3</b> holds several, each copied on its own. <kbd>↑</kbd> <kbd>↓</kbd> and <kbd>Enter</kbd> do the same from the keyboard.":"Kliknięcie odpowiedzi kopiuje ją w całości, z powitaniem, imieniem i podpisem, gotową do wklejenia w czacie. Karta z oznaczeniem <b>1/2</b> albo <b>KROK 1/3</b> mieści kilka odpowiedzi, a każdą kopiuje się osobno. Z klawiatury to samo robią <kbd>↑</kbd> <kbd>↓</kbd> i <kbd>Enter</kbd>.",
  "These replies are examples to practise with, not for a live chat.":"Te odpowiedzi to przykłady do ćwiczeń, nie do prawdziwej rozmowy.",
  "Before the first customer, load your team's catalog.":"Przed pierwszym klientem trzeba wczytać katalog zespołu.",
  "A click on a category shows only its cards, and <kbd>Ctrl</kbd>+click keeps several. A <b class=\"t-go\">green</b> ring marks one holding a card for the chosen intent, and a <b class=\"t-acc\">blue</b> one a supporting category, useful for any question.":"Kliknięcie kategorii zostawia tylko jej karty, a <kbd>Ctrl</kbd>+kliknięcie pozwala wybrać kilka. <b class=\"t-go\">Zielona</b> obwódka oznacza kategorię z kartą dla wybranej intencji, a <b class=\"t-acc\">niebieska</b> kategorię wspierającą, przydatną przy każdym pytaniu.",
  "Each customer on the chat gets a tab of their own here, with their name, intent and language, so a reply never carries the wrong name. <b>+</b> or {NEW} opens another conversation, {KEY} moves to the next and {PREV} to the one before.":"Każdy klient na czacie ma tu osobną rozmowę, z własnym imieniem, intencją i językiem, więc żadna odpowiedź nie pójdzie z cudzym imieniem. Kolejną rozmowę otwiera <b>+</b> albo skrót {NEW}, {KEY} przechodzi do następnej, a {PREV} do poprzedniej.",
  "Replies in this conversation follow the language chosen here, so each customer is answered in their own. {KEY} switches it from anywhere.":"Odpowiedzi w tej rozmowie idą w języku wybranym tutaj, więc każdy klient dostaje odpowiedź w swoim. {KEY} przełącza język z dowolnego miejsca.",
  "The star lifts a card to the top of its category, and under <span class=\"t-pill\"><span data-icon=\"all\"></span>All</span> into <b class=\"t-fav\"><span data-icon=\"star\"></span>Favourites</b>.<br>The eye puts it away, greyed at the foot of its category, and brings it back from there.<br>The pencil opens it for editing, and <b>Reset</b> in the editor brings back the catalog's own words.<br>Click the pencil on this card.":"Gwiazdka przenosi kartę na początek jej kategorii, a w widoku <span class=\"t-pill\"><span data-icon=\"all\"></span>Wszystkie</span> do <b class=\"t-fav\"><span data-icon=\"star\"></span>Ulubionych</b>.<br>Oko odkłada ją na bok, szarą, na dół kategorii, i stamtąd też ją przywraca.<br>Ołówek otwiera ją do poprawek, a <b>Przywróć</b> w edytorze wraca do treści z katalogu.<br>Proszę kliknąć ołówek na tej karcie.",
  "<span class=\"t-sec\">Content</span> holds the text in both languages and the internal note; the folds below hold the keywords, the category, the linked intents, the next replies and the advanced settings. <b>Cancel</b> leaves everything as it was.":"<span class=\"t-sec\">Treść</span> to tekst w obu językach i notatka wewnętrzna; w zwiniętych sekcjach poniżej są słowa kluczowe, kategoria, powiązane intencje, kolejne odpowiedzi i ustawienia zaawansowane. <b>Anuluj</b> zostawia wszystko bez zmian.",
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
  "The Library has a tab of its own, beside the conversations. The whole catalog is here.":"Biblioteka ma własną zakładkę, obok rozmów. Jest w niej cały katalog.",
  "Its parts are on the left: <b>Categories & cards</b>, <b>Intents</b>, <b>ROLE suggestions</b> and <b>Catalog & data</b>, where a catalog is loaded and your own improvements go out as a file for whoever keeps the wording.":"Jej części są po lewej: <b>Kategorie i karty</b>, <b>Intencje</b>, <b>Podpowiedzi ROLE</b> oraz <b>Katalog i dane</b>, gdzie wczytuje się katalog i skąd wysyła się własne poprawki, jako plik dla osoby, która dba o treść.",
  "A click on a row opens it, to edit, hide or move.":"Kliknięcie wiersza otwiera go do edycji, ukrycia albo przeniesienia.",
  "Settings has a tab of its own too. Nothing here touches a card.":"Ustawienia też mają własną zakładkę. Nic tutaj nie zmienia kart.",
  "The parts are on the left: your name is under <b>Account</b>, the language under <b>General</b>, the look under <b>Appearance</b>, and every shortcut, Quick replies' included, under <b>Keyboard shortcuts</b>.":"Części są po lewej: imię jest w <b>Koncie</b>, język w <b>Ogólnych</b>, wygląd aplikacji w <b>Wyglądzie</b>, a wszystkie skróty, także do Szybkich odpowiedzi, w <b>Skrótach klawiszowych</b>.",
  "One more tab: open the <span data-icon=\"settings\"></span> Menu again and click <b>Settings</b>.":"Jeszcze jedna zakładka: wystarczy znów otworzyć <span data-icon=\"settings\"></span> Menu i wybrać <b>Ustawienia</b>.",
  "It opens in a tab of its own, and the tour goes there with it.":"Otworzy się we własnej zakładce, a przewodnik przejdzie tam razem z nią.",
  "Once the window is open, the tour goes inside with it.":"Po otwarciu okna przewodnik zajrzy do środka.",
  "The tour carries on once this window is closed.":"Przewodnik ruszy dalej, gdy to okno się zamknie.",
  "That is the whole tour. <b>Show tour…</b> in the <span data-icon=\"settings\"></span> Menu brings it back, and <b>Settings</b> lists every shortcut.":"To cały przewodnik. <b>Pokaż przewodnik…</b> w <span data-icon=\"settings\"></span> Menu otwiera go ponownie, a wszystkie skróty są w <b>Ustawieniach</b>.",
  "Load catalog file…":"Wczytaj plik katalogu…",
  "Saved copies…":"Zapisane kopie…",
  "Saved copies":"Zapisane kopie",
  "Each catalog file this desk opens or saves leaves a copy here, kept for 30 days.":"Każdy plik katalogu, który to stanowisko otwiera lub zapisuje, zostawia tu kopię, przechowywaną przez 30 dni.",
  "This desk's own file":"Własny plik tego stanowiska",
  /* words: placeholder */
  "Changes no longer go into the shared catalog file.":"Zmiany nie trafiają już do wspólnego pliku katalogu.",
  "Etiuda no longer edits a catalog file in a shared folder: this desk keeps its changes in its own file, and nothing in the shared file was changed or removed. To work with others, ask your team's lead for an invitation.":"Etiuda nie zmienia już plików katalogu we wspólnym folderze: to stanowisko zachowuje zmiany we własnym pliku, a wspólny plik nie został zmieniony ani usunięty. Aby pracować z innymi, wystarczy poprosić lidera zespołu o zaproszenie.",
  "Current":"Aktualna",
  "Saved on this desk":"Zapisana na tym stanowisku",
  "Open this copy":"Otwórz tę kopię",
  "Put back":"Przywróć",
  "Put this version back in the catalog folder, in place of the file there now":"Przywraca tę wersję do folderu z plikami katalogów w miejsce obecnego pliku",
  "{FILE} as it was on {WHEN}, kept on this desk.":"{FILE} w stanie z {WHEN}, zachowany na tym stanowisku.",
  "{FILE} could not be put back in the catalog folder. The version stays here, ready to try again.":"Nie udało się przywrócić pliku {FILE} do folderu katalogów. Ta wersja zostaje tutaj i można spróbować ponownie.",
  "Version put back":"Przywrócono wersję",
  "The catalog file could not be loaded:":"Nie udało się wczytać pliku katalogu:",
  "{FILE} is sealed for its team":"{FILE} jest zapieczętowany dla swojego zespołu",
  "Once the team's lead lets this desk in, the catalog opens here by itself.":"Gdy lider zespołu wpuści to stanowisko, katalog otworzy się tutaj sam.",
  "Ask to join works once this computer's secure storage can keep this desk's own key, which it cannot just now; on Windows, signing in with a person's own account, not a service account or a temporary profile, usually does it. Then press Ask to join again.":"Prośba o dołączenie zadziała, gdy bezpieczny magazyn tego komputera będzie mógł przechować własny klucz stanowiska, czego teraz nie może; w systemie Windows zwykle pomaga zalogowanie się na własne konto, a nie na konto usługi ani profil tymczasowy. Potem wystarczy ponownie nacisnąć Poproś o dołączenie.",
  "Ask to join works once this computer's secure storage can keep this desk's own key, which it cannot just now; on macOS, allowing Etiuda to use the Keychain when asked usually does it. Then press Ask to join again.":"Prośba o dołączenie zadziała, gdy bezpieczny magazyn tego komputera będzie mógł przechować własny klucz stanowiska, czego teraz nie może; w systemie macOS zwykle pomaga zezwolenie Etiudzie na dostęp do pęku kluczy, gdy system o to zapyta. Potem wystarczy ponownie nacisnąć Poproś o dołączenie.",
  "Ask to join works once this computer's secure storage can keep this desk's own key, which it cannot just now; on Linux, unlocking the system keyring usually does it. Then press Ask to join again.":"Prośba o dołączenie zadziała, gdy bezpieczny magazyn tego komputera będzie mógł przechować własny klucz stanowiska, czego teraz nie może; w systemie Linux zwykle pomaga odblokowanie systemowego magazynu haseł. Potem wystarczy ponownie nacisnąć Poproś o dołączenie.",
  "Ask to join again once the team's folder can be reached; just now it does not answer from this computer, so nothing was written.":"Wystarczy ponownie poprosić o dołączenie, gdy folder zespołu będzie osiągalny; teraz ten komputer nie może się z nim połączyć, więc nic nie zapisano.",
  "Whoever manages the team's folder can let this computer write in it, which the request needs; until then nothing was written here. After that, press Ask to join again.":"Osoba zarządzająca folderem zespołu może pozwolić temu komputerowi na zapis, którego wymaga prośba; do tego czasu nic tu nie zapisano. Potem wystarczy ponownie nacisnąć Poproś o dołączenie.",
  "Asks as {NAME}, the name in Settings.":"Prośba pójdzie jako {NAME}, pod nazwą z Ustawień.",
  "this desk":"to stanowisko",
  "Ask to join":"Poproś o dołączenie",
  "Join a team":"Dołącz do zespołu",
  "Paste the invitation from the team's lead.":"Proszę wkleić zaproszenie od lidera zespołu.",
  "Continue":"Dalej",
  "Join this team?":"Dołączyć do tego zespołu?",
  "Join this team":"Dołącz do tego zespołu",
  "Folder: {FOLDER}":"Folder: {FOLDER}",
  "Lead: {NAME}":"Lider zespołu: {NAME}",
  "{LEAD} invites this desk to join the team through {HOST}.":"{LEAD} zaprasza to stanowisko do zespołu przez przekaźnik {HOST}.",
  "Team: {TEAM}":"Zespół: {TEAM}",
  "Relay: {HOST}":"Przekaźnik: {HOST}",
  "This invitation cannot be read, so nothing was changed.":"Tego zaproszenia nie da się odczytać, więc nic nie zostało zmienione.",
  "This folder is on the computer {HOST}.":"Ten folder znajduje się na komputerze {HOST}.",
  "This folder could not be reached, so nothing was written.":"Ten folder jest teraz niedostępny, więc nic nie zapisano.",
  "This computer can only read the team's folder, and joining needs permission to write there. Once that is granted, Join again; the invitation still works.":"Ten komputer może tylko czytać z folderu zespołu, a dołączenie wymaga uprawnień do zapisu. Po ich nadaniu wystarczy ponownie dołączyć; zaproszenie nadal działa.",
  "Etiuda could not make its own copy of the team's files on this computer, so nothing was written. Once the disk has room and Etiuda may write in its folder, Join again; the invitation still works.":"Etiuda nie mogła utworzyć na tym komputerze własnej kopii plików zespołu, więc nic nie zapisano. Gdy na dysku będzie miejsce, a Etiuda będzie mogła zapisywać w swoim folderze, wystarczy ponownie dołączyć; zaproszenie nadal działa.",
  "Teammates on other computers read this folder only if it is shared with them.":"Członkowie zespołu na innych komputerach odczytają ten folder tylko wtedy, gdy zostanie im udostępniony.",
  "OneDrive keeps this folder in sync.":"Ten folder jest synchronizowany przez OneDrive.",
  "This folder is a SharePoint library that OneDrive keeps in sync.":"Ten folder to biblioteka SharePoint synchronizowana przez OneDrive.",
  "Dropbox keeps this folder in sync.":"Ten folder jest synchronizowany przez Dropbox.",
  "Google Drive keeps this folder in sync.":"Ten folder jest synchronizowany przez Dysk Google.",
  "The team's folder is kept somewhere this computer does not have: {KIND}. The path below is the one from the lead's computer, so it may not open here. Once this computer has it too, starting Etiuda again and then opening the invitation finds the folder.":"Folder zespołu znajduje się w miejscu, którego nie ma na tym komputerze: {KIND}. Ścieżka poniżej pochodzi z komputera lidera zespołu, więc może się tu nie otworzyć. Gdy to miejsce pojawi się także na tym komputerze, po ponownym uruchomieniu Etiudy i otwarciu zaproszenia folder się odnajdzie.",
  "OneDrive":"OneDrive",
  "OneDrive for Business":"OneDrive dla firm",
  "Dropbox":"Dropbox",
  "Google Drive":"Dysk Google",
  "a mapped network drive":"zmapowany dysk sieciowy",
  "a shared network folder":"udostępniony folder sieciowy",
  "Ask the team's lead for this invitation's check code, and type its five digits here.":"Proszę zapytać lidera zespołu o kod kontrolny tego zaproszenia i wpisać tu jego pięć cyfr.",
  "Only the real invitation gives this code, so it confirms the invitation comes from the team's own lead.":"Taki kod daje tylko prawdziwe zaproszenie, więc potwierdza, że pochodzi ono od lidera tego zespołu.",
  "Check":"Kod kontrolny",
  "This code does not match this invitation. Ask the lead again before joining.":"Ten kod nie pasuje do tego zaproszenia. Proszę jeszcze raz zapytać lidera przed dołączeniem.",
  "This invitation names a team this desk already knows, but with a different lead's key. It was not used, and nothing changed. Tell the team's lead about it.":"To zaproszenie wskazuje zespół, który to stanowisko już zna, ale z innym kluczem lidera. Nie zostało użyte i nic się nie zmieniło. Proszę powiedzieć o tym liderowi zespołu.",
  "This invitation names a team whose lead was forgotten on this desk. It was not used, and nothing changed. To join, ask from the team's catalog instead.":"To zaproszenie wskazuje zespół, którego lider został na tym stanowisku zapomniany. Nie zostało użyte i nic się nie zmieniło. Aby dołączyć, proszę poprosić o to z katalogu zespołu.",
  "This folder holds another team, or the same team under a different lead's key, so nothing was written. Tell the team's lead about it.":"W tym folderze jest inny zespół albo ten sam zespół z innym kluczem lidera, więc nic nie zapisano. Proszę powiedzieć o tym liderowi zespołu.",
  "The organisation's IT sets this desk's team, so invitations are turned off.":"Zespół tego stanowiska ustawia dział IT organizacji, więc zaproszenia są wyłączone.",
  "The team file in this folder could not be read, so this desk did not join and nothing was written. Let the team's lead know, so they can check the folder.":"Nie udało się odczytać pliku zespołu w tym folderze, więc stanowisko nie dołączyło i nic nie zapisano. Proszę dać znać liderowi zespołu: może sprawdzić ten folder.",
  "Load another catalog file":"Wczytaj inny plik katalogu",
  "Waiting for the lead to open the request":"Prośba czeka, aż lider ją otworzy",
  "The code to read to them appears here as soon as they do.":"Gdy to zrobi, pojawi się tu kod do podania.",
  "Joining {LEAD}'s team":"Dołączanie do zespołu osoby {LEAD}",
  "The team's lead cannot let anyone in for now, as the lead's licence is paused. Nothing needs doing here: once the licence is active again, this desk is let in by itself.":"Lider zespołu nie może na razie nikogo wpuszczać, bo jego licencja jest wstrzymana. Tutaj nic nie trzeba robić: gdy licencja znów będzie aktywna, stanowisko zostanie wpuszczone samo.", /* copywriter, 2026-10-30 00:20 */
  "Waiting for the team's lead to let this desk in. Usually this happens by itself; if a code appears here, read it to the lead.":"Stanowisko czeka, aż lider zespołu je wpuści. Zwykle dzieje się to samo; jeśli pojawi się tu kod, proszę odczytać go liderowi.",
  "Waiting for the team's lead to let this desk in. Nothing more is needed here, and the team's catalogs are already open to work with.":"Stanowisko czeka, aż lider zespołu je wpuści. Tutaj nic więcej nie trzeba robić, a katalogi zespołu są już dostępne do pracy.",
  "Waiting for the team's lead to let this desk in. Nothing more is needed here: the team's catalog opens here by itself once it is.":"Stanowisko czeka, aż lider zespołu je wpuści. Tutaj nic więcej nie trzeba robić: katalog zespołu otworzy się tu sam, gdy to nastąpi.",
  "This invitation has already been used. Ask your lead for a new one.":"To zaproszenie zostało już użyte. Nowe wystawi lider zespołu.",
  "This invitation has expired. Ask your lead for a new one.":"To zaproszenie wygasło. Nowe wystawi lider zespołu.",
  "Team":"Zespół",
  "the lead":"lidera",
  "Read this code to the team's lead":"Podaj ten kod liderowi zespołu",
  "They type it in Studio, and the catalog opens here once they let this desk in.":"Lider wpisze go w Studiu, a po wpuszczeniu stanowiska katalog otworzy się tutaj.",
  "{NAME}, asked at {TIME}":"{NAME}, prośba z {TIME}",
  "Cancel the request":"Wycofaj prośbę",
  "The lead turned the request down":"Lider zespołu odrzucił prośbę",
  "Asking again sends a new request.":"Ponowna prośba trafi do lidera jako nowa.",
  "Ask again":"Poproś ponownie",
  "Hide":"Ukryj",
  "{FILE} was not saved: the team's catalog leaves this desk only sealed, and this desk cannot seal for the team now.":"Nie zapisano pliku {FILE}: katalog zespołu opuszcza to stanowisko tylko zapieczętowany, a to stanowisko nie może teraz pieczętować dla zespołu.",
  "Exported {FILE}, sealed for its team, with {MACROS} in {CARDS}":"Wyeksportowano {FILE}, zapieczętowany dla zespołu: {MACROS}, {CARDS}",
  "You are on the team":"To stanowisko należy do zespołu",
  "Compare this key with the Signing key in the lead's Studio Settings. Every later edition is checked against it.":"Ten klucz powinien być taki sam jak Klucz podpisu w Ustawieniach Studia lidera. Według niego sprawdzane jest każde kolejne wydanie.",
  "It matches":"Zgadza się",
  "It does not match":"Nie zgadza się",
  "Leave this team on this desk?":"Opuścić ten zespół na tym stanowisku?",
  "If the key the team's lead sees does not match this one, this desk forgets the team's lead and every key kept under it, so nothing new from this team reaches it. The catalog in use stays. Joining again takes a new invitation, which shows the lead's key to compare once more.":"Jeśli klucz widoczny u lidera zespołu nie zgadza się z tym, stanowisko zapomni lidera zespołu i wszystkie klucze przechowywane pod nim, więc nic nowego od tego zespołu już tu nie dotrze. Używany katalog zostaje. Ponowne dołączenie wymaga nowego zaproszenia, które znów pokaże klucz lidera do porównania.",
  "{LEAD}'s team":"Zespół osoby {LEAD}",
  "Leave this team":"Opuść ten zespół",
  // The sign-in (board 980): the copywriter's words.
  "Account":"Konto",
  "Who is signed in on this computer, and your name.":"Kto jest zalogowany na tym komputerze, oraz imię agenta.",
  "The language, and how Etiuda starts and closes.":"Język oraz sposób uruchamiania i zamykania Etiudy.",
  "Sign in":"Zaloguj się",
  "Sign in with Microsoft":"Zaloguj się za pomocą konta Microsoft",
  "Sign in with Google":"Zaloguj się przez Google",
  "Microsoft: a work, school or personal account. Google: a Workspace or personal account.":"Microsoft: konto służbowe, szkolne lub osobiste. Google: konto Workspace lub osobiste.",
  "Sign in to Etiuda":"Logowanie do Etiudy",
  "Your seat belongs to your account, so it comes with you to any computer you sign in on, up to three.":"Miejsce w licencji należy do konta, więc przechodzi z nim na każdy komputer, na którym to konto się zaloguje, najwyżej na trzy.",
  "Etiuda for personal use, outside work, needs no sign-in.":"Etiuda do użytku prywatnego, poza pracą, nie wymaga logowania.",
  "Finish signing in in the browser":"Logowanie trwa w przeglądarce",
  "The browser has opened {PROVIDER}'s sign-in page. Etiuda waits here and carries on by itself when you come back.":"W przeglądarce otworzyła się strona logowania {PROVIDER}. Etiuda czeka tutaj i sama przejdzie dalej po powrocie.",
  "Waiting for {PROVIDER}…":"Oczekiwanie na {PROVIDER}…",
  "Open the browser again":"Otwórz przeglądarkę ponownie",
  "Signed in with {PROVIDER}":"Zalogowano przez {PROVIDER}",
  "Account settings":"Ustawienia konta",
  "Signed in. No team yet":"Zalogowano. Jeszcze bez zespołu",
  "Working without a team":"Praca bez zespołu",
  "This computer has its seat, and Etiuda works with its own catalog. Nothing else is needed.":"Ten komputer ma swoje miejsce w licencji, a Etiuda działa na własnym katalogu. Nic więcej nie trzeba.",
  "A team on this licence":"Zespół w tej licencji",
  "This licence has a team on the relay. If the team's lead has admitted this account before, asking to join lets this computer in once the lead's Studio sees the request; otherwise the lead can send an invitation.":"Ta licencja ma zespół na przekaźniku. Jeśli lider zespołu przyjął już to konto, po prośbie o dołączenie ten komputer wejdzie, gdy Studio lidera zobaczy prośbę; w przeciwnym razie lider może wysłać zaproszenie.",
  "This team is no longer offered here, or this computer is already in a team, so nothing was sent.":"Ten zespół nie jest już tu proponowany albo ten komputer należy już do zespołu, więc nic nie wysłano.",
  "The team did not let this computer in. Its lead can send an invitation instead.":"Zespół nie wpuścił tego komputera. Jego lider może zamiast tego wysłać zaproszenie.",
  "No team has admitted this account yet. A lead can invite it by its email address or send a link; the invitation then appears here with one Join.":"Żaden zespół nie przyjął jeszcze tego konta. Lider zespołu może zaprosić je na adres e-mail albo wysłać link; zaproszenie pojawi się wtedy tutaj z jednym przyciskiem Dołącz.",
  "No team has admitted this account yet. Once a lead admits it, the catalog arrives by itself.":"Żaden zespół nie przyjął jeszcze tego konta. Gdy lider zespołu je przyjmie, katalog przyjdzie sam.",
  "This account is signed in, and no team has admitted it yet. Once a lead admits it, the catalog arrives by itself.":"To konto jest zalogowane, ale żaden zespół jeszcze go nie przyjął. Gdy lider zespołu je przyjmie, katalog przyjdzie sam.",
  "Invitation":"Zaproszenie",
  "Join":"Dołącz",
  "{LEAD} invites this account to join {TEAM}.":"{LEAD} zaprasza to konto do zespołu. Zespół: {TEAM}.",
  "Open until {DATE}.":"Ważne do {DATE}.",
  "The invitation could not be taken, so nothing has changed. The team's lead can send a new one.":"Nie udało się przyjąć zaproszenia, więc nic się nie zmieniło. Lider zespołu może wysłać nowe.",
  "Check now":"Sprawdź teraz",
  "Licence for one person":"Licencja dla jednej osoby",
  "Licence":"Licencja",
  "The order page opens in the browser, and the licence bought there is this account's.":"Strona zamówienia otworzy się w przeglądarce, a kupiona tam licencja będzie należeć do tego konta.",
  "A licence is bought for the account signed in here, so signing in comes first.":"Licencję kupuje się dla konta zalogowanego na tym komputerze, więc najpierw trzeba się zalogować.",
  "Buy":"Kup",
  "Buying is not available in this build of Etiuda. A seat comes from a team's lead: the lead's invitation appears here with one Join, and Check now looks for it again.":"W tej wersji Etiudy nie ma zakupu. Miejsce w licencji daje lider zespołu: jego zaproszenie pojawia się tutaj z jednym przyciskiem Dołącz, a przycisk Sprawdź teraz szuka go ponownie.",
  "This account already pays for its licence, so this opens its subscription at {PROVIDER} instead of a second order; seats are added there.":"To konto już płaci za licencję, więc ten przycisk otwiera jego subskrypcję w serwisie {PROVIDER} zamiast drugiego zamówienia; tam dodaje się miejsca.",
  "Add seats…":"Dodaj miejsca…",
  "This account already pays for its licence, and a licence holds one subscription, so no second order is taken.":"To konto już płaci za licencję, a jedna licencja ma jedną subskrypcję, więc drugiego zamówienia nie ma.",
  "A second payment from this account, of {DATE}, is held: the licence it already pays for takes more seats at {PROVIDER} instead, and the second payment is refunded.":"Druga płatność z tego konta, z {DATE}, jest wstrzymana: licencja, za którą to konto już płaci, przyjmuje dodatkowe miejsca w serwisie {PROVIDER}, a druga płatność zostanie zwrócona.",
  "A payment from this account, of {DATE}, is held, because this account's organisation holds its Etiuda licence. It is refunded or attached by hand, and this line then goes by itself.":"Płatność z tego konta, z {DATE}, jest wstrzymana, bo licencję Etiudy dla tego konta ma jego organizacja. Zostanie zwrócona albo przypisana ręcznie, a wtedy ten wiersz sam zniknie.",
  "A payment from this account, of {DATE}, is held for a look by hand. It is refunded or attached to a licence, and this line then goes by itself.":"Płatność z tego konta, z {DATE}, jest wstrzymana do ręcznego sprawdzenia. Zostanie zwrócona albo przypisana do licencji, a wtedy ten wiersz sam zniknie.",
  "{PROVIDER} has not yet confirmed this account's payment of {DATE}. The licence comes by itself once it does.":"{PROVIDER} nie potwierdził jeszcze płatności tego konta z {DATE}. Licencja przyjdzie sama, gdy to nastąpi.",
  "Payment":"Płatność",
  "The sign-in service could not be reached.":"Nie udało się połączyć z usługą logowania.",
  "Nothing changed: this computer is not signed in, and Etiuda works as before.":"Nic się nie zmieniło: ten komputer nie jest zalogowany, a Etiuda działa jak dotąd.",
  "{TEAM} has no free seat just now.":"{TEAM} nie ma teraz wolnego miejsca.",
  "The sign-in worked. This computer takes a seat by itself as soon as one is free; nothing is needed here. The team's lead: {LEAD}.":"Logowanie się powiodło. Ten komputer sam zajmie miejsce, gdy tylko któreś się zwolni; tutaj nie trzeba nic robić. Lider zespołu: {LEAD}.",
  "This account is signed in on three computers already.":"To konto jest już zalogowane na trzech komputerach.",
  "A seat holds three computers. Signing out on one of the others frees its place, and this computer checks again by itself.":"Miejsce w licencji obejmuje trzy komputery. Wylogowanie się na jednym z pozostałych zwolni jego miejsce, a ten komputer sam sprawdzi ponownie.",
  "The sign-in service did not accept this account's sign-in.":"Usługa logowania nie przyjęła logowania tego konta.",
  "Signing in again settles it; until then, Etiuda keeps working with the catalog it has.":"Wystarczy zalogować się ponownie; do tego czasu Etiuda działa dalej na katalogu, który już ma.",
  "The new sign-in did not finish.":"Nowe logowanie nie dobiegło końca.",
  "This computer stays signed in with the account it had. {REASON}":"Ten komputer pozostaje zalogowany kontem, którego używał. {REASON}",
  "This computer is now signed out of the account it had. Signing in, with either account, works once the sign-in service answers, and nothing on this desk is lost meanwhile.":"Ten komputer jest teraz wylogowany z konta, którego używał. Logowanie dowolnym z tych kont będzie możliwe, gdy usługa logowania odpowie, a do tego czasu nic na tym stanowisku nie ginie.",
  "The sign-in service did not confirm the change of account.":"Usługa logowania nie potwierdziła zmiany konta.",
  "This account is already in use on three computers.":"To konto działa już na trzech komputerach.",
  "This account has no Etiuda role in its organisation, so it holds no seat.":"To konto nie ma w swojej organizacji żadnej roli w Etiudzie, więc nie zajmuje miejsca w licencji.",
  "Its IT department can assign one.":"Może ją przydzielić dział IT organizacji.",
  "Your organisation holds the Etiuda licence for this account, so there is nothing to buy here.":"Licencję Etiudy dla tego konta ma organizacja, więc nie ma tu czego kupować.",
  "Your organisation's licence follows the roles its IT department assigns, and this account has none, so it keeps its seat on the licence bought before.":"Licencja organizacji wynika z ról przydzielanych przez jej dział IT, a to konto nie ma żadnej, więc zachowuje miejsce w licencji kupionej wcześniej.",
  "Your organisation has given this account a role, so it uses the organisation's licence; its seat on the licence bought before is not used meanwhile.":"Organizacja przydzieliła temu kontu rolę, więc korzysta ono z licencji organizacji; jego miejsce w licencji kupionej wcześniej nie jest do tego czasu używane.",
  "Signing out on one of them makes room here, and so does a computer left unused for 30 days; then Try again.":"Wylogowanie na jednym z nich zwalnia tu miejsce, podobnie jak komputer nieużywany przez 30 dni; potem wystarczy spróbować ponownie.",
  "This account's organisation has not allowed Etiuda at its sign-in provider.":"Organizacja tego konta nie dopuściła Etiudy u swojego dostawcy logowania.",
  "Your organisation no longer gives this account access to Etiuda.":"Organizacja nie przyznaje już temu kontu dostępu do Etiudy.",
  "This desk keeps its catalog and works with it as before, but new editions from the team no longer reach it. The organisation's IT department can give access again.":"To stanowisko zachowuje swój katalog i działa z nim jak dotąd, ale nowe wydania od zespołu już do niego nie trafiają. Dostęp może przywrócić dział IT organizacji.",
  "This desk keeps its catalog and works with it as before, but new editions from the team no longer reach it. To ask for access: {CONTACT}.":"To stanowisko zachowuje swój katalog i działa z nim jak dotąd, ale nowe wydania od zespołu już do niego nie trafiają. W sprawie dostępu: {CONTACT}.",
  "This account's sign-in needs renewing.":"Logowanie tego konta wymaga odnowienia.",
  "This desk keeps its catalog and works with it as before. Signing in again, under Account, brings the team's new editions back.":"To stanowisko zachowuje swój katalog i działa z nim jak dotąd. Po ponownym zalogowaniu się w części Konto nowe wydania od zespołu znów zaczną docierać.",
  "Its IT department can allow it; another account can be used meanwhile.":"Może to zmienić jej dział IT; do tego czasu można użyć innego konta.",
  "To ask for access: {CONTACT}. Another account can be used meanwhile.":"W sprawie dostępu: {CONTACT}. Do tego czasu można użyć innego konta.",
  "No Etiuda licence has a seat for this account.":"Żadna licencja Etiudy nie ma miejsca dla tego konta.",
  "The sign-in worked. A seat comes from a team's lead, by an invitation to this account's email address or a link, or from a purchase; another account can be used meanwhile.":"Logowanie się powiodło. Miejsce w licencji daje lider zespołu, zaproszeniem na adres e-mail tego konta albo linkiem, albo zakup; tymczasem można użyć innego konta.",
  "The sign-in worked. A seat comes from a team's lead, by an invitation to this account's email address or a link; another account can be used meanwhile.":"Logowanie się powiodło. Miejsce w licencji daje lider zespołu, zaproszeniem na adres e-mail tego konta albo linkiem; tymczasem można użyć innego konta.",
  "The sign-in service cannot be reached just now.":"Usługa logowania jest teraz nieosiągalna.",
  "Etiuda keeps working with the catalog it has. Last checked {WHEN}.":"Etiuda działa dalej na katalogu, który już ma. Ostatnie sprawdzenie: {WHEN}.",
  "service not reached just now":"usługa chwilowo nieosiągalna",
  "The sign-in service cannot be reached just now. Etiuda keeps working with the catalog it has.":"Usługa logowania jest teraz nieosiągalna. Etiuda działa dalej na katalogu, który już ma.",
  "Use another account":"Użyj innego konta",
  "Not signed in":"Bez logowania",
  /* words: copywriter and product designer, a managed computer (decision 49) */
  "Your organisation has not given this account access to Etiuda.":"Organizacja nie przyznała temu kontu dostępu do Etiudy.",
  "Its IT department can: asking them to assign the account is enough.":"Może to zrobić jej dział IT: wystarczy poprosić o przypisanie konta.",
  "To ask for access: {CONTACT}.":"W sprawie dostępu: {CONTACT}.",
  "This computer's profile did not keep this desk's key.":"Profil na tym komputerze nie zachował klucza tego stanowiska.",
  "The organisation's IT department can have the profile keep it.":"Dział IT organizacji może sprawić, że profil będzie go zachowywał.",
  "Everything else on this desk works as before; only signing in waits.":"Wszystko inne na tym stanowisku działa jak dotąd; czeka tylko logowanie.",
  "Everything else on this desk works as before.":"Wszystko inne na tym stanowisku działa jak dotąd.",
  "Etiuda keeps working with the catalog it has.":"Etiuda działa dalej na katalogu, który już ma.",
  /* The desk waits for machine policy to be read, or machine policy names another lead (the copywriter, B6). */
  "Waiting for the organisation's settings":"Oczekiwanie na ustawienia organizacji",
  "Etiuda could not yet read what the organisation's IT set for this computer, so signing in waits. It tries again by itself, every few seconds at first and then once a minute, and everything already on this computer works as before.":"Etiuda nie mogła jeszcze odczytać tego, co dział IT organizacji ustawił dla tego komputera, więc logowanie czeka. Sama ponawia próbę, najpierw co kilka sekund, potem raz na minutę, a wszystko, co już jest na tym komputerze, działa jak dotąd.",
  "Not sent: Etiuda could not yet read what the organisation's IT set for this computer.":"Nie wysłano: Etiuda nie mogła jeszcze odczytać tego, co dział IT organizacji ustawił dla tego komputera.",
  "This invitation waits until Etiuda can read what the organisation's IT set for this computer. Nothing is lost: it can be used again then.":"To zaproszenie czeka, aż Etiuda odczyta, co dział IT organizacji ustawił dla tego komputera. Nic nie ginie: można go wtedy użyć ponownie.",
  "The organisation's IT names another lead for this computer, so nothing this team's lead signs is used here. To ask about it: {CONTACT}.":"Dział IT organizacji wskazał dla tego komputera innego lidera, więc nic, co podpisuje lider tego zespołu, nie jest tu używane. W tej sprawie: {CONTACT}.",
  "The organisation's IT names another lead for this computer, so nothing this team's lead signs is used here. The organisation's IT department can say which team this computer belongs to.":"Dział IT organizacji wskazał dla tego komputera innego lidera, więc nic, co podpisuje lider tego zespołu, nie jest tu używane. Dział IT organizacji może wyjaśnić, do którego zespołu należy ten komputer.",
  /* Another account refused on a managed computer (the copywriter, B1). */
  "This computer stays with the account it has.":"Ten komputer zostaje przy koncie, które już ma.",
  "Your organisation manages the accounts on this computer, so another account cannot sign in here; nothing changed. To ask about it: {CONTACT}.":"Organizacja zarządza kontami na tym komputerze, więc nie można się tu zalogować innym kontem; nic się nie zmieniło. W tej sprawie: {CONTACT}.",
  "Your organisation manages the accounts on this computer, so another account cannot sign in here; nothing changed. The organisation's IT department decides which account is used here.":"Organizacja zarządza kontami na tym komputerze, więc nie można się tu zalogować innym kontem; nic się nie zmieniło. O tym, jakie konto jest tu używane, decyduje dział IT organizacji.",
  "Managed by your organisation.":"Zarządzane przez organizację.",
  "No sign-in is offered on this computer just now; the organisation's IT department decides it.":"Na tym komputerze nie jest teraz dostępne logowanie; decyduje o tym dział IT organizacji.",
  "No sign-in is offered on this computer just now. To ask about it: {CONTACT}.":"Na tym komputerze nie jest teraz dostępne logowanie. W tej sprawie: {CONTACT}.",
  "Your organisation gave this account its seat on this desk. Its IT department decides who uses Etiuda here, and with which account.":"Miejsce w licencji na tym stanowisku przydzieliła temu kontu organizacja. O tym, kto i jakim kontem korzysta tu z Etiudy, decyduje jej dział IT.",
  "Seat held · checked {WHEN}":"Miejsce zajęte · sprawdzono {WHEN}",
  "A shared computer: another person may sign in here, with an account of your organisation.":"Wspólny komputer: może się tu zalogować inna osoba, kontem organizacji.",
  "Set by your organisation":"Ustawione przez organizację",
  "Sync across computers":"Synchronizacja między komputerami",
  "Your catalogs, edits and settings on every computer you sign in on.":"Własne katalogi, zmiany i ustawienia na każdym komputerze, na którym nastąpi zalogowanie.",
  "Only on this computer.":"Tylko na tym komputerze.",
  "Off everywhere. The synced copy is deleted as soon as this computer reaches our service.":"Wyłączona wszędzie. Zsynchronizowana kopia zostanie usunięta, gdy tylko ten komputer połączy się z naszą usługą.",
  "Off on this computer, but not yet everywhere: {CAUSE}, so your other computers have not been told. Etiuda tries again by itself.":"Wyłączona na tym komputerze, ale jeszcze nie wszędzie: {CAUSE}, więc pozostałe komputery nie dostały tej informacji. Etiuda sama ponowi próbę.",
  "your {PROVIDER} account is not signed in here or could not be reached":"konto {PROVIDER} nie jest tu zalogowane albo jest nieosiągalne",
  "the account's folder refused the change":"folder na koncie odrzucił zmianę",
  "the change could not be written to the account's folder":"nie udało się zapisać zmiany w folderze na koncie",
  "Off. Turning it on asks {PROVIDER} to let Etiuda use its folder in this account.":"Wyłączona. Po włączeniu {PROVIDER} poprosi o zgodę na użycie przez Etiudę jej folderu na tym koncie.",
  "Changed on two computers: the newer change is in use, and the older one is kept, so nothing is lost.":"Zmieniono na dwóch komputerach: obowiązuje nowsza zmiana, a starsza jest zachowana, więc nic nie zginęło.",
  "Your catalogs, edits and settings now follow you to every computer you sign in on. You can turn this off in Account.":"Własne katalogi, zmiany i ustawienia będą teraz dostępne na każdym komputerze, na którym nastąpi zalogowanie. Można to wyłączyć w Koncie.",
  "Not available on this account: {REASON}. Everything works on this computer as before.":"Niedostępna na tym koncie: {REASON}. Na tym komputerze wszystko działa jak dotąd.",
  "Sync across computers is not available on this account: {REASON}. Everything works on this computer as before.":"Synchronizacja między komputerami jest niedostępna na tym koncie: {REASON}. Na tym komputerze wszystko działa jak dotąd.",
  "the account's storage is full":"miejsce na koncie jest zapełnione",
  "the account's provider turned down Etiuda's request; it tries again each time Etiuda opens, and about once a day while it stays open":"dostawca konta odrzucił prośbę Etiudy; kolejna próba nastąpi przy każdym uruchomieniu Etiudy i mniej więcej raz na dobę, gdy pozostaje otwarta",
  "this computer cannot keep it locked for this Windows account":"ten komputer nie może przechowywać jej zamkniętej dla tego konta Windows",
  "your organisation has not allowed it; its IT department decides":"organizacja jej nie dopuściła; decyduje o tym dział IT organizacji",
  "the account has no OneDrive":"konto nie ma usługi OneDrive",
  "your organisation has switched off Google Drive for it":"organizacja wyłączyła dla niego Dysk Google",
  "Turn off sync?":"Wyłączyć synchronizację?",
  "Everywhere also deletes the synced copy; each computer keeps its own. A computer signed in on later starts without what is here, unless another computer still syncs it.":"Opcja Wszędzie usuwa też zsynchronizowaną kopię; każdy komputer zachowuje własną. Komputer, na którym logowanie nastąpi później, zacznie bez tego, co jest tutaj, chyba że inny komputer nadal to synchronizuje.",
  "Everywhere":"Wszędzie",
  "This computer":"Ten komputer",
  "Is what is on this desk yours?":"Czy to, co jest na tym stanowisku, należy do tego konta?",
  "Another account was signed in here before, and its settings, edits and own cards are still on this desk. Nothing syncs until you choose.":"Wcześniej było tu zalogowane inne konto, a jego ustawienia, zmiany i własne karty wciąż są na tym stanowisku. Do czasu wyboru nic nie jest synchronizowane.",
  "It is mine":"Dołącz do konta",
  "it joins what your account syncs.":"to, co tu jest, trafi do synchronizacji konta.",
  "Start from my account":"Zacznij od konta",
  "this desk takes your account's content; what is here is set aside, not deleted.":"stanowisko przejmie zawartość konta; obecna zostanie odłożona, nie usunięta.",
  "Waiting for your answer about what is on this desk. Nothing syncs until then.":"Czeka na decyzję w sprawie zawartości tego stanowiska. Do tego czasu nic nie jest synchronizowane.",
  "Decide\u2026":"Zdecyduj\u2026",
  "Syncing now, with what was already on this desk.":"Synchronizacja trwa, razem z tym, co już było na tym stanowisku.",
  "Starting from your account did not finish, and nothing was lost. What could not be put back is kept on this computer, in Etiuda's \"Set aside\" folder, and is never uploaded. The question about what is on this desk still waits for your answer.":"Nie udało się dokończyć rozpoczęcia od konta, ale nic nie zginęło. To, czego nie dało się przywrócić, jest zachowane na tym komputerze, w folderze Etiudy o nazwie Set aside, i nigdy nie jest wysyłane. Pytanie o zawartość tego stanowiska nadal czeka na odpowiedź.",
  "This desk now has your account's content. What was here before is kept on this computer, in Etiuda's \"Set aside\" folder, and is never uploaded.":"To stanowisko ma teraz zawartość tego konta. Poprzednia zawartość jest zachowana na tym komputerze, w folderze Etiudy o nazwie Set aside, i nigdy nie jest wysyłana.",
  "That folder is no longer where it was kept, so nothing was opened.":"Tego folderu nie ma już tam, gdzie go zachowano, więc niczego nie otwarto.",
  "This computer did not open the folder just now. Pressing the button again tries again.":"Ten komputer nie otworzył teraz folderu. Można spróbować ponownie, klikając przycisk jeszcze raz.",
  "Your organisation has not turned this on.":"Organizacja nie włączyła tej funkcji.",
  "Paused since {DATE}. It resumes when this computer reaches our service.":"Wstrzymana od {DATE}. Zostanie wznowiona, gdy komputer połączy się z naszą usługą.",
  "Sync is full, so new changes stay on this computer until something is removed.":"Miejsce na synchronizację jest pełne, więc nowe zmiany zostają na tym komputerze, dopóki czegoś się nie usunie.",
  "Waiting for a seat. Sync resumes when this account holds one again, and nothing on this computer is lost.":"Oczekiwanie na miejsce w licencji. Synchronizacja zostanie wznowiona, gdy to konto znów je otrzyma; na tym komputerze nic nie ginie.",
  "this computer cannot reach the {PROVIDER} account":"ten komputer nie może połączyć się z kontem {PROVIDER}",
  "this computer cannot reach our service":"ten komputer nie może połączyć się z naszą usługą",
  "our service is busy":"nasza usługa jest teraz zajęta",
  "our service turned down this computer's last request":"nasza usługa odrzuciła ostatnią prośbę tego komputera",
  "Not syncing just now: {REASON}. Sync tries again by itself, and nothing on this computer is lost.":"Synchronizacja chwilowo nie działa: {REASON}. Sama ponowi próbę, a na tym komputerze nic nie ginie.",
  "Not syncing just now: {REASON}. Sync tries again at {TIME}, and nothing on this computer is lost.":"Synchronizacja chwilowo nie działa: {REASON}. Ponowi próbę o {TIME}, a na tym komputerze nic nie ginie.",
  "Not syncing: {REASON}. Sync tries again each time Etiuda opens, and about once a day while it stays open; nothing on this computer is lost.":"Synchronizacja nie działa: {REASON}. Ponowi próbę przy każdym uruchomieniu Etiudy i mniej więcej raz na dobę, gdy pozostaje otwarta; na tym komputerze nic nie ginie.",
  "Not syncing while signing in on this computer is refused. Sync runs once signing in works, and nothing on this computer is lost.":"Synchronizacja nie działa, dopóki logowanie na tym komputerze jest odrzucane. Ruszy, gdy logowanie się powiedzie, a na tym komputerze nic nie ginie.",
  "Your organisation has turned this on, and {PROVIDER} has not yet let Etiuda use its folder in this account.":"Organizacja włączyła tę funkcję, ale konto {PROVIDER} nie zezwala jeszcze Etiudzie na użycie jej folderu na tym koncie.",
  "Allow\u2026":"Zezwól\u2026",
  "Turned off everywhere from another computer. Your organisation keeps sync on for this computer, so a new synced copy starts from what is on it.":"Wyłączona wszędzie z innego komputera. Organizacja utrzymuje synchronizację na tym komputerze, więc nowa zsynchronizowana kopia powstaje z jego zawartości.",
  "Connecting for the first time.":"Trwa pierwsze łączenie.",
  "Checking for changes.":"Trwa sprawdzanie zmian.",
  "Not connected yet. Sync starts once this computer reaches our service.":"Jeszcze bez połączenia. Synchronizacja ruszy, gdy komputer połączy się z naszą usługą.",
  "Sync starts again in a moment.":"Synchronizacja wznowi się za chwilę.",
  "Not syncing just now. Sync resumes when this computer reaches our service, and nothing on this computer is lost.":"Synchronizacja chwilowo nie działa. Zostanie wznowiona, gdy komputer połączy się z naszą usługą, a na tym komputerze nic nie ginie.",
  "Sign-in":"Logowanie",
  "{PROVIDER} · work accounts of the organisation":"{PROVIDER} · konta służbowe organizacji",
  "{PROVIDER} · work accounts":"{PROVIDER} · konta służbowe",
  "{PROVIDER} · accounts the organisation allows":"{PROVIDER} · konta dopuszczone przez organizację",
  /* words: copywriter */
  "Withdrawing the request to join":"Wycofywanie prośby o dołączenie",
  "This computer is signed out. Its place among the account's three computers is freed by itself as soon as the sign-in service can be reached.":"Ten komputer jest wylogowany. Jego miejsce wśród trzech komputerów konta zwolni się samo, gdy tylko usługa logowania będzie osiągalna.",
  "Preview only.":"Tylko podgląd.",
  "Sign-in is not set up yet, so nothing here is sent.":"Logowanie nie jest jeszcze uruchomione, więc nic stąd nie zostanie wysłane.",
  "Sign-in is not set up yet, so nothing was sent. This is a preview.":"Logowanie nie jest jeszcze uruchomione, więc nic nie wysłano. To tylko podgląd.",
  "Copied":"Skopiowano",
  "Browser did not open?":"Przeglądarka się nie otworzyła?",
  "Paste this link into a browser on this computer.":"Łącze można wkleić w przeglądarkę na tym komputerze.",
  "Signing in needs a keyring, and none is open on this computer.":"Logowanie wymaga magazynu kluczy, a na tym komputerze żaden nie jest otwarty.",
  "Installing or unlocking GNOME Keyring or KDE Wallet, then reopening Etiuda, lets this computer sign in.":"Po zainstalowaniu lub odblokowaniu GNOME Keyring albo Portfela KDE i ponownym otwarciu Etiudy ten komputer będzie mógł się zalogować.",
  "Signing in brings your seat, and a team that has admitted you, to this computer. Etiuda for personal use, outside work, needs no sign-in.":"Logowanie przenosi na ten komputer miejsce w licencji i zespół, który przyjął to konto. Etiuda do użytku prywatnego, poza pracą, nie wymaga logowania.",
  "What happens":"Co się stanie",
  "The browser opens the sign-in page":"W przeglądarce otwiera się strona logowania",
  "You choose your account there":"Tam wybiera się konto",
  "Etiuda carries on here by itself":"Etiuda sama przechodzi dalej",
  "No licence key to keep":"Bez klucza licencji do pilnowania",
  "Signing in":"Logowanie",
  "The desk opens as it is, and Sign in stays in the bar at the top for later.":"Stanowisko otworzy się bez zmian, a przycisk Zaloguj się zostaje na pasku u góry na później.",
  "Led by {LEAD}":"Prowadzi {LEAD}",
  "No team yet":"Jeszcze bez zespołu",
  "Seat":"Miejsce w licencji",
  "On up to three computers; this is one of them.":"Na najwyżej trzech komputerach; to jeden z nich.",
  "Last checked":"Ostatnie sprawdzenie",
  "Sign out":"Wyloguj się",
  "This desk signs in with a Microsoft or Google account to hold its seat, and has the sign-in checked at etiuda.dev. The licence service keeps the account's name and address, and shows them only to the leads and administrator of the licence it asks to join.":"To stanowisko loguje się kontem Microsoft lub Google, aby zajmować swoje miejsce w licencji, i zleca sprawdzenie logowania na etiuda.dev. Usługa licencji przechowuje imię i nazwisko oraz adres e-mail z tego konta i pokazuje je tylko liderom i administratorowi licencji, do której konto prosi o dołączenie.",
  "This desk signs in with a Microsoft or Google account to hold its seat, and has the sign-in checked at etiuda.dev. The leads and administrator of the licence it joins see the account's name and address.":"To stanowisko loguje się kontem Microsoft lub Google, aby zajmować swoje miejsce w licencji, i zleca sprawdzenie logowania na etiuda.dev. Liderzy i administrator licencji, do której dołącza, widzą imię i nazwisko oraz adres e-mail z tego konta.",
  "Signing out ends this computer's sign-in and frees its place among the account's three; the seat stays the account's. The team's catalog and personal cards stay on the computer.":"Wylogowanie kończy logowanie na tym komputerze i zwalnia jego miejsce wśród trzech komputerów konta; miejsce w licencji zostaje przy koncie. Katalog zespołu i własne karty zostają na komputerze.",
  "today, {TIME}":"dziś, {TIME}",
  "No seat is free on the organisation's licence just now.":"W licencji organizacji nie ma teraz wolnego miejsca.",
  // the copywriter's, the four lines below
  "The organisation's Etiuda licence seats the people its leads add.":"Licencja Etiudy tej organizacji daje miejsce osobom, które dodają jej liderzy.",
  "The team's lead invites this account by its email address, and the invitation appears here with one Join; a link from the lead, opened on this computer, does the same.":"Lider zespołu zaprasza to konto na jego adres e-mail, a zaproszenie pojawia się tutaj z jednym przyciskiem Dołącz; to samo daje link od lidera otwarty na tym komputerze.",
  "{PROVIDER} does not vouch for this account's address, so {LEAD}, the team's lead, confirms it next; this computer then takes its seat by itself. Nothing is needed here meanwhile.":"{PROVIDER} nie poświadcza adresu tego konta, więc teraz potwierdza to lider zespołu: {LEAD}. Potem ten komputer sam zajmie miejsce; tutaj nic nie trzeba robić.",
  "This account is invited to join {TEAM} by its lead.":"Lider zaprasza to konto do zespołu. Zespół: {TEAM}.",
  "{PROVIDER} does not vouch for this account's address, so the team's lead confirms it next; this computer then takes its seat by itself. Nothing is needed here meanwhile.":"{PROVIDER} nie poświadcza adresu tego konta, więc teraz potwierdza to lider zespołu. Potem ten komputer sam zajmie miejsce; tutaj nic nie trzeba robić.",
  "This account's own trial is running.":"Trwa własny okres próbny tego konta.",
  "Fourteen days, until {DATE}, on up to three computers. A lead can add this account at any time, without waiting for the trial to end.":"Czternaście dni, do {DATE}, najwyżej na trzech komputerach. Lider może dodać to konto w każdej chwili, bez czekania na koniec okresu próbnego.",
  "The sign-in worked. This computer takes a seat by itself as soon as one is free; nothing is needed here.":"Logowanie się powiodło. Ten komputer sam zajmie miejsce, gdy tylko któreś się zwolni; tutaj nie trzeba nic robić.",
  "This desk's seat is due for renewal.":"Miejsce w licencji dla tego stanowiska czeka na odnowienie.",
  "It renews by itself the next time the sign-in service answers. Everything on this desk works as before.":"Odnowi się samo, gdy usługa logowania znów odpowie. Wszystko na tym stanowisku działa jak dotąd.",
  "This computer could not renew its sign-in by itself.":"Ten komputer nie zdołał sam odnowić logowania.",
  "Signing in again renews it.":"Wystarczy zalogować się ponownie.",
  "The sign-in did not finish.":"Logowanie nie zostało dokończone.",
  "Nothing changed, and signing in can be tried again.":"Nic się nie zmieniło, a logowanie można ponowić.",
  "This desk will leave this team.":"To stanowisko opuści ten zespół.",
  "After leaving a team, this desk can join it again with a new invitation from its lead.":"Po opuszczeniu zespołu to stanowisko może do niego wrócić z nowym zaproszeniem od lidera.",
  "This desk left this team on {DATE}. Join it again?":"To stanowisko opuściło ten zespół {DATE}. Dołączyć do niego ponownie?",
  "This team no longer includes this desk.":"To stanowisko nie należy już do tego zespołu.",
  "The organisation's IT sets this desk's team.":"Zespół tego stanowiska ustawia dział IT organizacji.",
  "{LEAD}'s team no longer includes this desk":"To stanowisko nie należy już do zespołu osoby {LEAD}",
  "The team no longer includes this desk":"To stanowisko nie należy już do zespołu",
  "Once the team's lead lets this desk in again, the catalog opens here by itself.":"Gdy lider zespołu ponownie wpuści to stanowisko, katalog otworzy się tutaj sam.",
  /* Claudette's words, 2026-10-27. */
  "The relay says this desk is no longer on the team, so nothing new reaches it. The catalogs on it stay as they are. Once the team's lead lets this desk in again, the catalog opens here by itself.":"Według przekaźnika to stanowisko nie należy już do zespołu, więc nic nowego do niego nie dociera. Katalogi na nim zostają bez zmian. Gdy lider zespołu ponownie wpuści to stanowisko, katalog otworzy się tutaj sam.",
  /* Claudette's words, 2026-10-27. */
  "This invitation was made before the team's lead removed this desk, so it no longer works. The lead can make a new one.":"To zaproszenie powstało, zanim lider zespołu wyłączył to stanowisko z zespołu, więc już nie działa. Nowe może wystawić lider zespołu.",
  /* Claudette's words, 2026-10-27. */
  "The request is being withdrawn. The relay takes the withdrawal shortly, and until then the team's lead may still see the request.":"Prośba jest wycofywana. Przekaźnik wkrótce to odnotuje, a do tego czasu lider zespołu może ją jeszcze widzieć.",
  /* Claudette's words, 2026-10-27. */
  "The relay no longer holds this request, so it could not be withdrawn there. The team's lead may still see it until it expires. To join after all, a new invitation from the team's lead is needed.":"Przekaźnik nie przechowuje już tej prośby, więc nie dało się jej tam wycofać. Lider zespołu może ją jeszcze widzieć, dopóki nie wygaśnie. Aby jednak dołączyć, potrzebne jest nowe zaproszenie od lidera zespołu.",
  /* Claudette's words, 2026-10-27. */
  "The request is being withdrawn. The team's relay is read-only until it is renewed, so it takes the withdrawal then, and until that the team's lead may still see the request. If the relay clears the team's copy first, the request goes with it.":"Prośba jest wycofywana. Przekaźnik zespołu do czasu odnowienia działa tylko do odczytu, więc odnotuje wycofanie dopiero wtedy, a do tego czasu lider zespołu może ją jeszcze widzieć. Jeśli przekaźnik wcześniej usunie kopię zespołu, prośba zniknie razem z nią.",
  "The request is withdrawn: the team's lead no longer sees it. This desk keeps what the invitation gave it, so Ask again sends the request anew without a new link.":"Prośba została wycofana: lider zespołu już jej nie widzi. Stanowisko zachowuje to, co dało mu zaproszenie, więc przycisk Poproś ponownie wyśle ją jeszcze raz bez nowego odnośnika.",
  /* Claudette's words, 2026-10-27. */
  "This desk has left the team and keeps nothing the invitation gave it.":"To stanowisko opuściło zespół i nie ma już niczego, co dało mu zaproszenie.",
  "The key shown did not match the team's lead's, so this desk does not trust it and keeps nothing the invitation gave it.":"Pokazany klucz nie zgadzał się z kluczem lidera zespołu, więc to stanowisko mu nie ufa i nie ma już niczego, co dało mu zaproszenie.",
  "Its request is being withdrawn; the relay takes the withdrawal shortly, and until then the team's lead may still see it.":"Prośba jest wycofywana; przekaźnik wkrótce to odnotuje, a do tego czasu lider zespołu może ją jeszcze widzieć.",
  "Its request is being withdrawn. The team's relay is read-only until it is renewed, so it takes the withdrawal then, and until that the team's lead may still see the request; if the relay clears the team's copy first, the request goes with it.":"Prośba jest wycofywana. Przekaźnik zespołu do czasu odnowienia działa tylko do odczytu, więc odnotuje wycofanie dopiero wtedy, a do tego czasu lider zespołu może ją jeszcze widzieć; jeśli przekaźnik wcześniej usunie kopię zespołu, prośba zniknie razem z nią.",
  "Its request is withdrawn, and the team's lead no longer sees it.":"Prośba została wycofana i lider zespołu już jej nie widzi.",
  /* Claudette's words, 2026-10-27 21:11. */
  "The relay no longer holds its request, so it could not be withdrawn there; the team's lead may still see it until it expires.":"Przekaźnik nie przechowuje już tej prośby, więc nie dało się jej tam wycofać; lider zespołu może ją jeszcze widzieć, dopóki nie wygaśnie.",
  "To join, a new invitation from the team's lead is needed.":"Aby dołączyć, potrzebne jest nowe zaproszenie od lidera zespołu.",
  /* Claudette's words, 2026-10-27 01:23. */
  "The catalogs on this desk stay as they are. A new invitation from the team's lead lets it in again.":"Katalogi na tym stanowisku zostają bez zmian. Nowe zaproszenie od lidera zespołu wpuści je ponownie.",
  /* Claudette's words, 2026-11-19 (board 1014): joining, already on a team, one-time told notice, Team catalog, and Private mark. */
  "Once this desk joins, the team's lead can see the catalogs it uses, their content included, and this desk's changes to them. The lead's Studio can take a copy of any of them at any time, without asking here: of a team catalog, one the lead publishes to the team, sealed for the team; of a personal catalog, any other on this desk, sealed for the lead alone. A personal catalog can be marked Private in the Library, under Catalog & data; the lead then sees nothing of it, not even that it is used. The lead's Studio lists this desk by name, unless the organisation turns names off, with the catalog and edition it uses unless that catalog is Private, and the period counted, and goes on listing it if it falls quiet. The desk's own counts go to the lead sealed, none of them from a Private catalog, and Studio shows them in the team's totals.":"Po dołączeniu lider zespołu widzi katalogi, których używa to stanowisko, razem z ich treścią, oraz zmiany wprowadzone w nich na tym stanowisku. Studio lidera może w każdej chwili, bez pytania tutaj, pobrać kopię każdego z nich: katalogu zespołowego, czyli publikowanego przez lidera dla zespołu, zapieczętowaną dla zespołu, a katalogu osobistego, czyli każdego innego na tym stanowisku, zapieczętowaną wyłącznie dla lidera. Katalog osobisty można oznaczyć jako Prywatny w Bibliotece, w części Katalog i dane; lider nie widzi wtedy nic z niego, nawet tego, że jest używany. Studio lidera wymienia to stanowisko z nazwy, chyba że organizacja wyłączy nazwy, razem z używanym katalogiem i jego wydaniem, o ile nie jest to katalog prywatny, oraz z okresem zliczania, i wymienia je dalej, gdy przestanie się odzywać. Własne dane stanowiska trafiają do lidera zapieczętowane, bez żadnych danych z katalogu prywatnego, a Studio pokazuje je w sumach zespołu.",
  "The team's lead can see the catalogs this desk uses, their content included, and this desk's changes to them. The lead's Studio can take a copy of any of them at any time, without asking here: of a team catalog, one the lead publishes to the team, sealed for the team; of a personal catalog, any other on this desk, sealed for the lead alone. A personal catalog can be marked Private in the Library, under Catalog & data; the lead then sees nothing of it, not even that it is used. The lead's Studio lists this desk by name, unless the organisation turns names off, with the catalog and edition it uses unless that catalog is Private, and the period counted, and goes on listing it if it falls quiet. The desk's own counts go to the lead sealed, none of them from a Private catalog, and Studio shows them in the team's totals.":"Lider zespołu widzi katalogi, których używa to stanowisko, razem z ich treścią, oraz zmiany wprowadzone w nich na tym stanowisku. Studio lidera może w każdej chwili, bez pytania tutaj, pobrać kopię każdego z nich: katalogu zespołowego, czyli publikowanego przez lidera dla zespołu, zapieczętowaną dla zespołu, a katalogu osobistego, czyli każdego innego na tym stanowisku, zapieczętowaną wyłącznie dla lidera. Katalog osobisty można oznaczyć jako Prywatny w Bibliotece, w części Katalog i dane; lider nie widzi wtedy nic z niego, nawet tego, że jest używany. Studio lidera wymienia to stanowisko z nazwy, chyba że organizacja wyłączy nazwy, razem z używanym katalogiem i jego wydaniem, o ile nie jest to katalog prywatny, oraz z okresem zliczania, i wymienia je dalej, gdy przestanie się odzywać. Własne dane stanowiska trafiają do lidera zapieczętowane, bez żadnych danych z katalogu prywatnego, a Studio pokazuje je w sumach zespołu.",
  "What the team's lead can see has changed.":"Zmieniło się to, co widzi lider zespołu.",
  "From now on, the team's lead can see every catalog this desk uses, their content included, and this desk's changes to them: personal catalogs as well as team catalogs. A personal catalog can be marked Private in the Library, under Catalog & data; the lead then sees nothing of it, not even that it is used. Nothing of this desk's personal catalogs has been sent yet.":"Od teraz lider zespołu widzi każdy katalog, którego używa to stanowisko, razem z jego treścią, oraz zmiany wprowadzone w nim na tym stanowisku: nie tylko katalogi zespołowe, lecz także osobiste. Katalog osobisty można oznaczyć jako Prywatny w Bibliotece, w części Katalog i dane; lider nie widzi wtedy nic z niego, nawet tego, że jest używany. Z katalogów osobistych tego stanowiska nic jeszcze nie zostało wysłane.",
  "Understood":"Rozumiem",
  "Team catalog":"Katalog zespołowy",
  "Private":"Prywatny",
  "The team's lead sees nothing of this catalog: not its name or edition, its content, this desk's changes to it, nor that it is used here. Marking it withdraws what this desk had shared of it; what the lead's Studio already received of it stays there.":"Lider zespołu nie widzi nic z tego katalogu: ani nazwy i wydania, ani treści, ani zmian wprowadzonych w nim na tym stanowisku, ani tego, że jest tu używany. Oznaczenie wycofuje to, co stanowisko z niego udostępniło; to, co Studio lidera już z niego otrzymało, tam zostaje.",
  "This catalog is no longer private: the team's lead can now see it, its content and this desk's changes to it.":"Ten katalog nie jest już prywatny: lider zespołu może teraz widzieć ten katalog, jego treść i zmiany wprowadzone w nim na tym stanowisku.",
  "Newest edition {E}, published {WHEN}. The team's news: {AGE}.":"Najnowsze wydanie {E}, opublikowane {WHEN}. Wiadomość zespołu: {AGE}.",
  "This desk waits for the team's lead to publish a first edition.":"To stanowisko czeka na pierwsze wydanie od lidera zespołu.",
  /* Claudette's words, 2026-11-11, board 989: a network that refuses the relay's push socket, on the team's row and its hover. */
  "On this network the team's updates arrive about once a minute, not live.":"W tej sieci aktualizacje zespołu docierają mniej więcej co minutę, a nie na bieżąco.",
  "This network does not let the live connection to the relay through, so Etiuda asks the relay about once a minute instead. Nothing is lost, and nothing needs doing.":"Ta sieć nie przepuszcza połączenia na żywo z przekaźnikiem, więc Etiuda pyta przekaźnik mniej więcej co minutę. Nic nie ginie i nic nie trzeba robić.",
  /* Claudette's words, 2026-11-17, a team file naming a relay this build does not use: one sentence and the next, on the row whole. */
  "The team file of {TEAM} names a relay this Etiuda does not use, so this desk does not follow it: it keeps its team, its catalog and its connection as they were, and sends nothing there.":"{TEAM} wskazuje w swoim pliku przekaźnik, z którego ta Etiuda nie korzysta, więc to stanowisko za nim nie podąża: zachowuje zespół, katalog i połączenie bez zmian i niczego tam nie wysyła.",
  "If the team moves back, nothing is needed; otherwise a new invitation from the team's lead is.":"Jeśli zespół wróci na poprzedni przekaźnik, nic nie trzeba robić; w przeciwnym razie potrzebne jest nowe zaproszenie od lidera zespołu.",
  "{TEAM} worked through a shared folder, which Etiuda no longer follows: its catalog stays on this computer as it is, and a new invitation from the team's lead brings the team back.":"{TEAM} korzysta ze wspólnego folderu, którego Etiuda już nie obsługuje: katalog tego zespołu zostaje na tym komputerze bez zmian, a nowe zaproszenie od lidera zespołu przywróci zespół.",
  "What this desk had not yet sent to the shared folder stays on this computer, unsent, in the folder {FOLDER}.":"To, czego to stanowisko nie zdążyło wysłać do wspólnego folderu, zostaje na tym komputerze, niewysłane, w folderze {FOLDER}.",
  "Another catalog of the team has a newer edition.":"Inny katalog zespołu ma nowsze wydanie.",
  "Other catalogs of the team with a newer edition: {N}.":"Inne katalogi zespołu z nowszym wydaniem: {N}.",
  "At the request of the team lead's Studio, a copy of the catalog in use here was sent to the team.":"Na prośbę Studia lidera zespołu przesłano zespołowi kopię katalogu używanego na tym stanowisku.",
  "At the request of the team lead's Studio, a copy of the catalog in use here was sent to the team's lead alone.":"Na prośbę Studia lidera zespołu przesłano kopię katalogu używanego na tym stanowisku wyłącznie liderowi zespołu.",
  /* Claudette's words, 2026-11-08: said where a catalog is marked private or the lead's switch goes off. */
  "The copy of this catalog that went to the team has been withdrawn. What the team's lead has already opened cannot be taken back.":"Kopia tego katalogu przesłana zespołowi została wycofana. Tego, co lider zespołu już otworzył, nie da się odebrać.",
  "The team's relay is due for renewal":"Przekaźnik zespołu czeka na odnowienie",
  "It fell due on {DATE}. Everything works as before until {READONLY}; after that the catalogs on this desk stay as they are, but nothing new passes between this desk and the team until the relay is renewed. The team's lead renews it in Studio; nothing is needed here.":"Termin odnowienia minął dnia {DATE}. Do dnia {READONLY} wszystko działa jak dotąd; potem katalogi na tym stanowisku zostaną bez zmian, ale do czasu odnowienia nic nowego nie przejdzie już między stanowiskiem a zespołem. Przekaźnik odnawia lider zespołu w Studiu; tutaj nic nie trzeba robić.",
  "The team's relay is read-only until renewed":"Przekaźnik zespołu działa tylko do odczytu do czasu odnowienia",
  "The team's shared folder is read-only where {FILE} goes, so this desk keeps the change and tries again at each check.":"Wspólny folder zespołu jest tylko do odczytu w miejscu, gdzie ma trafić {FILE}, więc to stanowisko zachowuje zmianę i próbuje ponownie przy każdym sprawdzeniu.",
  /* The copywriter's words: the copy the relay channel kept beside the team's edition. */
  "{FILE} was not sent to the team: the team's edition had changed in the meantime, from another computer or from an earlier send of this one. It is kept beside the catalog in the team's folder on this computer, and can be opened and published again if it is the edition wanted.":"Pliku {FILE} nie wysłano zespołowi: wydanie zespołu zmieniło się w międzyczasie, z innego komputera albo po wcześniejszym wysłaniu z tego. Plik zostaje obok katalogu w folderze zespołu na tym komputerze; można go otworzyć i opublikować ponownie, jeśli to właściwe wydanie.",
  "More files kept the same way: {N}.":"Więcej plików zachowanych w ten sam sposób: {N}.",
  "{FILE} is marked read-only in the team's shared folder, so this desk keeps the change and tries again at each check.":"Plik {FILE} we wspólnym folderze zespołu jest oznaczony jako tylko do odczytu, więc to stanowisko zachowuje zmianę i próbuje ponownie przy każdym sprawdzeniu.",
  "The catalogs on this desk stay as they are and work as before; nothing new passes between this desk and the team.":"Katalogi na tym stanowisku zostają bez zmian i działają jak dotąd; nic nowego nie przechodzi już między stanowiskiem a zespołem.",
  "The relay keeps the team's copy until {DATE}.":"Przekaźnik przechowuje kopię zespołu do dnia {DATE}.",
  "The team's lead renews it in Studio.":"Odnowić go może lider zespołu w Studiu.",
  "The team's relay has stopped":"Przekaźnik zespołu jest wstrzymany",
  "The licence or trial it came with has ended.":"Licencja albo okres próbny, z którym działał, dobiegły końca.",
  "The catalogs on this desk stay as they are and work as before.":"Katalogi na tym stanowisku zostają bez zmian i działają jak dotąd.",
  "The team's lead can start it again from Studio with a licence.":"Lider zespołu może go uruchomić ponownie w Studiu, z licencją.",
  "The relay no longer holds the team's copy":"Przekaźnik nie przechowuje już kopii zespołu",
  "If the team's lead renews the licence, this desk rejoins by itself while it is still in the team; nothing is needed here.":"Jeśli lider zespołu odnowi licencję, to stanowisko dołączy samo, o ile nadal należy do zespołu; tutaj nic nie trzeba robić.",
  /* Claudette's words, 2026-10-27 */
  "The relay does not know the team just now":"Przekaźnik nie zna teraz tego zespołu",
  "The catalogs on this desk stay as they are and work as before; nothing new arrives through the relay. Either the relay cleared the team's copy after its licence ended, or the team has not reached the relay yet.":"Katalogi na tym stanowisku zostają bez zmian i działają jak dotąd; przez przekaźnik nie przychodzi nic nowego. Przekaźnik usunął kopię zespołu po wygaśnięciu licencji albo zespół jeszcze do niego nie dotarł.",
  "When the team is back on the relay, this desk follows by itself while it is still in the team; nothing is needed here.":"Gdy zespół wróci na przekaźnik, to stanowisko dołączy samo, o ile nadal należy do zespołu; tutaj nic nie trzeba robić.",
  "This team's lead key was handed to two different new keys at once, so this desk follows neither.":"Klucz lidera tego zespołu przekazano jednocześnie dwóm różnym nowym kluczom, więc stanowisko nie podąża za żadnym z nich.",
  "The catalogs on it stay as they are. Tell the team's lead about it.":"Katalogi na nim zostają bez zmian. Proszę powiedzieć o tym liderowi zespołu.",
  "Someone has used this team's old lead key to hand the team to another key as well, so that key is evidently in someone else's hands.":"Ktoś użył starego klucza lidera tego zespołu, by przekazać zespół także innemu kluczowi, więc ten klucz najwyraźniej jest w cudzych rękach.",
  "This desk stays with the key it already follows, and the catalogs on it stay as they are. Tell the team's lead about it.":"Stanowisko zostaje przy kluczu, za którym już podąża, a katalogi na nim zostają bez zmian. Proszę powiedzieć o tym liderowi zespołu.",
  "While this desk was switched off, the team moved to a new key and its keys were secured anew, so this desk cannot open what comes next.":"Gdy to stanowisko było wyłączone, zespół przeszedł pod nowy klucz, a jego klucze zabezpieczono od nowa, więc stanowisko nie otworzy tego, co przychodzi teraz.",
  "It sends nothing new to the team, and everything on this computer stays as it is. To join, a new invitation from the team's lead is needed.":"Nie wysyła niczego nowego do zespołu, a wszystko na tym komputerze zostaje bez zmian. Aby dołączyć, potrzebne jest nowe zaproszenie od lidera zespołu.",
  "This team now works from a shared folder. The team's lead can say which one; once it is open here with Open a folder, everything carries on as before.":"Ten zespół pracuje teraz ze wspólnego folderu. Lider zespołu może wskazać, z którego; gdy zostanie on otwarty tutaj przez Otwórz folder, wszystko będzie działać jak dotąd.",
  "Open a folder":"Otwórz folder",
  "That folder holds no files of this team, so nothing was changed. The team's lead can say which folder it is.":"W tym folderze nie ma plików tego zespołu, więc nic nie zmieniono. Lider zespołu może wskazać właściwy folder.",
  "The team file in that folder is not signed by this team's lead, so nothing was changed. Tell the team's lead about it.":"Plik zespołu w tym folderze nie jest podpisany przez lidera tego zespołu, więc nic nie zmieniono. Proszę powiedzieć o tym liderowi zespołu.",
  "The team file in that folder is older than the one this desk holds, so nothing was changed. The team's lead can say which folder is the current one.":"Plik zespołu w tym folderze jest starszy niż ten, który ma to stanowisko, więc nic nie zmieniono. Lider zespołu może wskazać aktualny folder.",
  "Choose the team's shared folder":"Wybierz wspólny folder zespołu",
  "Studio's signing key":"Klucz podpisu Studia",
  "A desk's key":"Klucz stanowiska",
  "Catalog files in {FOLDER} appear here: load one from anywhere else, or put it in the folder.":"Tu pojawią się pliki katalogów z {FOLDER}: wystarczy wczytać plik z innego miejsca albo umieścić go w tym folderze.",
  "Next replies":"Kolejne odpowiedzi",
  "Commits the firm":"Zobowiązuje firmę",
  "Does not commit the firm":"Nie zobowiązuje firmy",
  "Commitment":"Zobowiązanie",
  "Commitment: the customer can hold the firm to this.":"Zobowiązanie: klient może trzymać firmę za słowo.",
  "the catalog's":"z katalogu",
  "yours":"własna",
  "yours; the catalog's has changed":"własna; lista z katalogu się zmieniła",
  "added":"dodana",
  "Take it off the list":"Usuń z listy",
  "Your list":"Własna lista",
  "Replaces the catalog's on this desk, and travels in your exports.":"Zastępuje listę z katalogu na tym stanowisku i trafia do eksportów.",
  "Back to the catalog's":"Wróć do listy z katalogu",
  "The catalog's list":"Lista z katalogu",
  "Change anything and this card follows your own list instead.":"Po każdej zmianie ta karta pójdzie za własną listą.",
  "The catalog's list has changed since you made yours: {LIST}":"Lista z katalogu zmieniła się od utworzenia własnej: {LIST}",
  "The catalog's list: {LIST}":"Lista z katalogu: {LIST}",
  "Add a reply":"Dodaj odpowiedź",
  "Find a card to add":"Znajdź kartę do dodania",
  "a card's title":"tytuł karty",
  "Yours, not the catalog's.":"Pieczątka własna, nie z katalogu.",
  "The catalog does not stamp this card; your desk and your exports will.":"Katalog nie oznacza tej karty pieczątką; to stanowisko i jego eksporty tak.",
  "The catalog stamps this card.":"Katalog oznacza tę kartę pieczątką.",
  "You took the stamp off on this desk. Reset puts it back.":"Na tym stanowisku pieczątka jest zdjęta; wraca po kliknięciu Przywróć.",
  "Next after":"Po karcie:",
  "learnt":"z praktyki",
  "Sent after this card {N} times in the last four weeks":"Wysłana po tej karcie {N} razy w ciągu ostatnich czterech tygodni",
  "Next reply 1":"Następna odpowiedź 1",
  "Next reply 2":"Następna odpowiedź 2",
  "Next reply 3":"Następna odpowiedź 3",
  "Next reply 4":"Następna odpowiedź 4",
  "Copy the first of the replies offered after the last one sent":"Kopiuje pierwszą odpowiedź proponowaną po ostatnio wysłanej",
  "Copy the second of the replies offered after the last one sent":"Kopiuje drugą odpowiedź proponowaną po ostatnio wysłanej",
  "Copy the third of the replies offered after the last one sent":"Kopiuje trzecią odpowiedź proponowaną po ostatnio wysłanej",
  "Copy the fourth of the replies offered after the last one sent":"Kopiuje czwartą odpowiedź proponowaną po ostatnio wysłanej",
  "Show the timeline":"Pokaż oś czasu",
  "Back to the cards":"Wróć do kart",
  "This conversation":"Ta rozmowa",
  "{KEY} back to the cards":"{KEY}: powrót do kart",
  "Each reply you send appears here, with what can follow it.":"Tu pojawi się każda wysłana odpowiedź, a obok to, co może po niej nastąpić.",
  "Sent":"Wysłane",
  "Now":"Teraz",
  "One reply, {AGO}":"Jedna odpowiedź, {AGO}",
  "{N} replies since {TIME}, the last {AGO}":"{N} odpowiedzi od {TIME}, ostatnia {AGO}",
  "just now":"przed chwilą",
  "{N} min ago":"{N} min temu",
  "at {TIME}":"o {TIME}",
  "then":"potem",
  "often":"często",
  "One of the cards this desk has used most lately":"Jedna z kart ostatnio najczęściej używanych na tym stanowisku",
  "To choose from next: {N}.":"Dalej do wyboru: {N}.",
  "What comes next is chosen with Add a reply.":"Następną odpowiedź wybiera się przyciskiem \"Dodaj odpowiedź\".",
  "Cards or the timeline":"Karty albo oś czasu",
  "Switch between the cards and the timeline while nothing is being typed":"Przełącza między kartami a osią czasu, gdy nic nie jest wpisywane",
  "Add it to the list":"Dodaj do listy",
  "Taken off the list":"Usunięto z listy",
  "{NAME}, a teammate":"Członek zespołu: {NAME}",
  "A teammate":"Członek zespołu",
  "Signed by {DESK}, key {KEY}. Only that teammate can change this file; anyone with the folder can read it.":"Podpis: {DESK}, klucz {KEY}. Zmienić ten plik może tylko ten członek zespołu, a przeczytać każdy z dostępem do folderu.",
  "See what changed":"Zobacz zmiany",
  "A catalog of its own":"Osobny katalog",
  "Your edits are with the team":"Własne zmiany są już u zespołu",
  "Your edits are kept on this computer and go to the team as soon as it can take them. To hand them over now, Export saves them in a catalog file for the team's lead.":"Własne zmiany są zachowane na tym komputerze i trafią do zespołu, gdy tylko będzie mógł je przyjąć. Aby przekazać je od razu, Eksportuj zapisze je w pliku katalogu dla lidera zespołu.",
  "Updates from the team are paused on this computer, because Etiuda cannot read its own note of the edits not yet sent to the team. No edit made here is lost, and this usually passes by itself. If it does not, closing other programs or restarting the computer usually clears it.":"Aktualizacje od zespołu są na tym komputerze wstrzymane, bo Etiuda nie może odczytać własnego zapisu zmian jeszcze niewysłanych do zespołu. Żadna zmiana wprowadzona na tym komputerze nie ginie, a zwykle mija to samo. Jeśli nie minie, zwykle pomaga zamknięcie innych programów albo ponowne uruchomienie komputera.",
  "Your edits to it come back when it is loaded again":"Własne zmiany w tym katalogu wrócą po jego ponownym wczytaniu",
  "In the team's edition":"W wydaniu zespołu",
  "At {DESK}":"{DESK}",
  "Back to the Library":"Wróć do Biblioteki",
  "Take this text":"Przejmij tę treść",
  "Now in your edits":"Już we własnych zmianach",
  "Now in {CAT}":"Już w kategorii {CAT}",
  "Give it back":"Oddaj kartę",
  "Drag it onto one of your categories, or press Enter to choose one":"Przeciągnij kartę na jedną ze swoich kategorii albo naciśnij Enter i wybierz kategorię z listy",
  "Find a category":"Znajdź kategorię",
  "a category's name":"nazwa kategorii",
  "Add {CAT} as a category of this desk":"Dodaj {CAT} jako kategorię tego stanowiska",
  "Drop it on one of your categories.":"Upuść kartę na jedną ze swoich kategorii.",
  "Drop it on one of your categories, or on + to add {CAT}.":"Upuść kartę na jedną ze swoich kategorii albo na +, aby dodać kategorię {CAT}.",
  "That teammate's cards match the team's edition.":"Karty tego członka zespołu są takie same jak w wydaniu zespołu.",
  "The name on this desk":"Imię na tym stanowisku",
  "{NAME} comes from your account: the first name and the first letter of the surname. Replies that sign with your name use it, and the team's lead sees this desk by it. It can be changed here at any time.":"{NAME} pochodzi z konta: to imię i pierwsza litera nazwiska. Ta nazwa trafia do odpowiedzi podpisywanych imieniem, a lider zespołu widzi pod nią to stanowisko. Można ją zmienić tutaj w dowolnej chwili.",
  "{NAME} is the name on your account. Replies that sign with your name use it, and the team's lead sees this desk by it. It can be changed here at any time.":"{NAME} to nazwa z konta. Ta nazwa trafia do odpowiedzi podpisywanych imieniem, a lider zespołu widzi pod nią to stanowisko. Można ją zmienić tutaj w dowolnej chwili.",
  "Etiuda starts with a sign-in.":"Etiuda zaczyna się od zalogowania.",
  "Signing in with Microsoft or Google gives this computer a seat: the team's, where this account is already admitted, or else a trial of fourteen days. A lead's invitation then appears here with one Join. Catalogs open once the seat is here.":"Zalogowanie kontem Microsoft lub Google daje temu komputerowi miejsce w licencji: w zespole, jeśli to konto jest już do niego przyjęte, a w przeciwnym razie czternastodniowy okres próbny. Zaproszenie od lidera pojawi się wtedy tutaj z jednym przyciskiem Dołącz. Katalogi otwierają się, gdy miejsce już jest.",
  "Signing in needs an internet connection. The buttons appear here by themselves once this computer is online.":"Logowanie wymaga połączenia z internetem. Przyciski pojawią się tu same, gdy komputer będzie online.",
  "The request to join is waiting.":"Prośba o dołączenie czeka.",
  "Catalogs open here again once {LEAD}, the team's lead, accepts it. Etiuda's own fourteen days ended on {DESK_END}.":"Katalogi znów otworzą się tutaj, gdy {LEAD}, lider zespołu, ją przyjmie. Własne czternaście dni Etiudy skończyły się {DESK_END}.",
  "The requests to join are waiting.":"Prośby o dołączenie czekają.",
  "Catalogs open here again once one of these leads accepts a request: {LEADS}. Etiuda's own fourteen days ended on {DESK_END}.":"Katalogi znów otworzą się tutaj, gdy któryś z tych liderów przyjmie prośbę: {LEADS}. Własne czternaście dni Etiudy skończyły się {DESK_END}.",
  "Day {N} of 14, until {DESK_END}. Etiuda works meanwhile; the requests to join wait for one of these leads: {LEADS}.":"Dzień {N} z 14, do {DESK_END}. Etiuda w tym czasie działa; prośby o dołączenie czekają na odpowiedź jednego z liderów: {LEADS}.",
  "Catalogs open here again once the team's lead accepts it. Etiuda's own fourteen days ended on {DESK_END}.":"Katalogi znów otworzą się tutaj, gdy lider zespołu ją przyjmie. Własne czternaście dni Etiudy skończyły się {DESK_END}.",
  "Etiuda's trial has ended.":"Okres próbny Etiudy się skończył.",
  "It ended on {DESK_END}. This account's organisation holds an Etiuda licence, so a team's lead can admit this account; buying a licence opens the catalogs again too.":"Skończył się {DESK_END}. Organizacja tego konta ma licencję Etiudy, więc lider zespołu może przyjąć to konto; katalogi otworzy też zakup licencji.",
  "It ended on {DESK_END}. Buying a licence opens the catalogs again.":"Skończył się {DESK_END}. Katalogi otworzy ponownie zakup licencji.",
  "This account's seat ended on {ENDED}.":"Miejsce tego konta w licencji wygasło {ENDED}.",
  "Etiuda keeps working on this computer until {DATE}, when its last confirmation runs out, and then stops. A purchase, or a team's lead admitting this account, brings the seat back.":"Etiuda działa na tym komputerze do {DATE}, kiedy wygasa jej ostatnie potwierdzenie, a potem się zatrzyma. Miejsce przywróci zakup albo przyjęcie tego konta przez lidera zespołu.",
  "Seat ended {ENDED} · Etiuda stops {DATE}":"Miejsce wygasło {ENDED} · Etiuda zatrzyma się {DATE}",
  "This account's seat has ended; Etiuda stops on {DATE}.":"Miejsce tego konta wygasło; Etiuda zatrzyma się {DATE}.",
  /* A seat taken back: the copywriter's words, 22 November 2026. */
  "This account's seat on the team has been taken back.":"Miejsce tego konta w zespole zostało odebrane.",
  "A lead can bring it back with a new invitation to this account's email address: after signing in again, it appears here with one Join. Nothing on this computer is lost meanwhile.":"Lider zespołu może je przywrócić nowym zaproszeniem na adres e-mail tego konta: po ponownym zalogowaniu pojawi się tutaj z jednym przyciskiem Dołącz. Do tego czasu nic na tym komputerze nie przepada.",
  "Sign in again":"Zaloguj się ponownie",
  "Etiuda has stopped on this computer.":"Etiuda zatrzymała się na tym komputerze.",
  "It stopped on {DATE}: {WHY}. Signing in with an account that has a seat, a purchase, or a team's lead admitting this account starts it again.":"Zatrzymała się {DATE}: {WHY}. Etiudę uruchomi ponownie zalogowanie się kontem, które ma miejsce w licencji, zakup albo przyjęcie tego konta przez lidera zespołu.",
  "its trial ended":"skończył się jej okres próbny",
  "the Etiuda Studio trial that covered it ended":"skończył się okres próbny Etiudy Studio, który ją obejmował",
  "the licence ended":"wygasła licencja",
  "the seat on the team {LEAD} leads ended":"wygasło miejsce w zespole, który prowadzi {LEAD}",
  "the seat on the team ended":"wygasło miejsce w zespole",
  "the organisation's licence no longer gives this account a seat":"licencja organizacji nie daje już temu kontu miejsca",
  "Trial · until {DATE}":"Okres próbny · do {DATE}",
  "Etiuda's own trial, day {N} of 14, until {DATE}, on up to three computers.":"Własny okres próbny Etiudy, dzień {N} z 14, do {DATE}, najwyżej na trzech komputerach.",
  "Etiuda Studio's trial · until {STUDIO_END}":"Okres próbny Etiudy Studio · do {STUDIO_END}",
  "The Etiuda Studio trial on this account covers Etiuda too, until {STUDIO_END}.":"Okres próbny Etiudy Studio na tym koncie obejmuje także Etiudę, do {STUDIO_END}.",
  "Own licence · paid until {ENDS}":"Własna licencja · opłacona do {ENDS}",
  "This account's own licence, paid until {ENDS}, on up to three computers.":"Własna licencja tego konta, opłacona do {ENDS}, najwyżej na trzech komputerach.",
  "Team's licence · until {ENDS}":"Licencja zespołu · do {ENDS}",
  "A seat on the team {TEAM}; it renews by itself, and the team's licence runs until {ENDS}.":"Miejsce w zespole: {TEAM}; odnawia się samo, a licencja zespołu obowiązuje do {ENDS}.",
  "A seat on a team; it renews by itself, and the team's licence runs until {ENDS}.":"Miejsce w zespole; odnawia się samo, a licencja zespołu obowiązuje do {ENDS}.",
  "Day {N} of 14, until {DESK_END}. The request to join waits for {LEAD}, and Etiuda works meanwhile.":"Dzień {N} z 14, do {DESK_END}. Prośba o dołączenie czeka na odpowiedź, której udzieli {LEAD}, a Etiuda w tym czasie działa.",
  "Day {N} of 14, until {DESK_END}. The request to join waits for the team's lead, and Etiuda works meanwhile.":"Dzień {N} z 14, do {DESK_END}. Prośba o dołączenie czeka na odpowiedź lidera zespołu, a Etiuda w tym czasie działa.",
  "Etiuda's own fourteen days ended on {DESK_END}. The Etiuda Studio trial on this account began later and covers Etiuda too, until {STUDIO_END}.":"Własne czternaście dni Etiudy skończyły się {DESK_END}. Okres próbny Etiudy Studio na tym koncie zaczął się później i obejmuje także Etiudę, do {STUDIO_END}.",
  "This account has a seat on its organisation's licence.":"To konto ma miejsce w licencji swojej organizacji.",
  "It renews by itself; the licence runs until {ENDS}.":"Odnawia się samo; licencja obowiązuje do {ENDS}.",
  "Save your own work as files…":"Zapisz własną pracę jako pliki…",
  "What this account made here can still be saved as files, in a folder of your choice: its own cards, its edits to a catalog's cards, and the flags it raised. Catalogs themselves are not saved.":"To, co powstało tu na tym koncie, można jeszcze zapisać jako pliki w wybranym folderze: własne karty, zmiany w kartach katalogu i zgłoszenia. Same katalogi nie są zapisywane.",
  "This build of Etiuda cannot sign in.":"Ta wersja Etiudy nie umożliwia logowania.",
  "It was made without a way to sign in, so no catalog opens here.":"Zbudowano ją bez możliwości logowania, więc żaden katalog się tu nie otwiera.",
  "Etiuda works in its desktop app.":"Etiuda działa w aplikacji na komputer.",
  "In a browser, no catalog opens.":"W przeglądarce żaden katalog się nie otwiera.",
  "This computer cannot keep a sign-in, so Etiuda asks for one again when the seat renews, at most every thirty days.":"Ten komputer nie może przechować logowania, więc Etiuda poprosi o nie ponownie przy odnowieniu miejsca, najwyżej co trzydzieści dni.",
  "There is nothing of yours here to save: no cards of your own, no edits and no flags.":"Nie ma tu nic do zapisania: żadnych własnych kart, zmian ani zgłoszeń.",
  "Saving to files works only in the desktop app.":"Zapis do plików działa tylko w aplikacji na komputer.",
  "Files saved in {FOLDER}: {N}.":"Pliki zapisane w folderze {FOLDER}: {N}.",
  "Share with a teammate…":"Udostępnij osobie z zespołu…",
  "Share with…":"Udostępnij…",
  "Share this card":"Udostępnij tę kartę",
  "Each person chosen gets a copy to keep or decline; this card stays as it is.":"Każda wybrana osoba dostaje kopię do zachowania albo odrzucenia; ta karta zostaje bez zmian.",
  "Find a teammate":"Znajdź osobę z zespołu",
  "Add a line for them (optional)":"Dodaj krótką wiadomość (opcjonalnie)",
  "Send ({N})":"Wyślij ({N})",
  "Shared with {NAMES}.":"Udostępniono: {NAMES}.",
  "Shared with you":"Udostępnione",
  "cards: {N}, from {NAMES}":"karty: {N}, nadawcy: {NAMES}",
  "Show":"Pokaż",
  "{NAME} shared a card with you":"{NAME} udostępnia kartę",
  "Keep adds it to this desk as a card of its own: a copy that stays as it is, whatever happens to the original.":"Zachowaj dodaje ją do tego stanowiska jako własną kartę: kopię, która zostaje bez zmian, cokolwiek stanie się z oryginałem.",
  "Decline":"Odrzuć",
  "Keep":"Zachowaj",
  "from {NAME}":"nadawca: {NAME}",
  "kept · {NAME}":"zachowana · {NAME}",
  "kept · {N}":"zachowana · {N}",
  "Kept: {NAME}, {DATE}":"Zachowano: {NAME}, {DATE}",
  "Shared by {NAME} on {DATE}. This copy belongs to this desk, and changes to it stay here.":"Udostępnienie: {NAME}, {DATE}. Ta kopia należy do tego stanowiska, a zmiany w niej zostają tutaj.",
  "Sent to {NAMES}":"Wysłano: {NAMES}",
  "{NAME} is no longer on the team, so the card was not sent there.":"{NAME} nie jest już w zespole, więc karty tam nie wysłano.",
  "not on the team":"poza zespołem",
  "{NAME} already has too many cards waiting, so this one was not sent; it can be sent again once some of them are kept or declined.":"{NAME} ma już za dużo oczekujących kart, więc tej nie wysłano; można ją wysłać ponownie, gdy część z nich zostanie zachowana albo odrzucona.",
  "too many waiting":"za dużo oczekujących",
  "This card is too large to share, so nothing was sent.":"Ta karta jest za duża, by ją udostępnić, więc nic nie wysłano.",
  "This desk has no current seat, so nothing was sent; sharing works again once it has one.":"To stanowisko nie ma teraz ważnego miejsca w licencji, więc nic nie wysłano; udostępnianie zadziała ponownie, gdy je odzyska.",
  "This card could not be sent just now.":"Nie udało się teraz wysłać tej karty.",
  /* words: placeholder */
  "This catalog is private, so this card stays on this desk.":"Ten katalog jest prywatny, więc ta karta zostaje na tym stanowisku.",
  "This card could not be kept just now.":"Nie udało się teraz zachować tej karty."
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
/* AN ACT THAT CAN BE UNDONE HAPPENS AT ONCE, and this bubble offers the way back: over any dialog, until another act
   replaces it or UNDO_MS passes. A caller that has not done the act yet passes `lapse`. It runs when this offer ends
   without Undo: the wait, Escape, or a later act taking the bubble. `undo` is the way back, and it does not run `lapse`.
   Every caller that already did the act passes no `lapse`, and nothing here changes for that caller. `from` is the
   control whose act it undoes, and the bubble hangs from it: an element, or originOf(control) read before an act
   that may take the control away. */
const UNDO_MS=10000;
/* The key the button names, the fixed "undo" row of SC_DEFS as formatActionChord spells it. */
const UNDO_KEY="Ctrl+Z";
let undoTimer=0, undoTake=null, undoLapse=null, undoTyped=false, undoShut=null;
/* A field typed in since the bubble came (keydown.js reports it): its Ctrl+Z is then its own typing's. */
function noteUndoTyping(){ undoTyped=true; }
function offerUndo(said, undo, lapse, from){
  const was=$("#eUndo"); if(was) was.remove();
  clearTimeout(undoTimer);
  const prev=undoLapse;
  undoLapse=null; undoTake=null;
  if(typeof prev==="function") prev();
  const el=document.createElement("div");
  el.className="bub bub-ask e-undo";
  el.id="eUndo";
  el.setAttribute("role","status");
  el.setAttribute("data-side","none");
  el.innerHTML='<p>'+esc(t(said))+'</p>'
    +'<div class="tour-actions"><button type="button" class="btn primary" id="eUndoBtn" aria-label="'+esc(t("Undo"))
    +'" aria-keyshortcuts="Control+Z">'+esc(t("Undo"))+'<kbd>'+esc(UNDO_KEY)+'</kbd></button>'
    +'<button type="button" class="e-undo-x" id="eUndoX" aria-label="'+esc(t("Close"))+'" title="'+esc(t("Close"))+'">'+ICON_X+'</button></div>';
  cutLeaves();
  document.body.appendChild(el);
  if(from) hangBubble(el, typeof from==="function" ? from : originOf(from));
  const onLapse=typeof lapse==="function"?lapse:null;
  const close=kept=>{
    clearTimeout(undoTimer);
    if(undoTake===take) undoTake=null;
    if(undoShut===shut) undoShut=null;
    const end=undoLapse;
    if(end===onLapse) undoLapse=null;
    dismissNode(el);
    if(!kept && end===onLapse && onLapse) onLapse();
  };
  const take=()=>{ close(true); undo(); };
  /* THE CLOSE CONTROL AND ESCAPE DISMISS THE OFFER: it lapses as the wait does, and never runs the undo. */
  const shut=()=>close(false);
  undoTake=take; undoLapse=onLapse; undoTyped=false; undoShut=shut;
  el.querySelector("#eUndoBtn").onclick=take;
  const shutBtn=el.querySelector("#eUndoX");
  if(shutBtn) shutBtn.onclick=shut;
  el.addEventListener("keydown",e=>{
    if(e.key!=="Escape") return;
    e.preventDefault(); e.stopPropagation(); close(false);
  });
  undoTimer=setTimeout(()=>close(false),UNDO_MS);
}
/* ESCAPE'S LAST RUNG BEFORE THE DESK'S OWN: a standing, showing Undo bubble is dismissed, never taken. True where it was. */
function dismissStandingUndo(){
  const el=document.getElementById("eUndo");
  if(!undoShut || !el || el.hidden) return false;
  undoShut();
  return true;
}
/* CTRL+Z TAKES THE STANDING UNDO: true where it did. Nothing where none stands or a question hides it, and nothing
   from a field typed in since the bubble came, whose key it then is. */
function takeStandingUndo(inField){
  const el=document.getElementById("eUndo");
  if(!undoTake || !el || el.hidden || (inField && undoTyped)) return false;
  undoTake();
  return true;
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
/* What a toast holds, given its words already translated: null where they are plain text. A copy of a
   card that commits the firm says so beside them, in the same words on every card. */
function toastHtml(m, refusal, stamped){
  if(refusal) return ICON_LINT_WARNING+'<span>'+esc(m)+'</span>';
  if(stamped) return '<span>'+esc(m)+'</span><span class="t-stamp">'+ICON_STAMP+esc(t("Commits the firm"))+'</span>';
  return null;
}
function toastDurationMs(m, ms, stamped){
  const len=String(m||"").trim().length+(stamped?t("Commits the firm").length+2:0);
  const byLen=Math.max(TOAST_MS, Math.round(900+len*55));
  return Math.max(+ms||0, byLen);
}
function toast(m, ms, refusal, stamped){
  toastSerial++;
  /* Every message the app speaks passes through here, so this is the one place a toast needs
     translating - not fifty call sites. */
  m=t(m);
  const el=$("#toast");
  const put=()=>{
    el.classList.remove("swap");
    el.classList.toggle("refusal",!!refusal);
    el.classList.toggle("stamped",!refusal && !!stamped);
    const html=toastHtml(m, refusal, stamped);
    if(html==null) el.textContent=m; else el.innerHTML=html;
    placeToast(el); markCut(el); el.classList.add("show");
  };
  /* A TOAST ARRIVING OVER ONE THAT SHOWS dips out on the dismiss tier and comes back with its new
     words, rather than rewriting them in place and snapping the pill to its new width. */
  const dip=el.classList.contains("show") && !mgReduceMotion();
  clearTimeout(tt); clearTimeout(toastSwap);
  if(dip){ el.classList.add("swap"); toastSwap=setTimeout(put,M_MS.dismiss); }
  else put();
  tt=setTimeout(()=>el.classList.remove("show"),toastDurationMs(m,ms,stamped)+(dip?M_MS.dismiss:0));
}
/* A REFUSAL IS NOT A CONFIRMATION: its own ground and the warning glyph, and a longer life. */
function toastRefusal(m){ toast(m, TOAST_REFUSAL_MS, true); }
/* TRANSLATE AT THE SINKS, not at 200 call sites: an attribute in markup, a chrome
   element's text, or a toast. SCOPED TO CHROME - the card list, the panel's rows and the
   facts panel hold CATALOG content, the customer's, never touched by a UI language; that
   is also why nothing here walks `document`. */
/* ONE ENGLISH WORD, TWO MEANINGS ("first name": the agent's own, and a card's customer token cut
   down to one). tc() tries a context-qualified key first, falls back to the plain one - a
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
    .replace("{MACROS}",counted(macroN,"{N} reply","{N} replies"))
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
const TW_SHOW_ELEMENT=1, TW_FILTER_ACCEPT=1, TW_FILTER_REJECT=2;
function translateTree(root){
  /* NOT "return early on English". Every node this touched remembers its English source, and
     t() on English hands that source straight back - so running the sweep is exactly how the
     English is put back. Returning early meant a language could be entered and never left. */
  if(!root || root.nodeType!==1) return 0;
  /* A stand-in with no nodeType is not an element, and the old list was empty for it too. */
  const marked=el=>!!(el && el.nodeType===1 && el.hasAttribute && el.hasAttribute("data-i18n-skip"));
  /* Born on the root, the walker only filters the nodes it moves to. A marked root is refused
     before the walk, or its children would be entered. */
  if(marked(root)) return 0;
  /* A root inside a marked ancestor is refused too, as the old sweep's closest() refused it. */
  if(typeof root.closest==="function" && root.closest("[data-i18n-skip]")) return 0;
  const doc=root.ownerDocument || (typeof document!=="undefined" ? document : null);
  let visited=0;
  const one=el=>{
    /* Count every element the walker returned. A marked one in the count means the walk entered
       a skipped subtree; the filter's reject is what keeps it out. */
    visited++;
    if(marked(el)) return;
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
    if(!(el.classList && (el.classList.contains("e-dot-hug") || el.classList.contains("e-dot-t"))) && el.children && el.children.length===0 && el.textContent && el.textContent.trim()){
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
  };
  one(root);
  if(doc && typeof doc.createTreeWalker==="function"){
    const walker=doc.createTreeWalker(root, TW_SHOW_ELEMENT, {acceptNode:node=>marked(node)?TW_FILTER_REJECT:TW_FILTER_ACCEPT});
    for(let node=walker.nextNode(); node; node=walker.nextNode()) one(node);
    hugDottedGround(root);
    return visited;
  }
  /* A document with no walker (a test's stand-in; every page the desk draws has one): the same walk by hand, the same
     elements in the same order, a marked element and everything under it left out. */
  const down=el=>{ Array.prototype.forEach.call(el.children || [], c=>{ if(c && c.nodeType===1 && !marked(c)){ one(c); down(c); } }); };
  down(root);
  hugDottedGround(root);
  return visited;
}
/* GROUND-RULE HUGGER: finds every visible element standing directly on a dotted ground (nothing
   opaque between it and the dots), never by a list of text class names, and moves its inline
   words into an inline .e-dot-hug span so cleared pixels hug every line and never wipe beside a
   short line. Existing nodes are moved rather than rewritten, keeping all text-node handles.
   A card is not entered: nothing inside it stands on the dots. */
const DG_CTRL_SEL="button,a,input,select,textarea,.chip,kbd,.btn,.seg,[role=button],.cell-chip,.count";
function dgAlpha(c){
  if(!c || c==="transparent") return 0;
  let m=c.match(/\/\s*([\d.]+%?)\s*\)/);
  if(m) return m[1].endsWith("%") ? parseFloat(m[1])/100 : parseFloat(m[1]);
  m=c.match(/^rgba\(([^)]+)\)/);
  if(m) return parseFloat(m[1].split(",")[3]);
  return 1;
}
function dgTargets(root){
  const out=[];
  if(!root || root.nodeType!==1) return out;
  const closest=typeof root.closest==="function" ? root.closest.bind(root) : null;
  const sx=closest && closest(".sx-page");
  if(sx){ out.push({ground:sx, start:root}); return out; }
  const main=closest && closest(".stage > .scroller main");
  if(main){ out.push({ground:main, start:root}); return out; }
  const fs=closest && closest(".fs-left");
  if(fs){ out.push({ground:fs, start:root}); return out; }
  if(typeof root.querySelectorAll==="function"){
    root.querySelectorAll(".sx-page").forEach(p=>out.push({ground:p, start:p}));
    root.querySelectorAll(".stage > .scroller main").forEach(m=>out.push({ground:m, start:m}));
    root.querySelectorAll(".fs-left").forEach(f=>out.push({ground:f, start:f}));
  }
  return out;
}
function dgTrimRun(run){
  while(run.length && ((run[0].nodeType===3 && (!run[0].nodeValue || !run[0].nodeValue.trim())) || (run[0].nodeType===1 && run[0].tagName==="BR"))) run.shift();
  while(run.length && ((run[run.length-1].nodeType===3 && (!run[run.length-1].nodeValue || !run[run.length-1].nodeValue.trim())) || (run[run.length-1].nodeType===1 && run[run.length-1].tagName==="BR"))) run.pop();
  return run;
}
function dgRunHasWords(run){
  for(let i=0;i<run.length;i++){
    const n=run[i];
    if(n.nodeType===3 && n.nodeValue && n.nodeValue.trim()) return true;
    if(n.nodeType===1 && n.textContent && n.textContent.trim()) return true;
  }
  return false;
}
function hugDottedGround(root){
  hugDottedGround.cardIn=0;
  if(!root || root.nodeType!==1 || typeof getComputedStyle!=="function") return 0;
  const doc=root.ownerDocument || (typeof document!=="undefined" ? document : null);
  if(!doc) return 0;
  const targets=dgTargets(root);
  if(!targets.length) return 0;
  /* Two-phase Read then Write: collecting every style/wrap decision before mutating the DOM
     avoids interleaved style-recalc thrashing on large trees like Library with full catalogs. */
  const wraps=[], icons=[], inlineCtrls=[], blockCtrls=[];
  let cardIn=0;
  targets.forEach(({ground, start})=>{
    if(start!==ground){
      for(let p=start.parentElement; p && p!==ground; p=p.parentElement){
        if(p.classList && p.classList.contains("card")) return;
        if(dgAlpha(getComputedStyle(p).backgroundColor)>=0.95) return;
      }
    }
    const visit=el=>{
      if(!el || el.nodeType!==1 || el.hidden || el.hasAttribute("data-dg")) return;
      /* A card is its own ground. The line the plant removes: without it the walk enters the cards. */
      if(el.classList && el.classList.contains("card")) return;
      if(typeof el.closest==="function" && el.closest(".card")) cardIn++;
      if(el.classList && el.classList.contains("e-dot-hug")) return;
      const cs=getComputedStyle(el);
      if(cs.display==="none") return;
      if(cs.clip==="rect(0px, 0px, 0px, 0px)" || cs.clipPath==="inset(50%)") return;
      const bgAlpha=dgAlpha(cs.backgroundColor);
      const elOp=parseFloat(cs.opacity);
      const effBg=bgAlpha * (Number.isNaN(elOp) ? 1 : elOp);
      if(el!==ground){
        const tag=(el.tagName||"").toUpperCase();
        if(tag==="SVG" || tag==="IMG"){
          if(effBg<0.95 && el.classList) icons.push(el);
          return;
        }
        if(effBg>=0.95) return;
        if(typeof el.matches==="function" && el.matches(DG_CTRL_SEL)){
          if(cs.display==="inline") inlineCtrls.push(el);
          else blockCtrls.push(el);
          return;
        }
      }
      const isFlex=/flex|grid/.test(cs.display);
      const kids=el.childNodes;
      if(!kids || !kids.length) return;
      if(isFlex || el===ground){
        for(let i=0;i<kids.length;i++){
          const k=kids[i];
          if(k.nodeType===3 && k.nodeValue && k.nodeValue.trim()){
            if(el!==ground){
              const run=dgTrimRun([k]);
              if(run.length && dgRunHasWords(run)) wraps.push({parent:el, run, insideFlex:isFlex});
            }
          }else if(k.nodeType===1){
            visit(k);
          }
        }
        return;
      }
      let run=[];
      const flush=()=>{
        if(run.length){
          const trimmed=dgTrimRun(run.slice());
          if(trimmed.length && dgRunHasWords(trimmed)) wraps.push({parent:el, run:trimmed, insideFlex:false});
          run=[];
        }
      };
      for(let i=0;i<kids.length;i++){
        const k=kids[i];
        if(k.nodeType===3){
          run.push(k);
          continue;
        }
        if(k.nodeType!==1) continue;
        if(k.hidden) continue;
        const ktag=(k.tagName||"").toUpperCase();
        if(ktag==="BR"){ run.push(k); continue; }
        const kcs=getComputedStyle(k);
        if(kcs.display==="none") continue;
        const ka=dgAlpha(kcs.backgroundColor);
        const isFlow=(kcs.display==="inline" || kcs.display==="inline-block")
          && ktag!=="SVG" && ktag!=="IMG"
          && !(typeof k.matches==="function" && k.matches("input,select,textarea,button,.btn,.seg"))
          && !(k.classList && k.classList.contains("e-dot-hug"))
          && ka<0.95;
        if(isFlow){
          run.push(k);
        }else{
          flush();
          visit(k);
        }
      }
      flush();
    };
    visit(start);
  });
  hugDottedGround.cardIn=cardIn;
  /* Classes only. An inline ground beats hover, and a colour read off the screen stays after the theme changes. */
  let wrapped=0;
  for(let i=0;i<icons.length;i++){ if(!icons[i].classList.contains("e-dot-ic")) icons[i].classList.add("e-dot-ic"); }
  for(let i=0;i<inlineCtrls.length;i++){ if(!inlineCtrls[i].classList.contains("e-dot-hug")){ inlineCtrls[i].classList.add("e-dot-hug"); wrapped++; } }
  for(let i=0;i<blockCtrls.length;i++){
    const el=blockCtrls[i];
    if(!el.classList.contains("e-dot-ctrl")){ el.classList.add("e-dot-ctrl"); wrapped++; }
  }
  for(let i=0;i<wraps.length;i++){
    const {parent, run, insideFlex}=wraps[i];
    if(!run[0] || !run[0].parentNode) continue;
    if(parent.hasAttribute && parent.hasAttribute("data-i18n-text")){
      const src=parent.getAttribute("data-i18n-text");
      for(let j=0;j<run.length;j++){
        if(run[j].nodeType===3 && run[j].nodeValue && run[j].nodeValue.trim()){
          if(!run[j].eI18nSrc) run[j].eI18nSrc=src;
          break;
        }
      }
      parent.removeAttribute("data-i18n-text");
    }
    const hug=doc.createElement("span");
    hug.className="e-dot-hug";
    const outer=insideFlex ? doc.createElement("span") : hug;
    if(insideFlex){ outer.className="e-dot-flex"; outer.appendChild(hug); }
    run[0].parentNode.insertBefore(outer, run[0]);
    /* the words in a box of their own, above the patch (template.html, .e-dot-t) */
    const words=doc.createElement("span");
    words.className="e-dot-t";
    hug.appendChild(words);
    for(let j=0;j<run.length;j++) words.appendChild(run[j]);
    wrapped++;
  }
  /* each patch lies BELOW the one before it in its ground, so a patch's spread never covers the words of the block above it (a heading's
     descenders reach to its foot): numbered by document order over the whole ground at every pass, so the same screen numbers the same */
  const grounds=[];
  targets.forEach(({ground})=>{ if(grounds.indexOf(ground)<0) grounds.push(ground); });
  grounds.forEach(ground=>{
    const ws=ground.querySelectorAll(".e-dot-hug > .e-dot-t");
    for(let i=0;i<ws.length;i++){
      const z=String(-1-i), hug=ws[i].parentNode;
      if(hug.style.zIndex!==z) hug.style.zIndex=z;
    }
  });
  return wrapped;
}
/** The app's own furniture, never the catalog's content. */
function translateChrome(){
  /* #intentRail carries the engine's own labels AND the catalog's intent clauses; the
     clauses are marked data-i18n-skip where they are written, so the sweep is safe here. */
  ["header","#settingsMenu","#modalCard","#screenHost","footer","#tourRoot",
   "#intentRail","#sampleMark","#railHit","#eTestBand"].forEach(sel=>{
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
  takeStandingUndo,
  dismissStandingUndo,
  noteUndoTyping,
  tc,
  counted,
  catalogCountsLine,
  catalogAwaitingLine,
  fileStamp,
  translateTree,
  translateChrome,
  hugDottedGround,
  toast,
  toastHtml,
  toastRefusal,
  TOAST_MS,
  TOAST_HAND_MS,
  toastSerial
};
