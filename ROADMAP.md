# 🧼 Soap Calc — Roadmap

Where the app is today, and where it could go next.

**Scope:** a soap calculator for **personal use and gifting**, that works on a phone
in the kitchen, offline, with no account and nothing leaving the device. Everything
below is judged against that.

**Today:** v57 · 65 oils · 45 additives · 22 colorants · 33 aromas ·
17 example recipes · 1741 test assertions, run on every pull request.

<sub>Those counts are checked against `src/data/` by the test suite, so they can't
quietly drift — they had, which is why the check exists.</sub>

---

## Part 1 — What exists

### Recipe & units
- Enter oils and additives once; switch the whole recipe between **g / oz / lb / kg / %**
  from the app-bar unit picker.
- **65 oils, butters & fats** and **45 additives** (including 12 natural and mineral
  colorants), focused on what you can actually buy, each with a plain-language
  **?** description (what it brings, its standout trait, a
  typical usage %). Custom ingredients allowed, and flagged as outside the lye maths.
- **Quick-add chips** for the ingredients you've been using.

### Lye, water & dilution
- Lye computed **per oil** from its SAP value, reduced by superfat — **NaOH** for bars,
  **KOH** (with purity) for liquid soap.
- **Three water methods:** % of oils · lye concentration · water:lye ratio. The panel
  always shows the numbers you aren't setting.
- **Dilute the Paste** — for KOH recipes, works out the water to add and the finished
  volume of liquid soap.

### Soap profile & shaping
- Hardness, Cleansing, Conditioning, Bubbly and Creamy lather, plus Iodine and INS,
  shown against recommended ranges, each with a tap-to-explain **?**.
- **Shape it:** per-oil sliders, or one tap for Harder / More moisturizing /
  Better lather / Gentler, with live balance feedback.
- **Recipe Notes** that react to the blend *and* to what it's **made for** — body,
  facial, shampoo, shaving, dish or laundry each get different advice.

### Safety
- A **Safety Check** turning the numbers into a plain **pass / review / stop** verdict,
  computed entirely on-device: missing lye cushion, unverifiable custom oils, superfat
  extremes, lye too strong or too dilute, scents over their typical max, DOS-prone
  blends, plus beginner traps (100% coconut, salt bars, fast-tracing recipes,
  irritant essential oils) and batch-scale sanity checks.
- An **optional AI explainer** where the browser has an on-device model — it rephrases
  the findings, it never decides. The rule-based verdict always wins.

### Yield, scaling & moulds
- Expected yield, **after-curing estimate**, and a **bar weight saved per recipe**.
- Scale to a target **batch weight / total oils / number of bars / mould**, with its own
  unit picker. Moulds: **loaf, round or cavity**.
- **Round to tidy amounts** so you're not weighing 793.83 g.

### Scents
- Separate scent list with usage rates, **typical-rate caps**, scent-load readout and a
  **note pyramid** (top / middle / base).
- **Set recommended amounts** sizes the blend to ~3% of oils, capped per scent.
- **Blending notes** based on the scents actually in the recipe.

### Making it
- **Cold process, CP + oven (CPOP), or hot process** — the method drives the checklist, the temperature
  guidance and the cure estimate.
- **Cure schedule** with a suggested cure time derived from the oil blend.
- **Soaping temperatures**, with a tip that adapts to your recipe.
- **Step-by-step checklist**, **batch notes**, and an optional **lot number**.
- **Cure checks** — zap tests and pH readings filed onto the batch that made the bar.
- **Brine or dry salt** — soleseife or a salt bar, with the solubility checked.
- **Can make now** — the library badged against your cupboard, and filterable.
- **Dual lye** — NaOH and KOH in one batch, with both weights quoted separately.
- **Chelators** — citric acid raises the lye to cover what it neutralises; sodium
  citrate and sodium gluconate need no adjustment.
- **SAP values** — override any oil with your supplier's figure; custom oils can
  carry their own and count toward the lye.
- **Troubleshooting** — a searchable "why did my soap do X?" guide.
- **Rebatch helper** — liquid to add and the method for saving a failed batch.
- **Colorant guide** — dose, dispersal and what survives soap's pH, by colour family.
- The three guides **cross-link**: a fix that says "rebatch it" opens the rebatch
  helper, and a colour problem opens the colorant that caused it.

