// ---- a value safe inside a CSS selector ----
function cssEsc(s){
  if(window.CSS&&typeof CSS.escape==="function") return CSS.escape(s);
  return String(s).replace(/[^a-zA-Z0-9_-]/g,ch=>"\\"+ch);
}

export {
  cssEsc
};
