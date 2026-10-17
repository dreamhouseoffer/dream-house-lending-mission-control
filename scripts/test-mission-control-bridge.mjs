// Contract tests for the server-only mc-bridge read client. All transports here are SYNTHETIC test fixtures
// (an injected function or a throwaway loopback server); no real bridge, credential or task data is used.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, createHmac } from 'node:crypto';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  bridgeGet,
  canonical,
  checkCapabilities,
  checkRunList,
  checkTaskDetail,
  checkTaskList,
  countByBucket,
  failureCopy,
  filterTasks,
  nodeTransport,
  observationState,
  readBridgeConfig,
  sign,
  taskCreateCapability,
} from '../src/lib/mission-control/bridge-client.mjs';
import { resolveViewState, displayTotal } from '../src/lib/mission-control/capabilities.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const src = (p) => readFile(join(ROOT, p), 'utf8');
const SECRET = 'synthetic-test-secret-0123456789abcdef'; // test-only, >= 32 bytes
const NOW = Date.parse('2026-10-16T12:00:00Z');
const config = readBridgeConfig({ url: 'http://127.0.0.1:9130', secret: SECRET });

// Independent re-statement of the bridge protocol (mc-bridge-v1), not an import of private bridge code.
function expectedSig(secret, method, target, ts, nonce, body = Buffer.alloc(0)) {
  const c = ['mc-bridge-v1', method, target, ts, nonce, createHash('sha256').update(body).digest('hex')].join('\n');
  return createHmac('sha256', Buffer.from(secret, 'utf8')).update(c).digest('hex');
}

const ui = (state, native) => ({ state, reason: `r:${state}`, native_status: native, latest_run_outcome: null, heartbeat: 'unavailable' });
const FIXTURE_TASKS = [
  { id: 't_aaaaaa01', title: 'Summarize pipeline', assignee: 'hermes', status: 'running', created_at: 1_760_000_000, ui: ui('running_unverified', 'running') },
  { id: 't_aaaaaa02', title: 'Draft note', assignee: 'hermes', status: 'done', created_at: 1_760_000_100, ui: ui('completed', 'done') },
  { id: 't_aaaaaa03', title: 'Manual done', assignee: 'milo', status: 'done', created_at: 1_760_000_200, ui: ui('completed_unverified', 'done') },
  { id: 't_aaaaaa04', title: 'Crashed job', assignee: 'hermes', status: 'blocked', created_at: 1_760_000_300, ui: ui('failed', 'blocked') },
  { id: 't_aaaaaa05', title: 'Old thing', assignee: 'hermes', status: 'archived', created_at: 1_760_000_400, ui: ui('archived', 'archived') },
  { id: 't_aaaaaa06', title: 'Waiting', assignee: 'hermes', status: 'todo', created_at: 1_760_000_500, ui: ui('queued', 'todo') },
];
const listPayload = (over = {}) => ({ tasks: FIXTURE_TASKS, observed_at: new Date(NOW).toISOString(), ...over });

function fixture(status, payload, contentType = 'application/json; charset=utf-8') {
  const calls = [];
  const transport = async (req) => {
    calls.push(req);
    return { status, contentType, body: Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)) };
  };
  return { transport, calls };
}

