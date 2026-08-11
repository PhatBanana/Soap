/* Soap Calc — behavior test suite.
 *
 * Behaviour is tested through a headless browser — inject a saved state, reload,
 * and assert on the computed numbers / DOM / persisted localStorage — because that
 * is what users actually get. Reference data is imported directly instead, now that
 * it's ES modules: no reason to round-trip a table through a page to count it.
 * Self-contained — it starts its own static server and needs only `playwright`
 * plus a Chromium build.
 *
 *   npm test          (see package.json)
 *   node tests/soapcalc.test.mjs
 *
 * Exits non-zero if any assertion fails.
 */
import { createRequire } from "module";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ---------- tiny static file server (serves the repo root) ---------- */
const MIME = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css",
  ".json":"application/json", ".webmanifest":"application/manifest+json",
  ".png":"image/png", ".svg":"image/svg+xml", ".ico":"image/x-icon" };
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; res.end("not found"); return; }
    res.setHeader("Content-Type", MIME[path.extname(file)] || "application/octet-stream");
    res.end(buf);
  });
});
const base = await new Promise((resolve) =>
  server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)));

/* ---------- launch Chromium (pre-installed here; default resolution in CI) ---------- */
const preinstalled = process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const launchOpts = fs.existsSync(preinstalled) ? { executablePath: preinstalled } : {};
const browser = await chromium.launch(launchOpts);

/* ---------- assertion harness ---------- */
let pass = 0; const fails = [];
function ok(name, cond, detail) { if (cond) pass++; else fails.push(name + (detail ? ` — ${detail}` : "")); }
function eq(name, got, want) { ok(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
function near(name, got, want, tol = 0.5) { ok(name, Math.abs(got - want) <= tol, `got ${got}, want ${want}±${tol}`); }
function has(name, hay, needle) { ok(name, String(hay).includes(needle), `${JSON.stringify(String(hay).slice(0,80))} lacks ${JSON.stringify(needle)}`); }

/* ---------- fixtures & page helpers ---------- */
const OIL = (key, g) => ({ name: key, key, g });
function recipe(o = {}) {
  return Object.assign({ id:"r1", name:"Test", oils:[], additives:[], aromas:[],
    lyeType:"naoh", superfat:5, waterPct:38, waterMode:"oils", lyeConc:33, kohPurity:90,
    madeOn:"", cureWeeks:4, checklist:{}, use:"body" }, o);
}
function store(recOverrides = {}, view = {}) {
  return Object.assign({ unit:"g", tab:"base", scaleMode:"batch", currentId:"r1",
    recipes:[recipe(recOverrides)] }, view);
}
// Imported, not read off window: the app has no globals now, and asserting on the
// source is both faster and clearer. Assertions that the page really *loaded* the data
// are made against rendered output instead — a stronger check than window poking.
const { OILS, OIL_INCI } = await import("../src/data/oils.js");
const { ADDITIVES, COLORANTS, AROMAS } = await import("../src/data/ingredients.js");
const { EXAMPLES, TROUBLESHOOTING } = await import("../src/data/guides.js");

const pageErrors = [];
// assertion counts quoted in the docs, collected by the release-hygiene block and
// checked at the end of the run, once the real total exists
let docClaims = [];
// the thirteen fatty acids the app scores; an oil listing anything else is scored as zero
const FA_KEYS_T = ["cy","cp","la","my","pa","st","ar","po","ri","ol","li","ln","ga"];
async function newPage() {
  const p = await browser.newPage();
  p.on("pageerror", (e) => pageErrors.push("PE: " + e.message));
  p.on("console", (m) => { if (m.type() === "error") pageErrors.push("CE: " + m.text()); });
  return p;
}
async function open(p, storeObj) {
  await p.goto(base + "/index.html");
  await p.evaluate((s) => localStorage.setItem("soapcalc.v4", JSON.stringify(s)), storeObj);
  await p.reload();
  await p.waitForTimeout(200);
}
const LS = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("soapcalc.v4")));
const txt = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent : null; }, sel);
const num = async (p, sel) => parseFloat(await txt(p, sel));
// add one oil through the form (the simplest way to trigger the app's first save())
async function addOil(p, key, g) {
  await p.selectOption("#baseSelect", "oil:" + key);
  await p.fill("#amtIn", String(g));
  await p.click("#addForm button[type=submit]");
  await p.waitForTimeout(150);
}

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
   SAFETY CHECK
======================================================================= */
{
  const p = await newPage();
  const verdictClass = () => p.evaluate(() => document.getElementById("safetyVerdict").className);
  const items = () => p.$$eval("#safetyList .safety-item .si-title", (es) => es.map((e) => e.textContent));

  await open(p, store({ oils:[OIL("olive",500),OIL("coconut",300),OIL("palm",200)] }));
  has("Balanced bar → ok verdict", await verdictClass(), "ok");

  await open(p, store({ oils:[OIL("coconut",1000)], superfat:0 }));
  ok("0% superfat skin → warns no cushion", (await items()).includes("No superfat cushion"));

  await open(p, store({ oils:[OIL("coconut",1000)], superfat:0, use:"laundry" }));
  has("0% superfat laundry → ok verdict", await verdictClass(), "ok");

  await open(p, store({ oils:[OIL("olive",500), { name:"Mystery", key:null, g:500 }] }));
  ok("Custom oil → warns not in lye math", (await items()).includes("Custom oils aren't in the lye math"));

  await open(p, store({ oils:[OIL("coconut",1000)], superfat:5 }));
  ok("100% coconut skin → lauric warning", (await items()).includes("Very high coconut / lauric oil"));

  await open(p, store({ oils:[OIL("coconut",1000)], additives:[{name:"Salt",key:"salt",g:500}], superfat:5 }));
  ok("Salt bar low superfat → warns", (await items()).includes("Salt bar needs more superfat"));

  await open(p, store({ oils:[OIL("olive",600),OIL("coconut",400)], waterPct:50 }));
  ok("High water → very dilute lye warning", (await items()).includes("Very dilute lye"));

  await open(p, store({ oils:[OIL("olive",600),OIL("coconut",370),OIL("beeswax",30)], aromas:[{name:"Cinnamon",key:"cinnamon",g:8}] }));
  const fastItems = await items();
  ok("Beeswax/cinnamon → fast-trace warning", fastItems.includes("Fast trace ahead"));
  ok("Cinnamon → skin-irritant warning", fastItems.includes("Skin-irritant scents"));

  await open(p, store({ oils:[OIL("olive",36),OIL("coconut",24)] })); // 60 g oils
  ok("Tiny batch → small-batch warning", (await items()).includes("Very small batch"));

  await open(p, store({ oils:[OIL("palm",1000)] }));
  ok("100% palm → single-oil typo warning", (await items()).includes("Nearly a single-oil recipe"));
  await open(p, store({ oils:[OIL("olive",1000)] }));
  ok("100% olive (castile) → NOT flagged single-oil", !(await items()).includes("Nearly a single-oil recipe"));
  await p.close();
}

/* =======================================================================
   CONTEXT-AWARE NOTES (by intended use)
======================================================================= */
{
  const p = await newPage();
  await open(p, store({ oils:[OIL("coconut",1000)], use:"body" }));
  has("Body 100% coconut → 'drying'", await txt(p, "#recipeNotes"), "drying");
  await open(p, store({ oils:[OIL("coconut",1000)], use:"dish" }));
  has("Dish soap → 'cut grease' (not drying)", await txt(p, "#recipeNotes"), "cut grease");
  ok("Dish soap → no 'drying' warning", !String(await txt(p, "#recipeNotes")).includes("feel drying"));
  await p.close();
}

/* =======================================================================
   SCALING (wet weight, own unit)
======================================================================= */
{
  const p = await newPage();
  await open(p, store({ oils:[OIL("olive",400),OIL("coconut",300),OIL("palm",300)] }, { scaleUnit:"lb" }));
  await p.selectOption("#scaleUnit", "lb");
  await p.fill("#scaleTarget", "10");
  await p.click("#scaleApply");
  await p.waitForTimeout(200);
  near("Scale to 10 lb wet = 4535.9 g", await num(p, "#yieldVal"), 4535.9, 1);
  const pcts = await p.evaluate(() => { const r = JSON.parse(localStorage.getItem("soapcalc.v4")).recipes[0];
    const t = r.oils.reduce((s,o)=>s+o.g,0); return r.oils.map((o)=>Math.round(o.g/t*100)).join("/"); });
  eq("Ratios preserved after scale", pcts, "40/30/30");

  // bar size follows the chosen weight unit (it used to be hardcoded to grams)
  await open(p, store({ oils:[OIL("olive",1000)], barWeight:113.4 }));   // 113.4 g == exactly 4 oz
  const barBox = () => p.evaluate(() => ({ val: document.getElementById("barW").value,
    unit: document.getElementById("barWUnit").textContent, step: document.getElementById("barW").step }));
  let bb = await barBox();
  eq("Bar size shows grams in g mode", bb.val + bb.unit, "113.4g");
  await p.selectOption("#unitSelect", "oz"); await p.waitForTimeout(200);
  bb = await barBox();
  eq("Bar size converts to ounces", bb.val + bb.unit, "4oz");
  eq("Step adapts to the unit", bb.step, "0.25");
  has("Yield line uses the same unit", await txt(p, "#yieldBars"), "~4 oz each");
  await p.selectOption("#unitSelect", "lb"); await p.waitForTimeout(200);
  eq("Bar size converts to pounds", (await barBox()).val, "0.25");
  // typing a small number in oz must not trip the old grams-based floor
  await p.selectOption("#unitSelect", "oz"); await p.waitForTimeout(200);
  await p.fill("#barW", "4.5"); await p.waitForTimeout(200);
  near("Typing 4.5 oz stores 127.6 g (not a reset to 110)", (await LS(p)).recipes[0].barWeight, 4.5 * 28.349523125, 0.5);
  await p.selectOption("#unitSelect", "g"); await p.waitForTimeout(200);

  // scale by number of bars
  await open(p, store({ oils:[OIL("olive",400),OIL("coconut",300),OIL("palm",300)] }, { scaleMode:"bars", barWeight:100 }));
  ok("Bars mode shows the 'bars' unit, hides weight unit", await p.evaluate(() =>
    !document.getElementById("scaleBarsUnit").classList.contains("hide") && document.getElementById("scaleUnit").classList.contains("hide")));
  await p.fill("#scaleTarget", "24");
  await p.click("#scaleApply");
  await p.waitForTimeout(200);
  near("Scale to 24 bars @100 g → 2400 g wet", await num(p, "#yieldVal"), 2400, 2);
  has("Yield now reads 24 bars", await txt(p, "#yieldBars"), "≈ 24 bars");
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
   QUALITY OF LIFE: per-recipe bar weight · multi-level undo · quick add
======================================================================= */
{
  const p = await newPage();
  const blank = recipe();
  const seed = (store) => p.evaluate((s) => localStorage.setItem("soapcalc.v4", JSON.stringify(s)), store);

  // bar weight travels with the recipe, not the app
  await p.goto(base + "/index.html");
  await seed({ unit:"g", tab:"base", scaleMode:"batch", currency:"$", prices:{}, currentId:"r1", recipes:[
    Object.assign({}, blank, {id:"r1", name:"Small bars", oils:[OIL("olive",1000)], barWeight:80}),
    Object.assign({}, blank, {id:"r2", name:"Big bars",   oils:[OIL("olive",1000)], barWeight:150}) ]});
  await p.reload(); await p.waitForTimeout(250);
  eq("Recipe 1 keeps its own bar size", await p.evaluate(() => document.getElementById("barW").value), "80");
  has("Bar count uses recipe 1's size", await txt(p, "#yieldBars"), "~80 g each");
  await p.selectOption("#recipeSelect", "r2"); await p.waitForTimeout(250);
  eq("Recipe 2 keeps its own bar size", await p.evaluate(() => document.getElementById("barW").value), "150");
  has("Bar count uses recipe 2's size", await txt(p, "#yieldBars"), "~150 g each");

  // a pre-existing app-wide bar weight migrates onto recipes that lack one
  await p.evaluate((b) => {
    const r = Object.assign({}, b, {id:"rA", name:"Old", oils:[{name:"Olive oil",key:"olive",g:500}]});
    delete r.barWeight;
    localStorage.setItem("soapcalc.v4", JSON.stringify({ unit:"g", tab:"base", scaleMode:"batch", barWeight:135, currency:"$", prices:{}, currentId:"rA", recipes:[r] }));
  }, blank);
  await p.reload(); await p.waitForTimeout(250);
  eq("Legacy app-wide bar weight migrates to the recipe", await p.evaluate(() => document.getElementById("barW").value), "135");

  // undo steps back through several edits
  await open(p, store({ oils:[OIL("olive",400),OIL("coconut",300),OIL("palm",300)] }));
  await p.evaluate(() => document.querySelectorAll("#oilList .del")[2].click()); await p.waitForTimeout(150);
  await p.evaluate(() => document.querySelectorAll("#oilList .del")[1].click()); await p.waitForTimeout(150);
  const count = () => p.evaluate(() => JSON.parse(localStorage.getItem("soapcalc.v4")).recipes[0].oils.length);
  eq("Two removals leave one oil", await count(), 1);
  has("Undo button shows the depth", await txt(p, "#toastUndo"), "Undo (2)");
  await p.click("#toastUndo"); await p.waitForTimeout(200);
  eq("First undo restores one", await count(), 2);
  await p.click("#toastUndo"); await p.waitForTimeout(200);
  eq("Second undo restores the other", await count(), 3);

  // quick-add chips remember what you use
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForTimeout(200);
  ok("No chips before anything is added", await p.evaluate(() => document.getElementById("quickAdd").classList.contains("hide")));
  await addOil(p, "olive", 500);
  await addOil(p, "coconut", 300);
  const chips = await p.$$eval(".qa-chip", (cs) => cs.map((c) => c.textContent));
  eq("Chips list most-recent first", chips.join("|"), "Coconut oil (76°)|Olive oil");
  eq("Recent picks persist", (await LS(p)).recent.join(","), "oil:coconut,oil:olive");
  await p.click(".qa-chip"); await p.waitForTimeout(120);
  eq("Tapping a chip picks that ingredient", await p.evaluate(() => document.getElementById("baseSelect").value), "oil:coconut");
  eq("…and focuses the amount box", await p.evaluate(() => document.activeElement.id), "amtIn");
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
   INVENTORY (cupboard stock → shopping list → drawn down by a batch)
======================================================================= */
{
  const p = await newPage();
  const blank = recipe();
  const seed = (stock, tab) => p.evaluate(({ b, stock, tab }) => {
    localStorage.setItem("soapcalc.v4", JSON.stringify({
      unit:"g", tab:tab||"base", scaleMode:"batch", currency:"$",
      prices:{ olive:8, coconut:5 }, stock:stock, currentId:"r1",
      recipes:[Object.assign({}, b, { id:"r1", name:"Bar A",
        oils:[{name:"Olive oil",key:"olive",g:600},{name:"Coconut oil",key:"coconut",g:400}] })]
    }));
  }, { b: blank, stock, tab });
  const openShop = async () => {
    await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="shopping"]').click(); });
    await p.waitForTimeout(150);
    const r = await p.evaluate(() => ({ rows: [...document.querySelectorAll(".shop-row")].map((x) => x.textContent),
      covered: document.querySelectorAll(".shop-row.covered").length,
      tot: document.querySelector(".shop-tot").textContent }));
    await p.evaluate(() => { const b = document.querySelector(".modal-back"); if (b) b.remove(); document.body.style.overflow = ""; });
    return r;
  };

  // no stock at all → behaves exactly as before inventory existed
  await p.goto(base + "/index.html"); await seed({}); await p.reload(); await p.waitForTimeout(200);
  let s = await openShop();
  has("Without stock the row is just the amount", s.rows[0], "Olive oil600 g");
  ok("Without stock nothing is marked covered", s.covered === 0);
  has("Without stock the full cost is charged", s.tot, "$6.8");

  // partial stock → need / have / buy, and only the shortfall is priced
  await seed({ olive:200, coconut:1000 }); await p.reload(); await p.waitForTimeout(200);
  s = await openShop();
  has("Short ingredient shows need and have", s.rows[0], "need 600 · have 200");
  has("…and asks you to buy only the shortfall", s.rows[0], "400 g");
  has("…priced on the shortfall", s.rows[0], "$3.2");
  has("Covered ingredient says so", s.rows[1], "have enough");
  eq("Covered ingredient is greyed", s.covered, 1);
  has("Total counts only what must be bought", s.tot, "$3.2");

  // inventory modal lists library ingredients + lye, and reports coverage
  await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="stock"]').click(); });
  await p.waitForTimeout(150);
  const names = await p.$$eval(".cost-table tr td:first-child", (ts) => ts.map((t) => t.textContent));
  has("Inventory lists oils", names.join("|"), "Olive oil");
  has("Inventory lists lye too", names.join("|"), "Sodium hydroxide (NaOH)");
  has("Coverage line names the shortfall", await txt(p, ".modal .subinfo"), "short on Olive oil");
  await p.evaluate(() => { const b = document.querySelector(".modal-back"); if (b) b.remove(); document.body.style.overflow = ""; });

  // logging a batch draws stock down, floors at zero, ignores untracked items
  await seed({ olive:200, coconut:1000 }, "make"); await p.reload(); await p.waitForTimeout(200);
  await p.click("#logBatch"); await p.waitForTimeout(250);
  const st = (await LS(p)).stock;
  eq("Used-up ingredient floors at zero", st.olive, 0);
  near("Remaining stock is reduced by what was used", st.coconut, 600, 0.5);
  ok("Untracked ingredients stay untracked", st["c:sodium hydroxide (naoh)"] === undefined);
  await p.close();
}

