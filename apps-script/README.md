# Website Generator — Google Apps Script edition

The contact-sheet dashboard and the job ledger, running on Google Apps Script with a Google Sheet as the database. The dashboard is a web app URL you can open anywhere, and the ledger is a spreadsheet you can browse.

**Who does the work:**

- **Generate buttons** build a website for one business:
  1. Read the business's current site with Firecrawl.
  2. Have Claude write a new one-page website from its real content.
  3. Check the page.
  4. Upload it to JetAI as a draft.

  This runs on **GitHub Actions** (recommended: no computer needs to stay on), or on a computer running the website generator.
- **Batches** find target businesses. On the GitHub runner, GitHub does this as soon as you queue the batch. Otherwise, Claude Code does it on your computer: it searches Google in a browser and screens each site. Claude Code writes its progress to the ledger through `tools/sheets_ledger.py`, which takes the same commands as `tools/control.py`.

| | Local version | Apps Script version |
|---|---|---|
| Ledger | `data/revamp.sqlite3` | A Google Sheet, one tab per table |
| Ledger rules | `tools/control.py` | `src/Ledger.gs`, with the same stages, deduplication, capacity and single-submission rules |
| Dashboard | `http://localhost:4310` (`control.py serve`) | The web app URL |
| Agent commands | `python tools/control.py …` | `python tools/sheets_ledger.py …` (same arguments) |
| Generate buttons | Built into `control.py serve` | GitHub Actions, or `python tools/site_runner.py watch` on a computer |
| Finding targets | Claude Code on your computer | GitHub Actions, or Claude Code on your computer |

## Files

