// Demo ledger for the local preview. Every record goes through the real ledger rules
// (claims, stage gates, contact reservations), with a fake clock so the timeline looks lived-in.
// Businesses use the reserved .example domain; nothing here refers to a real company.

const MINUTE = 60 * 1000;

export function seedDemo(gas) {
  const realNow = gas.context.nowIso_;
  let clock = Date.now();
  const at = minutesAgo => { clock = Date.now() - minutesAgo * MINUTE; };
  gas.context.nowIso_ = () => new Date(clock).toISOString().replace(/\.\d{3}Z$/, '+00:00');
  const step = (minutes, name, ...args) => {
    clock += minutes * MINUTE;
    return gas.call(name, ...args);
  };

  const evidence = (domain, findings) => ({
    reason: findings[0],
    qualification: { findings, mobile_checked: true },
    source_urls: [`https://${domain}/`, `https://${domain}/contact`],
    screenshots: [`runs/scouting/${domain}/home-desktop.png`, `runs/scouting/${domain}/home-mobile.png`],
    contact_url: `https://${domain}/contact`,
  });
  const preview = slug => `https://revamp-${slug}.vercel.app`;
  const message = url => [
    'Hey!', '', 'Your website is decent, but looks a little old.', 'I made an updated one.', '',
    `You can take a look here: ${url}`, '', 'The website is totally free — you just pay for hosting.', '',
    'If you’d like help setting it up, text me on +1 555 0100 or email alex@example.com.', '', 'Best,', 'Alex',
  ].join('\n');

  /** Registers, claims and walks one business through the pipeline up to `until`. */
  function business(batch, name, domain, until, options = {}) {
    const id = step(1, 'addJob_', batch, name, `https://${domain}/`, options.aliases || []).id;
    const worker = options.worker || `builder-${id.slice(5, 11)}`;
    step(1, 'claimJob_', batch, worker);
    const update = (minutes, stage, fields, detail) => step(minutes, 'updateJob_', id, worker, stage, detail || '', fields || null);
    if (until === 'skipped') {
      update(4, 'skipped', null, options.detail || 'Skipped: the current website already looks modern.');
      return id;
    }
    update(5, 'extracting', evidence(domain, options.findings || ['Fixed-width layout leaves the page cramped on phones', 'Service menu text is tiny and low-contrast']), 'Qualified from the saved screenshots; collecting contact details');
    if (until === 'extracting') return id;
    update(3, 'building', { workspace: `runs/quick/${domain.split('.')[0]}/site` }, 'Generating the site from the electrician template');
    if (until === 'building') return id;
    update(1, 'checking', null, 'Checking the generated name, phone and email');
    if (until === 'checking') return id;
    update(2, 'deploying', { qa_passed: true }, 'QA passed; deploying to an isolated Vercel project');
    if (until === 'blocked') {
      update(3, 'blocked', { failure: 'Vercel deployment protection blocked public access' }, options.detail || 'Blocked: the preview asks visitors to log in to Vercel.');
      return id;
    }
    const url = preview(domain.split('.')[0]);
    update(3, 'ready', { preview_url: url, preview_verified: true }, 'Preview verified from a logged-out browser');
    if (until === 'ready') return id;
    if (until === 'manual') {
      step(2, 'manualOutreach_', id, worker, options.detail || 'No usable contact form; the site only lists an email and phone number.', message(url), options.email || '', options.phone || '');
      return id;
    }
    step(2, 'contactBegin_', id, worker, message(url), `https://${domain}/contact`);
    step(1, 'contactFinish_', id, worker, 'submitted', 'Clicked Submit once; the form showed “Thanks, we will be in touch.”');
    return id;
  }

  gas.call('setCapacity_', 3);

  at(29 * 60);
  const cambridge = step(0, 'createBatch_', 'Electricians', 'Cambridge, MA', 3).id;
  business(cambridge, 'Kendall Square Electric', 'kendall-electric.example', 'complete');
  business(cambridge, 'Porter Electrical Services', 'porter-electrical.example', 'skipped', { detail: 'Skipped: already listed as contacted in an earlier batch.' });
  business(cambridge, 'Inman Wiring & Lighting', 'inman-wiring.example', 'complete');
  business(cambridge, 'Alewife Power Co.', 'alewife-power.example', 'complete');
  step(5, 'batchStatus_', cambridge, 'complete');

  at(26 * 60);
  const austin = step(0, 'createBatch_', 'Plumbers', 'Austin, TX', 5).id;
  business(austin, 'Barton Creek Plumbing', 'bartoncreek-plumbing.example', 'skipped', { detail: 'Skipped: visible “no solicitation” notice on the contact page.' });
  step(30, 'cancelBatch_', austin, 'No plumbing template yet; cancelled before any outreach.');

  at(5 * 60);
  const boston = step(0, 'createBatch_', 'Electricians', 'Boston, MA', 8).id;
  business(boston, 'Bright Spark Electric', 'brightspark-electric.example', 'complete', { aliases: ['phone:+16175550142'] });
  business(boston, 'Fenway Electrical Contractors', 'fenway-electrical.example', 'skipped');
  business(boston, 'Harbor Line Electrical', 'harborline-electric.example', 'complete');
  business(boston, 'Beacon Hill Wiring Co.', 'beaconhill-wiring.example', 'manual', { email: 'office@beaconhill-wiring.example', phone: '+16175550188' });
  business(boston, 'South End Sparks', 'southend-sparks.example', 'skipped', { detail: 'Skipped: the business closed; the domain now redirects to a directory.' });
  business(boston, 'Charlestown Circuit', 'charlestown-circuit.example', 'blocked');
  business(boston, 'Jamaica Plain Electric', 'jp-electric.example', 'manual', { detail: 'A visible CAPTCHA protects the only contact form.', email: 'hello@jp-electric.example' });
  // Three parallel workers: one waiting to send, one stalled at QA, one building right now.
  at(17);
  business(boston, 'Back Bay Lighting & Electric', 'backbay-lighting.example', 'ready');
  at(16);
  business(boston, 'Dorchester Electric Service', 'dorchester-electric.example', 'checking', { worker: 'builder-dorchester' });
  at(11);
  business(boston, 'Quincy Power Pros', 'quincypower.example', 'building', { worker: 'builder-quincy' });

  at(22);
  step(0, 'createBatch_', 'Roofers', 'Denver, CO', 10);

  gas.context.nowIso_ = realNow;
  const jobs = gas.call('runCommand_', 'state', {}).jobs;
  const manual = jobs.find(job => job.name === 'Jamaica Plain Electric');
  clock = Date.now() - 50 * MINUTE;
  gas.context.nowIso_ = () => new Date(clock).toISOString().replace(/\.\d{3}Z$/, '+00:00');
  gas.call('setManualSent_', manual.id, true, 'owner@example.com');
  gas.context.nowIso_ = realNow;
}
