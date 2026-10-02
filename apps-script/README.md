# Website Generator — Google Apps Script edition

The contact-sheet dashboard and the job ledger, running on Google Apps Script with a Google Sheet as the database. Nothing has to run on your computer to see progress: the dashboard is a web app URL you can open anywhere, and the ledger is a spreadsheet you can browse.

The Codex agents still do the real work — discovery, qualification, building, deploying and outreach — with the same tools as before. They write progress to the Sheets ledger through `tools/sheets_ledger.py`, which takes exactly the same commands as `tools/control.py`.

| | Local version | Apps Script version |
|---|---|---|
| Ledger | `data/revamp.sqlite3` | A Google Sheet, one tab per table |
| Ledger rules | `tools/control.py` | `src/Ledger.gs` — the same stages, deduplication, capacity and single-submission rules |
| Dashboard | `http://localhost:4310` (`control.py serve`) | The web app URL |
| Agent commands | `python tools/control.py …` | `python tools/sheets_ledger.py …` (same arguments) |
| Discovery, builds, deploys, outreach | Codex agents + `tools/` | unchanged |

## Files

| File | What it does |
|---|---|
| `src/Code.gs` | Web app entry points: the dashboard (`doGet`), the agent API (`doPost`), dashboard endpoints, access checks, `setup()` and the sheet menu |
| `src/Ledger.gs` | The ledger rules, ported from `tools/control.py` |
| `src/Store.gs` | Google Sheets storage: plain-text cells, the script lock, the change counter dashboards poll |
| `src/Index.html`, `src/Styles.html`, `src/App.html` | The dashboard |
| `src/appsscript.json` | The project manifest |
| `dev/`, `test/` | A local emulator for previewing and testing without Google |

## Set up (about 10 minutes)

