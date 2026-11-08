# License list

`license-list.xlsx` is the Ministry's license inspection list: companies, license numbers, license types, minerals, issue dates, region, zone and woreda.

## How it is loaded

- **`npm run seed`** imports this file automatically, through `seeders/20261108140000-seed-license-list.js`. Running it again is safe. Licenses already in the database are skipped, so only rows that are new in the sheet are added, and edits made in the app are never overwritten.
- **`npm run import:licenses -- "<file.xlsx>" [--dry-run]`** imports another file on demand. With `--dry-run` it shows what would happen and saves nothing.

Each import writes a report of rows to review to `backend/reports/`. That folder is not in git. Most rows in the report are locations the importer was not sure about. The license is then linked to its zone or region until someone confirms the woreda.

## Updating the list

Replace `license-list.xlsx` with the new version and run `npm run seed` again. Keep these columns on the first sheet, with the header on row 1:

| B | C | D | E | F | G | H | I | N |
|---|---|---|---|---|---|---|---|---|
| Company | Type of License | License no. | Mineral | Issue date | Region | Zone | Woreda | Comment |

Issue dates can be Excel dates, `dd/mm/yyyy` or `Month d, yyyy`. If a date can't be read, the text is kept as a date note on the license.

The file contains company and staff names. Keep the repository private.
