"use strict";
/**
 * Audit log: who did what, when, from where, and what changed — for every account (inspectors,
 * sector administrators, the central administrator).
 *
 * How it works
 *   - auditRequests (middleware, app.js): every change request (POST / PUT / PATCH / DELETE) becomes one
 *     row when its response is sent: the person (or the email tried, for a failed sign-in), the action
 *     (from the route, e.g. users.update, inspections.submit), the target, success or failure, IP, browser.
 *   - Database hooks attach what the request changed: created / updated / deleted records, with the old
 *     and new values of the changed fields. Passwords, one-time codes and tokens are never stored; long
 *     values (answers, map areas) are summarised.
 *   - Controllers can add details in res.locals.audit ({ action, actor, entity_type, entity_id, entity_label, message }).
 *   - Not logged: reads, autosave of inspection answers (the inspection's own history covers them),
 *     marking notifications read, and changes made by the system itself (schedules, reminders).
 *   - Rows are never edited or deleted by the app; rows older than AUDIT_RETENTION_DAYS (default 730) are
 *     removed by the hourly job (removeOldEntries).
 */
const { AsyncLocalStorage } = require("async_hooks");
const { Op } = require("sequelize");
const db = require("../models");

const als = new AsyncLocalStorage();
const RETENTION_DAYS = Number(process.env.AUDIT_RETENTION_DAYS) || 730;
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Requests not logged (too frequent, or covered elsewhere)
const SKIP = [/^\/api\/inspections\/[^/]+\/answers$/, /^\/api\/inspections\/[^/]+\/office-answers$/, /^\/api\/notifications\//, /^\/api-docs/];
// Records not tracked (their own logs, or noise)
const SKIP_MODELS = new Set(["AuditLog", "UserSession", "Notification", "InspectionEvent"]);
// Fields never stored; fields only marked as changed
const SECRET = /password|otp|token|secret/i;
const SUMMARY = new Set(["answers", "boundary", "definition", "submit_device", "submit_location"]);
const MAX_CHANGES = 40;

const short = (v) => {
  if (v == null) return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const s = JSON.stringify(v);
    return s.length > 300 ? `${s.slice(0, 300)}…` : v;
  }
  const s = String(v);
  return s.length > 300 ? `${s.slice(0, 300)}…` : v;
};
const clean = (field, value) => (SECRET.test(field) ? "(hidden)" : SUMMARY.has(field) ? "(changed)" : short(value));
const labelOf = (i) => i.get?.("full_name") ?? i.get?.("name") ?? i.get?.("license_number") ?? i.get?.("title") ?? null;
const pkOf = (i) => {
  const pk = i.constructor?.primaryKeyAttribute;
  return pk ? i.get(pk) : null;
};

/** Record a database change made while handling the current request. */
const track = (entry) => {
  const store = als.getStore();
  if (!store || store.changes.length >= MAX_CHANGES) {
    if (store) store.more = (store.more || 0) + 1;
    return;
  }
  store.changes.push(entry);
};

// ---- database hooks (all models) ----
db.sequelize.addHook("afterCreate", (instance) => {
  const model = instance.constructor?.name;
  if (!als.getStore() || SKIP_MODELS.has(model)) return;
  const after = {};
  for (const [k, v] of Object.entries(instance.get({ plain: true }))) if (v != null && !/_at$/.test(k)) after[k] = clean(k, v);
  track({ model, op: "create", id: pkOf(instance), label: labelOf(instance), after, sector: instance.get?.("sector_node_id") ?? null });
});
db.sequelize.addHook("afterUpdate", (instance) => {
  const model = instance.constructor?.name;
  if (!als.getStore() || SKIP_MODELS.has(model)) return;
  const fields = (instance.changed() || []).filter((k) => !/^(updated_at|updatedAt|last_saved_at)$/.test(k));
  if (!fields.length) return;
  const before = {};
  const after = {};
  for (const k of fields) {
    before[k] = clean(k, instance.previous(k));
    after[k] = clean(k, instance.get(k));
  }
  track({ model, op: "update", id: pkOf(instance), label: labelOf(instance), before, after, sector: instance.get?.("sector_node_id") ?? null });
});
db.sequelize.addHook("afterDestroy", (instance) => {
  const model = instance.constructor?.name;
  if (!als.getStore() || SKIP_MODELS.has(model)) return;
  track({ model, op: "delete", id: pkOf(instance), label: labelOf(instance), sector: instance.get?.("sector_node_id") ?? null });
});
db.sequelize.addHook("afterBulkCreate", (instances) => {
  const model = instances?.[0]?.constructor?.name;
  if (!als.getStore() || !model || SKIP_MODELS.has(model)) return;
  track({ model, op: "create", count: instances.length, ids: instances.slice(0, 20).map(pkOf) });
});
db.sequelize.addHook("afterBulkUpdate", (options) => {
  const model = options.model?.name;
  if (!als.getStore() || !model || SKIP_MODELS.has(model)) return;
  const set = {};
  for (const [k, v] of Object.entries(options.attributes || {})) if (!/^(updated_at|updatedAt)$/.test(k)) set[k] = clean(k, v);
  if (Object.keys(set).length) track({ model, op: "update", where: short(options.where), after: set });
});
db.sequelize.addHook("afterBulkDestroy", (options) => {
  const model = options.model?.name;
  if (!als.getStore() || !model || SKIP_MODELS.has(model)) return;
  track({ model, op: "delete", where: short(options.where) });
});

