/* THE PAGE'S SCROLLER IS AN ELEMENT, not the window: the frame is fixed and one region under
   the header scrolls. Asked for rather than cached, because a stale node scrolls nothing.
   The fallbacks are for a document that never got the shell. */
function pageScroller(){
  return document.getElementById("pageScroll") || document.scrollingElement || document.documentElement;
}
function pageScrollY(){ const el=pageScroller(); return (el&&el.scrollTop)||0; }
/* THE PAGE KEYS: the browser answered these while the window was the scroller and cannot now,
   because the scrolling element is never the focused one. Instant, like the keys they stand
   in for. Which of them survive a caret is the callers' business, not this one's. */
function pageKeyScroll(key){
  const sc=pageScroller(), page=Math.max(120, sc.clientHeight-60);
  const dy = key==="PageDown" ?  page : key==="PageUp" ? -page
           : key==="End"      ?  sc.scrollHeight : key==="Home" ? -sc.scrollHeight : null;
  if(dy==null) return false;
  sc.scrollBy({top:dy, left:0, behavior:"auto"});
  return true;
}
/* Landing on the FIRST macro means the top of the page, not merely far enough up to see
   it: scroll-margin-top stops short - correct for every other entry, wrong for this one,
   because nothing above it is worth hiding and arriving at the beginning should look like
   the beginning. Every way of arriving there uses this. */
function scrollPageTop(){
  const el=pageScroller();
  try{ el.scrollTo({top:0, left:0, behavior:"smooth"}); }
  catch(_){ try{ el.scrollTop=0; }catch(__){} }
}

export {
  pageKeyScroll,
  pageScrollY,
  pageScroller,
  scrollPageTop
};
