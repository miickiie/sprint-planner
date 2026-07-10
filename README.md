# Sprint Planner

Sprint Planner is a single-page React application for planning sprint work on a
timeline while using Google Sheets as the backing store. Users sign in with
Google, create or connect a spreadsheet, then manage task priority, status,
duration, and start dates from a visual planner.

The app starts with a planning calendar from Q3 2026 through Q4 2027, with
14-day sprint increments anchored on 2026-06-29. Users can extend the visible
planning range by adding previous or next quarters from the toolbar.

## What It Does

- Signs users in with Firebase Authentication and Google.
- Requests Google Sheets access with the
  `https://www.googleapis.com/auth/spreadsheets` scope.
- Creates a new Google spreadsheet with a `Sprints` tab, or connects to an
  existing spreadsheet ID.
- Reads task data from `Sprints!A:D`.
- Adds, edits, deletes, reorders, and reschedules tasks in the connected sheet.
- Shows a backlog and priority list with drag-and-drop sorting.
- Renders a D3 timeline with sprint markers, a today marker, percent-based zoom
  controls, and draggable task bars.
- Adds generated previous or next quarters to the planning range.
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
    |-- components
    |   `-- SprintPlanner.tsx     # Planner UI, D3 timeline, task parsing and editing
    |-- index.css                 # Tailwind import and global styles
    |-- main.tsx                  # React mount
    `-- vite-env.d.ts             # Vite client type declarations
```

There is no route configuration at the moment. The app mounts a single `<App />`
into `#root`.

## Data Model

The default spreadsheet tab is named `Sprints`. New sheets are created with this
header row:

| Column | Header | Meaning |
| --- | --- | --- |
| A | `Task Name` | Task title shown in the backlog and timeline |
| B | `Start Date` | Start date for the task |
| C | `Duration (Days)` | Duration in days |
| D | `Status` | Task status |

The app reads and writes the range `Sprints!A:D`.

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

The quarter controls include previous and next buttons. Adding quarters expands
the generated range while preserving the current active period. The visible
quarter range is stored in `localStorage` under `sprintPlannerPeriodRange`.

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

- `GET /v4/spreadsheets/{id}/values/Sprints!A:D` to load tasks.
- `POST /v4/spreadsheets` to create a spreadsheet.
- `PUT /v4/spreadsheets/{id}/values/Sprints!A1:D1` to add headers.
- `POST /v4/spreadsheets/{id}/values/Sprints!A:D:append` to append tasks.
- `PUT /v4/spreadsheets/{id}/values/Sprints!A{row}:D{row}` to update tasks.
- `GET /v4/spreadsheets/{id}` to find the `Sprints` sheet ID.
- `POST /v4/spreadsheets/{id}:batchUpdate` to delete or move rows.

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
4. If using an existing spreadsheet, make sure it has a `Sprints` tab and
   columns that match the data model above.
5. Add, edit, reorder, and reschedule tasks from the planner.

The selected spreadsheet ID is stored in `localStorage` under `spreadsheetId`.
Logging out removes this stored ID. The generated quarter range is stored
separately under `sprintPlannerPeriodRange`.

## Exporting

The toolbar includes CSV and PDF export actions.

- CSV exports the current active quarter, active status filter, and current task
  order. The exported columns are task name, start date, end date, duration
  days, duration sprints, status, and source sheet row.
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
