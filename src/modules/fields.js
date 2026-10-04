/* FILL-IN FIELDS: what the catalog declares under `fields`, and the rules for a value. A field is
   written in a card's text as its label in braces, "{order number}", and the agent supplies its
   value once per conversation. This module imports nothing and touches no page, so Studio takes
   the same rules out of the pinned engine rather than writing a second copy of them. */

const FILL_FIELD_KINDS=["text","link","date","amount","pattern"];
const FILL_FIELD_VALUE_MAX=300;
/* A brace token that is not one of the desk's own: anything but a brace, a colon or a line
   break inside, so {DAYPART:a|b} and a stray brace in prose never reach the field lookup. */
const FILL_FIELD_RE=/\{([^{}:\n]{1,60})\}/g;

let fillFieldList=[];
let fillFieldIndex=new Map();

function fillFieldFold(s){
  return String(s==null?"":s).normalize("NFC").toLowerCase().replace(/\s+/g," ").trim();
}
/** The catalog's fields, already validated by v2Problems; null or absent clears them. */
function setCatalogFillFields(list){
  fillFieldList=Array.isArray(list)?list.filter(f=>f&&typeof f==="object"&&typeof f.id==="string"):[];
  fillFieldIndex=new Map();
  fillFieldList.forEach(f=>{
    Object.keys(f.label||{}).forEach(code=>{
      const k=fillFieldFold(f.label[code]);
      if(k && !fillFieldIndex.has(k)) fillFieldIndex.set(k,f);
    });
  });
}
function catalogFillFields(){ return fillFieldList; }
/* A token is matched by its label in ANY language the field declares, folded for case and
   spacing, so a Polish label left in an English text still resolves rather than leaking. */
function fillFieldFor(name){ return fillFieldIndex.get(fillFieldFold(name))||null; }
/** The declared fields a text holds, each once, in the order they first appear. */
function fillFieldsIn(text){
  const out=[];
  if(!fillFieldList.length) return out;
  String(text==null?"":text).replace(FILL_FIELD_RE,(raw,name)=>{
    const f=fillFieldFor(name);
    if(f && out.indexOf(f)<0) out.push(f);
    return raw;
  });
  return out;
}
function fillFieldLabel(f,l){
  const lab=(f&&f.label)||{};
  if(typeof lab[l]==="string" && lab[l].trim()) return lab[l].trim();
  const k=Object.keys(lab).find(c=>typeof lab[c]==="string" && lab[c].trim());
  return k ? lab[k].trim() : String((f&&f.id)||"");
}
function fillFieldRequired(f){ return !(f && f.required===false); }
function fillFieldOnce(f){ return !!(f && f.keep==="copy"); }
function fillFieldTakesClip(f){ return !(f && f.clip===false); }
/** The words a skipped field leaves, in the text's language, or nothing. */
function fillFieldSkip(f,l){
  const s=(f&&f.skip)||{};
  return typeof s[l]==="string" ? s[l] : "";
}
/* WHAT A VALUE MAY HOLD: one line of ordinary text. Copied from a web page it carries hard and
   invisible spaces; a line break or a tab inside becomes one space, so "Jan" and "Kowalski" on
   two lines stay two words. Braces go, so a value can never be read back as a token. */
const FILL_FIELD_INVISIBLE=new RegExp("["+String.fromCharCode(0x200b,0x200c,0x200d,0x2060,0xfeff,0xad)+"]","g");
const FILL_FIELD_SPACES=new RegExp("["+String.fromCharCode(0xa0,0x2007,0x202f,0x3000)+String.fromCharCode(0x2000)+"-"+String.fromCharCode(0x200a)+"]","g");
const FILL_FIELD_BREAKS=new RegExp("[\\x00-\\x1f\\x7f-\\x9f"+String.fromCharCode(0x2028,0x2029)+"]","g");
function fillFieldClean(s){
  return String(s==null?"":s).normalize("NFC")
    .replace(FILL_FIELD_INVISIBLE,"").replace(FILL_FIELD_SPACES," ")
    .replace(FILL_FIELD_BREAKS," ")
    .replace(/[{}]/g,"").replace(/\s+/g," ").trim().slice(0,FILL_FIELD_VALUE_MAX);
}
/* A pattern is written as the value looks: 0 is any digit, ? is any letter or digit, and every
   other character stands for itself, letters in either case. */