### Costs & planning
- Price book (price per kg), **batch total and cost per bar**.
- **Shopping list** across several recipes, with NaOH and KOH totalled separately.
  Printable, with a tick box against every line.

### Library & output
- Saved recipes with **search, sort and favourites**; compare any two.
- **Recipe card**, **INCI ingredient label**, **printable bar wrapper**.
- **Share by link** (the recipe rides inside the URL), **CSV import/export**,
  **photo OCR**, and **paste a recipe** from another calculator.

### The app itself
- **Installable PWA**, fully offline, auto-updating, with a version footer.
- **Backup / restore** everything as JSON.
- Collapsible cards, sticky lye/batch summary, theme toggle, **multi-level undo**.
- **Searchable menu** — the ☰ sheet is 26 actions deep, so it takes a query, matched
  against synonyms as well as labels (`csv` finds Import, `print` finds all four
  printable outputs).
- **The screen stays on while you're making soap** — held from the first ticked
  checklist step until you leave the Make tab, and always visible and switchable.
- A **behaviour test suite** covering the chemistry, safety rules, scaling and storage,
  run automatically on every pull request.

---

## Part 2 — The build log

Everything below shipped. Kept rather than folded away, because the interesting part is
usually what each one turned out to require — the chemistry that was nearly wrong, the
refactor that unified three cases, the bugs that surfaced on the way.

### Tier 1 — the real gaps  ·  ✅ all shipped (v33–v35)

**1. Batch log (make history)** — ✅ **shipped in v33**
Tap **Log this batch** and the date, lot, cure time and notes are filed into a
per-recipe history; the checklist clears for the next make. Every make is kept, so
remaking a recipe no longer overwrites the record of the last one, and the library
shows how many times each recipe has been made.

**2. Ingredient inventory → a smarter shopping list** — ✅ **shipped in v34**
Record what's in the cupboard and the shopping list shows *need · have → buy*, greys
out anything you already have enough of, and prices only the shortfall. Inventory also
answers "can I make this today?" for the current recipe, and logging a batch draws
down what it used. Fully optional — track nothing and everything behaves as before.

**3. Hot-process superfat** — ✅ **shipped in v35**
Hot-process recipes can now treat superfat as either a **lye discount** or an oil
**added after the cook**. Pick an oil to hold back and the lye is sized to fully
saponify only what goes in the pot; the reserve is quoted back to you in the Lye card
and on the hot-process checklist step where you'd stir it in. Holding back a specific
oil genuinely changes the lye whenever its SAP differs from the blend average — e.g.
reserving 50 g of shea from a 1 kg blend needs 140.2 g NaOH rather than 139.3 g.

### Tier 2 — useful, narrower  ·  ✅ all shipped (v36–v38)

**4. Rebatch helper** — ✅ **shipped in v36**
The troubleshooting guide used to tell you to rebatch without telling you the amounts.
Now **♻️ Rebatch** takes the weight of soap you're saving (prefilled from the current
recipe's cured estimate, in whatever unit you're working in) and gives the liquid to
add for a **firm**, **typical** or **pourable** mash, plus the method — and the point
that matters: a bar that *zaps* is lye-heavy, and rebatching alone won't fix it.

**5. Colorant guidance** — ✅ **shipped in v37**
**🎨 Colorants** is a searchable guide grouped by colour family: dose per pound of oils,
how to disperse it, and what high pH does to it — including the disappointments
(turmeric and spirulina fade, alkanet shifts, natural reds stop at coral, botanicals go
brown). **12 natural and mineral colorants** joined the ingredient list as ordinary
additives, so they flow through costs, inventory, the shopping list and the INCI label
with no structural change.

**6. Cure / pH check log** — ✅ **shipped in v38**
Each logged batch takes **cure checks**: date, optional pH, a yes/no zap and a note.
They list oldest-first with the week worked out from the make date, so a bar reads
*week 1: ⚡ zaps, pH 11* → *week 4: ✓ no zap, pH 9*. Stored on the batch record rather
than in a parallel list, so it backs up, restores and sanitizes with everything else.

