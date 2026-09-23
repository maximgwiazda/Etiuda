/* Local counters the statistics file later copies onto the organisation's share, on request.
   Pure: the pack is passed in, so a test can drive a bump without the rest of the desk. */

/* THE DAYS AN ANSWER CAN COVER. Each bump lands in the lifetime counters, which the Library
   reads, and in its day's bucket, which is what an answer for a span is summed from. Days older
   than this many before the newest are dropped, and `pack.daysSince` moves with them. */
const STATS_DAYS_KEPT=400;
const STATS_YMD=/^\d{4}-\d{2}-\d{2}$/;

function statsYmd(d){
  const x=d||new Date();
  const p=v=>String(v).padStart(2,"0");
  return x.getFullYear()+"-"+p(x.getMonth()+1)+"-"+p(x.getDate());
}
// Calendar arithmetic in UTC, so a daylight-saving night cannot make a day 23 hours long.
function statsDayBefore(ymd, n){
  const [y,m,d]=ymd.split("-").map(Number);
  const x=new Date(Date.UTC(y,m-1,d)-n*864e5);
  const p=v=>String(v).padStart(2,"0");
  return x.getUTCFullYear()+"-"+p(x.getUTCMonth()+1)+"-"+p(x.getUTCDate());
}
/* A BUCKET NAMES AN ID BY ITS PLACE IN `pack.dayIds`, and holds c (cards), i (intents), m
   (misses) and l (languages): the pack is written whole on every copy, and a year of buckets
   spelling each id out every day is several times the size. `daysSince` is the earliest day
   this desk holds a bucket for, which is what a span's answer says it can speak for. */
function statsDay(pack, at){
  const day=STATS_YMD.test(String(at||"")) ? String(at) : statsYmd();
  if(!pack.days||typeof pack.days!=="object"||Array.isArray(pack.days)) pack.days={};
  let b=pack.days[day];
  if(!b||typeof b!=="object"){
    b=pack.days[day]={c:{},i:{},m:0,l:{}};
    const cut=statsDayBefore(day, STATS_DAYS_KEPT);
    Object.keys(pack.days).forEach(k=>{ if(k<cut) delete pack.days[k]; });
    if(!STATS_YMD.test(String(pack.daysSince||""))||day<pack.daysSince) pack.daysSince=day;
    if(pack.daysSince<cut) pack.daysSince=cut;
  }
  return b;
}
function statsIdAt(pack, id){
  if(!Array.isArray(pack.dayIds)) pack.dayIds=[];
  let at=pack.dayIds.indexOf(id);
  if(at<0){ at=pack.dayIds.length; pack.dayIds.push(id); }
  return at;
}
function bumpUse(pack, id, at){
  if(!id) return;
  if(!pack.useCounts||typeof pack.useCounts!=="object") pack.useCounts={};
  pack.useCounts[id]=(pack.useCounts[id]|0)+1;
  if(!pack.useAt||typeof pack.useAt!=="object") pack.useAt={};
  pack.useAt[id]=at||statsYmd();
  const b=statsDay(pack, at), k=statsIdAt(pack, String(id));
  b.c[k]=(b.c[k]|0)+1;
}
function bumpIntent(pack, id, at){
  if(!id) return;
  if(!pack.intentCounts||typeof pack.intentCounts!=="object") pack.intentCounts={};
  pack.intentCounts[id]=(pack.intentCounts[id]|0)+1;
  const b=statsDay(pack, at), k=statsIdAt(pack, String(id));
  b.i[k]=(b.i[k]|0)+1;
}
function bumpMiss(pack, at){
  pack.searchMisses=(pack.searchMisses|0)+1;
  const b=statsDay(pack, at);
  b.m=(b.m|0)+1;
}
/* A COUNTER PER LANGUAGE ACTUALLY COPIED IN, keyed by code and not by a pair: a desk speaking
   neither en nor pl counted nothing at all and reported two noughts. Any code the caller is
   showing is countable; a key that is not a usable code is refused, since this map is written
   into a statistics document a desk sends out. */
