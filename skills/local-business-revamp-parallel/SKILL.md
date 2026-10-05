---
name: local-business-revamp-parallel
description: Run state-wide or city business website batches in Claude Code with one coordinator session that does all browser work and background subagents that screen candidates and write single-file HTML websites from each business's own content in parallel, uploading them to JetAI as drafts (or deploying them, with operator-approved outreach, in vercel mode), or only list qualified targets for the dashboard's Generate buttons. Use for fast prospect-to-website batches in WebsiteGenerator, not unrelated website development or skill-edit requests.
---

# Parallel business website batches

One coordinator, the main Claude Code session, discovers businesses, owns every browser step and, in `vercel` mode, asks the operator to approve outreach. Background subagents screen candidates with Firecrawl and write their websites in parallel. They write each one as a single HTML page from the business's own content, then check it and upload it to JetAI as a draft. In `vercel` mode they deploy instead. This is the default batch workflow for the WebsiteGenerator application. Creating or editing this skill does not launch a batch.

## Shared application and setup

Resolve this file's real path (including installation links); the application root is two directories above this skill folder. Work from that root. On Windows, follow the root SKILL.md section “Running on Windows” (`python` for `python3`, `.\website.bat` for `./website`). Read these first:

- The root SKILL.md sections “Claude Code runtime”, “Delivery mode”, “Targets and Generate buttons”, “Build and verify — HTML mode” and “Outreach approval”.
- [Firecrawl scouting](../../references/firecrawl-scouting.md), `settings.json`, [ledger commands](../../references/coordination.md), [production](../../references/production.md), [the website prompt](../../references/website-prompt.md) and [fixed outreach](../../references/outreach.md).

Reuse `tools/control.py` (or `tools/sheets_ledger.py` when the Google Sheets ledger is active), `tools/site_runner.py`, `tools/html_site.py`, `tools/jetai.py`, `data/revamp.sqlite3` and `runs/`. Do not create a second application or temporary production ledger.

Shared command syntax, stage transitions, deduplication, recovery and completion rules apply. The coordinator registers and claims each job with an owner ID such as `builder-JOB_ID`; the builder subagent uses that owner ID until it reports back, then the coordinator continues the job with it.

Get industry, location (state or city) and completed-outreach count from the request or explicitly selected dashboard batch; default count is five. A state is sufficient: the coordinator finds its cities without asking the operator to supply them. Use the selected batch’s industry when a follow-up supplies only a state. Clarify the country only when the state name is ambiguous in context. Resume selected unfinished work before creating duplicates. Start the local dashboard on port 4310 if this application's `/api/state` is not already responding (not needed with the Sheets ledger). Inspect `python3 tools/control.py state`. Preflight once per run with `python3 tools/site_runner.py doctor` (and, in `vercel` mode, the configured Vercel account/scope); do not repeat for every candidate. In a targets-only batch (`mode: targets` in `state`, or a run prompt that says to find targets), register qualified businesses with `add-target --batch BATCH_ID … --reason '…'`. Do not claim or build them: the operator presses Generate on the ones to build. Ask only for missing run inputs, outreach approvals, or a concrete dependency that prevents progress.

## State and city queue

For a state request, create one batch with one completed-outreach target across the entire state, not a full target per city. The existing CLI/API location field is named `city`; store the supplied state label there (for example `--city 'Delaware, USA'`). This is a compatibility field name, not a requirement to choose a single city. Save explicit scope in `runs/scouting/BATCH_ID/scope.json`: scope type, state, country, requested target, city-list source URLs, and a city queue with stable city IDs, names, status and coverage paths. Only the coordinator writes this file.

Find and verify the state's city/municipality list using an authoritative public source during the run. Start with larger cities, then work through smaller municipalities if needed; record any population/order source rather than inventing rankings. Keep the remaining cities queued. Do not declare the state exhausted merely because its largest cities or one query produced no candidates. For a city-only request, create a single city queue entry and preserve that geographic scope.

