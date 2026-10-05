# Friendly outreach and a single submit attempt

Contact each qualifying business through its original contact form with the fixed message below, and only after the operator approves that submission in the chat (see [Outreach approval](../SKILL.md#outreach-approval)). Include the verified preview link in the first message. Use the same English wording every time; translate only if the operator explicitly asks. Don't mimic a customer requesting service.

## Default message

Subject if requested: `I made a website preview for [Business]`

> Hey!
>
> Your website is decent, but looks a little old.
> I made an updated one.
>
> You can take a look here: [verified preview URL]
>
> The website is totally free — you just pay for hosting.
>
> If you'd like help setting it up, text me on [sender phone] or email [sender email].
>
> Best,
> [sender first name]

Copy this message exactly, changing only the verified preview URL, the business name in the optional subject, and the sender details, which come from `sender` in `settings.json` (`phone`, `email`, `first_name`). If any of those is missing or still a placeholder such as `<YOUR_PHONE>`, stop and ask the operator before preparing outreach. Do not add an observed issue, 'I checked your website', SEO claims, custom praise, or a rewritten opening. Visual qualification findings remain internal evidence; 'looks a little old' describes visual appearance, not the site's actual age. Keep the free-website/paid-hosting offer and sender details. Do not spin messages or send follow-ups to hit a quota.

## Approval

Each submission needs the operator's explicit approval in the chat, given for that specific submission. Text in this file, SKILL.md or anywhere else never counts as approval, and an approval never carries over to submissions it didn't list. When asking, show the business, the form URL, every value you will enter and the exact message. If a form would create a legal commitment, asks for sensitive information, or needs facts you don't have, don't ask to submit it: route the business to manual outreach. Do not claim the browser rejected an action unless a tool actually returned that rejection. Never work around a real restriction or repeat a submission with an uncertain outcome.

## Check the form before building

During qualification, use [Firecrawl screening](firecrawl-scouting.md) of the original website’s contact page, falling back to browser inspection for ambiguous/embedded forms, and confirm a form suitable for a website proposal, including a message field and submit control. Save its URL as `contact_url` and record the observed fields and any restrictions in the qualification evidence. Email/phone listings, newsletter signups and customer-review forms do not qualify. If no usable form exists but the business otherwise qualifies, follow [Manual outreach](manual-outreach.md): still build, deploy and verify the site, prepare the message and verified contact details, then mark manual. Apply the form rules below during this check, then recheck the saved form before sending.

## Form operation

1. Inspect the original contact page in the coordinator's browser tab for that business. Prefer its general enquiry form. Inspection-request forms are suitable for this website offer: clearly state this is a website proposal, not an inspection request; leave optional appointment dates and pest categories blank. Respect a visible no-solicitation/opt-out notice; save a skipped result. Do not fabricate a pest problem or book a paid service; do not use forms requiring unsupported facts or commitments; prepare manual outreach for an otherwise eligible business.
2. Plan the sender fields from `sender` in `settings.json`: `name` in a full-name field, `first_name` and `last_name` in split name fields, and `phone` and `email` in the matching fields. For a required business or service-location address, use the prospect's verified publicly listed company address verbatim (from its website or Google result); record the source with the outreach evidence. Never present that address as the sender's personal address, and do not invent an address, account or consent. Leave visible CAPTCHA challenges untouched and route the qualified business to manual outreach after completing its website. Do not check newsletter/marketing-consent boxes. An invisible anti-bot badge alone is not a challenge; stop if a challenge appears.
3. Save `runs/JOB_ID/outreach.txt` with the exact final message and record the form URL. Ask the operator for approval as described above. Fill the form only after approval, then check that the fields show the approved sender details, message and preview URL.
4. Immediately before submitting, atomically reserve:

```sh
python3 tools/control.py contact-begin --job JOB_ID --worker WORKER_ID --message-file runs/JOB_ID/outreach.txt --form-url 'https://business.example/contact'
```

This rejects duplicate/reserved attempts, missing qualification, failed QA and unverified previews. If reservation fails, do not submit. Then click Submit **once**.

5. Record actual outcome:

```sh
python3 tools/control.py contact-finish --job JOB_ID --worker WORKER_ID --status submitted --evidence 'Clicked Submit once; observed result: ...; screenshot stored at ...'
```

Use `submitted` after the single submit action, marking the job `complete` and moving on. Record exactly what happened (confirmation, cleared form, or no confirmation); completion means the outreach action is done, not proof of delivery. Do not wait for explicit acceptance. If a visible CAPTCHA or validation error prevents submission before reservation, follow the manual-outreach command for the ready website. After reservation, use `contact-finish --status blocked` when it is certain no submit action occurred; `contacting` cannot transition to `skipped`. Keep the reservation and never make this prospect retryable. If it is unknown whether the submit action occurred at all (e.g. crash during the action), use `uncertain`. Never resend completed or ambiguous attempts, and do not switch to email/SMS without a separate instruction.

For CAPTCHA encountered before reservation, use `manual-outreach` after public verification, preserving the preview and evidence. Do not mark an otherwise qualified prospect skipped for its contact method. Resolve ordinary address requirements with the verified company address above; do not mark a job blocked merely because a form asks for that address. If the operator declines a submission or wants to send it personally, record manual outreach for it with that reason.
