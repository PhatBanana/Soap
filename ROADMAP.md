# 🧼 Soap Calc — Roadmap

Where the app is today, and where it could go next.

**Scope:** a soap calculator for **personal use and gifting**, that works on a phone
in the kitchen, offline, with no account and nothing leaving the device. Everything
below is judged against that.

**Today:** v43 · 42 oils · 30 additives · 22 colorants · 17 aromas ·
15 example recipes · 451 test assertions, run on every pull request.

---

## Part 1 — What exists

### Recipe & units
- Enter oils and additives once; switch the whole recipe between **g / oz / lb / kg / %**
  from the app-bar unit picker.
- **42 oils, butters & fats** and **30 additives** (including 12 natural and mineral
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
  extremes, lye too strong or too dilute, scents over their skin-safe max, DOS-prone
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
- Separate scent list with usage rates, **skin-safe caps**, scent-load readout and a
  **note pyramid** (top / middle / base).
- **Set recommended amounts** sizes the blend to ~3% of oils, capped per scent.
- **Blending notes** based on the scents actually in the recipe.

### Making it
- **Cold process or hot process** — the method drives the checklist, the temperature
  guidance and the cure estimate.
- **Cure schedule** with a suggested cure time derived from the oil blend.
- **Soaping temperatures**, with a tip that adapts to your recipe.
- **Step-by-step checklist**, **batch notes**, and an optional **lot number**.
- **Cure checks** — zap tests and pH readings filed onto the batch that made the bar.
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

### Library & output
- Saved recipes with **search, sort and favourites**; compare any two.
- **Recipe card**, **INCI ingredient label**, **printable bar wrapper**.
- **Share by link** (the recipe rides inside the URL), **CSV import/export**,
  **photo OCR**, and **paste a recipe** from another calculator.

### The app itself
- **Installable PWA**, fully offline, auto-updating, with a version footer.
- **Backup / restore** everything as JSON.
- Collapsible cards, sticky lye/batch summary, theme toggle, **multi-level undo**.
- A **behaviour test suite** covering the chemistry, safety rules, scaling and storage,
  run automatically on every pull request.

---

## Part 2 — What should be added

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

### Tier 3 — platform

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

**10. Print stylesheet for the shopping list.**

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
