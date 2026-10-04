/* WHAT CHANGED IN THE EDITION ON OFFER, said in the offer's bubble and shown card by card in the panel
   behind it. The comparison is edition-changes.js; a card's new text taken here waits for the load
   (card-carry.js). Words are translated as they are built, since the panel redraws half of itself. */
import { editionNoteText, wordDiff } from "./edition-changes.js";
import { takeTeamText, teamTextTaken } from "./card-carry.js";
import { cardText, cardTitle } from "./card-model.js";
import { openDialog } from "./dialog.js";
import { t, counted, uiLang } from "./ui-lang.js";
import { esc } from "./esc.js";
import { pack } from "./pack.js";
import { lang } from "./app-state.js";
import { CONTENT_LANGS } from "./content-model.js";

// The bubble names this many cards and counts the rest; the panel lists them all.
const EDITION_SHOWN=8;
function editionKindWord(k){
  if(k==="changed") return t("changed");
  if(k==="new") return t("new");
  if(k==="restored") return t("restored");
  if(k==="retired") return t("retired");
  return t("removed");
}
function editionCountWords(n){
  const parts=[];
  if(n.changed) parts.push(counted(n.changed,"{N} changed","{N} changed"));
  if(n.new) parts.push(counted(n.new,"{N} new","{N} new"));
  if(n.restored) parts.push(counted(n.restored,"{N} restored","{N} restored"));
  if(n.retired) parts.push(counted(n.retired,"{N} retired","{N} retired"));
  if(n.removed) parts.push(counted(n.removed,"{N} removed","{N} removed"));
  return parts;
}
function editionCountsHtml(n){
  // Each count held to its word by its own box, for the reason counted() gives for its spaces.
  return '<div class="ec-counts">'+editionCountWords(n).map(p=>'<span class="ec-n">'+esc(p)+'</span>').join(" · ")+'</div>';
}
function editionNoteHtml(note,cls){
  return '<div class="'+cls+'"><small>'+esc(t("Note for this edition"))+'</small><p>'+esc(note)+'</p></div>';
}
// The card an item is about: the edition's, except for one the edition no longer holds.
function editionCard(it,held,offered){
  const find=c=>((c&&c.cards)||[]).find(m=>String(m.id)===it.id);
  return find(it.kind==="removed"?held:offered)||find(held)||{id:it.id};
}
function editionSubline(it,c){
  if(it.kind==="changed" && it.own) return t(teamTextTaken(c,it.id)?"the team's new text":"you have your own version");
  if(it.kind==="retired" && it.asleep) return t("It comes back with your star and your edits.");
  return "";
}
// `own` answers a row's small line in place of the offer's, for a colleague's desk.
function editionRowInner(it,held,c,own){
  const sub=own?own(it):editionSubline(it,c);
  return '<span class="ec-kind">'+esc(editionKindWord(it.kind))+'</span>'
    +'<span class="ec-t">'+esc(cardTitle(editionCard(it,held,c))||it.id)
    +(sub?'<small>'+esc(sub)+'</small>':'')+'</span>';
}
/** The offer's half: the lead's note, the counts and the first titles, then the way to the panel.
 *  "" where an update changes no card's text and carries no note, which leaves the offer as it was. */
function editionOfferHtml(c,held,changes){
  const note=editionNoteText(c,uiLang()), items=changes.items;
  if(!items.length && !note) return "";
  const more=items.length-EDITION_SHOWN;
  return '<div class="ec-change">'
    +(note?editionNoteHtml(note,"ec-note"):'')
    +(items.length?editionCountsHtml(changes.counts):'')
    +(items.length?'<ul class="ec-list">'+items.slice(0,EDITION_SHOWN)
        .map(it=>'<li data-ec-id="'+esc(it.id)+'">'+editionRowInner(it,held,c)+'</li>').join("")+'</ul>':'')
    +(more>0?'<div class="ec-more">'+esc(t("and {N} more").split("{N}").join(String(more)))+'</div>':'')
    +'</div>'
    +(items.length?'<button type="button" class="ec-diff" id="ecDiff">'+esc(t("Show the differences"))+'</button>':'');
}
/* ONE FIELD, AS IT WAS AND AS IT BECOMES: each side keeps the words it shares with the other and marks
   its own. The language is the one the desk reads that field in, where that language changed. */
