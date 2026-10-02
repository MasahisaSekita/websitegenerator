# Coordinator, ledger and workers

All commands run from the skill root (on Windows use `python` in place of `python3`; see “Running on Windows” in SKILL.md). Browser ownership and work directories must remain separate. The UI is a read-mostly monitor plus a batch request queue; an active Codex coordinator performs work.

## Ledger CLI

```sh
python3 tools/control.py state
python3 tools/control.py batch --industry 'Electricians' --city 'Boston' --count 20
python3 tools/control.py add --batch BATCH_ID --name 'Verified business name' --url 'https://business.example' --alias 'phone:+16175550123' --alias 'email:office@business.example'
python3 tools/control.py capacity 3
python3 tools/control.py claim --batch BATCH_ID --worker WORKER_ID
python3 tools/control.py update --job JOB_ID --worker WORKER_ID --stage extracting --detail 'Qualified: fixed-width layout and tiny service navigation' --fields runs/JOB_ID/qualification.json
```

Use actual IDs returned by commands, not the illustrative tokens above. Pass structured shell arguments safely; never splice scraped text into executable shell code. An `add` uniqueness error means another job already owns that identity: inspect it, do not modify the key to force insertion. Domains normalize scheme, www, trailing dot, path and case. Record verified aliases with `alias --job ... --worker ... --identity domain:example.com`; phone identities use E.164 and email identities lowercase. Inspect matching company name/address and redirected final domain before allocation. Do not register shared directory/CDN domains or call centers as unique business identities.

