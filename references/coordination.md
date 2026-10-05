# Coordinator, ledger and workers

All commands run from the skill root (on Windows use `python` in place of `python3`; see “Running on Windows” in SKILL.md). Browser ownership and work directories must remain separate. The UI is a read-mostly monitor plus a batch request queue; an active Claude Code coordinator session performs the work.

## Ledger CLI

```sh
python3 tools/control.py state
python3 tools/control.py batch --industry 'Electricians' --city 'Boston' --count 20
python3 tools/control.py add --batch BATCH_ID --name 'Verified business name' --url 'https://business.example' --alias 'phone:+16175550123' --alias 'email:office@business.example'
python3 tools/control.py capacity 3
python3 tools/control.py claim --batch BATCH_ID --worker WORKER_ID
python3 tools/control.py update --job JOB_ID --worker WORKER_ID --stage extracting --detail 'Qualified: fixed-width layout and tiny service navigation' --fields runs/JOB_ID/qualification.json
python3 tools/control.py add-target --batch BATCH_ID --name 'Verified business name' --url 'https://business.example' --alias 'phone:+16175550123' --reason 'Two observed weaknesses'
python3 tools/control.py claim --job JOB_ID --worker WORKER_ID
python3 tools/control.py request --job JOB_ID
python3 tools/control.py requests
```

Use actual IDs returned by commands, not the illustrative tokens above. Pass structured shell arguments safely; never splice scraped text into executable shell code. An `add` uniqueness error means another job already owns that identity: inspect it, do not modify the key to force insertion. Domains normalize scheme, www, trailing dot, path and case. Record verified aliases with `alias --job ... --worker ... --identity domain:example.com`; phone identities use E.164 and email identities lowercase. Inspect matching company name/address and redirected final domain before allocation. Do not register shared directory/CDN domains or call centers as unique business identities.

`add-target` is `add` plus an optional `--reason` (shown in the dashboard) and `--generate`. Without `--batch` it adds to the standing *Hand-picked websites* list. `claim --job` reserves that exact queued job instead of the batch's oldest. `request` asks the website generator to build a queued job (what a dashboard Generate button does), and `requests` lists the open requests; any claim answers a job's request.

`claim` atomically reserves one queued job and transitions it to reviewing. The coordinator claims each job with a logical owner ID such as `builder-JOB_ID` and hands it to one subagent; `claim` returns the actual queued job, so dispatch that job and never assume which one FIFO picked. Owner IDs are ledger locks, not agents: the subagent uses the owner ID for its updates, and when it reports back the coordinator continues the same job with the same owner ID. Never give the same job, owner ID or working directory to two agents at once. SQLite immediate transactions enforce exclusive claims, capacity, identity uniqueness and submission reservations. The ledger persists under `data/revamp.sqlite3`; `REVAMP_DB` is a test override only. Back up that directory before moving the application.

## Workers (Claude Code subagents)

Start subagents with the Agent tool (general-purpose type) in the background, passing `worker_model` from `settings.json` as the model. The coordinator keeps its own model.

- **Capacity.** Run at most `requested_workers` subagents at once. Set ledger capacity to the number of jobs claimed at once, including jobs waiting for outreach approval and builds started by the website generator (the CLI maximum is five).
- **What subagents do.** Only non-browser work: Firecrawl screening, writing and checking websites and, in `vercel` mode, deployment. They never use a browser, contact businesses or start other subagents.
- **Failures.** The coordinator handles difficult build or QA failures instead of blindly retrying a subagent.
- **Model.** If the configured model isn't available, say so and ask the operator before choosing another.

## Website generator and Generate buttons

`tools/site_runner.py watch` runs the dashboards' Generate buttons. It runs inside `control.py serve` for the local dashboard, and separately on the operator's computer for the Google Sheets dashboard.

