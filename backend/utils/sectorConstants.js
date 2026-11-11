"use strict";

/**
 * Fixed sector IDs (created by migration 20261110100000-sector-isolation and the sector seeder).
 * Sectors are flat: ROOT ("Central Admin") with the sectors directly under it.
 */
const ROOT_SECTOR_ID = "c991de46-1e0c-4027-8152-deadc08abd2d";
const MOM_SECTOR_ID = "2c5ede6b-142b-4db7-847a-77d34a89c0ef";
const GIE_SECTOR_ID = "c1934d0d-b316-406f-a599-e6282b08ad4b";
const MIDI_SECTOR_ID = "d222bb63-c832-4889-89ae-cdf8a09b5cdb";

/**
 * Permissions that act on the whole ministry rather than one sector.
 * The "sector_admin" role gets every permission except these. The central admin may still
 * grant any of them to a sector user (e.g. sector:create), which lifts that restriction.
 */
const CENTRAL_ONLY_PERMISSIONS = [
  // Managing the sectors themselves
  "sector:create",
  "sector:update",
  "sector:delete",
  "sector_head:delegate",
  "sector_head:relegate",
  "sector_head:update",
  // Turning permissions on/off system-wide
  "permissions:update",
  // Shared reference data, used by every sector
  "admin_areas:create",
  "admin_areas:update",
  "admin_areas:delete",
  "minerals:create",
  "minerals:update",
  // Plan Management System integration (ministry-wide for now)
  "inspection_analytics:read",
];

module.exports = { ROOT_SECTOR_ID, MOM_SECTOR_ID, GIE_SECTOR_ID, MIDI_SECTOR_ID, CENTRAL_ONLY_PERMISSIONS };
