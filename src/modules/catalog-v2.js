/* The catalog file's shape, and the only place that knows it differs from the runtime's. A file
   declares format 2: tags of two breeds, text keyed by language code, a body divided by marker
   lines. The runtime still holds parallel category maps, index-aligned intent arrays, alt and
   seq. This module is the join, and it shrinks as the runtime moves across.
   NOTHING HERE READS FORMAT 1: such a file is brought over once, by tools/catalog-v2. */

const V2_FORMAT=2, V2_KIND="etiuda-catalog";
/* Where a language lives on each side: the file keys by code, the runtime keys by field name.
   Every line below is a rename of the same value, so a new language is a new column here and
   nowhere else until the runtime keys by code too. */
const CARD_KEY={ title:{en:"t",pl:"tPl"}, body:{en:"en",pl:"pl"}, note:{en:"note",pl:"notePl"} };
const REQ_KEY={ clause:{en:"en",pl:"pl"}, action:{en:"cmt",pl:"cmtPl"}, topic:{en:"topic",pl:"topicPl"} };
const CARD_FLAGS=["firstOnly","allIntents","intentTop"];
const DEFAULT_LANGS=[{code:"en",label:"EN"},{code:"pl",label:"PL"}];

function v2Str(v){ return String(v==null?"":v); }
function v2Codes(c){
  const l=(c&&Array.isArray(c.langs)&&c.langs.length)?c.langs:DEFAULT_LANGS;
  return l.map(x=>v2Str(x&&x.code)).filter(Boolean);
}
/* A marker line opens a block and the next one closes it, so the way back is to drop the
   markers and rejoin on blank lines - which is what hands the blank line back to the card as a
   paragraph break inside a block. */
function v2Unmark(text){
  const out=[]; let cur=[], started=false;
  v2Str(text).split("\n").forEach(line=>{
    if(/^\s*\[(step|alt)(:[^\]]*)?\]\s*$/.test(line)){
      if(started) out.push(cur.join("\n").trim());
      cur=[]; started=true; return;
    }
    cur.push(line);
  });
  if(started) out.push(cur.join("\n").trim());
  return out.filter(Boolean).join("\n\n");
}
function v2Mark(text,marker){
  const blocks=v2Str(text).split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean);
  return blocks.length ? blocks.map(b=>marker+"\n"+b).join("\n\n") : "";
}
/** True for a payload this engine will read. Both halves, because format 2 is the only format
 *  here and a file that says neither is not a catalog at all. */
function isV2(data){
  return !!data && typeof data==="object" && +data.format===V2_FORMAT && data.kind===V2_KIND;
}
/* djb2 over the canonical form, and tools/catalog-v2/format.mjs holds the same two functions
   under the same names: a hash the converter stamps has to be a hash this can check. `hash` and
   `sig` come off first, or a file could never carry its own hash. */
function v2Canonical(v){
  if(v===null||typeof v!=="object") return JSON.stringify(v);
  if(Array.isArray(v)) return "["+v.map(v2Canonical).join(",")+"]";
  const keys=Object.keys(v).filter(k=>v[k]!==undefined).sort();
  return "{"+keys.map(k=>JSON.stringify(k)+":"+v2Canonical(v[k])).join(",")+"}";
}
function v2ContentHash(cat){
  const copy={};
  Object.keys(cat).forEach(k=>{ if(k!=="hash"&&k!=="sig") copy[k]=cat[k]; });
  let h=5381; const s=v2Canonical(copy);
  for(let i=0;i<s.length;i++) h=(((h<<5)+h)^s.charCodeAt(i))>>>0;
  return "djb2:"+h.toString(16);
}
const V2_ID_RE=/^[a-z0-9][a-z0-9-]{2,63}$/;
const V2_SHAPES={plain:1,steps:1,alts:1};
/* TRAP, and the only site: `\x5d` rather than `\]`. The harness slices a declaration out of
   this file by counting brackets, and an escaped closing bracket inside a class takes that
   count below zero, so the slice never terminates. */
const V2_MARKER_RE=/^\[(step|alt)(:[^\x5d]*)?\]$/;
/* A WHOLE LINE in brackets is an attempted marker, not prose: the format says a marker is an
   entire line and that a customer-facing line reading exactly `[step]` does not occur, so a
   bracketed line that is not one reads as a typo rather than as text. */
function v2IsBracketLine(s){ return s.length>1 && s.charAt(0)==="[" && s.charAt(s.length-1)==="]"; }
/* Markers are dividers, so a block count is a marker count and the shape is read off the first
   one. The primary language is the yardstick; a language the card does not carry is not
   compared, because an absent translation falls back to the primary rather than being wrong. */
