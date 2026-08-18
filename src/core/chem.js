/* The lye and quality maths — the part of this app where a mistake burns someone.

   Deliberately pure: no DOM, and no reads of application state. Every function works
   from the recipe object it is handed. The one thing it genuinely needs from outside —
   your supplier SAP overrides — is injected by main.js through useSapOverrides() rather
   than reached for, so this file can be read, reasoned about and tested on its own.
   Callers that want "the recipe currently open" pass it in; main.js keeps thin wrappers
   that do that, which is why no call site had to change.

   Reference SAP values vary by supplier. Always verify before a real batch.
   Lye is caustic — gloves and eye protection, every time. */
import { clamp, sumG } from "./units.js";
import { ADDITIVES } from "../data/ingredients.js";
import { OILS } from "../data/oils.js";
/* Injected by main.js; defaults to "no overrides" so the module stands alone. */
let sapOverrides = () => ({});
export function useSapOverrides(fn) { sapOverrides = fn; }

/* Fatty acids tracked, and why there are thirteen rather than the classic eight.
   The eight-slot model (la my pa st ri ol li ln) leaves real acids with nowhere to go,
   and an oil's unplaced share doesn't vanish — it dilutes every quality score, because
   the blend is normalised by weight. Fourteen of the original forty-two oils lost 4% or
   more that way; macadamia lost 28% and jojoba 87%.
     cy  caprylic C8     | coconut, palm kernel, babassu, MCT — cleansing, like lauric
     cp  capric C10      | same company
     po  palmitoleic C16:1 | macadamia, avocado, tallow, lard, emu, sea buckthorn
     ar  C20-C24 saturated (arachidic, behenic, lignoceric) — peanut, moringa; hardens
     ga  C20:1/C22:1 (gadoleic, erucic) — jojoba, meadowfoam, mustard; conditions
   Oils list only their non-zero acids, so blendFA reads them defensively. */
export const FA_KEYS = ["cy","cp","la","my","pa","st","ar","po","ri","ol","li","ln","ga"];
/* The bands moved with the formulas, because they had to. Counting caprylic and capric
   raises coconut's cleansing from 67 to 79 — a ×1.18 stretch on everything lauric — so
   holding the old 12–22 would have flagged four perfectly ordinary recipes (a palm-free
   bar, a tallow bar, a hand soap, a shampoo) as too cleansing. The bands are scaled by
   how far the model itself moved, not fitted to the examples; checked against all 17,
   84 of 85 in/out verdicts are unchanged. The one that moved — a palm-free laundry bar
   now reading harder than a body bar — matches the other laundry bar, which already did.
   Consequence worth knowing: these five numbers no longer match a calculator still using
   the eight-acid model. They're more accurate, not more comparable. */
export const QUALITIES = [
  { key:"hardness",     label:"Hardness",     scale:76, lo:31, hi:58, fn:function(f){return f.la+f.my+f.pa+f.st+f.cy+f.cp+f.ar;} },
  { key:"cleansing",    label:"Cleansing",    scale:48, lo:14, hi:26, fn:function(f){return f.la+f.my+f.cy+f.cp;} },
  { key:"conditioning", label:"Conditioning", scale:90, lo:44, hi:69, fn:function(f){return f.ol+f.li+f.ln+f.ri+f.po+f.ga;} },
  { key:"bubbly",       label:"Bubbly lather",scale:76, lo:17, hi:54, fn:function(f){return f.la+f.my+f.ri+f.cy+f.cp;} },
  { key:"creamy",       label:"Creamy lather",scale:70, lo:16, hi:48, fn:function(f){return f.pa+f.st+f.ri+f.ar;} }
];
/* The "100% coconut" trap isn't really about coconut — it's the short-chain lauric
   family that makes a bar harsh, and the app now carries six such oils. Derived from the
   fatty-acid data so a new one joins the warning by existing, rather than by someone
   remembering to add its key to a list; the hardcoded trio missed murumuru (85%), which
   is more lauric than coconut. The cutoff sits in a wide gap — sixth-highest is 71%,
   seventh is 3% — so nothing sits near the boundary. */
export const LAURIC_OILS = Object.keys(OILS).filter(function(k){
  var f=OILS[k].fa||{};
  return (f.la||0)+(f.my||0)+(f.cy||0)+(f.cp||0) >= 50;
});
export const IOD_RANGE=[41,70], INS_RANGE=[136,165], KOH_FACTOR=1.40274;

