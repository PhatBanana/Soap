/* Lye, water, dilution and the quality scores — the numbers a batch depends on.

   Part of the suite; run by tests/run.mjs, which owns the server, the browser and
   the assertion counts. Everything shared arrives in `t` — see tests/harness.mjs. */
export default async function chemSuite(t) {
  const { LS, OIL, addOil, browser, eq, has, items, menu, near, newPage, num, ok, open, recipe, store, txt } = t;

/* =======================================================================
   LYE, WATER & QUALITIES
======================================================================= */
{
  const p = await newPage();
  // Classic bar: 400 olive / 300 coconut / 250 palm / 20 shea / 30 castor, superfat 5
  await open(p, store({ oils:[OIL("olive",400),OIL("coconut",300),OIL("palm",250),OIL("shea",20),OIL("castor",30)] }));
  near("NaOH lye (classic bar)", await num(p, "#lyeVal"), 141.23, 0.1);
  near("Water 38% of oils", await num(p, "#waterOut"), 380, 0.5);
  const bars = await p.$$eval("#bars .qbar b", (bs) => bs.map((b) => b.textContent).join(","));
  // Hardness, cleansing and bubbly each rose 4 when caprylic and capric acid got slots in
  // the schema: this recipe is 30% coconut, and coconut carries ~13% of them. Conditioning
  // and creamy are untouched, which is the check that the change landed where it should.
  eq("Quality bars H,Cl,Co,Bu,Cr", bars, "48,24,52,27,26");

  // KOH switches the lye kind and scales by the KOH factor
  await open(p, store({ oils:[OIL("coconut",1000)], lyeType:"koh", kohPurity:90 }));
  has("KOH lye label", await txt(p, "#lyeK"), "KOH");
  near("KOH lye (1000 coconut, sf5, 90% purity)", await num(p, "#lyeVal"), 1000*0.178*0.95*1.40274/0.90, 0.5);

  // Lye-concentration water mode: water is derived from the lye
  await open(p, store({ oils:[OIL("coconut",1000)], waterMode:"conc", lyeConc:33 }));
  const lye = await num(p, "#lyeVal");
  near("Water from 33% lye concentration", await num(p, "#waterOut"), lye * (1 - 0.33) / 0.33, 0.5);
  await p.close();
}

/* =======================================================================
   CURE SUGGESTION (from the oil blend)
======================================================================= */
{
  const p = await newPage();
  await open(p, store({ oils:[OIL("olive",1000)], use:"body" }, { tab:"make" }));
  has("Castile → long cure suggested", await txt(p, "#cureSuggest"), "8–12 weeks");
  await open(p, store({ oils:[OIL("coconut",1000)] }, { tab:"make" }));
  has("Coconut-heavy → short cure suggested", await txt(p, "#cureSuggest"), "3–4 weeks");
  await p.close();
}

/* =======================================================================
   HOT-PROCESS SUPERFAT (lye discount vs oil held back after the cook)
======================================================================= */
{
  const p = await newPage();
  // real display names here, since the hold-back messages quote them back to you
  const oils = [OIL("olive",600), OIL("coconut",300), {name:"Shea butter",key:"shea",g:100}];
  const lye = () => num(p, "#lyeVal");

  await open(p, store({ oils, method:"cp", superfat:5 }));
  ok("Superfat mode is hidden for cold process", await p.evaluate(() => document.getElementById("sfModeCtrl").classList.contains("hide")));
  const cpLye = await lye();

  await open(p, store({ oils, method:"hp", superfat:5, sfMode:"discount" }));
  ok("Superfat mode appears for hot process", await p.evaluate(() => !document.getElementById("sfModeCtrl").classList.contains("hide")));
  near("Discount mode matches cold process", await lye(), cpLye, 0.01);
  has("Discount mode explains you don't pick the fats", await txt(p, "#sfModeNote"), "don't control which fats");

  // holding back proportionally is mathematically the same as a flat discount
  await open(p, store({ oils, method:"hp", superfat:5, sfMode:"after", sfOil:"" }));
  near("Proportional hold-back equals a flat discount", await lye(), cpLye, 0.01);
  has("It tells you how much to hold back", await txt(p, "#sfModeNote"), "Hold back 50 g");

  // holding back one specific oil changes the lye, because its SAP isn't the blend average
  await open(p, store({ oils, method:"hp", superfat:5, sfMode:"after", sfOil:"shea" }));
  const sheaLye = await lye();
  const expected = 600*0.134 + 300*0.178 + 50*0.128;   // full saponification of what's in the pot
  near("Holding back shea sizes lye on the in-pot oils", sheaLye, expected, 0.02);
  ok("…which differs from a flat discount", Math.abs(sheaLye - cpLye) > 0.5, `${sheaLye} vs ${cpLye}`);
  has("It names the oil being held back", await txt(p, "#sfModeNote"), "of Shea butter");

  // and the instruction lands on the step where you'd do it
  await open(p, store({ oils, method:"hp", superfat:5, sfMode:"after", sfOil:"shea" }, { tab:"make" }));
  const step = await p.$$eval("#checklist .txt", (ts) => ts[7].textContent);
  has("HP checklist tells you to stir the reserve in", step, "held-back 50 g of Shea butter");
  has("…after the cook", step, "after the cook");
  await p.close();
}

/* =======================================================================
   WATER:LYE RATIO · CURED WEIGHT · ROUNDING · LOT NUMBER
======================================================================= */
{
  const p = await newPage();
  const oils = [OIL("olive",400),OIL("coconut",300),OIL("palm",300)];

  // water:lye ratio is the third water notation
  await open(p, store({ oils, waterMode:"ratio", waterRatio:2 }));
  ok("Water:lye control shown", await p.evaluate(() => !document.getElementById("waterRatioCtrl").classList.contains("hide")));
  const lye = await num(p, "#lyeVal");
  near("2:1 gives water = 2 × lye", await num(p, "#waterOut"), lye * 2, 0.5);
  has("Info line still shows lye concentration", await txt(p, "#lyeInfo"), "lye conc.");
  await open(p, store({ oils, waterMode:"ratio", waterRatio:3 }));
  near("3:1 gives water = 3 × lye", await num(p, "#waterOut"), (await num(p, "#lyeVal")) * 3, 0.5);

  // cured-weight estimate
  await open(p, store({ oils }));
  const wet = await num(p, "#yieldVal");
  const curedLine = await txt(p, "#yieldCured");
  has("Cured estimate is shown", curedLine, "After curing");
  const cured = parseFloat(curedLine.match(/([\d.]+)/)[1]);
  ok("Cured weight is lighter than wet", cured < wet, `cured ${cured} vs wet ${wet}`);
  ok("Cured weight is a sane fraction of wet", cured > wet * 0.7, `cured ${cured} vs wet ${wet}`);

  // rounding to tidy amounts
  await open(p, store({ oils:[OIL("olive",793.83),OIL("coconut",412.17),OIL("palm",255.4)] }));
  await p.click("#roundBtn");
  await p.waitForTimeout(200);
  const g = await p.evaluate(() => JSON.parse(localStorage.getItem("soapcalc.v4")).recipes[0].oils.map((o) => o.g));
  ok("Rounding gives whole grams", g.every((x) => x === Math.round(x)), JSON.stringify(g));
  eq("Rounding keeps amounts close", g.join(","), "794,412,255");

  // lot number → wrapper
  await open(p, store({ oils, madeOn:"2026-07-25" }, { tab:"make" }));
  await p.click("#lotGen");
  await p.waitForTimeout(150);
  eq("Lot generated from the made-on date", (await LS(p)).recipes[0].lot, "20260725-A");
  await menu(p, "wrapper");
  await p.waitForTimeout(120);
  has("Wrapper prints the lot number", await p.evaluate(() => document.querySelector(".wrapper-card").textContent), "Lot 20260725-A");
  await p.close();
}

/* =======================================================================
   LIQUID SOAP DILUTION (KOH paste → finished soap)
======================================================================= */
{
  const p = await newPage();
  const oils = [OIL("coconut",700),OIL("olive",300)];
  await open(p, store({ oils, lyeType:"naoh" }));
  ok("Dilution card hidden for NaOH bars", await p.evaluate(() => document.getElementById("diluteCard").hidden));

  await open(p, store({ oils, lyeType:"koh", dilution:1 }));
  ok("Dilution card shown for KOH", await p.evaluate(() => !document.getElementById("diluteCard").hidden));
  const paste = await num(p, "#pasteOut"), water = await num(p, "#dilWaterOut"), out = await num(p, "#dilYieldOut");
  near("At 1× the water equals the paste", water, paste, 0.5);
  near("Yield is paste + water", out, paste + water, 0.5);

  await p.evaluate(() => { const s = document.getElementById("dilution"); s.value = "3"; s.dispatchEvent(new Event("input", { bubbles: true })); });
  await p.waitForTimeout(150);
  near("At 3× the water is triple the paste", await num(p, "#dilWaterOut"), paste * 3, 1);
  // slider edits are persisted on a short debounce, so assert the guarantee that
  // actually matters — it survives a reload — rather than the write's timing
  await p.reload(); await p.waitForTimeout(250);
  eq("Dilution ratio persists", (await LS(p)).recipes[0].dilution, 3);
  eq("Dilution ratio shown back", await p.evaluate(() => document.getElementById("dilution").value), "3");
  await p.close();
}

/* =======================================================================
   BRINE FOR SALT BARS (soleseife vs a dry salt bar)
======================================================================= */
{
  const p = await newPage();
  const SALT = (g) => [{ name:"Salt (table/sea)", key:"salt", g }];
  // 1000 g oils at 33% water = 330 g water, so the arithmetic is easy to check
  const salty = (g, mode, extra = {}, view = {}) => store(Object.assign({
    oils:[OIL("coconut",1000)], superfat:15, waterPct:33, additives:SALT(g), saltMode:mode }, extra), view);

  // the control only exists if there's salt to decide about
  await open(p, store({ oils:[OIL("coconut",1000)] }));
  ok("No salt → no salt-mode control", await p.$eval("#saltCtrl", (e) => e.classList.contains("hide")));
  await open(p, salty(80, "trace"));
  ok("Salt present → the control appears", !(await p.$eval("#saltCtrl", (e) => e.classList.contains("hide"))));

  // THE POINT: salt has a solubility ceiling, and a salt bar blows straight through it.
  // 500 g salt in 330 g water = 151.5 g per 100 g, over four times what dissolves.
  await open(p, salty(500, "brine"));
  has("Brine strength is quoted per 100 g of water", await txt(p, "#brineHint"), "151.5 g");
  ok("An impossible brine is a stop, not a shrug", (await items(p)).includes("That salt won't dissolve"));
  has("…and it says how much would fit",
    await p.$$eval("#safetyList .safety-item", (es) => {
      const e = es.find((x) => /won't dissolve/.test(x.textContent)); return e ? e.textContent : ""; }), "83 g");
  ok("…and that this is salt-bar territory", (await items(p)).includes("That's salt-bar amounts, dissolved"));

  // the same recipe made the normal way is fine
  await open(p, salty(500, "trace"));
  has("Dry at trace explains itself", await txt(p, "#brineHint"), "at trace");
  ok("…and raises no dissolving problem", !(await items(p)).includes("That salt won't dissolve"));

  // a realistic soleseife dissolves comfortably: 80 g in 330 g = 24.2
  await open(p, salty(80, "brine", { superfat:5 }));
  has("A real brine is quoted too", await txt(p, "#brineHint"), "24.2 g");
  ok("…and passes", (await items(p)).includes("Brine will dissolve"));
  ok("…without the salt-bar note", !(await items(p)).includes("That's salt-bar amounts, dissolved"));

  // just under the ceiling warns rather than passing silently
  await open(p, salty(100, "brine", { superfat:5 }));       // 30.3 per 100 g
  ok("Near saturation warns", (await items(p)).includes("Close to a saturated brine"));

  // salt neither saponifies nor consumes lye, so the mode must change no chemistry
  await open(p, salty(500, "trace"));
  const lyeTrace = await num(p, "#lyeVal"), waterTrace = await num(p, "#waterOut");
  await open(p, salty(500, "brine"));
  eq("Brine mode does not change the lye", await num(p, "#lyeVal"), lyeTrace);
  eq("…nor the water", await num(p, "#waterOut"), waterTrace);

  // the checklist has to say when the salt goes in
  await open(p, salty(80, "brine", { superfat:5 }, { tab:"make" }));
  const brineSteps = await p.$$eval("#checklist label", (es) => es.map((e) => e.textContent));
  ok("Brine rewrites the lye step", brineSteps.some((s) => /Dissolve 80 g of salt/.test(s)));
  has("…to put the salt in first", brineSteps.find((s) => /Dissolve 80 g/.test(s)), "THEN add the lye");
  await open(p, salty(80, "trace", { superfat:5 }, { tab:"make" }));
  const traceSteps = await p.$$eval("#checklist label", (es) => es.map((e) => e.textContent));
  ok("Dry mode leaves the step alone", !traceSteps.some((s) => /Dissolve .* salt/.test(s)));
  // checklist ticks are keyed by index, so the step count must not move
  eq("Step count is identical either way", brineSteps.length, traceSteps.length);

  // it's a property of the recipe, so it travels
  await open(p, salty(80, "brine", { id:"rB", name:"Brine Share", superfat:5 }));
  await menu(p, "share");
  const url = await p.evaluate(() => document.querySelector(".share-url").value);
  const ctx = await browser.newContext();
  const rp = await ctx.newPage();
  await rp.goto(url); await rp.waitForTimeout(400);
  eq("Shared recipe keeps the salt mode", await rp.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("soapcalc.v4"));
    return (s.recipes.find((x) => x.name === "Brine Share") || {}).saltMode;
  }), "brine");
  await ctx.close();

  // and a junk value can't get in
  await open(p, salty(80, "sideways", { superfat:5 }));
  await addOil(p, "castor", 10);
  eq("An unknown salt mode falls back to trace", (await LS(p)).recipes[0].saltMode, "trace");
  await p.close();
}

/* =======================================================================
   DUAL LYE (NaOH + KOH in one batch)
======================================================================= */
{
  const p = await newPage();
  const KOHF = 1.40274, BASE = 134;
  const splitG = () => p.$$eval("#lyeSplit b", (bs) => bs.map((b) => parseFloat(b.textContent)));

  // the two endpoints must be untouched by the unified expression that replaced
  // the old if/else — these are the regression test for the refactor
  await open(p, store({ oils:[OIL("olive",1000)], superfat:0 }));
  near("Pure NaOH unchanged", await num(p, "#lyeVal"), BASE, 0.05);
  eq("…and shows no split", (await p.$$("#lyeSplit b")).length, 0);
  await open(p, store({ oils:[OIL("olive",1000)], superfat:0, lyeType:"koh", kohPurity:90 }));
  near("Pure KOH unchanged", await num(p, "#lyeVal"), BASE*KOHF/0.9, 0.05);
  eq("…and shows no split either", (await p.$$("#lyeSplit b")).length, 0);

  // a real blend: assert both halves, so a wrong split can't hide inside a right total
  await open(p, store({ oils:[OIL("olive",1000)], superfat:0, lyeType:"dual", dualKoh:50, kohPurity:90 }));
  let [naoh, koh] = await splitG();
  near("Dual 50%: the NaOH half", naoh, BASE*0.5, 0.05);
  near("Dual 50%: the KOH half", koh, BASE*0.5*KOHF/0.9, 0.05);
  near("Dual 50%: total is the sum", await num(p, "#lyeVal"), BASE*0.5 + BASE*0.5*KOHF/0.9, 0.05);
  has("Lye card names both", await txt(p, "#lyeK"), "NaOH + KOH");

  // the share really moves the split
  await open(p, store({ oils:[OIL("olive",1000)], superfat:0, lyeType:"dual", dualKoh:80, kohPurity:90 }));
  [naoh, koh] = await splitG();
  near("An 80% share shifts the NaOH half", naoh, BASE*0.2, 0.05);
  near("…and the KOH half", koh, BASE*0.8*KOHF/0.9, 0.05);

  // purity is a property of the KOH you bought, so it must not touch the NaOH half
  await open(p, store({ oils:[OIL("olive",1000)], superfat:0, lyeType:"dual", dualKoh:50, kohPurity:100 }));
  const [naoh100, koh100] = await splitG();
  near("Purity leaves the NaOH half alone", naoh100, BASE*0.5, 0.05);
  near("…and scales only the KOH half", koh100, BASE*0.5*KOHF, 0.05);

  // the acid adjustment from item 11 rides along and splits the same way
  await open(p, store({ oils:[OIL("olive",1000)], superfat:0, lyeType:"dual", dualKoh:50, kohPurity:90,
    additives:[{ name:"Citric acid", key:"citric", g:10 }] }));
  [naoh, koh] = await splitG();
  near("Acid raises the NaOH half", naoh, (BASE + 10*0.6246)*0.5, 0.05);
  near("…and the KOH half", koh, (BASE + 10*0.6246)*0.5*KOHF/0.9, 0.05);

  // …and is still outside the superfat discount when the lye is split
  await open(p, store({ oils:[OIL("olive",1000)], superfat:5, lyeType:"dual", dualKoh:50, kohPurity:90,
    additives:[{ name:"Citric acid", key:"citric", g:10 }] }));
  [naoh] = await splitG();
  near("Superfat still doesn't discount the acid in a dual recipe",
    naoh, (BASE*0.95 + 10*0.6246)*0.5, 0.05);

  // downstream: a dual batch needs buying and stocking as two chemicals
  await open(p, store({ oils:[OIL("olive",1000)], superfat:0, lyeType:"dual", dualKoh:50 }));
  await menu(p, "shopping");
  await p.waitForTimeout(220);
  const lyeLines = await p.$$eval("#modalRoot .shop-row .sr-name", (es) =>
    es.map((e) => e.textContent).filter((t) => /hydroxide/i.test(t)));
  eq("Shopping list buys both lyes", lyeLines.length, 2);
  await p.evaluate(() => { document.querySelector("#modalRoot .modal-back").remove(); document.body.style.overflow = ""; });

  await open(p, store({ oils:[OIL("olive",1000)], superfat:0, lyeType:"dual", dualKoh:50,
    madeOn:"2026-07-01" }, { tab:"make", stock:{
      "c:sodium hydroxide (naoh)": 500, "c:potassium hydroxide (koh)": 500 } }));
  await p.click("#logBatch"); await p.waitForTimeout(250);
  const stock = (await LS(p)).stock;
  ok("Logging a dual batch draws down NaOH", stock["c:sodium hydroxide (naoh)"] < 500);
  ok("…and KOH", stock["c:potassium hydroxide (koh)"] < 500);

  // a dual-lye soap genuinely contains both salts
  await open(p, store({ oils:[OIL("olive",1000)], superfat:0, lyeType:"dual", dualKoh:50 }));
  await menu(p, "label");
  await p.waitForTimeout(180);
  const inci = await p.evaluate(() => document.querySelector(".inci-box").textContent);
  has("INCI lists the sodium salt", inci, "Sodium Olivate");
  has("…and the potassium salt", inci, "Potassium Olivate");
  await p.evaluate(() => { document.querySelector("#modalRoot .modal-back").remove(); document.body.style.overflow = ""; });

  // the share link must carry the share, or the recipient gets a different soap
  await open(p, store({ id:"rS", name:"Dual Share", oils:[OIL("olive",1000)],
    lyeType:"dual", dualKoh:70 }));
  await menu(p, "share");
  const url = await p.evaluate(() => document.querySelector(".share-url").value);
  const ctx = await browser.newContext();
  const rp = await ctx.newPage();
  await rp.goto(url); await rp.waitForTimeout(400);
  const got = await rp.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("soapcalc.v4"));
    const r = s.recipes.find((x) => x.name === "Dual Share");
    return { lyeType: r.lyeType, dualKoh: r.dualKoh };
  });
  eq("Shared recipe keeps the dual mode", got.lyeType, "dual");
  eq("…and the KOH share", got.dualKoh, 70);
  await ctx.close();

  // the worked examples exist and load as dual
  await open(p, store({ oils:[] }));
  await menu(p, "examples");
  await p.waitForTimeout(200);
  const groups = await p.$$eval("#modalRoot .subhead", (es) => es.map((e) => e.textContent));
  ok("Examples has a dual-lye group", groups.some((g) => /Shaving/.test(g)));
  await p.evaluate(() => {
    [...document.querySelectorAll("#modalRoot .ex-item")].find((b) => /Soft Shaving/.test(b.textContent)).click();
  });
  await p.waitForTimeout(300);
  const ex = await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("soapcalc.v4"));
    return s.recipes.find((r) => r.id === s.currentId);
  });
  eq("Shaving example loads as dual lye", ex.lyeType, "dual");
  eq("…with its KOH share", ex.dualKoh, 60);
  eq("…and the shave use profile", ex.use, "shave");
  ok("…and its oils", ex.oils.length >= 4);
  await p.close();
}

