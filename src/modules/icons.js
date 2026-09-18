/* Hide / show is an eye everywhere: open = press to hide, closed = press to show - the
   icon reports state, the tooltip the action. Inline SVG, not the emoji, which renders in
   colour on Windows where `color` cannot reach. Stroked currentColor so every existing
   hover rule keeps working untouched. */
const ICON_EYE_OPEN='<svg class="ic-eye" viewBox="0 0 20 20" aria-hidden="true" focusable="false">'
  +'<path d="M1.9 10S5 5.1 10 5.1 18.1 10 18.1 10 15 14.9 10 14.9 1.9 10 1.9 10Z"/>'
  +'<circle cx="10" cy="10" r="2.5"/></svg>';
const ICON_EYE_SHUT='<svg class="ic-eye" viewBox="0 0 20 20" aria-hidden="true" focusable="false">'
  +'<path d="M2.2 8.1c1.9 2.7 4.6 4.2 7.8 4.2s5.9-1.5 7.8-4.2"/>'
  +'<path d="M3.5 11.3 2.1 13.2"/><path d="M7.2 13 6.5 15.3"/>'
  +'<path d="M12.8 13l.7 2.3"/><path d="M16.5 11.3l1.4 1.9"/></svg>';
/* Drawn, not typed. ASTERISK = supporting ("matches everything"); FLAG = where a
   conversation starts. Deliberately NOT drawings of the rings they control - the buttons
   already turn those exact colours when on, and shape must tell the two apart at a glance.
   Slightly heavier stroke than the eye: thinner shapes need it to hold the same weight. */
const ICON_ROLE_ALWAYS='<svg class="ic-role" viewBox="0 0 20 20" aria-hidden="true" focusable="false">'
  +'<path d="M10 4v12M5.2 6.4l9.6 7.2M14.8 6.4l-9.6 7.2"/></svg>';
/* Every icon stroked with currentColor and no colour of its own, so hover, .on, danger
   and gold rules reach them with no extra CSS. The star is one path used twice - outlined
   off, filled on (ic-fill) - so the two states cannot drift out of alignment. */
const _svg=(cls,d)=>'<svg class="'+cls+'" viewBox="0 0 20 20" aria-hidden="true" focusable="false">'+d+'</svg>';
const ICON_EDIT=_svg("ic",'<path d="M4 16l.9-3.4 8.7-8.7a1.7 1.7 0 0 1 2.4 2.4l-8.7 8.7z"/><path d="M12.4 5.2l2.4 2.4"/>');
/* ONE rib - two merge into a filled block at device size, and none reads as a bucket.
   Straight walls, rounded foot; a sub-pixel taper is path complexity buying no ink. */
const ICON_TRASH=_svg("ic",
  '<path d="M4.4 6.3h11.2M8.1 6.3V4.8a1.1 1.1 0 0 1 1.1-1.1h1.6a1.1 1.1 0 0 1 1.1 1.1v1.5"/>'
  +'<path d="M6.4 6.3v8.4a1.7 1.7 0 0 0 1.7 1.7h3.8a1.7 1.7 0 0 0 1.7-1.7V6.3"/>'
  +'<path d="M10 9.2v4.4"/>');
const _STAR='<path d="M10 3.3l2.1 4.2 4.7.7-3.4 3.3.8 4.6L10 13.9l-4.2 2.2.8-4.6L3.2 8.2l4.7-.7z"/>';
const _NOTE='<circle cx="10.5" cy="4.3" r="1.2"/><path d="M8 8.7h2.6v5.8M8.2 14.5h4.6"/>';
/* ---- Category icons: the engine ships the DRAWINGS and nothing else - which icon a
   category wears is the user's choice in pack.catIcons. No catalog carries markup (a
   catalog is data, never executed) and no category id is known to this file. MUSIC is the
   fallback pool - eight symbols legible at 13px reading as one set; the rest are offered
   in the picker. */
/* A card with two shorter cards receding - the empty states' own stack, existing
   vocabulary rather than a new shape. Deliberately NOT in CAT_ICONS: that pool is what the
   picker offers, and "everything" is not something one category may wear. */
