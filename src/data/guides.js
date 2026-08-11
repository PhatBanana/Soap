/* Soap Calc reference data — guidance text and worked example recipes.
   Values are STANDARD REFERENCES and vary by supplier. Always verify before a
   real batch. Lye is caustic — wear gloves & eye protection. */

/* General blending guidance shown in the Scents tab. */
export const BLEND_TIPS = [
  { h:"Aim for ~3% total scent", t:"For cold-process bars, total fragrance around 3% of oil weight is a safe, strong default (EOs often 2–4%; FOs per supplier/IFRA). This app totals it for you." },
  { h:"Balance the note pyramid", t:"Top notes (citrus, mint) are the first impression but fade; middle notes (lavender, floral, herb) are the body; base notes (wood, spice, patchouli, vanilla) anchor everything. A rough 3 : 5 : 2 top : middle : base blend ages well." },
  { h:"Anchor your top notes", t:"Citrus vanishes during cure. Pair it with a base note or with litsea (may chang) so the scent survives." },
  { h:"Watch for accelerators", t:"Spices (clove, cinnamon), some florals, and many FOs speed up trace or 'rice'/seize. Soap at low temperature and hand-stir when using them." },
  { h:"Expect some discoloration", t:"Vanillin (vanilla, many warm FOs) and spice oils turn soap tan to brown. Plan your colors around it or use a vanilla stabilizer." },
  { h:"Respect skin-safe limits", t:"Some EOs (cinnamon, clove, lemongrass) irritate skin above low rates. Always stay within IFRA / supplier maximums." }
];

/* Lye first aid. Same shape as TROUBLESHOOTING so it renders through the same code.
   This is the standard first aid off a sodium/potassium hydroxide safety data sheet —
   not medical advice, and deliberately carrying no emergency phone number, because the
   app has no idea what country it's being read in.
   The app warns that lye is caustic in eight different places and, until now, said
   nothing whatever about what to do once it lands on someone. */
export const FIRST_AID = [
  { when:"On skin", q:"Lye or raw soap batter splashed on skin",
    why:"Sodium and potassium hydroxide saponify skin oils on contact, and keep doing it while they sit there. A splash that only stings at first can go on damaging tissue for a long time.",
    fix:"Get it under lots of cool running water NOW and stay there 15–20 minutes — much longer than feels necessary. Peel off contaminated clothing, rings and watches while the water is still running, not before. If the skin is blistered, broken, or still painful after flushing, get it seen by a doctor. That slippery, soapy feeling is not soap you've rinsed on — it's your own skin being turned into soap, so keep flushing until it's gone." },
  { when:"On skin", q:"Should I neutralise it with vinegar?",
    why:"No — and this is the most repeated bad advice in soaping. Pouring an acid onto an alkali burn is an exothermic reaction: it releases heat into tissue that is already injured, so you add a thermal burn to a chemical one.",
    fix:"Water. Lots of it, for a long time. Never vinegar, never lemon juice, never anything that promises to 'neutralise' the burn. Vinegar has its uses in soaping — as a hair rinse, and kept away from ultramarine pigments — but never on skin that lye has touched." },
  { when:"In eyes", q:"Lye, lye water or batter got in an eye",
    why:"Alkali eye injuries are the serious ones. Unlike acids, hydroxides keep penetrating the eye rather than stopping at the surface, so damage continues for as long as it's in there.",
    fix:"Flush immediately with clean water or saline for at least 15–20 minutes, holding the eyelid open — the reflex is to clamp shut and that's the worst thing. Take contact lenses out if they come easily; don't hunt for them. Then get emergency medical care, even if it feels better. Treat this as an emergency every time, and call your local emergency number." },
  { when:"Swallowed", q:"Someone swallowed lye or lye water",
    why:"It burns the mouth, throat and gullet on the way down. Vomiting sends it back through the same tissue a second time, which is why the usual advice to induce vomiting is exactly wrong here.",
    fix:"Do NOT make them vomit. Do NOT give anything to 'neutralise' it. If they're conscious and able to swallow, rinse the mouth and let them sip a little water or milk. Call your local poison line or emergency number straight away, and say it was sodium (or potassium) hydroxide — the name matters to whoever picks up." },
  { when:"Breathed in", q:"The lye water fumed and I breathed it",
    why:"Dissolving lye in water is exothermic and throws off a caustic vapour for the first minute or so. It's why the instruction is always to mix in a ventilated place, and why you look away as it goes in.",
    fix:"Move to fresh air. Coughing and a raw throat usually settle quickly. If breathing is difficult, or there's wheezing or chest tightness, get medical help. Next time: mix outdoors or under an extractor, turn your face away as the lye goes in, and consider a mask rated for it." },
  { when:"Spills", q:"Dry lye or lye water spilled on the bench or floor",
    why:"A wet cloth on dry lye smears a dilute caustic solution across a larger area and over your hand. Lye also attacks aluminium vigorously enough to give off hydrogen.",
    fix:"Gloves on first. Scoop dry lye up dry — a stiff card and a dustpan kept for the job — trying not to raise dust, then wash the area with plenty of water. For spilled solution, flood it with lots of water and mop it away. Keep it off aluminium pans, foil and worktop trim. Bin the cleanup materials once they're thoroughly rinsed." },
  { when:"Storing it", q:"How should lye be kept between batches?",
    why:"Lye pulls moisture and carbon dioxide straight out of the air, so an open tub turns to clumped, weakened flake. It's also the single most dangerous thing in a soaping cupboard.",
    fix:"Airtight, in its original labelled container, somewhere high, dry and locked away from children and pets. Never in a drinks bottle or an unlabelled jar — that's how the swallowing accidents happen. Keep it well away from acids and from anything aluminium. Clumped, damp lye is weakened lye: the app's SAP maths assumes fresh, and a zap test on the finished bar is what catches the difference." },
  { when:"Leftovers", q:"What do I do with lye water I didn't use?",
    why:"Concentrated lye solution poured away is both a plumbing hazard and, in many places, a disposal one — and it will eat aluminium traps on the way down.",
    fix:"Best answer is not to have any: mix what the recipe calls for. If you do have leftovers, label the container clearly and keep it for the next batch, or dilute it heavily with lots of cold running water and check what your local rules say before it goes down a drain. Don't tip it on the garden and don't put it in the household bin as liquid." }
];

