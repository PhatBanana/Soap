/* A QR encoder, so a gifted bar can carry its own recipe.

   The share link already puts the whole recipe inside a URL; printing that URL as a QR
   on the bar wrapper means whoever you gave the soap to can scan it and get the exact
   formula. That is about as close to this app's stated purpose — personal use and
   gifting — as a feature gets.

   Vendored rather than depended on: the app has no build step and must work offline
   from the service worker's cache, so a runtime CDN fetch is not an option. Byte mode
   only, which is all a URL needs. ISO/IEC 18004; the tables below are the spec's, and
   every one of them is checked against an independent implementation (Python's segno)
   in the test suite — bit for bit, across versions, error-correction levels and masks,
   so a mistyped digit in any table fails CI rather than printing a code that scans as
   the wrong recipe. */

/* ---------- GF(256), the field Reed-Solomon works in ---------- */
var EXP = new Array(512), LOG = new Array(256);
(function () {
  var x = 1;
  for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
  for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
})();
function gmul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

/* The generator polynomial for `degree` error-correction codewords: the product of
   (x - a^i). Coefficients run highest power first, the constant term last. */
function rsDivisor(degree) {
  var result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  var root = 1;
  for (var i = 0; i < degree; i++) {
    for (var j = 0; j < result.length; j++) {
      result[j] = gmul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gmul(root, 0x02);
  }
  return result;
}
function rsRemainder(data, divisor) {
  var result = new Array(divisor.length).fill(0);
  for (var i = 0; i < data.length; i++) {
    var factor = data[i] ^ result.shift();
    result.push(0);
    for (var j = 0; j < divisor.length; j++) result[j] ^= gmul(divisor[j], factor);
  }
  return result;
}

/* ---------- capacity tables (ISO/IEC 18004 table 9) ----------
   Per version 1-40 and EC level, in the order L, M, Q, H:
     [ EC codewords per block, blocks in group 1, data codewords each,
                               blocks in group 2, data codewords each ] */
var ECB = [
  [[7,1,19,0,0],[10,1,16,0,0],[13,1,13,0,0],[17,1,9,0,0]],
  [[10,1,34,0,0],[16,1,28,0,0],[22,1,22,0,0],[28,1,16,0,0]],
  [[15,1,55,0,0],[26,1,44,0,0],[18,2,17,0,0],[22,2,13,0,0]],
  [[20,1,80,0,0],[18,2,32,0,0],[26,2,24,0,0],[16,4,9,0,0]],
  [[26,1,108,0,0],[24,2,43,0,0],[18,2,15,2,16],[22,2,11,2,12]],
  [[18,2,68,0,0],[16,4,27,0,0],[24,4,19,0,0],[28,4,15,0,0]],
  [[20,2,78,0,0],[18,4,31,0,0],[18,2,14,4,15],[26,4,13,1,14]],
  [[24,2,97,0,0],[22,2,38,2,39],[22,4,18,2,19],[26,4,14,2,15]],
  [[30,2,116,0,0],[22,3,36,2,37],[20,4,16,4,17],[24,4,12,4,13]],
  [[18,2,68,2,69],[26,4,43,1,44],[24,6,19,2,20],[28,6,15,2,16]],
  [[20,4,81,0,0],[30,1,50,4,51],[28,4,22,4,23],[24,3,12,8,13]],
  [[24,2,92,2,93],[22,6,36,2,37],[26,4,20,6,21],[28,7,14,4,15]],
  [[26,4,107,0,0],[22,8,37,1,38],[24,8,20,4,21],[22,12,11,4,12]],
  [[30,3,115,1,116],[24,4,40,5,41],[20,11,16,5,17],[24,11,12,5,13]],
  [[22,5,87,1,88],[24,5,41,5,42],[30,5,24,7,25],[24,11,12,7,13]],
  [[24,5,98,1,99],[28,7,45,3,46],[24,15,19,2,20],[30,3,15,13,16]],
  [[28,1,107,5,108],[28,10,46,1,47],[28,1,22,15,23],[28,2,14,17,15]],
  [[30,5,120,1,121],[26,9,43,4,44],[28,17,22,1,23],[28,2,14,19,15]],
  [[28,3,113,4,114],[26,3,44,11,45],[26,17,21,4,22],[26,9,13,16,14]],
  [[28,3,107,5,108],[26,3,41,13,42],[30,15,24,5,25],[28,15,15,10,16]],
  [[28,4,116,4,117],[26,17,42,0,0],[28,17,22,6,23],[30,19,16,6,17]],
  [[28,2,111,7,112],[28,17,46,0,0],[30,7,24,16,25],[24,34,13,0,0]],
  [[30,4,121,5,122],[28,4,47,14,48],[30,11,24,14,25],[30,16,15,14,16]],
  [[30,6,117,4,118],[28,6,45,14,46],[30,11,24,16,25],[30,30,16,2,17]],
  [[26,8,106,4,107],[28,8,47,13,48],[30,7,24,22,25],[30,22,15,13,16]],
  [[28,10,114,2,115],[28,19,46,4,47],[28,28,22,6,23],[30,33,16,4,17]],
  [[30,8,122,4,123],[28,22,45,3,46],[30,8,23,26,24],[30,12,15,28,16]],
  [[30,3,117,10,118],[28,3,45,23,46],[30,4,24,31,25],[30,11,15,31,16]],
  [[30,7,116,7,117],[28,21,45,7,46],[30,1,23,37,24],[30,19,15,26,16]],
  [[30,5,115,10,116],[28,19,47,10,48],[30,15,24,25,25],[30,23,15,25,16]],
  [[30,13,115,3,116],[28,2,46,29,47],[30,42,24,1,25],[30,23,15,28,16]],
  [[30,17,115,0,0],[28,10,46,23,47],[30,10,24,35,25],[30,19,15,35,16]],
  [[30,17,115,1,116],[28,14,46,21,47],[30,29,24,19,25],[30,11,15,46,16]],
  [[30,13,115,6,116],[28,14,46,23,47],[30,44,24,7,25],[30,59,16,1,17]],
  [[30,12,121,7,122],[28,12,47,26,48],[30,39,24,14,25],[30,22,15,41,16]],
  [[30,6,121,14,122],[28,6,47,34,48],[30,46,24,10,25],[30,2,15,64,16]],
  [[30,17,122,4,123],[28,29,46,14,47],[30,49,24,10,25],[30,24,15,46,16]],
  [[30,4,122,18,123],[28,13,46,32,47],[30,48,24,14,25],[30,42,15,32,16]],
  [[30,20,117,4,118],[28,40,47,7,48],[30,43,24,22,25],[30,10,15,67,16]],
  [[30,19,118,6,119],[28,18,47,31,48],[30,34,24,34,25],[30,20,15,61,16]]
];
// centre coordinates of the alignment patterns, per version (none for version 1)
var ALIGN = [[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],
  [6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],
  [6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],
  [6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],
  [6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],
  [6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],
  [6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]];
var EC_ORDER = ["L","M","Q","H"];
var EC_BITS  = { L:1, M:0, Q:3, H:2 };      // the format-information encoding, not the ranking

function dataCapacity(ver, ec) {
  var t = ECB[ver - 1][EC_ORDER.indexOf(ec)];
  return t[1] * t[2] + t[3] * t[4];
}
// byte mode spends 4 bits on the mode indicator and 8 or 16 on the character count
function charCountBits(ver) { return ver < 10 ? 8 : 16; }
function fits(ver, ec, len) {
  return len + 1 + (charCountBits(ver) > 8 ? 1 : 0) <= dataCapacity(ver, ec) &&
         (4 + charCountBits(ver) + len * 8) <= dataCapacity(ver, ec) * 8;
}

/* ---------- bit stream -> codewords ---------- */
export function buildCodewords(bytes, ver, ec) {
  var cap = dataCapacity(ver, ec), bits = [];
  function push(val, n) { for (var i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); }
  push(4, 4);                               // byte mode
  push(bytes.length, charCountBits(ver));
  for (var i = 0; i < bytes.length; i++) push(bytes[i], 8);
  var room = cap * 8;
  for (var t = 0; t < 4 && bits.length < room; t++) bits.push(0);   // terminator
  while (bits.length % 8 !== 0) bits.push(0);
  var data = [];
  for (var b = 0; b < bits.length; b += 8) {
    var v = 0; for (var k = 0; k < 8; k++) v = (v << 1) | bits[b + k];
    data.push(v);
  }
  // pad alternately with the two prescribed bytes until the version is full
  for (var p = 0; data.length < cap; p++) data.push(p % 2 === 0 ? 0xEC : 0x11);

  // split into blocks, compute each block's EC, then interleave both
  var t2 = ECB[ver - 1][EC_ORDER.indexOf(ec)];
  var ecLen = t2[0], blocks = [], ecBlocks = [], divisor = rsDivisor(ecLen), off = 0;
  function take(n, count) {
    for (var i = 0; i < count; i++) { var blk = data.slice(off, off + n); off += n; blocks.push(blk); ecBlocks.push(rsRemainder(blk, divisor)); }
  }
  take(t2[2], t2[1]);
  if (t2[3]) take(t2[4], t2[3]);
  var out = [], maxData = Math.max(t2[2], t2[4] || 0), i2, j2;
  for (i2 = 0; i2 < maxData; i2++) for (j2 = 0; j2 < blocks.length; j2++) if (i2 < blocks[j2].length) out.push(blocks[j2][i2]);
  for (i2 = 0; i2 < ecLen; i2++) for (j2 = 0; j2 < ecBlocks.length; j2++) out.push(ecBlocks[j2][i2]);
  return out;
}

/* ---------- module placement ---------- */
function newMatrix(size) {
  var m = []; for (var i = 0; i < size; i++) m.push(new Array(size).fill(null));
  return m;                                  // null = not yet set, so function patterns are known
}
function placeFinder(m, r, c) {
  for (var dr = -1; dr <= 7; dr++) for (var dc = -1; dc <= 7; dc++) {
    var rr = r + dr, cc = c + dc;
    if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue;
    var inRing = (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) || (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6));
    var inCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
    m[rr][cc] = (inRing || inCore) ? 1 : 0;
  }
}
function placeFunctionPatterns(m, ver) {
  var size = m.length;
  placeFinder(m, 0, 0); placeFinder(m, 0, size - 7); placeFinder(m, size - 7, 0);
  for (var i = 8; i < size - 8; i++) { var v = (i % 2 === 0) ? 1 : 0; m[6][i] = v; m[i][6] = v; }
  /* Alignment patterns sit at every pairing of the centre coordinates except the three
     that would land on a finder. They DO overwrite the timing pattern where they cross
     it — testing "is this module already set?" wrongly skips those, which costs every
     version from 7 up. */
  var centres = ALIGN[ver - 1], last = centres.length - 1;
  for (var a = 0; a <= last; a++) for (var b = 0; b <= last; b++) {
    if ((a === 0 && b === 0) || (a === 0 && b === last) || (a === last && b === 0)) continue;
    var r = centres[a], c = centres[b];
    for (var dr = -2; dr <= 2; dr++) for (var dc = -2; dc <= 2; dc++)
      m[r + dr][c + dc] = (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0)) ? 1 : 0;
  }
  m[size - 8][8] = 1;                        // the always-dark module
  // reserve the format areas so data placement steps over them
  for (var k = 0; k <= 8; k++) { if (m[8][k] === null) m[8][k] = 0; if (m[k][8] === null) m[k][8] = 0; }
  for (var k2 = 0; k2 < 8; k2++) { if (m[8][size - 1 - k2] === null) m[8][size - 1 - k2] = 0; if (m[size - 1 - k2][8] === null) m[size - 1 - k2][8] = 0; }
  if (ver >= 7) {
    for (var i3 = 0; i3 < 6; i3++) for (var j3 = 0; j3 < 3; j3++) {
      m[size - 11 + j3][i3] = 0; m[i3][size - 11 + j3] = 0;
    }
  }
}
function placeData(m, codewords) {
  var size = m.length, bitIdx = 0, up = true;
  for (var right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;              // the vertical timing column is skipped entirely
    for (var v = 0; v < size; v++) {
      var row = up ? size - 1 - v : v;
      for (var c = 0; c < 2; c++) {
        var col = right - c;
        if (m[row][col] !== null) continue;
        var bit = 0;
        if (bitIdx < codewords.length * 8) bit = (codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1;
        m[row][col] = bit; bitIdx++;
      }
    }
    up = !up;
  }
}
function maskFn(n, r, c) {
  switch (n) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return (r * c) % 2 + (r * c) % 3 === 0;
    case 6: return ((r * c) % 2 + (r * c) % 3) % 2 === 0;
    default: return ((r + c) % 2 + (r * c) % 3) % 2 === 0;
  }
}
function formatBits(ec, mask) {
  var data = (EC_BITS[ec] << 3) | mask, rem = data;
  for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}
