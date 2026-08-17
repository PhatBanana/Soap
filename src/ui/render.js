/* Everything that draws the three tabs: the ingredient rows, the derived panels, the
   scale card, the make checklist and the safety readout. One module because it is one
   unit — render() reaches all of it, and the file's own dependency map showed no seam
   inside it worth cutting along.

   The cycle rule for this layer: modules here may import each other, because the calls
   happen when someone taps something. Nothing here may be called while a module is
   still evaluating. */
import { showToast, pushUndo } from "./toast.js";
import { openExamples } from "../features/examples.js";
import { todayISO } from "../core/util.js";
import { SALT_MAX_PER100, IOD_RANGE, INS_RANGE, LAURIC_OILS, QUALITIES,
         brineOf, lyeConcOf, qFn, qualitiesOf } from "../core/chem.js";
import { $, el, escapeHtml, numInput, setActive, uid } from "../core/dom.js";
import { USES } from "../core/schema.js";
import { blendFA, cleansingCap, computeLye, curRV, curedBatchG, currentBatchG, currentId,
         oilInfo, save, saveSoon, scaleUnit, sortedLibrary, state, totalOilsG, weightUnit } from "../core/state.js";
import { UNITS, UORDER, clamp, fmt, fromG, sumG } from "../core/units.js";
import { BLEND_TIPS } from "../data/guides.js";
import { ADDITIVES, AROMAS } from "../data/ingredients.js";
import { OILS } from "../data/oils.js";

export var unitsEl=$("unitSelect"), oilList=$("oilList"), addList=$("addList"), aromaList=$("aromaList");
export var oilRefs=[], addRefs=[], aromaRefs=[];
export var activeInput=null;
export function setScaleDirty(v){ scaleDirty=v; }
export var scaleDirty=false; // true once the user edits the scale field (stops auto-prefill)
export var lastGoal=null, fbId=null;
export function setLastGoal(v){ lastGoal=v; } // last Shape goal tapped, for the balance feedback
export var TABS={base:renderBase, scents:renderScents, make:renderMake};
export var lastSafety=null;
export var aiAvail=false, aiApi=null;
export var wakeSentinel=null, wakeReq=false;
export var CP_STEPS=[
  "Suit up: gloves + eye protection, apron, good ventilation.",
  "Weigh your oils; melt the hard oils/butters and combine with the liquid oils.",
  "Weigh the water (or milk) and the lye separately.",
  "Add the lye TO the water (never the reverse), stir until clear, and let it cool.",
  "Cool the oils and the lye water to about 95–105°F (35–40°C).",
  "Pour lye water into the oils and blend to a light trace.",
  "Add fragrance, additives, and color at trace; stir in well.",
  "Pour into the mold, tap out bubbles, and insulate/cover.",
  "Unmold and cut into bars after 1–2 days.",
  "Cure the bars on a rack until the ready date, turning occasionally."
];
export var HP_STEPS=[
  "Suit up: gloves + eye protection, apron, good ventilation.",
  "Weigh your oils and melt them together in the slow cooker on low.",
  "Weigh the water and the lye separately.",
  "Add the lye TO the water (never the reverse), stir until clear.",
  "Pour the lye water into the warm oils and blend to a light trace.",
  "Cover and cook on low ~45–60 min, stirring now and then, until it folds over like thick mashed potato / vaseline.",
  "Check the cook is done (zap-test a cooled dab — no zing) before going further.",
  "Let it cool a few minutes, then stir in fragrance, additives and colour — scent goes in AFTER the cook.",
  "Spoon into the mould and press down firmly; HP batter is thick, so work it into the corners to avoid air pockets.",
  "Unmould and cut once firm (a few hours to a day). It's usable in about a week — a short rest still improves it."
];
/* CPOP — cold process, oven process. Identical chemistry to CP right up to the mould;
   the oven only guarantees the gel that CP leaves to chance, which is why the lye, the
   superfat modes and the cure estimate all deliberately keep taking the CP path. */
