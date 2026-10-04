/* ---- editing the shared catalog directly: the merge, which imports nothing so the harness runs it in bare node ----
   Three documents meet: the file now and the edition the layer grew from, each as the file holds it, and the desk's
   catalog as an export writes it. Only what the layer touches is compared, card by card and key by key, so a key an
   export spells differently from the file is not read as an edit where the layer has not been. */
function sharedCanon(v){
  if(v===undefined) return "";
  if(v===null || typeof v!=="object") return JSON.stringify(v);
  if(Array.isArray(v)) return "["+v.map(sharedCanon).join(",")+"]";
  return "{"+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+":"+sharedCanon(v[k])).join(",")+"}";
}
// Keys a write moves or a signature owns, and the two lists merged item by item: never merged as header keys.
const SHARED_OWN_KEYS=["format","kind","id","rev","date","hash","sig","modified","grew","desk","sample","cards","tags"];
const SHARED_SEP="\u0001";
function sharedById(list){
  const m=new Map();
  (Array.isArray(list)?list:[]).forEach(x=>{ if(x && typeof x==="object" && x.id!=null) m.set(String(x.id),x); });
  return m;
}
function sharedHas(o,k){ return Object.prototype.hasOwnProperty.call(o,k); }
function sharedCopy(v){ return v===undefined ? undefined : JSON.parse(JSON.stringify(v)); }
/* What the layer touches, as places in the file: each card it edits, adds or removes, each shelf it renames, recolours
   or removes, every request and every card's links where it changes the requests, the header keys it holds, and the
   order of the cards. `all` is a catalog made from nothing, whose whole content is the desk's. */
function sharedScope(touched,M,F,B,all){
  const cards=new Map(), tags=new Set(), head=new Set();
  const t=touched||{};
  if(all){
    sharedById(M.cards).forEach((x,id)=>cards.set(id,null));
    sharedById(M.tags).forEach((x,id)=>tags.add(id));
    Object.keys(M).forEach(k=>{ if(SHARED_OWN_KEYS.indexOf(k)<0) head.add(k); });
  }
  (t.cards||[]).forEach(id=>cards.set(String(id),null));
  (t.tags||[]).forEach(id=>tags.add(String(id)));
  (t.head||[]).forEach(k=>head.add(String(k)));
  if(t.requests){
    [M,F,B].forEach(d=>{
      sharedById(d.tags).forEach((x,id)=>{ if(x.kind==="request") tags.add(id); });
      sharedById(d.cards).forEach((x,id)=>{ if(!cards.has(id)) cards.set(id,["requests"]); });
    });
  }
  return { cards:cards, tags:tags, head:head, order:!!(all||t.order) };
}
/* The merge. `state` is kept by the desk per catalog file: `file` is what the file last held at each place as far as
   this desk knows, `desk` what the desk last held there, both absent where the edition stands for them, and `held` the
   places both sides changed, differently. A held place keeps the file's value while the desk keeps its own in its
   layer, until the two agree again, so a later edit there never writes over a colleague unseen. */
