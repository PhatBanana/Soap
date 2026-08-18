/* Working on a recipe: scaling, moulds, bar weight, undo, the tabs and the menu.

   Part of the suite; run by tests/run.mjs, which owns the server, the browser and
   the assertion counts. Everything shared arrives in `t` — see tests/harness.mjs. */
export default async function recipeSuite(t) {
  const { LS, OIL, addOil, base, browser, eq, has, menu, near, newPage, num, ok, open, path, recipe, store, txt } = t;

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
  const tap = async () => { await menu(p, "theme"); await p.waitForTimeout(120); };
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
   MENU SEARCH
======================================================================= */
{
  const p = await newPage();
  await open(p, store({ oils:[OIL("olive",500)] }));
  const openMenu = () => p.evaluate(() => document.getElementById("menuBtn").click());  // sheet only, no action
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

}
