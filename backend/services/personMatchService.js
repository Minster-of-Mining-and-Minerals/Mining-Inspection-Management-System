"use strict";
/**
 * Find the user account for a person named in the license list.
 *
 * Names in the list are typed by hand, so the same person can be spelled differently
 * ("Ashenef Kahsye" / "Ashenafi Kahsye"). A name matches:
 *   1. a user of the sector with exactly that name (case and spaces ignored), else
 *   2. the only user of the sector whose name differs by a small spelling difference in each
 *      word (1 letter for words of 4–5 letters, 2 for longer words; same number of words).
 * Several possible matches: none is chosen, so nobody is put in the wrong team.
 */
const { User } = require("../models");

const TITLES = new Set(["dr", "mr", "mrs", "ms", "eng", "engr", "prof", "ato", "wro", "weizero", "weyzero"]);

const words = (name) =>
  String(name || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !TITLES.has(w));

const levenshtein = (a, b) => {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
};

const allowed = (word) => (word.length >= 6 ? 2 : word.length >= 4 ? 1 : 0);

/** Whether two names are the same person written slightly differently. */
const similarNames = (a, b) => {
  const wa = words(a), wb = words(b);
  if (!wa.length || wa.length !== wb.length) return false;
  return wa.every((w, i) => levenshtein(w, wb[i]) <= Math.min(allowed(w), allowed(wb[i])));
};

/**
 * @returns {Promise<{ user: User|null, how: "exact"|"spelling"|null, candidates: User[] }>}
 */
async function findUserForName(name, sectorId, transaction) {
  const users = await User.findAll({
    where: { sector_node_id: sectorId },
    attributes: ["user_id", "full_name", "email", "is_active", "sector_node_id"],
    transaction,
  });
  const key = words(name).join(" ");
  const exact = users.filter((u) => words(u.full_name).join(" ") === key);
  if (exact.length === 1) return { user: exact[0], how: "exact", candidates: exact };
  if (exact.length > 1) return { user: null, how: null, candidates: exact };
  const close = users.filter((u) => similarNames(name, u.full_name));
  if (close.length === 1) return { user: close[0], how: "spelling", candidates: close };
  return { user: null, how: null, candidates: close };
}

module.exports = { findUserForName, similarNames };
