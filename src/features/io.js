/* Getting a recipe in and out: CSV both ways, a pasted table from another calculator,
   a photo, and the whole-library backup. Everything that arrives from outside lands on
   the same review screen before it touches the recipe — openConfirm below. */
import { sapOf } from "../core/chem.js";
import { $, closeModal, downloadFile, el, makeModal, modalFoot, numInput } from "../core/dom.js";
import { STORE_KEY, coerceField } from "../core/schema.js";
import { cancelWrite, flushSave, save, state, syncCurrent } from "../core/state.js";
import { CONV, IMPORT_UNITS, fmt } from "../core/units.js";
import { todayISO } from "../core/util.js";
import { ADDITIVES, AROMAS } from "../data/ingredients.js";
import { OILS } from "../data/oils.js";
import { render, updateBackupNudge } from "../ui/render.js";
export var NAME_STOP={oil:1,oils:1,fat:1,fats:1,butter:0,pure:1,refined:1,unrefined:1,organic:1,
               virgin:1,extra:1,deg:1,degree:1,degrees:1,"76":1,"92":1,eo:1,fo:1,essential:1,fragrance:0};
export var LYE_WORDS=/^(sodium hydroxide|naoh|lye|potassium hydroxide|koh)\b/i;
export var SKIP_WORDS=/^(water|distilled water|liquid|total|totals|ice|milk\s*\/\s*water)\b/i;
export var UNIT_RE=/(grams?|g|ounces?|oz|pounds?|lbs?|lb|kg)\b/i;

// Which of a row's numbers is the amount? A header line tells us outright.
export var UNIT_RE_G=/(grams?|g|ounces?|oz|pounds?|lbs?|lb|kg)\b/gi;

