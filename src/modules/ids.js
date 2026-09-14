// The identifiers the app mints for itself.

function uid(prefix){
  return prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
}
function slugCat(name){
  const s=String(name||"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,28);
  return "uc_"+(s||"custom");
}
export {
  uid,
  slugCat,
};