/* =======================================================================
   ACIDS THAT CONSUME LYE (citric acid and the lye-neutral chelators)
======================================================================= */
{
  const p = await newPage();
  const KOHF = 1.40274, BASE = 134, CITRIC = 0.6246;
  const acid = (key, g) => [{ name:key, key, g }];

  await open(p, store({ oils:[OIL("olive",1000)], superfat:0 }));
  near("Baseline lye, no additives", await num(p, "#lyeVal"), BASE, 0.05);

  // citric acid neutralises lye, so the batch needs more of it
  await open(p, store({ oils:[OIL("olive",1000)], superfat:0, additives:acid("citric",10) }));
  near("Citric acid raises the lye", await num(p, "#lyeVal"), BASE + 10*CITRIC, 0.05);

  // THE POINT OF THIS FEATURE: superfat is a discount on the *saponifying* lye.
  // An acid consumes its full stoichiometric amount whatever the superfat, so its
  // term must sit outside the discount. Pinned exactly so it can't drift back in.
  await open(p, store({ oils:[OIL("olive",1000)], superfat:5, additives:acid("citric",10) }));
  near("Superfat does not discount the acid's lye",
    await num(p, "#lyeVal"), BASE*0.95 + 10*CITRIC, 0.05);          // 133.55
  ok("…and it is NOT the discounted-together figure",
    Math.abs(await num(p, "#lyeVal") - (BASE + 10*CITRIC)*0.95) > 0.2);  // not 133.23

  // sitting before the KOH conversion makes that case fall out for free:
  // 0.6246 x 1.40274 = 0.8762 = 3 x 56.11 / 192.12
  await open(p, store({ oils:[OIL("olive",1000)], superfat:0, lyeType:"koh", kohPurity:90,
    additives:acid("citric",10) }));
  near("KOH recipes get the acid adjustment too",
    await num(p, "#lyeVal"), (BASE + 10*CITRIC)*KOHF/0.9, 0.05);

  // the pre-neutralised chelators are exactly that
  for (const k of ["sodiumcitrate","sodiumgluconate"]) {
    await open(p, store({ oils:[OIL("olive",1000)], superfat:0, additives:acid(k,30) }));
    near(`${k} leaves the lye alone`, await num(p, "#lyeVal"), BASE, 0.05);
  }
  await open(p, store({ oils:[OIL("olive",1000)], superfat:0, additives:acid("sodiumlactate",30) }));
  near("Sodium lactate stays lye-neutral", await num(p, "#lyeVal"), BASE, 0.05);

  // an adjustment you can't see is worse than none
  await open(p, store({ oils:[OIL("olive",1000)], superfat:0, additives:acid("citric",10) }));
  has("Lye card names the adjustment", await txt(p, "#lyeInfo"), "for Citric acid");
  has("…with the amount", await txt(p, "#lyeInfo"), "6.25");
  let titles = await items(p);
  ok("Safety Check reports the raise", titles.includes("Lye raised for Citric acid"));
  ok("…and doesn't cry wolf at a normal dose", !titles.includes("That's a lot of acid"));

  await open(p, store({ oils:[OIL("olive",1000)], superfat:0, additives:acid("citric",50) }));
  titles = await items(p);
  ok("5% of oils is flagged as too much acid", titles.includes("That's a lot of acid"));

  // the real failure mode: typed as a custom additive, so the app has no data for it
  await open(p, store({ oils:[OIL("olive",1000)], superfat:0,
    additives:[{ name:"Citric acid", key:null, g:10 }] }));
  near("A custom-typed acid can't adjust the lye", await num(p, "#lyeVal"), BASE, 0.05);
  titles = await items(p);
  ok("…so it's called out as a failure", titles.includes("Acid isn't in the lye math"));
  eq("…at stop-level severity",
    await p.$$eval("#safetyList .safety-item", (es) => {
      const el = es.find((e) => e.querySelector(".si-title").textContent === "Acid isn't in the lye math");
      return el ? el.className.replace("safety-item ", "") : null;
    }), "fail");

  // plumbing: they're ordinary additives everywhere else
  await open(p, store({ oils:[OIL("olive",500)] }));
  const opts = await p.$$eval("#baseSelect optgroup", (gs) => gs.map((g) => ({
    label: g.label, values: Array.from(g.children).map((o) => o.value) })));
  ["citric","sodiumcitrate","sodiumgluconate"].forEach((k) => {
    ok(`${k} is in the additive group`, opts[1].values.includes("add:" + k));
    ok(`${k} is not filed as a colorant`, !opts[2].values.includes("add:" + k));
  });
  await open(p, store({ oils:[OIL("olive",1000)], additives:acid("citric",10) }));
  await menu(p, "label");
  await p.waitForTimeout(150);
  has("Citric acid appears on the INCI label",
    await p.evaluate(() => document.querySelector(".inci-box").textContent), "Citric Acid");
  await p.close();
}

