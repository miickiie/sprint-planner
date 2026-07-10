# Quarterly Cockpit

Quarterly Cockpit is a single-page React application for planning sprint work on a
timeline while using Google Sheets as the backing store. Users sign in with
Google, create or connect a spreadsheet, then manage task priority, status,
duration, and start dates from a visual planner.

The app starts with a planning calendar from Q3 2026 through Q4 2027, with
14-day sprint increments that restart at `S1` in each quarter. Each planning quarter is stored
in its own Google Sheets tab, and users can add or remove quarter tabs from the
planner toolbar.

## What It Does

- Signs users in with Firebase Authentication and Google.
- Requests Google Sheets access with the
  `https://www.googleapis.com/auth/spreadsheets` scope.
- Creates a new Google spreadsheet with quarter tabs such as `Q3 2026` and
  `Q4 2026`, or connects to an existing spreadsheet ID.
- Reads and writes task data in the selected quarter tab.
- Migrates a legacy `Sprints` tab into quarter tabs and preserves the original
  as a hidden backup.
- Adds, edits, deletes, reorders, and reschedules tasks in the connected sheet.
- Shows a backlog and priority list with drag-and-drop sorting.
- Renders a D3 timeline with sprint markers, a today marker, percent-based zoom
  controls, and draggable task bars.
- Restarts sprint numbering for each quarter and allows the first sprint number
  to be adjusted from the `More` menu.
- Adds previous or next quarters as real Google Sheets tabs.
- Deletes a selected quarter and its Google Sheets tab after confirmation.
- Exports the current quarter and status-filtered task view as CSV.
- Opens a print-friendly planner snapshot for browser Save as PDF.
- Filters tasks by `All`, `In Progress`, and `Done`.
- Opens the backing Google Sheet for manual inspection or editing.

## Tech Stack

- Vite
- React 19
- TypeScript
- Tailwind CSS v4
- D3
- `@dnd-kit` for sortable task lists
- Firebase Authentication
- Google Sheets API
- lucide-react icons
- npm with `package-lock.json`

## Project Structure

```text
.
|-- .github/workflows/deploy.yml  # GitHub Pages deployment workflow
|-- index.html                    # Vite HTML entrypoint
|-- metadata.json                 # App metadata from the original starter
|-- package.json                  # npm scripts and dependencies
|-- tsconfig.json                 # TypeScript config
|-- vite.config.ts                # Vite config and dev server settings
`-- src
    |-- App.tsx                   # Auth state, spreadsheet setup, Sheets API calls
    |-- auth.ts                   # Firebase config, Google provider, access token cache
    |-- periods.ts                # Shared quarter dates, IDs, tab titles, and persistence
    |-- components
    |   `-- SprintPlanner.tsx     # Planner UI, D3 timeline, task parsing and editing
    |-- index.css                 # Tailwind import and global styles
    |-- main.tsx                  # React mount
    `-- vite-env.d.ts             # Vite client type declarations
```

There is no route configuration at the moment. The app mounts a single `<App />`
into `#root`.

## Data Model

Every planning quarter has a separate tab named `Q# YYYY`, for example
`Q3 2026`. Each quarter tab uses this header row:

| Column | Header | Meaning |
| --- | --- | --- |
| A | `Task Name` | Task title shown in the backlog and timeline |
| B | `Start Date` | Start date for the task |
| C | `Duration (Days)` | Duration in days |
| D | `Status` | Task status |

The app reads and writes `A:D` in the active quarter tab. Sheet titles are
quoted in A1 notation, for example `'Q3 2026'!A:D`.

When connecting an older spreadsheet with a `Sprints` tab, the app performs a
one-time migration:

1. Rows with valid start dates are copied to the planning quarter containing
   that date.
2. Rows without a valid start date are copied to the currently selected
   quarter, or `Q3 2026` by default.
3. Existing target rows are counted before copying so an interrupted migration
   can resume without duplicating rows.
4. After all copies succeed, `Sprints` is renamed to a unique
   `Sprints (legacy backup...)` title and hidden.

The hidden legacy tab is a backup only. Quarter tabs become the source of truth
after migration.

For existing sheets, the parser looks for header names using these keywords:

| Field | Header keywords |
| --- | --- |
| Task name | `task`, `name`, `activity` |
| Start date | `start` |
| Duration | `duration`, `days`, `sprint` |
| Status | `status`, `state`, `progress`, `category` |

Duration is stored in days. In the UI, sprint-based edits are saved as
`number of sprints * 14` days.

Recognized UI statuses are `In Progress` and `Done`. Missing task statuses
default to `In Progress`. Other status text from the sheet is preserved, but
only `Done` receives done-specific styling and filtering behavior.

## Planning Calendar

The planner starts with these default planning periods:

| Period | Start | End |
| --- | --- | --- |
| `Q3-26` | 2026-06-29 | 2026-09-27 |
| `Q4-26` | 2026-09-28 | 2027-01-03 |
| `Q1-27` | 2027-01-04 | 2027-03-28 |
| `Q2-27` | 2027-03-29 | 2027-06-27 |
| `Q3-27` | 2027-06-28 | 2027-09-26 |
| `Q4-27` | 2027-09-27 | 2028-01-02 |

The default active period is `Q3-26`.

The quarter controls include previous and next buttons. Adding a quarter creates
the matching Google Sheets tab, writes the standard headers, and selects it.
Deleting the selected quarter opens an in-app confirmation dialog and then
permanently deletes that Google Sheets tab and all rows stored in it. The last
remaining quarter cannot be deleted.

The ordered quarter list is stored in `localStorage` under
`sprintPlannerPeriodIds`, and the selected quarter is stored under
`sprintPlannerActivePeriodId`. Existing `sprintPlannerPeriodRange` data is
migrated into the new ordered list automatically.

