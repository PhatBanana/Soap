/* The batch log, read across every recipe: what's curing and when it's ready, and who
   was given which batch.

   Curing now. Each logged batch already knows when it was made and how long it cures,
   but you only saw that by opening its recipe. This lists them all by ready date, and
   hands any of them to the phone's own calendar as a standard .ics file — no account,
   no server, and it works offline: iPhone and Android both open one straight into
   "add to calendar". A make that has a date but hasn't been logged yet is listed too,
   marked as such, because forgetting to log is the usual way it would go missing.

   Gift log. Each batch can record who was given bars from it (the form lives on the
   batch in the history, beside the cure checks). This view searches every gift at once
   — the question it exists for is "someone who had my soap has a rash: which batch did
   they get, and who else got it?". Gifts are personal like the rest of the batch
   record, so they never travel in a share link. */
import { closeModal, downloadFile, el, escapeHtml, makeModal, modalFoot } from "../core/dom.js";
import { currentId, library, libById, state, syncCurrent } from "../core/state.js";
import { todayISO } from "../core/util.js";
import { render } from "../ui/render.js";
import { switchRecipe } from "./recipes.js";

var DAY = 86400000;
// date-only arithmetic in UTC, so a daylight-saving change can't make a day 23 hours
function dayNum(iso){ var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||""); return m ? Date.UTC(+m[1],+m[2]-1,+m[3])/DAY : NaN; }
function isoOf(n){ var d=new Date(n*DAY); return d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0")+"-"+String(d.getUTCDate()).padStart(2,"0"); }
export function readyISO(madeOn, weeks){ var n=dayNum(madeOn); return isFinite(n) ? isoOf(n+(weeks||4)*7) : ""; }
function nice(iso, withYear){
  var n=dayNum(iso); if(!isFinite(n)) return iso||"—";
  var d=new Date(n*DAY);
  return d.toLocaleDateString(undefined, withYear?{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}:{day:"numeric",month:"short",timeZone:"UTC"});
}
export function readyPhrase(days){
  return days>1 ? "ready in "+days+" days" : days===1 ? "ready tomorrow" : days===0 ? "ready today"
       : days===-1 ? "ready since yesterday" : "ready for "+(-days)+" days";
}

/* Everything curing, plus what finished in the last month (so a batch that came ready
   while you weren't looking still shows), soonest first. */
export var CURING_KEEP_DAYS = 30;
export function curingEntries(){
  syncCurrent();
  var today=dayNum(todayISO()), out=[];
  library.forEach(function(r){
    var logged={};
    (r.batches||[]).forEach(function(b){
      var ready=readyISO(b.madeOn,b.cureWeeks); if(!ready) return;
      logged[b.madeOn]=1;
      out.push({ recipeId:r.id, name:r.name, batchId:b.id, lot:b.lot||"", madeOn:b.madeOn,
        weeks:b.cureWeeks||4, ready:ready, days:dayNum(ready)-today, logged:true });
    });
    var rr=readyISO(r.madeOn,r.cureWeeks);
    if(rr && !logged[r.madeOn]) out.push({ recipeId:r.id, name:r.name, batchId:"", lot:r.lot||"",
      madeOn:r.madeOn, weeks:r.cureWeeks||4, ready:rr, days:dayNum(rr)-today, logged:false });
  });
  return out.filter(function(e){ return e.days>=-CURING_KEEP_DAYS; })
            .sort(function(a,b){ return a.days-b.days || a.name.localeCompare(b.name); });
}

/* ---------- .ics (RFC 5545) ----------
   All-day events on the ready date, with a 9 am reminder that day. Text is escaped as
   the spec requires, and long lines are folded at 75 bytes — a name with an é in it is
   two bytes, which is exactly the kind of thing that breaks a strict calendar import. */
export function icsEscape(s){ return String(s).replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\r?\n/g,"\\n"); }
export function icsFold(line){
  var out="", used=0;
  for(var i=0;i<line.length;i++){
    var ch=line[i], cp=line.codePointAt(i); if(cp>0xffff){ ch=line.slice(i,i+2); i++; }
    var bytes=new TextEncoder().encode(ch).length;
    if(used+bytes>75){ out+="\r\n "; used=1; }
    out+=ch; used+=bytes;
  }
  return out;
}
function stamp(){ return new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,""); }
export function icsFor(entries){
  var L=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Soap Calc//Cure dates//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH"];
  entries.forEach(function(e){
    var start=e.ready.replace(/-/g,""), end=isoOf(dayNum(e.ready)+1).replace(/-/g,"");
    var title="Soap ready: "+e.name+(e.lot?" (lot "+e.lot+")":"");
    L.push("BEGIN:VEVENT",
      "UID:"+(e.batchId||("r-"+e.recipeId+"-"+e.madeOn))+"-ready@soapcalc",
      "DTSTAMP:"+stamp(),
      "DTSTART;VALUE=DATE:"+start, "DTEND;VALUE=DATE:"+end,
      "SUMMARY:"+icsEscape(title),
      "DESCRIPTION:"+icsEscape("Made "+nice(e.madeOn,true)+", "+e.weeks+"-week cure. Zap-test a bar before you use or give it."),
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:"+icsEscape(title),"TRIGGER;RELATED=START:PT9H","END:VALARM",
      "END:VEVENT");
  });
  L.push("END:VCALENDAR");
  return L.map(icsFold).join("\r\n")+"\r\n";
}
function fileName(entries){
  if(entries.length!==1) return "soap-ready-dates.ics";
  return "soap-ready-"+entries[0].name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40)+"-"+entries[0].ready+".ics";
}
export function saveToCalendar(entries){
  if(!entries.length) return;
  downloadFile(fileName(entries), icsFor(entries), "text/calendar");
}