test('canonical string and HMAC match the mc-bridge-v1 protocol exactly', () => {
  assert.equal(
    canonical('get', '/v0/tasks?status=done', '1760000000', 'nonce_nonce_nonce_1', Buffer.alloc(0)),
    'mc-bridge-v1\nGET\n/v0/tasks?status=done\n1760000000\nnonce_nonce_nonce_1\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
  const key = Buffer.from(SECRET, 'utf8');
  assert.equal(sign(key, 'GET', '/v0/tasks', '1760000000', 'nonce_nonce_nonce_1'), expectedSig(SECRET, 'GET', '/v0/tasks', '1760000000', 'nonce_nonce_nonce_1'));
});

test('config validation fails closed and never echoes the URL or secret', () => {
  assert.deepEqual(readBridgeConfig({}), { configured: false, reason: 'not_configured' });
  assert.equal(readBridgeConfig({ url: 'http://127.0.0.1:9130' }).reason, 'incomplete_config');
  assert.equal(readBridgeConfig({ secret: SECRET }).reason, 'incomplete_config');
  for (const url of ['ftp://127.0.0.1:1', 'http://u:p@127.0.0.1:1', 'http://127.0.0.1:1/v0', 'http://127.0.0.1:1/?x=1', 'not a url']) {
    const r = readBridgeConfig({ url, secret: SECRET });
    assert.equal(r.configured, false, url);
    assert.ok(!JSON.stringify(r).includes('127.0.0.1') && !JSON.stringify(r).includes(SECRET));
  }
  assert.equal(readBridgeConfig({ url: 'http://127.0.0.1:9130', secret: 'short' }).reason, 'secret_too_short');
  assert.equal(config.configured, true);
  assert.equal(config.origin, 'http://127.0.0.1:9130');
});

test('signed GET sends timestamp, unique nonce and a verifiable signature with a bounded timeout', async () => {
  const { transport, calls } = fixture(200, listPayload());
  const r1 = await bridgeGet(config, '/v0/tasks', { transport, now: () => NOW, timeoutMs: 999_999 });
  const r2 = await bridgeGet(config, '/v0/tasks', { transport, now: () => NOW });
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  const [a, b] = calls;
  assert.equal(a.method, 'GET');
  assert.equal(a.target, '/v0/tasks');
  assert.equal(a.headers['x-mc-timestamp'], String(Math.floor(NOW / 1000)));
  assert.match(a.headers['x-mc-nonce'], /^[A-Za-z0-9_-]{16,128}$/);
  assert.notEqual(a.headers['x-mc-nonce'], b.headers['x-mc-nonce']);
  assert.equal(a.headers['x-mc-signature'], expectedSig(SECRET, 'GET', '/v0/tasks', a.headers['x-mc-timestamp'], a.headers['x-mc-nonce']));
  assert.equal(a.timeoutMs, 20_000, 'timeout is clamped');
  assert.ok(!('origin' in a.headers) && !('sec-fetch-site' in a.headers));
  assert.ok(!JSON.stringify(a.headers).includes(SECRET));
});

test('unconfigured bridge makes no request and reports not_configured', async () => {
  const { transport, calls } = fixture(200, listPayload());
  const r = await bridgeGet(readBridgeConfig({}), '/v0/tasks', { transport });
  assert.deepEqual(r, { ok: false, state: 'not_configured', code: 'not_configured' });
  assert.equal(calls.length, 0);
  assert.equal((await bridgeGet(config, '/etc/passwd', { transport })).code, 'invalid_target');
});

test('real list response maps native vs verified status, buckets, filters, search and counts', async () => {
  const { transport } = fixture(200, listPayload());
  const r = await bridgeGet(config, '/v0/tasks', { transport, now: () => NOW });
  const list = checkTaskList(r.data);
  assert.ok(list);
  const byId = Object.fromEntries(list.tasks.map((t) => [t.id, t]));
  assert.equal(byId.t_aaaaaa02.bucket, 'completed');
  assert.equal(byId.t_aaaaaa02.verified, true);
  assert.equal(byId.t_aaaaaa03.bucket, 'completed');
  assert.equal(byId.t_aaaaaa03.verified, false, 'manual done is not verified');
  assert.equal(byId.t_aaaaaa01.bucket, 'running');
  assert.equal(byId.t_aaaaaa01.ui.native_status, 'running');
  assert.equal(byId.t_aaaaaa05.bucket, null, 'archive is not a verified cancel');
  assert.equal('heartbeat' in byId.t_aaaaaa01.ui, false, 'no heartbeat claim is carried through');
  assert.deepEqual(filterTasks(list.tasks, { status: 'completed' }).map((t) => t.id), ['t_aaaaaa02', 't_aaaaaa03']);
  assert.deepEqual(filterTasks(list.tasks, { status: 'canceled' }), []);
  assert.deepEqual(filterTasks(list.tasks, { q: 'MILO' }).map((t) => t.id), ['t_aaaaaa03']);
  assert.deepEqual(filterTasks(list.tasks, { status: 'failed', q: 'crash' }).map((t) => t.id), ['t_aaaaaa04']);
  const counts = countByBucket(list.tasks);
  assert.equal(counts.running, 1);
  assert.equal(counts.completed, 2);
  assert.equal(counts.verified_completed, 1);
  assert.equal(counts.failed, 1);
  assert.equal(counts.canceled, 0);
  assert.equal(counts.unbucketed, 1);
  const state = resolveViewState({ source: { state: 'observed' }, items: list.tasks, observedAt: list.observedAt, now: NOW });
  assert.equal(state, 'ready');
  assert.equal(displayTotal(state, counts.running), '1');
});

test('empty real list is an honest zero; stale observation is flagged', () => {
  const list = checkTaskList(listPayload({ tasks: [] }));
  assert.equal(resolveViewState({ source: { state: 'observed' }, items: list.tasks, observedAt: list.observedAt, now: NOW }), 'empty');
  assert.equal(observationState(list.observedAt, NOW), 'observed');
  assert.equal(observationState(list.observedAt, NOW + 61_000), 'stale');
  assert.equal(observationState('garbage', NOW), 'unverified');
  assert.equal(resolveViewState({ source: { state: 'observed' }, items: [1], observedAt: list.observedAt, now: NOW + 120_000 }), 'stale');
});

test('schema checks reject malformed payloads whole instead of half-trusting them', () => {
  assert.equal(checkTaskList({ tasks: 'nope', observed_at: new Date(NOW).toISOString() }), null);
  assert.equal(checkTaskList(listPayload({ observed_at: 'yesterday' })), null);
  assert.equal(checkTaskList(listPayload({ tasks: [...FIXTURE_TASKS, { id: '../etc', status: 'done', ui: ui('completed', 'done') }] })), null);
  assert.equal(checkTaskList(listPayload({ tasks: [{ id: 't_abcdef', status: 'done' }] })), null, 'missing ui');
  const odd = checkTaskList(listPayload({ tasks: [{ id: 't_abcdef', status: 'x', nested: { a: 1 }, ui: ui('made_up', 'x') }] }));
  assert.equal(odd.tasks[0].ui.state, 'unknown');
  assert.equal(odd.tasks[0].bucket, null);
  assert.equal('nested' in odd.tasks[0], false);
  const detail = checkTaskDetail({ task: FIXTURE_TASKS[1], runs: [{ id: 1, profile: 'hermes', outcome: 'completed', started_at: 1, ended_at: 9 }], events: [{ kind: 'x', deep: {} }], latest_summary: 'done ok', observed_at: new Date(NOW).toISOString() });
  assert.equal(detail.task.verified, true);
  assert.equal(detail.runs[0].profile, 'hermes');
  assert.deepEqual(detail.events, [{ kind: 'x' }]);
  assert.equal(detail.latestSummary, 'done ok');
  assert.equal(checkTaskDetail({ task: FIXTURE_TASKS[1], runs: 'x', observed_at: new Date(NOW).toISOString() }), null);
  assert.equal(checkRunList({ task_id: 't_aaaaaa02', runs: [], observed_at: new Date(NOW).toISOString() }, 't_aaaaaa02').runs.length, 0);
  assert.equal(checkRunList({ task_id: 't_other1', runs: [], observed_at: new Date(NOW).toISOString() }, 't_aaaaaa02'), null, 'mismatched id');
});

test('HTTP and transport failures map to explicit disconnected/error states, never synthetic data', async () => {
  const cases = [
    [401, { error: 'unauthorized' }, 'unauthorized'],
    [404, { error: 'not_found' }, 'not_found'],
    [503, { error: 'hermes_unavailable' }, 'hermes_unavailable'],
    [504, { error: 'hermes_timeout' }, 'hermes_unavailable'],
    [500, { error: 'internal_error' }, 'error'],
  ];
  for (const [status, body, state] of cases) {
    const r = await bridgeGet(config, '/v0/tasks', { transport: fixture(status, body).transport });
    assert.equal(r.ok, false);
    assert.equal(r.state, state, String(status));
    assert.equal('data' in r, false);
  }
  assert.equal((await bridgeGet(config, '/v0/tasks', { transport: fixture(200, '<html>', 'text/html').transport })).state, 'bad_payload');
  assert.equal((await bridgeGet(config, '/v0/tasks', { transport: fixture(200, '{bad').transport })).code, 'malformed_json');
  for (const code of ['timeout', 'refused', 'network']) {
    const r = await bridgeGet(config, '/v0/tasks', { transport: async () => { throw Object.assign(new Error(code), { code }); } });
    assert.deepEqual(r, { ok: false, state: 'offline', code });
  }
  assert.equal(failureCopy('not_configured').title, 'Mac execution bridge is not connected');
  assert.equal(failureCopy('offline').kind, 'offline');
  assert.equal(failureCopy('???').kind, 'error');
});

test('default transport against a synthetic loopback server: exact Host, no browser headers, timeout and size cap', async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers });
    if (req.url === '/v0/slow') return; // never answers
    if (req.url === '/v0/big') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ pad: 'x'.repeat(5000) }));
      return;
    }
    const h = req.headers;
    const ok = h['x-mc-signature'] === expectedSig(SECRET, req.method, req.url, h['x-mc-timestamp'], h['x-mc-nonce']);
    res.writeHead(ok ? 200 : 401, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(ok ? { ops: ['GET /v0/tasks'], unsupported: { 'task.create': 'disabled' }, read_only: true } : { error: 'unauthorized' }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const cfg = readBridgeConfig({ url: `http://127.0.0.1:${port}`, secret: SECRET });
  try {
    const caps = await bridgeGet(cfg, '/v0/capabilities');
    assert.equal(caps.ok, true);
    assert.equal(seen[0].headers.host, `127.0.0.1:${port}`);
    assert.equal(seen[0].headers.origin, undefined);
    assert.equal(seen[0].headers['sec-fetch-site'], undefined);
    const wrong = await bridgeGet(readBridgeConfig({ url: `http://127.0.0.1:${port}`, secret: `${SECRET}-wrong` }), '/v0/capabilities');
    assert.equal(wrong.state, 'unauthorized');
    const started = Date.now();
    const slow = await bridgeGet(cfg, '/v0/slow', { timeoutMs: 300 });
    assert.deepEqual(slow, { ok: false, state: 'offline', code: 'timeout' });
    assert.ok(Date.now() - started < 2000);
    const big = await bridgeGet(cfg, '/v0/big', { maxBytes: 1024 });
    assert.equal(big.state, 'bad_payload');
    assert.equal(typeof nodeTransport, 'function');
  } finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
  const refused = await bridgeGet(readBridgeConfig({ url: `http://127.0.0.1:${port}`, secret: SECRET }), '/v0/tasks', { timeoutMs: 500 });
  assert.equal(refused.state, 'offline');
});