function bumpLang(pack, lang, at){
  const code=String(lang==null?"":lang);
  if(!code||/[\s:]/.test(code)) return;
  if(!pack.langs||typeof pack.langs!=="object"||Array.isArray(pack.langs)) pack.langs={};
  pack.langs[code]=(pack.langs[code]|0)+1;
  const b=statsDay(pack, at);
  b.l[code]=(b.l[code]|0)+1;
}
// A departed card's day counts go with its lifetime tally; keep(id) says which ids stay.
function statsForgetCards(pack, keep){
  const ids=Array.isArray(pack.dayIds)?pack.dayIds:[];
  Object.keys(pack.days||{}).forEach(d=>{
    const c=pack.days[d]&&pack.days[d].c;
    if(c) Object.keys(c).forEach(k=>{ if(!keep(ids[k])) delete c[k]; });
  });
}
/* A REQUEST NAMES A SPAN AND THE ANSWER IS THAT SPAN, from and to inclusive, summed over the
   day buckets, with `since` beside it; a card's `at` is its last use inside the span. Without
   a whole span the answer is the lifetime counters, as every answer was before. */
function statsDoc(pack, info){
  const from=String(info&&info.period&&info.period.from||"");
  const to=String(info&&info.period&&info.period.to||"");
  const spanned=STATS_YMD.test(from)&&STATS_YMD.test(to);
  let uc=(pack&&pack.useCounts)||{}, at=(pack&&pack.useAt)||{}, ic=(pack&&pack.intentCounts)||{};
  let misses=(pack&&pack.searchMisses)|0;
  let lc=(pack&&pack.langs&&typeof pack.langs==="object"&&!Array.isArray(pack.langs))?pack.langs:{};
  let since="";
  if(spanned){
    const days=(pack&&pack.days&&typeof pack.days==="object"&&!Array.isArray(pack.days))?pack.days:{};
    const ids=(pack&&Array.isArray(pack.dayIds))?pack.dayIds:[];
    uc={}; at={}; ic={}; lc={}; misses=0;
    Object.keys(days).filter(d=>STATS_YMD.test(d)&&d>=from&&d<=to).sort().forEach(d=>{
      const b=days[d]||{};
      Object.keys(b.c||{}).forEach(k=>{
        const id=ids[k], n=b.c[k]|0;
        if(id!=null&&n){ uc[id]=(uc[id]|0)+n; at[id]=d; }
      });
      Object.keys(b.i||{}).forEach(k=>{ const id=ids[k]; if(id!=null) ic[id]=(ic[id]|0)+(b.i[k]|0); });
      Object.keys(b.l||{}).forEach(c=>{ lc[c]=(lc[c]|0)+(b.l[c]|0); });
      misses+=b.m|0;
    });
    since=STATS_YMD.test(String(pack&&pack.daysSince||"")) ? String(pack.daysSince) : statsYmd();
  }
  const cards=[];
  Object.keys(uc).forEach(id=>{
    const n=uc[id]|0;
    if(!n) return;
    const row={id:String(id),n:n};
    if(at[id]) row.at=String(at[id]);
    cards.push(row);
  });
  const intents=[];
  Object.keys(ic).forEach(id=>{
    const n=ic[id]|0;
    if(n) intents.push({id:String(id),n:n});
  });
  const langs={};
  Object.keys(lc).forEach(code=>{ if(lc[code]|0) langs[code]=lc[code]|0; });
  const doc={
    format:1,
    kind:"etiuda-statistics",
    engine:String(info&&info.engine||""),
    period:{from:from,to:to}
  };
  if(spanned) doc.since=since;
  Object.assign(doc,{cards,intents,misses,langs});
  if(info&&info.catalog&&info.catalog.id){
    doc.catalog={id:String(info.catalog.id),rev:+info.catalog.rev||0};
  }
  return doc;
}

export {
  STATS_DAYS_KEPT,
  bumpIntent,
  bumpLang,
  bumpMiss,
  bumpUse,
  statsDoc,
  statsForgetCards,
  statsYmd
};