// the Make tab's "Ready to use": the make that's open now, logged or not
export function readyEntryForCurrent(){
  syncCurrent(); var r=libById(currentId); if(!r) return null;
  var ready=readyISO(state.madeOn,state.cureWeeks); if(!ready) return null;
  var b=null; (state.batches||[]).forEach(function(x){ if(x.madeOn===state.madeOn) b=x; });
  return { recipeId:r.id, name:r.name, batchId:b?b.id:"", lot:(b&&b.lot)||state.lot||"", madeOn:state.madeOn,
    weeks:state.cureWeeks||4, ready:ready, days:dayNum(ready)-dayNum(todayISO()), logged:!!b };
}

function goTo(md,id){ closeModal(md.back); state.tab="make"; switchRecipe(id); render(); }

export function openCuring(){
  var md=makeModal(), list=curingEntries();
  md.m.appendChild(el("h3",null,"Curing now"));
  if(!list.length){
    md.m.appendChild(el("p","sub","Nothing curing. Set the date you made a batch on the Make tab — or log it — and it shows up here with its ready date."));
    modalFoot(md); return;
  }
  md.m.appendChild(el("p","sub","Every batch across your recipes, soonest ready first. 📅 adds a ready date to your phone's calendar, with a reminder that morning."));
  var box=el("div","cure-list");
  list.forEach(function(e){
    var row=el("div","cure-row"+(e.days<=0?" is-ready":""));
    var name=el("button","cure-name",escapeHtml(e.name)); name.type="button";
    name.addEventListener("click",function(){ goTo(md,e.recipeId); });
    row.appendChild(name);
    row.appendChild(el("span","cure-when",escapeHtml(readyPhrase(e.days))));
    row.appendChild(el("div","cure-meta",escapeHtml(
      (e.lot?"Lot "+e.lot+" · ":"")+"made "+nice(e.madeOn)+" · ready "+nice(e.ready,true)+(e.logged?"":" · not logged yet"))));
    if(e.days>0){
      var cal=el("button","cure-cal","📅"); cal.type="button"; cal.setAttribute("aria-label","Add the ready date to your calendar");
      cal.addEventListener("click",function(){ saveToCalendar([e]); });
      row.appendChild(cal);
    }
    box.appendChild(row);
  });
  md.m.appendChild(box);
  var upcoming=list.filter(function(e){ return e.days>0; });
  var foot=el("div","mfoot");
  if(upcoming.length>1){
    var all=el("button","ghost","📅 Add all "+upcoming.length); all.type="button";
    all.addEventListener("click",function(){ saveToCalendar(upcoming); });
    foot.appendChild(all);
  }
  var cl=el("button","primary","Close"); cl.type="button";
  cl.addEventListener("click",function(){ closeModal(md.back); });
  foot.appendChild(cl); md.m.appendChild(foot);
}

