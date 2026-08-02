# 🧼 Soap Calc — Roadmap

Where the app is today, and where it could go next.

**Scope:** a soap calculator for **personal use and gifting**, that works on a phone
in the kitchen, offline, with no account and nothing leaving the device. Everything
below is judged against that.

**Today:** v32 · 42 oils · 18 additives · 17 aromas · 15 example recipes ·
216 test assertions.

---

## Part 1 — What exists

### Recipe & units
- Enter oils and additives once; switch the whole recipe between **g / oz / lb / kg / %**
  from the app-bar unit picker.
- **42 oils, butters & fats** and **18 additives**, focused on what you can actually buy,
  each with a plain-language **?** description (what it brings, its standout trait, a
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
- **Troubleshooting** — a searchable "why did my soap do X?" guide.

### Costs & planning
- Price book (price per kg), **batch total and cost per bar**.
- **Shopping list** across several recipes, with NaOH and KOH totalled separately.

### Library & output
- Saved recipes with **search, sort and favourites**; compare any two.
- **Recipe card**, **INCI ingredient label**, **printable bar wrapper**.
- **Share by link** (the recipe rides inside the URL), **CSV import/export**,
  **photo OCR**.

### The app itself
- **Installable PWA**, fully offline, auto-updating, with a version footer.
- **Backup / restore** everything as JSON.
- Collapsible cards, sticky lye/batch summary, theme toggle, **multi-level undo**.
- A **behaviour test suite** covering the chemistry, safety rules, scaling and storage.

---

## Part 2 — What should be added

### Tier 1 — the real gaps

**1. Batch log (make history)**
Right now the made-on date, lot number, notes and checklist are single-valued, so
making the same recipe a second time overwrites the record of the first. A soap
journal should keep *every* make: date, lot, what you changed, how it turned out.
This is the natural completion of Batch Notes + Lot + Cure Schedule, and the biggest
gap in the app today.

**2. Ingredient inventory → a smarter shopping list**
Track what's actually in the cupboard, subtract it from the shopping list, and warn
when a recipe needs more than you have. Pairs naturally with the batch log — logging
a make depletes stock.

**3. Hot-process superfat**
Hot-process soapers usually add the superfat oil *after* the cook, where it stays
intact rather than acting as a lye discount. The app models superfat only as a lye
discount, so hot-process numbers are subtly off. Add a "superfat after cook" option:
lye computed at near-zero discount, with the reserved oil listed separately.

### Tier 2 — useful, narrower

**4. Rebatch helper** — how much liquid to add per pound when rebatching. The
troubleshooting guide already tells you to rebatch without telling you the amounts.

**5. Colorant guidance** — usage per pound of oils, natural colorants (madder, annatto,
indigo, spirulina), and which survive soap's high pH. Same data shape as the existing
aroma database.

**6. Cure / pH check log** — record zap tests and pH readings across the cure. Folds
into the batch log.

### Tier 3 — platform

**7. CI running the test suite on pull requests.** Skipped so far to keep GitHub
Actions storage down; worth revisiting with short artifact retention, since the suite
is the main safety net.

**8. Import from other calculators** — SoapCalc, Bramble Berry, SoapmakingFriend
formats, so existing recipes can come along.

**9. Data growth** — more oils and fragrance oils; supplier-specific SAP overrides.

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
`sw.js`, then PR and merge. The suite has caught four schema changes on its own —
it's the reason the chemistry can be refactored without fear.

**Reference values (SAP, fatty acids) vary by supplier — always verify before a real
batch. Lye is caustic: gloves and eye protection, every time.**
