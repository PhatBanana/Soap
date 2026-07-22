(function () {
  "use strict";
  var OILS = window.OILS, ADDITIVES = window.ADDITIVES, AROMAS = window.AROMAS, BLEND_TIPS = window.BLEND_TIPS;

  /* ---------- units (canonical = grams) ---------- */
  var UNITS = {
    g:  { label:"g",  name:"grams",       toG:1,            dp:1 },
    oz: { label:"oz", name:"ounces",      toG:28.349523125, dp:2 },
    lb: { label:"lb", name:"pounds",      toG:453.59237,    dp:3 },
    kg: { label:"kg", name:"kilograms",   toG:1000,         dp:3 },
    pct:{ label:"%",  name:"percentages", toG:null,         dp:1 }
  };
  var UORDER = ["g","oz","lb","kg","pct"];
  // extra units accepted on import / OCR (approx, oil density ~0.92 g/ml)
  var CONV = { g:1, oz:28.349523125, lb:453.59237, kg:1000, ml:0.92, tsp:4.6, tbsp:13.8, cup:221, drop:0.05 };
  var IMPORT_UNITS = ["g","oz","lb","kg","ml","tsp","tbsp","cup","drop"];

  var QUALITIES = [
    { key:"hardness",     label:"Hardness",     scale:70, lo:29, hi:54, fn:function(f){return f.pa+f.st+f.la+f.my;} },
    { key:"cleansing",    label:"Cleansing",    scale:40, lo:12, hi:22, fn:function(f){return f.la+f.my;} },
    { key:"conditioning", label:"Conditioning", scale:90, lo:44, hi:69, fn:function(f){return f.ol+f.li+f.ln+f.ri;} },
    { key:"bubbly",       label:"Bubbly lather",scale:70, lo:14, hi:46, fn:function(f){return f.la+f.my+f.ri;} },
    { key:"creamy",       label:"Creamy lather",scale:70, lo:16, hi:48, fn:function(f){return f.pa+f.st+f.ri;} }
  ];
  var IOD_RANGE=[41,70], INS_RANGE=[136,165], KOH_FACTOR=1.40274;
  var STORE_KEY = "soapcalc.v4";
  var USES=[["body","Body / bath"],["face","Facial"],["hair","Shampoo"],["shave","Shaving"],["dish","Dish soap"],["laundry","Laundry"]];

  var library=[];      // [{ id, name, oils, additives, aromas, lyeType, superfat, waterPct, kohPurity }]
  var currentId=null;
  var state = initState();

  /* ---------- small helpers ---------- */
  var $ = function(id){ return document.getElementById(id); };
  function el(tag, cls, html){ var e=document.createElement(tag); if(cls)e.className=cls; if(html!=null)e.innerHTML=html; return e; }
  function fromG(g,u){ return g/UNITS[u].toG; }
  function fmt(n,dp){ if(!isFinite(n)) return "0"; var s=n.toFixed(dp); if(s.indexOf(".")>-1) s=s.replace(/\.?0+$/,""); return s; }
  function weightUnit(){ return state.unit==="pct" ? (UNITS[state.lastWeightUnit]&&state.lastWeightUnit!=="pct" ? state.lastWeightUnit : "g") : state.unit; }
  function totalOilsG(){ return state.oils.reduce(function(s,it){return s+it.g;},0); }
  function oilInfo(it){ return it.key ? OILS[it.key] : null; }

  /* ---------- build static controls ---------- */
  var unitsEl=$("units"), oilList=$("oilList"), addList=$("addList"), aromaList=$("aromaList");
  var oilRefs=[], addRefs=[], aromaRefs=[];
  var activeInput=null;
  var scaleDirty=false; // true once the user edits the scale field (stops auto-prefill)
  var lastGoal=null, fbId=null; // last Shape goal tapped, for the balance feedback
  function barG(){ return state.barWeight>0 ? state.barWeight : 110; }
  function barCount(g){ return g>0 ? Math.max(1,Math.round(g/barG())) : 0; }

  UORDER.forEach(function(u){
    var b=el("button",null,UNITS[u].label); b.type="button"; b.dataset.unit=u;
    b.addEventListener("click",function(){ state.unit=u; if(u!=="pct") state.lastWeightUnit=u; scaleDirty=false; save(); render(); });
    unitsEl.appendChild(b);
  });
  Array.prototype.forEach.call($("tabs").children,function(b){
    b.addEventListener("click",function(){ state.tab=b.dataset.tab; save(); render(); });
  });

  // base picker: oils (optgroup) + additives (optgroup) + custom
  (function(){
    var oilKeys=Object.keys(OILS).sort(function(a,b){return OILS[a].name.localeCompare(OILS[b].name);});
    var addKeys=Object.keys(ADDITIVES).sort(function(a,b){return ADDITIVES[a].name.localeCompare(ADDITIVES[b].name);});
    var h='<option value="" disabled selected>Choose an oil or additive…</option>';
    h+='<optgroup label="Oils, butters &amp; fats">';
    oilKeys.forEach(function(k){ h+='<option value="oil:'+k+'">'+OILS[k].name+'</option>'; });
    h+='</optgroup><optgroup label="Additives (milk, honey, clay…)">';
    addKeys.forEach(function(k){ h+='<option value="add:'+k+'">'+ADDITIVES[k].name+'</option>'; });
    h+='</optgroup><option value="__custom__">+ Custom oil (no data)…</option>';
    $("baseSelect").innerHTML=h;
  })();
  $("baseSelect").addEventListener("change",function(){
    $("customName").classList.toggle("hide", $("baseSelect").value!=="__custom__");
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

  Array.prototype.forEach.call($("lyeType").children,function(b){
    b.addEventListener("click",function(){ state.lyeType=b.dataset.t; save(); render(); });
  });
  bindRange($("sf"),"sfVal","superfat");
  bindRange($("water"),"waterVal","waterPct");
  bindRange($("purity"),"purVal","kohPurity");
  function bindRange(input,labelId,key){
    input.addEventListener("input",function(){ state[key]=parseFloat(input.value); $(labelId).textContent=input.value; refreshDerived(); save(); });
  }
  Array.prototype.forEach.call($("shape").children,function(b){
    b.addEventListener("click",function(){ nudge(b.dataset.goal); });
  });

  // scale controls
  Array.prototype.forEach.call($("scaleMode").children,function(b){
    b.addEventListener("click",function(){ state.scaleMode=b.dataset.m; scaleDirty=false; save(); updateScaleCard(); });
  });
  $("scaleTarget").addEventListener("input",function(){ scaleDirty=true; updateScaleHint(); });
  $("scaleTarget").addEventListener("focus",function(){ scaleDirty=true; });
  $("scaleApply").addEventListener("click",applyWeightScale);
  ["mL","mW","mH"].forEach(function(id){ $(id).addEventListener("input",updateMoldHint); });
  $("mUnit").addEventListener("change",updateMoldHint);
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
  $("barW").addEventListener("input",function(){ var v=parseFloat($("barW").value); state.barWeight=(isFinite(v)&&v>=10)?v:110; save(); updateScaleCard(); });
  $("scentSuggest").addEventListener("click",suggestScents);
  $("clearOils").addEventListener("click",clearRecipe);
  $("useSelect").addEventListener("change",function(){ state.use=$("useSelect").value; save(); render(); });
  $("madeOn").addEventListener("change",function(){ state.madeOn=$("madeOn").value; save(); updateReady(); });
  $("cureWeeks").addEventListener("input",function(){ state.cureWeeks=parseInt($("cureWeeks").value,10)||4; $("cureWeeksVal").textContent=state.cureWeeks; save(); updateReady(); });
  $("resetChecklist").addEventListener("click",function(){ if(confirm("Uncheck all steps?")){ state.checklist={}; save(); renderMake(); } });

  /* ================= RENDER ================= */
  function render(){
    rebuildRecipeSelect();
    Array.prototype.forEach.call(unitsEl.children,function(b){ b.classList.toggle("active",b.dataset.unit===state.unit); });
    Array.prototype.forEach.call($("tabs").children,function(b){ b.classList.toggle("active",b.dataset.tab===state.tab); });
    $("tab-base").hidden = state.tab!=="base";
    $("tab-scents").hidden = state.tab!=="scents";
    $("tab-make").hidden = state.tab!=="make";

    if(state.tab==="base") renderBase();
    else if(state.tab==="scents") renderScents();
    else renderMake();
  }

  function renderBase(){
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
    Array.prototype.forEach.call($("lyeType").children,function(b){ b.classList.toggle("active",b.dataset.t===state.lyeType); });
    $("purityCtrl").classList.toggle("hide",state.lyeType!=="koh");
    $("sf").value=state.superfat; $("sfVal").textContent=state.superfat;
    $("water").value=state.waterPct; $("waterVal").textContent=state.waterPct;
    $("purity").value=state.kohPurity; $("purVal").textContent=state.kohPurity;

    $("clearOils").hidden = !(state.oils.length||state.additives.length||state.aromas.length);
    if(!$("useSelect").options.length){ var uh=""; USES.forEach(function(u){ uh+='<option value="'+u[0]+'">'+u[1]+'</option>'; }); $("useSelect").innerHTML=uh; }
    $("useSelect").value=state.use;
    var has=state.oils.length>0;
    $("lyeCard").hidden=!has; $("qualCard").hidden=!has; $("shapeCard").hidden=!has;
    $("pctNote").hidden=!(isPct&&has);
    $("addHint").textContent = isPct ? "New amounts are read in grams while in % view" : "Amount is in "+UNITS[state.unit].name;

    var dataOils=state.oils.filter(oilInfo).length;
    Array.prototype.forEach.call($("shape").children,function(b){ b.disabled=dataOils<2; });

    refreshDerived();
  }

  function buildOilRow(it,i){
    var row=el("div","row"), d=oilInfo(it);
    var top=el("div","top");
    top.appendChild(el("div","name",escapeHtml(it.name)));
    var amt=el("div","amt");
    var amtVal=document.createElement("input"); amtVal.className="amt-inp"; amtVal.type="text"; amtVal.inputMode="decimal";
    amtVal.setAttribute("aria-label",it.name+" amount");
    var amtU=el("span","u"); amt.appendChild(amtVal); amt.appendChild(amtU);
    amtVal.addEventListener("focus",function(){ activeInput=amtVal; if(amtVal.select) amtVal.select(); });
    amtVal.addEventListener("blur",function(){ activeInput=null; refreshDerived(); });
    amtVal.addEventListener("input",function(){
      var v=parseFloat(amtVal.value); if(!isFinite(v)||v<0) return;
      if(state.unit==="pct") setOilPercent(i,v); else it.g=v*UNITS[state.unit].toG;
      lastGoal=null; refreshDerived(amtVal); save();
    });
    var del=el("button","del","&times;"); del.type="button"; del.setAttribute("aria-label","Remove "+it.name);
    del.addEventListener("click",function(){ pushUndo(); var nm=it.name; state.oils.splice(i,1); lastGoal=null; save(); render(); showToast("Removed "+nm); });
    top.appendChild(amt); top.appendChild(del); row.appendChild(top);
    if(d && d.note) row.appendChild(el("div","note",d.note));
    if(!d) row.appendChild(el("div","warn","No SAP/profile data — excluded from lye & quality math."));

    var sl=el("div","slider-line");
    var range=document.createElement("input"); range.type="range"; range.min="0"; range.max="100"; range.step="0.5";
    range.setAttribute("aria-label",it.name+" percent of oils");
    var pctLbl=el("span","pctlbl");
    range.addEventListener("input",function(){ setOilPercent(i,parseFloat(range.value)); lastGoal=null; refreshDerived(range); save(); });
    sl.appendChild(range); sl.appendChild(pctLbl); row.appendChild(sl);
    oilRefs[i]={slider:range,amtVal:amtVal,amtU:amtU,pctLbl:pctLbl};
    return row;
  }

  function buildAddRow(it,i){
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
    var inp=document.createElement("input"); inp.type="number"; inp.step="any"; inp.min="0"; inp.inputMode="decimal";
    inp.setAttribute("aria-label",it.name+" amount");
    var u=el("span","u",UNITS[weightUnit()].label);
    var pctLbl=el("span","pctlbl");
    inp.addEventListener("focus",function(){activeInput=inp;});
    inp.addEventListener("blur",function(){activeInput=null;});
    inp.addEventListener("input",function(){
      var v=parseFloat(inp.value); it.g = isFinite(v)&&v>0 ? v*UNITS[weightUnit()].toG : 0;
      refreshDerived(inp); save();
    });
    ne.appendChild(inp); ne.appendChild(u); ne.appendChild(pctLbl); row.appendChild(ne);
    addRefs[i]={input:inp,pctLbl:pctLbl};
    return row;
  }

  function renderScents(){
    aromaList.innerHTML=""; aromaRefs=[];
    if(state.aromas.length===0){ aromaList.appendChild(el("div","empty","No scents yet — add a fragrance or essential oil 👇")); }
    else state.aromas.forEach(function(it,i){ aromaList.appendChild(buildAromaRow(it,i)); });

    $("aromaHint").textContent = state.unit==="pct" ? "New amounts are read in grams while in % view" : "Amount is in "+UNITS[state.unit].name+" · sized against your total oils";
    $("scentSummary").hidden = state.aromas.length===0;
    refreshDerived();
  }

  function buildAromaRow(it,i){
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
    var inp=document.createElement("input"); inp.type="number"; inp.step="any"; inp.min="0"; inp.inputMode="decimal";
    var u=el("span","u",UNITS[weightUnit()].label);
    var pctLbl=el("span","pctlbl");
    inp.addEventListener("focus",function(){activeInput=inp;});
    inp.addEventListener("blur",function(){activeInput=null;});
    inp.addEventListener("input",function(){
      var v=parseFloat(inp.value); it.g = isFinite(v)&&v>0 ? v*UNITS[weightUnit()].toG : 0;
      refreshDerived(inp); save();
    });
    ne.appendChild(inp); ne.appendChild(u); ne.appendChild(pctLbl); row.appendChild(ne);
    aromaRefs[i]={input:inp,pctLbl:pctLbl,sugg:suggEl,warn:warnEl,d:d};
    return row;
  }

  /* set oil i to target % of oils, keeping total oils constant */
  function setOilPercent(i,newPct){
    var total=totalOilsG(); if(total<=0) return;
    newPct=Math.max(0,Math.min(100,newPct));
    var target=total*newPct/100, others=total-state.oils[i].g;
    if(others<=0) return;
    var scale=(total-target)/others;
    state.oils.forEach(function(it,j){ if(j!==i) it.g*=scale; });
    state.oils[i].g=target;
  }

  /* ---------- blend / lye ---------- */
  function curRV(){ return { oils:state.oils, additives:state.additives, aromas:state.aromas,
    lyeType:state.lyeType, superfat:state.superfat, waterPct:state.waterPct, kohPurity:state.kohPurity }; }
  function oilsGof(rv){ return rv.oils.reduce(function(s,it){return s+it.g;},0); }
  function blendFA(rv){
    rv=rv||curRV();
    var tot=0; rv.oils.forEach(function(it){ if(it.key&&OILS[it.key]) tot+=it.g; });
    var fa={la:0,my:0,pa:0,st:0,ri:0,ol:0,li:0,ln:0}, iod=0, ins=0;
    if(tot<=0) return {fa:fa,iod:0,ins:0,tot:0};
    rv.oils.forEach(function(it){ var d=it.key?OILS[it.key]:null; if(!d) return; var fr=it.g/tot;
      for(var k in fa) fa[k]+=fr*d.fa[k]; iod+=fr*d.iod; ins+=fr*d.ins; });
    return {fa:fa,iod:iod,ins:ins,tot:tot};
  }
  function computeLye(rv){
    rv=rv||curRV();
    var naohRaw=0, hasCustom=false;
    rv.oils.forEach(function(it){ var d=it.key?OILS[it.key]:null; if(d) naohRaw+=it.g*d.sap; else if(it.g>0) hasCustom=true; });
    var sf=1-rv.superfat/100, lyeG, kind;
    if(rv.lyeType==="koh"){ lyeG=naohRaw*KOH_FACTOR*sf/(rv.kohPurity/100); kind="KOH (lye)"; }
    else { lyeG=naohRaw*sf; kind="NaOH (lye)"; }
    var oilG=oilsGof(rv);
    return { lyeG:lyeG, waterG:oilG*rv.waterPct/100, oilG:oilG, kind:kind, hasCustom:hasCustom };
  }
  function qualitiesOf(fa){ return { hardness:fa.pa+fa.st+fa.la+fa.my, cleansing:fa.la+fa.my,
    conditioning:fa.ol+fa.li+fa.ln+fa.ri, bubbly:fa.la+fa.my+fa.ri, creamy:fa.pa+fa.st+fa.ri }; }
  function statsFor(r){
    var B=blendFA(r), L=computeLye(r), tot=oilsGof(r);
    var scentG=r.aromas.reduce(function(s,it){return s+it.g;},0);
    return { oilsG:tot, batchG:currentBatchG(r), lyeG:L.lyeG, waterG:L.waterG, kind:L.kind,
      sf:r.superfat, waterPct:r.waterPct, q:qualitiesOf(B.fa), iod:B.iod, ins:B.ins,
      oilPcts:r.oils.map(function(it){ return {name:it.name,key:it.key,pct:tot>0?it.g/tot*100:0}; }),
      scentPct: tot>0?scentG/tot*100:0 };
  }

  /* ---------- refresh derived values (in place) ---------- */
  function refreshDerived(active){
    var isPct=state.unit==="pct", total=totalOilsG(), wunit=weightUnit();

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
      if(state.oils.length>0){ updateLyePanel(); updateQuality(); updateNotes(); updateShapeFeedback(); }
      else { $("notesCard").hidden=true; var sfb=$("shapeFeedback"); if(sfb){ sfb.className="shape-fb hide"; sfb.textContent=""; } }
    }

    if(state.tab==="scents") updateScents(active);
  }

  function updateLyePanel(){
    var wunit=weightUnit(), L=computeLye(), isPct=state.unit==="pct";
    $("lyeK").textContent=L.kind;
    $("lyeVal").textContent=fmt(fromG(L.lyeG,wunit),2); $("lyeUnit").textContent=UNITS[wunit].label;
    $("waterOut").textContent=fmt(fromG(L.waterG,wunit),1); $("waterUnit").textContent=UNITS[wunit].label;
    var batch=currentBatchG();
    $("batchOut").textContent=fmt(fromG(batch,wunit),1); $("batchUnit").textContent=UNITS[wunit].label;
    var conc=(L.lyeG+L.waterG)>0?L.lyeG/(L.lyeG+L.waterG)*100:0;
    var info="Lye concentration ≈ "+fmt(conc,1)+"%"+(state.superfat>0?" · "+state.superfat+"% superfat":"");
    if(isPct) info+=" · shown in "+UNITS[wunit].name;
    if(L.hasCustom) info+=" · custom oils excluded";
    var liquidAdd=state.additives.some(function(it){ return it.key&&ADDITIVES[it.key].kind==="liquid"&&it.g>0; });
    if(liquidAdd) info+=" · liquid additives replace part of the water";
    $("lyeInfo").textContent=info;
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
  function helpRange(k){ var r=null; QUALITIES.forEach(function(x){ if(x.key===k) r=x.lo+"–"+x.hi; });
    if(r) return r; if(k==="iodine") return IOD_RANGE[0]+"–"+IOD_RANGE[1]; if(k==="ins") return INS_RANGE[0]+"–"+INS_RANGE[1]; return ""; }
  function toggleHelp(k){ openHelp=(openHelp===k?null:k); updateQuality(); }
  function updateQuality(){
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
      var titles={hardness:"Hardness",cleansing:"Cleansing",conditioning:"Conditioning",bubbly:"Bubbly lather",creamy:"Creamy lather",iodine:"Iodine",ins:"INS"};
      ex.className="qual-explain";
      ex.innerHTML="<b>"+titles[openHelp]+" <span class='r'>· good range "+helpRange(openHelp)+"</span></b>"+escapeHtml(QUAL_HELP[openHelp]);
    } else { ex.className="qual-explain hide"; ex.textContent=""; }
    $("qualNote").textContent = B.tot>0 ? "Tap the ? on any quality to learn what it means. Green band = typical range; amber = outside it." : "Add oils with profile data to see qualities.";
  }
  function makeChip(label,val,range,key){
    var inR=val>=range[0]&&val<=range[1];
    var c=el("button","chip"+(inR?"":" off")+(openHelp===key?" on":""),label+" <b>"+Math.round(val)+"</b> <span style='opacity:.7'>("+range[0]+"–"+range[1]+")</span>");
    c.type="button"; c.addEventListener("click",function(){ toggleHelp(key); });
    return c;
  }

  /* ---------- context-aware recipe notes (soap base) ---------- */
  function updateNotes(){
    var notes=recipeNotes(), box=$("recipeNotes"); box.innerHTML="";
    $("notesCard").hidden = notes.length===0;
    notes.forEach(function(n){
      var d=el("div","tip");
      var b=el("b",null,n[1]); if(n[0]==="warn") b.style.color="var(--amber)"; else if(n[0]==="soft") b.style.color="var(--terra)";
      d.appendChild(b); d.appendChild(el("span",null,n[2]));
      box.appendChild(d);
    });
  }
  function recipeNotes(){
    var out=[], B=blendFA(), f=B.fa, total=totalOilsG();
    function pctOf(key){ var g=0; state.oils.forEach(function(it){ if(it.key===key) g+=it.g; }); return total>0?g/total*100:0; }
    function hasOil(key){ return state.oils.some(function(it){ return it.key===key; }); }
    function hasAdd(key){ return state.additives.some(function(it){ return it.key===key; }); }
    var use=state.use||"body", sf=state.superfat;
    if(B.tot>0){
      var hard=f.pa+f.st+f.la+f.my, clean=f.la+f.my, cond=f.ol+f.li+f.ln+f.ri, bub=f.la+f.my+f.ri, poly=f.li+f.ln;
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
        var cleanCap = use==="face" ? 18 : (use==="hair" ? 20 : 22);
        if(clean>cleanCap) out.push(["warn", use==="hair"?"May strip hair":"May feel drying",
          "Cleansing is "+Math.round(clean)+" — "+(use==="hair"?"soap-shampoo this cleansing can leave hair squeaky/frizzy. Add conditioning oils":"raise your superfat or cut coconut / palm-kernel oil")+"."]);
        if(cond<44) out.push(["soft","Low conditioning","Conditioning is "+Math.round(cond)+" (aim 44–69). Add soft oils like olive, sweet almond, or avocado."]);
        if(bub<14 && pctOf("castor")<3) out.push(["soft","Light on lather","Bubbly lather is "+Math.round(bub)+". A bit more coconut/palm-kernel, or ~5% castor, boosts the bubbles."]);
        if(use==="shave" && (f.pa+f.st+f.ri)<30) out.push(["soft","Thin shaving lather","Creamy lather is low ("+Math.round(f.pa+f.st+f.ri)+"). Add stearic acid or a butter — plus a little clay — for a slick, dense brush lather."]);
        if(use==="face" && sf<6) out.push(["tip","Facial bars love a higher superfat","Consider ~6–8% superfat for a gentler, more moisturizing face bar."]);
        if(use==="hair") out.push(["tip","Soap-based shampoo","It's high-pH — finish with a diluted apple-cider-vinegar rinse to smooth the hair cuticle."]);
      }
      if(poly>18) out.push(["warn","Watch for rancidity (DOS)","This blend is "+Math.round(poly)+"% polyunsaturated (linoleic+linolenic). Those oils go rancid faster — use fresh oils, keep superfat modest, and consider an antioxidant like ROE."]);
    }
    if(pctOf("castor")>10) out.push(["warn","High castor","Castor is "+Math.round(pctOf("castor"))+"% — wonderful for lather but it can make soap soft and sticky. 5–8% is usually plenty."]);
    if(hasOil("olive") && state.oils.length===1) out.push(["tip","Castile soap","Pure olive oil is beautifully gentle, but trace is slow and it needs a long cure (4–6 weeks or more) to firm up."]);
    if(hasOil("beeswax")) out.push(["tip","Beeswax present","Beeswax firms the bar but speeds up trace and can mute lather — keep it around 1–3%."]);
    if(hasOil("stearic")) out.push(["tip","Stearic acid present","Stearic acid accelerates trace fast — mix and pour quickly."]);
    if(hasOil("palmkernel") && hasOil("coconut")) out.push(["tip","Coconut + palm kernel","Both are high-cleansing lauric oils. Together they can get drying — keep the combined amount in check and superfat a touch higher."]);
    if(hasAdd("goatmilk")||hasAdd("coconutmilk")) out.push(["tip","Making a milk soap","Swap part or all of your water for the milk. Keep it cold or frozen and add the lye slowly to stop it scorching (or use powdered milk at trace)."]);
    if(hasAdd("honey")) out.push(["tip","Honey added","Honey feeds lather but can overheat the batch — soap at a cooler temperature and watch for gel/volcano."]);
    return out;
  }

  /* ---------- scale recipe ---------- */
  function currentBatchG(rv){
    rv=rv||curRV();
    var L=computeLye(rv);
    var add=rv.additives.reduce(function(s,it){return s+it.g;},0);
    var ar=rv.aromas.reduce(function(s,it){return s+it.g;},0);
    return L.oilG + L.lyeG + L.waterG + add + ar;
  }
  function moldOilsG(){
    var L=parseFloat($("mL").value), W=parseFloat($("mW").value), H=parseFloat($("mH").value);
    if(!(L>0&&W>0&&H>0)) return 0;
    var vol=L*W*H;
    // rule of thumb: 0.4 oz of oils per cubic inch (~0.69 g per cm³)
    return $("mUnit").value==="cm" ? vol*0.6917 : vol*0.4*UNITS.oz.toG;
  }
  function scaleAll(factor){
    if(!(factor>0)||!isFinite(factor)) return;
    state.oils.forEach(function(it){ it.g*=factor; });
    state.additives.forEach(function(it){ it.g*=factor; });
    state.aromas.forEach(function(it){ it.g*=factor; });
    save(); render();
  }
  function applyWeightScale(){
    var wunit=weightUnit(), raw=parseFloat($("scaleTarget").value);
    if(!(raw>0)) return;
    var targetG=raw*UNITS[wunit].toG;
    var cur = state.scaleMode==="oils" ? totalOilsG() : currentBatchG();
    if(cur<=0) return;
    scaleDirty=false; $("scaleTarget").value="";
    pushUndo(); scaleAll(targetG/cur); showToast("Recipe scaled");
  }
  function applyMold(){
    var target=moldOilsG(); if(target<=0) return;
    var cur=totalOilsG(); if(cur<=0) return;
    pushUndo(); scaleAll(target/cur); showToast("Scaled to fit mold");
  }
  function updateScaleCard(){
    if(state.oils.length===0){ $("scaleCard").hidden=true; return; }
    $("scaleCard").hidden=false;
    Array.prototype.forEach.call($("scaleMode").children,function(b){ b.classList.toggle("active",b.dataset.m===state.scaleMode); });
    var isMold=state.scaleMode==="mold", wunit=weightUnit(), ul=UNITS[wunit].label;
    $("scaleWeight").classList.toggle("hide",isMold);
    $("scaleMoldWrap").classList.toggle("hide",!isMold);
    $("scaleUnit").textContent=ul;
    $("scaleTarget").placeholder = state.scaleMode==="oils" ? "Target oils in "+ul : "Target batch in "+ul;
    var oilsG=totalOilsG(), batchG=currentBatchG();

    // expected yield readout
    $("yieldVal").textContent=fmt(fromG(batchG,wunit),UNITS[wunit].dp);
    $("yieldUnit").textContent=ul;
    var bars=barCount(batchG);
    $("yieldBars").textContent="≈ "+bars+" bar"+(bars===1?"":"s")+" (~"+barG()+" g each) · "+fmt(fromG(oilsG,wunit),1)+" "+ul+" of oils";
    if($("barW")!==document.activeElement) $("barW").value=state.barWeight;

    // reuse the target field to also show the current amount (until the user edits it)
    if(!isMold && !scaleDirty && document.activeElement!==$("scaleTarget")){
      var curShown = state.scaleMode==="oils" ? oilsG : batchG;
      $("scaleTarget").value = curShown>0 ? fmt(fromG(curShown,wunit),UNITS[wunit].dp) : "";
    }
    updateScaleHint(); updateMoldHint();
  }
  function updateScaleHint(){
    var wunit=weightUnit(), ul=UNITS[wunit].label, raw=parseFloat($("scaleTarget").value);
    if(!scaleDirty || !(raw>0)){
      $("scaleHint").textContent = state.scaleMode==="oils"
        ? "Currently shows your total oils — type a new target and tap Scale."
        : "Currently shows your batch — type a desired amount of soap and tap Scale.";
      return;
    }
    var targetG=raw*UNITS[wunit].toG;
    var cur = state.scaleMode==="oils" ? totalOilsG() : currentBatchG();
    if(cur<=0){ $("scaleHint").textContent=""; return; }
    var f=targetG/cur;
    $("scaleHint").textContent="× "+fmt(f,3)+" → oils "+fmt(fromG(totalOilsG()*f,wunit),1)+" "+ul+" · batch "+fmt(fromG(currentBatchG()*f,wunit),1)+" "+ul;
  }
  function updateMoldHint(){
    var wunit=weightUnit(), ul=UNITS[wunit].label, t=moldOilsG();
    if(t<=0){ $("moldHint").textContent="Enter the inner Length × Width × Height of a rectangular mold to estimate the oils it holds."; return; }
    var cur=totalOilsG(), f=cur>0?t/cur:0;
    $("moldHint").textContent="≈ "+fmt(fromG(t,wunit),1)+" "+ul+" of oils for this mold"+(f>0?"  (× "+fmt(f,3)+")":"");
  }

  function updateScents(active){
    var totalOil=totalOilsG(), wunit=weightUnit();
    var scentG=state.aromas.reduce(function(s,it){return s+it.g;},0);
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
          r.warn.textContent="⚠ Above its ~"+r.d.rate[2]+"% skin-safe max — reduce to ≈ "+fmt(fromG(totalOil*r.d.rate[2]/100,wunit),1)+" "+UNITS[wunit].label+".";
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
    $("scentUnitNote").textContent="";
    buildScentTips();
  }

  /* ---------- context-aware blending tips (scents) ---------- */
  function buildScentTips(){
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

  /* Set each scent to a proper amount: known scents to their typical usage rate,
     custom scents to an even share of a 3% total — so the bar isn't over/under-scented. */
  function suggestScents(){
    var oil=totalOilsG();
    if(oil<=0){ alert("Add oils in the Base tab first so scent amounts can be sized."); return; }
    if(state.aromas.length===0) return;
    // Target ~3% of oils TOTAL, split between scents by their typical rate, and never
    // let any single scent exceed its own skin-safe max — so the bar isn't over/under-scented.
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
  var CHECK_STEPS=[
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
  function todayISO(){ var d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
  function renderMake(){
    $("madeOn").value = state.madeOn || "";
    $("cureWeeks").value = state.cureWeeks; $("cureWeeksVal").textContent = state.cureWeeks;
    var box=$("checklist"); box.innerHTML="";
    CHECK_STEPS.forEach(function(step,i){
      var id="s"+i, on=!!state.checklist[id];
      var lab=el("label","chk"+(on?" done":""));
      var cb=document.createElement("input"); cb.type="checkbox"; cb.checked=on;
      cb.addEventListener("change",function(){
        if(cb.checked){ state.checklist[id]=true; lab.classList.add("done"); }
        else { delete state.checklist[id]; lab.classList.remove("done"); }
        save(); updateChecklistProgress();
      });
      lab.appendChild(cb); lab.appendChild(el("span","txt",step)); box.appendChild(lab);
    });
    updateChecklistProgress();
    updateReady();
  }
  function updateChecklistProgress(){
    var done=CHECK_STEPS.filter(function(_,i){ return state.checklist["s"+i]; }).length;
    $("checkProgress").textContent = done+" of "+CHECK_STEPS.length+" steps done";
  }
  function updateReady(){
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
  function nudge(goal){
    var items=state.oils.filter(oilInfo); if(items.length<2) return;
    var sfn={ harder:function(f){return f.pa+f.st+f.la+f.my;}, condition:function(f){return f.ol+f.li+f.ln+f.ri;},
              lather:function(f){return f.la+f.my+f.ri;}, gentle:function(f){return -(f.la+f.my);} }[goal];
    if(!sfn) return;
    var tot=items.reduce(function(s,it){return s+it.g;},0); if(tot<=0) return;
    var scored=items.map(function(it){ return {it:it,s:sfn(oilInfo(it).fa)}; });
    var mean=scored.reduce(function(s,x){return s+(x.it.g/tot)*x.s;},0);
    var posW=0,negW=0; scored.forEach(function(x){ var d=x.s-mean; if(d>0)posW+=d; else negW+=-d; });
    if(posW<=0||negW<=0) return;
    var T=0.12*tot;
    scored.forEach(function(x){ var d=x.s-mean; var delta=d>0?T*(d/posW):-T*((-d)/negW); x.it.g=Math.max(0,x.it.g+delta); });
    var now=items.reduce(function(s,it){return s+it.g;},0); if(now>0){ var k=tot/now; items.forEach(function(it){ it.g*=k; }); }
    lastGoal=goal; save(); render();
  }
  function oilPct(key){ var g=0,t=totalOilsG(); state.oils.forEach(function(it){ if(it.key===key) g+=it.g; }); return t>0?g/t*100:0; }
  /* Live balance check for the current blend — updates as you drag the oil
     sliders or tap a goal. Flags any downside and suggests a fix ingredient. */
  function updateShapeFeedback(){
    var box=$("shapeFeedback"); if(!box) return;
    if(fbId!==currentId){ fbId=currentId; lastGoal=null; }          // reset when the recipe changes
    if(state.oils.filter(oilInfo).length<2){ box.className="shape-fb hide"; box.textContent=""; return; }
    var f=blendFA().fa;
    var use=state.use||"body";
    var hard=f.pa+f.st+f.la+f.my, clean=f.la+f.my, cond=f.ol+f.li+f.ln+f.ri, bub=f.la+f.my+f.ri, poly=f.li+f.ln;
    var w=[];
    if(use==="dish"||use==="laundry"){
      if(clean<28) w.push("cleansing is "+Math.round(clean)+" — for a "+(use==="dish"?"dish":"laundry")+" soap you want a high-cleansing, coconut-heavy blend to cut grease. Add coconut or palm-kernel oil.");
    } else {
      var cap = use==="face" ? 18 : (use==="hair" ? 20 : 22);
      if(clean>cap) w.push("cleansing is "+Math.round(clean)+" — the "+(use==="hair"?"blend may strip hair":"bar may feel drying")+". Add a conditioning oil (olive, sweet almond, avocado) or raise superfat.");
      if(cond<44) w.push("low conditioning ("+Math.round(cond)+") — add soft oils like olive, sweet almond, or avocado.");
    }
    if(hard<29 && use!=="hair") w.push("it's soft (hardness "+Math.round(hard)+") and slow to unmould — add a hard oil (coconut/palm), a butter, or a little sodium lactate.");
    if(hard>54) w.push("very hard (hardness "+Math.round(hard)+") — can turn brittle and crack; add a splash of a soft oil.");
    if(bub<14 && oilPct("castor")<3) w.push("light lather (bubbly "+Math.round(bub)+") — add ~5% castor or a little coconut.");
    if(poly>18) w.push("high in polyunsaturated oils ("+Math.round(poly)+"%) — prone to rancid spots (DOS); use fresh oils and keep them modest.");
    if(oilPct("castor")>8) w.push("castor is "+Math.round(oilPct("castor"))+"% — above ~8% it can make the bar soft and sticky.");
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

  /* ---------- add forms ---------- */
  $("addForm").addEventListener("submit",function(ev){
    ev.preventDefault();
    var sel=$("baseSelect").value, raw=parseFloat($("amtIn").value);
    if(!sel||!isFinite(raw)||raw<=0) return;
    var unit=state.unit==="pct"?"g":state.unit, grams=raw*UNITS[unit].toG;
    if(sel==="__custom__"){ var nm=$("customName").value.trim(); if(!nm){ $("customName").focus(); return; }
      state.oils.push({name:nm,key:null,g:grams}); }
    else if(sel.indexOf("oil:")===0){ var k=sel.slice(4); state.oils.push({name:OILS[k].name,key:k,g:grams}); }
    else if(sel.indexOf("add:")===0){ var ka=sel.slice(4); state.additives.push({name:ADDITIVES[ka].name,key:ka,g:grams}); }
    $("baseSelect").value=""; $("amtIn").value=""; $("customName").value=""; $("customName").classList.add("hide");
    lastGoal=null; save(); render();
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
  function doAction(a){
    switch(a){
      case "new": newRecipe(); break;
      case "dup": duplicateRecipe(); break;
      case "rename": renameRecipe(); break;
      case "delete": deleteRecipe(); break;
      case "compare": openCompare(); break;
      case "costs": openCosts(); break;
      case "card": openCard(); break;
      case "examples": openExamples(); break;
      case "scan": $("photoInput").click(); break;
      case "import": $("csvInput").click(); break;
      case "export": exportCSV(); break;
      case "backup": backupAll(); break;
      case "restore": $("restoreInput").click(); break;
      case "clear": clearRecipe(); break;
      case "install": doInstall(); break;
    }
  }
  function clearRecipe(){
    if(!(state.oils.length||state.additives.length||state.aromas.length)) return;
    pushUndo();
    state.oils=[]; state.additives=[]; state.aromas=[]; lastGoal=null; save(); render(); showToast("Recipe cleared");
  }
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
      target=blankRecipe(ex.name); library.push(target); currentId=target.id;
    }
    target.oils=mapItems(ex.oils,OILS);
    target.additives=mapItems(ex.additives,ADDITIVES);
    target.aromas=mapItems(ex.aromas,AROMAS);
    target.lyeType = ex.lye==="koh" ? "koh" : "naoh";
    target.superfat = clamp(ex.sf,5,0,15);
    target.waterPct = clamp(ex.water,38,25,50);
    target.kohPurity = clamp(ex.koh,90,85,100);
    target.use = exUse(ex);
    loadRecipeIntoState(target); scaleDirty=false; lastGoal=null; save(); render();
  }
  function openExamples(){
    var md=makeModal();
    md.m.appendChild(el("h3",null,"Example recipes"));
    md.m.appendChild(el("p","sub","Tap one to add it as a new saved recipe you can tweak."));
    var out=el("div"); md.m.appendChild(out);
    var groups=[["Bar","Bar soaps"],["Liquid","Liquid soaps"],["Dish","Dish soap"],["Laundry","Laundry soap"]];
    groups.forEach(function(gp){
      var items=(window.EXAMPLES||[]).filter(function(e){ return e.cat===gp[0]; });
      if(!items.length) return;
      out.appendChild(el("div","ex-h",gp[1]));
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

  /* ---------- CSV ---------- */
  $("csvInput").addEventListener("change",function(e){
    var f=e.target.files&&e.target.files[0]; if(!f) return;
    var r=new FileReader();
    r.onload=function(){ var rows=parseCSVToRows(String(r.result)); if(!rows.length){ alert("No rows found in that CSV."); return; }
      openConfirm(rows,"Import CSV","Check each line, then add to your recipe."); };
    r.readAsText(f); $("csvInput").value="";
  });
  function exportCSV(){
    var lines=["section,name,amount,unit"];
    state.oils.forEach(function(it){ lines.push(csvRow(["oil",it.name,fmt(it.g,3),"g"])); });
    state.additives.forEach(function(it){ lines.push(csvRow(["additive",it.name,fmt(it.g,3),"g"])); });
    state.aromas.forEach(function(it){ lines.push(csvRow(["scent",it.name,fmt(it.g,3),"g"])); });
    var blob=new Blob([lines.join("\n")],{type:"text/csv"});
    var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="soap-recipe.csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){URL.revokeObjectURL(a.href);},2000);
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
              amount:find(head,["amount","qty","quantity","weight","grams","g"]), unit:find(head,["unit","units","uom"]) };
    var body = looksHeader ? raw.slice(1) : raw;
    var out=[];
    body.forEach(function(r){
      var name = col.name>=0 ? r[col.name] : r[looksHeader?1:0>=0?0:0];
      // fallbacks when no header
      if(!looksHeader){ name=r[0]; }
      var amount = col.amount>=0 ? r[col.amount] : (looksHeader?"":r[1]);
      if(!looksHeader){ amount=r[1]; }
      var unit = col.unit>=0 ? r[col.unit] : "";
      var section = col.section>=0 ? r[col.section] : "";
      if(!name || !String(name).trim()) return;
      out.push(normalizeRow(String(name).trim(), amount, unit, section));
    });
    return out;
    function find(arr,names){ for(var n=0;n<names.length;n++){ var idx=arr.indexOf(names[n]); if(idx>=0) return idx; } return -1; }
  }
  function normalizeRow(name, amountRaw, unitRaw, sectionRaw){
    var amount=parseFloat(String(amountRaw).replace(/[^\d.]/g,"")); if(!isFinite(amount)) amount=0;
    var unit=(String(unitRaw||"").trim().toLowerCase().replace(/s$/,"")) ; if(!CONV[unit]) unit="g";
    var section=String(sectionRaw||"").trim().toLowerCase();
    if(!/oil|base|additive|scent|fragrance|aroma|essential/.test(section)) section=guessSection(name);
    else if(/additive/.test(section)) section="additive";
    else if(/scent|fragrance|aroma|essential/.test(section)) section="scent";
    else section="oil";
    return { name:name, amount:amount, unit:unit, section:section };
  }
  function guessSection(name){
    if(matchKey(AROMAS,name)) return "scent";
    if(matchKey(ADDITIVES,name)) return "additive";
    return "oil";
  }
  function matchKey(db,name){
    var n=name.toLowerCase().replace(/\s+/g," ").trim();
    for(var k in db){ var dn=db[k].name.toLowerCase(); if(dn===n) return k; }
    for(var k2 in db){ var dn2=db[k2].name.toLowerCase().replace(/\s*\(.*?\)/,"").replace(/ (eo|fo)$/,"").trim();
      if(n===dn2 || n.indexOf(dn2)>=0 || dn2.indexOf(n)>=0) return k2; }
    return null;
  }

  /* ---------- confirm modal (CSV + OCR) ---------- */
  function openConfirm(rows,title,sub,previewURL){
    var back=el("div","modal-back");
    var m=el("div","modal");
    forceVisible(back,"flex"); forceVisible(m,"block");
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
        nameI.addEventListener("input",function(){ r.name=nameI.value; });
        var amtI=document.createElement("input"); amtI.type="number"; amtI.step="any"; amtI.value=r.amount||""; amtI.placeholder="amt";
        amtI.addEventListener("input",function(){ r.amount=parseFloat(amtI.value)||0; });
        var unitS=document.createElement("select"); IMPORT_UNITS.forEach(function(u){ var o=document.createElement("option"); o.value=u; o.textContent=u; if(u===r.unit)o.selected=true; unitS.appendChild(o); });
        unitS.addEventListener("change",function(){ r.unit=unitS.value; });
        var secS=document.createElement("select"); [["oil","Oil"],["additive","Additive"],["scent","Scent"]].forEach(function(s){ var o=document.createElement("option"); o.value=s[0]; o.textContent=s[1]; if(s[0]===r.section)o.selected=true; secS.appendChild(o); });
        secS.addEventListener("change",function(){ r.section=secS.value; });
        var rm=el("button","rm","&times;"); rm.type="button"; rm.addEventListener("click",function(){ rowsState.splice(idx,1); drawRows(); });
        // layout: name (full width row) then amt/unit/section/rm
        pr.style.gridTemplateColumns="1fr 70px 66px 78px auto";
        pr.appendChild(nameI); pr.appendChild(amtI); pr.appendChild(unitS); pr.appendChild(secS); pr.appendChild(rm);
        body.appendChild(pr);
      });
      if(rowsState.length===0) body.appendChild(el("div","ocr-status","Nothing to add."));
    }
    drawRows();
    var foot=el("div","mfoot");
    var cancel=el("button","ghost","Cancel"); cancel.addEventListener("click",function(){ document.body.style.overflow=""; back.remove(); });
    var ok=el("button","primary","Add to recipe"); ok.addEventListener("click",function(){ commitRows(rowsState); document.body.style.overflow=""; back.remove(); });
    foot.appendChild(cancel); foot.appendChild(ok); m.appendChild(foot);
    back.appendChild(m);
    back.addEventListener("click",function(e){ if(e.target===back){ document.body.style.overflow=""; back.remove(); } });
    document.body.style.overflow="hidden";
    $("modalRoot").appendChild(back);
    return { setRows:function(rs){ rowsState=rs.slice(); drawRows(); }, body:body };
  }
  function commitRows(rows){
    var added=0, wantScents=false;
    rows.forEach(function(r){
      if(!r.name || !r.name.trim() || !(r.amount>0)) return;
      var grams=r.amount*(CONV[r.unit]||1); if(!(grams>0)) return;
      if(r.section==="scent"){ var ak=matchKey(AROMAS,r.name); state.aromas.push({name:ak?AROMAS[ak].name:r.name,key:ak,g:grams}); wantScents=true; }
      else if(r.section==="additive"){ var dk=matchKey(ADDITIVES,r.name); state.additives.push({name:dk?ADDITIVES[dk].name:r.name,key:dk,g:grams}); }
      else { var ok=matchKey(OILS,r.name); state.oils.push({name:ok?OILS[ok].name:r.name,key:ok,g:grams}); }
      added++;
    });
    if(added){ if(wantScents && state.oils.length===0) state.tab="scents"; save(); render(); }
  }

  /* ---------- OCR ---------- */
  $("photoInput").addEventListener("change",function(e){
    var f=e.target.files&&e.target.files[0]; if(!f) return;
    var url=URL.createObjectURL(f);
    // open modal in loading state
    var back=el("div","modal-back"); var m=el("div","modal");
    forceVisible(back,"flex"); forceVisible(m,"block");
    m.appendChild(el("h3",null,"Reading photo…"));
    var img=document.createElement("img"); img.className="ocr-preview"; img.src=url; m.appendChild(img);
    var status=el("div","ocr-status","<span class='spin'></span>Loading the text reader…");
    m.appendChild(status); back.appendChild(m);
    document.body.style.overflow="hidden"; $("modalRoot").appendChild(back);
    var cancelled=false;
    back.addEventListener("click",function(ev){ if(ev.target===back){ cancelled=true; document.body.style.overflow=""; back.remove(); } });

    loadTesseract().then(function(){
      if(cancelled) return;
      status.innerHTML="<span class='spin'></span>Recognizing text… (first run downloads ~5 MB)";
      return window.Tesseract.recognize(f,"eng",{ logger:function(mm){ if(mm.status==="recognizing text"&&!cancelled) status.innerHTML="<span class='spin'></span>Recognizing text… "+Math.round(mm.progress*100)+"%"; } });
    }).then(function(res){
      if(cancelled||!res) return;
      document.body.style.overflow=""; back.remove();
      var rows=parseOCR(res.data.text);
      if(!rows.length) rows=[{name:"",amount:0,unit:"g",section:"oil"}];
      openConfirm(rows,"Check the scanned recipe","OCR is rough — fix names, amounts & units, then add. Values default to grams.",url);
    }).catch(function(err){
      if(cancelled) return;
      status.innerHTML="Couldn't read the photo. "+(navigator.onLine?"Try a clearer, well-lit shot.":"You appear to be offline — the first scan needs internet to fetch the reader.");
      var foot=el("div","mfoot"); var b=el("button","ghost","Close"); b.addEventListener("click",function(){ document.body.style.overflow=""; back.remove(); }); foot.appendChild(b); m.appendChild(foot);
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
  function normUnit(u){ u=u.toLowerCase().replace(/s$/,""); if(u==="gram")u="g"; if(u==="ounce")u="oz"; if(u==="pound"||u==="lbs")u="lb"; if(u==="tbs")u="tbsp"; if(u==="cup")u="cup"; if(!CONV[u])u="g"; return u; }

  /* ---------- data safety: persistent storage + backup/restore ---------- */
  // Ask the browser to keep our storage (recipes) from being auto-evicted.
  if(navigator.storage && navigator.storage.persist){ navigator.storage.persist().catch(function(){}); }
  function backupAll(){
    syncCurrent(); save();
    var data=localStorage.getItem(STORE_KEY)||"{}";
    var blob=new Blob([data],{type:"application/json"});
    var a=document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download="soapcalc-backup-"+todayISO()+".json";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(a.href); },2000);
  }
  function restoreFrom(file){
    var r=new FileReader();
    r.onload=function(){
      var text=String(r.result), o;
      try{ o=JSON.parse(text); }catch(e){ alert("That file isn't valid JSON — pick a Soap Calc backup."); return; }
      if(!o||!Array.isArray(o.recipes)||o.recipes.length===0){ alert("That doesn't look like a Soap Calc backup (no recipes found)."); return; }
      if(!confirm("Restore "+o.recipes.length+" recipe(s) from this backup? This replaces the recipes currently on this device.")) return;
      try{ localStorage.setItem(STORE_KEY,text); location.reload(); }
      catch(e){ alert("Couldn't save the restored data."); }
    };
    r.readAsText(file);
  }

  /* ---------- action sheet open/close ---------- */
  // Force an element visible with inline !important, which outranks any injected
  // stylesheet rule (e.g. an ad-blocker / Brave Shields cosmetic filter that hides
  // an overlay with display:none !important).
  function forceVisible(elm,disp){ if(!elm) return; elm.style.setProperty("display",disp,"important"); elm.style.setProperty("visibility","visible","important"); }
  var sheetPrevFocus=null;
  function openSheet(){
    var b=$("sheetBack"); b.classList.remove("hide");
    forceVisible(b,"flex"); forceVisible($("sheet"),"block");
    document.body.style.overflow="hidden";
    sheetPrevFocus=document.activeElement;
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

  /* ---------- undo (single-level) + toast ---------- */
  var undoSnap=null, toastTimer=null;
  function pushUndo(){ undoSnap={ oils:state.oils.map(cloneItem), additives:state.additives.map(cloneItem), aromas:state.aromas.map(cloneItem) }; }
  function showToast(msg){
    $("toastMsg").textContent=msg;
    $("toast").classList.remove("hide");
    clearTimeout(toastTimer); toastTimer=setTimeout(function(){ $("toast").classList.add("hide"); },6000);
  }
  function doUndo(){
    if(!undoSnap) return;
    state.oils=undoSnap.oils; state.additives=undoSnap.additives; state.aromas=undoSnap.aromas;
    undoSnap=null; lastGoal=null; $("toast").classList.add("hide"); save(); render();
  }
  $("toastUndo").addEventListener("click",doUndo);

  /* ---------- PWA ---------- */
  if("serviceWorker" in navigator){ window.addEventListener("load",function(){ navigator.serviceWorker.register("sw.js").catch(function(){}); }); }
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

  /* ---------- modal helpers ---------- */
  function makeModal(){
    var back=el("div","modal-back"), m=el("div","modal"); back.appendChild(m);
    forceVisible(back,"flex"); forceVisible(m,"block");
    back.addEventListener("click",function(e){ if(e.target===back) closeModal(back); });
    document.body.style.overflow="hidden"; $("modalRoot").appendChild(back);
    return { back:back, m:m };
  }
  function closeModal(back){ document.body.style.overflow=""; back.remove(); }

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
    var foot=el("div","mfoot"); var close=el("button","primary","Done");
    close.addEventListener("click",function(){ closeModal(md.back); }); foot.appendChild(close); md.m.appendChild(foot);
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
    [["Hardness","hardness"],["Cleansing","cleansing"],["Conditioning","conditioning"],["Bubbly","bubbly"],["Creamy","creamy"]].forEach(function(q){
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
        var inp=document.createElement("input"); inp.type="number"; inp.min="0"; inp.step="any";
        inp.value=state.prices[pk]||""; inp.placeholder="0";
        inp.addEventListener("input",function(){ var v=parseFloat(inp.value); if(isFinite(v)&&v>0) state.prices[pk]=v; else delete state.prices[pk]; save(); recompute(); });
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
    var foot=el("div","mfoot"); var close=el("button","primary","Done"); close.addEventListener("click",function(){ closeModal(md.back); }); foot.appendChild(close); md.m.appendChild(foot);
  }

  /* ---------- recipe library ---------- */
  function uid(){ return "r"+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
  function libById(id){ for(var i=0;i<library.length;i++) if(library[i].id===id) return library[i]; return null; }
  function validUse(u){ for(var i=0;i<USES.length;i++) if(USES[i][0]===u) return true; return false; }
  function blankRecipe(name){ return { id:uid(), name:name, oils:[], additives:[], aromas:[],
    lyeType:"naoh", superfat:5, waterPct:38, kohPurity:90, madeOn:"", cureWeeks:4, checklist:{}, use:"body" }; }
  function cloneItem(it){ return {name:it.name,key:it.key,g:it.g}; }
  function stateFromRecipe(r,view){
    return { unit:UNITS[view.unit]?view.unit:"g",
      lastWeightUnit:(UNITS[view.lastWeightUnit]&&view.lastWeightUnit!=="pct"?view.lastWeightUnit:(UNITS[view.unit]&&view.unit!=="pct"?view.unit:"g")),
      tab:(["base","scents","make"].indexOf(view.tab)>=0?view.tab:"base"),
      scaleMode:(["batch","oils","mold"].indexOf(view.scaleMode)>=0?view.scaleMode:"batch"),
      barWeight:(view.barWeight>0?view.barWeight:110),
      currency:(typeof view.currency==="string"&&view.currency?view.currency:"$"),
      prices:(view.prices&&typeof view.prices==="object"?view.prices:{}),
      oils:r.oils, additives:r.additives, aromas:r.aromas,
      lyeType:r.lyeType, superfat:r.superfat, waterPct:r.waterPct, kohPurity:r.kohPurity,
      madeOn:r.madeOn||"", cureWeeks:(r.cureWeeks>=1?r.cureWeeks:4), checklist:r.checklist||{}, use:(validUse(r.use)?r.use:"body") };
  }
  function loadRecipeIntoState(r){
    state.oils=r.oils; state.additives=r.additives; state.aromas=r.aromas;
    state.lyeType=r.lyeType; state.superfat=r.superfat; state.waterPct=r.waterPct; state.kohPurity=r.kohPurity;
    state.madeOn=r.madeOn||""; state.cureWeeks=(r.cureWeeks>=1?r.cureWeeks:4); state.checklist=r.checklist||{}; state.use=validUse(r.use)?r.use:"body";
  }
  function syncCurrent(){ var r=libById(currentId); if(!r) return;
    r.oils=state.oils; r.additives=state.additives; r.aromas=state.aromas;
    r.lyeType=state.lyeType; r.superfat=state.superfat; r.waterPct=state.waterPct; r.kohPurity=state.kohPurity;
    r.madeOn=state.madeOn; r.cureWeeks=state.cureWeeks; r.checklist=state.checklist; r.use=state.use; }

  function switchRecipe(id){ if(id===currentId){ rebuildRecipeSelect(); return; } syncCurrent();
    var r=libById(id); if(!r) return; currentId=id; loadRecipeIntoState(r); scaleDirty=false; save(); render(); }
  function newRecipe(){
    var name=(prompt("Name this recipe:","Recipe "+(library.length+1))||"").trim();
    if(name==="") return; syncCurrent();
    var r=blankRecipe(name); library.push(r); currentId=r.id; loadRecipeIntoState(r); scaleDirty=false; save(); render();
  }
  function duplicateRecipe(){ syncCurrent(); var c=libById(currentId); if(!c) return;
    var r={ id:uid(), name:c.name+" copy", oils:c.oils.map(cloneItem), additives:c.additives.map(cloneItem),
      aromas:c.aromas.map(cloneItem), lyeType:c.lyeType, superfat:c.superfat, waterPct:c.waterPct, kohPurity:c.kohPurity };
    library.push(r); currentId=r.id; loadRecipeIntoState(r); scaleDirty=false; save(); render(); }
  function renameRecipe(){ var c=libById(currentId); if(!c) return;
    var name=(prompt("Rename recipe:",c.name)||"").trim(); if(name==="") return; c.name=name; save(); rebuildRecipeSelect(); }
  function deleteRecipe(){ var c=libById(currentId); if(!c) return;
    if(library.length<=1){ if(!confirm("This is your only recipe — clear its ingredients?")) return;
      c.oils=[]; c.additives=[]; c.aromas=[]; c.lyeType="naoh"; c.superfat=5; c.waterPct=38; c.kohPurity=90;
      loadRecipeIntoState(c); scaleDirty=false; save(); render(); return; }
    if(!confirm("Delete \""+c.name+"\"? This can't be undone.")) return;
    library=library.filter(function(x){return x.id!==currentId;});
    currentId=library[0].id; loadRecipeIntoState(library[0]); scaleDirty=false; save(); render(); }
  function rebuildRecipeSelect(){
    var sel=$("recipeSelect"); if(!sel) return; var h="";
    library.forEach(function(r){ h+='<option value="'+r.id+'"'+(r.id===currentId?" selected":"")+">"+escapeHtml(r.name)+"</option>"; });
    sel.innerHTML=h;
  }

  /* ---------- persistence ---------- */
  function initState(){
    var loaded=load();
    if(loaded){ library=loaded.recipes; currentId=loaded.currentId;
      var r=libById(currentId)||library[0]; currentId=r.id; return stateFromRecipe(r,loaded.view); }
    var r0=blankRecipe("My recipe"); library=[r0]; currentId=r0.id;
    return stateFromRecipe(r0,{unit:"g",tab:"base",scaleMode:"batch"});
  }
  function sanitizeRecipe(r){ if(!r||typeof r!=="object") return null;
    return { id:(typeof r.id==="string"&&r.id)?r.id:uid(),
      name:(typeof r.name==="string"&&r.name.trim())?r.name:"Untitled",
      oils:cleanList(r.oils,OILS), additives:cleanList(r.additives,ADDITIVES), aromas:cleanList(r.aromas,AROMAS),
      lyeType:(r.lyeType==="koh")?"koh":"naoh", superfat:clamp(r.superfat,5,0,15),
      waterPct:clamp(r.waterPct,38,25,50), kohPurity:clamp(r.kohPurity,90,85,100),
      madeOn:(typeof r.madeOn==="string")?r.madeOn:"", cureWeeks:clamp(r.cureWeeks,4,1,12),
      checklist:(r.checklist&&typeof r.checklist==="object")?r.checklist:{}, use:(validUse(r.use)?r.use:"body") }; }
  function save(){ syncCurrent();
    try{ localStorage.setItem(STORE_KEY,JSON.stringify({
      unit:state.unit, lastWeightUnit:state.lastWeightUnit, tab:state.tab, scaleMode:state.scaleMode,
      barWeight:state.barWeight, currency:state.currency, prices:state.prices,
      currentId:currentId, recipes:library
    })); }catch(e){} }
  function load(){
    try{
      var raw=localStorage.getItem(STORE_KEY);
      if(raw){ var o=JSON.parse(raw); if(!o||!Array.isArray(o.recipes)||o.recipes.length===0) throw 0;
        var recipes=o.recipes.map(sanitizeRecipe).filter(Boolean);
        if(recipes.length===0) throw 0;
        return { recipes:recipes, currentId:o.currentId, view:{unit:o.unit,lastWeightUnit:o.lastWeightUnit,tab:o.tab,scaleMode:o.scaleMode,
          barWeight:o.barWeight, currency:o.currency, prices:o.prices} }; }
      // migrate a single v3 recipe, if present
      var v3=localStorage.getItem("soapcalc.v3");
      if(v3){ var o3=JSON.parse(v3); if(o3){
        var r=sanitizeRecipe({ name:"My recipe", oils:o3.oils, additives:o3.additives, aromas:o3.aromas,
          lyeType:o3.lyeType, superfat:o3.superfat, waterPct:o3.waterPct, kohPurity:o3.kohPurity });
        return { recipes:[r], currentId:r.id, view:{unit:o3.unit,tab:o3.tab,scaleMode:o3.scaleMode} }; } }
    }catch(e){}
    return null;
  }
  function cleanList(list,db){ if(!Array.isArray(list)) return [];
    return list.filter(function(it){ return it&&typeof it.name==="string"&&typeof it.g==="number"&&isFinite(it.g); })
      .map(function(it){ return {name:it.name,key:(it.key&&db[it.key])?it.key:null,g:it.g}; }); }
  function clamp(v,def,lo,hi){ v=parseFloat(v); if(!isFinite(v)) return def; return Math.max(lo,Math.min(hi,v)); }
  function escapeHtml(s){ return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }

  render();
})();
