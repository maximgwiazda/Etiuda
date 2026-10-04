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
   (misses) and l (languages): the counts are written on every copy, and a year of buckets
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
    statsTouch(pack, "*");
    statsCompact(pack);
  } else statsTouch(pack, day);
  return b;
}
/* WHICH DAYS HAVE BEEN WRITTEN INTO since the pack was last saved, so a save can leave the older
   days alone when only the newest moved; "*" is a day made, dropped or renumbered. */
const STATS_TOUCHED=new WeakMap();
function statsTouch(pack, day){
  let s=STATS_TOUCHED.get(pack);
  if(!s) STATS_TOUCHED.set(pack, s=new Set());
  s.add(day);
}
/** Whether any day but the newest was written into since the last ask; asking clears it. */
function statsOlderTouched(pack, newest){
  const s=STATS_TOUCHED.get(pack);
  STATS_TOUCHED.delete(pack);
  return !!s && [...s].some(d=>d!==newest);
}
/* AN ID NO KEPT DAY NAMES IS DROPPED and the places after it renumbered, so dayIds holds the ids
   the kept days use rather than every id the desk has ever counted. Run when a day is made, which
   is also when the oldest go. */
function statsCompact(pack){
  const ids=Array.isArray(pack.dayIds)?pack.dayIds:[], days=pack.days||{}, used=new Set();
  const each=fn=>Object.keys(days).forEach(d=>{ const b=days[d]; if(b) ["c","i"].forEach(n=>{ if(b[n]) fn(b,n); }); });
  each((b,n)=>Object.keys(b[n]).forEach(k=>used.add(k)));
  // A pair names both of its ids by place too (bumpPair), and an id only a pair names is still used.
  const pairs=fn=>Object.keys(days).forEach(d=>{ const b=days[d]; if(b&&b.p&&typeof b.p==="object") fn(b); });
  pairs(b=>Object.keys(b.p).forEach(a=>{ used.add(a); Object.keys(b.p[a]||{}).forEach(z=>used.add(z)); }));
  const to=Object.create(null), keep=[];
  ids.forEach((id,at)=>{ if(id!=null && used.has(String(at))){ to[at]=keep.length; keep.push(id); } });
  if(keep.length===ids.length && used.size===keep.length) return;
  each((b,n)=>{
    const out={};
    Object.keys(b[n]).forEach(k=>{ if(k in to) out[to[k]]=b[n][k]; });
    b[n]=out;
  });
  pairs(b=>{
    const out={};
    Object.keys(b.p).forEach(a=>{
      const row=b.p[a];
      if(!(a in to)||!row||typeof row!=="object") return;
      const r=out[to[a]]={};
      Object.keys(row).forEach(z=>{ if(z in to) r[to[z]]=row[z]; });
    });
    b.p=out;
  });
  pack.dayIds=keep;
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
/* "B AFTER A": a card copied straight after another in one conversation, counted in the day's `p`
   as p[place of A][place of B]. `p` is made by the first pair of the day, so a day without one
   keeps its shape. The statistics answer for a span carries its pairs. */
function bumpPair(pack, from, to, at){
  if(!from||!to||String(from)===String(to)) return;
  const b=statsDay(pack, at), a=statsIdAt(pack, String(from)), z=statsIdAt(pack, String(to));
  if(!b.p||typeof b.p!=="object"||Array.isArray(b.p)) b.p={};
  const row=(b.p[a]&&typeof b.p[a]==="object") ? b.p[a] : (b.p[a]={});
  row[z]=(row[z]|0)+1;
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
/* A departed card's day counts go with its lifetime tally; keep(id) says which ids stay. Every
   rebuild asks, so the days are walked only when the ids that would go differ from the last walk. */
const STATS_FORGOT=new WeakMap();
function statsForgetCards(pack, keep){
  const ids=Array.isArray(pack.dayIds)?pack.dayIds:[], gone=[];
  ids.forEach((id,k)=>{ if(!keep(id)) gone.push(k); });
  const asked=ids.length+":"+gone.join(",");
  if(STATS_FORGOT.get(pack)===asked) return;
  let n=0;
  Object.keys(pack.days||{}).forEach(d=>{
    const c=pack.days[d]&&pack.days[d].c, p=pack.days[d]&&pack.days[d].p;
    if(c) Object.keys(c).forEach(k=>{ if(!keep(ids[k])){ delete c[k]; n++; } });
    // A pair goes with either of its cards.
    if(p&&typeof p==="object") Object.keys(p).forEach(a=>{
      const row=p[a];
      if(row&&typeof row==="object"&&keep(ids[a])){
        Object.keys(row).forEach(z=>{ if(!keep(ids[z])){ delete row[z]; n++; } });
        if(!Object.keys(row).length) delete p[a];
      } else { delete p[a]; n++; }
    });
  });
  if(n){ statsTouch(pack, "*"); statsCompact(pack); STATS_FORGOT.delete(pack); }
  else STATS_FORGOT.set(pack, asked);
}
/* THE WINDOW A REPLY'S RECENT USE IS COUNTED OVER, ending today, and the lift a count gives a
   search hit: each one constant. */
const STATS_USE_DAYS=28;
const STATS_LIFT_MAX=3;
const STATS_LIFT_UNIT=4;
/** Places a search hit rises for n copies: min(MAX, floor(log2(1 + n / UNIT))), by exact thresholds. */
function statsLift(n){
  let k=0;
  while(k<STATS_LIFT_MAX && n>=STATS_LIFT_UNIT*(2**(k+1)-1)) k++;
  return k;
}
/* HELD FOR THE DAY, per pack object: copies made while the agent works change no order until the
   date turns. A pack is replaced, never emptied, when a layer is loaded, so a new object is counted afresh. */
const STATS_RECENT=new WeakMap();
/** Copies per card id over the STATS_USE_DAYS days ending `today`, summed from the day buckets. */
function statsRecentUse(pack, today){
  const out=new Map();
  if(!pack||typeof pack!=="object") return out;
  const day=STATS_YMD.test(String(today||"")) ? String(today) : statsYmd();
  const held=STATS_RECENT.get(pack);
  if(held&&held.day===day) return held.use;
  const days=(pack.days&&typeof pack.days==="object"&&!Array.isArray(pack.days)) ? pack.days : {};
  const ids=Array.isArray(pack.dayIds) ? pack.dayIds : [];
  const from=statsDayBefore(day, STATS_USE_DAYS-1);
  Object.keys(days).forEach(d=>{
    const c=STATS_YMD.test(d)&&d>=from&&d<=day&&days[d]&&days[d].c;
    if(c) Object.keys(c).forEach(k=>{
      const id=ids[k], n=c[k]|0;
      if(id!=null&&n>0) out.set(String(id),(out.get(String(id))||0)+n);
    });
  });
  STATS_RECENT.set(pack,{day:day,use:out});
  return out;
}
const STATS_PAIR_DAYS=28;
/** The cards copied straight after `from` over the STATS_PAIR_DAYS days ending `today`, as
    [{id, n}]: most often first, then the one met on the later day, then by id. */
function statsLearntAfter(pack, from, today){
  if(!pack||typeof pack!=="object"||from==null) return [];
  const day=STATS_YMD.test(String(today||"")) ? String(today) : statsYmd();
  const days=(pack.days&&typeof pack.days==="object"&&!Array.isArray(pack.days)) ? pack.days : {};
  const ids=Array.isArray(pack.dayIds) ? pack.dayIds : [];
  const a=ids.indexOf(String(from)), first=statsDayBefore(day, STATS_PAIR_DAYS-1), seen=new Map();
  if(a<0) return [];
  Object.keys(days).forEach(d=>{
    const p=STATS_YMD.test(d)&&d>=first&&d<=day&&days[d]&&days[d].p, row=p&&p[a];
    if(row&&typeof row==="object") Object.keys(row).forEach(z=>{
      const id=ids[z], n=row[z]|0;
      if(id==null||n<=0||String(id)===String(from)) return;
      const o=seen.get(String(id))||{id:String(id),n:0,last:""};
      o.n+=n;
      if(d>o.last) o.last=d;
      seen.set(o.id,o);
    });
  });
  return [...seen.values()]
    .sort((x,y)=>y.n-x.n || (x.last<y.last ? 1 : x.last>y.last ? -1 : 0) || (x.id<y.id ? -1 : x.id>y.id ? 1 : 0))
    .map(o=>({id:o.id,n:o.n}));
}
/* A REQUEST NAMES A SPAN AND THE ANSWER IS THAT SPAN, from and to inclusive, summed over the
   day buckets, with `since` beside it; a card's `at` is its last use inside the span. Without
   a whole span the answer is the lifetime counters, as every answer was before. A span's answer
   also carries `pairs` [{from, to, n}] summed from the same days, and omits the key when none. */
function statsDoc(pack, info){
  const from=String(info&&info.period&&info.period.from||"");
  const to=String(info&&info.period&&info.period.to||"");
  const spanned=STATS_YMD.test(from)&&STATS_YMD.test(to);
  let uc=(pack&&pack.useCounts)||{}, at=(pack&&pack.useAt)||{}, ic=(pack&&pack.intentCounts)||{};
  let misses=(pack&&pack.searchMisses)|0;
  let lc=(pack&&pack.langs&&typeof pack.langs==="object"&&!Array.isArray(pack.langs))?pack.langs:{};
  let since="";
  const pr=new Map();
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
      const bp=b.p&&typeof b.p==="object"?b.p:{};
      Object.keys(bp).forEach(a=>{
        const row=bp[a]&&typeof bp[a]==="object"?bp[a]:{};
        Object.keys(row).forEach(z=>{
          const f=ids[a], t=ids[z], n=row[z]|0;
          if(f==null||t==null||n<=0||String(f)===String(t)) return;
          const k=JSON.stringify([String(f),String(t)]);
          const o=pr.get(k)||{from:String(f),to:String(t),n:0};
          o.n+=n;
          pr.set(k,o);
        });
      });
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
  if(pr.size) doc.pairs=[...pr.values()].sort((x,y)=>y.n-x.n || (x.from<y.from ? -1 : x.from>y.from ? 1 : 0) || (x.to<y.to ? -1 : x.to>y.to ? 1 : 0));
  if(info&&info.catalog&&info.catalog.id){
    doc.catalog={id:String(info.catalog.id),rev:+info.catalog.rev||0};
  }
  return doc;
}

export {
  STATS_DAYS_KEPT,
  STATS_PAIR_DAYS,
  bumpIntent,
  bumpLang,
  bumpMiss,
  bumpPair,
  bumpUse,
  statsDoc,
  statsLearntAfter,
  statsLift,
  statsRecentUse,
  statsForgetCards,
  statsOlderTouched,
  statsYmd
};
