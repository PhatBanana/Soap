/* The toast strip and the undo stack behind it. Undo restores the three ingredient
   lists only — the thing people actually fat-finger — which is why it can live apart
   from the rest of the state.

   Imports render() from ui/render.js, which imports showToast() and pushUndo() back
   from here. That cycle is fine because every one of those calls happens when someone
   taps something, never while a module is still evaluating; the rule for this whole
   layer is that nothing calls across a cycle at module top level. */
import { render, setLastGoal } from "./render.js";
import { $ } from "../core/dom.js";
import { cloneItem, currentId, save, state } from "../core/state.js";

export var UNDO_MAX=10, undoStack=[], toastTimer=null;
export function pushUndo(){
  undoStack.push({ id:currentId, oils:state.oils.map(cloneItem),
    additives:state.additives.map(cloneItem), aromas:state.aromas.map(cloneItem) });
  if(undoStack.length>UNDO_MAX) undoStack.shift();
}
export function showToast(msg,noUndo){
  $("toastMsg").textContent=msg;
  $("toastUndo").classList.toggle("hide", !!noUndo || undoStack.length===0);
  $("toastUndo").textContent = undoStack.length>1 ? "Undo ("+undoStack.length+")" : "Undo";
  $("toast").classList.remove("hide");
  clearTimeout(toastTimer); toastTimer=setTimeout(function(){ $("toast").classList.add("hide"); },noUndo?2500:6000);
}
export function doUndo(){
  // only step back through edits made to the recipe you're looking at
  while(undoStack.length && undoStack[undoStack.length-1].id!==currentId) undoStack.pop();
  var snap=undoStack.pop(); if(!snap) { $("toast").classList.add("hide"); return; }
  state.oils=snap.oils; state.additives=snap.additives; state.aromas=snap.aromas;
  setLastGoal(null); save(); render();
  if(undoStack.length) showToast("Undone"); else $("toast").classList.add("hide");
}
