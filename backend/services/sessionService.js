"use strict";
/**
 * Sign-in sessions. Every login creates one; its id travels in the token ("sid") and the server checks
 * it on every request (middlewares/authMiddleware.js), so a session can be ended at once.
 *
 *   - ends after SESSION_IDLE_HOURS without activity (default 24) and SESSION_MAX_DAYS after sign-in
 *     (default 7);
 *   - the user can sign out one device or all their other devices; an administrator can sign a user
 *     out everywhere;
 *   - ends on every device when the account is deactivated, and on the other devices when the
 *     password changes (all of them after a reset).
 *
 * A sign-in from a device type the person has not used before sends them a notification.
 */
const { Op } = require("sequelize");
const { v4: uuidv4 } = require("uuid");
const db = require("../models");

const IDLE_MS = (Number(process.env.SESSION_IDLE_HOURS) || 24) * 3600e3;
const MAX_MS = (Number(process.env.SESSION_MAX_DAYS) || 7) * 86400e3;
// last_seen_at is written at most this often (not on every request)
const TOUCH_MS = 5 * 60e3;

/** "Chrome on Android", "Safari on iPhone", "Edge on Windows" … from the browser's user agent. */
const deviceOf = (ua = "") => {
  const s = String(ua);
  const os = /android/i.test(s) ? "Android" : /iphone/i.test(s) ? "iPhone" : /ipad/i.test(s) ? "iPad" : /windows/i.test(s) ? "Windows" : /mac os x|macintosh/i.test(s) ? "Mac" : /linux/i.test(s) ? "Linux" : null;
  const browser = /edg\//i.test(s) ? "Edge" : /opr\/|opera/i.test(s) ? "Opera" : /samsungbrowser/i.test(s) ? "Samsung Internet" : /firefox|fxios/i.test(s) ? "Firefox" : /chrome|crios/i.test(s) ? "Chrome" : /safari/i.test(s) ? "Safari" : null;
  if (!os && !browser) return s ? "Other device" : "Unknown device";
  return [browser, os].filter(Boolean).join(" on ");
};

/**
 * Where the request comes from. Logins pass through the web app's server, which forwards the person's
 * own address and browser as x-client-ip / x-client-user-agent (shown to the person only; not a security check).
 */
const clientOf = (req) => ({
  ip: String(req.headers["x-client-ip"] || req.headers["x-forwarded-for"]?.split(",")[0] || req.socket?.remoteAddress || "").trim().slice(0, 64) || null,
  user_agent: String(req.headers["x-client-user-agent"] || req.headers["user-agent"] || "").slice(0, 500) || null,
});

/** A new session for a successful login. @returns {Promise<{ session, newDevice: boolean }>} */
const startSession = async (userId, req) => {
  const { ip, user_agent } = clientOf(req);
  const device = deviceOf(user_agent);
  const now = new Date();
  const seenBefore = await db.UserSession.count({ where: { user_id: userId } });
  const sameDevice = seenBefore ? await db.UserSession.count({ where: { user_id: userId, device } }) : 1;
  const session = await db.UserSession.create({ session_id: uuidv4(), user_id: userId, ip, user_agent, device, created_at: now, last_seen_at: now, expires_at: new Date(now.getTime() + MAX_MS) });
  return { session, newDevice: seenBefore > 0 && sameDevice === 0 };
};

const end = (where, reason, byUserId = null) => db.UserSession.update({ ended_at: new Date(), end_reason: reason, ended_by: byUserId }, { where: { ...where, ended_at: null } });

/**
 * The session of a request, if it may still be used; else ends it (when it timed out) and returns null
 * with the reason. Records activity at most every few minutes.
 */
const checkSession = async (sessionId, userId) => {
  if (!sessionId) return { ok: false, reason: "no_session" };
  const s = await db.UserSession.findByPk(sessionId);
  if (!s || s.user_id !== userId) return { ok: false, reason: "no_session" };
  if (s.ended_at) return { ok: false, reason: s.end_reason || "signed_out" };
  const now = Date.now();
  if (now > new Date(s.expires_at).getTime()) {
    await end({ session_id: s.session_id }, "expired");
    return { ok: false, reason: "expired" };
  }
  if (now - new Date(s.last_seen_at).getTime() > IDLE_MS) {
    await end({ session_id: s.session_id }, "inactive");
    return { ok: false, reason: "inactive" };
  }
  if (now - new Date(s.last_seen_at).getTime() > TOUCH_MS) await s.update({ last_seen_at: new Date(now) });
  return { ok: true, session: s };
};

/** Open sessions of a user, newest activity first. */
const openSessions = (userId) =>
  db.UserSession.findAll({
    where: { user_id: userId, ended_at: null, expires_at: { [Op.gt]: new Date() }, last_seen_at: { [Op.gt]: new Date(Date.now() - IDLE_MS) } },
    attributes: ["session_id", "ip", "device", "user_agent", "created_at", "last_seen_at", "expires_at"],
    order: [["last_seen_at", "DESC"]],
  });

/** Recent sign-ins (open and ended), for the person's own history. */
const recentSessions = (userId, limit = 20) =>
  db.UserSession.findAll({
    where: { user_id: userId },
    attributes: ["session_id", "ip", "device", "created_at", "last_seen_at", "ended_at", "end_reason"],
    order: [["created_at", "DESC"]],
    limit,
  });

const endSession = (sessionId, userId, reason, byUserId = null) => end({ session_id: sessionId, user_id: userId }, reason, byUserId);
/** End every session of a user, optionally keeping one (the current device). */
const endAllSessions = (userId, reason, { exceptSessionId = null, byUserId = null } = {}) =>
  end({ user_id: userId, ...(exceptSessionId ? { session_id: { [Op.ne]: exceptSessionId } } : {}) }, reason, byUserId);

// A deactivated account is signed out on every device, whichever page deactivated it
db.User.addHook("afterUpdate", "endSessionsWhenDeactivated", async (user) => {
  if (user.changed("is_active") && user.is_active === false) await end({ user_id: user.user_id }, "deactivated");
});

module.exports = { startSession, checkSession, openSessions, recentSessions, endSession, endAllSessions, deviceOf, clientOf, IDLE_MS, MAX_MS };
