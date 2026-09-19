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
const CAT_IC_NUDGE={"notehead":[1.44,0.05],"beam":[0.39,-0.2],"flat":[-0.1,0],"fermata":[0,-0.88],"fork":[-0.39,0],"bubble":[0,-0.39],"split":[0,-1.18],"undo":[0.1,-0.39],"external":[-0.39,0.39],"doc":[-0.39,0],"bag":[0.01,0.39],"person":[0,-0.2],"access":[-0.59,0.39],"heart":[0,-0.22],"note":[0,0.39],"paw":[0,-0.45],"gift":[0,-0.45],"car":[0,-0.85],"pencil":[-0.21,0.26]};
function catIconInner(k){
  const m=CAT_ICONS[k]||"", n=CAT_IC_NUDGE[k];
  return n?'<g transform="translate('+n[0]+' '+n[1]+')">'+m+'</g>':m;
}
/* Drawn on a 24 grid and scaled onto this one about its centre, 20/24 and then 0.9383,
   which puts the family at the extent of the set it replaced - a weight chosen by eye
   from a sheet carrying both. A key redrawn later joins at that scale or leaves the set. */
const CAT_ICONS={
  notehead:'<path d="M12.6 11.85A4.3 3.05 -20 1 0 4.51 14.79A4.3 3.05 -20 1 0 12.6 11.85Z"/><path d="M12.74 3.35V12.61"/>',
  beam:'<circle cx="5.7" cy="14.3" r="2.35"/><circle cx="13.52" cy="12.74" r="2.35"/><path d="M8.05 14.3V5.31"/><path d="M15.86 12.74V3.74"/><path d="M8.05 5.31L15.86 3.74"/>',
  sharp:'<path d="M8.05 3.35V16.65"/><path d="M11.95 3.35V16.65"/><path d="M4.14 12.74L15.86 10.39"/><path d="M4.14 8.05L15.86 5.7"/>',
  flat:'<path d="M7.26 3.35V16.65"/><path d="M7.26 10.39C9.61 8.44 13.91 9.61 12.74 12.74C11.95 14.69 9.22 16.26 7.26 16.65"/>',
  natural:'<path d="M8.05 3.35V13.52"/><path d="M11.95 6.48V16.65"/><path d="M8.05 8.44L11.95 6.87"/><path d="M8.05 13.52L11.95 11.95"/>',
  fermata:'<path d="M4.14 13.52A5.86 5.86 0 0 1 15.86 13.52"/><circle cx="10" cy="12.74" r="1.37" fill="currentColor" stroke="none"/>',
  staff:'<path d="M3.35 3.43H16.65"/><path d="M3.35 6.72H16.65"/><path d="M3.35 10H16.65"/><path d="M3.35 13.28H16.65"/><path d="M3.35 16.57H16.65"/>',
  fork:'<path d="M7.26 3.35V8.05A3.13 3.13 0 0 0 13.52 8.05V3.35"/><path d="M10.39 11.17V16.65"/>',
  bubble:'<path d="M5.7 4.14H14.3A2.35 2.35 0 0 1 16.65 6.48V11.95A2.35 2.35 0 0 1 14.3 14.3H9.61L5.7 16.65V14.3A2.35 2.35 0 0 1 3.35 11.95V6.48A2.35 2.35 0 0 1 5.7 4.14Z"/>',
  shield:'<path d="M10 3.35L4.14 5.7V9.22C4.14 13.13 6.87 15.86 10 16.65C13.13 15.86 15.86 13.13 15.86 9.22V5.7Z"/>',
  pause:'<rect x="4.14" y="4.14" width="3.91" height="11.73" rx="0.78"/><rect x="11.95" y="4.14" width="3.91" height="11.73" rx="0.78"/>',
  clock:'<circle cx="10" cy="10" r="6.65"/><path d="M10 6.48V10.39H12.74"/>',
  check:'<path d="M4.14 10.39L8.05 14.3L15.86 5.7"/>',
  idcard:'<rect x="3" y="5" width="14" height="10" rx="2"/><circle cx="7.4" cy="9" r="1.6"/><path d="M11.4 8.6h3.4M11.4 11.6h3.4M4.9 13.2c.5-1.3 4.5-1.3 5 0"/>',
  /* The same two strokes the intent band wears (ICON_INTENT_LINK) - one drawing for one
     idea, so redrawing either means redrawing both. */
  link:'<path d="M8.75 10.63a3.13 3.13 0 0 0 4.71 0.34l1.88 -1.88a3.13 3.13 0 0 0 -4.43 -4.43l-1.08 1.07"/><path d="M11.25 9.37a3.13 3.13 0 0 0 -4.71 -0.34l-1.88 1.88a3.13 3.13 0 0 0 4.43 4.43l1.08 -1.07"/>',
  split:'<path d="M10 16.65V10.78L4.92 5.7"/><path d="M10 10.78L15.08 5.7"/><path d="M4.92 9.22V5.7H8.44"/><path d="M15.08 9.22V5.7H11.56"/>',
  /* THE ONE FILLED DRAWING, and it says so on its own element, because the sheet strokes this
     family and fills nothing. It is the solid set's plane rather than the wireframe one, picked
     by eye from the two sheets: an outlined aircraft at 13px is a shape with a hole in it. */
  plane:'<path d="M10 2.18C11.09 2.18 11.95 2.96 11.95 4.14V8.05L17.82 11.95V13.91L11.95 11.95V15.47L13.52 17.04V17.82L10 16.88L6.48 17.82V17.04L8.05 15.47V11.95L2.18 13.91V11.95L8.05 8.05V4.14C8.05 2.96 8.91 2.18 10 2.18Z" fill="currentColor" stroke="none"/>',
  /* The arc runs the full three quarters and swings into the head's corner, so arrow and
     circle read as one stroke of motion. Drawn to survive 14px in a field as well as 13px
     in a dot. */
  undo:'<path d="M4.14 8.05H11.95A3.91 3.91 0 0 1 11.95 15.86H7.26"/><path d="M7.26 4.92L4.14 8.05L7.26 11.17"/>',
  card:'<rect x="3.35" y="4.92" width="13.29" height="10.16" rx="1.56"/><path d="M3.35 8.83H16.65"/>',
  external:'<path d="M9.61 4.14H5.7A1.56 1.56 0 0 0 4.14 5.7V14.3A1.56 1.56 0 0 0 5.7 15.86H14.3A1.56 1.56 0 0 0 15.86 14.3V10.39"/><path d="M10.39 9.61L16.65 3.35"/><path d="M11.95 3.35H16.65V8.05"/>',
  bolt:'<path d="M11.95 3.35L4.14 11.17H9.22L8.05 16.65L15.86 8.83H10.78Z"/>',
  doc:'<path d="M6.48 3.35H11.56L15.08 6.87V15.86A0.78 0.78 0 0 1 14.3 16.65H6.48A0.78 0.78 0 0 1 5.7 15.86V4.14A0.78 0.78 0 0 1 6.48 3.35Z"/><path d="M11.56 3.35V6.87H15.08"/>',
  bag:'<rect x="3.35" y="7.26" width="13.29" height="8.6" rx="1.17"/><path d="M8.05 7.26V4.53A1.17 1.17 0 0 1 9.22 3.35H10.78A1.17 1.17 0 0 1 11.95 4.53V7.26"/>',
  seat:'<path d="M5.7 3.35V16.65"/><path d="M5.7 11.95H14.3V16.65"/>',
  person:'<circle cx="10" cy="6.48" r="2.74"/><path d="M4.14 16.65V15.08A2.35 2.35 0 0 1 6.48 12.74H13.52A2.35 2.35 0 0 1 15.86 15.08V16.65"/>',
  /* A stick figure with its arms out, which `person` is not: the two are told apart by their
     LINES rather than by their heights, since a size argument does not survive 13px. */
  child:'<circle cx="10" cy="6.09" r="2.74"/><path d="M10 8.83V13.52"/><path d="M4.92 11.17H15.08"/><path d="M6.87 16.65L10 13.52L13.13 16.65"/>',
  calendar:'<rect x="3.35" y="5.7" width="13.29" height="10.95" rx="1.56"/><path d="M3.35 9.61H16.65"/><path d="M7.26 3.35V5.7"/><path d="M12.74 3.35V5.7"/>',
  pass:'<path d="M4.14 5.7H15.86A0.78 0.78 0 0 1 16.65 6.48V7.26A2.35 2.35 0 0 0 16.65 11.95V13.52A0.78 0.78 0 0 1 15.86 14.3H4.14A0.78 0.78 0 0 1 3.35 13.52V11.95A2.35 2.35 0 0 0 3.35 7.26V6.48A0.78 0.78 0 0 1 4.14 5.7Z"/>',
  /* The wheelchair - the international symbol. The wheel is an open arc with its gap
     exactly where the rider sits, so figure and wheel read as one mark. */
  access:'<circle cx="10.39" cy="4.33" r="1.37" fill="currentColor" stroke="none"/><path d="M10.39 6.87V10.78H13.91L15.86 15.47"/><path d="M7.62 9.43A3.52 3.52 0 1 0 11.88 14.5"/>',
  circles:'<circle cx="7.26" cy="10" r="3.91"/><circle cx="12.74" cy="10" r="3.91"/>',
  /* Two round loops with open middles - tight teardrop loops close into a moustache at dot
     size. */
  gift:'<rect x="3.6" y="8.4" width="12.8" height="8.2" rx="1.4"/><path d="M3.6 11.6h12.8M10 8.4v8.2"/><path d="M10 8.4C9.6 5.4 7.5 3.8 6.1 4.7 4.8 5.6 6 8.1 10 8.4ZM10 8.4C10.4 5.4 12.5 3.8 13.9 4.7 15.2 5.6 14 8.1 10 8.4Z"/>',
  lock:'<path d="M7.26 8.83V6.09A2.74 2.74 0 0 1 12.74 6.09V8.83"/><rect x="4.14" y="8.83" width="11.73" height="7.82" rx="1.17"/><circle cx="10" cy="12.74" r="1.17" fill="currentColor" stroke="none"/>',
  /* The bow is a wide ring on purpose: below r=3 its hole fills in at dot size, and a key
     whose bow reads solid is a spoon. Teeth on the far end, uneven, so the silhouette
     cannot be mistaken for the magnifier. */
  key:'<circle cx="6.48" cy="10" r="3.13"/><path d="M9.61 10H16.65"/><path d="M13.52 10V13.13"/><path d="M16.65 10V13.13"/>',
  car:'<path d="M15.8 14.2h1.7c.5 0 .8-.3.8-.8v-2.5c0-.7-.6-1.4-1.2-1.6C15.6 8.8 13.3 8.3 13.3 8.3s-1.1-1.2-1.8-1.9c-.4-.3-.9-.6-1.5-.6H4.2c-.5 0-.9.3-1.2.8l-1.2 2.4A3.1 3.1 0 0 0 1.7 10v3.3c0 .5.3.8.8.8h1.7"/><circle cx="5.8" cy="14.2" r="1.7"/><circle cx="14.2" cy="14.2" r="1.7"/><path d="M7.5 14.2h5"/>',
  heart:'<path d="M10 16.65C6.09 13.13 3.35 10.39 3.35 7.26A3.52 3.52 0 0 1 10 5.7A3.52 3.52 0 0 1 16.65 7.26C16.65 10.39 13.91 13.13 10 16.65Z"/>',
  pencil:'<path d="M4 16l.9-3.4 8.7-8.7a1.7 1.7 0 0 1 2.4 2.4l-8.7 8.7z"/><path d="M12.4 5.2l2.4 2.4"/>',
  /* A page with a corner turned up at its foot - square and low against `doc`'s tall page and
     high fold, which is how the two are told apart. A KEY OF ITS OWN rather than `pencil`: the
     bare pencil is every edit button's mark and a category wearing it blurs who is speaking, and
     the pencil drawing below stays for packs that chose it. */
  note:'<path d="M4.92 3.35H15.08A0.78 0.78 0 0 1 15.86 4.14V11.17L11.17 15.86H4.92A0.78 0.78 0 0 1 4.14 15.08V4.14A0.78 0.78 0 0 1 4.92 3.35Z"/><path d="M15.86 11.17H11.17V15.86"/>',
  star:_STAR,
  /* Offered in the picker, deliberately NOT in the automatic pool - a fallback must be
     one family, and staves mixed with paw prints is the grab-bag the palette avoids.
     Head and both ears are ONE closed outline, with no eye and no whisker: at 13px a face
     drawn inside a head is a smudge inside a circle. */
  cat:'<path d="M7.99 5.27L4.53 3.35L4.68 8.3A5.86 5.86 0 1 0 15.32 8.3L15.47 3.35L12.01 5.27A5.86 5.86 0 0 0 7.99 5.27Z"/>',
  paw:'<path d="M10 10.78C7.26 10.78 4.92 12.74 5.7 15.08C6.48 17.04 8.44 16.65 10 16.65C11.56 16.65 13.52 17.04 14.3 15.08C15.08 12.74 12.74 10.78 10 10.78Z"/><circle cx="4.14" cy="9.22" r="1.49" fill="currentColor" stroke="none"/><circle cx="7.65" cy="5.7" r="1.49" fill="currentColor" stroke="none"/><circle cx="12.35" cy="5.7" r="1.49" fill="currentColor" stroke="none"/><circle cx="15.86" cy="9.22" r="1.49" fill="currentColor" stroke="none"/>',
  /* One continuous outline, nose to forked tail, and the eye is FILLED: an eye drawn as a ring
     closes up at 13px. Measures dead centre, so it takes no nudge. */
  fish:'<path d="M3.35 10C5.31 6.09 9.22 4.92 12.74 7.26L16.65 4.92V15.08L12.74 12.74C9.22 15.08 5.31 13.91 3.35 10Z"/><circle cx="6.87" cy="9.22" r="1.09" fill="currentColor" stroke="none"/>'
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
  +'<path d="M8.75 10.63a3.13 3.13 0 0 0 4.71 0.34l1.88 -1.88a3.13 3.13 0 0 0 -4.43 -4.43l-1.08 1.07"/><path d="M11.25 9.37a3.13 3.13 0 0 0 -4.71 -0.34l-1.88 1.88a3.13 3.13 0 0 0 4.43 4.43l1.08 -1.07"/></svg>';
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
/* Four 14 px pill marks, 24-grid. Not in CAT_ICONS: that pool is what a category may wear. */
const ICON_AWAITING='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
  +'<circle cx="12.5" cy="12.5" r="8"/></svg>';
const ICON_LINT_ERROR='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
  +'<path d="M6.5 6.5l12 12M18.5 6.5l-12 12"/></svg>';
const ICON_LINT_WARNING='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
  +'<path d="M12.5 3.5l8.5 17h-17z"/><circle cx="12.5" cy="15.25" r="1.5" fill="currentColor" stroke="none"/></svg>';
const ICON_SUCCESS='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
  +'<path d="M4.5 13.5l5 5 11-11"/></svg>';

export {
  ICON_CLEAR_TEXT,
  ICON_EYE_OPEN, ICON_EYE_SHUT, ICON_ROLE_ALWAYS, _svg, ICON_EDIT, ICON_TRASH, _STAR, _NOTE,
  ICON_ALL, catIconInner, CAT_ICONS, CAT_ICONS_CATALOG, CAT_COLORS_CATALOG, setCatalogCatLooks,
  CAT_LABELS_PL, setCatalogCatLabelsPl, E_HUE_CYCLE, E_HUE_NAMES, CAT_ICON_MUSIC, CAT_ICON_KEYS,
  CAT_ICON_HINTS, ICON_STAR_ON, ICON_STAR_OFF, ICON_INTENT_LINK, ICON_PLUS, fillProseIcons,
  ICON_CHEVRON_R, ICON_X, ICON_LOCK, ICON_LOCK_OPEN, ICON_TAB_X, ICON_TAB_ADD,
  ICON_AWAITING, ICON_LINT_ERROR, ICON_LINT_WARNING, ICON_SUCCESS,
};
