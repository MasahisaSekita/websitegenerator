# Website production

On Windows, use `python` in place of `python3`, or the full interpreter path when `python` is the Microsoft Store placeholder (see “Running on Windows” in SKILL.md).

`build_mode` in `settings.json` is `html`. Each website is one self-contained HTML page written from the business's own website: its real services, wording, contact details and photos, following [the website prompt](website-prompt.md). There is no Node, React or build step. Later these pages connect to an HTML and Apps Script backend; for now their contact form only opens the visitor's email app.

## One business, step by step

Run these from the application root with the job's owner ID (for example `builder-JOB_ID`).

1. **Prepare.** This moves the job reviewing → extracting → building.

   ```sh
   python3 tools/site_runner.py prepare --job JOB_ID --worker OWNER_ID --evidence runs/scouting/BATCH_ID/cache/DOMAIN
   ```

   - With `--evidence`, it reuses the cached Firecrawl pages from screening.
   - Without it, it scrapes the homepage (with a screenshot) and up to two inner pages (services, about, contact) into `runs/JOB_ID/evidence/`.
   - It writes `runs/JOB_ID/brief.md` and `brief.json`, and downloads up to 12 of the business's own photos into `runs/JOB_ID/site/assets/`, logos and the largest photos first.
   - The brief lists the contact details with their sources, the address, hours lines, links, the brand colors used in the site's code, the photos, and the cleaned page text.
2. **Write the page.** Follow [website-prompt.md](website-prompt.md) and write `runs/JOB_ID/site/index.html`.
3. **Check it** and fix everything listed:

   ```sh
   python3 tools/html_site.py check --file runs/JOB_ID/site/index.html --name "NAME" --phone "PHONE" --email "EMAIL" --image-host DOMAIN
   ```

4. **Finish.** This checks again, embeds the photos and writes the single-file website `runs/JOB_ID/NAME.html`.

   ```sh
   python3 tools/site_runner.py finish --job JOB_ID --worker OWNER_ID
   ```

   - It then uploads the file to JetAI as a draft prototype and moves the job checking → delivered with `qa_passed`, `site_file`, `workspace` and `jetai`.
   - If the checker still finds problems, the job goes back to building with the first problem in its detail. Fix them and run `finish` again.
   - `--no-upload` skips JetAI.
   - A failed upload still delivers the file, and records the error in `jetai.error` and the job detail.

The website generator, which runs the dashboard's Generate buttons, follows the same steps: `python3 tools/site_runner.py run --job JOB_ID` for one job, or `watch` to serve Generate requests. Headless Claude Code writes the page there, and the generator sends checker problems back to it for up to `generator.repair_rounds` more passes.

## What the checker enforces

- **Head and structure.**
  - `<!doctype html>`, `lang`, UTF-8, a viewport, a title and a meta description.
  - `noindex, nofollow`, because these are unsolicited previews.
  - Exactly one `<h1>`.
- **Business details.**
  - The business name appears in the title and on the page.
  - A tap-to-call link for the phone number and a `mailto:` link for the email, when the old site linked to them or showed them on two or more pages.
- **External resources.**
  - No external scripts, frames (except a Google Maps embed), stylesheets other than Google Fonts, `@import`, `<base>`, forms that post anywhere, `javascript:` links or meta refresh.
  - Inline scripts may not make network requests, use storage or redirect, except to open a `mailto:` draft.
- **Images.**
  - Images come from `site/assets/` or the business's own https domain, and every `<img>` has `alt`.
- **Content.**
  - Every `href="#id"` has a matching `id`.
  - No placeholder text or `example.com` links.
- **Size.**
  - Markup and CSS under 400,000 characters before the photos are embedded.
  - The finished file under 4,800,000 characters (JetAI accepts 5,000,000).
  - Embedded photos are limited to 3 MB.

The checker can't judge truthfulness or design quality. The page writer's own review against the prompt's checklist covers those.

## JetAI

- **Where uploads go.** To JetAI prototypes at `jetai.api_base` (`https://slides.yobolabs.ai/api/v1`), with `Authorization: Bearer` and the key `JETAI_API_KEY` from `.env`. The key is never printed, logged or written to the ledger.
- **What an upload looks like.**
  - Each website is an `html` prototype named `NAME · website preview`, with a slug of the business name plus the end of the job ID.
  - Generating the same business again replaces that prototype's html instead of creating another one.
  - A taken name or slug gets a numbered variant.
