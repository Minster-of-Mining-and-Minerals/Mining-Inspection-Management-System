/**
 * Helpers for (I)LIKE patterns, with pattern characters in user text taken literally.
 * Without this, a license number like MOM\LSML\9829 never matches (in LIKE, "\"
 * escapes the next character) and "%" or "_" match anything.
 */
const escapeLike = (text) => String(text).replace(/[\\%_]/g, (c) => `\\${c}`);

/** "%term%": contains the text. */
const likeContains = (term) => `%${escapeLike(String(term).trim())}%`;

module.exports = { likeContains, escapeLike };
