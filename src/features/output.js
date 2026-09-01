/* Everything that turns the recipe into something you hand to someone else: the recipe
   card, the INCI label, the bar wrapper, the share link and the two-recipe comparison. */
import { QUALITIES } from "../core/chem.js";
import { closeModal, el, escapeHtml, makeModal, modalFoot } from "../core/dom.js";
import { RECIPE_FIELDS, USES } from "../core/schema.js";
import { computeLye, curedBatchG, currentBatchG, currentId, libById, library, state, statsFor, syncCurrent, totalOilsG, usedOverrides, weightUnit } from "../core/state.js";
import { UNITS, fmt, fromG } from "../core/units.js";
import { b64urlEnc } from "../core/util.js";
import { ADDITIVE_INCI, AROMAS } from "../data/ingredients.js";
import { OIL_INCI } from "../data/oils.js";
import { encodeQR, qrSVG } from "../core/qr.js";
import { barCount, barG } from "../ui/render.js";
/* What a share link leaves out: your record of making it, not the soap itself.
   Derived from the schema's `personal` flags — the batch snapshot uses the same flags,
   so the two ideas of "the formula" cannot drift apart. */
export var SHARE_SKIP={};
RECIPE_FIELDS.forEach(function(fld){ if(fld.personal) SHARE_SKIP[fld.k]=1; });

export function openCompare(){
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
export function renderCompare(out, A, B){
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
export function openCard(){
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
export function inciLabel(){
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
export function openLabel(){
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
export function wrapperDates(){
  if(!state.madeOn) return null;
  var base=new Date(state.madeOn+"T00:00:00"); if(isNaN(base.getTime())) return null;
  var ready=new Date(base.getTime()); ready.setDate(ready.getDate()+(state.cureWeeks||4)*7);
  var o={year:"numeric",month:"short",day:"numeric"};
  return { made:base.toLocaleDateString(undefined,o), ready:ready.toLocaleDateString(undefined,o) };
}
export function openWrapper(){
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
  var qrNote=addWrapperQR(card, r);
  if(qrNote) md.m.appendChild(el("div","inci-warn no-print",escapeHtml(qrNote)));
  if(lab.missing.length) md.m.appendChild(el("div","inci-warn no-print","⚠ No stored INCI name for: "+escapeHtml(lab.missing.join(", "))+" — fill these in before printing for sale."));
  md.m.appendChild(el("p","sub no-print","Net weight is an estimate of the cured bar — weigh a real one before printing a label for sale. Add your name/contact and check your local labelling rules."));
  var foot=el("div","mfoot no-print");
  var pr=el("button","ghost","🖨 Print"); pr.addEventListener("click",function(){ window.print(); });
  var cp=el("button","ghost","📋 Copy"); cp.addEventListener("click",function(){ copyText(wrapperText(r,lab,netOz,netG,d),cp); });
  var cl=el("button","primary","Close"); cl.addEventListener("click",function(){ closeModal(md.back); });
  foot.appendChild(pr); foot.appendChild(cp); foot.appendChild(cl); md.m.appendChild(foot);
}
/* The share link already carries the whole recipe inside a URL, and the wrapper is
   already printable — so the bar can carry its own recipe to whoever you give it to.

   Whether it scans is decided by the printed size of one module. Phone cameras want
   roughly 0.4 mm at close range, so the code is sized from its module count rather than
   fixed: a three-oil recipe lands around v16 and prints happily at 36 mm, while an
   eight-oil one with additives and scents reaches v25 and needs the full 52 mm. Past
   that the modules fall under 0.38 mm and no phone will read it off paper, so nothing is
   printed at all — an unscannable code on a gift is worse than an honest blank, and the
   share link still works. Error correction is L deliberately: fewer modules for the same
   recipe, and freshly printed paper needs no damage tolerance. */
var QR_MIN_MODULE_MM = 0.38, QR_MAX_MM = 52, QR_TARGET_MM_PER_MODULE = 0.45;
export function addWrapperQR(card, r){
  var url=recipeShareURL(r), qr=null;
  try{ qr=encodeQR(url,"L"); }catch(e){ qr=null; }
  if(!qr) return "This recipe is too long to fit a QR code — share it by link instead.";
  var mm=Math.min(QR_MAX_MM, Math.max(30, qr.size*QR_TARGET_MM_PER_MODULE));
  if(mm/qr.size < QR_MIN_MODULE_MM)
    return "This recipe needs so many oils that its QR code would be too fine to scan off paper — the ☰ Share link still carries it.";
  var box=el("div","wrap-qr");
  box.innerHTML=qrSVG(qr,160)+"<span class='wrap-qr-cap'>Scan for the recipe</span>";
  box.style.setProperty("--qr-mm", mm+"mm");
  card.appendChild(box);
  return null;
}
export function wrapperText(r,lab,netOz,netG,d){
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
export function shareItems(list){ return list.map(function(it){
  var o={name:it.name,key:it.key,g:Math.round(it.g*100)/100};
  if(!it.key && it.sap>0 && it.sap<1) o.sap=it.sap;
  return o; }); }
/* A share link carries the recipe, so it's built by *excluding* what shouldn't
   travel rather than listing what should. An allow-list quietly dropped dualKoh
   and then saltMode — and a missing field doesn't look broken, it just hands the
   other person a different soap. Anything private or personal to your own making
   is named here, and the suite asserts the list. */
export function recipeShareURL(r){
  var payload={ name:r.name };
  RECIPE_FIELDS.forEach(function(fld){
    if(SHARE_SKIP[fld.k]) return;
    payload[fld.k] = fld.list ? shareItems(r[fld.k]) : r[fld.k];
  });
  var ov=usedOverrides(r); if(ov) payload.sapOv=ov;
  return location.origin+location.pathname+"#r="+b64urlEnc(JSON.stringify(payload));
}
export function openShare(){
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
export function nz(list){ return list.filter(function(it){ return it.g>0; }); }
export function cardHTML(r,s,wunit,ul){
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
export function cardText(r,s,wunit,ul){
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
export function copyText(text,btn){
  var done=function(){ var old=btn.textContent; btn.textContent="Copied!"; setTimeout(function(){ btn.textContent=old; },1400); };
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(done,function(){ fallback(); }); }
  else fallback();
  function fallback(){ try{ var ta=document.createElement("textarea"); ta.value=text; ta.style.position="fixed"; ta.style.opacity="0";
    document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); done(); }catch(e){ alert("Couldn't copy automatically."); } }
}

/* ---------- costs (price book + cost per bar) ---------- */
export function recipeBlurb(r){
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
