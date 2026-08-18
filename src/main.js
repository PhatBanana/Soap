/* Soap Calc — application entry point.

   An ES module, so this file is already its own scope: no IIFE, and strict mode is
   implicit. Reference data lives in src/data/, split by what it is. */
import { $, el, forceVisible } from "./core/dom.js";
import { APP_VERSION, BUILD_DATE } from "./core/schema.js";
import { library, save, saveSoon, sharedImportName, sharedOvUsed, state, totalOilsG, weightUnit } from "./core/state.js";
import { UNITS, UORDER, fmt } from "./core/units.js";
import { todayISO } from "./core/util.js";
import { ADDITIVES, AROMAS } from "./data/ingredients.js";
import { OILS } from "./data/oils.js";
import { openExamples } from "./features/examples.js";
import { openColors, openFirstAid, openRebatch, openTrouble } from "./features/guides.js";
import { backupAll, exportCSV, openPaste, restoreFrom } from "./features/io.js";
import { openCard, openCompare, openLabel, openShare, openWrapper } from "./features/output.js";
import { openCosts, openLibrary, openSAP, openShopping, openStock } from "./features/planning.js";
import { clearRecipe, deleteRecipe, duplicateRecipe, logBatch, newRecipe, renameRecipe, switchRecipe } from "./features/recipes.js";
import { applyMold, applyWeightScale, detectAI, nudge, rebuildRecipeSelect, refreshDerived, render, renderMake, roundAmounts, runAIExplain, setScaleDirty, unitsEl, updateCureSuggest, updateDilutePanel, updateMoldHint, updateReady, updateScaleCard, updateScaleHint } from "./ui/render.js";
import { doUndo, showToast } from "./ui/toast.js";
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