function versionBits(ver) {
  var rem = ver;
  for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1F25);
  return (ver << 12) | rem;
}
/* The fifteen format bits appear twice: once wrapped around the top-left finder, and
   once split between the other two. Rows and columns are easy to transpose here and the
   symbol still looks plausible — it simply never scans, which is how this was caught. */
function applyFormat(m, ec, mask) {
  var size = m.length, bits = formatBits(ec, mask);
  for (var i = 0; i <= 5; i++) m[i][8] = (bits >> i) & 1;
  m[7][8] = (bits >> 6) & 1; m[8][8] = (bits >> 7) & 1; m[8][7] = (bits >> 8) & 1;
  for (var j = 9; j <= 14; j++) m[8][14 - j] = (bits >> j) & 1;
  for (var k = 0; k <= 7; k++) m[8][size - 1 - k] = (bits >> k) & 1;
  for (var n = 8; n <= 14; n++) m[size - 15 + n][8] = (bits >> n) & 1;
  m[size - 8][8] = 1;
}
function applyVersion(m, ver) {
  if (ver < 7) return;
  var size = m.length, bits = versionBits(ver);
  for (var i = 0; i < 18; i++) {
    var bit = (bits >> i) & 1, a = Math.floor(i / 3), b = i % 3;
    m[size - 11 + b][a] = bit; m[a][size - 11 + b] = bit;
  }
}
/* The spec's four penalty rules; the mask with the lowest total is the one used.

   Rule 3 counts an 11-module window rather than a 7-module finder-lookalike with a check
   on either side, which means a pattern with four light modules on BOTH sides scores 80
   rather than 40. The spec is genuinely ambiguous here and encoders disagree — segno
   picks a different mask from this one on about half of short payloads. That is not a
   bug in either: masking is undone from the format bits, so every mask decodes, and the
   choice only nudges how comfortably a scanner reads the symbol. Checked against an
   independently written implementation of the four rules, which chose the same mask as
   this one in every case tried, and against a decoder — so don't "fix" the double count
   to match another library without evidence from an actual scanner. */