const ICON_ALL='<rect x="2.5" y="7.9" width="15" height="9.2" rx="2"/><path d="M5 5.4h10M7.1 2.9h5.8"/>';
/* Optical centring for the dot, applied as a wrapping transform so the drawings stay untouched.
   RE-DERIVED for the family below, with getBBox in a real renderer and no eye correction at all:
   the figure's box is put in the middle of the 20 grid, which is what the old table's baseline
   was. 20 of the 36 measured dead centre and took no entry; the rest are under half a unit but
   for a notehead, whose stem leans its box a unit and a half, and a split, whose arrowheads do.
   The three drawings that did not change keep the values they were given by eye. EVERY surface
   drawing an icon goes through catIconInner. */
const CAT_IC_NUDGE={"access":[-0.63,0.42],"bag":[0,0.41],"beam":[0.41,-0.21],"bubble":[0,-0.41],"doc":[-0.42,0],"external":[-0.41,0.41],"fermata":[0,-0.94],"flat":[-0.11,0],"fork":[-0.41,0],"heart":[0,-0.24],"note":[0,0.41],"notehead":[1.54,0.05],"paw":[0,-0.48],"person":[0,-0.21],"split":[0,-1.25],"undo":[0.1,-0.41],"gift":[0,-0.45],"car":[0,-0.85],"pencil":[-0.21,0.26]};
function catIconInner(k){
  const m=CAT_ICONS[k]||"", n=CAT_IC_NUDGE[k];
  return n?'<g transform="translate('+n[0]+' '+n[1]+')">'+m+'</g>':m;
}
const CAT_ICONS={
  notehead:'<path d="M12.77 11.97A4.58 3.25 -20 1 0 4.15 15.11A4.58 3.25 -20 1 0 12.77 11.97Z"/><path d="M12.92 2.92V12.78"/>',
  beam:'<circle cx="5.42" cy="14.58" r="2.5"/><circle cx="13.75" cy="12.92" r="2.5"/><path d="M7.92 14.58V5"/><path d="M16.25 12.92V3.33"/><path d="M7.92 5L16.25 3.33"/>',
  sharp:'<path d="M7.92 2.92V17.08"/><path d="M12.08 2.92V17.08"/><path d="M3.75 12.92L16.25 10.42"/><path d="M3.75 7.92L16.25 5.42"/>',
  flat:'<path d="M7.08 2.92V17.08"/><path d="M7.08 10.42C9.58 8.33 14.17 9.58 12.92 12.92C12.08 15 9.17 16.67 7.08 17.08"/>',
  natural:'<path d="M7.92 2.92V13.75"/><path d="M12.08 6.25V17.08"/><path d="M7.92 8.33L12.08 6.67"/><path d="M7.92 13.75L12.08 12.08"/>',
  fermata:'<path d="M3.75 13.75A6.25 6.25 0 0 1 16.25 13.75"/><circle cx="10" cy="12.92" r="1.46" fill="currentColor" stroke="none"/>',
  staff:'<path d="M2.92 3H17.08"/><path d="M2.92 6.5H17.08"/><path d="M2.92 10H17.08"/><path d="M2.92 13.5H17.08"/><path d="M2.92 17H17.08"/>',
  fork:'<path d="M7.08 2.92V7.92A3.33 3.33 0 0 0 13.75 7.92V2.92"/><path d="M10.42 11.25V17.08"/>',
  bubble:'<path d="M5.42 3.75H14.58A2.5 2.5 0 0 1 17.08 6.25V12.08A2.5 2.5 0 0 1 14.58 14.58H9.58L5.42 17.08V14.58A2.5 2.5 0 0 1 2.92 12.08V6.25A2.5 2.5 0 0 1 5.42 3.75Z"/>',
  shield:'<path d="M10 2.92L3.75 5.42V9.17C3.75 13.33 6.67 16.25 10 17.08C13.33 16.25 16.25 13.33 16.25 9.17V5.42Z"/>',
  pause:'<rect x="3.75" y="3.75" width="4.17" height="12.5" rx="0.83"/><rect x="12.08" y="3.75" width="4.17" height="12.5" rx="0.83"/>',
  clock:'<circle cx="10" cy="10" r="7.08"/><path d="M10 6.25V10.42H12.92"/>',
  check:'<path d="M3.75 10.42L7.92 14.58L16.25 5.42"/>',
  idcard:'<rect x="3" y="5" width="14" height="10" rx="2"/><circle cx="7.4" cy="9" r="1.6"/><path d="M11.4 8.6h3.4M11.4 11.6h3.4M4.9 13.2c.5-1.3 4.5-1.3 5 0"/>',
  /* The same two strokes the intent band wears (ICON_INTENT_LINK) - one drawing for one
     idea, so redrawing either means redrawing both. */
  link:'<path d="M8.67 10.67a3.33 3.33 0 0 0 5.03 0.36l2 -2a3.33 3.33 0 0 0 -4.72 -4.72l-1.15 1.14"/><path d="M11.33 9.33a3.33 3.33 0 0 0 -5.03 -0.36l-2 2a3.33 3.33 0 0 0 4.72 4.72l1.15 -1.14"/>',
  split:'<path d="M10 17.08V10.83L4.58 5.42"/><path d="M10 10.83L15.42 5.42"/><path d="M4.58 9.17V5.42H8.33"/><path d="M15.42 9.17V5.42H11.67"/>',
  /* THE ONE FILLED DRAWING, and it says so on its own element, because the sheet strokes this
     family and fills nothing. It is the solid set's plane rather than the wireframe one, picked
     by eye from the two sheets: an outlined aircraft at 13px is a shape with a hole in it. */
  plane:'<path d="M10 1.67C11.17 1.67 12.08 2.5 12.08 3.75V7.92L18.33 12.08V14.17L12.08 12.08V15.83L13.75 17.5V18.33L10 17.33L6.25 18.33V17.5L7.92 15.83V12.08L1.67 14.17V12.08L7.92 7.92V3.75C7.92 2.5 8.83 1.67 10 1.67Z" fill="currentColor" stroke="none"/>',
  /* The arc runs the full three quarters and swings into the head's corner, so arrow and
     circle read as one stroke of motion. Drawn to survive 14px in a field as well as 13px
     in a dot. */
  undo:'<path d="M3.75 7.92H12.08A4.17 4.17 0 0 1 12.08 16.25H7.08"/><path d="M7.08 4.58L3.75 7.92L7.08 11.25"/>',
  card:'<rect x="2.92" y="4.58" width="14.17" height="10.83" rx="1.67"/><path d="M2.92 8.75H17.08"/>',
  external:'<path d="M9.58 3.75H5.42A1.67 1.67 0 0 0 3.75 5.42V14.58A1.67 1.67 0 0 0 5.42 16.25H14.58A1.67 1.67 0 0 0 16.25 14.58V10.42"/><path d="M10.42 9.58L17.08 2.92"/><path d="M12.08 2.92H17.08V7.92"/>',
  bolt:'<path d="M12.08 2.92L3.75 11.25H9.17L7.92 17.08L16.25 8.75H10.83Z"/>',
  doc:'<path d="M6.25 2.92H11.67L15.42 6.67V16.25A0.83 0.83 0 0 1 14.58 17.08H6.25A0.83 0.83 0 0 1 5.42 16.25V3.75A0.83 0.83 0 0 1 6.25 2.92Z"/><path d="M11.67 2.92V6.67H15.42"/>',
  bag:'<rect x="2.92" y="7.08" width="14.17" height="9.17" rx="1.25"/><path d="M7.92 7.08V4.17A1.25 1.25 0 0 1 9.17 2.92H10.83A1.25 1.25 0 0 1 12.08 4.17V7.08"/>',
  seat:'<path d="M5.42 2.92V17.08"/><path d="M5.42 12.08H14.58V17.08"/>',
  person:'<circle cx="10" cy="6.25" r="2.92"/><path d="M3.75 17.08V15.42A2.5 2.5 0 0 1 6.25 12.92H13.75A2.5 2.5 0 0 1 16.25 15.42V17.08"/>',
  /* A stick figure with its arms out, which `person` is not: the two are told apart by their
     LINES rather than by their heights, since a size argument does not survive 13px. */
  child:'<circle cx="10" cy="5.83" r="2.92"/><path d="M10 8.75V13.75"/><path d="M4.58 11.25H15.42"/><path d="M6.67 17.08L10 13.75L13.33 17.08"/>',
  calendar:'<rect x="2.92" y="5.42" width="14.17" height="11.67" rx="1.67"/><path d="M2.92 9.58H17.08"/><path d="M7.08 2.92V5.42"/><path d="M12.92 2.92V5.42"/>',
  pass:'<path d="M3.75 5.42H16.25A0.83 0.83 0 0 1 17.08 6.25V7.08A2.5 2.5 0 0 0 17.08 12.08V13.75A0.83 0.83 0 0 1 16.25 14.58H3.75A0.83 0.83 0 0 1 2.92 13.75V12.08A2.5 2.5 0 0 0 2.92 7.08V6.25A0.83 0.83 0 0 1 3.75 5.42Z"/>',
  /* The wheelchair - the international symbol. The wheel is an open arc with its gap
     exactly where the rider sits, so figure and wheel read as one mark. */
  access:'<circle cx="10.42" cy="3.96" r="1.46" fill="currentColor" stroke="none"/><path d="M10.42 6.67V10.83H14.17L16.25 15.83"/><path d="M7.47 9.39A3.75 3.75 0 1 0 12 14.79"/>',
  circles:'<circle cx="7.08" cy="10" r="4.17"/><circle cx="12.92" cy="10" r="4.17"/>',
  /* Two round loops with open middles - tight teardrop loops close into a moustache at dot
     size. */
  gift:'<rect x="3.6" y="8.4" width="12.8" height="8.2" rx="1.4"/><path d="M3.6 11.6h12.8M10 8.4v8.2"/><path d="M10 8.4C9.6 5.4 7.5 3.8 6.1 4.7 4.8 5.6 6 8.1 10 8.4ZM10 8.4C10.4 5.4 12.5 3.8 13.9 4.7 15.2 5.6 14 8.1 10 8.4Z"/>',
  lock:'<path d="M7.08 8.75V5.83A2.92 2.92 0 0 1 12.92 5.83V8.75"/><rect x="3.75" y="8.75" width="12.5" height="8.33" rx="1.25"/><circle cx="10" cy="12.92" r="1.25" fill="currentColor" stroke="none"/>',
  /* The bow is a wide ring on purpose: below r=3 its hole fills in at dot size, and a key
     whose bow reads solid is a spoon. Teeth on the far end, uneven, so the silhouette
     cannot be mistaken for the magnifier. */
  key:'<circle cx="6.25" cy="10" r="3.33"/><path d="M9.58 10H17.08"/><path d="M13.75 10V13.33"/><path d="M17.08 10V13.33"/>',
  car:'<path d="M15.8 14.2h1.7c.5 0 .8-.3.8-.8v-2.5c0-.7-.6-1.4-1.2-1.6C15.6 8.8 13.3 8.3 13.3 8.3s-1.1-1.2-1.8-1.9c-.4-.3-.9-.6-1.5-.6H4.2c-.5 0-.9.3-1.2.8l-1.2 2.4A3.1 3.1 0 0 0 1.7 10v3.3c0 .5.3.8.8.8h1.7"/><circle cx="5.8" cy="14.2" r="1.7"/><circle cx="14.2" cy="14.2" r="1.7"/><path d="M7.5 14.2h5"/>',
  heart:'<path d="M10 17.08C5.83 13.33 2.92 10.42 2.92 7.08A3.75 3.75 0 0 1 10 5.42A3.75 3.75 0 0 1 17.08 7.08C17.08 10.42 14.17 13.33 10 17.08Z"/>',
  pencil:'<path d="M4 16l.9-3.4 8.7-8.7a1.7 1.7 0 0 1 2.4 2.4l-8.7 8.7z"/><path d="M12.4 5.2l2.4 2.4"/>',
  /* A page with a corner turned up at its foot - square and low against `doc`'s tall page and
     high fold, which is how the two are told apart. A KEY OF ITS OWN rather than `pencil`: the
     bare pencil is every edit button's mark and a category wearing it blurs who is speaking, and
     the pencil drawing below stays for packs that chose it. */
  note:'<path d="M4.58 2.92H15.42A0.83 0.83 0 0 1 16.25 3.75V11.25L11.25 16.25H4.58A0.83 0.83 0 0 1 3.75 15.42V3.75A0.83 0.83 0 0 1 4.58 2.92Z"/><path d="M16.25 11.25H11.25V16.25"/>',
  star:_STAR,
  /* Offered in the picker, deliberately NOT in the automatic pool - a fallback must be
     one family, and staves mixed with paw prints is the grab-bag the palette avoids.
     Head and both ears are ONE closed outline, with no eye and no whisker: at 13px a face
     drawn inside a head is a smudge inside a circle. */
  cat:'<path d="M7.86 4.96L4.17 2.92L4.33 8.19A6.25 6.25 0 1 0 15.67 8.19L15.83 2.92L12.14 4.96A6.25 6.25 0 0 0 7.86 4.96Z"/>',
  paw:'<path d="M10 10.83C7.08 10.83 4.58 12.92 5.42 15.42C6.25 17.5 8.33 17.08 10 17.08C11.67 17.08 13.75 17.5 14.58 15.42C15.42 12.92 12.92 10.83 10 10.83Z"/><circle cx="3.75" cy="9.17" r="1.58" fill="currentColor" stroke="none"/><circle cx="7.5" cy="5.42" r="1.58" fill="currentColor" stroke="none"/><circle cx="12.5" cy="5.42" r="1.58" fill="currentColor" stroke="none"/><circle cx="16.25" cy="9.17" r="1.58" fill="currentColor" stroke="none"/>',
  /* One continuous outline, nose to forked tail, and the eye is FILLED: an eye drawn as a ring
     closes up at 13px. Measures dead centre, so it takes no nudge. */
  fish:'<path d="M2.92 10C5 5.83 9.17 4.58 12.92 7.08L17.08 4.58V15.42L12.92 12.92C9.17 15.42 5 14.17 2.92 10Z"/><circle cx="6.67" cy="9.17" r="1.17" fill="currentColor" stroke="none"/>'
};
/* What the loaded catalog says its categories should wear. Filled by eApplyCatalog from the
   file's `icons` / `colors` maps, empty for a catalog that declares neither. */
