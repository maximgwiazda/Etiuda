import { cardLang, parts } from "./card-model.js";
import { paxVocOn } from "./card-fields.js";
import { intentArr, SW_EN, SW_TOPIC, CONTENT_LANGS } from "./content-model.js";
import { dayPart, noActionText, greeting, GREET_WORDS } from "./greeting.js";
import { zForm, plVocative } from "./polish.js";
import { uiLang, t } from "./ui-lang.js";
import { isIntentFavourite, pack } from "./pack.js";
import { foldDiacritics, splitWords } from "./words.js";
import { primaryCatLabel } from "./cat-relevance.js";
import { intentIdAt, intentIsCustom, intentIsOverridden, intentOrder, isIntentHiddenIdx } from "./intent-id.js";

// Resolve {INTENT} for a card: a chip selection is an index (the clause follows the
// language toggle), free text is verbatim in both. "A", "A and B", "A, B and C". The last
// clause takes its own preposition, so Polish re-runs z/ze on it; English gets a plain
// "and" - "about A and with B" is not a sentence any English speaker writes.
function joinIntents(list,lg){
  const L=lg||lang;
  if(list.length<2) return list[0]||"";
  const tail=list[list.length-1], head=list.slice(0,-1);
  return L==="pl"
    ? head.join(", ")+" oraz "+zForm(tail)+" "+tail
    : head.join(", ")+" and "+tail;
}

/* ---- WHICH LANGUAGE AN INTENT IS SHOWN IN: THE NAME follows the INTERFACE - the
   rail, the dropdown and the box are places you navigate, and an identity should not
   re-label itself because you switched the REPLY's language (two surfaces already read
   English; the rail was the odd one out). THE SUBSTITUTION follows the CARD, and must:
   the Polish clause is written in the instrumental so {Z} can agree - an English clause
   in a Polish sentence is ungrammatical as well as wrong. The box says WHICH intent; the
   card shows the sentence, with the agreement already made. */
/* A CLAUSE THE CATALOG DOES NOT CARRY IN THIS LANGUAGE FALLS BACK TO THE PRIMARY, the same
   ruling a card body follows - see cardLang. The second language is additive, so an intent
   written once still speaks rather than substituting an empty string into the sentence. */
/* One reader for all three fields, carrying that ruling. */
function intentFieldAt(i,field,l){
  const own=intentArr(field,l), v=own?own[i]:null;
  if(v!=null && v!=="") return v;
  const base=intentArr(field,CONTENT_LANGS[0]);
  return (base && base[i]) || "";
}
/* ANY LANGUAGE BEATS NONE, for the surfaces that need a NAME rather than content: a topic in
   the other language reads better down a column than falling through to the clause. The only
   reader that looks past the primary. */
function intentFieldAny(i,field,l){
  const own=intentFieldAt(i,field,l);
  if(own) return own;
  for(let k=0;k<CONTENT_LANGS.length;k++){
    const v=intentFieldAt(i,field,CONTENT_LANGS[k]);
    if(v) return v;
  }
  return "";
}
function intentClause(i,l){ return intentFieldAt(i,"clause",l); }
function intentClauseUi(i){ return intentClause(i,uiLang()); }
/** The topic array for a language, falling back to English where a Polish topic is absent.
 *  The fallback is what makes the Polish half additive: a catalog without one behaves exactly
 *  as it did, rather than showing a gap where a topic used to be. */
function topicAt(i,l){ return intentFieldAt(i,"topic",l); }
/* THE NAVIGATION SURFACES NAME AN INTENT BY ITS {TOPIC}: a noun phrase ("flight change")
   scans in a list where the clause ("changing your flight") does not - the rail and the
   dropdown are read at a glance, down a column, against a reply clock. The topic in the
   interface language wins, then the other language's, then the clause - so a catalog that
   declares no topics is unchanged. The clause stays searchable and exact-matchable (see
   intentRows), and the INTENT box keeps showing it: the list says WHICH intent, the box
   says what a card will substitute. */
function intentNavName(i){
  return String(intentFieldAny(i,"topic",uiLang())||"").trim() || intentClauseUi(i) || "";
}
function intentFor(lg){
  const L=lg||lang;
  if(intentIdxs.length){
    return joinIntents(intentIdxs.map(i=>intentClause(i,L)).filter(Boolean), L);
  }
  return intentText.trim();
}
/* TOPIC in a given language, with the same typed-intent preference; the conjunction follows
   that language too - see joinTopics. Separate from commentPartCmt because the value comes
   from a pair of arrays rather than one. */
