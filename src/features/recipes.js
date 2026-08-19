/* Acting on the recipe as a whole: switching, adding, duplicating, renaming, deleting,
   clearing it, and filing a finished batch into its history. */
import { $, uid } from "../core/dom.js";
import { RECIPE_FIELDS, defOf } from "../core/schema.js";
import { blankRecipe, cloneItem, computeLye, currentId, libById, library, loadRecipeIntoState, save, setCurrentId, setLibrary, state, syncCurrent, touchRecipe } from "../core/state.js";
import { UNITS } from "../core/units.js";
import { todayISO } from "../core/util.js";
import { ADDITIVES, AROMAS } from "../data/ingredients.js";
import { OILS } from "../data/oils.js";
import { openConfirm, parseCSVToRows } from "./io.js";
import { LYE_KOH, LYE_NAOH, priceKeyOf } from "./planning.js";
import { rebuildRecipeSelect, rememberPick, render, setLastGoal, setScaleDirty } from "../ui/render.js";
import { pushUndo, showToast } from "../ui/toast.js";
export function switchRecipe(id){ if(id===currentId){ rebuildRecipeSelect(); return; } syncCurrent();
  var r=libById(id); if(!r) return; setCurrentId(id); touchRecipe(id); loadRecipeIntoState(r); setScaleDirty(false); save(); render(); }
export function newRecipe(){
  var name=(prompt("Name this recipe:","Recipe "+(library.length+1))||"").trim();
  if(name==="") return; syncCurrent();
  var r=blankRecipe(name); library.push(r); setCurrentId(r.id); loadRecipeIntoState(r); setScaleDirty(false); save(); render();
}
export function duplicateRecipe(){ syncCurrent(); var c=libById(currentId); if(!c) return;
  var r={ id:uid(), name:c.name+" copy" };
  RECIPE_FIELDS.forEach(function(fld){
    r[fld.k] = fld.k==="checklist" ? {}                 // the copy starts with a fresh make-checklist
             : fld.list ? c[fld.k].map(cloneItem)        // deep-copy ingredient lists
             : c[fld.k];
  });
  library.push(r); setCurrentId(r.id); loadRecipeIntoState(r); setScaleDirty(false); save(); render(); }
export function renameRecipe(){ var c=libById(currentId); if(!c) return;
  var name=(prompt("Rename recipe:",c.name)||"").trim(); if(name==="") return; c.name=name; save(); rebuildRecipeSelect(); }
export function deleteRecipe(){ var c=libById(currentId); if(!c) return;
  if(library.length<=1){ if(!confirm("This is your only recipe — clear its ingredients?")) return;
    RECIPE_FIELDS.forEach(function(fld){ c[fld.k]=defOf(fld); });   // reset every field to its default, keep id & name
    loadRecipeIntoState(c); setScaleDirty(false); save(); render(); return; }
  if(!confirm("Delete \""+c.name+"\"? This can't be undone.")) return;
  setLibrary(library.filter(function(x){return x.id!==currentId;}));
  setCurrentId(library[0].id); loadRecipeIntoState(library[0]); setScaleDirty(false); save(); render(); }

/* Persisting serialises the whole library — every recipe, batch record and cure
   check — so doing it on every pointermove or keystroke costs more the more
   you've saved. Discrete actions (add, delete, log a batch, switch recipe) still
   write immediately; only the continuous streams coalesce via saveSoon().
   Both keep syncCurrent() synchronous, so the in-memory library is always
   current and only the write to disk is deferred. */
// The safety net: a phone can background or kill the page without warning, so
// anything still queued is written the moment we stop being visible.

/* ---------- collapsible cards ---------- */
export function clearRecipe(){
  if(!(state.oils.length||state.additives.length||state.aromas.length)) return;
  pushUndo();
  state.oils=[]; state.additives=[]; state.aromas=[]; setLastGoal(null); save(); render(); showToast("Recipe cleared");
}

