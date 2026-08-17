/* Soap Calc — application entry point.

   An ES module, so this file is already its own scope: no IIFE, and strict mode is
   implicit. Reference data lives in src/data/, split by what it is. */
import { OILS, OIL_INCI } from "./data/oils.js";
import { ADDITIVES, ADDITIVE_INCI, COLORANTS, AROMAS } from "./data/ingredients.js";
import { BLEND_TIPS, FIRST_AID, TROUBLESHOOTING, EXAMPLES } from "./data/guides.js";
import { UNITS, UORDER, CONV, IMPORT_UNITS, fromG, fmt, sumG, clamp } from "./core/units.js";
import {
  QUALITIES, IOD_RANGE, INS_RANGE, KOH_FACTOR, SALT_MAX_PER100, LAURIC_OILS,
  oilsGof, brineOf, lyeConcOf, qualitiesOf, qFn, useSapOverrides
} from "./core/chem.js";
import * as Chem from "./core/chem.js";
import { $, el, escapeHtml, uid, forceVisible, makeModal, closeModal, modalFoot, numInput, downloadFile, setActive } from "./core/dom.js";
import { STORE_KEY, APP_VERSION, BUILD_DATE, USES, defOf, RECIPE_FIELDS, VIEW_FIELDS, coerceField } from "./core/schema.js";
import {
  state, library, currentId, setLibrary, setCurrentId,
  sharedImportName, sharedOvUsed, libById, blankRecipe, stateFromRecipe, loadRecipeIntoState,
  syncCurrent, sortedLibrary, touchRecipe, curRV, sanitizeRecipe, cleanList, cloneItem,
  weightUnit, scaleUnit, oilInfo, cleansingCap, totalOilsG,
  blendFA, computeLye, currentBatchG, curedBatchG,
  save, saveSoon, load, cancelWrite, flushSave
} from "./core/state.js";
import { todayISO, b64urlEnc, b64urlDec } from "./core/util.js";
import { applyMold, applyWeightScale, barCount, barG, detectAI, nudge, rebuildRecipeSelect, refreshDerived, render, renderMake, roundAmounts, runAIExplain, setLastGoal, setScaleDirty, syncWakeLock, unitsEl, updateCureSuggest, updateDilutePanel, updateMoldHint, updateQuality, updateReady, updateScaleCard, updateScaleHint, wakeSentinel } from "./ui/render.js";
import { doUndo, pushUndo, showToast } from "./ui/toast.js";
import { openExamples } from "./features/examples.js";




/* ---------- small helpers ---------- */
// the scale target has its own unit so you can ask for "10 lb" without switching the whole app
// mark the button whose data-<attr> equals val as ".active" within a segmented control
// cleansing tolerance depends on how gentle the intended use must be

/* ---------- build static controls ---------- */

(function(){
  var h=""; UORDER.forEach(function(u){ h+='<option value="'+u+'">'+UNITS[u].label+'</option>'; });
  unitsEl.innerHTML=h;
})();
unitsEl.addEventListener("change",function(){
  var u=unitsEl.value; state.unit=u; if(u!=="pct") state.lastWeightUnit=u;
  setScaleDirty(false); save(); render();
});
bindSeg("tabs","tab","tab");

// base picker: oils (optgroup) + additives (optgroup) + custom
(function(){
  var oilKeys=Object.keys(OILS).sort(function(a,b){return OILS[a].name.localeCompare(OILS[b].name);});
  var addKeys=Object.keys(ADDITIVES).sort(function(a,b){return ADDITIVES[a].name.localeCompare(ADDITIVES[b].name);});
  // colorants get their own group — half the additive list is colour, and mixing
  // them in alphabetically buries goat milk between madder and mica
  var plainKeys=addKeys.filter(function(k){ return !ADDITIVES[k].colorant; });
  var colorKeys=addKeys.filter(function(k){ return ADDITIVES[k].colorant; });
  function opts(keys){ return keys.map(function(k){
    return '<option value="add:'+k+'">'+ADDITIVES[k].name+'</option>'; }).join(""); }
  var h='<option value="" disabled selected>Choose an oil or additive…</option>';
  h+='<optgroup label="Oils, butters &amp; fats">';
  oilKeys.forEach(function(k){ h+='<option value="oil:'+k+'">'+OILS[k].name+'</option>'; });
  h+='</optgroup><optgroup label="Additives (milk, honey, clay…)">'+opts(plainKeys);
  h+='</optgroup><optgroup label="Colorants (see 🎨 in the menu)">'+opts(colorKeys);
  h+='</optgroup><option value="__custom__">+ Custom oil (no data)…</option>';
  $("baseSelect").innerHTML=h;
})();
$("baseSelect").addEventListener("change",function(){
  var v=$("baseSelect").value;
  $("customName").classList.toggle("hide", v!=="__custom__");
  var pv=$("pickPreview"), txt="";
  if(v.indexOf("oil:")===0){ var o=OILS[v.slice(4)]; if(o) txt=o.desc||o.note||""; }
  else if(v.indexOf("add:")===0){ var a=ADDITIVES[v.slice(4)]; if(a) txt=a.note||""; }
  pv.textContent=txt; pv.classList.toggle("hide",!txt);
});

// aroma picker
(function(){
  var keys=Object.keys(AROMAS).sort(function(a,b){return AROMAS[a].name.localeCompare(AROMAS[b].name);});
  var h='<option value="" disabled selected>Choose a scent…</option>';
  keys.forEach(function(k){ h+='<option value="'+k+'">'+AROMAS[k].name+'</option>'; });
  h+='<option value="__custom__">+ Custom scent…</option>';
  $("aromaSelect").innerHTML=h;
})();
$("aromaSelect").addEventListener("change",function(){
  $("aromaCustom").classList.toggle("hide", $("aromaSelect").value!=="__custom__");
});

bindSeg("saltModeSeg","sm","saltMode");
bindSeg("lyeType","t","lyeType");
bindRange($("sf"),"sfVal","superfat");
bindRange($("water"),"waterVal","waterPct");
bindRange($("lyeConc"),"concVal","lyeConc");
bindRange($("purity"),"purVal","kohPurity");
bindSeg("waterMode","w","waterMode");
$("recalcBtn").addEventListener("click",function(){ save(); render(); showToast("Recalculated ✓",true); });
$("aiExplain").addEventListener("click",runAIExplain);
/* Every segmented control in the app is the same three lines: click a child, store its
   data attribute in state, save, redraw. Seven of them were written out in full. */
function bindSeg(id,attr,key,redraw){
  Array.prototype.forEach.call($(id).children,function(b){
    b.addEventListener("click",function(){ state[key]=b.dataset[attr]; save(); (redraw||render)(); });
  });
}
function bindRange(input,labelId,key){
  input.addEventListener("input",function(){ state[key]=parseFloat(input.value); $(labelId).textContent=input.value; refreshDerived(); saveSoon(); });
}
Array.prototype.forEach.call($("shape").children,function(b){
  b.addEventListener("click",function(){ nudge(b.dataset.goal); });
});

// scale controls
Array.prototype.forEach.call($("scaleMode").children,function(b){
  b.addEventListener("click",function(){ state.scaleMode=b.dataset.m; setScaleDirty(false); save(); updateScaleCard(); });
});
$("scaleTarget").addEventListener("input",function(){ setScaleDirty(true); updateScaleHint(); });
$("scaleTarget").addEventListener("focus",function(){ setScaleDirty(true); });
$("scaleUnit").addEventListener("change",function(){ state.scaleUnit=$("scaleUnit").value; save(); updateScaleCard(); });
$("scaleApply").addEventListener("click",applyWeightScale);
["mL","mW","mH","mD","mRH","mCount","mCavVol"].forEach(function(id){ $(id).addEventListener("input",updateMoldHint); });
$("mUnit").addEventListener("change",updateMoldHint);
bindSeg("moldShape","ms","moldShape",updateScaleCard);
$("moldApply").addEventListener("click",applyMold);

// recipe selector + single action menu (sheet)
rebuildRecipeSelect();
$("recipeSelect").addEventListener("change",function(){ switchRecipe($("recipeSelect").value); });
$("recipeNew").addEventListener("click",newRecipe);
$("menuBtn").addEventListener("click",openSheet);
$("sheetClose").addEventListener("click",closeSheet);
$("sheetBack").addEventListener("click",function(e){ if(e.target===$("sheetBack")) closeSheet(); });
Array.prototype.forEach.call($("sheet").querySelectorAll("[data-a]"),function(b){
  b.addEventListener("click",function(){ closeSheet(); doAction(b.dataset.a); });
});
$("restoreInput").addEventListener("change",function(e){ var f=e.target.files&&e.target.files[0]; if(f) restoreFrom(f); $("restoreInput").value=""; });

// bar weight, scent helper, make-tab controls
// the box shows the current weight unit, so convert before validating (10 g floor, not "10 oz")
$("barW").addEventListener("input",function(){
  var v=parseFloat($("barW").value), g=isFinite(v)?v*UNITS[weightUnit()].toG:NaN;
  state.barWeight=(isFinite(g)&&g>=10)?g:110;
  saveSoon(); updateScaleCard();
});
$("scentSuggest").addEventListener("click",suggestScents);
$("clearOils").addEventListener("click",clearRecipe);
$("useSelect").addEventListener("change",function(){ state.use=$("useSelect").value; save(); render(); });
bindSeg("methodSeg","mt","method");
bindSeg("sfModeSeg","sf","sfMode");
$("sfOilSelect").addEventListener("change",function(){ state.sfOil=$("sfOilSelect").value; save(); render(); });
bindRange($("waterRatio"),"ratioVal","waterRatio");
bindRange($("dualKoh"),"dualKohVal","dualKoh");
$("roundBtn").addEventListener("click",roundAmounts);
$("lotField").addEventListener("input",function(){ state.lot=$("lotField").value; saveSoon(); });
$("lotGen").addEventListener("click",function(){
  var d=state.madeOn||todayISO();
  state.lot=d.replace(/-/g,"")+"-A"; $("lotField").value=state.lot; save();
});
$("dilution").addEventListener("input",function(){
  state.dilution=parseFloat($("dilution").value)||1; $("dilVal").textContent=fmt(state.dilution,2);
  updateDilutePanel(); saveSoon();
});
$("notesField").addEventListener("input",function(){ state.notes=$("notesField").value; saveSoon(); });
$("logBatch").addEventListener("click",logBatch);
$("madeOn").addEventListener("change",function(){ state.madeOn=$("madeOn").value; save(); updateReady(); });
$("cureWeeks").addEventListener("input",function(){ state.cureWeeks=parseInt($("cureWeeks").value,10)||4; $("cureWeeksVal").textContent=state.cureWeeks; saveSoon(); updateCureSuggest(); updateReady(); });
$("resetChecklist").addEventListener("click",function(){ if(confirm("Uncheck all steps?")){ state.checklist={}; save(); renderMake(); } });

/* ================= RENDER ================= */
/* Which panel each tab shows. One table rather than three hidden= lines plus an
   if/else chain that had to agree with them. */


/* ---------- quick-add chips for the ingredients you actually use ---------- */
/* ---------- theme: follow the device, or force light / dark ---------- */
var THEMES=[["auto","🌗","Theme: auto"],["light","☀️","Theme: light"],["dark","🌙","Theme: dark"]];
function applyTheme(){
  var t=state.theme||"auto", row=null;
  THEMES.forEach(function(x){ if(x[0]===t) row=x; });
  if(t==="auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme",t);
  if($("themeIcon")) $("themeIcon").textContent=row[1];
  if($("themeLabel")) $("themeLabel").textContent=row[2];
  // keep the browser chrome in step with the palette actually showing
  var dark = t==="dark" || (t==="auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme:dark)").matches);
  var meta=document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute("content", dark?"#211b16":"#fbf1e3");
}
function cycleTheme(){
  var i=0; THEMES.forEach(function(x,n){ if(x[0]===(state.theme||"auto")) i=n; });
  state.theme=THEMES[(i+1)%THEMES.length][0];
applyTheme(); save();
  showToast(THEMES[(i+1)%THEMES.length][2],true);
}

function rememberPick(sel){
  if(!Array.isArray(state.recent)) state.recent=[];
  state.recent=[sel].concat(state.recent.filter(function(x){ return x!==sel; })).slice(0,8);
}






function statsFor(r){
  var B=blendFA(r), L=computeLye(r), tot=oilsGof(r);
  var scentG=sumG(r.aromas);
  return { oilsG:tot, batchG:currentBatchG(r), lyeG:L.lyeG, waterG:L.waterG, kind:L.kind,
    sf:r.superfat, waterPct:r.waterPct, q:qualitiesOf(B.fa), iod:B.iod, ins:B.ins,
    oilPcts:r.oils.map(function(it){ return {name:it.name,key:it.key,pct:tot>0?it.g/tot*100:0}; }),
    scentPct: tot>0?scentG/tot*100:0 };
}






