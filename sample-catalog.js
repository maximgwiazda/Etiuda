/* Etiuda's sample catalog: opt-in demo content, never loaded automatically, and deliberately
   NOT a fallback a real catalog replaces - that would show sample cards to a licensee's agents
   whenever their own catalog failed to load. A sibling script rather than a fetch, so a copy
   opened from file:// can load it too; absent is a normal state and the engine simply stops
   offering it. Also the worked example of the format: every supported field appears once. */
window.PB_SAMPLE={
  format:1, kind:"playbook-catalog", name:"Sample content",
  /* Drives the watermark. A property of the catalog rather than a check on its name, so
     renaming it cannot quietly remove the warning. Not carried into an export: the moment you
     export you are making your own catalog, and it should not inherit a "this is a demo" mark. */
  sample:1,
  /* Four ISSUE categories, not one: with a single target the pills never re-order and the
     green ring never moves - the most visible thing Etiuda does was invisible in the demo.
     The supporting five carry "always"; the issue four carry none, and intents pointing at
     them is what turns pills green. */
  categories:{ open:"Openers", sec:"Security", hold:"Holding",
               book:"Bookings", money:"Payments", bags:"Baggage", delay:"Disruption",
               close:"Closers", skys:"Comments" },
  /* Here because the sample is the format's worked example - and the only way the demo
     reads Polish on a Polish interface: the engine picks between names the catalog wrote,
     it never translates one. */
  categoriesPl:{ open:"Powitania", sec:"Bezpieczeństwo", hold:"Oczekiwanie",
                 book:"Rezerwacje", money:"Płatności", bags:"Bagaż", delay:"Zakłócenia",
                 close:"Zakończenia", skys:"Komentarze" },
  roles:{ always:["open","sec","hold","close","skys"], opener:"open" },
  /* Deliberately generic and few - the field exists to show a catalog supplies {ROLE}'s
     vocabulary. ROLE takes free text regardless, so the list is a shortcut, not a limit. */
  who:["customer","account holder","authorised contact","third party"],
  intents:{
    en:["changing your booking","a refund request","your baggage allowance",
        "a payment that failed","a delay to your journey","updating your contact details"],
    pl:["zmianą rezerwacji","prośbą o zwrot","limitem bagażu",
        "nieudaną płatnością","opóźnieniem podróży","aktualizacją danych kontaktowych"],
    /* Each intent points at a different category, so picking one visibly re-sorts the pills.
       The delay intent carries an ARRAY - a delay is both a disruption and a money question,
       and an intent may light more than one category green. */
    cat:["book","money","bags","money",["delay","money"],"book"],
    cmt:["booking updated","refund requested","baggage explained",
         "payment issue investigated","delay explained","contact details updated"],
    topic:["the booking change","the refund","the baggage allowance",
           "the failed payment","the delay","the contact details"],
    /* The Polish halves. A catalog may ship either language first; the sample ships both so a
       Polish interface has something to show and the editor has something to demonstrate. */
    topicPl:["zmiana rezerwacji","zwrot","limit bagażu",
             "nieudana płatność","opóźnienie","dane kontaktowe"],
    cmtPl:["zaktualizowano rezerwację","złożono wniosek o zwrot","wyjaśniono kwestię bagażu",
           "zbadano problem z płatnością","wyjaśniono opóźnienie","zaktualizowano dane kontaktowe"]
  },
  cards:[
    { c:"open", t:"Cold open", tPl:"Otwarcie rozmowy", k:"hi hello greeting start",
      alt:1, firstOnly:1,
      note:"Two alternatives - click the one you want. {GREET} follows the clock. A cold open matters before the intent is known, so it stays out of the intent-linked view.",
      notePl:"Dwa warianty - kliknij ten, który chcesz. {GREET} podąża za zegarem. Zimne otwarcie liczy się zanim znasz intencję, więc nie wchodzi do widoku intencji.",
      en:"{GREET} {PAX}, my name is {AGENT}. How can I help you today?\n\n{GREET}, {AGENT} here. What can I do for you?",
      pl:"{GREET} {PAX}, z tej strony {AGENT}. W czym mogę pomóc?\n\n{GREET}, tu {AGENT}. Jak mogę pomóc?" },
    { c:"open", t:"Intent confirmed", tPl:"Potwierdzona intencja", k:"confirm understood",
      allIntents:1, intentTop:1, firstOnly:1,
      note:"{INTENT} writes the selected clause in the current language; {Z} picks z or ze to match what follows it.",
      notePl:"{INTENT} wstawia wybraną frazę w bieżącym języku; {Z} dobiera z albo ze do tego, co po nim następuje.",
      en:"I understand you are contacting us about {INTENT}. Let me check that for you.",
      pl:"Rozumiem, że kontaktuje się Pan/Pani w związku {Z} {INTENT}. Już sprawdzam." },
    { c:"sec", t:"Security check", tPl:"Weryfikacja tożsamości", k:"verify identity data",
      note:"Security is a supporting category - blue ring whatever the intent.",
      notePl:"Bezpieczeństwo to kategoria wspierająca - niebieski pierścień niezależnie od intencji.",
      en:"Before I continue, could you confirm the booking reference and the lead passenger's name?",
      pl:"Zanim przejdę dalej, proszę o numer rezerwacji i nazwisko głównego pasażera." },
    { c:"hold", t:"One moment please", tPl:"Chwileczkę", k:"hold wait moment bear", alt:1,
      note:"Another supporting category. Supporting pills keep their place and their blue ring while the issue categories re-sort themselves around whichever intent is picked.",
      notePl:"Kolejna kategoria wspierająca. Kategorie wspierające zachowują swoje miejsce i niebieski pierścień, podczas gdy kategorie tematyczne układają się na nowo wokół wybranej intencji.",
      en:"Thank you - please bear with me for a moment while I check that.\n\nOne moment please, I am looking into it now.",
      pl:"Dziękuję - proszę o chwilę cierpliwości, sprawdzam.\n\nJuż sprawdzam, proszę o moment." },
    { c:"hold", t:"Still working on it", tPl:"Nadal się tym zajmuję", k:"hold longer patience still",
      en:"Thank you for your patience - I am still looking into this for you.",
      pl:"Dziękuję za cierpliwość - nadal się tym zajmuję." },
    { c:"hold", t:"Are you still there?", tPl:"Czy jesteś tam jeszcze?", k:"idle quiet silent still there",
      en:"Are you still there? I am happy to keep helping if you are.",
      pl:"Czy jest Pan/Pani jeszcze z nami? Chętnie pomogę dalej." },
    { c:"book", t:"What a change costs", tPl:"Ile kosztuje zmiana", k:"fee price cost change", intents:[0],
      note:"Linked to one intent - pick the booking change and Bookings rings green while this card rises to the top.",
      notePl:"Powiązana z jedną intencją - wybierz zmianę rezerwacji, a Rezerwacje zaświecą się na zielono, natomiast ta karta przesunie się na górę.",
      en:"A change to your booking carries a fee, which depends on the fare you bought.",
      pl:"Zmiana rezerwacji wiąże się z opłatą zależną od zakupionej taryfy." },
    { c:"book", t:"Updating contact details", tPl:"Aktualizacja danych kontaktowych", k:"email phone address change details", intents:[5],
      en:"I can update the contact details on the booking - could you confirm the new ones?",
      pl:"Mogę zaktualizować dane kontaktowe w rezerwacji - proszę o podanie nowych." },
    { c:"money", t:"How a refund works", tPl:"Jak działa zwrot", k:"refund money back", intents:[1], alt:1, seq:1,
      note:"An ordered sequence - macros are numbered as steps rather than offered as alternatives.",
      notePl:"Uporządkowana sekwencja - makra są numerowane jako kroki, a nie oferowane jako warianty.",
      en:"First, I will submit the refund request on your behalf.\n\nYou will then receive a confirmation email.\n\nThe amount returns to the original payment method within 7 working days.",
      pl:"Najpierw złożę wniosek o zwrot w Pana/Pani imieniu.\n\nNastępnie otrzyma Pan/Pani e-mail potwierdzający.\n\nKwota wróci na pierwotną metodę płatności w ciągu 7 dni roboczych." },
    { c:"money", t:"Payment did not go through", tPl:"Płatność nie przeszła", k:"payment failed declined card", intents:[3],
      en:"The payment was declined by the bank, so nothing was charged. Shall we try again?",
      pl:"Płatność została odrzucona przez bank, więc nic nie zostało pobrane. Spróbujemy ponownie?" },
    { c:"bags", t:"Baggage allowance", tPl:"Limit bagażu", k:"bag luggage cabin hold size", intents:[2],
      en:"Every passenger may bring one small cabin bag. Larger bags need to be added to the booking.",
      pl:"Każdy pasażer może zabrać jedną małą torbę do kabiny. Większy bagaż trzeba dodać do rezerwacji." },
    { c:"bags", t:"Adding a bag", tPl:"Dodanie bagażu", k:"add extra bag buy luggage", intents:[2],
      en:"I can add a bag to the booking now - it is cheaper here than at the airport.",
      pl:"Mogę teraz dodać bagaż do rezerwacji - tutaj jest taniej niż na lotnisku." },
    { c:"delay", t:"Why there is a delay", tPl:"Dlaczego jest opóźnienie", k:"delay late waiting reason", intents:[4],
      note:"The delay intent names two categories, so Disruption and Payments both ring green when it is picked.",
      notePl:"Intencja opóźnienia wskazuje dwie kategorie, więc po jej wybraniu na zielono świecą się i Zakłócenia, i Płatności.",
      en:"I am sorry about the delay. Let me check the latest information for you.",
      pl:"Przepraszam za opóźnienie. Sprawdzę dla Pana/Pani najnowsze informacje." },
    { c:"delay", t:"What you are entitled to", tPl:"Co Ci przysługuje", k:"compensation rights delay entitled", intents:[4],
      en:"Depending on how long the delay is, you may be entitled to assistance or compensation.",
      pl:"W zależności od długości opóźnienia może przysługiwać Panu/Pani pomoc lub odszkodowanie." },
    { c:"close", t:"Closing", tPl:"Zakończenie", k:"bye thanks goodbye", firstOnly:1,
      en:"Thank you for contacting us, {PAX}. Have a pleasant day.",
      pl:"Dziękuję za kontakt, {PAX}. Miłego dnia." },
    { c:"close", t:"Closing for inactivity", tPl:"Zakończenie z powodu braku aktywności", k:"idle close timeout inactive", firstOnly:1,
      en:"As I have not heard back, I will close this chat for now, {PAX}. Do write in again any time.",
      pl:"Ponieważ nie otrzymałem odpowiedzi, zamykam czat, {PAX}. Zapraszam do kontaktu w każdej chwili." },
    /* PINNED TO ENGLISH. An internal comment is written into the airline system, not sent to the
       passenger, so the language toggle has nothing to say about it - lockLang holds the card
       still while every other card follows the toggle. */
    { c:"skys", t:"Comment - action taken", tPl:"Komentarz - podjęte działanie", k:"note log comment",
      lockLang:"en",
      note:"{ACTION} is what was done and {TOPIC} is what it was about, both from the selected intents; {ROLE} comes from the ROLE box and {INIT} from the agent name - so the comment writes itself. An empty ROLE drops the token, so the wording has to still read without it: \"Assisted with…\".",
      notePl:"{ACTION} to, co zostało zrobione, a {TOPIC} to, czego dotyczyło - oba pochodzą z wybranych intencji; {ROLE} pochodzi z pola ROLE, a {INIT} z nazwiska agenta, więc komentarz pisze się sam. Puste ROLE usuwa token, więc treść musi czytać się także bez niego.",
      en:"Assisted {ROLE} with {TOPIC}. {ACTION}. /{INIT}",
      pl:"Assisted {ROLE} with {TOPIC}. {ACTION}. /{INIT}" },
    { c:"skys", t:"Comment - advised only", tPl:"Komentarz - tylko informacja", k:"note log comment advised",
      lockLang:"en",
      en:"Advised {ROLE} about {TOPIC}, nothing changed. /{INIT}",
      pl:"Advised {ROLE} about {TOPIC}, nothing changed. /{INIT}" }
  ],
  /* The panel renders white-space:pre - it scrolls sideways rather than wrapping, so
     every line is wrapped by hand. An author has to do that; the sample models it rather
     than demonstrating the scrollbar. Longest line below: 66 characters. */
  facts:"SAMPLE QUICK FACTS\n"
    +"Whatever you need at a glance. Edit with the pencil button.\n"
    +"Part of the catalog, so an export carries it with everything else.\n"
    +"\n"
    +"FEES\n"
    +"  Booking change      45.00\n"
    +"  Name change         25.00\n"
    +"  Extra cabin bag     15.00\n"
    +"\n"
    +"DEADLINES\n"
    +"  Refund processed    7 working days\n"
    +"  Online check-in     opens 48 h before departure\n"
    +"  Free cancellation   24 h after booking\n"
    +"\n"
    +"LIMITS\n"
    +"  Small cabin bag     40 x 20 x 25 cm\n"
    +"  Cabin bag           55 x 40 x 20 cm, 10 kg\n"
    +"  Checked bag         20 kg\n"
};
