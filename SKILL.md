---
name: local-business-revamp
description: Find visually weak business websites in a supplied industry and city, rebuild each one as a single-file HTML website written from the business's own content and photos, upload it to JetAI as a draft prototype and hand the operator the file, or list qualified targets for the operator to Generate from the dashboard. Optional Vercel hosting with operator-approved contact-form outreach. Runs in Claude Code with a live dashboard. Use for this prospect-to-website workflow and its batches, not unrelated website development.
---

# Local business revamp

Run user-sized business batches for the operator (the person running Claude Code; their sender details are `sender` in `settings.json`): discover → visually qualify → collect the business's content → write its new website as one HTML page → check → deliver, which for now means uploading it to JetAI as a draft prototype and handing the operator the file (see [Delivery mode](#delivery-mode)). A batch can also stop after qualification and leave the businesses as targets that the operator generates from the dashboard (see [Targets and Generate buttons](#targets-and-generate-buttons)). Batches default to five websites and may request 1–100; process larger batches in waves. This skill runs in Claude Code; follow [Claude Code runtime](#claude-code-runtime). If a browser step can't be done, record the limitation and keep independent work moving; never invent observations or turn that recoverable condition into a terminal job block.

The skill folder is the application root. Resolve it from this SKILL.md, set it as the working directory, and read `settings.json`. Relative paths below resolve here. `data/` holds the durable cross-run ledger; `runs/` holds per-business artifacts. Never use a temporary DB during a real batch. Websites need Python 3 and Firecrawl (`FIRECRAWL_API_KEY` in `.env`). Uploads need `JETAI_API_KEY` in `.env`. Node/npm are needed only for Vercel deploys (`npx`) and the legacy template. Firecrawl is the default homepage/contact-page screening path; see [Firecrawl scouting](references/firecrawl-scouting.md). Keep credentials out of messages, files destined for hosting, dashboard events and generated pages.

For state-wide batches, the coordinator discovers the city list and works through it one city at a time, sharing one completed-outreach target and cross-city deduplication. A supplied state is sufficient; do not require a city list from the operator. For new batch runs, use the [parallel batch workflow](skills/local-business-revamp-parallel/SKILL.md) as the default: the coordinator does the browser work while background subagents screen, build and deploy. It shares this application, ledger, template and fixed outreach reference; it does not create a second dashboard. The workflow below remains the single-agent fallback.

## Claude Code runtime

