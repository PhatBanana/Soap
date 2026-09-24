/* The reference guides, their cross-links, and the make methods they describe.

   Part of the suite; run by tests/run.mjs, which owns the server, the browser and
   the assertion counts. Everything shared arrives in `t` — see tests/harness.mjs. */
export default async function guidesSuite(t) {
  const { COLORANTS, LS, OIL, TROUBLESHOOTING, base, eq, has, items, menu, near, newPage, ok, open, recipe, store, txt } = t;

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
   TROUBLESHOOTING REFERENCE
======================================================================= */
{
  const p = await newPage();
  await open(p, store({ oils:[OIL("olive",500)] }));
  await menu(p, "trouble");
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
    await menu(p, "rebatch");
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

  await menu(p, "label");
  await p.waitForTimeout(150);
  has("Colorant appears on the INCI label",
    await p.evaluate(() => document.querySelector(".inci-box").textContent), "Rubia Tinctorum (Madder) Root Powder");
  ok("Known colorant raises no INCI warning", !(await p.$(".inci-warn")));
  await p.evaluate(() => { document.querySelector(".modal-back").remove(); document.body.style.overflow = ""; });

  // the guide
  await menu(p, "colors");
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
   GUIDE CROSS-LINKS (troubleshooting ⇄ rebatch ⇄ colorants)
======================================================================= */
{
  const p = await newPage();
  await open(p, store({ oils:[OIL("olive",500),OIL("coconut",300)] }));
  const title = () => p.$eval("#modalRoot h3", (e) => e.textContent);
  const backdrops = async () => (await p.$$("#modalRoot .modal-back")).length;
  const expanded = () => p.$$eval("#modalRoot .ts-item[open] summary", (es) => es.map((e) => e.textContent.trim()));
  const search = async (q) => { await p.fill("#modalRoot .ts-filter", q); await p.waitForTimeout(120); };
  const follow = async (sel) => { await p.click(sel); await p.waitForTimeout(200); };
  const close = async () => { await p.click("#modalRoot .mfoot .primary"); await p.waitForTimeout(150); };

  // a fix that says "rebatch it" can now get you there
  await menu(p, "trouble"); await p.waitForTimeout(150);
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
  await menu(p, "trouble"); await p.waitForTimeout(150);
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
  await menu(p, "rebatch"); await p.waitForTimeout(150);
  eq("Rebatch links back to troubleshooting",
    await p.$$eval("#modalRoot .see-btn", (es) => es.map((e) => e.textContent).join(",")), "🔧 Troubleshooting");
  await follow("#modalRoot .see-btn");
  eq("…and it opens", await title(), "Troubleshooting");
  await close();

  // a colorant that browns links to the discoloration entry
  await menu(p, "colors"); await p.waitForTimeout(150);
  await search("botanical");
  await follow("#modalRoot .ts-item[open] .see-btn");
  eq("Botanicals link to the discoloration entry", await title(), "Troubleshooting");
  eq("…expanded on it", (await expanded()).join(","), "It discolored — turned tan or brown");
  await close();

  eq("Nothing left open at the end", await backdrops(), 0);
  ok("Page scroll is restored", await p.evaluate(() => document.body.style.overflow === ""));

  // exactly the entries that declare a `see` get a link — no dead buttons, none missing
  await menu(p, "trouble"); await p.waitForTimeout(150);
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
   MILK SOAPS — the lye step must say slush, or the milk scorches
======================================================================= */
{
  const p = await newPage();
  const stepTexts = () => p.$$eval("#checklist .txt", (ts) => ts.map((t) => t.textContent));
  const oils = [OIL("olive",600), OIL("coconut",400)];

  await open(p, store({ oils, additives:[{ name:"Goat milk", key:"goatmilk", g:300 }] }, { tab:"make" }));
  let steps = await stepTexts();
  ok("Milk recipe: the lye step says freeze it to a slush", steps.some((t) => /goat milk.*slush/i.test(t)), steps.join(" | "));
  ok("…a spoonful at a time", steps.some((t) => /spoonful at a time/i.test(t)));
  ok("…and still lye TO the liquid", steps.some((t) => /lye TO the liquid, never the reverse/i.test(t)));

  await open(p, store({ oils }, { tab:"make" }));
  steps = await stepTexts();
  ok("Plain water recipe keeps the original step", steps.some((t) => /Add the lye TO the water \(never the reverse\)/.test(t)), steps.join(" | "));
  ok("…and no slush talk", !steps.some((t) => /slush/i.test(t)));

  // aloe replaces water too, and the step should name what you actually have
  await open(p, store({ oils, additives:[{ name:"Aloe vera juice", key:"aloe", g:200 }] }, { tab:"make" }));
  steps = await stepTexts();
  ok("Aloe recipe names aloe in the step", steps.some((t) => /aloe vera juice.*slush/i.test(t)), steps.join(" | "));

  /* brine + milk together. This used to let the brine text win outright, which dropped
     the slush-and-a-spoonful instructions — the ones that stop milk scorching — and told
     you to dissolve the salt into "the water" in a recipe that might have none. Both
     jobs now share the one step. */
  await open(p, store({ oils, saltMode:"brine",
    additives:[{ name:"Salt (table/sea)", key:"salt", g:60 }, { name:"Goat milk", key:"goatmilk", g:380 }] }, { tab:"make" }));
  steps = await stepTexts();
  const both = steps.find((t) => /salt/i.test(t) && /lye/i.test(t)) || "";
  ok("Brine + milk: the salt goes into the milk", /Stir 60 g of salt into it/i.test(both) && /goat milk/i.test(both), steps.join(" | "));
  ok("…and the milk still gets slushed first", /slush/i.test(both));
  ok("…still a spoonful of lye at a time", /spoonful at a time/i.test(both));
  ok("…and nothing talks about water the recipe hasn't got", !/into the water/i.test(both), both);
  ok("…salt in, then chill, then lye — in that order",
    both.search(/salt into it/i) < both.search(/slush/i) && both.search(/slush/i) < both.search(/spoonful/i), both);

  // the milk rewrite reaches every method's checklist
  for (const method of ["hp", "cpop"]) {
    await open(p, store({ oils, method, additives:[{ name:"Goat milk", key:"goatmilk", g:300 }] }, { tab:"make" }));
    steps = await stepTexts();
    ok(`${method} checklist gets the milk step too`, steps.some((t) => /slush/i.test(t)), steps.join(" | "));
  }
  await p.close();
}

/* =======================================================================
   THE LYE STEP FOR BEER, WINE AND COFFEE — and what to mix it in

   The ingredient notes always said to boil beer flat and cook wine's alcohol off,
   but the checklist step — the one you read with lye in your hand — gave every
   replacer the milk advice and nothing else. And nothing anywhere said what to mix
   lye in, though lye eats aluminium and gives off hydrogen doing it.
======================================================================= */
{
  const p = await newPage();
  const stepTexts = () => p.$$eval("#checklist .txt", (ts) => ts.map((t) => t.textContent));
  const oils = [OIL("olive",600), OIL("coconut",400)];
  const A = (name, key, g) => ({ name, key, g });
  const lyeStep = async (additives, rec) => {
    await open(p, store(Object.assign({ oils, additives }, rec || {}), { tab:"make" }));
    return (await stepTexts()).find((t) => /lye TO the (liquid|water)|Add the lye/i.test(t)) || "";
  };

  let st = await lyeStep([A("Beer","beer",380)]);
  has("Beer: boil it flat first", st, "boil the beer until it is completely flat");
  has("…because the fizz foams over", st, "foams over when the lye goes in");
  ok("…before it's chilled and the lye goes in", st.search(/flat/) < st.search(/slush/) && st.search(/slush/) < st.search(/spoonful/), st);

  st = await lyeStep([A("Wine","wine",380)]);
  has("Wine: cook the alcohol off first", st, "simmer the wine to cook off its alcohol");

  st = await lyeStep([A("Brewed coffee","coffee",380)]);
  has("Coffee: still slushed and added slowly", st, "spoonful at a time");
  ok("…without milk's scorched-sugar warning it doesn't need", !/scorches the sugars/.test(st), st);
  ok("…and no beer or wine instructions either", !/flat|alcohol/.test(st), st);

  st = await lyeStep([A("Goat milk","goatmilk",380)]);
  has("Milk keeps its scorching warning", st, "scorches the sugars");

  st = await lyeStep([A("Wine","wine",200), A("Goat milk","goatmilk",180)]);
  has("Two replacers read as a plural", st, "wine & goat milk stand in for the water");
  has("…and each keeps its own preparation", st, "cook off its alcohol");

  st = await lyeStep([A("Goat milk","goatmilk",150)]);
  has("Part-milk: says the milk is only some of the liquid", st, "stands in for some of the water — combine the two");

  st = await lyeStep([A("Beer","beer",380), A("Salt (table/sea)","salt",60)], { saltMode:"brine" });
  ok("Beer brine: flat, then salt, then slush, then lye",
    st.search(/flat/) < st.search(/salt into it/) && st.search(/salt into it/) < st.search(/slush/) && st.search(/slush/) < st.search(/spoonful/), st);

  // what to mix it in, on every method's weighing step
  for (const method of ["cp", "hp", "cpop"]) {
    await open(p, store({ oils, method }, { tab:"make" }));
    const steps = await stepTexts();
    ok(`${method}: the weighing step says never aluminium`, steps.some((t) => /never aluminium/i.test(t)), steps.join(" | "));
    ok(`${method}: …and what to use instead`, steps.some((t) => /stainless steel or sturdy #5 \(PP\) plastic/i.test(t)));
  }
  await p.close();
}

/* =======================================================================
   WEIGH IT OUT — one amount to a screen

   The amounts must be the panel's own (they come from the same computeLye), in the
   order and containers a real make uses, with the running total a scale actually shows
   when you don't re-zero. A recipe the Safety Check fails never gets a first step.
======================================================================= */
{
  const p = await newPage();
  const A = (name, key, g) => ({ name, key, g });
  const body = () => p.evaluate(() => (document.querySelector(".weigh-modal .wg-body, .weigh-modal") || {}).innerText || "");
  // an empty step rather than null when the sheet is shut, so a sheet that closed when it
  // shouldn't have fails the assertion that expected it, instead of crashing the run
  const step = () => p.evaluate(() => {
    const m = document.querySelector(".weigh-modal");
    if (!m) return { group:"", count:"(sheet closed)", name:"", amt:"", reading:"", container:"", note:"" };
    const q = (c) => (m.querySelector(c) || {}).textContent || "";
    return { group:q(".wg-group"), count:q(".wg-count"), name:q(".wg-name"), amt:q(".wg-amt"),
             reading:q(".wg-reading"), container:q(".wg-container"), note:q(".wg-note") };
  });
  const next = async () => { await p.click(".weigh-modal .wg-foot .primary"); await p.waitForTimeout(40); };
  const walk = async () => { const out = []; for (let i = 0; i < 40; i++) { const s = await step();
    if (!s.name) break; out.push(s); await next(); } return out; };
  const close = () => p.evaluate(() => { const m = document.querySelector(".weigh-modal"); if (m) m.parentNode.click(); });

  const busy = { oils:[OIL("olive",500), OIL("coconut",300), OIL("shea",200)],
    method:"hp", sfMode:"after", sfOil:"shea", superfat:6, lyeType:"dual", dualKoh:20,
    additives:[A("Goat milk","goatmilk",150), A("Citric acid","citric",10), A("Sodium lactate","sodiumlactate",20)],
    aromas:[A("Lavender EO","lavender",20), A("Cedarwood EO","cedarwood",10)] };
  await open(p, store(busy, { tab:"make" }));
  const L = await p.evaluate(async () => { const s = await import("/src/core/state.js"); return s.computeLye(); });
  await p.click("#weighBtn"); await p.waitForTimeout(150);
  ok("The Make tab's button opens the weighing sheet", (await step()).count !== "(sheet closed)");
  eq("It starts at the first step", (await step()).count, "Step 1 of 12");
  const st = await walk();
  eq("Every amount gets its own step", st.length, 12);
  eq("…in make order: oils, held back, liquid, lye, additives, scents",
     [...new Set(st.map((x) => x.group))].join(","), "Oils,Held back,Liquid,Lye,Additives,Scents");
  const by = (n) => st.find((x) => x.name === n) || {};
  eq("NaOH is the panel's own figure, to two decimals", by("Sodium hydroxide (NaOH)").amt, L.naohG.toFixed(2) + " g");
  eq("…and so is the KOH", by("Potassium hydroxide (KOH)").amt, L.kohG.toFixed(2) + " g");
  has("…with the purity it assumes", by("Potassium hydroxide (KOH)").note, "90% pure KOH");
  has("The lye step starts a new, dry container", by("Sodium hydroxide (NaOH)").container, "DRY cup");
  has("…with gloves and goggles", by("Sodium hydroxide (NaOH)").container, "Gloves and eye protection");
  has("…and each lye zeroed on its own", by("Sodium hydroxide (NaOH)").container, "Zero the scale for each lye");
  eq("Water is what you pour, net of the milk", by("Water").amt, "230 g");
  has("The milk goes in the lye jug, slushed", by("Goat milk").note, "slush");
  eq("Citric acid is weighed into the liquid, before the lye", by("Citric acid").group, "Liquid");
  eq("Sodium lactate isn't — it goes in later", by("Sodium lactate").group, "Additives");
  has("The jug is lye-safe, never aluminium", by("Water").container, "never aluminium");
  eq("The held-back shea stays out of the pot", st.find((x) => x.group === "Oils" && x.name === "Shea butter").amt, "140 g");
  eq("…and is weighed into its own cup", st.find((x) => x.group === "Held back").amt, "60 g");
  eq("…by its proper name", st.find((x) => x.group === "Held back").name, "Shea butter");
  has("The oils give the running scale reading", by("Coconut oil (76°)").reading, "800 g");
  has("…all the way to the last oil", st.find((x) => x.group === "Oils" && x.name === "Shea butter").reading, "940 g");
  has("The liquid jug keeps its own running total", by("Citric acid").reading, "390 g");
  has("The scent cup too", by("Cedarwood EO").reading, "30 g");
  eq("The first item in a container has no reading to check", by("Olive oil").reading, "");
  eq("Nor does the lye — each is zeroed", by("Potassium hydroxide (KOH)").reading, "");
  has("The end says so, and says lye TO the liquid", await body(), "lye TO the liquid, never the reverse");
  await p.click(".weigh-modal .wg-foot .ghost, .weigh-modal .mfoot .ghost"); await p.waitForTimeout(40);
  eq("Start again goes back to step 1", (await step()).count, "Step 1 of 12");
  await close();

  // --- progress survives a stray tap; a changed recipe starts over ---
  await p.click("#weighBtn"); await p.waitForTimeout(80);
  await next(); await next(); await next();
  await close(); await p.waitForTimeout(40);
  eq("A tap outside closes the sheet", await p.evaluate(() => !!document.querySelector(".weigh-modal")), false);
  await p.click("#weighBtn"); await p.waitForTimeout(80);
  eq("…and reopening resumes on the same step", (await step()).count, "Step 4 of 12");
  await p.click(".weigh-modal .wg-foot .ghost"); await p.waitForTimeout(40);
  eq("Back goes back a step", (await step()).count, "Step 3 of 12");
  await close();
  await p.evaluate(async () => { const s = await import("/src/core/state.js"); s.state.oils[0].g = 520; });
  await p.click("#weighBtn"); await p.waitForTimeout(80);
  eq("Change an amount and it starts again", (await step()).count, "Step 1 of 12");
  eq("…with the new amount", (await step()).amt, "520 g");
  eq("The screen is held on while weighing", await p.evaluate(async () => (await import("/src/ui/render.js")).makeInProgress()), true);
  await close();
  await p.evaluate(async () => { const s = await import("/src/core/state.js"); s.state.tab = "base"; s.state.checklist = {}; });
  eq("…and let go once the sheet is closed", await p.evaluate(async () => (await import("/src/ui/render.js")).makeInProgress()), false);

  // --- the menu reaches it too, and a first step's back button closes ---
  await open(p, store({ oils:[OIL("olive",700), OIL("coconut",300)] }));
  await menu(p, "weigh"); await p.waitForTimeout(80);
  eq("The ☰ menu opens it as well", (await step()).count, "Step 1 of 4");
  eq("On step 1 the back button reads Close", await p.$eval(".weigh-modal .wg-foot .ghost", (b) => b.textContent), "Close");
  eq("A plain bar has no held-back step", (await walk()).some((x) => x.group === "Held back"), false);
  await close();

  // --- units: oz throughout, lye still to two decimals ---
  await open(p, store({ oils:[OIL("olive",700), OIL("coconut",300)] }, { unit:"oz" }));
  const Loz = await p.evaluate(async () => (await import("/src/core/state.js")).computeLye().naohG / 28.349523125);
  await menu(p, "weigh"); await p.waitForTimeout(80);
  const oz = await walk();
  eq("In ounces the oils are ounces", oz[0].amt, "24.69 oz");
  eq("…and the lye is still to two decimals", oz.find((x) => /NaOH/.test(x.name)).amt, Loz.toFixed(2) + " oz");
  await close();

  // --- where salt goes depends on the method ---
  await open(p, store({ oils:[OIL("olive",700), OIL("coconut",300)], saltMode:"brine", additives:[A("Salt (table/sea)","salt",40)] }));
  await menu(p, "weigh"); await p.waitForTimeout(80);
  eq("Brine salt is weighed into the liquid", (await walk()).find((x) => /Salt/.test(x.name)).group, "Liquid");
  await close();
  await open(p, store({ oils:[OIL("olive",700), OIL("coconut",300)], saltMode:"trace", additives:[A("Salt (table/sea)","salt",40)] }));
  await menu(p, "weigh"); await p.waitForTimeout(80);
  eq("Salt for trace is an additive", (await walk()).find((x) => /Salt/.test(x.name)).group, "Additives");
  await close();

  // --- a reserve spread across all the oils: weigh the blend out after melting ---
  await open(p, store({ oils:[OIL("olive",700), OIL("coconut",300)], method:"hp", sfMode:"after", sfOil:"", superfat:5 }));
  await menu(p, "weigh"); await p.waitForTimeout(80);
  const spread = (await walk()).find((x) => x.group === "Held back");
  eq("A spread reserve is weighed from the melted blend", spread.name, "Melted oil blend");
  eq("…at the superfat's share of the oils", spread.amt, "50 g");
  await close();

  // --- no first step for a recipe the Safety Check fails, or for nothing ---
  await open(p, store({ oils:[OIL("olive",1000)] }, { sapOverrides:{ olive:0.188 } }));
  await menu(p, "weigh"); await p.waitForTimeout(80);
  has("An unsafe recipe gets a stop, not a first step", await body(), "Not safe to make as-is");
  eq("…with nothing to tick", await p.evaluate(() => !!document.querySelector(".weigh-modal .wg-amt")), false);
  await close();
  await open(p, store({ oils:[] }));
  await menu(p, "weigh"); await p.waitForTimeout(80);
  has("An empty recipe says there's nothing to weigh", await body(), "Add some oils first");
  await p.close();
}

}