export var CPOP_STEPS=[
  "Suit up: gloves + eye protection, apron, good ventilation.",
  "Heat the oven to its lowest setting (~170°F / 75°C) so it's ready when the batter is.",
  "Weigh your oils; melt the hard oils/butters and combine with the liquid oils.",
  "Weigh the water (or milk) and the lye separately.",
  "Add the lye TO the water (never the reverse), stir until clear, and let it cool.",
  "Cool the oils and the lye water to about 95–105°F (35–40°C).",
  "Pour lye water into the oils and blend to a light trace.",
  "Add fragrance, additives, and color at trace; stir in well.",
  "Pour into the mold and tap out bubbles — don't insulate, the oven is doing that job.",
  "Put the mould in the oven and TURN THE OVEN OFF. Leave the door shut 2–3 hours, or overnight.",
  "Leave it in the cooling oven until it's back to room temperature before moving it.",
  "Unmold and cut into bars after 1–2 days.",
  "Cure the bars on a rack until the ready date — a forced gel doesn't shorten the cure."
];
export function barG(){ return state.barWeight>0 ? state.barWeight : 110; }
export function barCount(g){ return g>0 ? Math.max(1,Math.round(g/barG())) : 0; }
export function render(){
  rebuildRecipeSelect();
  unitsEl.value=state.unit;
  setActive($("tabs"),"tab",state.tab);
  Object.keys(TABS).forEach(function(t){ $("tab-"+t).hidden = state.tab!==t; });
  (TABS[state.tab]||TABS.base)();
  // the scents/make renderers don't run refreshDerived, so they need this; on the base
  // tab refreshDerived has already called it and a second run is pure duplicate work
  if(state.tab!=="base") updateMiniSummary();
  syncWakeLock();        // leaving the Make tab has to drop the lock
}
export function renderBase(){
  var isPct=state.unit==="pct";
  // oils
  oilList.innerHTML=""; oilRefs=[];
  if(state.oils.length===0){
    var em=el("div","empty"); em.appendChild(el("div",null,"No oils yet."));
    var eb=el("button","empty-btn","📖 Start from an example"); eb.type="button";
    eb.addEventListener("click",openExamples); em.appendChild(eb);
    em.appendChild(el("div","empty-sub","…or add an oil with the picker below."));
    oilList.appendChild(em);
  }
  else state.oils.forEach(function(it,i){ oilList.appendChild(buildOilRow(it,i)); });

  // additives
  addRefs=[];
  $("addSubhead").hidden = state.additives.length===0;
  addList.innerHTML="";
  state.additives.forEach(function(it,i){ addList.appendChild(buildAddRow(it,i)); });

  // lye controls state
  setActive($("lyeType"),"t",state.lyeType);
  $("purityCtrl").classList.toggle("hide",state.lyeType==="naoh");
  $("dualCtrl").classList.toggle("hide",state.lyeType!=="dual");
  // the salt question only exists if there's salt in the recipe
  var B=brineOf(curRV());
  $("saltCtrl").classList.toggle("hide",!(B.salt>0));
  if(B.salt>0){
    setActive($("saltModeSeg"),"sm",state.saltMode||"trace");
    $("brineHint").innerHTML = state.saltMode==="brine"
      ? "<b>"+fmt(B.per100,1)+" g</b> of salt per 100 g of water ("+fmt(B.pctSolution,1)+"% of the solution). Salt stops dissolving around "+SALT_MAX_PER100+" g per 100 g, and the lye competes for the same water."
      : "Stirred into the batter at trace — the usual way to make a salt or spa bar.";
  }
  $("sf").value=state.superfat; $("sfVal").textContent=state.superfat;
  $("water").value=state.waterPct; $("waterVal").textContent=state.waterPct;
  $("lyeConc").value=state.lyeConc; $("concVal").textContent=state.lyeConc;
  $("purity").value=state.kohPurity; $("purVal").textContent=state.kohPurity;
  $("dualKoh").value=state.dualKoh; $("dualKohVal").textContent=state.dualKoh;
  // superfat handling only differs for hot process, so the control only shows there
  var isHP=state.method==="hp", after=isHP&&state.sfMode==="after";
  $("sfModeCtrl").classList.toggle("hide",!isHP);
  if(isHP){
    setActive($("sfModeSeg"),"sf",state.sfMode||"discount");
    $("sfOilRow").classList.toggle("hide",!after);
    var oh='<option value="">spread across all oils</option>';
    state.oils.forEach(function(it){ if(it.key&&OILS[it.key]&&it.g>0)
      oh+='<option value="'+it.key+'">'+escapeHtml(it.name)+'</option>'; });
    $("sfOilSelect").innerHTML=oh; $("sfOilSelect").value=state.sfOil||"";
    var L2=computeLye(), wu=weightUnit();
    $("sfModeNote").textContent = after
      ? (L2.reserveG>0
          ? "Hold back "+fmt(fromG(L2.reserveG,wu),1)+" "+UNITS[wu].label+
            (L2.reserveName?" of "+L2.reserveName:" of your oils")+
            " and stir it in after the cook — the lye below saponifies only what goes in the pot, so you choose exactly what superfats the bar."
          : "Set a superfat above 0% to reserve some oil.")
      : "The lye is reduced by "+state.superfat+"%, leaving that much oil unsaponified — you don't control which fats stay free.";
  }
  var wmode=state.waterMode||"oils";
  setActive($("waterMode"),"w",wmode);
  $("waterOilsCtrl").classList.toggle("hide",wmode!=="oils");
  $("waterConcCtrl").classList.toggle("hide",wmode!=="conc");
  $("waterRatioCtrl").classList.toggle("hide",wmode!=="ratio");
  $("waterRatio").value=state.waterRatio; $("ratioVal").textContent=fmt(state.waterRatio,1);

  $("clearOils").hidden = !(state.oils.length||state.additives.length||state.aromas.length);
  if(!$("useSelect").options.length){ var uh=""; USES.forEach(function(u){ uh+='<option value="'+u[0]+'">'+u[1]+'</option>'; }); $("useSelect").innerHTML=uh; }
  $("useSelect").value=state.use;
  var has=state.oils.length>0;
  $("lyeCard").hidden=!has; $("safetyCard").hidden=!has; $("qualCard").hidden=!has; $("shapeCard").hidden=!has;
  $("pctNote").hidden=!(isPct&&has);
  $("addHint").textContent = isPct ? "New amounts are read in grams while in % view" : "Amount is in "+UNITS[state.unit].name;
  renderQuickAdd();

  var dataOils=state.oils.filter(oilInfo).length;
  Array.prototype.forEach.call($("shape").children,function(b){ b.disabled=dataOils<2; });

  refreshDerived();
}
export function pickLabel(sel){
  if(sel.indexOf("oil:")===0){ var o=OILS[sel.slice(4)]; return o?o.name:null; }
  if(sel.indexOf("add:")===0){ var a=ADDITIVES[sel.slice(4)]; return a?a.name:null; }
  return null;
}
export function renderQuickAdd(){
  var wrap=$("quickAdd"); if(!wrap) return;
  var picks=(state.recent||[]).filter(pickLabel);
  wrap.innerHTML=""; wrap.classList.toggle("hide",picks.length===0);
  if(!picks.length) return;
  wrap.appendChild(el("span","qa-lbl","Quick add"));
  picks.forEach(function(sel){
    var b=el("button","qa-chip",escapeHtml(pickLabel(sel))); b.type="button";
    b.addEventListener("click",function(){
      $("baseSelect").value=sel;
      $("baseSelect").dispatchEvent(new Event("change"));   // shows the description preview
      var amt=$("amtIn"); amt.focus(); if(amt.select) amt.select();
    });
    wrap.appendChild(b);
  });
}
export function buildOilRow(it,i){
  var row=el("div","row"), d=oilInfo(it);
  var top=el("div","top");
  var nameEl=el("div","name"); nameEl.appendChild(document.createTextNode(it.name));
  var descEl=null;
  if(d && d.desc){
    var q=el("button","qhelp","?"); q.type="button"; q.setAttribute("aria-label","About "+it.name); q.title="What is "+it.name+"?";
    nameEl.appendChild(document.createTextNode(" ")); nameEl.appendChild(q);
    descEl=el("div","oil-desc hide",escapeHtml(d.desc));
    q.addEventListener("click",function(){ descEl.classList.toggle("hide"); q.classList.toggle("on"); });
  }
  top.appendChild(nameEl);
  var amt=el("div","amt");
  var amtVal=document.createElement("input"); amtVal.className="amt-inp"; amtVal.type="text"; amtVal.inputMode="decimal";
  amtVal.setAttribute("aria-label",it.name+" amount");
  var amtU=el("span","u"); amt.appendChild(amtVal); amt.appendChild(amtU);
  amtVal.addEventListener("focus",function(){ activeInput=amtVal; if(amtVal.select) amtVal.select(); });
  amtVal.addEventListener("blur",function(){ activeInput=null; refreshDerived(); });
  amtVal.addEventListener("input",function(){
    var v=parseFloat(amtVal.value); if(!isFinite(v)||v<0) return;
    if(state.unit==="pct") setOilPercent(i,v); else it.g=v*UNITS[state.unit].toG;
    lastGoal=null; refreshDerived(amtVal); saveSoon();
  });
  var del=el("button","del","&times;"); del.type="button"; del.setAttribute("aria-label","Remove "+it.name);
  del.addEventListener("click",function(){ pushUndo(); var nm=it.name; state.oils.splice(i,1); lastGoal=null; save(); render(); showToast("Removed "+nm); });
  top.appendChild(amt); top.appendChild(del); row.appendChild(top);
  if(descEl) row.appendChild(descEl);
  if(d && d.note) row.appendChild(el("div","note",d.note));
  if(!d) row.appendChild(el("div","warn","No SAP/profile data — excluded from lye & quality math."));

  var sl=el("div","slider-line");
  var range=document.createElement("input"); range.type="range"; range.min="0"; range.max="100"; range.step="0.5";
  range.setAttribute("aria-label",it.name+" percent of oils");
  var pctLbl=el("span","pctlbl");
  range.addEventListener("input",function(){ setOilPercent(i,parseFloat(range.value)); lastGoal=null; refreshDerived(range); saveSoon(); });
  sl.appendChild(range); sl.appendChild(pctLbl); row.appendChild(sl);
  oilRefs[i]={slider:range,amtVal:amtVal,amtU:amtU,pctLbl:pctLbl};
  return row;
}
export function buildAddRow(it,i){
  var row=el("div","row"), d=it.key?ADDITIVES[it.key]:null;
  var top=el("div","top");
  var nm=el("div","name",escapeHtml(it.name));
  if(d){ nm.innerHTML+=' <span class="pill '+(d.kind==="liquid"?"base":"middle")+'">'+d.kind+'</span>'; }
  top.appendChild(nm);
  var del=el("button","del","&times;"); del.type="button";
  del.addEventListener("click",function(){ state.additives.splice(i,1); save(); render(); });
  top.appendChild(del); row.appendChild(top);
  if(d) row.appendChild(el("div","note",d.note));

  var ne=el("div","numedit");
  var inp=numInput();
  inp.setAttribute("aria-label",it.name+" amount");
  var u=el("span","u",UNITS[weightUnit()].label);
  var pctLbl=el("span","pctlbl");
  inp.addEventListener("focus",function(){activeInput=inp;});
  inp.addEventListener("blur",function(){activeInput=null;});
  inp.addEventListener("input",function(){
    var v=parseFloat(inp.value); it.g = isFinite(v)&&v>0 ? v*UNITS[weightUnit()].toG : 0;
    refreshDerived(inp); saveSoon();
  });
  ne.appendChild(inp); ne.appendChild(u); ne.appendChild(pctLbl); row.appendChild(ne);
  addRefs[i]={input:inp,pctLbl:pctLbl};
  return row;
}
export function renderScents(){
  aromaList.innerHTML=""; aromaRefs=[];
  if(state.aromas.length===0){ aromaList.appendChild(el("div","empty","No scents yet — add a fragrance or essential oil 👇")); }
  else state.aromas.forEach(function(it,i){ aromaList.appendChild(buildAromaRow(it,i)); });

  $("aromaHint").textContent = state.unit==="pct" ? "New amounts are read in grams while in % view" : "Amount is in "+UNITS[state.unit].name+" · sized against your total oils";
  $("scentSummary").hidden = state.aromas.length===0;
  refreshDerived();
}
export function buildAromaRow(it,i){
  var row=el("div","row"), d=it.key?AROMAS[it.key]:null;
  var top=el("div","top");
  var nm=el("div","name",escapeHtml(it.name));
  if(d){ nm.innerHTML+=' <span class="pill '+d.note+'">'+d.note+'</span> <span class="pill '+d.type.toLowerCase()+'">'+d.type+'</span>'; }
  top.appendChild(nm);
  var del=el("button","del","&times;"); del.type="button";
  del.addEventListener("click",function(){ state.aromas.splice(i,1); save(); render(); });
  top.appendChild(del); row.appendChild(top);
  if(d) row.appendChild(el("div","note",d.tips));
  var suggEl=el("div","note"); suggEl.style.color="var(--sage-dark)"; row.appendChild(suggEl);
  var warnEl=el("div","warn"); warnEl.style.display="none"; row.appendChild(warnEl);

  var ne=el("div","numedit");
  var inp=numInput();
  var u=el("span","u",UNITS[weightUnit()].label);
  var pctLbl=el("span","pctlbl");
  inp.addEventListener("focus",function(){activeInput=inp;});
  inp.addEventListener("blur",function(){activeInput=null;});
  inp.addEventListener("input",function(){
    var v=parseFloat(inp.value); it.g = isFinite(v)&&v>0 ? v*UNITS[weightUnit()].toG : 0;
    refreshDerived(inp); saveSoon();
  });
  ne.appendChild(inp); ne.appendChild(u); ne.appendChild(pctLbl); row.appendChild(ne);
  aromaRefs[i]={input:inp,pctLbl:pctLbl,sugg:suggEl,warn:warnEl,d:d};
  return row;
}
/* set oil i to target % of oils, keeping total oils constant */
export function setOilPercent(i,newPct){
  var total=totalOilsG(); if(total<=0) return;
  newPct=Math.max(0,Math.min(100,newPct));
  var target=total*newPct/100, others=total-state.oils[i].g;
  if(others<=0) return;
  var scale=(total-target)/others;
  state.oils.forEach(function(it,j){ if(j!==i) it.g*=scale; });
  state.oils[i].g=target;
}
/* ---------- refresh derived values (in place) ---------- */
export function refreshDerived(active){
  var isPct=state.unit==="pct", total=totalOilsG(), wunit=weightUnit();
  updateMiniSummary();

  // oils
  state.oils.forEach(function(it,i){ var r=oilRefs[i]; if(!r) return;
    var pct=total>0?it.g/total*100:0;
    if(r.slider!==active) r.slider.value=pct;
    r.pctLbl.textContent=fmt(pct,1)+"%";
    if(r.amtVal!==active && r.amtVal!==activeInput){
      r.amtVal.value = isPct ? fmt(pct,1) : fmt(fromG(it.g,state.unit),UNITS[state.unit].dp);
    }
    r.amtU.textContent = isPct ? "%" : UNITS[state.unit].label;
  });
  // additives
  state.additives.forEach(function(it,i){ var r=addRefs[i]; if(!r) return;
    if(r.input!==active && r.input!==activeInput) r.input.value = it.g>0 ? fmt(fromG(it.g,wunit),UNITS[wunit].dp) : "";
    r.pctLbl.textContent = total>0 ? fmt(it.g/total*100,1)+"% of oils" : "—";
  });

  if(state.tab==="base"){
    // total
    if(state.oils.length>0){ $("total").hidden=false;
      if(isPct){ $("totalVal").textContent="100"; $("totalUnit").textContent="%"; }
      else { $("totalVal").textContent=fmt(fromG(total,state.unit),UNITS[state.unit].dp); $("totalUnit").textContent=UNITS[state.unit].label; }
    } else $("total").hidden=true;

    updateScaleCard();
    if(state.oils.length>0){ updateLyePanel(); updateDilutePanel(); updateSafety(); updateQuality(); updateNotes(); updateShapeFeedback(); }
    else { $("diluteCard").hidden=true; $("notesCard").hidden=true; var sfb=$("shapeFeedback"); if(sfb){ sfb.className="shape-fb hide"; sfb.textContent=""; } }
  }

  if(state.tab==="scents") updateScents(active);
}
// Compact lye/batch readout pinned in the sticky header, so the numbers you're
// steering toward stay visible while you scroll a long ingredient list.
export function updateMiniSummary(){
  var box=$("miniSummary"); if(!box) return;
  var show = state.tab==="base" && state.oils.length>0;
  box.classList.toggle("hide",!show); if(!show) return;
  var L=computeLye(), wunit=weightUnit(), ul=UNITS[wunit].label;
  var lyeBits = L.kohShare>0 && L.kohShare<1
    ? "<span><b>"+fmt(fromG(L.naohG,wunit),2)+"</b> "+ul+" NaOH</span>"+
      "<span><b>"+fmt(fromG(L.kohG,wunit),2)+"</b> "+ul+" KOH</span>"
    : "<span><b>"+fmt(fromG(L.lyeG,wunit),2)+"</b> "+ul+" "+(state.lyeType==="koh"?"KOH":"NaOH")+"</span>";
  box.innerHTML=lyeBits+
    "<span><b>"+fmt(fromG(L.waterG,wunit),1)+"</b> "+ul+" water</span>"+
    "<span><b>"+fmt(fromG(currentBatchG(),wunit),1)+"</b> "+ul+" batch</span>";
}
export function updateLyePanel(){
  var wunit=weightUnit(), L=computeLye(), isPct=state.unit==="pct";
  $("lyeK").textContent=L.kind;
  $("lyeVal").textContent=fmt(fromG(L.lyeG,wunit),2); $("lyeUnit").textContent=UNITS[wunit].label;
  // the water you pour, with milk/aloe/coffee already taken off it
  $("waterOut").textContent=fmt(fromG(L.waterAddG,wunit),1); $("waterUnit").textContent=UNITS[wunit].label;
  var batch=currentBatchG();
  $("batchOut").textContent=fmt(fromG(batch,wunit),1); $("batchUnit").textContent=UNITS[wunit].label;
  var split=$("lyeSplit"), isDual=L.kohShare>0 && L.kohShare<1;
  split.classList.toggle("hide",!isDual);
  if(isDual) split.innerHTML="<span><b>"+fmt(fromG(L.naohG,wunit),2)+"</b> "+UNITS[wunit].label+" NaOH</span>"+
    "<span><b>"+fmt(fromG(L.kohG,wunit),2)+"</b> "+UNITS[wunit].label+" KOH</span>";
  var conc=lyeConcOf(L);
  var waterOfOils=L.oilG>0?L.waterG/L.oilG*100:0;
  var info=(state.waterMode==="oils"
      ? "Lye concentration ≈ "+fmt(conc,1)+"%"
      : "Water ≈ "+fmt(waterOfOils,1)+"% of oils · lye conc. ≈ "+fmt(conc,1)+"%")
    +(state.superfat>0?" · "+state.superfat+"% superfat":"");
  if(isPct) info+=" · shown in "+UNITS[wunit].name;
  if(L.hasCustom) info+=" · custom oils excluded";
  if(L.customSap) info+=" · custom SAP in use";
  if(L.acidG>0) info+=" · +"+fmt(fromG(L.acidG,wunit),2)+" "+UNITS[wunit].label+" for "+L.acidNames.join(" & ");
  if(L.overrides.length) info+=" · "+L.overrides.length+" supplier SAP value"+(L.overrides.length===1?"":"s");
  // Say what was actually done, with the arithmetic shown — the old line claimed the
  // replacement happened without performing it.
  if(L.replG>0) info+=" · water shown is after "+fmt(fromG(L.replG,wunit),1)+" "+UNITS[wunit].label+
    " of "+L.replNames.join(" & ")+" ("+fmt(fromG(L.liquidG,wunit),1)+" "+UNITS[wunit].label+" liquid in total)";
  $("lyeInfo").textContent=info;
}
// KOH soap is cooked to a paste, then thinned with water. Sizes that dilution.
export function updateDilutePanel(){
  var card=$("diluteCard"); if(!card) return;
  var isKOH = state.lyeType==="koh" && state.oils.length>0;
  card.hidden=!isKOH; if(!isKOH) return;
  var wunit=weightUnit(), ul=UNITS[wunit].label;
  var ratio=state.dilution>0?state.dilution:1;
  var paste=currentBatchG(), water=paste*ratio, yieldG=paste+water;
  $("dilution").value=ratio; $("dilVal").textContent=fmt(ratio,2);
  $("pasteOut").textContent=fmt(fromG(paste,wunit),1);   $("pasteUnit").textContent=ul;
  $("dilWaterOut").textContent=fmt(fromG(water,wunit),1); $("dilWaterUnit").textContent=ul;
  $("dilYieldOut").textContent=fmt(fromG(yieldG,wunit),1);$("dilYieldUnit").textContent=ul;
  var use=state.use||"body", target =
    use==="dish" ? "Dish soap is usually thinner — around 2–3× water." :
    use==="hair" ? "Shampoo is usually thin — around 2–3× water." :
    "Hand and body soap is usually around 1–2× water.";
  var feel = ratio<=0.75 ? "Thick, almost gel-like." : ratio<=1.5 ? "A classic pourable hand soap." :
             ratio<=2.5 ? "Thin and fast-rinsing." : "Very thin — closer to a foamer refill.";
  $("dilHint").textContent = feel+" "+target+" Start thicker: you can always add more water, but you can't take it out.";
}
export function updateQuality(){
  var B=blendFA(), barsEl=$("bars"); barsEl.innerHTML="";
  QUALITIES.forEach(function(q){
    var v=q.fn(B.fa), inR=v>=q.lo&&v<=q.hi;
    var wrap=el("div","qbar");
    var t=el("div","qtop");
    var left=el("span"); left.appendChild(document.createTextNode(q.label+" "));
    var help=el("button","qhelp"+(openHelp===q.key?" on":""),"?"); help.type="button"; help.setAttribute("aria-label","About "+q.label);
    help.addEventListener("click",function(){ toggleHelp(q.key); });
    left.appendChild(help);
    var val=el("b",null,String(Math.round(v))); if(!inR) val.className="off";
    t.appendChild(left); t.appendChild(val); wrap.appendChild(t);
    var track=el("div","track");
    var band=el("div","band"); band.style.left=(q.lo/q.scale*100)+"%"; band.style.width=((q.hi-q.lo)/q.scale*100)+"%";
    var fill=el("div","fill"+(inR?"":" off")); fill.style.width=Math.min(100,v/q.scale*100)+"%";
    track.appendChild(band); track.appendChild(fill); wrap.appendChild(track); barsEl.appendChild(wrap);
  });
  var chipsEl=$("chips"); chipsEl.innerHTML="";
  chipsEl.appendChild(makeChip("Iodine",B.iod,IOD_RANGE,"iodine"));
  chipsEl.appendChild(makeChip("INS",B.ins,INS_RANGE,"ins"));
  // explanation panel
  var ex=$("qualExplain");
  if(openHelp && QUAL_HELP[openHelp]){
    ex.className="qual-explain";
    ex.innerHTML="<b>"+QUAL_LABELS[openHelp]+" <span class='r'>· good range "+helpRange(openHelp)+"</span></b>"+escapeHtml(QUAL_HELP[openHelp]);
  } else { ex.className="qual-explain hide"; ex.textContent=""; }
  // Beeswax and jojoba are wax esters, not triglycerides, and macadamia's palmitoleic
  // acid has no slot in the eight this app tracks — so they carry weight without adding
  // to the profile, and every number above comes out lower. Derived from the blend
  // rather than a hard-coded list of three keys, so a future oil is covered too.
  var thin=[], thinG=0;
  state.oils.forEach(function(it){ var d=it.key?OILS[it.key]:null; if(!d||!(it.g>0)) return;
    var s=0; for(var k in d.fa) s+=d.fa[k];
    if(s<60){ thinG+=it.g; if(thin.indexOf(d.name)<0) thin.push(d.name); } });
  var thinPct = B.tot>0 ? thinG/B.tot*100 : 0;
  $("qualNote").textContent = B.tot>0
    ? "Tap the ? on any quality to learn what it means. Green band = typical range; amber = outside it."
      + (thinPct>=2 ? " "+thin.join(" & ")+" ("+Math.round(thinPct)+"% here) barely register on this scale — they aren't ordinary triglycerides, so they add weight without adding profile, and every figure above reads lower because of it." : "")
    : "Add oils with profile data to see qualities.";
}
/* ---------- context-aware recipe notes (soap base) ---------- */
export function updateNotes(){
  var notes=recipeNotes(), box=$("recipeNotes"); box.innerHTML="";
  $("notesCard").hidden = notes.length===0;
  notes.forEach(function(n){
    var d=el("div","tip");
    var b=el("b",null,n[1]); if(n[0]==="warn") b.style.color="var(--amber)"; else if(n[0]==="soft") b.style.color="var(--terra)";
    d.appendChild(b); d.appendChild(el("span",null,n[2]));
    box.appendChild(d);
  });
}
export function recipeNotes(){
  var out=[], B=blendFA(), f=B.fa;
  function hasOil(key){ return state.oils.some(function(it){ return it.key===key; }); }
  function hasAdd(key){ return state.additives.some(function(it){ return it.key===key; }); }
  var use=state.use||"body", sf=state.superfat;
  if(B.tot>0){
    var q=qualitiesOf(f), hard=q.hardness, clean=q.cleansing, cond=q.conditioning, bub=q.bubbly, poly=q.poly;
    // hardness matters for every use
    if(hard<29 && use!=="hair") out.push(["soft","Bar may come out soft","Hardness is "+Math.round(hard)+" (aim 29–54). Add a hard oil (coconut, palm, or a butter) or a little sodium lactate for a firmer bar that unmolds cleanly."]);
    else if(hard>54) out.push(["warn","Very hard blend","Hardness is "+Math.round(hard)+" — bars this hard can turn brittle and crack. Ease back on hard oils/butters."]);

    if(use==="dish"){
      if(clean<28) out.push(["warn","Low cleansing for dish soap","Cleansing is "+Math.round(clean)+" — dish soap needs strong grease-cutting. Add coconut or palm-kernel oil."]);
      if(sf>2) out.push(["warn","Superfat too high for dishes","Superfat is "+sf+"% — for dish soap aim ~0–1% so it rinses clean and doesn't leave a greasy film."]);
      out.push(["tip","Meant to cut grease","A high-cleansing, 'drying' profile is exactly right here — that's what strips grease. Dilute well for hand-washing."]);
    } else if(use==="laundry"){
      if(clean<28) out.push(["warn","Low cleansing for laundry","Cleansing is "+Math.round(clean)+" — add coconut (or palm-kernel) for real cleaning power."]);
      if(sf>1) out.push(["warn","Drop superfat to 0%","Superfat is "+sf+"% — laundry soap should be 0% so no leftover oils deposit on your clothes."]);
      out.push(["tip","Finishing a laundry bar","Cure hard, grate it, and mix ~1:1:1 with washing soda + borax. A high-cleansing, no-superfat bar is the goal."]);
    } else {
      // skin-contact uses (body / face / hair / shave)
      var cleanCap = cleansingCap(use);
      if(clean>cleanCap) out.push(["warn", use==="hair"?"May strip hair":"May feel drying",
        "Cleansing is "+Math.round(clean)+" — "+(use==="hair"?"soap-shampoo this cleansing can leave hair squeaky/frizzy. Add conditioning oils":"raise your superfat or cut coconut / palm-kernel oil")+"."]);
      if(cond<44) out.push(["soft","Low conditioning","Conditioning is "+Math.round(cond)+" (aim 44–69). Add soft oils like olive, sweet almond, or avocado."]);
      if(bub<14 && oilPct("castor")<3) out.push(["soft","Light on lather","Bubbly lather is "+Math.round(bub)+". A bit more coconut/palm-kernel, or ~5% castor, boosts the bubbles."]);
      if(use==="shave" && q.creamy<30) out.push(["soft","Thin shaving lather","Creamy lather is low ("+Math.round(q.creamy)+"). Add stearic acid or a butter — plus a little clay — for a slick, dense brush lather."]);
      if(use==="face" && sf<6) out.push(["tip","Facial bars love a higher superfat","Consider ~6–8% superfat for a gentler, more moisturizing face bar."]);
      if(use==="hair") out.push(["tip","Soap-based shampoo","It's high-pH — finish with a diluted apple-cider-vinegar rinse to smooth the hair cuticle."]);
    }
    if(poly>18) out.push(["warn","Watch for rancidity (DOS)","This blend is "+Math.round(poly)+"% polyunsaturated (linoleic+linolenic). Those oils go rancid faster — use fresh oils, keep superfat modest, and consider an antioxidant like ROE."]);
  }
  if(oilPct("castor")>10) out.push(["warn","High castor","Castor is "+Math.round(oilPct("castor"))+"% — wonderful for lather but it can make soap soft and sticky. 5–8% is usually plenty."]);
  if(hasOil("olive") && state.oils.length===1) out.push(["tip","Castile soap","Pure olive oil is beautifully gentle, but trace is slow and it needs a long cure (4–6 weeks or more) to firm up."]);
  if(hasOil("beeswax")) out.push(["tip","Beeswax present","Beeswax firms the bar but speeds up trace and can mute lather — keep it around 1–3%."]);
  if(hasOil("stearic")) out.push(["tip","Stearic acid present","Stearic acid accelerates trace fast — mix and pour quickly."]);
  if(hasOil("palmkernel") && hasOil("coconut")) out.push(["tip","Coconut + palm kernel","Both are high-cleansing lauric oils. Together they can get drying — keep the combined amount in check and superfat a touch higher."]);
  if(hasAdd("goatmilk")||hasAdd("coconutmilk")) out.push(["tip","Making a milk soap","Swap part or all of your water for the milk. Keep it cold or frozen and add the lye slowly to stop it scorching (or use powdered milk at trace)."]);
  if(hasAdd("honey")) out.push(["tip","Honey added","Honey feeds lather but can overheat the batch — soap at a cooler temperature and watch for gel/volcano."]);
  return out;
}
export function safetyChecks(){
  var items=[], L=computeLye(), sf=state.superfat, use=state.use||"body";
  var skin=(use==="body"||use==="face"||use==="hair"||use==="shave");
  var f=blendFA().fa, poly=f.li+f.ln;
  var conc=lyeConcOf(L);
  var tot=totalOilsG();
  function addPctOf(key){ var g=0; state.additives.forEach(function(it){ if(it.key===key) g+=it.g; }); return tot>0?g/tot*100:0; }
  var saltPct=addPctOf("salt"), saltBar=saltPct>=20;
  function add(level,title,detail){ items.push({level:level,title:title,detail:detail}); }
  var wu=weightUnit();
  function showG(g){ return fmt(fromG(g,wu),wu==="g"?0:1)+" "+UNITS[wu].label; }

  if(L.oilG<=0 || L.lyeG<=0){
    add("fail","Can't verify the lye","No oils with SAP data, so the app can't confirm the lye is balanced. Add oils from the list (custom oils have no data).");
  } else {
    if(L.hasCustom) add("warn","Custom oils aren't in the lye math","The lye is sized only for oils that have data, so your true superfat is higher and unverified. Add the SAP value from the bottle in SAP values, or look it up, before you make this.");
    if(L.acidG>0){
      var acidPct=tot>0 ? state.additives.reduce(function(a,it){
        var d=it.key?ADDITIVES[it.key]:null; return a+((d&&d.lyeFactor>0)?it.g:0); },0)/tot*100 : 0;
      add("ok","Lye raised for "+L.acidNames.join(" & "),
        "An acid neutralises lye, so the batch needs "+fmt(L.acidG,2)+" g extra "+
        (state.lyeType==="koh"?"KOH":state.lyeType==="dual"?"lye (split across both)":"NaOH")+" on top of what the oils want. Superfat doesn't discount that part — it's the amount the acid consumes. Dissolve the acid in the water before the lye goes in.");
      if(acidPct>3) add("warn","That's a lot of acid",
        "At "+fmt(acidPct,1)+"% of oils you're neutralising a large share of the lye. 0.5–2% is the usual range for chelating; more just means more lye for no extra benefit.");
    }
    // a custom additive carries no data, so it silently gets no adjustment
    var missedAcid=state.additives.filter(function(it){
      return !it.key && it.g>0 && /citric|acetic|vinegar|lactic acid|glycolic/i.test(it.name||""); });
    if(missedAcid.length) add("fail","Acid isn't in the lye math",
      "“"+missedAcid[0].name+"” was entered as a custom additive, so the app can't know it neutralises lye — the batch will be short. Remove it and pick the matching entry from the ingredient list instead.");
    if(L.customSap) add("ok","Custom oil using the SAP you entered","A custom oil is in the lye maths on your own SAP figure. The number is only as good as the source you took it from — check it against the supplier's spec sheet.");
    if(L.overrides.length) add("warn","Supplier SAP values in use",
      "The lye for "+L.overrides.map(function(k){ return OILS[k].name; }).join(", ")+
      " is sized on the value you entered, not our reference. That's the right thing to do if it came off the spec sheet — just be sure it's the current one.");
    // Judge the superfat the bar actually ends up with, not the one that was asked for.
    // They differ when an after-the-cook reserve is capped by how much of the chosen oil
    // there is — and it's the real cushion that decides whether this is safe.
    var esf=L.effectiveSf, esfTxt=fmt(esf,esf===Math.round(esf)?0:1)+"%";
    if(esf<=0){
      if(skin) add("warn","No superfat cushion","Superfat is 0% — with no extra oil, a small measuring slip could leave free lye, which is harsh on skin. Use at least 1–2% for a skin bar.");
      else add("ok","0% superfat is intended here","For dish/laundry soap, 0% superfat is correct so no oil is left behind.");
    } else if(esf>12 && !saltBar){
      add("warn","Very high superfat","Superfat is "+esfTxt+" — that's a lot of unsaponified oil, so the bar stays soft and can go rancid sooner. 5–8% is typical for skin.");
    } else {
      add("ok","Lye is balanced","Superfat "+esfTxt+" leaves a little extra oil so no free lye is left over — this is the safe zone"+(saltBar?" (a high superfat is right for a salt bar)":"")+".");
    }
    // milk/aloe/coffee standing in for more liquid than the recipe has room for
    if(L.replOver) add("warn","More "+L.replNames.join(" & ")+" than the recipe's water",
      "You've got "+showG(L.replG)+" of "+L.replNames.join(" & ")+" standing in for "+showG(L.waterG)+
      " of water, so there's "+showG(L.replG-L.waterG)+" more liquid in the batch than any water setting asked for. "+
      "The lye solution will be weaker than the "+Math.round(conc)+"% shown, and the bar slower to set. "+
      "Cut it to about "+showG(L.waterG)+", or raise the water setting to match.");
    // an after-the-cook reserve is capped by how much of the chosen oil there is
    if(L.effectiveSf < sf-0.05) add("warn","Superfat is smaller than it looks",
      "You asked for "+sf+"% held back after the cook, but there's only "+showG(L.reserveG)+" of "+
      (L.reserveName||"that oil")+" to hold back — so the bar actually ends up around "+
      fmt(L.effectiveSf,1)+"% superfatted, not "+sf+"%. Hold back a second oil, or pick one there's more of.");
    if(conc>=43) add("warn","Strong lye solution","Lye concentration is about "+Math.round(conc)+"% — it heats up fast and is harsher to handle. Mix slowly and watch the temperature.");
    else if(conc>0 && conc<25) add("warn","Very dilute lye","Lye concentration is only about "+Math.round(conc)+"% — that's a lot of water. The bar will be soft, slow to set and may weep; use less water (or a higher lye concentration).");
  }

  // the classic "100% coconut" trap: very cleansing lauric oils need a big superfat on skin
  var lauric=oilPct(LAURIC_OILS);
  if(skin && lauric>=80 && sf<15)
    add("warn","Very high lauric oil","This is "+Math.round(lauric)+"% "+lauricNames().join(", ")+" — famously harsh and drying on skin at a normal superfat. Either treat it as a salt or laundry bar, or push superfat up to ~15–20%.");

  // brine is only a method if the salt will actually dissolve
  var B=brineOf(curRV());
  if(B.salt>0 && state.saltMode==="brine"){
    if(B.per100>SALT_MAX_PER100)
      add("fail","That salt won't dissolve",
        "You're asking for "+fmt(B.per100,0)+" g of salt per 100 g of water. Salt stops going in around "+SALT_MAX_PER100+" g per 100 g at room temperature, and the lye competes for the same water. Either add it dry at trace instead, or cut the salt to about "+
        fmt(fromG(B.water*0.25,weightUnit()),0)+" "+UNITS[weightUnit()].label+" for a comfortable brine.");
    else if(B.per100>25)
      add("warn","Close to a saturated brine",
        fmt(B.per100,1)+" g per 100 g of water is near the "+SALT_MAX_PER100+" g ceiling. It should dissolve in warm water, but add the salt first, let it go clear, and only then add the lye.");
    else
      add("ok","Brine will dissolve",
        fmt(B.per100,1)+" g of salt per 100 g of water dissolves comfortably. Stir it into the water until clear before the lye goes in.");
    if(saltPct>=20)
      add("warn","That's salt-bar amounts, dissolved",
        "At "+Math.round(saltPct)+"% of oils this is salt-bar territory rather than a brine soap, which usually lands nearer 3–8% of oils. Worth checking you meant the water and not the trace.");
  }
  // salt bars behave differently
  if(saltBar){
    if(sf<12) add("warn","Salt bar needs more superfat","With ~"+Math.round(saltPct)+"% salt, use a high superfat (~15–20%) and plenty of coconut or it'll be drying and crumbly.");
    else add("ok","Salt bar — cut it warm","Salt bars set very hard, very fast. Cut it while still warm (within a few hours) or it will crumble.");
  }

  // batch size sanity — too small to weigh the lye safely, or unwieldy-large for a beginner
  if(tot>0 && tot<150) add("warn","Very small batch","Only "+showG(tot)+" of oils — at this size the lye is hard to weigh accurately and a tiny scale error becomes a big percentage. Scale up to ~300 g+ of oils for a safer batch.");
  else if(tot>5000) add("warn","Large batch","About "+showG(tot)+" of oils — that's a big, heavy batch that holds heat (overheating risk) and is a lot to handle at once. Fine if you're experienced; otherwise start smaller.");

  // a runaway single oil usually means a missed oil or a mistyped amount
  if(tot>0){
    var top=null,topg=0; state.oils.forEach(function(it){ if(it.g>topg){ topg=it.g; top=it; } });
    if(top && top.key && top.key!=="olive" && top.key!=="coconut" && topg/tot>=0.95)
      add("warn","Nearly a single-oil recipe","This is about "+Math.round(topg/tot*100)+"% "+top.name+". A one-oil bar is unusual (apart from an olive castile) — double-check you didn't miss an oil or mistype an amount.");
  }

  // an additive dosed like an oil is a common grams-vs-teaspoons slip (salt & water-replacers excluded)
  // Specific caps where the usual dose is well known. This used to be the *only* way an
  // additive got checked, so anything not listed — sodium citrate, sodium gluconate —
  // sailed through at any dose. Now it's an exception table over a default, and the
  // exemptions are named: things that legitimately run high. Same inversion as
  // recipeShareURL()'s allow-list, for the same reason — a list you must remember to
  // extend is a list that eventually isn't.
  var ADD_CAP={honey:10,sugar:10,sodiumlactate:5,oatmeal:15,kaolin:10,bentonite:10,charcoal:5,glycerin:8,silk:2,vitamine:2,titanium:6,mica:6,coffeegrounds:20};
  var ADD_CAP_DEFAULT=5;                    // most additives are teaspoons-per-pound territory
  function capFor(it){
    var d=it.key?ADDITIVES[it.key]:null;
    if(!d) return 0;                        // custom additive: no data, no opinion
    if(ADD_CAP[it.key]) return ADD_CAP[it.key];
    if(d.colorant) return 0;                // dosed by eye, and harmless in excess
    if(d.replacesWater) return 0;           // sized against the water, checked separately
    if(it.key==="salt") return 0;           // salt bars are legitimately 20%+ of oils
    return ADD_CAP_DEFAULT;
  }
  var odose=[];
  state.additives.forEach(function(it){ var cap=capFor(it); if(cap && tot>0){ var pct=it.g/tot*100; if(pct>cap+0.5) odose.push(it.name+" (~"+fmt(pct,1)+"% vs ~"+cap+"% usual)"); } });
  if(odose.length) add("warn","Additive dosed high", odose.join("; ")+". That's well above the usual amount — double-check it isn't a units slip (grams vs teaspoons).");

  var scentG=sumG(state.aromas);
  var scentPct = tot>0 ? scentG/tot*100 : 0, over=[];
  state.aromas.forEach(function(it){ var d=it.key?AROMAS[it.key]:null;
    if(d && tot>0){ var pct=it.g/tot*100; if(pct > d.rate[2]+0.05) over.push(it.name+" (~"+fmt(pct,1)+"% vs "+d.rate[2]+"% max)"); } });
  // "typical max", not "skin-safe max": these are common soaping figures, not IFRA
  // limits. A real limit depends on the product category and on the specific restricted
  // constituent, and only the supplier's IFRA certificate has that number.
  if(over.length) add("warn","Scent above its typical max", over.join("; ")+
    ". These are usual soaping rates, not regulatory limits — check the supplier's IFRA certificate for the binding figure, and ease these back meanwhile.");
  if(skin && scentPct>6) add("warn","Heavy scent load","Total scent is about "+fmt(scentPct,1)+"% of oils — above ~5–6% can irritate skin. Ease it back.");

  if(poly>18) add("warn","Prone to rancid spots (DOS)","This blend is about "+Math.round(poly)+"% polyunsaturated oil, which spoils faster. Use fresh oils, keep superfat modest, and consider vitamin E / ROE.");

  // fast trace: seizes the batch if you're not ready
  var accel=[];
  if(state.oils.some(function(it){return it.key==="beeswax"&&it.g>0;})) accel.push("beeswax");
  if(state.oils.some(function(it){return it.key==="stearic"&&it.g>0;})) accel.push("stearic acid");
  state.aromas.forEach(function(it){ var d=it.key?AROMAS[it.key]:null; if(d&&d.accel&&it.g>0) accel.push(d.name); });
  if(accel.length) add("warn","Fast trace ahead","Contains "+accel.join(", ")+" — these speed up trace and can seize the batch. Soap at a cool temperature, ease off the stick blender once it thickens, and have your mold ready before you start.");

  // skin-irritant essential oils
  var irritants=[];
  state.aromas.forEach(function(it){ var d=it.key?AROMAS[it.key]:null; if(d&&d.irritant&&it.g>0) irritants.push(d.name); });
  if(irritants.length) add("warn","Skin-irritant scents","Contains "+irritants.join(", ")+" — these can irritate skin. Keep them at the low end of their range and patch-test a small bar before making a full batch.");

  var fail=items.some(function(i){return i.level==="fail";});
  var warn=items.some(function(i){return i.level==="warn";});
  var verdict = fail ? {level:"fail",text:"Not safe to make as-is"}
    : (warn ? {level:"warn",text:"Safe to make, but read the notes below"}
            : {level:"ok",text:"Looks good — core safety checks pass"});
  return {verdict:verdict, items:items,
    ctx:{use:use, sf:sf, lyeType:state.lyeType, conc:Math.round(conc), scentPct:+fmt(scentPct,1)}};
}
export function updateSafety(){
  var card=$("safetyCard"); if(!card) return;
  var S=safetyChecks(); lastSafety=S;
  var v=$("safetyVerdict");
  v.className="safety-verdict "+S.verdict.level;
  v.textContent=(S.verdict.level==="fail"?"⛔ ":S.verdict.level==="warn"?"⚠️ ":"✅ ")+S.verdict.text;
  var list=$("safetyList"); list.innerHTML="";
  S.items.forEach(function(it){
    var row=el("div","safety-item "+it.level);
    row.appendChild(el("div","si-title",escapeHtml(it.title)));
    row.appendChild(el("div","si-detail",escapeHtml(it.detail)));
    list.appendChild(row);
  });
  // a fresh recipe state invalidates any prior AI summary
  $("aiOut").classList.add("hide"); $("aiOut").textContent=""; $("aiNote").hidden=true;
  maybeShowAI();
}
export function maybeShowAI(){ var b=$("aiExplain"); if(b) b.classList.toggle("hide", !(aiAvail&&lastSafety)); }
/* ---------- scale recipe ---------- */
export function moldOilsG(){
  var shape=state.moldShape||"loaf";
  // rule of thumb: ~0.4 oz of oils per in³ (~0.69 g per cm³ / per mL)
  var perVol = $("mUnit").value==="cm" ? 0.6917 : 0.4*UNITS.oz.toG;
  if(shape==="round"){
    var D=parseFloat($("mD").value), RH=parseFloat($("mRH").value);
    if(!(D>0&&RH>0)) return 0;
    return Math.PI*Math.pow(D/2,2)*RH*perVol;                 // cylinder volume × oils-per-volume
  }
  if(shape==="cavity"){
    var n=parseFloat($("mCount").value), ml=parseFloat($("mCavVol").value);
    if(!(n>0&&ml>0)) return 0;
    return n*ml*0.6917;                                       // mL = cm³, so use the metric factor
  }
  var L=parseFloat($("mL").value), W=parseFloat($("mW").value), H=parseFloat($("mH").value);
  if(!(L>0&&W>0&&H>0)) return 0;
  return L*W*H*perVol;
}
export function scaleAll(factor){
  if(!(factor>0)||!isFinite(factor)) return;
  state.oils.forEach(function(it){ it.g*=factor; });
  state.additives.forEach(function(it){ it.g*=factor; });
  state.aromas.forEach(function(it){ it.g*=factor; });
  save(); render();
}
export function applyWeightScale(){
  var isBars=state.scaleMode==="bars", wunit=scaleUnit(), raw=parseFloat($("scaleTarget").value);
  if(!(raw>0)) return;
  var targetG = isBars ? raw*barG() : raw*UNITS[wunit].toG;   // N bars → the wet weight of N bars at your bar size
  var cur = state.scaleMode==="oils" ? totalOilsG() : currentBatchG();
  if(cur<=0) return;
  scaleDirty=false; $("scaleTarget").value="";
  pushUndo(); scaleAll(targetG/cur);
  showToast(isBars ? ("Recipe scaled to ~"+Math.round(raw)+" bar"+(Math.round(raw)===1?"":"s"))
    : ("Recipe scaled to "+fmt(raw,UNITS[wunit].dp)+" "+UNITS[wunit].label+(state.scaleMode==="oils"?" of oils":" wet")));
}
// Scaling leaves amounts like 793.83 g that nobody weighs out. Snap every ingredient to a
// practical step in the unit you're working in; the lye is recomputed from the new amounts.
export function roundStepG(u){ return u==="g" ? 1 : u==="oz" ? UNITS.oz.toG*0.1 : u==="lb" ? UNITS.lb.toG*0.01 : 10; }
export function roundAmounts(){
  var wunit=weightUnit(), step=roundStepG(wunit);
  if(!(totalOilsG()>0)) return;
  pushUndo();
  [state.oils,state.additives,state.aromas].forEach(function(list){
    list.forEach(function(it){ if(it.g>0) it.g=Math.max(step,Math.round(it.g/step)*step); });
  });
  lastGoal=null; save(); render();
  showToast("Rounded to tidy "+UNITS[wunit].name);
}
export function applyMold(){
  var target=moldOilsG(); if(target<=0) return;
  var cur=totalOilsG(); if(cur<=0) return;
  pushUndo(); scaleAll(target/cur); showToast("Scaled to fit mold");
}
export function updateScaleCard(){
  if(state.oils.length===0){ $("scaleCard").hidden=true; return; }
  $("scaleCard").hidden=false;
  setActive($("scaleMode"),"m",state.scaleMode);
  var isMold=state.scaleMode==="mold", wunit=weightUnit(), ul=UNITS[wunit].label;
  var sunit=scaleUnit();
  $("scaleWeight").classList.toggle("hide",isMold);
  $("scaleMoldWrap").classList.toggle("hide",!isMold);
  var ms=state.moldShape||"loaf";
  setActive($("moldShape"),"ms",ms);
  $("moldLoaf").classList.toggle("hide",ms!=="loaf");
  $("moldRound").classList.toggle("hide",ms!=="round");
  $("moldCavity").classList.toggle("hide",ms!=="cavity");
  $("moldUnitRow").classList.toggle("hide",ms==="cavity");
  var isBars=state.scaleMode==="bars";
  if(!$("scaleUnit").options.length){ var uh=""; UORDER.filter(function(u){ return u!=="pct"; }).forEach(function(u){ uh+='<option value="'+u+'">'+UNITS[u].label+'</option>'; }); $("scaleUnit").innerHTML=uh; }
  $("scaleUnit").value=sunit;
  $("scaleUnit").classList.toggle("hide",isBars);
  $("scaleBarsUnit").classList.toggle("hide",!isBars);
  $("scaleTarget").placeholder = isBars ? "Number of bars" : (state.scaleMode==="oils" ? "Target oils" : "Target wet weight");
  var oilsG=totalOilsG(), batchG=currentBatchG();

  // expected yield readout
  $("yieldVal").textContent=fmt(fromG(batchG,wunit),UNITS[wunit].dp);
  $("yieldUnit").textContent=ul;
  var bars=barCount(batchG);
  var barShown=fmt(fromG(barG(),wunit),UNITS[wunit].dp);
  $("yieldBars").textContent="≈ "+bars+" bar"+(bars===1?"":"s")+" (~"+barShown+" "+ul+" each) · "+fmt(fromG(oilsG,wunit),1)+" "+ul+" of oils";
  var cured=curedBatchG(), lossPct = batchG>0 ? (batchG-cured)/batchG*100 : 0;
  $("yieldCured").textContent="After curing ≈ "+fmt(fromG(cured,wunit),1)+" "+ul+
    " (about "+Math.round(lossPct)+"% lighter as the water dries out)";
  var BAR_STEP={g:5,oz:0.25,lb:0.05,kg:0.05};
  $("barWUnit").textContent=ul;
  $("barW").step=BAR_STEP[wunit]||1;
  $("barW").min=fmt(fromG(10,wunit),3);
  if($("barW")!==document.activeElement) $("barW").value=barShown;

  // reuse the target field to also show the current amount (in the target's unit) until edited
  if(!isMold && !scaleDirty && document.activeElement!==$("scaleTarget")){
    if(isBars){ $("scaleTarget").value = batchG>0 ? barCount(batchG) : ""; }
    else { var curShown = state.scaleMode==="oils" ? oilsG : batchG;
      $("scaleTarget").value = curShown>0 ? fmt(fromG(curShown,sunit),UNITS[sunit].dp) : ""; }
  }
  updateScaleHint(); updateMoldHint();
}
export function updateScaleHint(){
  var isBars=state.scaleMode==="bars", sunit=scaleUnit(), sul=UNITS[sunit].label, raw=parseFloat($("scaleTarget").value);
  if(!scaleDirty || !(raw>0)){
    $("scaleHint").textContent = isBars
      ? "Shows how many bars this batch makes (at ~"+fmt(fromG(barG(),sunit),UNITS[sunit].dp)+" "+sul+" each) — type how many you want and tap Scale."
      : state.scaleMode==="oils"
      ? "Shows your current total oils — type a new target and tap Scale."
      : "Shows your current wet (poured) weight — type how much soap you want and tap Scale.";
    return;
  }
  var targetG = isBars ? raw*barG() : raw*UNITS[sunit].toG;
  var cur = state.scaleMode==="oils" ? totalOilsG() : currentBatchG();
  if(cur<=0){ $("scaleHint").textContent=""; return; }
  var f=targetG/cur;
  $("scaleHint").textContent="× "+fmt(f,3)+" → oils "+fmt(fromG(totalOilsG()*f,sunit),1)+" "+sul+" · wet "+fmt(fromG(currentBatchG()*f,sunit),1)+" "+sul;
}
export function updateMoldHint(){
  var wunit=weightUnit(), ul=UNITS[wunit].label, t=moldOilsG();
  if(t<=0){ $("moldHint").textContent = {
    round:"Enter the inner diameter × height of a round/column mold.",
    cavity:"Enter how many cavities and how much each one holds (mL).",
    loaf:"Enter the inner Length × Width × Height of a loaf/box mold."
  }[state.moldShape||"loaf"]; return; }
  var cur=totalOilsG(), f=cur>0?t/cur:0;
  $("moldHint").textContent="≈ "+fmt(fromG(t,wunit),1)+" "+ul+" of oils for this mold"+(f>0?"  (× "+fmt(f,3)+")":"");
}
export function updateScents(active){
  var totalOil=totalOilsG(), wunit=weightUnit();
  var scentG=sumG(state.aromas);
  var buckets={top:0,middle:0,base:0};
  state.aromas.forEach(function(it,i){
    var r=aromaRefs[i]; if(!r) return;
    if(r.input!==active && r.input!==activeInput) r.input.value = it.g>0 ? fmt(fromG(it.g,wunit),UNITS[wunit].dp) : "";
    var pct = totalOil>0 ? it.g/totalOil*100 : 0;
    r.pctLbl.textContent = totalOil>0 ? fmt(pct,2)+"% of oils" : "add oils first";
    if(r.d){
      buckets[r.d.note]+=it.g;
      var sug = totalOil>0 ? " (~"+fmt(fromG(totalOil*r.d.rate[1]/100,wunit),1)+" "+UNITS[wunit].label+")" : "";
      r.sugg.textContent="Typical "+r.d.rate[1]+"% of oils"+sug+" · currently "+fmt(pct,2)+"%";
      // per-scent safety: flag when above its own max usage rate
      if(totalOil>0 && it.g>0 && pct > r.d.rate[2] + 0.05){
        r.warn.textContent="⚠ Above its ~"+r.d.rate[2]+"% typical max — reduce to ≈ "+fmt(fromG(totalOil*r.d.rate[2]/100,wunit),1)+" "+UNITS[wunit].label+". Your supplier's IFRA certificate has the binding figure.";
        r.warn.style.display="";
      } else r.warn.style.display="none";
    } else { r.sugg.textContent=""; if(r.warn) r.warn.style.display="none"; }
  });
  if(state.aromas.length>0){
    $("scentTotal").textContent=fmt(fromG(scentG,wunit),1); $("scentUnit").textContent=UNITS[wunit].label;
    var pct=totalOil>0?scentG/totalOil*100:0;
    $("scentPct").textContent = totalOil>0 ? fmt(pct,2) : "—";
    var advice;
    var recG = totalOil>0 ? " Recommended ≈ "+fmt(fromG(totalOil*0.03,wunit),1)+" "+UNITS[wunit].label+" (3% of oils; safe range ~2–5%)." : "";
    if(totalOil<=0) advice="Add oils in the Soap base tab to size your scent load.";
    else if(pct>6) advice="⚠️ Heavy scent load — bars may be overpowering and could exceed skin-safe limits. Aim for ~3%."+recG;
    else if(pct>5) advice="On the strong side — many aim for ~3%. OK for robust FOs within IFRA limits."+recG;
    else if(pct<1.5) advice="Light scent — it may fade during cure. Nudge toward ~3% so it lasts."+recG;
    else advice="Nicely in the ~3% sweet spot for cold-process soap."+recG;
    $("scentAdvice").textContent=advice;
    // pyramid
    var known=buckets.top+buckets.middle+buckets.base;
    var pyr=$("pyramid"); pyr.innerHTML="";
    [["top","Top"],["middle","Middle"],["base","Base"]].forEach(function(p){
      var share=known>0?Math.round(buckets[p[0]]/known*100):0;
      var seg=el("div","seg2"); seg.appendChild(el("div","n",share+"%")); seg.appendChild(el("div","l",p[1])); pyr.appendChild(seg);
    });
  }
  buildScentTips();
}
/* ---------- context-aware blending tips (scents) ---------- */
export function buildScentTips(){
  var tipsEl=$("tips"); if(!tipsEl) return;
  var used=state.aromas.filter(function(a){ return a.key && AROMAS[a.key] && a.g>0; })
                       .map(function(a){ return { k:a.key, d:AROMAS[a.key] }; });
  var out=[];
  if(used.length===0){ out=BLEND_TIPS.slice(); }
  else {
    var names=function(arr){ return arr.map(function(u){ return AROMAS[u.k].name.replace(/ (EO|FO)$/,""); }).join(", "); };
    var tops=used.filter(function(u){ return u.d.note==="top"; });
    var anchored=used.some(function(u){ return u.d.note==="base" || u.d.anchor; });
    out.push(BLEND_TIPS[0]); // aim ~3%
    if(tops.length && !anchored)
      out.push({ h:"Anchor your top notes", t:"Your blend leans on "+names(tops)+", which fade during cure. Add a base note (cedarwood, patchouli, vanilla) or litsea (may chang) so the scent lasts." });
    var accel=used.filter(function(u){ return u.d.accel; });
    if(accel.length) out.push({ h:"These can speed up trace", t:names(accel)+" may accelerate trace or seize — soap at a low temperature and hand-stir instead of blending." });
    var disc=used.filter(function(u){ return u.d.discolor; });
    if(disc.length) out.push({ h:"Expect some discoloration", t:names(disc)+" can turn soap tan to brown over a few weeks. Plan your colors around it, or use a vanilla stabilizer." });
    var irr=used.filter(function(u){ return u.d.irritant; });
    if(irr.length) out.push({ h:"Mind skin-safe limits", t:names(irr)+" can irritate skin above low rates — keep within IFRA / supplier maximums." });
    var cats={top:0,middle:0,base:0}; used.forEach(function(u){ cats[u.d.note]++; });
    if(used.length>=2 && (cats.top===used.length||cats.middle===used.length||cats.base===used.length)){
      var only=cats.top?"top":cats.middle?"middle":"base";
      out.push({ h:"Blend is all "+only+" notes", t:"Everything you've added is a "+only+" note. Mixing in the other layers — top for lift, middle for body, base to anchor — gives a rounder, longer-lasting scent." });
    }
    if(used.length>=2)
      out.push({ h:"Test your blend first", t:"You're combining "+names(used)+". "+(anchored?"You've got an anchor in there — nice. ":"")+"Mix these EO/FO drops on a strip and let them mingle before committing a full batch." });
    if(out.length<3) out.push(BLEND_TIPS[1]);
  }
  tipsEl.innerHTML="";
  out.forEach(function(t){ var d=el("div","tip"); d.appendChild(el("b",null,t.h)); d.appendChild(el("span",null,t.t)); tipsEl.appendChild(d); });
}
/* Steps are rewritten in place rather than inserted, so a tick you've already made
   stays on the step you made it against. Find them by what they say — a hardcoded
   index silently overwrites the wrong instruction the moment a step is added. */
