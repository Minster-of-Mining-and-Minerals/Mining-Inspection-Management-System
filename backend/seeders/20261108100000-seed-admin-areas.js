"use strict";
/**
 * Loads the official Region → Zone → Woreda list (OCHA COD-AB Ethiopia,
 * CSA + Regional BoFED, CC BY-IGO) from data/admin-areas/eth-admin-areas.json.gz.
 *
 * Safe to re-run, e.g. after rebuilding the data file for a new COD-AB version:
 *   - new areas are added;
 *   - existing areas (matched by P-code) get the new boundary, parent and version;
 *   - names, Amharic names and active flags edited in the app are kept;
 *   - the dataset's alternative names are added as aliases if missing.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { v4: uuidv4 } = require("uuid");
const { normalizeAreaName } = require("../utils/areaNames");

const DATA_FILE = path.join(__dirname, "..", "data", "admin-areas", "eth-admin-areas.json.gz");
const BATCH = 100;
const LEVEL_ORDER = ["region", "zone", "woreda"];

module.exports = {
  async up(queryInterface, Sequelize) {
    const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(DATA_FILE)));
    const transaction = await queryInterface.sequelize.transaction();
    const now = new Date();
    try {
      // pcode -> area_id, for rows already in the database and rows added below
      const existing = await queryInterface.sequelize.query(
        "SELECT area_id, pcode FROM admin_areas WHERE pcode IS NOT NULL",
        { type: Sequelize.QueryTypes.SELECT, transaction },
      );
      const idOf = new Map(existing.map((r) => [r.pcode, r.area_id]));

      for (const level of LEVEL_ORDER) {
        const rows = data.areas.filter((a) => a.level === level);
        for (let i = 0; i < rows.length; i += BATCH) {
          const batch = rows.slice(i, i + BATCH);
          const values = [];
          const replacements = {};
          batch.forEach((a, j) => {
            if (!idOf.has(a.pcode)) idOf.set(a.pcode, uuidv4());
            const k = `${i + j}`;
            Object.assign(replacements, {
              [`id${k}`]: idOf.get(a.pcode),
              [`parent${k}`]: a.parent_pcode ? idOf.get(a.parent_pcode) : null,
              [`level${k}`]: a.level,
              [`pcode${k}`]: a.pcode,
              [`name${k}`]: a.name,
              [`clat${k}`]: a.center ? a.center[1] : null,
              [`clng${k}`]: a.center ? a.center[0] : null,
              [`minlng${k}`]: a.bbox ? a.bbox[0] : null,
              [`minlat${k}`]: a.bbox ? a.bbox[1] : null,
              [`maxlng${k}`]: a.bbox ? a.bbox[2] : null,
              [`maxlat${k}`]: a.bbox ? a.bbox[3] : null,
              [`sqkm${k}`]: a.area_sqkm,
              [`boundary${k}`]: a.boundary ? JSON.stringify(a.boundary) : null,
            });
            values.push(
              `(:id${k}, :parent${k}, :level${k}, :pcode${k}, :name${k}, 'official', :clat${k}, :clng${k},
                :minlat${k}, :minlng${k}, :maxlat${k}, :maxlng${k}, :sqkm${k}, CAST(:boundary${k} AS JSONB),
                :version, true, :now, :now)`,
            );
          });

          await queryInterface.sequelize.query(
            `INSERT INTO admin_areas
               (area_id, parent_id, level, pcode, name, source, center_lat, center_lng,
                min_lat, min_lng, max_lat, max_lng, area_sqkm, boundary, data_version, is_active, created_at, updated_at)
             VALUES ${values.join(",")}
             ON CONFLICT (pcode) DO UPDATE SET
               parent_id = EXCLUDED.parent_id,
               level = EXCLUDED.level,
               center_lat = EXCLUDED.center_lat,
               center_lng = EXCLUDED.center_lng,
               min_lat = EXCLUDED.min_lat,
               min_lng = EXCLUDED.min_lng,
               max_lat = EXCLUDED.max_lat,
               max_lng = EXCLUDED.max_lng,
               area_sqkm = EXCLUDED.area_sqkm,
               boundary = EXCLUDED.boundary,
               data_version = EXCLUDED.data_version,
               updated_at = EXCLUDED.updated_at`,
            { replacements: { ...replacements, version: data.version, now }, transaction },
          );
        }
      }

      // Official alternative names ("Kilbati /Zone 2" -> "Kilbati", "Zone 2"; "Kore" -> "Koore")
      const aliasRows = [];
      for (const a of data.areas) {
        for (const alias of a.alt_names) {
          const norm = normalizeAreaName(alias);
          if (!norm || norm === normalizeAreaName(a.name)) continue;
          aliasRows.push({
            alias_id: uuidv4(),
            area_id: idOf.get(a.pcode),
            alias,
            alias_normalized: norm,
            level: a.level,
            scope_parent_id: a.parent_pcode ? idOf.get(a.parent_pcode) : null,
          });
        }
      }
      for (const al of aliasRows) {
        await queryInterface.sequelize.query(
          `INSERT INTO area_aliases
             (alias_id, area_id, alias, alias_normalized, level, scope_parent_id, source, created_at, updated_at)
           VALUES (:alias_id, :area_id, :alias, :alias_normalized, :level, :scope_parent_id, 'official', :now, :now)
           ON CONFLICT (level, COALESCE(scope_parent_id, '00000000-0000-0000-0000-000000000000'), alias_normalized)
           DO NOTHING`,
          { replacements: { ...al, now }, transaction },
        );
      }

      await transaction.commit();
      const counts = data.areas.reduce((c, a) => ((c[a.level] = (c[a.level] || 0) + 1), c), {});
      console.log(`Admin areas (COD-AB ${data.version}):`, counts, `| official aliases: ${aliasRows.length}`);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    // Children first (parent_id is ON DELETE RESTRICT). Removes official areas only.
    await queryInterface.sequelize.query("DELETE FROM area_aliases WHERE source = 'official'");
    for (const level of ["woreda", "zone", "region"]) {
      await queryInterface.sequelize.query("DELETE FROM admin_areas WHERE source = 'official' AND level = :level", {
        replacements: { level },
      });
    }
  },
};
