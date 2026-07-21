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
    olive:      { name:"Olive oil",         sap:.134,  iod:85,  ins:105, fa:{la:0, my:0, pa:14,st:3, ri:0, ol:69,li:12,ln:1} },
    coconut:    { name:"Coconut oil (76°)", sap:.178,  iod:10,  ins:258, fa:{la:48,my:19,pa:9, st:3, ri:0, ol:8, li:2, ln:0} },
    palm:       { name:"Palm oil",          sap:.141,  iod:53,  ins:145, fa:{la:0, my:1, pa:44,st:5, ri:0, ol:39,li:10,ln:0} },
    palmkernel: { name:"Palm kernel oil",   sap:.156,  iod:20,  ins:227, fa:{la:49,my:16,pa:8, st:2, ri:0, ol:15,li:3, ln:0} },
    castor:     { name:"Castor oil",        sap:.1286, iod:86,  ins:95,  fa:{la:0, my:0, pa:0, st:0, ri:90,ol:4, li:5, ln:0} },
    shea:       { name:"Shea butter",       sap:.128,  iod:59,  ins:116, fa:{la:0, my:0, pa:5, st:40,ri:0, ol:48,li:6, ln:0} },
    cocoa:      { name:"Cocoa butter",      sap:.137,  iod:37,  ins:157, fa:{la:0, my:0, pa:28,st:33,ri:0, ol:35,li:3, ln:0} },
    mango:      { name:"Mango butter",      sap:.1339, iod:47,  ins:146, fa:{la:0, my:0, pa:7, st:42,ri:0, ol:45,li:3, ln:0} },
    kokum:      { name:"Kokum butter",      sap:.1385, iod:35,  ins:128, fa:{la:0, my:0, pa:5, st:56,ri:0, ol:34,li:2, ln:0} },
    almond:     { name:"Sweet almond oil",  sap:.136,  iod:99,  ins:97,  fa:{la:0, my:0, pa:7, st:2, ri:0, ol:71,li:18,ln:0} },
    apricot:    { name:"Apricot kernel oil",sap:.135,  iod:100, ins:91,  fa:{la:0, my:0, pa:6, st:1, ri:0, ol:66,li:27,ln:0} },
    avocado:    { name:"Avocado oil",       sap:.133,  iod:86,  ins:99,  fa:{la:0, my:0, pa:20,st:2, ri:0, ol:58,li:12,ln:1} },
    argan:      { name:"Argan oil",         sap:.136,  iod:95,  ins:95,  fa:{la:0, my:0, pa:12,st:6, ri:0, ol:45,li:35,ln:0} },
    macadamia:  { name:"Macadamia oil",     sap:.139,  iod:76,  ins:119, fa:{la:0, my:0, pa:8, st:3, ri:0, ol:59,li:2, ln:0} },
    sunflower:  { name:"Sunflower oil",     sap:.134,  iod:133, ins:63,  fa:{la:0, my:0, pa:7, st:4, ri:0, ol:16,li:70,ln:1} },
    canola:     { name:"Canola oil",        sap:.1241, iod:110, ins:56,  fa:{la:0, my:0, pa:4, st:2, ri:0, ol:61,li:21,ln:9} },
    grapeseed:  { name:"Grapeseed oil",     sap:.1265, iod:131, ins:66,  fa:{la:0, my:0, pa:8, st:4, ri:0, ol:20,li:68,ln:0} },
    ricebran:   { name:"Rice bran oil",     sap:.128,  iod:100, ins:70,  fa:{la:0, my:1, pa:22,st:2, ri:0, ol:42,li:32,ln:1} },
    sesame:     { name:"Sesame oil",        sap:.133,  iod:108, ins:81,  fa:{la:0, my:0, pa:10,st:5, ri:0, ol:40,li:45,ln:0} },
    soybean:    { name:"Soybean oil",       sap:.135,  iod:130, ins:61,  fa:{la:0, my:0, pa:11,st:4, ri:0, ol:24,li:50,ln:7} },
    corn:       { name:"Corn oil",          sap:.136,  iod:117, ins:69,  fa:{la:0, my:0, pa:12,st:2, ri:0, ol:30,li:55,ln:1} },
    peanut:     { name:"Peanut oil",        sap:.136,  iod:92,  ins:99,  fa:{la:0, my:0, pa:8, st:3, ri:0, ol:56,li:26,ln:0} },
    hemp:       { name:"Hemp seed oil",     sap:.1345, iod:165, ins:39,  fa:{la:0, my:0, pa:6, st:2, ri:0, ol:12,li:57,ln:21} },
    neem:       { name:"Neem oil",          sap:.1387, iod:70,  ins:124, fa:{la:0, my:0, pa:18,st:18,ri:0, ol:45,li:15,ln:0} },
    jojoba:     { name:"Jojoba oil",        sap:.069,  iod:83,  ins:11,  fa:{la:0, my:0, pa:1, st:0, ri:0, ol:12,li:0, ln:0} },
    lard:       { name:"Lard",              sap:.138,  iod:57,  ins:139, fa:{la:0, my:1, pa:28,st:14,ri:0, ol:46,li:6, ln:0} },
    tallow:     { name:"Beef tallow",       sap:.1405, iod:42,  ins:147, fa:{la:0, my:3, pa:28,st:22,ri:0, ol:36,li:3, ln:1} },
    babassu:    { name:"Babassu oil",       sap:.175,  iod:15,  ins:230, fa:{la:50,my:20,pa:11,st:4, ri:0, ol:10,li:3, ln:0} },
    beeswax:    { name:"Beeswax",           sap:.069,  iod:10,  ins:84,  fa:{la:0, my:0, pa:0, st:0, ri:0, ol:0, li:0, ln:0},
                  note:"Hardener — use 1–3%. Raises rigidity but can dull lather and speed trace." },
    stearic:    { name:"Stearic acid",      sap:.148,  iod:0,   ins:197, fa:{la:0, my:0, pa:0, st:100,ri:0,ol:0, li:0, ln:0},
                  note:"Pure hardener — use 0.5–1%. Firms bars fast and can accelerate trace." },

    // --- widely available at grocery / pharmacy / craft stores / Amazon ---
    shortening: { name:"Vegetable shortening",   sap:.136,  iod:65,  ins:115, fa:{la:0, my:0, pa:25,st:15,ri:0, ol:42,li:16,ln:2},
                  note:"Cheap grocery shortening (e.g. Crisco) — an easy, low-cost hard-oil for firmer bars." },
    vegoil:     { name:"Vegetable oil (soybean)",sap:.135,  iod:130, ins:61,  fa:{la:0, my:0, pa:11,st:4, ri:0, ol:24,li:50,ln:7} },
    safflower:  { name:"Safflower oil",          sap:.1362, iod:145, ins:47,  fa:{la:0, my:0, pa:7, st:2, ri:0, ol:13,li:77,ln:1} },
    safflowerho:{ name:"Safflower (high-oleic)", sap:.1362, iod:90,  ins:90,  fa:{la:0, my:0, pa:5, st:2, ri:0, ol:75,li:16,ln:0} },
    sunflowerho:{ name:"Sunflower (high-oleic)", sap:.134,  iod:83,  ins:97,  fa:{la:0, my:0, pa:4, st:4, ri:0, ol:81,li:9, ln:0} },
    cottonseed: { name:"Cottonseed oil",         sap:.1386, iod:108, ins:89,  fa:{la:0, my:0, pa:23,st:2, ri:0, ol:18,li:53,ln:1} },
    walnut:     { name:"Walnut oil",             sap:.1353, iod:145, ins:45,  fa:{la:0, my:0, pa:7, st:2, ri:0, ol:18,li:60,ln:11} },
    flax:       { name:"Flaxseed (linseed) oil", sap:.1357, iod:178, ins:30,  fa:{la:0, my:0, pa:5, st:4, ri:0, ol:20,li:18,ln:53},
                  note:"Very high linolenic — nice but prone to DOS (rancid spots); use small amounts and keep it fresh." },
    wheatgerm:  { name:"Wheat germ oil",         sap:.131,  iod:128, ins:58,  fa:{la:0, my:0, pa:17,st:1, ri:0, ol:15,li:55,ln:7} },
    pumpkinseed:{ name:"Pumpkin seed oil",       sap:.1363, iod:125, ins:67,  fa:{la:0, my:0, pa:12,st:6, ri:0, ol:30,li:50,ln:0} },
    rosehip:    { name:"Rosehip seed oil",       sap:.1378, iod:185, ins:16,  fa:{la:0, my:0, pa:4, st:2, ri:0, ol:14,li:44,ln:33},
                  note:"Skincare oil, high in polyunsaturates — best as a small superfat treat; goes rancid quickly." },
    emu:        { name:"Emu oil",                sap:.1359, iod:60,  ins:128, fa:{la:0, my:0, pa:22,st:9, ri:0, ol:47,li:15,ln:1} }
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
    charcoal:      { name:"Activated charcoal",kind:"dry",
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
    titanium:      { name:"Titanium dioxide",   kind:"dry",
                     note:"Whitener for lighter colors. Disperse in a little oil or water first to avoid specks." },
    mica:          { name:"Mica (colorant)",    kind:"dry",
                     note:"Cosmetic color — mix into a little oil before adding at trace. Use CP-stable micas; some fade in high pH." }
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

  /* General blending guidance shown in the Scents tab. */
  g.BLEND_TIPS = [
    { h:"Aim for ~3% total scent", t:"For cold-process bars, total fragrance around 3% of oil weight is a safe, strong default (EOs often 2–4%; FOs per supplier/IFRA). This app totals it for you." },
    { h:"Balance the note pyramid", t:"Top notes (citrus, mint) are the first impression but fade; middle notes (lavender, floral, herb) are the body; base notes (wood, spice, patchouli, vanilla) anchor everything. A rough 3 : 5 : 2 top : middle : base blend ages well." },
    { h:"Anchor your top notes", t:"Citrus vanishes during cure. Pair it with a base note or with litsea (may chang) so the scent survives." },
    { h:"Watch for accelerators", t:"Spices (clove, cinnamon), some florals, and many FOs speed up trace or 'rice'/seize. Soap at low temperature and hand-stir when using them." },
    { h:"Expect some discoloration", t:"Vanillin (vanilla, many warm FOs) and spice oils turn soap tan to brown. Plan your colors around it or use a vanilla stabilizer." },
    { h:"Respect skin-safe limits", t:"Some EOs (cinnamon, clove, lemongrass) irritate skin above low rates. Always stay within IFRA / supplier maximums." }
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