export function stepIndex(steps,re){
  for(var i=0;i<steps.length;i++){ if(re.test(steps[i])) return i; }
  return -1;
}
export function checkSteps(){
  var byMethod={cp:CP_STEPS,hp:HP_STEPS,cpop:CPOP_STEPS};
  var steps=(byMethod[state.method]||CP_STEPS).slice(), L=computeLye(), wu=weightUnit();
  if(state.method==="hp" && state.sfMode==="after" && L.reserveG>0){
    // say it on the step where you'd actually be doing it
    var hpIdx=stepIndex(steps,/AFTER the cook/i);
    if(hpIdx>=0) steps[hpIdx]="Let it cool a few minutes, then stir in your held-back "+
      fmt(fromG(L.reserveG,wu),1)+" "+UNITS[wu].label+(L.reserveName?" of "+L.reserveName:" of oil")+
      ", plus fragrance, additives and colour — all after the cook.";
  }
  // Brine changes the order of operations, so the checklist has to say so.
  // Rewritten in place rather than inserted: state.checklist is keyed by index,
  // so adding a step would shift what someone's already ticked.
  var B=brineOf(curRV());
  if(B.salt>0 && state.saltMode==="brine"){
    var brIdx=stepIndex(steps,/lye TO the water/i);
    if(brIdx>=0) steps[brIdx]="Dissolve "+fmt(fromG(B.salt,wu),1)+" "+UNITS[wu].label+
      " of salt into the water and stir until clear, THEN add the lye to it "+
      "(never the reverse) and stir until clear again.";
  }
  return steps;
}
export function renderMake(){
  $("madeOn").value = state.madeOn || "";
  $("cureWeeks").value = state.cureWeeks; $("cureWeeksVal").textContent = state.cureWeeks;
  var box=$("checklist"); box.innerHTML="";
  checkSteps().forEach(function(step,i){
    var id="s"+i, on=!!state.checklist[id];
    var lab=el("label","chk"+(on?" done":""));
    var cb=document.createElement("input"); cb.type="checkbox"; cb.checked=on;
    cb.addEventListener("change",function(){
      if(cb.checked){ state.checklist[id]=true; lab.classList.add("done"); }
      else { delete state.checklist[id]; lab.classList.remove("done"); }
      // no re-render on this path, so the lock has to be nudged here too — ticking the
      // first step is exactly when it should come on
      save(); updateChecklistProgress(); syncWakeLock();
    });
    lab.appendChild(cb); lab.appendChild(el("span","txt",step)); box.appendChild(lab);
  });
  if($("notesField")!==document.activeElement) $("notesField").value = state.notes || "";
  if($("lotField")!==document.activeElement) $("lotField").value = state.lot || "";
  var hp=state.method==="hp";
  $("tempRefCP").classList.toggle("hide",hp);
  $("tempRefHP").classList.toggle("hide",!hp);
  updateMethodNote();
  updateChecklistProgress();
  updateCureSuggest();
  updateTempSuggest();
  updateReady();
  renderHistory();
}
export function renderHistory(){
  var card=$("historyCard"), box=$("batchList"); if(!card||!box) return;
  var list=(state.batches||[]).slice().reverse();          // newest first
  card.hidden=list.length===0; if(!list.length) return;
  box.innerHTML="";
  list.forEach(function(b){
    var row=el("div","batch-row");
    var made=b.madeOn?new Date(b.madeOn+"T00:00:00"):null;
    var when=(made&&!isNaN(made.getTime())) ? made.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"}) : "no date";
    var ready="";
    if(made&&!isNaN(made.getTime())){
      var r=new Date(made.getTime()); r.setDate(r.getDate()+(b.cureWeeks||4)*7);
      ready=" · ready "+r.toLocaleDateString(undefined,{month:"short",day:"numeric"});
    }
    var head=el("div","bh-head");
    head.innerHTML="<b>"+escapeHtml(when)+"</b><span>"+escapeHtml((b.lot?"Lot "+b.lot:"")+ready)+"</span>";
    row.appendChild(head);
    if(b.notes) row.appendChild(el("div","bh-notes",escapeHtml(b.notes)));
    row.appendChild(checkLog(b,made));
    var del=el("button","bh-del","&times;"); del.type="button"; del.setAttribute("aria-label","Delete this batch record");
    del.addEventListener("click",function(){
      state.batches=state.batches.filter(function(x){ return x.id!==b.id; });
      save(); render(); showToast("Batch record removed",true);
    });
    row.appendChild(del);
    box.appendChild(row);
  });
}
export function updateMethodNote(){
  setActive($("methodSeg"),"mt",state.method||"cp");
  $("methodNote").textContent =
      state.method==="hp"   ? "Cook the batter in a slow cooker until saponification finishes, then mould it. Scent goes in after the cook, and it's usable in about a week."
    : state.method==="cpop" ? "Cold process, then a warm oven to force an even gel right to the edges. Same chemistry and the same cure as CP — it just guarantees the gel instead of hoping for it, and brightens the colours."
    : "Mix at low temperature, pour at trace, and let the bars saponify in the mould. Smoother tops and better swirls, but it needs a full cure.";
}
export function updateChecklistProgress(){
  var steps=checkSteps(), done=steps.filter(function(_,i){ return state.checklist["s"+i]; }).length;
  $("checkProgress").textContent = done+" of "+steps.length+" steps done";
}
export function wantWake(){ return !!(navigator.wakeLock && state.keepAwake && makeInProgress()); }
export function syncWakeLock(){
  var want=wantWake();
  if(want && !wakeReq){
    wakeReq=true;
    // Rejects legitimately on low battery — that's "no thanks", not an error to report.
    navigator.wakeLock.request("screen").then(function(s){
      if(!wantWake()){ wakeReq=false; s.release(); return; }   // state moved on while we waited
      wakeSentinel=s;
      s.addEventListener("release",function(){ wakeSentinel=null; wakeReq=false; });
    }).catch(function(){ wakeReq=false; });
  } else if(!want && wakeSentinel){
    var s=wakeSentinel; wakeSentinel=null; wakeReq=false;
    try{ s.release(); }catch(e){}
  }
  renderWakeNote();
}
export function renderWakeNote(){
  var box=$("wakeNote"); if(!box) return;
  var show = !!navigator.wakeLock && makeInProgress();
  box.classList.toggle("hide",!show); if(!show) return;
  box.innerHTML = state.keepAwake
    ? "🔆 Screen stays on while you work · <button type=\"button\" class=\"link\" id=\"wakeOff\">turn off</button>"
    : "💤 Screen may sleep while you work · <button type=\"button\" class=\"link\" id=\"wakeOff\">keep it on</button>";
  $("wakeOff").addEventListener("click",function(){
    state.keepAwake=!state.keepAwake; save(); syncWakeLock();
  });
}
export function suggestedCure(){
  var B=blendFA(); if(B.tot<=0) return null;
  var f=B.fa, hard=qualitiesOf(f).hardness, soft=f.ol+f.li+f.ln+f.po+f.ga;
  var min,max,reason;
  if(hard>=48){ min=3; max=4; reason="a hard, quick-curing blend (lots of coconut, palm, tallow or butters)"; }
  else if(hard>=38){ min=4; max=6; reason="a firm, well-balanced blend"; }
  else if(hard>=30){ min=5; max=7; reason="a softer blend, higher in olive/oleic oils"; }
  else if(hard>=22){ min=6; max=8; reason="a soft, olive/oleic-heavy blend"; }
  else { min=8; max=12; reason="a very soft, castile-style blend (mostly olive & soft oils)"; }
  // water content: more water = more to evaporate = a bit longer
  var L=computeLye(), waterOfOils = L.oilG>0 ? L.waterG/L.oilG*100 : 38, note="";
  if(waterOfOils>=44){ max+=1; note=" Your high water content adds a little time."; }
  else if(waterOfOils<=30){ note=" Your low water content helps it firm up a touch faster."; }
  if(soft>=82 && hard<22){ note+=" A true castile is usable at "+max+" weeks but keeps improving for several months."; }
  if(state.method==="hp"){
    // The cook finishes saponification, so HP is safe to use once firm — the rest is
    // just drying out for hardness and longevity. Compress the range accordingly.
    max=Math.max(2,Math.round(max/3)); min=1;
    return { min:min, max:max, hard:Math.round(hard),
      reason:"hot process — the cook already finished saponification, so this is really just drying time",
      note:" It's safe to use as soon as it's firm; a week or two of drying still makes it harder and longer-lasting." };
  }
  return {min:min, max:max, reason:reason, note:note, hard:Math.round(hard)};
}
export function updateCureSuggest(){
  var box=$("cureSuggest"); if(!box) return;
  var s=suggestedCure();
  if(!s){ box.classList.add("hide"); box.innerHTML=""; return; }
  box.classList.remove("hide");
  var applied = state.cureWeeks>=s.min && state.cureWeeks<=s.max;
  box.innerHTML='<div class="cs-head"><b>Suggested cure: '+s.min+'–'+s.max+' weeks</b>'+
    (applied?'<span class="cs-ok">✓ matches your setting</span>':'')+'</div>'+
    '<div class="cs-why">Based on your oils — '+escapeHtml(s.reason)+'.'+escapeHtml(s.note)+'</div>';
  if(!applied){
    var btn=el("button","cs-apply","Use "+s.max+" weeks"); btn.type="button";
    btn.addEventListener("click",function(){ state.cureWeeks=s.max; save(); renderMake(); });
    box.appendChild(btn);
  }
}
export function updateTempSuggest(){
  var box=$("tempSuggest"); if(!box) return;
  if(state.method==="cpop"){
    // the batter temperatures are ordinary CP; only the oven is new, and overheating
    // is the failure mode people actually hit
    box.textContent="Oven-gelled: mix at ordinary cold-process temperatures (~100°F / 38°C), then into an oven preheated to its lowest setting — and turn it OFF as the mould goes in. The residual heat is plenty. Leaving the oven on is how a batch volcanoes or cracks down the middle."+
      (state.additives.some(function(it){ var d=it.key?ADDITIVES[it.key]:null;
        return d && it.g>0 && d.hot; })
        ? " Your milk, honey or sugar will make it run hotter still — consider skipping the oven for this one." : "");
    return;
  }
  if(state.method==="hp"){
    var hasScent=state.aromas.some(function(it){return it.g>0;});
    box.textContent="Hot process: combine around ~120–140°F / 49–60°C, then cook on low (~160–180°F / 71–82°C) until it folds like thick mashed potato."+
      (hasScent?" Let it cool to about 150°F / 65°C before stirring in your fragrance, or the heat will burn much of it off.":" Scent and additives go in after the cook, not at trace.");
    return;
  }
  var warm=[], cool=[];
  if(state.oils.some(function(it){return it.key==="beeswax"&&it.g>0;})) warm.push("beeswax");
  if(state.oils.some(function(it){return it.key==="stearic"&&it.g>0;})) warm.push("stearic acid");
  var B=blendFA(); if(B.tot>0 && qualitiesOf(B.fa).hardness>52) warm.push("lots of hard fats/butters");
  state.aromas.forEach(function(it){ var d=it.key?AROMAS[it.key]:null; if(d&&d.accel&&it.g>0) cool.push(d.name); });
  state.additives.forEach(function(it){ var d=it.key?ADDITIVES[it.key]:null;
    if(d && d.hot && it.g>0 && cool.indexOf(d.name)<0) cool.push(d.name); });
  var msg;
  if(warm.length && cool.length)
    msg="Heads-up: this recipe has both fast-tracers ("+cool.join(", ")+") and high-melt fats ("+warm.join(", ")+"). Keep the oils just barely melted (~100°F / 38°C) and work quickly by hand — ease off the stick blender once the scent is in.";
  else if(warm.length)
    msg="For this recipe, soap on the warmer side (~110–120°F / 43–49°C) so the hard fats ("+warm.join(", ")+") stay fully melted and don't ‘false trace’.";
  else if(cool.length)
    msg="For this recipe, soap cooler (~80–90°F / 27–32°C) because of "+cool.join(", ")+" — it helps avoid overheating and a fast or seized trace.";
  else
    msg="No special heat concerns here — soap around ~100°F / 38°C, with your lye and oils within ~10°F of each other.";
  box.textContent=msg;
}
export function updateReady(){
  var base = state.madeOn ? new Date(state.madeOn+"T00:00:00") : new Date();
  if(isNaN(base.getTime())) base=new Date();
  var ready=new Date(base.getTime()); ready.setDate(ready.getDate()+state.cureWeeks*7);
  $("readyOn").textContent = ready.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric",year:"numeric"});
  var days=Math.ceil((ready-new Date())/86400000);
  $("cureNote").textContent = state.madeOn
    ? (days>0 ? "About "+days+" day"+(days===1?"":"s")+" left to cure — the bar keeps hardening and getting milder as it dries."
              : "Cure time is up — your soap should be ready to use and gift. 🎉")
    : "Set the date you made this batch to track when it's ready. Cold-process soap needs ~4–6 weeks to cure.";
}
/* ---------- shape / nudge ---------- */
export function nudge(goal){
  var items=state.oils.filter(oilInfo); if(items.length<2) return;
  // The four goals are the quality formulas, so read them from QUALITIES rather than
  // restating them — these were a second copy of the eight-acid definitions and would
  // have quietly kept scoring on the old model after the schema widened.
  var sfn={ harder:qFn("hardness"), condition:qFn("conditioning"), lather:qFn("bubbly"),
            gentle:function(f){ return -qFn("cleansing")(f); } }[goal];
  if(!sfn) return;
  var tot=sumG(items); if(tot<=0) return;
  var scored=items.map(function(it){ return {it:it,s:sfn(oilInfo(it).fa)}; });
  var mean=scored.reduce(function(s,x){return s+(x.it.g/tot)*x.s;},0);
  var posW=0,negW=0; scored.forEach(function(x){ var d=x.s-mean; if(d>0)posW+=d; else negW+=-d; });
  if(posW<=0||negW<=0) return;
  var T=0.12*tot;
  scored.forEach(function(x){ var d=x.s-mean; var delta=d>0?T*(d/posW):-T*((-d)/negW); x.it.g=Math.max(0,x.it.g+delta); });
  var now=sumG(items); if(now>0){ var k=tot/now; items.forEach(function(it){ it.g*=k; }); }
  lastGoal=goal; save(); render();
}
export function oilPct(keys){ keys=[].concat(keys); var g=0,t=totalOilsG(); state.oils.forEach(function(it){ if(keys.indexOf(it.key)>=0) g+=it.g; }); return t>0?g/t*100:0; }
/* Live balance check for the current blend — updates as you drag the oil
   sliders or tap a goal. Flags any downside and suggests a fix ingredient. */
