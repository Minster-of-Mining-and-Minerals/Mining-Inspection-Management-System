# License list

Three files from the Ministry:

- **`license-list.xlsx`**: the license inspection list. It has companies, license numbers, license types, minerals, issue dates, region, zone and woreda, team and members, comment, and travel (car or plane, and the airport). Current version: *Final License Inspection List 11/10/26*.
- **`team-contacts.xlsx`**: the team members' real email and phone (the "Inspection Team" Google Form responses, converted from the CSV export). Phones typed with 8 digits, without their leading 9, are corrected in this copy (+2519…).
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

## Team contacts

- **`npm run seed`** and **`npm run import:licenses -- --update`**: a person named in the license list who has no account yet gets one with their email and phone from `team-contacts.xlsx`, the inspector role and their team. This happens on a server too. The temporary password is `password`, to change at the first login. People not in the sheet (now Seid Wehawrebe) get a generated email, `firstname.lastname@gmail.com`, also on a server; replace it with their real email on the Users page. Accounts that already exist are never changed by these commands. `--contacts="<sheet.xlsx>"` uses another sheet.
- **Every `npm run seed`** (every container start) also applies the sheet to accounts nobody has used yet (still on the temporary password), and creates an inspector account, with no team, for anyone in the sheet who has none (now Birtukan Yenealem).
- **`npm run import:team-contacts -- --dry-run`**, then the same without `--dry-run`, updates the email and phone of all matching accounts, including accounts in use, and creates the missing ones (`--no-create` to skip that). You can pass another sheet as the first argument.
- Every team member is a team leader; new members are leaders by default.

Names are matched allowing spelling differences and extra name parts ("Fitsume Kucha Dewelle" matches Fitsum Kucha). Only the email (which is the login) and the phone change. The rules are in `services/teamContactsService.js`.