### Tier 3 — platform  ·  ✅ shipped (v41–v44)

**7. CI running the test suite on pull requests** — ✅ **shipped**
Every pull request now runs the full suite. The storage worry that kept this off the
list turned out to be avoidable rather than manageable: the workflow uploads **no
artifacts at all**, so it consumes no repository storage — logs aren't billed as
storage, and anything a log can't explain is reproduced locally with `npm test`.
Shipped alongside **release-hygiene assertions**: the service-worker cache name must
be bumped with `APP_VERSION`, every precached file must exist, and the footer must
show the version. That coupling was hand-maintained for 40 releases and is exactly
what leaves a phone on a stale copy when it slips.

**8. Import from other calculators** — ✅ **shipped in v41**
Rather than three brittle file-format parsers, **📋 Paste a recipe** reads the text
those tools actually print. It handles a `% / lb / oz / g` column table (preferring the
most precise column), one-unit-per-line, and plain percentages (asking for a total oil
weight to scale to). Settings ride along — superfat, water %, lye concentration,
water:lye ratio, NaOH vs KOH — clamped by the recipe schema's own coercions so a
pasted value can't land outside the app's ranges. Lye and water lines are recognised
and skipped rather than becoming ingredients, and name matching was rewritten to score
word overlap so *"Palm Kernel Flakes"* beats plain palm and *"Coconut Oil"* isn't
claimed by the additive *coconut milk*. Everything lands on the existing review screen
before it touches the recipe.

**9. Data growth** — supplier SAP overrides ✅ **shipped in v43**; more oils and
fragrance oils still to come.
**🧪 SAP values** takes your supplier's figure (as mg KOH/g or g NaOH/g) and sizes the
lye on it, and a **custom oil can now carry its own SAP** so it joins the lye maths
rather than being excluded. Between them the database size stops being a hard limit:
any oil, from any supplier, with their number. Overrides are surfaced on the Lye card
and in the Safety Check, because non-standard numbers you've forgotten about are worse
than no numbers.

**10. Print stylesheet for the shopping list** — ✅ **shipped in v44**
A 🖨 Print button and a real paper layout: a tick box against every line, the chosen
recipes and the date across the top, the picker and buttons dropped, black on white,
and sections that don't break across pages. Inventory-covered items are struck through
rather than greyed, because colour carries no meaning on a mono printer.

### Tier 4 — chemistry the app couldn't express  ·  ✅ all shipped (v45–v48)

**11. Additives that consume lye** — ✅ **shipped in v45**
`computeLye()` iterated the oil list and nothing else, so no additive ever touched the
lye. Correct for almost all of them — sodium lactate really is lye-neutral — but not for
acids, and citric acid is the standard defence against DOS. You could add it and the app
would quietly keep the lye unchanged, leaving the batch short.

**Citric acid** now carries a `lyeFactor` of **0.6246** (3 carboxyl groups, MW 192.12)
and the lye is sized up to match, with **sodium citrate** and **sodium gluconate** added
as the pre-neutralised alternatives that need no adjustment. `acidLyeOf()` is the single
place that decides, following the `sapOf()` precedent.

The detail worth recording: the acid's lye sits **outside** the superfat discount and
**before** the KOH conversion. An earlier draft of this entry said "before superfat is
applied", which is wrong — superfat leaves oil unsaponified and has nothing to do with
neutralising an acid, so discounting it would leave the batch short. Placing it before
the KOH conversion also makes that case fall out for free: 0.6246 × 1.40274 = 0.8762,
exactly 3 × 56.11 / 192.12. The adjustment is disclosed on the Lye card and in the
Safety Check, an over-dose is flagged, and an acid typed in as a *custom* additive —
which gets no adjustment — raises a stop-level warning.

**12. Dual lye — NaOH and KOH in one batch** — ✅ **shipped in v46**
`lyeType` used to coerce to exactly `"naoh"` or `"koh"`, which ruled out shaving and
cream soaps entirely. A third **Both** mode adds a slider for the share of the
saponification each lye does.