let CAT_ICONS_CATALOG={}, CAT_COLORS_CATALOG={};
/* eApplyCatalog builds the maps and hands them over instead of filling these: an imported
   binding is read-only, so once this region is its own module a write from outside it is not
   available at all. Every setter in this file that looks like it earns nothing is that same
   constraint, and this is the site the others point at. */
function setCatalogCatLooks(icons, colors){ CAT_ICONS_CATALOG=icons; CAT_COLORS_CATALOG=colors; }
/* Polish category names, keyed by id (categoriesPl). THE ENGINE NEVER TRANSLATES A
   CATEGORY NAME - it picks between names the curator wrote; a dictionary would overwrite
   a Polish curator's wording with a guess. Absent, the English label serves. */
let CAT_LABELS_PL={};
/* Handed over rather than written from outside; see setCatalogCatLooks. */
function setCatalogCatLabelsPl(m){ CAT_LABELS_PL=m; }
/* A SLOT NUMBER is an identity - written into packs, declared in catalogs; new hues are
   APPENDED. The CYCLE is the deal order, and it is not 0..7: colour-blind separation is a
   property of ADJACENT pairs, and this interleaving is the one that survives both themes -
   worst adjacent pair 8.2 dark / 6.9 light, the latter legal only beside a second channel,
   which the icon's shape and the label's text provide. Re-measure adjacent-pair separation
   in both themes before touching either list; the check is manual - no validation script
   exists. */
