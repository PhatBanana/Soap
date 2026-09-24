/* Weigh it out: the recipe as a sequence of single weighings, one to a screen, in large
   type — for the moment when your hands are in gloves, the lye is out, and flipping between
   the Base tab and the Make tab is exactly how a number gets misread.

   The amounts come from the same computeLye() as the panel and the printed card, so this
   can't disagree with either. What it adds is order and containers:
     oils    one pot; the scale is zeroed once, so each step also says what it should
             read by then — the running total is what you actually see on the scale
     liquid  the lye-safe jug: water to pour, anything standing in for it, and whatever
             has to be dissolved in it BEFORE the lye (citric acid, brine salt)
     lye     its own dry cup, each lye zeroed separately
     held back  a hot-process reserve, weighed out so it can't end up in the pot
     additives  a cup each — they go in at different moments
     scents  one cup, blended, so a running total again

   A recipe the Safety Check fails doesn't get as far as the first step: this is the screen
   people follow without looking at anything else.

   Progress is kept in memory for the open recipe while its amounts stay the same, so a
   stray tap outside the sheet loses nothing — reopen it and you're on the same step.
   Change an amount and it starts again, because the steps it remembered are no longer
   the recipe. */
import { closeModal, el, escapeHtml, makeModal } from "../core/dom.js";
import { computeLye, currentId, state, weightUnit } from "../core/state.js";
import { UNITS, fmt, fromG } from "../core/units.js";
import { ADDITIVES, AROMAS } from "../data/ingredients.js";
import { OILS } from "../data/oils.js";
import { safetyChecks, setWeighing } from "../ui/render.js";

var progress = { sig:null, idx:0 };

export function weighSteps(){
  var L=computeLye(), groups=[];
  var brine = state.saltMode==="brine";
  function group(key,title,container,cumulative,note){
    var g={ key:key, title:title, container:container, cumulative:cumulative, note:note||"", items:[] };
    groups.push(g); return g;
  }
  function nm(it,db){ var d=it.key?db[it.key]:null; return d ? d.name : it.name; }

  var oils=group("oils","Oils","your soaping pot",true,
    "Zero the scale once with the empty pot, then weigh each oil straight in.");
  var target=null;
  if(L.reserveG>0 && L.reserveName) state.oils.forEach(function(it){
    if(!target && it.key===state.sfOil && it.g>0) target=it; });
  state.oils.forEach(function(it){
    if(!(it.g>0)) return;
    // a named hot-process reserve never goes in the pot, so it isn't weighed into it
    var g = it===target ? it.g-L.reserveG : it.g;
    if(g>0.005) oils.items.push({ name:nm(it,OILS), g:g });
  });

  if(L.reserveG>0){
    var held=group("held","Held back","a small separate cup",false,
      "This is the superfat for a hot-process bar. It stays out of the pot and goes in after the cook.");
    held.items.push(target
      ? { name:nm(target,OILS), g:L.reserveG, note:"Weighed on its own so none of it ends up in the pot." }
      : { name:"Melted oil blend", g:L.reserveG, note:"Once the oils are melted and stirred, pour this much of the blend into the cup." });
  }

  var liquid=group("liquid","Liquid","a lye-safe jug — stainless steel or sturdy #5 (PP) plastic, never aluminium",true,
    "Zero the scale once with the empty jug.");
  if(L.waterAddG>0.005) liquid.items.push({ name:"Water", g:L.waterAddG, note:"Distilled if you can — hard tap water can dull the lather." });
  state.additives.forEach(function(it){
    var d=it.key?ADDITIVES[it.key]:null;
    if(!(it.g>0) || !d || !d.replacesWater) return;
    liquid.items.push({ name:d.name, g:it.g, note: d.hot ? "Chill it to a slush before the lye goes in." : "" });
  });
  state.additives.forEach(function(it){
    var d=it.key?ADDITIVES[it.key]:null;
    if(!(it.g>0) || !d) return;
    if(d.lyeFactor>0) liquid.items.push({ name:d.name, g:it.g, note:"Dissolved in the liquid BEFORE the lye — the lye has already been raised to allow for it." });
    else if(it.key==="salt" && brine) liquid.items.push({ name:d.name, g:it.g, note:"Stirred into the liquid until dissolved, before the lye." });
  });

  var lye=group("lye","Lye","its own clean, DRY cup — lye-safe, never aluminium",false,
    "Gloves and eye protection on. Weigh the lye dry, and put the lid back on the tub between scoops.");
  var kohNote="Sized for "+state.kohPurity+"% pure KOH — check that's what your tub says.";
  if(L.naohG>0.005) lye.items.push({ name:"Sodium hydroxide (NaOH)", g:L.naohG, lye:true });
  if(L.kohG>0.005) lye.items.push({ name:"Potassium hydroxide (KOH)", g:L.kohG, lye:true, note:kohNote });
  if(lye.items.length>1) lye.note+=" Zero the scale for each lye — they're weighed separately.";

  var adds=group("adds","Additives","a small cup each",false,
    "These go in at different moments, so each gets its own cup.");
  state.additives.forEach(function(it){
    if(!(it.g>0)) return;
    var d=it.key?ADDITIVES[it.key]:null;
    if(d && (d.replacesWater || d.lyeFactor>0 || (it.key==="salt" && brine))) return;   // already in the jug
    adds.items.push({ name:nm(it,ADDITIVES), g:it.g });
  });

  var scents=group("scents","Scents","one small glass cup",true,
    "Zero the scale once with the empty cup and weigh the scents in together.");
  state.aromas.forEach(function(it){ if(it.g>0) scents.items.push({ name:nm(it,AROMAS), g:it.g }); });

  // flatten, dropping empty groups, and give each step what it needs to show on its own
  var steps=[];
  groups.forEach(function(g){
    if(!g.items.length) return;
    var run=0;
    g.items.forEach(function(it,i){
      run+=it.g;
      steps.push({ group:g.key, title:g.title, container:g.container, groupNote:g.note,
        first:i===0, cumulative:g.cumulative && g.items.length>1, reading:run,
        name:it.name, g:it.g, note:it.note||"", lye:!!it.lye });
    });
  });
  return steps;
}