It unified rather than added: all three modes are now one expression, with `kohShare` at
0, 1 or in between, so the existing NaOH and KOH assertions were the regression test for
the refactor. `computeLye()` returns the two weights separately, because a combined total
isn't something you can weigh out — and every consumer that cares *which* chemical
(inventory draw-down, shopping totals, the INCI label, which now carries both salts) reads
the split instead of branching on `lyeType`. Shipped with two worked examples, **Soft
Shaving Soap** and **Whipped Cream Soap**.

Two latent bugs surfaced while building it, both the same shape — a hand-kept list that
silently drops what isn't on it. `curRV()` listed recipe fields by hand, so `dualKoh`
never reached the maths; it's now built from `RECIPE_FIELDS`. The examples modal had a
hard-coded category list, so a new category vanished without error; unknown categories
now render.

**13. "Which recipes can I make today?"** — ✅ **shipped in v47**
Inventory answered this for the open recipe only. The per-recipe check moved out of the
inventory modal into `stockShortfall()`, and the library now badges every recipe **✓ can
make** or **short N**, with a chip to filter to just the covered ones.

Inventory stays opt-in: with an empty cupboard no badge or chip appears and the library
looks exactly as before. A recipe none of whose ingredients you track gets **no badge** —
saying "can make" there would be a guess, not an answer.

**14. Brine for salt bars** — ✅ **shipped in v48**
Salt was always assumed to go in dry at trace. It can also be dissolved into the water
first — brine soap / *soleseife* — which is a different soap, and there was no way to say
which you meant.

A **Salt goes in** control appears whenever a recipe has salt, and brine mode shows the
strength in g of salt per 100 g of water. The value is the validation: salt stops
dissolving around **35.9 g per 100 g** at room temperature, and the lye competes for the
same water. The app's own *Coconut Salt Spa Bar* is 500 g of salt against 330 g of water
— **152 g per 100 g**, over four times the ceiling — so it says plainly that it won't
dissolve and suggests the weight that would. The cold- and hot-process checklists rewrite
their lye step to put the salt in first.

No chemistry moved: salt neither saponifies nor consumes lye, and an assertion pins that
the lye and water are identical in both modes.

**15. A UX pass** — ✅ **shipped in v50**
With the chemistry finished, the remaining friction was in the shell around it.

The ☰ sheet had quietly become the app's junk drawer: **26 actions in 6 groups**, with
*View* alone holding ten unrelated things. It now takes a query — matched against each
button's `data-kw` as well as its label, because the word you'd type usually isn't the
word on the button (`csv` for Import, `inci` for the label, `print` for all four
printable outputs). The pattern wasn't new; the same `.ts-filter` search already sat in
three modals and had simply never been pointed at the longest list in the app. An
assertion now requires **every button to be findable by typing its own label** — the
hand-kept-list guard, applied before that class of bug could happen again rather than
after.

And the screen no longer sleeps mid-batch. `navigator.wakeLock` is held from the first
ticked checklist step until you leave the Make tab — not merely while the tab is open,
since you visit it to read the temperature guidance without soaping. It's stated on
screen with a switch beside it rather than run invisibly: silent battery drain that the
user can't see or stop would be the wrong trade in an app whose target user is someone's
mum.

The version and ingredient counts quoted in this file and the README are now **checked
against `data.js` on every run**. They had drifted — this document claimed v46, "581
assertions" and "30 additives" against a v49 app with 33, and the README was further out
still at "~40 oils". Hand-typed numbers that nothing verifies is the exact failure mode
this repo keeps rediscovering.

**16. A code audit, and what it found** — ✅ **shipped in v51**
An audit of every feature's wiring and of the numbers that carry health and safety. Most
passed: all 27 menu actions reach a handler, every data field has a live consumer, every
example references only real keys, and the chemistry checks out against first principles —
lye hand-worked to 138.25 g on the Classic Gentle Bar, `KOH_FACTOR` = 56.1056/39.9971,
citric acid = 3 × 39.997 / 192.124, exact unit conversions, and all five quality formulas
matching the standard definitions.

