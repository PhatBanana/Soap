/* Soap Calc — behaviour test suite.
 *
 * Behaviour is tested through a headless browser — inject a saved state, reload, and
 * assert on the computed numbers / DOM / persisted localStorage — because that is what
 * users actually get. Reference data is imported directly instead: no reason to
 * round-trip a table through a page to count it.
 *
 * One command, one browser, one process. The suites in tests/suites/ are separate files
 * for reading, not separate runs — they share the server, the browser and the counters
 * that tests/harness.mjs owns, and they run in order against them.
 *
 *   npm test          (see package.json)
 *   node tests/run.mjs
 *
 * Exits non-zero if any assertion fails.
 */
import { createHarness, results, shutdown } from "./harness.mjs";
import chem from "./suites/chem.mjs";
import safety from "./suites/safety.mjs";
import recipe from "./suites/recipe.mjs";
import library from "./suites/library.mjs";
import io from "./suites/io.mjs";
import guides from "./suites/guides.mjs";
import qr from "./suites/qr.mjs";
import release from "./suites/release.mjs";

const t = await createHarness();
// order matters only for release, which reports the totals the docs are checked against
for (const suite of [chem, safety, recipe, library, io, guides, qr, release]) await suite(t);

/* ---------- report ---------- */
t.ok("No console/page errors during tests", t.pageErrors.length === 0, t.pageErrors.join(" | "));

await shutdown();

/* The docs' assertion counts, checked here because only now is the real figure known.
   A ceiling, not an equality — see the note where docClaims is collected. The total is
   snapshotted before the checks below, which will themselves be counted, so the ceiling
   is the number the run actually prints. */
const before = results();
const finalTotal = before.pass + before.fails.length + 1 + before.docClaims.length;
t.ok("The docs quote an assertion count", t.docClaims.length >= 1, String(t.docClaims.length));
t.docClaims.forEach(([file, said]) =>
  t.ok(`${file} does not overstate the suite`, said <= finalTotal,
       `says ${said}, suite runs ${finalTotal}`));

const { pass, fails } = results();
const total = pass + fails.length;
console.log(`\n${pass}/${total} assertions passed`);
if (fails.length) {
  console.log("\nFAILURES:");
  fails.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("✓ all green");
