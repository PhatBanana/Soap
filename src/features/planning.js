/* Planning a make rather than doing one: the saved-recipe library, the price book, the
   cupboard, your supplier's SAP figures, and the shopping list across several recipes. */
import { KOH_FACTOR } from "../core/chem.js";
import { closeModal, el, escapeHtml, makeModal, modalFoot, numInput, setActive } from "../core/dom.js";
import { computeLye, currentId, libById, library, save, saveSoon, sortedLibrary, state, statsFor, syncCurrent, weightUnit } from "../core/state.js";
import { UNITS, fmt, fromG } from "../core/units.js";
import { OILS } from "../data/oils.js";
import { copyText, recipeBlurb } from "./output.js";
import { switchRecipe } from "./recipes.js";
import { barCount, rebuildRecipeSelect, refreshDerived, render } from "../ui/render.js";
export var LYE_NAOH={name:"Sodium hydroxide (NaOH)",key:null},
    LYE_KOH ={name:"Potassium hydroxide (KOH)",key:null},
    WATER_ROW={name:"Distilled water",key:null};

export function priceKeyOf(it){ return it.key || ("c:"+it.name.toLowerCase()); }

/* ---------- recipe library: search, sort, favourites ---------- */
export function openLibrary(){
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
export function stockShortfall(r){
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
export function lyeRows(T,skipWater){
  var rows=[];
  if(T.naoh>0) rows.push({name:LYE_NAOH.name,key:null,g:T.naoh});
  if(T.koh>0)  rows.push({name:LYE_KOH.name, key:null,g:T.koh});
  if(!skipWater && T.water>0) rows.push({name:WATER_ROW.name,key:null,g:T.water});
  return rows;
}
// Every ingredient across the whole library (a cupboard spans recipes), plus
// anything already holding stock, de-duplicated by the price-book key.
export function stockCandidates(){
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
export function sapToKOH(naohPerG){ return naohPerG*KOH_FACTOR*1000; }
export function sapFromKOH(mgKOH){ return mgKOH/1000/KOH_FACTOR; }

export function openSAP(){
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
        var naoh = isFinite(v)&&v>0 ? (asKOH?sapFromKOH(v):v) : 0;
        /* The schema silently drops anything outside (0,1) g NaOH/g on reload, so a
           value past that must be refused here too — otherwise the lye is sized on it
           until the next restart and then quietly changes. Typical slip: a decimal
           (1.78 for 0.178) or units (an mg KOH figure typed into NaOH mode). */
        var bad = inp.value.trim()!=="" && !(naoh>0 && naoh<1);
        inp.classList.toggle("sap-bad", bad);
        setVal(!bad ? naoh : 0);
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

export function openStock(){
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
export function shoppingTotals(recipes){
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
export function openShopping(){
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
export function openCosts(){
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