Six things didn't. The largest was a feature the app **asserted but never performed**:
milk, aloe and coffee were described as replacing part of the water, and the Lye card said
so outright, while nothing subtracted them. A milk soap was therefore either lighter than
quoted, or carried nearly twice the liquid it reported — and the *"Very dilute lye"* check,
reading the water figure alone, could not see either case. Fixed with a `replacesWater`
flag on the four additives that genuinely stand in for water; `kind:"liquid"` was the wrong
hook, because honey, sodium lactate, glycerin and vitamin E are also liquids but go in on
top, and subtracting those would have been a new bug. Keeping `waterG` as *total liquid*
and adding `waterAddG` as *what you pour* made the batch weight, yield, cost and
concentration all fall out correctly instead of each needing its own patch.

The hot-process reserve was silently capped by how much of the chosen oil existed, so a
recipe could ask for 15% superfat, get 10%, and still be told it was "the safe zone" — the
superfat verdict now judges the cushion the bar actually ends up with. Scent limits were
labelled a **"skin-safe max"**, which claims a regulatory basis these hand-entered soaping
figures don't have; they're now a *typical max* pointing at the supplier's IFRA certificate
for the binding number. And the additive dose guard was an inclusion list, so sodium
citrate and gluconate passed at any dose — inverted to an exception table over a default,
the same fix `recipeShareURL()` needed, for the same reason.

Every new guard was mutation-checked. One of those checks initially "passed" because the
mutation had silently failed to apply — which is exactly the failure a mutation check
exists to catch, so it now asserts the edit landed before trusting the result.

**17. More oils, and the schema that finally fits them** — ✅ **shipped in v52**
This closes item 9's open half, and it turned out the two halves were the same problem.

I had written off widening the fatty-acid schema as "not worth it for three oils". That was
wrong, and measuring it said so: **fourteen of the original forty-two** oils had 4% or more
of their fatty acids with nowhere to go in the eight-slot model — macadamia 28%, jojoba 87%.
An oil's unplaced share doesn't vanish; the blend is normalised by weight, so it quietly
drags every quality score down.

Five acids now have slots — **caprylic (C8)** and **capric (C10)**, which are why coconut
cleans as hard as it does; **palmitoleic (C16:1)**, macadamia's signature and present in
every animal fat here; **C20–C24 saturated**, peanut's and moringa's tail; and
**C20:1/C22:1**, which is essentially all jojoba and meadowfoam are. Forty-two oils became
sixty-five, chosen so the new slots earn themselves: fractionated coconut is 98% C8+C10,
meadowfoam 93% C20:1, sea buckthorn 30% palmitoleic. Beeswax stays the documented exception
at 14% — it really is mostly unsaponifiable wax ester, which is why its SAP is half an
ordinary oil's.

**The recommended bands had to move with the formulas.** Counting caprylic and capric raises
coconut's cleansing from 67 to 79, a ×1.18 stretch on everything lauric, and holding the old
12–22 would have flagged four perfectly ordinary recipes — a palm-free bar, a tallow bar, a
hand soap, a shampoo — as too cleansing. The bands are scaled by how far the model moved
rather than fitted to the examples; across all 17, **84 of 85 in/out verdicts are unchanged**,
and the one that moved (a palm-free laundry bar now reading harder than a body bar) matches
the other laundry bar, which already did. The consequence worth stating plainly: these five
numbers no longer match a calculator still using the eight-acid model. They are more
accurate, not more comparable.

Also 17 scents to 33, and the four shaping goals stopped carrying their own copy of the
quality formulas — they'd have gone on scoring against the old model.

Sixty-five oils of hand-entered reference values needed a guard, so every oil is now checked
for a profile that adds up, a SAP in a physically plausible band, plausible iodine and INS,
a real description, and no fatty acid the app doesn't score; every scent for a usage rate
that runs low ≤ typical ≤ max. None of that can tell you a SAP figure is *right* — only the
supplier can — but it catches what bulk data entry actually gets wrong, and mutation testing
confirmed all three: a misplaced decimal, a typo'd acid key, an incomplete profile.

**18. Lye first aid, and the loops the app had left open** — ✅ **shipped in v53**
Asked what was still missing, and the answer was embarrassing once found: the app says lye
is caustic in **eight** places and said nothing whatever about what to do once it lands on
someone. Searching for first aid, flushing, burns, eyewash or poison returned nothing. The
checklist's entire safety content was one line about gloves; the troubleshooting guide's four
groups were all about the soap, none about the person.

