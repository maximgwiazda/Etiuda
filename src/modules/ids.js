// The identifiers the app mints for itself.

function uid(prefix){
  return prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
}
/* A CATALOG'S ID: random, made once where the catalog is made and kept by every edition of it, never
   read off a name. The format's rule is 3 to 64 of a-z, 0-9 and the hyphen. */
function newCatalogId(){
  const a="abcdefghijklmnopqrstuvwxyz0123456789", n=16;
  let r=null;
  try{ r=crypto.getRandomValues(new Uint8Array(n)); }catch(e){ r=null; }
  let out="c-";
  for(let i=0;i<n;i++) out+=a[(r ? r[i] : Math.floor(Math.random()*256))%a.length];
  return out;
}
function slugCat(name){
  const s=String(name||"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,28);
  return "uc_"+(s||"custom");
}
export {
  uid,
  newCatalogId,
  slugCat,
};
