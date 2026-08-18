/* The three reference guides — troubleshooting, lye first aid and colorants — plus the
   rebatch helper they link to. All four are the same grouped, searchable list, so they
   share openGuideList rather than keeping copies that drift. */
import { closeModal, el, escapeHtml, makeModal, modalFoot, numInput } from "../core/dom.js";
import { curedBatchG, syncCurrent, weightUnit } from "../core/state.js";
import { UNITS, fmt, fromG } from "../core/units.js";
import { FIRST_AID, TROUBLESHOOTING } from "../data/guides.js";
import { COLORANTS } from "../data/ingredients.js";
export var GUIDES={
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

export function guideLinks(spec,back){
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

export function openRebatch(){
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
export function openGuideList(o,q0){
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
export function openTrouble(q0){
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
export function openFirstAid(q0){
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
export function openColors(q0){
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
