/* A FLAG IS ONE SIGNED FACT IN THE DESK'S OWN FILE: this card, in the language being read, as its
   words stood, looks wrong. The catalog's layer keeps it. The file is only the copy that travels,
   and it carries no moment and no order but card id then r. An outcome stays beside the layer,
   with the moment it was learned, and never enters the file. Where the file would not reach a
   lead, no flag is made. */
import { lyGet, lySet, lyDel } from "./storage.js";
import { findCard } from "./card-model.js";
import { lang } from "./app-state.js";
import { cardFieldKey } from "./card-fields.js";
import { v2Canonical, v2Mark } from "./catalog-v2.js";
import { eHasBranch, eBranchReach } from "./host.js";
import { hooks } from "./hooks.js";

const FLAG_CAP=100;
const NOTE_CAP=500;
const LAYER_FLAGS="Flags";
const LAYER_ENDS="FlagEnds";
/* The same refusal the team's note uses: a control character is not a line the file can carry. */
const CONTROL=/[\u0000-\u001f\u007f]/;
/* SHA-256 of bytes, as hex. The same steps as sha256Hex in catalog-file.js: this module cannot
   import that one, because the desk file calls back into here. */
const SHA_K=[
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
function flagSha256(bytes){
  const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const n=bytes.length, total=((n+9+63)>>6)<<6, buf=new Uint8Array(total);
  buf.set(bytes); buf[n]=0x80;
  const dv=new DataView(buf.buffer), w=new Uint32Array(64);
  dv.setUint32(total-8,Math.floor(n/0x20000000)); dv.setUint32(total-4,(n<<3)>>>0);
  for(let o=0;o<total;o+=64){
    for(let i=0;i<16;i++) w[i]=dv.getUint32(o+i*4);
    for(let i=16;i<64;i++){
      const x=w[i-15], y=w[i-2];
      w[i]=w[i-16]+(((x>>>7)|(x<<25))^((x>>>18)|(x<<14))^(x>>>3))+w[i-7]+(((y>>>17)|(y<<15))^((y>>>19)|(y<<13))^(y>>>10));
    }
    let a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
    for(let i=0;i<64;i++){
      const t1=h+(((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7)))+((e&f)^(~e&g))+SHA_K[i]+w[i];
      const t2=(((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10)))+((a&b)^(a&c)^(b&c));
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    [a,b,c,d,e,f,g,h].forEach((v,i)=>{ H[i]=(H[i]+v)|0; });
  }
  return H.map(v=>(v>>>0).toString(16).padStart(8,"0")).join("");
}
function flagHex(bytes){
  let s="";
  for(let i=0;i<bytes.length;i++) s+=bytes[i].toString(16).padStart(2,"0");
  return s;
}
/* 16 bytes from the page's cryptographic random source, new for each flag. */
function flagRandomBytes(){
  const b=new Uint8Array(16);
  crypto.getRandomValues(b); /* plant:flag-random */
  return b;
}
function readList(name){
  try{
    const v=JSON.parse(lyGet(name)||"null");
    return v;
  }catch(e){ return null; }
}
function readFlags(){
  const v=readList(LAYER_FLAGS);
  return Array.isArray(v) ? v.filter(x=>x&&typeof x==="object"&&typeof x.card==="string") : [];
}
function writeFlags(list){
  if(!list.length){ lyDel(LAYER_FLAGS); return true; }
  return lySet(LAYER_FLAGS,JSON.stringify(list),true)!==false; /* plant:flag-layer */
}
function readEnds(){
  const v=readList(LAYER_ENDS);
  return (v&&typeof v==="object"&&!Array.isArray(v)) ? v : {};
}
function writeEnds(map){
  const keys=Object.keys(map);
  if(!keys.length){ lyDel(LAYER_ENDS); return; }
  lySet(LAYER_ENDS,JSON.stringify(map),true);
}
/* The words a person reads on the card in one language, in the file's own shape: title, body and
   note, the body marked as an export marks an alt or a step, an empty field left out. seen is the
   SHA-256, 64 hex, of the UTF-8 bytes of that object's canonical form. */
function flagWordsHash(card,code){
  const shaped=card&&card.alt?(card.seq?"steps":"alts"):"plain";
  const obj={};
  const put=(name,field)=>{
    const key=cardFieldKey(field,code);
    const v=key?String(card[key]==null?"":card[key]).trim():"";
    if(!v) return;
    obj[name]=(field==="body"&&shaped!=="plain")?v2Mark(v,shaped==="steps"?"[step]":"[alt]"):v;
  };
  put("title","t");
  put("body","body");
  put("note","note");
  return flagSha256(new TextEncoder().encode(v2Canonical(obj)));
}
/* f is the SHA-256, 64 hex, of the ASCII text etiuda-flag, one line feed, then r. */
function flagDigest(r){
  return flagSha256(new TextEncoder().encode("etiuda-flag\n"+String(r||"")));
}
function copyFlag(rec){
  const out={card:String(rec.card), lang:String(rec.lang||""), seen:String(rec.seen||""), r:String(rec.r||"")};
  if(typeof rec.note==="string"&&rec.note) out.note=rec.note;
  return out;
}
function byCardThenR(a,b){
  if(a.card<b.card) return -1;
  if(a.card>b.card) return 1;
  if(a.r<b.r) return -1;
  if(a.r>b.r) return 1;
  return 0;
}
function tell(){
  try{ hooks.scheduleDeskBranch(); }catch(e){}
  try{ hooks.rebuildCards(); }catch(e){}
}
function flagOffered(){
  return eHasBranch()&&eBranchReach();
}
function flagCard(cardId){
  if(!flagOffered()) return {refused:"not-offered"};
  const id=String(cardId==null?"":cardId);
  const card=findCard(id);
  if(!card) return {refused:"no-such-card"};
  const list=readFlags();
  const had=list.filter(f=>f.card===id)[0];
  if(had) return copyFlag(had);
  if(list.length>=FLAG_CAP) return {refused:"full"}; /* plant:flag-full */
  const code=String(lang||"en");
  const rec={card:id, lang:code, seen:flagWordsHash(card,code), r:flagHex(flagRandomBytes())};
  list.push(rec);
  writeFlags(list);
  const ends=readEnds();
  if(ends[id]){ delete ends[id]; writeEnds(ends); }
  tell();
  return copyFlag(rec);
}
function flagNote(cardId,text){
  const id=String(cardId==null?"":cardId);
  const list=readFlags();
  const rec=list.filter(f=>f.card===id)[0];
  if(!rec) return null;
  if(text==null||text===""){
    delete rec.note;
    writeFlags(list);
    tell();
    return copyFlag(rec);
  }
  const s=String(text);
  if(s.length>NOTE_CAP) return {refused:"too-long"}; /* plant:flag-note-cap */
  if(CONTROL.test(s)) return {refused:"control"}; /* plant:flag-note-control */
  rec.note=s;
  writeFlags(list);
  tell();
  return copyFlag(rec);
}
function unflagCard(cardId){
  const id=String(cardId==null?"":cardId);
  const list=readFlags();
  const next=list.filter(f=>f.card!==id);
  if(next.length===list.length) return false;
  writeFlags(next);
  tell();
  return true;
}
function cardFlag(cardId){
  const id=String(cardId==null?"":cardId);
  const rec=readFlags().filter(f=>f.card===id)[0];
  if(rec) return {state:"sent", note:typeof rec.note==="string"?rec.note:""};
  const end=readEnds()[id];
  if(end&&(end.outcome==="changed"||end.outcome==="gone"||end.outcome==="kept"))
    return {state:"answered", outcome:end.outcome, at:end.at};
  return null;
}
function flagSeen(cardId){
  const id=String(cardId==null?"":cardId);
  const ends=readEnds();
  if(!ends[id]) return false;
  delete ends[id];
  writeEnds(ends);
  tell();
  return true;
}
/* The header list the desk file writes. Sorted by card id, then by r, so the order names neither
   which flag was made first. */
function flagFileList(){
  return readFlags().map(copyFlag).sort(byCardThenR); /* plant:flag-sort */
}
function flagHolds(){ return readFlags().length>0; }
/* A well-formed answered list, or null where the whole list is ignored. An entry is {f, o} and
   nothing else: f is 64 lower-case hex, o is changed or kept. */
function answeredMap(list){
  if(!Array.isArray(list)) return null;
  const out={};
  for(let i=0;i<list.length;i++){
    const e=list[i];
    if(!e||typeof e!=="object"||Array.isArray(e)) return null;
    const keys=Object.keys(e);
    if(keys.length!==2||!Object.prototype.hasOwnProperty.call(e,"f")||!Object.prototype.hasOwnProperty.call(e,"o")) return null;
    if(typeof e.f!=="string"||!/^[0-9a-f]{64}$/.test(e.f)) return null;
    if(e.o!=="changed"&&e.o!=="kept") return null;
    out[e.f]=e.o;
  }
  return out;
}
/* An edition has landed. A flag ends when that edition's words in its language no longer hash to
   seen, when the card is gone, or when answered names its f. The moment is kept only the first
   time, and a later edition of the same words does not move it. */
function settleFlags(catalog,doc){
  const list=readFlags();
  if(!list.length) return false;
  const cards=(catalog&&Array.isArray(catalog.cards))?catalog.cards:[];
  const byId={};
  cards.forEach(m=>{ if(m&&m.id!=null) byId[String(m.id)]=m; });
  const answered=answeredMap(doc&&doc.answered);
  const ends=readEnds();
  let moved=false;
  const keep=[];
  list.forEach(rec=>{
    const card=byId[rec.card];
    let outcome="";
    if(!card) outcome="gone";
    else if(flagWordsHash(card,rec.lang)!==rec.seen) outcome="changed"; /* plant:flag-settle-words */
    else if(answered&&Object.prototype.hasOwnProperty.call(answered,flagDigest(rec.r))) outcome=answered[flagDigest(rec.r)];
    if(!outcome){ keep.push(rec); return; }
    moved=true;
    if(!ends[rec.card]) ends[rec.card]={outcome:outcome, at:Date.now()};
  });
  if(!moved) return false;
  writeFlags(keep);
  writeEnds(ends);
  return true;
}

export {
  flagOffered,
  flagCard,
  flagNote,
  unflagCard,
  cardFlag,
  flagSeen,
  flagFileList,
  flagHolds,
  settleFlags,
  flagWordsHash,
  flagDigest
};
