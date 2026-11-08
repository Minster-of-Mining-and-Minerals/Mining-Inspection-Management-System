/**
 * Turns free mineral text from license lists into standard minerals:
 *   "Gold and Base Metals"                              -> Gold, Base Metals
 *   "Gypsum, Limestone, Marl, Silica Sand(sand stone)"  -> Gypsum, Limestone, Marl, Silica Sand
 *   "gold and related mierals"                          -> Gold
 *   "Coal mining & processing"                          -> Coal
 */

/** Comparable form of one mineral name. */
const normalizeMineralName = (raw) =>
  String(raw || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // "Kaolin (Clay)", "Gemstones (Except Diamonds)"
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(ores?|minerals?|mierals|mining|processing|production|deposits?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Parts that add no mineral: "... and related minerals", "related metals"
const IGNORED_PARTS = new Set(["related", "related metals", "associated", "associated metals", "others", "other", "etc"]);

/** Split "Gold, Iron Ore Mineral, Tantalum" / "Copper & Related Metals" into parts. */
const splitMineralText = (raw) =>
  String(raw || "")
    .replace(/\([^)]*\)/g, " ")
    .split(/\s*(?:,|&|;|\/|\+|\band\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * @param {string} text  mineral text from a license
 * @param {Array<{mineral_id, name, aliases}>} minerals  the standard list
 * @returns {{ matched: object[], unknown: string[] }}
 */
const parseMineralText = (text, minerals) => {
  const index = new Map();
  for (const m of minerals) {
    index.set(normalizeMineralName(m.name), m);
    for (const a of m.aliases || []) index.set(normalizeMineralName(a), m);
  }
  const matched = new Map();
  const unknown = [];
  for (const part of splitMineralText(text)) {
    const norm = normalizeMineralName(part);
    if (!norm || IGNORED_PARTS.has(norm)) continue;
    const hit = index.get(norm) || index.get(norm.replace(/s$/, "")) || index.get(`${norm}s`);
    if (hit) matched.set(hit.mineral_id, hit);
    else unknown.push(part);
  }
  return { matched: [...matched.values()], unknown };
};

module.exports = { normalizeMineralName, splitMineralText, parseMineralText };
