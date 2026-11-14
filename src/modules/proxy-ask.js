import { eHost } from "./host.js";
import { t, translateTree } from "./ui-lang.js";
import { hangBubble } from "./bubble.js";
import { cutLeaves, dismissNode } from "./motion.js";
// A network proxy's question for a user name and password, asked by the shell where Windows sign-in
// could not answer it: one bubble at a time, the rest waiting by id.

/* WHAT IS TYPED GOES TO THE SHELL AND NOWHERE ELSE: never stored, logged or kept in this page, and the
   fields are emptied before the bubble leaves, since a leaving bubble stays in the document a moment. */
const proxyAskQueue=new Map();   // id -> {id, host, port, again}, in the order the shell asked
let proxyAskShown=0;

function proxyAskHost(){
  const h=eHost();
  return h && typeof h.onProxyAsk==="function" && typeof h.proxyAnswer==="function" ? h : null;
}
/* The shell sends every open question again on each page load, so an id already held changes nothing. */
function proxyAskTake(q){
  const id=q && Number.isInteger(q.id) && q.id>0 ? q.id : 0;
  if(!id || proxyAskQueue.has(id)) return;
  proxyAskQueue.set(id,{ id:id, host:String(q.host||""), port:Number.isInteger(q.port) ? q.port : 0, again:q.again===true });
  if(!proxyAskShown) proxyAskNext();
}
function proxyAskNext(){
  const q=proxyAskQueue.values().next().value;
  proxyAskShown=q ? q.id : 0;
  if(q) proxyAskOpen(q);
}
function proxyAskSend(id,username,password){
  proxyAskQueue.delete(id);
  const h=proxyAskHost();
  try{ if(h) Promise.resolve(h.proxyAnswer(id,username,password)).catch(()=>{}); }catch(e){ /* the shell has gone */ }
  proxyAskNext();
}
/* A field the person is typing in keeps the keyboard: a question arriving mid-sentence would otherwise
   take the rest of that sentence, and Enter would send it to the proxy as a user name. */
function proxyAskTyping(){
  const a=document.activeElement;
  return !!(a && (a.tagName==="INPUT" || a.tagName==="TEXTAREA" || a.tagName==="SELECT" || a.isContentEditable));
}
function proxyAskOpen(q){
  const wrap=document.createElement("div");
  wrap.className="bub bub-ask";
  wrap.id="eProxyAsk";
  wrap.setAttribute("role","dialog");
  wrap.setAttribute("aria-labelledby","eProxyTitle");
  wrap.innerHTML='<h3 id="eProxyTitle">The network proxy asks for a sign-in</h3>'
    +'<p><code class="e-proxy-at" data-i18n-skip></code></p>'
    +(q.again ? '<p>'+t("The proxy asked again, so the user name or password may need another look.")+'</p>' : '')
    +'<input class="e-proxy-inp" id="eProxyUser" type="text" autocomplete="off" spellcheck="false" placeholder="User name" aria-label="User name">'
    +'<input class="e-proxy-inp" id="eProxyPass" type="password" autocomplete="off" spellcheck="false" placeholder="Password" aria-label="Password">'
    +'<div class="tour-actions">'
    +'<button type="button" class="btn" id="eProxyNo">Not now</button>'
    +'<button type="button" class="btn primary" id="eProxyYes">Sign in</button>'
    +'</div>';
  wrap.querySelector(".e-proxy-at").textContent=q.host+(q.port ? ":"+q.port : "");
  cutLeaves();
  document.body.appendChild(wrap);
  translateTree(wrap);
  const user=wrap.querySelector("#eProxyUser"), pass=wrap.querySelector("#eProxyPass");
  /* From the sign-in in the bar where it stands, else from the Menu, whose Settings hold the account. */
  hangBubble(wrap, ()=>{
    const b=document.getElementById("signinBtn");
    return b && b.getClientRects().length ? b : document.getElementById("settingsBtn");
  }, {width:340});
  let done=false;
  const answer=(name,word)=>{
    if(done) return;
    done=true;
    user.value=""; pass.value=""; /* plant:proxy-ask-empty */
    dismissNode(wrap);
    proxyAskSend(q.id,name,word);
  };
  /* An empty user name is "Not now", and the password goes with it only when there is a name. */
  const proxySignIn=()=>{ const name=String(user.value||"").trim(); answer(name, name ? String(pass.value||"") : ""); }; /* plant:proxy-ask-name-first */
  const notNow=()=>answer("","");
  wrap.addEventListener("keydown",e=>{
    if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); notNow(); return; } /* plant:proxy-ask-escape */
    if(e.key==="Enter" && (e.target===user || e.target===pass)){ e.preventDefault(); e.stopPropagation(); proxySignIn(); }
  });
  wrap.querySelector("#eProxyYes").onclick=proxySignIn;
  wrap.querySelector("#eProxyNo").onclick=notNow;
  if(!proxyAskTyping()) try{ user.focus(); }catch(e){} /* plant:proxy-ask-keyboard */
}
function wireProxyAsk(){
  const h=proxyAskHost();
  if(!h) return;
  h.onProxyAsk(proxyAskTake);
}

export {
  wireProxyAsk,
  proxyAskTake,
};