function commentPartTopic(l){
  if(!intentIdxs.length) return intentText.trim();
  const list=intentIdxs.map(i=>topicAt(i,l)).filter(Boolean);
  return list.length ? joinTopics(list,l) : "";
}
// The comment action implied by whatever intents are selected. Several intents give
// several actions in one comment, which is how they are written anyway.
/* Internal comments are a CATALOG feature, not an engine one: {ACTION} and {TOPIC} do
   nothing unless some card contains them, and on a catalog without comment cards the two
   editor fields would ask for values nothing can consume - unanswerable for someone who
   has never seen the feature. They appear only once something uses them. */
function commentTokensInUse(){
  return (cards||[]).some(m=>m && /\{ACTION\}|\{TOPIC\}/.test(String(m.en||"")+String(m.pl||"")));
}
/* Prefer a HAND-TYPED intent over the generic fallback - otherwise the typed
   subject silently became the generic word: a sentence that reads perfectly and says
   something else, the one wrong the fill markers cannot flag. {ACTION} does NOT pass it:
   typed text names a SUBJECT, not something done - "advised about wallet top-up" reads;
   "wallet top-up" as the action taken does not. */
/* The CARD's language decides the conjunction, exactly as joinIntents decides it: a topic list
   stands inside the card's own sentence, so a Polish body joins with "oraz" even where the
   catalog declares no topicPl and the strings fall back to English.
   NO zForm here, unlike joinIntents - a topic takes no preposition of its own, and where the
   body puts one in front of the list it is fixed text governing the whole of it. */
function joinTopics(list,l){
  if(list.length<2) return list[0]||"";
  const head=list.slice(0,-1).join(", "), tail=list[list.length-1];
  return l==="pl" ? head+" oraz "+tail : head+" and "+tail;
}
function cmtAt(i,l){ return intentFieldAt(i,"cmt",l); }
/* {ACTION} in the CARD's language, the shape commentPartTopic already uses. A comma list
   reads as a log, which is right here - "refund requested, name changed" is a record of
   what was done, where {TOPIC} reaches a customer and takes a conjunction. */
function commentPartCmt(l,fallback){
  if(!intentIdxs.length) return fallback;
  const list=intentIdxs.map(i=>cmtAt(i,l)).filter(Boolean);
  return list.length ? list.join(", ") : fallback;
}
// z/ze is decided by the FIRST clause only - it governs what follows it
function intentFirst(lg){
  const L=lg||lang;
  if(intentIdxs.length){ return intentClause(intentIdxs[0],L)||""; }
  return intentText.trim();
}



// Proper-case a passenger name so ALL CAPS / all-lowercase inputs still read as "John".
// Hyphenated parts are handled separately (MARY-JANE → Mary-Jane).
function formatPaxName(raw){
  return String(raw||"").trim().replace(/\s+/g," ").split(" ").filter(Boolean).map(w=>
    w.split("-").map(p=>{
      if(!p) return p;
      return p.charAt(0).toUpperCase()+p.slice(1).toLowerCase();
    }).join("-")
  ).join(" ");
}
/* Two control characters fence the filled {INTENT} so the renderer can find it again
   AFTER escaping - escape first, mark second is what stops a clause containing < or &
   from opening a tag. Control characters because esc() leaves them alone and no macro
   text contains them; both are stripped from input first, so a stray one cannot open a
   span that never closes. */
/* Two sentinel pairs. A/B fences a value that RESOLVED; M_A/M_B marks a token that resolved
   to nothing and needs a human. Both are stripped before a re-fill, so re-rendering a card
   never nests one marker inside another. */
const FILL_A="\u0001", FILL_B="\u0002", FILL_M_A="\u0003", FILL_M_B="\u0004",
      FILL_STRIP=/[\u0001\u0002\u0003\u0004]/g;