- For each request, it claims the job as `generator-…`, runs `prepare`, has headless Claude Code write the page from [the website prompt](website-prompt.md), and runs `finish`.
- A failed build returns the job to the queue with the reason as its detail, and is not retried by itself.
- It needs a free ledger worker slot; when capacity is full, requests wait.
- Don't claim or update a job that a `generator-…` worker owns. Coordinator claims and generator claims never collide, because claims are atomic.

## Browser ownership

Only the coordinator (the main Claude Code session) uses a browser: Claude Code's built-in browser, the Browser pane of the Claude desktop app, or Claude in Chrome when the operator asks for it. Use one tab per business for its original-site checks, public-preview verification and contact form; record it in `tab_id` when useful. Leave tabs open so the operator can watch, and don't keep forcing focus as work proceeds. A mobile check resizes only that tab: use the mobile preset, inspect, then reset it to desktop. Firecrawl screening, builds and deployments may continue in subagents meanwhile. Never treat separate tabs as isolated cookie profiles. If the browser is unavailable, record the limitation; Firecrawl screening, builds and deployments can continue, but no preview is marked verified and no form is submitted until the browser is back.

## Updates and stages

Allowed path:
`queued → reviewing → extracting → building → checking → deploying → ready → contacting → complete | sent | uncertain | blocked | skipped`.
With `delivery: file` the path ends `checking → delivered`: the builder records `qa_passed:true` and `site_file`, and `delivered` is terminal, releases the worker and counts toward the target.
QA repairs may go checking → building, or deploying → checking. Pre-contact stages may end blocked or skipped. `contacting`, `complete`, `sent` and `uncertain` are controlled by contact commands. Terminal jobs release worker capacity. Once a subagent finishes, the coordinator completes that job's browser steps and starts a subagent for the next queued job.

`update --fields FILE` merges a JSON object into the job's data. Accepted keys:
`outreach_mode`, `contact_email`, `contact_phone`, `reason`, `preview_url`, `qa_passed`, `preview_verified`, `source_urls`, `screenshots`, `browser_id`, `tab_id`, `workspace`, `booking_url`, `logo_decision`, `cost`, `failure`, `contact_url`, `qualification`, `seo_checked`, `site_file`, `jetai` (the uploaded prototype: `prototype_id`, `name`, `slug`, `status`, or `error`), `generation`.

Evidence example (supply real observations):
```json
{"reason":"the service menu is difficult to read on a narrow screen","qualification":{"findings":["observed issue one","observed issue two"],"mobile_checked":true},"source_urls":["https://business.example"],"screenshots":["runs/site-ID/before-mobile.png"]}
```

Before deploying or delivering set `qa_passed:true` only after passing checks (`site_runner.py finish` does this after `html_site.py` passes). Before ready set `preview_url` and `preview_verified:true` only after public reachability and visual checks. `cost` is an object with actual page requests, downloaded images and deployment attempts; do not invent currency costs from unknown account pricing. Preserve artifact files including source extraction, facts, asset manifest, QA observations, message, and deployment log under `runs/JOB_ID/`. The `site/` subfolder alone is deployable.

## Recovery

A stale heartbeat is an observation, not permission to reassign: the old subagent may still be running. Stop it, or confirm it has finished, before `recover --job JOB_ID --reason 'Confirmed worker stopped; ...'`. This clears its ownership and returns an unsent job to queued. A job with a reserved contact attempt becomes uncertain and cannot be automatically sent again. A complete or sent job cannot be recovered. Recheck all evidence on resuming: recovered jobs are reviewed anew.

Never delete identities or submission records to retry. To record a discovered opt-out, leave a skipped job with the reason in the ledger so future batches continue to deduplicate it. Do not recycle terminal jobs merely to reach a count of five.

Before finishing, compare the requested count with jobs in `complete` or `sent` and inspect every unfinished job. All existing jobs being terminal is insufficient when discovery has not reached the requested count: one skipped candidate in a 50-site batch means continue discovering. A bounded discovery wave is a checkpoint, not evidence that the search is exhausted; record queries, result pages covered, rejection reasons, and the reason further discovery cannot proceed before reporting exhaustion.

