"use strict";
/** License areas: coordinate conversion and where a GPS point is relative to an area (utils/geodesy.js). */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { dmsToDecimal, adindanToWgs84, inEthiopia, centerOf, positionInArea } = require("../utils/geodesy");
const { distanceMeters } = require("../services/geoService");
const { licenseKey } = require("../services/licenseCoordinatesService");
const { similarNames } = require("../services/personMatchService");

// A 0.1° square near Addis Ababa (about 11 km a side), [lng, lat]
const SQUARE = { type: "MultiPolygon", coordinates: [[[[38.7, 9.0], [38.8, 9.0], [38.8, 9.1], [38.7, 9.1], [38.7, 9.0]]]] };
// An L shape whose centre of mass lies outside it
const L_SHAPE = { type: "MultiPolygon", coordinates: [[[[0, 0], [10, 0], [10, 1], [1, 1], [1, 10], [0, 10], [0, 0]]]] };

describe("coordinates", () => {
  it("reads degrees, minutes and seconds", () => {
    assert.ok(Math.abs(dmsToDecimal(13, 58, 44.46) - 13.97901667) < 1e-7);
    assert.equal(dmsToDecimal("", "", ""), null);
  });

  it("shifts Adindan to WGS 84 by the expected 100–200 m in Ethiopia", () => {
    for (const [lat, lng] of [[13.979, 39.793], [10.13, 34.71], [5.0, 39.0]]) {
      const [a, b] = adindanToWgs84(lat, lng);
      const shift = distanceMeters(lat, lng, a, b);
      assert.ok(shift > 100 && shift < 200, `shift ${shift} m at ${lat}, ${lng}`);
    }
  });

  it("recognises typed coordinates outside Ethiopia", () => {
    assert.equal(inEthiopia(9.0, 38.7), true);
    assert.equal(inEthiopia(6.318, 5.227), false); // the typo in MOM\LSML\10107\2025
  });
});

describe("where the inspector is", () => {
  it("inside the area", () => {
    const p = positionInArea(9.05, 38.75, SQUARE);
    assert.equal(p.inside, true);
    assert.ok(Math.abs(p.distance_m - 5500) < 100); // ~5.5 km to the nearest edge
  });

  it("outside the area, with the distance to it", () => {
    const p = positionInArea(9.05, 38.85, SQUARE); // 0.05° east of the east edge
    assert.equal(p.inside, false);
    assert.ok(Math.abs(p.distance_m - 5500) < 100);
  });

  it("puts the centre inside odd shapes", () => {
    const c = centerOf(L_SHAPE);
    assert.equal(positionInArea(c.lat, c.lng, L_SHAPE).inside, true);
  });
});

describe("matching the license list", () => {
  it("matches license numbers however they are written", () => {
    const key = licenseKey("MOM\\EL\\00201\\2022");
    for (const v of ["MOM\\EL\\00201\\2022.", "mom/el/00201/2022", " MOM\\EL\\00201\\2022\" "]) assert.equal(licenseKey(v), key);
    assert.notEqual(licenseKey("MOM\\SSML\\73\\2011"), licenseKey("MOM\\LSML\\73\\2011"));
  });

  it("takes small spelling differences in names to be the same person, but not different people", () => {
    assert.equal(similarNames("Ashenef Kahsye", "Ashenafi Kahsye"), true);
    assert.equal(similarNames("Dereje Gebretsadek", "Dereje Gebretsadik"), true);
    assert.equal(similarNames("Demke Assefa", "Tagel Assefa"), false);
    assert.equal(similarNames("Asefa Adugna", "Birhanu Adugna"), false);
  });
});