export function exportCSV(){
  var lines=[csvRow(["section","name","amount","unit","key","sap"])];
  state.oils.forEach(function(it){ lines.push(csvRow(["oil",it.name,fmt(it.g,3),"g",it.key||"",fmt(sapOf(it),4)])); });
  state.additives.forEach(function(it){ lines.push(csvRow(["additive",it.name,fmt(it.g,3),"g",it.key||"",""])); });
  state.aromas.forEach(function(it){ lines.push(csvRow(["scent",it.name,fmt(it.g,3),"g",it.key||"",""])); });
  downloadFile("soap-recipe.csv",lines.join("\n"),"text/csv");
}
export function csvRow(vals){ return vals.map(function(v){ v=String(v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }).join(","); }
export function parseCSV(text){
  var rows=[],row=[],cur="",q=false,i,c;
  for(i=0;i<text.length;i++){ c=text[i];
    if(q){ if(c=='"'){ if(text[i+1]=='"'){cur+='"';i++;} else q=false; } else cur+=c; }
    else { if(c=='"')q=true; else if(c==','){row.push(cur);cur="";} else if(c=='\n'||c=='\r'){ if(c=='\r'&&text[i+1]=='\n')i++; row.push(cur);cur=""; rows.push(row);row=[]; } else cur+=c; }
  }
  if(cur.length||row.length){ row.push(cur); rows.push(row); }
  return rows.filter(function(r){ return r.some(function(x){return x.trim()!==""; }); });
}
export function parseCSVToRows(text){
  var raw=parseCSV(text); if(!raw.length) return [];
  var head=raw[0].map(function(h){return h.trim().toLowerCase();});
  var looksHeader = head.some(function(h){ return /name|oil|ingredient|amount|qty|weight|unit|section|type/.test(h); });
  var col={ section:find(head,["section","type","category"]), name:find(head,["name","oil","ingredient","item"]),
            amount:find(head,["amount","qty","quantity","weight","grams","g"]), unit:find(head,["unit","units","uom"]),
            key:find(head,["key","id"]), sap:find(head,["sap","sap naoh","saponification"]) };
  var body = looksHeader ? raw.slice(1) : raw;
  var out=[];
  body.forEach(function(r){
    var name, amount;
    if(looksHeader){ name = col.name>=0 ? r[col.name] : r[1]; amount = col.amount>=0 ? r[col.amount] : ""; }
    else { name = r[0]; amount = r[1]; }   // no header: fall back to positional name, amount
    var unit = col.unit>=0 ? r[col.unit] : "";
    var section = col.section>=0 ? r[col.section] : "";
    // null means "the file has no key column at all", empty string means "this row
    // was exported without a key" — a custom oil. The two are not the same, and
    // only the second one may stop the name matcher from having a guess.
    var key = col.key>=0 ? String(r[col.key]||"").trim() : null;
    var sap = col.sap>=0 ? r[col.sap] : "";
    if(!name || !String(name).trim()) return;
    out.push(normalizeRow(String(name).trim(), amount, unit, section, key, sap));
  });
  return out;
  function find(arr,names){ for(var n=0;n<names.length;n++){ var idx=arr.indexOf(names[n]); if(idx>=0) return idx; } return -1; }
}
export function normalizeRow(name, amountRaw, unitRaw, sectionRaw, keyRaw, sapRaw){
  var amount=parseFloat(String(amountRaw).replace(/[^\d.]/g,"")); if(!isFinite(amount)) amount=0;
  var unit=(String(unitRaw||"").trim().toLowerCase().replace(/s$/,"")) ; if(!CONV[unit]) unit="g";
  var section=String(sectionRaw||"").trim().toLowerCase();
  if(!/oil|base|additive|scent|fragrance|aroma|essential/.test(section)) section=guessSection(name);
  else if(/additive/.test(section)) section="additive";
  else if(/scent|fragrance|aroma|essential/.test(section)) section="scent";
  else section="oil";
  // Only a NaOH-ratio SAP (grams of lye per gram of oil) means anything here.
  // A blank, a stray word, or the mg-KOH-per-gram figure other calculators print
  // is dropped rather than guessed at — the row then imports the way it always did.
  var sap=parseFloat(String(sapRaw==null?"":sapRaw).replace(/[^\d.]/g,""));
  if(!(sap>0 && sap<1)) sap=0;
  return { name:name, amount:amount, unit:unit, section:section,
           key:(keyRaw==null?null:String(keyRaw).trim()), sap:sap };
}
// Compare across all three databases rather than taking the first hit —
// otherwise "Coconut Oil" is claimed by the additive "Coconut milk".
export function guessSection(name){
  var o=bestIn(OILS,name).score, d=bestIn(ADDITIVES,name).score, s=bestIn(AROMAS,name).score;
  if(s>o && s>=d) return "scent";
  if(d>o) return "additive";
  return "oil";                                 // ties go to oil, the common case
}
/* Other calculators name oils their own way — "Coconut Oil, 76 deg",
   "Palm Kernel Flakes", "Lard, Pig Tallow (Manteca)". Score each database
   entry by how many of its distinctive words the input covers, so the most
   specific entry wins instead of whichever happens to come first. */
export function cleanName(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim(); }
// words that say nothing about *which* ingredient this is
export function nameWords(s){ return cleanName(s).split(" ").filter(function(w){ return w && !NAME_STOP[w]; }); }
export function bestIn(db,name){
  var n=cleanName(name); if(!n) return {key:null,score:0};
  var a=nameWords(n), best=null, bestScore=0;
  for(var k in db){
    var dn=cleanName(db[k].name);
    if(dn===n) return {key:k,score:99};        // exact wins outright
    var b=nameWords(dn); if(!a.length||!b.length) continue;
    var hit=0; b.forEach(function(w){ if(a.indexOf(w)>=0) hit++; });
    if(!hit) continue;
    // reward covered words, mildly penalise the ones we missed, so
    // "palm kernel" beats "palm" without "salt" losing to "salt (table/sea)"
    var score=hit*3-(b.length-hit);
    if(score>bestScore){ bestScore=score; best=k; }
  }
  return bestScore>=1 ? {key:best,score:bestScore} : {key:null,score:0};
}
export function matchKey(db,name){ return bestIn(db,name).key; }

/* ---------- paste a recipe from another calculator ----------
   SoapCalc, Bramble Berry, SoapmakingFriend and the rest all print a table of
   oils with some mix of %, pounds, ounces and grams columns, plus a few
   settings lines. There's no single file format to parse, so this reads the
   text people actually copy out of them, and everything lands in the same
   review screen as CSV and OCR before it touches the recipe.               */
export function pasteColumns(line){
  var l=" "+line.toLowerCase()+" ", cols=[];
  var pats=[[/\bpercent\b|%/,"pct"],[/\bpounds?\b|\blbs?\b/,"lb"],
            [/\bounces?\b|\boz\b/,"oz"],[/\bgrams?\b|\bg\b/,"g"]];
  pats.forEach(function(p){ var m=l.search(p[0]); if(m>=0) cols.push({at:m,unit:p[1]}); });
  if(cols.length<2) return null;                 // one column word is just prose
  cols.sort(function(x,y){ return x.at-y.at; });
  return cols.map(function(x){ return x.unit; });
}

/* Where do the columns start? Not simply at the first digit — "Coconut Oil,
   76 deg" has one in its name. The amounts are the run of numbers at the end
   of the line, so find the earliest point after which nothing but numbers,
   units and separators remain. */
export function numericTailStart(line){
  var re=/-?\d+(?:[.,]\d+)?%?/g, m;
  while((m=re.exec(line))!==null){
    var rest=line.slice(m.index)
      .replace(/-?\d+(?:[.,]\d+)?%?/g," ")
      .replace(UNIT_RE_G," ")
      .replace(/[\s.,:%\/|-]+/g," ").trim();
    if(rest==="") return m.index;
  }
  return -1;
}
export function parsePasted(text){
  var lines=String(text).split(/\r?\n/), rows=[], settings={}, cols=null, sawPct=false;
  lines.forEach(function(raw){
    var line=raw.replace(/[|\t]+/g," ").replace(/\s+/g," ").trim();
    if(line.length<2) return;

    // settings first — these lines also carry numbers, so they must not
    // fall through and be read as ingredients
    var m;
    if((m=line.match(/(?:super\s*fat|superfat|lye\s*discount)\D{0,12}(\d+(?:\.\d+)?)/i))){
      settings.superfat=parseFloat(m[1]); return; }
    if((m=line.match(/water\s*(?:as\s*)?(?:a\s*)?%?\s*(?:of)?\s*oils?\D{0,12}(\d+(?:\.\d+)?)/i))){
      settings.waterPct=parseFloat(m[1]); settings.waterMode="oils"; return; }
    if((m=line.match(/lye\s*concentration\D{0,12}(\d+(?:\.\d+)?)/i))){
      settings.lyeConc=parseFloat(m[1]); settings.waterMode="conc"; return; }
    if((m=line.match(/water\s*[:\/]\s*lye\s*ratio\D{0,12}(\d+(?:\.\d+)?)/i))){
      settings.waterRatio=parseFloat(m[1]); settings.waterMode="ratio"; return; }

    if(LYE_WORDS.test(line)){ settings.lyeType=/koh|potassium/i.test(line)?"koh":"naoh"; return; }
    if(SKIP_WORDS.test(line)) return;            // water and totals are computed here

    var head=pasteColumns(line);
    if(head && !/\d/.test(line.replace(/\b(76|92)\b/g,""))){ cols=head; return; }  // header row

    // an ingredient row: a name followed by its numbers
    var cut=numericTailStart(line); if(cut<0) return;
    var name=line.slice(0,cut).replace(/[-–—:.,]+$/,"").trim();
    var nums=line.slice(cut).match(/-?\d+(?:[.,]\d+)?%?/g); if(!nums) return;
    if(name.length<2) return;
    if(LYE_WORDS.test(name)||SKIP_WORDS.test(name)) return;

    var vals=nums.map(function(s){ return { pct:/%$/.test(s), n:parseFloat(s.replace("%","").replace(",",".")) }; })
                 .filter(function(v){ return isFinite(v.n); });
    if(!vals.length) return;

    var amount, unit;
    var explicit=line.match(UNIT_RE);
    if(cols && vals.length>=cols.length){
      // header order wins; prefer the most precise column we were given
      var want=["g","oz","lb","pct"], pick=-1, pickUnit="g";
      want.forEach(function(u){ if(pick<0){ var i=cols.indexOf(u); if(i>=0){ pick=i; pickUnit=u; } } });
      amount=vals[pick].n; unit=pickUnit;
    } else if(vals.length===1){
      amount=vals[0].n; unit=vals[0].pct ? "pct" : (explicit?normUnit(explicit[1]):"g");
    } else {
      // no header: a trailing percent is a percent, otherwise take the last
      // number (calculators print coarse-to-fine, so grams come last)
      var last=vals[vals.length-1];
      amount=last.n; unit=last.pct ? "pct" : (explicit?normUnit(explicit[1]):"g");
    }
    if(!(amount>0)) return;
    if(unit==="pct") sawPct=true;
    rows.push({ name:name, amount:amount, unit:unit, section:guessSection(name) });
  });
  return { rows:rows, settings:settings, percent:sawPct };
}

// Percentages need a batch size before they can become weights.
export function resolvePercentRows(rows,totalG){
  var pct=rows.filter(function(r){ return r.unit==="pct" && r.section==="oil"; });
  var sum=pct.reduce(function(a,r){ return a+r.amount; },0);
  return rows.map(function(r){
    if(r.unit!=="pct") return r;
    // scents are quoted as a % of oils; oils as a % of the oil total
    var base = r.section==="oil" ? (sum>0?totalG/sum*r.amount:0) : totalG*r.amount/100;
    return { name:r.name, amount:Math.round(base*100)/100, unit:"g", section:r.section };
  });
}

export function openPaste(){
  var md=makeModal();
  md.m.appendChild(el("h3",null,"Paste a recipe"));
  md.m.appendChild(el("p","sub","Copy a recipe out of SoapCalc, Bramble Berry, SoapmakingFriend or a note and paste it here. Nothing is added until you've checked it."));
  var ta=document.createElement("textarea"); ta.className="notes-field paste-in"; ta.rows=9;
  ta.placeholder="Olive Oil            40      362.87\nCoconut Oil, 76 deg  30      272.16\nPalm Oil             25      226.80\nCastor Oil            5       45.36\nSuper Fat 5%";
  md.m.appendChild(ta);
  var totWrap=el("div","scale-row"); totWrap.hidden=true;
  var totIn=numInput(); totIn.id="pasteTotal"; totIn.value="1000";
  totWrap.appendChild(totIn); totWrap.appendChild(el("span","u","g"));
  var totLabel=el("div","subhead","Total oils (the paste is in percentages)"); totLabel.hidden=true;
  md.m.appendChild(totLabel); md.m.appendChild(totWrap);
  var status=el("div","ocr-status","");
  md.m.appendChild(status);

  var parsed=null;
  function preview(){
    parsed=parsePasted(ta.value);
    var n=parsed.rows.length, keys=Object.keys(parsed.settings);
    totLabel.hidden=totWrap.hidden=!parsed.percent;
    status.textContent = !ta.value.trim() ? ""
      : n ? ("Found "+n+" ingredient"+(n===1?"":"s")+(keys.length?" and "+keys.length+" setting"+(keys.length===1?"":"s"):"")+".")
          : "Nothing recognised yet — each line needs a name and a number.";
  }
  ta.addEventListener("input",preview);

  var foot=el("div","mfoot");
  var cancel=el("button","ghost","Cancel");
  cancel.addEventListener("click",function(){ closeModal(md.back); });
  var go=el("button","primary","Read it");
  go.addEventListener("click",function(){
    if(!parsed) preview();
    if(!parsed || !parsed.rows.length){ status.textContent="Nothing recognised — each line needs a name and a number."; return; }
    var rows=parsed.rows;
    if(parsed.percent){
      var t=parseFloat(totIn.value);
      if(!(t>0)){ status.textContent="Enter how much total oil you want to make."; return; }
      rows=resolvePercentRows(rows,t);
    }
    var s=parsed.settings;
    closeModal(md.back);
    var applied=applyPastedSettings(s);
    openConfirm(rows,"Check the import",
      "From your pasted recipe. Fix anything that came through wrong, then add it."+
      (applied?" Also applied: "+applied+".":""));
  });
  foot.appendChild(cancel); foot.appendChild(go); md.m.appendChild(foot);
  ta.focus();
}

// Settings ride along with the ingredients; each is clamped by the same
// coercion the recipe schema uses, so a nonsense value can't get in.
// Run a value through the recipe schema's own coercion, so a pasted setting
// can never land outside the range the rest of the app enforces.
export function applyPastedSettings(s){
  var done=[];
  if(isFinite(s.superfat)){ state.superfat=coerceField("superfat",s.superfat); done.push("superfat "+state.superfat+"%"); }
  if(s.lyeType){ state.lyeType=coerceField("lyeType",s.lyeType); done.push(state.lyeType==="koh"?"KOH":"NaOH"); }
  if(isFinite(s.waterPct)){ state.waterPct=coerceField("waterPct",s.waterPct); done.push("water "+state.waterPct+"% of oils"); }
  if(isFinite(s.lyeConc)){ state.lyeConc=coerceField("lyeConc",s.lyeConc); done.push("lye concentration "+state.lyeConc+"%"); }
  if(isFinite(s.waterRatio)){ state.waterRatio=coerceField("waterRatio",s.waterRatio); done.push("water:lye "+state.waterRatio+":1"); }
  if(s.waterMode){ state.waterMode=coerceField("waterMode",s.waterMode); }
  if(done.length){ save(); render(); }
  return done.join(", ");
}

/* ---------- confirm modal (CSV + OCR) ---------- */
export function openConfirm(rows,title,sub,previewURL){
  var md=makeModal(), back=md.back, m=md.m;
  m.appendChild(el("h3",null,title));
  m.appendChild(el("p","sub",sub));
  if(previewURL){ var img=document.createElement("img"); img.className="ocr-preview"; img.src=previewURL; m.appendChild(img); }
  var body=el("div"); m.appendChild(body);
  var rowsState=rows.slice();
  function drawRows(){
    body.innerHTML="";
    rowsState.forEach(function(r,idx){
      var pr=el("div","prow");
      var nameI=document.createElement("input"); nameI.value=r.name; nameI.placeholder="name";
      // Retyping the name of a matched oil means you want a different oil, so drop
      // the key and let the matcher look again. A custom row (key "") stays custom.
      nameI.addEventListener("input",function(){ r.name=nameI.value; if(r.key) r.key=null; });
      var amtI=document.createElement("input"); amtI.type="number"; amtI.step="any"; amtI.value=r.amount||""; amtI.placeholder="amt";
      amtI.addEventListener("input",function(){ r.amount=parseFloat(amtI.value)||0; });
      var unitS=document.createElement("select"); IMPORT_UNITS.forEach(function(u){ var o=document.createElement("option"); o.value=u; o.textContent=u; if(u===r.unit)o.selected=true; unitS.appendChild(o); });
      unitS.addEventListener("change",function(){ r.unit=unitS.value; });
      var secS=document.createElement("select"); [["oil","Oil"],["additive","Additive"],["scent","Scent"]].forEach(function(s){ var o=document.createElement("option"); o.value=s[0]; o.textContent=s[1]; if(s[0]===r.section)o.selected=true; secS.appendChild(o); });
      secS.addEventListener("change",function(){ r.section=secS.value; });
      var rm=el("button","rm","&times;"); rm.type="button"; rm.addEventListener("click",function(){ rowsState.splice(idx,1); drawRows(); });
      // name on its own line — imported names are long, and a name you can't
      // read makes this review screen pointless
      nameI.style.gridColumn="1/-1";
      pr.style.gridTemplateColumns="1fr 72px 84px auto";
      pr.appendChild(nameI); pr.appendChild(amtI); pr.appendChild(unitS); pr.appendChild(secS); pr.appendChild(rm);
      // a SAP that isn't our reference figure changes how much lye this oil needs, so say so
      if(sapNote(r)){ var hint=el("div","sub",sapNote(r));
        hint.style.gridColumn="1/-1"; hint.style.marginTop="-4px"; pr.appendChild(hint); }
      body.appendChild(pr);
    });
    if(rowsState.length===0) body.appendChild(el("div","ocr-status","Nothing to add."));
  }
  drawRows();
  var foot=el("div","mfoot");
  var cancel=el("button","ghost","Cancel"); cancel.addEventListener("click",function(){ closeModal(back); });
  var ok=el("button","primary","Add to recipe"); ok.addEventListener("click",function(){ commitRows(rowsState); closeModal(back); });
  foot.appendChild(cancel); foot.appendChild(ok); m.appendChild(foot);
}
export function commitRows(rows){
  var added=0, wantScents=false;
  rows.forEach(function(r){
    if(!r.name || !r.name.trim() || !(r.amount>0)) return;
    var grams=r.amount*(CONV[r.unit]||1); if(!(grams>0)) return;
    if(r.section==="scent"){ var ak=rowKey(AROMAS,r); state.aromas.push({name:ak?AROMAS[ak].name:r.name,key:ak,g:grams}); wantScents=true; }
    else if(r.section==="additive"){ var dk=rowKey(ADDITIVES,r); state.additives.push({name:dk?ADDITIVES[dk].name:r.name,key:dk,g:grams}); }
    else {
      var ok=rowKey(OILS,r), it={name:ok?OILS[ok].name:r.name,key:ok,g:grams};
      if(!ok){ if(r.sap>0) it.sap=r.sap; }        // custom oil keeps the SAP off its bottle
      else if(r.sap>0 && Math.abs(r.sap-OILS[ok].sap)>0.0005 && !(state.sapOverrides&&state.sapOverrides[ok]>0)){
        // the file disagrees with our reference figure: that is the exporter's
        // supplier value, so carry it over instead of silently reverting to ours
        if(!state.sapOverrides) state.sapOverrides={};
        state.sapOverrides[ok]=r.sap;
      }
      state.oils.push(it);
    }
    added++;
  });
  if(added){ if(wantScents && state.oils.length===0) state.tab="scents"; save(); render(); }
}
/* Worth saying out loud on the review screen only when the file's SAP is not the
   number we would have used anyway — otherwise every row grows a line of noise. */
export function sapNote(r){
  if(!(r.sap>0) || r.section!=="oil") return "";
  var k=rowKey(OILS,r);
  if(k && Math.abs(r.sap-OILS[k].sap)<=0.0005) return "";
  return "SAP "+fmt(r.sap,4)+" from the file"+(k?" (ours is "+fmt(OILS[k].sap,4)+")":"");
}
/* An explicit key beats name matching, because it is the only thing that tells a
   custom oil apart from a reference one. A key we don't recognise — a file from a
   newer version, or hand-edited — falls back to matching rather than importing a
   nameless blank. */
export function rowKey(db,r){
  if(r.key && db[r.key]) return r.key;
  if(r.key==="") return null;                    // exported as custom: leave it custom
  return matchKey(db,r.name);
}

/* ---------- OCR ---------- */
$("photoInput").addEventListener("change",function(e){
  var f=e.target.files&&e.target.files[0]; if(!f) return;
  var url=URL.createObjectURL(f);
  // open modal in loading state
  var md=makeModal(), back=md.back, m=md.m;
  m.appendChild(el("h3",null,"Reading photo…"));
  var img=document.createElement("img"); img.className="ocr-preview"; img.src=url; m.appendChild(img);
  var status=el("div","ocr-status","<span class='spin'></span>Loading the text reader…");
  m.appendChild(status);
  // makeModal already closes on a backdrop tap; this one only has to note that the
  // scan in flight should stop when it does
  var cancelled=false;
  back.addEventListener("click",function(ev){ if(ev.target===back) cancelled=true; });

  loadTesseract().then(function(){
    if(cancelled) return;
    status.innerHTML="<span class='spin'></span>Recognizing text… (first run downloads ~5 MB)";
    return window.Tesseract.recognize(f,"eng",{ logger:function(mm){ if(mm.status==="recognizing text"&&!cancelled) status.innerHTML="<span class='spin'></span>Recognizing text… "+Math.round(mm.progress*100)+"%"; } });
  }).then(function(res){
    if(cancelled||!res) return;
    closeModal(back);
    var rows=parseOCR(res.data.text);
    if(!rows.length) rows=[{name:"",amount:0,unit:"g",section:"oil"}];
    openConfirm(rows,"Check the scanned recipe","OCR is rough — fix names, amounts & units, then add. Values default to grams.",url);
  }).catch(function(err){
    if(cancelled) return;
    status.innerHTML="Couldn't read the photo. "+(navigator.onLine?"Try a clearer, well-lit shot.":"You appear to be offline — the first scan needs internet to fetch the reader.");
    modalFoot(md,"Close");
  });
});
export function loadTesseract(){
  if(window.Tesseract) return Promise.resolve();
  return new Promise(function(res,rej){
    var s=document.createElement("script"); s.src="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
    s.onload=res; s.onerror=function(){ rej(new Error("script load failed")); }; document.head.appendChild(s);
  });
}
export function parseOCR(text){
  var out=[]; var lines=String(text).split(/\n+/);
  var re=/(\d+(?:[.,]\d+)?)\s*(grams?|g|ounces?|oz|pounds?|lbs?|lb|kg|ml|tbsp|tbs|tsp|cups?|cup|drops?)\b/i;
  lines.forEach(function(line){
    var l=line.replace(/[|•·*]/g," ").trim(); if(l.length<2) return;
    var mm=l.match(re); if(!mm) return;
    var amount=parseFloat(mm[1].replace(",",".")); var unit=normUnit(mm[2]);
    var name=l.replace(mm[0],"").replace(/[-–:.,]/g," ").replace(/\s+/g," ").trim();
    name=name.replace(/^\d+\s*/,"").trim();
    if(name.length<2){ var mk=matchKey(OILS,l)||matchKey(AROMAS,l)||matchKey(ADDITIVES,l); if(mk){} else return; }
    out.push(normalizeRow(name||l, amount, unit, ""));
  });
  return out;
}
export function normUnit(u){ u=u.toLowerCase().replace(/s$/,""); if(u==="gram")u="g"; if(u==="ounce")u="oz"; if(u==="pound")u="lb"; if(u==="tbs")u="tbsp"; if(!CONV[u])u="g"; return u; }

/* ---------- data safety: persistent storage + backup/restore ---------- */
// Ask the browser to keep our storage (recipes) from being auto-evicted.
if(navigator.storage && navigator.storage.persist){ navigator.storage.persist().catch(function(){}); }
export function backupAll(){
  syncCurrent();
  state.lastBackup=Date.now();          // recorded before the write, so it lands in the file too
  save(); flushSave();
  downloadFile("soapcalc-backup-"+todayISO()+".json", localStorage.getItem(STORE_KEY)||"{}");
  updateBackupNudge();
}
export function restoreFrom(file){
  var r=new FileReader();
  r.onload=function(){
    var text=String(r.result), o;
    try{ o=JSON.parse(text); }catch(e){ alert("That file isn't valid JSON — pick a Soap Calc backup."); return; }
    if(!o||!Array.isArray(o.recipes)||o.recipes.length===0){ alert("That doesn't look like a Soap Calc backup (no recipes found)."); return; }
    if(!confirm("Restore "+o.recipes.length+" recipe(s) from this backup? This replaces the recipes currently on this device.")) return;
    cancelWrite();                       // don't let a queued write clobber the restore
    try{ localStorage.setItem(STORE_KEY,text); location.reload(); }
    catch(e){ alert("Couldn't save the restored data."); }
  };
  r.readAsText(file);
}
