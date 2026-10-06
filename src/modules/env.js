/* Engine version. Semantic: MAJOR changes the catalog contract, MINOR adds capability,
   PATCH fixes. The catalog carries its own separate version - engine and content are
   released independently, and `format` in the catalog is the compatibility contract. */
const E_VERSION="2.0.0-dev";
/* The day this build was made, YYYY-MM-DD, written over the placeholder by tools/build.mjs; the
   source itself carries none, and About leaves the line out until it is a date. */
const E_BUILT="@E_BUILT@";
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
  E_BUILT,
  E_VERSION
};