/* "Why did my soap do X?" — common cold-process problems, grouped by stage.
   when: stage · q: symptom · why: cause · fix: what to do / avoid next time. */
export const TROUBLESHOOTING = [
  // ---- In the pot ----
  { when:"In the pot", q:"It seized — went thick, lumpy or 'ricey' fast",
    why:"Usually a fragrance or essential oil that accelerates trace (spices like clove & cinnamon, some FOs), or soaping too hot.",
    fix:"Work fast — glop it into the mold and press it down; it'll still be soap. Next time soap cooler (~90–100°F/32–38°C), hand-stir once the scent is in, and add accelerating scents last.",
    see:"rebatch" },
  { when:"In the pot", q:"It won't come to trace — stays liquid",
    why:"A soft, olive-heavy blend traces slowly; temps may be too low; or it's just under-blended.",
    fix:"Pulse the stick blender in short bursts (don't run it constantly), warm the batter slightly, and double-check you weighed the lye and oils correctly." },
  { when:"In the pot", q:"It separated — an oily layer or pooling",
    why:"A 'false trace' (it looked thick but hadn't emulsified), or the lye water wasn't fully mixed in.",
    fix:"If you catch it right away, blend it back together to a true trace. If it's already set that way, rebatch it (grate, melt with a splash of water, re-mold).",
    see:"rebatch" },
  // ---- In the mold ----
  { when:"In the mold", q:"Volcano or cracked, cratered top",
    why:"It overheated during gel — often from honey, milk or sugar, a hot fragrance, or too much insulation.",
    fix:"Don't insulate; move it somewhere cool or into the fridge/freezer. Next time soap at a lower temperature and skip the blanket." },
  { when:"In the mold", q:"White powdery film on top (soda ash)",
    why:"Surface lye reacting with air before the bar set. Harmless and cosmetic.",
    fix:"Spritz 91%+ alcohol right after pouring, or cover the mold; force gel. On a cured bar, steam it, or rinse/rub it off." },
  { when:"In the mold", q:"Translucent crackly streaks (glycerin rivers)",
    why:"Overheating, usually with titanium dioxide and/or a lot of water.",
    fix:"Soap cooler, use a water discount (higher lye concentration), and don't over-insulate.",
    see:"colors:titanium" },
  { when:"In the mold", q:"White chalky spots or pockets inside",
    why:"Could be unmelted hard oil — or unmixed lye, which is caustic. Take it seriously.",
    fix:"Zap-test a spot (a battery-like zing = active lye). If it zaps or feels lye-heavy, rebatch. Blend more thoroughly and fully melt hard oils next time.",
    see:"rebatch" },
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
    fix:"Use a vanilla stabilizer, or plan your colors around the browning.",
    see:"colors" },
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
export const EXAMPLES = [
  // ---- Dual lye (NaOH + KOH) ----
  // KOH makes a softer, more soluble, whippable soap; NaOH gives it body. The
  // blend is what shaving and cream soaps are built on — neither works with one lye.
  { name:"Soft Shaving Soap", cat:"Dual lye", lye:"dual", dualKoh:60, koh:90, sf:5, water:38,
    oils:{stearic:300,coconut:250,olive:200,shea:150,castor:100},
    additives:{bentonite:20,kaolin:20,glycerin:30}, aromas:{cedarwood:15,lavender:15},
    note:"The soft, brush-loaded kind rather than a hard puck — see “Shaving Bar” for that. Stearic-heavy and whips to a dense, slick lather. The 60% KOH share keeps it soft enough to load a brush; the clays add the slip a razor needs. Long cure — it improves for months." },
  { name:"Whipped Cream Soap", cat:"Dual lye", lye:"dual", dualKoh:85, koh:90, sf:8, water:38,
    oils:{stearic:250,olive:350,coconut:200,shea:100,castor:100},
    additives:{glycerin:50,sodiumlactate:20}, aromas:{ylang:10,geranium:10},
    note:"Mostly KOH, so it never sets hard — whip it after the cook and it stays a soft, frosting-like cream. High superfat and glycerin keep it rich. Age it a few weeks before whipping." },
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
