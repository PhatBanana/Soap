/* Recipes arriving and leaving: CSV, a pasted table, share links, and the printables.

   Part of the suite; run by tests/run.mjs, which owns the server, the browser and
   the assertion counts. Everything shared arrives in `t` — see tests/harness.mjs. */
export default async function ioSuite(t) {
  const { LS, OIL, RECIPE_FIELDS, appSrcForShare, base, browser, eq, has, menu, near, newPage, ok, open, pageErrors, recipe, store, txt } = t;

/* =======================================================================
   CSV IMPORT (headered + positional)
======================================================================= */
{
  const p = await newPage();
  async function importCSV(text) {
    await p.goto(base + "/index.html"); await p.waitForTimeout(150);
    await p.evaluate((t) => {
      const dt = new DataTransfer();
      dt.items.add(new File([t], "r.csv", { type: "text/csv" }));
      const inp = document.getElementById("csvInput");
      inp.files = dt.files;
      inp.dispatchEvent(new Event("change", { bubbles: true }));
    }, text);
    await p.waitForTimeout(200);
    return p.$$eval(".modal .prow", (prows) => prows.map((pr) => {
      const ins = pr.querySelectorAll("input"); return ins[0].value + "|" + ins[1].value;
    }));
  }
  eq("CSV headered", (await importCSV("section,name,amount,unit\noil,Olive oil,400,g\noil,Coconut oil,300,g")).join(";"),
     "Olive oil|400;Coconut oil|300");
  eq("CSV positional (no header keywords)", (await importCSV("Lard,400\nTallow,300")).join(";"),
     "Lard|400;Tallow|300");
  await p.close();
}

/* =======================================================================
   CSV ROUND TRIP — a recipe must come back as the recipe that left

   Export used to write only section,name,amount,unit. A custom oil therefore
   came back as whichever reference oil its name resembled: "Coconut blend" at
   SAP 0.10 returned as coconut oil at 0.178, calling for 144 g of lye where the
   recipe needs 114 — 26% over, in the dangerous direction, with the safety
   check reporting the batch balanced.
======================================================================= */
{
  const p = await newPage();
  const CUSTOM = { name:"Coconut blend", key:null, g:400, sap:0.10 };
  // read what exportCSV actually writes, by catching the blob on its way to the link
  async function exportText() {
    await p.evaluate(() => {
      window.__csv = null; const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (b) => { b.text().then((t) => { window.__csv = t; }); return orig(b); };
    });
    await menu(p, "export");
    await p.waitForTimeout(200);
    return p.evaluate(() => window.__csv);
  }
  // import a CSV and read back the stored recipe
  async function roundTrip(text) {
    await p.evaluate((t) => {
      const dt = new DataTransfer(); dt.items.add(new File([t], "r.csv", { type:"text/csv" }));
      const inp = document.getElementById("csvInput"); inp.files = dt.files;
      inp.dispatchEvent(new Event("change", { bubbles:true }));
    }, text);
    await p.waitForTimeout(200);
    await p.evaluate(() => { [...document.querySelectorAll("#modalRoot .mfoot button")]
      .find((b) => /add to recipe/i.test(b.textContent)).click(); });
    await p.waitForTimeout(200);
    return LS(p);
  }

  await open(p, store({ oils:[OIL("olive",600), CUSTOM] }));
  const lyeBefore = await txt(p, "#lyeVal");
  const csv = await exportText();
  ok("Export writes a key column", /(^|,)key(,|$)/m.test(csv.split("\n")[0]), csv.split("\n")[0]);
  ok("Export writes a sap column", /(^|,)sap(,|$)/m.test(csv.split("\n")[0]), csv.split("\n")[0]);
  ok("Export gives a keyed oil its key", /^oil,olive,600,g,olive,0\.134$/m.test(csv), csv);
  ok("Export marks a custom oil keyless and keeps its SAP", /^oil,Coconut blend,400,g,,0\.1$/m.test(csv), csv);

  // clear the recipe, then bring the same file back in
  await open(p, store({ oils:[] }));
  let after = await roundTrip(csv);
  eq("Round trip keeps the custom oil custom", String(after.recipes[0].oils[1].key), "null");
  eq("Round trip keeps the custom SAP", after.recipes[0].oils[1].sap, 0.1);
  eq("Round trip keeps the keyed oil keyed", after.recipes[0].oils[0].key, "olive");
  eq("Round trip leaves the lye unchanged", await txt(p, "#lyeVal"), lyeBefore);
  eq("…and that is not the name-matched figure", lyeBefore, "114.38");

  // a supplier SAP set as an override travels too, as an override
  await open(p, store({ oils:[OIL("olive",600), OIL("coconut",400)] }, { sapOverrides:{ coconut:0.191 } }));
  const ovLye = await txt(p, "#lyeVal");
  const ovCsv = await exportText();
  await open(p, store({ oils:[] }));
  after = await roundTrip(ovCsv);
  eq("Round trip carries a SAP override", after.sapOverrides.coconut, 0.191);
  eq("…so the lye is unchanged", await txt(p, "#lyeVal"), ovLye);

  // an untouched reference recipe must not sprout overrides
  await open(p, store({ oils:[OIL("olive",600), OIL("coconut",400)] }));
  const plain = await exportText();
  await open(p, store({ oils:[] }));
  after = await roundTrip(plain);
  eq("Reference recipe gains no overrides", Object.keys(after.sapOverrides).length, 0);
  eq("Reference oils stay keyed", after.recipes[0].oils.map((o) => o.key).join(","), "olive,coconut");

  // files from other calculators still work: no key column at all, and a sap
  // column in mg KOH/g (the figure SoapCalc prints) rather than our NaOH ratio
  await open(p, store({ oils:[] }));
  after = await roundTrip("Ingredient,Weight,Unit\nCoconut Oil 76 deg,400,g\nOlive Oil,600,g");
  eq("Foreign CSV still name-matches", after.recipes[0].oils.map((o) => o.key).join(","), "coconut,olive");
  await open(p, store({ oils:[] }));
  after = await roundTrip("section,name,amount,unit,sap\noil,Coconut Oil,400,g,250\noil,Olive Oil,600,g,190");
  eq("An mg-KOH/g sap column is ignored, not believed",
     after.recipes[0].oils.map((o) => o.key + ":" + (o.sap || 0)).join(","), "coconut:0,olive:0");
  eq("…and sets no override either", Object.keys(after.sapOverrides).length, 0);

  // an unknown key (a file from a newer version) falls back to matching by name
  await open(p, store({ oils:[] }));
  after = await roundTrip("section,name,amount,unit,key,sap\noil,Olive Oil,600,g,unobtanium,");
  eq("Unknown key falls back to the name matcher", after.recipes[0].oils[0].key, "olive");
  await p.close();
}

/* =======================================================================
   INCI INGREDIENT LABEL
======================================================================= */
{
  const p = await newPage();
  async function label(rec, view) {
    await open(p, store(rec, view));
    await menu(p, "label");
    await p.waitForTimeout(120);
    const box = await p.evaluate(() => { const e = document.querySelector(".inci-box"); return e ? e.textContent : null; });
    const warn = await p.evaluate(() => { const e = document.querySelector(".inci-warn"); return e ? e.textContent : null; });
    await p.evaluate(() => { const bk = document.querySelector(".modal-back"); if (bk) bk.remove(); document.body.style.overflow = ""; });
    return { box, warn };
  }
  const classic = (await label({ oils:[OIL("olive",400),OIL("coconut",300),OIL("palm",250),OIL("shea",20),OIL("castor",30)] })).box;
  has("Label saponifies olive", classic, "Sodium Olivate");
  has("Label saponifies castor", classic, "Sodium Castorate");
  has("Label lists water", classic, "Aqua (Water)");
  has("Label lists natural glycerin", classic, "Glycerin");
  ok("Label orders by weight (olive before coconut)", classic.indexOf("Sodium Olivate") < classic.indexOf("Sodium Cocoate"));

  const koh = (await label({ oils:[OIL("coconut",700),OIL("olive",300)], lyeType:"koh" })).box;
  has("KOH label uses Potassium", koh, "Potassium Cocoate");
  ok("KOH label has no Sodium salts", !koh.includes("Sodium "));

  const custom = await label({ oils:[OIL("olive",500), { name:"Mystery butter", key:null, g:200 }] });
  has("Custom oil flagged in label", custom.box, "Mystery butter (verify INCI)");
  has("Custom oil raises a warning", custom.warn, "Mystery butter");

  const fo = (await label({ oils:[OIL("olive",1000)], aromas:[{name:"Vanilla FO",key:"vanilla",g:30}] })).box;
  has("Fragrance oil labelled Parfum", fo, "Fragrance (Parfum)");
  const eo = (await label({ oils:[OIL("olive",1000)], aromas:[{name:"Lavender EO",key:"lavender",g:20}] })).box;
  has("Essential oil labelled by name", eo, "Lavender Essential Oil");
  await p.close();
}

/* =======================================================================
   PASTE A RECIPE (import from other calculators)
======================================================================= */
{
  const p = await newPage();
  // paste text, return what the review screen shows, optionally committing it
  async function paste(text, { total = null, commit = false } = {}) {
    await menu(p, "paste");
    await p.evaluate((t) => {
      const ta = document.querySelector(".paste-in");
      ta.value = t; ta.dispatchEvent(new Event("input"));
    }, text);
    await p.waitForTimeout(120);
    const status = await p.$eval("#modalRoot .ocr-status", (e) => e.textContent);
    const pctAsked = await p.evaluate(() => !document.querySelector("#modalRoot .scale-row").hidden);
    if (total != null) await p.fill("#pasteTotal", String(total));
    await p.click("#modalRoot .mfoot .primary");
    await p.waitForTimeout(180);
    const rows = await p.$$eval("#modalRoot .prow", (rs) => rs.map((r) => {
      const i = r.querySelectorAll("input"), s = r.querySelectorAll("select");
      return { name: i[0].value, amount: parseFloat(i[1].value), unit: s[0].value, section: s[1].value };
    }));
    const note = await p.$eval("#modalRoot .sub", (e) => e.textContent);
    if (commit) { await p.click("#modalRoot .mfoot .primary"); await p.waitForTimeout(250); }
    else await p.evaluate(() => { const b = document.querySelector("#modalRoot .modal-back"); if (b) b.remove(); document.body.style.overflow = ""; });
    return { status, rows, note, pctAsked };
  }

  // --- SoapCalc's print view: a %/lb/oz/g table, and settings lines ---
  await open(p, store({ oils:[] }));
  const soapcalc = await paste(
`Oil/Fat                    %      Pounds   Ounces   Grams
Coconut Oil, 76 deg       30      0.600     9.60    272.16
Olive Oil                 40      0.800    12.80    362.87
Palm Kernel Flakes        25      0.500     8.00    226.80
Castor Oil                 5      0.100     1.60     45.36
Water as % of Oils        38%
Super Fat                  5%
Lye Concentration       27.5%`, { commit: true });
  eq("SoapCalc: four oils read", soapcalc.rows.length, 4);
  eq("SoapCalc: grams column preferred over oz/lb/%", soapcalc.rows[0].amount, 272.16);
  eq("SoapCalc: a number inside the name doesn't become the amount",
    soapcalc.rows[0].name, "Coconut Oil, 76 deg");
  eq("SoapCalc: units read as grams", soapcalc.rows.map((r) => r.unit).join(","), "g,g,g,g");
  eq("SoapCalc: everything classed as oil", soapcalc.rows.map((r) => r.section).join(","), "oil,oil,oil,oil");
  has("SoapCalc: superfat applied", soapcalc.note, "superfat 5%");
  has("SoapCalc: water setting applied", soapcalc.note, "water 38% of oils");

  let r = (await LS(p)).recipes[0];
  eq("Committed oils land in the recipe", r.oils.length, 4);
  eq("Names normalised to ours", r.oils.map((o) => o.name).join(","),
    "Coconut oil (76°),Olive oil,Palm kernel oil,Castor oil");
  eq("Every oil matched a known key", r.oils.filter((o) => !o.key).length, 0);
  eq("Palm *kernel* beats plain palm", r.oils[2].key, "palmkernel");
  eq("Superfat came across", r.superfat, 5);
  eq("Water mode came across", r.waterMode, "conc");
  eq("Lye concentration came across", r.lyeConc, 27.5);
  near("Total oils as pasted", r.oils.reduce((a, o) => a + o.g, 0), 907.19, 0.05);

  // --- Bramble Berry style: one unit per line, plus lye and water lines ---
  await open(p, store({ oils:[] }));
  const bb = await paste(
`Olive Oil 12 oz
Coconut Oil 9 oz
Palm Oil 7.5 oz
Castor Oil 1.5 oz
Sodium Hydroxide 4.3 oz
Water 9.9 oz
Superfat: 5%`, { commit: true });
  eq("Bramble Berry: four oils (lye and water excluded)", bb.rows.length, 4);
  eq("Bramble Berry: ounces kept as ounces", bb.rows[0].unit, "oz");
  eq("Bramble Berry: amount read", bb.rows[0].amount, 12);
  ok("Lye is never added as an ingredient", !bb.rows.some((x) => /hydroxide/i.test(x.name)));
  ok("Water is never added as an ingredient", !bb.rows.some((x) => /water/i.test(x.name)));
  has("Lye type applied instead", bb.note, "NaOH");
  r = (await LS(p)).recipes[0];
  eq("Ounces converted on commit", Math.round(r.oils[0].g * 100) / 100, 340.19);
  eq("Lye type set from the paste", r.lyeType, "naoh");

  // --- a percentage-only recipe needs a batch size ---
  await open(p, store({ oils:[] }));
  const pct = await paste(
`Olive 40%
Coconut 30%
Palm 25%
Castor 5%
Super fat 8%`, { total: 1000, commit: true });
  ok("Percent paste asks for a total", pct.pctAsked);
  eq("Percentages scaled to the requested total",
    pct.rows.map((x) => x.amount).join(","), "400,300,250,50");
  eq("Scaled rows are weights now", pct.rows[0].unit, "g");
  r = (await LS(p)).recipes[0];
  near("Total oils matches the batch size asked for", r.oils.reduce((a, o) => a + o.g, 0), 1000, 0.5);
  eq("Superfat from a percent paste", r.superfat, 8);

  // --- KOH, a scent, and a water:lye ratio ---
  await open(p, store({ oils:[] }));
  const koh = await paste(
`Ingredient           Grams    Percent
Olive Oil            362.9    40
Coconut Oil          272.2    30
Lavender Essential Oil 30
Potassium Hydroxide 155.2
Water:Lye Ratio 2.5`, { commit: true });
  ok("Essential oil classed as a scent", koh.rows.some((x) => x.section === "scent"));
  ok("Coconut oil is an oil, not the additive 'coconut milk'",
    koh.rows.find((x) => /coconut/i.test(x.name)).section === "oil");
  has("KOH detected", koh.note, "KOH");
  has("Water:lye ratio applied", koh.note, "water:lye 2.5:1");
  r = (await LS(p)).recipes[0];
  eq("Scent landed in the scent list", r.aromas.length, 1);
  eq("Scent matched a known key", r.aromas[0].key, "lavender");
  eq("Lye type is KOH", r.lyeType, "koh");
  eq("Water mode is ratio", r.waterMode, "ratio");
  eq("Ratio value stored", r.waterRatio, 2.5);

  // --- rubbish in, nothing out ---
  await open(p, store({ oils:[] }));
  await menu(p, "paste");
  await p.evaluate(() => {
    const ta = document.querySelector(".paste-in");
    ta.value = "just some prose with no numbers at all"; ta.dispatchEvent(new Event("input"));
  });
  await p.waitForTimeout(120);
  has("Unparseable text says so", await p.$eval("#modalRoot .ocr-status", (e) => e.textContent), "Nothing recognised");
  await p.click("#modalRoot .mfoot .primary"); await p.waitForTimeout(150);
  ok("…and doesn't open the review screen", (await p.$$("#modalRoot .prow")).length === 0);
  eq("…and adds nothing", (await LS(p)).recipes[0].oils.length, 0);
  await p.evaluate(() => { const b = document.querySelector("#modalRoot .modal-back"); if (b) b.remove(); document.body.style.overflow = ""; });

  // --- a wild setting can't get past the schema's own clamps ---
  await open(p, store({ oils:[] }));
  await paste("Olive Oil 500 g\nSuper Fat 90%\nWater as % of Oils 5%", { commit: true });
  r = (await LS(p)).recipes[0];
  eq("Absurd superfat clamped to the schema max", r.superfat, 15);
  eq("Absurd water % clamped to the schema min", r.waterPct, 25);
  await p.close();
}

/* =======================================================================
   BATCH NOTES + BAR WRAPPER
======================================================================= */
{
  const p = await newPage();
  // notes persist per recipe
  await open(p, store({ id:"r1", name:"Note Bar", oils:[OIL("olive",500)] }, { tab:"make" }));
  await p.fill("#notesField", "Traced fast, great lather at week 4.");
  await p.waitForTimeout(120);
  await p.reload(); await p.waitForTimeout(200);
  eq("Batch notes persist", (await LS(p)).recipes[0].notes, "Traced fast, great lather at week 4.");
  eq("Notes shown back in the field", await p.evaluate(() => document.getElementById("notesField").value), "Traced fast, great lather at week 4.");

  // private notes are NOT in a share link
  await menu(p, "share");
  await p.waitForTimeout(100);
  const url = await p.evaluate(() => document.querySelector(".share-url").value);
  const payload = await p.evaluate((u) => { let s = u.split("#r=")[1].replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return decodeURIComponent(escape(atob(s))); }, url);
  ok("Share link omits private notes", !payload.includes("Traced fast"));
  /* The payload is built by exclusion, so this check is derived the same way: every
     RECIPE_FIELDS entry must either be named in SHARE_SKIP or actually travel. Listing
     the field names here by hand would repeat the very mistake the deny-list fixed —
     a new field would appear in neither list and nothing would assert anything. */
  const shared = JSON.parse(payload);
  // SHARE_SKIP is derived from the schema's `personal` flags now, so the check reads
  // the same source of truth the code does instead of parsing a literal out of source
  const skip = new Set(RECIPE_FIELDS.filter((f) => f.personal).map((f) => f.k));
  ok("The schema marks personal fields", skip.size >= 6, [...skip].join(","));
  RECIPE_FIELDS.forEach((f) => skip.has(f.k)
    ? ok(`Share link omits ${f.k}`, !(f.k in shared))
    : ok(`Share link carries ${f.k}`, f.k in shared));
  await p.evaluate(() => { const bk = document.querySelector(".modal-back"); if (bk) bk.remove(); document.body.style.overflow = ""; });

  // bar wrapper content
  await open(p, store({ name:"Lavender Bar", oils:[OIL("olive",400),OIL("coconut",300),OIL("palm",300)],
    aromas:[{name:"Lavender EO",key:"lavender",g:20}], madeOn:"2026-07-01", cureWeeks:4 }, { barWeight:100 }));
  await menu(p, "wrapper");
  await p.waitForTimeout(100);
  const w = await p.evaluate(() => document.querySelector(".wrapper-card").textContent);
  has("Wrapper shows the name", w, "Lavender Bar");
  has("Wrapper shows net weight", w, "Net wt.");
  // net weight is the *cured* bar, so it comes in under the 100 g wet bar size
  const netG = parseInt(w.match(/Net wt\. [\d.]+ oz \((\d+) g\)/)[1], 10);
  ok("Net weight is the cured estimate, under the wet bar size", netG > 60 && netG < 100, `got ${netG} g`);
  has("Wrapper lists saponified oils", w, "Sodium Olivate");
  has("Wrapper shows cure dates", w, "Best after");
  has("Wrapper has a caution", w, "For external use only");
  await p.close();
}

/* =======================================================================
   SHARE BY LINK (recipe rides in the URL)
======================================================================= */
{
  const p = await newPage();
  await open(p, store({ id:"r1", name:"Lavender Dream",
    oils:[OIL("olive",400),OIL("coconut",300),{name:"Mystery oil",key:null,g:50}],
    additives:[{name:"Honey",key:"honey",g:10}], aromas:[{name:"Lavender EO",key:"lavender",g:20}],
    lyeType:"koh", superfat:8, waterMode:"conc", lyeConc:35, kohPurity:92, cureWeeks:9, checklist:{s0:true}, use:"hair" }));
  await menu(p, "share");
  await p.waitForTimeout(120);
  const url = await p.evaluate(() => document.querySelector(".share-url").value);
  ok("Share URL carries the recipe in #r=", /#r=[A-Za-z0-9_-]+$/.test(url));

  // open the link in a fresh context (no prior storage)
  const ctx = await browser.newContext();
  const rp = await ctx.newPage();
  rp.on("pageerror", (e) => pageErrors.push("PE(share): " + e.message));
  await rp.goto(url);
  await rp.waitForTimeout(400);
  const imp = await rp.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("soapcalc.v4"));
    const r = s.recipes.find((x) => x.name === "Lavender Dream");
    return { count: s.recipes.length, current: s.recipes.find((x) => x.id === s.currentId).name,
      lyeType: r.lyeType, superfat: r.superfat, waterMode: r.waterMode, lyeConc: r.lyeConc, use: r.use, cureWeeks: r.cureWeeks,
      oils: r.oils.length, customName: (r.oils.find((o) => o.key === null) || {}).name,
      checklist: JSON.stringify(r.checklist), freshId: r.id !== "r1" };
  });
  eq("Shared recipe imported (fresh recipient = 1 recipe)", imp.count, 1);
  eq("Import becomes current", imp.current, "Lavender Dream");
  eq("Import preserves lyeType", imp.lyeType, "koh");
  eq("Import preserves superfat", imp.superfat, 8);
  eq("Import preserves waterMode", imp.waterMode, "conc");
  eq("Import preserves use", imp.use, "hair");
  eq("Import preserves cureWeeks", imp.cureWeeks, 9);
  eq("Import keeps all oils incl. custom", imp.oils, 3);
  eq("Import preserves custom oil name", imp.customName, "Mystery oil");
  eq("Import gets a fresh checklist (not the sharer's)", imp.checklist, "{}");
  ok("Import gets a fresh id", imp.freshId);
  const hashCleared = await rp.evaluate(() => !location.hash.includes("r="));
  ok("Hash cleared after import", hashCleared);
  await rp.reload(); await rp.waitForTimeout(250);
  const dupes = await rp.evaluate(() => JSON.parse(localStorage.getItem("soapcalc.v4")).recipes.filter((r) => r.name === "Lavender Dream").length);
  eq("Reload does not re-import", dupes, 1);
  await ctx.close();
  await p.close();
}

