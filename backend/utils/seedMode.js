"use strict";

/**
 * Seeders run on every container start (docker-start.sh). Accounts with the known password
 * "password" (demo users, password resets) are only allowed outside production, or when
 * explicitly switched on with SEED_DEV_PASSWORDS=true / SEED_USERS=true — the same rule as
 * services/licenseImportService.js.
 */
const devAccountsAllowed = () =>
  process.env.SEED_DEV_PASSWORDS === "true" || process.env.SEED_USERS === "true" || process.env.NODE_ENV !== "production";

module.exports = { devAccountsAllowed };
