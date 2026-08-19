/* The Safety Check, the advice that reacts to a blend, and the first-aid guide.

   Part of the suite; run by tests/run.mjs, which owns the server, the browser and
   the assertion counts. Everything shared arrives in `t` — see tests/harness.mjs. */
export default async function safetySuite(t) {
  const { ADDITIVES, OIL, OILS, eq, has, items, menu, near, newPage, ok, open, recipe, store, txt } = t;

/* =======================================================================
   SAFETY CHECK
======================================================================= */
{
  const p = await newPage();
  const verdictClass = () => p.evaluate(() => document.getElementById("safetyVerdict").className);

  await open(p, store({ oils:[OIL("olive",500),OIL("coconut",300),OIL("palm",200)] }));
  has("Balanced bar → ok verdict", await verdictClass(), "ok");

  await open(p, store({ oils:[OIL("coconut",1000)], superfat:0 }));
  ok("0% superfat skin → warns no cushion", (await items(p)).includes("No superfat cushion"));

  await open(p, store({ oils:[OIL("coconut",1000)], superfat:0, use:"laundry" }));
  has("0% superfat laundry → ok verdict", await verdictClass(), "ok");

  await open(p, store({ oils:[OIL("olive",500), { name:"Mystery", key:null, g:500 }] }));
  ok("Custom oil → warns not in lye math", (await items(p)).includes("Custom oils aren't in the lye math"));

  await open(p, store({ oils:[OIL("coconut",1000)], superfat:5 }));
  ok("100% coconut skin → lauric warning", (await items(p)).includes("Very high lauric oil"));
  /* The warning used to run off a hardcoded ["coconut","palmkernel","babassu"], so the
     lauric oils added later were silently exempt — murumuru is 85% lauric-family, more
     than coconut's 79%. It is derived from the fatty-acid data now, so this asserts the
     derivation rather than a second copy of the list. */
  const lauricOils = Object.keys(OILS).filter((k) => {
    const f = OILS[k].fa || {};
    return (f.la || 0) + (f.my || 0) + (f.cy || 0) + (f.cp || 0) >= 50;
  });
  ok("Every lauric oil is derived, not listed", lauricOils.length >= 6, lauricOils.join(","));
  for (const k of lauricOils) {
    await open(p, store({ oils:[OIL(k, 1000)], superfat:5 }));
    ok(`100% ${k} warns too`, (await items(p)).includes("Very high lauric oil"));
  }
  await open(p, store({ oils:[OIL("murumuru",1000)], superfat:5 }));
  has("…and it names the oil in the recipe, not always coconut",
      await p.$$eval("#safetyList .safety-item .si-detail", (es) => es.map((e) => e.textContent).join(" ")),
      "Murumuru");
  // an oil nowhere near the family must not trip it
  await open(p, store({ oils:[OIL("olive",1000)], superfat:5 }));
  ok("100% olive does not", !(await items(p)).includes("Very high lauric oil"));

  await open(p, store({ oils:[OIL("coconut",1000)], additives:[{name:"Salt",key:"salt",g:500}], superfat:5 }));
  ok("Salt bar low superfat → warns", (await items(p)).includes("Salt bar needs more superfat"));

  await open(p, store({ oils:[OIL("olive",600),OIL("coconut",400)], waterPct:50 }));
  ok("High water → very dilute lye warning", (await items(p)).includes("Very dilute lye"));

  await open(p, store({ oils:[OIL("olive",600),OIL("coconut",370),OIL("beeswax",30)], aromas:[{name:"Cinnamon",key:"cinnamon",g:8}] }));
  const fastItems = await items(p);
  ok("Beeswax/cinnamon → fast-trace warning", fastItems.includes("Fast trace ahead"));
  ok("Cinnamon → skin-irritant warning", fastItems.includes("Skin-irritant scents"));

  await open(p, store({ oils:[OIL("olive",36),OIL("coconut",24)] })); // 60 g oils
  ok("Tiny batch → small-batch warning", (await items(p)).includes("Very small batch"));

  await open(p, store({ oils:[OIL("palm",1000)] }));
  ok("100% palm → single-oil typo warning", (await items(p)).includes("Nearly a single-oil recipe"));
  await open(p, store({ oils:[OIL("olive",1000)] }));
  ok("100% olive (castile) → NOT flagged single-oil", !(await items(p)).includes("Nearly a single-oil recipe"));
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

  /* CP and CPOP each used to keep their own list of the additives that run a batch hot —
     a name regex on one side, four hardcoded keys on the other — so a beer soap was
     warned under CPOP and told there was nothing to watch under CP. Both read the data
     flag now, so this walks every flagged additive through both methods. */
  const hotKeys = Object.keys(ADDITIVES).filter((k) => ADDITIVES[k].hot);
  ok("Hot additives are flagged in the data", hotKeys.length >= 8, hotKeys.join(","));
  for (const k of hotKeys) {
    const oils = [OIL("olive",600),OIL("coconut",400)], add = [{ name:ADDITIVES[k].name, key:k, g:20 }];
    has(`CP warns about ${k}`,  await tip({ oils, additives:add, method:"cp" }), "cooler");
    has(`CPOP warns about ${k}`, await tip({ oils, additives:add, method:"cpop" }), "run hotter still");
  }
  // a plain additive must not trip either
  has("CP is quiet about kaolin",
      await tip({ oils:[OIL("olive",600),OIL("coconut",400)], additives:[{name:"Kaolin clay",key:"kaolin",g:20}], method:"cp" }), "~100°F");
  ok("CPOP is quiet about kaolin",
     !(await tip({ oils:[OIL("olive",600),OIL("coconut",400)], additives:[{name:"Kaolin clay",key:"kaolin",g:20}], method:"cpop" })).includes("run hotter still"));
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

}
