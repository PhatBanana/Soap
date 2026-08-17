/* The worked example recipes, and loading one into the library.

   render.js imports openExamples() for the empty-state button, and this module imports
   render() back. That cycle was expected when the layer was designed and is safe for the
   same reason the rest are: the call happens when someone taps the button, never while a
   module is still evaluating. */
import { EXAMPLES } from "../data/guides.js";
import { OILS } from "../data/oils.js";
import { ADDITIVES, AROMAS } from "../data/ingredients.js";
import { clamp } from "../core/units.js";
import { el, escapeHtml, makeModal, closeModal } from "../core/dom.js";
import { library, currentId, setCurrentId, libById, blankRecipe, loadRecipeIntoState,
         syncCurrent, save } from "../core/state.js";
import { render, setScaleDirty, setLastGoal } from "../ui/render.js";

function mapItems(obj,db){
  if(!obj) return [];
  return Object.keys(obj).map(function(k){ return {name:db[k]?db[k].name:k, key:db[k]?k:null, g:obj[k]}; });
}
function exUse(ex){
  if(ex.cat==="Dish") return "dish";
  if(ex.cat==="Laundry") return "laundry";
  var n=(ex.name||"").toLowerCase();
  if(n.indexOf("shampoo")>=0) return "hair";
  if(n.indexOf("shav")>=0) return "shave";
  if(n.indexOf("facial")>=0||n.indexOf("face")>=0) return "face";
  return "body";
}
function loadExample(ex){
  syncCurrent();
  var cur=libById(currentId), target;
  if(cur && cur.oils.length===0 && cur.additives.length===0 && cur.aromas.length===0){
    target=cur; target.name=ex.name;               // reuse an empty recipe
  } else {
    target=blankRecipe(ex.name); library.push(target); setCurrentId(target.id);
  }
  target.oils=mapItems(ex.oils,OILS);
  target.additives=mapItems(ex.additives,ADDITIVES);
  target.aromas=mapItems(ex.aromas,AROMAS);
  target.lyeType = (ex.lye==="koh"||ex.lye==="dual") ? ex.lye : "naoh";
  target.dualKoh = clamp(ex.dualKoh,30,5,95);
  target.superfat = clamp(ex.sf,5,0,15);
  target.waterPct = clamp(ex.water,38,25,50);
  target.kohPurity = clamp(ex.koh,90,85,100);
  target.use = exUse(ex);
  loadRecipeIntoState(target); setScaleDirty(false); setLastGoal(null); save(); render();
}
export function openExamples(){
  var md=makeModal();
  md.m.appendChild(el("h3",null,"Example recipes"));
  md.m.appendChild(el("p","sub","Tap one to add it as a new saved recipe you can tweak."));
  var out=el("div"); md.m.appendChild(out);
  var groups=[["Bar","Bar soaps"],["Liquid","Liquid soaps"],["Dual lye","Shaving &amp; cream soaps"],
              ["Dish","Dish soap"],["Laundry","Laundry soap"]];
  // anything with a category the list doesn't know about still gets shown —
  // a new example should never silently vanish because a label was forgotten
  var known={}; groups.forEach(function(gp){ known[gp[0]]=1; });
  (EXAMPLES||[]).forEach(function(e){
    if(e.cat && !known[e.cat]){ known[e.cat]=1; groups.push([e.cat,e.cat]); }
  });
  groups.forEach(function(gp){
    var items=(EXAMPLES||[]).filter(function(e){ return e.cat===gp[0]; });
    if(!items.length) return;
    out.appendChild(el("div","subhead",gp[1]));
    items.forEach(function(ex){
      var b=el("button","ex-item"); b.type="button";
      b.innerHTML="<b>"+escapeHtml(ex.name)+"</b><span>"+escapeHtml(ex.note||"")+"</span>";
      b.addEventListener("click",function(){ closeModal(md.back); loadExample(ex); });
      out.appendChild(b);
    });
  });
  var foot=el("div","mfoot"); var c=el("button","ghost","Cancel");
  c.addEventListener("click",function(){ closeModal(md.back); }); foot.appendChild(c); md.m.appendChild(foot);
}
