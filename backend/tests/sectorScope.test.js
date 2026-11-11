"use strict";
/**
 * Sector isolation rules that need no database (services/sectorScope.js, services/userAccessService.js).
 * The API behaviour built on them (a GIE user can't read or change MoM data, no privilege
 * escalation) needs a running server and database, so it is not covered here.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { resolveScope, scopeWhere, scopeSql, inScope, sectorForCreate, assertSameSector } = require("../services/sectorScope");
const { missingPermissions, userSectorFor } = require("../services/userAccessService");
const { ROOT_SECTOR_ID, MOM_SECTOR_ID, CENTRAL_ONLY_PERMISSIONS } = require("../utils/sectorConstants");

const GIE = "c1934d0d-b316-406f-a599-e6282b08ad4b";
const sectorReq = (sectorId = MOM_SECTOR_ID, permissions = []) => ({
  scope: { isCentral: false, userSectorId: sectorId, sectorId },
  user: { user_id: "u1", permissions },
  body: {},
});
const centralReq = (selected = null) => ({
  scope: { isCentral: true, userSectorId: ROOT_SECTOR_ID, sectorId: selected },
  user: { user_id: "c1", permissions: [] },
  body: {},
});

describe("resolveScope", () => {
  it("limits a sector user to their sector and ignores the switcher header", async () => {
    assert.deepEqual(await resolveScope(GIE, MOM_SECTOR_ID), { isCentral: false, userSectorId: GIE, sectorId: GIE });
  });

  it("gives a central user every sector when no sector is chosen", async () => {
    assert.deepEqual(await resolveScope(ROOT_SECTOR_ID, undefined), { isCentral: true, userSectorId: ROOT_SECTOR_ID, sectorId: null });
    assert.deepEqual(await resolveScope(ROOT_SECTOR_ID, "all"), { isCentral: true, userSectorId: ROOT_SECTOR_ID, sectorId: null });
  });

  it("never treats a user without a sector as central", async () => {
    const scope = await resolveScope(null, undefined);
    assert.equal(scope.isCentral, false);
    assert.ok(scope.sectorId, "must still filter by something");
  });
});

describe("scope filters", () => {
  it("filters sector users to their sector", () => {
    assert.deepEqual(scopeWhere(sectorReq(GIE)), { sector_node_id: GIE });
    assert.equal(scopeSql(sectorReq(GIE), "i"), `i.sector_node_id = '${GIE}'`);
  });

  it("does not filter central users looking at all sectors", () => {
    assert.deepEqual(scopeWhere(centralReq()), {});
    assert.equal(scopeSql(centralReq(), "i"), "TRUE");
  });

  it("filters central users to the sector chosen in the switcher", () => {
    assert.deepEqual(scopeWhere(centralReq(GIE)), { sector_node_id: GIE });
  });

  it("inScope compares a record's sector with the request's", () => {
    assert.equal(inScope(sectorReq(GIE), GIE), true);
    assert.equal(inScope(sectorReq(GIE), MOM_SECTOR_ID), false);
    assert.equal(inScope(centralReq(), MOM_SECTOR_ID), true);
  });

  it("throws if a route forgot authentication (no scope)", () => {
    assert.throws(() => scopeWhere({}), /Sector scope missing/);
  });
});

describe("sector of new records", () => {
  it("sector users always create in their own sector, whatever they send", async () => {
    const req = sectorReq(GIE);
    assert.equal(await sectorForCreate(req, MOM_SECTOR_ID), GIE);
    assert.equal(await userSectorFor(req, ROOT_SECTOR_ID), GIE);
  });

  it("central users must say which sector", async () => {
    await assert.rejects(sectorForCreate(centralReq(), undefined), { status: 400 });
  });

  it("only central users can create central users", async () => {
    assert.equal(await userSectorFor(centralReq(), ROOT_SECTOR_ID), ROOT_SECTOR_ID);
  });

  it("refuses to link records of different sectors", () => {
    assert.doesNotThrow(() => assertSameSector({ sector_node_id: GIE }, { sector_node_id: GIE }));
    assert.throws(() => assertSameSector({ sector_node_id: GIE }, { sector_node_id: MOM_SECTOR_ID }), { status: 400 });
  });
});

describe("no privilege escalation", () => {
  it("lists permissions the user does not hold", () => {
    const req = sectorReq(GIE, ["users:read", "users:create"]);
    assert.deepEqual(missingPermissions(req, ["users:read", "sector:create", "users:create"]), ["sector:create"]);
    assert.deepEqual(missingPermissions(req, ["users:read"]), []);
  });

  it("keeps sector management and shared data central-only", () => {
    for (const p of ["sector:create", "sector:delete", "permissions:update", "minerals:update", "admin_areas:update", "inspection_analytics:read"]) {
      assert.ok(CENTRAL_ONLY_PERMISSIONS.includes(p), p);
    }
  });
});
