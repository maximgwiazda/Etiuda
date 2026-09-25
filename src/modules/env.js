/* Engine version. Semantic: MAJOR changes the catalog contract, MINOR adds capability,
   PATCH fixes. The catalog carries its own separate version - engine and content are
   released independently, and `format` in the catalog is the compatibility contract. */
const E_VERSION="2.0.0-dev";
/* ---- self-source snapshot, taken as the app script's first statement, when the DOM IS
   the file (this script is the document's last element). fetch(location.href) is blocked
   in Chromium on file://, so serialising the DOM is the only route that works everywhere.
   document.childNodes, not documentElement.outerHTML - doctype and banner sit before <html>. */
const E_SELF=(function(){
  try{
    let out="";
    Array.prototype.forEach.call(document.childNodes,n=>{
      if(n.nodeType===8) out+="<!--"+n.data+"-->\n";                 // comment
      else if(n.nodeType===10) out+="<!DOCTYPE "+n.name+">\n";       // doctype
      else if(n.nodeType===1) out+=n.outerHTML;                      // <html>
    });
    return out;
  }catch(e){ return ""; }
})();
/** The catalog baked into this file, if it is an integrated build. Inert text until parsed. */
function eEmbeddedCatalog(){
  try{
    const el=document.getElementById("eEmbedded");
    const t=el ? (el.textContent||"").trim() : "";
    if(!t) return null;
    const c=JSON.parse(t);
    return (c && typeof c==="object" && Array.isArray(c.cards)) ? c : null;
  }catch(e){ return null; }
}

export {
  eEmbeddedCatalog,
  E_VERSION,
  E_SELF
};
