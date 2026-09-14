/* The clear × beside a text field: always there, greyed while there is nothing to rub out.
   Binds one field to one button and hands back the sync so a caller can re-ask. */

function bindFieldClear(input, btn, onClear){
  if(!input||!btn) return;
  /* .length, not .trim(). A field holding three spaces is NOT empty - it looks full, it behaves
     full, and the one control that could empty it was greying itself out. Whether the content is
     meaningful is a separate question from whether there is any. */
  function sync(){ btn.disabled=!String(input.value||"").length; }
  btn.addEventListener("click",e=>{
    e.preventDefault(); e.stopPropagation();
    if(btn.disabled) return;
    input.value="";
    if(typeof onClear==="function") onClear();
    else input.dispatchEvent(new Event("input",{bubbles:true}));
    sync();
    try{ input.focus(); }catch(_){}
  });
  input.addEventListener("input",sync);
  sync();
  return sync;
}

export {
  bindFieldClear
};
