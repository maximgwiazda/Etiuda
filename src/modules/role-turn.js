import { roleOpts, syncRoleDrum } from "./role-drum.js";
import { scheduleTabSave } from "./tabs.js";
import { $, roleSel } from "./dom.js";
import { render } from "./render.js";

function stepRoleDrum(dir){
  const d=$("#roleDrum"); if(!d) return;
  const opts=roleOpts();
  let i=opts.indexOf(roleSel.value); if(i<0) i=0;
  roleSel.value=opts[(i+dir+opts.length)%opts.length];
  syncRoleDrum();
  const tr=d.querySelector(".rd-track");
  tr.classList.remove("rd-up","rd-down"); void tr.offsetWidth;
  tr.classList.add(dir>0?"rd-up":"rd-down");
  render();
  scheduleTabSave();
}
function wireRoleDrum(){
  const d=$("#roleDrum"); if(!d) return;
  d.addEventListener("wheel",e=>{ e.preventDefault(); stepRoleDrum(e.deltaY>0?1:-1); },{passive:false});
  /* A CLICK IS THE ONLY ROUTE A FINGER HAS - no wheel, no arrow keys - so it advances a
     notch, and the wheel cycles, which means every value stays reachable from a tap. */
  d.addEventListener("click",()=>{ stepRoleDrum(1); });
  d.addEventListener("keydown",e=>{
    if(e.key!=="ArrowDown"&&e.key!=="ArrowUp") return;
    if(e.ctrlKey||e.metaKey||e.altKey||e.shiftKey) return;   // those belong to the card list
    e.preventDefault();
    /* STOP HERE. The window dispatcher skips real fields via typingInField(), and a div is
       not one - unstopped, one arrow turned the drum AND walked the cards behind it. */
    e.stopPropagation();
    stepRoleDrum(e.key==="ArrowDown"?1:-1);
  });
  syncRoleDrum();
}

export {
  wireRoleDrum
};