/* THE CYCLE IS THE ONLY AUTHORITY on what a slot may be - see hueIsOffered. There are eight
   --e-c* tokens and the palette deals seven, pink retired; the retired token stays defined
   so a pack still holding 5 resolves to a colour rather than nothing. Renumbering down would
   silently repaint every pinned slot. */
const E_HUE_CYCLE=[0,1,2,6,3,7,4];
/* Named, because "Colour 4" tells you nothing you cannot already see and nothing you can
   repeat to a colleague. The names describe the hue in both themes - a slot is one colour
   stepped for two surfaces, never two colours. */
const E_HUE_NAMES=["Blue","Orange","Green","Red","Violet","Pink","Magenta","Cyan"];
const CAT_ICON_MUSIC=["notehead","beam","sharp","flat","natural","fermata","staff","fork"];
/* `pencil` is drawn but NOT OFFERED: it is the interface's own edit mark, and a
   category wearing the UI's vocabulary blurs who is speaking. The drawing stays in
   CAT_ICONS - a pack that chose it must keep rendering; the editor grid appends a retired
   key the on-screen category still wears. */
const CAT_ICON_KEYS=CAT_ICON_MUSIC.concat(Object.keys(CAT_ICONS).filter(k=>CAT_ICON_MUSIC.indexOf(k)<0 && k!=="pencil"));
/* Before the pool, read the NAME - ordinary English words, not any catalog's
   vocabulary - so a fresh Etiuda starts with icons that mean something and the picker
   corrects the guess rather than doing all the work. First match wins: specific first. */
