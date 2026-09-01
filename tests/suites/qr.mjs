/* The QR encoder, and the bar wrapper that prints one.

   This is the only part of the app that has to satisfy a standard rather than a
   soap-maker, and it fails silently: a symbol with a transposed format field or a
   misplaced alignment pattern still looks exactly like a QR code and simply never
   scans. Three of the bugs found while writing it were that shape. So the assertions
   below check the symbol's structure directly rather than trusting that it "looks
   right", and pin twelve finished symbols to their fingerprints — each of which was
   rendered, photographed and read back by an independent decoder before being written
   down here. If the encoder drifts, a fingerprint moves and this suite says so.

   Part of the suite; run by tests/run.mjs, which owns the server, the browser and
   the assertion counts. Everything shared arrives in `t` — see tests/harness.mjs. */
import crypto from "crypto";
import { encodeQR, qrSVG, buildCodewords, penalty } from "../../src/core/qr.js";

// centre coordinates of the alignment patterns, kept here independently of the
// encoder's own table so a typo in one is not blessed by the other
const ALIGN_CENTRES = {
  1: [], 2: [6,18], 5: [6,30], 7: [6,22,38], 10: [6,28,50], 14: [6,26,46,66],
  25: [6,32,58,84,110], 40: [6,30,58,86,114,142,170]
};
const FINDER = [
  [1,1,1,1,1,1,1],[1,0,0,0,0,0,1],[1,0,1,1,1,0,1],[1,0,1,1,1,0,1],
  [1,0,1,1,1,0,1],[1,0,0,0,0,0,1],[1,1,1,1,1,1,1]
];
const EC_BITS = { L:1, M:0, Q:3, H:2 };
const fingerprint = (qr) =>
  crypto.createHash("sha256").update(qr.modules.map((r) => r.join("")).join("")).digest("hex").slice(0, 16);

