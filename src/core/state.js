/* The recipe you have open, the library it came from, and everything that reads or writes
   them. Extracted from main.js because 344 of its references were to `state` alone — it was
   the hub the whole file hung off, and nothing else could be split out while it lived there.

   `state` is only ever *reassigned* here, at its declaration. Everywhere else mutates its
   properties (state.oils, state.superfat, …), which is why the move needed no changes at
   its call sites: an imported binding can be read and its properties written, just not
   reassigned. `library` and `currentId` are the exceptions, so they have setters.

   Depends on data, schema and dom — never on rendering. save() does not redraw; callers
   have always done `save(); render();` and that stays true, which is what keeps this
   module free of a cycle back into the UI. */
import * as Chem from "./chem.js";
import { oilsGof, qualitiesOf, useSapOverrides } from "./chem.js";
import { $, downloadFile, uid } from "./dom.js";
import { RECIPE_FIELDS, STORE_KEY, VIEW_FIELDS, defOf } from "./schema.js";
import { UNITS, sumG } from "./units.js";
import { b64urlDec, todayISO } from "./util.js";
import { OILS } from "../data/oils.js";
/* Namespace import on purpose: the four wrappers below share their names with the raw
   functions in chem.js, so they cannot be imported by name without colliding. */
export function statsFor(r){
  var B=blendFA(r), L=computeLye(r), tot=oilsGof(r);
  var scentG=sumG(r.aromas);
  return { oilsG:tot, batchG:currentBatchG(r), lyeG:L.lyeG, waterG:L.waterG, kind:L.kind,
    sf:r.superfat, waterPct:r.waterPct, q:qualitiesOf(B.fa), iod:B.iod, ins:B.ins,
    oilPcts:r.oils.map(function(it){ return {name:it.name,key:it.key,pct:tot>0?it.g/tot*100:0}; }),
    scentPct: tot>0?scentG/tot*100:0 };
}






/* ---------- deterministic safety check (all on-device, works on every phone) ---------- */





/* Set each scent to a proper amount: known scents to their typical usage rate,
   custom scents to an even share of a 3% total — so the bar isn't over/under-scented. */

export var library=[];      // [{ id, name } + the RECIPE_FIELDS in schema.js]
export var currentId=null;
/* Reassignment is the one thing an importer can't do to a binding, so these two are the
   only members that need setters. Everything else is read or property-mutated in place. */
export function setLibrary(l){ library=l; }
export function setCurrentId(id){ currentId=id; }

export var sharedImportName=null;   // set by initState when a recipe arrives via a #r= link
/* Both of these are written during initState(), so they have to be declared above the
   `var state = initState()` below: a `var` further down is hoisted as undefined and then
   *reassigned* when module evaluation reaches it, wiping whatever initState just set. */
export var sharedOverrides=null;    // supplier SAP figures that arrived with that link
export var sharedOvUsed=0;          // how many of them we took, for the arrival toast
/* Set when load() finds saved data it can't read. While it holds a value nothing is
   written to storage, because the alternative is what this app used to do: show an empty
   library, let you add an oil, and overwrite three recipes and a batch history with
   "My recipe" — silently, with the good data still on disk until that first save.
   Declared HERE, above initState(), because load() runs during that call: a `var` further
   down the module would be re-initialised to null immediately afterwards and undo it. */
var loadBlocked=null;          // the raw string we failed to parse, kept for rescue
var writeTimer=null;

/* ---------- recipe library ---------- */
export function libById(id){ for(var i=0;i<library.length;i++) if(library[i].id===id) return library[i]; return null; }

export function blankRecipe(name){ var r={id:uid(), name:name};
  RECIPE_FIELDS.forEach(function(fld){ r[fld.k]=defOf(fld); }); return r; }

export function cloneItem(it){ var o={name:it.name,key:it.key,g:it.g}; if(it.sap>0) o.sap=it.sap; return o; }

// recipes reaching here are already sanitized (from load) or freshly built, so fields are copied
// as-is — arrays by reference, so state and the live library recipe stay the same objects.
export function stateFromRecipe(r,view){
  var st={};
  VIEW_FIELDS.forEach(function(fld){ st[fld.k]=fld.coerce(view[fld.k],view); });
  RECIPE_FIELDS.forEach(function(fld){ st[fld.k]=r[fld.k]; });
  return st;
}

