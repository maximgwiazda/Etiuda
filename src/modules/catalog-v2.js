/* The catalog file's shape, and the only place that knows it differs from the runtime's. A file
   declares format 2: tags of two breeds, text keyed by language code, a body divided by marker
   lines. The runtime still holds parallel category maps, index-aligned intent arrays, alt and
   seq. This module is the join, and it shrinks as the runtime moves across.
   NOTHING HERE READS FORMAT 1: such a file is brought over once, by tools/catalog-v2. */

const V2_FORMAT=2, V2_KIND="etiuda-catalog";
/* Where a language lives on each side: the file keys by code, the runtime keys by field name.
   The two tables below are the founding pair's legacy spelling; ANY OTHER CODE GETS A DERIVED
   COLUMN, the RUNTIME field name, a colon, the code. That rule is langColumn in
   content-model.js and is written out again here because this module imports nothing: it is
   sliced into bare node by the harness, and a leg holds the two spellings against each other. */
const CARD_KEY={ title:{en:"t",pl:"tPl"}, body:{en:"en",pl:"pl"}, note:{en:"note",pl:"notePl"} };
const REQ_KEY={ clause:{en:"en",pl:"pl"}, action:{en:"cmt",pl:"cmtPl"}, topic:{en:"topic",pl:"topicPl"} };
/* The two field names the file and the runtime spell differently; the other four are the same
   word on both sides, so only the exceptions are named. */
const V2_RUNTIME_FIELD={ title:"t", action:"cmt" };
/* THE TABLE IS READ BY THE CODE'S OWN ENTRY OR BY NONE AT ALL. A plain object answers "toString"
   and "constructor" with an inherited function, which a bare lookup would take for the legacy
   spelling and make the column name itself - one key for the title, the body and the note of that
   language, three fields in one. The shape rule above refuses such a code today; this is what
   keeps the derived namespace whole if it ever widens. Every other table keyed by a code reads
   the same way, here and in content-model.js. */
function v2ColKey(table,f,code){
  const map=table[f];
  if(!map) return "";
  const c=v2Str(code);
  if(!c) return "";
  return Object.prototype.hasOwnProperty.call(map,c) ? map[c] : ((V2_RUNTIME_FIELD[f]||f)+":"+c);
}
/* THE LABEL OF A SHELF IS A TRANSLATABLE FIELD LIKE ANY OTHER, and until this it was two flat
   maps: `categories` holding English and `categoriesPl` Polish. A catalog declaring neither
   named its shelves by their raw tag ids. `categories` IS THE PRIMARY'S MAP - that is what the
   runtime puts on a pill - and `categoriesPl` stays the legacy spelling for a non-primary pl,
   which is what keeps an en-then-pl catalog moving by zero bytes. */
const CAT_LABEL_KEY={ pl:"categoriesPl" };
function v2CatKey(code,primary){
  const c=v2Str(code);
  if(!c) return "";
  if(c===v2Str(primary)) return "categories";
  return Object.prototype.hasOwnProperty.call(CAT_LABEL_KEY,c) ? CAT_LABEL_KEY[c] : ("categories:"+c);
}
const CARD_FLAGS=["firstOnly","allIntents","intentTop"];
/* Every key this build names, on a card and in the header. ANY OTHER KEY IS CARRIED WHOLE, in the
   runtime's `ext`, so a field a newer build adds survives a round trip here. hash, sig and
   modified are named so they are never carried: an export re-makes them. So is name, which the
   format no longer has and no file of this build may give back. */
const V2_CARD_NAMED=["id","shelf","title","body","note","bodyShape","k","firstOnly","allIntents","intentTop",
  "paxVoc","paxOwn","lockLang","requests","retired","next","commits"];
const V2_HEAD_NAMED=["format","kind","id","rev","date","langs","commentLang","tags","cards","role","facts",
  "greet","stop","sample","modified","hash","sig","notes","grew","desk","name","variables"];
// One phrase per part of the day, and the clock has three. A language whose greeting covers
// two parts writes the same phrase twice, which is what the built-in Polish does.
const V2_GREET_PARTS=3;
const DEFAULT_LANGS=[{code:"en",label:"EN"},{code:"pl",label:"PL"}];

function v2Str(v){ return String(v==null?"":v); }
function v2Copy(v){ return JSON.parse(JSON.stringify(v)); }
/* defineProperty, never assignment: a key named __proto__ would set the prototype and vanish. */
function v2Put(into,k,v){
  Object.defineProperty(into,k,{ value:v2Copy(v), enumerable:true, writable:true, configurable:true });
}
/* The keys of `src` the build does not name, copied; null where there are none. */
function v2Extra(src,named){
  let out=null;
  Object.keys(src).forEach(k=>{
    if(named.indexOf(k)>-1 || src[k]===undefined) return;
    if(!out) out={};
    v2Put(out,k,src[k]);
  });
  return out;
}
/* Carried keys go back where they came from. A key the build names is never written from the bag, whether
   or not the runtime holds it: a hand-made ext could otherwise write what v2Problems refuses. */
function v2Restore(into,extra,named){
  if(!extra || typeof extra!=="object") return;
  Object.keys(extra).forEach(k=>{ if(named.indexOf(k)<0 && !Object.prototype.hasOwnProperty.call(into,k)) v2Put(into,k,extra[k]); });
}
function v2Codes(c){
  const l=(c&&Array.isArray(c.langs)&&c.langs.length)?c.langs:DEFAULT_LANGS;
  return l.map(x=>v2Str(x&&x.code)).filter(Boolean);
}
/* A marker line opens a block and the next one closes it, so the way back is to drop the
   divider and rejoin on blank lines. A labelled [alt] is the name the copy control shows, so
   that line stays as the first line of its block, joined to the text with no blank line between
   whatever was typed there; a bare marker is only a divider and drops. */
