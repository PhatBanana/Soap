/* Soap Calc — behavior test suite.
 *
 * The app is a single closured IIFE with no exports, so we test real behavior
 * through a headless browser: inject a saved state, reload, and assert on the
 * computed numbers / DOM / persisted localStorage. Self-contained — it starts
 * its own static server and needs only `playwright` + a Chromium build.
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
const pageErrors = [];
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
  eq("Quality bars H,Cl,Co,Bu,Cr", bars, "44,20,52,23,26");

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

  await p.fill(".ts-filter", "liquid"); await p.waitForTimeout(150);
  eq("Search filters by name", (await names()).join("|"), "Liquid Hand Soap");
  await p.fill(".ts-filter", "zzznope"); await p.waitForTimeout(150);
  eq("No match shows nothing", (await names()).length, 0);
  ok("No match shows a message", !!(await p.$(".ocr-status")));
  await p.fill(".ts-filter", ""); await p.waitForTimeout(150);

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
  eq("Dilution ratio persists", (await LS(p)).recipes[0].dilution, 3);
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
  eq("Save shape keys", keys, "collapsed,currency,currentId,lastWeightUnit,librarySort,moldShape,prices,recent,recipes,scaleMode,scaleUnit,tab,theme,unit");
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

  await p.fill(".ts-filter", "soda ash");
  await p.waitForTimeout(100);
  const filtered = await p.$$eval(".ts-item", (es) => ({ n: es.length, allOpen: es.every((e) => e.open), first: es[0] ? es[0].querySelector("summary").textContent : "" }));
  ok("Filter narrows the list", filtered.n >= 1 && filtered.n <= 3);
  ok("Filter auto-expands matches", filtered.allOpen);
  has("Filter finds the soda-ash entry", filtered.first, "soda ash");

  await p.fill(".ts-filter", "zzznope");
  await p.waitForTimeout(100);
  eq("No-match hides all items", (await p.$$(".ts-item")).length, 0);
  ok("No-match shows a message", !!(await p.$(".ts-wrap .sub")));

  await p.fill(".ts-filter", "");
  await p.waitForTimeout(80);
  await p.click(".ts-item summary");
  const body = await p.evaluate(() => { const d = document.querySelector(".ts-item[open] .ts-body"); return d ? d.textContent : ""; });
  has("Entry shows a Why", body, "Why:");
  has("Entry shows a Fix", body, "Fix:");
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

/* ---------- report ---------- */
ok("No console/page errors during tests", pageErrors.length === 0, pageErrors.join(" | "));

await browser.close();
server.close();

const total = pass + fails.length;
console.log(`\n${pass}/${total} assertions passed`);
if (fails.length) {
  console.log("\nFAILURES:");
  fails.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("✓ all green");