const CAT_ICON_HINTS=[
  [/bag|luggage|suitcase/i,"bag"],[/gift|voucher/i,"gift"],[/seat/i,"seat"],
  [/gdpr|privacy|data|legal/i,"lock"],[/secur|verif|ident/i,"shield"],
  [/refund|money.?back/i,"undo"],[/pay|billing|invoice|fee/i,"card"],
  /* Before the document rule: a category holding both words is about the NAME, not the papers. */
  [/name|passport|surname/i,"idcard"],
  [/claim|complaint|form|document|docs/i,"doc"],[/check.?in|boarding/i,"pass"],
  [/book|reservation/i,"calendar"],
  /* Credentials before people: an account category is about getting IN, and `person` is
     what a category about the passenger themselves takes. */
  [/account|login|password|sign.?in/i,"key"],[/profile|user|customer/i,"person"],
  [/flight|plane|route|travel/i,"plane"],[/disrupt|delay|cancel|strike/i,"bolt"],
  /* \b on purpose: "carry-on" and "card" both contain car and belong elsewhere. */
  [/\bcars?\b|taxi|parking/i,"car"],
  [/assist|special|accessib/i,"access"],[/open|greet|hello|intro/i,"bubble"],
  [/clos|end|finish|goodbye/i,"check"],[/escalat|angry|apolog|sorry/i,"heart"],
  [/comment|note|internal|log/i,"note"],[/third|3rd|partner|ota|agency/i,"circles"],
  [/split|divide|transfer/i,"split"],
  /* minor/child/infant guess the CHILD drawing, not the link: a category about people
     gets the person - linking is one thing you do with a minor's booking, not the whole
     category. */
  [/minor|child|infant|kid|famil/i,"child"],[/link|connect/i,"link"],
  [/hold|wait|pause/i,"pause"],[/idle|time|remind/i,"clock"],
  [/change|amend|modif/i,"undo"]
];
const ICON_STAR_ON=_svg("ic ic-fill",_STAR);
const ICON_STAR_OFF=_svg("ic",_STAR);
/* Each landmark answers a different question: a category icon says WHERE, the star says
   MINE, this says CONNECTED TO WHAT I SELECTED. A link because "linked" is the product's
   own word (Linked intents; cardLinksIntent) - no new metaphor. Wears .cat-ic, so the
   stroke weight and 13px sizing ride the existing rule. */
