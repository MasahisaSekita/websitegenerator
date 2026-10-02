// Local preview of the Apps Script edition: the real src/*.gs code on in-memory Google services.
//
//   node apps-script/dev/server.mjs [--demo] [--port 8787] [--latency 350]
//
// GET  /          the dashboard (doGet), with a google.script.run shim that calls the .gs functions
//                 ?as=anonymous shows the lock screen; ?as=someone@example.com tests the allowlist
// POST /exec      the agent API (doPost), answered with the same 302 redirect Apps Script uses
//
// Data lives in memory and resets when the server stops.
import http from 'node:http';
import { createRuntime } from './gas.mjs';
import { seedDemo } from './demo.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const port = Number(option('--port', process.env.PORT || 8787));
const latency = Number(option('--latency', 350));
const owner = 'owner@example.com';

const gas = createRuntime({ owner, viewer: owner });
gas.call('setup');
if (argv.includes('--demo')) seedDemo(gas);

const SHIM = `<script>
(function () {
  var as = new URLSearchParams(location.search).get('as') || 'owner';
  function runner(success, failure) {
    return new Proxy({}, {
      get: function (target, name) {
        if (name === 'withSuccessHandler') return function (fn) { return runner(fn, failure); };
        if (name === 'withFailureHandler') return function (fn) { return runner(success, fn); };
        if (name === 'withUserObject') return function () { return runner(success, failure); };
        return function () {
          var args = Array.prototype.slice.call(arguments);
          fetch('/rpc/' + encodeURIComponent(String(name)) + '?as=' + encodeURIComponent(as), {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args)
          }).then(function (response) { return response.json(); }).then(function (reply) {
            if (reply.ok) { if (success) success(reply.result); }
            else if (failure) failure(new Error(reply.error));
          }).catch(function (error) { if (failure) failure(error); });
        };
      }
    });
  }
  window.google = { script: { run: runner(null, null) } };
})();
</script>`;

const echoes = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const viewerFor = as => (as === 'owner' ? owner : as === 'anonymous' ? '' : as);

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) request.destroy(new Error('Body too large'));
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function send(response, status, body, type = 'application/json; charset=utf-8', headers = {}) {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers });
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (request.method === 'GET' && url.pathname === '/') {
      const page = gas.call('doGet');
      const head = `<title>${page.title}</title><meta name="viewport" content="${page.meta.viewport || 'width=device-width'}">${SHIM}`;
      return send(response, 200, page.getContent().replace('<head>', '<head>' + head), 'text/html; charset=utf-8');
    }
    if (request.method === 'POST' && url.pathname.startsWith('/rpc/')) {
      const name = decodeURIComponent(url.pathname.slice(5));
      const args = JSON.parse((await readBody(request)) || '[]');
      await sleep(latency);
      // google.script.run can call any global function whose name does not end in "_".
      if (name.endsWith('_') || !gas.publicFunctions().includes(name)) {
        return send(response, 200, JSON.stringify({ ok: false, error: `Script function not found: ${name}` }));
      }
      try {
        const result = gas.as(viewerFor(url.searchParams.get('as') || 'owner'), name, ...args);
        return send(response, 200, JSON.stringify({ ok: true, result: result === undefined ? null : JSON.parse(JSON.stringify(result)) }));
      } catch (error) {
        return send(response, 200, JSON.stringify({ ok: false, error: error.message }));
      }
    }
    if (request.method === 'POST' && url.pathname === '/exec') {
      const contents = await readBody(request);
      await sleep(latency);
      const output = gas.as('', 'doPost', { postData: { contents, type: request.headers['content-type'] || '' }, parameter: {} });
      const key = Math.random().toString(36).slice(2);
      echoes.set(key, output.getContent());
      return send(response, 302, '', 'text/html; charset=utf-8', { Location: `/echo?user_content_key=${key}` });
    }
    if (request.method === 'GET' && url.pathname === '/echo') {
      const key = url.searchParams.get('user_content_key');
      if (!echoes.has(key)) return send(response, 404, 'Not found', 'text/plain');
      const body = echoes.get(key);
      echoes.delete(key);
      return send(response, 200, body);
    }
    return send(response, 404, 'Not found', 'text/plain');
  } catch (error) {
    console.error(error);
    return send(response, 500, JSON.stringify({ ok: false, error: error.message }));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Dashboard:        http://127.0.0.1:${port}/   (?as=anonymous shows the lock screen)`);
  console.log(`Agent API:        REVAMP_SHEETS_URL=http://127.0.0.1:${port}/exec`);
  console.log(`Local-only token: REVAMP_SHEETS_TOKEN=${gas.props.get('REVAMP_API_TOKEN')}`);
  console.log(`Local-only key:   ${gas.props.get('REVAMP_DASHBOARD_KEY')}`);
  console.log(argv.includes('--demo') ? 'Seeded with demo data. Stop with Ctrl+C.' : 'Empty ledger. Add --demo for sample data. Stop with Ctrl+C.');
});