export function oilsGof(rv){ return sumG(rv.oils); }
export function blendFA(rv){
  var tot=0; rv.oils.forEach(function(it){ if(it.key&&OILS[it.key]) tot+=it.g; });
  var fa={}; FA_KEYS.forEach(function(k){ fa[k]=0; });
  var iod=0, ins=0;
  if(tot<=0) return {fa:fa,iod:0,ins:0,tot:0};
  // (d.fa[k]||0) so an oil can list only the acids it actually has — otherwise every
  // entry carries eight zeros and a missing key silently poisons the blend with NaN.
  rv.oils.forEach(function(it){ var d=it.key?OILS[it.key]:null; if(!d) return; var fr=it.g/tot;
    FA_KEYS.forEach(function(k){ fa[k]+=fr*(d.fa[k]||0); }); iod+=fr*d.iod; ins+=fr*d.ins; });
  return {fa:fa,iod:iod,ins:ins,tot:tot};
}
/* Reference SAP values vary by supplier, which the app has always warned about
   without letting you do anything. sapOf is the single place that decides which
   number an oil actually uses: your override, the oil's own (custom oils), or
   our reference. */
export function sapOf(it){
  if(it.key){ var ov=(sapOverrides()||{})[it.key];
    if(ov>0) return ov;
    return OILS[it.key] ? OILS[it.key].sap : 0; }
  return it.sap>0 ? it.sap : 0;                 // custom oil with a SAP off the bottle
}
export function overriddenKeys(rv){
  var ov=sapOverrides()||{}, out=[];
  (rv.oils||[]).forEach(function(it){ if(it.g>0 && it.key && ov[it.key]>0 && out.indexOf(it.key)<0) out.push(it.key); });
  return out;
}
/* Acids in the recipe neutralise lye, so the batch needs extra on top of what the
   oils want. Citric acid is the one that matters: 3 carboxyl groups against a molar
   mass of 192.12, so 0.6246 g NaOH per gram. Keyed additives only — a custom one has
   no data, and safetyChecks() warns when that looks like it's been missed. */
export function acidLyeOf(rv){
  var g=0, names=[];
  (rv.additives||[]).forEach(function(it){
    var d=it.key?ADDITIVES[it.key]:null;
    if(!d || !(d.lyeFactor>0) || !(it.g>0)) return;
    g+=it.g*d.lyeFactor;
    if(names.indexOf(d.name)<0) names.push(d.name);
  });
  return { g:g, names:names };
}
/* Milk, aloe and coffee stand in for water rather than joining it. The app said so for
   a long time without doing it, which left a milk soap either lighter than quoted or
   carrying nearly twice the liquid it reported — and the dilute-lye check, reading the
   water figure alone, couldn't see it either way. Sums the ones that genuinely replace
   water; the other liquids (honey, sodium lactate, glycerin, vitamin E) go in on top. */
export function waterReplacersOf(rv){
  var g=0, names=[];
  (rv.additives||[]).forEach(function(it){
    var d=it.key?ADDITIVES[it.key]:null;
    if(!d || !d.replacesWater || !(it.g>0)) return;
    g+=it.g;
    if(names.indexOf(d.name)<0) names.push(d.name);
  });
  return { g:g, names:names };
}
/* Salt dissolved into the water has a ceiling: about 35.9 g per 100 g of water at
   20°C (26.4% of the finished solution). Past that it simply won't go in, and lye
   sharing the water lowers it further. Salt neither saponifies nor consumes lye, so
   none of this touches computeLye — it's a question of whether the method is possible. */