// lye to two decimals whatever the unit — it's the weighing that matters most
function amt(g,lye){
  var wu=weightUnit(), dp=Math.max(UNITS[wu].dp, lye?2:0);
  return fmt(fromG(g,wu),dp)+" "+UNITS[wu].label;
}
function signature(steps){
  return currentId+"|"+weightUnit()+"|"+steps.map(function(s){ return s.group+":"+s.name+":"+s.g.toFixed(3); }).join(",");
}

export function openWeigh(){
  var md=makeModal(); md.m.classList.add("weigh-modal");
  setWeighing(true);
  function close(){ closeModal(md.back); setWeighing(false); }
  // a tap outside the sheet closes it (makeModal's own listener); the lock must follow
  md.back.addEventListener("click",function(e){ if(e.target===md.back) setWeighing(false); });

  // nothing to weigh comes first: with no oils the Safety Check fails too, but "not
  // safe" is the wrong thing to tell someone who simply hasn't started
  var steps=weighSteps(), empty=!state.oils.some(function(it){ return it.g>0; });
  var fails=empty ? [] : safetyChecks().items.filter(function(i){ return i.level==="fail"; });
  if(empty || fails.length){
    md.m.appendChild(el("h3",null,"Weigh it out"));
    md.m.appendChild(fails.length
      ? el("div","wg-stop","⛔ Not safe to make as-is: "+escapeHtml(fails.map(function(f){ return f.title; }).join("; "))+
          ". Fix this in the Safety Check before weighing anything.")
      : el("p","sub","Add some oils first — there's nothing to weigh yet."));
    var f0=el("div","mfoot"), c0=el("button","primary","Close"); c0.type="button";
    c0.addEventListener("click",close); f0.appendChild(c0); md.m.appendChild(f0);
    return;
  }
  var sig=signature(steps);
  if(progress.sig!==sig) progress={ sig:sig, idx:0 };

  var body=el("div","wg-body"); md.m.appendChild(body);
  function draw(){
    body.innerHTML="";
    var i=progress.idx;
    if(i>=steps.length){
      body.appendChild(el("h3",null,"Everything's weighed"));
      body.appendChild(el("p","sub","All "+steps.length+" amounts are out. Back to the step-by-step for mixing — and lye TO the liquid, never the reverse."));
      var ff=el("div","mfoot");
      var again=el("button","ghost","Start again"); again.type="button";
      again.addEventListener("click",function(){ progress.idx=0; draw(); });
      var done=el("button","primary","Done"); done.type="button"; done.addEventListener("click",close);
      ff.appendChild(again); ff.appendChild(done); body.appendChild(ff);
      return;
    }
    var s=steps[i];
    var head=el("div","wg-head");
    head.appendChild(el("span","wg-group",escapeHtml(s.title)));
    head.appendChild(el("span","wg-count","Step "+(i+1)+" of "+steps.length));
    body.appendChild(head);
    var bar=el("div","wg-bar"), fill=el("div","wg-fill"); fill.style.width=(i/steps.length*100)+"%";
    bar.appendChild(fill); body.appendChild(bar);
    if(s.first) body.appendChild(el("div","wg-container","<b>New container:</b> "+escapeHtml(s.container)+". "+escapeHtml(s.groupNote)));
    body.appendChild(el("div","wg-name"+(s.lye?" wg-lye":""),escapeHtml(s.name)));
    body.appendChild(el("div","wg-amt"+(s.lye?" wg-lye":""),escapeHtml(amt(s.g,s.lye))));
    if(s.cumulative && !s.first)
      body.appendChild(el("div","wg-reading","If you didn't re-zero, the scale should now read <b>"+escapeHtml(amt(s.reading,false))+"</b>"));
    if(s.note) body.appendChild(el("div","wg-note",escapeHtml(s.note)));
    var foot=el("div","mfoot wg-foot");
    var back=el("button","ghost",i>0?"← Back":"Close"); back.type="button";
    back.addEventListener("click",function(){ if(i>0){ progress.idx--; draw(); } else close(); });
    var ok=el("button","primary","✓ Weighed"); ok.type="button";
    ok.addEventListener("click",function(){ progress.idx++; draw(); });
    foot.appendChild(back); foot.appendChild(ok); body.appendChild(foot);
  }
  draw();
}