export function penalty(m) {
  var size = m.length, score = 0, r, c, i;
  for (r = 0; r < size; r++) {
    for (var dir = 0; dir < 2; dir++) {
      var run = 1, prev = dir ? m[0][r] : m[r][0];
      for (i = 1; i < size; i++) {
        var cur = dir ? m[i][r] : m[r][i];
        if (cur === prev) { run++; if (run === 5) score += 3; else if (run > 5) score++; }
        else { run = 1; prev = cur; }
      }
    }
  }
  for (r = 0; r < size - 1; r++) for (c = 0; c < size - 1; c++) {
    var v = m[r][c];
    if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
  }
  var pat1 = [1,0,1,1,1,0,1,0,0,0,0], pat2 = [0,0,0,0,1,0,1,1,1,0,1];
  function runsMatch(get, n) {
    var hits = 0;
    for (var s = 0; s + 11 <= n; s++) {
      var ok1 = true, ok2 = true;
      for (var k = 0; k < 11; k++) { var g = get(s + k); if (g !== pat1[k]) ok1 = false; if (g !== pat2[k]) ok2 = false; }
      if (ok1 || ok2) hits++;
    }
    return hits;
  }
  for (i = 0; i < size; i++) {
    score += 40 * runsMatch(function (k) { return m[i][k]; }, size);
    score += 40 * runsMatch(function (k) { return m[k][i]; }, size);
  }
  var dark = 0;
  for (r = 0; r < size; r++) for (c = 0; c < size; c++) if (m[r][c]) dark++;
  var pct = dark * 100 / (size * size);
  score += 10 * Math.floor(Math.abs(pct - 50) / 5);
  return score;
}

