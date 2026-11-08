/**
 * Point-in-area checks against the stored woreda boundaries (GeoJSON, lng/lat).
 * Used to tell whether an inspector's GPS position is inside a company's woreda.
 */
const { Op } = require("sequelize");
const { AdminArea } = require("../models");

/** Ray casting on one ring of [lng, lat] points. */
const pointInRing = (lng, lat, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** Inside a Polygon / MultiPolygon (outer ring in, not in a hole). */
const pointInGeometry = (lng, lat, geom) => {
  if (!geom) return false;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
  return polys.some(
    ([outer, ...holes]) => pointInRing(lng, lat, outer) && !holes.some((h) => pointInRing(lng, lat, h)),
  );
};

/** Great-circle distance in metres. */
const distanceMeters = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

/** Woreda(s) whose boundary contains the point (normally one). */
const findWoredasAt = async (lat, lng) => {
  const candidates = await AdminArea.scope("withBoundary").findAll({
    where: {
      level: "woreda",
      is_active: true,
      min_lat: { [Op.lte]: lat },
      max_lat: { [Op.gte]: lat },
      min_lng: { [Op.lte]: lng },
      max_lng: { [Op.gte]: lng },
    },
  });
  return candidates.filter((a) => pointInGeometry(lng, lat, a.boundary));
};

module.exports = { pointInGeometry, distanceMeters, findWoredasAt };
