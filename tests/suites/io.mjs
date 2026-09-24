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

  /* A link's SAP figures fill gaps in the recipient's app-wide table, so they reach every
     recipe the recipient already has — and a QR on a gifted bar now makes those links
     travel to people who never asked for them. So they meet the Safety Check's own bar
     at the door: a figure that isn't a fat, or isn't this oil, stays out. */
  const mixed = await p.evaluate(() => {
    const enc = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
    return location.origin + location.pathname + "#r=" + enc({ name:"Mixed", additives:[], aromas:[],
      oils:[{name:"Olive oil",key:"olive",g:400},{name:"Coconut oil",key:"coconut",g:300},{name:"Castor oil",key:"castor",g:100},{name:"Shea butter",key:"shea",g:200}],
      sapOv:{ olive:0.188, coconut:0.180, castor:0.5, shea:0.105 } });
  });
  r = await receive(mixed);
  eq("A link can't install the KOH slip (40% high) into your table", r.ov.olive, undefined);
  eq("…nor a figure that isn't a fat", r.ov.castor, undefined);
  eq("…nor one far below the oil", r.ov.shea, undefined);
  eq("…but an ordinary supplier figure still comes across", r.ov.coconut, 0.18);
  ok("…and the toast counts only what was kept", /kept 1 supplier SAP value(?!s)/.test(r.toast), r.toast);
  await p.close();
}

/* =======================================================================
   THE PRINTED CARD — the sheet someone weighs lye from

   The card leaves the app, and it had drifted from the panel in three ways:
   a dual-lye recipe printed one combined weight you can't weigh out (all of it
   as NaOH is ~22% too much lye), a milk soap printed the total liquid as "Water"
   beside the milk that replaces it, and a hot-process reserve too small for the
   superfat printed the superfat asked for rather than the one the bar gets.
======================================================================= */
{
  const p = await newPage();
  const card = async (rec, view) => {
    await open(p, store(rec, view));
    await menu(p, "card"); await p.waitForTimeout(200);
    const out = await p.evaluate(async () => {
      const st = await import("/src/core/state.js"), o = await import("/src/features/output.js");
      const r = st.libById(st.currentId), s = st.statsFor(r);
      s.unsafe = []; const L = st.computeLye();
      return { card: document.querySelector(".print-card").innerText,
               text: o.cardText(r, s, "g", "g"), naoh: L.naohG, koh: L.kohG, lye: L.lyeG,
               waterAdd: L.waterAddG, waterTot: L.waterG };
    });
    await p.evaluate(() => document.querySelectorAll(".modal-back").forEach((m) => m.remove()));
    return out;
  };
  const f2 = (n) => n.toFixed(2);

  // --- dual lye: two weighable lines, and nowhere a combined figure ---
  let c = await card({ oils:[OIL("olive",600), OIL("coconut",400)], lyeType:"dual", dualKoh:40, kohPurity:90 });
  has("Dual lye: the card gives the NaOH on its own", c.card, "NaOH — " + f2(c.naoh) + " g");
  has("…and the KOH on its own", c.card, "KOH — " + f2(c.koh) + " g");
  has("…sized for the purity set", c.card, "sized for 90% pure KOH");
  ok("…and never a combined weight nobody can weigh out", !/NaOH \+ KOH/.test(c.card) && !c.card.includes(f2(c.lye)), c.card);
  has("The copied text splits it too", c.text, "NaOH: " + f2(c.naoh) + " g");
  has("…both of them", c.text, "KOH: " + f2(c.koh) + " g");
  near("…and the two add up to the lye the panel sizes", c.naoh + c.koh, c.lye, 0.005);

  // --- all-KOH: one line, with the purity it assumes ---
  c = await card({ oils:[OIL("olive",600), OIL("coconut",400)], lyeType:"koh", kohPurity:90 });
  has("Liquid soap: the KOH line says what purity it assumes", c.card, "KOH (lye) — " + f2(c.koh) + " g");
  has("…in so many words", c.card, "sized for 90% pure KOH");

  // --- a plain bar is unchanged in substance ---
  c = await card({ oils:[OIL("olive",700), OIL("coconut",300)] });
  has("Plain bar: NaOH line as before", c.card, "NaOH (lye) — " + f2(c.naoh) + " g");
  has("…and its water is simply the water", c.card, "Water — 380 g");
  ok("…with no liquid note it doesn't need", !/rest of the liquid/.test(c.card), c.card);

  // --- milk soap: the water you pour, not the liquid the milk already is ---
  c = await card({ oils:[OIL("olive",700), OIL("coconut",300)], additives:[{ name:"Goat milk", key:"goatmilk", g:380 }] });
  eq("Milk soap: nothing to pour from the tap", c.waterAdd, 0);
  has("…so the card says 0 g of water", c.card, "Water — 0 g");
  has("…and that the milk is the liquid", c.card, "the goat milk above is the rest of the liquid — 380 g in all");
  ok("…not 380 g of water on top of 380 g of milk", !/Water — 380 g/.test(c.card), c.card);
  c = await card({ oils:[OIL("olive",700), OIL("coconut",300)], additives:[{ name:"Goat milk", key:"goatmilk", g:150 }] });
  has("Part-milk soap: pour only the balance", c.card, "Water — 230 g");
  has("…with the total spelled out", c.card, "380 g in all");

  // --- hot process, reserve capped by how much of the oil there is ---
  c = await card({ oils:[OIL("olive",950), OIL("shea",10), OIL("coconut",40)], method:"hp", sfMode:"after", sfOil:"shea", superfat:6 });
  has("HP capped reserve: the card gives the superfat the bar really gets", c.card, "Superfat — 1%");
  has("…and says why it isn't the one asked for", c.card, "not the 6% asked for");
  has("…and says what to hold back", c.card, "Hold back — 10 g");
  has("…and when it goes in", c.card, "stir it in after the cook");
  c = await card({ oils:[OIL("olive",700), OIL("coconut",300)], method:"hp", sfMode:"after", sfOil:"olive", superfat:5 });
  has("HP with enough to hold back: the superfat asked for", c.card, "Superfat — 5%");
  ok("…with no apology", !/asked for/.test(c.card), c.card);

  // --- a recipe the Safety Check fails says so on the card ---
  await open(p, store({ oils:[OIL("olive",1000)] }, { sapOverrides:{ olive:0.188 } }));
  await menu(p, "card"); await p.waitForTimeout(200);
  let banner = await p.evaluate(() => (document.querySelector(".print-card .pc-unsafe") || {}).textContent || "");
  has("An unsafe recipe's card is marked unsafe", banner, "Not safe to make as-is");
  has("…naming what fails", banner, "A supplier SAP is too high for its oil");
  eq("…and the mark survives printing", await p.evaluate(() => {
    const b = document.querySelector(".print-card .pc-unsafe"); return !!b && !b.closest(".no-print"); }), true);
  const copied = await p.evaluate(async () => {
    const st = await import("/src/core/state.js"), o = await import("/src/features/output.js"), rn = await import("/src/ui/render.js");
    const r = st.libById(st.currentId), s = st.statsFor(r);
    s.unsafe = rn.safetyChecks().items.filter((i) => i.level === "fail").map((i) => i.title);
    return o.cardText(r, s, "g", "g");
  });
  has("…and so does the copied text", copied, "NOT SAFE TO MAKE AS-IS");
  await p.evaluate(() => document.querySelectorAll(".modal-back").forEach((m) => m.remove()));
  await open(p, store({ oils:[OIL("olive",700), OIL("coconut",300)] }));
  await menu(p, "card"); await p.waitForTimeout(200);
  eq("A safe recipe's card carries no such mark", await p.evaluate(() => !!document.querySelector(".print-card .pc-unsafe")), false);
  await p.close();
}