export const SALT_MAX_PER100 = 35.9;              // g NaCl per 100 g water, 20°C
export function brineOf(rv){
  var salt=0;
  (rv.additives||[]).forEach(function(it){ if(it.key==="salt" && it.g>0) salt+=it.g; });
  if(!(salt>0)) return { salt:0, per100:0, pctSolution:0 };
  var water=computeLye(rv).waterG;
  var per100 = water>0 ? salt/water*100 : Infinity;
  return { salt:salt, water:water, per100:per100,
           pctSolution: water>0 ? salt/(salt+water)*100 : 100 };
}
export function computeLye(rv){
  // Hot process, superfat added after the cook: the oils that actually go in the pot
  // are fully saponified, and a reserve is stirred in afterwards. So the lye is sized
  // on the in-pot oils with no discount — which differs slightly from a flat discount
  // whenever the held-back oil's SAP isn't the blend average.
  var afterCook = rv.method==="hp" && rv.sfMode==="after" && rv.superfat>0;
  var reserveG=0, reserveName="", target=null;
  if(afterCook){
    reserveG = oilsGof(rv)*rv.superfat/100;
    rv.oils.forEach(function(it){ if(!target && it.key && it.key===rv.sfOil && it.g>0) target=it; });
    if(target){ reserveG=Math.min(reserveG,target.g); reserveName=target.name; }
  }
  var naohRaw=0, hasCustom=false, customSap=false;
  rv.oils.forEach(function(it){
    var d=it.key?OILS[it.key]:null;
    var g=it.g;
    if(afterCook) g = target ? (it===target ? it.g-reserveG : it.g)   // hold back the chosen oil
                            : it.g*(1-rv.superfat/100);              // or proportionally across all
    var sapV=sapOf(it);
    if(sapV>0) naohRaw+=g*sapV;
    else if(it.g>0) hasCustom=true;             // no data and no SAP given: genuinely excluded
    if(!d && sapV>0 && it.g>0) customSap=true;
  });
  var sf = afterCook ? 1 : 1-rv.superfat/100;
  // Superfat discounts the saponifying lye only. An acid consumes its full
  // stoichiometric amount whatever the superfat, so its term stays outside the
  // discount — and sitting before the KOH conversion makes that case fall out too
  // (0.6246 x KOH_FACTOR = 0.8762, i.e. 3 x 56.11 / 192.12).
  var acid=acidLyeOf(rv);
  var sapLye=naohRaw*sf+acid.g;                 // what's needed, in NaOH-equivalent grams
  // One expression covers all three modes. kohShare is the fraction of the
  // saponification done by KOH: 0 for a bar, 1 for liquid soap, anything between
  // for the dual-lye blends that shaving and cream soaps are built on.
  var kohShare = rv.lyeType==="koh" ? 1
               : rv.lyeType==="dual" ? clamp(rv.dualKoh,30,5,95)/100 : 0;
  var naohG=sapLye*(1-kohShare);
  var kohG =sapLye*kohShare*KOH_FACTOR/(rv.kohPurity/100);
  var lyeG=naohG+kohG;
  var kind = kohShare===0 ? "NaOH (lye)" : kohShare===1 ? "KOH (lye)" : "NaOH + KOH";
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
  // waterG is the total liquid the recipe wants; waterAddG is what you pour from the tap,
  // with milk/aloe/coffee already counted against it. Keeping both means the lye
  // concentration stays a figure about *total* liquid — so the dilute-lye check is right
  // by construction rather than needing a correction of its own.
  var repl=waterReplacersOf(rv);
  var waterAddG=Math.max(0,waterG-repl.g);
  var liquidG=Math.max(waterG,repl.g);        // over-budget replacers really are extra liquid
  // What the superfat actually comes to. Normally rv.superfat, but an after-the-cook
  // reserve is capped by how much of the chosen oil there is to hold back.
  var effectiveSf = afterCook && oilG>0 ? reserveG/oilG*100 : rv.superfat;
  return { lyeG:lyeG, waterG:waterG, waterAddG:waterAddG, liquidG:liquidG, oilG:oilG,
    kind:kind, hasCustom:hasCustom,
    customSap:customSap, overrides:overriddenKeys(rv),
    acidG:acid.g, acidNames:acid.names,
    replG:repl.g, replNames:repl.names, replOver:repl.g>waterG,
    naohG:naohG, kohG:kohG, kohShare:kohShare, effectiveSf:effectiveSf,
           reserveG:reserveG, reserveName:reserveName };
}
// Lye concentration is lye / (lye + all the liquid), and it was worked out in two places
// that both had to be remembered. It's the figure the "strong"/"very dilute" warnings key
// off, so it gets one home.
export function lyeConcOf(L){ var t=L.lyeG+L.liquidG; return t>0 ? L.lyeG/t*100 : 0; }
// single source of truth for the fatty-acid quality formulas: derived from QUALITIES,
// plus `poly` (rancidity-prone polyunsaturates) which several advisories use.
export function qualitiesOf(fa){ var o={}; for(var i=0;i<QUALITIES.length;i++) o[QUALITIES[i].key]=QUALITIES[i].fn(fa); o.poly=fa.li+fa.ln; return o; }
export function qFn(key){ for(var i=0;i<QUALITIES.length;i++) if(QUALITIES[i].key===key) return QUALITIES[i].fn; return null; }

export function currentBatchG(rv){
  var L=computeLye(rv);
  var add=sumG(rv.additives);
  var ar=sumG(rv.aromas);
  // waterAddG, not waterG: the replacers are already in `add`, and counting the water
  // they stand in for as well would weigh the batch twice for the same liquid.
  return L.oilG + L.lyeG + L.waterAddG + add + ar;
}
// Most of the water evaporates during cure; the rest of the batch stays put. ~70% is a
// reasonable middle estimate — the real figure depends on humidity, airflow and cure length.
export function curedBatchG(rv){
  var L=computeLye(rv);
  // what evaporates is the liquid actually in the pot, which is more than the water
  // setting whenever the replacers overrun it
  return Math.max(0, currentBatchG(rv) - L.liquidG*0.7);
}
