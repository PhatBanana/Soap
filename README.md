# 🧼 Soap Calc

An installable, offline soap calculator for making soap at home. Compare recipes
across units, size the lye & superfat, shape the soap's profile, and plan your
scent blend — no accounts, no build step.

## Features

**Soap base tab**
- **Unit converter** — toggle the whole recipe between g / oz / lb / kg / %. The
  **%** view shows each oil as a share of total oils (unit- and batch-independent),
  the fairest way to compare recipes.
- **Lye + superfat + water** — lye is computed per oil from its SAP value, reduced by
  your superfat, for **NaOH** (bars) or **KOH** (liquid soap, with purity). Water is a
  % of oils; shows lye concentration and total batch weight.
- **Soap profile** — Hardness, Cleansing, Conditioning, Bubbly & Creamy lather, plus
  Iodine and INS, computed from each oil's fatty acids and shown against recommended
  ranges.
- **Shape it** — drag per-oil sliders, or tap **Harder / More moisturizing / Better
  lather / Gentler** to nudge the blend live.
- **Scale it** — enter a desired amount and resize the whole recipe (keeping every
  ratio) to hit a target **total batch**, **total oils**, or a **mold size** (L×W×H).
- **~30 bases** — oils, butters and fats, plus additives (goat milk, coconut milk,
  honey, sodium lactate, oatmeal, kaolin, charcoal) handled correctly (additives don't
  go through the lye math; liquids replace part of the water).

**Scents tab**
- Separate list & receipt for **fragrance / essential oils**, dosed by usage rate.
- Total scent load with a **% of oils** read-out and safe-range guidance (~3% sweet
  spot), plus a **note pyramid** (top / middle / base balance).
- Curated **blending notes** per scent (pairings, what fades, what accelerates or
  discolors) and general hints.

**Recipes**
- **Saved, named recipes** — keep a library of recipes (New / Duplicate / Rename /
  Delete) and switch between them; each is stored separately in your browser.
- **Compare** any two recipes side by side — oils as % of oils (batch-size
  independent), plus qualities, lye, and batch.
- **Recipe card** — a clean printable/copyable summary (oils + %, additives, lye,
  water, superfat, scents, profile) to take to the bench or text to someone.

**Everywhere**
- 📷 **Scan a photo** of a recipe — on-device OCR (Tesseract.js) reads it, then you
  confirm/fix the parsed lines before adding. (First scan downloads the reader ~5 MB
  and needs internet once; after that it's cached.)
- 📄 **Import / export CSV** — `section,name,amount,unit`; import accepts mixed units
  (incl. tsp/tbsp/cup/drop) and matches names to the oil/scent database.
- 💾 Recipes save automatically in your browser.
- 📱 **Installable app (PWA)** — add to your home screen; works offline.

## Install on your phone

Once it's live (see hosting below), open the URL and:
- **Android / Chrome:** tap the **Install** button, or the browser's "Install app".
- **iPhone / iPad (Safari):** tap **Share → Add to Home Screen**.

It then launches full-screen like a native app and works without a connection.

## Files
- `index.html` — app shell
- `app.css` — styles
- `data.js` — oil / additive / aroma database
- `app.js` — logic
- `manifest.webmanifest`, `sw.js`, `icons/` — PWA (installable + offline)

## How the numbers work
- **Lye (NaOH):** `Σ(oil weight × oil SAP) × (1 − superfat%)`; KOH scales by 1.4027 and
  divides by purity.
- **Water:** a % of total oil weight (default 38%).
- **Qualities:** weighted blend fatty-acid percentages (e.g. Hardness = palmitic +
  stearic + lauric + myristic).

**Reference values vary by supplier — always verify before a real batch. Lye is
caustic: wear gloves and eye protection.**

## Ideas for later
- Save & name multiple recipes and compare side by side.
- Better OCR parsing for handwritten recipes; attach the photo to the saved recipe.
- Print / share a recipe card.