Search one city at a time and finish its queries before moving on. Use query variants within that city, but don't expand into neighboring cities while working it. Record each city's coverage (queries, result pages and outcome) and mark it exhausted, paused or blocked by browser problems distinctly; a CAPTCHA or lost browser access does not exhaust a city. Preserve the cursor and evidence so a later session can resume. Pause discovery when completed plus in-progress jobs cover the statewide target; resume pending cities when unsuccessful outcomes free slots.

City boundaries do not guarantee unique businesses: contractors often advertise in multiple cities. Keep one cross-city/cross-batch identity check before every build. Verify the prospect serves the assigned city; deduplicate canonical and alternate domains, phones, emails, name and address. Register/build/contact a multi-city company once, retaining verified service-area evidence. Never remove an identity to fill a city's queue.

For qualified businesses whose automatic outreach is unavailable, follow [Manual outreach](../../references/manual-outreach.md): build and verify first, then provide the prepared message and verified contact details to the operator. This takes precedence over form-only rejection. Opt-outs, duplicates and failed business qualification remain skipped.

## Roles and capacity

- **Coordinator (main session):** Google discovery, original-site checks when Firecrawl evidence is ambiguous, mobile checks, deduplication, ledger registration and claims, public-preview verification, outreach approvals and contact forms. It is the only agent that uses a browser.
- **Screening subagents (optional):** run Firecrawl scrapes and `scout_screen.py` for a list of candidate URLs, then return the evidence paths with a short summary of forms, contact details and anything ambiguous. Keep at most two scrape requests in flight overall (`max_concurrent_business_scrapes`).
- **Builder subagents:** one per claimed job.
  - They run `site_runner.py prepare` with the job's Firecrawl evidence, write the page following the website prompt, and check it with `html_site.py check`.
  - Then `site_runner.py finish` embeds the photos, uploads to JetAI and marks the job `delivered` (`delivery: file`).
  - In `vercel` mode, `finish` stops at checking with passing QA, then the subagent deploys and stops at `deploying` with the deployment URL.
- **Website generator:** `tools/site_runner.py watch` builds the jobs the operator requests with Generate buttons, as `generator-…` workers. Leave those jobs to it, and count its builds against ledger capacity.

Start subagents with the Agent tool (general-purpose type) in the background, passing `worker_model` from `settings.json`. Run at most `requested_workers` subagents at once, and set ledger capacity to the number of jobs claimed at once, including jobs waiting for outreach approval (the CLI maximum is five). Subagents never use a browser, contact businesses or start other agents. If the configured model is unavailable, ask the operator before choosing another. Respect actual capacity and report limitations instead of claiming nonexistent parallel work.

Keep at most two qualified candidates waiting beyond active builds. Completed plus in-progress jobs reserve the target slots; only `complete`/`sent` count toward success. Replace skipped, blocked and uncertain prospects with fresh identities. At the target stop new dispatch and finish reconciliation; if search coverage is exhausted below target, report `exhausted` and the shortfall.

## Discovery and screening (coordinator)

- Use Google web search in the built-in browser starting at page 10 (`start=90`), never Maps or pages 1–9 unless requested. Search the current city and state only, starting each query at page 10. After a confirmed empty result page, do not mechanically request ten later offsets; try a relevant trade-query variant for that city, then record its coverage and move to the next city. Distinguish empty results from CAPTCHA/loading failures; if Google shows a CAPTCHA, pause and ask the operator to clear it in the Browser pane. Preserve the page-10 rule; do not silently switch to pages 1–9. A finished query is not statewide exhaustion.
- Screen each candidate's homepage/contact page with cached Firecrawl evidence (yourself or through a screening subagent) using [Firecrawl scouting](../../references/firecrawl-scouting.md). Open the saved screenshot with the Read tool and qualify by observed visual weakness, never actual age, dates or copyright years. Collect two concrete findings and screenshots/source URLs. Check mobile in the browser when it matters; do not claim mobile defects without checking. Skip visually strong sites, directories, dead sites, certificate/browser verification barriers, and known duplicates.
- In `vercel` mode, before registering a build candidate, verify from scraped evidence an original contact form with a message field and submit control, suitable for a website proposal. Apply the shared outreach rules for CAPTCHA, opt-outs and required commitments. Email-only contact, newsletter/review-only forms, and visible CAPTCHA select manual outreach; they do not fail business qualification. Use browser inspection only for ambiguous or incomplete form evidence; missing HTML alone is not proof of no form. Skip confirmed unsuitable prospects promptly and continue.
- Collect business name, public contact details, public address if available, aliases, template and brand color (industry fallback if unclear), recording sources. Reuse the same cached Firecrawl evidence for visual qualification, contact facts and form discovery. Do not reopen each business in the browser or scrape again when evidence is sufficient. CAPTCHA integration hints alone never disqualify a form; final live challenge state remains unknown until the final form check.
- Save each qualified candidate's packet to `runs/scouting/BATCH_ID/CITY_ID/candidates/DOMAIN.json`: assigned city/state, identity, URL, findings, screenshots, form fields, contact URL, facts, theme color and sources. Record skips and search coverage too. Dispatch qualified candidates as you find them; do not wait to finish the city.

