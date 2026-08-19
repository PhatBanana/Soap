/* One schema per persisted thing. Adding a field is a row here and nothing else — the
   save, load, copy and share paths all read this table, which is what keeps them in
   lockstep. Every hand-kept parallel list this app has ever grown was a bug. */
import { uid } from "./dom.js";
import { UNITS, clamp } from "./units.js";
import { ADDITIVES, AROMAS } from "../data/ingredients.js";
import { OILS } from "../data/oils.js";
export const STORE_KEY = "soapcalc.v4";
export const APP_VERSION = "v59", BUILD_DATE = "2026-08-18";   // bump both (and sw.js CACHE) each release
export const USES=[["body","Body / bath"],["face","Facial"],["hair","Shampoo"],["shave","Shaving"],["dish","Dish soap"],["laundry","Laundry"]];
function validUse(u){ for(var i=0;i<USES.length;i++) if(USES[i][0]===u) return true; return false; }


/* One schema per persisted thing, so every save/load/copy function stays in lockstep and
   validation lives in exactly one place. Adding a field = one row here, nothing else.
     def    — default (a function for fresh arrays/objects); also what coerce() returns for bad input
     coerce — validate a raw value to a safe one (scalar fields)
     list   — this is an ingredient list; validated/copied via cleanList / cloneItem instead      */
export function defOf(fld){ return typeof fld.def==="function" ? fld.def() : fld.def; }
export const RECIPE_FIELDS=[
  {k:"oils",      list:OILS,      def:function(){return [];}},
  {k:"additives", list:ADDITIVES, def:function(){return [];}},
  {k:"aromas",    list:AROMAS,    def:function(){return [];}},
  {k:"lyeType",   def:"naoh", coerce:function(v){return (v==="koh"||v==="dual")?v:"naoh";}},
  // % of the saponification handled by KOH; only read when lyeType is "dual"
  {k:"dualKoh",   def:30,     coerce:function(v){return clamp(v,30,5,95);}},
  // salt stirred in dry at trace (a salt/spa bar) vs dissolved in the water
  // beforehand (brine soap / soleseife) — a different soap, same ingredients
  {k:"saltMode",  def:"trace",coerce:function(v){return v==="brine"?"brine":"trace";}},
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
  {k:"method",    def:"cp",   coerce:function(v){return (v==="hp"||v==="cpop")?v:"cp";}},  // cold, hot, or oven-gelled cold
  // hot process only: superfat as a lye discount (which fats stay free is luck), or
  // a chosen oil held back and stirred in after the cook (you pick what superfats it)
  {k:"sfMode",    def:"discount", coerce:function(v){return v==="after"?"after":"discount";}},
  {k:"sfOil",     def:"",     coerce:function(v){return (typeof v==="string"&&OILS[v])?v:"";}},
  {k:"dilution",  def:1,      coerce:function(v){return clamp(v,1,0.25,4);}},           // KOH paste : water, by weight
  {k:"waterRatio",def:2,      coerce:function(v){return clamp(v,2,1,4);}},              // water : lye, by weight
  {k:"lot",       def:"",     coerce:function(v){return typeof v==="string"?v.slice(0,32):"";}},
  // bar size belongs to the recipe's mould, not to the app — it drives bar count,
  // cost per bar, the wrapper's net weight and the "Bars" scale target
  {k:"barWeight", def:110,    coerce:function(v){return clamp(v,110,10,2000);}},
  {k:"fav",       def:false,  coerce:function(v){return !!v;}},
  {k:"lastUsed",  def:0,      coerce:function(v){return (typeof v==="number"&&isFinite(v)&&v>0)?v:0;}},
  // every time you actually make this recipe, archived so a second make doesn't
  // overwrite the record of the first
  {k:"batches",   def:function(){return [];}, coerce:function(v){
    if(!Array.isArray(v)) return [];
    return v.filter(function(b){ return b&&typeof b==="object"; }).slice(-50).map(function(b){
      return { id:(typeof b.id==="string"&&b.id)?b.id:uid(),
        madeOn:(typeof b.madeOn==="string")?b.madeOn:"",
        lot:(typeof b.lot==="string")?b.lot.slice(0,32):"",
        cureWeeks:clamp(b.cureWeeks,4,1,16),
        notes:(typeof b.notes==="string")?b.notes.slice(0,4000):"",
        // zap tests & pH readings taken while the bar cures
        checks:(Array.isArray(b.checks)?b.checks:[]).filter(function(k){ return k&&typeof k==="object"; })
          .slice(-20).map(function(k){
            return { id:(typeof k.id==="string"&&k.id)?k.id:uid(),
              on:(typeof k.on==="string")?k.on.slice(0,10):"",
              ph:(k.ph===""||k.ph==null||!isFinite(parseFloat(k.ph)))?null:clamp(k.ph,10,0,14),
              zap:!!k.zap,
              note:(typeof k.note==="string")?k.note.slice(0,300):"" };
          }) };
    });
  }}
];
export const VIEW_FIELDS=[
  {k:"unit",           coerce:function(v){return UNITS[v]?v:"g";}},
  {k:"lastWeightUnit", coerce:function(v,view){return (UNITS[v]&&v!=="pct")?v:((UNITS[view.unit]&&view.unit!=="pct")?view.unit:"g");}},
  {k:"tab",            coerce:function(v){return ["base","scents","make"].indexOf(v)>=0?v:"base";}},
  {k:"scaleMode",      coerce:function(v){return ["batch","oils","bars","mold"].indexOf(v)>=0?v:"batch";}},
  {k:"moldShape",      coerce:function(v){return ["loaf","round","cavity"].indexOf(v)>=0?v:"loaf";}},
  {k:"scaleUnit",      coerce:function(v){return (UNITS[v]&&v!=="pct")?v:null;}},
  {k:"currency",       coerce:function(v){return (typeof v==="string"&&v)?v:"$";}},
  {k:"prices",         coerce:function(v){return (v&&typeof v==="object")?v:{};}},
  // your supplier's SAP values, keyed by oil. App-wide rather than per-recipe,
  // because it describes where you shop, not what you're making.
  {k:"sapOverrides",   coerce:function(v){
    var out={}; if(v&&typeof v==="object") for(var k in v){ var n=parseFloat(v[k]);
      if(OILS[k] && isFinite(n) && n>0 && n<1) out[k]=n; } return out; }},
  // what's in the cupboard, in grams, keyed like prices. Only ingredients you've
  // actually entered appear here, which is what keeps inventory opt-in.
  {k:"stock",          coerce:function(v){return (v&&typeof v==="object")?v:{};}},
  {k:"collapsed",      coerce:function(v){return (v&&typeof v==="object")?v:null;}},
  // ingredient keys you've added lately, newest first — drives the quick-add chips
  {k:"recent",         coerce:function(v){return Array.isArray(v)?v.filter(function(x){return typeof x==="string";}).slice(0,8):[];}},
  {k:"theme",          coerce:function(v){return (v==="light"||v==="dark")?v:"auto";}},
  {k:"librarySort",    coerce:function(v){return ["name","recent","added"].indexOf(v)>=0?v:"name";}},
  // keep the screen on while you're actually making soap. Lives here rather than on the
  // recipe because it describes the device you're standing at, not what you're making.
  {k:"keepAwake",      coerce:function(v){return v!==false;}}
];


export function coerceField(key,v){
  for(var i=0;i<RECIPE_FIELDS.length;i++){
    if(RECIPE_FIELDS[i].k===key) return RECIPE_FIELDS[i].coerce(v);
  }
  return v;
}
