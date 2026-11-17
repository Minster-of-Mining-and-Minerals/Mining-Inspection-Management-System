"use strict";
/**
 * Is a request coming from a computer (Windows, Mac, Linux, Chromebook) rather than a phone or tablet?
 * Computers have no GPS: their "location" is a guess from the internet connection (often Addis
 * Ababa), so inspections must be submitted from a phone.
 *
 * Uses the browser's own User-Agent header and Client Hint (Sec-CH-UA-Mobile); the page also sends
 * `touch` (navigator.maxTouchPoints) so an iPad, which calls itself "Macintosh", counts as a tablet.
 * A request with no User-Agent at all (scripts, tests) is not treated as a computer.
 */
const PHONE_OR_TABLET = /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle|Windows Phone/i;

const isComputer = (req) => {
  const ua = String(req.headers["user-agent"] || "");
  if (!ua) return false;
  if (req.headers["sec-ch-ua-mobile"] === "?1") return false;
  if (PHONE_OR_TABLET.test(ua)) return false;
  const touch = Number(req.body?.device?.touch) || 0;
  if (/Macintosh/i.test(ua) && touch > 1) return false; // iPad (iPadOS says Macintosh)
  return true;
};

/** SUBMIT_REQUIRE_PHONE=false switches the rule off (default: on). */
const phoneRequiredToSubmit = () => String(process.env.SUBMIT_REQUIRE_PHONE ?? "true").toLowerCase() !== "false";

module.exports = { isComputer, phoneRequiredToSubmit };