1. **Create the sheet and its script.** Make a new Google Sheet (for example *Website Generator Ledger*), then choose **Extensions → Apps Script**.
2. **Add the code.** In the Apps Script editor, replace the contents of `Code.gs` with `src/Code.gs`. Add two more script files named `Ledger` and `Store` (**+ → Script**) and three HTML files named `Index`, `Styles` and `App` (**+ → HTML**), pasting in the matching files from `src/`. In **Project Settings**, tick **Show "appsscript.json" manifest file in editor**, then paste in `src/appsscript.json`.
   *Prefer the command line?* See [Using clasp](#using-clasp) below.
3. **Run setup.** In the editor toolbar choose `setup`, click **Run** and approve the permissions. It creates the ledger tabs, checks that Sheets keeps values as plain text, and generates the agent token and the dashboard key. Reload the spreadsheet: a **Website Generator** menu appears.
4. **Deploy the web app.** **Deploy → New deployment → Select type → Web app**. Set **Execute as: Me** and **Who has access: Anyone**, then **Deploy** and copy the **Web app URL** (it ends in `/exec`).
5. **Connect the agents.** Add these lines to the project's `.env` file:

   ```
   REVAMP_SHEETS_URL=https://script.google.com/macros/s/…/exec
   REVAMP_SHEETS_TOKEN=…
   ```

   Get the token from the sheet: **Website Generator → Show agent API token**. Then check the connection:

   ```bash
   python tools/sheets_ledger.py ping
   ```

6. **Open the dashboard.** Visit the web app URL. The first time, it asks for the dashboard key: **Website Generator → Show dashboard key**. The key is remembered on that device until you click the lock icon in the top bar.
7. **Optional: bring your existing history.** If you already ran batches with the local ledger, copy it in before starting new ones, so already-contacted businesses stay deduplicated:

   ```bash
   python tools/sheets_ledger.py migrate
   ```

   It only imports into an empty Sheets ledger, and copies batches, jobs, identities, events, workers, submissions and settings.

### Updating the code later

Saving in the editor does **not** change the live web app. After editing, choose **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. The URL stays the same.

### Using clasp

```bash
npm install -g @google/clasp
clasp login
```

Copy `apps-script/.clasp.json.example` to `apps-script/.clasp.json`, put in your script ID (**Project Settings → IDs**), then run `clasp push` from the `apps-script` folder. `.clasp.json` is git-ignored.

## Using it

The batch workflow is unchanged; only the ledger command differs. With `REVAMP_SHEETS_URL` set, agents run, for example:

```bash
python tools/sheets_ledger.py state
```

```bash
python tools/sheets_ledger.py claim --batch BATCH_ID --worker builder-JOB_ID
```

The dashboard shows:

- **Summary tiles** for outreach sent against the target, work in progress, live previews, manual outreach still to send, and anything that needs attention. Click a tile to filter.
- **Batches**, each with progress. Click one to scope the whole dashboard to it, copy its run prompt for Codex, or cancel it.
- **Workers**, with a warning when one hasn't reported for more than two minutes.
- **Businesses** as cards or a table, with search, sorting and status filters. Skipped businesses have their own filter, so they no longer crowd *Needs attention*.
- **Business details**: pipeline progress, qualification evidence, links, and the complete activity history.
- **Manual outreach**: the verified email and phone, the prepared message with copy buttons, and **Mark as sent** so the to-do list shrinks as you work through it. Marking only updates the ledger; nothing is sent from the dashboard.
- **New batch**, which hands you a ready-to-paste Codex prompt once the batch is queued. Queued batches still wait for you to ask Codex to run them.

Light and dark themes follow your system, and the toggle in the top bar overrides it.

## Access and security

- The web app runs as you, and *Anyone* access lets the agents call it without a Google sign-in. Nobody gets data without a secret or an allowed Google account:
  - **Agents** must send `REVAMP_API_TOKEN`. It gives full ledger access, so keep it in `.env` only.
  - **The dashboard** asks for `REVAMP_DASHBOARD_KEY` unless Google identifies the visitor as you or as someone listed in `REVAMP_DASHBOARD_USERS`. To list people, open **Project Settings → Script properties** and enter comma-separated emails, or `@yourcompany.com` for a whole Workspace domain. Google only reveals a visitor's identity to "execute as me" web apps for the owner and for users in the same Workspace domain. Everyone else uses the key.
- Dashboard viewers can read everything, queue batches, cancel batches (a reason is recorded), and mark manual outreach as sent. They can't change job stages, reserve submissions or send messages.
- Replace a secret from the sheet menu: **Replace agent API token…** or **Replace dashboard key…**.
- The ledger tabs warn before manual edits, because editing cells directly bypasses the safety checks.
- Setup and the secret-showing menu items refuse to run for web-app visitors.
- Workspace admins can disable *Anyone* web apps. If the Deploy dialog doesn't offer **Anyone**, ask your admin, or set the script up under an account that allows it.

## Differences from the local version

- There are no local `/preview/…` pages for generated sites. Use the deployed preview links.
- Each agent command takes a second or two, because it's an Apps Script round trip. Writes are serialized with a script lock, which gives the same guarantees as SQLite's immediate transactions.
- The dashboard checks for changes every 4 seconds (every 30 seconds in a background tab), and only re-reads the sheet when something has changed.
- Apps Script and Sheets quotas apply. A sheet cell holds at most 50,000 characters, and the ledger refuses larger values rather than cutting them off.

## Develop and test locally

The emulator runs the real `src/*.gs` code on in-memory stand-ins for the Google services:

```bash
node apps-script/dev/server.mjs --demo
```

Open http://127.0.0.1:8787. Add `?as=anonymous` to see the lock screen as a visitor would. The agent API is served at `http://127.0.0.1:8787/exec`, and the server prints a local-only token, so you can try `tools/sheets_ledger.py` against it. The data resets when the server stops.

```bash
node --test apps-script/test/ledger.test.mjs
```

```bash
python -m unittest tests.test_sheets_ledger
```