/* ---------- deterministic safety check (all on-device, works on every phone) ---------- */





/* Set each scent to a proper amount: known scents to their typical usage rate,
   custom scents to an even share of a 3% total — so the bar isn't over/under-scented. */
function suggestScents(){
  var oil=totalOilsG();
  if(oil<=0){ alert("Add oils in the Base tab first so scent amounts can be sized."); return; }
  if(state.aromas.length===0) return;
  // Target ~3% of oils TOTAL, split between scents by their typical rate, and never
  // let any single scent exceed its own typical max — so the bar isn't over/under-scented.
  var target=oil*0.03;
  var weights=state.aromas.map(function(a){ var d=a.key?AROMAS[a.key]:null; return d?d.rate[1]:3; });
  var sw=weights.reduce(function(s,w){return s+w;},0)||1;
  state.aromas.forEach(function(a,i){
    var d=a.key?AROMAS[a.key]:null;
    var g=target*(weights[i]/sw);
    if(d){ var maxG=oil*d.rate[2]/100; if(g>maxG) g=maxG; }
    a.g=g;
  });
  save(); render();
}

/* ---------- make tab: checklist + cure date ---------- */
function logBatch(){
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
function drawDownStock(){
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
var ACTIONS={
  new:newRecipe,
  dup:duplicateRecipe,
  rename:renameRecipe,
  delete:deleteRecipe,
  library:openLibrary,
  compare:openCompare,
  costs:openCosts,
  stock:openStock,
  sap:openSAP,
  shopping:openShopping,
  theme:cycleTheme,
  card:openCard,
  label:openLabel,
  wrapper:openWrapper,
  share:openShare,
  trouble:openTrouble,
  firstaid:openFirstAid,
  rebatch:openRebatch,
  colors:openColors,
  examples:openExamples,
  scan:function(){ $("photoInput").click(); },
  import:function(){ $("csvInput").click(); },
  paste:openPaste,
  export:exportCSV,
  backup:backupAll,
  restore:function(){ $("restoreInput").click(); },
  clear:clearRecipe,
  install:doInstall
};
function doAction(a){ if(ACTIONS.hasOwnProperty(a)) ACTIONS[a](); }
function clearRecipe(){
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
function exportCSV(){
  var lines=[csvRow(["section","name","amount","unit","key","sap"])];
  state.oils.forEach(function(it){ lines.push(csvRow(["oil",it.name,fmt(it.g,3),"g",it.key||"",fmt(Chem.sapOf(it),4)])); });
  state.additives.forEach(function(it){ lines.push(csvRow(["additive",it.name,fmt(it.g,3),"g",it.key||"",""])); });
  state.aromas.forEach(function(it){ lines.push(csvRow(["scent",it.name,fmt(it.g,3),"g",it.key||"",""])); });
  downloadFile("soap-recipe.csv",lines.join("\n"),"text/csv");
}
function csvRow(vals){ return vals.map(function(v){ v=String(v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }).join(","); }
function parseCSV(text){
  var rows=[],row=[],cur="",q=false,i,c;
  for(i=0;i<text.length;i++){ c=text[i];
    if(q){ if(c=='"'){ if(text[i+1]=='"'){cur+='"';i++;} else q=false; } else cur+=c; }
    else { if(c=='"')q=true; else if(c==','){row.push(cur);cur="";} else if(c=='\n'||c=='\r'){ if(c=='\r'&&text[i+1]=='\n')i++; row.push(cur);cur=""; rows.push(row);row=[]; } else cur+=c; }
  }
  if(cur.length||row.length){ row.push(cur); rows.push(row); }
  return rows.filter(function(r){ return r.some(function(x){return x.trim()!==""; }); });
}
function parseCSVToRows(text){
  var raw=parseCSV(text); if(!raw.length) return [];
  var head=raw[0].map(function(h){return h.trim().toLowerCase();});
  var looksHeader = head.some(function(h){ return /name|oil|ingredient|amount|qty|weight|unit|section|type/.test(h); });
  var col={ section:find(head,["section","type","category"]), name:find(head,["name","oil","ingredient","item"]),
            amount:find(head,["amount","qty","quantity","weight","grams","g"]), unit:find(head,["unit","units","uom"]),
            key:find(head,["key","id"]), sap:find(head,["sap","sap naoh","saponification"]) };
  var body = looksHeader ? raw.slice(1) : raw;
  var out=[];
  body.forEach(function(r){
    var name, amount;
    if(looksHeader){ name = col.name>=0 ? r[col.name] : r[1]; amount = col.amount>=0 ? r[col.amount] : ""; }
    else { name = r[0]; amount = r[1]; }   // no header: fall back to positional name, amount
    var unit = col.unit>=0 ? r[col.unit] : "";
    var section = col.section>=0 ? r[col.section] : "";
    // null means "the file has no key column at all", empty string means "this row
    // was exported without a key" — a custom oil. The two are not the same, and
    // only the second one may stop the name matcher from having a guess.
    var key = col.key>=0 ? String(r[col.key]||"").trim() : null;
    var sap = col.sap>=0 ? r[col.sap] : "";
    if(!name || !String(name).trim()) return;
    out.push(normalizeRow(String(name).trim(), amount, unit, section, key, sap));
  });
  return out;
  function find(arr,names){ for(var n=0;n<names.length;n++){ var idx=arr.indexOf(names[n]); if(idx>=0) return idx; } return -1; }
}
function normalizeRow(name, amountRaw, unitRaw, sectionRaw, keyRaw, sapRaw){
  var amount=parseFloat(String(amountRaw).replace(/[^\d.]/g,"")); if(!isFinite(amount)) amount=0;
  var unit=(String(unitRaw||"").trim().toLowerCase().replace(/s$/,"")) ; if(!CONV[unit]) unit="g";
  var section=String(sectionRaw||"").trim().toLowerCase();
  if(!/oil|base|additive|scent|fragrance|aroma|essential/.test(section)) section=guessSection(name);
  else if(/additive/.test(section)) section="additive";
  else if(/scent|fragrance|aroma|essential/.test(section)) section="scent";
  else section="oil";
  // Only a NaOH-ratio SAP (grams of lye per gram of oil) means anything here.
  // A blank, a stray word, or the mg-KOH-per-gram figure other calculators print
  // is dropped rather than guessed at — the row then imports the way it always did.
  var sap=parseFloat(String(sapRaw==null?"":sapRaw).replace(/[^\d.]/g,""));
  if(!(sap>0 && sap<1)) sap=0;
  return { name:name, amount:amount, unit:unit, section:section,
           key:(keyRaw==null?null:String(keyRaw).trim()), sap:sap };
}
// Compare across all three databases rather than taking the first hit —
// otherwise "Coconut Oil" is claimed by the additive "Coconut milk".
function guessSection(name){
  var o=bestIn(OILS,name).score, d=bestIn(ADDITIVES,name).score, s=bestIn(AROMAS,name).score;
  if(s>o && s>=d) return "scent";
  if(d>o) return "additive";
  return "oil";                                 // ties go to oil, the common case
}
/* Other calculators name oils their own way — "Coconut Oil, 76 deg",
   "Palm Kernel Flakes", "Lard, Pig Tallow (Manteca)". Score each database
   entry by how many of its distinctive words the input covers, so the most
   specific entry wins instead of whichever happens to come first. */
function cleanName(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim(); }
// words that say nothing about *which* ingredient this is
var NAME_STOP={oil:1,oils:1,fat:1,fats:1,butter:0,pure:1,refined:1,unrefined:1,organic:1,
               virgin:1,extra:1,deg:1,degree:1,degrees:1,"76":1,"92":1,eo:1,fo:1,essential:1,fragrance:0};
function nameWords(s){ return cleanName(s).split(" ").filter(function(w){ return w && !NAME_STOP[w]; }); }
function bestIn(db,name){
  var n=cleanName(name); if(!n) return {key:null,score:0};
  var a=nameWords(n), best=null, bestScore=0;
  for(var k in db){
    var dn=cleanName(db[k].name);
    if(dn===n) return {key:k,score:99};        // exact wins outright
    var b=nameWords(dn); if(!a.length||!b.length) continue;
    var hit=0; b.forEach(function(w){ if(a.indexOf(w)>=0) hit++; });
    if(!hit) continue;
    // reward covered words, mildly penalise the ones we missed, so
    // "palm kernel" beats "palm" without "salt" losing to "salt (table/sea)"
    var score=hit*3-(b.length-hit);
    if(score>bestScore){ bestScore=score; best=k; }
  }
  return bestScore>=1 ? {key:best,score:bestScore} : {key:null,score:0};
}
function matchKey(db,name){ return bestIn(db,name).key; }

/* ---------- paste a recipe from another calculator ----------
   SoapCalc, Bramble Berry, SoapmakingFriend and the rest all print a table of
   oils with some mix of %, pounds, ounces and grams columns, plus a few
   settings lines. There's no single file format to parse, so this reads the
   text people actually copy out of them, and everything lands in the same
   review screen as CSV and OCR before it touches the recipe.               */
var LYE_WORDS=/^(sodium hydroxide|naoh|lye|potassium hydroxide|koh)\b/i;
var SKIP_WORDS=/^(water|distilled water|liquid|total|totals|ice|milk\s*\/\s*water)\b/i;
var UNIT_RE=/(grams?|g|ounces?|oz|pounds?|lbs?|lb|kg)\b/i;

// Which of a row's numbers is the amount? A header line tells us outright.
function pasteColumns(line){
  var l=" "+line.toLowerCase()+" ", cols=[];
  var pats=[[/\bpercent\b|%/,"pct"],[/\bpounds?\b|\blbs?\b/,"lb"],
            [/\bounces?\b|\boz\b/,"oz"],[/\bgrams?\b|\bg\b/,"g"]];
  pats.forEach(function(p){ var m=l.search(p[0]); if(m>=0) cols.push({at:m,unit:p[1]}); });
  if(cols.length<2) return null;                 // one column word is just prose
  cols.sort(function(x,y){ return x.at-y.at; });
  return cols.map(function(x){ return x.unit; });
}

/* Where do the columns start? Not simply at the first digit — "Coconut Oil,
   76 deg" has one in its name. The amounts are the run of numbers at the end
   of the line, so find the earliest point after which nothing but numbers,
   units and separators remain. */
function numericTailStart(line){
  var re=/-?\d+(?:[.,]\d+)?%?/g, m;
  while((m=re.exec(line))!==null){
    var rest=line.slice(m.index)
      .replace(/-?\d+(?:[.,]\d+)?%?/g," ")
      .replace(UNIT_RE_G," ")
      .replace(/[\s.,:%\/|-]+/g," ").trim();
    if(rest==="") return m.index;
  }
  return -1;
}
var UNIT_RE_G=/(grams?|g|ounces?|oz|pounds?|lbs?|lb|kg)\b/gi;

function parsePasted(text){
  var lines=String(text).split(/\r?\n/), rows=[], settings={}, cols=null, sawPct=false;
  lines.forEach(function(raw){
    var line=raw.replace(/[|\t]+/g," ").replace(/\s+/g," ").trim();
    if(line.length<2) return;

    // settings first — these lines also carry numbers, so they must not
    // fall through and be read as ingredients
    var m;
    if((m=line.match(/(?:super\s*fat|superfat|lye\s*discount)\D{0,12}(\d+(?:\.\d+)?)/i))){
      settings.superfat=parseFloat(m[1]); return; }
    if((m=line.match(/water\s*(?:as\s*)?(?:a\s*)?%?\s*(?:of)?\s*oils?\D{0,12}(\d+(?:\.\d+)?)/i))){
      settings.waterPct=parseFloat(m[1]); settings.waterMode="oils"; return; }
    if((m=line.match(/lye\s*concentration\D{0,12}(\d+(?:\.\d+)?)/i))){
      settings.lyeConc=parseFloat(m[1]); settings.waterMode="conc"; return; }
    if((m=line.match(/water\s*[:\/]\s*lye\s*ratio\D{0,12}(\d+(?:\.\d+)?)/i))){
      settings.waterRatio=parseFloat(m[1]); settings.waterMode="ratio"; return; }

    if(LYE_WORDS.test(line)){ settings.lyeType=/koh|potassium/i.test(line)?"koh":"naoh"; return; }
    if(SKIP_WORDS.test(line)) return;            // water and totals are computed here

    var head=pasteColumns(line);
    if(head && !/\d/.test(line.replace(/\b(76|92)\b/g,""))){ cols=head; return; }  // header row

    // an ingredient row: a name followed by its numbers
    var cut=numericTailStart(line); if(cut<0) return;
    var name=line.slice(0,cut).replace(/[-–—:.,]+$/,"").trim();
    var nums=line.slice(cut).match(/-?\d+(?:[.,]\d+)?%?/g); if(!nums) return;
    if(name.length<2) return;
    if(LYE_WORDS.test(name)||SKIP_WORDS.test(name)) return;

    var vals=nums.map(function(s){ return { pct:/%$/.test(s), n:parseFloat(s.replace("%","").replace(",",".")) }; })
                 .filter(function(v){ return isFinite(v.n); });
    if(!vals.length) return;

    var amount, unit;
    var explicit=line.match(UNIT_RE);
    if(cols && vals.length>=cols.length){
      // header order wins; prefer the most precise column we were given
      var want=["g","oz","lb","pct"], pick=-1, pickUnit="g";
      want.forEach(function(u){ if(pick<0){ var i=cols.indexOf(u); if(i>=0){ pick=i; pickUnit=u; } } });
      amount=vals[pick].n; unit=pickUnit;
    } else if(vals.length===1){
      amount=vals[0].n; unit=vals[0].pct ? "pct" : (explicit?normUnit(explicit[1]):"g");
    } else {
      // no header: a trailing percent is a percent, otherwise take the last
      // number (calculators print coarse-to-fine, so grams come last)
      var last=vals[vals.length-1];
      amount=last.n; unit=last.pct ? "pct" : (explicit?normUnit(explicit[1]):"g");
    }
    if(!(amount>0)) return;
    if(unit==="pct") sawPct=true;
    rows.push({ name:name, amount:amount, unit:unit, section:guessSection(name) });
  });
  return { rows:rows, settings:settings, percent:sawPct };
}

// Percentages need a batch size before they can become weights.
function resolvePercentRows(rows,totalG){
  var pct=rows.filter(function(r){ return r.unit==="pct" && r.section==="oil"; });
  var sum=pct.reduce(function(a,r){ return a+r.amount; },0);
  return rows.map(function(r){
    if(r.unit!=="pct") return r;
    // scents are quoted as a % of oils; oils as a % of the oil total
    var base = r.section==="oil" ? (sum>0?totalG/sum*r.amount:0) : totalG*r.amount/100;
    return { name:r.name, amount:Math.round(base*100)/100, unit:"g", section:r.section };
  });
}

function openPaste(){
  var md=makeModal();
  md.m.appendChild(el("h3",null,"Paste a recipe"));
  md.m.appendChild(el("p","sub","Copy a recipe out of SoapCalc, Bramble Berry, SoapmakingFriend or a note and paste it here. Nothing is added until you've checked it."));
  var ta=document.createElement("textarea"); ta.className="notes-field paste-in"; ta.rows=9;
  ta.placeholder="Olive Oil            40      362.87\nCoconut Oil, 76 deg  30      272.16\nPalm Oil             25      226.80\nCastor Oil            5       45.36\nSuper Fat 5%";
  md.m.appendChild(ta);
  var totWrap=el("div","scale-row"); totWrap.hidden=true;
  var totIn=numInput(); totIn.id="pasteTotal"; totIn.value="1000";
  totWrap.appendChild(totIn); totWrap.appendChild(el("span","u","g"));
  var totLabel=el("div","subhead","Total oils (the paste is in percentages)"); totLabel.hidden=true;
  md.m.appendChild(totLabel); md.m.appendChild(totWrap);
  var status=el("div","ocr-status","");
  md.m.appendChild(status);

  var parsed=null;
  function preview(){
    parsed=parsePasted(ta.value);
    var n=parsed.rows.length, keys=Object.keys(parsed.settings);
    totLabel.hidden=totWrap.hidden=!parsed.percent;
    status.textContent = !ta.value.trim() ? ""
      : n ? ("Found "+n+" ingredient"+(n===1?"":"s")+(keys.length?" and "+keys.length+" setting"+(keys.length===1?"":"s"):"")+".")
          : "Nothing recognised yet — each line needs a name and a number.";
  }
  ta.addEventListener("input",preview);

  var foot=el("div","mfoot");
  var cancel=el("button","ghost","Cancel");
  cancel.addEventListener("click",function(){ closeModal(md.back); });
  var go=el("button","primary","Read it");
  go.addEventListener("click",function(){
    if(!parsed) preview();
    if(!parsed || !parsed.rows.length){ status.textContent="Nothing recognised — each line needs a name and a number."; return; }
    var rows=parsed.rows;
    if(parsed.percent){
      var t=parseFloat(totIn.value);
      if(!(t>0)){ status.textContent="Enter how much total oil you want to make."; return; }
      rows=resolvePercentRows(rows,t);
    }
    var s=parsed.settings;
    closeModal(md.back);
    var applied=applyPastedSettings(s);
    openConfirm(rows,"Check the import",
      "From your pasted recipe. Fix anything that came through wrong, then add it."+
      (applied?" Also applied: "+applied+".":""));
  });
  foot.appendChild(cancel); foot.appendChild(go); md.m.appendChild(foot);
  ta.focus();
}

// Settings ride along with the ingredients; each is clamped by the same
// coercion the recipe schema uses, so a nonsense value can't get in.
// Run a value through the recipe schema's own coercion, so a pasted setting
// can never land outside the range the rest of the app enforces.
function applyPastedSettings(s){
  var done=[];
  if(isFinite(s.superfat)){ state.superfat=coerceField("superfat",s.superfat); done.push("superfat "+state.superfat+"%"); }
  if(s.lyeType){ state.lyeType=coerceField("lyeType",s.lyeType); done.push(state.lyeType==="koh"?"KOH":"NaOH"); }
  if(isFinite(s.waterPct)){ state.waterPct=coerceField("waterPct",s.waterPct); done.push("water "+state.waterPct+"% of oils"); }
  if(isFinite(s.lyeConc)){ state.lyeConc=coerceField("lyeConc",s.lyeConc); done.push("lye concentration "+state.lyeConc+"%"); }
  if(isFinite(s.waterRatio)){ state.waterRatio=coerceField("waterRatio",s.waterRatio); done.push("water:lye "+state.waterRatio+":1"); }
  if(s.waterMode){ state.waterMode=coerceField("waterMode",s.waterMode); }
  if(done.length){ save(); render(); }
  return done.join(", ");
}

/* ---------- confirm modal (CSV + OCR) ---------- */
function openConfirm(rows,title,sub,previewURL){
  var md=makeModal(), back=md.back, m=md.m;
  m.appendChild(el("h3",null,title));
  m.appendChild(el("p","sub",sub));
  if(previewURL){ var img=document.createElement("img"); img.className="ocr-preview"; img.src=previewURL; m.appendChild(img); }
  var body=el("div"); m.appendChild(body);
  var rowsState=rows.slice();
  function drawRows(){
    body.innerHTML="";
    rowsState.forEach(function(r,idx){
      var pr=el("div","prow");
      var nameI=document.createElement("input"); nameI.value=r.name; nameI.placeholder="name";
      // Retyping the name of a matched oil means you want a different oil, so drop
      // the key and let the matcher look again. A custom row (key "") stays custom.
      nameI.addEventListener("input",function(){ r.name=nameI.value; if(r.key) r.key=null; });
      var amtI=document.createElement("input"); amtI.type="number"; amtI.step="any"; amtI.value=r.amount||""; amtI.placeholder="amt";
      amtI.addEventListener("input",function(){ r.amount=parseFloat(amtI.value)||0; });
      var unitS=document.createElement("select"); IMPORT_UNITS.forEach(function(u){ var o=document.createElement("option"); o.value=u; o.textContent=u; if(u===r.unit)o.selected=true; unitS.appendChild(o); });
      unitS.addEventListener("change",function(){ r.unit=unitS.value; });
      var secS=document.createElement("select"); [["oil","Oil"],["additive","Additive"],["scent","Scent"]].forEach(function(s){ var o=document.createElement("option"); o.value=s[0]; o.textContent=s[1]; if(s[0]===r.section)o.selected=true; secS.appendChild(o); });
      secS.addEventListener("change",function(){ r.section=secS.value; });
      var rm=el("button","rm","&times;"); rm.type="button"; rm.addEventListener("click",function(){ rowsState.splice(idx,1); drawRows(); });
      // name on its own line — imported names are long, and a name you can't
      // read makes this review screen pointless
      nameI.style.gridColumn="1/-1";
      pr.style.gridTemplateColumns="1fr 72px 84px auto";
      pr.appendChild(nameI); pr.appendChild(amtI); pr.appendChild(unitS); pr.appendChild(secS); pr.appendChild(rm);
      // a SAP that isn't our reference figure changes how much lye this oil needs, so say so
      if(sapNote(r)){ var hint=el("div","sub",sapNote(r));
        hint.style.gridColumn="1/-1"; hint.style.marginTop="-4px"; pr.appendChild(hint); }
      body.appendChild(pr);
    });
    if(rowsState.length===0) body.appendChild(el("div","ocr-status","Nothing to add."));
  }
  drawRows();
  var foot=el("div","mfoot");
  var cancel=el("button","ghost","Cancel"); cancel.addEventListener("click",function(){ closeModal(back); });
  var ok=el("button","primary","Add to recipe"); ok.addEventListener("click",function(){ commitRows(rowsState); closeModal(back); });
  foot.appendChild(cancel); foot.appendChild(ok); m.appendChild(foot);
}
function commitRows(rows){
  var added=0, wantScents=false;
  rows.forEach(function(r){
    if(!r.name || !r.name.trim() || !(r.amount>0)) return;
    var grams=r.amount*(CONV[r.unit]||1); if(!(grams>0)) return;
    if(r.section==="scent"){ var ak=rowKey(AROMAS,r); state.aromas.push({name:ak?AROMAS[ak].name:r.name,key:ak,g:grams}); wantScents=true; }
    else if(r.section==="additive"){ var dk=rowKey(ADDITIVES,r); state.additives.push({name:dk?ADDITIVES[dk].name:r.name,key:dk,g:grams}); }
    else {
      var ok=rowKey(OILS,r), it={name:ok?OILS[ok].name:r.name,key:ok,g:grams};
      if(!ok){ if(r.sap>0) it.sap=r.sap; }        // custom oil keeps the SAP off its bottle
      else if(r.sap>0 && Math.abs(r.sap-OILS[ok].sap)>0.0005 && !(state.sapOverrides&&state.sapOverrides[ok]>0)){
        // the file disagrees with our reference figure: that is the exporter's
        // supplier value, so carry it over instead of silently reverting to ours
        if(!state.sapOverrides) state.sapOverrides={};
        state.sapOverrides[ok]=r.sap;
      }
      state.oils.push(it);
    }
    added++;
  });
  if(added){ if(wantScents && state.oils.length===0) state.tab="scents"; save(); render(); }
}
/* Worth saying out loud on the review screen only when the file's SAP is not the
   number we would have used anyway — otherwise every row grows a line of noise. */
function sapNote(r){
  if(!(r.sap>0) || r.section!=="oil") return "";
  var k=rowKey(OILS,r);
  if(k && Math.abs(r.sap-OILS[k].sap)<=0.0005) return "";
  return "SAP "+fmt(r.sap,4)+" from the file"+(k?" (ours is "+fmt(OILS[k].sap,4)+")":"");
}
/* An explicit key beats name matching, because it is the only thing that tells a
   custom oil apart from a reference one. A key we don't recognise — a file from a
   newer version, or hand-edited — falls back to matching rather than importing a
   nameless blank. */
function rowKey(db,r){
  if(r.key && db[r.key]) return r.key;
  if(r.key==="") return null;                    // exported as custom: leave it custom
  return matchKey(db,r.name);
}

/* ---------- OCR ---------- */
$("photoInput").addEventListener("change",function(e){
  var f=e.target.files&&e.target.files[0]; if(!f) return;
  var url=URL.createObjectURL(f);
  // open modal in loading state
  var md=makeModal(), back=md.back, m=md.m;
  m.appendChild(el("h3",null,"Reading photo…"));
  var img=document.createElement("img"); img.className="ocr-preview"; img.src=url; m.appendChild(img);
  var status=el("div","ocr-status","<span class='spin'></span>Loading the text reader…");
  m.appendChild(status);
  // makeModal already closes on a backdrop tap; this one only has to note that the
  // scan in flight should stop when it does
  var cancelled=false;
  back.addEventListener("click",function(ev){ if(ev.target===back) cancelled=true; });

  loadTesseract().then(function(){
    if(cancelled) return;
    status.innerHTML="<span class='spin'></span>Recognizing text… (first run downloads ~5 MB)";
    return window.Tesseract.recognize(f,"eng",{ logger:function(mm){ if(mm.status==="recognizing text"&&!cancelled) status.innerHTML="<span class='spin'></span>Recognizing text… "+Math.round(mm.progress*100)+"%"; } });
  }).then(function(res){
    if(cancelled||!res) return;
    closeModal(back);
    var rows=parseOCR(res.data.text);
    if(!rows.length) rows=[{name:"",amount:0,unit:"g",section:"oil"}];
    openConfirm(rows,"Check the scanned recipe","OCR is rough — fix names, amounts & units, then add. Values default to grams.",url);
  }).catch(function(err){
    if(cancelled) return;
    status.innerHTML="Couldn't read the photo. "+(navigator.onLine?"Try a clearer, well-lit shot.":"You appear to be offline — the first scan needs internet to fetch the reader.");
    modalFoot(md,"Close");
  });
});
function loadTesseract(){
  if(window.Tesseract) return Promise.resolve();
  return new Promise(function(res,rej){
    var s=document.createElement("script"); s.src="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
    s.onload=res; s.onerror=function(){ rej(new Error("script load failed")); }; document.head.appendChild(s);
  });
}
function parseOCR(text){
  var out=[]; var lines=String(text).split(/\n+/);
  var re=/(\d+(?:[.,]\d+)?)\s*(grams?|g|ounces?|oz|pounds?|lbs?|lb|kg|ml|tbsp|tbs|tsp|cups?|cup|drops?)\b/i;
  lines.forEach(function(line){
    var l=line.replace(/[|•·*]/g," ").trim(); if(l.length<2) return;
    var mm=l.match(re); if(!mm) return;
    var amount=parseFloat(mm[1].replace(",",".")); var unit=normUnit(mm[2]);
    var name=l.replace(mm[0],"").replace(/[-–:.,]/g," ").replace(/\s+/g," ").trim();
    name=name.replace(/^\d+\s*/,"").trim();
    if(name.length<2){ var mk=matchKey(OILS,l)||matchKey(AROMAS,l)||matchKey(ADDITIVES,l); if(mk){} else return; }
    out.push(normalizeRow(name||l, amount, unit, ""));
  });
  return out;
}
function normUnit(u){ u=u.toLowerCase().replace(/s$/,""); if(u==="gram")u="g"; if(u==="ounce")u="oz"; if(u==="pound")u="lb"; if(u==="tbs")u="tbsp"; if(!CONV[u])u="g"; return u; }

/* ---------- data safety: persistent storage + backup/restore ---------- */
// Ask the browser to keep our storage (recipes) from being auto-evicted.
if(navigator.storage && navigator.storage.persist){ navigator.storage.persist().catch(function(){}); }
function backupAll(){
  syncCurrent(); save(); flushSave();
  downloadFile("soapcalc-backup-"+todayISO()+".json", localStorage.getItem(STORE_KEY)||"{}");
}
function restoreFrom(file){
  var r=new FileReader();
  r.onload=function(){
    var text=String(r.result), o;
    try{ o=JSON.parse(text); }catch(e){ alert("That file isn't valid JSON — pick a Soap Calc backup."); return; }
    if(!o||!Array.isArray(o.recipes)||o.recipes.length===0){ alert("That doesn't look like a Soap Calc backup (no recipes found)."); return; }
    if(!confirm("Restore "+o.recipes.length+" recipe(s) from this backup? This replaces the recipes currently on this device.")) return;
    cancelWrite();                       // don't let a queued write clobber the restore
    try{ localStorage.setItem(STORE_KEY,text); location.reload(); }
    catch(e){ alert("Couldn't save the restored data."); }
  };
  r.readAsText(file);
}

var sheetPrevFocus=null;

/* The menu is the longest list in the app — 26 actions and still growing — so it gets
   the same search box the troubleshooting and colorant guides already use. Matching
   includes each button's data-kw, because the word you'd type often isn't the word on
   the button: "csv" for Import, "print" for the wrapper, "inci" for the label. */
function sheetBtns(){ return Array.prototype.slice.call($("sheet").querySelectorAll(".sheet-btn")); }
function sheetHay(b){ return (b.textContent+" "+(b.dataset.kw||"")).toLowerCase(); }
function sheetMatches(){
  // "hide" is the install button's own not-available state — never let search reveal it
  return sheetBtns().filter(function(b){ return !b.hidden && !b.classList.contains("hide"); });
}
function filterSheet(q){
  q=(q||"").toLowerCase().trim();
  sheetBtns().forEach(function(b){ b.hidden = !!q && sheetHay(b).indexOf(q)<0; });
  // a group whose buttons all went away must take its heading with it, or the sheet
  // fills up with labels standing over nothing
  Array.prototype.forEach.call($("sheet").querySelectorAll(".sheet-group"),function(g){
    g.hidden = !g.querySelector(".sheet-btn:not([hidden]):not(.hide)");
  });
  $("sheetEmpty").classList.toggle("hide", sheetMatches().length>0);
}
$("sheetFilter").addEventListener("input",function(){ filterSheet(this.value); });
$("sheetFilter").addEventListener("keydown",function(e){
  if(e.key!=="Enter") return;
  var hits=sheetMatches();
  if(hits.length===1){ e.preventDefault(); hits[0].click(); }
});

function openSheet(){
  var b=$("sheetBack"); b.classList.remove("hide");
  forceVisible(b,"flex"); forceVisible($("sheet"),"block");
  // Reset the search every time. A sheet that reopens still filtered by last time's
  // query looks exactly like an app that has lost half its menu.
  $("sheetFilter").value=""; filterSheet("");
  document.body.style.overflow="hidden";
  sheetPrevFocus=document.activeElement;
  // Focus the first button, not the search field: autofocusing a search box on a phone
  // throws the keyboard over the menu you opened it to read.
  setTimeout(function(){ var f=$("sheet").querySelector("button"); if(f) f.focus(); },0);
}
function closeSheet(){ var b=$("sheetBack"); b.classList.add("hide"); b.style.setProperty("display","none","important"); document.body.style.overflow="";
  if(sheetPrevFocus&&sheetPrevFocus.focus){ try{ sheetPrevFocus.focus(); }catch(e){} } sheetPrevFocus=null; }

/* Esc closes the menu sheet or the top-most modal */
document.addEventListener("keydown",function(e){
  if(e.key!=="Escape") return;
  if(!$("sheetBack").classList.contains("hide")){ closeSheet(); return; }
  var kids=$("modalRoot").children; if(kids.length){ kids[kids.length-1].click(); }
});

/* ---------- undo (multi-level) + toast ---------- */
$("toastUndo").addEventListener("click",doUndo);

/* ---------- PWA ---------- */
if("serviceWorker" in navigator){
  var hadController = !!navigator.serviceWorker.controller, refreshing=false;
  // When a newly-deployed SW takes control, reload once to run the fresh files.
  // (Skip on the very first install, and guard against reload loops. Recipes are
  //  in localStorage, so a reload never loses work.)
  navigator.serviceWorker.addEventListener("controllerchange",function(){
    if(refreshing) return; refreshing=true;
    if(hadController) location.reload();
  });
  window.addEventListener("load",function(){
    navigator.serviceWorker.register("sw.js",{updateViaCache:"none"}).then(function(reg){
      reg.update();
      // Re-check for a new version each time the app is brought to the foreground.
      document.addEventListener("visibilitychange",function(){ if(document.visibilityState==="visible") reg.update(); });
    }).catch(function(){});
  });
}
var deferredPrompt=null;
var standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
function showInstall(){ if(!standalone) $("sheetInstall").classList.remove("hide"); }
window.addEventListener("beforeinstallprompt",function(e){ e.preventDefault(); deferredPrompt=e; showInstall(); });
window.addEventListener("appinstalled",function(){ $("sheetInstall").classList.add("hide"); });
function doInstall(){
  if(deferredPrompt){ deferredPrompt.prompt(); deferredPrompt.userChoice.finally(function(){ deferredPrompt=null; $("sheetInstall").classList.add("hide"); }); }
  else { alert("To install on iPhone/iPad: tap the Share button, then \"Add to Home Screen\"."); }
}
// iOS Safari has no beforeinstallprompt — surface the install hint anyway
var isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
if(isIOS && !standalone) showInstall();

/* ---------- compare recipes ---------- */
function openCompare(){
  if(library.length<2){ alert("Add another recipe first (tap ＋ or Duplicate) to compare."); return; }
  syncCurrent();
  var md=makeModal();
  md.m.appendChild(el("h3",null,"Compare recipes"));
  md.m.appendChild(el("p","sub","Oils shown as % of oils so batch size doesn't matter."));
  var pick=el("div","cmp-pick");
  var selA=document.createElement("select"), selB=document.createElement("select");
  library.forEach(function(r){
    [selA,selB].forEach(function(s){ var o=document.createElement("option"); o.value=r.id; o.textContent=r.name; s.appendChild(o); });
  });
  selA.value=currentId;
  var other=library.filter(function(r){return r.id!==currentId;})[0];
  selB.value=other?other.id:currentId;
  var la=el("div","cmp-lab"); la.appendChild(el("span",null,"A")); la.appendChild(selA);
  var lb=el("div","cmp-lab"); lb.appendChild(el("span",null,"B")); lb.appendChild(selB);
  pick.appendChild(la); pick.appendChild(lb); md.m.appendChild(pick);
  var out=el("div","cmp-out"); md.m.appendChild(out);
  function draw(){ renderCompare(out, libById(selA.value), libById(selB.value)); }
  selA.addEventListener("change",draw); selB.addEventListener("change",draw); draw();
  modalFoot(md,"Done");
}
function renderCompare(out, A, B){
  var sa=statsFor(A), sb=statsFor(B), wunit=weightUnit(), ul=UNITS[wunit].label;
  var map={}, order=[];
  function addp(list,w){ list.forEach(function(o){ var k=o.key||("c:"+o.name.toLowerCase());
    if(!map[k]){ map[k]={name:o.name,a:0,b:0}; order.push(k); } map[k][w]=o.pct; }); }
  addp(sa.oilPcts,"a"); addp(sb.oilPcts,"b");
  function row(label,a,b){ return "<tr><td>"+label+"</td><td>"+a+"</td><td>"+b+"</td></tr>"; }
  function sec(t){ return '<tr class="cmp-sec"><td colspan="3">'+t+"</td></tr>"; }
  var h='<table class="cmp-table"><thead><tr><th></th><th>'+escapeHtml(A.name)+'</th><th>'+escapeHtml(B.name)+"</th></tr></thead><tbody>";
  h+=sec("Oils (% of oils)");
  order.forEach(function(k){ var r=map[k]; h+=row(escapeHtml(r.name), fmt(r.a,1)+"%", fmt(r.b,1)+"%"); });
  h+=sec("Qualities");
  QUALITIES.map(function(q){ return [q.label,q.key]; }).forEach(function(q){
    h+=row(q[0], Math.round(sa.q[q[1]]), Math.round(sb.q[q[1]])); });
  h+=row("Iodine", Math.round(sa.iod), Math.round(sb.iod));
  h+=row("INS", Math.round(sa.ins), Math.round(sb.ins));
  h+=sec("Batch ("+ul+")");
  h+=row("Superfat", sa.sf+"%", sb.sf+"%");
  h+=row("Oils", fmt(fromG(sa.oilsG,wunit),1), fmt(fromG(sb.oilsG,wunit),1));
  h+=row("Lye", fmt(fromG(sa.lyeG,wunit),1), fmt(fromG(sb.lyeG,wunit),1));
  h+=row("Water", fmt(fromG(sa.waterG,wunit),1), fmt(fromG(sb.waterG,wunit),1));
  h+=row("Batch", fmt(fromG(sa.batchG,wunit),1), fmt(fromG(sb.batchG,wunit),1));
  h+=row("Scent", fmt(sa.scentPct,1)+"%", fmt(sb.scentPct,1)+"%");
  h+="</tbody></table>";
  out.innerHTML=h;
}

/* ---------- recipe card (print / share) ---------- */
function openCard(){
  syncCurrent(); var r=libById(currentId), s=statsFor(r), wunit=weightUnit(), ul=UNITS[wunit].label;
  var md=makeModal();
  var card=el("div","print-card"); card.innerHTML=cardHTML(r,s,wunit,ul); md.m.appendChild(card);
  var foot=el("div","mfoot no-print");
  var pr=el("button","ghost","🖨 Print"); pr.addEventListener("click",function(){ window.print(); });
  var cp=el("button","ghost","📋 Copy"); cp.addEventListener("click",function(){ copyText(cardText(r,s,wunit,ul),cp); });
  var cl=el("button","primary","Close"); cl.addEventListener("click",function(){ closeModal(md.back); });
  foot.appendChild(pr); foot.appendChild(cp); foot.appendChild(cl); md.m.appendChild(foot);
}
// Build the finished-bar INCI ingredient list: saponified oils (Sodium/Potassium …),
// water, naturally-occurring glycerin, then additives and fragrance, in descending weight order.
function inciLabel(){
  var L=computeLye(), total=totalOilsG();
  // A dual-lye soap really does contain both salts, so it gets both entries,
  // weighted by the share each lye saponified — the descending sort then places
  // them the way a label should read.
  var salts = L.kohShare>=1 ? [["Potassium ",1]]
            : L.kohShare<=0 ? [["Sodium ",1]]
            : [["Sodium ",1-L.kohShare],["Potassium ",L.kohShare]];
  var entries=[], missing=[], glyAdd=0;
  state.oils.forEach(function(it){ if(!(it.g>0)) return;
    var base=it.key?OIL_INCI[it.key]:null;
    if(base){
      if(base.charAt(0)==="=") entries.push({name:base.slice(1), w:it.g});
      else salts.forEach(function(s){ entries.push({name:s[0]+base, w:it.g*s[1]}); });
    }
    else { entries.push({name:it.name+" (verify INCI)", w:it.g}); missing.push(it.name); }
  });
  if(L.waterG>0) entries.push({name:"Aqua (Water)", w:L.waterG});
  state.additives.forEach(function(it){ if(!(it.g>0)) return;
    if(it.key==="glycerin"){ glyAdd+=it.g; return; }             // folded into the Glycerin line below
    var inci=it.key?ADDITIVE_INCI[it.key]:null;
    if(inci) entries.push({name:inci, w:it.g});
    else { entries.push({name:it.name+" (verify INCI)", w:it.g}); missing.push(it.name); }
  });
  if(total>0||glyAdd>0) entries.push({name:"Glycerin", w:total*0.08+glyAdd});
  var fragW=0, eoNames=[], hasFO=false;
  state.aromas.forEach(function(it){ if(!(it.g>0)) return; fragW+=it.g;
    var d=it.key?AROMAS[it.key]:null;
    if(d&&d.type==="FO") hasFO=true;
    else if(d) eoNames.push(d.name.replace(/\s+EO$/,"")); else eoNames.push(it.name); });
  if(fragW>0) entries.push({name: hasFO ? "Fragrance (Parfum)"
    : (eoNames.length ? eoNames.join(" & ")+" Essential Oil"+(eoNames.length>1?"s":"") : "Fragrance"), w:fragW});
  entries.sort(function(a,b){ return b.w-a.w; });
  return { text:entries.map(function(e){return e.name;}).join(", "), missing:missing, count:entries.length };
}
function openLabel(){
  var md=makeModal();
  md.m.appendChild(el("h3",null,"Ingredient label (INCI)"));
  md.m.appendChild(el("p","sub","A starting-point label for the finished bar — saponified oils, in descending order by weight."));
  var lab=inciLabel();
  var foot=el("div","mfoot");
  if(!lab.count){
    md.m.appendChild(el("p","sub","Add oils to build a label."));
  } else {
    md.m.appendChild(el("div","inci-box",escapeHtml(lab.text)));
    if(lab.missing.length) md.m.appendChild(el("div","inci-warn","⚠ No stored INCI name for: "+escapeHtml(lab.missing.join(", "))+" — look these up before using the label."));
    md.m.appendChild(el("p","sub","INCI names and labelling rules vary by supplier and region — verify before you sell. Naturally-occurring glycerin is included; water is listed as made (most evaporates during cure)."));
    var cp=el("button","ghost","📋 Copy"); cp.addEventListener("click",function(){ copyText(lab.text,cp); }); foot.appendChild(cp);
  }
  var cl=el("button","primary","Close"); cl.addEventListener("click",function(){ closeModal(md.back); });
  foot.appendChild(cl); md.m.appendChild(foot);
}
// A printable bar wrapper: name, net weight, INCI ingredients, dates, cautions.
function wrapperDates(){
  if(!state.madeOn) return null;
  var base=new Date(state.madeOn+"T00:00:00"); if(isNaN(base.getTime())) return null;
  var ready=new Date(base.getTime()); ready.setDate(ready.getDate()+(state.cureWeeks||4)*7);
  var o={year:"numeric",month:"short",day:"numeric"};
  return { made:base.toLocaleDateString(undefined,o), ready:ready.toLocaleDateString(undefined,o) };
}
function openWrapper(){
  syncCurrent(); var r=libById(currentId); if(!r) return;
  // net weight on a label is the packaged (cured) bar, not the wet poured weight
  var batch=currentBatchG(), curedBar = batch>0 ? barG()*(curedBatchG()/batch) : barG();
  var lab=inciLabel(), netOz=fmt(fromG(curedBar,"oz"),1), netG=Math.round(curedBar), d=wrapperDates();
  var md=makeModal();
  var card=el("div","print-card wrapper-card");
  var h="<h2>"+escapeHtml(r.name)+"</h2><div class='wrap-tag'>Handmade Soap</div>";
  h+="<div class='wrap-net'>Net wt. "+netOz+" oz ("+netG+" g)</div>";
  h+="<h3>Ingredients</h3><p class='wrap-inci'>"+(lab.count?escapeHtml(lab.text):"—")+"</p>";
  if(d) h+="<div class='wrap-dates'>Made "+d.made+" · Best after "+d.ready+"</div>";
  if(state.lot) h+="<div class='wrap-lot'>Lot "+escapeHtml(state.lot)+"</div>";
  h+="<div class='wrap-warn'>For external use only. Keep out of reach of children. Discontinue use if irritation occurs.</div>";
  card.innerHTML=h; md.m.appendChild(card);
  if(lab.missing.length) md.m.appendChild(el("div","inci-warn no-print","⚠ No stored INCI name for: "+escapeHtml(lab.missing.join(", "))+" — fill these in before printing for sale."));
  md.m.appendChild(el("p","sub no-print","Net weight is an estimate of the cured bar — weigh a real one before printing a label for sale. Add your name/contact and check your local labelling rules."));
  var foot=el("div","mfoot no-print");
  var pr=el("button","ghost","🖨 Print"); pr.addEventListener("click",function(){ window.print(); });
  var cp=el("button","ghost","📋 Copy"); cp.addEventListener("click",function(){ copyText(wrapperText(r,lab,netOz,netG,d),cp); });
  var cl=el("button","primary","Close"); cl.addEventListener("click",function(){ closeModal(md.back); });
  foot.appendChild(pr); foot.appendChild(cp); foot.appendChild(cl); md.m.appendChild(foot);
}
function wrapperText(r,lab,netOz,netG,d){
  var L=[r.name, "Handmade Soap", "Net wt. "+netOz+" oz ("+netG+" g)", "",
    "Ingredients: "+(lab.count?lab.text:"—")];
  if(d) L.push("", "Made "+d.made+" · Best after "+d.ready);
  if(state.lot) L.push("Lot "+state.lot);
  L.push("", "For external use only. Keep out of reach of children. Discontinue use if irritation occurs.");
  return L.join("\n");
}

/* ---------- share a recipe by link (the recipe rides in the URL, nothing uploaded) ---------- */
/* A custom oil's own SAP travels with it. Without it the other person gets an oil
   the app has no number for, which drops straight out of the lye maths — a 1 kg
   recipe arrived asking for 76 g of lye instead of 114. */
function shareItems(list){ return list.map(function(it){
  var o={name:it.name,key:it.key,g:Math.round(it.g*100)/100};
  if(!it.key && it.sap>0 && it.sap<1) o.sap=it.sap;
  return o; }); }
/* A share link carries the recipe, so it's built by *excluding* what shouldn't
   travel rather than listing what should. An allow-list quietly dropped dualKoh
   and then saltMode — and a missing field doesn't look broken, it just hands the
   other person a different soap. Anything private or personal to your own making
   is named here, and the suite asserts the list. */
var SHARE_SKIP={
  notes:1, batches:1, checklist:1,      // your own record of making it
  madeOn:1, lot:1,                      // this batch, not the recipe
  fav:1, lastUsed:1, barWeight:1        // your shelf, not theirs
};
function recipeShareURL(r){
  var payload={ name:r.name };
  RECIPE_FIELDS.forEach(function(fld){
    if(SHARE_SKIP[fld.k]) return;
    payload[fld.k] = fld.list ? shareItems(r[fld.k]) : r[fld.k];
  });
  var ov=usedOverrides(r); if(ov) payload.sapOv=ov;
  return location.origin+location.pathname+"#r="+b64urlEnc(JSON.stringify(payload));
}
/* Supplier SAP figures live outside the recipe, so they have to be picked out and
   sent alongside it — otherwise the link quietly rebuilds the recipe on our
   reference numbers and the lye comes out different from the sender's. Only the
   oils this recipe actually uses travel; the rest are none of the recipient's
   business. */
function usedOverrides(r){
  var ov=state.sapOverrides||{}, out=null;
  (r.oils||[]).forEach(function(it){
    if(it.key && it.g>0 && ov[it.key]>0){ if(!out) out={}; out[it.key]=ov[it.key]; }
  });
  return out;
}
function openShare(){
  syncCurrent(); var r=libById(currentId); if(!r) return;
  var url=recipeShareURL(r), md=makeModal();
  md.m.appendChild(el("h3",null,"Share this recipe"));
  md.m.appendChild(el("p","sub","Anyone who opens this link gets “"+escapeHtml(r.name)+"” added to their Soap Calc. The recipe travels inside the link itself — nothing is uploaded."));
  var ta=document.createElement("textarea"); ta.className="share-url"; ta.readOnly=true; ta.rows=3; ta.value=url;
  ta.addEventListener("focus",function(){ ta.select(); }); md.m.appendChild(ta);
  var foot=el("div","mfoot");
  if(navigator.share){ var sh=el("button","ghost","📤 Share…");
    sh.addEventListener("click",function(){ navigator.share({title:r.name,text:"Soap recipe: "+r.name,url:url}).catch(function(){}); }); foot.appendChild(sh); }
  var cp=el("button","ghost","📋 Copy link"); cp.addEventListener("click",function(){ copyText(url,cp); }); foot.appendChild(cp);
  var cl=el("button","primary","Close"); cl.addEventListener("click",function(){ closeModal(md.back); }); foot.appendChild(cl);
  md.m.appendChild(foot);
}
/* ---------- rebatch helper: how much liquid to add when you remelt a batch ---------- */
/* Guides cross-link: a `see` value is a guide key, optionally with a search term
   ("colors:titanium"), so a link lands on the relevant entry rather than the top. */
var GUIDES={
  trouble:{ label:"🔧 Troubleshooting",  open:function(q){ openTrouble(q); } },
  rebatch:{ label:"♻️ Rebatch helper",   open:function(){ openRebatch(); } },
  colors: { label:"🎨 Colorant guide",   open:function(q){ openColors(q); } },
  firstaid:{label:"🚑 Lye first aid",    open:function(q){ openFirstAid(q); } }
};
/* Static [data-guide] links in the markup — the safety banners on the Lye card and the
   checklist. A menu is no use to someone who has just splashed lye on themselves, so the
   way in sits next to the warning that says it might happen. Delegated, so it covers
   anything rendered later too. */
document.addEventListener("click",function(e){
  var b=e.target.closest?e.target.closest("[data-guide]"):null; if(!b) return;
  var g=GUIDES[b.dataset.guide]; if(!g) return;
  e.preventDefault(); g.open("");
});
function guideLinks(spec,back){
  var wrap=null;
  [].concat(spec||[]).forEach(function(s){
    if(typeof s!=="string") return;
    var i=s.indexOf(":"), key=i<0?s:s.slice(0,i), q=i<0?"":s.slice(i+1);
    var g=GUIDES[key]; if(!g) return;
    if(!wrap) wrap=el("div","see-also");
    var b=el("button","see-btn",escapeHtml(g.label)); b.type="button";
    b.addEventListener("click",function(){ closeModal(back); g.open(q); });
    wrap.appendChild(b);
  });
  return wrap;
}

function openRebatch(){
  syncCurrent();
  var md=makeModal(), wunit=weightUnit(), ul=UNITS[wunit].label;
  md.m.appendChild(el("h3",null,"Rebatch"));
  md.m.appendChild(el("p","sub","Grate a batch down, melt it with a little liquid and re-mould it. Good for a soap that seized, separated or just came out ugly."));
  var row=el("div","scale-row");
  var inp=numInput();
  inp.id="rebatchIn"; inp.value=fmt(fromG(curedBatchG(),wunit),UNITS[wunit].dp);
  row.appendChild(inp); row.appendChild(el("span","u",ul));
  md.m.appendChild(el("div","subhead","Weight of soap to rebatch"));
  md.m.appendChild(row);
  var out=el("div"); md.m.appendChild(out);
  function draw(){
    var raw=parseFloat(inp.value), g=isFinite(raw)&&raw>0 ? raw*UNITS[wunit].toG : 0;
    out.innerHTML="";
    if(!(g>0)){ out.appendChild(el("div","ocr-status","Enter how much soap you're rebatching.")); return; }
    out.appendChild(el("div","subhead","Liquid to add"));
    [["Firm — holds detail, hardest to stir",0.05],
     ["Typical — a workable, moldable mash",0.10],
     ["Pourable — smoothest, needs longer to firm up",0.25]
    ].forEach(function(x){
      var r=el("div","shop-row rb-row");
      r.innerHTML="<span class='sr-name'>"+escapeHtml(x[0])+"</span><span class='sr-amt'>"+
        fmt(fromG(g*x[1],wunit),UNITS[wunit].dp)+" "+ul+"</span>";
      out.appendChild(r);
    });
    out.appendChild(el("p","sub","Start at the low end — you can always stir in more, and too much liquid just means a longer second cure."));
  }
  inp.addEventListener("input",draw); draw();
  md.m.appendChild(el("div","subhead","How to do it"));
  var ol=document.createElement("ul"); ol.className="temp-ref";
  ["Grate or shred the soap — the finer it is, the smoother the result.",
   "Melt it low and slow: a slow cooker on low, or a covered dish in the oven at about 200°F / 95°C.",
   "Add the liquid, cover, and leave it be — stir every 15 minutes or so, mashing lumps as it softens (30–60 min).",
   "When it looks like thick mashed potato, stir in any fragrance or colour, then glop it into the mould and press down hard to drive out air pockets.",
   "Expect a rustic, textured bar rather than a smooth pour — that's rebatch. It's usable in about a week once firm."
  ].forEach(function(t){ var li=document.createElement("li"); li.textContent=t; ol.appendChild(li); });
  md.m.appendChild(ol);
  var back1=guideLinks("trouble",md.back); if(back1) md.m.appendChild(back1);
  md.m.appendChild(el("div","safety long","⚠️ Water is the safe default — milk, beer and purées can scorch at rebatch temperatures. And if the soap <b>zaps</b>, it's lye-heavy: rebatching alone won't fix that, it needs extra oil stirred in. Never add more lye to a rebatch."));
  modalFoot(md,"Done");
}

/* ---------- "why did my soap do X?" troubleshooting reference ---------- */
/* Troubleshooting, first aid and the colorant guide are the same thing on screen —
   grouped, searchable when/q/why/fix entries — so they share one renderer rather than
   keeping copies that drift. Colours were the copy that got missed for a while.
   o: {title, sub, placeholder, rows, whyLabel, fixLabel, noMatch, lead, tagClass, see, tail}
   A row may carry `tag`, shown beside its summary. */
function openGuideList(o,q0){
  var md=makeModal();
  md.m.appendChild(el("h3",null,o.title));
  md.m.appendChild(el("p","sub",o.sub));
  if(o.lead) md.m.appendChild(el("div","safety long",o.lead));
  var filter=document.createElement("input"); filter.className="ts-filter"; filter.type="search";
  filter.placeholder=o.placeholder; md.m.appendChild(filter);
  var wrap=el("div","ts-wrap"); md.m.appendChild(wrap);
  var groups=[];
  (o.rows||[]).forEach(function(t){
    var g=null; groups.forEach(function(x){ if(x.when===t.when) g=x; });
    if(!g){ g={when:t.when,items:[]}; groups.push(g); } g.items.push(t);
  });
  function draw(q){
    q=(q||"").toLowerCase().trim(); wrap.innerHTML="";
    groups.forEach(function(g){
      var hits=g.items.filter(function(t){ return !q || (t.q+" "+t.when+" "+t.why+" "+t.fix).toLowerCase().indexOf(q)>=0; });
      if(!hits.length) return;
      wrap.appendChild(el("div","ts-group",escapeHtml(g.when)));
      hits.forEach(function(t){
        var d=document.createElement("details"); d.className="ts-item"; if(q) d.open=true;
        var s=document.createElement("summary");
        if(t.tag) s.innerHTML=escapeHtml(t.q)+" <span class='"+o.tagClass+"'>"+escapeHtml(t.tag)+"</span>";
        else s.textContent=t.q;
        d.appendChild(s);
        var body=el("div","ts-body","<p><b>"+o.whyLabel+":</b> "+escapeHtml(t.why)+"</p>"+
          "<p><b>"+o.fixLabel+":</b> "+escapeHtml(t.fix)+"</p>");
        var links=guideLinks(t.see,md.back); if(links) body.appendChild(links);
        d.appendChild(body);
        wrap.appendChild(d);
      });
    });
    if(!wrap.children.length) wrap.appendChild(el("p","sub",o.noMatch));
  }
  filter.addEventListener("input",function(){ draw(filter.value); });
  filter.value=q0||""; draw(filter.value);
  if(o.see){ var seeAlso=guideLinks(o.see,md.back); if(seeAlso) md.m.appendChild(seeAlso); }
  if(o.tail) md.m.appendChild(el("div","safety long",o.tail));
  modalFoot(md);
  return md;
}
function openTrouble(q0){
  return openGuideList({
    title:"Troubleshooting",
    sub:"Something go sideways? Find the symptom, why it happened, and what to do.",
    placeholder:"Search symptoms (soft, ash, lather…)",
    rows:TROUBLESHOOTING||[], whyLabel:"Why", fixLabel:"Fix",
    noMatch:"No match — try another word (e.g. “soft”, “ash”, “lather”)."
  },q0);
}
/* The app tells you lye is caustic in eight places and used to stop there. This is the
   other half — what to do once it's already happened, which is when nobody is in a state
   to go looking for it. Hence the links from the Lye card and the checklist's lye step. */
function openFirstAid(q0){
  return openGuideList({
    title:"Lye first aid",
    sub:"What to do when lye gets somewhere it shouldn't. Worth reading before you need it.",
    lead:"⚠️ This is the standard first aid from a lye safety data sheet, not medical advice. If it's serious, stop reading and call your local emergency number.",
    placeholder:"Search (skin, eye, swallowed, spill…)",
    rows:FIRST_AID||[], whyLabel:"Why it matters", fixLabel:"Do this",
    noMatch:"No match — try “skin”, “eye”, “swallowed”, “fumes”, “spill” or “storing”."
  },q0);
}

/* ---------- colorant guide: dose, how to disperse, what survives high pH ---------- */
function openColors(q0){
  return openGuideList({
    title:"Colorants",
    sub:"How much, how to mix it in, and what soap's high pH will do to it. Doses are per <b>lb (450 g) of oils</b> — “PPO”.",
    placeholder:"Search colours (pink, fades, clay…)",
    rows:(COLORANTS||[]).map(function(t){
      return { when:t.family, q:t.name, tag:t.dose, why:t.how, fix:t.behaviour, see:t.see }; }),
    tagClass:"cl-dose", whyLabel:"How", fixLabel:"In soap",
    noMatch:"No match — try another word (e.g. “blue”, “clay”, “fades”).",
    see:"trouble:discolored",
    tail:"⚠️ Colour is cosmetic — nothing here changes the lye maths. Add colorants to the recipe as ordinary ingredients if you want them costed and on the label. Use skin-safe, soap-stable colorants only: craft dyes, food colouring and candle pigments don't belong in soap."
  },q0);
}

function nz(list){ return list.filter(function(it){ return it.g>0; }); }
function cardHTML(r,s,wunit,ul){
  var d=new Date().toLocaleDateString();
  var oils=nz(r.oils), adds=nz(r.additives), scents=nz(r.aromas);
  function items(list){ return list.map(function(it){
    return "<li>"+escapeHtml(it.name)+" — <b>"+fmt(fromG(it.g,wunit),UNITS[wunit].dp)+" "+ul+"</b>"+
      (s.oilsG>0?" <span class='mut'>("+fmt(it.g/s.oilsG*100,1)+"%)</span>":"")+"</li>"; }).join(""); }
  var h="<h2>"+escapeHtml(r.name)+"</h2><div class='mut'>Soap Calc · "+d+"</div>";
  h+="<div class='pc-yield'>Makes ≈ "+fmt(fromG(s.batchG,wunit),1)+" "+ul+"  ·  ~"+barCount(s.batchG)+" bars</div>";
  h+="<h3>Oils</h3><ul>"+items(oils)+"</ul>";
  if(adds.length){ h+="<h3>Additives</h3><ul>"+adds.map(function(it){
    return "<li>"+escapeHtml(it.name)+" — <b>"+fmt(fromG(it.g,wunit),UNITS[wunit].dp)+" "+ul+"</b></li>"; }).join("")+"</ul>"; }
  h+="<h3>Lye &amp; water</h3><ul>";
  h+="<li>"+s.kind+" — <b>"+fmt(fromG(s.lyeG,wunit),2)+" "+ul+"</b></li>";
  h+="<li>Water — <b>"+fmt(fromG(s.waterG,wunit),1)+" "+ul+"</b></li>";
  h+="<li>Superfat — <b>"+s.sf+"%</b></li></ul>";
  if(scents.length){ h+="<h3>Scent"+(s.scentPct?" ("+fmt(s.scentPct,1)+"% of oils)":"")+"</h3><ul>"+scents.map(function(it){
    return "<li>"+escapeHtml(it.name)+" — <b>"+fmt(fromG(it.g,wunit),UNITS[wunit].dp)+" "+ul+"</b></li>"; }).join("")+"</ul>"; }
  var q=s.q;
  h+="<h3>Profile</h3><div class='mut'>Hardness "+Math.round(q.hardness)+" · Cleansing "+Math.round(q.cleansing)+
     " · Conditioning "+Math.round(q.conditioning)+" · Bubbly "+Math.round(q.bubbly)+" · Creamy "+Math.round(q.creamy)+"</div>";
  h+="<p class='mut' style='margin-top:14px'>⚠️ Lye is caustic — wear gloves &amp; eye protection. SAP values are references; verify before making a batch.</p>";
  return h;
}
function cardText(r,s,wunit,ul){
  function line(name,g){ return name+": "+fmt(fromG(g,wunit),UNITS[wunit].dp)+" "+ul+(s.oilsG>0&&g?" ("+fmt(g/s.oilsG*100,1)+"%)":""); }
  var oils=nz(r.oils), adds=nz(r.additives), scents=nz(r.aromas);
  var L=[]; L.push(r.name); L.push("Makes ~"+fmt(fromG(s.batchG,wunit),1)+" "+ul+" (~"+barCount(s.batchG)+" bars)"); L.push("");
  L.push("OILS"); oils.forEach(function(it){ L.push("  "+line(it.name,it.g)); });
  if(adds.length){ L.push("ADDITIVES"); adds.forEach(function(it){ L.push("  "+it.name+": "+fmt(fromG(it.g,wunit),UNITS[wunit].dp)+" "+ul); }); }
  L.push("LYE & WATER");
  L.push("  "+s.kind+": "+fmt(fromG(s.lyeG,wunit),2)+" "+ul);
  L.push("  Water: "+fmt(fromG(s.waterG,wunit),1)+" "+ul);
  L.push("  Superfat: "+s.sf+"%");
  if(scents.length){ L.push("SCENT"+(s.scentPct?" ("+fmt(s.scentPct,1)+"% of oils)":"")); scents.forEach(function(it){ L.push("  "+it.name+": "+fmt(fromG(it.g,wunit),UNITS[wunit].dp)+" "+ul); }); }
  var q=s.q;
  L.push("PROFILE: Hardness "+Math.round(q.hardness)+", Cleansing "+Math.round(q.cleansing)+", Conditioning "+Math.round(q.conditioning)+", Bubbly "+Math.round(q.bubbly)+", Creamy "+Math.round(q.creamy));
  L.push(""); L.push("Lye is caustic — wear gloves & eye protection. Verify SAP values before a batch.");
  return L.join("\n");
}
function copyText(text,btn){
  var done=function(){ var old=btn.textContent; btn.textContent="Copied!"; setTimeout(function(){ btn.textContent=old; },1400); };
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(done,function(){ fallback(); }); }
  else fallback();
  function fallback(){ try{ var ta=document.createElement("textarea"); ta.value=text; ta.style.position="fixed"; ta.style.opacity="0";
    document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); done(); }catch(e){ alert("Couldn't copy automatically."); } }
}

/* ---------- costs (price book + cost per bar) ---------- */
function priceKeyOf(it){ return it.key || ("c:"+it.name.toLowerCase()); }

/* ---------- recipe library: search, sort, favourites ---------- */
function recipeBlurb(r){
  var n=r.oils.filter(function(it){ return it.g>0; }).length;
  var bits=[n+" oil"+(n===1?"":"s")];
  if(r.lyeType==="koh") bits.push("liquid");
  else if(r.lyeType==="dual") bits.push("dual lye");
  if(r.method==="hp") bits.push("hot process");
  else if(r.method==="cpop") bits.push("oven-gelled (CPOP)");
  if(r.use&&r.use!=="body"){ USES.forEach(function(u){ if(u[0]===r.use) bits.push(u[1].toLowerCase()); }); }
  var made=(r.batches||[]).length; if(made) bits.push("made "+made+"×");
  if(r.lastUsed>0){
    var days=Math.floor((Date.now()-r.lastUsed)/86400000);
    bits.push(days<=0?"opened today":days===1?"opened yesterday":"opened "+days+"d ago");
  }
  return bits.join(" · ");
}
function openLibrary(){
  syncCurrent();
  var md=makeModal();
  md.m.appendChild(el("h3",null,"Recipes"));
  md.m.appendChild(el("p","sub","Search your library, star the ones you come back to, and tap to open."));
  var find=document.createElement("input"); find.className="ts-filter"; find.type="search";
  find.placeholder="Search by name…"; md.m.appendChild(find);
  var seg=el("div","seg sub");
  [["name","A–Z"],["recent","Recent"],["added","Added"]].forEach(function(s){
    var b=el("button",null,s[1]); b.type="button"; b.dataset.ls=s[0];
    b.addEventListener("click",function(){ state.librarySort=s[0]; save(); draw(); });
    seg.appendChild(b);
  });
  md.m.appendChild(seg);
  // the filter only exists once you're tracking something — with an empty cupboard
  // there's nothing to compare against and the library looks exactly as it did
  var onlyMakeable=false;
  var chip=el("button","lib-chip","🧺 Can make now"); chip.type="button";
  chip.addEventListener("click",function(){ onlyMakeable=!onlyMakeable; draw(); });
  md.m.appendChild(chip);
  var list=el("div"); md.m.appendChild(list);
  modalFoot(md);

  function draw(){
    setActive(seg,"ls",state.librarySort||"name");
    var q=find.value.toLowerCase().trim();
    var tracking=Object.keys(state.stock||{}).length>0;
    if(!tracking) onlyMakeable=false;
    chip.classList.toggle("hide",!tracking);
    chip.classList.toggle("on",onlyMakeable);
    var rows=sortedLibrary().filter(function(r){ return !q || r.name.toLowerCase().indexOf(q)>=0; });
    if(onlyMakeable) rows=rows.filter(function(r){ var S=stockShortfall(r); return S.known>0 && !S.short.length; });
    list.innerHTML="";
    if(!rows.length){ list.appendChild(el("div","ocr-status",
      onlyMakeable ? "Nothing in the library is fully covered by what you have."
                   : "No recipe matches “"+escapeHtml(find.value)+"”.")); return; }
    rows.forEach(function(r){
      var row=el("div","lib-row"+(r.id===currentId?" on":""));
      var star=el("button","lib-star"+(r.fav?" on":""), r.fav?"★":"☆"); star.type="button";
      star.setAttribute("aria-label",(r.fav?"Unstar ":"Star ")+r.name);
      star.addEventListener("click",function(ev){ ev.stopPropagation(); r.fav=!r.fav; save(); rebuildRecipeSelect(); draw(); });
      var open=el("button","lib-open"); open.type="button";
      var badge="";
      if(tracking){
        var S=stockShortfall(r);
        badge = S.short.length ? "<span class='lib-short'>short "+S.short.length+"</span>"
              : S.known        ? "<span class='lib-can'>✓ can make</span>"
              : "";                        // nothing of this recipe is tracked
      }
      open.innerHTML="<b>"+escapeHtml(r.name)+badge+"</b><span>"+escapeHtml(recipeBlurb(r))+"</span>";
      open.addEventListener("click",function(){ closeModal(md.back); switchRecipe(r.id); });
      row.appendChild(star); row.appendChild(open); list.appendChild(row);
    });
  }
  find.addEventListener("input",draw);
  draw();
}

/* What a recipe is short of, against whatever you're tracking. Ingredients you
   haven't entered are invisible here — that's what keeps inventory opt-in. */
function stockShortfall(r){
  var tracked=Object.keys(state.stock||{}).length;
  if(!tracked || !r) return { tracked:false, short:[] };
  var T=shoppingTotals([r]), short=[], known=0;
  [].concat(T.oils,T.adds,T.scents,lyeRows(T,true)).forEach(function(x){
    var have=state.stock[priceKeyOf(x)];
    if(have===undefined) return;                         // untracked — can't judge
    known++;
    if(have < x.g-0.01) short.push({ name:x.name, g:x.g-have });
  });
  // known is what stops "can make" being claimed about a recipe none of whose
  // ingredients we're tracking — that isn't a yes, it's a don't-know
  return { tracked:true, known:known, short:short };
}

/* ---------- inventory: what's in the cupboard ---------- */
// The lye and water lines are shopping-list items too, so they get names and keys
// like any other ingredient (water is deliberately not stockable).
var LYE_NAOH={name:"Sodium hydroxide (NaOH)",key:null},
    LYE_KOH ={name:"Potassium hydroxide (KOH)",key:null},
    WATER_ROW={name:"Distilled water",key:null};
function lyeRows(T,skipWater){
  var rows=[];
  if(T.naoh>0) rows.push({name:LYE_NAOH.name,key:null,g:T.naoh});
  if(T.koh>0)  rows.push({name:LYE_KOH.name, key:null,g:T.koh});
  if(!skipWater && T.water>0) rows.push({name:WATER_ROW.name,key:null,g:T.water});
  return rows;
}
// Every ingredient across the whole library (a cupboard spans recipes), plus
// anything already holding stock, de-duplicated by the price-book key.
function stockCandidates(){
  var seen={}, out=[];
  function add(it){ var k=priceKeyOf(it); if(seen[k]) return; seen[k]={name:it.name}; out.push({key:k,name:it.name}); }
  library.forEach(function(r){
    r.oils.forEach(function(it){ if(it.g>0) add(it); });
    r.additives.forEach(function(it){ if(it.g>0) add(it); });
    r.aromas.forEach(function(it){ if(it.g>0) add(it); });
    var LL=computeLye(r);
    if(LL.naohG>0) add(LYE_NAOH);
    if(LL.kohG>0) add(LYE_KOH);
  });
  Object.keys(state.stock||{}).forEach(function(k){ if(!seen[k]) out.push({key:k,name:k.indexOf("c:")===0?k.slice(2):k}); });
  return out;
}
/* ---------- your supplier's SAP values ----------
   Suppliers quote SAP as mg KOH per gram (the spec-sheet convention); the maths
   here wants grams NaOH per gram. Accept either and convert, because retyping a
   spec sheet through a calculator is exactly where mistakes happen. */
function sapToKOH(naohPerG){ return naohPerG*KOH_FACTOR*1000; }
function sapFromKOH(mgKOH){ return mgKOH/1000/KOH_FACTOR; }

function openSAP(){
  syncCurrent();
  var md=makeModal();
  md.m.appendChild(el("h3",null,"SAP values"));
  md.m.appendChild(el("p","sub","Reference SAP values vary between suppliers. If your spec sheet says something different, put their number in and the lye is sized on it instead. Blank means use our reference."));
  var seg=el("div","seg sub"), asKOH=true;
  [["mg KOH/g","koh"],["g NaOH/g","naoh"]].forEach(function(o){
    var b=el("button",null,o[0]); b.type="button"; b.dataset.m=o[1];
    b.addEventListener("click",function(){ asKOH=o[1]==="koh"; setActive(seg,"m",o[1]); draw(); });
    seg.appendChild(b);
  });
  md.m.appendChild(el("div","subhead","Enter values as"));
  md.m.appendChild(seg); setActive(seg,"m","koh");
  md.m.appendChild(el("p","sub","Most suppliers print mg KOH/g — a number around 180–260."));

  var out=el("div"); md.m.appendChild(out);
  var note=el("div","subinfo"); note.style.textAlign="left"; md.m.appendChild(note);

  function rows(){
    // oils in this recipe, plus anything you've already overridden elsewhere
    var seen={}, list=[];
    state.oils.forEach(function(it){
      if(!it.key || seen[it.key]) return; seen[it.key]=1;
      list.push({key:it.key, name:OILS[it.key].name, ref:OILS[it.key].sap});
    });
    Object.keys(state.sapOverrides||{}).forEach(function(k){
      if(seen[k]||!OILS[k]) return; seen[k]=1;
      list.push({key:k, name:OILS[k].name, ref:OILS[k].sap});
    });
    return list;
  }
  function draw(){
    out.innerHTML="";
    var list=rows(), customs=state.oils.filter(function(it){ return !it.key && it.g>0; });
    if(!list.length && !customs.length){ out.appendChild(el("div","ocr-status","Add some oils to a recipe first.")); showNote(); return; }
    var dp=asKOH?1:4;
    function cell(tr,label,getVal,setVal,ref){
      tr.appendChild(el("td",null,escapeHtml(label)+(ref!=null?"<div class='sap-ref'>ours: "+fmt(asKOH?sapToKOH(ref):ref,dp)+"</div>":"<div class='sap-ref'>no reference</div>")));
      var td=document.createElement("td");
      var inp=numInput();
      inp.placeholder=ref!=null ? fmt(asKOH?sapToKOH(ref):ref,dp) : "—";
      var cur=getVal(); inp.value = cur>0 ? fmt(asKOH?sapToKOH(cur):cur,dp) : "";
      inp.addEventListener("input",function(){
        var v=parseFloat(inp.value);
        setVal(isFinite(v)&&v>0 ? (asKOH?sapFromKOH(v):v) : 0);
        saveSoon(); refreshDerived(); showNote();
      });
      td.appendChild(inp); tr.appendChild(td);
    }
    var table=el("table","cost-table"), tb=document.createElement("tbody"); table.appendChild(tb);
    list.forEach(function(x){
      var tr=document.createElement("tr");
      cell(tr,x.name,function(){ return (state.sapOverrides||{})[x.key]||0; },
        function(v){ if(v>0) state.sapOverrides[x.key]=v; else delete state.sapOverrides[x.key]; }, x.ref);
      tb.appendChild(tr);
    });
    customs.forEach(function(it){
      var tr=document.createElement("tr");
      cell(tr,it.name,function(){ return it.sap||0; },
        function(v){ if(v>0) it.sap=v; else delete it.sap; }, null);
      tb.appendChild(tr);
    });
    out.appendChild(table);
    showNote();
  }
  function showNote(){
    var L=computeLye(), bits=[];
    if(L.overrides.length) bits.push(L.overrides.length+" supplier value"+(L.overrides.length===1?"":"s")+" in use");
    if(L.customSap) bits.push("a custom oil is in the lye maths");
    if(L.hasCustom) bits.push("a custom oil is still excluded — give it a SAP to include it");
    note.textContent = bits.length ? bits.join(" · ")+"." : "Using our reference values throughout.";
  }
  draw();
  md.m.appendChild(el("div","safety long","⚠️ A wrong SAP value means the wrong amount of lye. Take it from the supplier's current spec sheet for the batch you actually bought, and re-check it if you change supplier."));
  var foot=el("div","mfoot");
  var reset=el("button","ghost","Use ours");
  reset.addEventListener("click",function(){
    state.sapOverrides={};
    state.oils.forEach(function(it){ if(!it.key) delete it.sap; });
    save(); render(); draw();
  });
  var done=el("button","primary","Done");
  done.addEventListener("click",function(){ save(); render(); closeModal(md.back); });
  foot.appendChild(reset); foot.appendChild(done); md.m.appendChild(foot);
}

function openStock(){
  syncCurrent();
  var md=makeModal(), wunit=weightUnit(), ul=UNITS[wunit].label;
  md.m.appendChild(el("h3",null,"Inventory"));
  md.m.appendChild(el("p","sub","What you've got in the cupboard, in "+UNITS[wunit].name+". The shopping list subtracts this, so it only asks you to buy what you're short of. Leave anything blank to stop tracking it."));
  var out=el("div"); md.m.appendChild(out);
  var cover=el("div","subinfo"); cover.style.textAlign="left"; md.m.appendChild(cover);
  var items=stockCandidates();
  if(!items.length){ out.appendChild(el("div","ocr-status","Add ingredients to a recipe first.")); }
  else {
    var table=el("table","cost-table"), tb=document.createElement("tbody"); table.appendChild(tb);
    items.forEach(function(x){
      var tr=document.createElement("tr");
      tr.appendChild(el("td",null,escapeHtml(x.name)));
      var td=document.createElement("td");
      var inp=numInput(); inp.placeholder="0";
      var have=state.stock[x.key];
      inp.value = have>0 ? fmt(fromG(have,wunit),UNITS[wunit].dp) : "";
      inp.addEventListener("input",function(){
        var v=parseFloat(inp.value);
        if(isFinite(v)&&v>0) state.stock[x.key]=v*UNITS[wunit].toG; else delete state.stock[x.key];
        saveSoon(); showCoverage();
      });
      td.appendChild(inp); td.appendChild(document.createTextNode(" "+ul));
      tr.appendChild(td); tb.appendChild(tr);
    });
    out.appendChild(table);
  }
  function showCoverage(){
    var r=libById(currentId); if(!r){ cover.textContent=""; return; }
    var S=stockShortfall(r);
    var short=S.short.map(function(x){ return x.name+" (short "+fmt(fromG(x.g,wunit),1)+" "+ul+")"; });
    cover.textContent = !S.tracked ? "Nothing tracked yet — fill in what you have above."
      : short.length ? "“"+r.name+"”: short on "+short.join(", ")+"."
      : "“"+r.name+"”: you have enough of everything you're tracking. ✓";
  }
  showCoverage();
  modalFoot(md,"Done");
}

/* ---------- shopping list: what to buy across a batch plan ---------- */
function shoppingTotals(recipes){
  var oils={}, adds={}, scents={}, naoh=0, koh=0, water=0;
  function bump(map,it){ var k=priceKeyOf(it);
    if(!map[k]) map[k]={name:it.name, key:it.key, g:0};
    map[k].g+=it.g; }
  recipes.forEach(function(r){
    r.oils.forEach(function(it){ if(it.g>0) bump(oils,it); });
    r.additives.forEach(function(it){ if(it.g>0) bump(adds,it); });
    r.aromas.forEach(function(it){ if(it.g>0) bump(scents,it); });
    var L=computeLye(r);                       // a library recipe already has every field computeLye needs
    naoh+=L.naohG; koh+=L.kohG;               // dual recipes contribute to both
    water+=L.waterG;
  });
  function sorted(map){ return Object.keys(map).map(function(k){ return map[k]; })
    .sort(function(a,b){ return b.g-a.g; }); }
  return { oils:sorted(oils), adds:sorted(adds), scents:sorted(scents), naoh:naoh, koh:koh, water:water };
}
function openShopping(){
  syncCurrent();
  var md=makeModal(), picked={}; picked[currentId]=true;
  md.m.classList.add("shop-modal");
  md.m.appendChild(el("h3",null,"Shopping list"));
  md.m.appendChild(el("p","sub no-print","Tick the recipes you plan to make and it totals up everything you need to buy."));
  // on paper the picker is noise, so the chosen recipes are restated instead
  var phead=el("div","shop-printhead print-only"); md.m.appendChild(phead);
  var pick=el("div","shop-pick no-print"); md.m.appendChild(pick);
  library.forEach(function(r){
    var lab=el("label","shop-rec");
    var cb=document.createElement("input"); cb.type="checkbox"; cb.checked=!!picked[r.id];
    cb.addEventListener("change",function(){ if(cb.checked) picked[r.id]=true; else delete picked[r.id]; draw(); });
    lab.appendChild(cb); lab.appendChild(el("span","txt",escapeHtml(r.name))); pick.appendChild(lab);
  });
  var all=el("button","link","select all / none"); all.type="button";
  all.addEventListener("click",function(){
    var allOn=library.every(function(r){ return picked[r.id]; });   // select all first, clear only once everything is on
    picked={}; if(!allOn) library.forEach(function(r){ picked[r.id]=true; });
    Array.prototype.forEach.call(pick.querySelectorAll("input"),function(cb,i){ cb.checked=!!picked[library[i].id]; });
    draw();
  });
  all.classList.add("no-print");
  md.m.appendChild(all);
  var out=el("div"); md.m.appendChild(out);
  var foot=el("div","mfoot");
  var cp=el("button","ghost","📋 Copy"); foot.appendChild(cp);
  var pr=el("button","ghost","🖨 Print"); pr.addEventListener("click",function(){ window.print(); }); foot.appendChild(pr);
  var cl=el("button","primary","Close"); cl.addEventListener("click",function(){ closeModal(md.back); }); foot.appendChild(cl);
  foot.classList.add("no-print");
  md.m.appendChild(foot);

  function draw(){
    var chosen=library.filter(function(r){ return picked[r.id]; });
    out.innerHTML="";
    if(!chosen.length){ out.appendChild(el("div","ocr-status","Tick at least one recipe.")); cp.disabled=pr.disabled=true; phead.textContent=""; return; }
    cp.disabled=pr.disabled=false;
    phead.innerHTML="<b>"+escapeHtml(chosen.map(function(r){ return r.name; }).join(" · "))+"</b>"+
      "<span>"+new Date().toLocaleDateString()+"</span>";
    var T=shoppingTotals(chosen), wunit=weightUnit(), ul=UNITS[wunit].label, cur=state.currency||"$", total=0, lines=[];
    function section(title,items){
      if(!items.length) return;
      var sec=el("div","shop-sec"); out.appendChild(sec);
      sec.appendChild(el("div","shop-h",title));
      lines.push(title.toUpperCase());
      items.forEach(function(x){
        var pk=priceKeyOf(x), have=state.stock[pk];
        // untracked ingredients behave exactly as they did before inventory existed
        var tracked=have!==undefined, buyG=tracked?Math.max(0,x.g-have):x.g, covered=tracked&&buyG<=0.01;
        var row=el("div","shop-row"+(covered?" covered":""));
        var amt=fmt(fromG(buyG,wunit),UNITS[wunit].dp)+" "+ul;
        var price=state.prices[pk], cost=price>0 ? buyG/1000*price : 0; total+=cost;
        var main = covered ? "<span class='sr-amt'>have enough</span>"
          : "<span class='sr-amt'>"+amt+(cost>0?" <span class='sr-cost'>"+cur+fmt(cost,2)+"</span>":"")+"</span>";
        row.innerHTML="<span class='sr-tick print-only'></span>"+
          "<span class='sr-name'><span class='sr-label'>"+escapeHtml(x.name)+"</span>"+
          (tracked?"<span class='sr-have'>need "+fmt(fromG(x.g,wunit),UNITS[wunit].dp)+" · have "+fmt(fromG(have,wunit),UNITS[wunit].dp)+"</span>":"")+
          "</span>"+main;
        sec.appendChild(row);
        lines.push("  "+x.name+": "+(covered?"have enough":amt+(cost>0?"  ("+cur+fmt(cost,2)+")":""))+
          (tracked&&!covered?"  [need "+fmt(fromG(x.g,wunit),UNITS[wunit].dp)+", have "+fmt(fromG(have,wunit),UNITS[wunit].dp)+"]":""));
      });
    }
    section("Oils & fats",T.oils);
    section("Additives",T.adds);
    section("Scents",T.scents);
    section("Lye & water",lyeRows(T));
    var foot2=el("div","shop-tot");
    foot2.innerHTML="<span>"+chosen.length+" recipe"+(chosen.length===1?"":"s")+"</span>"+
      (total>0?"<span class='big'>"+cur+fmt(total,2)+"</span>":"<span class='sub'>add prices in Costs for a total</span>");
    out.appendChild(foot2);
    if(total>0) lines.push("", "Estimated total: "+cur+fmt(total,2)+" (priced items only)");
    cp.onclick=function(){ copyText("Shopping list — "+chosen.map(function(r){return r.name;}).join(", ")+"\n\n"+lines.join("\n"),cp); };
  }
  draw();
}
function openCosts(){
  syncCurrent();
  var md=makeModal();
  md.m.appendChild(el("h3",null,"Costs"));
  md.m.appendChild(el("p","sub","Enter each ingredient's price per kg. Prices are saved and reused across recipes."));
  var cur=el("div","cost-cur"); cur.appendChild(el("span",null,"Currency"));
  var sel=document.createElement("select");
  ["$","€","£","¥","₹","R$","kr","A$","C$"].forEach(function(c){ var o=document.createElement("option"); o.value=c; o.textContent=c; if(c===state.currency)o.selected=true; sel.appendChild(o); });
  cur.appendChild(sel); md.m.appendChild(cur);
  var out=el("div"); md.m.appendChild(out);
  sel.addEventListener("change",function(){ state.currency=sel.value; save(); draw(); });

  function draw(){
    out.innerHTML="";
    var items=[].concat(
      state.oils.map(function(t){return {it:t};}),
      state.additives.map(function(t){return {it:t};}),
      state.aromas.map(function(t){return {it:t};})
    ).filter(function(x){ return x.it.g>0; });
    if(items.length===0){ out.appendChild(el("div","ocr-status","Add ingredients first to price them.")); return; }
    var table=el("table","cost-table"), tb=document.createElement("tbody"); table.appendChild(tb);
    var refs=[];
    items.forEach(function(x){
      var pk=priceKeyOf(x.it), tr=document.createElement("tr");
      tr.appendChild(el("td",null,escapeHtml(x.it.name)));
      var td2=document.createElement("td");
      var inp=numInput(); inp.value=state.prices[pk]||""; inp.placeholder="0";
      inp.addEventListener("input",function(){ var v=parseFloat(inp.value); if(isFinite(v)&&v>0) state.prices[pk]=v; else delete state.prices[pk]; saveSoon(); recompute(); });
      td2.appendChild(inp); td2.appendChild(document.createTextNode(" "+state.currency+"/kg"));
      tr.appendChild(td2);
      var costCell=el("td",null,""); tr.appendChild(costCell);
      tb.appendChild(tr); refs.push({it:x.it,pk:pk,cell:costCell});
    });
    out.appendChild(table);
    var totRow=el("div","cost-tot"); var totSpan=el("span","big",""); totRow.appendChild(el("span",null,"Batch total")); totRow.appendChild(totSpan); out.appendChild(totRow);
    var perEl=el("div","subinfo"); perEl.style.textAlign="left"; out.appendChild(perEl);
    recompute();
    function recompute(){
      var total=0;
      refs.forEach(function(r){ var p=state.prices[r.pk]||0; var c=r.it.g/1000*p; total+=c; r.cell.textContent=p?state.currency+fmt(c,2):"—"; });
      totSpan.textContent=state.currency+fmt(total,2);
      var s=statsFor(libById(currentId)), bars=barCount(s.batchG);
      perEl.textContent = (bars>0 && total>0) ? state.currency+fmt(total/bars,2)+" per bar (~"+bars+" bars)" : "Enter prices to see cost per bar.";
    }
  }
  draw();
  modalFoot(md,"Done");
}


function switchRecipe(id){ if(id===currentId){ rebuildRecipeSelect(); return; } syncCurrent();
  var r=libById(id); if(!r) return; setCurrentId(id); touchRecipe(id); loadRecipeIntoState(r); setScaleDirty(false); save(); render(); }
function newRecipe(){
  var name=(prompt("Name this recipe:","Recipe "+(library.length+1))||"").trim();
  if(name==="") return; syncCurrent();
  var r=blankRecipe(name); library.push(r); setCurrentId(r.id); loadRecipeIntoState(r); setScaleDirty(false); save(); render();
}
function duplicateRecipe(){ syncCurrent(); var c=libById(currentId); if(!c) return;
  var r={ id:uid(), name:c.name+" copy" };
  RECIPE_FIELDS.forEach(function(fld){
    r[fld.k] = fld.k==="checklist" ? {}                 // the copy starts with a fresh make-checklist
             : fld.list ? c[fld.k].map(cloneItem)        // deep-copy ingredient lists
             : c[fld.k];
  });
  library.push(r); setCurrentId(r.id); loadRecipeIntoState(r); setScaleDirty(false); save(); render(); }
function renameRecipe(){ var c=libById(currentId); if(!c) return;
  var name=(prompt("Rename recipe:",c.name)||"").trim(); if(name==="") return; c.name=name; save(); rebuildRecipeSelect(); }
function deleteRecipe(){ var c=libById(currentId); if(!c) return;
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
function cardKey(card){
  if(card.id) return card.id;
  var h2=card.querySelector("h2");
  return h2 ? "c_"+h2.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,24) : null;
}
function initCollapsibles(){
  var DEFAULT_COLLAPSED={ notesCard:1, shapeCard:1 };   // fold the advisory, text-heavy cards to start
  if(!state.collapsed){ state.collapsed={}; }
  Array.prototype.forEach.call(document.querySelectorAll(".card"),function(card){
    var h2=card.querySelector("h2"); if(!h2) return;
    var key=cardKey(card); if(!key) return;
    card.dataset.ckey=key;
    var chev=el("span","chev","▾"); chev.setAttribute("aria-hidden","true"); h2.appendChild(chev);
    var collapsed = (key in state.collapsed) ? !!state.collapsed[key] : !!DEFAULT_COLLAPSED[key];
    card.classList.toggle("collapsed",collapsed);
    h2.setAttribute("role","button"); h2.setAttribute("tabindex","0"); h2.setAttribute("aria-expanded",String(!collapsed));
    function toggle(){
      var c=!card.classList.contains("collapsed");
      card.classList.toggle("collapsed",c);
      h2.setAttribute("aria-expanded",String(!c));
      state.collapsed[key]=c; save();
    }
    h2.addEventListener("click",function(e){ if(e.target.closest(".link")) return; toggle(); });
    h2.addEventListener("keydown",function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); toggle(); } });
  });
}

applyTheme();
render();
initCollapsibles();
detectAI();
if(sharedImportName){ save();
  // say it out loud: a supplier SAP figure changes every recipe that uses that oil,
  // not just the one that arrived
  showToast('Added “'+sharedImportName+'” from a shared link'
    +(sharedOvUsed?' · kept '+sharedOvUsed+' supplier SAP value'+(sharedOvUsed>1?'s':""):""),true); }

(function initBuildStamp(){
  var b=$("buildStamp"); if(!b) return;
  b.textContent="Soap Calc "+APP_VERSION+" · built "+BUILD_DATE;
  b.addEventListener("click",function(){
    // force the freshest copy: drop the offline caches, then reload
    if(window.caches && caches.keys){
      b.textContent="Refreshing…";
      caches.keys().then(function(keys){ return Promise.all(keys.map(function(k){ return caches.delete(k); })); })
        .then(function(){ location.reload(); }).catch(function(){ location.reload(); });
    } else location.reload();
  });
})();
