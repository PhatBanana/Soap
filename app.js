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

  var library=[];      // [{ id, name, oils, additives, aromas, lyeType, superfat, waterPct, kohPurity }]
  var currentId=null;
  var state = initState();

  /* ---------- small helpers ---------- */
  var $ = function(id){ return document.getElementById(id); };
  function el(tag, cls, html){ var e=document.createElement(tag); if(cls)e.className=cls; if(html!=null)e.innerHTML=html; return e; }
  function fromG(g,u){ return g/UNITS[u].toG; }
  function fmt(n,dp){ if(!isFinite(n)) return "0"; var s=n.toFixed(dp); if(s.indexOf(".")>-1) s=s.replace(/\.?0+$/,""); return s; }
  function weightUnit(){ return state.unit==="pct" ? "g" : state.unit; }
  function totalOilsG(){ return state.oils.reduce(function(s,it){return s+it.g;},0); }
  function oilInfo(it){ return it.key ? OILS[it.key] : null; }

  /* ---------- build static controls ---------- */
  var unitsEl=$("units"), oilList=$("oilList"), addList=$("addList"), aromaList=$("aromaList");
  var oilRefs=[], addRefs=[], aromaRefs=[];
  var activeInput=null;
  var scaleDirty=false; // true once the user edits the scale field (stops auto-prefill)
  var BAR_G=110;        // assumed weight of one bar for the yield estimate

  UORDER.forEach(function(u){
    var b=el("button",null,UNITS[u].label); b.type="button"; b.dataset.unit=u;
    b.addEventListener("click",function(){ state.unit=u; scaleDirty=false; save(); render(); });
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

  // recipe library controls
  rebuildRecipeSelect();
  $("recipeSelect").addEventListener("change",function(){ switchRecipe($("recipeSelect").value); });
  $("recipeNew").addEventListener("click",newRecipe);
  $("recipeMore").addEventListener("click",function(e){ e.stopPropagation(); $("recipeMenu").classList.toggle("hide"); });
  document.addEventListener("click",function(){ $("recipeMenu").classList.add("hide"); });
  Array.prototype.forEach.call($("recipeMenu").children,function(b){
    if(b.tagName!=="BUTTON") return;
    b.addEventListener("click",function(){ $("recipeMenu").classList.add("hide"); var a=b.dataset.a;
      if(a==="dup") duplicateRecipe(); else if(a==="rename") renameRecipe(); else if(a==="delete") deleteRecipe();
      else if(a==="compare") openCompare(); else if(a==="card") openCard();
    });
  });

  /* ================= RENDER ================= */
  function render(){
    rebuildRecipeSelect();
    Array.prototype.forEach.call(unitsEl.children,function(b){ b.classList.toggle("active",b.dataset.unit===state.unit); });
    Array.prototype.forEach.call($("tabs").children,function(b){ b.classList.toggle("active",b.dataset.tab===state.tab); });
    $("tab-base").hidden = state.tab!=="base";
    $("tab-scents").hidden = state.tab!=="scents";

    if(state.tab==="base") renderBase();
    else renderScents();
  }

  function renderBase(){
    var isPct=state.unit==="pct";
    // oils
    oilList.innerHTML=""; oilRefs=[];
    if(state.oils.length===0){ oilList.appendChild(el("div","empty","No oils yet — add one below, or tap Sample 👇")); }
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
    var amt=el("div","amt"); var amtVal=el("span"), amtU=el("span","u"); amt.appendChild(amtVal); amt.appendChild(amtU);
    var del=el("button","del","&times;"); del.type="button"; del.setAttribute("aria-label","Remove "+it.name);
    del.addEventListener("click",function(){ state.oils.splice(i,1); save(); render(); });
    top.appendChild(amt); top.appendChild(del); row.appendChild(top);
    if(d && d.note) row.appendChild(el("div","note",d.note));
    if(!d) row.appendChild(el("div","warn","No SAP/profile data — excluded from lye & quality math."));

    var sl=el("div","slider-line");
    var range=document.createElement("input"); range.type="range"; range.min="0"; range.max="100"; range.step="0.5";
    range.setAttribute("aria-label",it.name+" percent of oils");
    var pctLbl=el("span","pctlbl");
    range.addEventListener("input",function(){ setOilPercent(i,parseFloat(range.value)); refreshDerived(range); save(); });
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
    aromaRefs[i]={input:inp,pctLbl:pctLbl,sugg:suggEl,d:d};
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
      if(isPct){ r.amtVal.textContent=fmt(pct,1); r.amtU.textContent="%"; }
      else { r.amtVal.textContent=fmt(fromG(it.g,state.unit),UNITS[state.unit].dp); r.amtU.textContent=UNITS[state.unit].label; }
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
      if(state.oils.length>0){ updateLyePanel(); updateQuality(); updateNotes(); }
      else $("notesCard").hidden=true;
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
    if(isPct) info+=" · shown in grams";
    if(L.hasCustom) info+=" · custom oils excluded";
    var liquidAdd=state.additives.some(function(it){ return it.key&&ADDITIVES[it.key].kind==="liquid"&&it.g>0; });
    if(liquidAdd) info+=" · liquid additives replace part of the water";
    $("lyeInfo").textContent=info;
  }

  function updateQuality(){
    var B=blendFA(), barsEl=$("bars"); barsEl.innerHTML="";
    QUALITIES.forEach(function(q){
      var v=q.fn(B.fa), inR=v>=q.lo&&v<=q.hi;
      var wrap=el("div","qbar");
      wrap.appendChild(el("div","qtop","<span>"+q.label+"</span><b class='"+(inR?"":"off")+"'>"+Math.round(v)+"</b>"));
      var track=el("div","track");
      var band=el("div","band"); band.style.left=(q.lo/q.scale*100)+"%"; band.style.width=((q.hi-q.lo)/q.scale*100)+"%";
      var fill=el("div","fill"+(inR?"":" off")); fill.style.width=Math.min(100,v/q.scale*100)+"%";
      track.appendChild(band); track.appendChild(fill); wrap.appendChild(track); barsEl.appendChild(wrap);
    });
    var chipsEl=$("chips"); chipsEl.innerHTML="";
    chipsEl.appendChild(makeChip("Iodine",B.iod,IOD_RANGE));
    chipsEl.appendChild(makeChip("INS",B.ins,INS_RANGE));
    $("qualNote").textContent = B.tot>0 ? "Green band = typical range for a balanced bar. Amber numbers sit outside it." : "Add oils with profile data to see qualities.";
  }
  function makeChip(label,val,range){
    var inR=val>=range[0]&&val<=range[1];
    var c=el("span","chip"+(inR?"":" off"),label+" <b>"+Math.round(val)+"</b> <span style='opacity:.7'>("+range[0]+"–"+range[1]+")</span>");
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
    if(B.tot>0){
      var hard=f.pa+f.st+f.la+f.my, clean=f.la+f.my, cond=f.ol+f.li+f.ln+f.ri, bub=f.la+f.my+f.ri, poly=f.li+f.ln;
      if(hard<29) out.push(["soft","Bar may come out soft","Hardness is "+Math.round(hard)+" (aim 29–54). Add a hard oil (coconut, palm, or a butter) or a little sodium lactate for a firmer bar that unmolds cleanly."]);
      else if(hard>54) out.push(["warn","Very hard blend","Hardness is "+Math.round(hard)+" — bars this hard can turn brittle and crack. Ease back on hard oils/butters."]);
      if(clean>22) out.push(["warn","May feel drying","Cleansing is "+Math.round(clean)+" (aim 12–22). Raise your superfat or cut coconut / palm-kernel oil."]);
      if(cond<44) out.push(["soft","Low conditioning","Conditioning is "+Math.round(cond)+" (aim 44–69). Add soft oils like olive, sweet almond, or avocado."]);
      if(bub<14 && pctOf("castor")<3) out.push(["soft","Light on lather","Bubbly lather is "+Math.round(bub)+". A bit more coconut/palm-kernel, or ~5% castor, boosts the bubbles."]);
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
    scaleAll(targetG/cur);
  }
  function applyMold(){
    var target=moldOilsG(); if(target<=0) return;
    var cur=totalOilsG(); if(cur<=0) return;
    scaleAll(target/cur);
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
    var bars=batchG>0?Math.max(1,Math.round(batchG/BAR_G)):0;
    $("yieldBars").textContent="≈ "+bars+" bar"+(bars===1?"":"s")+" (~"+BAR_G+" g each) · "+fmt(fromG(oilsG,wunit),1)+" "+ul+" of oils"+(state.unit==="pct"?" · shown in grams":"");

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
      } else r.sugg.textContent="";
    });
    if(state.aromas.length>0){
      $("scentTotal").textContent=fmt(fromG(scentG,wunit),1); $("scentUnit").textContent=UNITS[wunit].label;
      var pct=totalOil>0?scentG/totalOil*100:0;
      $("scentPct").textContent = totalOil>0 ? fmt(pct,2) : "—";
      var advice;
      if(totalOil<=0) advice="Add oils in the Soap base tab to size your scent load.";
      else if(pct>6) advice="⚠️ That's a heavy scent load — most CP soap uses ~3% (max ~5–6%). Check IFRA limits.";
      else if(pct>5) advice="On the strong side — many aim for ~3%. Fine for robust FOs within IFRA limits.";
      else if(pct<1.5) advice="Light scent — bump toward ~3% if you want it to last through cure.";
      else advice="Nicely in the ~3% sweet spot for cold-process soap.";
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
    save(); render();
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
    save(); render();
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

  /* ---------- bottom bar actions ---------- */
  $("clearBtn").addEventListener("click",function(){
    if((state.oils.length||state.additives.length||state.aromas.length) && !confirm("Clear the whole recipe?")) return;
    state.oils=[]; state.additives=[]; state.aromas=[]; save(); render();
  });
  $("sampleBtn").addEventListener("click",function(){
    state.oils=[
      {name:OILS.olive.name,key:"olive",g:500},
      {name:OILS.coconut.name,key:"coconut",g:8*UNITS.oz.toG},
      {name:OILS.shea.name,key:"shea",g:0.25*UNITS.lb.toG},
      {name:OILS.castor.name,key:"castor",g:40}
    ];
    state.additives=[{name:ADDITIVES.goatmilk.name,key:"goatmilk",g:0}];
    state.aromas=[{name:AROMAS.lavender.name,key:"lavender",g:22},{name:AROMAS.litsea.name,key:"litsea",g:8}];
    state.superfat=5; state.waterPct=38; state.lyeType="naoh";
    save(); render();
  });

  /* ---------- CSV ---------- */
  $("exportBtn").addEventListener("click",exportCSV);
  $("importBtn").addEventListener("click",function(){ $("csvInput").click(); });
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
  $("scanBtn").addEventListener("click",function(){ $("photoInput").click(); });
  $("photoInput").addEventListener("change",function(e){
    var f=e.target.files&&e.target.files[0]; if(!f) return;
    var url=URL.createObjectURL(f);
    // open modal in loading state
    var back=el("div","modal-back"); var m=el("div","modal");
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

  /* ---------- PWA ---------- */
  if("serviceWorker" in navigator){ window.addEventListener("load",function(){ navigator.serviceWorker.register("sw.js").catch(function(){}); }); }
  var deferredPrompt=null;
  var standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  window.addEventListener("beforeinstallprompt",function(e){ e.preventDefault(); deferredPrompt=e; if(!standalone) $("installBtn").classList.remove("hide"); });
  window.addEventListener("appinstalled",function(){ $("installBtn").classList.add("hide"); });
  $("installBtn").addEventListener("click",function(){
    if(deferredPrompt){ deferredPrompt.prompt(); deferredPrompt.userChoice.finally(function(){ deferredPrompt=null; $("installBtn").classList.add("hide"); }); }
    else { alert("To install on iPhone/iPad: tap the Share button, then \"Add to Home Screen\"."); }
  });
  // Show an install hint button on iOS Safari (no beforeinstallprompt there)
  var isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  if(isIOS && !standalone) $("installBtn").classList.remove("hide");

  /* ---------- modal helpers ---------- */
  function makeModal(){
    var back=el("div","modal-back"), m=el("div","modal"); back.appendChild(m);
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
    h+="<div class='pc-yield'>Makes ≈ "+fmt(fromG(s.batchG,wunit),1)+" "+ul+"  ·  ~"+Math.max(1,Math.round(s.batchG/BAR_G))+" bars</div>";
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
    var L=[]; L.push(r.name); L.push("Makes ~"+fmt(fromG(s.batchG,wunit),1)+" "+ul+" (~"+Math.max(1,Math.round(s.batchG/BAR_G))+" bars)"); L.push("");
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

  /* ---------- recipe library ---------- */
  function uid(){ return "r"+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
  function libById(id){ for(var i=0;i<library.length;i++) if(library[i].id===id) return library[i]; return null; }
  function blankRecipe(name){ return { id:uid(), name:name, oils:[], additives:[], aromas:[],
    lyeType:"naoh", superfat:5, waterPct:38, kohPurity:90 }; }
  function cloneItem(it){ return {name:it.name,key:it.key,g:it.g}; }
  function stateFromRecipe(r,view){
    return { unit:UNITS[view.unit]?view.unit:"g", tab:(view.tab==="scents"?"scents":"base"),
      scaleMode:(["batch","oils","mold"].indexOf(view.scaleMode)>=0?view.scaleMode:"batch"),
      oils:r.oils, additives:r.additives, aromas:r.aromas,
      lyeType:r.lyeType, superfat:r.superfat, waterPct:r.waterPct, kohPurity:r.kohPurity };
  }
  function loadRecipeIntoState(r){
    state.oils=r.oils; state.additives=r.additives; state.aromas=r.aromas;
    state.lyeType=r.lyeType; state.superfat=r.superfat; state.waterPct=r.waterPct; state.kohPurity=r.kohPurity;
  }
  function syncCurrent(){ var r=libById(currentId); if(!r) return;
    r.oils=state.oils; r.additives=state.additives; r.aromas=state.aromas;
    r.lyeType=state.lyeType; r.superfat=state.superfat; r.waterPct=state.waterPct; r.kohPurity=state.kohPurity; }

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
      waterPct:clamp(r.waterPct,38,25,50), kohPurity:clamp(r.kohPurity,90,85,100) }; }
  function save(){ syncCurrent();
    try{ localStorage.setItem(STORE_KEY,JSON.stringify({
      unit:state.unit, tab:state.tab, scaleMode:state.scaleMode, currentId:currentId, recipes:library
    })); }catch(e){} }
  function load(){
    try{
      var raw=localStorage.getItem(STORE_KEY);
      if(raw){ var o=JSON.parse(raw); if(!o||!Array.isArray(o.recipes)||o.recipes.length===0) throw 0;
        var recipes=o.recipes.map(sanitizeRecipe).filter(Boolean);
        if(recipes.length===0) throw 0;
        return { recipes:recipes, currentId:o.currentId, view:{unit:o.unit,tab:o.tab,scaleMode:o.scaleMode} }; }
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