function fill(s,m,mark,inL){
  if(!s) return s;
  /* Every token below resolves in the language of the TEXT it is being put into: this card's,
     which is the toggle's unless the card pinned itself to one - or the other one, when the
     other-language copy asks for it and hands the language in. */
  const L=(CONTENT_LANGS.indexOf(inL)>-1)?inL:cardLang(m);
  if(mark) s=s.replace(FILL_STRIP,"");
  /* Every substitution passes a FUNCTION, not a bare string: String.replace treats $&
     and friends in a string replacement as patterns, so a typed name containing "$&"
     would re-insert the token instead of the text. A function's return is verbatim. */
  /* One helper rather than nine call sites. Every token that RESOLVES is fenced when
     mark is on, so the agent sees at a glance which words the app wrote. Branches that
     DELETE a token (no name, no role) insert nothing and mark nothing; empty values stay
     unfenced - a mark with nothing under it. */
  /* Second argument is the TOKEN'S OWN NAME, shown when the value is empty - the net is
     universal, so a token that resolves to nothing for a reason nobody predicted still
     says which token it was, instead of a gap between two commas. Empty with no mark
     (the clipboard) is still the empty string. */
  const MISS=mark?(name=>FILL_M_A+name+FILL_M_B):(()=>"");
  const M=mark
    ? ((v,name)=>{ const t=String(v==null?"":v);
                   return t?FILL_A+t.replace(FILL_STRIP,"")+FILL_B:MISS(name||"?"); })
    : (v=>String(v==null?"":v));
  s=s.replace(/\{GREET\}/g, ()=>M(greeting(L),t("GREET")));
  /* {DAYPART:day|evening} - or three parts for morning|afternoon|evening. The engine
     supplies the DECISION and the catalog every word: phrasing belongs to the desk, and
     Polish needs case agreement with the preceding verb, so both fragments are written in
     full in the language they live in. Per-language part counts fall out free (en and pl
     are separate fields). Counts: 1 is literal, 2 day/evening, 3 the full split; extras
     are ignored - slightly wrong beats a raw token reaching a customer. */
  s=s.replace(/\{DAYPART:([^}]*)\}/g, (_,body)=>{
    const parts=String(body).split("|");
    const p=dayPart();
    let pick;
    if(parts.length>=3) pick=parts[p];
    else if(parts.length===2) pick=parts[p===2?1:0];
    else pick=parts[0];
    return M(pick==null?"":pick,t("DAYPART"));
  });
  /* Two separate decisions. WHICH name: a surname reads wrong on a card that addresses the
     passenger, right on one that identifies them on the booking. WHAT FORM: only the FIRST
     word declines - Polish does not put a surname in the vocative.
     THE CARD'S LANGUAGE DECIDES, NOT THE DESK'S: a pinned card renders in its own language,
     and reading the toggle here declined a name inside English text and left it undeclined
     in Polish - each wrong in whichever direction the desk happened to sit. */
  let n=formatPaxName(pax.value);
  if(n && m){
    if(m.firstOnly) n=n.split(" ")[0];
    if(L==="pl" && paxVocOn(m)){
      const sp=n.indexOf(" ");
      n = sp<0 ? plVocative(n) : plVocative(n.slice(0,sp))+n.slice(sp);
    }
  }
  if(n) s=s.replace(/\{PAX\}/g, ()=>M(n,t("PAX")));
  /* No name: drop the token AND the separator that introduced it - "Good morning," not
     "Good morning ,", and no stranded comma at a sentence end. The macro stays
     paste-ready instead of needing a manual cleanup of orphaned punctuation. */
  else s=s.replace(/,?[ \t]*\{PAX\}/g, mark?" "+MISS(t("PAX")):"");
  const a=agentParts(agentEl.value);
  if(a.display){
    // display already ends in a full stop ("John S.") - don't make "John S.." at "{AGENT}."
    // The sentence's full stop is punctuation, not part of the name, so it stays OUTSIDE the fence.
    s=s.replace(/\{AGENT\}\./g, ()=>M(a.display.replace(/\.+$/,""),t("AGENT"))+".");
    s=s.replace(/\{AGENT\}/g, ()=>M(a.display,t("AGENT")));
  } else {
    s=s.replace(/\{AGENT\}/g, mark?MISS(t("AGENT")):"");
  }
  s=s.replace(/\{INIT\}/g, ()=>M(a.init,t("INIT")));
  const w=roleSel.value.trim();
  /* Empty ROLE strips the token and any following space, so "{ROLE} chatted" reads
     "chatted". */
  if(w) s=s.replace(/\{ROLE\}/g, ()=>M(w,t("ROLE")));
  else s=s.replace(/\{ROLE\}\s*/g, mark?MISS(t("ROLE"))+" ":"");
  s=s.replace(/\{ACTION\}/g, ()=>M(commentPartCmt(L,noActionText(L)),t("ACTION")));
  /* NO generic fallback for {TOPIC}: it reaches customer-facing English, where a vague
     stand-in reads finished and says something nobody chose. Empty behaves like {INTENT}:
     named hole on screen, nothing to the clipboard. {ACTION} keeps its fallback - "no
     action taken" is a true statement about the chat, not a placeholder. */
  s=s.replace(/\{TOPIC\}/g,  ()=>M(commentPartTopic(L),t("TOPIC")));
  const it=intentFor(L);
  if(it){
    /* {Z} is NOT marked, on purpose: it resolves to one letter of grammatical agreement,
       always immediately before {INTENT} - marking it separately would put a short rule
       and a gap in front of the real one. "z" reads as an ordinary preposition; the
       clause after it carries the mark. */
    s=s.replace(/\{Z\}/g, ()=>zForm(intentFirst(L)));
    s=s.replace(/\{INTENT\}/g, ()=>M(it,t("INTENT")));
  } else {
    /* Plain "z", not "z(e)": with no intent the preposition cannot resolve, and the honest
       placeholder cost more than it saved - three characters to delete versus one to add,
       and plain "z" is already correct for the majority of clauses. Optimise for the edit
       that actually happens. */
    s=s.replace(/\{Z\}/g, "z");
    /* Empty for the clipboard, exactly as before - a macro copied with no intent picked is
       unchanged by this. On screen the hole is named instead, with the label the box itself
       carries, so the agent reads "INTENCJA" rather than a gap between two commas. */
    s=s.replace(/\{INTENT\}/g, mark?MISS(t("INTENT")):"");
  }
  return s;
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
// intentOrder = SW_* indices in display order (drag-reorderable, persisted).
// Built in rebuildIntents() so custom / hidden intents stay in sync.
/* Favourites first, as a DISPLAY band over intentOrder - never baked into the stored
   order. Applied here so every consumer agrees: the dropdown, intentPickHtml and the
   card strip all read this. Stable within each band, so the
   dragged order survives. Manage applies the SAME rule but builds its own list - this
   helper drops rows with no label in the current language, and Manage is where you would
   go to FIX such an intent. */