The target counts only `complete` or `sent` jobs. Skipped, blocked and uncertain jobs never count; discover fresh replacements without retrying those identities. Queued/in-progress jobs reserve potential target slots to prevent overshoot, but do not count as completed. Pause discovery when completed plus in-progress reaches the target, and resume it after unsuccessful outcomes. `state` exposes `completed_count`, `remaining_count`, `active_count` and `available_count` per batch.

Use `batch-status --batch BATCH_ID --status complete` only when the completed count reaches the requested target and every job is terminal. If discovery is demonstrably exhausted below target, use `--status exhausted` and report the remaining shortfall; never label it complete. Report hosted/submitted counts, blocked/uncertain outcomes and any shortfall separately; a terminal ledger does not prove 50 sites were hosted or contacted. If all remaining work requires an unresolved external dependency or user action, use blocked status and describe the exact dependency and next step. Do not mark a batch blocked merely to end the turn while actionable work remains. Follow the cancellation workflow when the operator explicitly stops the batch.

The coordinator remains active through discovery and subagent waves, including waiting for running subagents when necessary. Before any final response, verify live subagent state independently of persisted ledger labels. If execution has stopped with unfinished work, report it honestly and reconcile batch status; do not leave it described as actively running. No queued dashboard request starts by itself: an authorized current task must execute the chosen batch. Never pretend the dashboard is an autonomous agent execution engine.

## Worker assignment text

Give each builder subagent the application root's absolute path, the batch ID, its job ID and owner ID, the path of the job's saved evidence packet and its Firecrawl evidence folder, and these instructions:

> You are building one website for the local-business-revamp workflow. Work only in the application root and run every ledger command with the owner ID you were given. Read `references/production.md`, `references/website-prompt.md` and `references/coordination.md` first. Then:
>
> 1. **Record the evidence.** Map the evidence packet into the accepted `update --fields` keys: `reason`, `qualification` with at least two findings, `source_urls`, the actual saved `screenshots` and `contact_url`. Never pass the raw packet.
> 2. **Prepare.** Run `tools/site_runner.py prepare --job JOB_ID --worker OWNER_ID --evidence EVIDENCE_FOLDER`. It advances reviewing → extracting → building and writes `runs/JOB_ID/brief.md` with the business's photos.
> 3. **Write the page.** Follow the website prompt exactly: read the brief and look at the screenshot and photos, then write `runs/JOB_ID/site/index.html` from the business's real content.
> 4. **Check.** Run `tools/html_site.py check` with the verified name, phone, email and the business's domain, and fix everything it lists.
> 5. **Finish.** Run `tools/site_runner.py finish --job JOB_ID --worker OWNER_ID`, which embeds the photos, uploads the page to JetAI as a draft and marks the job delivered. If it reports problems, fix them and run it again.
>
> Never invent facts, use stock photos, publish the prototype, use a browser, contact anyone or start other agents. Report the website file, the JetAI prototype ID, the brand color and sections you chose, and anything you left out or that went wrong.

The coordinator then gives the file to the operator with SendUserFile, together with the business's public email, phone and contact page and the JetAI prototype ID.

In `vercel` mode, `finish` stops after the checks: the job stays at checking with `qa_passed:true` and `site_file` set, and nothing is uploaded. Replace step 5 with: “Run `finish`, then deploy `site_file` as described under Vercel in production.md, advance to deploying and stop there. Report the deployment URL.” The coordinator then verifies the public preview in the browser, records `preview_url` and `preview_verified:true`, moves the job to ready, and handles outreach as described in SKILL.md.

## Manual outreach

See [Manual outreach](manual-outreach.md). `manual-outreach` transitions a verified `ready` job to terminal `manual`, saves its contact/message handoff, and releases worker capacity. Manual jobs are not sent and remain outside completed-send counts; `state` reports `manual_count` separately. Do not automatically recover or contact them.