export function updateShapeFeedback(){
  var box=$("shapeFeedback"); if(!box) return;
  if(fbId!==currentId){ fbId=currentId; lastGoal=null; }          // reset when the recipe changes
  if(state.oils.filter(oilInfo).length<2){ box.className="shape-fb hide"; box.textContent=""; return; }
  var f=blendFA().fa;
  var use=state.use||"body";
  var q=qualitiesOf(f), hard=q.hardness, clean=q.cleansing, cond=q.conditioning, bub=q.bubbly, poly=q.poly;
  var castorPct=oilPct("castor");
  var w=[];
  if(use==="dish"||use==="laundry"){
    if(clean<28) w.push("cleansing is "+Math.round(clean)+" — for a "+(use==="dish"?"dish":"laundry")+" soap you want a high-cleansing, coconut-heavy blend to cut grease. Add coconut or palm-kernel oil.");
  } else {
    if(clean>cleansingCap(use)) w.push("cleansing is "+Math.round(clean)+" — the "+(use==="hair"?"blend may strip hair":"bar may feel drying")+". Add a conditioning oil (olive, sweet almond, avocado) or raise superfat.");
    if(cond<44) w.push("low conditioning ("+Math.round(cond)+") — add soft oils like olive, sweet almond, or avocado.");
  }
  if(hard<29 && use!=="hair") w.push("it's soft (hardness "+Math.round(hard)+") and slow to unmould — add a hard oil (coconut/palm), a butter, or a little sodium lactate.");
  if(hard>54) w.push("very hard (hardness "+Math.round(hard)+") — can turn brittle and crack; add a splash of a soft oil.");
  if(bub<14 && castorPct<3) w.push("light lather (bubbly "+Math.round(bub)+") — add ~5% castor or a little coconut.");
  if(poly>18) w.push("high in polyunsaturated oils ("+Math.round(poly)+"%) — prone to rancid spots (DOS); use fresh oils and keep them modest.");
  if(castorPct>8) w.push("castor is "+Math.round(castorPct)+"% — above ~8% it can make the bar soft and sticky.");
  var label = lastGoal ? ({harder:"Harder",condition:"More moisturizing",lather:"Better lather",gentle:"Gentler"}[lastGoal]+" ✓") : "Balance check";
  box.classList.remove("hide");
  if(w.length){
    box.className="shape-fb warn";
    box.innerHTML="<b>"+label+"</b>"+(lastGoal?" Heads-up: ":" — ")+w.slice(0,2).join(" Also, ");
  } else {
    box.className="shape-fb ok";
    box.innerHTML="<b>"+(lastGoal?label:"Balanced ✓")+"</b> All the core qualities are in their recommended ranges.";
  }
}
export function rebuildRecipeSelect(){
  var sel=$("recipeSelect"); if(!sel) return; var h="";
  sortedLibrary().forEach(function(r){
    h+='<option value="'+r.id+'"'+(r.id===currentId?" selected":"")+">"+(r.fav?"★ ":"")+escapeHtml(r.name)+"</option>";
  });
  sel.innerHTML=h;
}