test('task creation stays unavailable even when the bridge allows it', () => {
  assert.equal(taskCreateCapability(null).enabled, false);
  const ro = taskCreateCapability(checkCapabilities({ ops: ['GET /v0/tasks'], unsupported: { 'task.create': 'disabled: read-only' }, read_only: true }));
  assert.equal(ro.enabled, false);
  assert.match(ro.reason, /read-only/);
  const rw = taskCreateCapability(checkCapabilities({ ops: ['GET /v0/tasks', 'POST /v0/tasks'], unsupported: {}, read_only: false }));
  assert.equal(rw.enabled, false);
  assert.match(rw.reason, /not implemented/);
  assert.equal(checkCapabilities({ ops: 'x' }), null);
});

test('server-only wrapper reads non-public env, never caches or logs, and routes are read-only and auth-guarded', async () => {
  const wrapper = await src('src/lib/mission-control/bridge.ts');
  assert.match(wrapper, /process\.env\.MC_BRIDGE_URL/);
  assert.match(wrapper, /process\.env\.MC_BRIDGE_SECRET/);
  assert.match(wrapper, /noStore\(\)/);
  assert.match(wrapper, /hasHeadquartersAccess/);
  const client = await src('src/lib/mission-control/bridge-client.mjs');
  for (const [f, text] of [['bridge.ts', wrapper], ['bridge-client.mjs', client]]) {
    assert.doesNotMatch(text, /NEXT_PUBLIC|console\.|^["']use client["']/m, f);
  }
  for (const r of ['src/app/api/control/tasks/route.ts', 'src/app/api/control/tasks/[id]/route.ts', 'src/app/api/control/tasks/[id]/runs/route.ts']) {
    const text = await src(r);
    assert.match(text, /if \(!\(await hasControlAccess\(\)\)\)[^\n]*status: 401/, r);
    assert.match(text, /"Cache-Control": "no-store"/, r);
    assert.doesNotMatch(text, /export async function (POST|PUT|PATCH|DELETE)/, r);
    assert.doesNotMatch(text, /process\.env|console\./, r);
  }
  for (const f of ['src/app/tasks/[id]/page.tsx', 'src/components/mc/task-views.tsx']) {
    const text = await src(f);
    assert.doesNotMatch(text, /^["']use client["']/m, f);
    assert.doesNotMatch(text, /process\.env|fetch\(|Math\.random|localStorage|<form[^>]*method="post"/i, f);
  }
});

test('Home and Tasks read real records when available and are not hardcoded to permanent disconnection', async () => {
  const home = await src('src/app/page.tsx');
  assert.match(home, /await readTasks\(\)/);
  assert.match(home, /displayTotal\(taskState, counts\?\.running\)/);
  assert.match(home, /displayTotal\(approvalState, undefined\)/, 'approvals stay unknown: ledger not exposed');
  assert.match(home, /<BridgeNotice failure=\{list\}/);
  const tasks = await src('src/app/tasks/page.tsx');
  assert.match(tasks, /await Promise\.all\(\[readTasks\(\), readCapabilities\(\)\]\)/);
  assert.match(tasks, /filterTasks\(list\.tasks, \{ status, q \}\)/);
  assert.match(tasks, /role="search"/);
  const views = await src('src/components/mc/task-views.tsx');
  assert.match(views, /href=\{`\/tasks\/\$\{task\.id\}`\}/, 'rows drill through to the task');
  assert.match(views, /Verified run receipt/);
  assert.match(views, /not a runtime heartbeat/);
  assert.doesNotMatch(views, /state: "live"/);
});

test('public repo tracks no private bridge sources, config, secrets or data', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n');
  for (const f of files) {
    assert.doesNotMatch(f, /(^|\/)bridge\/(server|lib\/(auth|status|store|hermes|approvals))\.js$|mc-bridge.*\.(db|json)$|bridge\/config\.json$|\.env(\.|$)/, f);
  }
});
