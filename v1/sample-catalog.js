/* Etiuda's sample catalog, format 1, for the 1.x page. Opt-in demo content, never loaded
   automatically: the empty screen offers it. A sibling script rather than a fetch, so a copy
   opened from file:// can load it too.
   Mirabelka, an invented ceramics studio with its own shop. The same content as the 2.x
   sample, shell/sample-catalog.ec, written out by tools/catalog-v2/v2-to-v1.mjs. */
window.PB_SAMPLE={
 "format": 1,
 "kind": "playbook-catalog",
 "name": "Mirabelka",
 "categories": {
  "opening": "Opening",
  "holding": "Holding",
  "closing": "Closing",
  "orders": "Orders",
  "delivery": "Delivery",
  "damaged": "Damaged in transit",
  "returns": "Returns and exchanges",
  "faults": "Faults and complaints",
  "payments": "Payments",
  "invoices": "Invoices",
  "care": "Care and use",
  "personalisation": "Personalisation",
  "workshops": "Workshops",
  "gift-cards": "Gift cards",
  "trade": "Trade and wholesale",
  "availability": "Availability",
  "account": "Account and newsletter"
 },
 "icons": {
  "opening": "bubble",
  "holding": "pause",
  "closing": "check",
  "orders": "parcel",
  "delivery": "truck",
  "damaged": "broken",
  "returns": "undo",
  "faults": "doc",
  "payments": "card",
  "invoices": "receipt",
  "care": "heart",
  "personalisation": "brush",
  "workshops": "calendar",
  "gift-cards": "gift",
  "trade": "cup",
  "availability": "clock",
  "account": "key"
 },
 "colors": {
  "opening": 0,
  "holding": 1,
  "closing": 2,
  "orders": 6,
  "delivery": 3,
  "damaged": 7,
  "returns": 4,
  "faults": 0,
  "payments": 1,
  "invoices": 2,
  "care": 6,
  "personalisation": 3,
  "workshops": 7,
  "gift-cards": 4,
  "trade": 0,
  "availability": 1,
  "account": 2
 },
 "roles": {
  "always": [
   "opening",
   "holding",
   "closing"
  ]
 },
 "intents": {
  "en": [
   "where your order has got to",
   "a new delivery address",
   "adding to your order",
   "cancelling your order",
   "a piece missing from your parcel",
   "the wrong piece in your parcel",
   "your order confirmation",
   "combining two orders",
   "sending your order as a gift",
   "wrapping it as a present",
   "matching pieces from one firing",
   "how long delivery takes",
   "a delivery that's running late",
   "delivery abroad",
   "delivery to a pickup point",
   "collecting from the studio",
   "delivery by a particular date",
   "a parcel that came back to us",
   "a piece broken in transit",
   "a box that arrived crushed",
   "a replacement for a broken piece",
   "a refund for a broken piece",
   "returning a piece",
   "how your return is getting on",
   "exchanging a piece for another colour",
   "returning a personalised piece",
   "returning a gift",
   "a return after the 14 days",
   "your returns label",
   "a courier collecting your return",
   "a fault in one of our pieces",
   "the progress of your complaint",
   "fine cracks in the glaze",
   "a colour that differs from the photo",
   "a mug that leaks",
   "a handle that came off",
   "a payment that didn't go through",
   "being charged twice",
   "paying by bank transfer",
   "when your money will be back",
   "a discount code",
   "paying on delivery",
   "a copy of your invoice",
   "an invoice for your company",
   "correcting the details on an invoice",
   "a credit note for your refund",
   "an invoice for a workshop",
   "whether our pieces can go in the dishwasher",
   "using our pieces in the microwave or the oven",
   "getting a stain out",
   "how each piece comes out a little different",
   "whether our glazes are safe with food",
   "a name painted on a mug",
   "how long a personalised piece takes",
   "changing the inscription",
   "a company logo on our pieces",
   "booking a workshop",
   "moving your workshop to another date",
   "collecting your fired pieces",
   "a private workshop for your group",
   "a workshop for children",
   "buying a gift card",
   "the balance on your gift card",
   "a gift card past its date",
   "giving a workshop as a gift",
   "trade prices",
   "tableware for your coffee shop",
   "a sample set",
   "when a piece will be back in the shop",
   "our seconds",
   "a piece made to order",
   "changing the email address on your account",
   "your account password",
   "leaving the newsletter",
   "deleting your data"
  ],
  "pl": [
   "śledzeniem zamówienia",
   "zmianą adresu dostawy",
   "dopisaniem czegoś do zamówienia",
   "anulowaniem zamówienia",
   "brakiem w paczce",
   "pomyłką w paczce",
   "potwierdzeniem zamówienia",
   "połączeniem dwóch zamówień",
   "wysłaniem zamówienia w prezencie",
   "zapakowaniem na prezent",
   "skompletowaniem rzeczy z jednej partii",
   "czasem dostawy",
   "spóźnioną dostawą",
   "wysyłką za granicę",
   "odbiorem w punkcie",
   "odbiorem osobistym w pracowni",
   "dostawą na konkretny dzień",
   "powrotem paczki do nadawcy",
   "uszkodzoną przesyłką",
   "zgniecionym kartonem",
   "wymianą uszkodzonej rzeczy",
   "oddaniem pieniędzy za uszkodzoną rzecz",
   "zwrotem zakupu",
   "pytaniem o status zwrotu",
   "wymianą na inny kolor",
   "zwrotem rzeczy z personalizacją",
   "zwrotem prezentu",
   "zwrotem po upływie 14 dni",
   "etykietą zwrotną",
   "odbiorem zwrotu przez kuriera",
   "zgłoszeniem reklamacji",
   "pytaniem o stan reklamacji",
   "spękaniami szkliwa",
   "kolorem innym niż na zdjęciu",
   "przeciekającym kubkiem",
   "odpadniętym uchem",
   "nieudaną płatnością",
   "podwójną płatnością",
   "płatnością przelewem",
   "pytaniem, kiedy wrócą pieniądze",
   "kodem rabatowym",
   "płatnością przy odbiorze",
   "kopią faktury",
   "fakturą na firmę",
   "poprawieniem danych na fakturze",
   "fakturą korygującą po zwrocie",
   "fakturą za warsztaty",
   "pytaniem o zmywarkę",
   "pytaniem o mikrofalówkę i piekarnik",
   "czyszczeniem plam",
   "różnicami między egzemplarzami",
   "składem i bezpieczeństwem szkliwa",
   "imieniem na kubku",
   "czasem wykonania personalizacji",
   "zmianą napisu",
   "logo firmy na naczyniach",
   "zapisem na warsztaty",
   "zmianą terminu warsztatów",
   "odbiorem wypalonych prac",
   "warsztatami dla grupy",
   "warsztatami dla dzieci",
   "zakupem karty podarunkowej",
   "saldem karty podarunkowej",
   "kartą podarunkową po terminie ważności",
   "warsztatami w prezencie",
   "cenami hurtowymi",
   "zastawą dla kawiarni",
   "kompletem próbnym",
   "pytaniem o powrót do sprzedaży",
   "rzeczami drugiego gatunku",
   "rzeczą wykonaną na zamówienie",
   "zmianą adresu e-mail na koncie",
   "pytaniem o hasło do konta",
   "wypisaniem z newslettera",
   "usunięciem danych"
  ],
  "cmt": [
   "order located",
   "delivery address changed",
   "piece added to the order",
   "order cancelled",
   "missing piece sent",
   "right piece sent",
   "confirmation sent again",
   "orders packed together",
   "gift delivery arranged",
   "gift wrapping added",
   "pieces matched from one batch",
   "delivery time given",
   "late delivery followed up",
   "delivery abroad explained",
   "pickup point chosen",
   "collection arranged",
   "delivery date checked",
   "parcel sent again",
   "damage reported to the courier",
   "crushed box noted",
   "replacement sent",
   "refund issued",
   "return arranged",
   "return status checked",
   "exchange arranged",
   "personalised piece reviewed",
   "gift return arranged",
   "late return reviewed",
   "returns label sent",
   "courier collection booked",
   "complaint registered",
   "complaint status checked",
   "crazing assessed",
   "colour difference explained",
   "leaking mug registered",
   "handle fault registered",
   "payment checked",
   "second payment refunded",
   "transfer details sent",
   "refund date given",
   "discount code checked",
   "cash on delivery explained",
   "invoice copy sent",
   "company invoice issued",
   "invoice details corrected",
   "credit note issued",
   "workshop invoice issued",
   "dishwasher care explained",
   "microwave and oven use explained",
   "cleaning advice given",
   "differences between pieces explained",
   "glaze safety confirmed",
   "name taken for painting",
   "lead time given",
   "inscription change checked",
   "logo stamping discussed",
   "workshop place booked",
   "workshop date moved",
   "collection of pieces arranged",
   "group workshop proposed",
   "children's class explained",
   "gift card purchase explained",
   "gift card balance checked",
   "expired gift card reviewed",
   "workshop gift explained",
   "trade prices sent",
   "coffee shop tableware discussed",
   "sample set offered",
   "next firing date given",
   "seconds explained",
   "made-to-order piece discussed",
   "account email changed",
   "password reset link sent",
   "unsubscribed from the newsletter",
   "data deletion request logged"
  ],
  "cmtPl": [
   "sprawdzono, gdzie jest zamówienie",
   "zmieniono adres dostawy",
   "dopisano rzecz do zamówienia",
   "anulowano zamówienie",
   "wysłano brakującą rzecz",
   "wysłano właściwą rzecz",
   "ponownie wysłano potwierdzenie",
   "połączono zamówienia",
   "przygotowano wysyłkę prezentu",
   "dodano pakowanie na prezent",
   "dobrano rzeczy z jednej partii",
   "podano czas dostawy",
   "sprawdzono opóźnioną dostawę",
   "wyjaśniono wysyłkę za granicę",
   "wybrano punkt odbioru",
   "umówiono odbiór w pracowni",
   "sprawdzono termin dostawy",
   "ponownie wysłano paczkę",
   "zgłoszono szkodę przewoźnikowi",
   "odnotowano zgnieciony karton",
   "wysłano nową sztukę",
   "oddano pieniądze",
   "uzgodniono zwrot",
   "sprawdzono status zwrotu",
   "uzgodniono wymianę",
   "omówiono rzecz z personalizacją",
   "uzgodniono zwrot prezentu",
   "rozpatrzono zwrot po terminie",
   "wysłano etykietę zwrotną",
   "zamówiono odbiór przez kuriera",
   "przyjęto reklamację",
   "sprawdzono stan reklamacji",
   "oceniono spękania szkliwa",
   "wyjaśniono różnicę w kolorze",
   "przyjęto zgłoszenie przeciekającego kubka",
   "przyjęto zgłoszenie odpadniętego ucha",
   "sprawdzono płatność",
   "zwrócono drugą płatność",
   "przesłano dane do przelewu",
   "podano termin zwrócenia pieniędzy",
   "sprawdzono kod rabatowy",
   "wyjaśniono płatność przy odbiorze",
   "wysłano kopię faktury",
   "wystawiono fakturę na firmę",
   "poprawiono dane na fakturze",
   "wystawiono fakturę korygującą",
   "wystawiono fakturę za warsztaty",
   "wyjaśniono mycie w zmywarce",
   "wyjaśniono użycie mikrofalówki i piekarnika",
   "doradzono, jak usunąć plamy",
   "wyjaśniono różnice między egzemplarzami",
   "potwierdzono bezpieczeństwo szkliwa",
   "przyjęto imię do namalowania",
   "podano czas wykonania",
   "sprawdzono możliwość zmiany napisu",
   "omówiono odciśnięcie logo",
   "zarezerwowano miejsce na warsztatach",
   "przeniesiono termin warsztatów",
   "umówiono odbiór prac",
   "zaproponowano warsztaty dla grupy",
   "omówiono zajęcia dla dzieci",
   "wyjaśniono zakup karty podarunkowej",
   "sprawdzono saldo karty",
   "rozpatrzono kartę po terminie",
   "wyjaśniono, jak podarować warsztaty",
   "przesłano ceny hurtowe",
   "omówiono zastawę dla kawiarni",
   "zaproponowano komplet próbny",
   "podano termin kolejnego wypału",
   "wyjaśniono, czym jest drugi gatunek",
   "omówiono wykonanie na zamówienie",
   "zmieniono adres e-mail konta",
   "wysłano link do zmiany hasła",
   "wypisano z newslettera",
   "przyjęto prośbę o usunięcie danych"
  ],
  "topic": [
   "where is my order",
   "change delivery address",
   "add to an order",
   "cancel an order",
   "item missing from the parcel",
   "wrong item sent",
   "order confirmation",
   "combine two orders",
   "order sent as a gift",
   "gift wrapping",
   "matching pieces from one batch",
   "delivery time",
   "late delivery",
   "delivery abroad",
   "pickup point",
   "collect at the studio",
   "delivery by a set date",
   "parcel back with the sender",
   "broken in transit",
   "box damaged, contents fine",
   "replacement for a broken piece",
   "refund for a broken piece",
   "return an item",
   "return status",
   "exchange for another colour",
   "return of a personalised piece",
   "return of a gift",
   "return after 14 days",
   "returns label",
   "courier collection for a return",
   "report a fault",
   "complaint status",
   "crazing in the glaze",
   "colour differs from the photo",
   "mug leaks",
   "handle came off",
   "payment failed",
   "paid twice",
   "pay by bank transfer",
   "when the money comes back",
   "discount code",
   "cash on delivery",
   "invoice copy",
   "invoice for a company",
   "correct invoice details",
   "credit note for a refund",
   "invoice for a workshop",
   "dishwasher safe",
   "microwave and oven",
   "stains and cleaning",
   "each piece is different",
   "glaze and food safety",
   "name on a mug",
   "personalisation lead time",
   "change the inscription",
   "company logo",
   "book a workshop",
   "move a workshop date",
   "collect fired pieces",
   "private group workshop",
   "children's workshop",
   "buy a gift card",
   "gift card balance",
   "gift card past its date",
   "workshop as a gift",
   "wholesale prices",
   "tableware for a coffee shop",
   "sample set",
   "back in stock",
   "seconds",
   "made to order",
   "change account email",
   "password",
   "unsubscribe from the newsletter",
   "delete my data"
  ],
  "topicPl": [
   "gdzie jest zamówienie",
   "zmiana adresu dostawy",
   "dopisanie do zamówienia",
   "anulowanie zamówienia",
   "brak w paczce",
   "pomyłka w paczce",
   "potwierdzenie zamówienia",
   "połączenie zamówień",
   "wysyłka prezentu",
   "pakowanie na prezent",
   "komplet z jednej partii",
   "czas dostawy",
   "opóźniona dostawa",
   "wysyłka za granicę",
   "odbiór w punkcie",
   "odbiór osobisty w pracowni",
   "dostawa na konkretny dzień",
   "paczka wróciła do nadawcy",
   "uszkodzona przesyłka",
   "zgnieciony karton",
   "uszkodzona rzecz, wymiana",
   "uszkodzona rzecz, pieniądze",
   "zwrot towaru",
   "status zwrotu",
   "wymiana na inny kolor",
   "zwrot rzeczy z personalizacją",
   "zwrot prezentu",
   "zwrot po terminie",
   "etykieta zwrotna",
   "odbiór zwrotu przez kuriera",
   "zgłoszenie reklamacji",
   "status reklamacji",
   "spękania szkliwa",
   "kolor inny niż na zdjęciu",
   "kubek przecieka",
   "odpadło ucho",
   "nieudana płatność",
   "podwójna płatność",
   "płatność przelewem",
   "kiedy wrócą pieniądze",
   "kod rabatowy",
   "płatność przy odbiorze",
   "faktura, kopia",
   "faktura na firmę",
   "faktura, poprawienie danych",
   "faktura korygująca po zwrocie",
   "faktura za warsztaty",
   "zmywarka",
   "mikrofalówka i piekarnik",
   "plamy i czyszczenie",
   "każda sztuka jest inna",
   "szkliwo a żywność",
   "imię na kubku",
   "czas wykonania personalizacji",
   "zmiana napisu",
   "logo firmy",
   "zapis na warsztaty",
   "zmiana terminu warsztatów",
   "odbiór wypalonych prac",
   "warsztaty dla grupy",
   "warsztaty dla dzieci",
   "zakup karty podarunkowej",
   "saldo karty podarunkowej",
   "karta po terminie",
   "warsztaty w prezencie",
   "ceny hurtowe",
   "zastawa dla kawiarni",
   "komplet próbny",
   "kiedy wróci do sprzedaży",
   "drugi gatunek",
   "na zamówienie",
   "zmiana adresu e-mail",
   "hasło do konta",
   "wypisanie z newslettera",
   "usunięcie danych"
  ]
 },
 "cards": [
  {
   "id": "c-opening-name-and-welcome",
   "c": "opening",
   "t": "Opening, name and welcome",
   "tPl": "Powitanie, przedstawienie się",
   "en": "{GREET}, {PAX}. Thank you for writing to Mirabelka. My name is {AGENT}, and I'll be glad to help.",
   "pl": "{GREET}, {PAX}. Dziękuję za wiadomość do Mirabelki. Nazywam się {AGENT} i chętnie pomogę.",
   "k": "powitanie greeting welcome hello przedstawienie introduction imię name",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-opening-the-order-in-hand",
   "c": "opening",
   "t": "Opening, the order in hand",
   "tPl": "Powitanie, zamówienie otwarte",
   "en": "{GREET}, {PAX}. Thank you for bearing with me. I have your order open in front of me now.",
   "pl": "{GREET}, {PAX}. Dziękuję za cierpliwość. Zamówienie mam już otwarte przed sobą.",
   "k": "powitanie greeting czekanie waiting zamówienie order otwarte",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-opening-a-familiar-name",
   "c": "opening",
   "t": "Opening, a familiar name",
   "tPl": "Powitanie, ponowna rozmowa",
   "en": "{GREET}, {PAX}. Lovely to hear from you again. What can I do for you today?",
   "pl": "{GREET}, {PAX}. Miło znów rozmawiać. W czym mogę dziś pomóc?",
   "k": "powitanie greeting znowu again returning stały regular ponownie",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-opening-first-message-of-the-day",
   "c": "opening",
   "t": "Opening, first message of the day",
   "tPl": "Powitanie, pierwsza wiadomość dnia",
   "en": "{GREET}, {PAX}. Thank you for your message, and for waiting until the chat opened. Yours is the first I'm answering today, so it has my full attention.",
   "pl": "{GREET}, {PAX}. Dziękuję za wiadomość i za cierpliwość do otwarcia czatu. Od niej zaczynam dziś pracę i mam dla niej tyle czasu, ile trzeba.",
   "k": "powitanie greeting rano morning noc overnight otwarcie opening czat chat",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-opening-sorry-for-the-wait",
   "c": "opening",
   "t": "Opening, sorry for the wait",
   "tPl": "Powitanie, przeprosiny za czekanie",
   "en": "{GREET}, {PAX}. I'm sorry to have kept you waiting so long. I'm here now, and yours is the only chat I'm looking at.",
   "pl": "{GREET}, {PAX}. Przepraszam za tak długie czekanie. Już jestem i zajmuję się tylko tą sprawą.",
   "k": "powitanie greeting przepraszam sorry czekanie wait kolejka queue",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-opening-asking-for-the-order-number",
   "c": "opening",
   "t": "Opening, asking for the order number",
   "tPl": "Powitanie, prośba o numer zamówienia",
   "en": "{GREET}, {PAX}. Thank you for writing to Mirabelka. Could you give me your order number? It's at the top of the confirmation email, and with it I can see everything at once.",
   "pl": "{GREET}, {PAX}. Dziękuję za wiadomość. Proszę o numer zamówienia: jest na samej górze maila z potwierdzeniem, a dzięki niemu od razu widzę wszystko, czego potrzeba.",
   "k": "powitanie greeting numer number zamówienie order potwierdzenie confirmation",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-opening-english-or-polish",
   "c": "opening",
   "t": "Opening, English or Polish",
   "tPl": "Powitanie, po polsku albo po angielsku",
   "en": "{GREET}, {PAX}. We're happy to write in English or in Polish, whichever is more comfortable for you. How can I help?",
   "pl": "{GREET}, {PAX}. Możemy pisać po polsku albo po angielsku, jak będzie wygodniej. W czym mogę pomóc?",
   "note": "For a customer who writes in one language and seems more at home in the other.",
   "notePl": "Gdy ktoś pisze w jednym języku, a swobodniej czuje się w drugim.",
   "k": "powitanie greeting język language polski polish angielski english",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-opening-when-something-went-wrong",
   "c": "opening",
   "t": "Opening, when something went wrong",
   "tPl": "Powitanie, gdy coś poszło nie tak",
   "en": "{GREET}, {PAX}. Thank you for telling us, and I'm sorry this has spoiled your day. Let me see what happened, and we'll put it right.",
   "pl": "{GREET}, {PAX}. Dziękuję za tę wiadomość. Bardzo przykro mi, że tak wyszło. Zaraz sprawdzę, co się stało, i razem to naprawimy.",
   "k": "powitanie greeting problem kłopot przykro sorry naprawa fix",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-opening-new-to-mirabelka",
   "c": "opening",
   "t": "Opening, new to Mirabelka",
   "tPl": "Powitanie, pierwszy kontakt",
   "en": "{GREET}, {PAX}. Thank you for finding us. Mirabelka is a small studio in Warsaw, and everything in the shop was thrown, glazed and fired here, so any question about a piece can go to the hands that made it. Where shall we start?",
   "pl": "{GREET}, {PAX}. Bardzo miło, że udało się do nas trafić. Mirabelka to mała pracownia w Warszawie i wszystko, co jest w sklepie, powstało tutaj, od toczenia po wypał. Każde pytanie o konkretną rzecz trafi więc do osoby, która ją zrobiła. Od czego zaczniemy?",
   "k": "powitanie greeting pierwszy first nowy new pracownia studio warszawa warsaw",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-holding-checking-now",
   "c": "holding",
   "t": "Holding, checking now",
   "tPl": "W trakcie, sprawdzam",
   "en": "Thank you, {PAX}. I'm checking that now and will be back with you in two or three minutes.",
   "pl": "Dziękuję, {PAX}. Już to sprawdzam i za dwie, trzy minuty wracam z odpowiedzią.",
   "k": "chwila moment sprawdzam checking czekanie wait minuty minutes",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-holding-asking-the-studio",
   "c": "holding",
   "t": "Holding, asking the studio",
   "tPl": "W trakcie, pytanie do pracowni",
   "en": "That's a question for the studio, so I'm asking the person who made the piece. It may take ten minutes or so, and I'll stay here in the chat until I have the answer.",
   "pl": "Tu najlepiej odpowie pracownia, więc pytam osobę, która toczyła tę rzecz. Może to potrwać około dziesięciu minut; do tego czasu jestem tutaj, w tej rozmowie.",
   "k": "pracownia studio garncarz potter pytanie question twórca maker"
  },
  {
   "id": "c-holding-the-answer-by-email",
   "c": "holding",
   "t": "Holding, the answer by email",
   "tPl": "W trakcie, odpowiedź mailem",
   "en": "This one will take a little longer, {PAX}. Rather than keep you waiting in the chat, I'll email you the answer before the end of today. Is the address on the order the best one to use?",
   "pl": "To zajmie trochę więcej czasu, {PAX}. Żeby nie trzeba było czekać na czacie, odpowiedź wyślę mailem jeszcze dziś. Czy adres z zamówienia jest właściwy?",
   "k": "mail email później later odpowiedź answer adres address",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-holding-the-maker-will-answer",
   "c": "holding",
   "t": "Holding, the maker will answer",
   "tPl": "W trakcie, odpowie pracownia",
   "en": "Thank you, {PAX}. I'm taking your question to {ROLE} in the studio, who knows this piece better than anyone. I'll be back here with the answer in a few minutes.",
   "pl": "Dziękuję, {PAX}. Pytanie zanoszę do pracowni. Odpowie {ROLE}, bo nikt nie zna tej rzeczy lepiej. Za kilka minut wracam tu z odpowiedzią.",
   "note": "Pick from the list the person who made the piece or mixed its glaze.",
   "notePl": "Z listy wybieramy osobę, która zrobiła tę rzecz albo przygotowała jej szkliwo.",
   "k": "pracownia studio twórca maker szkliwo glaze pytanie question",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-holding-an-answer-by-a-set-time",
   "c": "holding",
   "t": "Holding, an answer by a set time",
   "tPl": "W trakcie, odpowiedź o konkretnej porze",
   "en": "I'd rather give you a full answer than a quick one, {PAX}, so let me promise a time: you'll have it by email {DAYPART:before lunch|by the end of the afternoon|before the chat closes at 20:00}.",
   "pl": "Wolę odpowiedzieć porządnie niż szybko, {PAX}, więc obiecuję konkretny termin: odpowiedź przyjdzie mailem {DAYPART:jeszcze przed obiadem|do końca popołudnia|przed zamknięciem czatu o 20:00}.",
   "k": "później later mail email termin time obietnica promise dokładnie properly",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-holding-the-potters-answer-later",
   "c": "holding",
   "t": "Holding, the potters answer later",
   "tPl": "W trakcie, pracownia odpowie później",
   "en": "Thank you, {PAX}. {DAYPART:The potters are at the wheel at the moment, so I'll catch them between one bowl and the next and email you their answer later today|It's evening, and the person who can answer this is back at the studio tomorrow morning, so I'll ask first thing and email you before noon}.",
   "pl": "Dziękuję, {PAX}. {DAYPART:W pracowni trwa właśnie toczenie, więc zapytam w przerwie między jedną miską a drugą i odpiszę mailem jeszcze przed obiadem|W pracowni trwa właśnie toczenie, więc zapytam w przerwie między jedną miską a drugą i odpiszę mailem jeszcze dziś|Osoba, która może na to odpowiedzieć, będzie w pracowni jutro rano, więc zapytam od razu i odpiszę mailem przed południem}.",
   "note": "On a Saturday evening, tomorrow is Sunday: write Monday in its place before sending.",
   "notePl": "W sobotę wieczorem jutro to niedziela: przed wysłaniem trzeba wpisać poniedziałek.",
   "k": "pracownia studio koło wheel toczenie throwing jutro tomorrow mail email",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-holding-still-on-it",
   "c": "holding",
   "t": "Holding, still on it",
   "tPl": "W trakcie, wciąż sprawdzam",
   "en": "Still with you, {PAX}. It's taking a little longer than it should, but I haven't forgotten you.",
   "pl": "Jeszcze chwila, {PAX}. Sprawdzanie trwa trochę dłużej, niż powinno, ale nigdzie nie znikam.",
   "k": "chwila moment dłużej longer czekanie wait wciąż still",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-holding-a-photo-would-help",
   "c": "holding",
   "t": "Holding, a photo would help",
   "tPl": "W trakcie, prośba o zdjęcie",
   "en": "Could you send me a photo, {PAX}? Seeing the piece will tell me more than any description, and daylight from a window shows the glaze best.",
   "pl": "Czy można prosić o zdjęcie, {PAX}? Zdjęcie powie więcej niż najlepszy opis, a szkliwo najlepiej widać w świetle dziennym, przy oknie.",
   "k": "zdjęcie photo fotografia picture światło light szkliwo glaze",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-holding-looking-at-the-shelf-myself",
   "c": "holding",
   "t": "Holding, looking at the shelf myself",
   "tPl": "W trakcie, sprawdzam półkę na miejscu",
   "en": "Give me a moment, {PAX}. The stock room is a few steps from my desk, and I'd rather look at the shelf myself than trust the screen.",
   "pl": "Proszę o chwilę, {PAX}. Magazyn jest kilka kroków od mojego biurka, a półkę wolę sprawdzić na miejscu, niż wierzyć ekranowi.",
   "k": "magazyn stock półka shelf dostępność sprawdzam checking",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-holding-note-to-the-studio",
   "c": "holding",
   "t": "Holding, note to the studio",
   "tPl": "W trakcie, notatka dla pracowni",
   "en": "For {ROLE}. A question from the chat, {PAX}: [question]. I've promised an answer by [time]; could you let me know before then? Thank you. {INIT}",
   "pl": "Dla: {ROLE}. Pytanie z czatu, {PAX}: [pytanie]. Odpowiedź obiecano do [godzina]; czy uda się zdążyć? Dziękuję. {INIT}",
   "note": "For the studio's own chat, never the customer's: fill in the question and the time promised.",
   "notePl": "Do czatu pracowni, nigdy do rozmowy z klientem: wystarczy wpisać pytanie i obiecaną godzinę.",
   "k": "notatka note pracownia studio przekazanie handover pytanie question",
   "firstOnly": 1,
   "paxVoc": 0
  },
  {
   "id": "c-holding-handing-the-chat-over",
   "c": "holding",
   "t": "Holding, handing the chat over",
   "tPl": "W trakcie, przekazanie rozmowy",
   "en": "For {ROLE}. A chat to take over, {PAX}. Order [order number]; the matter: [matter]; promised so far: [promise]. Thank you. {INIT}",
   "pl": "Dla: {ROLE}. Rozmowa do przejęcia, {PAX}. Zamówienie [numer zamówienia]; sprawa: [sprawa]; dotąd obiecano: [obietnica]. Dziękuję. {INIT}",
   "note": "Pasted to the colleague taking over, never to the customer.",
   "notePl": "Wklejana osobie, która przejmuje rozmowę, nigdy do klienta.",
   "k": "przekazanie handover zmiana shift kolega colleague rozmowa chat",
   "firstOnly": 1,
   "paxVoc": 0
  },
  {
   "id": "c-closing-anything-else",
   "c": "closing",
   "t": "Closing, anything else",
   "tPl": "Pożegnanie, coś jeszcze",
   "en": "Is there anything else I can help with, {PAX}?",
   "pl": "Czy mogę jeszcze w czymś pomóc, {PAX}?",
   "k": "coś jeszcze anything else pytanie question pomoc help",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-closing-thanks-naming-the-matter",
   "c": "closing",
   "t": "Closing, thanks naming the matter",
   "tPl": "Pożegnanie, podziękowanie za sprawę",
   "en": "Thank you for writing to us about {INTENT}, {PAX}. I hope it's all settled now, and that the next cup of tea tastes all the better for it.",
   "pl": "Dziękuję za wiadomość w związku {Z} {INTENT}, {PAX}. Mam nadzieję, że wszystko jest już na swoim miejscu, a następna herbata będzie przez to smakować jeszcze lepiej.",
   "k": "dziękuję thanks sprawa matter herbata tea",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-closing-what-was-done",
   "c": "closing",
   "t": "Closing, what was done",
   "tPl": "Pożegnanie, co zostało zrobione",
   "en": "Before you go, {PAX}, here is what's been done today: {ACTION}. If anything doesn't turn out as described, write to us here and we'll pick it up straight away.",
   "pl": "Na koniec krótkie podsumowanie, {PAX}: {ACTION}. Gdyby coś potoczyło się inaczej, niż tu opisano, wystarczy napisać, a od razu się tym zajmiemy.",
   "note": "Choose the intents first; with none chosen, the summary says no action was taken.",
   "notePl": "Najpierw wybieramy intencje; bez nich podsumowanie mówi, że nic nie zrobiono.",
   "k": "podsumowanie summary zrobione done działania actions",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-closing-summary-by-email",
   "c": "closing",
   "t": "Closing, summary by email",
   "tPl": "Pożegnanie, podsumowanie mailem",
   "en": "Subject: {TOPIC}\n\n{GREET}, {PAX}. As promised in our chat, here is everything in writing. What's been done: {ACTION}.\n\nIf anything more comes up about {INTENT}, a reply to this email reaches me directly.\n\nKind regards,\n{AGENT}\nMirabelka",
   "pl": "Temat: {TOPIC}\n\n{GREET}, {PAX}. Zgodnie z obietnicą z czatu, wszystko na piśmie. Co zostało zrobione: {ACTION}.\n\nGdyby w związku {Z} {INTENT} pojawiło się jeszcze jakieś pytanie, wystarczy odpowiedzieć na tę wiadomość, a odpowiedź trafi prosto do mnie.\n\nPozdrawiam serdecznie,\n{AGENT}\nMirabelka",
   "k": "mail email podsumowanie summary temat subject piśmie writing",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-closing-after-a-problem-put-right",
   "c": "closing",
   "t": "Closing, after a problem put right",
   "tPl": "Pożegnanie, po naprawionym kłopocie",
   "en": "Thank you for your patience, {PAX}, and I'm sorry for the trouble. It's put right now, and I hope the piece gives you many good years from here on.",
   "pl": "Dziękuję za cierpliwość, {PAX}, i przepraszam za kłopot. Wszystko jest już naprawione, a ta rzecz niech teraz służy przez długie lata.",
   "k": "cierpliwość patience przepraszam sorry kłopot trouble",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-closing-kind-words-for-the-studio",
   "c": "closing",
   "t": "Closing, kind words for the studio",
   "tPl": "Pożegnanie, miłe słowa dla pracowni",
   "en": "Thank you so much, {PAX}. I'll pass your words on to the studio: it always warms the room to hear how a piece is getting on once it has left the kiln.",
   "pl": "Bardzo dziękuję, {PAX}. Te słowa przekażę do pracowni: zawsze robi się tam cieplej, gdy przychodzi wiadomość, jak radzi sobie rzecz, która opuściła już piec.",
   "k": "pochwała praise miłe kind słowa words pracownia studio",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-closing-thanks-and-signature",
   "c": "closing",
   "t": "Closing, thanks and signature",
   "tPl": "Pożegnanie, podziękowanie i podpis",
   "en": "Thank you for shopping with us, {PAX}, and enjoy every cup.\n\nKind regards,\n{AGENT}\nMirabelka",
   "pl": "Dziękuję za zakupy w Mirabelce, {PAX}, i życzę wielu dobrych chwil przy stole.\n\nPozdrawiam serdecznie,\n{AGENT}\nMirabelka",
   "k": "podpis signature zakupy shopping pozdrawiam regards",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-closing-by-the-hour",
   "c": "closing",
   "t": "Closing, by the hour",
   "tPl": "Pożegnanie, miłego dnia",
   "en": "Thank you for writing, {PAX}. Have a lovely {DAYPART:morning|afternoon|evening}.",
   "pl": "Dziękuję za rozmowę, {PAX}. {DAYPART:Miłego dnia|Miłego wieczoru}.",
   "k": "miłego dnia wieczoru lovely day evening",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-closing-the-chat-closing-for-the-night",
   "c": "closing",
   "t": "Closing, the chat closing for the night",
   "tPl": "Pożegnanie, czat zamyka się na noc",
   "en": "Your message is safe with us, {PAX}. The chat closes at 20:00, and yours will be the first thing we read when it opens again at 9:00.",
   "pl": "Wiadomość na pewno nie przepadnie, {PAX}. Czat zamykamy o 20:00, a gdy znów się otworzy, o 9:00, przeczytamy ją jako pierwszą.",
   "k": "godziny hours czat chat noc night zamknięte closed",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-closing-note-for-the-order-record",
   "c": "closing",
   "t": "Note for the order record",
   "tPl": "Notatka do zamówienia",
   "en": "Subject: {TOPIC}. Done: {ACTION}. {INIT}, {DAYPART:morning|afternoon|evening}.",
   "pl": "Temat: {TOPIC}. Działania: {ACTION}. {INIT}, {DAYPART:rano|po południu|wieczorem}.",
   "note": "For the order record, not the chat: it pastes in Polish whatever the chat's language.",
   "notePl": "Do historii zamówienia, nie do czatu: wkleja się po polsku bez względu na język rozmowy.",
   "k": "notatka note historia record log",
   "lockLang": "pl"
  },
  {
   "id": "c-orders-where-it-is-now",
   "c": "orders",
   "t": "Order, where it is now",
   "tPl": "Zamówienie, gdzie teraz jest",
   "en": "{GREET}, {PAX}. Your order left the studio yesterday and is with the courier now. It should be with you tomorrow, and this link shows each step of the way: [tracking link]",
   "pl": "{GREET}, {PAX}. Zamówienie wyjechało wczoraj z pracowni i jest już u kuriera. Powinno dotrzeć jutro, a pod tym linkiem widać każdy etap drogi: [link do śledzenia]",
   "k": "śledzenie tracking kurier courier gdzie where paczka parcel link",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    0
   ]
  },
  {
   "id": "c-orders-at-the-packing-table",
   "c": "orders",
   "t": "Order, at the packing table",
   "tPl": "Zamówienie, na stole do pakowania",
   "en": "{GREET}, {PAX}. Your order is at the packing table today, being wrapped piece by piece, and it will leave the studio with the courier no later than [date]. The tracking link follows by email the moment it's on its way.",
   "pl": "{GREET}, {PAX}. Zamówienie jest dziś na stole do pakowania: każdą rzecz owijamy osobno w papier. Z pracowni wyjedzie najpóźniej [data], a link do śledzenia przyjdzie mailem, gdy tylko paczka ruszy.",
   "k": "pakowanie packing wysyłka dispatch kiedy when gdzie where",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    0
   ]
  },
  {
   "id": "c-orders-new-delivery-address",
   "c": "orders",
   "t": "Order, new delivery address",
   "tPl": "Zamówienie, zmiana adresu",
   "en": "Done, {PAX}. The new address is on the order now, and the parcel will go straight there. The confirmation email shows it too.",
   "pl": "Gotowe, {PAX}. Nowy adres jest już w zamówieniu i paczka pojedzie prosto pod niego. Będzie też widoczny w mailu z potwierdzeniem.",
   "k": "adres address zmiana change dostawa delivery przeprowadzka moved",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    1
   ]
  },
  {
   "id": "c-orders-adding-a-piece",
   "c": "orders",
   "t": "Order, adding a piece",
   "tPl": "Zamówienie, dopisanie rzeczy",
   "en": "Of course, {PAX}. Your order hasn't left the studio yet, so there's time. The simplest way is a second order for the extra piece: send me its number once it's placed, and we'll pack everything into one box so it all travels together.",
   "pl": "Oczywiście, {PAX}. Zamówienie jeszcze nie wyjechało z pracowni, więc jest czas. Najprościej złożyć drugie zamówienie na dodatkową rzecz i przesłać mi jego numer, a spakujemy wszystko do jednego kartonu, żeby pojechało razem.",
   "note": "Only while the first order is still at the studio.",
   "notePl": "Tylko dopóki pierwsze zamówienie jest jeszcze w pracowni.",
   "k": "dopisać add dodatkowy extra jeszcze another drugie second",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    2
   ]
  },
  {
   "id": "c-orders-two-orders-in-one-box",
   "c": "orders",
   "t": "Order, two orders in one box",
   "tPl": "Zamówienie, dwa zamówienia w jednej paczce",
   "en": "Both orders are still at the studio, {PAX}, so we'll pack them together and send them as one parcel. A single tracking link will reach you by email when it leaves.",
   "pl": "Oba zamówienia są jeszcze w pracowni, {PAX}, więc spakujemy je razem i wyślemy jedną paczką. Gdy wyjedzie, przyjdzie mailem jeden link do śledzenia.",
   "k": "połączyć combine razem together jedna one paczka parcel dwa two",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    7,
    2
   ]
  },
  {
   "id": "c-orders-cancelling-before-it-leaves",
   "c": "orders",
   "t": "Order, cancelling before it leaves",
   "tPl": "Zamówienie, anulowanie przed wysyłką",
   "en": "Of course, {PAX}. Your order hadn't left the studio, so it's cancelled now, and the full amount is on its way back to the card or account you paid from. Banks usually show it within three working days.",
   "pl": "Oczywiście, {PAX}. Zamówienie nie zdążyło wyjechać z pracowni, więc jest już anulowane, a cała kwota wraca na kartę albo konto, z którego przyszła płatność. Bank zwykle pokazuje ją w ciągu trzech dni roboczych.",
   "k": "anulować cancel rezygnacja cancellation pieniądze money",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    3
   ]
  },
  {
   "id": "c-orders-cancelling-once-it-has-left",
   "c": "orders",
   "t": "Order, cancelling once it has left",
   "tPl": "Zamówienie, anulowanie po wysyłce",
   "en": "Your order is already on its way to you, {PAX}, so the courier will bring it as planned. Once it arrives, it can come back to us like any purchase: you have 14 days, no reason is needed, and I'll email you a label. The money goes back to your card within three days of the parcel reaching us.",
   "pl": "Zamówienie jest już w drodze, {PAX}, więc kurier dostarczy je zgodnie z planem. Po odbiorze można je odesłać jak każdy zakup: jest na to 14 dni, bez podawania przyczyny, a etykietę prześlę mailem. Pieniądze wrócą na kartę w ciągu trzech dni od dotarcia paczki do pracowni.",
   "note": "Not for a personalised piece, which cannot come back on a change of mind.",
   "notePl": "Nie dla rzeczy z personalizacją, której nie przyjmujemy z powodu zmiany zdania.",
   "k": "anulować cancel rezygnacja cancellation wysłane sent odesłać",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    3
   ]
  },
  {
   "id": "c-orders-confirmation-sent-again",
   "c": "orders",
   "t": "Order, confirmation sent again",
   "tPl": "Zamówienie, ponowne potwierdzenie",
   "en": "{GREET}, {PAX}. Your order is safely with us. I've sent the confirmation again to [email address]; if it hasn't arrived in a few minutes, it may be waiting in the spam folder.",
   "pl": "{GREET}, {PAX}. Zamówienie jest u nas bezpieczne. Potwierdzenie jest już ponownie w drodze na adres [adres e-mail]; gdyby nie dotarło w ciągu kilku minut, warto zajrzeć do folderu ze spamem.",
   "k": "potwierdzenie confirmation mail email spam nie przyszło",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    6
   ]
  },
  {
   "id": "c-orders-payment-not-through",
   "c": "orders",
   "t": "Order, payment not through",
   "tPl": "Zamówienie, płatność nie przeszła",
   "en": "Your order is saved, {PAX}, and waiting for payment. This link lets you pay again, by card, BLIK or bank transfer: [payment link]. With a transfer, we hold the order for three days while the money finds its way.",
   "pl": "Zamówienie jest zapisane i czeka na płatność, {PAX}. Pod tym linkiem można zapłacić ponownie, kartą, przez BLIK albo przelewem: [link do płatności]. Na przelew zamówienie czeka trzy dni.",
   "k": "płatność payment karta card blik przelew transfer odrzucona declined",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    36
   ]
  },
  {
   "id": "c-orders-charged-twice",
   "c": "orders",
   "t": "Order, charged twice",
   "tPl": "Zamówienie, podwójna płatność",
   "en": "Thank you for telling me, {PAX}. I can see both payments, and the second one is on its way back to you today. Banks usually show it within three working days, and the order itself goes ahead as normal.",
   "pl": "Dziękuję za informację, {PAX}. Obie płatności są widoczne, a druga wraca jeszcze dziś. Bank zwykle pokazuje ją w ciągu trzech dni roboczych, a samo zamówienie idzie dalej swoim trybem.",
   "k": "dwa two podwójnie twice płatność payment obciążenie charge",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    37
   ]
  },
  {
   "id": "c-orders-paying-by-transfer",
   "c": "orders",
   "t": "Order, paying by transfer",
   "tPl": "Zamówienie, płatność przelewem",
   "en": "Of course, {PAX}. Choose bank transfer at checkout, and the account details and the reference come in your confirmation email. We hold the order for three days while the money finds its way, and it leaves the studio once it has arrived.",
   "pl": "Oczywiście, {PAX}. Przy zamówieniu wystarczy wybrać przelew, a numer konta i tytuł przelewu przyjdą w mailu z potwierdzeniem. Zamówienie czeka na wpłatę trzy dni, a z pracowni wyjeżdża, gdy tylko pieniądze dotrą.",
   "k": "przelew transfer konto account bank tytuł reference",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    38
   ]
  },
  {
   "id": "c-orders-a-discount-code",
   "c": "orders",
   "t": "Order, a discount code",
   "tPl": "Zamówienie, kod rabatowy",
   "en": "Let me look at it with you, {PAX}. The code goes in the box beneath the basket, before payment, and the total changes at once. Could you send me the code? I'll check that it's still valid and what it covers.",
   "pl": "Chętnie pomogę, {PAX}. Kod wpisuje się w polu pod koszykiem, przed płatnością, a suma od razu się zmienia. Czy można przesłać ten kod? Sprawdzę, czy jest jeszcze ważny i czego dotyczy.",
   "k": "kod code rabat discount zniżka promocja promotion koszyk basket",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    40
   ]
  },
  {
   "id": "c-orders-bought-for-a-company",
   "c": "orders",
   "t": "Order, bought for a company",
   "tPl": "Zamówienie, zakup na firmę",
   "en": "Of course, {PAX}. Send me the company's full name, its address and its VAT number, and the invoice will be made out to the company and emailed to you with the order.",
   "pl": "Oczywiście, {PAX}. Wystarczy podać pełną nazwę firmy, adres i NIP, a faktura zostanie wystawiona na firmę i przyjdzie mailem razem z zamówieniem.",
   "k": "firma company nip vat biuro office dane details",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    43
   ]
  },
  {
   "id": "c-orders-a-piece-missing",
   "c": "orders",
   "t": "Order, a piece missing",
   "tPl": "Zamówienie, brak w paczce",
   "en": "I'm sorry, {PAX}. Could you look through the paper in the box once more? We wrap every piece generously, and a small cup can hide in a sheet of it. If it isn't there, tell me, and the missing piece leaves the studio tomorrow with nothing to pay.",
   "pl": "Przepraszam za kłopot, {PAX}. Czy można jeszcze raz przejrzeć papier w kartonie? Każdą rzecz owijamy hojnie i mała filiżanka potrafi się w nim schować. Gdyby brakującej rzeczy tam nie było, wystarczy dać znać, a wyjedzie z pracowni jutro, bez żadnych opłat.",
   "k": "brak missing brakuje papier paper karton box niekompletne incomplete",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    4
   ]
  },
  {
   "id": "c-orders-the-wrong-piece-sent",
   "c": "orders",
   "t": "Order, the wrong piece sent",
   "tPl": "Zamówienie, pomyłka w paczce",
   "en": "{GREET}, {PAX}. I'm sorry: that was our mistake at the packing table. The right piece leaves the studio tomorrow, and the courier will collect the stray one from your door on a working day you choose, bringing the label along. There's nothing to pay either way. Which day suits you best?\n\nKind regards,\n{AGENT}",
   "pl": "{GREET}, {PAX}. Przepraszam, to nasza pomyłka przy pakowaniu. Właściwa rzecz wyjedzie z pracowni jutro, a zabłąkaną kurier odbierze spod drzwi w wybrany dzień roboczy i przywiezie etykietę ze sobą. Za nic nie trzeba płacić. Który dzień będzie najwygodniejszy?\n\nPozdrawiam serdecznie,\n{AGENT}",
   "k": "pomyłka mistake zły wrong inny different wymiana swap kurier courier",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    5
   ]
  },
  {
   "id": "c-orders-late-leaving-the-studio",
   "c": "orders",
   "t": "Order, late leaving the studio",
   "tPl": "Zamówienie, opóźniona wysyłka",
   "en": "I'm sorry, {PAX}. Your order should have left us by now, and the delay is ours, not the courier's. It leaves the studio tomorrow, and I'll send you the tracking link myself as soon as it's on its way.",
   "pl": "Przepraszam, {PAX}. Zamówienie powinno już być w drodze i to opóźnienie jest po naszej stronie, nie po stronie kuriera. Wyjedzie z pracowni jutro, a link do śledzenia prześlę osobiście, gdy tylko paczka ruszy.",
   "k": "opóźnienie delay późno late wysyłka dispatch przepraszam sorry",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    12
   ]
  },
  {
   "id": "c-orders-sent-as-a-gift",
   "c": "orders",
   "t": "Order, sent as a gift",
   "tPl": "Zamówienie, wysyłka prezentu",
   "en": "What a lovely idea, {PAX}. Put the recipient's name and address in as the delivery address, and your own details as the buyer's. The invoice comes to you by email, so there won't be a price anywhere in the parcel.",
   "pl": "Piękny pomysł, {PAX}. Wystarczy wpisać imię i adres obdarowanej osoby jako adres dostawy, a własne dane jako dane zamawiającego. Faktura przychodzi mailem, więc w paczce nie będzie żadnej ceny.",
   "k": "prezent gift present adres address cena price niespodzianka surprise",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    8
   ]
  },
  {
   "id": "c-orders-wrapped-as-a-gift",
   "c": "orders",
   "t": "Order, wrapped as a gift",
   "tPl": "Zamówienie, pakowanie na prezent",
   "en": "Of course, {PAX}. Every piece travels in our paper anyway, and for a present we tie the box with a ribbon in our mirabelle yellow. Tell me a few words for the card inside, and I'll write them in by hand.",
   "pl": "Oczywiście, {PAX}. Każda rzecz i tak podróżuje w naszym papierze, a karton z prezentem przewiązujemy wstążką w kolorze mirabelki. Wystarczy podać kilka słów do bileciku, a wpiszę je ręcznie.",
   "k": "pakowanie wrapping prezent gift wstążka ribbon bilecik card",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    9
   ]
  },
  {
   "id": "c-orders-pieces-from-one-firing",
   "c": "orders",
   "t": "Order, pieces from one firing",
   "tPl": "Zamówienie, komplet z jednej partii",
   "en": "Gladly, {PAX}. Every firing turns out a little differently, so for a set that should sit well together, we choose the pieces from one batch by hand, side by side on the shelf. Mention it in the note to your order, or tell me here and I'll add it. If one batch hasn't enough, I'll tell you before anything is sent.",
   "pl": "Chętnie, {PAX}. Każdy wypał wychodzi trochę inaczej, dlatego do kompletu, który ma do siebie pasować, dobieramy rzeczy z jednej partii, ręcznie, stawiając je obok siebie na półce. Wystarczy wspomnieć o tym w uwagach do zamówienia albo napisać tutaj, a dopiszę to. Gdyby w jednej partii zabrakło sztuk, dam znać przed wysyłką.",
   "k": "komplet set partia batch wypał firing pasujące matching zestaw",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    10
   ]
  },
  {
   "id": "c-orders-collecting-at-the-studio",
   "c": "orders",
   "t": "Order, collecting at the studio",
   "tPl": "Zamówienie, odbiór w pracowni",
   "en": "Of course, {PAX}. Choose collection from the studio at checkout, and there's no delivery to pay. We'll email you when your order is wrapped and waiting by the door, and you're welcome from Tuesday to Saturday, 11:00 to 19:00.",
   "pl": "Oczywiście, {PAX}. Przy zamówieniu wystarczy wybrać odbiór w pracowni i dostawy nie trzeba opłacać. Gdy paczka będzie zapakowana i gotowa, przyjdzie mail, a pracownia zaprasza od wtorku do soboty, od 11:00 do 19:00.",
   "k": "odbiór collect osobiście person pracownia studio warszawa warsaw godziny hours",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    15
   ]
  },
  {
   "id": "c-orders-needed-by-a-date",
   "c": "orders",
   "t": "Order, needed by a date",
   "tPl": "Zamówienie, potrzebne na konkretny dzień",
   "en": "Of course, {PAX}. Pieces in stock leave the studio within two working days and reach an address in Poland the working day after, so an order placed today will be with you by [date].",
   "pl": "Oczywiście, {PAX}. Rzeczy dostępne od ręki wyjeżdżają z pracowni w ciągu dwóch dni roboczych, a pod adres w Polsce docierają następnego dnia roboczego, więc zamówienie złożone dziś dotrze najpóźniej [data].",
   "note": "Count working days only; a weekend or a public holiday adds to the wait.",
   "notePl": "Liczymy tylko dni robocze; weekend albo święto wydłuża czekanie.",
   "k": "termin date zdążyć time urodziny birthday święta holiday kiedy when",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    16
   ]
  },
  {
   "id": "c-orders-a-named-piece-by-a-date",
   "c": "orders",
   "t": "Order, a named piece by a date",
   "tPl": "Zamówienie, rzecz z imieniem na termin",
   "en": "{GREET}, {PAX}. A name is painted by hand before the firing, so a personalised piece leaves the studio about ten working days after the order and arrives the working day after that. Ordered today, it would reach you around [date].",
   "pl": "{GREET}, {PAX}. Imię malujemy ręcznie przed wypaleniem, więc rzecz z personalizacją wyjeżdża z pracowni około dziesięciu dni roboczych po zamówieniu i dociera następnego dnia roboczego. Zamówiona dziś, dotrze około [data].",
   "k": "imię name personalizacja personalisation termin date zdążyć",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    16,
    52
   ]
  },
  {
   "id": "c-orders-a-name-on-a-mug",
   "c": "orders",
   "t": "Order, a name on a mug",
   "tPl": "Zamówienie, imię na kubku",
   "en": "A name makes a mug truly someone's own, {PAX}. We paint it by hand before the firing, up to 12 letters, so it becomes part of the glaze and never wears away. Write it in the personalisation box on the product page, exactly as it should appear, and the mug leaves the studio about ten working days after the order.",
   "pl": "Z imieniem kubek staje się naprawdę czyjś, {PAX}. Malujemy je ręcznie przed wypaleniem, do 12 liter, więc wtapia się w szkliwo i nie ściera się z czasem. Wystarczy wpisać je na stronie produktu w polu personalizacji, dokładnie tak, jak ma wyglądać, a kubek wyjedzie z pracowni około dziesięciu dni roboczych po zamówieniu.",
   "k": "imię name kubek mug napis inscription personalizacja personalisation",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    52
   ]
  },
  {
   "id": "c-orders-changing-the-wording",
   "c": "orders",
   "t": "Order, changing the wording",
   "tPl": "Zamówienie, zmiana napisu",
   "en": "Of course, {PAX}. The wording can change until it's painted, which is within two working days of the order, and yours is still waiting for the brush. Tell me the new wording, letter by letter, and I'll pass it to the studio today.",
   "pl": "Oczywiście, {PAX}. Napis można zmienić, dopóki nie jest namalowany, czyli w ciągu dwóch dni roboczych od zamówienia, a ten jeszcze czeka na pędzel. Wystarczy podać nową treść, litera po literze, a jeszcze dziś przekażę ją do pracowni.",
   "note": "Only within two working days of the order; after that the name is already painted.",
   "notePl": "Tylko w ciągu dwóch dni roboczych od zamówienia; później imię jest już namalowane.",
   "k": "napis inscription zmiana change literówka typo imię name",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    54
   ]
  },
  {
   "id": "c-orders-parcel-came-back-to-us",
   "c": "orders",
   "t": "Order, parcel came back to us",
   "tPl": "Zamówienie, paczka wróciła do pracowni",
   "en": "Your parcel has come back to the studio, {PAX}, safe and sound and still sealed. Could you check the address for me? As soon as I have it, the parcel goes out again.",
   "pl": "Paczka wróciła do pracowni, {PAX}, cała i nietknięta. Czy można sprawdzić adres? Gdy tylko będzie potwierdzony, paczka znów wyjedzie.",
   "k": "wróciła back nadawca sender adres address ponownie again",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    17
   ]
  },
  {
   "id": "c-orders-thank-you-for-a-first-order",
   "c": "orders",
   "t": "Order, thank you for a first order",
   "tPl": "Zamówienie, podziękowanie za pierwsze zakupy",
   "en": "Thank you for your first order with us, {PAX}. Everything in it was thrown and glazed here in the studio, so each piece has its own small character, and we hope it settles in happily with you.",
   "pl": "Dziękuję za pierwsze zakupy w Mirabelce, {PAX}. Wszystko w tym zamówieniu powstało u nas w pracowni, więc każda rzecz ma swój mały charakter. Mamy nadzieję, że szybko się zadomowi.",
   "k": "dziękuję thanks pierwsze first zamówienie order nowy new",
   "firstOnly": 1,
   "paxVoc": 1
  },
  {
   "id": "c-delivery-how-long-it-takes",
   "c": "delivery",
   "t": "Delivery, how long it takes",
   "tPl": "Dostawa, ile to trwa",
   "en": "{GREET}, {PAX}. Pieces in stock leave the studio within two working days, and in Poland they arrive the working day after dispatch, by courier or to a parcel locker. To the rest of the EU and to the UK, allow four to seven working days by courier.",
   "pl": "{GREET}, {PAX}. Rzeczy dostępne od ręki wyjeżdżają z pracowni w ciągu dwóch dni roboczych, a w Polsce docierają następnego dnia roboczego po nadaniu, kurierem albo do automatu paczkowego. Do innych krajów Unii i do Wielkiej Brytanii kurier jedzie od czterech do siedmiu dni roboczych.",
   "k": "czas time ile how long dni days kiedy when wysyłka dispatch",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    11
   ]
  },
  {
   "id": "c-delivery-what-it-costs",
   "c": "delivery",
   "t": "Delivery, what it costs",
   "tPl": "Dostawa, ile kosztuje",
   "en": "Within Poland, delivery by courier is 18 zł and to a parcel locker 14 zł, and both are free on orders over 300 zł. Abroad, the price depends on the country and appears at checkout, before you pay.",
   "pl": "W Polsce dostawa kurierem kosztuje 18 zł, a do automatu paczkowego 14 zł; przy zamówieniu powyżej 300 zł obie są bezpłatne. Za granicę cena zależy od kraju i pojawia się przy zamówieniu, jeszcze przed płatnością.",
   "k": "koszt cost cena price darmowa free kurier courier automat locker",
   "intents": [
    14,
    13
   ]
  },
  {
   "id": "c-delivery-running-late",
   "c": "delivery",
   "t": "Delivery, running late",
   "tPl": "Dostawa, opóźnienie",
   "en": "I'm sorry for the wait, {PAX}. The courier's network is running a day behind this week, and your parcel is in the queue at the depot. I'm keeping an eye on it and will write the moment it moves.",
   "pl": "Przepraszam za to czekanie, {PAX}. Przewoźnik ma w tym tygodniu jednodniowe opóźnienie, a paczka czeka w kolejce w sortowni. Pilnuję jej i napiszę, gdy tylko ruszy dalej.",
   "k": "opóźnienie delay późno late sortownia depot kurier courier",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    12,
    0
   ]
  },
  {
   "id": "c-delivery-tracking-standing-still",
   "c": "delivery",
   "t": "Delivery, tracking standing still",
   "tPl": "Dostawa, śledzenie stoi w miejscu",
   "en": "I'm sorry, {PAX}. When tracking stands still for two days, it's time to ask, so I've opened an enquiry with the courier and will write to you the moment they answer. If the parcel has gone astray, a new one will be on its way to you.",
   "pl": "Przepraszam, {PAX}. Gdy śledzenie stoi w miejscu dwa dni, czas zapytać, więc zgłaszam sprawę przewoźnikowi i napiszę, gdy tylko odpowie. Gdyby paczka zaginęła, wyślemy nową.",
   "k": "śledzenie tracking stoi stuck zaginęła lost reklamacja enquiry kurier courier",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    12,
    0
   ]
  },
  {
   "id": "c-delivery-marked-delivered-not-arrived",
   "c": "delivery",
   "t": "Delivery, marked delivered, not arrived",
   "tPl": "Dostawa, doręczona, a jej nie ma",
   "en": "I'm sorry, {PAX}, that's worrying. Couriers sometimes leave a parcel with a neighbour or in a sheltered corner by the door, so it's worth a look round and a knock next door. If it hasn't turned up by tomorrow, tell me, and I'll take it up with the courier; one way or another, your order or your money will reach you.",
   "pl": "Przepraszam za ten kłopot, {PAX}. Zdarza się, że kurier zostawia paczkę u sąsiadów albo w osłoniętym miejscu przy drzwiach, więc warto się rozejrzeć i zapukać obok. Jeśli do jutra się nie znajdzie, wystarczy dać znać: wyjaśnię sprawę z przewoźnikiem, a tak czy inaczej dotrze albo zamówienie, albo pieniądze.",
   "k": "doręczona delivered nie ma missing sąsiad neighbour drzwi door",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    0
   ]
  },
  {
   "id": "c-delivery-the-courier-found-nobody-in",
   "c": "delivery",
   "t": "Delivery, the courier found nobody in",
   "tPl": "Dostawa, kurier nikogo nie zastał",
   "en": "What a shame the courier found nobody in, {PAX}. They usually leave a note and try again the next working day, and the tracking link shows where the parcel is in the meantime. It often lets you choose another day as well.",
   "pl": "Szkoda, że kurier trafił na pusty dom, {PAX}. Zwykle zostawia awizo i próbuje ponownie następnego dnia roboczego, a link do śledzenia pokazuje, gdzie paczka jest w tym czasie. Często można tam też wybrać inny dzień doręczenia.",
   "k": "awizo notice nieobecność missed kurier courier ponownie again",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    0
   ]
  },
  {
   "id": "c-delivery-new-address-after-dispatch",
   "c": "delivery",
   "t": "Delivery, new address after dispatch",
   "tPl": "Dostawa, zmiana adresu po nadaniu",
   "en": "Your parcel is already with the courier, {PAX}, so I'm asking them to take it to the new address instead, and I'll write as soon as they confirm. If they can't, the parcel will come back to us and go straight out again to the right door.",
   "pl": "Paczka jest już u kuriera, {PAX}, więc proszę przewoźnika o doręczenie pod nowy adres i napiszę, gdy tylko to potwierdzi. Gdyby się nie udało, paczka wróci do pracowni i od razu pojedzie pod właściwe drzwi.",
   "note": "For a parcel already with the courier; before dispatch, the address is changed on the order itself.",
   "notePl": "Dla paczki, która jest już u kuriera; przed wysyłką adres zmienia się w samym zamówieniu.",
   "k": "adres address zmiana change przekierowanie redirect kurier courier",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    1
   ]
  },
  {
   "id": "c-delivery-an-order-in-two-boxes",
   "c": "delivery",
   "t": "Delivery, an order in two boxes",
   "tPl": "Dostawa, zamówienie w dwóch paczkach",
   "en": "Before anything else, {PAX}, could you look at the dispatch email? A larger order sometimes travels in two boxes, and the second can arrive a day after the first. If there was only one, I'll check what went into it and put things right.",
   "pl": "Na początek, {PAX}, warto zajrzeć do maila o nadaniu: większe zamówienie czasem jedzie w dwóch paczkach, a druga potrafi dotrzeć dzień później. Jeśli paczka była jedna, sprawdzę, co do niej trafiło, i wszystko wyprostujemy.",
   "k": "brak missing dwie two paczki parcels druga second osobno separately",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    4,
    0
   ]
  },
  {
   "id": "c-delivery-two-orders-together",
   "c": "delivery",
   "t": "Delivery, two orders together",
   "tPl": "Dostawa, dwa zamówienia razem",
   "en": "Of course. If neither order has left the studio yet, we'll pack them into one box and send them together. If the first is already on its way, the second follows as its own parcel, within two working days as usual.",
   "pl": "Oczywiście. Jeśli żadne z zamówień nie wyjechało jeszcze z pracowni, spakujemy je do jednego kartonu i wyślemy razem. Jeśli pierwsze jest już w drodze, drugie pojedzie osobno, jak zwykle w ciągu dwóch dni roboczych.",
   "k": "połączyć combine razem together dwa two paczka parcel",
   "intents": [
    7
   ]
  },
  {
   "id": "c-delivery-straight-to-the-recipient",
   "c": "delivery",
   "t": "Delivery, straight to the recipient",
   "tPl": "Dostawa, prosto do obdarowanej osoby",
   "en": "Of course. The parcel can go straight to the person it's for: their name and address go in as the delivery address. The invoice comes to you by email, so the box holds the present and nothing that says what it cost. Tell me the day you have in mind, and I'll check it arrives in time.",
   "pl": "Oczywiście. Paczka może pojechać prosto do obdarowanej osoby: wystarczy wpisać jej imię i adres jako adres dostawy. Faktura przyjdzie mailem, więc w kartonie będzie sam prezent i nic, co zdradziłoby cenę. Wystarczy podać dzień, na który prezent ma dotrzeć, a sprawdzę, czy zdąży.",
   "k": "prezent gift adres address odbiorca recipient niespodzianka surprise",
   "intents": [
    8
   ]
  },
  {
   "id": "c-delivery-abroad",
   "c": "delivery",
   "t": "Delivery, abroad",
   "tPl": "Dostawa, za granicę",
   "en": "Of course, {PAX}. We send by courier anywhere in the EU and to the UK, and it takes four to seven working days from dispatch. The delivery price for your country appears at checkout, before you pay.",
   "pl": "Oczywiście, {PAX}. Kurierem wysyłamy do wszystkich krajów Unii i do Wielkiej Brytanii, a droga trwa od czterech do siedmiu dni roboczych od nadania. Cena dostawy do danego kraju pojawia się przy zamówieniu, jeszcze przed płatnością.",
   "k": "zagranica abroad unia eu wielka brytania uk kraj country",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    13
   ]
  },
  {
   "id": "c-delivery-beyond-the-eu-and-the-uk",
   "c": "delivery",
   "t": "Delivery, beyond the EU and the UK",
   "tPl": "Dostawa, poza Unię i Wielką Brytanię",
   "en": "Thank you for wanting our pieces so far from Warsaw, {PAX}. For now our parcels travel within the EU and to the UK. If there's an address there where it can wait for you, we'll gladly send it.",
   "pl": "Bardzo miło, że nasze rzeczy mają pojechać tak daleko od Warszawy, {PAX}. Na razie paczki wysyłamy w obrębie Unii i do Wielkiej Brytanii. Jeśli jest tam adres, pod którym paczka może zaczekać, chętnie ją tam wyślemy.",
   "k": "zagranica abroad daleko far świat world kraj country",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    13
   ]
  },
  {
   "id": "c-delivery-to-a-parcel-locker",
   "c": "delivery",
   "t": "Delivery, to a parcel locker",
   "tPl": "Dostawa, do automatu paczkowego",
   "en": "Of course. Choose delivery to a parcel locker at checkout and pick the one nearest you. It's 14 zł, free on orders over 300 zł, and arrives the working day after dispatch; a message from the courier will tell you when it's ready to collect.",
   "pl": "Oczywiście. Przy zamówieniu wystarczy wybrać dostawę do automatu paczkowego i wskazać ten najbliższy. Kosztuje 14 zł, a przy zamówieniu powyżej 300 zł nic. Paczka dociera następnego dnia roboczego po nadaniu, a o tym, że czeka, powiadomi wiadomość od przewoźnika.",
   "k": "automat locker punkt point odbiór pickup kod code",
   "intents": [
    14
   ]
  },
  {
   "id": "c-delivery-collecting-in-person",
   "c": "delivery",
   "t": "Delivery, collecting in person",
   "tPl": "Dostawa, odbiór osobisty",
   "en": "You'd be very welcome, {PAX}. Collection from the studio in Warsaw is free, Tuesday to Saturday from 11:00 to 19:00, and we'll email you when your order is wrapped and waiting by the door. You may even catch someone at the wheel.",
   "pl": "Serdecznie zapraszamy, {PAX}. Odbiór w pracowni w Warszawie jest bezpłatny, od wtorku do soboty, od 11:00 do 19:00, a gdy zamówienie będzie zapakowane i gotowe, przyjdzie mail. Przy odrobinie szczęścia ktoś akurat będzie przy kole.",
   "k": "odbiór collect osobiście person pracownia studio warszawa warsaw",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    15
   ]
  },
  {
   "id": "c-delivery-in-time-for-a-date",
   "c": "delivery",
   "t": "Delivery, in time for a date",
   "tPl": "Dostawa, na konkretny dzień",
   "en": "Let me work it out with you, {PAX}. A piece in stock leaves the studio within two working days and reaches an address in Poland the working day after. For [date], the order needs to reach us by [date]. The courier can't be booked for one particular day, but that leaves a comfortable margin.",
   "pl": "Policzmy to razem, {PAX}. Rzecz dostępna od ręki wyjeżdża z pracowni w ciągu dwóch dni roboczych i dociera pod adres w Polsce następnego dnia roboczego. Żeby zdążyć na [data], zamówienie powinno trafić do nas najpóźniej [data]. Konkretnego dnia doręczenia kurier nie gwarantuje, ale taki zapas czasu jest bezpieczny.",
   "k": "termin date zdążyć time dzień day urodziny birthday",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    16
   ]
  },
  {
   "id": "c-delivery-not-collected-from-a-locker",
   "c": "delivery",
   "t": "Delivery, not collected from a locker",
   "tPl": "Dostawa, nieodebrana z automatu",
   "en": "Your parcel waited its time in the locker and has made its way back to the studio, {PAX}, safe and sound. Tell me where you'd like it, and it will be on its way again.",
   "pl": "Paczka odczekała swoje w automacie i wróciła do pracowni, {PAX}, cała i zdrowa. Wystarczy wskazać, dokąd ma pojechać, a znów ruszy w drogę.",
   "k": "nieodebrana uncollected automat locker wróciła back ponownie again",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    17
   ]
  },
  {
   "id": "c-delivery-a-battered-box",
   "c": "delivery",
   "t": "Delivery, a battered box",
   "tPl": "Dostawa, poobijany karton",
   "en": "I'm sorry the box had such a rough journey, {PAX}. Could you open it and check the pieces? If they're whole, all is well, and thank you for telling us. If anything has broken, two photos, of the piece and of the box, are all we need, and we'll replace it or refund it with nothing to send back.",
   "pl": "Przykro mi, że karton miał tak ciężką drogę, {PAX}. Czy można go otworzyć i sprawdzić zawartość? Jeśli wszystko jest całe, to najważniejsze, i dziękuję za informację. Jeśli coś się stłukło, wystarczą dwa zdjęcia, rzeczy i kartonu, a przyślemy nową sztukę albo oddamy pieniądze, bez odsyłania czegokolwiek.",
   "k": "karton box zgnieciony crushed stłuczone smashed zdjęcia photos",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    18,
    19
   ]
  },
  {
   "id": "c-delivery-a-label-for-sending-back",
   "c": "delivery",
   "t": "Delivery, a label for sending back",
   "tPl": "Dostawa, etykieta do odesłania",
   "en": "Of course, {PAX}. The label comes to you by email: print it, fix it to the box, and hand the parcel to the courier. If printing is awkward, the courier can collect from your door instead and bring the label along.",
   "pl": "Oczywiście, {PAX}. Etykieta przyjdzie mailem: wystarczy ją wydrukować, nakleić na karton i nadać paczkę u przewoźnika. Jeśli drukowanie jest kłopotem, kurier może odebrać paczkę spod drzwi i przywieźć etykietę ze sobą.",
   "k": "etykieta label odesłać send back drukować print kurier courier",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    28,
    29
   ]
  },
  {
   "id": "c-delivery-courier-at-the-door",
   "c": "delivery",
   "t": "Delivery, courier at the door",
   "tPl": "Dostawa, kurier pod drzwiami",
   "en": "Of course. Choose a working day that suits you, and the courier will come to your door for the parcel with the label already printed. Wrap the piece in paper as it came to you, and it will travel safely home to us.",
   "pl": "Oczywiście. Wystarczy wybrać dogodny dzień roboczy, a kurier przyjedzie po paczkę pod drzwi, z gotową etykietą. Warto owinąć rzecz papierem tak, jak była zapakowana, a bezpiecznie wróci do pracowni.",
   "k": "kurier courier odbiór collection drzwi door dzień day",
   "intents": [
    29
   ]
  },
  {
   "id": "c-delivery-paying-the-courier",
   "c": "delivery",
   "t": "Delivery, paying the courier",
   "tPl": "Dostawa, płatność przy odbiorze",
   "en": "Of course. Choose cash on delivery at checkout and pay the courier when the parcel arrives. It's there for courier delivery within Poland; for a parcel locker or an address abroad, card, BLIK or bank transfer are the ways to pay.",
   "pl": "Oczywiście. Przy zamówieniu wystarczy wybrać płatność przy odbiorze i zapłacić kurierowi, gdy przyjedzie. Ta możliwość jest przy dostawie kurierem na terenie Polski; przy automacie paczkowym i wysyłce za granicę płaci się kartą, przez BLIK albo przelewem.",
   "k": "pobranie cash gotówka delivery płatność payment kurier courier",
   "intents": [
    41
   ]
  },
  {
   "id": "c-delivery-a-personalised-piece",
   "c": "delivery",
   "t": "Delivery, a personalised piece",
   "tPl": "Dostawa, rzecz z personalizacją",
   "en": "A piece with a name on it takes a little longer, {PAX}, because the name is painted by hand and then fired. It leaves the studio about ten working days after the order, and in Poland it arrives the working day after that.",
   "pl": "Rzecz z imieniem potrzebuje trochę więcej czasu, {PAX}, bo imię malujemy ręcznie, a potem rzecz idzie do pieca. Wyjeżdża z pracowni około dziesięciu dni roboczych po zamówieniu, a w Polsce dociera następnego dnia roboczego.",
   "k": "personalizacja personalisation imię name czas time dni days",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    53
   ]
  },
  {
   "id": "c-delivery-workshop-pieces-by-courier",
   "c": "delivery",
   "t": "Delivery, workshop pieces by courier",
   "tPl": "Dostawa, prace z warsztatów kurierem",
   "en": "Of course, {PAX}. Once fired and glazed, your pieces wait for you at the studio for two months. If Warsaw is out of your way, we'll wrap them as carefully as anything in the shop and send them by courier for 18 zł, the usual delivery price.",
   "pl": "Oczywiście, {PAX}. Po wypaleniu i szkliwieniu prace czekają w pracowni dwa miesiące. Jeśli do Warszawy jest nie po drodze, zapakujemy je równie starannie jak wszystko ze sklepu i wyślemy kurierem za 18 zł, w zwykłej cenie dostawy.",
   "k": "warsztaty workshop prace pieces wypalone fired kurier courier",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    58
   ]
  },
  {
   "id": "c-delivery-the-sample-set",
   "c": "delivery",
   "t": "Delivery, the sample set",
   "tPl": "Dostawa, komplet próbny",
   "en": "{GREET}, {PAX}. The sample set travels like any order: three pieces, wrapped at our packing table and sent by courier, so you can try them in real service. Its cost comes off your first order.",
   "pl": "{GREET}, {PAX}. Komplet próbny jedzie jak każde zamówienie: trzy sztuki, zapakowane u nas w pracowni i wysłane kurierem, żeby można je było sprawdzić w codziennej pracy. Jego koszt odejmiemy od pierwszego zamówienia.",
   "k": "próbny sample komplet set kawiarnia cafe firma business",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    67
   ]
  },
  {
   "id": "c-delivery-a-piece-made-to-order",
   "c": "delivery",
   "t": "Delivery, a piece made to order",
   "tPl": "Dostawa, rzecz na zamówienie",
   "en": "A piece made to order goes into the next firing, {PAX}, which comes out of the kiln on [date]. It leaves the studio as soon as it has cooled and been checked, and I'll email you the tracking link the day it goes.",
   "pl": "Rzecz na zamówienie trafi do najbliższego wypału, {PAX}, a ten wyjdzie z pieca [data]. Z pracowni wyjedzie, gdy tylko ostygnie i przejdzie przegląd, a link do śledzenia prześlę mailem w dniu wysyłki.",
   "note": "Take the firing date from the studio calendar, never an estimate.",
   "notePl": "Datę wypału bierzemy z kalendarza pracowni, nigdy szacunkowo.",
   "k": "zamówienie order wypał firing piec kiln termin date",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    70
   ]
  },
  {
   "id": "c-damaged-photos-please",
   "c": "damaged",
   "t": "Broken in transit, photos please",
   "tPl": "Uszkodzona przesyłka, prośba o zdjęcia",
   "en": "{GREET}, {PAX}. I'm so sorry it arrived like that, and we'll put it right. Could you send me two photos, one of the piece and one of the box it came in? That's all we need for the courier, and there's no need to keep the pieces afterwards.",
   "pl": "{GREET}, {PAX}. Bardzo przykro mi, że paczka dotarła w takim stanie; zaraz to naprawimy. Proszę o dwa zdjęcia: uszkodzonej rzeczy i kartonu, w którym przyszła. Tylko tyle potrzebujemy do zgłoszenia u przewoźnika, a potłuczonych kawałków nie trzeba potem przechowywać.",
   "k": "stłuczone smashed pęknięte cracked zdjęcia photos kurier courier",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    18
   ]
  },
  {
   "id": "c-damaged-though-the-box-looked-fine",
   "c": "damaged",
   "t": "Damaged, though the box looked fine",
   "tPl": "Szkoda w drodze, choć karton był cały",
   "en": "{GREET}, {PAX}. I'm sorry, and it does happen: a knock on the road can pass through a box without leaving a mark on the outside. Could you send me two photos, one of the piece and one of the box? That's all we need, and there's nothing to send back.",
   "pl": "{GREET}, {PAX}. Przykro mi. To się zdarza: uderzenie w drodze potrafi przejść przez karton, nie zostawiając na nim śladu. Proszę o dwa zdjęcia, rzeczy i kartonu. Tylko tyle potrzebujemy i niczego nie trzeba odsyłać.",
   "k": "karton box cały intact stłuczone smashed zdjęcia photos",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    18
   ]
  },
  {
   "id": "c-damaged-box-damaged-contents-whole",
   "c": "damaged",
   "t": "Box damaged, contents whole",
   "tPl": "Zgnieciony karton, zawartość cała",
   "en": "I'm glad everything inside came through. Thank you for telling us about the box all the same; I'll pass it on to the packing table. If anything shows up later, a fine crack for instance, write to us and we'll replace the piece.",
   "pl": "Dobrze, że wszystko w środku jest całe. Dziękuję za informację o kartonie; przekazuję ją osobom, które pakują zamówienia. Gdyby później wyszło coś jeszcze, na przykład cienkie pęknięcie, wystarczy napisać, a wymienimy tę rzecz.",
   "k": "karton box zgnieciony crushed cały whole pakowanie packing",
   "intents": [
    19
   ]
  },
  {
   "id": "c-damaged-a-new-one-on-its-way",
   "c": "damaged",
   "t": "Broken in transit, a new one on its way",
   "tPl": "Uszkodzona przesyłka, nowa sztuka w drodze",
   "en": "Thank you for the photos, {PAX}. A replacement leaves the studio tomorrow, packed twice as carefully, and there's nothing to pay and nothing to send back. The tracking link will reach you by email as soon as it's on its way.\n\nKind regards,\n{AGENT}",
   "pl": "Dziękuję za zdjęcia, {PAX}. Nowy egzemplarz wyjedzie z pracowni jutro, zapakowany jeszcze staranniej. Nie trzeba za nic dopłacać ani niczego odsyłać. Link do śledzenia przesyłki przyjdzie mailem, gdy tylko paczka ruszy.\n\nPozdrawiam serdecznie,\n{AGENT}",
   "k": "nowa new wymiana replacement wysyłka dispatch śledzenie tracking",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    18,
    20
   ]
  },
  {
   "id": "c-damaged-refund-instead",
   "c": "damaged",
   "t": "Broken in transit, refund instead",
   "tPl": "Uszkodzona przesyłka, pieniądze zamiast nowej",
   "en": "Of course, {PAX}. If you'd rather not wait for a new one, the full price and the delivery go back to your card today, and banks usually show it within three working days. Nothing needs to come back to us.",
   "pl": "Oczywiście, {PAX}. Jeśli wygodniej będzie nie czekać na nowy egzemplarz, cała kwota razem z kosztem dostawy wróci jeszcze dziś na kartę; bank zwykle księguje ją w ciągu trzech dni roboczych. Niczego nie trzeba odsyłać.",
   "k": "pieniądze money refund karta card oddać",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    18,
    21
   ]
  },
  {
   "id": "c-damaged-a-new-one-or-the-money",
   "c": "damaged",
   "t": "Damaged, a new one or the money",
   "tPl": "Szkoda w drodze, nowa sztuka albo pieniądze",
   "en": "Thank you for the photos, {PAX}. Which would you prefer: a new piece from the studio, or the full price and the delivery back on your card? Either way, there's nothing to send back.",
   "pl": "Dziękuję za zdjęcia, {PAX}. Co będzie lepsze: nowa sztuka z pracowni czy cała kwota razem z dostawą z powrotem na kartę? W obu przypadkach niczego nie trzeba odsyłać.",
   "k": "wybór choice nowa new pieniądze money wymiana replacement",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    18,
    20,
    21
   ]
  },
  {
   "id": "c-damaged-one-piece-of-a-set",
   "c": "damaged",
   "t": "Damaged, one piece of a set",
   "tPl": "Szkoda w drodze, jedna sztuka z kompletu",
   "en": "I'm sorry one of the set didn't survive the journey, {PAX}. Every firing runs a little differently, so we'll choose the replacement by hand, holding it up beside your photo of the others, to find the one that sits most happily with them. It leaves the studio tomorrow.",
   "pl": "Przykro mi, że jedna sztuka z kompletu nie przetrwała drogi, {PAX}. Każdy wypał wychodzi trochę inaczej, więc nową wybierzemy ręcznie, porównując ją ze zdjęciem pozostałych, tak żeby jak najlepiej do nich pasowała. Wyjedzie z pracowni jutro.",
   "k": "komplet set jedna one pasująca matching wypał firing szkliwo glaze",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    20
   ]
  },
  {
   "id": "c-damaged-the-next-firing",
   "c": "damaged",
   "t": "Damaged, waiting for the next firing",
   "tPl": "Szkoda w drodze, czekanie na wypał",
   "en": "That glaze is between firings at the moment, {PAX}, and the next batch comes out of the kiln on [date]. We can set the first good one aside for you and send it as soon as it has cooled, or refund the full price to your card today. Which would suit you better?",
   "pl": "To szkliwo czeka teraz na kolejny wypał, {PAX}, a następna partia wyjdzie z pieca [data]. Możemy odłożyć pierwszą udaną sztukę i wysłać ją, gdy tylko ostygnie, albo jeszcze dziś oddać całą kwotę na kartę. Co będzie wygodniejsze?",
   "note": "Take the date from the studio calendar; a guessed date risks a second disappointment.",
   "notePl": "Datę bierzemy z kalendarza pracowni; zgadywana data to ryzyko drugiego rozczarowania.",
   "k": "wypał firing piec kiln brak stock termin date szkliwo glaze",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    20,
    21
   ]
  },
  {
   "id": "c-damaged-the-refund-has-gone-out",
   "c": "damaged",
   "t": "Damaged, the refund has gone out",
   "tPl": "Szkoda w drodze, pieniądze już wysłane",
   "en": "{GREET}, {PAX}. The full price and the delivery have gone back to your card today, and banks usually show it within three working days. I'm sorry this piece never reached your table whole, and we hope the next one arrives exactly as it left us.\n\nKind regards,\n{AGENT}",
   "pl": "{GREET}, {PAX}. Cała kwota razem z kosztem dostawy wróciła dziś na kartę; bank zwykle pokazuje ją w ciągu trzech dni roboczych. Bardzo żałuję, że ta rzecz nie dotarła na stół w całości. Mamy nadzieję, że następna przyjedzie dokładnie taka, jaka wyszła z pracowni.\n\nPozdrawiam serdecznie,\n{AGENT}",
   "k": "pieniądze money refund karta card bank wysłane sent",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    21
   ]
  },
  {
   "id": "c-damaged-a-crack-found-later",
   "c": "damaged",
   "t": "Damaged, a crack found later",
   "tPl": "Szkoda w drodze, pęknięcie zauważone później",
   "en": "Thank you for telling us, {PAX}. A fine crack from the journey sometimes shows only after the first wash, when water finds it. We'll treat it exactly as if the piece had arrived broken: a photo of the crack, and one of the box if it's still there, and a new one will be on its way.",
   "pl": "Dziękuję za informację, {PAX}. Cienkie pęknięcie z podróży czasem widać dopiero po pierwszym myciu, gdy znajdzie je woda. Potraktujemy to tak samo, jakby rzecz przyszła stłuczona: wystarczy zdjęcie pęknięcia, a także kartonu, jeśli jeszcze jest, i nowa sztuka ruszy w drogę.",
   "k": "pęknięcie crack rysa hairline mycie washing później later",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    18,
    20
   ]
  },
  {
   "id": "c-damaged-the-handle-came-off",
   "c": "damaged",
   "t": "Damaged, the handle came off",
   "tPl": "Szkoda w drodze, odpadło ucho",
   "en": "I'm sorry, {PAX}: a mug without its handle is a sad sight. If it arrived like that, two photos, of the mug and of the box, are all we need, and a new one leaves the studio tomorrow with nothing to send back. If it came off later, in use, tell me what happened and we'll look at it as a fault.",
   "pl": "Przykro mi, {PAX}: kubek bez ucha to smutny widok. Jeśli przyszedł w takim stanie, wystarczą dwa zdjęcia, kubka i kartonu, a nowy wyjedzie z pracowni jutro, bez odsyłania czegokolwiek. Jeśli ucho odpadło później, w trakcie używania, wystarczy opisać, co się stało, a zajmiemy się tym jak reklamacją.",
   "note": "If it came off in use rather than on the way, the complaint cards on the faults shelf take over.",
   "notePl": "Jeśli ucho odpadło w trakcie używania, a nie w drodze, dalej prowadzą karty z półki Reklamacje.",
   "k": "ucho handle kubek mug odpadło came off zdjęcia photos",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    35,
    18
   ]
  },
  {
   "id": "c-damaged-what-to-do-with-the-pieces",
   "c": "damaged",
   "t": "Damaged, what to do with the pieces",
   "tPl": "Szkoda w drodze, co zrobić z kawałkami",
   "en": "The pieces are yours to keep or let go, {PAX}; nothing needs to come back to us. Wrap them in newspaper before they go in the bin, so nobody's fingers find the sharp edges. A few of our customers keep them for a mosaic, which we think is rather lovely.",
   "pl": "Kawałki można zatrzymać albo wyrzucić, {PAX}; niczego nie trzeba odsyłać. Najlepiej owinąć je gazetą, zanim trafią do kosza, żeby nikt nie skaleczył się o ostre krawędzie. Niektórzy zachowują je na mozaikę i bardzo nam się to podoba.",
   "k": "kawałki pieces skorupy shards wyrzucić throw away mozaika mosaic",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    18
   ]
  },
  {
   "id": "c-returns-label-by-email",
   "c": "returns",
   "t": "Return, label by email",
   "tPl": "Zwrot, etykieta mailem",
   "en": "{GREET}, {PAX}. Of course. You have 14 days to send it back, and no reason is needed. I'll email you a returns label {DAYPART:today|tonight}, and the money will be back on your card within three days of the parcel reaching us.\n\nKind regards,\n{AGENT}",
   "pl": "{GREET}, {PAX}. Oczywiście. Na zwrot jest 14 dni i nie trzeba podawać przyczyny. Etykietę zwrotną prześlę jeszcze dziś mailem, a pieniądze wrócą na kartę w ciągu trzech dni od chwili, gdy paczka do nas dotrze.\n\nPozdrawiam serdecznie,\n{AGENT}",
   "k": "refund oddać odesłać zwrócić",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    22
   ]
  },
  {
   "id": "c-returns-courier-collection",
   "c": "returns",
   "t": "Return, courier collection",
   "tPl": "Zwrot, odbiór przez kuriera",
   "en": "Of course. The courier can collect it from your door on any working day you choose, and brings the label along, so there's nothing to print. Which day suits you best?",
   "pl": "Oczywiście. Kurier może odebrać paczkę spod drzwi w wybrany dzień roboczy i przywiezie etykietę ze sobą, więc nie trzeba niczego drukować. Który dzień będzie najwygodniejszy?",
   "k": "kurier courier odbiór collection drzwi door drukować print",
   "intents": [
    22,
    29
   ]
  },
  {
   "id": "c-returns-one-piece-from-an-order",
   "c": "returns",
   "t": "Return, one piece from an order",
   "tPl": "Zwrot, jedna rzecz z zamówienia",
   "en": "Of course. One piece can come back on its own while the rest stay with you, and the refund covers the piece you send. I'll email you a returns label today, and the money will be back on your card within three days of the parcel reaching us.",
   "pl": "Oczywiście. Można odesłać jedną rzecz, a resztę zatrzymać; wtedy zwracamy kwotę za tę jedną. Etykietę prześlę jeszcze dziś mailem, a pieniądze będą na karcie w ciągu trzech dni od chwili, gdy paczka do nas dotrze.",
   "k": "część partial jedna one reszta rest zamówienie order",
   "intents": [
    22
   ]
  },
  {
   "id": "c-returns-packing-the-piece",
   "c": "returns",
   "t": "Return, packing the piece",
   "tPl": "Zwrot, jak zapakować",
   "en": "Wrap the piece in the paper it came in, or in a tea towel. A mug travels best with a little paper tucked inside it too.\n\nFill the box so that nothing moves when you give it a gentle shake. Crumpled newspaper is perfect.\n\nStick the returns label over the old address, and the parcel is ready to go.",
   "pl": "Rzecz najlepiej owinąć papierem, w którym przyszła, albo ściereczką kuchenną. Kubek podróżuje najbezpieczniej, gdy i do środka włoży się trochę papieru.\n\nWolne miejsce w kartonie warto wypełnić tak, żeby przy lekkim potrząśnięciu nic się nie przesuwało. Zgnieciona gazeta sprawdzi się idealnie.\n\nEtykietę zwrotną wystarczy nakleić na stary adres i paczka jest gotowa do drogi.",
   "k": "pakowanie packing karton box papier paper owinąć wrap",
   "alt": 1,
   "seq": 1,
   "intents": [
    28,
    22
   ]
  },
  {
   "id": "c-returns-label-once-more",
   "c": "returns",
   "t": "Returns label, once more",
   "tPl": "Etykieta zwrotna, jeszcze raz",
   "en": "Of course, {PAX}. I'm sending the returns label again now, to the address on the order. It usually arrives within a few minutes; if it hasn't come in a quarter of an hour, the spam folder is the first place to look, and I'll stay here in the chat until it's safely with you.",
   "pl": "Oczywiście, {PAX}. Etykietę zwrotną zaraz wyślę jeszcze raz, na adres z zamówienia. Zwykle dociera w ciągu kilku minut. Gdyby nie przyszła w ciągu kwadransa, najpierw warto zajrzeć do spamu, a ja zostaję na czacie, dopóki nie dotrze.",
   "k": "etykieta label spam mail ponownie resend",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    28
   ]
  },
  {
   "id": "c-returns-courier-missed-visit",
   "c": "returns",
   "t": "Courier collection, a missed visit",
   "tPl": "Odbiór zwrotu, kurier się nie pojawił",
   "en": "I'm sorry you waited in for nothing, {PAX}. Tell me which working day suits you, and I'll book a new collection and keep an eye on it myself. The courier brings the label along as before, so the parcel only needs to be packed and ready by the door.",
   "pl": "Przykro mi, że czekanie poszło na marne, {PAX}. Wystarczy wskazać dzień roboczy, a zamówię nowy odbiór i osobiście go dopilnuję. Kurier znów przywiezie etykietę, więc paczkę wystarczy zapakować i mieć pod ręką.",
   "k": "kurier courier odbiór collection nie przyjechał missed",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    29
   ]
  },
  {
   "id": "c-returns-status-refund-on-its-way",
   "c": "returns",
   "t": "Return status, refund on its way",
   "tPl": "Status zwrotu, pieniądze w drodze",
   "en": "{GREET}, {PAX}. Your parcel has reached us, and everything in it is as it should be. The refund is on its way to the card you paid with, and banks usually show it within three working days.",
   "pl": "{GREET}, {PAX}. Paczka do nas dotarła i wszystko w niej jest w porządku. Pieniądze wracają już na kartę, którą opłacono zamówienie; bank zwykle pokazuje je w ciągu trzech dni roboczych.",
   "k": "status refund pieniądze money karta card bank",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    23
   ]
  },
  {
   "id": "c-returns-status-parcel-still-on-its-way",
   "c": "returns",
   "t": "Return status, parcel still on its way",
   "tPl": "Status zwrotu, paczka jeszcze w drodze",
   "en": "{GREET}, {PAX}. Thank you for sending it back. The parcel is still with the courier and should reach the studio in the next day or two. The refund goes out as soon as it is unpacked, and you'll have an email to say so.",
   "pl": "{GREET}, {PAX}. Dziękuję za odesłanie. Paczka jest jeszcze u kuriera i powinna dotrzeć do pracowni w ciągu dnia lub dwóch. Zaraz po rozpakowaniu pieniądze zostaną zwrócone, a potwierdzenie przyjdzie mailem.",
   "k": "status paczka parcel kurier courier droga way",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    23
   ]
  },
  {
   "id": "c-returns-when-the-money-reaches-your-card",
   "c": "returns",
   "t": "Refund, when it reaches your card",
   "tPl": "Zwrot pieniędzy, kiedy będą na karcie",
   "en": "The money leaves us within three days of the parcel reaching the studio, and it goes back to the card you paid with. Banks usually take up to three working days more to show it, so it should all be done within about a week of the parcel arriving.",
   "pl": "Pieniądze wysyłamy w ciągu trzech dni od chwili, gdy paczka dotrze do pracowni, na kartę, którą opłacono zamówienie. Bank zwykle księguje je w ciągu kolejnych trzech dni roboczych, więc od dotarcia paczki mija najwyżej około tygodnia.",
   "k": "pieniądze money refund karta card bank termin kiedy when",
   "intents": [
    39,
    23
   ]
  },
  {
   "id": "c-returns-the-credit-note",
   "c": "returns",
   "t": "Return, the credit note",
   "tPl": "Zwrot, faktura korygująca",
   "en": "The credit note comes with the refund, in the same email, so the invoice and the money always tell the same story. For a company purchase it carries the same details as the original invoice, and there's nothing to sign or send back.",
   "pl": "Faktura korygująca przychodzi razem ze zwrotem pieniędzy, w tej samej wiadomości, więc faktura i przelew zawsze się zgadzają. Przy zakupie na firmę korekta ma te same dane co faktura pierwotna i niczego nie trzeba podpisywać ani odsyłać.",
   "k": "korekta credit note faktura invoice księgowość accounts",
   "intents": [
    45
   ]
  },
  {
   "id": "c-returns-exchange-instead-of-a-return",
   "c": "returns",
   "t": "Exchange instead of a return",
   "tPl": "Wymiana zamiast zwrotu",
   "en": "Of course. If you'd rather have another colour or pattern, there's no need for a refund and a new order. Tell me which one you'd like and I'll set it aside today; it goes out as soon as the first piece is back with us.",
   "pl": "Oczywiście. Zamiast zwrotu pieniędzy i nowego zamówienia wystarczy wskazać inny kolor albo wzór. Odłożę go jeszcze dziś i wyślę, gdy tylko pierwszy egzemplarz do nas wróci.",
   "k": "wymiana exchange kolor colour wzór pattern swap",
   "intents": [
    22,
    24
   ]
  },
  {
   "id": "c-returns-exchange-colour-between-firings",
   "c": "returns",
   "t": "Exchange, the colour between firings",
   "tPl": "Wymiana, kolor czeka na wypał",
   "en": "The colour you'd like is between firings at the moment, {PAX}, and the next batch comes out of the kiln on [date]. I can set one aside for you from it, to leave the studio as soon as it's cool enough to pack. The piece you have can come back with the returns label any time within your 14 days.",
   "pl": "Wybrany kolor czeka właśnie na kolejny wypał, {PAX}; następna partia wyjdzie z pieca [data]. Mogę odłożyć z niej jedną sztukę, która wyjedzie z pracowni, gdy tylko ostygnie na tyle, żeby ją zapakować. Obecną rzecz można odesłać z etykietą zwrotną w dowolnym momencie w ciągu 14 dni.",
   "note": "Give the firing date from the studio calendar, never a guess.",
   "notePl": "Datę wypału podajemy z kalendarza pracowni, nigdy na oko.",
   "k": "wymiana exchange wypał firing partia batch odłożyć reserve",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    24
   ]
  },
  {
   "id": "c-returns-colour-not-as-hoped",
   "c": "returns",
   "t": "Return, not the colour hoped for",
   "tPl": "Zwrot, kolor nie przypadł do gustu",
   "en": "Of course it can come back, {PAX}: 14 days, no reason needed. Or, if you'd like to give the kiln another chance, I can ask the studio to pick out a piece in the same glaze and send you a photo of that very one before it goes. Either way, nothing is settled until the colour is one you love.",
   "pl": "Oczywiście, {PAX}, można tę rzecz odesłać: jest na to 14 dni i nie trzeba podawać przyczyny. A jeśli piec ma dostać drugą szansę, pracownia może wybrać inny egzemplarz w tym samym szkliwie i przesłać zdjęcie właśnie tego, zanim wyjedzie. Tak czy inaczej, decyzja zapada dopiero wtedy, gdy kolor naprawdę się spodoba.",
   "k": "kolor colour zdjęcie photo szkliwo glaze odcień shade",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    33,
    24
   ]
  },
  {
   "id": "c-returns-a-gift",
   "c": "returns",
   "t": "Return, a gift",
   "tPl": "Zwrot, prezent",
   "en": "{GREET}, {PAX}. Of course. A gift can come back within 14 days like anything from the studio, and no reason is needed. The refund goes to the card that paid for it, though, so if you'd rather the giver never knew, an exchange for another colour or pattern is the quieter way. Which would you prefer?",
   "pl": "{GREET}, {PAX}. Oczywiście. Prezent można odesłać w ciągu 14 dni, jak każdą rzecz z pracowni, i bez podawania przyczyny. Pieniądze wrócą jednak na kartę osoby, która za niego zapłaciła, więc jeśli sprawa ma zostać między nami, dyskretniej będzie wymienić go na inny kolor albo wzór. Które rozwiązanie będzie lepsze?",
   "k": "prezent gift obdarowany recipient wymiana exchange dyskretnie",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    26
   ]
  },
  {
   "id": "c-returns-a-personalised-piece",
   "c": "returns",
   "t": "Return, a personalised piece",
   "tPl": "Zwrot, rzecz z personalizacją",
   "en": "{GREET}, {PAX}. A piece with a name on it is made for one person alone, and anything wrong with it is ours to put right, whether the glaze, the lettering or the shape. Could you send me a photo? If it's a change of mind rather than a fault, this is the one kind of piece we can't take back, because it was made to your words.",
   "pl": "{GREET}, {PAX}. Rzecz z imieniem albo napisem powstaje dla jednej osoby, więc każda usterka to nasza sprawa: szkliwo, litery czy kształt. Wystarczy przesłać zdjęcie, a przygotujemy nowy egzemplarz. Jeśli chodzi o zmianę zdania, a nie o wadę, taka rzecz jest wyjątkiem od zwrotów, bo została wykonana na indywidualne zamówienie.",
   "k": "personalizacja personalised imię name napis inscription",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    25
   ]
  },
  {
   "id": "c-returns-after-14-days-a-credit-instead",
   "c": "returns",
   "t": "Return after 14 days, a credit instead",
   "tPl": "Zwrot po terminie, bon zamiast pieniędzy",
   "en": "{GREET}, {PAX}. Let me see what I can do. The usual 14 days have passed, but for an unused piece the studio can offer a credit for its full price, to spend in the shop or on a workshop within a year. Shall I set that up for you?",
   "pl": "{GREET}, {PAX}. Zobaczę, co da się zrobić. Zwykłe 14 dni już minęło, ale za nieużywaną rzecz pracownia może wystawić bon na pełną kwotę, do wykorzystania w sklepie albo na warsztatach przez rok. Przygotować go?",
   "k": "po terminie late bon credit voucher nieużywany unused",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    27
   ]
  },
  {
   "id": "c-returns-after-14-days-a-piece-in-use",
   "c": "returns",
   "t": "Return after 14 days, a piece in use",
   "tPl": "Zwrot po terminie, rzecz już w użyciu",
   "en": "Thank you for asking, {PAX}, and I'm sorry this isn't the answer you hoped for. Once the 14 days have passed and a piece has been in use, the studio can't take it back. If anything is wrong with the piece itself, though, that's different: a fault is ours to put right, and one photo is all I need to begin.",
   "pl": "Dziękuję za pytanie, {PAX}, i przykro mi, że odpowiedź nie jest inna. Po 14 dniach rzeczy, która była już w użyciu, pracownia nie może przyjąć z powrotem. Co innego, jeśli coś jest z nią nie tak: za wady zawsze odpowiadamy, a na początek wystarczy jedno zdjęcie.",
   "k": "po terminie late używany used wada fault",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    27
   ]
  },
  {
   "id": "c-returns-a-piece-from-the-seconds",
   "c": "returns",
   "t": "Return, a piece from the seconds",
   "tPl": "Zwrot, rzecz z drugiego gatunku",
   "en": "Yes, of course. Seconds can be returned like anything else from the studio: 14 days, no reason needed, and the money back on your card within three days of the parcel reaching us. The little kiln mark was the only thing that made it a second.",
   "pl": "Tak, oczywiście. Rzeczy z drugiego gatunku można zwrócić tak samo jak każdą inną: w ciągu 14 dni, bez podawania przyczyny, a pieniądze wrócą na kartę w ciągu trzech dni od chwili, gdy paczka do nas dotrze. Drobny ślad z pieca to jedyne, co odróżnia je od pozostałych.",
   "k": "drugi gatunek seconds przecena discount ślad mark",
   "intents": [
    69
   ]
  },
  {
   "id": "c-returns-wrong-piece-sent",
   "c": "returns",
   "t": "Wrong piece, sent back at our cost",
   "tPl": "Pomyłka w paczce, odesłanie na nasz koszt",
   "en": "{GREET}, {PAX}. I'm sorry, that's our mistake at the packing table. The right piece leaves the studio within two working days, and a courier will collect the other one from your door at our cost, on whichever working day suits you, bringing the label along. Which day would be best?",
   "pl": "{GREET}, {PAX}. Przepraszam, to pomyłka przy pakowaniu. Właściwa rzecz wyjedzie z pracowni w ciągu dwóch dni roboczych, a tę drugą kurier odbierze spod drzwi na nasz koszt, w wybrany dzień roboczy, z gotową etykietą. Kiedy kurier może przyjechać?",
   "k": "pomyłka mistake wrong inny zamiana swap koszt cost",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    5
   ]
  },
  {
   "id": "c-returns-broken-nothing-to-send-back",
   "c": "returns",
   "t": "Broken on the way, nothing to send back",
   "tPl": "Stłuczone w drodze, bez odsyłania",
   "en": "Two photos are all we need, {PAX}: one of the piece and one of the box it came in. Then it's a new one or your money back, whichever you'd prefer, and the broken piece needn't travel again. If you've a plant pot at home, the shards make a very good drainage layer at the bottom of it.",
   "pl": "Wystarczą dwa zdjęcia, {PAX}: uszkodzonej rzeczy i kartonu, w którym przyszła. Potem do wyboru jest nowy egzemplarz albo zwrot pieniędzy, a stłuczonej rzeczy nie trzeba nigdzie odsyłać. Skorupy świetnie sprawdzą się za to jako drenaż na dnie doniczki.",
   "k": "stłuczone broken zdjęcia photos skorupy shards drenaż",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    18,
    20
   ]
  },
  {
   "id": "c-returns-a-fault-not-a-return",
   "c": "returns",
   "t": "A fault, not a return",
   "tPl": "Wada, czyli reklamacja, nie zwrot",
   "en": "If something is wrong with the piece itself (a crack, a chip, a patch where the glaze has lifted), that's a fault rather than a return, and faults are ours to put right. Could you send me a photo and a line about what you've noticed? You'll have our answer within 14 days, and usually within three.",
   "pl": "Jeśli coś jest nie tak z samą rzeczą (pęknięcie, odprysk, miejsce, gdzie odeszło szkliwo), to nie zwrot, tylko reklamacja, a za wady odpowiada pracownia. Wystarczy przesłać zdjęcie i napisać w kilku słowach, co widać. Odpowiedź przyjdzie w ciągu 14 dni, a zwykle w ciągu trzech.",
   "k": "wada fault usterka pęknięcie crack odprysk chip reklamacja complaint",
   "intents": [
    30
   ]
  },
  {
   "id": "c-faults-a-photo-please",
   "c": "faults",
   "t": "Complaint, a photo please",
   "tPl": "Reklamacja, prośba o zdjęcie",
   "en": "{GREET}, {PAX}. I'm sorry the piece isn't as it should be, and thank you for telling us. Could you send me a photo or two, in daylight if you can, and a line about what you've noticed? You'll have our answer within 14 days, and usually within three.",
   "pl": "{GREET}, {PAX}. Przykro mi, że coś jest nie tak, i dziękuję za sygnał. Proszę o jedno lub dwa zdjęcia, najlepiej przy dziennym świetle, i kilka słów o tym, co widać. Odpowiedź przyjdzie w ciągu 14 dni, a zwykle już w ciągu trzech.",
   "k": "reklamacja complaint zdjęcie photo wada fault",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    30
   ]
  },
  {
   "id": "c-faults-complaint-received",
   "c": "faults",
   "t": "Complaint, received",
   "tPl": "Reklamacja, przyjęta",
   "en": "Thank you, {PAX}. Your complaint is with the studio now, and the photos will be looked at by the person who made the piece. You'll have our answer within 14 days, and usually within three.\n\nKind regards,\n{AGENT}",
   "pl": "Dziękuję, {PAX}. Reklamacja jest już w pracowni, a zdjęcia obejrzy osoba, która tę rzecz wykonała. Odpowiedź przyjdzie w ciągu 14 dni, zwykle w ciągu trzech.\n\nPozdrawiam serdecznie,\n{AGENT}",
   "k": "przyjęto received zgłoszenie report termin odpowiedź reply",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    30,
    31
   ]
  },
  {
   "id": "c-faults-status-still-with-the-studio",
   "c": "faults",
   "t": "Complaint status, still with the studio",
   "tPl": "Stan reklamacji, jeszcze w pracowni",
   "en": "Thank you for checking, {PAX}. Your complaint reached us on [date] and is with the studio now, so you'll have our answer by [date] at the latest, and very likely sooner. I'll write the moment it's decided.",
   "pl": "Dziękuję za pytanie, {PAX}. Reklamacja dotarła do nas [data] i jest teraz w pracowni, więc odpowiedź przyjdzie najpóźniej [data], a najpewniej wcześniej. Napiszę, gdy tylko zapadnie decyzja.",
   "note": "The second date is the first plus 14 days.",
   "notePl": "Druga data to pierwsza plus 14 dni.",
   "k": "status stan decyzja decision termin deadline",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    31
   ]
  },
  {
   "id": "c-faults-decided-in-your-favour",
   "c": "faults",
   "t": "Complaint, decided in your favour",
   "tPl": "Reklamacja, uznana",
   "en": "{GREET}, {PAX}. Good news: the studio has looked at the photos and agrees that the piece isn't as it should be. Would you like a new one, which leaves the studio within two working days, or your money back on the card?",
   "pl": "{GREET}, {PAX}. Dobra wiadomość: pracownia obejrzała zdjęcia i przyznaje, że ta rzecz nie jest taka, jaka powinna być. Co będzie lepsze: nowy egzemplarz, który wyjedzie z pracowni w ciągu dwóch dni roboczych, czy zwrot pieniędzy na kartę?",
   "k": "uznana accepted decyzja decision nowa replacement pieniądze refund",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    31,
    30
   ]
  },
  {
   "id": "c-faults-crazing-what-it-is",
   "c": "faults",
   "t": "Crazing, what it is",
   "tPl": "Spękania szkliwa, skąd się biorą",
   "en": "A fine web of lines in the glaze is called crazing. It happens when the glaze and the clay beneath it shrink at slightly different speeds as they cool, and on a piece you drink from it counts as a fault, not a feature. Could you send me a photo? If it's crazing, you're welcome to a new piece or your money back.",
   "pl": "Siateczka cienkich linii na szkliwie to spękania. Powstają, gdy szkliwo i glina pod nim kurczą się podczas stygnięcia w trochę innym tempie. W naczyniu, z którego się pije, to wada, a nie ozdoba, więc proszę o zdjęcie: jeśli to spękania, do wyboru jest nowy egzemplarz albo zwrot pieniędzy.",
   "k": "spękania crazing siateczka web linie lines szkliwo glaze",
   "intents": [
    32
   ]
  },
  {
   "id": "c-faults-crazing-a-test-with-tea",
   "c": "faults",
   "t": "Crazing, a test with tea",
   "tPl": "Spękania, próba z herbatą",
   "en": "Pour some strong tea into the piece and leave it for an hour.\n\nEmpty it and hold it up to the light. If the tea has darkened the lines, they run through the glaze: that's crazing, and it's ours to put right.\n\nSend me a photo either way, and I'll take it to the studio today.",
   "pl": "Najprościej nalać do środka mocnej herbaty i odstawić na godzinę.\n\nPo wylaniu warto obejrzeć naczynie pod światło. Jeśli herbata przyciemniła linie, przechodzą one przez szkliwo: to spękania i za nie odpowiadamy.\n\nNiezależnie od wyniku proszę o zdjęcie, a jeszcze dziś przekażę je do pracowni.",
   "k": "próba test herbata tea linie lines światło light",
   "alt": 1,
   "seq": 1,
   "intents": [
    32,
    30
   ]
  },
  {
   "id": "c-faults-colour-a-difference-or-a-fault",
   "c": "faults",
   "t": "Colour, a difference or a fault",
   "tPl": "Kolor, różnica czy wada",
   "en": "{GREET}, {PAX}. Every piece is glazed by hand and then handed over to the kiln, which has opinions of its own, and every screen shows colour a little differently too. A shade lighter or deeper than the photo is the kiln at work; a bare patch, or a colour quite unlike the page, is a fault and ours to put right. Could you send me a photo, so I can tell which this is? And if the shade isn't to your taste, it can come back within the usual 14 days.",
   "pl": "{GREET}, {PAX}. Każda rzecz jest szkliwiona ręcznie, a potem trafia do pieca, który ma własne zdanie; do tego każdy ekran pokazuje kolory trochę po swojemu. Odcień jaśniejszy lub ciemniejszy niż na zdjęciu to praca pieca. Miejsce bez szkliwa albo kolor zupełnie inny niż na stronie to już wada i za nią odpowiadamy. Proszę o zdjęcie, żeby było wiadomo, o który przypadek chodzi. A jeśli ten odcień nie przypadł do gustu, można skorzystać ze zwykłych 14 dni na zwrot.",
   "k": "kolor colour odcień shade ekran screen zdjęcie photo piec kiln",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    33,
    50
   ]
  },
  {
   "id": "c-faults-each-piece-the-makers-marks",
   "c": "faults",
   "t": "Each piece, the maker's marks",
   "tPl": "Każda sztuka, ślady ręki",
   "en": "Thank you for looking so closely, {PAX}. What you've found is part of how the piece was made: a bare ring at the foot where it was held for dipping, a drop where the glaze ran a little in the kiln, a faint line from the potter's fingers on the wheel. Each of them is as safe in use and in the dishwasher as the rest of the piece. If it isn't what you hoped for, though, it can come back within 14 days, no reason needed.",
   "pl": "Dziękuję za tak uważne spojrzenie, {PAX}. To, co widać, jest częścią tego, jak ta rzecz powstała: goły pierścień na stopce, za który trzymano ją przy zanurzaniu w szkliwie, kropla tam, gdzie szkliwo w piecu lekko spłynęło, delikatna linia od palców na kole. Nic z tego nie przeszkadza w używaniu ani w myciu, także w zmywarce. Jeśli jednak to nie to, na co się czekało, można ją odesłać w ciągu 14 dni, bez podawania przyczyny.",
   "k": "ślady marks ręcznie handmade kropla drop stopka foot koło wheel",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    50
   ]
  },
  {
   "id": "c-faults-mug-leaks-a-first-check",
   "c": "faults",
   "t": "Mug leaks, a first check",
   "tPl": "Przeciekający kubek, pierwsze sprawdzenie",
   "en": "I'm sorry, {PAX}. A mug should hold tea and nothing else, so let's find out what's happening. One thing first: a cold drink on a warm day can bead the outside with condensation that looks very like a leak.\n\nIf the base is wet with hot tea inside, that's a fault. Could you send me a photo of the base held against the light? A hairline crack is easiest to see that way.",
   "pl": "Przykro mi, {PAX}. Kubek ma trzymać herbatę i nic poza tym, więc zaraz to wyjaśnimy. Najpierw jedna rzecz: zimny napój w ciepły dzień potrafi pokryć ścianki skroploną parą, która wygląda zupełnie jak przeciek.\n\nJeśli jednak dno robi się mokre przy gorącej herbacie, to wada. Proszę o zdjęcie spodu pod światło; włoskowate pęknięcie widać wtedy najlepiej.",
   "k": "przecieka leaks mokry wet pęknięcie crack spód base para condensation",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    34
   ]
  },
  {
   "id": "c-faults-mug-leaks-a-new-one",
   "c": "faults",
   "t": "Mug leaks, a new one on its way",
   "tPl": "Przeciekający kubek, nowy w drodze",
   "en": "Thank you for the photo, {PAX}. That's a hairline crack in the base, and a fault on our side. A new mug leaves the studio within two working days. The old one needn't come back, and it will make a perfectly good home for pens, or for a few flowers that don't mind a damp saucer.",
   "pl": "Dziękuję za zdjęcie, {PAX}. To włoskowate pęknięcie w dnie, czyli wada po naszej stronie. Nowy kubek wyjedzie z pracowni w ciągu dwóch dni roboczych. Starego nie trzeba odsyłać: świetnie posłuży jako przybornik na długopisy albo, na podstawce, jako wazonik dla kilku kwiatków.",
   "k": "nowy replacement pęknięcie crack wymiana kubek mug",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    34,
    30
   ]
  },
  {
   "id": "c-faults-handle-came-off",
   "c": "faults",
   "t": "Handle came off, a new piece",
   "tPl": "Odpadło ucho, nowa rzecz",
   "en": "I'm so sorry, {PAX}. A handle should never let go, so this is a fault, and ours to put right. Could you send me a photo of the mug and the handle? And please don't be tempted to glue it back for hot drinks: a handle that has let go once can let go again, and with hot tea inside that's a risk we'd rather you didn't take.",
   "pl": "Bardzo przykro mi, {PAX}. Ucho nie powinno nigdy odpaść, więc to wada i za nią odpowiadamy. Proszę o zdjęcie kubka i ucha. I lepiej nie sklejać go z myślą o gorących napojach: ucho, które raz puściło, może puścić znowu, a z gorącą herbatą w środku szkoda ryzykować.",
   "k": "ucho handle odpadło klej glue kubek mug",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    35,
    30
   ]
  },
  {
   "id": "c-faults-handle-off-on-arrival",
   "c": "faults",
   "t": "Handle, off when it arrived",
   "tPl": "Ucho, odpadło już w drodze",
   "en": "If the handle was already off when you opened the box, {PAX}, it counts as broken in transit, which is simpler still. Two photos, one of the mug and one of the box, and then it's a new one or your money back, with nothing to send back.",
   "pl": "Jeśli ucho było odłamane już po otwarciu paczki, {PAX}, traktujemy to jak uszkodzenie w transporcie, a wtedy wszystko idzie jeszcze prościej. Wystarczą dwa zdjęcia, kubka i kartonu, a potem do wyboru jest nowy egzemplarz albo zwrot pieniędzy, bez odsyłania czegokolwiek.",
   "k": "transport transit dostawa delivery karton box odłamane",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    35
   ]
  },
  {
   "id": "c-faults-missing-from-the-parcel",
   "c": "faults",
   "t": "Missing from the parcel, a second look",
   "tPl": "Brak w paczce, jeszcze jedno spojrzenie",
   "en": "I'm sorry, {PAX}, let me put that right. Could I ask you to look once more through the paper at the bottom of the box? We wrap everything generously, and a small cup has been found hiding in a nest of paper before. If it isn't there, tell me which piece is missing, and it leaves the studio within two working days.",
   "pl": "Przepraszam, {PAX}, zaraz to wyjaśnimy. Czy mogę prosić o jeszcze jedno przejrzenie papieru na dnie kartonu? Pakujemy bardzo hojnie i niejedna filiżanka ukryła się już w papierowym gnieździe. Jeśli i tam niczego nie ma, wystarczy napisać, której rzeczy brakuje, a brakująca rzecz wyjedzie z pracowni w ciągu dwóch dni roboczych.",
   "k": "brak missing paczka parcel papier paper filiżanka cup",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    4
   ]
  },
  {
   "id": "c-faults-wrong-piece-a-photo-to-check",
   "c": "faults",
   "t": "Wrong piece, a photo to check",
   "tPl": "Pomyłka w paczce, zdjęcie do sprawdzenia",
   "en": "I'm sorry for the mix-up, {PAX}. Could you send me a photo of what arrived, with the label on the box? Two glazes can look like twins on the packing table, and the photo will help us see where it went wrong. Either way, the right piece leaves the studio within two working days.",
   "pl": "Przepraszam za pomyłkę, {PAX}. Proszę o zdjęcie tego, co przyszło, razem z etykietą na kartonie. Na stole do pakowania dwa szkliwa potrafią wyglądać jak bliźniaki, a zdjęcie pomoże ustalić, gdzie nastąpił błąd. Tak czy inaczej, właściwa rzecz wyjedzie z pracowni w ciągu dwóch dni roboczych.",
   "k": "pomyłka mistake wrong inna other etykieta label",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    5
   ]
  },
  {
   "id": "c-faults-gift-card-past-its-date",
   "c": "faults",
   "t": "Gift card past its date, a request",
   "tPl": "Karta po terminie, prośba do pracowni",
   "en": "{GREET}, {PAX}. Thank you for writing. Gift cards are valid for a year, and this one reached its date on [date]. I'd like to see what can be done, so I'm asking the studio today, and you'll hear from me by [date].",
   "pl": "{GREET}, {PAX}. Dziękuję za wiadomość. Karty podarunkowe są ważne przez rok, a termin tej karty minął [data]. Chcę sprawdzić, co da się zrobić, więc jeszcze dziś pytam pracownię, a odpowiedź przyjdzie najpóźniej [data].",
   "note": "Promise nothing beyond the answer: extending a card is the studio's decision.",
   "notePl": "Poza odpowiedzią niczego nie obiecujemy: o przedłużeniu karty decyduje pracownia.",
   "k": "karta card podarunkowa gift ważność expiry termin date",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    63
   ]
  },
  {
   "id": "c-payments-failed-new-attempt",
   "c": "payments",
   "t": "Payment failed, trying again",
   "tPl": "Nieudana płatność, druga próba",
   "en": "{GREET}, {PAX}. I'm sorry the payment didn't go through. Nothing was taken from your account, and the order is safe and waiting. I'll send you a new payment link now, and card, BLIK and bank transfer all work from it.",
   "pl": "{GREET}, {PAX}. Przykro mi, że płatność się nie udała. Nic nie zostało pobrane, a zamówienie spokojnie czeka. Za chwilę prześlę nowy link do płatności; można nim zapłacić kartą, BLIKIEM albo przelewem.",
   "note": "Check the payment panel first: say nothing was taken only when it shows so.",
   "notePl": "Najpierw panel płatności: o tym, że nic nie pobrano, piszemy tylko wtedy, gdy panel to potwierdza.",
   "k": "płatność payment nieudana failed link blik karta card",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    36
   ]
  },
  {
   "id": "c-payments-failed-but-the-bank-shows-it",
   "c": "payments",
   "t": "Payment failed, but the bank shows it",
   "tPl": "Płatność nieudana, a bank ją pokazuje",
   "en": "Thank you for checking, {PAX}. What the bank is showing is a hold rather than a payment: the money was set aside for a moment and never reached us, and the bank releases it on its own. If it's still there after three working days, write to me and I'll take it up with the payment provider straight away.",
   "pl": "Dziękuję za sprawdzenie, {PAX}. To, co widać w banku, to blokada, a nie płatność: pieniądze zostały na chwilę zarezerwowane, ale do nas nie dotarły, i bank sam je zwolni. Gdyby blokada była widoczna jeszcze po trzech dniach roboczych, wystarczy napisać, a od razu wyjaśnię to z operatorem płatności.",
   "k": "blokada hold bank pobrano charged operator provider",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    36,
    37
   ]
  },
  {
   "id": "c-payments-paid-twice",
   "c": "payments",
   "t": "Paid twice, the second back today",
   "tPl": "Podwójna płatność, druga wraca dziś",
   "en": "{GREET}, {PAX}. I can see both payments, and I'm sorry for the fright. The second one goes back to your card today, and banks usually show it within three working days. The order itself is paid once and carries on as planned.",
   "pl": "{GREET}, {PAX}. Widzę obie płatności i przepraszam za niepotrzebny niepokój. Druga wróci na kartę jeszcze dziś, a bank zwykle pokazuje ją w ciągu trzech dni roboczych. Samo zamówienie jest opłacone raz i idzie dalej zgodnie z planem.",
   "k": "podwójna twice dwa razy double obciążenie charge",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    37
   ]
  },
  {
   "id": "c-payments-bank-transfer-the-details",
   "c": "payments",
   "t": "Bank transfer, the details",
   "tPl": "Przelew, dane do płatności",
   "en": "Of course. The account number is [account number], and the title should be the order number, [order number], so the payment finds its way to the right order. The order waits three days for the transfer, and leaves the studio within two working days of it arriving.",
   "pl": "Oczywiście. Numer konta to [numer konta], a w tytule przelewu wystarczy wpisać numer zamówienia, [numer zamówienia], żeby płatność trafiła tam, gdzie trzeba. Zamówienie czeka na przelew trzy dni, a z pracowni wyjeżdża w ciągu dwóch dni roboczych od jego zaksięgowania.",
   "note": "Copy both numbers from the order screen; one mistyped digit sends the money astray.",
   "notePl": "Oba numery kopiujemy z ekranu zamówienia; jedna źle przepisana cyfra i pieniądze trafiają gdzie indziej.",
   "k": "przelew transfer konto account tytuł title numer number",
   "intents": [
    38
   ]
  },
  {
   "id": "c-payments-transfer-not-yet-arrived",
   "c": "payments",
   "t": "Transfer, not yet arrived",
   "tPl": "Przelew, jeszcze nie dotarł",
   "en": "Thank you, {PAX}. A transfer between two banks can take a working day to arrive, and a little longer over a weekend, so there's no cause for worry yet. The order waits three days for it, and I'll keep an eye on it; the moment the money arrives, the order goes to the packing table.",
   "pl": "Dziękuję, {PAX}. Przelew między dwoma bankami potrafi iść dzień roboczy, a przez weekend trochę dłużej, więc na razie nie ma powodu do niepokoju. Zamówienie czeka na płatność trzy dni i będę tego pilnować; gdy tylko pieniądze dotrą, zamówienie trafi na stół do pakowania.",
   "k": "przelew transfer nie dotarł not arrived weekend księgowanie",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    38
   ]
  },
  {
   "id": "c-payments-refund-not-yet-on-the-statement",
   "c": "payments",
   "t": "Refund, not yet on the statement",
   "tPl": "Zwrot pieniędzy, jeszcze nie na koncie",
   "en": "Thank you for checking, {PAX}. The refund left us on [date], back to the card you paid with. Banks usually show it within three working days, so it should appear by [date]. If it hasn't by then, send me a line and I'll trace it with the payment provider myself.",
   "pl": "Dziękuję za pytanie, {PAX}. Pieniądze wyszły od nas [data], na kartę, którą opłacono zamówienie. Bank zwykle pokazuje je w ciągu trzech dni roboczych, więc powinny być widoczne najpóźniej [data]. Gdyby do tego czasu ich nie było, wystarczy napisać, a osobiście wyjaśnię sprawę z operatorem płatności.",
   "k": "zwrot refund konto statement bank karta card",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    39,
    23
   ]
  },
  {
   "id": "c-payments-refund-back-the-way-you-paid",
   "c": "payments",
   "t": "Refund, back the way you paid",
   "tPl": "Zwrot pieniędzy, tą samą drogą",
   "en": "The money goes back the way it came: to the card you paid with, or, for BLIK and bank transfer, to the bank account behind the payment. It leaves us within three days of the parcel reaching the studio, and the credit note arrives in the same email, so your paperwork balances too.",
   "pl": "Pieniądze wracają tą samą drogą, którą przyszły: na kartę, jeśli płatność była kartą, a przy BLIKU i przelewie na konto bankowe, z którego zapłacono. Wysyłamy je w ciągu trzech dni od chwili, gdy paczka dotrze do pracowni, a faktura korygująca przychodzi w tej samej wiadomości, więc w papierach też wszystko się zgadza.",
   "k": "zwrot refund blik przelew transfer karta card konto account",
   "intents": [
    22,
    39,
    45
   ]
  },
  {
   "id": "c-payments-discount-code-not-accepted",
   "c": "payments",
   "t": "Discount code, not accepted",
   "tPl": "Kod rabatowy, nie działa",
   "en": "Let me look into it, {PAX}. Could you send me the code exactly as you have it, and the message the basket shows when you enter it? More often than you'd think, it's a letter O standing in for a zero.",
   "pl": "Zaraz to sprawdzę, {PAX}. Proszę o kod, przepisany znak po znaku, i komunikat, który pokazuje koszyk po jego wpisaniu. Częściej, niż mogłoby się wydawać, winna jest litera O udająca zero.",
   "k": "kod code rabat discount koszyk basket błąd error",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    40
   ]
  },
  {
   "id": "c-payments-cash-on-delivery",
   "c": "payments",
   "t": "Cash on delivery, how it works",
   "tPl": "Płatność przy odbiorze, jak to działa",
   "en": "Yes, of course. Choose cash on delivery at checkout and pay the courier when the parcel arrives; the order leaves the studio within two working days, like any other. It's available for courier delivery in Poland, and for a parcel locker or an address abroad, card, BLIK or bank transfer are the ways to pay.",
   "pl": "Tak, oczywiście. Wystarczy wybrać przy zamówieniu płatność przy odbiorze i zapłacić kurierowi, gdy przywiezie paczkę; z pracowni wyjeżdża ona w ciągu dwóch dni roboczych, jak każda inna. Ta forma działa przy dostawie kurierem na terenie Polski, a przy odbiorze z automatu paczkowego i wysyłce za granicę można zapłacić kartą, BLIKIEM albo przelewem.",
   "k": "pobranie cod gotówka cash kurier courier przy odbiorze",
   "intents": [
    41
   ]
  },
  {
   "id": "c-payments-abroad-paying-for-delivery",
   "c": "payments",
   "t": "Abroad, paying for delivery",
   "tPl": "Za granicę, koszt i płatność",
   "en": "Of course. We send by courier to the EU and the UK, and the delivery price for your address is shown at checkout before you pay, so there are no surprises. Card and bank transfer both work from abroad, and the parcel arrives in four to seven working days.",
   "pl": "Oczywiście. Za granicę wysyłamy kurierem, do krajów Unii i do Wielkiej Brytanii. Koszt dostawy pod wskazany adres widać przy zamówieniu, jeszcze przed płatnością, więc nie będzie niespodzianek. Z zagranicy można zapłacić kartą albo przelewem, a paczka dociera w ciągu czterech do siedmiu dni roboczych.",
   "k": "zagranica abroad wysyłka shipping eu uk koszt price",
   "intents": [
    13
   ]
  },
  {
   "id": "c-payments-adding-to-an-order",
   "c": "payments",
   "t": "Adding to an order, the payment",
   "tPl": "Dopisanie do zamówienia, dopłata",
   "en": "Of course, {PAX}. The piece is added to your order, and a link to pay for it is on its way by email: card, BLIK or bank transfer, whichever suits you. Everything will travel together in one parcel.",
   "pl": "Oczywiście, {PAX}. Rzecz jest już dopisana do zamówienia, a link do dopłaty za nią przyjdzie mailem; można zapłacić kartą, BLIKIEM albo przelewem. Wszystko pojedzie razem, w jednej paczce.",
   "k": "dopisać add dopłata extra link jedna paczka parcel",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    2
   ]
  },
  {
   "id": "c-payments-cancelled-order-the-money-back",
   "c": "payments",
   "t": "Cancelled order, the money back",
   "tPl": "Anulowane zamówienie, zwrot pieniędzy",
   "en": "It's done, {PAX}: the order is cancelled, and the full amount goes back today the way you paid. Banks usually show it within three working days. I hope we'll see you again when the time is right.",
   "pl": "Gotowe, {PAX}: zamówienie jest anulowane, a cała kwota wraca dziś tą samą drogą, którą przyszła. Bank zwykle pokazuje ją w ciągu trzech dni roboczych. Do zobaczenia przy innej okazji.",
   "k": "anulowanie cancel zwrot refund kwota amount",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    3
   ]
  },
  {
   "id": "c-payments-payment-received-the-confirmation",
   "c": "payments",
   "t": "Payment received, the confirmation",
   "tPl": "Płatność przyjęta, potwierdzenie",
   "en": "Your payment has arrived, {PAX}, and the order is confirmed. The confirmation and the invoice are on their way to the address on the order; if they aren't in your inbox within a quarter of an hour, the spam folder is worth a look, or I can send them again.",
   "pl": "Płatność dotarła, {PAX}, a zamówienie jest potwierdzone. Potwierdzenie i faktura są już w drodze na adres z zamówienia. Gdyby nie było ich w skrzynce w ciągu kwadransa, warto zajrzeć do spamu, a w razie potrzeby wyślę je jeszcze raz.",
   "k": "potwierdzenie confirmation opłacone paid mail email",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    6
   ]
  },
  {
   "id": "c-payments-broken-piece-the-money-back",
   "c": "payments",
   "t": "Broken piece, the money back",
   "tPl": "Stłuczona rzecz, zwrot pieniędzy",
   "en": "Of course, {PAX}. The full price and the delivery go back to your card today, and banks usually show it within three working days. There's nothing to send back, and I'm sorry the piece never made it to your table.",
   "pl": "Oczywiście, {PAX}. Cała kwota razem z kosztem dostawy wróci na kartę jeszcze dziś; bank zwykle pokazuje ją w ciągu trzech dni roboczych. Niczego nie trzeba odsyłać. Przykro mi, że ta rzecz nie zdążyła trafić na stół.",
   "k": "stłuczona broken zwrot refund dostawa delivery",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    21
   ]
  },
  {
   "id": "c-payments-workshop-paying-for-a-place",
   "c": "payments",
   "t": "Workshop, paying for a place",
   "tPl": "Warsztaty, płatność za miejsce",
   "en": "A place at a wheel class is 220 zł a person, paid like any order in the shop: card, BLIK or bank transfer. Aprons and clay are included, and so are the glazing and the firing of what you make.",
   "pl": "Miejsce na warsztatach z toczenia kosztuje 220 zł od osoby i opłaca się je jak każde zamówienie w sklepie: kartą, BLIKIEM albo przelewem. W cenie są fartuch i glina, a także szkliwienie i wypał gotowych prac.",
   "k": "warsztaty workshop miejsce place cena price koło wheel",
   "intents": [
    56
   ]
  },
  {
   "id": "c-payments-gift-card-buying-one",
   "c": "payments",
   "t": "Gift card, buying one",
   "tPl": "Karta podarunkowa, zakup",
   "en": "Of course. Gift cards run from 50 zł to 1000 zł and are paid for like any order. The card can arrive by email, ready to forward, or printed and tucked into a box for 10 zł, which makes it rather nicer to hand over. It's good for a year, in the shop or at a workshop.",
   "pl": "Oczywiście. Kartę podarunkową można kupić na kwotę od 50 zł do 1000 zł i opłacić jak każde zamówienie. Może przyjść mailem, gotowa do przesłania dalej, albo wydrukowana i zapakowana w pudełko za 10 zł, co przy wręczaniu robi zupełnie inne wrażenie. Jest ważna przez rok, w sklepie i na warsztatach.",
   "k": "karta podarunkowa gift card voucher prezent pudełko box",
   "intents": [
    61
   ]
  },
  {
   "id": "c-payments-trade-prices-and-the-sample-set",
   "c": "payments",
   "t": "Trade, prices and the sample set",
   "tPl": "Kawiarnie i firmy, ceny i komplet próbny",
   "en": "{GREET}, {PAX}. Trade prices are 20 per cent off from 24 pieces and 30 per cent off from 100, in any of our glazes. Most cafes start with a three-piece sample set to try in real service, and its cost comes off the first order, so it pays for itself the moment the tables are laid.",
   "pl": "{GREET}, {PAX}. Przy zamówieniu od 24 sztuk cena jest niższa o 20 procent, a od 100 sztuk o 30 procent, w każdym z naszych szkliw. Większość kawiarni zaczyna od trzyczęściowego kompletu próbnego, żeby sprawdzić go w codziennej pracy; jego koszt odejmujemy od pierwszego zamówienia, więc zwraca się, gdy tylko stoliki zostaną nakryte.",
   "k": "hurt wholesale rabat discount kawiarnia cafe procent",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    65
   ]
  },
  {
   "id": "c-invoices-a-copy-by-email",
   "c": "invoices",
   "t": "Invoice, a copy by email",
   "tPl": "Faktura, kopia mailem",
   "en": "{GREET}, {PAX}. Of course. A copy of the invoice is on its way to the address on the order and should arrive within a few minutes. If it hasn't come in a quarter of an hour, it's worth a look in the spam folder.",
   "pl": "{GREET}, {PAX}. Oczywiście. Kopia faktury jest już w drodze na adres podany w zamówieniu i powinna dotrzeć w ciągu kilku minut. Gdyby nie przyszła w ciągu kwadransa, warto zajrzeć do folderu ze spamem.",
   "k": "kopia copy mail email spam duplikat",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    42
   ]
  },
  {
   "id": "c-invoices-where-to-find-it",
   "c": "invoices",
   "t": "Invoice, where to find it",
   "tPl": "Faktura, gdzie jej szukać",
   "en": "The invoice comes by email with every order, so it should be waiting in your inbox already. Searching the inbox for Mirabelka usually brings it up in a moment. If it's hiding, tell me and I'll send a copy straight away.",
   "pl": "Faktura przychodzi mailem z każdym zamówieniem, więc powinna już czekać w skrzynce. Zwykle wystarczy wpisać w wyszukiwarkę poczty Mirabelka. Gdyby się gdzieś schowała, proszę dać znać, a od razu wyślę kopię.",
   "k": "gdzie where skrzynka inbox szukać search",
   "intents": [
    42
   ]
  },
  {
   "id": "c-invoices-copies-for-several-orders",
   "c": "invoices",
   "t": "Invoices, copies for several orders",
   "tPl": "Faktury, kopie do kilku zamówień",
   "en": "Of course, {PAX}. Send me the order numbers, or the months they fall in, and every invoice will come to you in a single email, ready for your accountant.",
   "pl": "Oczywiście, {PAX}. Wystarczy podać numery zamówień albo miesiące, których dotyczą, a wszystkie faktury przyjdą w jednej wiadomości, gotowe dla księgowości.",
   "k": "kopie copies kilka several miesiąc month księgowa accountant",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    42
   ]
  },
  {
   "id": "c-invoices-for-a-company-details-needed",
   "c": "invoices",
   "t": "Invoice for a company, details needed",
   "tPl": "Faktura na firmę, dane do wystawienia",
   "en": "{GREET}, {PAX}. Certainly. Could you send me the company's full name, its address and its VAT number? I'll issue the invoice today and email it to you.\n\nKind regards,\n{AGENT}",
   "pl": "{GREET}, {PAX}. Oczywiście. Proszę o pełną nazwę firmy, adres i NIP. Fakturę wystawię jeszcze dziś i prześlę mailem.\n\nPozdrawiam serdecznie,\n{AGENT}",
   "k": "firma company nip vat biuro office",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    43
   ]
  },
  {
   "id": "c-invoices-a-trade-order",
   "c": "invoices",
   "t": "Invoice, a trade order",
   "tPl": "Faktura, zamówienie hurtowe",
   "en": "Of course. Every trade order is invoiced to the company, with the trade price on each line, and the sample set's cost appears as a deduction on the first invoice. Send me the company's full name, its address and its VAT number, and the invoice goes out with the order.",
   "pl": "Oczywiście. Każde zamówienie hurtowe fakturujemy na firmę, z ceną hurtową w każdej pozycji, a koszt kompletu próbnego pojawia się na pierwszej fakturze jako odliczenie. Proszę o pełną nazwę firmy, adres i NIP, a faktura wyjdzie razem z zamówieniem.",
   "k": "hurt trade kawiarnia cafe firma company komplet sample",
   "intents": [
    43
   ]
  },
  {
   "id": "c-invoices-correcting-the-details",
   "c": "invoices",
   "t": "Invoice, correcting the details",
   "tPl": "Faktura, poprawienie danych",
   "en": "Thank you, {PAX}. A correcting invoice is on its way by email. It puts right the details on the first one, and there's nothing more to do on your side.",
   "pl": "Dziękuję, {PAX}. Faktura korygująca jest już w drodze mailem. Poprawia dane z pierwszej faktury i nic więcej nie trzeba robić.",
   "k": "korekta correction błąd mistake dane details",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    43,
    44
   ]
  },
  {
   "id": "c-invoices-details-what-to-send",
   "c": "invoices",
   "t": "Invoice details, what to send",
   "tPl": "Dane do faktury, co przesłać",
   "en": "Of course, {PAX}. Could you send me the details exactly as they should appear: the name, the address and, for a company, the VAT number? A correcting invoice goes out by email today, and there's nothing to send back.",
   "pl": "Oczywiście, {PAX}. Proszę o dane dokładnie w takiej postaci, w jakiej mają się znaleźć na fakturze: nazwę, adres, a w przypadku firmy także NIP. Faktura korygująca wyjdzie mailem jeszcze dziś i niczego nie trzeba odsyłać.",
   "k": "dane details nazwa name adres address nip vat",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    44
   ]
  },
  {
   "id": "c-invoices-credit-note-for-a-refund",
   "c": "invoices",
   "t": "Invoice, credit note for a refund",
   "tPl": "Faktura korygująca po zwrocie",
   "en": "The refund has gone out, and the credit note for it is attached to the same email, so your accounts will balance. It's best kept together with the original invoice.",
   "pl": "Pieniądze zostały zwrócone, a faktura korygująca jest w tej samej wiadomości, więc w księgowości wszystko się zgodzi. Najlepiej przechować ją razem z pierwotną fakturą.",
   "k": "korekta credit note zwrot refund księgowość accounts",
   "intents": [
    45,
    23
   ]
  },
  {
   "id": "c-invoices-credit-note-sent-again",
   "c": "invoices",
   "t": "Credit note, sent again",
   "tPl": "Faktura korygująca, jeszcze raz",
   "en": "Of course. The credit note travels in the same email as the refund confirmation, and I'm sending it again now on its own, so it's easy to find. It's worth filing next to the original invoice.",
   "pl": "Oczywiście. Faktura korygująca przychodzi w tej samej wiadomości co potwierdzenie zwrotu pieniędzy, a teraz wyślę ją jeszcze raz, osobno, żeby łatwo było ją znaleźć. Najlepiej przechować ją razem z fakturą pierwotną.",
   "k": "korekta credit note ponownie resend mail email",
   "intents": [
    45
   ]
  },
  {
   "id": "c-invoices-return-in-progress-the-credit-note",
   "c": "invoices",
   "t": "Return in progress, the credit note",
   "tPl": "Zwrot w toku, korekta faktury",
   "en": "The credit note is issued the day your parcel is unpacked, together with the refund, and both arrive in one email. Until then the original invoice stands as it is, and there's nothing you need to do.",
   "pl": "Faktura korygująca powstaje w dniu, w którym paczka zostanie rozpakowana, razem ze zwrotem pieniędzy, i obie rzeczy przychodzą w jednym mailu. Do tego czasu faktura pierwotna pozostaje bez zmian i nic nie trzeba robić.",
   "k": "w toku progress korekta credit note rozpakowanie unpacked",
   "intents": [
    23
   ]
  },
  {
   "id": "c-invoices-for-a-workshop",
   "c": "invoices",
   "t": "Invoice, for a workshop",
   "tPl": "Faktura za warsztaty",
   "en": "Of course. A workshop is invoiced like anything else in the shop. Send me the name and address the invoice should carry, and a VAT number if it's for a company, and it will be in your inbox today.",
   "pl": "Oczywiście. Za warsztaty wystawiamy fakturę tak samo jak za zakupy w sklepie. Wystarczy podać dane do faktury, a w przypadku firmy także NIP, i jeszcze dziś będzie w skrzynce.",
   "k": "warsztaty workshop zajęcia class nip vat",
   "intents": [
    46,
    56
   ]
  },
  {
   "id": "c-invoices-workshop-one-for-the-group",
   "c": "invoices",
   "t": "Workshop invoice, one for the group",
   "tPl": "Faktura za warsztaty, jedna dla grupy",
   "en": "Of course. For a private group, one invoice can cover every place, made out to the company with its VAT number, so your accounts receive one document rather than six. Send me the details, and it will reach your inbox the day the booking is made.",
   "pl": "Oczywiście. Przy warsztatach dla grupy wystarczy jedna faktura na wszystkie miejsca, wystawiona na firmę z NIP, więc do księgowości trafia jeden dokument zamiast sześciu. Proszę o dane, a faktura przyjdzie mailem w dniu rezerwacji.",
   "k": "grupa group zespół team firma company warsztaty workshop",
   "intents": [
    46,
    56
   ]
  },
  {
   "id": "c-invoices-note-for-accounts",
   "c": "invoices",
   "t": "Note for accounts",
   "tPl": "Notatka dla księgowości",
   "en": "For accounts: order [order number], please issue a [document type] for [amount]. The details were confirmed in the chat. Thank you, {INIT}",
   "pl": "Do księgowości: zamówienie [numer zamówienia], proszę o wystawienie dokumentu: [rodzaj dokumentu] na kwotę [kwota]. Dane potwierdzone na czacie. Dziękuję, {INIT}",
   "note": "For the accounts inbox, not the customer; it stays in Polish whatever language the chat is in.",
   "notePl": "Do skrzynki księgowości, nie dla klienta; zostaje po polsku bez względu na język rozmowy.",
   "k": "księgowość accounts notatka note korekta dokument document",
   "lockLang": "pl"
  },
  {
   "id": "c-care-the-dishwasher",
   "c": "care",
   "t": "Care, the dishwasher",
   "tPl": "Pielęgnacja, zmywarka",
   "en": "Yes, everything we make can go in the dishwasher. Washing by hand keeps the glaze bright for longer, though, especially the darker colours, so the mugs you reach for every day may thank you for it.",
   "pl": "Tak, wszystko z naszej pracowni można myć w zmywarce. Szkliwo dłużej zachowa jednak połysk przy myciu ręcznym, zwłaszcza w ciemnych kolorach, więc ulubionym kubkom warto czasem oszczędzić zmywarki.",
   "k": "zmywarka zmywarce dishwasher mycie washing połysk shine",
   "intentTop": 1,
   "intents": [
    47
   ]
  },
  {
   "id": "c-care-keeping-dark-glazes-bright",
   "c": "care",
   "t": "Care, keeping dark glazes bright",
   "tPl": "Pielęgnacja, blask ciemnych szkliw",
   "en": "The darker glazes show every trace of hard water, which is why they sometimes come out of the dishwasher looking a little chalky. Drying them with a soft cloth straight after washing, rather than leaving them to drip, keeps them as deep and glossy as the day they left the kiln. Where the water is very hard, a splash of white vinegar in the rinse does the rest.",
   "pl": "Na ciemnych szkliwach widać każdy ślad twardej wody, dlatego po zmywarce bywają lekko zmatowione białym nalotem. Wystarczy wytrzeć je miękką ściereczką zaraz po myciu, zamiast zostawiać do ocieknięcia, a zachowają głębię i połysk jak w dniu, w którym wyszły z pieca. Przy bardzo twardej wodzie pomaga odrobina octu spirytusowego w wodzie do płukania.",
   "k": "ciemne dark kamień limescale zacieki spots suszenie drying ocet vinegar",
   "intents": [
    47,
    49
   ]
  },
  {
   "id": "c-care-microwave-and-oven",
   "c": "care",
   "t": "Care, microwave and oven",
   "tPl": "Pielęgnacja, mikrofalówka i piekarnik",
   "en": "Yes, the microwave is fine for everything we make, except pieces with a touch of gold lustre: the gold is real metal, and microwaves take against it. The oven and the hob are the one place our pieces shouldn't go, since direct heat can crack them. For baking, a dish made for the oven does the work, and ours can carry it to the table.",
   "pl": "Tak, w mikrofalówce można podgrzewać wszystko z naszej pracowni poza rzeczami ze złotym zdobieniem: to prawdziwe złoto, a ono z mikrofalami się nie lubi. Piekarnik i palnik to jedyne miejsca, do których nasze naczynia nie powinny trafiać, bo bezpośredni żar mógłby je rozsadzić. Do pieczenia najlepiej sięgnąć po naczynie żaroodporne, a nasze postawić już na stole.",
   "note": "Gold lustre is named in the product description: check it there before saying yes to the microwave.",
   "notePl": "Złote zdobienie jest wymienione w opisie produktu: warto to sprawdzić, zanim padnie odpowiedź w sprawie mikrofalówki.",
   "k": "mikrofalówka mikrofala microwave piekarnik oven palnik hob złoto gold lustre",
   "intents": [
    48
   ]
  },
  {
   "id": "c-care-glaze-and-food",
   "c": "care",
   "t": "Care, glaze and food",
   "tPl": "Pielęgnacja, szkliwo a żywność",
   "en": "{GREET}, {PAX}. Yes. Every glaze we use is lead-free and made for food and drink, so hot soup, lemon tea and the morning's orange juice are all quite at home in it.",
   "pl": "{GREET}, {PAX}. Tak. Wszystkie nasze szkliwa są bezołowiowe i przeznaczone do kontaktu z żywnością, więc gorąca zupa, herbata z cytryną i poranny sok pomarańczowy czują się w nich jak u siebie.",
   "k": "szkliwo glaze ołów lead bezpieczne safe żywność food jedzenie",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    51
   ]
  },
  {
   "id": "c-care-before-the-first-use",
   "c": "care",
   "t": "Care, before the first use",
   "tPl": "Pielęgnacja, przed pierwszym użyciem",
   "en": "A rinse in warm water is all a new piece needs before its first cup. If the kiln has left a little dust on the unglazed ring underneath, a damp cloth takes it away. After that, it only asks to be used.",
   "pl": "Przed pierwszym użyciem wystarczy opłukać nową rzecz w ciepłej wodzie. Jeśli na nieszkliwionym pierścieniu od spodu została odrobina pyłu z pieca, zetrze go wilgotna ściereczka. Potem pozostaje już tylko z niej korzystać.",
   "k": "pierwsze first użycie use nowy new płukanie rinse pył dust"
  },
  {
   "id": "c-care-tea-and-coffee-stains",
   "c": "care",
   "t": "Care, tea and coffee stains",
   "tPl": "Pielęgnacja, osad po herbacie i kawie",
   "en": "Fill the mug with warm water, stir in a spoonful of bicarbonate of soda and leave it overnight.\n\nIn the morning, wipe the ring away with a soft sponge. A scourer would scratch the glaze, and the glaze is the part worth keeping.\n\nRinse it well, and it's ready for the next pot of tea.",
   "pl": "Wystarczy nalać do kubka ciepłej wody, wsypać łyżkę sody oczyszczonej i zostawić na noc.\n\nRano osad zejdzie pod miękką gąbką. Druciaka lepiej nie używać, bo porysowałby szkliwo, a to ono jest tu najcenniejsze.\n\nPo dokładnym wypłukaniu kubek jest gotowy na kolejną herbatę.",
   "k": "herbata tea kawa coffee osad residue plama stain soda bicarbonate",
   "alt": 1,
   "seq": 1,
   "intents": [
    49
   ]
  },
  {
   "id": "c-care-grey-marks-from-cutlery",
   "c": "care",
   "t": "Care, grey marks from cutlery",
   "tPl": "Pielęgnacja, szare ślady po sztućcach",
   "en": "Those grey lines are a trace of metal left on the glaze by knives and forks, not a scratch in it, and they come away. A little cream cleaner on a soft cloth, a gentle rub in small circles, and the plate is as it was.",
   "pl": "Szare kreski to ślad metalu, który noże i widelce zostawiają na szkliwie, a nie rysy, więc dają się usunąć. Wystarczy odrobina mleczka do czyszczenia na miękkiej ściereczce i kilka delikatnych okrężnych ruchów, a talerz wróci do dawnego wyglądu.",
   "k": "sztućce cutlery nóż knife ślady marks rysy scratches mleczko cleaner talerz plate",
   "intents": [
    49
   ]
  },
  {
   "id": "c-care-flowers-in-a-vase",
   "c": "care",
   "t": "Care, flowers in a vase",
   "tPl": "Pielęgnacja, kwiaty w wazonie",
   "en": "Every vase we make is glazed inside, so it holds water happily. Fresh water every two days keeps the flowers longer and the glaze clean, and a bottle brush reaches the bottom of the tall ones.",
   "pl": "Każdy nasz wazon jest szkliwiony od środka, więc spokojnie trzyma wodę. Świeża woda co dwa dni przedłuży kwiatom życie i utrzyma szkliwo w czystości, a do dna wysokich wazonów najłatwiej sięgnąć szczotką do butelek.",
   "k": "wazon vase kwiaty flowers woda water szczotka brush"
  },
  {
   "id": "c-care-a-teapot-that-drips",
   "c": "care",
   "t": "Care, a teapot that drips",
   "tPl": "Pielęgnacja, kapiący czajniczek",
   "en": "A hand-thrown spout sometimes lets a last drop run down after pouring. The cure is a confident pour: tip the pot briskly and bring it back up as briskly, and the drop stays inside. Rather unfairly, it's the slow and careful pour that drips.",
   "pl": "Z ręcznie toczonego dzióbka czasem spływa po nalaniu ostatnia kropla. Pomaga śmiałe nalewanie: czajniczek przechylić zdecydowanie i równie zdecydowanie wyprostować, a kropla zostanie w środku. Jak na złość kapie właśnie wtedy, gdy nalewa się powoli i ostrożnie.",
   "note": "For a drop from the spout after pouring. Water coming through the wall is a complaint, and the leak test comes first.",
   "notePl": "Na kroplę z dzióbka po nalaniu. Woda przesiąkająca przez ściankę to reklamacja, a najpierw sprawdzenie szczelności.",
   "k": "czajniczek teapot dzióbek spout kapie drips nalewanie pouring",
   "intents": [
    34
   ]
  },
  {
   "id": "c-care-testing-for-a-leak",
   "c": "care",
   "t": "Care, testing for a leak",
   "tPl": "Pielęgnacja, sprawdzenie szczelności",
   "en": "Dry the mug inside and out, and stand it on a folded sheet of kitchen paper.\n\nFill it to a finger's width below the rim with water at room temperature, and leave it for an hour.\n\nLift it and look at the paper. If it's dry, the damp came from outside, most likely condensation from a cold drink. If there's a wet ring, the water has found a way through, and that's ours to put right: a photo of the mug and the paper is all we need.",
   "pl": "Kubek trzeba osuszyć w środku i z zewnątrz, a potem postawić na złożonym ręczniku papierowym.\n\nNastępnie nalać wody o temperaturze pokojowej na palec poniżej brzegu i odstawić na godzinę.\n\nPo godzinie wystarczy podnieść kubek i spojrzeć na papier. Jeśli jest suchy, wilgoć przyszła z zewnątrz, najpewniej to para skroplona po zimnym napoju. Mokry krąg oznacza, że woda znalazła drogę przez ściankę, a to już nasza sprawa: wystarczy zdjęcie kubka i papieru.",
   "k": "przecieka leaks wilgoć damp szczelność test mokry wet ręcznik paper",
   "alt": 1,
   "seq": 1,
   "intents": [
    34
   ]
  },
  {
   "id": "c-care-fine-lines-in-the-glaze",
   "c": "care",
   "t": "Care, fine lines in the glaze",
   "tPl": "Pielęgnacja, siateczka na szkliwie",
   "en": "A fine web of lines in the glaze, known as crazing, can be brought on by a sudden change of heat: boiling water poured into a mug straight from a cold windowsill, or a hot plate set down on a cold stone worktop. Warming the mug first with a splash of hot tap water spares it the shock. If lines have already appeared, send me a photo and the studio will look at it as a complaint; we answer within 14 days, and usually within three.",
   "pl": "Siateczka drobnych pęknięć w szkliwie, czyli spękania, może się pojawić po gwałtownej zmianie temperatury: wrzątek wlany do kubka prosto z zimnego parapetu albo gorący talerz postawiony na zimnym kamiennym blacie. Wystarczy najpierw ogrzać kubek odrobiną ciepłej wody z kranu. Jeśli spękania już są, proszę przesłać zdjęcie, a pracownia rozpatrzy je jak reklamację: odpowiadamy w ciągu 14 dni, zwykle w ciągu trzech.",
   "note": "For keeping crazing away. Where the customer already sees lines, the photo request here is the first step of a complaint.",
   "notePl": "Na zapobieganie spękaniom. Gdy spękania już są, prośba o zdjęcie z tej karty to pierwszy krok reklamacji.",
   "k": "spękania crazing siateczka lines wrzątek boiling temperatura heat pęknięcia",
   "intents": [
    32
   ]
  },
  {
   "id": "c-care-a-handle-that-came-off",
   "c": "care",
   "t": "Care, a handle that came off",
   "tPl": "Pielęgnacja, gdy odpadnie ucho",
   "en": "I'm so sorry, {PAX}, and we'll put it right. A photo of the mug and one of the handle is all we need. Until then, it's best not to glue it for drinking: household glue isn't made for hot tea or the dishwasher. As a pencil pot on a desk, though, a glued mug will serve for years.",
   "pl": "Bardzo mi przykro, {PAX}. Oczywiście to naprawimy, a wystarczy do tego zdjęcie kubka i ucha, które odpadło. Do picia lepiej go nie kleić, bo zwykły klej nie znosi gorącej herbaty ani zmywarki. Za to jako przybornik na ołówki sklejony kubek posłuży na biurku całe lata.",
   "k": "ucho handle odpadło came off klej glue naprawa repair",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    35
   ]
  },
  {
   "id": "c-care-every-piece-is-different",
   "c": "care",
   "t": "Every piece is different",
   "tPl": "Każda sztuka jest inna",
   "en": "{GREET}, {PAX}. That's the kiln at work rather than a fault. Every piece is glazed by hand, and in the firing the glaze pools and runs a little differently each time, so no two of our mugs are quite alike and the photo shows one of them. If the difference is more than you'd like, a return is of course open to you.",
   "pl": "{GREET}, {PAX}. To sprawka pieca, nie wada. Każdą rzecz szkliwimy ręcznie, a w piecu szkliwo za każdym razem układa się trochę inaczej, dlatego nie ma dwóch identycznych kubków, a zdjęcie pokazuje jeden z nich. Jeśli różnica okaże się zbyt duża, oczywiście można skorzystać ze zwrotu.",
   "k": "różnica difference kolor colour zdjęcie photo inny unique ręcznie handmade",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    50,
    33
   ]
  },
  {
   "id": "c-care-a-set-that-matches",
   "c": "care",
   "t": "Care, a set that matches",
   "tPl": "Pielęgnacja, dobieranie do kompletu",
   "en": "Pieces from one firing sit most happily together, because each firing turns a glaze a shade its own way. Order a set together, and we'll pick every piece from the same batch wherever the shelves allow. To add to a set you already have, send me a photo of it, and I'll choose the closest shade from what's in the studio.",
   "pl": "Rzeczy z jednego wypału najlepiej do siebie pasują, bo każdy wypał nadaje szkliwu nieco inny odcień. Przy zamówieniu kompletu za jednym razem wybierzemy wszystkie sztuki z tej samej partii, o ile pozwolą na to półki. Do kompletu, który już stoi w kuchni, wystarczy przesłać zdjęcie, a dobierzemy najbliższy odcień spośród tego, co jest w pracowni.",
   "k": "komplet set partia batch pasujące matching dokupić add odcień shade",
   "intents": [
    10
   ]
  },
  {
   "id": "c-care-the-unglazed-base",
   "c": "care",
   "t": "Care, the unglazed base",
   "tPl": "Pielęgnacja, nieszkliwiony spód",
   "en": "The ring on the base is left bare on purpose: glaze there would fix the piece to the kiln shelf for good. We smooth every base before it leaves the studio, and if one ever feels rough on a wooden table, a sheet of fine sandpaper and a minute's work will soften it.",
   "pl": "Pierścień na spodzie celowo zostaje bez szkliwa: w piecu szkliwo przykleiłoby naczynie do półki na dobre. Każdy spód wygładzamy przed wysyłką, a gdyby któryś wydał się szorstki dla drewnianego stołu, wystarczy arkusz drobnego papieru ściernego i minuta pracy.",
   "k": "spód base stopka foot szorstki rough stół table papier sandpaper"
  },
  {
   "id": "c-care-seconds-in-daily-use",
   "c": "care",
   "t": "Care, seconds in daily use",
   "tPl": "Pielęgnacja, drugi gatunek na co dzień",
   "en": "A second is used and washed exactly like any other piece. The mark from the kiln sits on the surface only, and the glaze beneath it is as sound and food safe as the rest, so it's as happy in the dishwasher as its perfect neighbours.",
   "pl": "Z rzeczą z drugiego gatunku postępuje się tak samo jak z każdą inną. Ślad z pieca jest tylko na powierzchni, a szkliwo pod nim jest równie szczelne i bezpieczne dla żywności, więc zmywarka służy jej tak samo jak idealnym sąsiadkom z półki.",
   "k": "drugi gatunek seconds ślad mark bezpieczne safe zmywarka dishwasher",
   "intents": [
    69
   ]
  },
  {
   "id": "c-personalisation-name-or-name-and-date",
   "c": "personalisation",
   "t": "Personalisation, name or name and date",
   "tPl": "Personalizacja, imię albo imię i data",
   "en": "Of course. The name is painted by hand before the firing, so it melts into the glaze rather than sitting on top, and no dishwasher will wear it away. It can be up to 12 letters, and the mug leaves the studio about ten working days after the order.\n\nOf course. The name and the date are painted by hand before the firing, together on one side, so they melt into the glaze rather than sitting on top, and no dishwasher will wear them away. The name can be up to 12 letters, and the mug leaves the studio about ten working days after the order.",
   "pl": "Oczywiście. Imię malujemy ręcznie jeszcze przed wypaleniem, więc wtapia się w szkliwo i żadna zmywarka go nie zetrze. Może mieć do 12 liter, a kubek wyjeżdża z pracowni około dziesięciu dni roboczych po złożeniu zamówienia.\n\nOczywiście. Imię i datę malujemy ręcznie jeszcze przed wypaleniem, razem po jednej stronie, więc wtapiają się w szkliwo i żadna zmywarka ich nie zetrze. Imię może mieć do 12 liter, a kubek wyjeżdża z pracowni około dziesięciu dni roboczych po złożeniu zamówienia.",
   "k": "imię name data date napis inscription litery lettering malowane painted",
   "alt": 1,
   "intents": [
    52,
    53
   ]
  },
  {
   "id": "c-personalisation-not-only-mugs",
   "c": "personalisation",
   "t": "Personalisation, not only mugs",
   "tPl": "Personalizacja, nie tylko kubki",
   "en": "Yes, a name can go on any piece from the shop, a plate, a bowl or a teapot as well as a mug, painted by hand before the firing, up to 12 letters. On a plate it sits near the rim, where it's seen as the table is laid.",
   "pl": "Tak, imię może się znaleźć na każdej rzeczy ze sklepu, nie tylko na kubku, ale też na talerzu, misce czy czajniczku. Malujemy je ręcznie przed wypaleniem, do 12 liter. Na talerzu trafia blisko brzegu, żeby było widać je już przy nakrywaniu do stołu.",
   "k": "talerz plate miska bowl czajniczek teapot imię name",
   "intents": [
    52
   ]
  },
  {
   "id": "c-personalisation-adding-a-name",
   "c": "personalisation",
   "t": "Personalisation, adding a name",
   "tPl": "Personalizacja, jak dodać imię",
   "en": "On the mug's page, tick Add a name.\n\nType the name exactly as it should be painted, capitals and accents included, up to 12 letters.\n\nAdd the mug to the basket as usual. The wording can still change within two working days of the order, before it goes to the brush.",
   "pl": "Na stronie kubka wystarczy zaznaczyć Dodaj imię.\n\nW polu trzeba wpisać imię dokładnie tak, jak ma zostać namalowane, z wielkimi literami i polskimi znakami, do 12 liter.\n\nPotem kubek trafia do koszyka jak zwykle. Napis można jeszcze zmienić w ciągu dwóch dni roboczych od zamówienia, zanim trafi pod pędzel.",
   "k": "dodać add imię name koszyk basket zamówienie order jak how",
   "alt": 1,
   "seq": 1,
   "intents": [
    52
   ]
  },
  {
   "id": "c-personalisation-a-longer-name",
   "c": "personalisation",
   "t": "Personalisation, a longer name",
   "tPl": "Personalizacja, dłuższe imię",
   "en": "A longer name reads best as the short form the family uses, or as initials: twelve letters is as many as the brush can fit while keeping every one clear. Which would you like on the mug?",
   "pl": "Dłuższe imię najładniej wygląda jako zdrobnienie używane w domu albo jako inicjały: dwanaście liter to najwięcej, ile pędzel zmieści, zachowując czytelność każdej z nich. Co ma się znaleźć na kubku?",
   "k": "długie long imię name litery letters zdrobnienie inicjały initials",
   "intents": [
    52
   ]
  },
  {
   "id": "c-personalisation-several-names",
   "c": "personalisation",
   "t": "Personalisation, several names",
   "tPl": "Personalizacja, kilka imion",
   "en": "Of course, each mug can carry its own name. Add them to the basket one at a time, each with its name, and they'll be painted, fired and sent together, about ten working days after the order.",
   "pl": "Oczywiście, każdy kubek może mieć własne imię. Wystarczy dodawać je do koszyka po kolei, każdy z jego imieniem, a zostaną razem namalowane, wypalone i wysłane, około dziesięciu dni roboczych po zamówieniu.",
   "k": "kilka several imiona names rodzina family komplet set",
   "intents": [
    52
   ]
  },
  {
   "id": "c-personalisation-reading-it-back",
   "c": "personalisation",
   "t": "Personalisation, reading it back",
   "tPl": "Personalizacja, potwierdzenie pisowni",
   "en": "Before it goes to the brush, may I read it back to be sure: [inscription], with the capitals and accents exactly as they are here? Paint is forgiving, but the kiln isn't.",
   "pl": "Zanim napis trafi pod pędzel, wolę się upewnić, czy wszystko się zgadza: [napis], z wielkimi literami i polskimi znakami dokładnie tak, jak tutaj? Farba wiele wybacza, piec już nie.",
   "note": "Paste the wording into the brackets exactly as the order has it, capitals and accents included.",
   "notePl": "W nawias wklejamy treść dokładnie tak, jak jest w zamówieniu, z wielkimi literami i znakami.",
   "k": "pisownia spelling sprawdzenie check literówka typo napis inscription",
   "intents": [
    52,
    54
   ]
  },
  {
   "id": "c-personalisation-changing-the-words",
   "c": "personalisation",
   "t": "Personalisation, changing the words",
   "tPl": "Personalizacja, zmiana napisu",
   "en": "Of course. The wording can change until it is painted, within two working days of the order, and yours is still waiting for the brush. The new wording is on the order now: [inscription].\n\nYour piece has already had its lettering painted and fired, so this one keeps the words it has. I'd gladly start a second with the new wording today, at the usual price; it would leave the studio about ten working days from now.",
   "pl": "Oczywiście. Napis można zmienić, dopóki nie zostanie namalowany, czyli w ciągu dwóch dni roboczych od zamówienia, a ten jeszcze czeka na pędzel. W zamówieniu jest już nowa treść: [napis].\n\nNapis na tej rzeczy jest już namalowany i wypalony, więc zostanie taki, jaki jest. Chętnie jeszcze dziś zacznę drugą, z nową treścią, w zwykłej cenie; wyjedzie z pracowni za około dziesięć dni roboczych.",
   "k": "zmiana change napis inscription poprawka correction imię name",
   "alt": 1,
   "intents": [
    54
   ]
  },
  {
   "id": "c-personalisation-how-long-it-takes",
   "c": "personalisation",
   "t": "Personalisation, how long it takes",
   "tPl": "Personalizacja, czas wykonania",
   "en": "A personalised piece leaves the studio about ten working days after the order. The lettering is painted by hand, then the glaze goes on and the piece is fired, and the kiln in particular keeps its own time. In Poland it arrives the next working day after it leaves us.",
   "pl": "Rzecz z personalizacją wyjeżdża z pracowni około dziesięciu dni roboczych po zamówieniu. Najpierw ręcznie malujemy napis, potem przychodzi pora na szkliwo i wypał, a piec ma swój własny rytm, którego nie da się poganiać. W Polsce paczka dociera następnego dnia roboczego po wysyłce.",
   "k": "czas time ile how long dni days wysyłka dispatch",
   "intents": [
    53
   ]
  },
  {
   "id": "c-personalisation-for-a-set-date",
   "c": "personalisation",
   "t": "Personalisation, for a set date",
   "tPl": "Personalizacja, na konkretny dzień",
   "en": "Yes, it will be there in time. A personalised piece leaves the studio about ten working days after the order and arrives the next working day in Poland, so ordered today it will be with you by [date].\n\nFor [date], the surest choice is a piece from the shelves without a name: it leaves the studio within two working days and arrives the next working day in Poland. Painting and firing a name takes about ten working days, which is more time than we have on this occasion.",
   "pl": "Tak, zdążymy. Rzecz z personalizacją wyjeżdża z pracowni około dziesięciu dni roboczych po zamówieniu, a w Polsce dociera następnego dnia roboczego, więc zamówiona dziś będzie na miejscu do [data].\n\nNa [data] zdąży na pewno rzecz prosto z półki, bez napisu: wyjeżdża z pracowni w ciągu dwóch dni roboczych, a w Polsce dociera następnego dnia roboczego. Malowanie imienia i wypał trwają około dziesięciu dni roboczych, a tym razem tyle czasu nie ma.",
   "k": "termin date urodziny birthday zdążyć in time prezent gift dzień day",
   "alt": 1,
   "intents": [
    16,
    53
   ]
  },
  {
   "id": "c-personalisation-out-of-the-kiln",
   "c": "personalisation",
   "t": "Personalisation, out of the kiln",
   "tPl": "Personalizacja, prosto z pieca",
   "en": "{GREET}, {PAX}. Your mug came out of the kiln this morning, and the name has fired beautifully into the glaze. It leaves the studio today, and this link will follow it all the way to you: [tracking link]\n\nKind regards,\n{AGENT}",
   "pl": "{GREET}, {PAX}. Kubek wyszedł dziś rano z pieca, a imię pięknie wtopiło się w szkliwo. Jeszcze dziś wyjeżdża z pracowni, a pod tym linkiem widać całą jego drogę: [link do śledzenia]\n\nPozdrawiam serdecznie,\n{AGENT}",
   "k": "gotowy ready wysłany sent piec kiln link śledzenie tracking",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    53
   ]
  },
  {
   "id": "c-personalisation-made-to-order-with-a-name",
   "c": "personalisation",
   "t": "Personalisation, made for you",
   "tPl": "Personalizacja, na zamówienie",
   "en": "Of course. A piece made to order is thrown for you from the first lump of clay, so it takes as long as the clay does: it would leave the studio on [date], and the price is [amount]. A name can go on it too, painted before the firing, up to 12 letters. Shall I start it?",
   "pl": "Oczywiście. Rzecz na zamówienie powstaje od pierwszej grudki gliny, więc potrwa tyle, ile potrzebuje glina: wyjedzie z pracowni [data], a cena wyniesie [kwota]. Przed wypaleniem można też namalować na niej imię, do 12 liter. Zaczynamy?",
   "k": "zamówienie order indywidualne custom wykonanie made cena price",
   "intents": [
    70,
    52
   ]
  },
  {
   "id": "c-personalisation-returns",
   "c": "personalisation",
   "t": "Personalisation, returns",
   "tPl": "Personalizacja, zwroty",
   "en": "Anything wrong with a personalised piece is ours to put right, whether the lettering, the glaze or the shape. Because it's made for one person, though, a change of mind is the one return it can't take. If the wording is still in doubt, it can change until it is painted, within two working days of the order.",
   "pl": "Za każdą usterkę rzeczy z personalizacją odpowiadamy: czy chodzi o napis, szkliwo, czy kształt. Ponieważ jednak powstaje dla jednej osoby, zmiana zdania to jedyny powód, z którego nie da się jej zwrócić. Jeśli treść napisu budzi jeszcze wątpliwości, można ją zmienić, dopóki nie zostanie namalowana, czyli w ciągu dwóch dni roboczych od zamówienia.",
   "k": "zwrot return personalizacja personalised wada fault zmiana zdania",
   "intents": [
    25
   ]
  },
  {
   "id": "c-personalisation-a-company-logo",
   "c": "personalisation",
   "t": "Personalisation, a company logo",
   "tPl": "Personalizacja, logo firmy",
   "en": "Yes. A logo is stamped into the base of each piece while the clay is still soft, so it becomes part of the mug rather than a print on it. It comes with trade sets, from 24 pieces. Send me the logo, and I'll pass it to the studio to see how it will sit in the clay.",
   "pl": "Tak. Logo odciskamy na spodzie każdej sztuki, póki glina jest jeszcze miękka, więc staje się częścią naczynia, a nie nadrukiem. Wykonujemy je przy zestawach dla firm, od 24 sztuk. Wystarczy przesłać logo, a przekażę je pracowni, żeby sprawdziła, jak ułoży się w glinie.",
   "k": "logo firma company stempel stamp spód base firmowe branded",
   "intents": [
    55
   ]
  },
  {
   "id": "c-personalisation-for-a-coffee-shop",
   "c": "personalisation",
   "t": "Personalisation, for a coffee shop",
   "tPl": "Personalizacja, dla kawiarni",
   "en": "For a coffee shop, the logo goes into the base of every cup, stamped while the clay is soft, and the cafe's name can be painted on the side as well, up to 12 letters. Trade sets start at 24 pieces and leave the studio about six weeks after the order.",
   "pl": "Dla kawiarni logo odciskamy na spodzie każdej filiżanki, póki glina jest miękka, a na boku można też namalować nazwę lokalu, do 12 liter. Zestawy dla lokali zaczynają się od 24 sztuk i wyjeżdżają z pracowni po około sześciu tygodniach od zamówienia.",
   "k": "kawiarnia cafe coffee nazwa name logo filiżanki cups lokal",
   "intents": [
    66,
    55
   ]
  },
  {
   "id": "c-workshops-booking-confirmed",
   "c": "workshops",
   "t": "Workshop, booking confirmed",
   "tPl": "Warsztaty, zapis potwierdzony",
   "en": "{GREET}, {PAX}. You're booked for the wheel class on [date] at 18:00. Aprons and clay are waiting at the studio, so comfortable clothes and short nails are all you need to bring. Your pieces will be fired, glazed and ready to collect about three weeks later.",
   "pl": "{GREET}, {PAX}. Miejsce na warsztatach z toczenia na kole [data] o 18:00 jest zarezerwowane. Fartuchy i glina czekają w pracowni; wystarczy wygodne ubranie i krótkie paznokcie. Prace po wypaleniu i szkliwieniu będą gotowe do odbioru po około trzech tygodniach.",
   "k": "zapis booking potwierdzenie confirmed koło wheel rezerwacja reserved",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    56
   ]
  },
  {
   "id": "c-workshops-how-to-book",
   "c": "workshops",
   "t": "Workshop, how to book",
   "tPl": "Warsztaty, jak się zapisać",
   "en": "Pick a date on the Workshops page of the shop: weekday evenings at 18:00, or a class at the weekend.\n\nBook a place, at 220 zł. Each class has eight places, so there's time for everyone at the wheel.\n\nPay by card, BLIK or bank transfer. The confirmation arrives by email with the date, the address and what to bring.",
   "pl": "Na stronie Warsztaty w sklepie wystarczy wybrać termin: wieczorem w dni powszednie o 18:00 albo w weekend.\n\nMiejsce kosztuje 220 zł. Na każde zajęcia przypada osiem miejsc, więc przy kole starczy czasu dla wszystkich.\n\nPłatność kartą, BLIK-iem albo przelewem. Potwierdzenie przyjdzie mailem, razem z datą, adresem i listą rzeczy do zabrania.",
   "k": "zapis book jak how termin date miejsce place płatność payment",
   "alt": 1,
   "seq": 1,
   "intents": [
    56
   ]
  },
  {
   "id": "c-workshops-what-the-evening-is-like",
   "c": "workshops",
   "t": "Workshop, what the evening is like",
   "tPl": "Warsztaty, jak wygląda wieczór",
   "en": "The evening starts at the table, kneading the clay until the air is out of it. Then comes the wheel: centring the clay, opening it, and drawing up the walls of a first bowl or cup. The clay has opinions of its own on a first evening, and that is half the pleasure.\n\nAfterwards your pieces dry slowly at the studio, are fired once, glazed and fired again. About three weeks later they're ready to take home.",
   "pl": "Wieczór zaczyna się przy stole, od ugniatania gliny, aż zniknie z niej powietrze. Potem przychodzi pora na koło: centrowanie, otwieranie bryły i wyciąganie ścianek pierwszej miseczki albo kubka. Pierwszego wieczoru glina ma własne zdanie i to połowa przyjemności.\n\nPrace schną potem powoli w pracowni, przechodzą pierwszy wypał, szkliwienie i drugi wypał. Po około trzech tygodniach są gotowe do zabrania do domu.",
   "k": "przebieg what happens koło wheel glina clay wypał firing pierwszy first",
   "intents": [
    56,
    64
   ]
  },
  {
   "id": "c-workshops-price-and-places",
   "c": "workshops",
   "t": "Workshop, price and places",
   "tPl": "Warsztaty, cena i miejsca",
   "en": "A place costs 220 zł, and that covers the clay, the apron, the glaze and both firings. There are eight places in each class, so everyone has time at the wheel and the teacher's eye.",
   "pl": "Miejsce kosztuje 220 zł i obejmuje glinę, fartuch, szkliwo oraz oba wypały. Na zajęciach jest osiem miejsc, więc dla wszystkich starczy czasu przy kole i uwagi osoby prowadzącej.",
   "k": "cena price koszt cost miejsca places ile how much",
   "intents": [
    56
   ]
  },
  {
   "id": "c-workshops-coming-as-a-pair",
   "c": "workshops",
   "t": "Workshop, coming as a pair",
   "tPl": "Warsztaty, we dwoje",
   "en": "Of course. Two places in the same class come to 440 zł, and I'll book them together so you're side by side at the table. Which date would you like?",
   "pl": "Oczywiście. Dwa miejsca na tych samych zajęciach to razem 440 zł; zarezerwuję je jednocześnie, żeby przy stole siedzieć obok siebie. Który termin wybrać?",
   "k": "dwa two para pair razem together miejsca places",
   "intents": [
    56
   ]
  },
  {
   "id": "c-workshops-what-to-bring",
   "c": "workshops",
   "t": "Workshop, what to bring",
   "tPl": "Warsztaty, co zabrać",
   "en": "All that's needed:\n• comfortable clothes that don't mind a little clay\n• short nails, since long ones leave their mark in the walls\n• hair tied back, if it's long\nAprons, clay and tools are waiting at the studio.",
   "pl": "Wystarczy:\n• wygodne ubranie, któremu nie zaszkodzi odrobina gliny\n• krótkie paznokcie, bo długie zostawiają ślady w ściankach\n• związane włosy, jeśli są długie\nFartuchy, glina i narzędzia czekają w pracowni.",
   "k": "zabrać bring ubranie clothes paznokcie nails fartuch apron",
   "intents": [
    56
   ]
  },
  {
   "id": "c-workshops-running-late",
   "c": "workshops",
   "t": "Workshop, running late",
   "tPl": "Warsztaty, spóźnienie",
   "en": "Come whenever you can, and the class will be glad to see you. The evening begins at the table, kneading the clay, and the teacher will help you catch up with the others at the wheel.",
   "pl": "Proszę przyjść, kiedy tylko się uda; miejsce przy kole poczeka. Wieczór zaczyna się przy stole od ugniatania gliny, a osoba prowadząca pomoże dołączyć do reszty grupy.",
   "k": "spóźnienie late korki traffic później later"
  },
  {
   "id": "c-workshops-moving-the-date",
   "c": "workshops",
   "t": "Workshop, moving the date",
   "tPl": "Warsztaty, zmiana terminu",
   "en": "Of course. Your place has moved to [date] at [time], free of charge, and the new confirmation is on its way by email.\n\nOf course, and it's free up to 48 hours before the class. There are places still free on [dates]. Which would suit you best?",
   "pl": "Oczywiście. Miejsce jest już przeniesione na [data], godz. [godzina], bez żadnych opłat, a nowe potwierdzenie przyjdzie mailem.\n\nOczywiście, a do 48 godzin przed zajęciami zmiana jest bezpłatna. Wolne miejsca są jeszcze na zajęciach [daty]. Który termin będzie najwygodniejszy?",
   "note": "Free up to 48 hours before the class; nearer the day, ask the studio before promising a move.",
   "notePl": "Bezpłatnie do 48 godzin przed zajęciami; bliżej terminu najpierw pytamy pracownię.",
   "k": "zmiana change termin date przełożyć move reschedule",
   "alt": 1,
   "intents": [
    57
   ]
  },
  {
   "id": "c-workshops-an-invoice-for-the-class",
   "c": "workshops",
   "t": "Workshop, an invoice for the class",
   "tPl": "Warsztaty, faktura za zajęcia",
   "en": "The invoice comes by email with every booking, as it does with every order. If it's to be made out to a company, send me the company's name, address and VAT number, and I'll issue it today.",
   "pl": "Faktura przychodzi mailem przy każdym zapisie, tak jak przy każdym zamówieniu. Jeśli ma być wystawiona na firmę, proszę o nazwę, adres i NIP, a wystawię ją jeszcze dziś.",
   "k": "faktura invoice firma company nip vat",
   "intents": [
    46,
    56
   ]
  },
  {
   "id": "c-workshops-choosing-the-glaze",
   "c": "workshops",
   "t": "Workshop, choosing the glaze",
   "tPl": "Warsztaty, wybór szkliwa",
   "en": "At the end of the evening, each piece gets a slip of paper with your name and the glaze you've chosen for it from the colours on the studio wall, the mirabelle yellow among them. The glazing and both firings are ours, so all that's left to you is the waiting.",
   "pl": "Na koniec wieczoru każda praca dostaje karteczkę z imieniem i szkliwem wybranym spośród kolorów na ścianie pracowni, z mirabelkową żółcią włącznie. Szkliwienie i oba wypały są już po naszej stronie, więc zostaje tylko czekanie.",
   "k": "szkliwo glaze kolor colour wybór choice"
  },
  {
   "id": "c-workshops-pieces-ready-to-collect",
   "c": "workshops",
   "t": "Workshop, pieces ready to collect",
   "tPl": "Warsztaty, prace do odbioru",
   "en": "{GREET}, {PAX}. Your pieces are out of the kiln and ready to collect at the studio, Tuesday to Saturday, 11:00 to 19:00. We'll keep them safe for two months, and if the studio is hard to reach, they can come to you by courier instead, at the usual delivery price.",
   "pl": "{GREET}, {PAX}. Prace są już po wypale i czekają na odbiór w pracowni, od wtorku do soboty, od 11:00 do 19:00. Przechowamy je przez dwa miesiące, a gdyby trudno było do nas dotrzeć, mogą przyjechać kurierem w zwykłej cenie dostawy.",
   "k": "odbiór collect gotowe ready prace pieces godziny hours",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    58
   ]
  },
  {
   "id": "c-workshops-the-kiln-is-open",
   "c": "workshops",
   "t": "Workshop, the kiln is open",
   "tPl": "Warsztaty, piec otwarty",
   "en": "Your pieces are out of the kiln, glazed and finished, and waiting for you on the shelf by the studio door. Collection is Tuesday to Saturday, 11:00 to 19:00, any day in the next two months.\n\nGood news from the kiln: your pieces came through the firing and are ready to take home. They'll wait for you at the studio for two months, Tuesday to Saturday, 11:00 to 19:00.\n\nThe kiln has given your pieces back, and the glaze has added a little something of its own to each, as it always does. They're ready at the studio for the next two months, Tuesday to Saturday, 11:00 to 19:00.",
   "pl": "Prace są już po wypale, szkliwione i gotowe, i czekają na półce przy drzwiach pracowni. Odbiór od wtorku do soboty, od 11:00 do 19:00, w dowolny dzień przez najbliższe dwa miesiące.\n\nDobre wieści z pieca: prace przetrwały wypał i można je zabrać do domu. Czekają w pracowni przez dwa miesiące, od wtorku do soboty, od 11:00 do 19:00.\n\nPiec oddał już prace, a szkliwo, jak zawsze, dodało każdej coś od siebie. Czekają w pracowni przez najbliższe dwa miesiące, od wtorku do soboty, od 11:00 do 19:00.",
   "k": "piec kiln gotowe ready wiadomość news odbiór collect",
   "alt": 1,
   "intents": [
    58
   ]
  },
  {
   "id": "c-workshops-pieces-by-courier",
   "c": "workshops",
   "t": "Workshop, pieces by courier",
   "tPl": "Warsztaty, prace kurierem",
   "en": "Of course. Your pieces can come to you by courier at the usual delivery price, 18 zł in Poland, wrapped as carefully as anything from the shop. The tracking link will reach you by email as soon as they're on their way.",
   "pl": "Oczywiście. Prace mogą przyjechać kurierem w zwykłej cenie dostawy, 18 zł w Polsce, zapakowane tak starannie jak wszystko ze sklepu. Link do śledzenia przesyłki przyjdzie mailem, gdy tylko paczka ruszy.",
   "k": "kurier courier wysyłka send dostawa delivery prace pieces",
   "intents": [
    58
   ]
  },
  {
   "id": "c-workshops-a-piece-cracked-in-the-kiln",
   "c": "workshops",
   "t": "Workshop, a piece cracked in the kiln",
   "tPl": "Warsztaty, praca pękła w piecu",
   "en": "I'm so sorry, {PAX}. One of your pieces cracked in the firing. Clay sometimes hides a tiny pocket of air or a drop of water, and the kiln is where it finds its way out; it is rarely anything the hands did at the wheel. Your other pieces came through and are waiting for you at the studio.",
   "pl": "Bardzo mi przykro, {PAX}. Jedna z prac pękła w piecu. Glina potrafi skrywać maleńki pęcherzyk powietrza albo kroplę wody, które dopiero w piecu znajdują drogę na zewnątrz; rzadko ma to związek z tym, co działo się przy kole. Pozostałe prace wyszły z wypału cało i czekają w pracowni.",
   "k": "pękła cracked piec kiln wypał firing praca piece",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    58
   ]
  },
  {
   "id": "c-workshops-a-private-group",
   "c": "workshops",
   "t": "Workshop, a private group",
   "tPl": "Warsztaty, własna grupa",
   "en": "Of course. A private class is for six people or more, for a birthday, a hen party or old friends, and the evening belongs to your group alone. Tell me how many are coming and two or three dates that suit, and I'll come back with the times and the price.",
   "pl": "Oczywiście. Zajęcia na wyłączność prowadzimy dla grup od sześciu osób, na urodziny, wieczór panieński czy spotkanie starych przyjaciół, a cały wieczór należy wtedy tylko do grupy. Wystarczy podać liczbę osób i dwa lub trzy pasujące terminy, a wrócę z godzinami i ceną.",
   "k": "grupa group prywatne private urodziny birthday przyjaciele friends",
   "intents": [
    59
   ]
  },
  {
   "id": "c-workshops-for-children",
   "c": "workshops",
   "t": "Workshop, for children",
   "tPl": "Warsztaty, dla dzieci",
   "en": "Children's classes run on Saturday mornings, for seven years old and up, with an adult alongside. Small hands take to clay wonderfully, and a first bowl made at seven tends to stay in the family for a very long time.",
   "pl": "Zajęcia dla dzieci odbywają się w soboty przed południem, od siódmego roku życia, w towarzystwie osoby dorosłej. Małe dłonie świetnie radzą sobie z gliną, a pierwsza miseczka zrobiona w wieku siedmiu lat zostaje w domu na bardzo długo.",
   "k": "dzieci children dziecko child sobota saturday wiek age",
   "intents": [
    60
   ]
  },
  {
   "id": "c-workshops-booked-with-a-gift-card",
   "c": "workshops",
   "t": "Workshop, booked with a gift card",
   "tPl": "Warsztaty, zapis z karty podarunkowej",
   "en": "How lovely to have been given a class. Choose a date on the Workshops page and enter the card's code at checkout; 220 zł covers one place, and anything left on the card stays there for the shop.",
   "pl": "Warsztaty w prezencie to piękny początek. Wystarczy wybrać termin na stronie Warsztaty i wpisać kod karty przy płatności; 220 zł pokrywa jedno miejsce, a reszta zostaje na karcie na zakupy w sklepie.",
   "k": "karta card podarunkowa gift kod code prezent present",
   "intents": [
    64
   ]
  },
  {
   "id": "c-workshops-an-order-collected-at-class",
   "c": "workshops",
   "t": "Workshop, an order collected at class",
   "tPl": "Warsztaty, odbiór zamówienia przy okazji",
   "en": "Of course. Choose collection at the studio at checkout, which is free, and your order will be waiting for you on the evening of your class. On other days the studio is open for collection Tuesday to Saturday, 11:00 to 19:00.",
   "pl": "Oczywiście. Wystarczy wybrać przy zamówieniu bezpłatny odbiór w pracowni, a paczka będzie czekać w dniu zajęć. W pozostałe dni odbiór jest możliwy od wtorku do soboty, od 11:00 do 19:00.",
   "k": "odbiór collect osobisty in person pracownia studio zamówienie order",
   "intents": [
    15
   ]
  },
  {
   "id": "c-gift-cards-how-to-buy",
   "c": "gift-cards",
   "t": "Gift card, how to buy",
   "tPl": "Karta podarunkowa, jak kupić",
   "en": "Choose the amount, anything from 50 zł to 1000 zł. 220 zł covers one place at a workshop.\n\nChoose how it travels: by email, to forward or print at home, or printed and sent in a box for 10 zł.\n\nPay as for anything in the shop. The card is good for a year, in the shop and at the wheel alike.",
   "pl": "Najpierw kwota: dowolna od 50 zł do 1000 zł. Jedno miejsce na warsztatach to 220 zł.\n\nPotem forma: mailem, do przekazania dalej albo wydrukowania w domu, albo jako wydruk w pudełku za 10 zł.\n\nPłatność jak za wszystko w sklepie. Karta jest ważna rok, na zakupy i na zajęcia przy kole.",
   "k": "kupić buy karta card kwota amount pudełko box mail email",
   "alt": 1,
   "seq": 1,
   "intents": [
    61
   ]
  },
  {
   "id": "c-gift-cards-the-balance",
   "c": "gift-cards",
   "t": "Gift card, the balance",
   "tPl": "Karta podarunkowa, saldo",
   "en": "Of course. There's [amount] left on the card, and it's valid until [date]. It can go towards anything in the shop or a place at a workshop.",
   "pl": "Oczywiście. Na karcie zostało [kwota], a ważna jest do [data]. Można ją wykorzystać na zakupy w sklepie albo na miejsce na warsztatach.",
   "k": "saldo balance ile how much zostało left ważność valid",
   "intents": [
    62
   ]
  },
  {
   "id": "c-gift-cards-using-it",
   "c": "gift-cards",
   "t": "Gift card, using it",
   "tPl": "Karta podarunkowa, jak z niej skorzystać",
   "en": "The card's code goes in at checkout, in the shop or when booking a class. If the order comes to more than the card holds, the rest can be paid by card, BLIK or bank transfer; if it comes to less, what's left stays on the card for next time.",
   "pl": "Kod karty wpisuje się przy płatności, w sklepie albo przy zapisie na zajęcia. Jeśli zamówienie przekracza kwotę na karcie, resztę można dopłacić kartą, BLIK-iem albo przelewem; jeśli jest niższe, różnica zostaje na karcie na następny raz.",
   "k": "kod code użyć use kasa checkout dopłata reszta rest",
   "intents": [
    62
   ]
  },
  {
   "id": "c-gift-cards-sent-again",
   "c": "gift-cards",
   "t": "Gift card, sent again",
   "tPl": "Karta podarunkowa, ponowna wysyłka",
   "en": "Of course. The gift card is on its way again to [email address], and it should arrive within a few minutes. If it hasn't come in a quarter of an hour, it's worth a look in the spam folder, where cheerful emails sometimes wander by mistake.",
   "pl": "Oczywiście. Karta podarunkowa jest już ponownie w drodze na adres [adres e-mail] i powinna dotrzeć w ciągu kilku minut. Gdyby nie przyszła w ciągu kwadransa, warto zajrzeć do spamu, gdzie radosne wiadomości czasem trafiają przez pomyłkę.",
   "k": "nie dotarła not arrived mail email spam ponownie again",
   "intents": [
    61
   ]
  },
  {
   "id": "c-gift-cards-in-a-printed-box",
   "c": "gift-cards",
   "t": "Gift card, in a printed box",
   "tPl": "Karta podarunkowa, wydruk w pudełku",
   "en": "Of course. The gift card can come printed and boxed for 10 zł, ready to hand over or to hide until the day. It travels like any order, so it can come to you or go straight to the person it's for.",
   "pl": "Oczywiście. Kartę podarunkową można zamówić wydrukowaną, w pudełku, za 10 zł: gotową do wręczenia albo do schowania do właściwego dnia. Wysyłamy ją jak każde zamówienie, więc może przyjść na własny adres albo prosto do obdarowanej osoby.",
   "k": "pudełko box wydruk printed prezent present opakowanie wrapping",
   "intents": [
    9,
    61
   ]
  },
  {
   "id": "c-gift-cards-a-line-for-the-card",
   "c": "gift-cards",
   "t": "Gift card, a line for the card",
   "tPl": "Karta podarunkowa, pomysł na dedykację",
   "en": "If a few words for the card would help, here's a line we're fond of at the studio: \"For the first coffee of the day, in a cup chosen by you.\"\n\nIf a few words for the card would help, here's a line we're fond of at the studio: \"For an evening at the wheel, and a mug made with your own hands.\"\n\nIf a few words for the card would help, here's a line we're fond of at the studio: \"For something lovely from Mirabelka, yours to choose.\"",
   "pl": "Jeśli przyda się pomysł na dedykację, oto jeden z naszych ulubionych: \"Na pierwszą kawę dnia, w wybranym przez siebie kubku.\"\n\nJeśli przyda się pomysł na dedykację, oto jeden z naszych ulubionych: \"Na wieczór przy kole i kubek zrobiony własnymi rękami.\"\n\nJeśli przyda się pomysł na dedykację, oto jeden z naszych ulubionych: \"Na coś pięknego z Mirabelki, do wyboru według serca.\"",
   "k": "dedykacja message życzenia wishes słowa words tekst",
   "alt": 1,
   "intents": [
    61
   ]
  },
  {
   "id": "c-gift-cards-a-workshop-to-give",
   "c": "gift-cards",
   "t": "Gift card, a workshop to give",
   "tPl": "Karta podarunkowa, warsztaty w prezencie",
   "en": "A place at the wheel makes a lovely present. A gift card for 220 zł covers one place, or 440 zł covers two, so they can bring someone along. The person receiving it chooses the date, any time within the year, and it can come printed in a box for 10 zł.",
   "pl": "Miejsce przy kole to piękny prezent. Karta podarunkowa na 220 zł pokrywa jedno miejsce, a na 440 zł dwa, żeby można było przyjść we dwoje. Termin wybiera osoba obdarowana, w dowolnym momencie w ciągu roku, a kartę można też zamówić wydrukowaną w pudełku za 10 zł.",
   "k": "warsztaty workshop prezent gift koło wheel dwie two",
   "intents": [
    64,
    61
   ]
  },
  {
   "id": "c-gift-cards-a-gift-sent-straight-to-them",
   "c": "gift-cards",
   "t": "Gift, sent straight to them",
   "tPl": "Prezent, wysyłka pod inny adres",
   "en": "Of course. Put their name and address as the delivery address, and the parcel goes straight to them. The invoice comes to you by email rather than in the box, so the price stays between you and us.",
   "pl": "Oczywiście. Wystarczy podać imię, nazwisko i adres obdarowanej osoby jako adres dostawy, a paczka pojedzie prosto do niej. Faktura przychodzi mailem, a nie w paczce, więc cena zostaje tajemnicą.",
   "k": "prezent gift adres address wysyłka send cena price niespodzianka surprise",
   "intents": [
    8
   ]
  },
  {
   "id": "c-gift-cards-a-gift-exchanged-or-returned",
   "c": "gift-cards",
   "t": "Gift, an exchange or a return",
   "tPl": "Prezent, wymiana albo zwrot",
   "en": "Of course. A gift that doesn't quite suit can become one that does: within the 14 days it can be exchanged for another piece, with no reason needed, and nobody need know. If a refund is better, the money goes back to the card that paid for it, which is the giver's.",
   "pl": "Oczywiście. Prezent, który nie do końca trafił, może zamienić się w taki, który trafi: w ciągu 14 dni można go wymienić na inną rzecz, bez podawania przyczyny, i nikt nie musi o tym wiedzieć. Jeśli lepszy będzie zwrot pieniędzy, wrócą one na kartę, którą opłacono zakup, czyli do osoby, która prezent dała.",
   "k": "prezent gift wymiana exchange zwrot return nie pasuje",
   "intents": [
    26
   ]
  },
  {
   "id": "c-gift-cards-a-credit-after-14-days",
   "c": "gift-cards",
   "t": "Gift card, a credit after 14 days",
   "tPl": "Karta podarunkowa, bon po 14 dniach",
   "en": "After the 14 days, an unused piece can still be exchanged for a credit for its full price. It works much like a gift card: valid for a year, for anything in the shop or a place at a workshop.",
   "pl": "Po upływie 14 dni nieużywaną rzecz można jeszcze wymienić na bon o pełnej wartości. Działa podobnie jak karta podarunkowa: jest ważny rok, na zakupy w sklepie albo na miejsce na warsztatach.",
   "k": "bon credit termin after 14 dni days nieużywana unused",
   "intents": [
    27
   ]
  },
  {
   "id": "c-gift-cards-past-its-date",
   "c": "gift-cards",
   "t": "Gift card, past its date",
   "tPl": "Karta podarunkowa, po terminie",
   "en": "Thank you for asking, {PAX}. The card's year ended on [date], so I'm asking the studio what can be done, and I'll write back today.\n\nThank you for waiting, {PAX}. The studio would like the card to be used as it was meant, so it's good again until [date], for the shop or a place at the wheel.",
   "pl": "Dziękuję za wiadomość, {PAX}. Rok ważności karty minął [data], więc pytam pracownię, co da się zrobić, i jeszcze dziś wrócę z odpowiedzią.\n\nDziękuję za cierpliwość, {PAX}. Pracownia chce, żeby karta posłużyła zgodnie z przeznaczeniem, więc jest znów ważna do [data], na zakupy albo na miejsce przy kole.",
   "note": "The studio decides each expired card: send Asking the studio first, and Extended once it agrees.",
   "notePl": "O każdej karcie po terminie decyduje pracownia: najpierw wariant Pytanie do pracowni, a po zgodzie Przedłużona.",
   "k": "termin expired przeterminowana ważność validity przedłużenie extend",
   "alt": 1,
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    63
   ]
  },
  {
   "id": "c-trade-first-enquiry",
   "c": "trade",
   "t": "Trade, first enquiry",
   "tPl": "Kawiarnie i firmy, pierwsze zapytanie",
   "en": "{GREET}, {PAX}. Thank you for thinking of us for your tables. We make trade sets from 24 pieces, in any of our glazes, and we can stamp your logo into the base. The best first step is a sample set: three pieces to try in real service, their cost taken off your first order.",
   "pl": "{GREET}, {PAX}. Bardzo dziękuję za zapytanie. Zastawę dla lokali i biur robimy od 24 sztuk, w każdym z naszych szkliw, a logo możemy odcisnąć na spodzie. Najlepiej zacząć od kompletu próbnego: trzy sztuki do sprawdzenia w codziennej pracy, a ich koszt odejmiemy od pierwszego zamówienia.",
   "k": "kawiarnia cafe restauracja restaurant biuro office hurt wholesale zapytanie enquiry",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    66,
    65,
    67
   ]
  },
  {
   "id": "c-trade-the-prices",
   "c": "trade",
   "t": "Trade, the prices",
   "tPl": "Kawiarnie i firmy, ceny",
   "en": "Trade prices are 20 per cent below the shop's from 24 pieces, and 30 per cent below from 100, in any of our glazes. We can stamp your logo into the base, and a set leaves the studio about six weeks after the order.",
   "pl": "Ceny hurtowe to 20 procent mniej niż w sklepie od 24 sztuk i 30 procent mniej od 100 sztuk, w każdym z naszych szkliw. Na spodzie możemy odcisnąć logo, a zestaw wyjeżdża z pracowni po około sześciu tygodniach od zamówienia.",
   "k": "cena price rabat discount hurt wholesale procent per cent",
   "intents": [
    65
   ]
  },
  {
   "id": "c-trade-the-price-of-a-set",
   "c": "trade",
   "t": "Trade, the price of a set",
   "tPl": "Kawiarnie i firmy, wycena kompletu",
   "en": "For [number] pieces, the trade price is 20 per cent below the shop's, [amount] in all, and the set leaves the studio about six weeks after the order.\n\nFor [number] pieces, the trade price is 30 per cent below the shop's, [amount] in all, and the set leaves the studio about six weeks after the order.",
   "pl": "Za [liczba] sztuk cena hurtowa to 20 procent mniej niż w sklepie, łącznie [kwota], a zestaw wyjedzie z pracowni po około sześciu tygodniach od zamówienia.\n\nZa [liczba] sztuk cena hurtowa to 30 procent mniej niż w sklepie, łącznie [kwota], a zestaw wyjedzie z pracowni po około sześciu tygodniach od zamówienia.",
   "k": "wycena quote kwota amount sztuki pieces komplet set",
   "alt": 1,
   "intents": [
    65,
    66
   ]
  },
  {
   "id": "c-trade-a-smaller-order",
   "c": "trade",
   "t": "Trade, a smaller order",
   "tPl": "Kawiarnie i firmy, mniejsze zamówienie",
   "en": "A smaller order is very welcome at the shop's own prices, from what's on the shelves today, and it leaves the studio within two working days. The trade price begins at 24 pieces, whenever the cafe is ready for a full set.",
   "pl": "Mniejsze zamówienie przyjmiemy z przyjemnością, w cenach sklepowych i z tego, co jest dziś na półkach; wyjedzie z pracowni w ciągu dwóch dni roboczych. Ceny hurtowe zaczynają się od 24 sztuk, kiedy tylko przyjdzie pora na pełny zestaw.",
   "k": "mniej fewer małe small zamówienie order sklep shop",
   "intents": [
    65,
    66
   ]
  },
  {
   "id": "c-trade-the-sample-set",
   "c": "trade",
   "t": "Trade, the sample set",
   "tPl": "Kawiarnie i firmy, komplet próbny",
   "en": "The sample set is three pieces in the glaze you're considering, to use in real service for a week or two before deciding. It costs [amount], and the whole of it is taken off your first order.",
   "pl": "Komplet próbny to trzy sztuki w wybranym szkliwie, do sprawdzenia w codziennej pracy przez tydzień czy dwa, zanim zapadnie decyzja. Kosztuje [kwota], a cała ta kwota zostanie odjęta od pierwszego zamówienia.",
   "k": "próbny sample komplet set próbka test koszt cost",
   "intents": [
    67
   ]
  },
  {
   "id": "c-trade-after-the-sample-set",
   "c": "trade",
   "t": "Trade, after the sample set",
   "tPl": "Kawiarnie i firmy, po komplecie próbnym",
   "en": "{GREET}, {PAX}. I hope the sample set has had a good week on your tables. Whenever you're ready, tell me the pieces and how many of each, and I'll send the price with the cost of the samples already taken off.\n\nKind regards,\n{AGENT}",
   "pl": "{GREET}, {PAX}. Mam nadzieję, że komplet próbny dobrze sprawdził się w pierwszych dniach pracy. Gdy przyjdzie pora, wystarczy podać, jakie sztuki i w jakiej liczbie są potrzebne, a prześlę wycenę z odjętym już kosztem próbek.\n\nPozdrawiam serdecznie,\n{AGENT}",
   "k": "próbny sample decyzja decision zamówienie order dalej next",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    67
   ]
  },
  {
   "id": "c-trade-a-logo-in-the-base",
   "c": "trade",
   "t": "Trade, a logo in the base",
   "tPl": "Kawiarnie i firmy, logo na spodzie",
   "en": "Of course. Your logo is stamped into the base of every piece while the clay is soft, so it stays for good, through every busy day and every dishwasher cycle. Send me the logo, and the studio will say how it will look in clay before the set is begun.",
   "pl": "Oczywiście. Logo odciskamy na spodzie każdej sztuki, póki glina jest miękka, więc zostaje na zawsze, przez każdy pracowity dzień i każde zmywanie. Wystarczy przesłać logo, a pracownia oceni, jak będzie wyglądać w glinie, zanim zestaw powstanie.",
   "note": "The stamp follows the logo's outline, so very fine lines and small text soften in clay: let the studio see the logo before promising detail.",
   "notePl": "Stempel odwzorowuje kontur logo, więc cienkie linie i drobny tekst w glinie się rozmywają: przed obietnicą szczegółów logo ogląda pracownia.",
   "k": "logo stempel stamp spód base firma company",
   "intents": [
    55
   ]
  },
  {
   "id": "c-trade-mugs-for-an-office",
   "c": "trade",
   "t": "Trade, mugs for an office",
   "tPl": "Kawiarnie i firmy, kubki do biura",
   "en": "Mugs for an office make a fine trade set: from 24 pieces, in any of our glazes, with the company's logo stamped into the base if you'd like. From 24 pieces the price is 20 per cent below the shop's, and from 100 it's 30 per cent below.",
   "pl": "Kubki do biura to świetny zestaw dla firmy: od 24 sztuk, w każdym z naszych szkliw, a jeśli jest taka potrzeba, z logo odciśniętym na spodzie. Od 24 sztuk cena jest o 20 procent niższa niż w sklepie, a od 100 sztuk o 30 procent.",
   "k": "biuro office kubki mugs firma company zespół team",
   "intents": [
    65,
    55
   ]
  },
  {
   "id": "c-trade-how-long-a-set-takes",
   "c": "trade",
   "t": "Trade, how long a set takes",
   "tPl": "Kawiarnie i firmy, czas realizacji",
   "en": "A trade set leaves the studio about six weeks after the order. Every piece is thrown, left to dry slowly so it keeps its shape, fired, glazed and fired again, and the slow drying is the part no one can hurry.",
   "pl": "Zestaw dla lokalu wyjeżdża z pracowni po około sześciu tygodniach od zamówienia. Każdą sztukę toczymy, suszymy powoli, żeby zachowała kształt, wypalamy, szkliwimy i wypalamy ponownie, a powolnego suszenia nie da się przyspieszyć.",
   "k": "czas time realizacja lead tygodnie weeks termin when",
   "intents": [
    66
   ]
  },
  {
   "id": "c-trade-pieces-added-later",
   "c": "trade",
   "t": "Trade, pieces added later",
   "tPl": "Kawiarnie i firmy, dokupienie sztuk",
   "en": "Of course. Pieces for your set can be added later from the studio's later firings, so each one will be a close cousin of the first set rather than its twin. Most cafes find the small differences rather charming, and guests seldom notice.",
   "pl": "Oczywiście. Kolejne sztuki do zestawu można domówić później; powstaną w następnych wypałach, więc będą bliskimi kuzynkami pierwszych, a nie ich bliźniaczkami. Większość kawiarni uważa te drobne różnice za urok, a goście rzadko je zauważają.",
   "k": "dokupić add więcej more uzupełnienie top up później later",
   "intents": [
    66
   ]
  },
  {
   "id": "c-trade-care-in-a-busy-kitchen",
   "c": "trade",
   "t": "Trade, care in a busy kitchen",
   "tPl": "Kawiarnie i firmy, codzienna praca w lokalu",
   "en": "Our pieces are made for daily service: everything goes in the dishwasher, and every glaze is lead-free and food safe. Two habits keep a set looking new for longer: stand cups upside down on their rims rather than hanging them by their handles, and let the darker glazes dry in the air rather than sit wet in a rack.",
   "pl": "Nasze naczynia powstają z myślą o codziennej pracy: wszystko można myć w zmywarce, a każde szkliwo jest bezołowiowe i bezpieczne dla żywności. Dwa nawyki pomogą zestawowi dłużej wyglądać jak nowy: filiżanki lepiej ustawiać do góry dnem, niż wieszać za ucha, a ciemnym szkliwom pozwolić wyschnąć na powietrzu, zamiast zostawiać je mokre w koszu.",
   "k": "kuchnia kitchen zmywarka dishwasher układanie stacking obsługa service"
  },
  {
   "id": "c-trade-a-company-invoice",
   "c": "trade",
   "t": "Trade, a company invoice",
   "tPl": "Kawiarnie i firmy, faktura na firmę",
   "en": "Certainly. Every trade order comes with an invoice by email, made out to the company. Send me the company's full name, address and VAT number, and it will carry them.",
   "pl": "Oczywiście. Do każdego zamówienia dla firmy faktura przychodzi mailem, wystawiona na firmę. Wystarczy podać pełną nazwę, adres i NIP.",
   "k": "faktura invoice firma company nip vat",
   "intents": [
    43
   ]
  },
  {
   "id": "c-trade-a-workshop-for-the-team",
   "c": "trade",
   "t": "Trade, a workshop for the team",
   "tPl": "Kawiarnie i firmy, warsztaty dla zespołu",
   "en": "Of course. A private class suits a team very well: six people or more, an evening at the wheel, and pieces ready about three weeks later, which gives everyone a reason to meet again. Tell me how many are coming and two or three dates that suit, and I'll send the times and the price, with the invoice made out to the company.",
   "pl": "Oczywiście. Zajęcia na wyłączność świetnie sprawdzają się w zespole: od sześciu osób, wieczór przy kole, a po około trzech tygodniach gotowe prace, czyli dobry pretekst do kolejnego spotkania. Wystarczy podać liczbę osób i dwa lub trzy pasujące terminy, a prześlę godziny i cenę; faktura zostanie wystawiona na firmę.",
   "k": "zespół team integracja away day warsztaty workshop firma company",
   "intents": [
    59
   ]
  },
  {
   "id": "c-availability-back-in-stock",
   "c": "availability",
   "t": "Back in stock",
   "tPl": "Dostępność, kiedy wróci",
   "en": "The next batch in that glaze comes out of the kiln on [date]. On the product page, click Let me know, and an email will reach you the moment it's back in the shop.",
   "pl": "Kolejna partia w tym szkliwie wyjdzie z pieca [data]. Na stronie produktu wystarczy kliknąć Powiadom o dostępności, a wiadomość przyjdzie, gdy tylko ta rzecz wróci do sklepu.",
   "note": "Firing dates are on the studio calendar: give the date from it, never an estimate.",
   "notePl": "Terminy wypałów są w kalendarzu pracowni: podajemy datę z kalendarza, a nie szacunkową.",
   "k": "restock zapas powiadomienie notify",
   "intentTop": 1,
   "intents": [
    68
   ]
  },
  {
   "id": "c-availability-the-yellow-is-back",
   "c": "availability",
   "t": "Availability, the yellow is back",
   "tPl": "Dostępność, mirabelkowa żółć wróciła",
   "en": "{GREET}, {PAX}. The mirabelle yellow is back. A new batch came out of the kiln this morning and is on the shop's shelves now, and as promised, you're hearing it first.",
   "pl": "{GREET}, {PAX}. Mirabelkowa żółć wróciła. Nowa partia wyszła dziś rano z pieca i już stoi na sklepowych półkach, a zgodnie z obietnicą ta wiadomość przychodzi jako pierwsza.",
   "k": "żółty yellow mirabelka mirabelle wróciło back dostępne available",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    68
   ]
  },
  {
   "id": "c-availability-when-it-will-arrive",
   "c": "availability",
   "t": "Availability, when it will arrive",
   "tPl": "Dostępność, kiedy dotrze",
   "en": "It's in stock, so it leaves the studio within two working days and arrives in Poland the next working day after that.\n\nThat glaze is between firings at the moment. The next batch comes out of the kiln on [date], and your piece leaves the studio within two working days of it.",
   "pl": "Ta rzecz jest na stanie, więc wyjedzie z pracowni w ciągu dwóch dni roboczych, a w Polsce dotrze następnego dnia roboczego.\n\nTo szkliwo czeka właśnie na kolejny wypał. Nowa partia wyjdzie z pieca [data], a zamówiona rzecz wyjedzie z pracowni w ciągu dwóch dni roboczych od tego dnia.",
   "k": "kiedy when dostawa delivery stan stock wysyłka dispatch",
   "alt": 1,
   "intents": [
    11
   ]
  },
  {
   "id": "c-availability-a-set-from-one-firing",
   "c": "availability",
   "t": "Availability, a set from one firing",
   "tPl": "Dostępność, komplet z jednego wypału",
   "en": "There are [number] of those in the studio from one firing, so a set of that size can go out matched. Order them together, and I'll make sure they're picked from the same batch.",
   "pl": "W pracowni jest [liczba] takich sztuk z jednego wypału, więc komplet tej wielkości może wyjechać dobrany. Wystarczy zamówić je razem, a dopilnuję, żeby wszystkie pochodziły z tej samej partii.",
   "note": "Check the batch on the studio shelf before promising a match.",
   "notePl": "Przed obietnicą kompletu warto sprawdzić partię na półce w pracowni.",
   "k": "komplet set partia batch wypał firing pasujące matching",
   "intents": [
    10
   ]
  },
  {
   "id": "c-availability-choosing-a-piece",
   "c": "availability",
   "t": "Availability, choosing a piece",
   "tPl": "Dostępność, wybór egzemplarza",
   "en": "Every piece in a batch is a little different, and the photo shows one of them. If it helps, I'll look along the shelf and pick the one closest to the photo, or the one where the glaze has pooled most beautifully at the rim, as you prefer.",
   "pl": "Każda sztuka z partii jest trochę inna, a zdjęcie pokazuje jedną z nich. Chętnie przejrzę półkę i wybiorę tę najbliższą zdjęciu albo tę, na której szkliwo najpiękniej spłynęło przy brzegu, zależnie od upodobań.",
   "k": "wybór choose egzemplarz piece zdjęcie photo podobny similar",
   "intents": [
    50
   ]
  },
  {
   "id": "c-availability-another-colour",
   "c": "availability",
   "t": "Availability, another colour",
   "tPl": "Dostępność, inny kolor",
   "en": "Good news: the colour you'd like, [glaze], is on the shelves now, so the exchange can go ahead today. As soon as your first piece is back with us, the new one leaves the studio within two working days.",
   "pl": "Dobra wiadomość: wybrany kolor, [szkliwo], jest teraz na półkach, więc wymiana może ruszyć od razu. Gdy tylko pierwsza rzecz do nas wróci, nowa wyjedzie z pracowni w ciągu dwóch dni roboczych.",
   "k": "kolor colour wymiana exchange inny another szkliwo glaze",
   "intents": [
    24
   ]
  },
  {
   "id": "c-availability-a-replacement-to-wait-for",
   "c": "availability",
   "t": "Availability, a replacement to wait for",
   "tPl": "Dostępność, wymiana z kolejnej partii",
   "en": "The next batch in that glaze comes out of the kiln on [date], and a new piece will leave the studio for you within two working days of it. If that's longer than you'd like to wait, a piece in another glaze can leave within two working days instead, or the full price can go back to your card.",
   "pl": "Kolejna partia w tym szkliwie wyjdzie z pieca [data], a nowa rzecz wyjedzie z pracowni w ciągu dwóch dni roboczych od tego dnia. Jeśli to zbyt długie czekanie, w tym samym czasie może wyjechać rzecz w innym szkliwie albo cała kwota może wrócić na kartę.",
   "k": "wymiana replacement partia batch czekanie wait wypał firing",
   "intents": [
    20
   ]
  },
  {
   "id": "c-availability-made-to-order",
   "c": "availability",
   "t": "Availability, made to order",
   "tPl": "Dostępność, na zamówienie",
   "en": "Yes, the studio can make it for you. A piece made to order is thrown and fired for you alone, so it would leave the studio on [date], at [amount]. Once the order is placed, the date is held for you in the studio's kiln calendar.",
   "pl": "Tak, pracownia może ją wykonać. Rzecz na zamówienie jest toczona i wypalana specjalnie dla jednej osoby, więc wyjedzie z pracowni [data], a cena wyniesie [kwota]. Po złożeniu zamówienia ten termin zostaje zapisany w kalendarzu wypałów.",
   "k": "zamówienie order indywidualne custom wykonanie made termin date",
   "intents": [
    70
   ]
  },
  {
   "id": "c-availability-for-a-coffee-shop",
   "c": "availability",
   "t": "Availability, for a coffee shop",
   "tPl": "Dostępność, zastawa dla kawiarni",
   "en": "Trade sets are made to order rather than taken from the shelves, so every glaze in the range is open to you, however the shop looks today. A set leaves the studio about six weeks after the order.",
   "pl": "Zestawy dla lokali powstają na zamówienie, a nie z tego, co akurat stoi na półkach, więc do wyboru jest każde szkliwo z naszej palety, niezależnie od tego, co dziś widać w sklepie. Zestaw wyjeżdża z pracowni po około sześciu tygodniach od zamówienia.",
   "k": "kawiarnia cafe dostępne available szkliwo glaze zestaw set",
   "intents": [
    66
   ]
  },
  {
   "id": "c-availability-seconds",
   "c": "availability",
   "t": "Seconds",
   "tPl": "Drugi gatunek",
   "en": "Seconds are pieces with a small mark from the kiln, a speck in the glaze or a slightly uneven rim, which we'd rather sell at a third off than set aside. They're every bit as safe to use and as happy in the dishwasher, and they can be returned like anything else.",
   "pl": "Drugi gatunek to rzeczy z drobnym śladem z pieca: kropką w szkliwie albo lekko nierównym brzegiem. Zamiast je odkładać, sprzedajemy je o jedną trzecią taniej. Są tak samo bezpieczne w użyciu, można je myć w zmywarce i zwrócić jak wszystko inne.",
   "k": "drugi gatunek seconds taniej cheaper rabat discount ślad mark",
   "intents": [
    69
   ]
  },
  {
   "id": "c-account-order-number",
   "c": "account",
   "t": "Order number, where to find it",
   "tPl": "Numer zamówienia, gdzie go znaleźć",
   "en": "Could you send me the order number, {PAX}? It's at the top of the confirmation email. If that email is hard to find, the address you ordered with works as well, and I'll find the order from that.",
   "pl": "Czy mogę prosić o numer zamówienia, {PAX}? Jest na górze maila z potwierdzeniem. Jeśli trudno go znaleźć, wystarczy adres e-mail użyty przy zamówieniu, a zamówienie odszukam po nim.",
   "k": "numer number zamówienie order potwierdzenie confirmation",
   "firstOnly": 1,
   "allIntents": 1,
   "paxVoc": 1
  },
  {
   "id": "c-account-privacy-confirming-the-email",
   "c": "account",
   "t": "Privacy, confirming the email",
   "tPl": "Prywatność, potwierdzenie adresu",
   "en": "Before I go into the order, {PAX}, could you confirm the email address it was placed with? It's only to make sure I'm talking to the right person, and it keeps your details where they belong.",
   "pl": "Zanim zajrzę do zamówienia, {PAX}, proszę jeszcze o potwierdzenie adresu e-mail, z którego zostało złożone. Chodzi tylko o to, żeby rozmawiać z właściwą osobą i żeby dane zostały tam, gdzie ich miejsce.",
   "note": "Before sharing an address, a payment or an invoice in the chat.",
   "notePl": "Przed podaniem na czacie adresu, płatności lub faktury.",
   "k": "prywatność privacy potwierdzenie verify tożsamość identity adres address",
   "firstOnly": 1,
   "allIntents": 1,
   "paxVoc": 1
  },
  {
   "id": "c-account-ordering-without-one",
   "c": "account",
   "t": "Account, ordering without one",
   "tPl": "Konto, zakupy bez zakładania",
   "en": "An account is entirely optional. Every order, with or without one, gets its confirmation and its invoice by email, so nothing is lost either way. An account only saves typing your address next time.",
   "pl": "Konto jest zupełnie dobrowolne. Każde zamówienie, z kontem czy bez, dostaje potwierdzenie i fakturę mailem, więc nic nie przepada. Konto oszczędza tylko wpisywania adresu przy kolejnych zakupach.",
   "k": "konto account gość guest rejestracja register potwierdzenie confirmation",
   "intents": [
    6
   ]
  },
  {
   "id": "c-account-discount-code-no-account-needed",
   "c": "account",
   "t": "Discount code, no account needed",
   "tPl": "Kod rabatowy, bez konta",
   "en": "A discount code works with or without an account. Enter it in the basket before you pay, and the new total shows straight away.",
   "pl": "Kod rabatowy działa z kontem i bez niego. Wystarczy wpisać go w koszyku przed płatnością, a nowa kwota pojawi się od razu.",
   "k": "kod code rabat discount konto account koszyk basket",
   "intents": [
    40
   ]
  },
  {
   "id": "c-account-a-new-email-address",
   "c": "account",
   "t": "Account, a new email address",
   "tPl": "Konto, nowy adres e-mail",
   "en": "Of course. Once you're signed in, the new address can go in the account settings. Or, if it's easier, send me the old address and the new one, and I'll change it for you now.",
   "pl": "Oczywiście. Po zalogowaniu nowy adres można wpisać w ustawieniach konta. Można też przesłać mi stary i nowy adres, a zmienię go od razu.",
   "k": "email mail adres address zmiana change ustawienia settings",
   "intents": [
    71
   ]
  },
  {
   "id": "c-account-a-forgotten-password",
   "c": "account",
   "t": "Account, a forgotten password",
   "tPl": "Konto, zapomniane hasło",
   "en": "It happens to all of us. On the sign-in page, click Forgot your password, and a link to set a new one will arrive by email within a few minutes. Nothing in the account changes but the password.",
   "pl": "Każdemu się zdarza. Na stronie logowania wystarczy kliknąć Nie pamiętam hasła, a link do ustawienia nowego przyjdzie mailem w ciągu kilku minut. Zmienia się wyłącznie hasło, a reszta konta zostaje taka, jak była.",
   "k": "hasło password logowanie sign in link reset",
   "intents": [
    72
   ]
  },
  {
   "id": "c-account-newsletter-unsubscribing",
   "c": "account",
   "t": "Newsletter, unsubscribing",
   "tPl": "Newsletter, wypisanie",
   "en": "Of course, {PAX}. Your address is off the list now, and the newsletter won't come again. For another time, the unsubscribe link sits at the foot of every issue. Thank you for reading along all these months.",
   "pl": "Oczywiście, {PAX}. Adres jest już usunięty z listy i newsletter nie będzie więcej przychodzić. Na przyszłość: link do wypisania się jest na dole każdego wydania. Dziękuję za wspólnie spędzone miesiące.",
   "k": "newsletter wypisać unsubscribe lista list mail",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    73
   ]
  },
  {
   "id": "c-account-deleting-your-data",
   "c": "account",
   "t": "Account, deleting your data",
   "tPl": "Konto, usunięcie danych",
   "en": "{GREET}, {PAX}. Of course. Your request is passed on, and your personal data will be deleted within 30 days. Anything the law asks us to keep, such as invoices, is kept only as long as it must be and used for nothing else.",
   "pl": "{GREET}, {PAX}. Oczywiście. Prośba jest już przekazana, a dane osobowe zostaną usunięte w ciągu 30 dni. To, co musimy przechowywać z mocy prawa, na przykład faktury, zostaje tylko tak długo, jak wymagają tego przepisy, i do niczego innego nie służy.",
   "k": "dane data usunięcie delete rodo gdpr prywatność privacy",
   "firstOnly": 1,
   "paxVoc": 1,
   "intents": [
    74
   ]
  }
 ],
 "version": "2026-09-24",
 "sample": 1,
 "categoriesPl": {
  "opening": "Powitanie",
  "holding": "W trakcie",
  "closing": "Pożegnanie",
  "orders": "Zamówienia",
  "delivery": "Dostawa",
  "damaged": "Uszkodzenia w drodze",
  "returns": "Zwroty i wymiany",
  "faults": "Reklamacje",
  "payments": "Płatności",
  "invoices": "Faktury",
  "care": "Pielęgnacja",
  "personalisation": "Personalizacja",
  "workshops": "Warsztaty",
  "gift-cards": "Karty podarunkowe",
  "trade": "Kawiarnie i firmy",
  "availability": "Dostępność",
  "account": "Konto i newsletter"
 },
 "who": [
  "Zosia",
  "Kuba",
  "Ola",
  "Tadek"
 ],
 "facts": "THE STUDIO\nMirabelka is a ceramics studio in Warsaw with its\nown shop. Everything is thrown, glazed and fired\nhere by hand, so no two pieces are quite alike. The\nbest-loved glaze is a mirabelle yellow.\n\nWHO IS WHO\nZosia throws the mugs and the teapots. Kuba mixes\nthe glazes. Ola paints the names and teaches the\nclasses. Tadek fires the kiln and packs the parcels.\n\nTHE CHAT\nMonday to Saturday, 9:00 to 20:00.\n\nDELIVERY\nPieces in stock leave within two working days.\nPoland: courier 18 zł, parcel locker 14 zł, both\nfree over 300 zł, arriving the next working day\nafter dispatch. The EU and the UK: courier, four\nto seven working days, the price shown at checkout.\nCollection from the studio, free, Tuesday to\nSaturday, 11:00 to 19:00.\n\nPAYMENT\nCard, BLIK or bank transfer; an order waits three\ndays for a transfer. Cash on delivery by courier,\nin Poland only.\n\nRETURNS\n14 days, no reason needed, for anything but a\npersonalised piece. The label by email, or a\ncourier at the door on a chosen working day, with\nthe label. Money back on the card within three\ndays of the parcel reaching us; banks usually show\nit within three working days.\nAfter 14 days, an unused piece earns a credit for\nits full price, valid for a year in the shop or at\na workshop.\n\nBROKEN IN TRANSIT\nTwo photos, of the piece and of the box. Then a\nreplacement or a refund, and nothing to send back.\n\nFAULTS\nAny fault in a personalised piece is put right; a\nchange of mind is the one return we cannot take.\nA complaint is answered within 14 days, usually\nwithin three.\n\nINVOICES\nBy email with every order. For a company on\nrequest, with its name, address and VAT number (NIP).\n\nPERSONALISATION\nNames and inscriptions up to 12 letters, painted by\nhand before the firing. The piece leaves about ten\nworking days after the order. The wording can change\nuntil it is painted, within two working days.\n\nSECONDS\nA small kiln mark, a third off, returnable like\nanything else.\n\nCARE\nEverything is dishwasher safe; washing by hand keeps\ndark glazes bright for longer. Glazes are lead-free\nand food safe. Microwave safe, except gold lustre.\nNever the oven or the hob.\n\nWORKSHOPS\nWheel classes on weekday evenings at 18:00 and at\nweekends, 220 zł a person, eight places a class.\nAprons and clay provided. Pieces fired, glazed and\nready about three weeks later; kept two months, or\nsent by courier at the delivery price. Moved free\nup to 48 hours before. Children's classes on\nSaturday mornings, from seven years old, with an\nadult. Private groups from six people.\n\nGIFT CARDS\n50 zł to 1000 zł, valid for a year, in the shop and\nfor classes. By email, or printed in a box for 10 zł.\n\nTRADE\nSets from 24 pieces in any glaze, a logo stamped\ninto the base. 20 per cent off from 24 pieces, 30\nper cent off from 100. A three-piece sample set\nfirst, its cost taken off the first order. A set\nleaves about six weeks after the order.\n\nACCOUNT AND NEWSLETTER\nAn account is optional. The newsletter comes\nmonthly, with an unsubscribe link at its foot.\nPersonal data deleted on request within 30 days.\n\nPRACOWNIA\nMirabelka to pracownia ceramiki w Warszawie\nz własnym sklepem. Wszystko powstaje tu ręcznie:\ntoczenie, szkliwienie i wypał, dlatego nie ma dwóch\ntakich samych rzeczy. Najbardziej lubiane szkliwo\nma kolor dojrzałej mirabelki.\n\nKTO CO ROBI\nZosia toczy kubki i czajniczki. Kuba miesza\nszkliwa. Ola maluje imiona i prowadzi warsztaty.\nTadek pilnuje pieca i pakuje paczki.\n\nCZAT\nOd poniedziałku do soboty, od 9:00 do 20:00.\n\nDOSTAWA\nRzeczy dostępne od ręki wyjeżdżają w ciągu dwóch\ndni roboczych. W Polsce kurier kosztuje 18 zł, a\nautomat paczkowy 14 zł; przy zamówieniu powyżej\n300 zł dostawa jest bezpłatna. Paczka dociera\nnastępnego dnia roboczego po nadaniu. Do krajów\nUnii i do Wielkiej Brytanii kurierem, od czterech\ndo siedmiu dni roboczych, cena widoczna przy\nzamówieniu. Odbiór osobisty w pracowni bezpłatny,\nod wtorku do soboty, od 11:00 do 19:00.\n\nPŁATNOŚCI\nKarta, BLIK albo przelew; na przelew zamówienie\nczeka trzy dni. Za pobraniem tylko kurierem\ni tylko w Polsce.\n\nZWROTY\n14 dni bez podawania przyczyny, na wszystko poza\nrzeczami z personalizacją. Etykieta mailem albo\nkurier pod drzwiami w wybrany dzień roboczy,\nz etykietą. Pieniądze wracają na kartę w ciągu\ntrzech dni od dotarcia paczki do pracowni; bank\nzwykle pokazuje je w ciągu trzech dni roboczych.\nPo 14 dniach za nieużywaną rzecz bon na pełną\nkwotę, ważny rok, w sklepie albo na warsztatach.\n\nUSZKODZENIA W DRODZE\nDwa zdjęcia: rzeczy i kartonu. Potem nowa sztuka\nalbo zwrot pieniędzy, bez odsyłania czegokolwiek.\n\nREKLAMACJE\nKażdą wadę rzeczy z personalizacją naprawiamy;\nzmiana zdania to jedyny zwrot, którego nie\nprzyjmujemy. Odpowiedź na reklamację w ciągu 14\ndni, zwykle w ciągu trzech.\n\nFAKTURY\nMailem przy każdym zamówieniu. Na firmę na\nżyczenie: nazwa, adres i NIP.\n\nPERSONALIZACJA\nImiona i napisy do 12 liter, malowane ręcznie przed\nwypaleniem. Rzecz wyjeżdża około dziesięciu dni\nroboczych po zamówieniu. Treść można zmienić, dopóki\nnie jest namalowana, w ciągu dwóch dni roboczych.\n\nDRUGI GATUNEK\nDrobny ślad z pieca, o jedną trzecią taniej, zwrot\njak przy każdej innej rzeczy.\n\nPIELĘGNACJA\nWszystko można myć w zmywarce; ciemne szkliwa\ndłużej zachowują blask przy myciu ręcznym. Szkliwa\nbez ołowiu, bezpieczne dla żywności. Mikrofalówka\ntak, poza rzeczami ze złoceniem. Nigdy piekarnik\nani płyta kuchenna.\n\nWARSZTATY\nToczenie na kole w dni powszednie o 18:00 i w\nweekendy, 220 zł od osoby, osiem miejsc na zajęciach.\nFartuchy i glina na miejscu. Prace wypalone\ni szkliwione po około trzech tygodniach; czekają\ndwa miesiące albo jadą kurierem w cenie dostawy.\nZmiana terminu bez opłat do 48 godzin przed\nzajęciami. Dla dzieci w soboty rano, od siedmiu\nlat, z dorosłym. Grupy prywatne od sześciu osób.\n\nKARTY PODARUNKOWE\nOd 50 do 1000 zł, ważne rok, w sklepie i na\nwarsztatach. Mailem albo wydrukowane, w pudełku\nza 10 zł.\n\nKAWIARNIE I FIRMY\nKomplety od 24 sztuk w dowolnym szkliwie, z logo\nodciśniętym na spodzie. 20 procent taniej od 24\nsztuk, 30 procent od 100. Najpierw komplet próbny,\ntrzy sztuki, a jego koszt odliczamy od pierwszego\nzamówienia. Komplet wyjeżdża około sześciu tygodni\npo zamówieniu.\n\nKONTO I NEWSLETTER\nZakupy można robić także bez konta. Newsletter\nraz w miesiącu, link do wypisania na samym dole.\nDane usuwane na życzenie w ciągu 30 dni.",
 "commentLang": "en",
 "greet": {
  "en": [
   "Good morning",
   "Good afternoon",
   "Good evening"
  ],
  "pl": [
   "Dzień dobry",
   "Dzień dobry",
   "Dobry wieczór"
  ]
 }
};