/* ---------- gift log ---------- */
export function giftEntries(){
  syncCurrent();
  var out=[];
  library.forEach(function(r){
    (r.batches||[]).forEach(function(b){
      (b.given||[]).forEach(function(g){
        out.push({ recipeId:r.id, name:r.name, batchId:b.id, lot:b.lot||"", madeOn:b.madeOn||"",
          to:g.to, bars:g.bars||0, on:g.on||"" });
      });
    });
  });
  return out.sort(function(a,b){ return (b.on||"").localeCompare(a.on||"") || a.to.localeCompare(b.to); });
}
// everyone you've given soap to, for the name field's suggestions
export function knownGiftNames(){
  var seen={}, out=[];
  giftEntries().forEach(function(g){ var k=g.to.toLowerCase(); if(!seen[k]){ seen[k]=1; out.push(g.to); } });
  return out.sort(function(a,b){ return a.localeCompare(b); });
}
export function openGifts(){
  var md=makeModal(), all=giftEntries();
  md.m.appendChild(el("h3",null,"Gift log"));
  if(!all.length){
    md.m.appendChild(el("p","sub","No gifts recorded yet. On the Make tab, each logged batch in the history has a “+ gift” button — note who you gave bars to, and they'll all be searchable here."));
    modalFoot(md); return;
  }
  md.m.appendChild(el("p","sub","Who got which batch. If someone reacts to a bar, search their name to find the lot — then the recipe's batch history has the formula as made."));
  var q=document.createElement("input"); q.type="search"; q.className="gift-q"; q.placeholder="Search a name, recipe or lot…";
  md.m.appendChild(q);
  var box=el("div","gift-list"); md.m.appendChild(box);
  function draw(){
    var term=q.value.trim().toLowerCase(); box.innerHTML="";
    var hits=all.filter(function(g){ return !term || (g.to+" "+g.name+" "+g.lot).toLowerCase().indexOf(term)>=0; });
    if(!hits.length){ box.appendChild(el("div","ocr-status","No gifts match that.")); return; }
    var bars=0, people={};
    hits.forEach(function(g){
      bars+=g.bars||0; people[g.to.toLowerCase()]=1;
      var row=el("div","gift-row");
      row.appendChild(el("b","gift-to",escapeHtml(g.to)));
      var go=el("button","gift-recipe",escapeHtml(g.name)+(g.lot?" · lot "+escapeHtml(g.lot):"")); go.type="button";
      go.addEventListener("click",function(){ goTo(md,g.recipeId); });
      row.appendChild(go);
      row.appendChild(el("span","gift-meta",escapeHtml((g.bars?g.bars+" bar"+(g.bars===1?"":"s")+" · ":"")+(g.on?nice(g.on,true):"no date"))));
      box.appendChild(row);
    });
    var np=Object.keys(people).length;
    box.appendChild(el("div","subinfo",escapeHtml(hits.length+" gift"+(hits.length===1?"":"s")+" to "+np+" "+(np===1?"person":"people")+(bars?" · "+bars+" bar"+(bars===1?"":"s"):""))));
  }
  q.addEventListener("input",draw); draw();
  modalFoot(md);
}
