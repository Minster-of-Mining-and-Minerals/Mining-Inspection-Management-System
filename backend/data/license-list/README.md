# License list

Two files from the Ministry:

- **`license-list.xlsx`**: the license inspection list. It has companies, license numbers, license types, minerals, issue dates, region, zone and woreda, team and members, comment, and travel (car or plane, and the airport). Current version: *Final License Inspection List 11/10/26*.
- **`license-coordinates.xlsx`**: the corner points of every license area (degrees, minutes, seconds; Adindan datum). Converted unchanged from *Long and Latitude of inspection sites.xls*: the app's Excel reader can't open the old `.xls` format.

The license list decides who, what and which team. The coordinate list decides where. A license's woreda, zone and region come from its surveyed area. Only a license missing from the coordinate list keeps the location typed in the license list.

## How they are loaded

- **`npm run seed`** adds what is new in `license-list.xlsx` automatically, on every start (`seeders/20261108140000-seed-license-list.js`).
  - It never changes existing licenses or moves them between teams.
  - Licenses it adds get their surveyed area from `license-coordinates.xlsx`.
- **`npm run import:licenses -- --update --dry-run`** shows everything a new list would change. Nothing is saved; the report lists every change.
- **`npm run import:licenses -- --update`** applies those changes:
  - license details, travel and comments
  - teams: RED ZONE licenses get no team
  - team members
  - locations and areas from the coordinate list
  - tasks not yet started move to the license's new team

  Run it with `--dry-run` first. The rules are in `services/licenseListUpdateService.js`.
- **`npm run import:licenses -- "<file.xlsx>" [--dry-run]`** adds from another file.

Each run writes a report to `backend/reports/`, which is not in git.

## Updating

1. Replace the file(s), keeping the same columns.
2. Run the update with `--dry-run` and read the report.
3. Run it again without `--dry-run`.

License list columns (first sheet, header on row 1):

| B | C | D | E | F | G | H | I | J | K–M | N | O | P |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Company | Type of License | License no. | Mineral | Issue date | Region | Zone | Woreda | Team | Members | Comment | Traveling By | Airport |

Coordinate list columns: B company · C license number (on the license's first row) · D spatial reference · E part · F order · G–I latitude d/m/s · J–L longitude d/m/s.

Issue dates can be Excel dates, `dd/mm/yyyy` or `Month d, yyyy`. If a date can't be read, the text is kept as a date note on the license.

Known problems, listed in every report until fixed in the source files:

- Two coordinate points lie outside Ethiopia. They are typing errors, so they are left out:
  - `MOM\LSML\10107\2025`, Part 1, point 7
  - `MOM\LSML\2027\2021`, Part 2, point 3
- Two pairs don't match between the files: `MOM\EL\00114\2023` vs `MOM\EL\00133\2024` (KEFI), and `MOM\LSML\73\2011` vs `MOM\SSML\73\2011` (Derba).

The files contain company and staff names. Keep the repository private.