export function checkLog(b,made){
  var wrap=el("div","bh-checks");
  var list=(b.checks||[]).slice().sort(function(x,y){ return (x.on||"").localeCompare(y.on||""); });
  if(list.length) wrap.appendChild(el("div","bh-clabel","Cure checks"));
  list.forEach(function(k){
    var r=el("div","bh-check");
    var when=k.on||"—", wk="", d=k.on?new Date(k.on+"T00:00:00"):null;
    if(d&&!isNaN(d.getTime())){
      when=d.toLocaleDateString(undefined,{month:"short",day:"numeric"});
      if(made&&!isNaN(made.getTime())){
        var days=Math.round((d-made)/86400000);
        if(days>=0) wk=" · "+(days<7 ? "day "+days : "week "+Math.round(days/7));
      }
    }
    var bits=[];
    bits.push("<span class='"+(k.zap?"bc-zap":"bc-nozap")+"'>"+(k.zap?"⚡ zaps":"✓ no zap")+"</span>");
    if(k.ph!=null) bits.push("<span class='bc-ph'>pH "+fmt(k.ph,1)+"</span>");
    r.innerHTML="<span class='bc-when'>"+escapeHtml(when+wk)+"</span>"+bits.join("")+
      (k.note?"<span class='bc-note'>"+escapeHtml(k.note)+"</span>":"");
    var x=el("button","bc-del","&times;"); x.type="button"; x.setAttribute("aria-label","Remove this check");
    x.addEventListener("click",function(){
      var rec=null; (state.batches||[]).forEach(function(y){ if(y.id===b.id) rec=y; });
      if(!rec) return;
      rec.checks=(rec.checks||[]).filter(function(y){ return y.id!==k.id; });
      save(); render(); showToast("Check removed",true);
    });
    r.appendChild(x);
    wrap.appendChild(r);
  });
  var add=el("button","bh-addcheck","+ check"); add.type="button";
  add.setAttribute("data-batch",b.id);
  var form=el("form","bh-cform"); form.hidden=true;
  form.innerHTML=
    "<label class='bcf-f'><span>Date</span><input type='date' class='bcf-on' value='"+escapeHtml(todayISO())+"'></label>"+
    "<label class='bcf-f'><span>pH reading (optional)</span><input type='number' class='bcf-ph' step='0.1' min='0' max='14' inputmode='decimal' placeholder='—'></label>"+
    "<label class='bcf-z'><input type='checkbox' class='bcf-zap'><span>It zaps my tongue</span></label>"+
    "<input type='text' class='bcf-note' maxlength='300' placeholder='Note (optional) — still soft, ash on top…'>"+
    "<div class='bcf-btns'><button type='button' class='ghost bcf-cancel'>Cancel</button>"+
    "<button type='submit' class='primary'>Save check</button></div>";
  add.addEventListener("click",function(){
    form.hidden=!form.hidden;
    if(!form.hidden){ var f=form.querySelector(".bcf-on"); if(f) f.focus(); }
  });
  form.querySelector(".bcf-cancel").addEventListener("click",function(){ form.hidden=true; });
  form.addEventListener("submit",function(e){
    e.preventDefault();
    var rec=null; (state.batches||[]).forEach(function(y){ if(y.id===b.id) rec=y; });
    if(!rec) return;
    var phRaw=form.querySelector(".bcf-ph").value;
    if(!Array.isArray(rec.checks)) rec.checks=[];
    rec.checks.push({ id:uid(),
      on:form.querySelector(".bcf-on").value||todayISO(),
      ph:(phRaw===""||!isFinite(parseFloat(phRaw)))?null:clamp(phRaw,10,0,14),
      zap:form.querySelector(".bcf-zap").checked,
      note:form.querySelector(".bcf-note").value.slice(0,300) });
    if(rec.checks.length>20) rec.checks.shift();
    save(); render(); showToast("Check saved",true);
  });
  wrap.appendChild(add); wrap.appendChild(form);
  return wrap;
}
// A make, not merely the tab being open: you visit Make to read the temperature guidance
// without soaping. Ticking the first step is the moment a batch actually starts.
export function makeInProgress(){
  return state.tab==="make" && Object.keys(state.checklist).length>0;
}