function editionSide(ops,mine){
  return ops.filter(o=>o.op==="same"||o.op===mine)
    .map(o=>o.op==="same"?esc(o.text):'<span class="ed-'+mine+'">'+esc(o.text)+'</span>').join("");
}
function editionFieldWord(f){ return f==="t"?t("Title"):f==="note"?t("Note"):t("Text"); }
/* `desk` is a colleague's desk looked at: its two heads in place of Was and Becomes, and its one act, which takes
   that desk's text of a changed card into this desk's own edits, in place of the offer's pair. */
function editionPaneHtml(it,held,c,desk){
  const was=((held&&held.cards)||[]).find(m=>String(m.id)===it.id)||null;
  const now=((c&&c.cards)||[]).find(m=>String(m.id)===it.id)||null;
  const mine=(pack.overrides||{})[it.id]||null, many=CONTENT_LANGS.length>1;
  const cell=(html,cls)=>'<div class="ed-cell'+(cls?" "+cls:"")+'">'+html+'</div>';
  const head=w=>'<div class="ed-head">'+esc(w)+'</div>';
  let cols=1, rows="";
  if(it.kind==="changed"){
    const blocks=["t","body","note"].map(field=>{
      const all=it.fields.filter(f=>f.field===field), pref=field==="body"?lang:uiLang();
      return all.find(f=>f.code===pref)||all[0];
    }).filter(Boolean);
    const own=blocks.map(f=>(it.own && mine && mine[f.key]!=null && String(mine[f.key])!==cardText(now,f.field,f.code))
      ? String(mine[f.key]) : null);
    cols=own.some(v=>v!=null)?3:2;
    rows=head(desk?desk.was:t("Was"))+head(desk?desk.now:t("Becomes"))+(cols>2?head(t("Your version")):"");
    // The choice sits under the last of the agent's own versions, and the pressed one is the choice made.
    const last=own.map((v,i)=>v!=null?i:-1).reduce((a,b)=>Math.max(a,b),-1), took=teamTextTaken(c,it.id);
    const acts='<div class="ed-acts">'
      +'<button type="button" class="btn" data-ed-take="1" aria-pressed="'+took+'">'+esc(t("Take the team's new text"))+'</button>'
      +'<button type="button" class="btn" data-ed-take="0" aria-pressed="'+!took+'">'+esc(t("Keep mine"))+'</button></div>';
    blocks.forEach((f,i)=>{
      if(blocks.length>1 || f.field!=="body") rows+='<div class="ed-field">'+esc(editionFieldWord(f.field)+(many?" · "+f.code.toUpperCase():""))+'</div>';
      const ops=wordDiff(cardText(was,f.field,f.code),cardText(now,f.field,f.code));
      rows+=cell(editionSide(ops,"del"))+cell(editionSide(ops,"ins"))
        +(cols>2?'<div class="ed-own">'+(own[i]!=null?cell(esc(own[i])):"")+(i===last&&!desk?acts:"")+'</div>':"");
    });
    if(desk && desk.take) rows+='<div class="ed-acts ed-acts-desk"><button type="button" class="btn" data-ed-mine="1" aria-pressed="'
      +!!desk.taken(it)+'">'+esc(desk.take)+'</button></div>';
  } else {
    const gone=it.kind==="retired"||it.kind==="removed", m=gone?was:now, code=cardText(m,"body",lang)?lang:CONTENT_LANGS[0];
    rows=head(desk?(gone?desk.was:desk.now):t(gone?"Was":"Becomes"))+cell(esc(cardText(m,"body",code)));
    const sub=desk?"":editionSubline(it,c);
    if(sub) rows+='<p class="ed-sub">'+esc(sub)+'</p>';
  }
  return '<h3>'+esc(cardTitle(now||was||{})||it.id)+'</h3><div class="ed-grid ed-c'+cols+'">'+rows+'</div>';
}
/** The panel behind the offer: every card the edition changes at the left, the chosen one at the right.
 *  `o` carries the catalog offered and the one held, the changes, the version and the name to head it,
 *  and the offer's own three ways out: keep, load and back to the bubble. A colleague's desk comes as `o.desk`, its
 *  title, heads, words for the two ways out and its take (editionPaneHtml); its file carries no note of its own. */
