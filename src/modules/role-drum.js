import { whoOptions } from "./pack.js";
import { t } from "./ui-lang.js";

/* CONTRACT: nothing here imports a module inside the load cycle. tabs.js and manage.js both
   call syncRoleDrum, so an edge from here into the cycle would put this file in it; the
   gestures that need one live in role-turn.js. */

/* The notches, and the ONE list both the wheel and its display read. A stored role the
   catalog no longer offers joins the wheel rather than vanishing from it: it still fills
   {ROLE}, so a drum showing the empty notch would be lying, and stepping away drops it. */
function roleOpts(){
  const opts=[""].concat(whoOptions());
  const v=roleSel.value;
  if(v && opts.indexOf(v)<0) opts.push(v);
  return opts;
}
/* The role is a DRUM - a slot wheel over whoOptions() with an empty notch that clears.
   The mouse wheel and the arrow keys turn it; the hidden roleSel stays the one value
   {ROLE} reads, so everything downstream is untouched by the control's shape. */
function syncRoleDrum(){
  const d=$("#roleDrum"); if(!d) return;
  const opts=roleOpts();
  let i=opts.indexOf(roleSel.value); if(i<0) i=0;
  const lab=v=>v===""?t("class"):v;
  const n=opts.length;
  d.querySelector(".rd-prev").textContent=lab(opts[(i-1+n)%n]);
  const c=d.querySelector(".rd-cur");
  c.textContent=lab(opts[i]);
  c.classList.toggle("rd-empty", opts[i]==="");
  d.querySelector(".rd-next").textContent=lab(opts[(i+1)%n]);
  d.setAttribute("aria-valuetext", lab(opts[i]));
}

export {
  roleOpts,
  syncRoleDrum
};
