# Website Generator — Google Apps Script edition

The contact-sheet dashboard and the job ledger, running on Google Apps Script with a Google Sheet as the database. Nothing has to run on your computer to see progress: the dashboard is a web app URL you can open anywhere, and the ledger is a spreadsheet you can browse.

Claude Code still does the real work. It finds and qualifies businesses with the same tools as before (and, in `vercel` mode, deploys and asks you to approve each outreach message). It writes progress to the Sheets ledger through `tools/sheets_ledger.py`, which takes exactly the same commands as `tools/control.py`.

**Generate buttons** build a website for one business. The dashboard records the request in the sheet. The website generator on your computer (`tools/site_runner.py watch`) picks it up and does the rest:

1. Reads the business's current site with Firecrawl.
2. Has Claude Code write a new one-page website from the real content.
3. Checks the page.
4. Uploads it to JetAI as a draft prototype.

The dashboard shows each step as it happens.

| | Local version | Apps Script version |
|---|---|---|
| Ledger | `data/revamp.sqlite3` | A Google Sheet, one tab per table |
| Ledger rules | `tools/control.py` | `src/Ledger.gs` — the same stages, deduplication, capacity and single-submission rules |
| Dashboard | `http://localhost:4310` (`control.py serve`) | The web app URL |
| Agent commands | `python tools/control.py …` | `python tools/sheets_ledger.py …` (same arguments) |
| Discovery, builds, deploys, outreach | Claude Code + `tools/` | unchanged |
| Generate buttons | built into `control.py serve` | `python tools/site_runner.py watch` on your computer |

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
8. **Start the website generator** (for Generate buttons), on the computer where Claude Code is installed:
   1. Put `FIRECRAWL_API_KEY` and `JETAI_API_KEY` in `.env`. Uploads go to `jetai.api_base` in `settings.json`.
   2. Sign Claude Code in once. `python tools/site_runner.py doctor` prints the exact `claude auth login` command when it isn't signed in. The Claude desktop app's sign-in doesn't carry over to the command-line tool.
   3. Run `python tools/site_runner.py doctor` again. It should report no problems.
   4. Start the generator. On Windows, double-click **Start Generator.bat**; anywhere, run:

   ```bash
   python tools/site_runner.py watch
   ```

   Leave it running. The dashboard's **Website generator** panel shows whether it is connected, and requests made while it is off wait until it starts.

### Updating the code later

Saving in the editor does **not** change the live web app. After editing, choose **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. The URL stays the same. Update all six `src/` files together. The Generate buttons, the **Add website** dialog and the generator panel need the current `Code.gs`, `Ledger.gs` and dashboard files.

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