export function loadRecipeIntoState(r){ RECIPE_FIELDS.forEach(function(fld){ state[fld.k]=r[fld.k]; }); }

export function syncCurrent(){ var r=libById(currentId); if(!r) return;
  RECIPE_FIELDS.forEach(function(fld){ r[fld.k]=state[fld.k]; }); }

// Favourites always float to the top; the rest follow the chosen order.
export function sortedLibrary(){
  var mode=state.librarySort||"name", order=library.slice();
  var index={}; library.forEach(function(r,i){ index[r.id]=i; });
  return order.sort(function(a,b){
    if(!!a.fav!==!!b.fav) return a.fav?-1:1;
    if(mode==="recent"){ var d=(b.lastUsed||0)-(a.lastUsed||0); if(d) return d; }
    else if(mode==="added"){ return index[a.id]-index[b.id]; }
    return a.name.localeCompare(b.name);
  });
}

export function touchRecipe(id){ var r=libById(id); if(r) r.lastUsed=Date.now(); }

/* ---------- blend / lye ---------- */
// Built from the schema rather than a hand-kept list: adding a recipe field used
// to mean remembering to add it here too, and forgetting silently fell back to
// the default instead of erroring.
export function curRV(){ var rv={}; RECIPE_FIELDS.forEach(function(f){ rv[f.k]=state[f.k]; }); return rv; }

export function cleanList(list,db){ if(!Array.isArray(list)) return [];
  return list.filter(function(it){ return it&&typeof it.name==="string"&&typeof it.g==="number"&&isFinite(it.g); })
    .map(function(it){ var k=(it.key&&db[it.key])?it.key:null;
      var o={name:it.name,key:k,g:it.g};
      // a custom oil can carry the SAP value off its own bottle, which is what
      // lets it into the lye maths at all
      if(!k && it.sap>0 && it.sap<1) o.sap=it.sap;
      return o; }); }

export function sanitizeRecipe(r){ if(!r||typeof r!=="object") return null;
  var out={ id:(typeof r.id==="string"&&r.id)?r.id:uid(),
            name:(typeof r.name==="string"&&r.name.trim())?r.name:"Untitled" };
  RECIPE_FIELDS.forEach(function(fld){ out[fld.k]= fld.list ? cleanList(r[fld.k],fld.list) : fld.coerce(r[fld.k]); });
  return out; }

