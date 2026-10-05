# Website Generator

This repository is the local-business-revamp application. An agent finds local businesses with dated websites and rebuilds each one as a single-file HTML website written from the business's own content (`references/website-prompt.md`). It uploads the page to JetAI as a draft prototype and hands over the file, or, in `vercel` mode, deploys it and prepares outreach. A dashboard shows progress, and its Generate buttons build websites through `tools/site_runner.py`.

- To run, resume or check a batch, use `/local-business-revamp`, or read `SKILL.md` and follow it. This folder is the application root and working directory.
- Ledger commands use `tools/control.py` (local SQLite), or `tools/sheets_ledger.py` with the same arguments when `.env` sets `REVAMP_SHEETS_URL` and `REVAMP_SHEETS_TOKEN` (the Google Sheets edition in `apps-script/`).
- `delivery` in `settings.json` is `file` for now: each finished site is one HTML file handed to the operator and uploaded to JetAI as a draft, and nothing is published, hosted or sent to businesses. Publish a prototype only when the operator asks.
- Keys live only in the git-ignored `.env` (`FIRECRAWL_API_KEY`, `JETAI_API_KEY`); never print them or put them in pages, settings, the ledger or commits.
- Headless builds started by `tools/site_runner.py` follow only the prompt they are given; the batch workflow above doesn't apply to them.
- With the Sheets ledger in GitHub mode (`runner.mode` is `github` in `state`), GitHub Actions handles dashboard batches and Generate presses through `.github/workflows/website-generator.yml`, which runs `tools/site_runner.py cloud`, so no computer is needed. Don't also run those batches here unless the operator asks.
- Every contact-form submission needs the operator's approval in the chat, and CAPTCHAs are never solved; see "Outreach approval" in `SKILL.md`.
- Tests: `python -m unittest discover -s tests` and `node --test apps-script/test/ledger.test.mjs`. `python tools/site_runner.py doctor` checks the generator's setup without changing anything.
