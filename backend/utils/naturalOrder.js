"use strict";
/**
 * Natural order of names with numbers: "Team 2" before "Team 10" (plain text order puts "Team 10" first).
 *   SQL:  ORDER BY ${naturalOrderSql('t.name')}
 *   JS:   list.sort(byNaturalName((x) => x.name))
 */

/** ORDER BY terms for a name column: the text without its numbers, then the first number, then the full text. */
const naturalOrderSql = (column) =>
  `regexp_replace(${column}, '[0-9]+', '', 'g'), NULLIF(substring(${column} from '[0-9]+'), '')::bigint NULLS FIRST, ${column}`;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
/** A sort comparator by name; items without a name ("No team") go last. */
const byNaturalName = (nameOf) => (a, b) => {
  const x = nameOf(a);
  const y = nameOf(b);
  if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
  return collator.compare(x, y);
};

module.exports = { naturalOrderSql, byNaturalName };