| File | What it does |
|---|---|
| `src/Code.gs` | Web app entry points: the dashboard (`doGet`), the agent API (`doPost`), dashboard endpoints, access checks, `setup()` and the sheet menu |
| `src/Ledger.gs` | The ledger rules, ported from `tools/control.py` |
| `src/Store.gs` | Google Sheets storage: plain-text cells, the script lock, the change counter dashboards poll |
| `src/Runner.gs` | Starts the GitHub Actions job when work arrives, re-sends lost starts, and stores finished websites in Drive |
| `src/Index.html`, `src/Styles.html`, `src/App.html` | The dashboard |
| `src/appsscript.json` | The project manifest |
| `dev/`, `test/` | A local emulator for previewing and testing without Google |
| `../.github/workflows/website-generator.yml` | The GitHub Actions job (see [Run on GitHub](#run-on-github-no-computer-needed)) |

## Set up (about 15 minutes)

1. **Create the sheet and its script.** Make a new Google Sheet (for example *Website Generator Ledger*), then choose **Extensions → Apps Script**.
2. **Add the code.** The Apps Script editor has a **Files** list with a **+** button.
   - Replace the contents of `Code.gs` with `src/Code.gs`.
   - Add three more script files (**+ → Script**) named `Ledger`, `Store` and `Runner`.
   - Add three HTML files (**+ → HTML**) named `Index`, `Styles` and `App`.
   - Type the names without an extension; the editor adds `.gs` or `.html`.
   - Paste each matching file from `src/` into it, replacing everything the editor put there.
   - In **Project Settings** (⚙), tick **Show "appsscript.json" manifest file in editor**. Then open `appsscript.json` and replace its contents with `src/appsscript.json`.
   - Save. The Files list should show exactly `appsscript.json`, `Code.gs`, `Ledger.gs`, `Store.gs`, `Runner.gs`, `Index.html`, `Styles.html` and `App.html`.

   *Prefer the command line?* See [Using clasp](#using-clasp).
3. **Run setup.** In the editor toolbar, choose `setup` and click **Run**.
   - The first time, Google asks you to authorize the script: **Review permissions**, choose your account, then **Advanced → Go to … (unsafe)** → **Allow**. That warning is normal for your own scripts.
   - It asks for the spreadsheet, plus three permissions the GitHub runner uses: connecting to an external service (GitHub), Drive (for the website files) and running on a schedule (the safety trigger).
   - Google shows a checkbox for each permission. Tick **Select all**: the GitHub runner fails if any of them is left out.
   - Setup creates the ledger tabs, checks that Sheets keeps values exactly as written, and generates the agent token and the dashboard key. It takes about 10–30 seconds.
   - The execution log ends with `Ledger ready: …`. Reload the spreadsheet: a **Website Generator** menu appears.
4. **Deploy the web app.** Choose **Deploy → New deployment → Select type → Web app**. Set **Execute as: Me** and **Who has access: Anyone**, then click **Deploy** and copy the **Web app URL**, which ends in `/exec`.
5. **Connect your computer** (where you use Claude Code). Add these lines to the `.env` file in the project folder:

   ```
   REVAMP_SHEETS_URL=https://script.google.com/macros/s/…/exec
   REVAMP_SHEETS_TOKEN=…
   ```

   Get the token from the sheet: **Website Generator → Show agent API token**. The box shows the complete line, ready to copy. Then check the connection from a terminal opened in the project folder:

   ```bash
   python tools/sheets_ledger.py ping
   ```

   It answers `"pong": true`. On Windows, open PowerShell first and run the command inside it; started from **Win+R**, the window closes before you can read the result. See [Troubleshooting](#troubleshooting) if `python` prints "Python was not found".
6. **Open the dashboard.** Visit the web app URL. The first time, it asks for the dashboard key: **Website Generator → Show dashboard key**. The key is remembered on that device until you click the lock icon in the top bar.
7. **Optional: bring your existing history.** If you already ran batches with the local ledger, copy it in before starting new ones, so already-contacted businesses stay deduplicated:

   ```bash
   python tools/sheets_ledger.py migrate
   ```

   It only imports into an empty Sheets ledger, and copies batches, jobs, identities, events, workers, submissions and settings.
8. **Choose where websites are built:**
   - **[On GitHub](#run-on-github-no-computer-needed)** (recommended). Nothing has to stay on; set it up once.
   - **[On a computer](#run-on-a-computer-instead)** that stays on while you use Generate.

### Updating the code later

Saving in the editor does **not** change the live web app. After editing, choose **Deploy → Manage deployments → Edit (✏️) → Version: New version → Deploy**; the URL stays the same.

- Keep the eight files in step with `src/` and paste all the ones that changed. Pasting only some can leave the dashboard calling code that isn't there yet.
- If you add a file (as `Runner.gs` was added), create it with **+ → Script**. Then choose **Website Generator → Set up or repair the ledger** to approve any new permission, and deploy a new version. Running setup again keeps your data, agent token and dashboard key.

### Using clasp

clasp copies all the files in one go instead of pasting.

1. Turn on **Google Apps Script API** at https://script.google.com/home/usersettings.
2. Install clasp:

   ```bash
   npm install -g @google/clasp
   ```

3. Sign in:

   ```bash
   clasp login
   ```

4. Copy `apps-script/.clasp.json.example` to `apps-script/.clasp.json` and put in your script ID, from **Project Settings → IDs**. `.clasp.json` is git-ignored.
5. From the `apps-script` folder, run:

   ```bash
   clasp push
   ```

   This replaces the project's files with the ones in `src/`, manifest included. Then deploy a new version.

## Using it

The dashboard shows:

- **Summary tiles** for finished websites against the target, targets not built yet, work in progress, manual outreach still to send, and anything that needs attention. Click a tile to filter.
- **Targets**: businesses waiting to be built, each with a **Generate website** button.
  - A requested business shows *Waiting for the generator* until the runner picks it up, then moves through Qualify → Build → QA → Delivered.
  - A delivered business shows its website file and its JetAI prototype. On the GitHub runner the file is an *Open in Google Drive* link; on a computer it's the file's path there.
- **Add website**: type a business name and its current website address.
  - It goes on the *Hand-picked websites* list, or on a batch you choose.
  - With *Generate the website now* ticked, it is built right away.
  - The same website, phone or email can't be added twice.
- **Website generator** panel: where websites are built and what is happening there.
  - **On GitHub:** *On GitHub* while it waits for work, *Working on GitHub* or *Building 2 websites* while a job runs, or *Can't start on GitHub* with the reason (for example, a wrong token). It links to the runs on GitHub.
  - **On a computer:** whether the generator on your computer is connected, ready, busy or needs setup, with the command that starts it.
- **New batch**: an industry, a city and how many websites.
  - On the GitHub runner it starts on GitHub straight away.
  - Otherwise it gives you a prompt to paste into Claude Code, opened in the project folder. The batch waits until you do.
  - Choose **Only find targets** to list qualified businesses without building them; you then press Generate on the ones you want.
- **Batches**, each with progress. Click one to scope the whole dashboard to it, copy its run prompt for Claude Code (when a computer runs the batches), or cancel it.
- **Workers**, with a warning when one hasn't reported for more than two minutes. Builds report every minute and a half, even while Claude is still writing a page.
- **Businesses** as cards or a table, with search, sorting and status filters. Skipped businesses have their own filter.
- **Business details**: pipeline progress, qualification evidence, links, and the complete activity history.
- **Manual outreach** (only with Vercel hosting): the verified email and phone, the prepared message with copy buttons, and **Mark as sent**. Marking only updates the ledger; nothing is sent from the dashboard.

Light and dark themes follow your system, and the toggle in the top bar overrides it.

Claude Code agents use the same ledger through `tools/sheets_ledger.py`, for example `python tools/sheets_ledger.py state`.

## Run on GitHub (no computer needed)

This works like Creator Lab's runner. Apps Script takes the orders: Generate presses, websites you add, and new batches. It starts a job on GitHub Actions right away. The job:

- finds targets for new batches;
- builds the requested websites and uploads each one to JetAI as a draft;
- saves each finished page in your Google Drive, in a folder called *Website Generator websites*;
- reports progress to the dashboard.

A 10-minute trigger re-sends a start that got lost. A run with nothing to do ends in seconds.

1. **Push the code to GitHub and make the repository private.**
   - The job is `.github/workflows/website-generator.yml`. GitHub only runs it once it is on the `main` branch.
   - The runner's logs show only job IDs, but Actions logs of public repositories are public. Use **Settings → General → Change visibility**.
   - Private repositories get 2,000 free Actions minutes a month. A website takes roughly 5–15 minutes.
2. **Add the repository secrets.** In the repository, open **Settings → Secrets and variables → Actions → New repository secret**:

   | Secret | Value |
   |---|---|
   | `REVAMP_SHEETS_URL` | The web app's `/exec` address, the same as in `.env` |
   | `REVAMP_SHEETS_TOKEN` | The agent API token, the same as in `.env` |
   | `FIRECRAWL_API_KEY` | Your Firecrawl key |
   | `JETAI_API_KEY` | Your JetAI key |
   | `ANTHROPIC_API_KEY` **or** `CLAUDE_CODE_OAUTH_TOKEN` | How Claude signs in; add one of the two (see below) |

   **How Claude signs in on GitHub:**
   - **`ANTHROPIC_API_KEY`:** an API key from console.anthropic.com, billed per token. No install is needed anywhere.
   - **`CLAUDE_CODE_OAUTH_TOKEN`:** uses your Claude subscription. You create it once, on any computer:
     1. In PowerShell, run `claude setup-token`. If `claude` isn't recognized, install it with `irm https://claude.ai/install.ps1 | iex`, then open a new PowerShell window.
     2. Sign in when your browser opens, and paste the token it prints into the secret.

     The Claude desktop app has its own copy of the tool, but on Windows it sits in the app's private package folder, `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude-code\`, so it doesn't show under `%APPDATA%`.
3. **Create a GitHub token for Apps Script.** It is used only to start the job.
   1. On GitHub, open **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   2. Under **Repository access**, choose **Only select repositories** and pick this repository.
   3. Under **Repository permissions**, set **Contents: Read and write**, then generate the token and copy it.
4. **Give it to Apps Script.** In the Apps Script editor, open **Project Settings → Script properties** and add:
   - `GITHUB_REPO`: `owner/name`, for example `MasahisaSekita/websitegenerator`;
   - `GITHUB_TOKEN`: the token.
5. **Only if you set up before `Runner.gs` existed: update the code.** A fresh setup already has it, so skip to step 6.
   1. Add a script file named `Runner` (**+ → Script**) and paste `src/Runner.gs` into it.
   2. Paste the current `Code.gs`, `Ledger.gs`, `Index.html` and `App.html` too, since they changed with it. Save, then reload the spreadsheet so the menu shows the new items.
   3. Choose **Website Generator → Set up or repair the ledger**. Google asks you to approve the new permissions (connecting to GitHub, Drive and the trigger): tick **Select all**. If setup doesn't run after you approve, choose the item again. Your agent token and dashboard key stay the same.
   4. Deploy a new version (see [Updating the code later](#updating-the-code-later)). The GitHub job talks to the deployed version, so this step can't be skipped.
6. **Switch it on.** In the ledger spreadsheet, choose **Website Generator → Run on GitHub (no computer needed)…**.
   - If a permission is still missing, Google asks for it first. Tick **Select all**, then choose the menu item again.
   - It sets up the 10-minute safety trigger and sends a test start.
   - A *Website generator* run appears in the repository's **Actions** tab and finishes quickly, because nothing is waiting.

To test it, use **Add website** with *Generate the website now* ticked.

- The generator panel shows **On GitHub**, then **Building 1 website** within about a minute.
- The finished business gets a Google Drive link and a JetAI draft.
- If GitHub refuses the start, the panel shows why. The request waits, and the safety trigger tries again every 10 minutes.

To go back to a computer, choose **Website Generator → Run on a computer instead**.

**How target finding differs on GitHub.**

- **Search:** there is no browser, so it searches with Firecrawl and keeps only results 91–100, Google's page 10, for up to six variants of the query.
- **Screening:** it skips directories, social sites and businesses already in the ledger, and screens each remaining homepage with a Firecrawl screenshot.
- **Judging:** Claude decides from that screenshot whether the site looks weak, following `references/qualify-prompt.md`.
- **Limits:** it doesn't check sites on a phone, and it doesn't work through every city of a state, so queue one batch per city.
- **Hard sites:** sites that block automated readers are skipped. A few sites also refuse photo downloads from GitHub's servers; those websites are built with fewer photos.

**Costs per batch.**

- Firecrawl: 20 credits per search, about 1–2 per site screened and 1–3 per website built.
- Claude: one short check per screened site and one longer build per website.
- GitHub: Actions minutes, as above.

## Run on a computer instead

Use this if you don't use the GitHub runner. The computer must stay on while you use Generate.

1. Put `FIRECRAWL_API_KEY` and `JETAI_API_KEY` in `.env`, next to the two `REVAMP_SHEETS_…` lines.
2. Sign Claude Code's command-line tool in once. The Claude desktop app's sign-in doesn't carry over to it.
   - Run `python tools/site_runner.py doctor`. It finds the tool, including the desktop app's own copy, and prints the exact `claude auth login` command when it isn't signed in.
   - Run that command in an open PowerShell window, sign in when your browser opens, and keep the window open until it reports success.
   - If doctor says Claude Code wasn't found, install it with `irm https://claude.ai/install.ps1 | iex` in PowerShell, then open a new window.
3. Run `python tools/site_runner.py doctor` again. It should report no problems.
4. Start the generator. On Windows, double-click **Start Generator.bat**; anywhere, run:

   ```bash
   python tools/site_runner.py watch
   ```

   Leave it running. The dashboard's **Website generator** panel shows whether it is connected. Requests made while it is off wait until it starts.

## Troubleshooting

| You see | Cause and fix |
|---|---|
| `SyntaxError: Identifier '…' has already been declared` when running setup | The same file was pasted twice, or into the wrong file. For example, `Ledger.gs` pasted into `Store`. Check that each file starts like its `src/` original, then paste again. |
| `Google Sheets altered plain-text test values (…)` | An older `Store.gs`. Paste the current one and run `setup` again; nothing was stored. |
| A terminal window flashes and closes | The command was started from Win+R, the Start menu or a double-click. Open PowerShell first and run it there. |
| `Python was not found` | `python` is the Microsoft Store placeholder, not a real Python. Run Python by its full path instead, for example `& "$env:LOCALAPPDATA\Python\bin\python.exe" tools/sheets_ledger.py ping` in PowerShell. **Start Generator.bat** finds it by itself. |
| The page shows `<?!= include_('Styles'); ?>` as text | `Index` was created as a script instead of an HTML file, or a name has a typo. |
| Changes don't show on the dashboard | The web app still runs the old version. Deploy a new version. |
| `Received a Google page instead of JSON` from `ping` | The deployment isn't set to **Who has access: Anyone**, or you used the `/dev` address instead of `/exec`. |
| The GitHub panel says *Can't start on GitHub* | Check `GITHUB_REPO` and `GITHUB_TOKEN` in Script properties: the token needs **Contents: Read and write** on that repository. |
| `You do not have permission to call UrlFetchApp.fetch`, or *Google hasn't allowed this script to connect to GitHub* | A permission was left unticked on Google's permission screen. Choose **Website Generator → Run on GitHub…** again. Google asks for the missing permission: tick **Select all**, then choose the item once more. |
| A GitHub run fails with a message about secrets | Add the missing secret named in the run's log under **Settings → Secrets and variables → Actions**. |

## Access and security

- The web app runs as you, and *Anyone* access lets agents and GitHub call it without a Google sign-in. Nobody gets data without a secret or an allowed Google account:
  - **Agents and the GitHub job** must send `REVAMP_API_TOKEN`. It gives full ledger access, so keep it only in `.env` and the GitHub secret.
  - **The dashboard** asks for `REVAMP_DASHBOARD_KEY` unless Google identifies the visitor as you, or as someone listed in `REVAMP_DASHBOARD_USERS`.
    - To list people, open **Project Settings → Script properties** and enter comma-separated emails, or `@yourcompany.com` for a whole Workspace domain.
    - Google only reveals a visitor's identity to "execute as me" web apps for the owner and for users in the same Workspace domain. Everyone else uses the key.
- **What dashboard viewers can do:** read everything, queue batches, cancel batches (a reason is recorded), add websites, press Generate, and mark manual outreach as sent.
  - Generate only records a request, and may start the GitHub job. The work runs with your own Claude, Firecrawl and JetAI accounts.
  - Viewers can't change job stages, reserve submissions or send messages, and they never see the GitHub token, which stays in Script properties.
- **Drive:** the script only writes in its own *Website Generator websites* folder, although Google's Drive permission is broader.
- **Replacing a secret:** use the sheet menu, **Replace agent API token…** or **Replace dashboard key…**. After replacing the agent token, update `.env` and the GitHub secret.
- **Manual edits:** the ledger tabs warn before manual edits, because editing cells directly bypasses the safety checks.
- **Owner-only tools:** setup, the secret-showing menu items and the runner switches refuse to run for web-app visitors.
- **Workspace admins** can disable *Anyone* web apps. If the Deploy dialog doesn't offer **Anyone**, ask your admin, or set the script up under an account that allows it.

## Differences from the local version

- **Finished websites:** they're in Google Drive (GitHub runner), or in `runs/` on the computer that built them, and always in JetAI as drafts. There are no local `/preview/…` pages.
- **Speed:** each agent command takes a second or two, because it's an Apps Script round trip. Writes are serialized with a script lock, which gives the same guarantees as SQLite's immediate transactions.
- **Polling:** the dashboard checks for changes every 4 seconds (every 30 seconds in a background tab), and only re-reads the sheet when something has changed.
- **Quotas:** Apps Script and Sheets quotas apply. A sheet cell holds at most 50,000 characters, and the ledger refuses larger values rather than cutting them off.

## Develop and test locally

The emulator runs the real `src/*.gs` code on in-memory stand-ins for the Google services, including GitHub requests, Drive and triggers:

```bash
node apps-script/dev/server.mjs --demo
```

Open http://127.0.0.1:8787. Add `?as=anonymous` to see the lock screen as a visitor would. The agent API is served at `http://127.0.0.1:8787/exec`, and the server prints a local-only token, so you can try `tools/sheets_ledger.py` against it. The data resets when the server stops.

```bash
node --test apps-script/test/ledger.test.mjs
```

```bash
python -m unittest tests.test_sheets_ledger tests.test_site_runner
```