const ICON_INTENT_LINK='<svg class="cat-ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false">'
  +'<path d="M8.67 10.67a3.33 3.33 0 0 0 5.03 0.36l2 -2a3.33 3.33 0 0 0 -4.72 -4.72l-1.15 1.14"/><path d="M11.33 9.33a3.33 3.33 0 0 0 -5.03 -0.36l-2 2a3.33 3.33 0 0 0 4.72 4.72l1.15 -1.14"/></svg>';
const ICON_PLUS=_svg("ic",'<path d="M10 5v10M5 10h10"/>');
/* ---- icons in PROSE: the glyph is CLONED OFF THE BUTTON, so the button is the single
   source and a redraw follows into every sentence naming it. Tooltips are plain-text
   attributes and cannot hold an SVG - they name the control in words, the one place prose
   and picture must differ. */
/* Keyed by CONTROL, not by drawing - a key named after a picture starts lying the day
   the picture changes. */
// A source is a button to clone the icon from, or inline markup where no button carries it.
const PROSE_ICON_SRC={pin:"#railPinBtn", settings:"#settingsBtn", facts:"#factsBtn", theme:"#theme",
  all:'<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">'+ICON_ALL+'</svg>',
  star:'<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">'+_STAR+'</svg>'};
function fillProseIcons(root){
  const scope=root||document;
  if(!scope.querySelectorAll) return;
  scope.querySelectorAll("span[data-icon]").forEach(el=>{
    if(el.firstElementChild) return;                 // already filled
    const src=PROSE_ICON_SRC[el.getAttribute("data-icon")];
    if(!src) return;
    let c;
    if(src.charAt(0)==="<"){ el.innerHTML=src; c=el.firstElementChild; }
    else{
      const svg=document.querySelector(src+" svg");
      if(!svg) return;
      c=svg.cloneNode(true);
      el.appendChild(c);
    }
    c.setAttribute("class","ic ic-inline");
  });
}
const ICON_CHEVRON_R=_svg("ic ic-sm",'<path d="M8 5l5 5-5 5"/>');
const ICON_X=_svg("ic ic-sm",'<path d="M5 5l10 10M15 5L5 15"/>');
/* Both states. The body is CAT_ICONS.lock's plus a keyhole; only the shackle differs -
   open swings one leg up and ends PAST the leg it left (a shackle a pixel short reads as
   a drawing error). THE KEYHOLE IS A FILLED PIP, not a ring: at ~1.1 device px per unit a
   ring's walls fill in - verified by rasterising; unit arithmetic cannot answer this. NOT
   added to CAT_ICONS.lock, which draws inside a dot where a keyhole is noise. */