function v2Unmark(text){
  const out=[]; let cur=[], label="", started=false;
  const close=()=>{ const body=cur.join("\n").trim(); out.push(label?(body?label+"\n"+body:label):body); };
  v2Str(text).split("\n").forEach(line=>{
    // Trimmed and matched against the one shape above, never a second copy of it.
    const mark=V2_MARKER_RE.exec(line.trim());
    if(mark){
      if(started) close();
      cur=[]; started=true;
      label=(mark[1]==="alt" && mark[2]) ? line.trim() : "";
      return;
    }
    cur.push(line);
  });
  if(started) close();
  return out.filter(Boolean).join("\n\n");
}
function v2Mark(text,marker){
  const blocks=v2Str(text).split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean);
  return blocks.length ? blocks.map(b=>{
    const first=(b.split("\n")[0]||"").trim();
    if(V2_MARKER_RE.test(first)) return b;
    return marker+"\n"+b;
  }).join("\n\n") : "";
}
/* The label lives on the leftover marker line v2Unmark keeps. Copyable text must not. */
function v2AltLabel(block){
  const first=(v2Str(block).split("\n")[0]||"").trim();
  const mark=V2_MARKER_RE.exec(first);
  if(!mark || mark[1]!=="alt" || !mark[2]) return "";
  return mark[2].slice(1).trim();
}
function v2PartText(block){
  const s=v2Str(block);
  const nl=s.indexOf("\n");
  const first=(nl<0?s:s.slice(0,nl)).trim();
  const mark=V2_MARKER_RE.exec(first);
  if(mark && mark[1]==="alt" && mark[2]) return (nl<0?"":s.slice(nl+1)).trim();
  return s;
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
/* Bytes Ed25519 signs: the content hash's input (hash off), sig.value off, alg and keyId on.
   v2Canonical sorts keys, so a JSON round-trip does not move the signature. */
const V2_SIG_NONE="none", V2_SIG_VALID="valid", V2_SIG_INVALID="invalid", V2_SIG_UNKNOWN="unknown";
const V2_SIG_ALG="Ed25519";
const V2_HARNESS_TEST_KEYID="etiuda-harness-test";
const V2_HARNESS_TEST_PUB="0a601fa8d33caee771a9d0b114dcd2d6ad77ca2982e1b9339391b144c1642184";
/* THE RING: which public key this desk accepts FOR WHICH CATALOG. A file the customer places in
   the catalog folder beside the catalogs, named below, holding a LIST of entries, each one
   catalog id and one public key. A list because a rotation is two entries for one catalog while
   the old editions are still in use, and an object cannot hold a repeated key honestly. NO
   WILDCARD AND NO DEFAULT ENTRY: a key listed for one catalog says nothing about another, and a
   bag that trusts one key for everything is the shape this cannot express. */
const V2_RING_FORMAT=1, V2_RING_KIND="etiuda-ring", V2_RING_FILE="etiuda-ring.json";
/* The built-in ring, one entry: the harness key, for the harness's own id and for nothing else.
   The catalog id and the key id are deliberately the same string, there being one of each. A
   desk with no ring file trusts this alone, so a real catalog signed by a real key reads unknown
   until the customer places the file. */
const V2_KNOWN_KEYS={ [V2_HARNESS_TEST_KEYID]:{ [V2_HARNESS_TEST_KEYID]:V2_HARNESS_TEST_PUB } };
function v2SigFold(cat){
  const copy={};
  Object.keys(cat||{}).forEach(k=>{
    if(k==="hash") return;
    if(k==="sig"){
      const s=cat.sig;
      if(s && typeof s==="object"){
        const folded={};
        if(s.alg!==undefined) folded.alg=s.alg;
        if(s.keyId!==undefined) folded.keyId=s.keyId;
        copy.sig=folded;
      }
      return;
    }
    copy[k]=cat[k];
  });
  return copy;
}
function v2SignedBytes(cat){
  return new TextEncoder().encode(v2Canonical(v2SigFold(cat)));
}
function v2HexBytes(s){
  const t=String(s==null?"":s);
  if(!/^[0-9a-fA-F]*$/.test(t) || t.length%2) return null;
  const n=t.length/2, out=new Uint8Array(n);
  for(let i=0;i<n;i++) out[i]=parseInt(t.slice(i*2,i*2+2),16);
  return out;
}
function v2SigState(cat, ring){
  const bound=ring||V2_KNOWN_KEYS;
  const sig=cat&&cat.sig;
  if(!sig || typeof sig!=="object" || sig.value==null || String(sig.value)==="")
    return Promise.resolve(V2_SIG_NONE);
  /* THE BINDING, and why a caller still holding a flat {keyId:public} map is safe: it finds
     nothing under the catalog's id and reads unknown, never valid. The id is inside the signed
     bytes, so a document renamed to an id the ring does list for that key stops verifying, and
     the binding cannot be walked around by editing the file. */
  const forCat=bound[String(cat&&cat.id==null?"":cat.id)];
  const incomingId=String(sig.keyId==null?"":sig.keyId);
  const pubHex=(forCat&&typeof forCat==="object")?forCat[incomingId]:null;
  if(!pubHex||typeof pubHex!=="string") return Promise.resolve(V2_SIG_UNKNOWN);
  const pub=v2HexBytes(pubHex);
  const val=v2HexBytes(sig.value);
  if(!pub || pub.length!==32 || !val || val.length!==64)
    return Promise.resolve(V2_SIG_INVALID);
  const data=v2SignedBytes(cat);
  const subtle=globalThis.crypto&&globalThis.crypto.subtle;
  if(!subtle) return Promise.resolve(V2_SIG_INVALID);
  return subtle.importKey("raw", pub, {name:"Ed25519"}, false, ["verify"])
    .then(key=>subtle.verify({name:"Ed25519"}, key, val, data))
    .then(ok=>ok?V2_SIG_VALID:V2_SIG_INVALID)
    .catch(()=>V2_SIG_INVALID);
}
/* The ring file as this build uses it, {catalog:{keyId:public}}, with one line per entry it
   could not use. ABSENT IS NOT A FAULT and neither is malformed: a ring only ever ADDS trust, so
   failing to read one opens nothing, and that desk's catalogs still open and still read none
   unsigned and unknown signed. A refusal here would be a desk one bad file could shut.
   A field this build does not know is left alone, so `note` is where an administrator records
   why a superseded key is still listed. */
function v2RingRead(src){
  const ring={}, problems=[];
  Object.keys(V2_KNOWN_KEYS).forEach(c=>{ ring[c]=Object.assign({},V2_KNOWN_KEYS[c]); });
  const out={ring:ring, problems:problems};
  if(src==null||src==="") return out;
  let doc=src;
  if(typeof src==="string"){
    try{ doc=JSON.parse(src); }
    catch(e){ problems.push("ring: the file is not JSON, "+e.message); return out; }
  }
  if(!doc||typeof doc!=="object"||Array.isArray(doc)){
    problems.push("ring: wanted an object, the file holds "+(Array.isArray(doc)?"a list":typeof doc));
    return out;
  }
  if(+doc.format!==V2_RING_FORMAT||doc.kind!==V2_RING_KIND){
    problems.push("ring: wanted format "+V2_RING_FORMAT+" and kind "+JSON.stringify(V2_RING_KIND)
      +", the file says "+JSON.stringify(doc.format==null?null:doc.format)+" and "
      +JSON.stringify(doc.kind==null?null:doc.kind));
    return out;
  }
  if(!Array.isArray(doc.keys)){
    problems.push("ring: keys is "+(doc.keys==null?"absent":"not a list")+", wanted the entries");
    return out;
  }
  doc.keys.forEach((e,i)=>{
    const where="ring entry "+(i+1)+": ";
    if(!e||typeof e!=="object"||Array.isArray(e)){ problems.push(where+"not an entry"); return; }
    const catId=v2Str(e.catalog), keyId=v2Str(e.keyId), pub=v2Str(e.public);
    if(!V2_ID_RE.test(catId)){
      problems.push(where+"catalog "+(e.catalog==null?"absent":"malformed")+", wanted the id a catalog declares");
      return;
    }
    if(!V2_ID_RE.test(keyId)){
      problems.push(where+"keyId "+(e.keyId==null?"absent":"malformed")+", wanted the id the signature carries");
      return;
    }
    /* An entry naming another algorithm is dropped rather than read as this one: 32 bytes are 32
       bytes whatever produced them, and a key meant for something else is not an Ed25519 key. */
    if(v2Str(e.alg)!==V2_SIG_ALG){
      problems.push(where+"alg "+JSON.stringify(e.alg==null?null:v2Str(e.alg))+", this build verifies "+V2_SIG_ALG);
      return;
    }
    if(!/^[0-9a-f]{64}$/.test(pub)){
      problems.push(where+"public "+(e.public==null?"absent":"malformed")+", wanted 64 lower-case hex characters");
      return;
    }
    if(!ring[catId]) ring[catId]={};
    /* One key id, one key. Two entries disagreeing about what a key id holds is the one case
       where choosing either is a guess, so the first stands and the second is said out loud. */
    if(ring[catId][keyId]&&ring[catId][keyId]!==pub){
      problems.push(where+"a second public key under key id "+keyId+" for catalog "+catId+", the first stands");
      return;
    }
    ring[catId][keyId]=pub;
  });
  return out;
}
/* THE TEAM FILE, one per shared folder beside the catalogs: written and signed by the lead's Studio, naming the catalogs it
   covers, the lead's key, whether the team's catalogs are sealed, the team key's epoch, and the roster of desks the lead has
   met, an admitted desk's carrying its wrap of the team key. `team` is null where the file is absent or unusable, with a line
   saying why; an unusable roster entry, wrap or recovery copy is dropped and said, and the rest stands. Fields this build
   does not name are kept. */
const V2_TEAM_FORMAT=1, V2_TEAM_KIND="etiuda-team", V2_TEAM_FILE="etiuda-team.json", V2_TEAM_ID_RE=/^t-[0-9a-f]{16}$/;
function v2TeamRead(src){
  const problems=[], out={team:null, problems:problems};
  if(src==null||src==="") return out;
  let doc=src;
  if(typeof src==="string"){
    try{ doc=JSON.parse(src); }
    catch(e){ problems.push("team: the file is not JSON, "+e.message); return out; }
  }
  if(!doc||typeof doc!=="object"||Array.isArray(doc)){ problems.push("team: wanted an object"); return out; }
  if(+doc.format!==V2_TEAM_FORMAT||doc.kind!==V2_TEAM_KIND){
    problems.push("team: wanted format "+V2_TEAM_FORMAT+" and kind "+JSON.stringify(V2_TEAM_KIND));
    return out;
  }
  const hex64=/^[0-9a-f]{64}$/, lead=doc.lead, bad=[];
  if(!V2_TEAM_ID_RE.test(v2Str(doc.id))) bad.push("id: wanted t- and 16 lower-case hex characters");
  if(!lead||typeof lead!=="object"||Array.isArray(lead)||!V2_ID_RE.test(v2Str(lead.keyId))||!hex64.test(v2Str(lead.public)))
    bad.push("lead: wanted a keyId and a public key of 64 lower-case hex characters");
  ["sealed","exportsSealed"].forEach(f=>{ if(typeof doc[f]!=="boolean") bad.push(f+": wanted true or false"); });
  if(!Number.isInteger(doc.epoch)||doc.epoch<1) bad.push("epoch: wanted a whole number from 1");
  if(!Array.isArray(doc.catalogs)) bad.push("catalogs: wanted the list of catalog ids");
  if(!Array.isArray(doc.roster)) bad.push("roster: wanted the list of desks");
  if(bad.length){ bad.forEach(b=>problems.push("team "+b)); return out; }
  const team=Object.assign({},doc,{catalogs:[],roster:[]}), seen={};
  doc.catalogs.forEach((c,i)=>{
    if(!V2_ID_RE.test(v2Str(c))) problems.push("team catalogs["+i+"]: wanted a catalog id");
    else if(team.catalogs.indexOf(c)<0) team.catalogs.push(c);
  });
  doc.roster.forEach((e,i)=>{
    const where="team roster["+i+"]: ", d=e&&typeof e==="object"&&!Array.isArray(e)?e.desk:null;
    if(!d||typeof d!=="object"||Array.isArray(d)||!/^k-[0-9a-f]{16}$/.test(v2Str(d.id))||!hex64.test(v2Str(d.key))||!hex64.test(v2Str(d.box))){
      problems.push(where+"wanted a desk with its id, key and box"); return;
    }
    if((d.name!==undefined&&typeof d.name!=="string")||(e.name!==undefined&&typeof e.name!=="string")){ problems.push(where+"a name that is not text"); return; }
    if(seen[d.id]){ problems.push(where+"desk "+d.id+" a second time, the first stands"); return; }
    seen[d.id]=1;
    /* A wrap is the team key sealed to this desk's box for the team's own epoch (shell/main.js wrapTeamKey). */
    if(e.wrap!==undefined&&!(e.wrap&&typeof e.wrap==="object"&&e.wrap.epoch===doc.epoch&&hex64.test(v2Str(e.wrap.enc))
      &&/^[0-9a-f]{96}$/.test(v2Str(e.wrap.ct)))){
      problems.push(where+"a wrap that is not the team key for epoch "+doc.epoch+", the desk stands without it");
      e=Object.assign({},e); delete e.wrap;
    }
    team.roster.push(e);
  });
  /* The lead's own copy of the team key under a passphrase, which only Studio opens (sign.mjs's scrypt and AES-GCM). */
  const rc=doc.recovery;
  if(rc!==undefined&&!(rc&&typeof rc==="object"&&rc.epoch===doc.epoch&&rc.kdf==="scrypt"&&rc.cipher==="aes-256-gcm"
    &&[rc.N,rc.r,rc.p].every(x=>Number.isInteger(x)&&x>0)&&/^[0-9a-f]{32}$/.test(v2Str(rc.salt))
    &&/^[0-9a-f]{24}$/.test(v2Str(rc.iv))&&/^[0-9a-f]{96}$/.test(v2Str(rc.ct)))){
    problems.push("team recovery: wanted the team key for epoch "+doc.epoch+" under a passphrase, the team stands without it");
    delete team.recovery;
  }
  out.team=team;
  return out;
}
/* The team file's signature against the lead key it names, so it says the file is whole, not that the key is the lead's:
   that trust comes from the ring or from the desk's admission. */
function v2TeamSigState(team){
  const lead=(team&&team.lead)||{};
  return v2SigState(team, {[v2Str(team&&team.id)]:{[v2Str(lead.keyId)]:v2Str(lead.public)}});
}
/* THE SEALED ENVELOPE, a signed catalog under the team key, which only a shell opens: this reads its shape. `sealed` is
   null where the file is absent or unusable, with a line for each field that is wrong. */
const V2_SEALED_KIND="etiuda-sealed";
function v2SealedRead(src){
  const problems=[], out={sealed:null, problems:problems};
  if(src==null||src==="") return out;
  let doc=src;
  if(typeof src==="string"){
    try{ doc=JSON.parse(src); }
    catch(e){ problems.push("sealed: the file is not JSON, "+e.message); return out; }
  }
  if(!doc||typeof doc!=="object"||Array.isArray(doc)){ problems.push("sealed: wanted an object"); return out; }
  if(+doc.format!==V2_FORMAT||doc.kind!==V2_SEALED_KIND){
    problems.push("sealed: wanted format "+V2_FORMAT+" and kind "+JSON.stringify(V2_SEALED_KIND));
    return out;
  }
  const bad=[], ct=v2Str(doc.ct);
  if(!V2_TEAM_ID_RE.test(v2Str(doc.team))) bad.push("team: wanted t- and 16 lower-case hex characters");
  if(!Number.isInteger(doc.epoch)||doc.epoch<1) bad.push("epoch: wanted a whole number from 1");
  if(!/^[0-9a-f]{24}$/.test(v2Str(doc.nonce))) bad.push("nonce: wanted 24 lower-case hex characters");
  if(!/^[0-9a-f]*$/.test(ct)||ct.length%2||ct.length<32) bad.push("ct: wanted lower-case hex of at least the 16-byte tag");
  if(bad.length){ bad.forEach(b=>problems.push("sealed "+b)); return out; }
  out.sealed=Object.assign({},doc);
  return out;
}
const V2_ID_RE=/^[a-z0-9][a-z0-9-]{2,63}$/;
const V2_SHAPES={plain:1,steps:1,alts:1};
/* THE ONE MARKER SHAPE, and both readers use it: what a marker line looks like is written
   here and nowhere else. TRAP: `\x5d` rather than `\]`. The harness slices a declaration out of
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
/* WHAT A DECLARED CODE MAY BE, stated as a shape rather than as a list of what it may not: the
   code is a key and half of a derived column name, so it is a subtag of letters followed by any
   hyphened subtags of letters and digits, lower case throughout. One casing is what makes strict
   equality the right equality - case carries no meaning in a language tag, so two codes differing
   only in it name one language - and the alphabet is what keeps every column flat and typeable. */
const V2_LANG_RE=/^[a-z]{2,8}(?:-[a-z0-9]{1,8}){0,8}$/;
/* The languages, and the two tables a catalog may bring for them. Having no GRAMMAR for a code is
   not a problem with the catalog and is not reported here; v2GrammarNotices says it, and it is a
   notice rather than a refusal. */
function v2LangProblems(data,codes,out){
  if(!Array.isArray(data.langs)||!data.langs.length){
    out.push("langs: absent, wanted the languages this catalog speaks, the first of them primary");
  }else{
    codes.forEach((code,i)=>{
      if(codes.indexOf(code)!==i) out.push("langs: "+code+" is declared twice");
      else if(!V2_LANG_RE.test(code)) out.push("langs: "+JSON.stringify(code)
        +" is not usable as a language code, wanted a-z, then any hyphened parts of a-z and 0-9,"
        +" as \"en\" or \"pt-br\"");
    });
    if(data.langs.length!==codes.length) out.push("langs: an entry with no code");
  }
  const spoken=c=>codes.indexOf(c)>-1;
  if(data.greet!=null){
    if(typeof data.greet!=="object") out.push("greet: not a table of phrases by language");
    else Object.keys(data.greet).forEach(code=>{
      if(!spoken(code)){ out.push("greet."+code+": a language this catalog does not declare"); return; }
      const a=data.greet[code];
      if(!Array.isArray(a)||a.length!==V2_GREET_PARTS||a.some(x=>!v2Str(x).trim()))
        out.push("greet."+code+": wanted "+V2_GREET_PARTS+" phrases, morning, afternoon and evening");
    });
  }
  if(data.stop!=null){
    if(typeof data.stop!=="object") out.push("stop: not a table of words by language");
    else Object.keys(data.stop).forEach(code=>{
      if(!spoken(code)) out.push("stop."+code+": a language this catalog does not declare");
      else if(!Array.isArray(data.stop[code])) out.push("stop."+code+": not a list of words");
    });
  }
}
/* WHICH LANGUAGES THIS BUILD HAS WORDS AND RULES OF ITS OWN FOR, as against the open set a
   catalog may declare. Spec 2.7: the storage is open, the grammar is closed, and the two must
   not be confused. A language absent from this list is CARRIED - its text is used exactly as
   written - and the engine supplies it no inflection and no words. */
const V2_GRAMMAR_LANGS=["en","pl"];
/** One notice per declared language this build has no grammar for. Not a problem with the
 *  catalog: the file is sound, and this says plainly what the engine will not do with it. */
function v2GrammarNotices(data){
  return v2Codes(data).filter(c=>V2_GRAMMAR_LANGS.indexOf(c)<0)
    .map(c=>"langs: this build has no grammar for "+c+", so its text is used as written - no"
      +" vocative, no declension, and a joined list reads with the English \"and\"");
}
const V2_SHA_RE=/^sha256:[0-9a-f]{64}$/, V2_HEX64_RE=/^[0-9a-f]{64}$/, V2_BRANCH_RE=/^k-[0-9a-f]{16}$/;
function v2Missing(v){ return v==null?"absent":"malformed"; }
/* A flag is true or it is not there: false and null are problems rather than a second spelling of absent. */
function v2FlagProblem(c,f,id,out){
  if(c&&c[f]!==undefined&&c[f]!==true) out.push("card "+id+": "+f+" is "+JSON.stringify(c[f])+", wanted true or absent");
}
/* `next` names cards of this file, so it is read once every id is known. */
function v2NextProblems(c,id,ids,out){
  const next=c&&c.next;
  if(next===undefined) return;
  if(!Array.isArray(next)){ out.push("card "+id+": next is not a list"); return; }
  const seen=new Set();
  next.forEach((e,i)=>{
    const where="card "+id+": next["+i+"] ";
    const to=(e&&typeof e==="object"&&!Array.isArray(e)&&typeof e.to==="string") ? e.to : "";
    if(!to){ out.push(where+"is not an entry with a to"); return; }
    if(to===id) out.push(where+"names the card itself");
    else if(!Object.prototype.hasOwnProperty.call(ids,to)) out.push(where+"names "+to+", which is no card");
    else if(seen.has(to)) out.push(where+"names "+to+" a second time");
    seen.add(to);
  });
}
/* The envelope fields the branch work adds. Shapes only: that a desk id matches its key, or that a
   pin matches an archived edition, is for the reader that has the key or the archive. */
function v2HeaderProblems(data,codes,out){
  if(data.notes!==undefined){
    if(!data.notes||typeof data.notes!=="object"||Array.isArray(data.notes)) out.push("notes: not a table of text by language");
    else Object.keys(data.notes).forEach(code=>{
      if(codes.indexOf(code)<0) out.push("notes."+code+": a language this catalog does not declare");
      else if(typeof data.notes[code]!=="string") out.push("notes."+code+": not text");
    });
  }
  const entry=(f,v)=>{
    if(v===undefined) return null;
    if(!v||typeof v!=="object"||Array.isArray(v)){ out.push(f+": not an entry"); return null; }
    return v;
  };
  const g=entry("grew",data.grew);
  if(g){
    if(!V2_ID_RE.test(v2Str(g.id))) out.push("grew.id: "+v2Missing(g.id)+", wanted the id of the catalog it grew from");
    if(typeof g.rev!=="number"||!Number.isFinite(g.rev)||g.rev<0) out.push("grew.rev: "+v2Missing(g.rev)+", wanted the edition number it grew from");
    if(!V2_SHA_RE.test(v2Str(g.sha))) out.push("grew.sha: "+v2Missing(g.sha)+", wanted sha256: and 64 lower-case hex characters");
  }
  const d=entry("desk",data.desk);
  if(d){
    if(!V2_BRANCH_RE.test(v2Str(d.id))) out.push("desk.id: "+v2Missing(d.id)+", wanted k- and 16 lower-case hex characters");
    if(d.name!==undefined&&typeof d.name!=="string") out.push("desk.name: not text");
    ["key","box"].forEach(f=>{
      if(!V2_HEX64_RE.test(v2Str(d[f]))) out.push("desk."+f+": "+v2Missing(d[f])+", wanted 64 lower-case hex characters");
    });
  }
}
/* THE TEAM'S VARIABLES, by shape: the vocabulary of facts and comparisons is variables.js's, and a
   condition this build does not know never holds there, so a newer Studio's rule is not a refusal.
   Written out here because this module imports nothing; a leg holds the two name lists together. */
function v2VarProblems(v,codes,out){
  const V2_VAR_NAME_RE=/^[A-Z][A-Z0-9]*$/, V2_VAR_FIXED=["Z","GENDER","DAYPART","INIT","ACTION"];
  const V2_VAR_PARTS=["morning","afternoon","evening"];
  if(v===undefined) return;
  if(!v||typeof v!=="object"||Array.isArray(v)){ out.push("variables: not an entry"); return; }
  const clock=s=>{ const m=/^(\d{2}):(\d{2})$/.exec(v2Str(s)); return m&&+m[1]<24&&+m[2]<60 ? (+m[1])*60+(+m[2]) : NaN; };
  if(v.hours!==undefined){
    const h=v.hours, at=h&&typeof h==="object"&&!Array.isArray(h) ? V2_VAR_PARTS.map(k=>clock(h[k])) : [];
    if(at.length!==3||at.some(n=>!Number.isFinite(n))) out.push("variables.hours: wanted morning, afternoon and evening as HH:MM");
    else if(!(at[0]<at[1]&&at[1]<at[2])) out.push("variables.hours: wanted morning before afternoon before evening");
  }
  if(v.list===undefined) return;
  if(!Array.isArray(v.list)){ out.push("variables.list: not a list"); return; }
  const seen={};
  v.list.forEach((d,i)=>{
    const name=v2Str(d&&d.name), where="variables "+(name||("["+i+"]"))+": ";
    if(!d||typeof d!=="object"||Array.isArray(d)){ out.push("variables["+i+"]: not an entry"); return; }
    if(!V2_VAR_NAME_RE.test(name)){ out.push(where+"wanted a name of capital letters and digits, starting with a letter"); return; }
    if(seen[name]){ out.push(where+"the name is claimed twice"); return; }
    seen[name]=1;
    if(V2_VAR_FIXED.indexOf(name)>-1){ out.push(where+"Etiuda's own, and not set by rules"); return; }
    if(d.about!==undefined&&typeof d.about!=="string") out.push(where+"about is not text");
    const rules=d.rules;
    if(!Array.isArray(rules)||!rules.length){ out.push(where+"wanted a list of rules"); return; }
    rules.forEach((r,j)=>{
      const at=where+"rule "+(j+1)+" ";
      if(!r||typeof r!=="object"||Array.isArray(r)){ out.push(at+"is not an entry"); return; }
      if(!Array.isArray(r.when)) out.push(at+"has no list of conditions");
      else r.when.forEach((c,k)=>{
        if(!c||typeof c!=="object"||typeof c.fact!=="string"||typeof c.op!=="string")
          out.push(at+"condition "+(k+1)+" wanted a fact and a comparison");
      });
      if(r.join!==undefined&&r.join!=="and"&&r.join!=="or") out.push(at+"joins its conditions by "+JSON.stringify(r.join)+", wanted and or or");
      if(r.name!==undefined&&typeof r.name!=="string") out.push(at+"has a name that is not text");
      const w=r.write;
      if(!w||typeof w!=="object"||Array.isArray(w)) out.push(at+"wanted its words by language");
      else Object.keys(w).forEach(code=>{
        if(codes.indexOf(code)<0) out.push(at+"writes "+code+", a language this catalog does not declare");
        else if(typeof w[code]!=="string") out.push(at+"writes "+code+" as something other than text");
      });
    });
    const last=rules[rules.length-1];
    if(last&&Array.isArray(last.when)&&last.when.length) out.push(where+"the last rule has conditions, and the last is Otherwise");
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
  const codes=v2Codes(data);
  const primary=codes[0]||"en";
  v2LangProblems(data,codes,out);
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
    v2FlagProblem(c,"retired",id,out);
    v2FlagProblem(c,"commits",id,out);
    if(c&&c.paxOwn!==undefined&&c.paxOwn!==0&&c.paxOwn!==1) out.push("card "+id+": paxOwn is "+JSON.stringify(c.paxOwn)+", wanted 0, 1 or absent");
  });
  data.cards.forEach((c,i)=>v2NextProblems(c,v2Str(c&&c.id)||("["+i+"]"),cardSeen,out));
  v2HeaderProblems(data,codes,out);
  v2VarProblems(data.variables,codes,out);
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
  const catLabels={}, icons={}, colors={}, always=[];
  /* The PRIMARY's map is filled for every shelf, falling back to the tag id, because the
     runtime's `categories` is what names a shelf on screen and an empty one is a blank pill.
     Every other declared language fills only what the file carries. */
  codes.forEach(code=>{ catLabels[v2CatKey(code,codes[0])]={}; });
  shelves.forEach(t=>{
    /* The key the runtime uses IS the tag id. Stripping the prefix back to the old short key
       would put two different things under one name the day a catalog declares `t-op` and `op`. */
    const key=v2Str(t.id);
    if(!key) return;
    codes.forEach((code,ci)=>{
      const v=v2Str((t.label||{})[code]);
      if(v||!ci) catLabels[v2CatKey(code,codes[0])][key]=v||key;
    });
    const ic=v2Str(t.icon); if(ic) icons[key]=ic;
    const hue=parseInt(t.hue,10); if(Number.isFinite(hue)) colors[key]=hue;
    if(t.supporting) always.push(key);
  });
  const intents={}; const idxOf={};
  requests.forEach((t,i)=>{ idxOf[v2Str(t.id)]=i; });
  /* The ids, index-aligned with the arrays below, so an export can give a request back the id
     it arrived with. The runtime links a request by position and has no room for one. */
  const intentIds=requests.map(t=>v2Str(t.id));
  Object.keys(REQ_KEY).forEach(f=>{
    codes.forEach(code=>{
      const key=v2ColKey(REQ_KEY,f,code);
      if(!key) return;
      const col=requests.map(t=>v2Str((t[f]||{})[code]));
      if(col.some(v=>v)) intents[key]=col;
    });
  });
  const cards=data.cards.map(c=>{
    const m={ id:v2Str(c.id), c:v2Str(c.shelf) };
    Object.keys(CARD_KEY).forEach(f=>{
      codes.forEach(code=>{
        const key=v2ColKey(CARD_KEY,f,code);
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
    if(c.paxOwn!=null) m.paxOwn=(+c.paxOwn)?1:0;
    if(c.lockLang) m.lockLang=v2Str(c.lockLang);
    const links=(Array.isArray(c.requests)?c.requests:[]).map(id=>idxOf[v2Str(id)]).filter(i=>i!=null);
    if(links.length) m.intents=links;
    if(c.retired) m.retired=1;
    if(c.commits) m.commits=1;
    // The entries whole, so a key a later build adds to one survives; a 2.0 reader acts on `to` alone.
    if(Array.isArray(c.next)&&c.next.length) m.next=v2Copy(c.next);
    const more=v2Extra(c,V2_CARD_NAMED); if(more) m.ext=more;
    return m;
  });
  const out={ format:1, kind:"playbook-catalog",
              categories:catLabels.categories||{}, icons, colors, intents, cards };
  if(intentIds.length) out.intentIds=intentIds;
  if(always.length) out.roles={ always };
  codes.slice(1).forEach(code=>{
    const k=v2CatKey(code,codes[0]);
    if(Object.keys(catLabels[k]||{}).length) out[k]=catLabels[k];
  });
  /* Carried rather than used: the runtime has no home for these yet and an export must give
     back the file it was handed. `id` is the namespace key and `rev` is how two editions are
     compared, so losing either is worse than not reading it. */
  if(data.id!=null) out.id=v2Str(data.id);
  if(data.rev!=null) out.rev=+data.rev;
  if(data.date!=null) out.version=v2Str(data.date);
  if(Array.isArray(data.langs)&&data.langs.length) out.langs=data.langs;
  /* Honoured rather than carried: the greeting phrases and the noise words go to the modules
     that own those tables, at eApplyCatalog. Validated above, so what arrives here is a table
     keyed by a language this catalog declares. */
  if(data.greet&&typeof data.greet==="object") out.greet=data.greet;
  if(data.stop&&typeof data.stop==="object") out.stop=data.stop;
  if(data.commentLang) out.commentLang=v2Str(data.commentLang);
  if(Array.isArray(data.role)&&data.role.length) out.who=data.role.map(v2Str);
  /* A STRING, even an empty one: quick facts emptied on purpose is not quick facts never
     written, and the reader downstream falls back to the built-in text on absence. */
  if(typeof data.facts==="string") out.facts=data.facts;
  if(data.sample) out.sample=1;
  // Validated above. Carried for the readers that act on them; nothing on this desk does yet.
  if(data.notes) out.notes=v2Copy(data.notes);
  if(data.grew) out.grew=v2Copy(data.grew);
  if(data.desk) out.desk=v2Copy(data.desk);
  if(data.variables) out.variables=v2Copy(data.variables);
  const more=v2Extra(data,V2_HEAD_NAMED); if(more) out.ext=more;
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
    codes.forEach((code,ci)=>{
      const v=v2Str(ci ? ((c[v2CatKey(code,codes[0])]||{})[k]) : cats[k]);
      if(v) label[code]=v;
    });
    const tag={ id:k, kind:"shelf", label };
    const ic=v2Str((c.icons||{})[k]); if(ic) tag.icon=ic;
    const hue=parseInt((c.colors||{})[k],10); if(Number.isFinite(hue)) tag.hue=hue;
    if(always.has(k)) tag.supporting=true;
    return tag;
  });
  const iv=c.intents||{};
  /* THE PRIMARY'S COLUMN, never English's. A catalog declaring neither en nor pl exported ZERO
     requests from here, silently, because the count came off a column nothing had filled. */
  const n=(iv[v2ColKey(REQ_KEY,"clause",codes[0]||"en")]||[]).length;
  const reqIds=[];
  const declared=Array.isArray(c.intentIds)?c.intentIds:[];
  const taken={}; tags.forEach(t=>{ taken[t.id]=1; });
  for(let i=0;i<n;i++){
    const row={};
    Object.keys(REQ_KEY).forEach(f=>{
      const map={};
      codes.forEach(code=>{
        const key=v2ColKey(REQ_KEY,f,code);
        const v=key&&Array.isArray(iv[key]) ? v2Str(iv[key][i]).trim() : "";
        if(v) map[code]=v;
      });
      if(Object.keys(map).length) row[f]=map;
    });
    /* The id the request arrived with, where the catalog still carries one. An intent added at
       this desk has none, so a positional id is minted and stepped along until it is free: two
       tags claiming one id is a load error, and a silent merge would be worse. */
    let id=v2Str(declared[i]).trim();
    if(!id||taken[id]) { let n2=i; id="t-r"+n2; while(taken[id]) id="t-r"+(++n2); }
    taken[id]=1;
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
        const key=v2ColKey(CARD_KEY,f,code);
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
    if(m.paxOwn!=null) card.paxOwn=(+m.paxOwn)?1:0;
    if(m.lockLang) card.lockLang=v2Str(m.lockLang);
    if(m.retired) card.retired=true;
    if(m.commits) card.commits=true;
    v2Restore(card,m.ext,V2_CARD_NAMED);
    return card;
  });
  /* A link is read back by this build's own v2Problems, so an export keeps only those that would
     pass: a card removed at this desk, a link to itself or a repeat leaves no entry behind. */
  const cardIds=new Set(cards.map(x=>x.id));
  cards.forEach((card,i)=>{
    const seen=new Set();
    const next=(Array.isArray(c.cards[i].next)?c.cards[i].next:[]).filter(e=>{
      const to=(e&&typeof e==="object"&&typeof e.to==="string")?e.to:"";
      if(!to||to===card.id||!cardIds.has(to)||seen.has(to)) return false;
      seen.add(to); return true;
    });
    if(next.length) card.next=v2Copy(next);
  });
  const out={ format:V2_FORMAT, kind:V2_KIND,
              id:v2Str(o.id||c.id)||"etiuda-catalog",
              rev:(o.rev!=null)?+o.rev:((c.rev!=null)?+c.rev:1),
              langs:(Array.isArray(c.langs)&&c.langs.length)?c.langs:DEFAULT_LANGS,
              commentLang:v2Str(c.commentLang)||codes[0]||"en",
              tags, cards };
  if(v2Str(c.version)) out.date=v2Str(c.version);
  if(Array.isArray(c.who)&&c.who.length) out.role=c.who.map(v2Str);
  if(typeof c.facts==="string") out.facts=c.facts;
  if(c.greet&&typeof c.greet==="object") out.greet=c.greet;
  if(c.stop&&typeof c.stop==="object") out.stop=c.stop;
  if(c.sample) out.sample=true;
  if(c.notes&&typeof c.notes==="object") out.notes=v2Copy(c.notes);
  if(c.grew&&typeof c.grew==="object") out.grew=v2Copy(c.grew);
  if(c.desk&&typeof c.desk==="object") out.desk=v2Copy(c.desk);
  if(c.variables&&typeof c.variables==="object") out.variables=v2Copy(c.variables);
  v2Restore(out,c.ext,V2_HEAD_NAMED);
  /* Section 5. This engine is never the origin of a catalog, so a file it hands back says so.
     Rev arrives already raised where an export chose a new edition - see currentCatalog - and is
     otherwise left exactly where it was. An id is what says there was an origin at all: a
     catalog built here from nothing is modified from nothing. */
  if(v2Str(c.id)) out.modified=true;
  /* Last, and over the finished payload. A signature cannot be carried forward by an engine
     that cannot re-make it, and nothing here writes one. */
  out.hash=v2ContentHash(out);
  return out;
}

export { isV2, catalogFromV2, catalogToV2, v2Mark, v2Unmark, v2AltLabel, v2PartText, v2Problems, v2GrammarNotices, v2CatKey, V2_GRAMMAR_LANGS, v2ContentHash, v2SignedBytes, v2SigState, v2RingRead, v2TeamRead, v2TeamSigState, v2SealedRead, V2_SEALED_KIND, V2_FORMAT, V2_KIND, V2_KNOWN_KEYS, V2_RING_FORMAT, V2_RING_KIND, V2_RING_FILE, V2_TEAM_FORMAT, V2_TEAM_KIND, V2_TEAM_FILE, V2_HARNESS_TEST_KEYID, V2_HARNESS_TEST_PUB, V2_SIG_NONE, V2_SIG_VALID, V2_SIG_INVALID, V2_SIG_UNKNOWN, V2_SIG_ALG };
