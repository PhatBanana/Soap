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
  var IMPORT_UNITS = Object.keys(CONV);   // same units CONV can convert

  var QUALITIES = [
    { key:"hardness",     label:"Hardness",     scale:70, lo:29, hi:54, fn:function(f){return f.pa+f.st+f.la+f.my;} },
    { key:"cleansing",    label:"Cleansing",    scale:40, lo:12, hi:22, fn:function(f){return f.la+f.my;} },
    { key:"conditioning", label:"Conditioning", scale:90, lo:44, hi:69, fn:function(f){return f.ol+f.li+f.ln+f.ri;} },
    { key:"bubbly",       label:"Bubbly lather",scale:70, lo:14, hi:46, fn:function(f){return f.la+f.my+f.ri;} },
    { key:"creamy",       label:"Creamy lather",scale:70, lo:16, hi:48, fn:function(f){return f.pa+f.st+f.ri;} }
  ];
  var IOD_RANGE=[41,70], INS_RANGE=[136,165], KOH_FACTOR=1.40274;
  var STORE_KEY = "soapcalc.v4";
  var APP_VERSION = "v29", BUILD_DATE = "2026-07-25";   // bump both (and sw.js CACHE) each release
  var USES=[["body","Body / bath"],["face","Facial"],["hair","Shampoo"],["shave","Shaving"],["dish","Dish soap"],["laundry","Laundry"]];

  /* One schema per persisted thing, so every save/load/copy function stays in lockstep and
     validation lives in exactly one place. Adding a field = one row here, nothing else.
       def    — default (a function for fresh arrays/objects); also what coerce() returns for bad input
       coerce — validate a raw value to a safe one (scalar fields)
       list   — this is an ingredient list; validated/copied via cleanList / cloneItem instead      */
  function defOf(fld){ return typeof fld.def==="function" ? fld.def() : fld.def; }
  var RECIPE_FIELDS=[
    {k:"oils",      list:OILS,      def:function(){return [];}},
    {k:"additives", list:ADDITIVES, def:function(){return [];}},
    {k:"aromas",    list:AROMAS,    def:function(){return [];}},
    {k:"lyeType",   def:"naoh", coerce:function(v){return v==="koh"?"koh":"naoh";}},
    {k:"superfat",  def:5,      coerce:function(v){return clamp(v,5,0,15);}},
    {k:"waterPct",  def:38,     coerce:function(v){return clamp(v,38,25,50);}},
    {k:"waterMode", def:"oils", coerce:function(v){return (v==="conc"||v==="ratio")?v:"oils";}},
    {k:"lyeConc",   def:33,     coerce:function(v){return clamp(v,33,25,50);}},
    {k:"kohPurity", def:90,     coerce:function(v){return clamp(v,90,85,100);}},
    {k:"madeOn",    def:"",     coerce:function(v){return typeof v==="string"?v:"";}},
    {k:"cureWeeks", def:4,      coerce:function(v){return clamp(v,4,1,16);}},
    {k:"checklist", def:function(){return {};}, coerce:function(v){return (v&&typeof v==="object")?v:{};}},
    {k:"use",       def:"body", coerce:function(v){return validUse(v)?v:"body";}},
    {k:"notes",     def:"",     coerce:function(v){return typeof v==="string"?v:"";}},
    {k:"method",    def:"cp",   coerce:function(v){return v==="hp"?"hp":"cp";}},          // cold or hot process
    {k:"dilution",  def:1,      coerce:function(v){return clamp(v,1,0.25,4);}},           // KOH paste : water, by weight
    {k:"waterRatio",def:2,      coerce:function(v){return clamp(v,2,1,4);}},              // water : lye, by weight
    {k:"lot",       def:"",     coerce:function(v){return typeof v==="string"?v.slice(0,32):"";}},
    // bar size belongs to the recipe's mould, not to the app — it drives bar count,
    // cost per bar, the wrapper's net weight and the "Bars" scale target
    {k:"barWeight", def:110,    coerce:function(v){return clamp(v,110,10,2000);}}
  ];
  var VIEW_FIELDS=[
    {k:"unit",           coerce:function(v){return UNITS[v]?v:"g";}},
    {k:"lastWeightUnit", coerce:function(v,view){return (UNITS[v]&&v!=="pct")?v:((UNITS[view.unit]&&view.unit!=="pct")?view.unit:"g");}},
    {k:"tab",            coerce:function(v){return ["base","scents","make"].indexOf(v)>=0?v:"base";}},
    {k:"scaleMode",      coerce:function(v){return ["batch","oils","bars","mold"].indexOf(v)>=0?v:"batch";}},
    {k:"moldShape",      coerce:function(v){return ["loaf","round","cavity"].indexOf(v)>=0?v:"loaf";}},
    {k:"scaleUnit",      coerce:function(v){return (UNITS[v]&&v!=="pct")?v:null;}},
    {k:"currency",       coerce:function(v){return (typeof v==="string"&&v)?v:"$";}},
    {k:"prices",         coerce:function(v){return (v&&typeof v==="object")?v:{};}},
    {k:"collapsed",      coerce:function(v){return (v&&typeof v==="object")?v:null;}},
    // ingredient keys you've added lately, newest first — drives the quick-add chips
    {k:"recent",         coerce:function(v){return Array.isArray(v)?v.filter(function(x){return typeof x==="string";}).slice(0,8):[];}},
    {k:"theme",          coerce:function(v){return (v==="light"||v==="dark")?v:"auto";}}
  ];

  var library=[];      // [{ id, name } + the RECIPE_FIELDS above]
  var currentId=null;
  var sharedImportName=null;   // set by initState when a recipe arrives via a #r= share link
  var state = initState();

  /* ---------- small helpers ---------- */
  var $ = function(id){ return document.getElementById(id); };
  function el(tag, cls, html){ var e=document.createElement(tag); if(cls)e.className=cls; if(html!=null)e.innerHTML=html; return e; }
  function fromG(g,u){ return g/UNITS[u].toG; }
  function fmt(n,dp){ if(!isFinite(n)) return "0"; var s=n.toFixed(dp); if(s.indexOf(".")>-1) s=s.replace(/\.?0+$/,""); return s; }
  function weightUnit(){ return state.unit==="pct" ? (UNITS[state.lastWeightUnit]&&state.lastWeightUnit!=="pct" ? state.lastWeightUnit : "g") : state.unit; }
  // the scale target has its own unit so you can ask for "10 lb" without switching the whole app
  function scaleUnit(){ return (UNITS[state.scaleUnit]&&state.scaleUnit!=="pct") ? state.scaleUnit : weightUnit(); }
  // mark the button whose data-<attr> equals val as ".active" within a segmented control
  function setActive(container, attr, val){ Array.prototype.forEach.call(container.children,function(b){ b.classList.toggle("active", b.dataset[attr]===val); }); }
  function sumG(list){ return list.reduce(function(s,it){return s+it.g;},0); }
  function totalOilsG(){ return sumG(state.oils); }
  function oilInfo(it){ return it.key ? OILS[it.key] : null; }
  // cleansing tolerance depends on how gentle the intended use must be
  function cleansingCap(use){ return use==="face" ? 18 : (use==="hair" ? 20 : 22); }

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

  Array.prototype.forEach.call($("lyeType").children,function(b){
    b.addEventListener("click",function(){ state.lyeType=b.dataset.t; save(); render(); });
  });
  bindRange($("sf"),"sfVal","superfat");
  bindRange($("water"),"waterVal","waterPct");
  bindRange($("lyeConc"),"concVal","lyeConc");
  bindRange($("purity"),"purVal","kohPurity");
  Array.prototype.forEach.call($("waterMode").children,function(b){
    b.addEventListener("click",function(){ state.waterMode=b.dataset.w; save(); render(); });
  });
  $("recalcBtn").addEventListener("click",function(){ save(); render(); showToast("Recalculated ✓",true); });
  $("aiExplain").addEventListener("click",runAIExplain);
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
  $("scaleUnit").addEventListener("change",function(){ state.scaleUnit=$("scaleUnit").value; save(); updateScaleCard(); });
  $("scaleApply").addEventListener("click",applyWeightScale);
  ["mL","mW","mH","mD","mRH","mCount","mCavVol"].forEach(function(id){ $(id).addEventListener("input",updateMoldHint); });
  $("mUnit").addEventListener("change",updateMoldHint);
  Array.prototype.forEach.call($("moldShape").children,function(b){
    b.addEventListener("click",function(){ state.moldShape=b.dataset.ms; save(); updateScaleCard(); });
  });
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
  Array.prototype.forEach.call($("methodSeg").children,function(b){
    b.addEventListener("click",function(){ state.method=b.dataset.mt; save(); render(); });
  });
  bindRange($("waterRatio"),"ratioVal","waterRatio");
  $("roundBtn").addEventListener("click",roundAmounts);
  $("lotField").addEventListener("input",function(){ state.lot=$("lotField").value; save(); });
  $("lotGen").addEventListener("click",function(){
    var d=state.madeOn||todayISO();
    state.lot=d.replace(/-/g,"")+"-A"; $("lotField").value=state.lot; save();
  });
  $("dilution").addEventListener("input",function(){
    state.dilution=parseFloat($("dilution").value)||1; $("dilVal").textContent=fmt(state.dilution,2);
    updateDilutePanel(); save();
  });
  $("notesField").addEventListener("input",function(){ state.notes=$("notesField").value; save(); });
  $("madeOn").addEventListener("change",function(){ state.madeOn=$("madeOn").value; save(); updateReady(); });
  $("cureWeeks").addEventListener("input",function(){ state.cureWeeks=parseInt($("cureWeeks").value,10)||4; $("cureWeeksVal").textContent=state.cureWeeks; save(); updateCureSuggest(); updateReady(); });
  $("resetChecklist").addEventListener("click",function(){ if(confirm("Uncheck all steps?")){ state.checklist={}; save(); renderMake(); } });

  /* ================= RENDER ================= */
  function render(){
    rebuildRecipeSelect();
    setActive(unitsEl,"unit",state.unit);
    setActive($("tabs"),"tab",state.tab);
    $("tab-base").hidden = state.tab!=="base";
    $("tab-scents").hidden = state.tab!=="scents";
    $("tab-make").hidden = state.tab!=="make";

    if(state.tab==="base") renderBase();
    else if(state.tab==="scents") renderScents();
    else renderMake();
    updateMiniSummary();   // the scents/make renderers don't run refreshDerived
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
    setActive($("lyeType"),"t",state.lyeType);
    $("purityCtrl").classList.toggle("hide",state.lyeType!=="koh");
    $("sf").value=state.superfat; $("sfVal").textContent=state.superfat;
    $("water").value=state.waterPct; $("waterVal").textContent=state.waterPct;
    $("lyeConc").value=state.lyeConc; $("concVal").textContent=state.lyeConc;
    $("purity").value=state.kohPurity; $("purVal").textContent=state.kohPurity;
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
  function pickLabel(sel){
    if(sel.indexOf("oil:")===0){ var o=OILS[sel.slice(4)]; return o?o.name:null; }
    if(sel.indexOf("add:")===0){ var a=ADDITIVES[sel.slice(4)]; return a?a.name:null; }
    return null;
  }
  function renderQuickAdd(){
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

  function buildOilRow(it,i){
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
      lastGoal=null; refreshDerived(amtVal); save();
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
    lyeType:state.lyeType, superfat:state.superfat, waterPct:state.waterPct, kohPurity:state.kohPurity,
    waterMode:state.waterMode, lyeConc:state.lyeConc, waterRatio:state.waterRatio }; }
  function oilsGof(rv){ return sumG(rv.oils); }
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
    var waterG;
    if(rv.waterMode==="conc"){
      var c=(rv.lyeConc>0?rv.lyeConc:33)/100;   // lye concentration = lye / (lye + water)
      waterG = lyeG*(1-c)/c;                     // water sized from the lye (so superfat lowers it too)
    } else if(rv.waterMode==="ratio"){
      waterG = lyeG*(rv.waterRatio>0?rv.waterRatio:2);   // the "2:1 water:lye" notation
    } else {
      waterG = oilG*rv.waterPct/100;
    }
    return { lyeG:lyeG, waterG:waterG, oilG:oilG, kind:kind, hasCustom:hasCustom };
  }
  // single source of truth for the fatty-acid quality formulas: derived from QUALITIES,
  // plus `poly` (rancidity-prone polyunsaturates) which several advisories use.
  function qualitiesOf(fa){ var o={}; for(var i=0;i<QUALITIES.length;i++) o[QUALITIES[i].key]=QUALITIES[i].fn(fa); o.poly=fa.li+fa.ln; return o; }
  function statsFor(r){
    var B=blendFA(r), L=computeLye(r), tot=oilsGof(r);
    var scentG=sumG(r.aromas);
    return { oilsG:tot, batchG:currentBatchG(r), lyeG:L.lyeG, waterG:L.waterG, kind:L.kind,
      sf:r.superfat, waterPct:r.waterPct, q:qualitiesOf(B.fa), iod:B.iod, ins:B.ins,
      oilPcts:r.oils.map(function(it){ return {name:it.name,key:it.key,pct:tot>0?it.g/tot*100:0}; }),
      scentPct: tot>0?scentG/tot*100:0 };
  }

  /* ---------- refresh derived values (in place) ---------- */
  function refreshDerived(active){
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
  function updateMiniSummary(){
    var box=$("miniSummary"); if(!box) return;
    var show = state.tab==="base" && state.oils.length>0;
    box.classList.toggle("hide",!show); if(!show) return;
    var L=computeLye(), wunit=weightUnit(), ul=UNITS[wunit].label;
    box.innerHTML="<span><b>"+fmt(fromG(L.lyeG,wunit),2)+"</b> "+ul+" "+(state.lyeType==="koh"?"KOH":"NaOH")+"</span>"+
      "<span><b>"+fmt(fromG(L.waterG,wunit),1)+"</b> "+ul+" water</span>"+
      "<span><b>"+fmt(fromG(currentBatchG(),wunit),1)+"</b> "+ul+" batch</span>";
  }
  function updateLyePanel(){
    var wunit=weightUnit(), L=computeLye(), isPct=state.unit==="pct";
    $("lyeK").textContent=L.kind;
    $("lyeVal").textContent=fmt(fromG(L.lyeG,wunit),2); $("lyeUnit").textContent=UNITS[wunit].label;
    $("waterOut").textContent=fmt(fromG(L.waterG,wunit),1); $("waterUnit").textContent=UNITS[wunit].label;
    var batch=currentBatchG();
    $("batchOut").textContent=fmt(fromG(batch,wunit),1); $("batchUnit").textContent=UNITS[wunit].label;
    var conc=(L.lyeG+L.waterG)>0?L.lyeG/(L.lyeG+L.waterG)*100:0;
    var waterOfOils=L.oilG>0?L.waterG/L.oilG*100:0;
    var info=(state.waterMode==="oils"
        ? "Lye concentration ≈ "+fmt(conc,1)+"%"
        : "Water ≈ "+fmt(waterOfOils,1)+"% of oils · lye conc. ≈ "+fmt(conc,1)+"%")
      +(state.superfat>0?" · "+state.superfat+"% superfat":"");
    if(isPct) info+=" · shown in "+UNITS[wunit].name;
    if(L.hasCustom) info+=" · custom oils excluded";
    var liquidAdd=state.additives.some(function(it){ return it.key&&ADDITIVES[it.key].kind==="liquid"&&it.g>0; });
    if(liquidAdd) info+=" · liquid additives replace part of the water";
    $("lyeInfo").textContent=info;
  }

  // KOH soap is cooked to a paste, then thinned with water. Sizes that dilution.
  function updateDilutePanel(){
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
  // labels for the help panel: the 5 quality labels come straight from QUALITIES, plus the two indices
  var QUAL_LABELS={iodine:"Iodine",ins:"INS"};
  QUALITIES.forEach(function(q){ QUAL_LABELS[q.key]=q.label; });
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
      ex.className="qual-explain";
      ex.innerHTML="<b>"+QUAL_LABELS[openHelp]+" <span class='r'>· good range "+helpRange(openHelp)+"</span></b>"+escapeHtml(QUAL_HELP[openHelp]);
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

  /* ---------- deterministic safety check (all on-device, works on every phone) ---------- */
  var lastSafety=null;
  function safetyChecks(){
    var items=[], L=computeLye(), sf=state.superfat, use=state.use||"body";
    var skin=(use==="body"||use==="face"||use==="hair"||use==="shave");
    var f=blendFA().fa, poly=f.li+f.ln;
    var conc=(L.lyeG+L.waterG)>0 ? L.lyeG/(L.lyeG+L.waterG)*100 : 0;
    var tot=totalOilsG();
    function addPctOf(key){ var g=0; state.additives.forEach(function(it){ if(it.key===key) g+=it.g; }); return tot>0?g/tot*100:0; }
    var saltPct=addPctOf("salt"), saltBar=saltPct>=20;
    function add(level,title,detail){ items.push({level:level,title:title,detail:detail}); }

    if(L.oilG<=0 || L.lyeG<=0){
      add("fail","Can't verify the lye","No oils with SAP data, so the app can't confirm the lye is balanced. Add oils from the list (custom oils have no data).");
    } else {
      if(L.hasCustom) add("warn","Custom oils aren't in the lye math","The lye is sized only for oils that have data, so your true superfat is higher and unverified. Look up the SAP value of any custom oil before you make this.");
      if(sf<=0){
        if(skin) add("warn","No superfat cushion","Superfat is 0% — with no extra oil, a small measuring slip could leave free lye, which is harsh on skin. Use at least 1–2% for a skin bar.");
        else add("ok","0% superfat is intended here","For dish/laundry soap, 0% superfat is correct so no oil is left behind.");
      } else if(sf>12 && !saltBar){
        add("warn","Very high superfat","Superfat is "+sf+"% — that's a lot of unsaponified oil, so the bar stays soft and can go rancid sooner. 5–8% is typical for skin.");
      } else {
        add("ok","Lye is balanced","Superfat "+sf+"% leaves a little extra oil so no free lye is left over — this is the safe zone"+(saltBar?" (a high superfat is right for a salt bar)":"")+".");
      }
      if(conc>=43) add("warn","Strong lye solution","Lye concentration is about "+Math.round(conc)+"% — it heats up fast and is harsher to handle. Mix slowly and watch the temperature.");
      else if(conc>0 && conc<25) add("warn","Very dilute lye","Lye concentration is only about "+Math.round(conc)+"% — that's a lot of water. The bar will be soft, slow to set and may weep; use less water (or a higher lye concentration).");
    }

    // the classic "100% coconut" trap: very cleansing lauric oils need a big superfat on skin
    var lauric=oilPct(["coconut","palmkernel","babassu"]);
    if(skin && lauric>=80 && sf<15)
      add("warn","Very high coconut / lauric oil","This is "+Math.round(lauric)+"% coconut/palm-kernel — famously harsh and drying on skin at a normal superfat. Either treat it as a salt or laundry bar, or push superfat up to ~15–20%.");

    // salt bars behave differently
    if(saltBar){
      if(sf<12) add("warn","Salt bar needs more superfat","With ~"+Math.round(saltPct)+"% salt, use a high superfat (~15–20%) and plenty of coconut or it'll be drying and crumbly.");
      else add("ok","Salt bar — cut it warm","Salt bars set very hard, very fast. Cut it while still warm (within a few hours) or it will crumble.");
    }

    // batch size sanity — too small to weigh the lye safely, or unwieldy-large for a beginner
    var wu=weightUnit(), showAmt=function(g){ return fmt(fromG(g,wu),wu==="g"?0:1)+" "+UNITS[wu].label; };
    if(tot>0 && tot<150) add("warn","Very small batch","Only "+showAmt(tot)+" of oils — at this size the lye is hard to weigh accurately and a tiny scale error becomes a big percentage. Scale up to ~300 g+ of oils for a safer batch.");
    else if(tot>5000) add("warn","Large batch","About "+showAmt(tot)+" of oils — that's a big, heavy batch that holds heat (overheating risk) and is a lot to handle at once. Fine if you're experienced; otherwise start smaller.");

    // a runaway single oil usually means a missed oil or a mistyped amount
    if(tot>0){
      var top=null,topg=0; state.oils.forEach(function(it){ if(it.g>topg){ topg=it.g; top=it; } });
      if(top && top.key && top.key!=="olive" && top.key!=="coconut" && topg/tot>=0.95)
        add("warn","Nearly a single-oil recipe","This is about "+Math.round(topg/tot*100)+"% "+top.name+". A one-oil bar is unusual (apart from an olive castile) — double-check you didn't miss an oil or mistype an amount.");
    }

    // an additive dosed like an oil is a common grams-vs-teaspoons slip (salt & water-replacers excluded)
    var ADD_CAP={honey:10,sugar:10,sodiumlactate:5,oatmeal:15,kaolin:10,bentonite:10,charcoal:5,glycerin:8,silk:2,vitamine:2,titanium:6,mica:6,coffeegrounds:20};
    var odose=[];
    state.additives.forEach(function(it){ var cap=ADD_CAP[it.key]; if(cap && tot>0){ var pct=it.g/tot*100; if(pct>cap+0.5) odose.push(it.name+" (~"+fmt(pct,1)+"% vs ~"+cap+"% usual)"); } });
    if(odose.length) add("warn","Additive dosed high", odose.join("; ")+". That's well above the usual amount — double-check it isn't a units slip (grams vs teaspoons).");

    var scentG=sumG(state.aromas);
    var scentPct = tot>0 ? scentG/tot*100 : 0, over=[];
    state.aromas.forEach(function(it){ var d=it.key?AROMAS[it.key]:null;
      if(d && tot>0){ var pct=it.g/tot*100; if(pct > d.rate[2]+0.05) over.push(it.name+" (~"+fmt(pct,1)+"% vs "+d.rate[2]+"% max)"); } });
    if(over.length) add("warn","Scent over its skin-safe max", over.join("; ")+". Reduce these to stay skin-safe.");
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
  function updateSafety(){
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

  /* ---------- optional on-device AI explainer (Chrome Prompt API / Gemini Nano) ---------- */
  var aiAvail=false, aiApi=null;
  function detectAI(){
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
  function maybeShowAI(){ var b=$("aiExplain"); if(b) b.classList.toggle("hide", !(aiAvail&&lastSafety)); }
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
  function runAIExplain(){
    if(!lastSafety) return;
    var b=$("aiExplain"), out=$("aiOut"), orig=b.textContent;
    b.disabled=true; b.textContent="Thinking…";
    out.classList.remove("hide"); out.textContent="Preparing the on-device model…";
    aiRun(buildAIPrompt(lastSafety),function(p){ out.textContent="Downloading the on-device model… "+p+"%"; })
      .then(function(text){ out.textContent=String(text).trim(); $("aiNote").hidden=false; })
      .catch(function(){ out.textContent="Couldn't run the on-device model this time — the rule-based checks above still stand."; })
      .then(function(){ b.disabled=false; b.textContent=orig; });
  }

  /* ---------- scale recipe ---------- */
  function currentBatchG(rv){
    rv=rv||curRV();
    var L=computeLye(rv);
    var add=sumG(rv.additives);
    var ar=sumG(rv.aromas);
    return L.oilG + L.lyeG + L.waterG + add + ar;
  }
  // Most of the water evaporates during cure; the rest of the batch stays put. ~70% is a
  // reasonable middle estimate — the real figure depends on humidity, airflow and cure length.
  function curedBatchG(rv){
    var L=computeLye(rv||curRV());
    return Math.max(0, currentBatchG(rv) - L.waterG*0.7);
  }
  function moldOilsG(){
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
  function scaleAll(factor){
    if(!(factor>0)||!isFinite(factor)) return;
    state.oils.forEach(function(it){ it.g*=factor; });
    state.additives.forEach(function(it){ it.g*=factor; });
    state.aromas.forEach(function(it){ it.g*=factor; });
    save(); render();
  }
  function applyWeightScale(){
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
  function roundStepG(u){ return u==="g" ? 1 : u==="oz" ? UNITS.oz.toG*0.1 : u==="lb" ? UNITS.lb.toG*0.01 : 10; }
  function roundAmounts(){
    var wunit=weightUnit(), step=roundStepG(wunit);
    if(!(totalOilsG()>0)) return;
    pushUndo();
    [state.oils,state.additives,state.aromas].forEach(function(list){
      list.forEach(function(it){ if(it.g>0) it.g=Math.max(step,Math.round(it.g/step)*step); });
    });
    lastGoal=null; save(); render();
    showToast("Rounded to tidy "+UNITS[wunit].name);
  }
  function applyMold(){
    var target=moldOilsG(); if(target<=0) return;
    var cur=totalOilsG(); if(cur<=0) return;
    pushUndo(); scaleAll(target/cur); showToast("Scaled to fit mold");
  }
  function updateScaleCard(){
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
    if(!$("scaleUnit").options.length){ var uh=""; ["g","oz","lb","kg"].forEach(function(u){ uh+='<option value="'+u+'">'+UNITS[u].label+'</option>'; }); $("scaleUnit").innerHTML=uh; }
    $("scaleUnit").value=sunit;
    $("scaleUnit").classList.toggle("hide",isBars);
    $("scaleBarsUnit").classList.toggle("hide",!isBars);
    $("scaleTarget").placeholder = isBars ? "Number of bars" : (state.scaleMode==="oils" ? "Target oils" : "Target wet weight");
    var oilsG=totalOilsG(), batchG=currentBatchG();

    // expected yield readout
    $("yieldVal").textContent=fmt(fromG(batchG,wunit),UNITS[wunit].dp);
    $("yieldUnit").textContent=ul;
    var bars=barCount(batchG);
    $("yieldBars").textContent="≈ "+bars+" bar"+(bars===1?"":"s")+" (~"+barG()+" g each) · "+fmt(fromG(oilsG,wunit),1)+" "+ul+" of oils";
    var cured=curedBatchG(), lossPct = batchG>0 ? (batchG-cured)/batchG*100 : 0;
    $("yieldCured").textContent="After curing ≈ "+fmt(fromG(cured,wunit),1)+" "+ul+
      " (about "+Math.round(lossPct)+"% lighter as the water dries out)";
    if($("barW")!==document.activeElement) $("barW").value=state.barWeight;

    // reuse the target field to also show the current amount (in the target's unit) until edited
    if(!isMold && !scaleDirty && document.activeElement!==$("scaleTarget")){
      if(isBars){ $("scaleTarget").value = batchG>0 ? barCount(batchG) : ""; }
      else { var curShown = state.scaleMode==="oils" ? oilsG : batchG;
        $("scaleTarget").value = curShown>0 ? fmt(fromG(curShown,sunit),UNITS[sunit].dp) : ""; }
    }
    updateScaleHint(); updateMoldHint();
  }
  function updateScaleHint(){
    var isBars=state.scaleMode==="bars", sunit=scaleUnit(), sul=UNITS[sunit].label, raw=parseFloat($("scaleTarget").value);
    if(!scaleDirty || !(raw>0)){
      $("scaleHint").textContent = isBars
        ? "Shows how many bars this batch makes (at ~"+barG()+" g each) — type how many you want and tap Scale."
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
  function updateMoldHint(){
    var wunit=weightUnit(), ul=UNITS[wunit].label, t=moldOilsG();
    if(t<=0){ $("moldHint").textContent = {
      round:"Enter the inner diameter × height of a round/column mold.",
      cavity:"Enter how many cavities and how much each one holds (mL).",
      loaf:"Enter the inner Length × Width × Height of a loaf/box mold."
    }[state.moldShape||"loaf"]; return; }
    var cur=totalOilsG(), f=cur>0?t/cur:0;
    $("moldHint").textContent="≈ "+fmt(fromG(t,wunit),1)+" "+ul+" of oils for this mold"+(f>0?"  (× "+fmt(f,3)+")":"");
  }

  function updateScents(active){
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
  var CP_STEPS=[
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
  var HP_STEPS=[
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
  function checkSteps(){ return state.method==="hp" ? HP_STEPS : CP_STEPS; }
  function todayISO(){ var d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
  function renderMake(){
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
        save(); updateChecklistProgress();
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
  }
  function updateMethodNote(){
    setActive($("methodSeg"),"mt",state.method||"cp");
    $("methodNote").textContent = state.method==="hp"
      ? "Cook the batter in a slow cooker until saponification finishes, then mould it. Scent goes in after the cook, and it's usable in about a week."
      : "Mix at low temperature, pour at trace, and let the bars saponify in the mould. Smoother tops and better swirls, but it needs a full cure.";
  }
  function updateChecklistProgress(){
    var steps=checkSteps(), done=steps.filter(function(_,i){ return state.checklist["s"+i]; }).length;
    $("checkProgress").textContent = done+" of "+steps.length+" steps done";
  }
  function suggestedCure(){
    var B=blendFA(); if(B.tot<=0) return null;
    var f=B.fa, hard=qualitiesOf(f).hardness, soft=f.ol+f.li+f.ln;
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
  function updateCureSuggest(){
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
  function updateTempSuggest(){
    var box=$("tempSuggest"); if(!box) return;
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
    ["honey","sugar","goatmilk","coconutmilk"].forEach(function(k){
      if(state.additives.some(function(it){return it.key===k&&it.g>0;})) cool.push(ADDITIVES[k].name); });
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
  // percent of total oils made up by one oil key, or the combined total of several keys
  function oilPct(keys){ keys=[].concat(keys); var g=0,t=totalOilsG(); state.oils.forEach(function(it){ if(keys.indexOf(it.key)>=0) g+=it.g; }); return t>0?g/t*100:0; }
  /* Live balance check for the current blend — updates as you drag the oil
     sliders or tap a goal. Flags any downside and suggests a fix ingredient. */
  function updateShapeFeedback(){
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
      case "shopping": openShopping(); break;
      case "theme": cycleTheme(); break;
      case "card": openCard(); break;
      case "label": openLabel(); break;
      case "wrapper": openWrapper(); break;
      case "share": openShare(); break;
      case "trouble": openTrouble(); break;
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
      var name, amount;
      if(looksHeader){ name = col.name>=0 ? r[col.name] : r[1]; amount = col.amount>=0 ? r[col.amount] : ""; }
      else { name = r[0]; amount = r[1]; }   // no header: fall back to positional name, amount
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
  function normUnit(u){ u=u.toLowerCase().replace(/s$/,""); if(u==="gram")u="g"; if(u==="ounce")u="oz"; if(u==="pound")u="lb"; if(u==="tbs")u="tbsp"; if(!CONV[u])u="g"; return u; }

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

  /* ---------- undo (multi-level) + toast ---------- */
  var UNDO_MAX=10, undoStack=[], toastTimer=null;
  function pushUndo(){
    undoStack.push({ id:currentId, oils:state.oils.map(cloneItem),
      additives:state.additives.map(cloneItem), aromas:state.aromas.map(cloneItem) });
    if(undoStack.length>UNDO_MAX) undoStack.shift();
  }
  function showToast(msg,noUndo){
    $("toastMsg").textContent=msg;
    $("toastUndo").classList.toggle("hide", !!noUndo || undoStack.length===0);
    $("toastUndo").textContent = undoStack.length>1 ? "Undo ("+undoStack.length+")" : "Undo";
    $("toast").classList.remove("hide");
    clearTimeout(toastTimer); toastTimer=setTimeout(function(){ $("toast").classList.add("hide"); },noUndo?2500:6000);
  }
  function doUndo(){
    // only step back through edits made to the recipe you're looking at
    while(undoStack.length && undoStack[undoStack.length-1].id!==currentId) undoStack.pop();
    var snap=undoStack.pop(); if(!snap) { $("toast").classList.add("hide"); return; }
    state.oils=snap.oils; state.additives=snap.additives; state.aromas=snap.aromas;
    lastGoal=null; save(); render();
    if(undoStack.length) showToast("Undone"); else $("toast").classList.add("hide");
  }
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
  // Build the finished-bar INCI ingredient list: saponified oils (Sodium/Potassium …),
  // water, naturally-occurring glycerin, then additives and fragrance, in descending weight order.
  function inciLabel(){
    var L=computeLye(), total=totalOilsG(), salt=(state.lyeType==="koh"?"Potassium ":"Sodium ");
    var entries=[], missing=[], glyAdd=0;
    state.oils.forEach(function(it){ if(!(it.g>0)) return;
      var base=it.key?OIL_INCI[it.key]:null;
      if(base){ entries.push({name: base.charAt(0)==="=" ? base.slice(1) : salt+base, w:it.g}); }
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
  function b64urlEnc(str){ return btoa(unescape(encodeURIComponent(str))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
  function b64urlDec(s){ s=s.replace(/-/g,"+").replace(/_/g,"/"); while(s.length%4) s+="="; return decodeURIComponent(escape(atob(s))); }
  function shareItems(list){ return list.map(function(it){ return {name:it.name,key:it.key,g:Math.round(it.g*100)/100}; }); }
  function recipeShareURL(r){
    var payload={ name:r.name, oils:shareItems(r.oils), additives:shareItems(r.additives), aromas:shareItems(r.aromas),
      lyeType:r.lyeType, superfat:r.superfat, waterPct:r.waterPct, waterMode:r.waterMode,
      lyeConc:r.lyeConc, kohPurity:r.kohPurity, cureWeeks:r.cureWeeks, use:r.use };
    return location.origin+location.pathname+"#r="+b64urlEnc(JSON.stringify(payload));
  }
  function importSharedFromHash(){
    var m=(location.hash||"").match(/[#&]r=([^&]+)/); if(!m) return null;
    try{ var r=sanitizeRecipe(JSON.parse(b64urlDec(m[1])));
      history.replaceState(null,"",location.pathname+location.search);   // so a refresh doesn't re-import
      return r;
    }catch(e){ return null; }
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
  /* ---------- "why did my soap do X?" troubleshooting reference ---------- */
  function openTrouble(){
    var md=makeModal();
    md.m.appendChild(el("h3",null,"Troubleshooting"));
    md.m.appendChild(el("p","sub","Something go sideways? Find the symptom, why it happened, and what to do."));
    var filter=document.createElement("input"); filter.className="ts-filter"; filter.type="search";
    filter.placeholder="Search symptoms (soft, ash, lather…)"; md.m.appendChild(filter);
    var wrap=el("div","ts-wrap"); md.m.appendChild(wrap);
    var groups=[];
    (window.TROUBLESHOOTING||[]).forEach(function(t){
      var g=null; groups.forEach(function(x){ if(x.when===t.when) g=x; });
      if(!g){ g={when:t.when,items:[]}; groups.push(g); } g.items.push(t);
    });
    function draw(q){
      q=(q||"").toLowerCase().trim(); wrap.innerHTML="";
      groups.forEach(function(g){
        var hits=g.items.filter(function(t){ return !q || (t.q+" "+t.why+" "+t.fix).toLowerCase().indexOf(q)>=0; });
        if(!hits.length) return;
        wrap.appendChild(el("div","ts-group",escapeHtml(g.when)));
        hits.forEach(function(t){
          var d=document.createElement("details"); d.className="ts-item"; if(q) d.open=true;
          var s=document.createElement("summary"); s.textContent=t.q; d.appendChild(s);
          d.appendChild(el("div","ts-body","<p><b>Why:</b> "+escapeHtml(t.why)+"</p><p><b>Fix:</b> "+escapeHtml(t.fix)+"</p>"));
          wrap.appendChild(d);
        });
      });
      if(!wrap.children.length) wrap.appendChild(el("p","sub","No match — try another word (e.g. “soft”, “ash”, “lather”)."));
    }
    filter.addEventListener("input",function(){ draw(filter.value); });
    draw("");
    var foot=el("div","mfoot"); var cl=el("button","primary","Close");
    cl.addEventListener("click",function(){ closeModal(md.back); }); foot.appendChild(cl); md.m.appendChild(foot);
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
      if(r.lyeType==="koh") koh+=L.lyeG; else naoh+=L.lyeG;
      water+=L.waterG;
    });
    function sorted(map){ return Object.keys(map).map(function(k){ return map[k]; })
      .sort(function(a,b){ return b.g-a.g; }); }
    return { oils:sorted(oils), adds:sorted(adds), scents:sorted(scents), naoh:naoh, koh:koh, water:water };
  }
  function openShopping(){
    syncCurrent();
    var md=makeModal(), picked={}; picked[currentId]=true;
    md.m.appendChild(el("h3",null,"Shopping list"));
    md.m.appendChild(el("p","sub","Tick the recipes you plan to make and it totals up everything you need to buy."));
    var pick=el("div","shop-pick"); md.m.appendChild(pick);
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
    md.m.appendChild(all);
    var out=el("div"); md.m.appendChild(out);
    var foot=el("div","mfoot");
    var cp=el("button","ghost","📋 Copy"); foot.appendChild(cp);
    var cl=el("button","primary","Close"); cl.addEventListener("click",function(){ closeModal(md.back); }); foot.appendChild(cl);
    md.m.appendChild(foot);

    function draw(){
      var chosen=library.filter(function(r){ return picked[r.id]; });
      out.innerHTML="";
      if(!chosen.length){ out.appendChild(el("div","ocr-status","Tick at least one recipe.")); cp.disabled=true; return; }
      cp.disabled=false;
      var T=shoppingTotals(chosen), wunit=weightUnit(), ul=UNITS[wunit].label, cur=state.currency||"$", total=0, lines=[];
      function section(title,items){
        if(!items.length) return;
        out.appendChild(el("div","shop-h",title));
        lines.push(title.toUpperCase());
        items.forEach(function(x){
          var row=el("div","shop-row");
          var amt=fmt(fromG(x.g,wunit),UNITS[wunit].dp)+" "+ul;
          var price=state.prices[priceKeyOf(x)], cost=price>0 ? x.g/1000*price : 0; total+=cost;
          row.innerHTML="<span class='sr-name'>"+escapeHtml(x.name)+"</span><span class='sr-amt'>"+amt+
            (cost>0?" <span class='sr-cost'>"+cur+fmt(cost,2)+"</span>":"")+"</span>";
          out.appendChild(row);
          lines.push("  "+x.name+": "+amt+(cost>0?"  ("+cur+fmt(cost,2)+")":""));
        });
      }
      section("Oils & fats",T.oils);
      section("Additives",T.adds);
      section("Scents",T.scents);
      var lye=[];
      if(T.naoh>0) lye.push({name:"Sodium hydroxide (NaOH)",key:null,g:T.naoh});
      if(T.koh>0)  lye.push({name:"Potassium hydroxide (KOH)",key:null,g:T.koh});
      if(T.water>0) lye.push({name:"Distilled water",key:null,g:T.water});
      section("Lye & water",lye);
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
  function blankRecipe(name){ var r={id:uid(), name:name};
    RECIPE_FIELDS.forEach(function(fld){ r[fld.k]=defOf(fld); }); return r; }
  function cloneItem(it){ return {name:it.name,key:it.key,g:it.g}; }
  // recipes reaching here are already sanitized (from load) or freshly built, so fields are copied
  // as-is — arrays by reference, so state and the live library recipe stay the same objects.
  function stateFromRecipe(r,view){
    var st={};
    VIEW_FIELDS.forEach(function(fld){ st[fld.k]=fld.coerce(view[fld.k],view); });
    RECIPE_FIELDS.forEach(function(fld){ st[fld.k]=r[fld.k]; });
    return st;
  }
  function loadRecipeIntoState(r){ RECIPE_FIELDS.forEach(function(fld){ state[fld.k]=r[fld.k]; }); }
  function syncCurrent(){ var r=libById(currentId); if(!r) return;
    RECIPE_FIELDS.forEach(function(fld){ r[fld.k]=state[fld.k]; }); }

  function switchRecipe(id){ if(id===currentId){ rebuildRecipeSelect(); return; } syncCurrent();
    var r=libById(id); if(!r) return; currentId=id; loadRecipeIntoState(r); scaleDirty=false; save(); render(); }
  function newRecipe(){
    var name=(prompt("Name this recipe:","Recipe "+(library.length+1))||"").trim();
    if(name==="") return; syncCurrent();
    var r=blankRecipe(name); library.push(r); currentId=r.id; loadRecipeIntoState(r); scaleDirty=false; save(); render();
  }
  function duplicateRecipe(){ syncCurrent(); var c=libById(currentId); if(!c) return;
    var r={ id:uid(), name:c.name+" copy" };
    RECIPE_FIELDS.forEach(function(fld){
      r[fld.k] = fld.k==="checklist" ? {}                 // the copy starts with a fresh make-checklist
               : fld.list ? c[fld.k].map(cloneItem)        // deep-copy ingredient lists
               : c[fld.k];
    });
    library.push(r); currentId=r.id; loadRecipeIntoState(r); scaleDirty=false; save(); render(); }
  function renameRecipe(){ var c=libById(currentId); if(!c) return;
    var name=(prompt("Rename recipe:",c.name)||"").trim(); if(name==="") return; c.name=name; save(); rebuildRecipeSelect(); }
  function deleteRecipe(){ var c=libById(currentId); if(!c) return;
    if(library.length<=1){ if(!confirm("This is your only recipe — clear its ingredients?")) return;
      RECIPE_FIELDS.forEach(function(fld){ c[fld.k]=defOf(fld); });   // reset every field to its default, keep id & name
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
    var loaded=load(), shared=importSharedFromHash();
    if(loaded){ library=loaded.recipes; currentId=loaded.currentId; if(shared){ library.push(shared); currentId=shared.id; } }
    else if(shared){ library=[shared]; currentId=shared.id; }              // fresh recipient: just the shared recipe
    else { var r0=blankRecipe("My recipe"); library=[r0]; currentId=r0.id; }
    if(shared) sharedImportName=shared.name;
    var view=loaded?loaded.view:{unit:"g",tab:"base",scaleMode:"batch"};
    var r=libById(currentId)||library[0]; currentId=r.id;
    return stateFromRecipe(r,view);
  }
  function sanitizeRecipe(r){ if(!r||typeof r!=="object") return null;
    var out={ id:(typeof r.id==="string"&&r.id)?r.id:uid(),
              name:(typeof r.name==="string"&&r.name.trim())?r.name:"Untitled" };
    RECIPE_FIELDS.forEach(function(fld){ out[fld.k]= fld.list ? cleanList(r[fld.k],fld.list) : fld.coerce(r[fld.k]); });
    return out; }
  function save(){ syncCurrent();
    try{ var o={ currentId:currentId, recipes:library };
      VIEW_FIELDS.forEach(function(fld){ o[fld.k]=state[fld.k]; });
      localStorage.setItem(STORE_KEY,JSON.stringify(o)); }catch(e){} }
  function load(){
    try{
      var raw=localStorage.getItem(STORE_KEY);
      if(raw){ var o=JSON.parse(raw); if(!o||!Array.isArray(o.recipes)||o.recipes.length===0) throw 0;
        // bar weight used to be a single app-wide setting; seed it onto recipes that predate the move
        if(o.barWeight>0) o.recipes.forEach(function(r){ if(r&&!(r.barWeight>0)) r.barWeight=o.barWeight; });
        var recipes=o.recipes.map(sanitizeRecipe).filter(Boolean);
        if(recipes.length===0) throw 0;
        var view={}; VIEW_FIELDS.forEach(function(fld){ view[fld.k]=o[fld.k]; });
        return { recipes:recipes, currentId:o.currentId, view:view }; }
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
  if(sharedImportName){ save(); showToast('Added “'+sharedImportName+'” from a shared link',true); }

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
})();