function openEditionPanel(o){
  const items=o.changes.items, c=o.c, desk=o.desk||null, sub=desk?desk.sub:null;
  let at=Math.max(0,items.findIndex(it=>it.own));
  const note=desk?"":editionNoteText(c,uiLang());
  const row=(it,i)=>'<button type="button" class="ed-row" data-ed-at="'+i+'"'+(i===at?' aria-current="true"':'')+'>'
    +editionRowInner(it,o.held,c,sub)+'</button>';
  openDialog({
    cls:"ed-modal",
    title:desk?desk.title:t("What is new in edition {V}").split("{V}").join(o.version),
    name:o.name,
    back:o.back,
    body:'<div class="ed-panel" data-i18n-skip><div class="ed-left">'
      +(note?editionNoteHtml(note,"ed-note"):'')+editionCountsHtml(o.changes.counts)
      +'<div class="ed-list">'+items.map(row).join("")+'</div></div>'
      +'<div class="ed-pane" id="edPane" aria-live="polite"></div></div>',
    actions:'<button type="button" class="btn" id="edKeep">'+esc(desk?desk.keep:t("Keep current"))+'</button>'
      +'<button type="button" class="btn primary" id="edLoad">'+esc(desk?desk.load:t("Load the update"))+'</button>',
    wire:()=>{
      const pane=document.getElementById("edPane"), list=document.querySelector(".ed-list");
      const draw=()=>{
        pane.innerHTML=editionPaneHtml(items[at],o.held,c,desk);
        pane.querySelectorAll("[data-ed-mine]").forEach(b=>{
          b.onclick=()=>{
            desk.toggle(items[at]);
            const r=list.querySelector('[data-ed-at="'+at+'"]');
            if(r) r.innerHTML=editionRowInner(items[at],o.held,c,sub);
            draw();
          };
        });
        pane.querySelectorAll("[data-ed-take]").forEach(b=>{
          b.onclick=()=>{
            takeTeamText(c,items[at].id,b.getAttribute("data-ed-take")==="1");
            const r=list.querySelector('[data-ed-at="'+at+'"]');
            if(r) r.innerHTML=editionRowInner(items[at],o.held,c);
            o.taken();
            draw();
          };
        });
      };
      list.querySelectorAll("[data-ed-at]").forEach(b=>{
        b.onclick=()=>{
          const was=list.querySelector('[aria-current="true"]');
          if(was) was.removeAttribute("aria-current");
          at=+b.getAttribute("data-ed-at"); b.setAttribute("aria-current","true");
          draw();
        };
      });
      document.getElementById("edKeep").onclick=o.keep;
      document.getElementById("edLoad").onclick=o.load;
      draw();
    }
  });
}
/* The bubble's rows follow a choice made in the panel. */
function repaintEditionRows(wrap,c,held,changes){
  changes.items.slice(0,EDITION_SHOWN).forEach(it=>{
    const li=Array.from(wrap.querySelectorAll("[data-ec-id]")).find(x=>x.getAttribute("data-ec-id")===it.id);
    if(li) li.innerHTML=editionRowInner(it,held,c);
  });
}

export {
  editionCountWords,
  editionOfferHtml,
  openEditionPanel,
  repaintEditionRows
};