/* =======================================================================
   SHARE BY LINK — the SAP figures have to travel too

   The link rebuilt the recipe on the recipient's reference numbers: a custom
   oil arrived with no SAP at all and dropped out of the lye maths (114 g became
   76 g), and a supplier SAP set on a keyed oil was silently replaced by ours.
======================================================================= */
{
  const p = await newPage();
  async function shareURL(recOv, viewOv) {
    await open(p, store(recOv, viewOv));
    const lye = await txt(p, "#lyeVal");
    await menu(p, "share");
    await p.waitForTimeout(120);
    return { lye, url: await p.evaluate(() => document.querySelector(".share-url").value) };
  }
  // a hash-only navigation never reloads, so the recipient starts from a blank page
  async function receive(url, seed) {
    const ctx = await browser.newContext();
    const rp = await ctx.newPage();
    rp.on("pageerror", (e) => pageErrors.push("PE(share-sap): " + e.message));
    await rp.goto(base + "/index.html");
    await rp.evaluate((s) => localStorage.setItem("soapcalc.v4", JSON.stringify(s)), store({ oils:[] }, seed || {}));
    await rp.goto("about:blank");
    await rp.goto(url);
    await rp.waitForTimeout(400);
    const out = await rp.evaluate(() => ({
      lye: document.getElementById("lyeVal").textContent,
      oils: JSON.parse(localStorage.getItem("soapcalc.v4")).recipes.slice(-1)[0].oils,
      ov: JSON.parse(localStorage.getItem("soapcalc.v4")).sapOverrides,
      toast: (document.querySelector(".toast") || {}).textContent || ""
    }));
    await ctx.close();
    return out;
  }

  let s = await shareURL({ oils:[OIL("olive",600), { name:"Coconut blend", key:null, g:400, sap:0.10 }] });
  let r = await receive(s.url);
  eq("Shared custom oil keeps its SAP", r.oils[1].sap, 0.1);
  eq("…so the recipient's lye matches the sender's", r.lye, s.lye);
  eq("…and that is not the SAP-less figure", s.lye, "114.38");

  s = await shareURL({ oils:[OIL("olive",600), OIL("coconut",400)] }, { sapOverrides:{ coconut:0.191 } });
  r = await receive(s.url);
  eq("Shared link carries the supplier SAP", r.ov.coconut, 0.191);
  eq("…so the lye matches there too", r.lye, s.lye);
  ok("…and the toast says so", /supplier SAP value/.test(r.toast), r.toast);

  r = await receive(s.url, { sapOverrides:{ coconut:0.170 } });
  eq("A SAP the recipient set themselves wins", r.ov.coconut, 0.17);

  // only the oils in the shared recipe travel — not the sender's whole SAP table
  s = await shareURL({ oils:[OIL("olive",600)] }, { sapOverrides:{ coconut:0.191, palm:0.145 } });
  r = await receive(s.url);
  eq("Unused supplier SAP figures stay home", Object.keys(r.ov).length, 0);

  // a hand-edited link must not be able to write junk into the SAP table
  const junk = await p.evaluate(() => {
    const enc = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
    return location.origin + location.pathname + "#r=" + enc({ name:"Junk", oils:[{name:"Olive oil",key:"olive",g:500}],
      additives:[], aromas:[], sapOv:{ olive:9, notanoil:0.2, coconut:"x" } });
  });
  r = await receive(junk);
  eq("A bad SAP figure in a link is dropped", Object.keys(r.ov).length, 0);
  await p.close();
}

}