function v2BodyProblems(c,id,primary,out){
  const shape=v2Str(c&&c.bodyShape);
  if(!V2_SHAPES[shape]){
    out.push("card "+id+": bodyShape "+(shape?("\""+shape+"\" is not plain, steps or alts"):"absent"));
    return;
  }
  const body=(c&&c.body)||{};
  const marksOf=code=>v2Str(body[code]).split("\n").map(s=>s.trim()).filter(s=>v2IsBracketLine(s));
  let base=null;
  Object.keys(body).forEach(code=>{
    const where="card "+id+" ("+code+"): ";
    const marks=marksOf(code);
    marks.forEach(s=>{
      const m=V2_MARKER_RE.exec(s);
      if(!m) out.push(where+s+" is a line in brackets that is not a marker");
      else if(m[1]==="step"&&m[2]) out.push(where+s+" labels a step, and only an alternative takes a label");
    });
    const first=v2Str(body[code]).split("\n").map(s=>s.trim()).filter(s=>s.length)[0]||"";
    const opens=V2_MARKER_RE.exec(first);
    if(shape==="plain"){
      if(marks.length) out.push(where+"bodyShape is plain and the body carries "+marks.length+" marker(s)");
    }else if(!opens){
      out.push(where+"bodyShape is "+shape+" and the body does not open with a marker");
    }else if((shape==="steps")!==(opens[1]==="step")){
      out.push(where+"bodyShape is "+shape+" and the body opens with "+first);
    }
    if(code===primary) base=marks.length;
  });
  if(base==null) return;
  Object.keys(body).forEach(code=>{
    if(code===primary) return;
    const n=marksOf(code).length;
    if(n!==base) out.push("card "+id+" ("+code+"): "+n+" block(s) against "+base+" in "+primary);
  });
}
/** Section 2.5 of the specification, and the body rules of 2.6. Every problem rather than the
 *  first, because a maintainer fixing a file wants the whole list, and every message names the
 *  field and what it belongs to. */
function v2Problems(data){
  if(!isV2(data)) return ["not an Etiuda catalog (format 2)"];
  if(!Array.isArray(data.cards)) return ["cards: absent, or not a list"];
  const out=[];
  if(!V2_ID_RE.test(v2Str(data.id)))
    out.push("id: "+(data.id==null?"absent":"malformed")+", wanted 3 to 64 of a-z, 0-9 and the hyphen");
  if(!(Number.isFinite(+data.rev)&&+data.rev>=0))
    out.push("rev: "+(data.rev==null?"absent":"not a number")+", wanted the edition counter");
  const primary=v2Codes(data)[0]||"en";
  const kind={}, tagSeen={};
  (Array.isArray(data.tags)?data.tags:[]).forEach((t,i)=>{
    const id=v2Str(t&&t.id);
    if(!id){ out.push("tags["+i+"].id: absent"); return; }
    if(tagSeen[id]) out.push("tag "+id+": the id is claimed twice");
    tagSeen[id]=1; kind[id]=v2Str(t&&t.kind);
    if(kind[id]==="request" && !v2Str((t.clause||{})[primary]))
      out.push("tag "+id+": no clause in "+primary+", the primary language");
  });
  const cardSeen={};
  data.cards.forEach((c,i)=>{
    const own=v2Str(c&&c.id);
    const id=own||("["+i+"]");
    if(!own) out.push("cards["+i+"].id: absent");
    else if(cardSeen[own]) out.push("card "+own+": the id is claimed twice");
    cardSeen[own]=1;
    const shelf=v2Str(c&&c.shelf);
    if(!shelf) out.push("card "+id+": shelf absent");
    else if(!tagSeen[shelf]) out.push("card "+id+": shelf "+shelf+" names no tag");
    else if(kind[shelf]!=="shelf") out.push("card "+id+": shelf "+shelf+" is a "+(kind[shelf]||"tag of no kind"));
    (Array.isArray(c&&c.requests)?c.requests:[]).forEach(r=>{
      const rid=v2Str(r);
      if(!tagSeen[rid]) out.push("card "+id+": requests names "+rid+", which is no tag");
      else if(kind[rid]!=="request") out.push("card "+id+": requests names "+rid+", a "+(kind[rid]||"tag of no kind"));
    });
    if(!v2Str(((c&&c.title)||{})[primary])) out.push("card "+id+": no title in "+primary+", the primary language");
    if(!v2Str(((c&&c.body)||{})[primary])) out.push("card "+id+": no body in "+primary+", the primary language");
    v2BodyProblems(c,id,primary,out);
  });
  if(data.hash!=null && v2ContentHash(data)!==v2Str(data.hash))
    out.push("hash: "+v2Str(data.hash)+" is not the hash of what the file holds");
  return out;
}
/** A format 2 payload as the runtime holds it. Throws on a shape no reader could use; a field
 *  the runtime has no home for yet is carried untouched so that an export gives it back. */
