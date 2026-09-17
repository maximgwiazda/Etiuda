/* Local counters the statistics file later copies onto the organisation's share, on request.
   Pure: the pack is passed in, so a test can drive a bump without the rest of the desk. */

function statsYmd(d){
  const x=d||new Date();
  const p=v=>String(v).padStart(2,"0");
  return x.getFullYear()+"-"+p(x.getMonth()+1)+"-"+p(x.getDate());
}
function bumpUse(pack, id, at){
  if(!id) return;
  if(!pack.useCounts||typeof pack.useCounts!=="object") pack.useCounts={};
  pack.useCounts[id]=(pack.useCounts[id]|0)+1;
  if(!pack.useAt||typeof pack.useAt!=="object") pack.useAt={};
  pack.useAt[id]=at||statsYmd();
}
function bumpIntent(pack, id){
  if(!id) return;
  if(!pack.intentCounts||typeof pack.intentCounts!=="object") pack.intentCounts={};
  pack.intentCounts[id]=(pack.intentCounts[id]|0)+1;
}
function bumpMiss(pack){
  pack.searchMisses=(pack.searchMisses|0)+1;
}
function bumpLang(pack, lang){
  if(lang!=="en"&&lang!=="pl") return;
  if(!pack.langs||typeof pack.langs!=="object") pack.langs={en:0,pl:0};
  pack.langs[lang]=(pack.langs[lang]|0)+1;
}
function statsDoc(pack, info){
  const cards=[];
  const uc=(pack&&pack.useCounts)||{};
  const at=(pack&&pack.useAt)||{};
  Object.keys(uc).forEach(id=>{
    const n=uc[id]|0;
    if(!n) return;
    const row={id:String(id),n:n};
    if(at[id]) row.at=String(at[id]);
    cards.push(row);
  });
  const intents=[];
  const ic=(pack&&pack.intentCounts)||{};
  Object.keys(ic).forEach(id=>{
    const n=ic[id]|0;
    if(n) intents.push({id:String(id),n:n});
  });
  const langs=(pack&&pack.langs&&typeof pack.langs==="object")
    ? {en:pack.langs.en|0,pl:pack.langs.pl|0} : {en:0,pl:0};
  const doc={
    format:1,
    kind:"etiuda-statistics",
    engine:String(info&&info.engine||""),
    period:{from:String(info&&info.period&&info.period.from||""),to:String(info&&info.period&&info.period.to||"")},
    cards,intents,
    misses:(pack&&pack.searchMisses)|0,
    langs
  };
  if(info&&info.catalog&&info.catalog.id){
    doc.catalog={id:String(info.catalog.id),rev:+info.catalog.rev||0};
  }
  return doc;
}

export {
  bumpIntent,
  bumpLang,
  bumpMiss,
  bumpUse,
  statsDoc,
  statsYmd
};