/* =======================================================================
   IMPORT MATCHING — an oil's name decides its lye

   A pasted or imported name that shared one generic word with an oil became that
   oil: "Peach Kernel Oil" was palm kernel, ~28% more lye on its share. And the
   review screen only ever showed the name you typed, so the swap was invisible
   until it was in the recipe.
======================================================================= */
{
  const p = await newPage();
  await open(p, store({ oils:[OIL("olive",500)] }));
  const m = await p.evaluate(async () => {
    const io = await import("/src/features/io.js"); const { OILS } = await import("/src/data/oils.js");
    const k = (n) => io.bestIn(OILS, n).key;
    return { peach:k("Peach Kernel Oil"), plum:k("Plum Kernel Oil"), ucuuba:k("Ucuuba Butter"),
      cupuacu:k("Cupuacu Butter"), cupuacuAcc:k("Cupuaçu Butter"), apricot:k("Apricot Kernel Oil"),
      pk:k("Palm Kernel Flakes"), palm:k("Palm Oil"), mango:k("Mango Seed Butter"), shea:k("Shea Butter"),
      canolaHO:k("Canola Oil, high oleic"), saffHO:k("Safflower Oil, high oleic"), deer:k("Deer Tallow"),
      coco:k("Coconut Oil, 76 deg"), mct:k("Coconut Oil, fractionated"), soywax:k("Soy wax") };
  });
  eq("An unknown kernel oil is not palm kernel", m.peach, null);
  eq("…nor any other kernel oil", m.plum, null);
  eq("An unknown butter is not shea", m.ucuuba, null);
  eq("An accent-free spelling still finds cupuaçu", m.cupuacu, "cupuacu");
  eq("…as does the accented one", m.cupuacuAcc, "cupuacu");
  // what must still match, so the tightening didn't cost the common names
  eq("Apricot kernel still matches", m.apricot, "apricot");
  eq("Palm kernel flakes still match", m.pk, "palmkernel");
  eq("Palm oil is still palm", m.palm, "palm");
  eq("Mango seed butter is still mango", m.mango, "mango");
  eq("Shea butter is still shea", m.shea, "shea");
  eq("High-oleic canola is canola, not high-oleic sunflower", m.canolaHO, "canola");
  eq("High-oleic safflower still finds its own entry", m.saffHO, "safflowerho");
  eq("Deer tallow still reads as tallow", m.deer, "tallow");
  eq("Coconut 76 is coconut", m.coco, "coconut");
  eq("Fractionated coconut is MCT", m.mct, "mct");
  eq("Soy wax still matches", m.soywax, "soywax");

  // --- the review screen says what each row becomes ---
  await p.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(["name,amount,unit\nPeach Kernel Oil,200,g\nShea Butter,300,g\nCitric acid,10,g"], "r.csv", { type: "text/csv" }));
    const inp = document.getElementById("csvInput"); inp.files = dt.files;
    inp.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await p.waitForTimeout(250);
  const notes = await p.$$eval(".modal .prow .imp-match", (ns) => ns.map((n) => n.textContent));
  has("The review names an unknown oil as custom, out of the lye maths", notes[0], "custom, and left out of the lye maths");
  eq("…names the oil a known one becomes", notes[1], "→ Shea butter");
  eq("…and the additive, too", notes[2], "→ Citric acid");
  // retyping the name re-matches on the spot
  await p.fill(".modal .prow input >> nth=0", "Apricot Kernel Oil");
  eq("Retyping a name updates what it becomes", await p.$eval(".modal .prow .imp-match", (n) => n.textContent), "→ Apricot kernel oil");
  await p.evaluate(() => document.querySelectorAll(".modal-back").forEach((m) => m.remove()));

  /* --- a file SAP far from the matched oil: take whichever figure can't burn ---
     Lower than ours: the name probably led to the wrong oil, so the file's figure
     comes in as a custom oil. Higher than ours: probably the KOH slip, so ours stays
     and nothing is installed into the app-wide table. */
  const imp = async (csv) => {
    await open(p, store({ oils:[] }));
    await p.evaluate((t) => {
      const dt = new DataTransfer(); dt.items.add(new File([t], "r.csv", { type: "text/csv" }));
      const inp = document.getElementById("csvInput"); inp.files = dt.files;
      inp.dispatchEvent(new Event("change", { bubbles: true }));
    }, csv);
    await p.waitForTimeout(250);
    const note = await p.$$eval(".modal .prow", (rs) => rs.map((r) => r.innerText).join(" | "));
    await p.click(".modal .mfoot .primary"); await p.waitForTimeout(200);
    const saved = await LS(p);
    return { note, oils: saved.recipes.find((r) => r.id === saved.currentId).oils, ov: saved.sapOverrides || {} };
  };
  let r = await imp("name,amount,unit,sap\nPalm Kernel Oil,300,g,0.137");
  eq("File SAP far BELOW the matched oil: it comes in as a custom oil", r.oils[0].key, null);
  eq("…on the file's own, lower figure", r.oils[0].sap, 0.137);
  has("…and the review says so before you commit", r.note, "comes in as a custom oil on the lower figure");
  r = await imp("name,amount,unit,sap\nOlive Oil,500,g,0.188");
  eq("File SAP far ABOVE the matched oil (the KOH slip): our oil is kept", r.oils[0].key, "olive");
  eq("…and the high figure is not installed app-wide", r.ov.olive, undefined);
  has("…and the review says ours is used", r.note, "ours (0.134) is used, the lower of the two");
  r = await imp("name,amount,unit,sap\nOlive Oil,500,g,0.138");
  eq("A normal supplier difference still carries over, as it always did", r.ov.olive, 0.138);
  r = await imp("name,amount,unit,key,sap\nOlive oil,500,g,olive,0.110");
  eq("Our own export's key is trusted even when its figure isn't", r.oils[0].key, "olive");
  eq("…and the figure isn't installed", r.ov.olive, undefined);
  await p.close();
}