export default async function qrSuite(t) {
  const { OIL, base, eq, has, menu, newPage, ok, open, store } = t;

/* =======================================================================
   SYMBOL STRUCTURE
   Everything the spec fixes in place, regardless of payload or mask.
======================================================================= */
{
  const SWEEP = [
    ["L", "hi"],                                                  // v1, no alignment, no version block
    ["M", "https://www.2dumb2care.com/"],
    ["H", "x".repeat(60)],
    ["L", "y".repeat(300)],                                       // past v7: version information appears
    ["Q", "z".repeat(600)]
  ];
  for (const [ec, text] of SWEEP) {
    const qr = encodeQR(text, ec), m = qr.modules, size = qr.size, tag = `${ec}/v${qr.version}`;
    eq(`${tag}: size is 4×version+17`, size, qr.version * 4 + 17);
    eq(`${tag}: the matrix is square`, m.length === size && m.every((r) => r.length === size), true);
    eq(`${tag}: every module is 0 or 1`, m.every((r) => r.every((v) => v === 0 || v === 1)), true);
    eq(`${tag}: the requested error correction is what was built`, qr.ec, ec);

    // --- the three finders, and the light separators that must surround them ---
    for (const [name, r0, c0] of [["top-left",0,0], ["top-right",0,size-7], ["bottom-left",size-7,0]]) {
      let good = true;
      for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if (m[r0+r][c0+c] !== FINDER[r][c]) good = false;
      eq(`${tag}: the ${name} finder is the spec's pattern`, good, true);
    }
    let sep = true;
    for (let i = 0; i <= 7; i++) {
      if (m[7][i] || m[i][7]) sep = false;                                 // top-left
      if (m[7][size-1-i] || m[i][size-8]) sep = false;                     // top-right
      if (m[size-8][i] || m[size-1-i][7]) sep = false;                     // bottom-left
    }
    eq(`${tag}: the finders are fenced off by light separators`, sep, true);

    // --- timing patterns: alternating, starting dark, on row 6 and column 6 ---
    let timing = true;
    for (let i = 8; i < size - 8; i++) {
      if (m[6][i] !== (i % 2 === 0 ? 1 : 0)) timing = false;
      if (m[i][6] !== (i % 2 === 0 ? 1 : 0)) timing = false;
    }
    eq(`${tag}: both timing patterns alternate`, timing, true);
    eq(`${tag}: the always-dark module is dark`, m[size-8][8], 1);

    // --- alignment patterns at every centre pairing except the three on finders ---
    const centres = ALIGN_CENTRES[qr.version];
    if (centres) {
      const last = centres.length - 1;
      let align = true, count = 0;
      for (let a = 0; a <= last; a++) for (let b = 0; b <= last; b++) {
        if ((a===0&&b===0) || (a===0&&b===last) || (a===last&&b===0)) continue;
        count++;
        const r = centres[a], c = centres[b];
        if (m[r][c] !== 1) align = false;                                   // dark centre
        for (let d = -1; d <= 1; d++) if (m[r+d][c-1] || m[r+d][c+1] || m[r-1][c+d] || m[r+1][c+d]) align = false;
        for (let d = -2; d <= 2; d++) if (!m[r-2][c+d] || !m[r+2][c+d] || !m[r+d][c-2] || !m[r+d][c+2]) align = false;
      }
      eq(`${tag}: all ${count} alignment patterns are correctly formed`, align, true);
    }

    // --- format information: fifteen bits, written twice, and both copies must agree ---
    let copyA = 0, copyB = 0;
    for (let i = 0; i <= 5; i++) copyA |= m[i][8] << i;
    copyA |= m[7][8] << 6; copyA |= m[8][8] << 7; copyA |= m[8][7] << 8;
    for (let j = 9; j <= 14; j++) copyA |= m[8][14-j] << j;
    for (let k = 0; k <= 7; k++) copyB |= m[8][size-1-k] << k;
    for (let n = 8; n <= 14; n++) copyB |= m[size-15+n][8] << n;
    eq(`${tag}: the two format copies are identical`, copyA, copyB);
    const raw = copyA ^ 0x5412;                                            // the spec's format mask
    eq(`${tag}: the format field names the error correction level`, (raw >> 13) & 3, EC_BITS[ec]);
    eq(`${tag}: the format field names the mask actually applied`, (raw >> 10) & 7, qr.mask);
    // the format field carries its own BCH(15,5) check; a bad bit shows up here
    let rem = raw >> 10;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
    eq(`${tag}: the format field's error-correction bits check out`, ((raw >> 10) << 10 | rem), raw);

    // --- version information: two copies, only from version 7 up ---
    if (qr.version >= 7) {
      let vA = 0, vB = 0;
      for (let i = 0; i < 18; i++) {
        const a = Math.floor(i / 3), b = i % 3;
        vA |= m[size-11+b][a] << i; vB |= m[a][size-11+b] << i;
      }
      eq(`${tag}: the two version copies are identical`, vA, vB);
      eq(`${tag}: the version field names the version`, vA >> 12, qr.version);
      let vrem = qr.version;
      for (let i = 0; i < 12; i++) vrem = (vrem << 1) ^ ((vrem >> 11) * 0x1F25);
      eq(`${tag}: the version field's error-correction bits check out`, vA, (qr.version << 12) | vrem);
    }
  }
}

/* =======================================================================
   FINISHED SYMBOLS, PINNED
   Each fingerprint below came from a symbol that was rendered at print size and
   read back by an independent decoder. They are the record that this encoder once
   produced scannable output, so a change that quietly breaks it cannot pass.
======================================================================= */
{
  const TEXTS = {
    short: "https://www.2dumb2care.com/",
    mid:   "https://www.2dumb2care.com/index.html#r=" + "A".repeat(200),
    long:  "https://www.2dumb2care.com/index.html#r=" + "Zm9vYmFy".repeat(60)
  };
  const GOLD = [
    ["short","L", 2,7,"5f68eaa5a5bfbc4d"], ["short","M", 3,2,"f89f1c490eb9d396"],
    ["short","Q", 3,6,"8ddc583924e83929"], ["short","H", 4,6,"472ca3564625c5a4"],
    ["mid",  "L",10,3,"48d7f271d01d99bd"], ["mid",  "M",11,1,"45820c4f95445dfe"],
    ["mid",  "Q",13,3,"da6b0f0699a344c2"], ["mid",  "H",16,1,"bfc58e66875b73ac"],
    ["long", "L",15,2,"9ceddc2dfb9ccc9c"], ["long", "M",18,3,"4d7172f1758ca3e6"],
    ["long", "Q",22,2,"19a5d94644629ce4"], ["long", "H",25,1,"318d0875b60c4cff"]
  ];
  for (const [label, ec, ver, mask, sha] of GOLD) {
    const qr = encodeQR(TEXTS[label], ec);
    eq(`${label}/${ec} still lands on version ${ver}`, qr.version, ver);
    eq(`${label}/${ec} still picks mask ${mask}`, qr.mask, mask);
    eq(`${label}/${ec} is the symbol that was decoded`, fingerprint(qr), sha);
  }
}

/* =======================================================================
   CAPACITY
======================================================================= */
{
  // v1/L byte mode holds 17 bytes; the eighteenth must push the symbol up a version
  eq("17 bytes fit in the smallest symbol", encodeQR("x".repeat(17), "L").version, 1);
  ok("18 bytes need a bigger one", encodeQR("x".repeat(18), "L").version > 1, "");
  // the largest byte-mode payload is 2953 bytes at v40/L
  eq("the largest payload the format allows still encodes", encodeQR("x".repeat(2953), "L").version, 40);
  eq("one byte more than the format allows is refused", encodeQR("x".repeat(2954), "L"), null);
  eq("a payload past the chosen level's capacity is refused", encodeQR("x".repeat(1300), "H"), null);

  // multi-byte characters are counted as bytes, not characters — a UTF-8 count bug
  // would show up as a symbol that encodes and then decodes to mush
  const emoji = "🧼".repeat(10);                                        // 4 bytes each
  eq("a 40-byte emoji payload is sized as 40 bytes", encodeQR(emoji, "L").version,
     encodeQR("x".repeat(40), "L").version);

  // no error-correction level is asked for: prefer M, fall back to L when M won't hold it
  eq("with no level named, a short payload takes M", encodeQR("hello").ec, "M");
  eq("with no level named, an oversized payload falls back to L", encodeQR("x".repeat(2400)).ec, "L");
}

/* =======================================================================
   CODEWORDS
   The block structure is where a symbol goes wrong in a way no amount of looking
   at it reveals, so it is checked against the spec's own totals.
======================================================================= */
{
  const bytes = (s) => Array.from(new TextEncoder().encode(s));
  // total codewords per version = data + error correction, from the spec's tables
  const TOTALS = [[1,"L",26],[1,"H",26],[5,"Q",134],[10,"M",346],[25,"H",1588],[40,"L",3706]];
  for (const [ver, ec, total] of TOTALS)
    eq(`v${ver}/${ec} produces the spec's ${total} codewords`, buildCodewords(bytes("test"), ver, ec).length, total);

  // the two prescribed pad bytes, alternating, fill a symbol that isn't full
  const cw = buildCodewords(bytes("A"), 1, "L");
  eq("a short payload is padded with 0xEC first", cw[3], 0xEC);
  eq("...then 0x11", cw[4], 0x11);
  eq("...then 0xEC again", cw[5], 0xEC);
  // mode indicator (4 bits) then the character count (8 bits at v1) then the byte
  eq("the stream opens with the byte-mode indicator and length", cw[0], 0x40 | 0x00);
  eq("the length byte follows", cw[1], (1 << 4) | ("A".charCodeAt(0) >> 4));
}

/* =======================================================================
   MASK SCORING
   Small hand-built matrices, one rule at a time.
======================================================================= */
{
  const blank = (n, fill = 0) => Array.from({ length: n }, () => new Array(n).fill(fill));
  // rule 4 alone: an all-light symbol is 0% dark, 50 away from even, ten bands of five
  const light = blank(9);
  const rule4Only = 10 * 10;
  // rule 1 fires on every row and column (9 runs of 9 → 3+4 each, twice), rule 2 on
  // every 2×2 window — so the empty matrix is a known, hand-checkable total
  const r1 = 2 * 9 * (3 + 4), r2 = 3 * 8 * 8;
  eq("an empty matrix scores exactly the three rules that apply to it", penalty(light), r1 + r2 + rule4Only);

  /* rule 3: the finder-lookalike. Both rows below carry five dark modules, so rules 1,
     2 and 4 see the same matrix — only the 1:1:3:1:1 ratio followed by four light
     modules separates them, and it is worth 40. */
  const hit = blank(11), miss = blank(11);
  [1,0,1,1,1,0,1,0,0,0,0].forEach((v, i) => { hit[5][i] = v; });      // the pattern
  [1,0,1,1,1,0,0,1,0,0,0].forEach((v, i) => { miss[5][i] = v; });     // same darkness, ratio broken
  eq("a finder-lookalike in the data costs 40", penalty(hit) - penalty(miss), 40);

  // rule 2 on its own: one 2×2 dark block added to a light field costs 3, plus whatever
  // rule 4 moves — so compare two matrices with the same dark count instead
  const a = blank(12), b = blank(12);
  a[3][3] = a[3][4] = a[4][3] = a[4][4] = 1;                          // a square: rule 2 applies
  b[3][3] = b[3][5] = b[5][3] = b[5][5] = 1;                          // scattered: it does not
  ok("a 2×2 block is penalised where the same modules scattered are not", penalty(a) > penalty(b), `${penalty(a)} vs ${penalty(b)}`);

  // the chosen mask is always one the format field can name
  for (const text of ["short", "x".repeat(400)])
    ok(`the mask chosen for a ${text.length}-byte payload is one of the eight`,
       encodeQR(text, "M").mask >= 0 && encodeQR(text, "M").mask <= 7, "");
}

/* =======================================================================
   THE SVG
======================================================================= */
{
  const qr = encodeQR("https://www.2dumb2care.com/", "L"), svg = qrSVG(qr, 160);
  has("the SVG carries a viewBox sized for the quiet zone", svg, `viewBox="0 0 ${qr.size + 8} ${qr.size + 8}"`);
  has("the SVG is drawn at the size asked for", svg, 'width="160" height="160"');
  has("the modules are square-edged, not smoothed", svg, 'shape-rendering="crispEdges"');
  has("the code sits on its own white ground, not the page's", svg, 'fill="#fff"');
  has("the code is labelled for anything reading the markup", svg, 'aria-label="Recipe QR code"');
  // one path segment per dark module: the drawing and the matrix must not disagree
  const dark = qr.modules.reduce((n, row) => n + row.reduce((s, v) => s + v, 0), 0);
  eq("every dark module is drawn, and nothing else is", (svg.match(/M\d+ \d+h1v1h-1z/g) || []).length, dark);
}

/* =======================================================================
   THE WRAPPER'S QR
   The whole point of the encoder: a printed bar carries its own recipe.
======================================================================= */
{
  const p = await newPage();
  const qrInfo = () => p.evaluate(() => {
    const b = document.querySelector(".wrap-qr");
    const notes = Array.from(document.querySelectorAll(".inci-warn")).map((e) => e.textContent);
    if (!b) return { present: false, notes };
    const svg = b.querySelector("svg");
    return { present: true, notes, mm: b.style.getPropertyValue("--qr-mm"),
             viewBox: svg.getAttribute("viewBox"), caption: b.querySelector(".wrap-qr-cap").textContent,
             inCard: !!b.closest(".wrapper-card") };
  });

  // --- an ordinary recipe gets a code, inside the printable card ---
  await open(p, store({ name: "Lavender Oat",
    oils: [OIL("olive", 500), OIL("coconut", 300), OIL("palm", 200)] }));
  await menu(p, "wrapper");
  let info = await qrInfo();
  eq("an ordinary recipe's wrapper carries a QR code", info.present, true);
  eq("the code prints inside the wrapper card, not beside it", info.inCard, true);
  eq("the code is captioned so it is obvious what it does", info.caption, "Scan for the recipe");
  ok("the code is sized in millimetres for the printer", /^\d+(\.\d+)?mm$/.test(info.mm), info.mm);
  ok("a three-oil recipe prints at a size that fits a wrapper",
     parseFloat(info.mm) >= 30 && parseFloat(info.mm) <= 52, info.mm);
  // the printed module has to stay big enough for a phone to resolve
  const modules = parseInt(info.viewBox.split(" ")[2], 10) - 8;
  ok("its modules print at 0.38 mm or better", parseFloat(info.mm) / modules >= 0.38,
     `${(parseFloat(info.mm) / modules).toFixed(3)} mm per module`);
  eq("no apology is printed when the code is fine",
     info.notes.some((n) => n.includes("QR")), false);

  // --- the code really carries this recipe's share link ---
  const matches = await p.evaluate(async () => {
    const out = await import("/src/features/output.js");
    const st = await import("/src/core/state.js");
    const qr = await import("/src/core/qr.js");
    const url = out.recipeShareURL(st.library[0]);
    const built = qr.encodeQR(url, "L");
    // the path's own data, not the serialised markup — the browser rewrites the tags
    const shown = document.querySelector(".wrap-qr svg path").getAttribute("d");
    const want = qr.qrSVG(built, 160).match(/ d="([^"]+)"/)[1];
    return { same: shown === want, len: url.length };
  });
  eq("the printed code is the recipe's own share link", matches.same, true);
  ok("a three-oil share link is a few hundred bytes", matches.len > 200 && matches.len < 900, String(matches.len));

  // --- a recipe too dense to scan gets an honest blank, not a useless code ---
  const big = { name: "Everything", oils: [], additives: [], aromas: [] };
  Object.keys(t.OILS).slice(0, 40).forEach((k) => big.oils.push(OIL(k, 100)));
  big.notes = "";
  await open(p, store(big));
  await menu(p, "wrapper");
  info = await qrInfo();
  eq("a recipe with forty oils prints no QR code at all", info.present, false);
  ok("...and says why, pointing at the share link instead",
     info.notes.some((n) => n.includes("too fine to scan") && n.includes("Share")), info.notes.join(" | "));

  await p.close();
}

}
