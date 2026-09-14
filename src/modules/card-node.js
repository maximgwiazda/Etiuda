/* The template is cached in the monolith: a top level document.createElement cannot live in a
   module, because the cycle gate imports the tree in bare node, where there is no document. */
function parseCardHtml(html){
  cardTpl.innerHTML=html;
  return cardTpl.content.firstElementChild;
}

/* A FRESH CARD NODE PAINTS ONCE AT ITS ESTIMATE. content-visibility lays a new node out at
   the 220px stub and resolves it a frame later; kept nodes carry a remembered size, fresh ones
   do not - so a rebuild that touches what is on screen (a typed pick clears the query, and
   with it every signature) shows one frame of uniform stubs, then the cards. Forced real here,
   in the same task as the insertion, and handed back two frames on. The glides force their
   watched cards the same way and release later; the double release is idempotent. */
let eFreshHeld=[], eFreshR=0;
function holdFresh(el){
  if(el.style.contentVisibility) return;
  el.style.contentVisibility="visible";
  eFreshHeld.push(el);
  if(eFreshR) return;
  eFreshR=requestAnimationFrame(()=>requestAnimationFrame(()=>{
    eFreshR=0;
    const held=eFreshHeld; eFreshHeld=[];
    held.forEach(x=>{ if(x.style.contentVisibility==="visible") x.style.contentVisibility=""; });
  }));
}

export {
  parseCardHtml,
  holdFresh
};
