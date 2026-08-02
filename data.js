/* =============================================================================
   Soap Calc — reference data
   Values are STANDARD REFERENCES and vary by supplier. Always verify before a
   real batch. Lye is caustic — wear gloves & eye protection.

   OILS (saponifiable)
     sap = grams NaOH to saponify 1 g of oil
     fa  = fatty-acid % : la lauric, my myristic, pa palmitic, st stearic,
           ri ricinoleic, ol oleic, li linoleic, ln linolenic
     iod = iodine value, ins = INS value
   ADDITIVES (not saponified) — milks, sugars, hardeners, clays, exfoliants
   AROMAS — fragrance & essential oils: note pyramid, usage rate, behavior
============================================================================= */
(function (g) {
  "use strict";

  g.OILS = {
    olive:      { name:"Olive oil",         sap:.134,  iod:85,  ins:105, fa:{la:0, my:0, pa:14,st:3, ri:0, ol:69,li:12,ln:1},
                  desc:"The gentle workhorse. Very mild and conditioning — makes a soft bar that's slow to trace but cures rock-hard and lasts. Great for sensitive skin. Use up to 100%." },
    coconut:    { name:"Coconut oil (76°)", sap:.178,  iod:10,  ins:258, fa:{la:48,my:19,pa:9, st:3, ri:0, ol:8, li:2, ln:0},
                  desc:"Big cleansing and fluffy bubbles, and it makes a nice hard bar. Cleans so well it can be drying above ~30% unless you bump superfat. Typical 15–30%." },
    palm:       { name:"Palm oil",          sap:.141,  iod:53,  ins:145, fa:{la:0, my:1, pa:44,st:5, ri:0, ol:39,li:10,ln:0},
                  desc:"The all-rounder hard oil — adds hardness plus a stable, creamy lather without being cleansing. Look for sustainable (RSPO). Typical 25–40%." },
    palmkernel: { name:"Palm kernel oil",   sap:.156,  iod:20,  ins:227, fa:{la:49,my:16,pa:8, st:2, ri:0, ol:15,li:3, ln:0},
                  desc:"Coconut's twin — hardness, cleansing and big bubbles from lauric acid. A common palm-free stand-in for coconut. Typical 15–30%." },
    castor:     { name:"Castor oil",        sap:.1286, iod:86,  ins:95,  fa:{la:0, my:0, pa:0, st:0, ri:90,ol:4, li:5, ln:0},
                  desc:"The lather booster — draws big, stable, creamy bubbles and adds a little shine. Sticky and soft if you overdo it. Typical 3–8%." },
    shea:       { name:"Shea butter",       sap:.128,  iod:59,  ins:116, fa:{la:0, my:0, pa:5, st:40,ri:0, ol:48,li:6, ln:0},
                  desc:"Luxury butter — creamy, deeply conditioning and mildly hardening. Skin-loving and popular as a superfat. Typical 5–15%." },
    cocoa:      { name:"Cocoa butter",      sap:.137,  iod:37,  ins:157, fa:{la:0, my:0, pa:28,st:33,ri:0, ol:35,li:3, ln:0},
                  desc:"Hard, brittle butter — firms the bar and adds a creamy, stable lather. Faint chocolate scent (use deodorized to avoid it). Typical 5–15%." },
    mango:      { name:"Mango butter",      sap:.1339, iod:47,  ins:146, fa:{la:0, my:0, pa:7, st:42,ri:0, ol:45,li:3, ln:0},
                  desc:"Silky butter — conditioning with some hardness, lighter and less greasy than shea or cocoa. Typical 5–15%." },
    kokum:      { name:"Kokum butter",      sap:.1385, iod:35,  ins:128, fa:{la:0, my:0, pa:5, st:56,ri:0, ol:34,li:2, ln:0},
                  desc:"The hardest common butter — very firm, stable and nearly scent-free. A great hardener that's still skin-friendly. Typical 5–15%." },
    almond:     { name:"Sweet almond oil",  sap:.136,  iod:99,  ins:97,  fa:{la:0, my:0, pa:7, st:2, ri:0, ol:71,li:18,ln:0},
                  desc:"Light, gentle conditioning oil with a silky feel — a favorite for sensitive-skin and facial bars. Typical 5–20%." },
    apricot:    { name:"Apricot kernel oil",sap:.135,  iod:100, ins:91,  fa:{la:0, my:0, pa:6, st:1, ri:0, ol:66,li:27,ln:0},
                  desc:"Light conditioning oil much like sweet almond — absorbs fast, feels soft, lovely in facial bars. Typical 5–15%." },
    avocado:    { name:"Avocado oil",       sap:.133,  iod:86,  ins:99,  fa:{la:0, my:0, pa:20,st:2, ri:0, ol:58,li:12,ln:1},
                  desc:"Rich, vitamin-packed conditioning oil — gentle and great for dry, sensitive or mature skin. Typical 5–20%." },
    argan:      { name:"Argan oil",         sap:.136,  iod:95,  ins:95,  fa:{la:0, my:0, pa:12,st:6, ri:0, ol:45,li:35,ln:0},
                  desc:"Prized skincare oil — very conditioning and light. Pricey, so it shines as a small superfat luxury. Typical 3–10%." },
    macadamia:  { name:"Macadamia oil",     sap:.139,  iod:76,  ins:119, fa:{la:0, my:0, pa:8, st:3, ri:0, ol:59,li:2, ln:0},
                  desc:"Cushiony conditioning oil high in oleic — sinks in fast and feels luxurious; more shelf-stable than most soft oils. Typical 5–15%." },
    sunflower:  { name:"Sunflower oil",     sap:.134,  iod:133, ins:63,  fa:{la:0, my:0, pa:7, st:4, ri:0, ol:16,li:70,ln:1},
                  desc:"Cheap, gentle conditioning oil — but very high linoleic, so keep it modest or the bar can go rancid (DOS). Typical up to 15%." },
    canola:     { name:"Canola oil",        sap:.1241, iod:110, ins:56,  fa:{la:0, my:0, pa:4, st:2, ri:0, ol:61,li:21,ln:9},
                  desc:"Budget conditioning oil — mild and slippery but slow to trace and soft. Keep modest for shelf life. Typical up to 15%." },
    grapeseed:  { name:"Grapeseed oil",     sap:.1265, iod:131, ins:66,  fa:{la:0, my:0, pa:8, st:4, ri:0, ol:20,li:68,ln:0},
                  desc:"Light, silky conditioning oil — very high linoleic, so use small amounts and keep fresh; can go rancid fast. Typical up to 10%." },
    ricebran:   { name:"Rice bran oil",     sap:.128,  iod:100, ins:70,  fa:{la:0, my:1, pa:22,st:2, ri:0, ol:42,li:32,ln:1},
                  desc:"Affordable, silky conditioning oil with a touch of hardness — a nice olive-oil alternative. Typical up to 20%." },
    sesame:     { name:"Sesame oil",        sap:.133,  iod:108, ins:81,  fa:{la:0, my:0, pa:10,st:5, ri:0, ol:40,li:45,ln:0},
                  desc:"Conditioning oil valued for skin; use light (toasted has a strong smell). High polyunsaturates — keep modest. Typical up to 10%." },
    soybean:    { name:"Soybean oil",       sap:.135,  iod:130, ins:61,  fa:{la:0, my:0, pa:11,st:4, ri:0, ol:24,li:50,ln:7},
                  desc:"Common cheap veg oil — conditioning but soft, and high linoleic so keep it modest. Typical up to 15%." },
    corn:       { name:"Corn oil",          sap:.136,  iod:117, ins:69,  fa:{la:0, my:0, pa:12,st:2, ri:0, ol:30,li:55,ln:1},
                  desc:"Inexpensive, mild conditioning oil — soft bar, best in smaller amounts. Typical up to 15%." },
    peanut:     { name:"Peanut oil",        sap:.136,  iod:92,  ins:99,  fa:{la:0, my:0, pa:8, st:3, ri:0, ol:56,li:26,ln:0},
                  desc:"Conditioning oil with a little hardness and mild lather. Note: a possible nut allergen. Typical up to 15%." },
    hemp:       { name:"Hemp seed oil",     sap:.1345, iod:165, ins:39,  fa:{la:0, my:0, pa:6, st:2, ri:0, ol:12,li:57,ln:21},
                  desc:"Very conditioning, skin-loving oil — but loaded with polyunsaturates, so use small amounts and keep it fresh/refrigerated. Typical up to 10%." },
    neem:       { name:"Neem oil",          sap:.1387, iod:70,  ins:124, fa:{la:0, my:0, pa:18,st:18,ri:0, ol:45,li:15,ln:0},
                  desc:"Medicinal oil (strong garlic/nut smell) prized for troubled or itchy skin and pet bars. Use small amounts. Typical 5–10%." },
    jojoba:     { name:"Jojoba oil",        sap:.069,  iod:83,  ins:11,  fa:{la:0, my:0, pa:1, st:0, ri:0, ol:12,li:0, ln:0},
                  desc:"Technically a liquid wax — very conditioning and silky, close to skin's own oils. Adds little lather. Best as a small superfat. Typical 3–10%." },
    lard:       { name:"Lard",              sap:.138,  iod:57,  ins:139, fa:{la:0, my:1, pa:28,st:14,ri:0, ol:46,li:6, ln:0},
                  desc:"Classic hard animal fat — makes a creamy, mild, long-lasting white bar on a budget. Typical up to 40%." },
    tallow:     { name:"Beef tallow",       sap:.1405, iod:42,  ins:147, fa:{la:0, my:3, pa:28,st:22,ri:0, ol:36,li:3, ln:1},
                  desc:"Traditional hard animal fat — very hard, creamy and low-cost, the backbone of old-fashioned bars. Typical up to 40%." },
    babassu:    { name:"Babassu oil",       sap:.175,  iod:15,  ins:230, fa:{la:50,my:20,pa:11,st:4, ri:0, ol:10,li:3, ln:0},
                  desc:"Coconut alternative — hardness, cleansing and bubbles from lauric acid, but feels a bit less drying. Typical 10–25%." },
    beeswax:    { name:"Beeswax",           sap:.069,  iod:10,  ins:84,  fa:{la:0, my:0, pa:0, st:0, ri:0, ol:0, li:0, ln:0},
                  desc:"Not really a soap oil — a hardener. Firms and adds rigidity but can dull lather and speeds trace. Use 1–3%.",
                  note:"Hardener — use 1–3%. Raises rigidity but can dull lather and speed trace." },
    stearic:    { name:"Stearic acid",      sap:.148,  iod:0,   ins:197, fa:{la:0, my:0, pa:0, st:100,ri:0,ol:0, li:0, ln:0},
                  desc:"Pure hardener/thickener — firms bars and gives dense, creamy lather (great in shaving soap). Speeds trace fast. Use 0.5–1% (more in shaving bars).",
                  note:"Pure hardener — use 0.5–1%. Firms bars fast and can accelerate trace." },

    // --- widely available at grocery / pharmacy / craft stores / Amazon ---
    shortening: { name:"Vegetable shortening",   sap:.136,  iod:65,  ins:115, fa:{la:0, my:0, pa:25,st:15,ri:0, ol:42,li:16,ln:2},
                  desc:"Cheap grocery shortening (e.g. Crisco) — an easy, low-cost hard oil that firms bars and adds a mild, creamy lather. Typical up to 30%.",
                  note:"Cheap grocery shortening (e.g. Crisco) — an easy, low-cost hard-oil for firmer bars." },
    vegoil:     { name:"Vegetable oil (soybean)",sap:.135,  iod:130, ins:61,  fa:{la:0, my:0, pa:11,st:4, ri:0, ol:24,li:50,ln:7},
                  desc:"Whatever's in the jug (usually soybean) — cheap and conditioning but soft and high linoleic, so keep it modest. Typical up to 15%." },
    safflower:  { name:"Safflower oil",          sap:.1362, iod:145, ins:47,  fa:{la:0, my:0, pa:7, st:2, ri:0, ol:13,li:77,ln:1},
                  desc:"Light conditioning oil, but extremely high linoleic — use small amounts and keep fresh or it goes rancid fast. Typical up to 10%." },
    safflowerho:{ name:"Safflower (high-oleic)", sap:.1362, iod:90,  ins:90,  fa:{la:0, my:0, pa:5, st:2, ri:0, ol:75,li:16,ln:0},
                  desc:"The high-oleic version — just as gentle but far more shelf-stable than regular safflower. A good slow, mild base oil. Typical up to 20%." },
    sunflowerho:{ name:"Sunflower (high-oleic)", sap:.134,  iod:83,  ins:97,  fa:{la:0, my:0, pa:4, st:4, ri:0, ol:81,li:9, ln:0},
                  desc:"High-oleic sunflower — gentle, conditioning and stable, an excellent olive-oil-style base that resists rancidity. Typical up to 25%." },
    cottonseed: { name:"Cottonseed oil",         sap:.1386, iod:108, ins:89,  fa:{la:0, my:0, pa:23,st:2, ri:0, ol:18,li:53,ln:1},
                  desc:"Inexpensive oil with a bit of hardness and lather — decent, but high linoleic so keep it modest. Typical up to 15%." },
    walnut:     { name:"Walnut oil",             sap:.1353, iod:145, ins:45,  fa:{la:0, my:0, pa:7, st:2, ri:0, ol:18,li:60,ln:11},
                  desc:"Rich, skin-loving conditioning oil — but very high polyunsaturates, so small amounts and keep fresh. Possible nut allergen. Typical up to 10%." },
    flax:       { name:"Flaxseed (linseed) oil", sap:.1357, iod:178, ins:30,  fa:{la:0, my:0, pa:5, st:4, ri:0, ol:20,li:18,ln:53},
                  desc:"Silky and conditioning but off-the-charts linolenic — very prone to rancid spots (DOS). Use tiny amounts and keep it fresh. Typical under 5%.",
                  note:"Very high linolenic — nice but prone to DOS (rancid spots); use small amounts and keep it fresh." },
    wheatgerm:  { name:"Wheat germ oil",         sap:.131,  iod:128, ins:58,  fa:{la:0, my:0, pa:17,st:1, ri:0, ol:15,li:55,ln:7},
                  desc:"Vitamin-E-rich conditioning oil — a little helps skin and adds some natural antioxidant, but keep small (goes rancid). Typical under 5%." },
    pumpkinseed:{ name:"Pumpkin seed oil",       sap:.1363, iod:125, ins:67,  fa:{la:0, my:0, pa:12,st:6, ri:0, ol:30,li:50,ln:0},
                  desc:"Conditioning specialty oil that's nice for skin — keep modest for shelf life. Typical up to 10%." },
    rosehip:    { name:"Rosehip seed oil",       sap:.1378, iod:185, ins:16,  fa:{la:0, my:0, pa:4, st:2, ri:0, ol:14,li:44,ln:33},
                  desc:"Beloved facial-skincare oil, very high in polyunsaturates — best as a small superfat treat since it goes rancid quickly. Typical under 5%.",
                  note:"Skincare oil, high in polyunsaturates — best as a small superfat treat; goes rancid quickly." },
    emu:        { name:"Emu oil",                sap:.1359, iod:60,  ins:128, fa:{la:0, my:0, pa:22,st:9, ri:0, ol:47,li:15,ln:1},
                  desc:"Rich animal oil valued for skin absorption — conditioning with some hardness. Use as a small superfat treat. Typical up to 10%." }
  };

  /* Additives are dosed relative to oils and do NOT go through the lye math.
     kind: "liquid" replaces part of the water; "dry" is stirred in at trace.  */
  g.ADDITIVES = {
    goatmilk:      { name:"Goat milk",        kind:"liquid",
                     note:"Replaces some or all of your water. Creamy lather & skin-loving fats. Freeze it and add lye slowly to avoid scorching (or use powder)." },
    coconutmilk:   { name:"Coconut milk",     kind:"liquid",
                     note:"Replaces part of the water. Adds creamy, conditioning lather. Keep cool to avoid scorching." },
    honey:         { name:"Honey",            kind:"liquid",
                     note:"~1 tsp per lb (450 g) of oils. Boosts lather & draws moisture, but can overheat/volcano — soap cool." },
    sodiumlactate: { name:"Sodium lactate",   kind:"liquid",
                     note:"~1 tsp per lb of oils (≈3% of oils). Hardens bars for easier unmolding. Stir into cooled lye water." },
    oatmeal:       { name:"Colloidal oatmeal",kind:"dry",
                     note:"1–2 Tbsp per lb of oils. Soothing with gentle exfoliation. Add at trace." },
    kaolin:        { name:"Kaolin clay",      kind:"dry",
                     note:"~1 tsp per lb of oils. Silky slip, anchors fragrance, great for shaving soap. Disperse in a little water first." },
    charcoal:      { name:"Activated charcoal",kind:"dry", colorant:true,
                     note:"~1 tsp per lb of oils. Detoxing color for oily skin. Use lightly to avoid gray lather." },
    glycerin:      { name:"Vegetable glycerin", kind:"liquid",
                     note:"Humectant that pulls moisture to skin. A little (1–2 tsp PPO) adds a silky feel; too much softens the bar." },
    aloe:          { name:"Aloe vera juice",    kind:"liquid",
                     note:"Swap for part of your water. Soothing and skin-loving — keep it cool when adding the lye." },
    sugar:         { name:"White sugar",        kind:"dry",
                     note:"~1 tsp per lb of oils, dissolved in the water. Boosts big bubbly lather. Can heat the batch up." },
    salt:          { name:"Salt (table/sea)",   kind:"dry",
                     note:"A little (~1 tsp PPO) hardens bars; a lot makes 'salt bars' (pair with high coconut + high superfat). Cut salt bars while warm." },
    coffee:        { name:"Brewed coffee",      kind:"liquid",
                     note:"Use in place of your water for a coffee soap. Keep cool when adding lye; it may darken the bar." },
    coffeegrounds: { name:"Coffee grounds",     kind:"dry",
                     note:"1–2 Tbsp per lb of oils at trace for scrubby, kitchen-deodorizing exfoliation." },
    bentonite:     { name:"Bentonite clay",     kind:"dry",
                     note:"~1 tsp per lb of oils. Adds slip and 'grip' — great for shaving and facial bars. Disperse in water first." },
    silk:          { name:"Tussah silk fibers", kind:"dry",
                     note:"A small pinch dissolved into the hot lye water gives a silky, luxurious skin feel." },
    vitamine:      { name:"Vitamin E oil",      kind:"liquid",
                     note:"Antioxidant — a few drops per lb helps slow rancidity in delicate oils. Not a preservative." },
    titanium:      { name:"Titanium dioxide",   kind:"dry", colorant:true,
                     note:"Whitener for lighter colors. Disperse in a little oil or water first to avoid specks." },
    mica:          { name:"Mica (colorant)",    kind:"dry", colorant:true,
                     note:"Cosmetic color — mix into a little oil before adding at trace. Use CP-stable micas; some fade in high pH." },
    // --- natural & mineral colorants (see COLORANTS below for dosing detail) ---
    madder:        { name:"Madder root powder", kind:"dry", colorant:true,
                     note:"1–2 tsp per lb of oils for coral to dusty rose — the most reliable natural red. Infuse in oil first; more gives brick, not brighter." },
    annatto:       { name:"Annatto seed",       kind:"dry", colorant:true,
                     note:"1–2 tsp per lb of oils, infused in warm oil, for buttery yellow to deep orange. Very pH-stable." },
    indigo:        { name:"Indigo powder",      kind:"dry", colorant:true,
                     note:"½–1 tsp per lb of oils for denim blue to near-black. Disperse in oil; a tiny bit goes a long way and it can bleed." },
    alkanet:       { name:"Alkanet root",       kind:"dry", colorant:true,
                     note:"1–2 tsp per lb of oils infused in oil. Purple to grey-blue, and shifts with pH — expect a surprise until you know your recipe." },
    spirulina:     { name:"Spirulina powder",   kind:"dry", colorant:true,
                     note:"1–2 tsp per lb of oils for a soft sage green. Fades over months, especially in sunlight." },
    frenchgreen:   { name:"French green clay",  kind:"dry", colorant:true,
                     note:"1–2 tsp per lb of oils for a muted, earthy green. Also adds slip; disperse in water first." },
    roseclay:      { name:"Rose clay",          kind:"dry", colorant:true,
                     note:"1–2 tsp per lb of oils for a dusty pink that never fades. Silky and gentle; disperse in water first." },
    cocoapowder:   { name:"Cocoa powder",       kind:"dry", colorant:true,
                     note:"1–2 tsp per lb of oils for warm brown. Kitchen-cupboard reliable; disperse in oil to avoid clumps." },
    turmeric:      { name:"Turmeric powder",    kind:"dry", colorant:true,
                     note:"1–2 tsp per lb of oils for gold to mustard. Cheap and cheerful but it fades over the cure." },
    paprika:       { name:"Paprika powder",     kind:"dry", colorant:true,
                     note:"1 tsp per lb of oils for peachy orange. Can be scratchy and irritating — go light, and not for facial bars." },
    ironoxide:     { name:"Iron oxide pigment", kind:"dry", colorant:true,
                     note:"½–1 tsp per lb of oils. Red, yellow, brown or black; completely pH-stable and won't fade. Disperse in oil or water." },
    ultramarine:   { name:"Ultramarine pigment",kind:"dry", colorant:true,
                     note:"½–1 tsp per lb of oils for true blue, violet or pink. Stable in soap; disperse in oil or water first." }
  };

  /* Aromas — fragrance (FO) & essential oils (EO).
     note: top / middle / base (scent pyramid)
     rate: [min, typical, max] usage as % of oil weight (CP soap)
     tips: behavior & pairing notes                                             */
  g.AROMAS = {
    lavender:   { name:"Lavender EO",       type:"EO", note:"middle", rate:[2,3,5],
                  tips:"Calming all-rounder, well-behaved in CP. Pairs with citrus, mint, rosemary, cedarwood, patchouli." },
    peppermint: { name:"Peppermint EO",     type:"EO", note:"top", rate:[0.5,1.5,2],
                  tips:"Cooling and STRONG — a little goes far. Pairs with lavender, rosemary, eucalyptus, citrus." },
    orange:     { name:"Sweet orange EO",   type:"EO", note:"top", rate:[3,4,5],
                  tips:"Cheerful but FADES in CP — anchor with litsea or a base note. Pairs with clove, cinnamon, lavender." },
    lemon:      { name:"Lemon EO",          type:"EO", note:"top", rate:[3,4,5],
                  tips:"Bright, fades fast — anchor with litsea/may chang. Pairs with lavender, rosemary, mint." },
    litsea:     { name:"Litsea (may chang)",type:"EO", note:"top", rate:[2,3,4], anchor:true,
                  tips:"Lemony AND a natural anchor — helps citrus scents stick. Pairs with citrus and florals." },
    lemongrass: { name:"Lemongrass EO",     type:"EO", note:"top", rate:[2,3,3], irritant:true,
                  tips:"Strong, grassy-citrus; can irritate skin at high rates. Pairs with cedarwood, lavender, geranium." },
    eucalyptus: { name:"Eucalyptus EO",     type:"EO", note:"top", rate:[2,3,4],
                  tips:"Fresh & medicinal. Pairs with mint, rosemary, lavender, lemon, tea tree." },
    teatree:    { name:"Tea tree EO",       type:"EO", note:"middle", rate:[2,3,4],
                  tips:"Cleansing, medicinal. Pairs with lavender, eucalyptus, rosemary, mint." },
    rosemary:   { name:"Rosemary EO",       type:"EO", note:"middle", rate:[2,3,4],
                  tips:"Herbal & invigorating. Pairs with mint, citrus, lavender, cedarwood." },
    geranium:   { name:"Geranium EO",       type:"EO", note:"middle", rate:[2,3,4], anchor:true,
                  tips:"Rosy floral, good fixative. Pairs with lavender, citrus, patchouli, rose." },
    ylang:      { name:"Ylang ylang EO",    type:"EO", note:"base", rate:[1,2,3],
                  tips:"Rich sweet floral and a fixative. Pairs with citrus, lavender, sandalwood." },
    cedarwood:  { name:"Cedarwood EO",      type:"EO", note:"base", rate:[3,4,5],
                  tips:"Woody anchor — makes lighter scents last. Pairs with lavender, citrus, patchouli, rosemary." },
    patchouli:  { name:"Patchouli EO",      type:"EO", note:"base", rate:[2,3,4],
                  tips:"Deep, earthy anchor that improves with age. Pairs with lavender, citrus, cedarwood." },
    clove:      { name:"Clove EO",          type:"EO", note:"base", rate:[0.3,0.7,1], accel:true, discolor:true, irritant:true,
                  tips:"Warm spice, VERY strong — tiny amounts. Can accelerate trace & discolor. Pairs with orange, cinnamon." },
    cinnamon:   { name:"Cinnamon leaf EO",  type:"EO", note:"base", rate:[0.3,0.5,1], accel:true, discolor:true, irritant:true,
                  tips:"Spicy warmth; potential irritant and accelerates trace. Pairs with orange, clove, vanilla." },
    vanilla:    { name:"Vanilla FO",        type:"FO", note:"base", rate:[3,4,6], discolor:true, accel:true,
                  tips:"Vanillin DISCOLORS soap tan→brown over weeks. Use a vanilla stabilizer or lean into the color." },
    fragrance:  { name:"Fragrance oil (generic)", type:"FO", note:"middle", rate:[3,5,6],
                  tips:"Follow your supplier's max & IFRA rate. Test small — some FOs accelerate trace, discolor, or seize." }
  };

  /* Saponified-oil INCI names for the finished-bar label. The value is the word after
     "Sodium " (NaOH bars) or "Potassium " (KOH soap) — e.g. olive -> "Sodium Olivate".
     A leading "=" means use the value literally (no salt prefix), for things that are
     listed as-is. INCI conventions vary by supplier/region — always verify before sale. */
  g.OIL_INCI = {
    olive:"Olivate", coconut:"Cocoate", palm:"Palmate", palmkernel:"Palm Kernelate",
    castor:"Castorate", shea:"Shea Butterate", cocoa:"Cocoa Butterate", mango:"Mango Butterate",
    kokum:"Kokum Butterate", almond:"Sweet Almondate", apricot:"Apricot Kernelate", avocado:"Avocadoate",
    argan:"Arganate", macadamia:"Macadamiate", sunflower:"Sunflowerseedate", canola:"Canolate",
    grapeseed:"Grapeseedate", ricebran:"Rice Branate", sesame:"Sesameseedate", soybean:"Soyate",
    corn:"Cornate", peanut:"Peanutate", hemp:"Hempseedate", neem:"Neemate", jojoba:"Jojobate",
    lard:"Lardate", tallow:"Tallowate", babassu:"Babassuate", beeswax:"=Beeswax (Cera Alba)",
    stearic:"Stearate", shortening:"Vegetable Shorteningate", vegoil:"Soyate", safflower:"Safflowerate",
    safflowerho:"Safflowerate", sunflowerho:"Sunflowerseedate", cottonseed:"Cottonseedate",
    walnut:"Walnutate", flax:"Linseedate", wheatgerm:"Wheat Germate", pumpkinseed:"Pumpkin Seedate",
    rosehip:"Rosehip Seedate", emu:"Emuate"
  };
  /* INCI (label) names for additives that stay in the finished bar. */
  g.ADDITIVE_INCI = {
    goatmilk:"Goat Milk", coconutmilk:"Cocos Nucifera (Coconut) Milk", honey:"Honey (Mel)",
    sodiumlactate:"Sodium Lactate", oatmeal:"Colloidal Oatmeal (Avena Sativa)", kaolin:"Kaolin",
    charcoal:"Charcoal Powder", glycerin:"Glycerin", aloe:"Aloe Barbadensis Leaf Juice",
    sugar:"Sucrose", salt:"Sodium Chloride", coffee:"Coffee (Coffea) Extract", coffeegrounds:"Coffee (Coffea) Powder",
    bentonite:"Bentonite", silk:"Hydrolyzed Silk", vitamine:"Tocopherol (Vitamin E)",
    titanium:"Titanium Dioxide (CI 77891)", mica:"Mica",
    madder:"Rubia Tinctorum (Madder) Root Powder", annatto:"Bixa Orellana (Annatto) Seed Powder",
    indigo:"Indigofera Tinctoria (Indigo) Leaf Powder", alkanet:"Alkanna Tinctoria Root Powder",
    spirulina:"Spirulina Platensis Powder", frenchgreen:"Illite (French Green Clay)",
    roseclay:"Kaolin (Rose Clay)", cocoapowder:"Theobroma Cacao (Cocoa) Powder",
    turmeric:"Curcuma Longa (Turmeric) Root Powder", paprika:"Capsicum Annuum (Paprika) Fruit Powder",
    ironoxide:"Iron Oxides (CI 77491, CI 77492, CI 77499)", ultramarine:"Ultramarines (CI 77007)"
  };

  /* Colorants — what to use, how much, how to add it, and what soap's high pH
     does to it. family groups the guide; dose is per lb (450 g) of oils.        */
  g.COLORANTS = [
    // ---- White ----
    { name:"Titanium dioxide", family:"White", dose:"½–1 tsp PPO",
      how:"Disperse in a little light oil (water-soluble grades in water) and blend smooth — clumps show up as white specks.",
      behaviour:"Completely stable. Use it to lighten a base before adding another colour, or to fight the tan a vanilla-heavy fragrance will bring. Too much can cause glycerin rivers." },
    { name:"Kaolin clay", family:"White", dose:"1 tsp PPO",
      how:"Disperse in an equal amount of water first.",
      behaviour:"An off-white that also adds silky slip and anchors fragrance. Not a strong whitener — reach for titanium dioxide for that." },
    // ---- Yellow & orange ----
    { name:"Annatto seed", family:"Yellow & orange", dose:"1–2 tsp PPO, infused",
      how:"Warm the seeds in part of your oils (an hour on low, or a week on the shelf), strain, then use that oil in the recipe.",
      behaviour:"The most dependable natural yellow — buttery at low doses, deep orange at high. Holds its colour through cure and sunlight." },
    { name:"Turmeric", family:"Yellow & orange", dose:"1–2 tsp PPO",
      how:"Disperse in oil; infusing gives a more even colour than stirring the powder in at trace.",
      behaviour:"Bright gold at first, but it FADES over a few months, often to a dull tan. Cheap to experiment with, not the one for a gift you'll wrap in a year." },
    { name:"Paprika", family:"Yellow & orange", dose:"~1 tsp PPO",
      how:"Infuse in oil and strain — un-strained powder stays gritty.",
      behaviour:"Warm peach to orange. Can be scratchy and skin-irritating at higher doses; keep it out of facial and shaving bars." },
    { name:"Yellow iron oxide", family:"Yellow & orange", dose:"½–1 tsp PPO",
      how:"Disperse in oil or water and blend until no streaks remain.",
      behaviour:"A mineral pigment, not a botanical: completely pH-stable, won't fade, and gives a flat mustard-to-ochre." },
    // ---- Red & pink ----
    { name:"Madder root", family:"Red & pink", dose:"1–2 tsp PPO, infused",
      how:"Infuse in oil (warm, then strain) for coral; stir the powder in at trace for a deeper, speckled rose.",
      behaviour:"The best natural red there is, and it still lands closer to coral or dusty rose than true red. More powder gives brick and brown, not brighter — natural reds are genuinely hard." },
    { name:"Rose clay", family:"Red & pink", dose:"1–2 tsp PPO",
      how:"Disperse in an equal amount of water before adding at trace.",
      behaviour:"A soft, dusty pink that never fades, plus gentle slip. The reliable pink when madder disappoints." },
    { name:"Red iron oxide", family:"Red & pink", dose:"½–1 tsp PPO",
      how:"Disperse in oil or water.",
      behaviour:"Brick red to rust, entirely stable. Pink comes from using very little, or from mixing with titanium dioxide." },
    { name:"Pink ultramarine", family:"Red & pink", dose:"½–1 tsp PPO",
      how:"Disperse in oil or water.",
      behaviour:"A clean pink that survives high pH — but ultramarines can react with acids, so keep them away from citric acid or vinegar in the recipe." },
    // ---- Green ----
    { name:"Spirulina", family:"Green", dose:"1–2 tsp PPO",
      how:"Disperse in oil or a little water at trace.",
      behaviour:"A soft sage that FADES over a few months, faster on a sunny windowsill. Lovely fresh; plan for it to soften." },
    { name:"French green clay", family:"Green", dose:"1–2 tsp PPO",
      how:"Disperse in an equal amount of water first.",
      behaviour:"Muted, earthy green that holds. Also adds slip and a little oil absorption — good for a facial bar." },
    { name:"Green chromium oxide", family:"Green", dose:"½–1 tsp PPO",
      how:"Disperse in oil or water.",
      behaviour:"A pigment, so the colour you mix is the colour you get, forever. Reads slightly olive; blend with a blue for a truer green." },
    // ---- Blue & purple ----
    { name:"Indigo", family:"Blue & purple", dose:"⅛–1 tsp PPO",
      how:"Disperse in oil, and start with far less than you think — ⅛ tsp already colours a pound.",
      behaviour:"Denim blue through to near-black at higher doses. The one natural blue that works, but it can bleed between layers in a swirl." },
    { name:"Alkanet root", family:"Blue & purple", dose:"1–2 tsp PPO, infused",
      how:"Infuse in oil for a week or warm for an hour, then strain.",
      behaviour:"Genuinely pH-sensitive: purple in a well-balanced bar, drifting grey-blue when the soap is more alkaline, and pinker in a low-pH one. Expect a surprise until you've made the recipe once." },
    { name:"Ultramarine blue / violet", family:"Blue & purple", dose:"½–1 tsp PPO",
      how:"Disperse in oil or water.",
      behaviour:"True blue and violet that survive soap — the practical route to purple. Avoid pairing with acidic additives, which can release a sulphur smell." },
    // ---- Brown & black ----
    { name:"Cocoa powder", family:"Brown & black", dose:"1–2 tsp PPO",
      how:"Disperse in oil and blend well — dropped in dry it clumps.",
      behaviour:"Warm, dependable brown from the kitchen cupboard. It smells of chocolate in the pot and not at all in the finished bar." },
    { name:"Coffee grounds", family:"Brown & black", dose:"1–2 Tbsp PPO",
      how:"Stir in at trace; used coffee grounds are less scratchy than fresh.",
      behaviour:"Speckled brown with real exfoliation. Brewed coffee used in place of the water darkens the whole bar to tan on its own." },
    { name:"Activated charcoal", family:"Brown & black", dose:"¼–1 tsp PPO",
      how:"Disperse in oil; it's light and will fly everywhere, so mix it in a covered jar.",
      behaviour:"Pale grey through to true black. Overdo it and the lather turns grey and marks a washcloth." },
    { name:"Black iron oxide", family:"Brown & black", dose:"½–1 tsp PPO",
      how:"Disperse in oil or water.",
      behaviour:"A flatter, denser black than charcoal, and it doesn't grey the lather. Fully stable." },
    // ---- Anything else ----
    { name:"Mica", family:"Anything else", dose:"1–2 tsp PPO",
      how:"Mix into a spoonful of light oil to a smooth slurry before adding at trace.",
      behaviour:"Buy CP-STABLE micas: many cosmetic micas are coloured with dyes that morph or vanish at soap's pH. The shimmer largely disappears inside a bar — mica shines brightest dusted on the top." },
    { name:"Botanicals (petals, herbs)", family:"Anything else", dose:"a pinch, on top",
      how:"Sprinkle on the surface after pouring rather than stirring through.",
      behaviour:"Almost everything botanical turns brown in soap — lavender buds, rose petals, citrus zest. Calendula petals are the famous exception and stay gold." }
  ];

  /* General blending guidance shown in the Scents tab. */
  g.BLEND_TIPS = [
    { h:"Aim for ~3% total scent", t:"For cold-process bars, total fragrance around 3% of oil weight is a safe, strong default (EOs often 2–4%; FOs per supplier/IFRA). This app totals it for you." },
    { h:"Balance the note pyramid", t:"Top notes (citrus, mint) are the first impression but fade; middle notes (lavender, floral, herb) are the body; base notes (wood, spice, patchouli, vanilla) anchor everything. A rough 3 : 5 : 2 top : middle : base blend ages well." },
    { h:"Anchor your top notes", t:"Citrus vanishes during cure. Pair it with a base note or with litsea (may chang) so the scent survives." },
    { h:"Watch for accelerators", t:"Spices (clove, cinnamon), some florals, and many FOs speed up trace or 'rice'/seize. Soap at low temperature and hand-stir when using them." },
    { h:"Expect some discoloration", t:"Vanillin (vanilla, many warm FOs) and spice oils turn soap tan to brown. Plan your colors around it or use a vanilla stabilizer." },
    { h:"Respect skin-safe limits", t:"Some EOs (cinnamon, clove, lemongrass) irritate skin above low rates. Always stay within IFRA / supplier maximums." }
  ];

  /* "Why did my soap do X?" — common cold-process problems, grouped by stage.
     when: stage · q: symptom · why: cause · fix: what to do / avoid next time. */
  g.TROUBLESHOOTING = [
    // ---- In the pot ----
    { when:"In the pot", q:"It seized — went thick, lumpy or 'ricey' fast",
      why:"Usually a fragrance or essential oil that accelerates trace (spices like clove & cinnamon, some FOs), or soaping too hot.",
      fix:"Work fast — glop it into the mold and press it down; it'll still be soap. Next time soap cooler (~90–100°F/32–38°C), hand-stir once the scent is in, and add accelerating scents last." },
    { when:"In the pot", q:"It won't come to trace — stays liquid",
      why:"A soft, olive-heavy blend traces slowly; temps may be too low; or it's just under-blended.",
      fix:"Pulse the stick blender in short bursts (don't run it constantly), warm the batter slightly, and double-check you weighed the lye and oils correctly." },
    { when:"In the pot", q:"It separated — an oily layer or pooling",
      why:"A 'false trace' (it looked thick but hadn't emulsified), or the lye water wasn't fully mixed in.",
      fix:"If you catch it right away, blend it back together to a true trace. If it's already set that way, rebatch it (grate, melt with a splash of water, re-mold)." },
    // ---- In the mold ----
    { when:"In the mold", q:"Volcano or cracked, cratered top",
      why:"It overheated during gel — often from honey, milk or sugar, a hot fragrance, or too much insulation.",
      fix:"Don't insulate; move it somewhere cool or into the fridge/freezer. Next time soap at a lower temperature and skip the blanket." },
    { when:"In the mold", q:"White powdery film on top (soda ash)",
      why:"Surface lye reacting with air before the bar set. Harmless and cosmetic.",
      fix:"Spritz 91%+ alcohol right after pouring, or cover the mold; force gel. On a cured bar, steam it, or rinse/rub it off." },
    { when:"In the mold", q:"Translucent crackly streaks (glycerin rivers)",
      why:"Overheating, usually with titanium dioxide and/or a lot of water.",
      fix:"Soap cooler, use a water discount (higher lye concentration), and don't over-insulate." },
    { when:"In the mold", q:"White chalky spots or pockets inside",
      why:"Could be unmelted hard oil — or unmixed lye, which is caustic. Take it seriously.",
      fix:"Zap-test a spot (a battery-like zing = active lye). If it zaps or feels lye-heavy, rebatch. Blend more thoroughly and fully melt hard oils next time." },
    { when:"In the mold", q:"Air bubbles or holes in the bars",
      why:"The stick blender whipped in air, or you poured at a thick trace.",
      fix:"Keep the blender head fully submerged, tap the mold firmly on the counter after pouring, and pour at a thinner trace." },
    // ---- Curing & storing ----
    { when:"Curing & storing", q:"Bar is soft, dents, or won't release",
      why:"Too much soft oil, too much water, a high superfat — or it just isn't cured yet.",
      fix:"Give it the full cure first. Next batch: add hard oils/butters, use a water discount, or a little sodium lactate in the lye water." },
    { when:"Curing & storing", q:"Crumbly, brittle, or cracks when cut",
      why:"Too much hard oil or a lye-heavy batch, too little water, or a salt bar cut cold.",
      fix:"Cut salt bars while still warm (within a few hours). Add a soft oil for the next batch, and check your superfat isn't at 0%." },
    { when:"Curing & storing", q:"Orange or brown spots, rancid smell (DOS)",
      why:"'Dreaded orange spots' — oils past their prime, high-linoleic oils, or too much superfat going rancid.",
      fix:"Use fresh oils, add vitamin E or ROE, keep superfat modest, and store bars cool, dry and airy." },
    { when:"Curing & storing", q:"Bar sweats or beads with liquid",
      why:"Glycerin in the soap is pulling moisture out of humid air.",
      fix:"Cure and store somewhere dry with airflow; only wrap bars after a full cure." },
    { when:"Curing & storing", q:"It discolored — turned tan or brown",
      why:"Vanillin in the fragrance, or spice oils. Expected, not a fault.",
      fix:"Use a vanilla stabilizer, or plan your colors around the browning." },
    // ---- Using the bar ----
    { when:"Using the bar", q:"Little or no lather",
      why:"A soft-oil-heavy blend, not enough coconut/castor, hard water, or using it before it's cured.",
      fix:"Finish the cure (lather improves a lot). Next batch add coconut and ~5% castor oil." },
    { when:"Using the bar", q:"Feels drying or squeaky",
      why:"Cleansing is too high (usually too much coconut) or the superfat is too low.",
      fix:"Raise superfat to ~5–8% and/or cut back the coconut/palm-kernel oil." },
    { when:"Using the bar", q:"The scent faded",
      why:"Top notes (citrus, mint) are volatile and mostly vanish during cure.",
      fix:"Anchor them with a base note (patchouli, cedarwood) or litsea (may chang) so the scent lasts." }
  ];

  /* Example / starter recipes. Oils sum ~1000 g (easy to rescale). Keys map to
     OILS / ADDITIVES / AROMAS above. Loading one adds it as a saved recipe.     */
  g.EXAMPLES = [
    // ---- Bar soaps (NaOH) ----
    { name:"Classic Gentle Bar", cat:"Bar", lye:"naoh", sf:5, water:38,
      oils:{olive:400,coconut:250,palm:200,shea:100,castor:50}, aromas:{lavender:30},
      note:"Balanced everyday bar — hard, mild, and good lather." },
    { name:"Pure Castile", cat:"Bar", lye:"naoh", sf:5, water:38,
      oils:{olive:1000},
      note:"100% olive oil. Very gentle and low-lather; slow to trace and needs a 4–6 month cure." },
    { name:"Bastille (Olive + Coconut)", cat:"Bar", lye:"naoh", sf:5, water:38,
      oils:{olive:700,coconut:250,castor:50},
      note:"Olive-heavy but with a little more bubble than castile. Long-ish cure." },
    { name:"Luxury Butter Bar", cat:"Bar", lye:"naoh", sf:6, water:38,
      oils:{olive:300,coconut:250,cocoa:150,shea:150,avocado:100,castor:50}, aromas:{ylang:15,lavender:15},
      note:"Rich, conditioning bar built on cocoa & shea butter." },
    { name:"Palm-Free Bar", cat:"Bar", lye:"naoh", sf:5, water:38,
      oils:{olive:350,coconut:300,shea:200,cocoa:100,castor:50},
      note:"No palm oil — the butters provide the hardness instead." },
    { name:"Old-Fashioned Tallow Bar", cat:"Bar", lye:"naoh", sf:5, water:38,
      oils:{tallow:500,coconut:300,olive:150,castor:50},
      note:"Traditional hard, long-lasting, low-cost bar from beef tallow." },
    { name:"Coconut Salt Spa Bar", cat:"Bar", lye:"naoh", sf:15, water:33,
      oils:{coconut:800,shea:100,avocado:50,castor:50}, additives:{salt:500},
      note:"Rock-hard 'spa' bar with a lotion-y lather. The high superfat offsets all that coconut — cut the bars while still warm." },
    { name:"Shaving Bar", cat:"Bar", lye:"naoh", sf:5, water:38,
      oils:{olive:300,coconut:250,shea:200,castor:100,stearic:100,cocoa:50}, additives:{bentonite:20,kaolin:20},
      note:"Dense, slippery lather for a shaving brush. Stearic and clay add glide." },

    // ---- Liquid soaps (KOH) ----
    { name:"Liquid Hand Soap", cat:"Liquid", lye:"koh", koh:90, sf:3, water:38,
      oils:{olive:400,coconut:300,castor:150,sunflower:150}, aromas:{lemon:20,litsea:10},
      note:"KOH soap paste — dilute the finished paste with water to the thickness you like." },
    { name:"Liquid Castile", cat:"Liquid", lye:"koh", koh:90, sf:2, water:38,
      oils:{olive:700,coconut:200,castor:100},
      note:"Gentle olive-based liquid soap (Dr-Bronner style). Dilute generously." },
    { name:"Liquid Shampoo", cat:"Liquid", lye:"koh", koh:90, sf:3, water:38,
      oils:{coconut:300,olive:300,castor:200,sunflower:150,jojoba:50}, aromas:{rosemary:20,peppermint:10},
      note:"Soap-based (high-pH) shampoo. Follow with an acidic vinegar rinse to smooth the hair cuticle." },

    // ---- Dish soap ----
    { name:"Liquid Dish Soap", cat:"Dish", lye:"koh", koh:90, sf:1, water:38,
      oils:{coconut:600,castor:200,olive:200},
      note:"Grease-cutting KOH dish soap. Very low superfat so it rinses clean — dilute well." },
    { name:"Solid Dish Block", cat:"Dish", lye:"naoh", sf:1, water:38,
      oils:{coconut:700,olive:150,castor:100,palm:50},
      note:"Rub a wet brush or sponge on the block. High coconut cuts grease; ~1% superfat keeps it from feeling greasy." },

    // ---- Laundry soap ----
    { name:"Laundry Bar (grated)", cat:"Laundry", lye:"naoh", sf:0, water:38,
      oils:{coconut:500,tallow:300,olive:100,castor:100},
      note:"0% superfat so no oils are left on your clothes. Cure hard, grate, then mix 1:1:1 with washing soda + borax for laundry powder." },
    { name:"Palm-Free Laundry Bar", cat:"Laundry", lye:"naoh", sf:0, water:38,
      oils:{coconut:600,olive:300,castor:100},
      note:"Vegan laundry bar, 0% superfat. Grate and combine with washing soda + borax (both stirred in, not saponified)." }
  ];

})(window);