- **Summary tiles** for finished websites against the target, targets not built yet, work in progress, manual outreach still to send, and anything that needs attention. Click a tile to filter.
- **Targets**: businesses waiting to be built, each with a **Generate website** button. A requested one shows *Waiting for the generator* until the website generator picks it up. It then moves through Qualify → Build → QA → Delivered. A delivered website shows its file and its JetAI prototype.
- **Add website**: type a business name and its current website address. It goes on the *Hand-picked websites* list, or on a batch you choose, and with *Generate the website now* ticked it is built right away. The same website, phone or email can't be added twice.
- **Website generator** panel: whether the generator on your computer is connected, ready, busy or needs setup (for example when Claude Code isn't signed in), with the command that starts it.
- **Batches**, each with progress. Click one to scope the whole dashboard to it, copy its run prompt for Claude Code, or cancel it.
- **Workers**, with a warning when one hasn't reported for more than two minutes.
- **Businesses** as cards or a table, with search, sorting and status filters. Skipped businesses have their own filter, so they no longer crowd *Needs attention*. Websites delivered as single HTML files (the current `delivery: file` setting) show as **Delivered**, with the file's location in their details.
- **Business details**: pipeline progress, qualification evidence, links, and the complete activity history.
- **Manual outreach**: the verified email and phone, the prepared message with copy buttons, and **Mark as sent** so the to-do list shrinks as you work through it. Marking only updates the ledger; nothing is sent from the dashboard.
- **New batch**, which hands you a ready-to-paste Claude Code prompt once the batch is queued. Queued batches wait until you paste that prompt into Claude Code, opened in the project folder. Choose **Only find targets** to have Claude Code list qualified businesses without building them; you then press Generate on the ones you want.

Light and dark themes follow your system, and the toggle in the top bar overrides it.

## Run on GitHub (no computer needed)

This works like Creator Lab's runner. Apps Script takes the orders: Generate presses, websites you add, and new batches. It then starts a job on GitHub Actions right away. The job:

- finds targets for new batches;
- builds the requested websites;
- uploads each one to JetAI as a draft;
- saves each finished page in your Google Drive, in a folder called *Website Generator websites*;
- reports progress to the dashboard.

Nothing has to run on your computer.

1. **Put the repository on GitHub and make it private.**
   - The workflow is `.github/workflows/website-generator.yml`; commit it with the rest of the code.
   - The runner's logs show only job IDs, but Actions logs of public repositories are public. Use **Settings → General → Change visibility**.
   - Private repositories get 2,000 free Actions minutes a month. A website takes roughly 5–15 minutes, and a run with nothing to do takes seconds.
2. **Add the repository secrets.** In the repository, open **Settings → Secrets and variables → Actions → New repository secret**:

   | Secret | Value |
   |---|---|
   | `REVAMP_SHEETS_URL` | The web app's `/exec` address, the same as in `.env` |
   | `REVAMP_SHEETS_TOKEN` | The agent API token, the same as in `.env` |
   | `FIRECRAWL_API_KEY` | Your Firecrawl key |
   | `JETAI_API_KEY` | Your JetAI key |
   | `ANTHROPIC_API_KEY` **or** `CLAUDE_CODE_OAUTH_TOKEN` | How Claude signs in. Either an API key from console.anthropic.com (billed per token), or a token you create once with `claude setup-token` on any computer (uses your Claude subscription) |

3. **Create a GitHub token for Apps Script.** It is used only to start the job.
   1. On GitHub, open **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   2. Under **Repository access**, choose **Only select repositories** and pick this repository.
   3. Under **Repository permissions**, set **Contents: Read and write**, then generate the token and copy it.
4. **Give it to Apps Script.** In the Apps Script editor, open **Project Settings → Script properties** and add:
   - `GITHUB_REPO`: `owner/name`, for example `MasahisaSekita/websitegenerator`;
   - `GITHUB_TOKEN`: the token.
5. **Update the code.** Add a script file named `Runner` (**+ → Script**) and paste `src/Runner.gs` into it. Paste the current `Code.gs`, `Ledger.gs`, `Index.html` and `App.html` too, then save.
6. **Switch it on.** In the ledger spreadsheet, choose **Website Generator → Run on GitHub (no computer needed)…**.
   - Approve the new permissions: connecting to GitHub, Drive for the website files, and the 10-minute safety trigger.
   - It sends a test start. A *Website generator* run appears in the repository's **Actions** tab and finishes quickly, because nothing is waiting.
7. **Deploy a new version:** **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**.

To test it, use **Add website** with *Generate the website now* ticked.
- The generator panel shows **On GitHub**, then **Building 1 website** within about a minute.
- The finished business gets a Google Drive link and a JetAI draft.
- If GitHub refuses the start, the panel shows why (for example, a wrong token). The request waits, and the safety trigger tries again every 10 minutes.

To go back to a computer, choose **Website Generator → Run on a computer instead**.

**How target finding differs on GitHub.**
- **Search:** there is no browser, so it searches with Firecrawl and keeps only results 91–100, Google's page 10, for up to six variants of the query.
- **Screening:** it skips directories, social sites and businesses already in the ledger, and screens each remaining homepage with a Firecrawl screenshot.
- **Judging:** Claude decides from that screenshot whether the site looks weak, following `references/qualify-prompt.md`.
- **Limits:** it doesn't check sites on a phone, and it doesn't work through every city of a state. Queue one batch per city.

**Costs per batch.**
- Firecrawl: 20 credits per search, about 1–2 per site screened and 1–3 per website built.
- Claude: one short check per screened site and one longer build per website.
- GitHub: Actions minutes, as above.

## Access and security

- The web app runs as you, and *Anyone* access lets the agents call it without a Google sign-in. Nobody gets data without a secret or an allowed Google account:
  - **Agents** must send `REVAMP_API_TOKEN`. It gives full ledger access, so keep it in `.env` only.
  - **The dashboard** asks for `REVAMP_DASHBOARD_KEY` unless Google identifies the visitor as you or as someone listed in `REVAMP_DASHBOARD_USERS`. To list people, open **Project Settings → Script properties** and enter comma-separated emails, or `@yourcompany.com` for a whole Workspace domain. Google only reveals a visitor's identity to "execute as me" web apps for the owner and for users in the same Workspace domain. Everyone else uses the key.
- Dashboard viewers can read everything, queue batches, cancel batches (a reason is recorded), add websites, press Generate, and mark manual outreach as sent. Generate only records a request, and may start the GitHub job; the generator does the work with your own Claude, Firecrawl and JetAI accounts. Viewers can't change job stages, reserve submissions or send messages, and they never see the GitHub token, which stays in Script properties.
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