/* ---------- CSV ---------- */
$("csvInput").addEventListener("change",function(e){
  var f=e.target.files&&e.target.files[0]; if(!f) return;
  var r=new FileReader();
  r.onload=function(){ var rows=parseCSVToRows(String(r.result)); if(!rows.length){ alert("No rows found in that CSV."); return; }
    openConfirm(rows,"Import CSV","Check each line, then add to your recipe."); };
  r.readAsText(f); $("csvInput").value="";
});
/* key and sap ride along so a recipe survives the round trip. Without them an
   exported custom oil comes back as whichever reference oil its name reads like:
   "Coconut blend" at 0.10 returned as coconut oil at 0.178, which is 26% more
   lye than the recipe calls for, and the safety check calls it balanced. Other
   calculators ignore the extra columns, and so does an older Soap Calc. */
export function logBatch(){
  if(!Array.isArray(state.batches)) state.batches=[];
  var made=state.madeOn||todayISO();
  state.batches.push({ id:uid(), madeOn:made, lot:state.lot||"",
    cureWeeks:state.cureWeeks||4, notes:state.notes||"", checks:[] });
  if(state.batches.length>50) state.batches.shift();
  var used=drawDownStock();
  // the checklist and notes belonged to that make — start the next one clean
  state.checklist={}; state.notes="";
  save(); render();
  showToast("Batch logged — "+state.batches.length+" on record"+(used?" · inventory updated":""),true);
}
// Making a batch uses up ingredients. Only touches what you're already tracking,
// so it's a no-op unless you use Inventory. Returns whether anything changed.
export function drawDownStock(){
  var r=libById(currentId); if(!r) return false;
  var touched=false;
  function take(it,g){
    var k=priceKeyOf(it); if(state.stock[k]===undefined || !(g>0)) return;
    state.stock[k]=Math.max(0,state.stock[k]-g); touched=true;
  }
  [r.oils,r.additives,r.aromas].forEach(function(list){
    list.forEach(function(it){ take(it,it.g); });
  });
  var L=computeLye(r);
  take(LYE_NAOH, L.naohG); take(LYE_KOH, L.kohG);      // water isn't stocked
  return touched;
}
/* Zap tests and pH readings taken across a batch's cure. Kept on the batch record
   so a bar's story reads week 1 "zaps" → week 4 "pH 9, no zap".                   */

/* ---------- keep the screen on during a make ----------
   The whole premise of this app is a phone propped on the kitchen counter. Step 4 of the
   checklist, gloves on, lye in the jug, wet hands — and the screen locks. */


/* ---------- add forms ---------- */
$("addForm").addEventListener("submit",function(ev){
  ev.preventDefault();
  var sel=$("baseSelect").value, raw=parseFloat($("amtIn").value);
  if(!sel||!isFinite(raw)||raw<=0) return;
  var unit=state.unit==="pct"?"g":state.unit, grams=raw*UNITS[unit].toG;
  if(sel==="__custom__"){ var nm=$("customName").value.trim(); if(!nm){ $("customName").focus(); return; }
    state.oils.push({name:nm,key:null,g:grams}); }
  else if(sel.indexOf("oil:")===0){ var k=sel.slice(4); state.oils.push({name:OILS[k].name,key:k,g:grams}); rememberPick(sel); }
  else if(sel.indexOf("add:")===0){ var ka=sel.slice(4); state.additives.push({name:ADDITIVES[ka].name,key:ka,g:grams}); rememberPick(sel); }
  $("baseSelect").value=""; $("amtIn").value=""; $("customName").value=""; $("customName").classList.add("hide");
  $("pickPreview").textContent=""; $("pickPreview").classList.add("hide");
  setLastGoal(null); save(); render();
});
$("aromaForm").addEventListener("submit",function(ev){
  ev.preventDefault();
  var sel=$("aromaSelect").value, raw=parseFloat($("aromaAmt").value);
  if(!sel||!isFinite(raw)||raw<=0) return;
  var unit=state.unit==="pct"?"g":state.unit, grams=raw*UNITS[unit].toG;
  if(sel==="__custom__"){ var nm=$("aromaCustom").value.trim(); if(!nm){ $("aromaCustom").focus(); return; }
    state.aromas.push({name:nm,key:null,g:grams}); }
  else state.aromas.push({name:AROMAS[sel].name,key:sel,g:grams});
  $("aromaSelect").value=""; $("aromaAmt").value=""; $("aromaCustom").value=""; $("aromaCustom").classList.add("hide");
  save(); render();
});

/* ---------- action dispatcher (single menu sheet) ---------- */
/* The sheet's data-a values dispatch straight through this table. hasOwnProperty so
   a stray data-a="constructor" can't reach Object.prototype. */