function mergeShared(F,B,M,touched,state,all){
  const st=state||{};
  const fileSeen=Object.assign({},st.file||{}), deskSeen=Object.assign({},st.desk||{}), held=new Set(st.held||[]), before=new Set(held);
  const out=sharedCopy(F);
  if(!Array.isArray(out.cards)) out.cards=[];
  if(!Array.isArray(out.tags)) out.tags=[];
  let wrote=false;
  const refFile=(loc,bv)=>sharedHas(fileSeen,loc)?fileSeen[loc]:sharedCanon(bv);
  const refDesk=(loc,bv)=>sharedHas(deskSeen,loc)?deskSeen[loc]:sharedCanon(bv);
  const seen=(loc,f,m)=>{ fileSeen[loc]=f; deskSeen[loc]=m; };
  const forget=loc=>{ delete fileSeen[loc]; delete deskSeen[loc]; };
  /* One place: "mine" writes the desk's value, "file" keeps the file's. `mark` keeps a place the layer touches in
     mind once the two agree; one only a past write named is let go then. */
  const decide=(loc,mv,fv,bv,mark)=>{
    const m=sharedCanon(mv), f=sharedCanon(fv);
    if(held.has(loc)){
      if(m===f){ held.delete(loc); seen(loc,f,m); }
      return "file";
    }
    if(m===f){ if(mark) seen(loc,f,m); else forget(loc); return "file"; }
    const deskMoved=m!==refDesk(loc,bv), fileMoved=f!==refFile(loc,bv);
    seen(loc,f,m);
    // The file moved under a value the desk holds as its own, edited now or before: held, never written over.
    if(fileMoved){ if(deskMoved || m!==sharedCanon(bv)) held.add(loc); return "file"; }
    if(!deskMoved) return "file";
    fileSeen[loc]=m;
    return "mine";
  };
  const scope=sharedScope(touched,M,F,B,all);
  // Places a past write or a held change names are compared again, so an undone edit is written back too.
  const named=pre=>Object.keys(fileSeen).concat(Array.from(held)).filter(l=>l.indexOf(pre)===0).map(l=>l.slice(pre.length).split(SHARED_SEP)[0]);
  /* Cards and tags are lists of things with ids, merged alike. */
  const mergeList=(key,scoped,keysOf)=>{
    const fm=sharedById(F[key]), bm=sharedById(B[key]), mm=sharedById(M[key]), mOrder=(Array.isArray(M[key])?M[key]:[]).map(x=>String(x&&x.id));
    new Set(Array.from(scoped).concat(named(key+SHARED_SEP))).forEach(id=>{
      const at=key+SHARED_SEP+id, mc=mm.get(id), fc=fm.get(id), bc=bm.get(id), keys=keysOf(id), whole=scoped.has(id) && !keys;
      const keyList=(...docs)=>{
        const s=new Set();
        docs.forEach(d=>{ if(d) Object.keys(d).forEach(k=>{ if(k!=="id" && (!keys || keys.indexOf(k)>-1)) s.add(k); }); });
        named(at+SHARED_SEP).forEach(k=>s.add(k));
        return Array.from(s);
      };
      const movedFile=(c,ks)=>ks.some(k=>sharedCanon(c&&c[k])!==refFile(at+SHARED_SEP+k,bc&&bc[k]));
      const movedDesk=(c,ks)=>ks.some(k=>sharedCanon(c&&c[k])!==refDesk(at+SHARED_SEP+k,bc&&bc[k]));
      const p=decide(at,mc?1:undefined,fc?1:undefined,bc?1:undefined,whole);
      if(p==="mine" && mc){
        const after=mOrder.slice(0,mOrder.indexOf(id)).reverse().find(x=>out[key].some(y=>String(y.id)===x));
        out[key].splice(after==null?0:out[key].findIndex(y=>String(y.id)===after)+1,0,sharedCopy(mc));
        keyList(mc).forEach(k=>seen(at+SHARED_SEP+k,sharedCanon(mc[k]),sharedCanon(mc[k])));
        wrote=true;
        return;
      }
      if(p==="mine"){
        // Taken away only as this desk last knew it: a colleague's edit since keeps it, held.
        if(movedFile(fc,keyList(fc,bc))){ held.add(at); fileSeen[at]=sharedCanon(1); return; }
        out[key]=out[key].filter(y=>String(y.id)!==id);
        Object.keys(fileSeen).forEach(l=>{ if(l.indexOf(at+SHARED_SEP)===0) forget(l); });
        wrote=true;
        return;
      }
      // Gone from the file while this desk still edits it: the edit is held, and it stays gone.
      if(mc && !fc){ if(bc && movedDesk(mc,keyList(mc,bc))) held.add(at); return; }
      if(!mc || !fc) return;
      const target=out[key].find(y=>String(y.id)===id);
      keyList(mc,fc,bc).forEach(k=>{
        if(decide(at+SHARED_SEP+k,mc[k],fc[k],bc&&bc[k],scoped.has(id))!=="mine") return;
        if(mc[k]===undefined) delete target[k]; else target[k]=sharedCopy(mc[k]);
        wrote=true;
      });
    });
  };
  mergeList("tags",scope.tags,()=>null);
  mergeList("cards",new Set(scope.cards.keys()),id=>scope.cards.get(id)||null);
  /* The header keys the layer holds. */
  new Set(Array.from(scope.head).concat(named("head"+SHARED_SEP))).forEach(k=>{
    if(SHARED_OWN_KEYS.indexOf(k)>-1) return;
    if(decide("head"+SHARED_SEP+k,M[k],F[k],B[k],scope.head.has(k))!=="mine") return;
    if(M[k]===undefined) delete out[k]; else out[k]=sharedCopy(M[k]);
    wrote=true;
  });
  /* The order of the cards all three hold. A card one side alone has keeps its neighbour. */
  const ORDER="order"+SHARED_SEP+"cards";
  if(scope.order || sharedHas(fileSeen,ORDER) || held.has(ORDER)){
    const ids=d=>(Array.isArray(d.cards)?d.cards:[]).map(x=>String(x&&x.id));
    const inB=new Set(ids(B)), inM=new Set(ids(M)), inOut=new Set(ids(out));
    const common=id=>(all || inB.has(id)) && inM.has(id) && inOut.has(id);
    const only=list=>sharedCanon(list.filter(common));
    const was=s=>sharedHas(s,ORDER) ? JSON.parse(s[ORDER]) : ids(B);
    const m=only(ids(M)), f=only(ids(out));
    const keep=()=>{ fileSeen[ORDER]=sharedCanon(ids(out)); deskSeen[ORDER]=sharedCanon(ids(M)); };
    if(held.has(ORDER)){ if(m===f){ held.delete(ORDER); keep(); } }
    else if(m===f){ if(scope.order) keep(); else forget(ORDER); }
    else {
      const deskMoved=m!==only(was(deskSeen)), fileMoved=f!==only(was(fileSeen));
      if(fileMoved && (deskMoved || m!==only(ids(B)))) held.add(ORDER);
      if(deskMoved && !fileMoved){
        const slots=[], at=sharedById(out.cards), mo=ids(M).filter(common);
        out.cards.forEach((x,i)=>{ if(common(String(x.id))) slots.push(i); });
        mo.forEach((id,n)=>{ out.cards[slots[n]]=at.get(id); });
        wrote=true;
      }
      keep();
    }
  }
  return { doc:out, wrote:wrote, state:{ file:fileSeen, desk:deskSeen, held:Array.from(held) },
           fresh:Array.from(held).filter(l=>!before.has(l)) };
}
/* An edition, in the catalog's own date form: today where the file's is earlier or not a date. */
function sharedDate(was,today){
  const m=/^([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(String(was==null?"":was));
  return (m && m[1]>=today) ? String(was) : today;
}
function sharedPayload(text){
  const raw=String(text||"").replace(/^﻿/,"").trim();
  try{ return JSON.parse(raw); }catch(e){ /* the script form */ }
  const at=raw.indexOf("E_CATALOG"), eq=at>-1?raw.indexOf("=",at):-1;
  if(eq<0) throw new Error("not a catalog");
  return JSON.parse(raw.slice(eq+1).trim().replace(/;\s*$/,""));
}
/* The whole write, given the host's two calls and the engine's checks. `io` holds read() and write(text, sha, create),
   the host's; mine, the desk's catalog; touched; state; pin, the edition the layer grew from, "" for a catalog made from
   nothing, whose file this desk creates; own, the pin of what this desk last wrote; check(doc), the engine's problems;
   hash(doc); pinOf(doc); today. Answers {route, state, fresh, why, pin, others}: route "none" where the file holds all
   the desk has, "branch" where the desk's own file is still wanted. A file beaten between the read and the write is
   read and merged once more. */
function directWrite(io){
  const loose=!io.pin, quit=why=>({ route:"branch", why:why, state:io.state, fresh:[] });
  const attempt=n=>Promise.resolve(io.read()).then(r=>{
    if(!r || !r.free) return quit(r ? "signed" : "read");
    let F=null, B=null;
    if(r.text){
      try{ F=sharedPayload(r.text); }catch(e){ return quit("read"); }
      if(!F || typeof F!=="object" || String(F.id)!==String(io.mine.id)) return quit("other");
    } else if(!loose) return quit("read");
    if(loose) B={ cards:[], tags:[] };
    else {
      try{ B=r.base ? sharedPayload(r.base) : null; }catch(e){ B=null; }
      if(!B) return quit("base");
    }
    const Fdoc=F || { format:2, kind:"etiuda-catalog", id:String(io.mine.id), rev:0, cards:[], tags:[] };
    const m=mergeShared(Fdoc,B,io.mine,io.touched,io.state,loose);
    const route=m.state.held.length ? "branch" : "none";
    if(!m.wrote) return { route:route, state:m.state, fresh:m.fresh };
    const doc=m.doc;
    doc.rev=(+Fdoc.rev||0)+1;
    doc.date=sharedDate(Fdoc.date,io.today);
    doc.modified=true;
    delete doc.sig;
    delete doc.hash;
    if((io.check(doc)||[]).length) return quit("problems");
    doc.hash=io.hash(doc);
    // Whether the file held anything this desk did not put there: its edition is then offered as any other.
    const others=!!F && [io.pin,io.own].indexOf(io.pinOf(F))<0;
    return Promise.resolve(io.write(JSON.stringify(doc,null,1)+"\n",r.sha||"",!F)).then(w=>{
      if(w && w.ok) return { route:route, state:m.state, fresh:m.fresh, pin:io.pinOf(doc), others:others, wrote:true };
      if(w && w.changed && n<1) return attempt(n+1);
      return quit((w&&w.busy)?"busy":(w&&w.taken)?"taken":(w&&w.changed)?"beaten":"refused");
    });
  });
  return attempt(0);
}

export { sharedCanon, sharedScope, mergeShared, sharedDate, directWrite };