/* =======================================================================
   SUPPLIER SAP VALUES (overrides + custom oils that carry their own)
======================================================================= */
{
  const p = await newPage();
  const KOHF = 1.40274;

  // baseline: 1000 g olive at 0% superfat = 1000 × 0.134
  await open(p, store({ oils:[OIL("olive",1000)], superfat:0 }));
  near("Reference SAP drives the lye", await num(p, "#lyeVal"), 134, 0.05);

  // a supplier's mg KOH/g figure, stored as g NaOH/g
  await open(p, store({ oils:[OIL("olive",1000)], superfat:0 }, { sapOverrides:{ olive: 190/1000/KOHF } }));
  near("Supplier SAP overrides the reference", await num(p, "#lyeVal"), 1000*190/1000/KOHF, 0.05);
  has("Lye card says supplier values are in use", await txt(p, "#lyeInfo"), "supplier SAP value");
  ok("Override raises a safety note",
    (await items(p))
      .includes("Supplier SAP values in use"));

  // an override for an oil that isn't in the recipe changes nothing
  await open(p, store({ oils:[OIL("olive",1000)], superfat:0 }, { sapOverrides:{ coconut: 0.20 } }));
  near("An unrelated override doesn't move the lye", await num(p, "#lyeVal"), 134, 0.05);

  // a custom oil with its own SAP joins the lye maths
  await open(p, store({ oils:[{ name:"Mystery oil", key:null, g:1000, sap:0.14 }], superfat:0 }));
  near("Custom oil with a SAP is in the lye maths", await num(p, "#lyeVal"), 140, 0.05);
  await addOil(p, "castor", 1);                       // force a save through the schema
  let r = (await LS(p)).recipes[0];
  eq("Custom SAP persists", r.oils[0].sap, 0.14);
  const titles = await items(p);
  ok("…and it's no longer reported as excluded", !titles.includes("Custom oils aren't in the lye math"));
  ok("…but it is called out as your own figure", titles.includes("Custom oil using the SAP you entered"));

  // without a SAP the old behaviour stands: excluded from the lye and warned about
  await open(p, store({ oils:[OIL("olive",500), { name:"Mystery oil", key:null, g:500 }], superfat:0 }));
  near("Custom oil with no SAP contributes no lye", await num(p, "#lyeVal"), 500*0.134, 0.05);
  ok("…and is still flagged as excluded",
    (await items(p))
      .includes("Custom oils aren't in the lye math"));

  // nonsense overrides are ignored by the maths and dropped on the next save
  await open(p, store({ oils:[OIL("olive",1000)], superfat:0 },
    { sapOverrides:{ olive:"abc", coconut:-1, palm:0, shea:5, notanoil:0.13 } }));
  near("Bad overrides never reach the lye", await num(p, "#lyeVal"), 134, 0.05);
  await addOil(p, "castor", 1);                       // force a save through the schema
  eq("…and are dropped from storage", JSON.stringify((await LS(p)).sapOverrides), "{}");

  // the modal: type a spec-sheet figure, watch the lye move, flip the unit
  await open(p, store({ oils:[OIL("olive",1000)], superfat:0 }));
  await menu(p, "sap");
  await p.waitForTimeout(180);
  has("Modal shows our reference in mg KOH/g", await p.$eval("#modalRoot .sap-ref", (e) => e.textContent), "188");
  await p.fill("#modalRoot .cost-table input", "190");
  await p.waitForTimeout(250);
  near("Typing a supplier value re-sizes the lye live", await num(p, "#lyeVal"), 1000*190/1000/KOHF, 0.05);
  await p.evaluate(() => document.querySelectorAll("#modalRoot .seg button")[1].click());
  await p.waitForTimeout(150);
  near("Switching to g NaOH/g shows the same value converted",
    parseFloat(await p.inputValue("#modalRoot .cost-table input")), 190/1000/KOHF, 0.0002);

  // "Use ours" puts everything back
  await p.evaluate(() => document.querySelector("#modalRoot .mfoot .ghost").click());
  await p.waitForTimeout(250);
  near("Use ours restores the reference", await num(p, "#lyeVal"), 134, 0.05);
  eq("…and clears the stored override", JSON.stringify((await LS(p)).sapOverrides), "{}");
  await p.close();
}