/* =======================================================================
   BATCH LOG (each make archived, not overwritten)
======================================================================= */
{
  const p = await newPage();
  await open(p, store({ oils:[OIL("olive",600),OIL("coconut",400)],
    madeOn:"2026-07-01", lot:"20260701-A", cureWeeks:4, checklist:{s0:true,s1:true},
    notes:"First try — traced fast." }, { tab:"make" }));
  ok("History hidden before anything is logged", await p.evaluate(() => document.getElementById("historyCard").hidden));

  await p.click("#logBatch"); await p.waitForTimeout(250);
  let r = (await LS(p)).recipes[0];
  eq("Logging archives one batch", r.batches.length, 1);
  eq("Archived date kept", r.batches[0].madeOn, "2026-07-01");
  eq("Archived lot kept", r.batches[0].lot, "20260701-A");
  eq("Archived notes kept", r.batches[0].notes, "First try — traced fast.");
  eq("Working notes cleared for the next make", r.notes, "");
  eq("Checklist cleared for the next make", Object.keys(r.checklist).length, 0);
  ok("History card appears", !(await p.evaluate(() => document.getElementById("historyCard").hidden)));
  has("History shows the ready date", await txt(p, "#batchList"), "ready");

  // a second make must not clobber the first — the whole point
  await p.fill("#madeOn", "2026-08-15"); await p.waitForTimeout(120);
  await p.fill("#lotField", "20260815-A"); await p.waitForTimeout(120);
  await p.fill("#notesField", "Second try — less water, much firmer."); await p.waitForTimeout(150);
  await p.click("#logBatch"); await p.waitForTimeout(250);
  r = (await LS(p)).recipes[0];
  eq("Both makes on record", r.batches.length, 2);
  eq("First make survives the second", r.batches[0].notes, "First try — traced fast.");
  eq("Second make recorded", r.batches[1].madeOn, "2026-08-15");
  const order = await p.$$eval(".batch-row .bh-head b", (bs) => bs.map((b) => b.textContent));
  eq("History lists newest first", order.join("|"), "Aug 15, 2026|Jul 1, 2026");

  await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="library"]').click(); });
  await p.waitForTimeout(150);
  has("Library blurb counts the makes", await txt(p, ".lib-open span"), "made 2×");
  await p.evaluate(() => { const b = document.querySelector(".modal-back"); if (b) b.remove(); document.body.style.overflow = ""; });

  await p.evaluate(() => document.querySelector(".bh-del").click()); await p.waitForTimeout(250);
  r = (await LS(p)).recipes[0];
  eq("Deleting removes just that record", r.batches.length, 1);
  eq("…and it's the newest that went", r.batches[0].madeOn, "2026-07-01");
  await p.close();
}

/* =======================================================================
   CURE & pH CHECK LOG (zap tests filed onto the batch record)
======================================================================= */
{
  const p = await newPage();
  const BATCH = (id, madeOn, checks) => ({ id, madeOn, lot:"", cureWeeks:4, notes:"", checks });
  const rows = () => p.$$eval(".batch-row", (rs) => rs.map((r) =>
    Array.from(r.querySelectorAll(".bh-check")).map((c) => c.textContent.replace(/×$/, ""))));

  await open(p, store({ oils:[OIL("olive",600),OIL("coconut",400)], batches:[
    BATCH("bOld", "2026-06-01", [
      { id:"c2", on:"2026-06-29", ph:9,  zap:false, note:"Mild, good lather." },
      { id:"c1", on:"2026-06-08", ph:11, zap:true,  note:"Still sharp." }]),
    BATCH("bNew", "2026-07-10", [])
  ] }, { tab:"make" }));

  // rendering: oldest first within a batch, with the cure week worked out from the make date
  let seen = await rows();
  eq("Checks render on their own batch", seen.map((r) => r.length).join(","), "0,2");
  ok("Checks render oldest first", seen[1][0].startsWith("Jun 8") && seen[1][1].startsWith("Jun 29"));
  has("Check dates a zap test into the cure", seen[1][0], "week 1");
  has("Week counted from the make date", seen[1][1], "week 4");
  has("A zapping check is called out", seen[1][0], "zaps");
  has("A passing check is called out", seen[1][1], "no zap");
  has("pH reading shown", seen[1][0], "pH 11");
  ok("A batch with no checks shows no check rows", seen[0].length === 0);
  ok("Every batch offers a check form", (await p.$$(".bh-addcheck")).length === 2);
  ok("Check forms start closed", await p.$$eval(".bh-cform", (fs) => fs.every((f) => f.hidden)));

  // adding: goes onto the batch whose button you tapped (the newest one, listed first)
  await p.evaluate(() => document.querySelectorAll(".bh-addcheck")[0].click());
  await p.waitForTimeout(120);
  ok("Tapping + check opens that batch's form", await p.$$eval(".bh-cform", (fs) => !fs[0].hidden && fs[1].hidden));
  await p.fill(".batch-row:first-of-type .bcf-on", "2026-07-17");
  await p.fill(".batch-row:first-of-type .bcf-ph", "10.5");
  await p.check(".batch-row:first-of-type .bcf-zap");
  await p.fill(".batch-row:first-of-type .bcf-note", "Week one, definitely zaps.");
  await p.click(".batch-row:first-of-type .bh-cform button[type=submit]");
  await p.waitForTimeout(250);

  let bs = (await LS(p)).recipes[0].batches;
  const byId = (id) => bs.find((b) => b.id === id);
  eq("Check attaches to the batch it was added from", byId("bNew").checks.length, 1);
  eq("…and not to the other batch", byId("bOld").checks.length, 2);
  eq("Check date saved", byId("bNew").checks[0].on, "2026-07-17");
  eq("Check pH saved", byId("bNew").checks[0].ph, 10.5);
  eq("Zap flag saved", byId("bNew").checks[0].zap, true);
  eq("Check note saved", byId("bNew").checks[0].note, "Week one, definitely zaps.");

  await p.reload(); await p.waitForTimeout(250);
  seen = await rows();
  eq("Checks survive a reload", seen.map((r) => r.length).join(","), "1,2");
  has("Reloaded check keeps its reading", seen[0][0], "pH 10.5");

  // deleting one check leaves the others (and the batch) alone
  await p.evaluate(() => document.querySelectorAll(".batch-row")[1].querySelectorAll(".bc-del")[0].click());
  await p.waitForTimeout(250);
  bs = (await LS(p)).recipes[0].batches;
  eq("Deleting a check leaves the batch", bs.length, 2);
  eq("Deleting removes just that check", byId("bOld").checks.length, 1);
  eq("…and it's the right one that went", byId("bOld").checks[0].on, "2026-06-29");
  eq("The other batch is untouched", byId("bNew").checks.length, 1);
  await p.close();
}

{
  // the stored shape is sanitized like everything else
  const p = await newPage();
  const junk = [
    { id:"k1", on:"2026-06-08", ph:"11",   zap:1,    note:"string ph" },
    { id:"k2", on:"2026-06-15", ph:"",     zap:false, note:"blank ph" },
    { id:"k3", on:"2026-06-22", ph:99,     zap:false, note:"out of range" },
    { id:"k4", on:"2026-06-29", ph:"abc",  zap:false, note:"nonsense ph" },
    null, "nope"
  ];
  await open(p, store({ oils:[OIL("olive",500)], batches:[
    { id:"b1", madeOn:"2026-06-01", lot:"", cureWeeks:4, notes:"", checks:junk },
    { id:"b2", madeOn:"2026-06-02", lot:"", cureWeeks:4, notes:"" },
    { id:"b3", madeOn:"2026-06-03", lot:"", cureWeeks:4, notes:"", checks:"not an array" }
  ] }));
  await addOil(p, "castor", 10);                    // force a save through the schema
  const bs = (await LS(p)).recipes[0].batches;
  eq("Junk check entries dropped", bs[0].checks.length, 4);
  eq("String pH coerced to a number", bs[0].checks[0].ph, 11);
  eq("Truthy zap coerced to a boolean", bs[0].checks[0].zap, true);
  eq("Blank pH stored as null", bs[0].checks[1].ph, null);
  eq("Out-of-range pH clamped to 14", bs[0].checks[2].ph, 14);
  eq("Unparseable pH stored as null", bs[0].checks[3].ph, null);
  eq("A batch with no checks gets an empty list", JSON.stringify(bs[1].checks), "[]");
  eq("A non-array checks value becomes an empty list", JSON.stringify(bs[2].checks), "[]");
  // batch-record shape (backup/restore compatibility)
  eq("Batch record keys", Object.keys(bs[0]).sort().join(","), "checks,cureWeeks,id,lot,madeOn,notes");
  eq("Check record keys", Object.keys(bs[0].checks[0]).sort().join(","), "id,note,on,ph,zap");
  await p.close();
}

