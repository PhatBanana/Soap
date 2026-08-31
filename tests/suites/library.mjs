/* Recipes you have saved, the cupboard behind them, and what gets written to disk.

   Part of the suite; run by tests/run.mjs, which owns the server, the browser and
   the assertion counts. Everything shared arrives in `t` — see tests/harness.mjs. */
export default async function librarySuite(t) {
  const { LS, OIL, addOil, base, eq, fs, has, items, menu, near, newPage, num, ok, open, recipe, store, txt } = t;

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
    await menu(p, "shopping");
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
  await menu(p, "stock");
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

  await menu(p, "library");
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
  eq("Batch record keys", Object.keys(bs[0]).sort().join(","), "checks,cureWeeks,formula,id,lot,madeOn,notes,weighed");

  /* The snapshot is the point of the batch log: what bar #1 was actually made from,
     immune to every later edit of the recipe. */
  {
    const p2 = await newPage();
    // #lyeVal is the base tab's panel and only repaints while that tab renders, so the
    // reference figure is read there before switching to Make to log the batch
    await open(p2, store({ oils:[OIL("olive",600),OIL("coconut",400)], superfat:5,
      madeOn:"2026-08-01", checklist:{s0:true} }, { tab:"base", sapOverrides:{ coconut:0.191 } }));
    const lyeAtMake = await num(p2, "#lyeVal");
    await p2.evaluate(() => { document.querySelectorAll("#tabs button")[2].click(); });
    await p2.waitForTimeout(250);
    await p2.evaluate(() => document.getElementById("logBatch").click());
    await p2.waitForTimeout(300);
    let b = (await LS(p2)).recipes[0].batches[0];
    eq("Snapshot keeps the oils", b.formula.oils.map((o) => o.key + ":" + o.g).join(","), "olive:600,coconut:400");
    eq("Snapshot keeps the superfat", b.formula.superfat, 5);
    eq("Snapshot keeps the supplier SAP in force", b.formula.sapOv.coconut, 0.191);
    near("Weighed lye is the panel figure at make time", b.weighed.lyeG, lyeAtMake, 0.01);
    ok("Snapshot carries no personal fields", !("notes" in b.formula) && !("batches" in b.formula) && !("madeOn" in b.formula),
       Object.keys(b.formula).join(","));

    // now vandalise the recipe — the record must not move
    await p2.evaluate(() => { document.querySelectorAll("#tabs button")[0].click(); });
    await p2.waitForTimeout(200);
    await p2.evaluate(() => document.querySelectorAll("#oilList .del")[1].click());
    await p2.waitForTimeout(200);
    await p2.fill("#sf", "12").catch(() => {});
    await p2.evaluate(() => { const sf = document.getElementById("sf"); sf.value = 12; sf.dispatchEvent(new Event("input")); });
    await p2.waitForTimeout(400);
    b = (await LS(p2)).recipes[0].batches[0];
    eq("Editing the recipe cannot rewrite the batch record",
       b.formula.oils.map((o) => o.key + ":" + o.g).join(",") + "|sf" + b.formula.superfat, "olive:600,coconut:400|sf5");

    // and the record survives a reload through the schema
    await p2.reload(); await p2.waitForTimeout(250);
    b = (await LS(p2)).recipes[0].batches[0];
    eq("Snapshot survives the schema round-trip", b.formula.oils.length + "-" + b.formula.superfat + "-" + b.formula.sapOv.coconut, "2-5-0.191");

    // Use this formula: the recipe returns to what was made
    await p2.evaluate(() => { document.querySelectorAll("#tabs button")[2].click(); });
    await p2.waitForTimeout(250);
    p2.on("dialog", (d) => d.accept());
    await p2.evaluate(() => { document.querySelector(".bh-formula").open = true;
      document.querySelector(".bh-formula .cs-apply").click(); });
    await p2.waitForTimeout(350);
    const r = (await LS(p2)).recipes[0];
    eq("Restore brings back the oils", r.oils.map((o) => o.key + ":" + o.g).join(","), "olive:600,coconut:400");
    eq("Restore brings back the superfat", r.superfat, 5);
    eq("Restore leaves the batch history alone", r.batches.length, 1);
    await p2.evaluate(() => { document.querySelectorAll("#tabs button")[0].click(); });
    await p2.waitForTimeout(250);
    near("…and the lye is the figure that was weighed", await num(p2, "#lyeVal"), lyeAtMake, 0.05);

    // a malformed snapshot in storage must coerce, not crash
    await open(p2, store({ oils:[OIL("olive",500)],
      batches:[{ id:"b1", madeOn:"2026-08-01", lot:"", cureWeeks:4, notes:"", checks:[],
        formula:{ oils:[{name:"x",key:"nope",g:-4},{name:"Real",key:"coconut",g:200}], superfat:99, sapOv:{coconut:9,olive:0.13} },
        weighed:{ lyeG:"junk", waterAddG:120 } }] }));
    const cb = (await LS(p2) , await p2.evaluate(() => { const s=JSON.parse(localStorage.getItem("soapcalc.v4")); return s; }));
    await addOil(p2, "castor", 1);   // force a save through the schema
    const b2 = (await LS(p2)).recipes[0].batches[0];
    eq("Bad snapshot rows are dropped or repaired", b2.formula.oils.map((o) => o.key + ":" + o.g).join(","), "coconut:200");
    eq("Bad snapshot scalars are coerced", b2.formula.superfat, 15);
    eq("Bad snapshot overrides are filtered", JSON.stringify(b2.formula.sapOv), JSON.stringify({ olive:0.13 }));
    eq("Bad weighed values are dropped, good ones kept", JSON.stringify(Object.keys(b2.weighed)), JSON.stringify(["waterAddG","kind"]));
    await p2.close();
  }
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

  await menu(p, "library");
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
  await menu(p, "shopping");
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
  await menu(p, "dup");
  const dup = await p.evaluate(() => {
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
  await menu(p, "delete");
  const cleared = await p.evaluate(() => {
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
   SHOPPING LIST IN PRINT
======================================================================= */
{
  const p = await newPage();
  await open(p, store({ id:"r1", name:"Kitchen Bar", oils:[OIL("olive",500),OIL("coconut",300)],
    additives:[{name:"Kaolin clay",key:"kaolin",g:20}] }, { stock:{ olive: 5000 } }));
  await menu(p, "shopping");
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
    await menu(p, "library");
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
  await menu(p, "stock");
  await p.waitForTimeout(180);
  has("Inventory still reports coverage", await p.$eval("#modalRoot .subinfo", (e) => e.textContent), "enough of everything");
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
  await menu(p, "dup");
  await p.waitForTimeout(250);
  const st = await LS(p);
  eq("Duplicate wrote both recipes", st.recipes.length, 2);
  ok("Duplicate is the current one", st.currentId !== "rA");
  await p.close();
}

/* =======================================================================
   STORAGE FAILURE — the app must never overwrite data it failed to read.

   Before this, one transient error inside load() showed an empty library, and
   the first thing you added overwrote every saved recipe. The data was still on
   disk the whole time, right up until that save. Silently.
======================================================================= */
{
  const precious = {
    unit: "g", tab: "base", currentId: "r1",
    recipes: [
      recipe({ id:"r1", name:"Lavender Bar", oils:[OIL("olive",600),OIL("coconut",400)],
               batches:[{ id:"b1", madeOn:"2026-01-04", lot:"A", cureWeeks:4, notes:"best yet", checks:[] }] }),
      recipe({ id:"r2", name:"Gift Soap", oils:[OIL("olive",1000)] }),
      recipe({ id:"r3", name:"Shampoo Bar", oils:[OIL("coconut",800)] })
    ]
  };
  const onDisk = (p) => p.evaluate(() =>
    JSON.parse(localStorage.getItem("soapcalc.v4")).recipes.map((r) => r.name).join("|"));

  const p = await newPage();
  // break JSON.parse exactly once, before any app code runs — stands in for any throw
  // inside load(): a bad coercion, a schema slip, corrupt storage
  await p.addInitScript(() => {
    const real = JSON.parse; let fired = false;
    JSON.parse = function (...a) {
      if (!fired && String(a[0]).includes('"recipes"')) { fired = true; throw new TypeError("transient"); }
      return real.apply(this, a);
    };
  });
  await p.goto(base + "/index.html");
  await p.evaluate((s) => localStorage.setItem("soapcalc.v4", JSON.stringify(s)), precious);
  await p.reload(); await p.waitForTimeout(300);

  eq("A failed load leaves the saved recipes untouched", await onDisk(p), "Lavender Bar|Gift Soap|Shampoo Bar");
  ok("…and says so instead of looking empty",
    await p.evaluate(() => !document.getElementById("loadWarn").classList.contains("hide")));
  has("…naming what happened", await txt(p, "#loadWarn"), "Couldn't read your saved recipes");
  eq("…offering rescue before anything else",
    await p.evaluate(() => [...document.querySelectorAll("#loadWarn button")].map((b) => b.textContent).join("/")),
    "Reload/Download a copy/Start fresh");

  // the actual disaster: user sees an empty app and starts working
  await addOil(p, "olive", 500);
  await p.waitForTimeout(250);
  eq("Editing after a failed load still does not overwrite them",
    await onDisk(p), "Lavender Bar|Gift Soap|Shampoo Bar");

  // starting over has to be a deliberate act, and has to actually work
  p.on("dialog", (d) => d.accept());
  await p.click("#lwFresh"); await p.waitForTimeout(250);
  eq("Start fresh, once chosen, does write", await onDisk(p), "My recipe");
  await p.close();
}

{
  // A save that fails silently is worse than one that errors: you carry on believing the
  // batch is logged. Quota and Safari's private mode both throw at setItem.
  const p = await newPage();
  // armed only after the fixture is seeded, or the test breaks its own setup
  await p.addInitScript(() => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (window.__fullDisk && k === "soapcalc.v4") throw new DOMException("QuotaExceededError");
      return real.call(this, k, v);
    };
  });
  await open(p, store({ oils:[OIL("olive",500)] }));
  await p.evaluate(() => { window.__fullDisk = true; });
  await addOil(p, "coconut", 200);
  await p.waitForTimeout(250);
  ok("A storage write that fails is reported, not swallowed",
    await p.evaluate(() => !document.getElementById("saveWarn").classList.contains("hide")));
  has("…and says what to do about it", await txt(p, "#saveWarn"), "Back up all");
  await p.close();
}

}
