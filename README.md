# 🧼 Soap Calc

An installable, offline soap calculator for making soap at home — build and
compare recipes, size the lye and superfat, shape the soap's qualities, plan your
scent blend, and scale a batch to fit your mold. No accounts, no build step,
nothing leaves your device.

**Live:** https://phatbanana.github.io/Soap/

## Why

Soap recipes come from everywhere in mismatched units (grams, ounces, "half a
pound of this"), and every oil behaves differently with lye. Soap Calc lets you
enter your oils once and then convert, calculate, compare, and scale — on your
phone in the kitchen or on a desktop.

## Features

### Recipe & units
- Enter oils/ingredients once and **toggle the whole recipe between g / oz / lb /
  kg / %** at a tap. The **%** view shows each oil as a share of total oils —
  unit- and batch-independent, the fairest way to compare recipes.
- **~40 oils, butters & fats** plus **18 additives**, focused on what a normal
  person can actually buy (grocery, pharmacy, craft store, Amazon) — olive,
  coconut, palm, castor, shea/cocoa/mango/kokum butters, sweet almond, avocado,
  sunflower (incl. high-oleic), canola, safflower, grapeseed, rice bran, sesame,
  soybean / "vegetable oil", corn, peanut, walnut, flaxseed, wheat germ, pumpkin
  seed, hemp, rosehip, jojoba, lard, tallow, vegetable shortening, beeswax,
  stearic acid, and more. Custom oils are allowed too (flagged, and left out of
  the lye/quality math).
- **Additives** handled correctly (they don't go through the lye math): goat &
  coconut milk, honey, sugar, salt, aloe, brewed coffee & grounds, sodium lactate,
  oatmeal, kaolin & bentonite clay, activated charcoal, silk, glycerin, vitamin E,
  titanium dioxide, and mica — each with a usage note.

### Lye, superfat & water
- Lye computed **per oil** from its SAP value, reduced by your **superfat**, for
  **NaOH** (bars) or **KOH** (liquid soap, with purity).
- Water as a % of oils, with the resulting **lye concentration** and **total
  batch weight**.

### Soap profile & shaping
- Hardness, Cleansing, Conditioning, Bubbly & Creamy lather, plus Iodine and INS,
  computed from each oil's fatty acids and shown against recommended ranges.
- **Shape it:** drag per-oil sliders, or tap **Harder / More moisturizing / Better
  lather / Gentler** to nudge the blend live.
- **Context-aware Recipe Notes** react to your blend (soft/brittle bars, drying
  cleansing, DOS-prone oils, high castor, milk/honey handling, and more).

### Batch yield & scaling
- **Expected yield** readout for the current ingredients (batch weight + approx.
  bar count), with an **adjustable bar weight**.
- **Scale** the whole recipe (keeping every ratio) to hit a target **total batch**,
  **total oils**, or a **mold size** (rectangular L×W×H).

### Scents
- A separate list & receipt for **fragrance / essential oils**, dosed by usage
  rate, with a **scent-load** read-out (~3% sweet spot) and a **note pyramid**
  (top / middle / base balance).
- **Set recommended amounts** sizes the whole blend to a safe ~3% of oils, split
  by each oil's typical rate and **capped at each scent's skin-safe maximum**, so
  bars aren't over- or under-scented. Individual scents over their max are flagged.
- **Context-aware blending notes** based on the scents you're actually using —
  anchoring advice, trace accelerators, discoloration, and skin-safety cautions.

### Make it (process & cure)
- A **Make** tab with a **step-by-step checklist** (suit up → measure → mix lye →
  combine at temp → add scent at trace → pour → unmold → cure), with your progress
  saved per recipe.
- A **cure schedule**: set the date you made the batch and the cure time, and it
  shows the **ready-to-use date** and days remaining.

### Costs
- Enter each ingredient's **price per kg** (saved and reused across recipes) and
  see the **batch total** and **cost per bar**, in your chosen currency.

### Recipes
- **Saved, named recipes** — keep a library (New / Duplicate / Rename / Delete) and
  switch between them; each is stored separately in your browser.
- **Compare** any two recipes side by side (oils as % of oils, plus qualities,
  lye, and batch).
- **Recipe card** — a clean **printable / copyable** summary to take to the bench
  or text to someone.

### Get recipes in & out
- 📷 **Scan a photo** of a recipe — on-device OCR (Tesseract.js) reads it, then you
  confirm/fix the parsed lines. (First scan downloads the reader ~5 MB and needs
  internet once; after that it's cached.)
- 📄 **Import / export CSV** — `section,name,amount,unit`; import accepts mixed
  units (incl. tsp/tbsp/cup/drop) and matches names to the database.

### App & privacy
- 📱 **Installable PWA** — add to your home screen; works fully offline.
- **Responsive** — a compact single column on phones, a two-column layout on
  desktop.
- Everything is saved **locally in your browser** (localStorage). There's no
  server and no account — nothing is transmitted, and one person's recipes never
  reach another's browser.

## Install on your phone
Open the live URL and:
- **Android / Chrome:** tap **Install** (in the app or the browser menu).
- **iPhone / iPad (Safari):** tap **Share → Add to Home Screen**.

## How the numbers work
- **Lye (NaOH):** `Σ(oil weight × oil SAP) × (1 − superfat%)`; KOH scales by 1.4027
  and divides by purity.
- **Water:** a % of total oil weight (default 38%).
- **Qualities:** weighted blend fatty-acid percentages (e.g. Hardness = palmitic +
  stearic + lauric + myristic).

**Reference SAP / fatty-acid values vary by supplier — always verify before a real
batch. Lye is caustic: wear gloves and eye protection.**

## Project layout
- `index.html` — app shell
- `app.css` — styles (incl. responsive + print)
- `data.js` — oil / additive / aroma database
- `app.js` — logic
- `manifest.webmanifest`, `sw.js`, `icons/` — PWA (installable + offline)

Hosted free on GitHub Pages from `main`.

## Ideas for later
- Round / cylinder / cavity mold shapes for the scaler (rectangular for now).
- Optional cloud sync so recipes follow you across devices.