`claim` atomically reserves one queued job and transitions it to reviewing. IDs for workers are stable for an assignment (the subagent's returned ID works). Workers should claim themselves with a coordinator-provided batch ID, then report their returned job. Never assign the same tab or directory to a second worker. SQLite immediate transactions enforce exclusive claims, capacity, identity uniqueness and submission reservations. The ledger persists under `data/revamp.sqlite3`; `REVAMP_DB` is a test override only. Back up that directory before moving the application.

## Worker model

Read `worker_model` and `worker_reasoning_effort` from settings.json (currently GPT-5.6 Terra with low reasoning for light worker runs). For collaboration.spawn_agent, pass those explicit values with `fork_turns: "none"`; full-history forks do not accept model overrides. Include the skill path, batch ID, unique worker ID and outreach authorization in the assignment so a fresh worker has the required context. The coordinator keeps its current task model/effort; these settings do not change global Codex configuration. Have the coordinator handle difficult build or QA failures instead of blindly retrying a low-effort worker. Do not silently switch worker models if the configured model is unavailable.

## Browser ownership

Before claiming browser-dependent work, a worker must verify that it has an `iab` surface. When available, create one `iab` tab for the assigned URL with `visible:true` (Albert wants to watch browsing), save browser/tab identifiers through update fields, and retain the tab using `markHandoff()` while work is active and `markDeliverable()` at completion. When a worker has no `iab` surface, it must report that limitation without claiming, blocking, scraping, deploying, or contacting; the coordinator retains browser ownership for original-site inspection, public-preview verification, and contact-form interaction. The localhost dashboard shows ledger updates, not an embedded live browser stream. Do not repeatedly force focus as work proceeds; let Albert choose which tab to watch. Never change a shared foreground app or close another worker's tabs. Follow the documentation returned by the browser tool; don't guess API signatures. If isolated tabs are unavailable, serialize browser use and show that restriction. Browser-level viewport controls can affect other tabs: the coordinator must grant an exclusive mobile-inspection window and pause other browser interactions until it resets the viewport. File edits, Firecrawl extraction and builds may continue during that window. Never treat separate tabs as isolated cookie profiles or independent viewport settings.

## Updates and stages

Allowed path:
`queued → reviewing → extracting → building → checking → deploying → ready → contacting → complete | sent | uncertain | blocked | skipped`.
QA repairs may go checking → building, or deploying → checking. Pre-contact stages may end blocked or skipped. `contacting`, `complete`, `sent` and `uncertain` are controlled by contact commands. Terminal jobs release worker capacity. Once a worker ends, the coordinator starts/follows up that worker for the next queued job.

`update --fields FILE` merges a JSON object into the job's data. Accepted keys:
`outreach_mode`, `contact_email`, `contact_phone`, `reason`, `preview_url`, `qa_passed`, `preview_verified`, `source_urls`, `screenshots`, `browser_id`, `tab_id`, `workspace`, `booking_url`, `logo_decision`, `cost`, `failure`, `contact_url`, `qualification`, `seo_checked`.

Evidence example (supply real observations):
```json
{"reason":"the service menu is difficult to read on a narrow screen","qualification":{"findings":["observed issue one","observed issue two"],"mobile_checked":true},"source_urls":["https://business.example"],"screenshots":["runs/site-ID/before-mobile.png"]}
```

Before deploying set `qa_passed:true` only after passing checks. Before ready set `preview_url` and `preview_verified:true` only after public reachability and visual checks. `cost` is an object with actual page requests, downloaded images and deployment attempts; do not invent currency costs from unknown account pricing. Preserve artifact files including source extraction, facts, asset manifest, QA observations, message, and deployment log under `runs/JOB_ID/`. The `site/` subfolder alone is deployable.

## Recovery

A stale heartbeat is an observation, not permission to reassign: the old worker may still be operating a form. Stop/interrupt and confirm the old worker is no longer acting before `recover --job JOB_ID --reason 'Confirmed worker stopped; ...'`. This clears its ownership and returns an unsent job to queued. A job with a reserved contact attempt becomes uncertain and cannot be automatically sent again. A complete or sent job cannot be recovered. Recheck all evidence on resuming: recovered jobs are reviewed anew.

Never delete identities or submission records to retry. To record a discovered opt-out, leave a skipped job with the reason in the ledger so future batches continue to deduplicate it. Do not recycle terminal jobs merely to reach a count of five.

Before finishing, compare the requested count with jobs in `complete` or `sent` and inspect every unfinished job. All existing jobs being terminal is insufficient when discovery has not reached the requested count: one skipped candidate in a 50-site batch means continue discovering. A bounded discovery wave is a checkpoint, not evidence that the search is exhausted; record queries, result pages covered, rejection reasons, and the reason further discovery cannot proceed before reporting exhaustion.

The target counts only `complete` or `sent` jobs. Skipped, blocked and uncertain jobs never count; discover fresh replacements without retrying those identities. Queued/in-progress jobs reserve potential target slots to prevent overshoot, but do not count as completed. Pause discovery when completed plus in-progress reaches the target, and resume it after unsuccessful outcomes. `state` exposes `completed_count`, `remaining_count`, `active_count` and `available_count` per batch.

Use `batch-status --batch BATCH_ID --status complete` only when the completed count reaches the requested target and every job is terminal. If discovery is demonstrably exhausted below target, use `--status exhausted` and report the remaining shortfall; never label it complete. Report hosted/submitted counts, blocked/uncertain outcomes and any shortfall separately; a terminal ledger does not prove 50 sites were hosted or contacted. If all remaining work requires an unresolved external dependency or user action, use blocked status and describe the exact dependency and next step. Do not mark a batch blocked merely to end the turn while actionable work remains. Follow the cancellation workflow when Albert explicitly stops the batch.

The coordinator remains active through discovery and worker waves, including waiting for active workers when necessary. Before any final response, verify live worker/process state independently of persisted ledger labels. If execution has stopped with unfinished work, report it honestly and reconcile batch status; do not leave it described as actively running. No queued dashboard request starts by itself: an authorized current task must execute the chosen batch. Never pretend this local server is an autonomous agent execution engine.

## Worker assignment text

Give each worker the skill’s absolute path, batch ID, exclusive worker ID, current outreach authorization, selected industry and business URL. Instruct the AI worker to collect and verify the business/contact details and choose the theme color itself from the brand (or an industry fallback), recording the source. Instruct it to use `tools/quick_site.py create` and keep the prepared English copy, bundled stock imagery and layout unchanged. No per-business build, copy rewrite or image search. Record the returned `runs/quick/ID/site` folder in the ledger, verify the generated contacts, then deploy that static folder to an isolated project and verify its public URL. Use a private browser tab when available, update the ledger at each stage, and report the observed outcome. No nested delegation.

## Manual outreach

See [Manual outreach](manual-outreach.md). `manual-outreach` transitions a verified `ready` job to terminal `manual`, saves its contact/message handoff, and releases worker capacity. Manual jobs are not sent and remain outside completed-send counts; `state` reports `manual_count` separately. Do not automatically recover or contact them.
