/* The service worker and the version/cache coupling that keeps phones off stale copies.

   Part of the suite; run by tests/run.mjs, which owns the server, the browser and
   the assertion counts. Everything shared arrives in `t` — see tests/harness.mjs. */
export default async function releaseSuite(t) {
  const { ADDITIVES, AROMAS, COLORANTS, EXAMPLES, FA_KEYS_T, MIME, OIL, OILS, OIL_INCI, ROOT, base, browser, docClaims, eq, fs, has, http, newPage, ok, open, pageErrors, path, recipe, store, txt } = t;

/* =======================================================================
   SERVICE WORKER: the app opens from disk, and still updates

   Network-first re-fetched all 325 KB of shell on every online launch. On a slow
   connection that was the whole launch: 703 ms to load, 360 ms to first paint,
   against 104 ms / 76 ms once the cache answers first. Source shape is asserted in
   RELEASE HYGIENE; this block runs a real worker and checks the three behaviours
   that actually matter — it's fast, it works offline, and a deploy still lands.
======================================================================= */
{
  const DELAY = 120;                       // per request, standing in for kitchen wifi
  let hits = 0;
  const slow = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split("?")[0]);
    if (rel === "/") rel = "/index.html";
    const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
    fs.readFile(file, (err, buf) => {
      if (err) { res.statusCode = 404; res.end("not found"); return; }
      hits++;
      res.setHeader("Content-Type", MIME[path.extname(file)] || "application/octet-stream");
      res.setHeader("Cache-Control", "no-cache");
      setTimeout(() => res.end(buf), DELAY);
    });
  });
  const slowBase = await new Promise((r) =>
    slow.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${slow.address().port}`)));

  const ctx = await browser.newContext();
  const p1 = await ctx.newPage();
  p1.on("pageerror", (e) => pageErrors.push("PE(sw): " + e.message));
  await p1.goto(slowBase + "/index.html", { waitUntil: "load" });
  await p1.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 20000 });
  await p1.close();

  // second launch: the shell comes off disk, so the network delay is off the critical path
  const p2 = await ctx.newPage();
  p2.on("pageerror", (e) => pageErrors.push("PE(sw): " + e.message));
  hits = 0;
  const t0 = Date.now();
  await p2.goto(slowBase + "/index.html", { waitUntil: "load" });
  const load = Date.now() - t0;
  ok("Second launch loads without waiting on the network", load < DELAY * 3, `${load} ms of a ${DELAY} ms/request server`);
  ok("The app really rendered", await p2.evaluate(() => !!document.getElementById("lyeVal")));
  ok("Ingredient data really loaded", await p2.evaluate(() => document.getElementById("baseSelect").options.length > 50));

  // offline: the point of precaching in the first place
  await ctx.setOffline(true);
  await p2.reload({ waitUntil: "load" }).catch(() => {});
  await p2.waitForTimeout(400);
  ok("Reloads offline", await p2.evaluate(() => !!document.getElementById("lyeVal")));
  ok("…with its data", await p2.evaluate(() => document.getElementById("baseSelect").options.length > 50));
  await ctx.setOffline(false);
  await p2.close();

  /* A cache-first shell only stays fresh because the worker itself is replaced, so this
     is the half that must not rot: bump the version the way a release does and the open
     app has to end up on it by itself. */
  const schemaPath = path.join(ROOT, "src/core/schema.js"), swPath = path.join(ROOT, "sw.js");
  const schemaBak = fs.readFileSync(schemaPath, "utf8"), swBak = fs.readFileSync(swPath, "utf8");
  const curV = (swBak.match(/soapcalc-(v\d+)/) || [])[1];
  try {
    fs.writeFileSync(schemaPath, schemaBak.replace(/APP_VERSION = "v\d+"/, 'APP_VERSION = "v999"'));
    fs.writeFileSync(swPath, swBak.replace("soapcalc-" + curV, "soapcalc-v999"));
    const p3 = await ctx.newPage();
    let landed = true;
    await p3.goto(slowBase + "/index.html", { waitUntil: "load" });
    await p3.waitForFunction(() => /v999/.test(document.getElementById("buildStamp").textContent),
      { timeout: 25000 }).catch(() => { landed = false; });
    ok("A new version takes over on its own", landed,
       landed ? "" : await p3.evaluate(() => document.getElementById("buildStamp").textContent));
    await p3.close();
  } finally {
    fs.writeFileSync(schemaPath, schemaBak); fs.writeFileSync(swPath, swBak);
  }
  await ctx.close();
  await new Promise((r) => slow.close(r));
}

/* =======================================================================
   RELEASE HYGIENE (the version/cache coupling that keeps phones off stale copies)
======================================================================= */
{
  /* Every shipped source file, not just main.js. These checks look for code by what it
     says, so pinning them to one filename means they quietly stop checking anything the
     moment that code moves to another module — which is exactly what happened when
     ADD_CAP moved to ui/render.js. */
  const srcFiles = [];
  (function walkSrc(dir) {
    fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach((d) => {
      if (d.isDirectory()) walkSrc(`${dir}/${d.name}`);
      else if (d.name.endsWith(".js")) srcFiles.push(`${dir}/${d.name}`);
    });
  })("src");
  const appSrc = srcFiles.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  ok("Release checks read every src file", srcFiles.length >= 8, String(srcFiles.length));

  /* The suite is seven files so it can be read, not so it can be run seven ways. One
     command, one browser, one process is the reason it gets run at all, and a second
     browser launch or a suite that nothing imports would take that away quietly. */
  const testFiles = fs.readdirSync(path.join(ROOT, "tests/suites")).filter((f) => f.endsWith(".mjs"));
  const runner = fs.readFileSync(path.join(ROOT, "tests/run.mjs"), "utf8");
  ok("There are suites to run", testFiles.length >= 5, String(testFiles.length));
  testFiles.forEach((f) => {
    const name = f.replace(/\.mjs$/, "");
    ok(`run.mjs imports suites/${f}`, runner.includes(`./suites/${f}`), "not imported");
    // imported but never called is the same silence, so check it reaches the run list
    ok(`run.mjs actually runs ${name}`,
       new RegExp(`\\[[^\\]]*\\b${name}\\b[^\\]]*\\]`).test(runner), "imported but never invoked");
  });
  const launches = ["tests/harness.mjs", "tests/run.mjs", ...testFiles.map((f) => `tests/suites/${f}`)]
    .map((f) => (fs.readFileSync(path.join(ROOT, f), "utf8").match(/chromium\.launch/g) || []).length)
    .reduce((a, b) => a + b, 0);
  eq("Exactly one browser is launched for the whole suite", launches, 1);
  ok("npm test runs the one runner",
     JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts.test === "node tests/run.mjs");

  /* Modules only help if the imports are right, and a missing one is invisible until the
     line runs: the app loads, the page looks fine, and the feature you didn't click is
     dead. That is how cloneItem, INS_RANGE and $ each shipped broken during the split,
     and how a missing clamp shipped in v54. So: every name one module exports, referenced
     by another that doesn't import it. Only known export names are considered, so prose
     in a comment can never produce a false positive. */
  const strip = (c) => c
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/[^\n]*$/gm, "")
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""')
    .replace(/(?<=[=(,:[!&|?{;\s])\/(?:[^/\\\n[]|\\.|\[(?:[^\]\\]|\\.)*\])+\/[gimsuy]*/g, "RE");
  const srcText = {};
  srcFiles.forEach((f) => { srcText[f] = fs.readFileSync(path.join(ROOT, f), "utf8"); });
  const exportedBy = {};
  srcFiles.forEach((f) => {
    const c = strip(srcText[f]);
    // one statement can declare several: `export const A=1, B=2, C=3;`
    // [^;\n] would stop at the first newline, and this codebase declares three lye rows
    // in one statement across three lines — LYE_KOH and WATER_ROW went unchecked that way
    for (const m of c.matchAll(/^export (?:function|var|const|let)\s+([\s\S]*?)(?:;|\n(?=\S))/gm)) {
      let depth = 0, cur = "";
      const parts = [];
      for (const ch of m[1]) {
        if ("([{".includes(ch)) depth++;
        else if (")]}".includes(ch)) depth--;
        if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
      }
      parts.push(cur);
      parts.forEach((part) => {
        const n = part.trim().split("=")[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(n)) exportedBy[n] = f;
      });
    }
  });
  ok("Modules export something to check", Object.keys(exportedBy).length >= 40, String(Object.keys(exportedBy).length));
  const missing = [];
  srcFiles.forEach((f) => {
    const c = strip(srcText[f]);
    const imported = new Set();
    for (const m of c.matchAll(/import\s*\{([^}]*)\}\s*from/g))
      m[1].split(",").forEach((n) => { n = n.trim().split(" as ").pop().trim(); if (n) imported.add(n); });
    for (const m of c.matchAll(/import\s*\*\s*as\s*([A-Za-z_$][\w$]*)/g)) imported.add(m[1]);
    const local = new Set();
    for (const m of c.matchAll(/\b(?:function|var|let|const)\s+([A-Za-z_$][\w$]*)/g)) local.add(m[1]);
    for (const m of c.matchAll(/\b(?:var|let|const)\s+([^;=\n]+?)=/g))
      m[1].split(",").forEach((n) => { n = n.trim(); if (/^[A-Za-z_$][\w$]*$/.test(n)) local.add(n); });
    Object.entries(exportedBy).forEach(([n, from]) => {
      if (from === f || imported.has(n) || local.has(n)) return;
      if (new RegExp(`(?<![\\w$.])${n.replace(/\$/g, "\\$")}(?![\\w$])`).test(c)) missing.push(`${f} uses ${n} (from ${from})`);
    });
  });
  ok("No module uses another's export without importing it", missing.length === 0, missing.join(" · "));

  /* The four wrappers in core/state.js share their names with the raw functions in
     core/chem.js. The wrappers default to the recipe you have open; the raw ones require
     an explicit recipe and return nonsense without one. Importing the wrong pair is a
     silent wrong number, and it happened once during the split. */
  const RAW = ["computeLye", "blendFA", "currentBatchG", "curedBatchG"];
  const wrongChem = srcFiles.filter((f) => f !== "src/core/state.js").filter((f) => {
    // raw source, not stripped: strip() blanks double-quoted strings, and that includes
    // the module path this has to match on
    const m = srcText[f].match(/import\s*\{([^}]*)\}\s*from\s*"[^"]*chem\.js"/);
    return m && RAW.some((n) => m[1].split(",").map((x) => x.trim()).includes(n));
  });
  ok("Only core/state.js imports the raw chem functions", wrongChem.length === 0, wrongChem.join(", "));

  /* An orphaned array element left at top level joins the next declaration through the
     comma operator, and it silently stops being a function. It parses, it loads, and the
     button just does nothing — which is exactly what happened to logBatch. */
  const strays = [];
  srcFiles.forEach((f) => {
    const lines = srcText[f]
      .replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat((m.match(/\n/g) || []).length))
      .replace(/^\s*\/\/[^\n]*$/gm, "").split("\n");
    lines.forEach((l, i) => {
      if (!/^\s{0,3}["']/.test(l)) return;
      let prev = "";
      for (let k = i - 1; k >= 0; k--) { const t = lines[k].trim(); if (t) { prev = t; break; } }
      if (prev && !/[[,(]$/.test(prev)) strays.push(`${f}:${i + 1}`);
    });
  });
  ok("No orphaned literals at the top level of a module", strays.length === 0, strays.join(", "));
  // the version and build date live with the rest of the persisted-shape constants
  const schemaSrc = fs.readFileSync(path.join(ROOT, "src/core/schema.js"), "utf8");
  const swSrc  = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const appV   = (schemaSrc.match(/APP_VERSION\s*=\s*"(v\d+)"/) || [])[1];
  const swV    = (swSrc.match(/CACHE\s*=\s*"soapcalc-(v\d+)"/) || [])[1];
  const built  = (schemaSrc.match(/BUILD_DATE\s*=\s*"([\d-]+)"/) || [])[1];

  ok("schema.js declares APP_VERSION", !!appV, appV);
  ok("sw.js declares a cache name", !!swV, swV);
  eq("Service-worker cache is bumped with the app version", swV, appV);
  ok("BUILD_DATE is an ISO date", /^\d{4}-\d{2}-\d{2}$/.test(built || ""), built);
  ok("BUILD_DATE is a real date", !isNaN(new Date(built + "T00:00:00").getTime()));

  // every precached file must actually exist, or the first offline load silently loses it
  const shell = (swSrc.match(/var SHELL\s*=\s*\[([\s\S]*?)\]/) || [])[1] || "";
  const files = shell.match(/"\.\/[^"]+"/g).map((s) => s.slice(3, -1));
  ok("Service worker precaches a shell", files.length >= 5, String(files.length));
  /* The cache has to answer first. Network-first re-downloaded all 325 KB of shell on
     every online launch, which on a throttled connection was 703 ms to load and 360 ms
     to first paint against 104 ms / 76 ms serving from disk. Updates come from the
     worker being replaced, not from re-fetching the shell on the critical path. */
  const fetchBody = (swSrc.match(/addEventListener\("fetch"[\s\S]*$/) || [""])[0];
  // what respondWith is actually handed — "mentions caches.match somewhere" is not
  // enough, network-first names it too, as the fallback
  const responded = fetchBody.slice(fetchBody.indexOf("e.respondWith("));
  ok("Fetch handler answers from the cache, not the network",
     /^e\.respondWith\(\s*caches\.match\(req\)/.test(responded), responded.slice(0, 60));
  ok("…and revalidates in the background", /waitUntil\(fresh\)/.test(fetchBody));
  ok("…with the HTTP cache bypassed, so revalidation reaches the real server",
     /cache:\s*"no-store"/.test(fetchBody));
  // the update path is what keeps a cache-first shell fresh, so it is pinned too
  ok("sw.js is registered with updateViaCache:none", /updateViaCache:"none"/.test(appSrc), "main.js");
  ok("A new worker skips waiting and claims the page", /skipWaiting\(\)/.test(swSrc) && /clients\.claim\(\)/.test(swSrc));
  ok("A claimed page reloads once onto the fresh files", /controllerchange/.test(appSrc) && /location\.reload\(\)/.test(appSrc));
  files.forEach((f) => ok(`Precached file exists: ${f}`, fs.existsSync(path.join(ROOT, f))));

  // The app's own source files must all be in the shell, or an update half-applies offline.
  // Derived from what's on disk rather than a list naming them: this used to be five
  // hand-typed filenames, so anything added later simply wasn't checked — the same
  // hand-kept-list failure as curRV(), the examples categories and recipeShareURL().
  const sourceFiles = [];
  (function walk(dir, prefix) {
    fs.readdirSync(path.join(ROOT, dir || "."), { withFileTypes: true }).forEach((d) => {
      if (d.name.startsWith(".") || d.name === "node_modules" || d.name === "tests"
          || d.name === "screenshots" || d.name === "icons") return;
      const rel = prefix ? `${prefix}/${d.name}` : d.name;
      if (d.isDirectory()) walk(rel, rel);
      // "_" prefix marks a scratch file (tests/_shots.mjs and friends), never shipped
      else if (/\.(js|mjs|css)$/.test(d.name) && d.name !== "sw.js" && !d.name.startsWith("_"))
        sourceFiles.push(rel);
    });
  })("", "");
  ["index.html", "manifest.webmanifest"].forEach((f) => sourceFiles.push(f));
  ok("Found the app's source files to check", sourceFiles.length >= 5, sourceFiles.join(","));
  sourceFiles.forEach((f) => ok(`Shell covers ${f}`, files.includes(f), `SHELL has ${files.join(",")}`));

  // CI runs in a pinned Playwright image, so its tag and the lockfile's playwright
  // version have to move together — mismatch means "Executable doesn't exist" in CI
  // and nowhere else. Same class of hand-kept pairing as APP_VERSION / sw.js.
  const wf   = fs.readFileSync(path.join(ROOT, ".github/workflows/tests.yml"), "utf8");
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8"));
  const imgV = (wf.match(/image:\s*mcr\.microsoft\.com\/playwright:v([\d.]+)-/) || [])[1];
  const lockV = ((lock.packages || {})["node_modules/playwright"] || {}).version;
  ok("CI pins a Playwright image", !!imgV, String(imgV));
  ok("Lockfile pins playwright", !!lockV, String(lockV));
  eq("CI image matches the lockfile's playwright (tests.yml vs package-lock.json)", imgV, lockV);
  ok("CI does not download a browser per run", !/playwright install/.test(wf));

  // The docs quote how much is in the app. Those numbers are hand-typed and had already
  // drifted — the roadmap claimed v46 and "30 additives" against a v49 app with 33 —
  // so they get the same treatment as APP_VERSION / sw.js.
  const roadmap = fs.readFileSync(path.join(ROOT, "ROADMAP.md"), "utf8");
  const readme  = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");

  const p = await newPage();
  await open(p, store({ oils:[OIL("olive",500)] }));

  // counted off the loaded page rather than by parsing data.js — the browser has already
  // done that parsing, and correctly
  const counts = {
    oils:      Object.keys(OILS).length,
    additives: Object.keys(ADDITIVES).length,
    aromas:    Object.keys(AROMAS).length,
    colorants: COLORANTS.length,
    examples:  EXAMPLES.length
  };

  // every "N oils" / "N additives" / … claim in either document, whatever the wording.
  // Quoted and code-spanned text is dropped first: the roadmap cites the wrong numbers it
  // used to carry ("30 additives", "~40 oils") as part of explaining why this check
  // exists, and a citation is not a claim.
  const claimable = (s) => s.replace(/"[^"]*"/g, " ").replace(/`[^`]*`/g, " ")
                            .replace(/[“][^”]*[”]/g, " ");
  const claims = [["oils", /(\d+) oils/g], ["additives", /(\d+) additives/g],
                  ["aromas", /(\d+) aromas/g], ["colorants", /(\d+) colorants/g],
                  ["examples", /(\d+) example recipes/g]];
  let claimsSeen = 0;
  [["ROADMAP.md", claimable(roadmap)], ["README.md", claimable(readme)]].forEach(([file, src]) => {
    claims.forEach(([what, re]) => {
      [...src.matchAll(re)].forEach((m) => {
        claimsSeen++;
        eq(`${file} states the real ${what} count`, Number(m[1]), counts[what]);
      });
    });
  });
  // a guard on the guard: if the wording changes so no claim matches, the loop above
  // passes by doing nothing at all
  ok("The docs do make countable claims", claimsSeen >= 5, String(claimsSeen));

  // --- reference-data integrity --------------------------------------------
  // 65 oils and 33 scents of hand-entered reference values sit behind the lye maths.
  // Nothing here can tell you a SAP figure is *right* — only the supplier can — but it
  // can catch the slips that bulk data entry actually makes: a decimal point in the wrong
  // place, a profile that doesn't add up, a scent whose "max" is below its "typical".
  const oilData = OILS, aromaData = AROMAS;

  // Beeswax is the documented exception: it's mostly unsaponifiable wax ester, which is
  // why its SAP is half an ordinary oil's. Anything else summing low means missing acids.
  const FA_EXEMPT = { beeswax: "mostly unsaponifiable wax esters, not triglycerides" };
  Object.entries(oilData).forEach(([k, o]) => {
    const sum = Object.values(o.fa).reduce((a, b) => a + b, 0);
    if (!FA_EXEMPT[k]) ok(`${k}: fatty acids account for the oil (${sum}%)`, sum >= 94 && sum <= 101, String(sum));
    // every SAP here is between jojoba's 0.069 and fractionated coconut's 0.232
    ok(`${k}: SAP is in the physically plausible band`, o.sap > 0.05 && o.sap < 0.30, String(o.sap));
    ok(`${k}: iodine value is plausible`, o.iod >= 0 && o.iod <= 200, String(o.iod));
    ok(`${k}: INS value is plausible`, o.ins >= 0 && o.ins <= 400, String(o.ins));
    ok(`${k}: has a description worth reading`, (o.desc || "").length >= 40);
    Object.keys(o.fa).forEach((f) =>
      ok(`${k}: fatty acid "${f}" is one the app scores`, FA_KEYS_T.includes(f)));
  });
  ok("Beeswax is still the only oil exempt from the profile check",
    Object.keys(FA_EXEMPT).every((k) => k in oilData));

  Object.entries(aromaData).forEach(([k, a]) => {
    const [lo, typ, hi] = a.rate || [];
    ok(`${k}: usage rate is ordered low <= typical <= max`, lo <= typ && typ <= hi, JSON.stringify(a.rate));
    ok(`${k}: usage rate is plausible for soap`, lo > 0 && hi <= 10, JSON.stringify(a.rate));
    ok(`${k}: has a note position`, ["top", "middle", "base"].includes(a.note), String(a.note));
    ok(`${k}: is declared EO or FO`, ["EO", "FO"].includes(a.type), String(a.type));
  });

  // an oil with no INCI name prints "(verify INCI)" on the label — fine as a fallback,
  // not fine as the normal case for a third of the list
  const noInci = Object.keys(OILS).filter((k) => !(k in OIL_INCI));
  eq("Every oil has an INCI name for the label", noInci.join(","), "");

  // --- data integrity behind the audit fixes -------------------------------
  // Subtracting an additive from the water changes the chemistry, so the set that does it
  // is pinned: adding a fifth should be a deliberate edit here, not a silent one.
  const replacers = Object.keys(ADDITIVES)
    .filter((k) => ADDITIVES[k].replacesWater).sort();
  eq("Only genuine water replacers subtract from the water",
    replacers.join(","), "aloe,beer,coconutmilk,coffee,goatmilk,wine");
  ok("…and every one of them is a liquid",
    Object.keys(ADDITIVES).filter((k) => ADDITIVES[k].replacesWater)
      .every((k) => ADDITIVES[k].kind === "liquid"));

  // A mistyped ADD_CAP key is invisible: the additive just falls through to the default.
  const capKeys = ((appSrc.match(/var ADD_CAP=\{([^}]*)\}/) || [])[1] || "")
    .split(",").map((s) => s.split(":")[0].trim()).filter(Boolean);
  ok("ADD_CAP has entries", capKeys.length >= 10, String(capKeys.length));
  const knownAdds = Object.keys(ADDITIVES);
  capKeys.forEach((k) => ok(`ADD_CAP key "${k}" is a real additive`, knownAdds.includes(k)));

  // the wording fix has to stay fixed — "skin-safe max" claims an authority this data lacks
  ok("No 'skin-safe max' claim survives in the app", !/skin-safe max/.test(
    appSrc.replace(/\/\/[^\n]*/g, "")), "found outside a comment");

  // the roadmap's "Today:" line names a version — it must be this one
  const roadmapV = (roadmap.match(/\*\*Today:\*\*\s*(v\d+)/) || [])[1];
  ok("ROADMAP states a version", !!roadmapV, String(roadmapV));
  eq("ROADMAP's version matches the app", roadmapV, appV);

  // The assertion totals quoted in the docs are pinned as a ceiling, not an equality:
  // overstating what the suite covers is a lie, but forcing every test-adding PR to edit
  // two markdown files would be friction with no safety payoff. Checked at the end of the
  // run, where the real total is known.
  // pushed, not reassigned: the runner owns the array and checks it at the end
  docClaims.push(...[["ROADMAP.md", roadmap], ["README.md", readme]]
    .flatMap(([file, src]) => [...src.matchAll(/(\d+) (?:test )?assertions/g)]
      .map((m) => [file, Number(m[1])])));

  // and the footer must show the version, since that's how a stale copy gets spotted
  const stamp = await txt(p, "#buildStamp");
  has("Footer shows the app version", stamp, appV);
  has("Footer shows the build date", stamp, built);
  await p.close();
}

}
