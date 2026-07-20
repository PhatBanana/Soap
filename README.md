# 🧼 Soap Calc

A small, single-file soap calculator for making soap at home: **compare recipes
across units, size the lye & superfat, and shape the soap's profile** — all in the
browser, no install.

## Why

Making soap means collecting recipes from everywhere — one in grams, one in ounces,
one in "half a pound of this." They're hard to compare, and each oil behaves
differently with lye. Soap Calc lets you enter your oils once and then:

- **Toggle units** (g / oz / lb / kg / %) to convert the whole recipe at a tap. The
  **%** view shows each oil as a share of total oils, which is independent of units
  *and* batch size — the fairest way to compare two recipes.
- **Calculate the lye** per oil using each oil's SAP value, reduced by your chosen
  **superfat**, for **NaOH** (bar soap) or **KOH** (liquid soap), plus water.
- **See the soap's profile** — Hardness, Cleansing, Conditioning, Bubbly lather,
  Creamy lather, plus Iodine and INS — computed from each oil's fatty-acid makeup and
  shown against the ranges soapers aim for.
- **Shape the blend** — drag any oil's slider, or tap a goal (**Harder**, **More
  moisturizing**, **Better lather**, **Gentler**) to nudge the recipe that way and
  watch the profile and lye update live.

## Use it

Open `index.html` in any browser (desktop or phone). No install, no build, works
offline. Recipes are saved automatically in your browser and restored next visit.
Tap **Load sample recipe** to see it in action.

## How the numbers work

- **Lye (NaOH):** `Σ(oil weight × oil SAP) × (1 − superfat%)`. KOH uses the same but
  scaled by 1.4027 (KOH vs NaOH molar mass) and divided by KOH purity (default 90%).
- **Water:** a percentage of total oil weight (default 38%). Resulting lye
  concentration is shown for reference.
- **Qualities:** the blend's weighted fatty-acid percentages drive each quality
  (e.g. Hardness = palmitic + stearic + lauric + myristic).

The oil database (SAP + fatty-acid profiles for ~20 common soaping oils) uses standard
reference values. **These vary by supplier** — always double-check before a real batch,
and remember lye is caustic: wear gloves and eye protection.

## Host it for free (optional)

It's one static file, so you can put it on **GitHub Pages** (Settings → Pages → Deploy
from branch) and get a shareable URL to bookmark on your phone.

## Ideas for later

- Save & name multiple recipes and compare two side by side.
- Enter a recipe *as* percentages plus a batch size and have weights computed.
- Add more oils, fragrance/additive tracking, and print/share a recipe card.
