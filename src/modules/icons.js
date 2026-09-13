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
/* Optical centring for the dot. The BASELINE values are getBBox measurements from a
   real renderer, applied as a wrapping transform so the drawings stay untouched. Geometric
   centring is not the whole rule: a shape whose MASS argues with its extent (a bubble's
   tail, a check's long arm) is corrected BY EYE against a crosshaired grid at dot size -
   the figure, not the bounding box, sits in the circle.
   EXCEPT a figure that is itself a circle: undo's ring stays CONCENTRIC with the dot, its
   arrowhead read as decoration - an off-centre ring inside a circle reads as a mistake -
   so undo carries no entry. EVERY surface drawing an icon goes through catIconInner. */
const CAT_IC_NUDGE={"notehead":[0.6,-0.74],"beam":[-0.1,-0.05],"sharp":[0,1.1],"flat":[0.23,1],"fermata":[0,-0.45],"staff":[0,0.2],"bubble":[0,-0.45],"check":[-0.25,0.3],"child":[-0.1,-0.05],"split":[0.1,0],"plane":[-0.6,0],"external":[0.2,-0.2],"doc":[-0.3,0],"bag":[0,-0.3],"seat":[0,-0.1],"person":[0,-0.3],"access":[-0.34,0.84],"gift":[0,-0.45],"lock":[0,0.2],"heart":[0,-0.97],"pencil":[-0.21,0.26],"note":[-0.5,0.25],"star":[0,0.3],"paw":[0,-0.8],"car":[0,-0.85],"key":[-0.2,0]};
function catIconInner(k){
  const m=CAT_ICONS[k]||"", n=CAT_IC_NUDGE[k];
  return n?'<g transform="translate('+n[0]+' '+n[1]+')">'+m+'</g>':m;
}
const CAT_ICONS={
  notehead:'<ellipse cx="9.4" cy="13.6" rx="3.4" ry="2.6" transform="rotate(-22 9.4 13.6)"/><path d="M12.4 12.2V4.2"/>',
  beam:'<ellipse cx="6.2" cy="14.4" rx="2.5" ry="1.9"/><ellipse cx="14" cy="12.6" rx="2.5" ry="1.9"/><path d="M8.7 13.9V5.4l7.8-1.6v8.5M8.7 8.6l7.8-1.6"/>',
  sharp:'<path d="M7.6 4.2v10.2M12.4 3.4v10.2M5.8 7.8l8.4-1.6M5.8 11.6l8.4-1.6"/>',
  flat:'<path d="M7.8 3.4v11.2"/><path d="M7.8 9.2c2.8-2.2 5-.4 3.4 1.9-.9 1.3-2.2 2.2-3.4 2.9"/>',
  natural:'<path d="M7.4 3.8v10.4M12.6 5.8v10.4M7.4 7.6l5.2-1.2M7.4 11.4l5.2-1.2"/>',
  fermata:'<path d="M3.6 13.4a6.4 6.4 0 0 1 12.8 0"/><circle cx="10" cy="12.6" r="1.3"/>',
  staff:'<path d="M3.4 5.6h13.2M3.4 8.4h13.2M3.4 11.2h13.2M3.4 14h13.2"/>',
  fork:'<path d="M7.4 3.6v6.2a2.6 2.6 0 0 0 5.2 0V3.6M10 12.4v4"/>',
  bubble:'<path d="M4.5 5.5h11A1.5 1.5 0 0 1 17 7v5a1.5 1.5 0 0 1-1.5 1.5H9.5L6 16.5v-3H4.5A1.5 1.5 0 0 1 3 12V7a1.5 1.5 0 0 1 1.5-1.5z"/>',
  shield:'<path d="M10 3.2l6 2.1v4.5c0 3.5-2.4 5.9-6 7.1-3.6-1.2-6-3.6-6-7.1V5.3z"/>',
  pause:'<path d="M8 5.2v9.6M12 5.2v9.6"/>',
  clock:'<circle cx="10" cy="10" r="6.8"/><path d="M10 5.8v4.4l2.9 1.7"/>',
  check:'<path d="M4.4 10.4l3.6 3.6L15.6 6.4"/>',
  idcard:'<rect x="3" y="5" width="14" height="10" rx="2"/><circle cx="7.4" cy="9" r="1.6"/><path d="M11.4 8.6h3.4M11.4 11.6h3.4M4.9 13.2c.5-1.3 4.5-1.3 5 0"/>',
  /* The same two strokes the intent band wears (ICON_INTENT_LINK) - one drawing for one
     idea, so redrawing either means redrawing both. */
  link:'<path d="M8.3 10.8a4.2 4.2 0 0 0 6.3.5l2.5-2.5a4.2 4.2 0 0 0-5.9-5.9l-1.4 1.4"/><path d="M11.7 9.2a4.2 4.2 0 0 0-6.3-.5l-2.5 2.5a4.2 4.2 0 0 0 5.9 5.9l1.4-1.4"/>',
  split:'<path d="M3.4 10h4.4l3.4-4.4h5M11.2 14.4h5"/><path d="M13.8 3.4l2.6 2.2-2.6 2.2M13.8 12.2l2.6 2.2-2.6 2.2"/>',
  /* Nose RIGHT, not up: pointing up the silhouette is read as an arrow or a cursor, and the
     wings stop being wings. The path is stored already rotated so getBBox stays honest. */
  plane:'<path d="M17.7 10 14.3 11.15 9.9 16.8 8.3 16.8 10.3 10.95 6.8 10.95 4.8 13 3.6 13 4.5 10 3.6 7 4.8 7 6.8 9.05 10.3 9.05 8.3 3.2 9.9 3.2 14.3 8.85Z"/>',
  /* The arc runs the full three quarters and swings into the head's corner, so arrow and
     circle read as one stroke of motion. Drawn to survive 14px in a field as well as 13px
     in a dot. */
  undo:'<path d="M16.5 10a6.5 6.5 0 1 1-6.5-6.5c1.8 0 3.6.7 4.9 2l1.6 1.6"/><path d="M16.5 3.5v3.6h-3.6"/>',
  card:'<rect x="3" y="5.4" width="14" height="9.2" rx="1.8"/><path d="M3 9h14"/>',
  external:'<path d="M11.2 3.8h5v5M16.2 3.8l-6.4 6.4"/><path d="M13.6 11.4V15a1.6 1.6 0 0 1-1.6 1.6H5A1.6 1.6 0 0 1 3.4 15V8a1.6 1.6 0 0 1 1.6-1.6h3.6"/>',
  bolt:'<path d="M11.2 2.8l-5.4 8.4h3.6L8.8 17.2l5.4-8.4h-3.6z"/>',
  doc:'<path d="M5.6 3.4h5.6L15 7.2v9.4H5.6z"/><path d="M11 3.4v3.8h4M7.6 11h5.4M7.6 13.8h3.6"/>',
  bag:'<rect x="3.4" y="7" width="13.2" height="9.6" rx="1.7"/><path d="M7.4 7V5.3a1.3 1.3 0 0 1 1.3-1.3h2.6a1.3 1.3 0 0 1 1.3 1.3V7"/>',
  seat:'<rect x="5" y="8.2" width="10" height="5.8" rx="1.5"/><path d="M6.6 8.2V5.6A1.6 1.6 0 0 1 8.2 4h3.6a1.6 1.6 0 0 1 1.6 1.6v2.6M6.2 14v2.2M13.8 14v2.2"/>',
  person:'<circle cx="10" cy="7" r="3"/><path d="M4.6 16.6c0-3 2.4-5 5.4-5s5.4 2 5.4 5"/>',
  /* A child BESIDE an adult - the category is about the relationship, not the passenger.
     Two heights are a different SILHOUETTE from `person` at any size; a lone child is only
     a size argument, and size arguments do not survive 13px. */
  child:'<circle cx="13.4" cy="5.4" r="2.5"/><path d="M9.7 17.2c0-2.7 1.7-4.4 3.7-4.4s3.7 1.7 3.7 4.4"/><circle cx="6.2" cy="9.4" r="2.1"/><path d="M3.1 17.2c0-2.1 1.4-3.4 3.1-3.4s3.1 1.3 3.1 3.4"/>',
  calendar:'<rect x="3.4" y="5" width="13.2" height="11.6" rx="1.8"/><path d="M3.4 9h13.2M7 3.4v3M13 3.4v3"/>',
  pass:'<rect x="3.4" y="5.4" width="13.2" height="9.2" rx="1.6"/><path d="M12.4 5.4v9.2M5.8 10l1.8 1.8L10 8.8"/>',
  /* The wheelchair - the international symbol. The wheel is an open arc with its gap
     exactly where the rider sits, so figure and wheel read as one mark. */
  access:'<circle cx="11" cy="3.9" r="1.6"/><path d="M12.4 14.9a4.1 4.1 0 1 1-.9-6.6"/><path d="M11 5.9v4.3h3.2l1 3.6"/>',
  circles:'<circle cx="7.6" cy="10" r="4"/><circle cx="12.4" cy="10" r="4"/>',
  /* Two round loops with open middles - tight teardrop loops close into a moustache at dot
     size. */
  gift:'<rect x="3.6" y="8.4" width="12.8" height="8.2" rx="1.4"/><path d="M3.6 11.6h12.8M10 8.4v8.2"/><path d="M10 8.4C9.6 5.4 7.5 3.8 6.1 4.7 4.8 5.6 6 8.1 10 8.4ZM10 8.4C10.4 5.4 12.5 3.8 13.9 4.7 15.2 5.6 14 8.1 10 8.4Z"/>',
  lock:'<rect x="5.2" y="8.8" width="9.6" height="7.6" rx="1.7"/><path d="M6.8 8.8V6.4a3.2 3.2 0 0 1 6.4 0v2.4"/>',
  /* The bow is a wide ring on purpose: below r=3 its hole fills in at dot size, and a key
     whose bow reads solid is a spoon. Teeth on the far end, uneven, so the silhouette
     cannot be mistaken for the magnifier. */
  key:'<circle cx="6.5" cy="10" r="3.3"/><path d="M9.8 10h7.4M13.4 10v3M16.6 10v2.3"/>',
  car:'<path d="M15.8 14.2h1.7c.5 0 .8-.3.8-.8v-2.5c0-.7-.6-1.4-1.2-1.6C15.6 8.8 13.3 8.3 13.3 8.3s-1.1-1.2-1.8-1.9c-.4-.3-.9-.6-1.5-.6H4.2c-.5 0-.9.3-1.2.8l-1.2 2.4A3.1 3.1 0 0 0 1.7 10v3.3c0 .5.3.8.8.8h1.7"/><circle cx="5.8" cy="14.2" r="1.7"/><circle cx="14.2" cy="14.2" r="1.7"/><path d="M7.5 14.2h5"/>',
  heart:'<path d="M10 16.6S3.9 12.9 3.9 8.7A3.3 3.3 0 0 1 10 6.9a3.3 3.3 0 0 1 6.1 1.8c0 4.2-6.1 7.9-6.1 7.9z"/>',
  pencil:'<path d="M4 16l.9-3.4 8.7-8.7a1.7 1.7 0 0 1 2.4 2.4l-8.7 8.7z"/><path d="M12.4 5.2l2.4 2.4"/>',
  /* A panel with a pencil floating clear of its outline (crossed strokes render mush at
     dot size) - given to the CATEGORY so Comments stops wearing every edit button's bare
     pencil. A NEW KEY: a key named pencil that draws a panel would lie to whoever reads
     the list. The pencil drawing stays for packs that chose it. */
  note:'<path d="M16.2 11.4v3.2a1.8 1.8 0 0 1-1.8 1.8H5.4a1.8 1.8 0 0 1-1.8-1.8V7a1.8 1.8 0 0 1 1.8-1.8h5.2"/><path d="M15 3.7a1.45 1.45 0 0 1 2.05 2.05l-5.5 5.5-2.8.75.75-2.8z"/>',
  star:_STAR,
  /* Offered in the picker, deliberately NOT in the automatic pool - a fallback must be
     one family, and staves mixed with paw prints is the grab-bag the palette avoids.
     Whiskers and eyes are round-capped dots (a drawn eye is a smudge at 13px); the face is
     one closed outline - ears as separate strokes faded to fog. */
  cat:'<path d="M3.8 11C3.8 9.4 4.2 8 5 6.9L5.4 3.6 8 5.4C9.3 5 10.7 5 12 5.4L14.6 3.6 15 6.9C15.8 8 16.2 9.4 16.2 11 16.2 14.4 13.6 16.4 10 16.4 6.4 16.4 3.8 14.4 3.8 11Z"/><path d="M8.3 10.9h.01M11.7 10.9h.01"/>',
  paw:'<ellipse cx="6.3" cy="8.4" rx="1.5" ry="1.9"/><ellipse cx="10" cy="6.8" rx="1.5" ry="2"/><ellipse cx="13.7" cy="8.4" rx="1.5" ry="1.9"/><path d="M10 16.8c-2 0-3.7-1.2-3.7-2.9 0-1.9 1.8-2.7 3.7-4.1 1.9 1.4 3.7 2.2 3.7 4.1 0 1.7-1.7 2.9-3.7 2.9z"/>',
  /* One continuous outline, nose to forked tail; the eye a round-capped dot. Measures
     dead-centre - no nudge entry. */
  fish:'<path d="M2.6 10c1.8-2.9 4.4-4.3 7-4.3 2.2 0 4.2 1 5.6 3l2.2-2-1.4 3.3 1.4 3.3-2.2-2c-1.4 2-3.4 3-5.6 3-2.6 0-5.2-1.4-7-4.3Z"/><path d="M5.6 8.9h.01"/>'
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
  +'<path d="M8.3 10.8a4.2 4.2 0 0 0 6.3.5l2.5-2.5a4.2 4.2 0 0 0-5.9-5.9l-1.4 1.4"/>'
  +'<path d="M11.7 9.2a4.2 4.2 0 0 0-6.3-.5l-2.5 2.5a4.2 4.2 0 0 0 5.9 5.9l1.4-1.4"/></svg>';
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

export {
  ICON_EYE_OPEN, ICON_EYE_SHUT, ICON_ROLE_ALWAYS, _svg, ICON_EDIT, ICON_TRASH, _STAR, _NOTE,
  ICON_ALL, catIconInner, CAT_ICONS, CAT_ICONS_CATALOG, CAT_COLORS_CATALOG, setCatalogCatLooks,
  CAT_LABELS_PL, setCatalogCatLabelsPl, E_HUE_CYCLE, E_HUE_NAMES, CAT_ICON_MUSIC, CAT_ICON_KEYS,
  CAT_ICON_HINTS, ICON_STAR_ON, ICON_STAR_OFF, ICON_INTENT_LINK, ICON_PLUS, fillProseIcons,
  ICON_CHEVRON_R, ICON_X, ICON_LOCK, ICON_LOCK_OPEN, ICON_TAB_X, ICON_TAB_ADD,
};