function fillFieldPatternRe(p){
  const src=String(p==null?"":p).split("").map(ch=>ch==="0"?"\\d":ch==="?"?"[\\p{L}\\p{N}]"
    :/[\^$\\.*+()[\]{}|\/]/.test(ch)?"\\"+ch:ch).join("");
  try{ return new RegExp("(?<![\\p{L}\\p{N}])"+src+"(?![\\p{L}\\p{N}])","iu"); }catch(e){ return null; }
}
const FILL_FIELD_NUM="\\d{1,3}(?:[ .]\\d{3})+(?:,\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?";
const FILL_FIELD_CUR="z\\u0142|zl|pln|eur|usd|gbp|\\u20ac|\\$|\\u00a3";
/** The part of `raw` that fits the field, as {value}, or null where nothing does. */
function fillFieldFit(f,raw){
  const s=fillFieldClean(raw);
  if(!s || !f) return null;
  const kind=f.kind||"text";
  let v="";
  if(kind==="text") v=s;
  else if(kind==="link"){
    const m=/(?:https?:\/\/|www\.)[^\s<>"']+/i.exec(s);
    v=m ? m[0].replace(/[.,;:!?)\]'"]+$/,"") : "";
  } else if(kind==="date"){
    const re=/(?<![\d.,])(\d{4})-(\d{1,2})-(\d{1,2})(?![\d])|(?<![\d.,])(\d{1,2})[./-](\d{1,2})(?:[./-](\d{4}|\d{2}))?(?![\d]|[.,]\d)/g;
    let m;
    while((m=re.exec(s))){
      const d=+(m[3]||m[4]), mo=+(m[2]||m[5]);
      if(d>=1 && d<=31 && mo>=1 && mo<=12){ v=m[0]; break; }
    }
  } else if(kind==="amount"){
    const near=new RegExp("(?<![\\d.,])("+FILL_FIELD_NUM+")\\s?(?:"+FILL_FIELD_CUR+")|(?:"+FILL_FIELD_CUR+")\\s?("+FILL_FIELD_NUM+")(?![\\d])","iu").exec(s);
    const any=new RegExp("(?<![\\d.,])(?:"+FILL_FIELD_NUM+")(?![\\d])").exec(s);
    v=near ? (near[1]||near[2]) : (any ? any[0] : "");
  } else if(kind==="pattern"){
    const re=fillFieldPatternRe(f.pattern), m=re && re.exec(s), pat=String(f.pattern);
    // Each character of the pattern takes one; a letter it spells is written as the pattern has it.
    v=m ? m[0].split("").map((ch,i)=>/\p{L}/u.test(pat[i]) ? pat[i] : ch).join("") : "";
  }
  v=String(v||"").trim();
  return v ? {value:v} : null;
}
/** True where the whole of the value fits the field, as typed or as kept. */
function fillFieldOk(f,v){
  const s=fillFieldClean(v);
  if(!s) return false;
  const fit=fillFieldFit(f,s);
  return !!fit && fit.value===s;
}

export {
  FILL_FIELD_KINDS, FILL_FIELD_RE, FILL_FIELD_VALUE_MAX,
  setCatalogFillFields, catalogFillFields, fillFieldFold, fillFieldFor, fillFieldsIn, fillFieldLabel,
  fillFieldRequired, fillFieldOnce, fillFieldTakesClip, fillFieldSkip, fillFieldClean, fillFieldFit, fillFieldOk,
  fillFieldPatternRe
};
