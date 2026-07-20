# 🧼 Soap Calc

A tiny soap-recipe **unit converter** for comparing recipes that use different
measurement units.

Making soap means collecting recipes from all over — one in grams, one in ounces,
one in "half a pound of this." Comparing two recipes for the same style of bar is
a pain when the units don't match. Soap Calc fixes that: enter your oils once, then
toggle the whole recipe between **g / oz / lb / kg / %** with a tap.

The **%** view is the useful one for comparing: it shows each oil as a percentage
of total oils, which is independent of units *and* batch size. Two recipes that
look totally different on paper turn out to be the same blend — or not.

## Use it

Open `index.html` in any browser (desktop or phone). That's it — no install, no
build, no internet needed after the page loads.

- **Add** an oil/ingredient with a name and amount (amount is read in whatever unit
  is currently selected).
- **Toggle** the unit buttons at the top to convert everything at once.
- **%** shows each oil's share of the total oils.
- Recipes are saved automatically in your browser (localStorage) and are there next
  time you open it.
- **Load a sample recipe** drops in a classic bar (given in mixed units) so you can
  see the toggle in action.

## Host it for free (optional)

Because it's a single static file, you can put it on GitHub Pages:
push this repo, then in the repo settings enable **Pages → Deploy from branch**,
and it'll be live at a shareable URL you can bookmark on your phone.

## Ideas for later

- Save and name multiple recipes, and compare two side by side.
- Enter a recipe *as* percentages plus a batch size, and have the weights computed.
- A lye/SAP calculator (how much lye + water for your oil blend).