/* ---------- optional on-device AI explainer (Chrome Prompt API / Gemini Nano) ---------- */
export function detectAI(){
  try{
    if(typeof LanguageModel!=="undefined" && LanguageModel.availability){
      LanguageModel.availability().then(function(s){
        if(s==="available"||s==="downloadable"){ aiAvail=true; aiApi="new"; maybeShowAI(); }
      }).catch(function(){});
    } else if(window.ai && window.ai.languageModel && window.ai.languageModel.capabilities){
      window.ai.languageModel.capabilities().then(function(c){
        if(c && (c.available==="readily"||c.available==="after-download")){ aiAvail=true; aiApi="old"; maybeShowAI(); }
      }).catch(function(){});
    }
  }catch(e){}
}
export function runAIExplain(){
  if(!lastSafety) return;
  var b=$("aiExplain"), out=$("aiOut"), orig=b.textContent;
  b.disabled=true; b.textContent="Thinking…";
  out.classList.remove("hide"); out.textContent="Preparing the on-device model…";
  aiRun(buildAIPrompt(lastSafety),function(p){ out.textContent="Downloading the on-device model… "+p+"%"; })
    .then(function(text){ out.textContent=String(text).trim(); $("aiNote").hidden=false; })
    .catch(function(){ out.textContent="Couldn't run the on-device model this time — the rule-based checks above still stand."; })
    .then(function(){ b.disabled=false; b.textContent=orig; });
}

