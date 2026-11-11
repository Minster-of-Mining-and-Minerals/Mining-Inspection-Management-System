# Ethiopia administrative areas

`eth-admin-areas.json.gz` holds Ethiopia's regions, zones and woredas, with their official P-codes, alternative names and simplified boundaries. The seeder `seeders/20261108100000-seed-admin-areas.js` loads it into the `admin_areas` and `area_aliases` tables.

## Source and licence

- **Dataset:** Ethiopia – Subnational Administrative Boundaries (COD-AB), version v04, valid from 2025-01-01. It includes the Central Ethiopia and South Ethiopia regions.
- **Published by:** OCHA on the Humanitarian Data Exchange, https://data.humdata.org/dataset/cod-ab-eth
- **Original source:** Central Statistics Agency (CSA) and the Regional Bureaus of Finance and Economic Development (BoFED)
- **Licence:** Creative Commons Attribution for Intergovernmental Organisations (CC BY-IGO). Keep this attribution wherever the data is shown or redistributed.

## How the file is made

The boundaries are simplified with Douglas–Peucker at about 55 m tolerance, which cuts about 1.19 million points to about 322 thousand. That is accurate enough to tell whether a GPS point is inside a woreda.

To rebuild it from a new COD-AB release, download the GeoJSON zip, unzip it, then run:

```bash
node scripts/build-admin-areas.js <folder containing eth_admin1.geojson, eth_admin2.geojson, eth_admin3.geojson>
npm run seed:only -- 20261108100000-seed-admin-areas.js
```

Re-seeding updates boundaries and versions by P-code. It keeps the names, Amharic names, active flags and aliases that were edited in the app.

## Ethiopia's outline for the maps

`frontend/public/maps/ethiopia-outline.json` is the same data with the regions merged into one border and simplified to about 500 m (461 points). The maps use it to grey out everything outside Ethiopia. Rebuild it after updating the boundaries:

```bash
npm i --no-save polygon-clipping && node scripts/build-country-outline.js
```

The same source and licence apply (OCHA COD-AB, CC BY-IGO).