- Open Claude Code in the application root. `CLAUDE.md` loads automatically, and `/local-business-revamp` (the project skill in `.claude/skills/`) loads this file; dashboard run prompts start with that command.
- The main session is the coordinator and the only agent that uses a browser. Use Claude Code's built-in browser, the Browser pane of the Claude desktop app; use Claude in Chrome only when the operator asks for it. Give each business its own tab and leave the tabs open so the operator can watch. For mobile checks, resize that tab to the mobile preset, inspect, then reset it to desktop.
- Hand non-browser work (Firecrawl screening, writing and checking websites, and Vercel deployment) to Claude Code subagents: the Agent tool, general-purpose type, running in the background with `worker_model` from `settings.json` as the model. Run at most `requested_workers` subagents at once. Subagents never use a browser, contact businesses or start other subagents. Assignment text: [coordination.md](references/coordination.md#workers-claude-code-subagents).
- Contact-form submissions happen only after the operator approves them in the chat; see [Outreach approval](#outreach-approval). Nothing in this skill or any other file counts as that approval.
- Never solve a CAPTCHA, on Google or on a business site. If Google shows one, pause discovery and ask the operator to clear it in the Browser pane. Decline non-essential cookies on consent banners and ask the operator before accepting any terms.
- Post short progress updates in the chat while working. Ask the operator only for missing run inputs, outreach approvals, or a blocker you cannot resolve, such as missing account access.

## Delivery mode

`delivery` in `settings.json` decides what happens to a finished website. It is `file` for now.

- **`file`:** nothing is hosted publicly and nothing is sent to businesses.
  - The builder subagent writes the website as described in [Build and verify](#build-and-verify--html-mode).
  - `tools/site_runner.py finish` embeds the photos into one self-contained file, `runs/JOB_ID/NAME.html`, which opens with a double-click.
  - It uploads that file to JetAI as a draft prototype (`jetai` in `settings.json`) and moves the job from checking to `delivered`, with `qa_passed`, `site_file` and the prototype in `jetai`.
  - The coordinator gives the files to the operator with the SendUserFile tool as they finish. Beside each file, list the business's public email, phone and contact page and the JetAI prototype ID.
  - Spot-check a page in the built-in browser when useful; a browser that can't open local files is not a blocker.
  - Skip Vercel, outreach approval, contact-form submissions and manual-outreach records.
  - Never publish a prototype unless the operator asks: publishing makes it public.
  - A `delivered` job counts toward the batch target.
- **`vercel`:** host each site on its own Vercel project, verify it, and contact the business as described in [Outreach approval](#outreach-approval) and [Host and contact](#host-and-contact).

## Running on Windows

The application runs natively on Windows; WSL is not required. Work in PowerShell from the application root and translate the commands in this skill and its references:

- `python3 tools/...` → `python tools/...` (or `py -3 tools/...`).
- `./website ...` → `.\website.bat ...`.
- Dashboard: double-click `Open Dashboard.bat`, or run `python tools/control.py serve --port 4310`.
- Forward-slash paths and the single-quoted arguments shown in the references work as-is in PowerShell.
- The Python tools switch themselves to UTF-8 mode on Windows; no extra setup is needed.
- If `python` only prints “Python was not found”, it is the Microsoft Store alias. Use `py -3` or the full interpreter path (often `%LOCALAPPDATA%\Python\bin\python.exe`) instead, and suggest the operator turn the alias off under Settings → Apps → Advanced app settings → App execution aliases. `Open Dashboard.bat` and `Start Generator.bat` find the real interpreter themselves.
- `Start Generator.bat` runs the website generator for the Google Sheets dashboard's Generate buttons (see below).
- Template edits (`quick_site.py prepare`) need Node/npm on PATH. The prerender script needs `CHROME_PATH` set to Chrome's location, e.g. `C:\Program Files\Google\Chrome\Application\chrome.exe`.

## Google Sheets ledger (Apps Script edition)

`apps-script/` holds a Google Apps Script version of the ledger and dashboard ([setup](apps-script/README.md)). It is active only when `.env` (or the environment) sets both `REVAMP_SHEETS_URL` and `REVAMP_SHEETS_TOKEN`. When active:

- Run every ledger command in this skill and its references with `tools/sheets_ledger.py` in place of `tools/control.py`, keeping the same subcommand and arguments, e.g. `python3 tools/sheets_ledger.py claim --batch BATCH_ID --worker WORKER_ID`. The stage, deduplication, capacity, evidence and single-submission rules are identical.
- The dashboard is the Apps Script web app URL; do not start `control.py serve`. Never mix the two ledgers within one run.
- If a write command reports that the web app could not be reached, run `state` to see whether it was applied before repeating it. After an unconfirmed `contact-begin`, submit the form only once `state` shows the job in `contacting`.

## Targets and Generate buttons

A business that is queued and has no worker is a **target**. Both dashboards list targets with a **Generate website** button.

- Pressing it records a request: `request --job JOB_ID`.
- The website generator, `tools/site_runner.py watch`, picks the request up. It claims the job as `generator-…` and builds the website: Firecrawl, then headless Claude Code following [the website prompt](references/website-prompt.md), then the checker, then the JetAI upload, then delivered.
- The local dashboard (`control.py serve`) runs the generator in its own process.
- For the Google Sheets dashboard, the operator runs `python tools/site_runner.py watch`, or double-clicks `Start Generator.bat`, on the computer where Claude Code is signed in.
- `python tools/site_runner.py doctor` lists anything missing, for example `claude auth login`.
- Operators can also add a business by name and website (**Add website**). It goes onto the *Hand-picked websites* list, or onto a chosen batch.

**Targets-only batches.** A batch queued with "Only find targets" has `mode: targets` in `state`, and its run prompt says to find targets.

- Discover and qualify exactly as for a normal batch.
- Register each qualified business with `add-target --batch BATCH_ID --name … --url … --alias … --reason '…'`, and save its evidence packet under `runs/scouting/BATCH_ID/…` as usual.
- Do not claim or build these jobs; the operator decides which ones to generate. The requested count is the number of targets to find.
- Leave the batch `running` when its targets are registered, and report them. The operator's Generate presses finish them later.
- A coordinator may `request` a target only when the operator asks it to.

**GitHub runner (no computer needed).** With the Google Sheets ledger, the dashboard can hand this work to GitHub Actions instead of a computer; setup is in `apps-script/README.md`, "Run on GitHub".

- `state` then shows `runner.mode: "github"`.
- `.github/workflows/website-generator.yml` runs `tools/site_runner.py cloud`. That finds targets for queued dashboard batches with Firecrawl search, results 91–100 only, judges each homepage from its screenshot with `references/qualify-prompt.md`, and builds every requested website.
- Don't run a dashboard batch in Claude Code as well unless the operator asks; a batch GitHub has started shows as `running`.

## Outreach approval

Applies when `delivery` is `vercel`. Every contact-form submission needs the operator's explicit approval in the chat, given for that specific submission. Prepare first: verify the public preview, recheck the live form, save the exact message to `runs/JOB_ID/outreach.txt`, and decide the value for every field you will fill. Then ask, listing for each submission the business, the form URL, the values you will enter and the message. Collect ready submissions and ask at natural checkpoints, such as after a wave of previews is verified; background subagents keep working while you wait. The operator may approve several listed submissions in one reply; an approval covers only the submissions it lists and never carries over to later ones. Only after approval, fill the form, check it, reserve with `contact-begin`, click Submit once and record `contact-finish`. If the operator declines a submission or wants to send it personally, record [manual outreach](references/manual-outreach.md) for it. A dry-run or review-only request means no submissions.

## The AI does the work

When the operator runs this skill with an industry and city, carry each qualified prospect through **research → collect its content → write its website → check → deliver** (and in `vercel` mode **→ deploy → verify public URL → approved outreach → record result**). The AI does this work; do not ask the operator to enter a business name, phone, email, address or theme color, fill out a dashboard form, run a command, or deploy a site. For a real batch, finish each qualified prospect with an approved submission through its original form when the form is usable; otherwise the final step is a verified website and manual outreach handoff under [Manual outreach](references/manual-outreach.md). Honor an explicit dry-run or narrower scope. With `delivery: file`, the chain stops at **check → upload to JetAI → deliver the HTML file**: no deployment and no outreach. In a targets-only batch it stops after registering the qualified targets.

The dashboard is a contact sheet for batch requests, targets, live progress, finished websites and outcomes. Its only per-business inputs are **Add website** (a name and an address) and **Generate**. There is no setup form or theme picker. Ask only for missing run-level inputs (industry/city), outreach approvals, or a real blocker the AI cannot resolve, such as unavailable account access. An instruction to update this skill changes the workflow; it does not launch a prospecting batch.

## Keep the batch advancing

“Run the batch” means execute the selected batch through its requested scope in the current task. Starting the dashboard, passing preflight, setting the ledger to `running`, starting a subagent, or reviewing one candidate is setup or progress, never a stopping point.

- Keep a coordinator loop active: discover and qualify candidates, allocate available subagent capacity, perform coordinator-owned browser steps, collect results, and refill the next wave. After a skip, continue discovery immediately. When a subagent finishes, complete its job's browser steps and assign the next available job. When all useful work depends on running subagents, wait for their results and then continue.
- Post progress updates and keep working. A status question such as “Are you running anything currently?” calls for a truthful brief answer followed by continued execution; it does not cancel or pause the batch.
- End the run only when the requested scope is processed, discovery is exhausted with recorded search coverage and a reported shortfall, the operator explicitly stops it, or a concrete blocker prevents all remaining authorized work. A blocker affecting one prospect does not stop independent work. Outreach approvals are requested as described above; while one is pending, keep independent work moving.
- Before ending, check the requested count, discovery coverage, unfinished jobs, and actual subagent state. A dashboard server, ledger `running` flag, open browser tab, or scheduled future wakeup is not evidence of active batch processing. State what is executing now and what is waiting; never promise continued background work without a verified execution mechanism.
- A recurring heartbeat is not a substitute for this coordinator loop. Do not create one merely to recover from ending a turn prematurely. Use scheduling only when the operator requests later or recurring execution, following the available automation tool's rules.

## Starting a run

- An instruction to build/edit this skill is not a request to start outreach. For an actual run, get **industry, city and requested website count** from the current request or an explicitly selected queued dashboard batch. The count defaults to five when omitted. Ask only for missing inputs. Other defaults are saved in settings.
- A request for a real batch authorizes discovery, generation and delivery of websites (deployment in `vercel` mode). It never approves contact-form submissions; those follow [Outreach approval](#outreach-approval). In `vercel` mode, before preparing any outreach, check that `sender` in `settings.json` has a real name, phone and email with no placeholders; if not, ask the operator.
- Unless the Google Sheets ledger is active, start `python3 tools/control.py serve --port 4310` if the dashboard is not already serving this application's `/api/state`, and open http://127.0.0.1:4310 in the built-in browser. If the port belongs to something else, select a free port and report it. With the Sheets ledger, the dashboard is its web app URL. The dashboard displays real ledger updates; it **does not start Claude Code**. Its “queue” action stores a request for the coordinator. Do not claim workers are running until subagents are started and their jobs claimed.
- Read [coordination.md](references/coordination.md) for commands, capacity, ownership and recovery. Start from `python3 tools/control.py state` so prior contacts and unfinished work are visible. Resume explicitly selected unfinished work before creating duplicates.
- Preflight with `python3 tools/site_runner.py doctor` (read-only: ledger, Firecrawl, JetAI, and the Claude Code CLI that only Generate buttons need). In `vercel` mode, run the Vercel CLI from `vercel_cli` in `settings.json` (`npx --yes vercel@59.16.0 whoami` and `teams ls`) to verify the configured `vercel_scope` (read-only). If Vercel isn't logged in, ask the operator to run `npx --yes vercel@59.16.0 login` themselves. Only check Firecrawl credentials if scraping is actually needed; never print their values.

## Discover, qualify and allocate

Read [coordination.md](references/coordination.md). Use Google web search in the built-in browser as the discovery source, not Google Maps. Begin on Google results page 10 (the `start=90` results offset or equivalent pagination) and continue through later pages; do not fall back to pages 1–9 unless the operator asks. Search the requested industry and city, then open each business's actual website to confirm its name, city/service area and ownership. Work in bounded waves of up to four candidates per requested website, replacing unsuccessful prospects until the requested completed-outreach count is reached or the search is exhausted. Skip directory-only listings, duplicates, already contacted or opted-out businesses, dead websites, browser-verification or invalid-certificate blockers, and visually strong sites. Do not use copyright years, publication dates, domain age, or other time-based signals to qualify or reject a prospect.

Qualify solely by **observed visual weakness**, e.g. dense fixed-width layouts, illegible typography, tiny navigation, stretched/low-resolution imagery, poor contrast, broken/placeholder content, confusing service hierarchy, or a visibly broken mobile layout. The site may be newly published; age is irrelevant. Save desktop/mobile observations and at least two concrete findings, for internal qualification evidence; do not insert them into outreach. Never say “not responsive” without actually checking a narrow viewport (resize the business's tab to the mobile preset). Preserve evidence URLs and screenshots. If mobile can't be inspected, record that limit and use verified desktop issues instead.

In `vercel` mode, before qualifying a prospect for a build, screen its original contact page via Firecrawl (browser fallback for ambiguous evidence) and confirm an actual form suitable for a website proposal exists, with a message field and submit control. A contact link, email address, phone number, newsletter signup or customer-review form does not satisfy this check. Record the verified form URL as `contact_url` and save the observed fields and submit control in the qualification evidence. Check for visible CAPTCHA, opt-out notices and required commitments using [outreach.md](references/outreach.md). If no usable form is found but the business qualifies, still generate, deploy and verify the preview, then follow [Manual outreach](references/manual-outreach.md) with the prepared message and verified contact details. Recheck the saved form immediately before filling and sending; do not assume it remains usable. In `file` mode, skip the form-suitability check but still record the public email, phone and contact page found while screening, for the operator.

The coordinator alone registers candidates and aliases in the shared ledger, then delegates independent business jobs. For a requested batch count (for example 50), keep discovering and registering qualified prospects until the target count of `complete`/`sent` jobs is reached; skipped, blocked and uncertain jobs require fresh replacements, while builds run in capacity-limited subagent waves. Canonical domain plus verified alternate domains, normalized phone and email identify duplicates across batches. Compare names/addresses too; domains alone do not identify every business. Treat normal recoverable workflow gaps as work to resolve rather than terminal job blocks; publicly listed business address details are collected from the original site or Google results before form completion. The coordinator claims each job with a logical owner ID (`builder-JOB_ID`) and gives its non-browser work to one subagent; browser steps (original-site inspection when evidence is ambiguous, public-preview verification and contact forms) stay with the coordinator. Run up to `requested_workers` subagents at once; larger batches proceed in waves. Set ledger capacity (`capacity N`, at most five) to the number of jobs claimed at once, including jobs waiting for outreach approval. Subagents never start other subagents. Show actual capacity. Keep coordinator browser tabs open for the operator to watch, following coordination.md.

## Build and verify — HTML mode

`build_mode` is `html`. Every website is one HTML page written for that business from its own website: its real services, wording, contact details and photos, laid out as a modern, fast, mobile-first page. [website-prompt.md](references/website-prompt.md) is the prompt for writing it: truth rules, design, page structure and technical rules. [production.md](references/production.md) has the commands. No Node, React, build step or stock photography is involved. The page is plain HTML so it can later be wired to the operator's HTML and Apps Script stack; build no backend now.

1. **Prepare.** `tools/site_runner.py prepare --job JOB_ID --worker OWNER_ID --evidence <the business's Firecrawl cache folder>` writes `runs/JOB_ID/brief.md`.
   - The brief holds the contact details with their sources, the address, hours lines, links, the brand colors from the site's code, the business's photos downloaded into `site/assets/`, and the cleaned page text.
   - It reuses the screening evidence. Scrape only when a needed page (services, about) is missing.
2. **Write `runs/JOB_ID/site/index.html`** following the website prompt.
   - Use only facts from the brief. Never invent licences, years, reviews, prices, guarantees, hours or availability.
   - Use only the business's own photos.
   - Take the brand color from its logo or site.
   - At most two small "For the owner" notes may stand in for missing content.
3. **Check.** Run `tools/html_site.py check` with the verified name, phone, email and the business's domain, and fix everything it lists.
4. **Finish.** `tools/site_runner.py finish --job JOB_ID --worker OWNER_ID` embeds the photos into the single-file website, uploads it to JetAI as a draft and marks the job delivered. In `vercel` mode it stops at checking with `qa_passed:true`, ready to deploy.

Collect the business name, public phone, email and listed address from its actual website. Use a trusted search result only to fill a missing detail, and record the source. At least one verified contact method is required; omit unavailable optional details rather than inventing them. Honor an operator-specified color or detail, but never ask the operator to choose one.

Use the shared cached Firecrawl homepage/contact-page evidence for screening, the visual assessment and the website content. Inspect the original site live only for ambiguous evidence and the final sending check. Do not repeat Firecrawl credit checks, or re-scrape pages whose evidence is already sufficient. Keep the existing ledger and duplicate/outreach safeguards. The legacy template mode (`build_mode: quick-template`, `tools/quick_site.py`) remains available only when the operator asks for it; see production.md.

## Host and contact

Applies when `delivery` is `vercel`.

### Apply the actual communication rules

Each submission needs the operator's approval as described in [Outreach approval](#outreach-approval). Prepare the concrete message, destination and field values before asking. If an applicable instruction or tool rule blocks an action, identify the exact action and the rule; never describe an unattempted submission as a browser rejection. Do not bypass an actual restriction, switch tools to evade it, or retry an uncertain submission. Keep CAPTCHA, opt-out, contract/payment, sensitive-data and duplicate-submission safeguards intact.

Create an isolated Vercel project per job using its unique job ID. Verify the existing account and scope. Never deploy into or modify an existing project. Deploy the new copy, capture the CLI's URL, and open it in the built-in browser without being signed in to Vercel. Check that it loads without Vercel login and that routes, images and calls to action work. An inaccessible preview is a blocker to outreach. No custom domains, purchases, account changes or existing-site modifications are part of this workflow.

Read [outreach.md](references/outreach.md) before contacting. Copy the fixed message exactly, substituting the verified preview URL, the optional subject business name and the sender details from `settings.json`. Use the business's original contact form. Save the exact message, form URL and QA evidence before asking for approval. After approval, reserve `contact-begin` in the ledger immediately before the one submission. Inspect success/failure afterward; use `contact-finish` with observed evidence. Fill sender fields from `sender` in `settings.json`. Inspection-request forms are suitable for a clearly identified website proposal. Leave CAPTCHA challenges untouched and finish qualified websites as manual outreach instead of skipping the build. After one submit action, mark the job complete using contact-finish --status submitted and record the observed result; no delivery confirmation is required. Never retry or move to email/SMS as a fallback.

## Finish

Apply the completion and status checks in [coordination.md](references/coordination.md) before ending. Summarize actual counts (requested, reviewed, delivered, uploaded, hosted, submitted/complete, manual, uncertain, skipped, blocked), the delivered files with their JetAI prototype IDs or the preview URLs, the targets listed for a targets-only batch, and any shortfall or remaining blockers. Link the dashboard and output folders. A complete job means the submit action is done; do not equate it with confirmed delivery. Preserve the observed result. Keep history across future runs. No background monitoring or recurring scheduler is installed by default.