- **Drafts and publishing.**
  - Uploads stay drafts, visible only inside the JetAI organization.
  - Publishing makes the page public. Do it only when the operator asks for that business: `python3 tools/jetai.py publish --id PROTOTYPE_ID`, or set `jetai.publish` to `true` to publish every upload.
- **Landing pages.** Microsites store their content as Puck component JSON, not HTML, so websites go to prototypes.
- **Checks and links.**
  - `python3 tools/jetai.py ping` checks the key and address (read-only).
  - The API doesn't return a viewing link for prototypes. Set `jetai.app_url` to a link pattern such as `https://…/{id}` to show an "Open in JetAI" link in the dashboards.

## Website generator settings

The `generator` section of `settings.json`:

| Setting | Meaning |
|---|---|
| `model` | The Claude Code model for headless builds |
| `max_parallel` | Builds at once, 1–5 (each also needs a free ledger worker slot) |
| `poll_seconds` | How often the watcher checks for requests |
| `max_turns`, `timeout_minutes` | Limits for one Claude Code pass |
| `repair_rounds` | Extra passes for checker problems |
| `scrape_pages` | Pages read per business when no evidence exists |
| `claude_cli` | Path to the Claude Code CLI. When empty, it uses `claude` on PATH or the copy bundled with the Claude desktop app |
| `cloud_budget_minutes` | On GitHub, stop starting new work after this many minutes (the job's limit is 300) |

Headless Claude Code runs restricted, with these flags:

- `--restricted`: file tools only, confined to the job folder.
- `--strict-mcp-config`: no MCP connectors.
- `--permission-prompts none`: anything that would need approval is refused.

The page writer reads untrusted scraped text, so it gets no shell, web access or connectors. It must be signed in once with `claude auth login`, or be given `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` in the environment. `python3 tools/site_runner.py doctor` checks everything without changing anything.

## On GitHub Actions

`.github/workflows/website-generator.yml` runs everything above without a computer; the Apps Script dashboard starts it (see `apps-script/README.md`, "Run on GitHub").

1. `site_runner.py pending` checks for work, so an empty run ends in seconds.
2. `site_runner.py cloud` finds targets for queued dashboard batches, then builds every requested website.
3. Finished pages go to JetAI and to the ledger owner's Google Drive (`save-site`). `site_file` then holds the Drive link, because GitHub's machine is wiped after each run.
4. Claude Code signs in with the `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` secret.

Logs show job IDs, not business names.

Target finding there is `tools/discover.py`, with these settings under `discovery`:

| Setting | Meaning |
|---|---|
| `first_result` | First search position used, 91 = Google's page 10 (the manual workflow's rule) |
| `results` | Results requested per search (Firecrawl's maximum is 100; 2 credits per 10) |
| `max_queries` | Query variants tried per batch |
| `max_candidates` | Websites screened per batch at most |
| `country` | Search country, and the country assumed for phone numbers without a + prefix |

Directories, social sites and businesses already in the ledger are skipped before anything is scraped.

## Legacy template mode

`build_mode: quick-template` is the earlier volume mode. It uses `templates/electrician/` (a prebuilt React site) with only the business name, phone, email, address and theme color changed:

```sh
./website --template electrician --name "Bright Electrical" --theme-color "#2563eb" --phone "+44 20 7946 0958" --email "hello@business.com"
```

It writes `runs/quick/ID/site/` and a single-file `runs/quick/ID/NAME.html`. After editing the template, run `python3 tools/quick_site.py prepare --template electrician` once. Use this mode only when the operator asks for it.

## Vercel

These steps apply only when `delivery` is `vercel`.

1. Put the finished single-file website alone in a folder as `index.html`, for example `runs/JOB_ID/deploy/index.html`.
2. Deploy that folder to a new project named `revamp-JOB_ID` in `vercel_scope`, using the command in `vercel_cli`:

   ```sh
   npx --yes vercel@59.16.0 link --yes --project revamp-JOB_ID --scope VERCEL_SCOPE
   npx --yes vercel@59.16.0 deploy --prod --yes --scope VERCEL_SCOPE
   ```

3. Before deploying, verify that `.vercel/project.json` names the new project. Never touch existing projects, account settings or domains. Deployment protection that blocks visitors is a blocker; don't change account-wide settings.
4. Verify the public URL without signing in before any outreach. Hosting prices aren't known from a deploy, so never promise a price, free hosting or a transfer.

Then continue with [outreach](outreach.md), which needs the operator's approval for every submission.