/* includeHidden is opt-in, so every existing caller keeps excluding hidden intents - which is
   what the search surfaces (the dropdown, the card {INTENT} strip, the picker) must do. Only
   the panel and Manage pass true, because those are where you see and undo a hide. */
function intentRows(includeHidden){
  /* t = what the surface SHOWS (the topic - see intentNavName); clause = the intent's own
     wording in the interface language, alt = it in the other one. All three are searched
     so a query that finds an intent by any of them keeps finding it. */
  const kwByIntent = intentKeywords();
  /* "The other language" said once. Raw, like the statistics: the alt column shows what the
     catalog actually carries, and a fallback there would print the same words twice. */
  const other=CONTENT_LANGS.filter(l=>l!==uiLang())[0]||CONTENT_LANGS[0];
  const altArr=intentArr("clause",other)||SW_EN;
  const altTopic=intentArr("topic",other)||SW_TOPIC;
  const removed=new Set(pack.intentRemoved||[]);
  const rows=intentOrder
    .filter(i=>!removed.has(intentIdAt(i)))
    .filter(i=>includeHidden || !isIntentHiddenIdx(i))
    .map(i=>({
      t:intentNavName(i),
      clause:intentClauseUi(i)||"",
      alt:altArr[i]||"",
      also:String(altTopic[i]||"").trim(),
      tag:primaryCatLabel(i)||"",
      kw:kwByIntent[i]||null,
      idx:i,
      id:intentIdAt(i),
      picked:intentIdxs.indexOf(i)>-1,
      custom:intentIsCustom(i),
      edited:intentIsOverridden(i),
      hidden:isIntentHiddenIdx(i),
      fav:isIntentFavourite(intentIdAt(i))
    })).filter(r=>r.t);
  // hidden sinks below everything; favourites rise, as before
  return rows
    .map((r,i)=>({r, i}))
    .sort((a,b)=>((a.r.hidden?1:0)-(b.r.hidden?1:0))
              || ((a.r.fav?0:1)-(b.r.fav?0:1))
              || (a.i-b.i))
    .map(o=>o.r);
}

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

export {
  intentFieldAt, intentKeywords, dropIntentKeywords,
  topicAt,
  intentNavName,
  intentFor,
  commentTokensInUse,
  fill,
  expandSearchPlaceholders,
  intentRows,
  FILL_A,
  FILL_B,
  FILL_M_A,
  FILL_M_B
};