/* =======================================================================
   RECIPE LIBRARY: search · sort · favourites
======================================================================= */
{
  const p = await newPage();
  const blank = recipe();
  const now = Date.now();
  await p.goto(base + "/index.html");
  await p.evaluate(({ b, now }) => {
    const mk = (o) => Object.assign({}, b, o);
    localStorage.setItem("soapcalc.v4", JSON.stringify({
      unit:"g", tab:"base", scaleMode:"batch", currency:"$", prices:{}, librarySort:"name", currentId:"r1",
      recipes:[
        mk({id:"r1", name:"Zesty Lemon Bar",  oils:[{name:"Olive oil",key:"olive",g:500}], lastUsed: now - 86400000*3}),
        mk({id:"r2", name:"Aloe Facial Bar",  oils:[{name:"Olive oil",key:"olive",g:400}], use:"face", lastUsed: now - 86400000}),
        mk({id:"r3", name:"Milk & Honey",     oils:[{name:"Olive oil",key:"olive",g:300}], fav:true, lastUsed: now - 86400000*10}),
        mk({id:"r4", name:"Liquid Hand Soap", oils:[{name:"Coconut oil",key:"coconut",g:600}], lyeType:"koh", lastUsed: now})
      ]}));
  }, { b: blank, now });
  await p.reload(); await p.waitForTimeout(250);

  const opts = await p.$$eval("#recipeSelect option", (os) => os.map((o) => o.textContent));
  eq("Favourites lead the appbar picker, starred", opts[0], "★ Milk & Honey");
  eq("Then alphabetical", opts.slice(1).join("|"), "Aloe Facial Bar|Liquid Hand Soap|Zesty Lemon Bar");

  await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="library"]').click(); });
  await p.waitForTimeout(150);
  const names = () => p.$$eval(".lib-open b", (bs) => bs.map((b) => b.textContent));
  eq("Library lists favourites first, then A–Z", (await names()).join("|"), "Milk & Honey|Aloe Facial Bar|Liquid Hand Soap|Zesty Lemon Bar");
  const blurbs = await p.$$eval(".lib-open span", (ss) => ss.map((s) => s.textContent));
  has("Blurb notes the intended use", blurbs[1], "facial");
  has("Blurb notes liquid soap", blurbs[2], "liquid");
  has("Blurb notes when it was last opened", blurbs[2], "opened today");

  await p.click('.seg.sub button[data-ls="recent"]'); await p.waitForTimeout(150);
  eq("Recent sort orders by last opened (favourite still first)", (await names()).join("|"),
     "Milk & Honey|Liquid Hand Soap|Aloe Facial Bar|Zesty Lemon Bar");
  eq("Sort choice persists", (await LS(p)).librarySort, "recent");

  await p.fill("#modalRoot .ts-filter", "liquid"); await p.waitForTimeout(150);
  eq("Search filters by name", (await names()).join("|"), "Liquid Hand Soap");
  await p.fill("#modalRoot .ts-filter", "zzznope"); await p.waitForTimeout(150);
  eq("No match shows nothing", (await names()).length, 0);
  ok("No match shows a message", !!(await p.$(".ocr-status")));
  await p.fill("#modalRoot .ts-filter", ""); await p.waitForTimeout(150);

  await p.evaluate(() => {
    const row = [...document.querySelectorAll(".lib-row")].find((r) => r.querySelector("b").textContent === "Aloe Facial Bar");
    row.querySelector(".lib-star").click();
  });
  await p.waitForTimeout(200);
  eq("Starring re-sorts to the top", (await names())[0], "Aloe Facial Bar");
  eq("Star persists", (await LS(p)).recipes.find((r) => r.id === "r2").fav, true);

  await p.evaluate(() => {
    const row = [...document.querySelectorAll(".lib-row")].find((r) => r.querySelector("b").textContent === "Liquid Hand Soap");
    row.querySelector(".lib-open").click();
  });
  await p.waitForTimeout(250);
  const opened = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("soapcalc.v4")); return s.recipes.find((r) => r.id === s.currentId).name; });
  eq("Tapping a row opens that recipe", opened, "Liquid Hand Soap");
  await p.close();
}

/* =======================================================================
   STICKY MINI-SUMMARY · THEME TOGGLE
======================================================================= */
{
  const p = await newPage();
  await open(p, store({ oils:[OIL("olive",400),OIL("coconut",300),OIL("palm",300)] }));
  const shown = () => p.evaluate(() => !document.getElementById("miniSummary").classList.contains("hide"));
  ok("Mini summary shows on the Base tab", await shown());
  const mini = await txt(p, "#miniSummary");
  has("Mini summary shows the lye", mini, "NaOH");
  has("Mini summary shows water", mini, "water");
  has("Mini summary shows the batch", mini, "batch");

  await p.click('#tabs button[data-tab="make"]'); await p.waitForTimeout(200);
  ok("Mini summary hides on other tabs", !(await shown()));
  await p.click('#tabs button[data-tab="base"]'); await p.waitForTimeout(200);
  ok("…and comes back on Base", await shown());

  // theme cycles auto → light → dark → auto and sticks
  const theme = () => p.evaluate(() => ({ attr: document.documentElement.getAttribute("data-theme"),
    label: document.getElementById("themeLabel").textContent }));
  const tap = async () => { await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="theme"]').click(); }); await p.waitForTimeout(120); };
  eq("Theme starts on auto", (await theme()).attr, null);
  await tap(); eq("First tap forces light", (await theme()).attr, "light");
  await tap();
  const dark = await theme();
  eq("Second tap forces dark", dark.attr, "dark");
  has("Theme label follows", dark.label, "dark");
  eq("Dark actually repaints", await p.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(33, 27, 22)");
  await tap();
  eq("Third tap returns to auto", (await theme()).attr, null);
  eq("Theme choice persists", (await LS(p)).theme, "auto");
  await p.close();

  // a forced light theme must beat a dark device
  const ctx = await browser.newContext({ colorScheme: "dark" });
  const dp = await ctx.newPage();
  await dp.goto(base + "/index.html");
  await dp.evaluate((s) => localStorage.setItem("soapcalc.v4", JSON.stringify(s)), store({ oils:[OIL("olive",500)] }, { theme:"light" }));
  await dp.reload(); await dp.waitForTimeout(200);
  eq("Forced light wins over a dark device", await dp.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(251, 241, 227)");
  await ctx.close();
}

/* =======================================================================
   SHOPPING LIST (aggregate across recipes)
======================================================================= */
{
  const p = await newPage();
  const blank = recipe();
  await p.goto(base + "/index.html");
  await p.evaluate((b) => {
    const mk = (o) => Object.assign({}, b, o);
    localStorage.setItem("soapcalc.v4", JSON.stringify({
      unit:"g", tab:"base", scaleMode:"batch", barWeight:100, currency:"$",
      prices:{ olive:8, coconut:5 }, currentId:"r1",
      recipes:[
        mk({id:"r1",name:"Bar A",oils:[{name:"Olive oil",key:"olive",g:400},{name:"Coconut oil",key:"coconut",g:300}]}),
        mk({id:"r2",name:"Bar B",oils:[{name:"Olive oil",key:"olive",g:600},{name:"Palm oil",key:"palm",g:200}],aromas:[{name:"Lavender EO",key:"lavender",g:20}]}),
        mk({id:"r3",name:"Liquid C",lyeType:"koh",oils:[{name:"Coconut oil",key:"coconut",g:500}]})
      ]}));
  }, blank);
  await p.reload(); await p.waitForTimeout(250);
  await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="shopping"]').click(); });
  await p.waitForTimeout(150);

  eq("Shopping list offers every recipe", (await p.$$(".shop-rec")).length, 3);
  eq("Only the current recipe starts ticked", (await p.$$(".shop-rec input:checked")).length, 1);

  await p.click(".modal .link");           // select all
  await p.waitForTimeout(150);
  eq("Select-all ticks every recipe", (await p.$$(".shop-rec input:checked")).length, 3);
  const rows = (await p.$$eval(".shop-row", (rs) => rs.map((r) => r.textContent))).join("|");
  has("Olive is summed across recipes (400+600)", rows, "Olive oil1000 g");
  has("Coconut is summed across recipes (300+500)", rows, "Coconut oil800 g");
  has("Unpriced oils still listed", rows, "Palm oil200 g");
  has("Scents aggregated", rows, "Lavender EO20 g");
  has("NaOH totalled separately", rows, "Sodium hydroxide (NaOH)");
  has("KOH totalled separately", rows, "Potassium hydroxide (KOH)");
  has("Water totalled", rows, "Distilled water");
  has("Priced lines show cost", rows, "$8");
  has("Total reflects priced items only", await txt(p, ".shop-tot"), "$12");

  await p.click(".modal .link");           // clear
  await p.waitForTimeout(150);
  eq("Second click clears the selection", (await p.$$(".shop-rec input:checked")).length, 0);
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
  await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="wrapper"]').click(); });
  await p.waitForTimeout(120);
  has("Wrapper prints the lot number", await p.evaluate(() => document.querySelector(".wrapper-card").textContent), "Lot 20260725-A");
  await p.close();
}