Sprint numbering defaults to `S1` at the start of every quarter. The `First
sprint` setting in the `More` menu can assign a different starting number for
the selected quarter. Per-quarter values are stored locally under
`quarterlyCockpitSprintStartNumbers` and update timeline, tooltip, CSV, and PDF
labels.

Zoom is shown as a percentage. `100%` is the original default scale of
60 pixels per day, and the toolbar supports zooming from `10%` through `500%`.

## Prerequisites

- Node.js and npm. The GitHub Pages workflow uses Node 24, so Node 24 is the
  safest local match.
- A Firebase project with a web app.
- Google sign-in enabled in Firebase Authentication.
- Google Sheets API enabled for the Google Cloud project behind the Firebase
  project.
- A Google account that can grant spreadsheet access to the app.

## Firebase And Google Configuration

Create a local Vite environment file for development and set these variables:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_GOOGLE_CLIENT_ID=...
```

Do not commit local environment files or local Firebase config files.

The app also references a gitignored local fallback named
`firebase-applet-config.json`, but the recommended path for normal Vite
development is to use the `VITE_FIREBASE_*` variables above.

`VITE_GOOGLE_CLIENT_ID` must be a Google OAuth web client ID that is allowed to
request Google Sheets access from the app's origin.

## Google Sheets Access

The app requests this Google OAuth scope through Google Identity Services:

```text
scope: https://www.googleapis.com/auth/spreadsheets
```

Firebase Auth persists the signed-in user locally. Google Sheets access is kept
separate: the app uses Google Identity Services to request a Sheets bearer token
and keeps that token in memory only. After a refresh, Firebase restores the user
first, then the app attempts a silent Sheets token request. If Google cannot
issue a token silently, the app keeps the user signed in and shows the reconnect
screen.

The app performs these Sheets operations:

- `GET /v4/spreadsheets/{id}` to resolve exact quarter tab IDs and titles.
- `GET /v4/spreadsheets/{id}/values/'Q# YYYY'!A:D` to load a quarter.
- `POST /v4/spreadsheets` to create a spreadsheet with quarter tabs.
- `PUT /v4/spreadsheets/{id}/values/'Q# YYYY'!A1:D1` to initialize headers.
- `POST /v4/spreadsheets/{id}/values/'Q# YYYY'!A:D:append` to append tasks.
- `PUT /v4/spreadsheets/{id}/values/'Q# YYYY'!A{row}:D{row}` to update tasks.
- `POST /v4/spreadsheets/{id}:batchUpdate` to add/delete tabs and delete/move
  rows.

If an edit changes a task's start date into another quarter, the app appends the
updated row to the destination quarter first, deletes the source row second, and
then selects the destination quarter. Rows without valid start dates remain in
the selected quarter.

The requested spreadsheet scope is broad: it allows the app to read and write
Google Sheets that the signed-in user has access to. Use trusted deployments and
Firebase configuration only.

## Local Development

Install dependencies:

```bash
npm install
```

Start the Vite dev server:

```bash
npm run dev
```

The dev server is configured for port `3000` and host `0.0.0.0`, so the app is
available at:

```text
http://localhost:3000
```

If hot module replacement needs to be disabled in a specific environment, set:

```bash
DISABLE_HMR=true
```

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite on `0.0.0.0:3000` |
| `npm run build` | Build the static app into `dist` |
| `npm run preview` | Preview the production build with Vite |
| `npm run start` | Preview on `0.0.0.0:3000` |
| `npm run lint` | Run `tsc --noEmit` |
| `npm run clean` | Remove `dist` and `server.js` |

There is currently no automated test script in `package.json`.

## Running Against a Spreadsheet

1. Start the app locally.
2. Sign in with Google.
3. Create a new spreadsheet from the setup screen, or paste an existing
   spreadsheet ID.
4. Existing `Sprints` sheets are migrated automatically. Existing quarter tabs
   should use the columns shown in the data model above.
5. Add, edit, reorder, and reschedule tasks from the planner.

The selected spreadsheet ID is stored in `localStorage` under `spreadsheetId`.
Logging out removes this stored ID. Quarter order and active-quarter preference
use the separate keys described in Planning Calendar.

## Exporting

The toolbar includes CSV and PDF export actions.

- CSV exports the current active quarter, active status filter, and current task
  order. The exported columns are task name, start date, start sprint, end date,
  duration days, duration sprints, status, and source sheet row.
- PDF opens the browser print flow with a print-friendly planner snapshot. Use
  the browser's Save as PDF option to create the file.

## Deployment

The repository includes a GitHub Pages workflow at
`.github/workflows/deploy.yml`. It runs on pushes to `main` and by manual
workflow dispatch.

The workflow:

1. Checks out the repository.
2. Uses Node 24.
3. Runs `npm ci`.
4. Injects Firebase and Google OAuth values from GitHub secrets.
5. Runs `npm run build`.
6. Uploads `dist`.
7. Deploys to GitHub Pages.

Configure these repository secrets before deploying:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_GOOGLE_CLIENT_ID
```

`vite.config.ts` uses `base: './'`, which allows the static assets to resolve
from a GitHub Pages project path.

## Validation

After installing dependencies, run:

```bash
npm run lint
npm run build
```

`npm run lint` is TypeScript-only validation through `tsc --noEmit`. The project
does not currently include unit, integration, or end-to-end tests.

## Current Caveats

- The Google Sheets access token is cached only in memory. Refreshes can recover
  it silently when Google Identity Services allows it; otherwise users reconnect
  Sheets access without a full app logout.
- The default period seed, generated quarter cadence, and sprint anchor date are
  defined in `SprintPlanner.tsx`.
