/**
 * Helpers for comparing Region / Zone / Woreda names written in different ways,
 * e.g. "Asossa " vs "Assosa", "N.sheewa" vs "North Shewa", "Zone two" vs "Zone 2".
 */

const NUMBER_WORDS = {
  one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
};

// Words that describe the kind of area rather than name it ("rasu"/"rasa" = zone in Afar).
// "town" is kept: "Adola" and "Adola town" are different woredas.
const FILLER_WORDS = new Set([
  "zone", "woreda", "wereda", "region", "regional", "state", "special", "city",
  "administration", "adminstration", "admin", "the", "of", "rasu", "rasa",
]);

// Well-known alternative spellings of the same place word
const SPELLING_VARIANTS = {
  wollega: "wellega", wolega: "wellega", welega: "wellega", wollaga: "wellega",
  shoa: "shewa", showa: "shewa", sheewa: "shewa", shoaa: "shewa",
  harerge: "hararge", harege: "hararge", hararghe: "hararge", hararage: "hararge",
  gojjam: "gojam",
  wello: "wello", wollo: "wello",
  gonder: "gondar",
  wolayta: "wolayita", wolaita: "wolayita",
  gambella: "gambela",
};

// Region tags that the official list appends to repeated names: "North Shewa (AM)", "Moyale (SM)"
const REGION_TAG = /\s*\((?:tg|af|am|or|sm|bg|snnp|ga|ha|aa|dd|si|sw|se|ce)\)\s*/gi;

const DIRECTIONS = { n: "north", s: "south", e: "east", w: "west", ne: "northeast", nw: "northwest", se: "southeast", sw: "southwest" };

/** Lower-case comparable form: "N.sheewa " -> "north sheewa", "Zone two" -> "2", "Kilbati /Zone 2" -> "kilbati 2". */
const normalizeAreaName = (raw) => {
  if (raw == null) return "";
  let s = String(raw).normalize("NFKC").toLowerCase().replace(REGION_TAG, " ").trim();
  // Abbreviated directions at the start: "N.Shewa", "W.shewa", "E. Gojam"
  s = s.replace(/^(n|s|e|w|ne|nw|se|sw)\s*\.\s*/, (_, d) => `${DIRECTIONS[d]} `);
  // Common typo seen in the license list: "Northe Shoa"
  s = s.replace(/\bnorthe\b/g, "north");
  s = s.replace(/[’'`´]/g, "");
  s = s.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  let tokens = s
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => NUMBER_WORDS[t] || SPELLING_VARIANTS[t] || t);
  const meaningful = tokens.filter((t) => !FILLER_WORDS.has(t));
  // Keep fillers only if nothing else is left ("Zone" alone stays "zone")
  if (meaningful.length) tokens = meaningful;
  return tokens.join(" ");
};

/**
 * Split a spreadsheet cell that lists several areas:
 * "Menge & Sherkole", "Assosa, Kamashi & Metekel", "bilidiglu and menge", "Assosa /Sherkole".
 */
const splitAreaList = (raw) => {
  if (raw == null) return [];
  return String(raw)
    .split(/\s*(?:,|&|;|\/|\+|\band\b)\s*/i)
    .map((s) => s.trim())
    .filter((s) => s && normalizeAreaName(s));
};

/** Levenshtein distance (two-row DP). */
const levenshtein = (a, b) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
};

/** Similarity 0..1 of two normalized names (1 = identical; ignores spaces). */
const nameSimilarity = (a, b) => {
  const x = a.replace(/\s+/g, "");
  const y = b.replace(/\s+/g, "");
  if (!x || !y) return 0;
  if (x === y) return 1;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
};

module.exports = { normalizeAreaName, splitAreaList, nameSimilarity, levenshtein };
