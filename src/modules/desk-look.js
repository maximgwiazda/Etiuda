/* A COLLEAGUE'S DESK FILE, as the Library shows it: the desk's name and key, the edition it is compared with, and the
   Look behind its eye, which is the edition panel told it is a desk. A changed card of that desk's is taken into this
   desk's own edits at once, since no load follows a look. */
import { editionChanges } from "./edition-changes.js";
import { openEditionPanel, editionCountWords } from "./edition-panel.js";
import { parseCatalogFile, storedCatalog } from "./catalog.js";
import { eReadCatalogFile } from "./host.js";
import { pack, savePack } from "./pack.js";
import { baseCard, overrideAgainstBase } from "./card-model.js";
import { leadKeyText } from "./team-join.js";
import { hooks } from "./hooks.js";
import { t, toast, toastRefusal } from "./ui-lang.js";

/* The desk's name as the agent gave it in Settings, else a colleague's. */
function deskName(f){
  const n=String(f && f.desk && f.desk.name || "").trim();
  return n ? t("{NAME}'s desk").split("{NAME}").join(n) : t("A colleague's desk");
}
// The 16 hex of the desk's id in four groups, as a lead's key is shown for comparing.
function deskKey(f){ return leadKeyText(String(f.desk.id).slice(2)); }
/* WHICH EDITION A COLLEAGUE'S FILE IS COMPARED WITH: the one it grew from, as the catalog in use or as a file in the
   folder; else the catalog in use where it is the same catalog; else the newest file of it. `files` is the folder's
   own rows, newest first. Only a comparison with the catalog in use can be taken into this desk's edits. */
function deskBase(f,files,held){
  const g=f && f.grew;
  if(!g) return null;
  const inUse=!!held && String(held.id||"")===g.id;
  if(inUse && held.pin===g.sha) return {held:true};
  const exact=files.find(x=>x.id===g.id && x.sha===g.sha);
  if(exact) return {file:exact};
  if(inUse) return {held:true};
  const any=files.find(x=>x.id===g.id);
  return any ? {file:any} : null;
}
// Each file read and parsed once per date: the rows' lines and the Look ask for the same two.
const deskReads=new Map();
function readParsed(name,desk,mtime){
  const at=(desk||"")+"/"+name+"|"+mtime;
  if(!deskReads.has(at)) deskReads.set(at, eReadCatalogFile(name,desk).then(got=>{
    try{ return got && got.text ? parseCatalogFile(got.text) : null; }catch(e){ return null; }
  }).catch(()=>null));
  return deskReads.get(at);
}
/* Both sides, or null where either would not read. A file that grew from nothing here is compared with no cards. */
function deskSides(f,base){
  const team=!base ? Promise.resolve(null) : base.held ? Promise.resolve(storedCatalog()) : readParsed(base.file.name,"",base.file.mtime);
  return Promise.all([readParsed(f.name,f.desk.id,f.mtime),team]).then(([hers,team])=>{
    if(!hers || (base && !team)) return null;
    return {hers:hers, team:team||{cards:[], langs:hers.langs}};
  });
}
/* What that desk changed against the edition it is compared with, as the offer counts an edition's changes. */
function deskChangeWords(f,base){
  return deskSides(f,base).then(s=>s ? editionCountWords(editionChanges(s.team,s.hers,base&&base.held?pack:null).counts) : null);
}
const cardIn=(c,id)=>((c&&c.cards)||[]).find(m=>String(m.id)===id)||null;
const deskText=v=>String(v==null?"":v);
// The card as this desk shows it: the catalog's, with this desk's own edit over it.
function deskCardNow(id){ const b=baseCard(id); return b ? Object.assign({},b,(pack.overrides||{})[id]||{}) : null; }
function deskTaken(it,hers){
  const m=deskCardNow(it.id), h=cardIn(hers,it.id);
  return !!m && !!h && it.fields.every(f=>deskText(m[f.key])===deskText(h[f.key]));
}
/* THE AGENT'S EDIT OF A CARD AS IT STOOD BEFORE A TAKE, with the edit the take made, kept across openings of Look for as
   long as the desk stays on this catalog: restartDesk forgets it. A take over an edit made since is a new first take. */
const lookEdits=new Map();
function forgetLookEdits(){ lookEdits.clear(); }
/* TAKEN, the fields where that desk's text differs become this desk's own edit of the card, nothing else of the card;
   given back, the edit returns to what it was before the take, or to the team's text. */
function deskToggle(it,hers){
  const base=baseCard(it.id), now=deskCardNow(it.id), h=cardIn(hers,it.id);
  if(!base || !now || !h || it.kind!=="changed") return false;
  if(!pack.overrides) pack.overrides={};
  const on=!deskTaken(it,hers), was=pack.overrides[it.id], held=lookEdits.get(it.id);
  if(on && (!held || held.after!==JSON.stringify(was||null))) lookEdits.set(it.id, {before:was ? JSON.parse(JSON.stringify(was)) : null, after:""});
  const set=from=>{ const moved={}; it.fields.forEach(f=>{ moved[f.key]=deskText(from[f.key]); }); return overrideAgainstBase(base,Object.assign(now,moved)); };
  const o=on ? set(h) : held ? held.before : set(base);
  if(on) lookEdits.get(it.id).after=JSON.stringify(o||null); else lookEdits.delete(it.id);
  if(o && Object.keys(o).length) pack.overrides[it.id]=o; else delete pack.overrides[it.id];
  savePack();
  hooks.rebuildCards();
  return true;
}
/** Look at a colleague's file: `f` its listing row, `base` from deskBase, `name` the catalog it is compared with, and
 *  the panel's two ways out. Resolves to whether the panel stood. */
function openDeskLook(f,base,name,work,back){
  return deskSides(f,base).then(s=>{
    if(!s){ toastRefusal(t("{FILE} could not be read.").split("{FILE}").join(String(f.name||""))); return false; }
    const inUse=!!(base && base.held), changes=editionChanges(s.team,s.hers,inUse?pack:null);
    if(!changes.items.length){ toast(t("That desk's cards match the team's edition.")); return false; }
    const who=deskName(f);
    openEditionPanel({c:s.hers, held:s.team, changes:changes, version:"", name:name, keep:back, load:work, back:back, taken:()=>{},
      desk:{title:who, was:t("In the team's edition"), now:t("At {DESK}").split("{DESK}").join(who),
        keep:t("Back to the Library"), load:t("Work from this file").split("{DESK}").join(who),
        take:inUse ? t("Take this text").split("{DESK}").join(who) : "",
        taken:it=>deskTaken(it,s.hers), toggle:it=>deskToggle(it,s.hers),
        sub:it=>(it.kind==="changed" && inUse && deskTaken(it,s.hers)) ? t("Now in your edits") : it.own ? t("you have your own version") : ""}});
    return true;
  });
}

export {
  deskName,
  deskKey,
  deskBase,
  deskChangeWords,
  forgetLookEdits,
  openDeskLook
};
