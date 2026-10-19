# t-WestsideStaff · Staff Meal Orders

Calendar-driven display for staff meal orders. Pick a day on the left, see each restaurant's
dishes and quantities on the right. On a computer you can also edit orders, import days from a
screenshot of the order sheet, and sync so everyone else sees the same data.

Built the same way as t-sandwich: React + Vite front end, Netlify serverless functions, Netlify
Blobs for shared storage, key-gated access.

## Access model

Order data is **not** in the front-end bundle. It is served by `netlify/functions/orders.mjs`,
which compares the caller's key against the `WSH_KEY` environment variable before returning
anything.

- Open the site and type the key into the gate, or
- share a link with the key in it: `https://<site>/?key=YOUR_KEY`. The app strips the key from
  the address bar on load and keeps it in `sessionStorage` for that tab only.

One key does everything (view, edit, import, sync). Treat it like a password.

## What you can do

| Action | Desktop | Mobile |
|---|---|---|
| Browse the calendar, view any day's restaurants and dishes | yes | yes |
| Week summary, dishes-this-week tally, print a day sheet | yes | yes |
| Edit dishes and quantities, add or remove restaurants and days | yes | no |
| Import from a screenshot | yes | no |
| Sync, restore an earlier version, export JSON | yes | no |

## Importing from a screenshot

Press **Import from image**, then paste (Ctrl+V), drop, or choose a screenshot. It is read in
the browser with Tesseract OCR and never uploaded. The sheet layout it expects:

```
Monday, 12 October 2026      date heading
Tamrab Thai                  restaurant
4 Veg Pad See Ew             quantity, then dish
16 Chicken Panang
```

- The date comes from the heading, so there is no week to pick. Accepted headings:
  `Monday, 12 October 2026`, `Mon 12 Oct`, `12 October 2026`, `Monday 12/10/2026`.
  If a screenshot has no heading at all, the fallback date in the dialog is used.
- A line starting with a number is a dish; any other line starts a new restaurant, so one day
  can hold several restaurants. `4x Dish` and `Dish x 4` are also understood. `Total` rows are ignored.
- Several days side by side (one column per day) or stacked are both handled.
- The review flags hard-to-read lines, a printed weekday that does not match the date, and
  days that already have an order (applying replaces the whole day).

Try the reader from Node: `node scripts/try-local-read.mjs [image]` (defaults to
`scripts/sample-order.png`).

## Local development

```bash
npm install
cp .env.example .env      # then set WSH_KEY
npm run dev
```

`npm run dev` serves `/api/*` from `dev-server/middleware.mjs` with the same handlers as the
Netlify functions, backed by `data/.local-store/` (git-ignored).

## Deploying to Netlify

1. Push this folder to its own GitHub repo.
2. In Netlify, "Add new site" > "Import an existing project" > pick the repo.
3. Build settings come from `netlify.toml`.
4. Site configuration > Environment variables: set `WSH_KEY`. Do **not** prefix it with `VITE_`.
5. Deploy. Netlify Blobs (store `staff-orders`) needs no setup.

## Data

`data/orders.json` is the seed, served until the first sync. Shape:

```json
{ "orders": { "2026-10-12": [ { "vendor": "Tamrab Thai", "items": [ { "name": "Chicken Panang", "qty": 16 } ] } ] } }
```

Every save is validated on the server (`YYYY-MM-DD` keys, names up to 120 characters,
whole-number quantities 0 to 9999). Blank dish lines left from editing are dropped on sync.
Each sync snapshots the version it replaced (last 40 kept), and a save made against a stale
version is rejected instead of overwriting someone else's work.