/* =======================================================================
   ALLERGIES — for the person you give the bar to

   The wrapper, label and card name the recognised allergen groups a recipe contains,
   in the vocabulary's order. They never claim "allergen-free", and a custom ingredient
   is named as unchecked rather than silently passed.
======================================================================= */
{
  const { ALLERGENS, ADDITIVES } = await import("../../src/data/ingredients.js");
  const known = new Set(ALLERGENS.map((a) => a[0]));
  const flagged = (db) => Object.keys(db).filter((k) => db[k].allergen).sort().join(",");
  eq("The oils flagged are exactly the intended ones", flagged(t.OILS),
     "almond,argan,lanolin,macadamia,mustard,peanut,sesame,soybean,soywax,vegoil,walnut,wheatgerm");
  eq("…and the additives", flagged(ADDITIVES), "beer,goatmilk,goatmilkpwd,oatmeal");
  ok("Every flag is a group the vocabulary knows",
     [...Object.values(t.OILS), ...Object.values(ADDITIVES)].every((d) => !d.allergen || known.has(d.allergen)));
  ok("Coconut and shea are deliberately not flagged", !t.OILS.coconut.allergen && !t.OILS.shea.allergen);

  const p = await newPage();
  const A = (name, key, g) => ({ name, key, g });
  const rec = { name:"Almond Milk Bar",
    oils:[OIL("olive",500), OIL("almond",150), OIL("coconut",250), OIL("peanut",0), { name:"Mystery butter", key:null, g:100 }],
    additives:[A("Goat milk","goatmilk",200), A("Colloidal oatmeal","oatmeal",15)],
    aromas:[A("Cinnamon leaf EO","cinnamon",5), A("Lavender EO","lavender",10)] };
  await open(p, store(rec));
  await menu(p, "wrapper"); await p.waitForTimeout(200);
  const w = await p.evaluate(() => ({
    lines: [...document.querySelectorAll(".wrapper-card .wrap-allergy")].map((e) => e.textContent),
    printable: [...document.querySelectorAll(".wrap-allergy")].every((e) => !e.closest(".no-print")),
    unchecked: [...document.querySelectorAll(".inci-warn")].map((e) => ({ t:e.textContent, np:e.classList.contains("no-print") })).find((x) => /Not checked/.test(x.t)) }));
  eq("Wrapper: the allergens, in order, with what carries them", w.lines[0],
     "Contains: tree nuts (sweet almond oil); gluten grains (colloidal oatmeal); milk (goat milk).");
  eq("…and the scents that can irritate, on their own line", w.lines[1], "May irritate sensitive skin: Cinnamon leaf EO.");
  ok("…not peanuts: there's 0 g of it", !w.lines[0].includes("peanut"), w.lines[0]);
  eq("…and both lines print", w.printable, true);
  has("A custom ingredient is named as unchecked", w.unchecked && w.unchecked.t, "Not checked for allergens: Mystery butter");
  eq("…on screen only, not on the gift", w.unchecked && w.unchecked.np, true);
  const wt = await p.evaluate(async () => { const o = await import("/src/features/output.js"), s = await import("/src/core/state.js");
    const r = s.libById(s.currentId); return o.wrapperText(r, o.inciLabel(), "1", "1", null); });
  has("The copied wrapper text carries it", wt, "Contains: tree nuts (sweet almond oil)");
  has("…and the sensitive-skin line", wt, "May irritate sensitive skin: Cinnamon leaf EO.");
  await p.evaluate(() => document.querySelectorAll(".modal-back").forEach((m) => m.remove()));

  await menu(p, "label"); await p.waitForTimeout(200);
  has("Label: the same line, in the label box", await p.$eval(".inci-box", (b) => b.textContent), "Contains: tree nuts (sweet almond oil)");
  await p.evaluate(() => document.querySelectorAll(".modal-back").forEach((m) => m.remove()));

  await menu(p, "card"); await p.waitForTimeout(200);
  has("Card: the maker sees it too", await p.$eval(".print-card", (b) => b.textContent), "Contains: tree nuts (sweet almond oil)");
  await p.evaluate(() => document.querySelectorAll(".modal-back").forEach((m) => m.remove()));

  // a bar with nothing flagged says nothing — least of all "allergen-free"
  await open(p, store({ oils:[OIL("olive",700), OIL("coconut",300)] }));
  await menu(p, "wrapper"); await p.waitForTimeout(200);
  const plain = await p.evaluate(() => document.querySelector(".modal").innerText);
  ok("A plain bar gets no Contains line", !/Contains:/.test(plain), plain);
  ok("…and the app never claims allergen-free", !/allergen[- ]free/i.test(plain), plain);
  ok("…nor warns about unchecked ingredients it doesn't have", !/Not checked/.test(plain));
  await p.close();
}

}