var QUAL_HELP={
  hardness:"How firm and long-lasting the bar is. Too low and it's soft and dissolves fast; too high and it can be brittle and crack. Comes from palmitic, stearic, lauric & myristic acids — coconut, palm, tallow, and butters.",
  cleansing:"How strongly the soap strips oil and grime. Higher feels more 'squeaky' but can be drying; lower is gentler and milder. Comes from lauric & myristic acids — coconut, palm-kernel, babassu.",
  conditioning:"How moisturizing and skin-loving the bar feels. Higher is more emollient. Comes from oleic, linoleic, linolenic & ricinoleic acids — olive, soft oils, and castor.",
  bubbly:"Big, fluffy, foamy bubbles. Comes from lauric, myristic & ricinoleic acids — coconut, palm-kernel, and castor.",
  creamy:"Dense, stable, lotion-like lather. Comes from palmitic, stearic & ricinoleic acids — butters, palm, and castor.",
  iodine:"A measure of how unsaturated (soft) the oils are. Higher iodine → a softer bar that's more prone to rancid spots (DOS); lower → harder and longer-lasting.",
  ins:"A rough overall-quality index that blends hardness with other traits (around 160 is often cited as a sweet spot). Treat it as a rule of thumb, not a rule."
};
var openHelp=null;
var QUAL_LABELS={iodine:"Iodine",ins:"INS"};
QUALITIES.forEach(function(q){ QUAL_LABELS[q.key]=q.label; });
// labels for the help panel: the 5 quality labels come straight from QUALITIES, plus the two indices
function helpRange(k){ var r=null; QUALITIES.forEach(function(x){ if(x.key===k) r=x.lo+"–"+x.hi; });
  if(r) return r; if(k==="iodine") return IOD_RANGE[0]+"–"+IOD_RANGE[1]; if(k==="ins") return INS_RANGE[0]+"–"+INS_RANGE[1]; return ""; }