function catalogFromV2(data){
  if(!isV2(data)) throw new Error("not an Etiuda catalog (format 2)");
  if(!Array.isArray(data.cards)) throw new Error("no cards in file");
  /* NEVER A PARTIAL LOAD. A card whose shelf names nothing would map to a category that does not
     exist and land nowhere, which reads as content lost rather than a file refused. */
  const bad=v2Problems(data);
  if(bad.length) throw new Error(bad[0]+(bad.length>1?" (and "+(bad.length-1)+" more)":""));
  const codes=v2Codes(data);
  const tags=Array.isArray(data.tags)?data.tags:[];
  const shelves=tags.filter(t=>t&&t.kind==="shelf");
  const requests=tags.filter(t=>t&&t.kind==="request");
  const categories={}, categoriesPl={}, icons={}, colors={}, always=[];
  shelves.forEach(t=>{
    /* The key the runtime uses IS the tag id. Stripping the prefix back to the old short key
       would put two different things under one name the day a catalog declares `t-op` and `op`. */
    const key=v2Str(t.id);
    if(!key) return;
    categories[key]=v2Str((t.label||{}).en)||key;
    const pl=v2Str((t.label||{}).pl); if(pl) categoriesPl[key]=pl;
    const ic=v2Str(t.icon); if(ic) icons[key]=ic;
    const hue=parseInt(t.hue,10); if(Number.isFinite(hue)) colors[key]=hue;
    if(t.supporting) always.push(key);
  });
  const intents={}; const idxOf={};
  requests.forEach((t,i)=>{ idxOf[v2Str(t.id)]=i; });
  Object.keys(REQ_KEY).forEach(f=>{
    codes.forEach(code=>{
      const key=REQ_KEY[f][code];
      if(!key) return;
      const col=requests.map(t=>v2Str((t[f]||{})[code]));
      if(col.some(v=>v)) intents[key]=col;
    });
  });
  const cards=data.cards.map(c=>{
    const m={ id:v2Str(c.id), c:v2Str(c.shelf) };
    Object.keys(CARD_KEY).forEach(f=>{
      codes.forEach(code=>{
        const key=CARD_KEY[f][code];
        const v=v2Str((c[f]||{})[code]);
        if(!key||!v) return;
        m[key]=(f==="body"&&c.bodyShape&&c.bodyShape!=="plain") ? v2Unmark(v) : v;
      });
    });
    if(c.k) m.k=v2Str(c.k);
    if(c.bodyShape==="steps"){ m.alt=1; m.seq=1; }
    else if(c.bodyShape==="alts"){ m.alt=1; }
    CARD_FLAGS.forEach(f=>{ if(c[f]) m[f]=1; });
    if(c.paxVoc!=null) m.paxVoc=(+c.paxVoc)?1:0;
    if(c.lockLang) m.lockLang=v2Str(c.lockLang);
    const links=(Array.isArray(c.requests)?c.requests:[]).map(id=>idxOf[v2Str(id)]).filter(i=>i!=null);
    if(links.length) m.intents=links;
    return m;
  });
  const out={ format:1, kind:"playbook-catalog", name:v2Str(data.name)||"Etiuda catalog",
              categories, icons, colors, intents, cards };
  if(always.length) out.roles={ always };
  if(Object.keys(categoriesPl).length) out.categoriesPl=categoriesPl;
  /* Carried rather than used: the runtime has no home for these yet and an export must give
     back the file it was handed. `id` is the namespace key and `rev` is how two editions are
     compared, so losing either is worse than not reading it. */
  if(data.id!=null) out.id=v2Str(data.id);
  if(data.rev!=null) out.rev=+data.rev;
  if(data.date!=null) out.version=v2Str(data.date);
  if(Array.isArray(data.langs)&&data.langs.length) out.langs=data.langs;
  if(data.commentLang) out.commentLang=v2Str(data.commentLang);
  if(Array.isArray(data.role)&&data.role.length) out.who=data.role.map(v2Str);
  /* A STRING, even an empty one: quick facts emptied on purpose is not quick facts never
     written, and the reader downstream falls back to the built-in text on absence. */
  if(typeof data.facts==="string") out.facts=data.facts;
  if(data.sample) out.sample=1;
  return out;
}
/** The runtime's catalog as a format 2 payload, for export. A card and a shelf keep the id they
 *  arrived with; a request cannot, for the reason written at the line that makes one. */
