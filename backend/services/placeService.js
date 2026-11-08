/**
 * The place name of a GPS point: woreda, zone and region from the official boundaries
 * (admin_areas). Used to name where an inspection was submitted.
 */
const { AdminArea } = require("../models");
const { findWoredasAt } = require("./geoService");

/** @returns {Promise<{ woreda, zone, region, area_id, label } | { outside: true, label }>} */
const placeOf = async (lat, lng) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const [woreda] = await findWoredasAt(lat, lng);
  if (!woreda) return { outside: true, label: "Outside the known woredas" };
  const zone = woreda.parent_id ? await AdminArea.findByPk(woreda.parent_id, { attributes: ["area_id", "name", "parent_id"] }) : null;
  const region = zone?.parent_id ? await AdminArea.findByPk(zone.parent_id, { attributes: ["area_id", "name"] }) : null;
  return {
    area_id: woreda.area_id,
    woreda: woreda.name,
    zone: zone?.name ?? null,
    region: region?.name ?? null,
    label: [woreda.name, zone?.name, region?.name].filter(Boolean).join(", "),
  };
};

module.exports = { placeOf };