**🚑 Lye first aid** covers skin, eyes, swallowing, fumes, spills, storage and leftovers —
standard safety-data-sheet content, framed as such rather than as medical advice, and
carrying **no emergency phone number**, because the app has no idea which country it's being
read in. The entry worth the most is the one killing the vinegar myth: acid on an alkali burn
is exothermic, so "neutralising" it adds a thermal burn to a chemical one. That needed saying
loudly here precisely because the app recommends vinegar twice elsewhere — correctly, for a
hair rinse and for ultramarines — which makes reaching for the bottle likelier.

It's reachable from the menu, but a menu is useless to someone who has just splashed lye on
themselves, so the way in also sits on the two safety banners that warn it might happen: the
Lye card and the checklist's lye step. Troubleshooting and first aid render through **one**
function now rather than two copies of the same accordion.

**Two loops the app had opened and not closed:** the Dilute the Paste card told you to use a
preservative and offered no way to add one — so it couldn't be costed, labelled, stocked or
shopped for — and the chelator list stopped one short of tetrasodium EDTA. Both fixed, along
with beer and wine (water replacers, so they take the v51 `replacesWater` flag), milk powders,
exfoliants, menthol and two more clays. The additive list went from 33 to 45.

**CPOP** — cold process, oven-gelled — joins cold and hot process. The feature was easy; the
risk was the binary. `method` coerced to exactly `"hp"` or `"cp"`, and **nine** places branched
on `method === "hp"`, so a third value silently took the cold-process path everywhere. That is
correct in six of them and wrong in three, which is exactly the kind of thing that ships
looking fine. The assertions pin both halves: CPOP must produce **identical lye, water, batch
weight and cure** to cold process, and must have its own checklist, note and temperatures.
An early version of that test passed while comparing `"0"` to `"0"` — the lye panel only
renders on the Base tab — so it now checks the readings are non-empty before comparing them.

**19. Code hygiene: ES modules, and the file splits** — ✅ **shipped in v54**
`app.js` was 3466 lines in one IIFE. Before proposing surgery I checked whether it
actually needed any: no dead functions, no monster functions, essentially no dead CSS,
and duplication down to a modal footer written out three times. So this was about
navigability, not rot — and it delivers no user-visible change, which set the bar for how
it had to be done. The suite was the safety net, and the rule was that a *behaviour*
assertion breaking meant a regression, not something to update. None did.

