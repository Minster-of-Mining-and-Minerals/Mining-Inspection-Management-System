/**
 * Matches Region / Zone / Woreda text from spreadsheets to the official list.
 *
 * Rules (so that look-alike but different places such as Bore and Bure are
 * never merged on their own):
 *   - names are compared after normalizeAreaName();
 *   - a zone is looked up inside its region, a woreda inside its zone(s);
 *   - an exact name or a known alias inside the right parent  -> "matched";
 *   - anything else only produces suggestions                 -> "suggested" / "not_found",
 *     which a person must confirm. A confirmed answer is saved as an alias.
 */
const { normalizeAreaName, splitAreaList, nameSimilarity } = require("../utils/areaNames");

const SUGGEST_MIN_SIMILARITY = 0.6;
const MAX_SUGGESTIONS = 3;
const NONE = "-";

class AreaMatcher {
  /**
   * @param {Array<{area_id, parent_id, level, name, is_active?}>} areas
   * @param {Array<{area_id, alias, level, scope_parent_id}>} aliases
   */
  constructor(areas, aliases = []) {
    this.byId = new Map();
    this.byScope = new Map(); // `${level}|${parentId}` -> [{area, norm}]
    this.exact = new Map(); // `${level}|${parentId}|${norm}` -> area
    this.byLevel = { region: [], zone: [], woreda: [] };

    for (const a of areas) {
      if (a.is_active === false) continue;
      this.byId.set(a.area_id, a);
    }
    for (const a of this.byId.values()) {
      const norm = normalizeAreaName(a.name);
      const scopeKey = `${a.level}|${a.parent_id || NONE}`;
      if (!this.byScope.has(scopeKey)) this.byScope.set(scopeKey, []);
      this.byScope.get(scopeKey).push({ area: a, norm });
      this.exact.set(`${scopeKey}|${norm}`, a);
      this.byLevel[a.level]?.push({ area: a, norm });
    }
    for (const al of aliases) {
      const area = this.byId.get(al.area_id);
      if (!area) continue;
      const norm = normalizeAreaName(al.alias);
      const scopeKey = `${al.level}|${al.scope_parent_id || NONE}`;
      if (!this.exact.has(`${scopeKey}|${norm}`)) this.exact.set(`${scopeKey}|${norm}`, area);
      this.byScope.get(scopeKey)?.push({ area, norm });
      this.byLevel[al.level]?.push({ area, norm });
    }
  }

  get(areaId) {
    return this.byId.get(areaId) || null;
  }

  /** Full path, e.g. "Benishangul-Gumuz › Assosa › Sherkole". */
  pathOf(area) {
    const names = [];
    for (let a = area; a; a = a.parent_id ? this.byId.get(a.parent_id) : null) names.unshift(a.name);
    return names.join(" › ");
  }

  summarize(area, similarity) {
    return { area_id: area.area_id, name: area.name, level: area.level, path: this.pathOf(area), similarity: Math.round(similarity * 100) / 100 };
  }

  /** Ranked candidates by name similarity, best per area. */
  rank(entries, norm, exclude = new Set()) {
    const best = new Map();
    for (const { area, norm: n } of entries) {
      if (exclude.has(area.area_id)) continue;
      let sim = nameSimilarity(norm, n);
      // "Guji" vs "West Guji", "Odabilidiglu" vs "Oda Bilidiglu": one contains the other
      const a = norm.replace(/\s+/g, "");
      const b = n.replace(/\s+/g, "");
      if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) sim = Math.max(sim, 0.75);
      if (sim >= SUGGEST_MIN_SIMILARITY && sim > (best.get(area.area_id)?.sim ?? 0)) best.set(area.area_id, { area, sim });
    }
    return [...best.values()].sort((x, y) => y.sim - x.sim).slice(0, MAX_SUGGESTIONS);
  }

  /**
   * Match one name at one level.
   * @param {string} text   e.g. "Asossa"
   * @param {"region"|"zone"|"woreda"} level
   * @param {string[]|null} parentIds  where to look (null = regions, or "anywhere")
   */
  matchOne(text, level, parentIds = null) {
    const norm = normalizeAreaName(text);
    const result = { input: text, normalized: norm, level, status: "not_found", area: null, suggestions: [] };
    if (!norm) return { ...result, status: "empty" };

    const scopes = level === "region" ? [NONE] : parentIds && parentIds.length ? parentIds : null;

    // 1. Exact name / known alias inside the expected parent(s)
    if (scopes) {
      const hits = new Map();
      for (const p of scopes) {
        const hit = this.exact.get(`${level}|${p}|${norm}`);
        if (hit) hits.set(hit.area_id, hit);
      }
      if (hits.size === 1) {
        const area = [...hits.values()][0];
        return { ...result, status: "matched", area: this.summarize(area, 1) };
      }
      if (hits.size > 1) {
        // Same name in two of the given zones: a person has to choose
        return { ...result, status: "suggested", suggestions: [...hits.values()].map((a) => this.summarize(a, 1)) };
      }
    }

    // 2. Close spellings inside the expected parent(s)
    const local = scopes ? scopes.flatMap((p) => this.byScope.get(`${level}|${p}`) || []) : [];
    const localRanked = this.rank(local, norm);

    // 3. Exact or close names elsewhere in the country (data entered under the wrong parent)
    const exclude = new Set(localRanked.map((r) => r.area.area_id));
    const elsewhere = level === "region" ? [] : this.rank(this.byLevel[level] || [], norm, exclude);

    const suggestions = [...localRanked, ...elsewhere]
      .slice(0, MAX_SUGGESTIONS)
      .map((r) => ({ ...this.summarize(r.area, r.sim), outside_parent: !local.some((e) => e.area.area_id === r.area.area_id) }));

    if (suggestions.length) return { ...result, status: "suggested", suggestions };
    return result;
  }

  /**
   * Match one spreadsheet row (region / zone / woreda cells; zone and woreda may
   * list several names). Lower levels are searched inside whatever the level
   * above resolved to; if it did not resolve, they search the whole country.
   */
  matchRow({ region, zone, woreda }) {
    const regionMatch = this.matchOne(region, "region");
    const regionIds = regionMatch.area ? [regionMatch.area.area_id] : null;

    const zoneMatches = splitAreaList(zone).map((z) => this.matchOne(z, "zone", regionIds));
    const zoneIds = zoneMatches.filter((m) => m.area).map((m) => m.area.area_id);

    // Woredas: inside the matched zones; if none matched, inside all zones of the region
    let woredaScope = zoneIds.length ? zoneIds : null;
    if (!woredaScope && regionIds) {
      woredaScope = (this.byScope.get(`zone|${regionIds[0]}`) || []).map((e) => e.area.area_id);
    }
    const woredaMatches = splitAreaList(woreda).map((w) => this.matchOne(w, "woreda", woredaScope));

    const all = [regionMatch, ...zoneMatches, ...woredaMatches].filter((m) => m.status !== "empty");
    return {
      region: regionMatch,
      zones: zoneMatches,
      woredas: woredaMatches,
      fully_matched: all.length > 0 && all.every((m) => m.status === "matched"),
    };
  }
}

module.exports = { AreaMatcher, normalizeAreaName, splitAreaList };
