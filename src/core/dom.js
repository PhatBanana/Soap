/* Thin DOM helpers. Nothing here knows anything about soap — they are the four or five
   shapes this app builds over and over, kept in one place so the feature modules can
   stay about their subject. */
export const $ = function(id){ return document.getElementById(id); };
export function el(tag, cls, html){ var e=document.createElement(tag); if(cls)e.className=cls; if(html!=null)e.innerHTML=html; return e; }
export function escapeHtml(s){ return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
export function uid(){ return "r"+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

/* ---------- action sheet open/close ---------- */
// Force an element visible with inline !important, which outranks any injected
// stylesheet rule (e.g. an ad-blocker / Brave Shields cosmetic filter that hides
// an overlay with display:none !important).
export function forceVisible(elm,disp){ if(!elm) return; elm.style.setProperty("display",disp,"important"); elm.style.setProperty("visibility","visible","important"); }

/* ---------- modal helpers ---------- */
export function makeModal(){
  var back=el("div","modal-back"), m=el("div","modal"); back.appendChild(m);
  forceVisible(back,"flex"); forceVisible(m,"block");
  back.addEventListener("click",function(e){ if(e.target===back) closeModal(back); });
  document.body.style.overflow="hidden"; $("modalRoot").appendChild(back);
  return { back:back, m:m };
}
export function closeModal(back){ document.body.style.overflow=""; back.remove(); }

/* The two shapes every modal in this app repeats: a Close footer, and an amount field.
   Written out four and three times respectively before this. */
export function modalFoot(md, label) {
  var foot = el("div", "mfoot"), cl = el("button", "primary", label || "Close");
  cl.addEventListener("click", function () { closeModal(md.back); });
  foot.appendChild(cl); md.m.appendChild(foot);
  return foot;
}
export function numInput() {
  var inp = document.createElement("input");
  inp.type = "number"; inp.step = "any"; inp.min = "0"; inp.inputMode = "decimal";
  return inp;
}

/* Hand the browser a file. Used by the backup, the CSV export and the rescue download
   on the storage-failure warning. */
export function downloadFile(name,text,mime){
  var blob=new Blob([text],{type:mime||"application/json"});
  var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(a.href); },2000);
}