The page now loads one ES module. Reference data split into `src/data/` by what it is,
verified table by table as JSON-identical rather than trusted. **`src/core/chem.js` is the
point of the exercise**: the lye and quality maths, 151 lines, no DOM and no application
state — the two things it did reach for (your SAP overrides, and "the recipe currently
open") are injected instead, with four one-line wrappers in `main.js` so no call site
changed. `units.js`, `schema.js` and `dom.js` came out with it.

Three bugs made and caught, all silent, all worth recording because none would survive
review by reading:

- Line-range deletions that weren't strictly descending, so a later cut removed lines that
  had already shifted. The redo asserts the ranges are sorted and disjoint first.
- `chem.js` used `clamp` without importing it. Every dual-lye path threw, and the first
  symptom was a modal that simply didn't open.
- `schema.js` did the same, and `load()` wraps everything in `try{}` — so the
  `ReferenceError` was swallowed, the app fell back to an empty recipe, and there was no
  page error and no failed assertion until a test timed out much later waiting on a
  dropdown. **A try/catch that makes loading robust also makes a hard error invisible.**

The shell guard inverted first, and immediately earned it: adding `core/units.js` and
`core/chem.js` failed the precache check the same run. The old hand-kept list of five
filenames would have said nothing.

Verified beyond the assertions: eight screenshots across three tabs, two widths and two
modals differ from the pre-refactor baseline by **one pixel at delta 1/255** — antialiasing
on a tab border. Offline reload with the network cut still works, which was the combination
(ES modules plus a service worker) most likely to break.

Still one file: `src/main.js` is 3160 lines of rendering and feature modals. Splitting that
further is the open half — see *What's next*.

**20. Second hygiene round: the app could destroy your recipes** — ✅ **shipped in v55**
A pass looking for bugs rather than tidiness, and it found a bad one.

`load()` wrapped everything in `try{}` and silently returned null. So *any* throw while
reading saved data — a corrupt key, a schema slip, the missing-import bug this very
refactor produced — showed an empty library. The saved recipes were still on disk at that
moment, entirely recoverable. Then the first thing you added called `save()`, and
`writeStore()` wrote the empty state straight over them. Reproduced end to end: three
recipes and a batch history became **"My recipe"**, silently and permanently.

Two rules now: **never overwrite data you failed to read**, and **never fail silently.** A
failed load parks writes entirely and says so, offering to reload, to download the
unreadable file before anything touches it, or to start fresh as a deliberate choice.
`writeStore()` no longer swallows its own errors either — quota exhaustion and Safari's
private mode both throw there, and the old behaviour was to carry on looking like the batch
was logged.

Fixing it produced a fourth bug worth recording: `var loadBlocked=null` sat *below*
`var state = initState()`, and `load()` runs inside that call — so module evaluation reset
the flag to null immediately after `load()` set it, and the guard did nothing. The
declaration is now above its first use, with a comment saying why it has to be.

The other half of the round turned dead weight into coverage. Five imports in `main.js` and
six exports in `core/` were unused after the split. Rather than delete the chemistry ones,
`chem.js` being independently testable was the *point* of extracting it — so there are now
**23 assertions running the lye maths directly, with no browser**: the classic bar worked
by hand, superfat as a discount on saponification only, KOH's molar ratio and its purity
division, dual-lye splits, citric acid outside the discount, all three water modes, unknown
oils contributing no lye, injected SAP overrides, and the water-replacer arithmetic. Every
one passed first time, which is the best evidence the extraction was faithful.

Everything above was mutation-checked, including the hoisting bug.

**21. Third bug round: a recipe that left didn't come back** — ✅ **shipped in v56**
Another pass hunting bugs, aimed at the paths where a recipe leaves the app and returns.
Round-trips that came back **clean**: units (g → oz → lb → kg → g, no drift), ten
scale-up/scale-down cycles, `%` mode, zero-gram oils, a 500 kg batch and a 1 g one,
inventory clamping, and deleting the last recipe. Two that didn't.

**CSV export wrote `section,name,amount,unit` and nothing else.** That drops both the fact
that an oil is custom and the SAP value you typed off its bottle, so re-importing handed
the name to the matcher, which substituted whichever reference oil it read like. A custom
"Coconut blend" at SAP 0.10 came back as coconut oil at 0.178: **114 g of lye became 144 g,
26% over, in the direction that burns** — and the safety check called the batch balanced,
because as far as it could tell it was. Export now carries `key` and `sap`; an explicit key
beats name matching, a keyless row with a SAP stays custom, and a SAP that disagrees with
our reference is kept as a supplier override rather than quietly reverting to ours. Files
from other calculators are unaffected — no key column means today's behaviour, and a `sap`
column in mg KOH/g (what SoapCalc prints) is ignored rather than believed.

**Share links had the same hole, twice.** A custom oil travelled with no SAP at all, so it
fell out of the lye maths entirely — 114 g became 76 g, the harmless direction but not the
recipe you sent. And supplier SAP values live outside the recipe, so the link rebuilt it on
the recipient's reference figures. Both now travel: only the overrides the shared recipe
actually uses, validated on arrival, applied only where the recipient hasn't set their own,
and named in the arrival toast — a supplier SAP figure changes every recipe using that oil,
so it shouldn't land silently.

The common thread with v55's data-loss bug: **the app was confident about numbers it had
lost.** Nine of the twenty-six new assertions pin the exported text itself, because the
failure is invisible downstream — the imported recipe looks perfectly reasonable.


**22. Code-hygiene pass over the whole codebase** — ✅ **shipped in v57**
Four review passes — reuse, simplification, efficiency, altitude — then the fixes. No new
features; the point was to delete duplication and to kill hand-kept lists before they rot.

Two had **already rotted**, which is the whole argument for the exercise. The "100%
coconut" safety warning ran off a hardcoded `["coconut","palmkernel","babassu"]`, so the
lauric oils added in v52 were silently exempt — a 100% **murumuru** bar (85% lauric family,
*more* than coconut's 79%) never got the "push superfat to 15–20%" advice. It is derived
from the fatty-acid data now, and the cutoff sits in a wide gap: sixth-highest oil is 71%,
seventh is 3%. Separately, cold process and oven-gelled each kept their own list of the
additives that make a batch run hot — a name regex on one side, four hardcoded keys on the
other — and had drifted: a **beer soap was warned under CPOP and told "no special heat
concerns" under CP**. Both read a `hot:true` flag on the ingredient data now.

The duplication that went: `openColors` was a third copy of the guide-list renderer that
`openGuideList` had been extracted to prevent; the 28-case action `switch` and the tab
if/else became lookup tables; seven segmented controls became `bindSeg`; four modal footers,
four number inputs, two hand-rolled modal backdrops and an open-coded file download all
call the helper that already existed. Three compare-table labels, the scale-unit list and
the HP step rewritten by magic index are all derived now. `#scentUnitNote` was an element
nothing ever filled.

**The suite went from 127 s to 77 s.** `open()` was loading every page twice — a `goto`
only to reach a same-origin document, then a `reload` — and then sleeping 200 ms for a
render that had already happened. 169 calls. The test file also grew a `menu()` helper: the
same "open the sheet, click an action" incantation was written out 30 times, three of those
as private copies of each other.

Verified as a refactor should be: **24 of 26 screenshots byte-identical** across three tabs
and ten modals at phone and desktop widths — the two that differ are the compare table,
whose labels now come from `QUALITIES` and read "Bubbly lather" like the rest of the app.
Both rot repairs were mutation-checked, and the share-link test's own allow-list is now
derived from `RECIPE_FIELDS` ∖ `SHARE_SKIP`, so a new field can no longer appear in neither
list with nothing asserting anything.

**Not taken:** the service worker fetches network-first with `cache:"no-store"`, so every
online launch re-downloads all 325 KB of shell — measured at **616 ms to first paint and
1.9 s to load** on throttled wifi against 92 ms / 145 ms for stale-while-revalidate. That is
the biggest single win found, but it changes what "auto-updating" means (one launch showing
the previous version before the existing `controllerchange` handler reloads), so it is a
call to make deliberately rather than fold into a cleanup.
---

## Part 3 — What's next

Short and honest: every numbered item is done, so this is what is actually left.

- **Split `src/main.js`.** It is still 3160 lines of rendering and feature modals — the
  open half of v54. The seams are there (41 section headings, and the modals are largely
  independent), but they share `state`, `render()` and each other, so it needs untangling
  rather than cutting. Worth doing when someone next has to find something in it; not
  worth rushing, since three of the four bugs in v54 came from moving code mechanically.
- **Nothing else is queued.** New entries should earn their place against the scope at the
  top of this file, not be added because the list looks short.

---

## Parked — only if this ever becomes a business

The app is built for personal use and gifts, so selling compliance is deliberately
off the roadmap. Written down so the reasoning survives:

- **EU/UK fragrance-allergen declarations** (the 26 declarable allergens) — a natural
  extension of the INCI label, but only required for sale.
- The existing **INCI label, bar wrapper and lot number** serve gifting well. Before
  any real selling they'd need a compliance review against local cosmetics rules —
  that's a legal question, not a feature request.

## Non-goals

- **Cloud sync.** Deliberately dropped. "Nothing leaves your device" is a design
  choice, not a missing feature — **Back up / Restore** already moves recipes between
  devices without a server or an account.
- **Melt & pour.** Needs no lye maths; a different craft.
- **Recipe-from-target solver** ("build me a blend hitting hardness 42"). Fiddly, hard
  to trust, and not how people actually design recipes.
- **A dedicated accessibility pass.** Decided: rely on the device's own text scaling,
  zoom and screen-reader support.
- **Recipe version history / diffing.** The batch log covers the real need more simply.

---

## How this gets built

Every change follows the same loop: build it, cover it with assertions in
`tests/soapcalc.test.mjs`, run the full suite, bump the version in `app.js` and
`sw.js`, then PR and merge. The suite has caught six schema changes on its own —
it's the reason the chemistry can be refactored without fear.

**Reference values (SAP, fatty acids) vary by supplier — always verify before a real
batch. Lye is caustic: gloves and eye protection, every time.**