## Register and dispatch (coordinator)

Check each candidate against the durable identities and current in-flight candidates using canonical/alternate domains, phone/email and name/address. Register qualified prospects and verified aliases once. Save evidence under `runs/JOB_ID/`. Retain skipped/opt-out identities through the existing ledger workflow so they are not rediscovered.

Claim each registered job with a unique owner ID such as `builder-JOB_ID`. `claim` returns the actual queued job: dispatch that returned job with its matching saved packet, never assume FIFO selected a particular candidate. Give exactly one builder subagent that job, owner ID and packet path, using the assignment text in [coordination.md](../../references/coordination.md#worker-assignment-text). Do not update the job yourself while its subagent is running.

## Finish each job (coordinator)

With `delivery: file`, builders finish their jobs as `delivered`. Give each file to the operator with SendUserFile as it arrives (several at once when they finish together). Beside it, list the business's public email, phone and contact page and the JetAI prototype ID, then skip the steps below. Never publish a prototype unless the operator asks.

1. When a builder reports a deployment, verify the public homepage and a service route in the browser, not signed in to Vercel; CLI success alone is insufficient. Record `preview_url` and `preview_verified:true` and move the job to ready. If the deployment failed, decide whether to repair it (back to checking or building) or block it with the reason.
2. For a manual-route prospect, save the fixed message and verified contacts and run `manual-outreach` from ready as documented, without reserving a submission.
3. Otherwise recheck the live form, save the exact fixed message as `runs/JOB_ID/outreach.txt`, and add the job to the next approval request (see “Outreach approval” in the root SKILL.md).
4. After the operator approves it: fill and check the form, reserve with `contact-begin` using the job's owner ID, click Submit once, then record `contact-finish --status submitted` with observed evidence, or `uncertain` if whether the click happened is unknown. If reservation fails, do not submit. Follow the shared rules for skipped/blocked cases. If the operator declines or wants to send it personally, record manual outreach. Never resend or use email/SMS as fallback.

## Continuous execution and speed

Keep discovery running while builder subagents work, and process finished builds as their notifications arrive. Ask for outreach approvals at natural checkpoints; background subagents keep running while you wait. Prefer finishing ready sends over growing an unbounded preview backlog. Measure candidate qualification, generation, deployment and send durations to identify the actual bottleneck; do not promise an unmeasured speedup.

Remain in the coordinator loop until the requested scope is processed, documented discovery exhaustion explains a shortfall, the operator stops it, or a concrete blocker prevents all remaining authorized work. A skip, subagent completion, page-range limit, setup/preflight, or status question is not a stopping point. Refill available slots; wait for running subagents when no independent work remains. Post progress in the chat and continue. Do not replace active execution with a heartbeat or claim that the dashboard/ledger runs agents.

Before a final response, reconcile target, discovery coverage, unfinished jobs, running subagents and ledger status using the shared completion rules. Report requested, reviewed, hosted, submitted, manual, skipped, uncertain and blocked counts, plus any shortfall. The task ends with actual outcomes, not 'batch running' followed by idle execution.
