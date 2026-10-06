import { custGender, setHandGender, syncGenderGlyph } from "./gender-drum.js";
import { VAR_GENDERS } from "./variables.js";
import { scheduleTabSave } from "./tabs.js";
import { $ } from "./dom.js";
import { hooks } from "./hooks.js";

/* One notch per click, the wheel either way, Up and Down when it has focus: the role drum's
   gestures, so the name box's two dials turn alike (role-turn.js). */
function stepGender(dir){
  const d=$("#genderDrum"); if(!d) return;
  const i=VAR_GENDERS.indexOf(custGender().v), n=VAR_GENDERS.length;
  setHandGender(VAR_GENDERS[(i+dir+n)%n]);
  syncGenderGlyph();
  const tr=d.querySelector(".gd-track");
  if(tr){ tr.classList.remove("rd-up","rd-down"); void tr.offsetWidth; tr.classList.add(dir>0?"rd-up":"rd-down"); }
  hooks.render();
  scheduleTabSave();
}
function wireGenderDrum(){
  const d=$("#genderDrum"); if(!d) return;
  d.addEventListener("wheel",e=>{ e.preventDefault(); stepGender(e.deltaY>0?1:-1); },{passive:false});
  d.addEventListener("click",()=>{ stepGender(1); });
  d.addEventListener("keydown",e=>{
    if(e.key!=="ArrowDown"&&e.key!=="ArrowUp") return;
    if(e.ctrlKey||e.metaKey||e.altKey||e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();   // the trap at the role drum's own keydown
    stepGender(e.key==="ArrowDown"?1:-1);
  });
  syncGenderGlyph();
}

export {
  stepGender,
  wireGenderDrum
};
