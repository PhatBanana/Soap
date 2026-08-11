/* Units and the small numeric helpers everything else leans on.
   Grams are canonical: every amount is stored in grams and converted only for display,
   so a unit switch can never change a recipe. */
/* ---------- units (canonical = grams) ---------- */
export const UNITS = {
  g:  { label:"g",  name:"grams",       toG:1,            dp:1 },
  oz: { label:"oz", name:"ounces",      toG:28.349523125, dp:2 },
  lb: { label:"lb", name:"pounds",      toG:453.59237,    dp:3 },
  kg: { label:"kg", name:"kilograms",   toG:1000,         dp:3 },
  pct:{ label:"%",  name:"percentages", toG:null,         dp:1 }
};
export const UORDER = ["g","oz","lb","kg","pct"];
// extra units accepted on import / OCR (approx, oil density ~0.92 g/ml)
export const CONV = { g:1, oz:28.349523125, lb:453.59237, kg:1000, ml:0.92, tsp:4.6, tbsp:13.8, cup:221, drop:0.05 };
export const IMPORT_UNITS = Object.keys(CONV);   // same units CONV can convert
export function fromG(g,u){ return g/UNITS[u].toG; }
export function fmt(n,dp){ if(!isFinite(n)) return "0"; var s=n.toFixed(dp); if(s.indexOf(".")>-1) s=s.replace(/\.?0+$/,""); return s; }
export function sumG(list){ return list.reduce(function(s,it){return s+it.g;},0); }
export function clamp(v,def,lo,hi){ v=parseFloat(v); if(!isFinite(v)) return def; return Math.max(lo,Math.min(hi,v)); }