/** "users.update", "inspections.submit", "auth.login" … from the request. */
const actionOf = (req) => {
  const path = req.originalUrl.split("?")[0].replace(/^\/api\/(v\d+\/)?/, "");
  const parts = path.split("/").filter(Boolean);
  const resource = parts[0] || "unknown";
  const words = parts.slice(1).filter((p) => !UUID.test(p) && !/^\d+$/.test(p));
  const verb = words.length ? words.join(".") : { POST: "create", PUT: "update", PATCH: "update", DELETE: "delete" }[req.method];
  return `${resource}.${verb}`.slice(0, 80);
};

const clientOf = (req) => ({
  ip: String(req.headers["x-client-ip"] || req.headers["x-forwarded-for"]?.split(",")[0] || req.socket?.remoteAddress || "").trim().slice(0, 64) || null,
  user_agent: String(req.headers["x-client-user-agent"] || req.headers["user-agent"] || "").slice(0, 500) || null,
});

/** Write one row; never throws. */
const writeEntry = (row) =>
  db.AuditLog.create({ ...row, occurred_at: row.occurred_at || new Date() }).catch((e) => console.error("Audit log not written:", e.message));

/** Middleware: one row per change request, with the database changes it made. */
const auditRequests = (req, res, next) => {
  if (!MUTATING.has(req.method) || !req.originalUrl.startsWith("/api") || SKIP.some((r) => r.test(req.originalUrl.split("?")[0]))) return next();
  const store = { changes: [], more: 0 };
  // The message a failed request answered with (shown in the log)
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400 && body) {
      // { message } from controllers, { errors: [...] } from the validators
      const errors = Array.isArray(body.errors) ? body.errors.map((e) => (typeof e === "string" ? e : e?.message)).filter(Boolean).join("; ") : null;
      res.locals.errorMessage = typeof body.message === "string" ? body.message : errors || null;
    }
    return json(body);
  };
  res.on("finish", () => {
    const extra = res.locals.audit || {};
    const actor = extra.actor || (req.user ? { user_id: req.user.user_id, full_name: req.user.full_name, email: req.user.email, sector_node_id: req.user.sector_node_id } : null);
    const first = store.changes.find((c) => c.id) || null;
    const path = req.originalUrl.split("?")[0];
    const ok = res.statusCode < 400;
    writeEntry({
      actor_id: actor?.user_id ?? null,
      actor_name: actor?.full_name ?? null,
      // Without a signed-in person (sign-in, forgotten password): the email that was entered
      actor_email: actor?.email ?? extra.actor_email ?? (typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 255) : null),
      actor_sector_id: actor?.sector_node_id ?? null,
      session_id: req.session_id ?? extra.session_id ?? null,
      action: extra.action || actionOf(req),
      entity_type: extra.entity_type || path.replace(/^\/api\/(v\d+\/)?/, "").split("/")[0] || null,
      entity_id: extra.entity_id || path.match(UUID)?.[0] || first?.id || null,
      entity_label: (extra.entity_label || first?.label || null)?.toString().slice(0, 300) ?? null,
      entity_sector_id: extra.entity_sector_id || store.changes.find((c) => c.sector)?.sector || null,
      changes: ok && store.changes.length ? (store.more ? [...store.changes, { more: store.more }] : store.changes) : null,
      outcome: ok ? "success" : "failure",
      status_code: res.statusCode,
      message: extra.message?.slice(0, 500) ?? (ok ? null : res.locals.errorMessage?.slice(0, 500) ?? null),
      method: req.method,
      path: path.replace(new RegExp(UUID.source, "gi"), ":id").slice(0, 300),
      ...clientOf(req),
    });
  });
  als.run(store, next);
};

/** Remove rows older than the retention time (hourly job). */
const removeOldEntries = () =>
  db.AuditLog.destroy({ where: { occurred_at: { [Op.lt]: new Date(Date.now() - RETENTION_DAYS * 86400e3) } } }).catch((e) => console.error("Audit log cleanup:", e.message));

module.exports = { auditRequests, removeOldEntries, writeEntry, actionOf, RETENTION_DAYS };
