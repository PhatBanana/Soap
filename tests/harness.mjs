/* The shared context every suite runs against: one static server, one browser, one set
   of assertion counters, and the fixtures. Split out of the single 3147-line suite file
   so the suites could be read separately — but deliberately still one process. `npm test`
   staying one command against one browser is why the suite actually gets run, and the
   split was not allowed to cost that.

   createHarness() returns the object each suite receives as `t`. Nothing here talks to a
   suite; the runner wires them together. */
import { createRequire } from "module";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ---------- tiny static file server (serves the repo root) ---------- */
const MIME = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css",
  ".json":"application/json", ".webmanifest":"application/manifest+json",
  ".png":"image/png", ".svg":"image/svg+xml", ".ico":"image/x-icon" };
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; res.end("not found"); return; }
    res.setHeader("Content-Type", MIME[path.extname(file)] || "application/octet-stream");
    res.end(buf);
  });
});
const base = await new Promise((resolve) =>
  server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)));

/* ---------- launch Chromium (pre-installed here; default resolution in CI) ---------- */
const preinstalled = process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const launchOpts = fs.existsSync(preinstalled) ? { executablePath: preinstalled } : {};
const browser = await chromium.launch(launchOpts);

/* ---------- assertion harness ---------- */
const fails = [];
let pass = 0;
function ok(name, cond, detail) { if (cond) pass++; else fails.push(name + (detail ? ` — ${detail}` : "")); }
function eq(name, got, want) { ok(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
function near(name, got, want, tol = 0.5) { ok(name, Math.abs(got - want) <= tol, `got ${got}, want ${want}±${tol}`); }
function has(name, hay, needle) { ok(name, String(hay).includes(needle), `${JSON.stringify(String(hay).slice(0,80))} lacks ${JSON.stringify(needle)}`); }

/* ---------- fixtures & page helpers ---------- */
const OIL = (key, g) => ({ name: key, key, g });
function recipe(o = {}) {
  return Object.assign({ id:"r1", name:"Test", oils:[], additives:[], aromas:[],
    lyeType:"naoh", superfat:5, waterPct:38, waterMode:"oils", lyeConc:33, kohPurity:90,
    madeOn:"", cureWeeks:4, checklist:{}, use:"body" }, o);
}
function store(recOverrides = {}, view = {}) {
  return Object.assign({ unit:"g", tab:"base", scaleMode:"batch", currentId:"r1",
    recipes:[recipe(recOverrides)] }, view);
}
// Imported, not read off window: the app has no globals now, and asserting on the
// source is both faster and clearer. Assertions that the page really *loaded* the data
// are made against rendered output instead — a stronger check than window poking.
const { OILS, OIL_INCI } = await import("../src/data/oils.js");
const { ADDITIVES, COLORANTS, AROMAS } = await import("../src/data/ingredients.js");
const { EXAMPLES, TROUBLESHOOTING } = await import("../src/data/guides.js");
const { RECIPE_FIELDS } = await import("../src/core/schema.js");
// SHARE_SKIP is module-local to main.js, so the deny-list is read from source (the
// release-hygiene block does the same for the service-worker shell)
const appSrcForShare = fs.readdirSync(new URL("../src", import.meta.url), { withFileTypes:true })
  .flatMap((d) => d.isDirectory()
    ? fs.readdirSync(new URL("../src/" + d.name, import.meta.url)).map((n) => `../src/${d.name}/${n}`)
    : [`../src/${d.name}`])
  .filter((f) => f.endsWith(".js"))
  .map((f) => fs.readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");

const pageErrors = [];
// assertion counts quoted in the docs, collected by the release-hygiene block and
// checked at the end of the run, once the real total exists
const docClaims = [];
// the thirteen fatty acids the app scores; an oil listing anything else is scored as zero
const FA_KEYS_T = ["cy","cp","la","my","pa","st","ar","po","ri","ol","li","ln","ga"];
async function newPage() {
  const p = await browser.newPage();
  p.on("pageerror", (e) => pageErrors.push("PE: " + e.message));
  p.on("console", (m) => { if (m.type() === "error") pageErrors.push("CE: " + m.text()); });
  return p;
}
/* The first goto only exists to reach a same-origin document so localStorage is
   writable; once this page is already on the app it is a second full load for
   nothing. And reload() resolves at `load`, by which point the deferred module has
   run render() — the 200 ms that used to sit here was 62 s of the suite. */
async function open(p, storeObj) {
  if (!p.url().startsWith(base)) await p.goto(base + "/index.html");
  await p.evaluate((s) => localStorage.setItem("soapcalc.v4", JSON.stringify(s)), storeObj);
  await p.reload();
}
// open the ☰ sheet and fire one of its actions
const menu = (p, a) => p.evaluate((x) => { document.getElementById("menuBtn").click();
  document.querySelector('[data-a="' + x + '"]').click(); }, a);
// the Safety Check's findings, in order
const items = (p) => p.$$eval("#safetyList .safety-item .si-title", (es) => es.map((e) => e.textContent));
const LS = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("soapcalc.v4")));
const txt = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent : null; }, sel);
const num = async (p, sel) => parseFloat(await txt(p, sel));
// add one oil through the form (the simplest way to trigger the app's first save())
async function addOil(p, key, g) {
  await p.selectOption("#baseSelect", "oil:" + key);
  await p.fill("#amtIn", String(g));
  await p.click("#addForm button[type=submit]");
  await p.waitForTimeout(150);
}

export async function createHarness() {
  return { MIME, ADDITIVES, AROMAS, COLORANTS, EXAMPLES, FA_KEYS_T, LS, OIL, OILS, OIL_INCI, RECIPE_FIELDS, ROOT, TROUBLESHOOTING, addOil, appSrcForShare, base, browser, docClaims, eq, fs, has, http, items, menu, near, newPage, num, ok, open, pageErrors, path, recipe, store, txt };
}
export function results() { return { pass, fails, pageErrors, docClaims }; }
export async function shutdown() { await browser.close(); server.close(); }