export function importSharedFromHash(){
  var m=(location.hash||"").match(/[#&]r=([^&]+)/); if(!m) return null;
  try{ var raw=JSON.parse(b64urlDec(m[1])), r=sanitizeRecipe(raw);
    sharedOverrides=cleanOverrides(raw.sapOv);
    history.replaceState(null,"",location.pathname+location.search);   // so a refresh doesn't re-import
    return r;
  }catch(e){ return null; }
}

export function cleanOverrides(o){
  if(!o||typeof o!=="object") return null;
  var out=null;
  Object.keys(o).forEach(function(k){ if(OILS[k] && o[k]>0 && o[k]<1){ if(!out) out={}; out[k]=o[k]; } });
  return out;
}

export function load(){
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
  }catch(e){
    // Something is there and we couldn't read it. Do NOT quietly start fresh over the top.
    var raw0=null; try{ raw0=localStorage.getItem(STORE_KEY); }catch(e2){}
    if(raw0){ loadBlocked=raw0; showLoadBlocked(); }
  }
  return null;
}

/* Offers the two things that actually help: get the unreadable data off the device before
   anything touches it, or decide deliberately to start over. */
export function showLoadBlocked(){
  var box=$("loadWarn"); if(!box) return;
  box.classList.remove("hide");
  box.innerHTML='<b>Couldn\'t read your saved recipes.</b> They are still on this device and nothing has been '+
    'overwritten — this app will not save anything until you choose. Reloading often fixes it.'+
    '<div class="lw-btns"><button type="button" class="addbtn" id="lwReload">Reload</button>'+
    '<button type="button" class="recalc" id="lwSave">Download a copy</button>'+
    '<button type="button" class="recalc" id="lwFresh">Start fresh</button></div>';
  $("lwReload").addEventListener("click",function(){ location.reload(); });
  $("lwSave").addEventListener("click",function(){
    downloadFile("soapcalc-unreadable-"+todayISO()+".json", loadBlocked);
  });
  $("lwFresh").addEventListener("click",function(){
    if(!confirm("Start fresh? Your unreadable saved data will be replaced the next time you change anything. Download a copy first if you haven't.")) return;
    loadBlocked=null; box.classList.add("hide"); save();
  });
}

export function writeStore(){
  if(loadBlocked!==null) return;
  try{ var o={ currentId:currentId, recipes:library };
    VIEW_FIELDS.forEach(function(fld){ o[fld.k]=state[fld.k]; });
    localStorage.setItem(STORE_KEY,JSON.stringify(o)); saveFailed(false); }
  catch(e){ saveFailed(true); } }

/* A save that fails is worse than one that errors: you carry on believing the batch is
   logged. Quota and Safari's private mode both throw here. */
export function saveFailed(bad){
  var el0=$("saveWarn"); if(!el0) return;
  el0.classList.toggle("hide",!bad);
  if(bad) el0.textContent="⚠️ Couldn't save to this browser's storage — your recent changes are only in this tab. Free up space, or use Back up all to keep a copy.";
}

export function cancelWrite(){ if(writeTimer){ clearTimeout(writeTimer); writeTimer=null; } }

export function save(){ syncCurrent(); cancelWrite(); writeStore(); }

export function saveSoon(){ syncCurrent(); if(!writeTimer) writeTimer=setTimeout(function(){ writeTimer=null; writeStore(); },200); }

export function flushSave(){ if(writeTimer){ cancelWrite(); writeStore(); } }

/* ---------- persistence ---------- */
export function initState(){
  var loaded=load(), shared=importSharedFromHash();
  if(loaded){ library=loaded.recipes; currentId=loaded.currentId; if(shared){ library.push(shared); currentId=shared.id; } }
  else if(shared){ library=[shared]; currentId=shared.id; }              // fresh recipient: just the shared recipe
  else { var r0=blankRecipe("My recipe"); library=[r0]; currentId=r0.id; }
  if(shared) sharedImportName=shared.name;
  var view=loaded?loaded.view:{unit:"g",tab:"base",scaleMode:"batch"};
  var r=libById(currentId)||library[0]; currentId=r.id;
  var st=stateFromRecipe(r,view);
  // A SAP figure you set yourself is yours; a shared link only fills gaps.
  if(sharedOverrides){
    if(!st.sapOverrides) st.sapOverrides={};
    Object.keys(sharedOverrides).forEach(function(k){
      if(!(st.sapOverrides[k]>0)){ st.sapOverrides[k]=sharedOverrides[k]; sharedOvUsed++; }
    });
  }
  return st;
}

/* A phone can background or kill the page without warning, so anything still queued is
   written the moment we stop being visible. */
window.addEventListener("pagehide",flushSave);
document.addEventListener("visibilitychange",function(){ if(document.visibilityState==="hidden") flushSave(); });

/* Small readers of the open recipe. They live here rather than in the UI because they
   answer questions about state, and half the app asks them. */
export function weightUnit(){ return state.unit==="pct" ? (UNITS[state.lastWeightUnit]&&state.lastWeightUnit!=="pct" ? state.lastWeightUnit : "g") : state.unit; }
export function scaleUnit(){ return (UNITS[state.scaleUnit]&&state.scaleUnit!=="pct") ? state.scaleUnit : weightUnit(); }
export function oilInfo(it){ return it.key ? OILS[it.key] : null; }
export function cleansingCap(use){ return use==="face" ? 18 : (use==="hair" ? 20 : 22); }
export function totalOilsG(){ return sumG(state.oils); }

/* chem.js takes an explicit recipe and knows nothing about application state. These four
   supply "the recipe currently open" so that the ~90 call sites below read as they always
   did, and tell chem where to find your supplier SAP figures. */
useSapOverrides(function(){ return state.sapOverrides; });
export function blendFA(rv){ return Chem.blendFA(rv||curRV()); }
export function computeLye(rv){ return Chem.computeLye(rv||curRV()); }
export function currentBatchG(rv){ return Chem.currentBatchG(rv||curRV()); }
export function curedBatchG(rv){ return Chem.curedBatchG(rv||curRV()); }

export var state = initState();