/* =======================================================================
   HOT PROCESS (method toggle drives steps, cure and temps)
======================================================================= */
{
  const p = await newPage();
  const oils = [OIL("olive",500),OIL("coconut",300),OIL("palm",200)];
  const steps = () => p.$$eval("#checklist .txt", (es) => es.map((e) => e.textContent));

  await open(p, store({ oils, method:"cp" }, { tab:"make" }));
  const cp = await steps();
  eq("CP has 10 steps", cp.length, 10);
  has("CP pours at trace", cp[5], "blend to a light trace");
  has("CP adds scent at trace", cp[6], "at trace");
  has("CP cure ~4–6 weeks", await txt(p, "#cureSuggest"), "4–6 weeks");
  ok("CP reference list shown", await p.evaluate(() => !document.getElementById("tempRefCP").classList.contains("hide")));

  await open(p, store({ oils, method:"hp" }, { tab:"make" }));
  const hp = await steps();
  eq("HP has 10 steps", hp.length, 10);
  has("HP cooks the batter", hp[5], "cook on low");
  has("HP zap-tests the cook", hp[6], "zap-test");
  has("HP adds scent after the cook", hp[7], "AFTER the cook");
  has("HP cure compresses to ~1–2 weeks", await txt(p, "#cureSuggest"), "1–2 weeks");
  has("HP temp advice mentions the cook", await txt(p, "#tempSuggest"), "cook on low");
  ok("HP reference list swapped in", await p.evaluate(() =>
    !document.getElementById("tempRefHP").classList.contains("hide") && document.getElementById("tempRefCP").classList.contains("hide")));
  has("Method note describes HP", await txt(p, "#methodNote"), "slow cooker");

  await p.click('#methodSeg button[data-mt="cp"]');
  await p.waitForTimeout(150);
  eq("Method toggle persists", (await LS(p)).recipes[0].method, "cp");
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
   SOAPING-TEMPERATURE GUIDE (context-aware)
======================================================================= */
{
  const p = await newPage();
  const tip = (rec) => open(p, store(rec, { tab: "make" })).then(() => txt(p, "#tempSuggest"));
  has("Balanced recipe → ~100°F default", await tip({ oils:[OIL("olive",500),OIL("coconut",300),OIL("palm",200)] }), "~100°F");
  has("Beeswax → soap warmer", await tip({ oils:[OIL("olive",600),OIL("coconut",370),OIL("beeswax",30)] }), "warmer");
  has("Honey → soap cooler", await tip({ oils:[OIL("olive",600),OIL("coconut",400)], additives:[{name:"Honey",key:"honey",g:10}] }), "cooler");
  has("Accelerating scent → soap cooler", await tip({ oils:[OIL("olive",600),OIL("coconut",400)], aromas:[{name:"Cinnamon",key:"cinnamon",g:8}] }), "cooler");
  has("Both warm + cool → work-quickly note", await tip({ oils:[OIL("olive",600),OIL("coconut",370),OIL("beeswax",30)], aromas:[{name:"Cinnamon",key:"cinnamon",g:8}] }), "work quickly");
  await p.close();
}

/* =======================================================================
   PERSISTENCE (schema round-trip, sanitize, duplicate, clear)
======================================================================= */
{
  const p = await newPage();
  p.on("dialog", (d) => d.accept(d.type() === "prompt" ? "Second" : undefined));

  // fresh defaults (add an oil to trigger the first save)
  await p.goto(base + "/index.html");
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForTimeout(150);
  await addOil(p, "olive", 500);
  const fresh = (await LS(p)).recipes[0];
  eq("Fresh default use", fresh.use, "body");
  eq("Fresh default superfat", fresh.superfat, 5);
  eq("Fresh default waterMode", fresh.waterMode, "oils");
  eq("Fresh default lyeConc", fresh.lyeConc, 33);

  // full round-trip: every field non-default + view prefs
  await open(p, store({ id:"rF", name:"Full", oils:[OIL("olive",600),OIL("coconut",400)],
    additives:[{name:"Honey",key:"honey",g:10}], aromas:[{name:"Lavender",key:"lavender",g:20}],
    lyeType:"koh", superfat:8, waterPct:42, waterMode:"conc", lyeConc:35, kohPurity:92,
    madeOn:"2026-07-01", cureWeeks:9, checklist:{s0:true}, use:"hair" },
    { unit:"oz", scaleMode:"oils", scaleUnit:"lb", barWeight:120, currency:"€", prices:{coconut:5}, collapsed:{lyeCard:true}, currentId:"rF" }));
  const s = await LS(p), r = s.recipes[0];
  eq("RT lyeType", r.lyeType, "koh"); eq("RT superfat", r.superfat, 8); eq("RT waterMode", r.waterMode, "conc");
  eq("RT lyeConc", r.lyeConc, 35); eq("RT cureWeeks", r.cureWeeks, 9); eq("RT use", r.use, "hair");
  eq("RT checklist", JSON.stringify(r.checklist), '{"s0":true}');
  eq("RT view unit", s.unit, "oz"); eq("RT view scaleUnit", s.scaleUnit, "lb");
  eq("RT view currency", s.currency, "€"); eq("RT view collapsed", JSON.stringify(s.collapsed), '{"lyeCard":true}');

  // sanitize hostile input (read after a save forces the coerced state back to disk)
  await open(p, { unit:"bogus", scaleUnit:"pct", currentId:"rB",
    recipes:[{ id:"rB", name:"  ", oils:"notarray", additives:[{name:"x",g:"NaN"}],
      lyeType:"weird", superfat:99, waterPct:5, lyeConc:80, cureWeeks:50, use:"spaceship" }] });
  await addOil(p, "coconut", 100);
  const san = await LS(p), sr = san.recipes[0];
  eq("Sanitize name", sr.name, "Untitled"); eq("Sanitize lyeType", sr.lyeType, "naoh");
  eq("Sanitize superfat clamp", sr.superfat, 15); eq("Sanitize waterPct clamp", sr.waterPct, 25);
  eq("Sanitize lyeConc clamp", sr.lyeConc, 50); eq("Sanitize cureWeeks clamp", sr.cureWeeks, 16);
  eq("Sanitize use", sr.use, "body"); ok("Sanitize oils→array", Array.isArray(sr.oils));
  eq("Sanitize drops bad additive", sr.additives.length, 0);
  eq("Sanitize view unit", san.unit, "g"); eq("Sanitize view scaleUnit", san.scaleUnit, null);

  // duplicate: deep-copied lists, fresh checklist, "… copy" name
  await open(p, store({ id:"rD", name:"Orig", oils:[OIL("olive",500)], checklist:{s0:true} }, { currentId:"rD" }));
  const dup = await p.evaluate(() => {
    document.getElementById("menuBtn").click();
    document.querySelector('[data-a="dup"]').click();
    const s = JSON.parse(localStorage.getItem("soapcalc.v4"));
    const orig = s.recipes.find((r) => r.name === "Orig");
    const copy = s.recipes.find((r) => r.name === "Orig copy");
    return { count: s.recipes.length, copyChecklist: JSON.stringify(copy.checklist),
      origChecklist: JSON.stringify(orig.checklist), sharedArray: orig.oils === copy.oils, copyOils: copy.oils.length };
  });
  eq("Duplicate count", dup.count, 2);
  eq("Duplicate fresh checklist", dup.copyChecklist, "{}");
  eq("Duplicate keeps original checklist", dup.origChecklist, '{"s0":true}');
  ok("Duplicate deep-copies list", !dup.sharedArray);
  eq("Duplicate copies oils", dup.copyOils, 1);

  // clear the only recipe → all fields reset to defaults, id & name kept
  await open(p, store({ id:"rC", name:"Keeper", oils:[OIL("olive",500)],
    lyeType:"koh", superfat:12, waterMode:"conc", lyeConc:40, cureWeeks:10, checklist:{s0:true}, use:"dish" }, { currentId:"rC" }));
  const cleared = await p.evaluate(() => {
    document.getElementById("menuBtn").click();
    document.querySelector('[data-a="delete"]').click();
    return JSON.parse(localStorage.getItem("soapcalc.v4")).recipes[0];
  });
  eq("Clear keeps id", cleared.id, "rC"); eq("Clear keeps name", cleared.name, "Keeper");
  eq("Clear resets oils", cleared.oils.length, 0); eq("Clear resets lyeType", cleared.lyeType, "naoh");
  eq("Clear resets use", cleared.use, "body"); eq("Clear resets cureWeeks", cleared.cureWeeks, 4);
  eq("Clear resets checklist", JSON.stringify(cleared.checklist), "{}");

  // save shape unchanged (backup/restore compatibility)
  const keys = Object.keys(await LS(p)).sort().join(",");
  eq("Save shape keys", keys, "collapsed,currency,currentId,keepAwake,lastWeightUnit,librarySort,moldShape,prices,recent,recipes,sapOverrides,scaleMode,scaleUnit,stock,tab,theme,unit");
  await p.close();
}

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
   MOLD SHAPES (loaf / round / cavity → scale to fit)
======================================================================= */
{
  const p = await newPage();
  const oilsG = () => p.evaluate(() => JSON.parse(localStorage.getItem("soapcalc.v4")).recipes[0].oils.reduce((s, o) => s + o.g, 0));
  async function moldFixture() {
    await open(p, store({ oils:[OIL("olive",400),OIL("coconut",300),OIL("palm",300)] }, { scaleMode:"mold" }));
  }
  const IN = 0.4 * 28.349523125; // g of oils per in³

  await moldFixture();
  await p.click('#moldShape button[data-ms="loaf"]');
  await p.fill("#mL","8"); await p.fill("#mW","3.5"); await p.fill("#mH","2.5"); await p.waitForTimeout(80);
  await p.click("#moldApply"); await p.waitForTimeout(150);
  near("Loaf mold 8×3.5×2.5 in → oils", await oilsG(), 8*3.5*2.5*IN, 1);

  await moldFixture();
  await p.click('#moldShape button[data-ms="round"]');
  ok("Round selected → round grid shown, loaf hidden", await p.evaluate(() =>
    !document.getElementById("moldRound").classList.contains("hide") && document.getElementById("moldLoaf").classList.contains("hide")));
  await p.fill("#mD","3"); await p.fill("#mRH","6"); await p.waitForTimeout(80);
  await p.click("#moldApply"); await p.waitForTimeout(150);
  near("Round mold ⌀3×6 in → oils", await oilsG(), Math.PI*1.5*1.5*6*IN, 1);

  await moldFixture();
  await p.click('#moldShape button[data-ms="cavity"]');
  ok("Cavity selected → in/cm unit row hidden", await p.evaluate(() => document.getElementById("moldUnitRow").classList.contains("hide")));
  await p.fill("#mCount","12"); await p.fill("#mCavVol","100"); await p.waitForTimeout(80);
  await p.click("#moldApply"); await p.waitForTimeout(150);
  near("Cavity mold 12×100 mL → oils", await oilsG(), 12*100*0.6917, 1);
  eq("moldShape persisted", (await LS(p)).moldShape, "cavity");
  await p.close();
}

/* =======================================================================
   INCI INGREDIENT LABEL
======================================================================= */
{
  const p = await newPage();
  async function label(rec, view) {
    await open(p, store(rec, view));
    await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="label"]').click(); });
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
   TROUBLESHOOTING REFERENCE
======================================================================= */
{
  const p = await newPage();
  await open(p, store({ oils:[OIL("olive",500)] }));
  await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="trouble"]').click(); });
  await p.waitForTimeout(120);
  const groups = await p.$$eval(".ts-group", (es) => es.map((e) => e.textContent));
  eq("Troubleshooting groups", groups.join(","), "In the pot,In the mold,Curing & storing,Using the bar");
  ok("Troubleshooting lists entries", (await p.$$(".ts-item")).length >= 12);

  await p.fill("#modalRoot .ts-filter", "soda ash");
  await p.waitForTimeout(100);
  const filtered = await p.$$eval(".ts-item", (es) => ({ n: es.length, allOpen: es.every((e) => e.open), first: es[0] ? es[0].querySelector("summary").textContent : "" }));
  ok("Filter narrows the list", filtered.n >= 1 && filtered.n <= 3);
  ok("Filter auto-expands matches", filtered.allOpen);
  has("Filter finds the soda-ash entry", filtered.first, "soda ash");

  await p.fill("#modalRoot .ts-filter", "zzznope");
  await p.waitForTimeout(100);
  eq("No-match hides all items", (await p.$$(".ts-item")).length, 0);
  ok("No-match shows a message", !!(await p.$(".ts-wrap .sub")));

  await p.fill("#modalRoot .ts-filter", "");
  await p.waitForTimeout(80);
  await p.click(".ts-item summary");
  const body = await p.evaluate(() => { const d = document.querySelector(".ts-item[open] .ts-body"); return d ? d.textContent : ""; });
  has("Entry shows a Why", body, "Why:");
  has("Entry shows a Fix", body, "Fix:");
  await p.close();
}

/* =======================================================================
   REBATCH HELPER
======================================================================= */
{
  const p = await newPage();
  const openRebatch = async () => {
    await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="rebatch"]').click(); });
    await p.waitForTimeout(150);
  };
  const amounts = () => p.$$eval("#modalRoot .rb-row .sr-amt", (es) => es.map((e) => e.textContent.trim()));

  // 1000 g of oils -> 1521.2 g wet -> ~1255.2 g cured, which is the prefill
  await open(p, store({ oils:[OIL("olive",500),OIL("coconut",300),OIL("palm",200)] }));
  await openRebatch();
  near("Rebatch prefills the cured weight", parseFloat(await p.inputValue("#rebatchIn")), 1255.2, 1);

  await p.fill("#rebatchIn", "1000"); await p.waitForTimeout(120);
  eq("Rebatch liquid tiers at 1000 g", (await amounts()).join(","), "50 g,100 g,250 g");
  const names = await p.$$eval("#modalRoot .rb-row .sr-name", (es) => es.map((e) => e.textContent));
  eq("Three consistencies offered", names.length, 3);
  has("Firm tier labelled", names[0], "Firm");
  has("Typical tier labelled", names[1], "Typical");
  has("Pourable tier labelled", names[2], "Pourable");

  await p.fill("#rebatchIn", "500"); await p.waitForTimeout(120);
  eq("Liquid halves when the weight halves", (await amounts()).join(","), "25 g,50 g,125 g");

  await p.fill("#rebatchIn", ""); await p.waitForTimeout(120);
  eq("Blank weight shows no figures", (await amounts()).length, 0);
  ok("Blank weight prompts for one", !!(await p.$("#modalRoot .ocr-status")));

  ok("Rebatch lists a method", (await p.$$("#modalRoot .temp-ref li")).length >= 4);
  const warn = await p.evaluate(() => document.querySelector("#modalRoot .safety").textContent);
  has("Warns a zapping batch is lye-heavy", warn, "lye-heavy");
  has("Warns never to add more lye", warn, "Never add more lye");

  // the whole modal tracks the app's unit picker
  await p.evaluate(() => document.querySelector("#modalRoot .modal-back").remove());
  await p.selectOption("#unitSelect", "oz"); await p.waitForTimeout(200);
  await openRebatch();
  eq("Rebatch unit label follows the app unit",
    await p.$eval("#modalRoot .scale-row .u", (e) => e.textContent), "oz");
  near("Rebatch prefill converts to oz", parseFloat(await p.inputValue("#rebatchIn")), 1255.2 / 28.3495, 0.1);
  await p.fill("#rebatchIn", "32"); await p.waitForTimeout(120);
  eq("Rebatch liquid tiers in oz", (await amounts()).join(","), "1.6 oz,3.2 oz,8 oz");
  await p.close();
}

/* =======================================================================
   COLORANTS
======================================================================= */
{
  const p = await newPage();
  await open(p, store({ oils:[OIL("olive",500),OIL("coconut",300),OIL("palm",200)] }));

  // the new colorants are ordinary additives — addable, saved, costed, labelled
  const opts = await p.$$eval("#baseSelect option", (es) => es.map((e) => e.value));
  ["madder","annatto","indigo","alkanet","spirulina","frenchgreen","roseclay",
   "cocoapowder","turmeric","paprika","ironoxide","ultramarine"].forEach((k) =>
    ok(`Colorant ${k} offered as an additive`, opts.includes("add:" + k)));

  // colorants are half the additive list, so they get their own group in the picker
  const grouped = await p.$$eval("#baseSelect optgroup", (gs) => gs.map((g) => ({
    label: g.label, values: Array.from(g.children).map((o) => o.value) })));
  eq("Picker groups", grouped.map((g) => g.label.replace(/ \(.*/, "")).join(","),
    "Oils, butters & fats,Additives,Colorants");
  const colorGroup = grouped[2].values;
  ok("Colour goes in the colorant group",
    ["madder","indigo","mica","titanium","charcoal","ultramarine"].every((k) => colorGroup.includes("add:" + k)));
  ok("Milk and honey stay in the additive group",
    ["goatmilk","honey","sugar","silk"].every((k) => grouped[1].values.includes("add:" + k)));
  ok("Nothing lands in both groups", !colorGroup.some((v) => grouped[1].values.includes(v)));

  await p.selectOption("#baseSelect", "add:madder");
  has("Picking a colorant shows its usage note", await txt(p, "#pickPreview"), "per lb");
  await p.fill("#amtIn", "8");
  await p.click("#addForm button[type=submit]");
  await p.waitForTimeout(150);
  const add = (await LS(p)).recipes[0].additives[0];
  eq("Colorant saved into the recipe", add.key, "madder");
  eq("Colorant keeps its name", add.name, "Madder root powder");
  eq("Colorant keeps its weight", add.g, 8);

  await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="label"]').click(); });
  await p.waitForTimeout(150);
  has("Colorant appears on the INCI label",
    await p.evaluate(() => document.querySelector(".inci-box").textContent), "Rubia Tinctorum (Madder) Root Powder");
  ok("Known colorant raises no INCI warning", !(await p.$(".inci-warn")));
  await p.evaluate(() => { document.querySelector(".modal-back").remove(); document.body.style.overflow = ""; });

  // the guide
  await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="colors"]').click(); });
  await p.waitForTimeout(150);
  const families = await p.$$eval("#modalRoot .ts-group", (es) => es.map((e) => e.textContent));
  eq("Colour families in order", families.join(","),
    "White,Yellow & orange,Red & pink,Green,Blue & purple,Brown & black,Anything else");
  ok("Guide lists every colorant", (await p.$$("#modalRoot .ts-item")).length >= 20);
  const doses = await p.$$eval("#modalRoot .cl-dose", (es) => es.map((e) => e.textContent));
  eq("Every entry quotes a dose", doses.length, (await p.$$("#modalRoot .ts-item")).length);
  ok("Doses are per pound of oils", doses.every((d) => d.includes("PPO") || d.includes("on top")));

  await p.fill("#modalRoot .ts-filter", "indigo");
  await p.waitForTimeout(100);
  const hit = await p.$$eval("#modalRoot .ts-item", (es) => ({ n: es.length, open: es.every((e) => e.open),
    first: es[0] ? es[0].querySelector("summary").textContent : "" }));
  ok("Search narrows to the match", hit.n === 1);
  ok("Search auto-expands matches", hit.open);
  has("Search finds indigo", hit.first, "Indigo");

  await p.fill("#modalRoot .ts-filter", "fades");
  await p.waitForTimeout(100);
  ok("Search matches on behaviour text too", (await p.$$("#modalRoot .ts-item")).length >= 2);

  await p.fill("#modalRoot .ts-filter", "zzznope");
  await p.waitForTimeout(100);
  eq("No-match hides every colorant", (await p.$$("#modalRoot .ts-item")).length, 0);

  await p.fill("#modalRoot .ts-filter", "alkanet");
  await p.waitForTimeout(100);
  const body = await p.evaluate(() => document.querySelector("#modalRoot .ts-item[open] .ts-body").textContent);
  has("Entry says how to disperse it", body, "How:");
  has("Entry says what soap does to it", body, "In soap:");
  has("pH-shifting colorant flagged", body, "pH-sensitive");
  has("Colorant guide notes colour is cosmetic",
    await p.evaluate(() => document.querySelector("#modalRoot .safety").textContent), "nothing here changes the lye maths");
  await p.close();
}