const ICON_LOCK=_svg("ic",
  '<rect x="5.2" y="8.8" width="9.6" height="7.6" rx="1.7"/>'+
  '<path d="M6.8 8.8V6.4a3.2 3.2 0 0 1 6.4 0v2.4"/>'+
  '<circle cx="10" cy="12.4" r="1.05" fill="currentColor" stroke="none"/><path d="M10 13.3v1.2"/>');
const ICON_LOCK_OPEN=_svg("ic",
  '<rect x="5.2" y="8.8" width="9.6" height="7.6" rx="1.7"/>'+
  '<path d="M6.8 8.8V6.4a3.2 3.2 0 0 1 6.3-.9"/>'+
  '<circle cx="10" cy="12.4" r="1.05" fill="currentColor" stroke="none"/><path d="M10 13.3v1.2"/>');
/* Drawn, not typed: a glyph is placed by its BASELINE - Segoe's metrics in a 16px line
   box land the ink centre 2.5px below the chip's middle, and no font choice fixes what
   centring a line box does. A viewBox has no baseline: both paths are symmetric about
   (10,10), so the ink centre IS the box centre at any size, in any theme. */
const ICON_TAB_X=_svg("ic","<path d=\"M5.5 5.5l9 9M14.5 5.5l-9 9\"/>");
const ICON_TAB_ADD=_svg("ic","<path d=\"M10 4.8v10.4M4.8 10h10.4\"/>");

/* CLEARING TEXT AND CLEARING A SELECTION ARE NOT THE SAME ACT. The eraser is right for
   AGENT/PAX/ROLE - something typed being rubbed out - and wrong for chosen intents, where
   nothing was written: the selection is being started over. That second mark is the rotating
   arrow drawn inline at #intentRailClear in the template: it is an interface icon and stays
   as it is, ruled 2026-09-18, while the category named `undo` took the new family's arrow.
   Deliberately NOT the app's Reset: that has no icon, and if it grows one it must not be this. */
const ICON_CLEAR_TEXT='<svg class="ic-x" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5.8 17.5l-3.6-3.6c-.8-.8-.8-2 0-2.8l8-8c.8-.8 2-.8 2.8 0l4.7 4.7c.8.8.8 2 0 2.8l-6.9 6.9"/><path d="M18.3 17.5H5.8"/><path d="M4.2 9.2l7.5 7.5"/></svg>';

export {
  ICON_CLEAR_TEXT,
  ICON_EYE_OPEN, ICON_EYE_SHUT, ICON_ROLE_ALWAYS, _svg, ICON_EDIT, ICON_TRASH, _STAR, _NOTE,
  ICON_ALL, catIconInner, CAT_ICONS, CAT_ICONS_CATALOG, CAT_COLORS_CATALOG, setCatalogCatLooks,
  CAT_LABELS_PL, setCatalogCatLabelsPl, E_HUE_CYCLE, E_HUE_NAMES, CAT_ICON_MUSIC, CAT_ICON_KEYS,
  CAT_ICON_HINTS, ICON_STAR_ON, ICON_STAR_OFF, ICON_INTENT_LINK, ICON_PLUS, fillProseIcons,
  ICON_CHEVRON_R, ICON_X, ICON_LOCK, ICON_LOCK_OPEN, ICON_TAB_X, ICON_TAB_ADD,
};