function toggleHelp(k){ openHelp=(openHelp===k?null:k); updateQuality(); }
function makeChip(label,val,range,key){
  var inR=val>=range[0]&&val<=range[1];
  var c=el("button","chip"+(inR?"":" off")+(openHelp===key?" on":""),label+" <b>"+Math.round(val)+"</b> <span style='opacity:.7'>("+range[0]+"–"+range[1]+")</span>");
  c.type="button"; c.addEventListener("click",function(){ toggleHelp(key); });
  return c;
}
// percent of total oils made up by one oil key, or the combined total of several keys
function lauricNames(){
  var out=[];
  state.oils.forEach(function(it){ if(it.g>0 && LAURIC_OILS.indexOf(it.key)>=0 && out.indexOf(OILS[it.key].name)<0) out.push(OILS[it.key].name); });
  return out;
}
function buildAIPrompt(S){
  var lines=["Verdict: "+S.verdict.text+"."];
  S.items.forEach(function(it){ if(it.level!=="ok") lines.push("- ["+it.level.toUpperCase()+"] "+it.title+": "+it.detail); });
  if(lines.length===1) lines.push("- No warnings; all core safety checks passed.");
  var ctx="Recipe: intended use "+S.ctx.use+", superfat "+S.ctx.sf+"%, "+String(S.ctx.lyeType).toUpperCase()+
    " lye, lye concentration about "+S.ctx.conc+"%, scent load about "+S.ctx.scentPct+"% of oils.";
  return "You are helping a beginner make soap at home. The app has ALREADY computed the safety check below. "+
    "Do not change the verdict or invent new problems. In 2 to 4 short, friendly sentences, explain what it means and the single most important thing to do. Be accurate and reassuring.\n\n"+
    lines.join("\n")+"\n"+ctx;
}
function aiRun(prompt,onProgress){
  var opts={};
  if(onProgress) opts.monitor=function(m){ m.addEventListener("downloadprogress",function(e){ onProgress(Math.round((e.loaded||0)*100)); }); };
  if(aiApi==="new") return LanguageModel.create(opts).then(function(sess){ return sess.prompt(prompt).then(function(r){ if(sess.destroy)sess.destroy(); return r; }); });
  if(aiApi==="old") return window.ai.languageModel.create(opts).then(function(sess){ return sess.prompt(prompt).then(function(r){ if(sess.destroy)sess.destroy(); return r; }); });
  return Promise.reject(new Error("no ai"));
}

// The browser drops the lock whenever the page hides, so without this it silently stops
// working the first time you glance away.
document.addEventListener("visibilitychange",function(){
  if(document.visibilityState==="visible"){ wakeReq=!!wakeSentinel; syncWakeLock(); }
});