/* =======================================================================
   CHEMISTRY, DIRECTLY

   core/chem.js is pure — no DOM, no application state — so the lye maths can be
   checked without a browser in the loop. These are the numbers a mistake in
   would burn someone, worked by hand rather than read back off the page.
======================================================================= */
{
  const Chem = await import("../../src/core/chem.js");
  const oil = (key, g) => ({ name: key, key, g });
  const rv = (o) => Object.assign({
    oils: [], additives: [], aromas: [], lyeType: "naoh", superfat: 5, waterPct: 38,
    waterMode: "oils", lyeConc: 33, waterRatio: 2, kohPurity: 90, dualKoh: 30,
    method: "cp", sfMode: "discount", sfOil: "", saltMode: "trace"
  }, o);

  // olive .134 x400 + coconut .178 x250 + palm .141 x200 + shea .128 x100 + castor .1286 x50
  //   = 145.53 g NaOH before superfat; x0.95 = 138.2535
  const classic = Chem.computeLye(rv({ oils:[oil("olive",400),oil("coconut",250),oil("palm",200),oil("shea",100),oil("castor",50)] }));
  near("Lye for the classic bar, worked by hand", classic.lyeG, 138.2535, 0.001);
  near("…water at 38% of oils", classic.waterG, 380, 0.001);

  // superfat is a discount on the saponifying lye and nothing else
  const sf0 = Chem.computeLye(rv({ oils:[oil("olive",1000)], superfat:0 }));
  near("0% superfat saponifies everything", sf0.lyeG, 134, 0.001);
  near("…and 5% takes exactly 5% off", Chem.computeLye(rv({ oils:[oil("olive",1000)] })).lyeG, 127.3, 0.001);

  // KOH: molar-mass ratio, then divided by purity — more flake for weaker lye
  const koh = Chem.computeLye(rv({ oils:[oil("olive",1000)], superfat:0, lyeType:"koh", kohPurity:100 }));
  near("KOH is NaOH x 56.1056/39.9971", koh.lyeG, 134 * 1.40274, 0.01);
  near("…and 90% purity needs proportionally more",
    Chem.computeLye(rv({ oils:[oil("olive",1000)], superfat:0, lyeType:"koh" })).lyeG, 134 * 1.40274 / 0.9, 0.01);

  // dual lye splits the same saponification between the two
  const dual = Chem.computeLye(rv({ oils:[oil("olive",1000)], superfat:0, lyeType:"dual", dualKoh:50, kohPurity:100 }));
  near("Dual lye: half the NaOH", dual.naohG, 67, 0.01);
  near("…and half again as KOH", dual.kohG, 67 * 1.40274, 0.01);

  // citric acid consumes lye stoichiometrically, and superfat must NOT discount that part
  const acid = Chem.computeLye(rv({ oils:[oil("olive",1000)], superfat:5,
    additives:[{ name:"Citric acid", key:"citric", g:20 }] }));
  near("Citric acid adds its full 0.6246 g NaOH per gram, undiscounted",
    acid.lyeG, 127.3 + 20 * 0.6246, 0.001);

  // water modes
  near("Lye concentration mode sizes water from the lye",
    Chem.computeLye(rv({ oils:[oil("olive",1000)], superfat:0, waterMode:"conc", lyeConc:33 })).waterG,
    134 * 0.67 / 0.33, 0.01);
  near("Water:lye mode is a straight multiple",
    Chem.computeLye(rv({ oils:[oil("olive",1000)], superfat:0, waterMode:"ratio", waterRatio:2 })).waterG, 268, 0.01);

  // an oil the app has no data for contributes no lye — err toward extra oil, never extra lye
  const custom = Chem.computeLye(rv({ oils:[oil("olive",500), { name:"Mystery fat", key:null, g:500 }] }));
  near("An unknown oil adds no lye at all", custom.lyeG, 500 * 0.134 * 0.95, 0.001);
  ok("…and is flagged as excluded", custom.hasCustom);

  // supplier overrides are injected, not reached for
  Chem.useSapOverrides(() => ({ olive: 0.2 }));
  near("A supplier SAP override is what gets used",
    Chem.computeLye(rv({ oils:[oil("olive",1000)], superfat:0 })).lyeG, 200, 0.001);
  eq("…and is reported", Chem.overriddenKeys(rv({ oils:[oil("olive",1000)] })).join(","), "olive");
  Chem.useSapOverrides(() => ({}));
  near("…and removing it restores the reference value",
    Chem.computeLye(rv({ oils:[oil("olive",1000)], superfat:0 })).lyeG, 134, 0.001);

  // water replacers come off the water you pour, not on top of it
  const milk = Chem.computeLye(rv({ oils:[oil("olive",1000)],
    additives:[{ name:"Goat milk", key:"goatmilk", g:300 }] }));
  near("Milk is subtracted from the water to pour", milk.waterAddG, 80, 0.001);
  near("…but total liquid is unchanged", milk.liquidG, 380, 0.001);
  ok("…and it isn't flagged as over budget", !milk.replOver);
  ok("Beyond the water budget it is flagged",
    Chem.computeLye(rv({ oils:[oil("olive",1000)],
      additives:[{ name:"Goat milk", key:"goatmilk", g:500 }] })).replOver);

  // qualities, straight off the blend
  const q = Chem.qualitiesOf(Chem.blendFA(rv({ oils:[oil("coconut",1000)] })).fa);
  near("100% coconut cleansing counts C8 and C10 too", q.cleansing, 79, 0.5);
  ok("…and it is far outside the typical band", q.cleansing > 26);

  // brine has a physical ceiling
  const brine = Chem.brineOf(rv({ oils:[oil("olive",1000)], saltMode:"brine",
    additives:[{ name:"Salt (table/sea)", key:"salt", g:500 }] }));
  ok("Salt beyond saturation is detectable", brine.per100 > 35.9, String(brine.per100));
}

}