/* ---------- the public call ----------
   Returns { size, modules, version, ec, mask } — modules[row][col] is 1 for a dark square —
   or null when the text will not fit at any version, which the caller must handle
   rather than print a truncated code. */
export function encodeQR(text, wantEc) {
  var bytes = [], enc = new TextEncoder().encode(text);
  for (var i = 0; i < enc.length; i++) bytes.push(enc[i]);
  var order = wantEc ? [wantEc] : ["M", "L"];      // prefer M; fall back to L for big payloads
  for (var e = 0; e < order.length; e++) {
    for (var ver = 1; ver <= 40; ver++) {
      if (!fits(ver, order[e], bytes.length)) continue;
      return buildMatrix(bytes, ver, order[e]);
    }
  }
  return null;
}
function buildMatrix(bytes, ver, ec) {
  var codewords = buildCodewords(bytes, ver, ec), size = ver * 4 + 17;
  var best = null, bestScore = Infinity, bestMask = 0;
  for (var mask = 0; mask < 8; mask++) {
    var m = newMatrix(size);
    placeFunctionPatterns(m, ver);
    var reserved = [];
    for (var r = 0; r < size; r++) reserved.push(m[r].slice());
    placeData(m, codewords);
    for (var rr = 0; rr < size; rr++) for (var cc = 0; cc < size; cc++)
      if (reserved[rr][cc] === null && maskFn(mask, rr, cc)) m[rr][cc] ^= 1;
    applyVersion(m, ver); applyFormat(m, ec, mask);
    var s = penalty(m);
    if (s < bestScore) { bestScore = s; best = m; bestMask = mask; }
  }
  return { size: size, modules: best, version: ver, ec: ec, mask: bestMask };
}
/* An SVG rather than a canvas: it prints at the printer's own resolution instead of
   whatever the screen rasterised, which is the difference between a code that scans off
   paper and one that doesn't. */
export function qrSVG(qr, px) {
  var quiet = 4, total = qr.size + quiet * 2, d = "";
  for (var r = 0; r < qr.size; r++) for (var c = 0; c < qr.size; c++)
    if (qr.modules[r][c]) d += "M" + (c + quiet) + " " + (r + quiet) + "h1v1h-1z";
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total +
    '" width="' + px + '" height="' + px + '" shape-rendering="crispEdges" role="img" aria-label="Recipe QR code">' +
    '<rect width="' + total + '" height="' + total + '" fill="#fff"/>' +
    '<path d="' + d + '" fill="#000"/></svg>';
}