/* =======================================================================
   PASTE A RECIPE (import from other calculators)
======================================================================= */
{
  const p = await newPage();
  // paste text, return what the review screen shows, optionally committing it
  async function paste(text, { total = null, commit = false } = {}) {
    await p.evaluate((t) => {
      document.getElementById("menuBtn").click();
      document.querySelector('[data-a="paste"]').click();
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
  await p.evaluate(() => {
    document.getElementById("menuBtn").click();
    document.querySelector('[data-a="paste"]').click();
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
   GUIDE CROSS-LINKS (troubleshooting ⇄ rebatch ⇄ colorants)
======================================================================= */
{
  const p = await newPage();
  await open(p, store({ oils:[OIL("olive",500),OIL("coconut",300)] }));
  const menu = (a) => p.evaluate((x) => { document.getElementById("menuBtn").click();
    document.querySelector('[data-a="' + x + '"]').click(); }, a);
  const title = () => p.$eval("#modalRoot h3", (e) => e.textContent);
  const backdrops = async () => (await p.$$("#modalRoot .modal-back")).length;
  const expanded = () => p.$$eval("#modalRoot .ts-item[open] summary", (es) => es.map((e) => e.textContent.trim()));
  const search = async (q) => { await p.fill("#modalRoot .ts-filter", q); await p.waitForTimeout(120); };
  const follow = async (sel) => { await p.click(sel); await p.waitForTimeout(200); };
  const close = async () => { await p.click("#modalRoot .mfoot .primary"); await p.waitForTimeout(150); };

  // a fix that says "rebatch it" can now get you there
  await menu("trouble"); await p.waitForTimeout(150);
  await search("separated");
  eq("Rebatch-able problem offers a link",
    await p.$$eval("#modalRoot .ts-item[open] .see-btn", (es) => es.map((e) => e.textContent).join(",")),
    "♻️ Rebatch helper");
  await follow("#modalRoot .ts-item[open] .see-btn");
  eq("Following the link opens the rebatch helper", await title(), "Rebatch");
  eq("The old guide closes behind it", await backdrops(), 1);
  ok("Rebatch is usable after arriving by link", !!(await p.$("#rebatchIn")));
  await close();

  // links can carry a search term, so you land on the entry, not the top of the guide
  await menu("trouble"); await p.waitForTimeout(150);
  await search("glycerin");
  await follow("#modalRoot .ts-item[open] .see-btn");
  eq("Glycerin rivers links to the colorant guide", await title(), "Colorants");
  eq("…pre-filtered to the culprit", await p.inputValue("#modalRoot .ts-filter"), "titanium");
  has("…landing expanded on titanium dioxide", (await expanded())[0], "Titanium dioxide");

  // and back the other way — the link is a round trip, not a dead end
  await follow("#modalRoot .ts-item[open] .see-btn");
  eq("Titanium dioxide links back to troubleshooting", await title(), "Troubleshooting");
  eq("…on the glycerin rivers entry", (await expanded()).join(","), "Translucent crackly streaks (glycerin rivers)");
  eq("Still just one modal after a round trip", await backdrops(), 1);
  await close();

  // the rebatch helper has no entries of its own, so it links at modal level
  await menu("rebatch"); await p.waitForTimeout(150);
  eq("Rebatch links back to troubleshooting",
    await p.$$eval("#modalRoot .see-btn", (es) => es.map((e) => e.textContent).join(",")), "🔧 Troubleshooting");
  await follow("#modalRoot .see-btn");
  eq("…and it opens", await title(), "Troubleshooting");
  await close();

  // a colorant that browns links to the discoloration entry
  await menu("colors"); await p.waitForTimeout(150);
  await search("botanical");
  await follow("#modalRoot .ts-item[open] .see-btn");
  eq("Botanicals link to the discoloration entry", await title(), "Troubleshooting");
  eq("…expanded on it", (await expanded()).join(","), "It discolored — turned tan or brown");
  await close();

  eq("Nothing left open at the end", await backdrops(), 0);
  ok("Page scroll is restored", await p.evaluate(() => document.body.style.overflow === ""));

  // exactly the entries that declare a `see` get a link — no dead buttons, none missing
  await menu("trouble"); await p.waitForTimeout(150);
  const counts = await p.evaluate(() => ({
    rendered: document.querySelectorAll("#modalRoot .see-btn").length,
    entries: document.querySelectorAll("#modalRoot .ts-item").length
  }));
  counts.declared = TROUBLESHOOTING.filter((t) => t.see).length;
  eq("Every declared cross-link renders", counts.rendered, counts.declared);
  ok("…and only some entries have one", counts.rendered > 0 && counts.rendered < counts.entries);
  await close();
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
  await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="share"]').click(); });
  await p.waitForTimeout(100);
  const url = await p.evaluate(() => document.querySelector(".share-url").value);
  const payload = await p.evaluate((u) => { let s = u.split("#r=")[1].replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return decodeURIComponent(escape(atob(s))); }, url);
  ok("Share link omits private notes", !payload.includes("Traced fast"));
  // the payload is built by exclusion, so pin exactly what is and isn't personal —
  // a field silently missing here hands the other person a different soap
  const shared = JSON.parse(payload);
  ["notes","batches","checklist","madeOn","lot","fav","lastUsed","barWeight"].forEach((k) =>
    ok(`Share link omits ${k}`, !(k in shared)));
  ["oils","additives","aromas","lyeType","dualKoh","saltMode","superfat","waterPct",
   "waterMode","lyeConc","kohPurity","cureWeeks","use","method","sfMode","sfOil",
   "dilution","waterRatio"].forEach((k) =>
    ok(`Share link carries ${k}`, k in shared));
  await p.evaluate(() => { const bk = document.querySelector(".modal-back"); if (bk) bk.remove(); document.body.style.overflow = ""; });

  // bar wrapper content
  await open(p, store({ name:"Lavender Bar", oils:[OIL("olive",400),OIL("coconut",300),OIL("palm",300)],
    aromas:[{name:"Lavender EO",key:"lavender",g:20}], madeOn:"2026-07-01", cureWeeks:4 }, { barWeight:100 }));
  await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="wrapper"]').click(); });
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
  await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="share"]').click(); });
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
   SHOPPING LIST IN PRINT
======================================================================= */
{
  const p = await newPage();
  await open(p, store({ id:"r1", name:"Kitchen Bar", oils:[OIL("olive",500),OIL("coconut",300)],
    additives:[{name:"Kaolin clay",key:"kaolin",g:20}] }, { stock:{ olive: 5000 } }));
  await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="shopping"]').click(); });
  await p.waitForTimeout(200);

  const btns = await p.$$eval("#modalRoot .mfoot button", (bs) => bs.map((b) => b.textContent));
  ok("Shopping list offers Print", btns.some((b) => b.includes("Print")));

  eq("Every line has a tick box",
    (await p.$$("#modalRoot .sr-tick")).length, (await p.$$("#modalRoot .shop-row")).length);
  ok("Something is covered by inventory", (await p.$$("#modalRoot .shop-row.covered")).length > 0);

  // on screen the print furniture stays out of the way
  const screen = await p.evaluate(() => ({
    tick: getComputedStyle(document.querySelector("#modalRoot .sr-tick")).display,
    head: getComputedStyle(document.querySelector(".shop-printhead")).display,
    picker: getComputedStyle(document.querySelector(".shop-pick")).display
  }));
  eq("Tick boxes are print-only", screen.tick, "none");
  eq("Print header is print-only", screen.head, "none");
  ok("Recipe picker is visible on screen", screen.picker !== "none");

  // …and swaps over on paper
  await p.emulateMedia({ media: "print" });
  await p.waitForTimeout(120);
  const print = await p.evaluate(() => {
    const cs = (sel) => getComputedStyle(document.querySelector(sel));
    const row = document.querySelector("#modalRoot .shop-row.covered");
    return {
      tick: cs("#modalRoot .sr-tick").display,
      head: cs(".shop-printhead").display,
      headText: document.querySelector(".shop-printhead").textContent,
      picker: cs(".shop-pick").display,
      foot: cs("#modalRoot .mfoot").display,
      blurb: cs("#modalRoot .sub.no-print").display,
      sectionBreak: cs("#modalRoot .shop-sec").breakInside,
      ink: cs("#modalRoot .shop-row:not(.covered)").color,
      struck: getComputedStyle(row.querySelector(".sr-label")).textDecorationLine,
      detail: getComputedStyle(row.querySelector(".sr-have")).textDecorationLine,
      detailBlock: getComputedStyle(row.querySelector(".sr-have")).display
    };
  });
  eq("Tick boxes appear in print", print.tick, "block");
  eq("Print header appears", print.head, "flex");
  has("Print header names the recipe", print.headText, "Kitchen Bar");
  eq("Picker is hidden on paper", print.picker, "none");
  eq("Buttons are hidden on paper", print.foot, "none");
  eq("Screen-only blurb is hidden on paper", print.blurb, "none");
  eq("Sections don't split across pages", print.sectionBreak, "avoid");
  eq("A normal line prints black, not the app's browns", print.ink, "rgb(0, 0, 0)");
  // colour can't carry meaning on a mono printer, so covered items are struck through
  eq("Covered item's name is struck through", print.struck, "line-through");
  eq("…but its need/have detail isn't", print.detail, "none");
  eq("…and that detail keeps its own line", print.detailBlock, "block");

  await p.emulateMedia({ media: null });
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
  const titles = () => p.$$eval("#safetyList .safety-item .si-title", (es) => es.map((e) => e.textContent));

  // the control only exists if there's salt to decide about
  await open(p, store({ oils:[OIL("coconut",1000)] }));
  ok("No salt → no salt-mode control", await p.$eval("#saltCtrl", (e) => e.classList.contains("hide")));
  await open(p, salty(80, "trace"));
  ok("Salt present → the control appears", !(await p.$eval("#saltCtrl", (e) => e.classList.contains("hide"))));

  // THE POINT: salt has a solubility ceiling, and a salt bar blows straight through it.
  // 500 g salt in 330 g water = 151.5 g per 100 g, over four times what dissolves.
  await open(p, salty(500, "brine"));
  has("Brine strength is quoted per 100 g of water", await txt(p, "#brineHint"), "151.5 g");
  ok("An impossible brine is a stop, not a shrug", (await titles()).includes("That salt won't dissolve"));
  has("…and it says how much would fit",
    await p.$$eval("#safetyList .safety-item", (es) => {
      const e = es.find((x) => /won't dissolve/.test(x.textContent)); return e ? e.textContent : ""; }), "83 g");
  ok("…and that this is salt-bar territory", (await titles()).includes("That's salt-bar amounts, dissolved"));

  // the same recipe made the normal way is fine
  await open(p, salty(500, "trace"));
  has("Dry at trace explains itself", await txt(p, "#brineHint"), "at trace");
  ok("…and raises no dissolving problem", !(await titles()).includes("That salt won't dissolve"));

  // a realistic soleseife dissolves comfortably: 80 g in 330 g = 24.2
  await open(p, salty(80, "brine", { superfat:5 }));
  has("A real brine is quoted too", await txt(p, "#brineHint"), "24.2 g");
  ok("…and passes", (await titles()).includes("Brine will dissolve"));
  ok("…without the salt-bar note", !(await titles()).includes("That's salt-bar amounts, dissolved"));

  // just under the ceiling warns rather than passing silently
  await open(p, salty(100, "brine", { superfat:5 }));       // 30.3 per 100 g
  ok("Near saturation warns", (await titles()).includes("Close to a saturated brine"));

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
  const url = await p.evaluate(() => {
    document.getElementById("menuBtn").click(); document.querySelector('[data-a="share"]').click();
    return document.querySelector(".share-url").value;
  });
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
   WHICH RECIPES CAN I MAKE TODAY?
======================================================================= */
{
  const p = await newPage();
  const lib = async (view) => {
    await open(p, Object.assign({ unit:"g", tab:"base", scaleMode:"batch", currentId:"a", recipes:[
      recipe({ id:"a", name:"Plenty",      oils:[OIL("olive",300),OIL("coconut",200)] }),
      recipe({ id:"b", name:"Short one",   oils:[OIL("olive",300),OIL("coconut",900)] }),
      recipe({ id:"c", name:"Untracked",   oils:[OIL("shea",300)] })
    ] }, view));
    await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="library"]').click(); });
    await p.waitForTimeout(180);
  };
  const names = () => p.$$eval("#modalRoot .lib-open b", (es) => es.map((e) => e.childNodes[0].textContent.trim()));
  const badge = (n) => p.$$eval("#modalRoot .lib-open b", (es, name) => {
    const el = es.find((e) => e.childNodes[0].textContent.trim() === name);
    const b = el && el.querySelector(".lib-can, .lib-short");
    return b ? b.textContent.trim() : null;
  }, n);
  const close = () => p.evaluate(() => { const b = document.querySelector("#modalRoot .modal-back"); if (b) b.remove(); document.body.style.overflow = ""; });

  // inventory is opt-in: with an empty cupboard the library is exactly as it was
  await lib({});
  eq("No inventory → no badges", (await p.$$("#modalRoot .lib-can, #modalRoot .lib-short")).length, 0);
  ok("No inventory → no filter chip", await p.$eval("#modalRoot .lib-chip", (e) => e.classList.contains("hide")));
  eq("…and every recipe still lists", (await names()).length, 3);
  await close();

  // tracking olive and coconut, enough for one recipe but not the other
  await lib({ stock:{ olive:1000, coconut:500 } });
  ok("Tracking → the filter chip appears", !(await p.$eval("#modalRoot .lib-chip", (e) => e.classList.contains("hide"))));
  has("A covered recipe says so", await badge("Plenty"), "can make");
  has("A short recipe says how many", await badge("Short one"), "short 1");
  // claiming "can make" about a recipe we track nothing from would be a guess
  eq("A recipe with nothing tracked gets no badge", await badge("Untracked"), null);

  await p.click("#modalRoot .lib-chip"); await p.waitForTimeout(150);
  eq("The filter keeps only what's actually covered", (await names()).join(","), "Plenty");
  ok("…and shows as active", await p.$eval("#modalRoot .lib-chip", (e) => e.classList.contains("on")));
  await p.click("#modalRoot .lib-chip"); await p.waitForTimeout(150);
  eq("Toggling it off restores the list", (await names()).length, 3);
  await close();

  // short by a hair still counts as short
  await lib({ stock:{ olive:1000, coconut:199 } });
  has("Being 1 g short is short", await badge("Plenty"), "short 1");
  await close();

  // the lye is stocked like anything else, so it can be the thing you're short of
  await lib({ stock:{ "c:sodium hydroxide (naoh)": 1 } });
  has("Running out of lye shows up too", await badge("Plenty"), "short 1");
  await close();

  // the inventory modal's own readout still works after the extraction
  await open(p, store({ oils:[OIL("olive",300)] }, { stock:{ olive:1000 } }));
  await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="stock"]').click(); });
  await p.waitForTimeout(180);
  has("Inventory still reports coverage", await p.$eval("#modalRoot .subinfo", (e) => e.textContent), "enough of everything");
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
  await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="shopping"]').click(); });
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
  await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="label"]').click(); });
  await p.waitForTimeout(180);
  const inci = await p.evaluate(() => document.querySelector(".inci-box").textContent);
  has("INCI lists the sodium salt", inci, "Sodium Olivate");
  has("…and the potassium salt", inci, "Potassium Olivate");
  await p.evaluate(() => { document.querySelector("#modalRoot .modal-back").remove(); document.body.style.overflow = ""; });

  // the share link must carry the share, or the recipient gets a different soap
  await open(p, store({ id:"rS", name:"Dual Share", oils:[OIL("olive",1000)],
    lyeType:"dual", dualKoh:70 }));
  const url = await p.evaluate(() => {
    document.getElementById("menuBtn").click(); document.querySelector('[data-a="share"]').click();
    return document.querySelector(".share-url").value;
  });
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
  await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="examples"]').click(); });
  await p.waitForTimeout(200);
  const groups = await p.$$eval("#modalRoot .ex-h", (es) => es.map((e) => e.textContent));
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
  let titles = await p.$$eval("#safetyList .safety-item .si-title", (es) => es.map((e) => e.textContent));
  ok("Safety Check reports the raise", titles.includes("Lye raised for Citric acid"));
  ok("…and doesn't cry wolf at a normal dose", !titles.includes("That's a lot of acid"));

  await open(p, store({ oils:[OIL("olive",1000)], superfat:0, additives:acid("citric",50) }));
  titles = await p.$$eval("#safetyList .safety-item .si-title", (es) => es.map((e) => e.textContent));
  ok("5% of oils is flagged as too much acid", titles.includes("That's a lot of acid"));

  // the real failure mode: typed as a custom additive, so the app has no data for it
  await open(p, store({ oils:[OIL("olive",1000)], superfat:0,
    additives:[{ name:"Citric acid", key:null, g:10 }] }));
  near("A custom-typed acid can't adjust the lye", await num(p, "#lyeVal"), BASE, 0.05);
  titles = await p.$$eval("#safetyList .safety-item .si-title", (es) => es.map((e) => e.textContent));
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
  await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="label"]').click(); });
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
    (await p.$$eval("#safetyList .safety-item .si-title", (es) => es.map((e) => e.textContent)))
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
  const titles = await p.$$eval("#safetyList .safety-item .si-title", (es) => es.map((e) => e.textContent));
  ok("…and it's no longer reported as excluded", !titles.includes("Custom oils aren't in the lye math"));
  ok("…but it is called out as your own figure", titles.includes("Custom oil using the SAP you entered"));

  // without a SAP the old behaviour stands: excluded from the lye and warned about
  await open(p, store({ oils:[OIL("olive",500), { name:"Mystery oil", key:null, g:500 }], superfat:0 }));
  near("Custom oil with no SAP contributes no lye", await num(p, "#lyeVal"), 500*0.134, 0.05);
  ok("…and is still flagged as excluded",
    (await p.$$eval("#safetyList .safety-item .si-title", (es) => es.map((e) => e.textContent)))
      .includes("Custom oils aren't in the lye math"));

  // nonsense overrides are ignored by the maths and dropped on the next save
  await open(p, store({ oils:[OIL("olive",1000)], superfat:0 },
    { sapOverrides:{ olive:"abc", coconut:-1, palm:0, shea:5, notanoil:0.13 } }));
  near("Bad overrides never reach the lye", await num(p, "#lyeVal"), 134, 0.05);
  await addOil(p, "castor", 1);                       // force a save through the schema
  eq("…and are dropped from storage", JSON.stringify((await LS(p)).sapOverrides), "{}");

  // the modal: type a spec-sheet figure, watch the lye move, flip the unit
  await open(p, store({ oils:[OIL("olive",1000)], superfat:0 }));
  await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="sap"]').click(); });
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
   PERSISTENCE TIMING (continuous edits coalesce; nothing is lost)
======================================================================= */
{
  const p = await newPage();
  const drag = (v) => p.evaluate((x) => {
    const s = document.querySelector("#oilList input[type=range]");
    s.value = String(x); s.dispatchEvent(new Event("input", { bubbles: true }));
  }, v);

  // a slider drag survives a reload — the write lands even though it's deferred
  await open(p, store({ oils:[OIL("olive",600),OIL("coconut",400)] }));
  await drag(70);
  await p.reload(); await p.waitForTimeout(250);
  let r = (await LS(p)).recipes[0];
  near("Slider edit survives a reload", r.oils[0].g / (r.oils[0].g + r.oils[1].g) * 100, 70, 0.6);
  near("Total oils unchanged by the drag", r.oils.reduce((a, o) => a + o.g, 0), 1000, 0.5);

  // dragging many times in a row still ends on the final value
  await open(p, store({ oils:[OIL("olive",600),OIL("coconut",400)] }));
  for (let i = 0; i < 25; i++) await drag(40 + i);
  await p.reload(); await p.waitForTimeout(250);
  r = (await LS(p)).recipes[0];
  near("A long drag persists its final position",
    r.oils[0].g / (r.oils[0].g + r.oils[1].g) * 100, 64, 0.6);

  // a discrete action flushes whatever the continuous stream had queued
  await open(p, store({ oils:[OIL("olive",500)], madeOn:"2026-07-01", cureWeeks:4 }, { tab:"make" }));
  await p.fill("#notesField", "Typed, then logged straight away.");
  await p.click("#logBatch");                       // no wait: the click must flush the typing
  await p.waitForTimeout(200);
  r = (await LS(p)).recipes[0];
  eq("Logging a batch flushes the typing that preceded it", r.batches.length, 1);
  eq("…and the note went with it", r.batches[0].notes, "Typed, then logged straight away.");

  // adding an oil is discrete too — it must not lose a pending slider edit
  await open(p, store({ oils:[OIL("olive",600),OIL("coconut",400)] }));
  await drag(80);
  await addOil(p, "castor", 50);
  r = (await LS(p)).recipes[0];
  eq("Adding an oil writes immediately", r.oils.length, 3);
  near("…and keeps the slider edit made just before it",
    r.oils[0].g / (r.oils[0].g + r.oils[1].g) * 100, 80, 0.6);

  // switching recipes must not carry a pending edit onto the wrong one
  await open(p, store({ id:"rA", name:"A", oils:[OIL("olive",600),OIL("coconut",400)] }));
  await p.evaluate(() => { document.getElementById("menuBtn").click(); document.querySelector('[data-a="dup"]').click(); });
  await p.waitForTimeout(250);
  const st = await LS(p);
  eq("Duplicate wrote both recipes", st.recipes.length, 2);
  ok("Duplicate is the current one", st.currentId !== "rA");
  await p.close();
}

/* =======================================================================
   CPOP — a third method added to a codebase full of `method === "hp"` binaries.
   The chemistry must stay identical to cold process; only the guidance differs.
   These are the assertions that catch a branch nobody remembered to widen.
======================================================================= */
{
  // The lye panel only renders on the Base tab and the checklist only on the Make tab, so
  // each method is read twice. Reading both from one tab is how this test first passed
  // while comparing "0" to "0".
  const OILS3 = [OIL("olive",600),OIL("coconut",250),OIL("palm",150)];
  const readAll = async (p, method) => {
    await open(p, store({ oils:OILS3, method }, { tab:"base" }));
    const chem = await p.evaluate(() => ({
      lye:   document.getElementById("lyeVal").textContent,
      water: document.getElementById("waterOut").textContent,
      batch: document.getElementById("batchOut").textContent
    }));
    await open(p, store({ oils:OILS3, method }, { tab:"make" }));
    const guide = await p.evaluate(() => ({
      note:  document.getElementById("methodNote").textContent,
      temps: document.getElementById("tempSuggest").textContent,
      cure:  document.getElementById("cureSuggest").textContent,
      steps: [...document.querySelectorAll("#checklist .chk .txt")].map((e) => e.textContent)
    }));
    return Object.assign(chem, guide);
  };

  const p = await newPage();
  const cp = await readAll(p, "cp"), cpop = await readAll(p, "cpop"), hp = await readAll(p, "hp");
  // the comparisons below are worthless if the readings are empty
  ok("Lye actually read for the comparison", parseFloat(cp.lye) > 100, cp.lye);
  ok("Cure suggestion actually read", cp.cure.length > 10, cp.cure);
  ok("Checklist actually read", cp.steps.length >= 8, String(cp.steps.length));

  // identical chemistry — the oven changes nothing the lye cares about
  eq("CPOP lye matches cold process", cpop.lye, cp.lye);
  eq("CPOP water matches cold process", cpop.water, cp.water);
  eq("CPOP batch weight matches cold process", cpop.batch, cp.batch);
  eq("CPOP cure suggestion matches cold process", cpop.cure, cp.cure);
  ok("…and hot process really is different, so the comparison means something",
    hp.lye === cp.lye && hp.cure !== cp.cure, `hp cure ${hp.cure.slice(0,40)}`);

  // its own guidance
  ok("CPOP has its own checklist", cpop.steps.join("|") !== cp.steps.join("|"));
  ok("…that says to turn the oven off", cpop.steps.some((s) => /TURN THE OVEN OFF/.test(s)),
    cpop.steps.join(" | "));
  ok("…and does not tell you to insulate as well", cpop.steps.some((s) => /don't insulate/.test(s)));
  ok("CPOP has its own method note", cpop.note !== cp.note && cpop.note !== hp.note);
  ok("CPOP has its own temperature guidance", cpop.temps !== cp.temps && cpop.temps !== hp.temps);
  has("…warning about the failure mode people actually hit", cpop.temps, "volcanoes");

  // after-the-cook superfat is a hot-process technique; CPOP must not offer it
  await open(p, store({ oils:[OIL("olive",900),OIL("castor",100)],
    method:"cpop", sfMode:"after", sfOil:"castor", superfat:10 }));
  const cpopSf = await p.evaluate(() => document.getElementById("lyeVal").textContent);
  await open(p, store({ oils:[OIL("olive",900),OIL("castor",100)],
    method:"cp", sfMode:"after", sfOil:"castor", superfat:10 }));
  eq("CPOP ignores after-the-cook superfat, exactly as cold process does",
    cpopSf, await p.evaluate(() => document.getElementById("lyeVal").textContent));
  ok("…and the superfat-mode control stays hidden for it",
    await p.evaluate(() => document.getElementById("sfModeCtrl").classList.contains("hide")));

  // the method has to survive a save/load round trip, or the schema coercion missed it
  // and silently downgraded it to "cp"
  await open(p, store({ oils:OILS3, method:"cpop" }));
  eq("CPOP survives being saved and reloaded", (await LS(p)).recipes[0].method, "cpop");
  await p.close();
}

/* =======================================================================
   LYE FIRST AID — the guide is only worth anything if it's reachable from
   where the accident happens, not just from the menu.
======================================================================= */
{
  const p = await newPage();
  await open(p, store({ oils:[OIL("olive",500)] }));
  const title = () => p.evaluate(() => (document.querySelector("#modalRoot h3") || {}).textContent || "");
  const close = () => p.click("#modalRoot .mfoot .primary");

  await p.click('#lyeCard .safety [data-guide="firstaid"]');
  await p.waitForTimeout(200);
  eq("The Lye card's safety banner opens first aid", await title(), "Lye first aid");
  has("…and says up front it isn't medical advice",
    await p.evaluate(() => document.querySelector("#modalRoot .safety").textContent), "not medical advice");
  ok("…with no hard-coded emergency number — the app has no idea what country it's in",
    !/\b(911|999|112|1-800)\b/.test(await p.evaluate(() => document.querySelector("#modalRoot").textContent)));

  // the myth this guide exists to kill
  await p.fill("#modalRoot .ts-filter", "vinegar");
  await p.waitForTimeout(150);
  const vinegar = await p.evaluate(() => document.querySelector("#modalRoot .ts-body").textContent);
  has("Searching 'vinegar' finds the do-not-neutralise entry", vinegar, "exothermic");
  has("…and says plainly to use water instead", vinegar, "Water");
  await close(); await p.waitForTimeout(150);

  // and from the checklist, which is where someone is standing mid-batch
  await open(p, store({ oils:[OIL("olive",500)] }, { tab:"make" }));
  await p.click('#tab-make .safety [data-guide="firstaid"]');
  await p.waitForTimeout(200);
  eq("The checklist's lye warning opens it too", await title(), "Lye first aid");
  await close();
  await p.close();
}

/* =======================================================================
   AUDIT FIXES — claims the app makes about itself must actually hold
======================================================================= */
{
  const ADD = (key, name, g) => ({ name, key, g });
  const panel = (p) => p.evaluate(() => ({
    lye:   parseFloat(document.getElementById("lyeVal").textContent),
    water: parseFloat(document.getElementById("waterOut").textContent),
    batch: parseFloat(document.getElementById("batchOut").textContent),
    info:  document.getElementById("lyeInfo").textContent,
    checks:[...document.querySelectorAll("#safetyList .safety-item")]
      .map((e) => e.querySelector(".si-title").textContent)
  }));
  const oneOil = (adds) => store({ oils:[OIL("olive",1000)], additives:adds });

  // --- water replacers -------------------------------------------------
  // 1000 g olive at 5% SF = 127.30 g NaOH; 38% water = 380 g.
  let p = await newPage();
  await open(p, oneOil([]));
  const plain = await panel(p);
  near("Baseline lye", plain.lye, 127.3, 0.05);
  near("Baseline water", plain.water, 380, 0.5);
  near("Baseline batch", plain.batch, 1507.3, 0.5);

  await open(p, oneOil([ADD("goatmilk","Goat milk",300)]));
  const milk = await panel(p);
  near("Milk comes off the water you pour", milk.water, 80, 0.5);
  eq("…and the batch is unchanged, so nothing is counted twice", milk.batch, plain.batch);
  has("…and the card says so with the arithmetic", milk.info, "after 300 g of Goat milk");
  has("…naming the total liquid", milk.info, "380 g liquid in total");
  ok("Lye concentration is unmoved — total liquid is the same",
    Math.abs(parseFloat(milk.info.match(/([\d.]+)%/)[1]) - 25.1) < 0.2, milk.info);

  // the case the old code could not see at all
  await open(p, oneOil([ADD("goatmilk","Goat milk",500)]));
  const over = await panel(p);
  near("Replacers beyond the water budget floor it at zero", over.water, 0, 0.01);
  ok("…and the over-budget check fires",
    over.checks.some((t) => /More Goat milk than/.test(t)), over.checks.join("|"));
  ok("…and 'Very dilute lye' finally fires — it was blind to this before",
    over.checks.some((t) => /Very dilute lye/.test(t)), over.checks.join("|"));

  // liquids that are NOT water replacers must keep going in on top
  await open(p, oneOil([ADD("honey","Honey",50)]));
  const honey = await panel(p);
  near("Honey does not touch the water", honey.water, 380, 0.5);
  near("…and is added on top of the batch", honey.batch, plain.batch + 50, 0.5);
  await p.close();

  // --- clamped hot-process reserve -------------------------------------
  const hp = (sf) => store({ oils:[OIL("olive",900),OIL("castor",100)],
    superfat:sf, method:"hp", sfMode:"after", sfOil:"castor" });
  p = await newPage();
  await open(p, hp(10));
  let s = await panel(p);
  ok("A reserve that fits raises nothing",
    !s.checks.some((t) => /smaller than it looks/.test(t)), s.checks.join("|"));

  await open(p, hp(15));
  s = await panel(p);
  ok("A reserve capped by the oil available is called out",
    s.checks.some((t) => /smaller than it looks/.test(t)), s.checks.join("|"));
  const detail = await p.evaluate(() => [...document.querySelectorAll("#safetyList .safety-item")]
    .filter((e) => /smaller than it looks/.test(e.querySelector(".si-title").textContent))
    .map((e) => e.querySelector(".si-detail").textContent)[0] || "");
  has("…quoting what was asked for", detail, "15%");
  has("…and what the bar actually gets", detail, "10%");
  ok("…and the superfat verdict judges the real figure, not the requested one",
    s.checks.some((t) => /Lye is balanced/.test(t)) && !s.checks.some((t) => /Very high superfat/.test(t)),
    s.checks.join("|"));
  await p.close();

  // --- additive cap, now an exception table over a default --------------
  p = await newPage();
  await open(p, oneOil([ADD("sodiumcitrate","Sodium citrate",200)]));
  ok("An uncapped chelator at 20% is caught by the default cap",
    (await panel(p)).checks.some((t) => /Additive dosed high/.test(t)));
  await open(p, oneOil([ADD("sodiumcitrate","Sodium citrate",20)]));
  ok("…and a sane 2% dose is not",
    !(await panel(p)).checks.some((t) => /Additive dosed high/.test(t)));
  await open(p, oneOil([ADD("salt","Salt (table/sea)",250)]));
  ok("Salt bars are exempt — 25% salt is the point of them",
    !(await panel(p)).checks.some((t) => /Additive dosed high/.test(t)));
  await p.close();

  // --- the quality-dilution note ---------------------------------------
  p = await newPage();
  await open(p, store({ oils:[OIL("olive",900),OIL("beeswax",100)] }));
  has("Beeswax's effect on the profile is explained", await txt(p,"#qualNote"), "add weight without adding profile");
  await open(p, store({ oils:[OIL("olive",1000)] }));
  ok("…and nothing is said when no such oil is present",
    !/without adding profile/.test(await txt(p,"#qualNote")));
  await p.close();
}

/* =======================================================================
   MENU SEARCH
======================================================================= */
{
  const p = await newPage();
  await open(p, store({ oils:[OIL("olive",500)] }));
  const openMenu = () => p.evaluate(() => document.getElementById("menuBtn").click());
  const type = async (q) => { await p.fill("#sheetFilter", q); await p.waitForTimeout(80); };
  // what's actually on screen — the install button carries .hide when unavailable
  const shown = () => p.evaluate(() => [...document.querySelectorAll("#sheet .sheet-btn")]
    .filter((b) => !b.hidden && !b.classList.contains("hide"))
    .map((b) => b.textContent.trim()));
  const groups = () => p.evaluate(() => [...document.querySelectorAll("#sheet .sheet-group")]
    .filter((g) => !g.hidden).length);

  await openMenu();
  const all = await shown();
  ok("Menu opens with every action listed", all.length >= 20, String(all.length));
  eq("…and every group", await groups(), 6);

  await type("wrapper");
  eq("Search narrows to one action", (await shown()).length, 1);
  eq("…the right one", (await shown())[0].includes("Bar wrapper"), true);
  eq("Empty groups take their headings with them", await groups(), 1);
  ok("No 'no matches' line while something matches",
    await p.evaluate(() => document.getElementById("sheetEmpty").classList.contains("hide")));

  // the whole point of data-kw: the word you'd type isn't on the button
  await type("csv");
  const csv = await shown();
  eq("data-kw finds actions by the word you'd actually type", csv.length, 2);
  ok("…Import CSV among them", csv.some((t) => t.includes("Import")), csv.join("|"));
  await type("print");
  const printable = await shown();
  ok("…and 'print' finds all four printable outputs", printable.length === 4, printable.join("|"));

  await type("zzznope");
  eq("No matches hides every action", (await shown()).length, 0);
  ok("…and says so", await p.evaluate(() =>
    !document.getElementById("sheetEmpty").classList.contains("hide")));

  await type("");
  eq("Clearing the search restores everything", (await shown()).length, all.length);

  // Every button must be findable by typing its own label. The hand-kept-list bug
  // (curRV, the examples categories, recipeShareURL) has bitten this repo repeatedly;
  // this is that guard for the menu.
  for (const label of all) {
    const word = label.replace(/[^\w\s]/g, " ").trim().split(/\s+/)[0];
    await type(word);
    const hits = await shown();
    ok(`Menu search finds "${label}" by "${word}"`,
      hits.some((t) => t === label), hits.join("|"));
  }

  // a query left over from last time looks exactly like an app that lost its menu
  await type("wrapper");
  await p.evaluate(() => document.getElementById("sheetClose").click());
  await p.waitForTimeout(80);
  await openMenu();
  eq("Reopening the menu clears the search", await p.inputValue("#sheetFilter"), "");
  eq("…and shows everything again", (await shown()).length, all.length);

  // Enter on a lone match runs it: the desktop path is menu → type → Enter
  await type("wrapper");
  await p.press("#sheetFilter", "Enter");
  await p.waitForTimeout(250);
  ok("Enter on a single match runs that action",
    await p.evaluate(() => !!document.querySelector("#modalRoot .modal")));
  ok("…and closes the menu",
    await p.evaluate(() => document.getElementById("sheetBack").classList.contains("hide")));
  await p.close();
}

/* =======================================================================
   SCREEN WAKE LOCK
   Driven against a stub navigator.wakeLock. The real lock depends on the
   headless browser's power state, which would make this flaky and would test
   Chromium rather than our decision about when to hold it.
======================================================================= */
{
  const p = await newPage();
  await p.addInitScript(() => {
    window.__wake = { requests: 0, releases: 0, held: false };
    // navigator.wakeLock is a prototype accessor — plain assignment silently no-ops
    const stub = { request() {
      window.__wake.requests++; window.__wake.held = true;
      return Promise.resolve({
        release() { window.__wake.held = false; window.__wake.releases++; return Promise.resolve(); },
        addEventListener() {}
      });
    } };
    Object.defineProperty(navigator, "wakeLock", { configurable: true, get: () => stub });
  });
  const wake = () => p.evaluate(() => window.__wake);
  const tick = async (n) => { await p.evaluate((i) =>
    document.querySelectorAll("#checklist .chk input")[i].click(), n); await p.waitForTimeout(120); };

  await open(p, store({ oils:[OIL("olive",500)] }, { tab:"make" }));
  eq("Opening the Make tab alone does not hold the screen", (await wake()).held, false);
  ok("…and says nothing about it",
    await p.evaluate(() => document.getElementById("wakeNote").classList.contains("hide")));

  await tick(0);
  eq("Ticking the first step holds the screen", (await wake()).held, true);
  has("…and tells you it is doing so", await txt(p, "#wakeNote"), "stays on");

  await p.evaluate(() => document.querySelector('.tabs button[data-tab="base"]').click());
  await p.waitForTimeout(150);
  eq("Leaving the Make tab releases it", (await wake()).held, false);

  await p.evaluate(() => document.querySelector('.tabs button[data-tab="make"]').click());
  await p.waitForTimeout(150);
  eq("Coming back re-takes it, the make still being open", (await wake()).held, true);

  await p.evaluate(() => document.getElementById("wakeOff").click());
  await p.waitForTimeout(150);
  eq("Turning it off releases it", (await wake()).held, false);
  eq("…and the choice is saved, not just applied", (await LS(p)).keepAwake, false);
  has("…with a way back on", await txt(p, "#wakeNote"), "keep it on");

  await p.reload(); await p.waitForTimeout(250);
  eq("…and survives a reload", (await wake()).held, false);

  await p.evaluate(() => document.getElementById("wakeOff").click());
  await p.waitForTimeout(150);
  eq("Turning it back on re-takes the lock", (await wake()).held, true);

  // unticking the last step ends the make
  await tick(0);
  eq("Clearing the last tick ends the make and releases", (await wake()).held, false);
  await p.close();
}

{
  // no wakeLock API at all: no note, no errors, everything else works
  const p = await newPage();
  await p.addInitScript(() => {
    Object.defineProperty(navigator, "wakeLock", { configurable: true, get: () => undefined });
  });
  await open(p, store({ oils:[OIL("olive",500)] }, { tab:"make" }));
  await p.evaluate(() => document.querySelectorAll("#checklist .chk input")[0].click());
  await p.waitForTimeout(150);
  ok("Without the API the screen note stays hidden",
    await p.evaluate(() => document.getElementById("wakeNote").classList.contains("hide")));
  eq("…and the checklist still records the step", Object.keys((await LS(p)).recipes[0].checklist).length, 1);
  await p.close();
}

/* =======================================================================
   DESKTOP LAYOUT
   Measured in the browser, not grepped out of app.css — a test that only checks
   a declaration is present passes just as happily when the declaration does
   nothing. Both faults below were visible on screen and invisible to the suite.
======================================================================= */
{
  // fault 1: the bar, tabs and mini summary were capped at 680px and centred inside a
  // 1080px wrap, so the header started 184px right of the cards under it.
  const edges = (p) => p.evaluate(() => {
    const box = (s) => { const e = document.querySelector(s); if (!e) return null;
      const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right) }; };
    const card = [...document.querySelectorAll("#tab-base>.card")].find((c) => !c.hidden);
    const cr = card.getBoundingClientRect();
    // the wrap's *content* box — it carries side padding, which the cards sit inside
    const w = document.querySelector(".wrap"), wr = w.getBoundingClientRect(), ws = getComputedStyle(w);
    return { appbar: box(".appbar"), tabs: box(".tabs"), mini: box(".mini"),
             wrap: { l: Math.round(wr.left + parseFloat(ws.paddingLeft)),
                     r: Math.round(wr.right - parseFloat(ws.paddingRight)) },
             card: { l: Math.round(cr.left), r: Math.round(cr.right) },
             overflow: document.documentElement.scrollWidth > window.innerWidth,
             cols: getComputedStyle(document.getElementById("tab-base")).columnCount };
  });

  for (const width of [1024, 1280, 1440, 1920]) {
    const p = await newPage();
    await p.setViewportSize({ width, height: 1000 });
    await open(p, store({ oils: [OIL("olive", 500), OIL("coconut", 300)] }));
    const e = await edges(p);
    eq(`Header shares the content's left edge at ${width}px`, e.appbar.l, e.card.l);
    eq(`Tabs share the content's left edge at ${width}px`, e.tabs.l, e.card.l);
    eq(`Mini summary shares the content's left edge at ${width}px`, e.mini.l, e.card.l);
    eq(`Header spans the full wrap at ${width}px`, e.appbar.r, e.wrap.r);
    ok(`No horizontal overflow at ${width}px`, !e.overflow);
    eq(`A full recipe gets two columns at ${width}px`, e.cols, "2");
    await p.close();
  }

  // fault 2: multicol reserves both columns whatever is in them, so the empty state —
  // one card, the rest still hidden — sat in a half-width column beside blank space.
  {
    const p = await newPage();
    await p.setViewportSize({ width: 1440, height: 1000 });
    await open(p, store({ oils: [] }));
    const e = await edges(p);
    eq("Empty state falls back to one column", e.cols, "1");
    eq("The lone card spans the full wrap width", e.card.r - e.card.l, e.wrap.r - e.wrap.l);
    await p.close();
  }

  // below the breakpoint nothing about this applies — one column, full-width cards
  {
    const p = await newPage();
    await p.setViewportSize({ width: 420, height: 900 });
    await open(p, store({ oils: [OIL("olive", 500), OIL("coconut", 300)] }));
    const e = await edges(p);
    eq("Phone width stays single-column", e.cols, "auto");
    ok("No horizontal overflow at 420px", !e.overflow);
    await p.close();
  }
}

/* =======================================================================
   RELEASE HYGIENE (the version/cache coupling that keeps phones off stale copies)
======================================================================= */
{
  const appSrc = fs.readFileSync(path.join(ROOT, "src/main.js"), "utf8");
  // the version and build date live with the rest of the persisted-shape constants
  const schemaSrc = fs.readFileSync(path.join(ROOT, "src/core/schema.js"), "utf8");
  const swSrc  = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const appV   = (schemaSrc.match(/APP_VERSION\s*=\s*"(v\d+)"/) || [])[1];
  const swV    = (swSrc.match(/CACHE\s*=\s*"soapcalc-(v\d+)"/) || [])[1];
  const built  = (schemaSrc.match(/BUILD_DATE\s*=\s*"([\d-]+)"/) || [])[1];

  ok("schema.js declares APP_VERSION", !!appV, appV);
  ok("sw.js declares a cache name", !!swV, swV);
  eq("Service-worker cache is bumped with the app version", swV, appV);
  ok("BUILD_DATE is an ISO date", /^\d{4}-\d{2}-\d{2}$/.test(built || ""), built);
  ok("BUILD_DATE is a real date", !isNaN(new Date(built + "T00:00:00").getTime()));

  // every precached file must actually exist, or the first offline load silently loses it
  const shell = (swSrc.match(/var SHELL\s*=\s*\[([\s\S]*?)\]/) || [])[1] || "";
  const files = shell.match(/"\.\/[^"]+"/g).map((s) => s.slice(3, -1));
  ok("Service worker precaches a shell", files.length >= 5, String(files.length));
  files.forEach((f) => ok(`Precached file exists: ${f}`, fs.existsSync(path.join(ROOT, f))));

  // The app's own source files must all be in the shell, or an update half-applies offline.
  // Derived from what's on disk rather than a list naming them: this used to be five
  // hand-typed filenames, so anything added later simply wasn't checked — the same
  // hand-kept-list failure as curRV(), the examples categories and recipeShareURL().
  const sourceFiles = [];
  (function walk(dir, prefix) {
    fs.readdirSync(path.join(ROOT, dir || "."), { withFileTypes: true }).forEach((d) => {
      if (d.name.startsWith(".") || d.name === "node_modules" || d.name === "tests"
          || d.name === "screenshots" || d.name === "icons") return;
      const rel = prefix ? `${prefix}/${d.name}` : d.name;
      if (d.isDirectory()) walk(rel, rel);
      // "_" prefix marks a scratch file (tests/_shots.mjs and friends), never shipped
      else if (/\.(js|mjs|css)$/.test(d.name) && d.name !== "sw.js" && !d.name.startsWith("_"))
        sourceFiles.push(rel);
    });
  })("", "");
  ["index.html", "manifest.webmanifest"].forEach((f) => sourceFiles.push(f));
  ok("Found the app's source files to check", sourceFiles.length >= 5, sourceFiles.join(","));
  sourceFiles.forEach((f) => ok(`Shell covers ${f}`, files.includes(f), `SHELL has ${files.join(",")}`));

  // CI runs in a pinned Playwright image, so its tag and the lockfile's playwright
  // version have to move together — mismatch means "Executable doesn't exist" in CI
  // and nowhere else. Same class of hand-kept pairing as APP_VERSION / sw.js.
  const wf   = fs.readFileSync(path.join(ROOT, ".github/workflows/tests.yml"), "utf8");
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8"));
  const imgV = (wf.match(/image:\s*mcr\.microsoft\.com\/playwright:v([\d.]+)-/) || [])[1];
  const lockV = ((lock.packages || {})["node_modules/playwright"] || {}).version;
  ok("CI pins a Playwright image", !!imgV, String(imgV));
  ok("Lockfile pins playwright", !!lockV, String(lockV));
  eq("CI image matches the lockfile's playwright (tests.yml vs package-lock.json)", imgV, lockV);
  ok("CI does not download a browser per run", !/playwright install/.test(wf));

  // The docs quote how much is in the app. Those numbers are hand-typed and had already
  // drifted — the roadmap claimed v46 and "30 additives" against a v49 app with 33 —
  // so they get the same treatment as APP_VERSION / sw.js.
  const roadmap = fs.readFileSync(path.join(ROOT, "ROADMAP.md"), "utf8");
  const readme  = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");

  const p = await newPage();
  await open(p, store({ oils:[OIL("olive",500)] }));

  // counted off the loaded page rather than by parsing data.js — the browser has already
  // done that parsing, and correctly
  const counts = {
    oils:      Object.keys(OILS).length,
    additives: Object.keys(ADDITIVES).length,
    aromas:    Object.keys(AROMAS).length,
    colorants: COLORANTS.length,
    examples:  EXAMPLES.length
  };

  // every "N oils" / "N additives" / … claim in either document, whatever the wording.
  // Quoted and code-spanned text is dropped first: the roadmap cites the wrong numbers it
  // used to carry ("30 additives", "~40 oils") as part of explaining why this check
  // exists, and a citation is not a claim.
  const claimable = (s) => s.replace(/"[^"]*"/g, " ").replace(/`[^`]*`/g, " ")
                            .replace(/[“][^”]*[”]/g, " ");
  const claims = [["oils", /(\d+) oils/g], ["additives", /(\d+) additives/g],
                  ["aromas", /(\d+) aromas/g], ["colorants", /(\d+) colorants/g],
                  ["examples", /(\d+) example recipes/g]];
  let claimsSeen = 0;
  [["ROADMAP.md", claimable(roadmap)], ["README.md", claimable(readme)]].forEach(([file, src]) => {
    claims.forEach(([what, re]) => {
      [...src.matchAll(re)].forEach((m) => {
        claimsSeen++;
        eq(`${file} states the real ${what} count`, Number(m[1]), counts[what]);
      });
    });
  });
  // a guard on the guard: if the wording changes so no claim matches, the loop above
  // passes by doing nothing at all
  ok("The docs do make countable claims", claimsSeen >= 5, String(claimsSeen));

  // --- reference-data integrity --------------------------------------------
  // 65 oils and 33 scents of hand-entered reference values sit behind the lye maths.
  // Nothing here can tell you a SAP figure is *right* — only the supplier can — but it
  // can catch the slips that bulk data entry actually makes: a decimal point in the wrong
  // place, a profile that doesn't add up, a scent whose "max" is below its "typical".
  const oilData = OILS, aromaData = AROMAS;

  // Beeswax is the documented exception: it's mostly unsaponifiable wax ester, which is
  // why its SAP is half an ordinary oil's. Anything else summing low means missing acids.
  const FA_EXEMPT = { beeswax: "mostly unsaponifiable wax esters, not triglycerides" };
  Object.entries(oilData).forEach(([k, o]) => {
    const sum = Object.values(o.fa).reduce((a, b) => a + b, 0);
    if (!FA_EXEMPT[k]) ok(`${k}: fatty acids account for the oil (${sum}%)`, sum >= 94 && sum <= 101, String(sum));
    // every SAP here is between jojoba's 0.069 and fractionated coconut's 0.232
    ok(`${k}: SAP is in the physically plausible band`, o.sap > 0.05 && o.sap < 0.30, String(o.sap));
    ok(`${k}: iodine value is plausible`, o.iod >= 0 && o.iod <= 200, String(o.iod));
    ok(`${k}: INS value is plausible`, o.ins >= 0 && o.ins <= 400, String(o.ins));
    ok(`${k}: has a description worth reading`, (o.desc || "").length >= 40);
    Object.keys(o.fa).forEach((f) =>
      ok(`${k}: fatty acid "${f}" is one the app scores`, FA_KEYS_T.includes(f)));
  });
  ok("Beeswax is still the only oil exempt from the profile check",
    Object.keys(FA_EXEMPT).every((k) => k in oilData));

  Object.entries(aromaData).forEach(([k, a]) => {
    const [lo, typ, hi] = a.rate || [];
    ok(`${k}: usage rate is ordered low <= typical <= max`, lo <= typ && typ <= hi, JSON.stringify(a.rate));
    ok(`${k}: usage rate is plausible for soap`, lo > 0 && hi <= 10, JSON.stringify(a.rate));
    ok(`${k}: has a note position`, ["top", "middle", "base"].includes(a.note), String(a.note));
    ok(`${k}: is declared EO or FO`, ["EO", "FO"].includes(a.type), String(a.type));
  });

  // an oil with no INCI name prints "(verify INCI)" on the label — fine as a fallback,
  // not fine as the normal case for a third of the list
  const noInci = Object.keys(OILS).filter((k) => !(k in OIL_INCI));
  eq("Every oil has an INCI name for the label", noInci.join(","), "");

  // --- data integrity behind the audit fixes -------------------------------
  // Subtracting an additive from the water changes the chemistry, so the set that does it
  // is pinned: adding a fifth should be a deliberate edit here, not a silent one.
  const replacers = Object.keys(ADDITIVES)
    .filter((k) => ADDITIVES[k].replacesWater).sort();
  eq("Only genuine water replacers subtract from the water",
    replacers.join(","), "aloe,beer,coconutmilk,coffee,goatmilk,wine");
  ok("…and every one of them is a liquid",
    Object.keys(ADDITIVES).filter((k) => ADDITIVES[k].replacesWater)
      .every((k) => ADDITIVES[k].kind === "liquid"));

  // A mistyped ADD_CAP key is invisible: the additive just falls through to the default.
  const capKeys = ((appSrc.match(/var ADD_CAP=\{([^}]*)\}/) || [])[1] || "")
    .split(",").map((s) => s.split(":")[0].trim()).filter(Boolean);
  ok("ADD_CAP has entries", capKeys.length >= 10, String(capKeys.length));
  const knownAdds = Object.keys(ADDITIVES);
  capKeys.forEach((k) => ok(`ADD_CAP key "${k}" is a real additive`, knownAdds.includes(k)));

  // the wording fix has to stay fixed — "skin-safe max" claims an authority this data lacks
  ok("No 'skin-safe max' claim survives in the app", !/skin-safe max/.test(
    appSrc.replace(/\/\/[^\n]*/g, "")), "found outside a comment");

  // the roadmap's "Today:" line names a version — it must be this one
  const roadmapV = (roadmap.match(/\*\*Today:\*\*\s*(v\d+)/) || [])[1];
  ok("ROADMAP states a version", !!roadmapV, String(roadmapV));
  eq("ROADMAP's version matches the app", roadmapV, appV);

  // The assertion totals quoted in the docs are pinned as a ceiling, not an equality:
  // overstating what the suite covers is a lie, but forcing every test-adding PR to edit
  // two markdown files would be friction with no safety payoff. Checked at the end of the
  // run, where the real total is known.
  docClaims = [["ROADMAP.md", roadmap], ["README.md", readme]]
    .flatMap(([file, src]) => [...src.matchAll(/(\d+) (?:test )?assertions/g)]
      .map((m) => [file, Number(m[1])]));

  // and the footer must show the version, since that's how a stale copy gets spotted
  const stamp = await txt(p, "#buildStamp");
  has("Footer shows the app version", stamp, appV);
  has("Footer shows the build date", stamp, built);
  await p.close();
}

/* ---------- report ---------- */
ok("No console/page errors during tests", pageErrors.length === 0, pageErrors.join(" | "));

await browser.close();
server.close();

// The docs' assertion counts, checked here because only now is the real figure known.
// A ceiling, not an equality — see the note where docClaims is collected. Snapshot the
// total first, so these checks don't count themselves.
// (the +1 and the per-claim ones are the checks on this line and the next, which will
// themselves be counted — so the ceiling is the number the run actually prints)
const finalTotal = pass + fails.length + 1 + docClaims.length;
ok("The docs quote an assertion count", docClaims.length >= 1, String(docClaims.length));
docClaims.forEach(([file, said]) =>
  ok(`${file} does not overstate the suite`, said <= finalTotal,
     `says ${said}, suite runs ${finalTotal}`));

const total = pass + fails.length;
console.log(`\n${pass}/${total} assertions passed`);
if (fails.length) {
  console.log("\nFAILURES:");
  fails.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("✓ all green");