function catalogToV2(c,opts){
  const o=opts||{};
  const codes=v2Codes(c);
  const cats=c.categories||{};
  const always=new Set(((c.roles||{}).always)||[]);
  const tags=Object.keys(cats).map(k=>{
    const label={};
    const en=v2Str(cats[k]); if(en) label.en=en;
    const pl=v2Str((c.categoriesPl||{})[k]); if(pl&&codes.indexOf("pl")>-1) label.pl=pl;
    const tag={ id:k, kind:"shelf", label };
    const ic=v2Str((c.icons||{})[k]); if(ic) tag.icon=ic;
    const hue=parseInt((c.colors||{})[k],10); if(Number.isFinite(hue)) tag.hue=hue;
    if(always.has(k)) tag.supporting=true;
    return tag;
  });
  const iv=c.intents||{};
  const n=(iv.en||[]).length;
  const reqIds=[];
  for(let i=0;i<n;i++){
    const row={};
    Object.keys(REQ_KEY).forEach(f=>{
      const map={};
      codes.forEach(code=>{
        const key=REQ_KEY[f][code];
        const v=key&&Array.isArray(iv[key]) ? v2Str(iv[key][i]).trim() : "";
        if(v) map[code]=v;
      });
      if(Object.keys(map).length) row[f]=map;
    });
    /* TRAP: a request id does not survive an export. The runtime holds intents as parallel
       arrays with no room for an id, so the ids a file arrived with are gone by the time a
       card links one by position. Positional ids are written instead, which keeps every link
       true and renames the tags. The home for them is the step that re-keys the personal
       layers by stable id. */
    const id="t-r"+i;
    reqIds.push(id);
    tags.push(Object.assign({ id, kind:"request" }, row));
  }
  const cards=(c.cards||[]).map((m,i)=>{
    const card={ id:v2Str(m.id)||("c-"+i), shelf:v2Str(m.c) };
    const links=(Array.isArray(m.intents)?m.intents:[])
      .map(x=>(typeof x==="number")?x:(/^\d+$/.test(v2Str(x))?+v2Str(x):-1))
      .filter(x=>x>=0&&x<reqIds.length).map(x=>reqIds[x]);
    if(links.length) card.requests=links;
    const shaped=m.alt?(m.seq?"steps":"alts"):"plain";
    Object.keys(CARD_KEY).forEach(f=>{
      const map={};
      codes.forEach(code=>{
        const key=CARD_KEY[f][code];
        const v=key?v2Str(m[key]).trim():"";
        if(!v) return;
        map[code]=(f==="body"&&shaped!=="plain") ? v2Mark(v, shaped==="steps"?"[step]":"[alt]") : v;
      });
      if(Object.keys(map).length) card[f]=map;
    });
    card.bodyShape=shaped;
    const k=v2Str(m.k).trim(); if(k) card.k=k;
    CARD_FLAGS.forEach(f=>{ if(m[f]) card[f]=true; });
    if(m.paxVoc!=null) card.paxVoc=(+m.paxVoc)?1:0;
    if(m.lockLang) card.lockLang=v2Str(m.lockLang);
    return card;
  });
  const out={ format:V2_FORMAT, kind:V2_KIND,
              id:v2Str(o.id||c.id)||"etiuda-catalog",
              name:v2Str(o.name||c.name)||"Etiuda catalog",
              rev:(o.rev!=null)?+o.rev:((c.rev!=null)?+c.rev:1),
              langs:(Array.isArray(c.langs)&&c.langs.length)?c.langs:DEFAULT_LANGS,
              commentLang:v2Str(c.commentLang)||"en",
              tags, cards };
  if(v2Str(c.version)) out.date=v2Str(c.version);
  if(Array.isArray(c.who)&&c.who.length) out.role=c.who.map(v2Str);
  if(typeof c.facts==="string") out.facts=c.facts;
  if(c.sample) out.sample=true;
  return out;
}

export { isV2, catalogFromV2, catalogToV2, v2Mark, v2Unmark, v2Problems, v2ContentHash, V2_FORMAT, V2_KIND };
