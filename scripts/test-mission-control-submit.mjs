// Contract tests for capability-gated dashboard task submission. All transports, templates, keys and secrets are
// SYNTHETIC fixtures; no real bridge, credential or task data is used and nothing is written anywhere.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, createHmac } from 'node:crypto';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bridgeRequest, checkCapabilities, checkCreateResponse, checkTaskDetail, readBridgeConfig, submitTask } from '../src/lib/mission-control/bridge-client.mjs';
import {
  OUTCOMES,
  beginSubmission,
  checkTemplates,
  classifySubmitResponse,
  createCapability,
  isSameOriginMutation,
  outcomeCopy,
  publicTemplates,
  restorePending,
  settleSubmission,
  submissionFingerprint,
  validateCreateRequest,
} from '../src/lib/mission-control/task-submit.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const src = (p) => readFile(join(ROOT, p), 'utf8');
const SECRET = 'synthetic-test-secret-0123456789abcdef';
const NOW = Date.parse('2026-10-16T12:00:00Z');
const config = readBridgeConfig({ url: 'http://127.0.0.1:9130', secret: SECRET });
const KEY = '3f2b8c1e-7a9d-4c4e-9b1a-0123456789ab';
const HEALTH = { id: 'system_health', label: 'Mac system health check', description: 'Read-only summary of this Mac.', body: 'mc-template:system_health/v1', assignee: 'mc-runner' };
const FAIL = { id: 'controlled_failure', label: 'Controlled failure test', description: 'Always fails safely.', body: 'mc-template:controlled_failure/v1', assignee: 'mc-runner' };
const CAPS = { ops: ['GET /v0/tasks', 'POST /v0/tasks'], unsupported: {}, read_only: false, assignees: ['mc-runner'], task_templates: [HEALTH, FAIL] };
const headers = (h) => ({ get: (k) => h[k.toLowerCase()] ?? null });
const ui = (state) => ({ state, reason: 'r', native_status: 'todo', latest_run_outcome: null });
const accepted = (over = {}) => ({
  task: { id: 't_abc123', title: 'Health now', body: HEALTH.body, assignee: 'mc-runner', status: 'todo', ui: ui('queued') },
  deduplicated: false, submitted: true, executed: false, observed_at: new Date(NOW).toISOString(), ...over,
});

function fixture(status, payload, contentType = 'application/json; charset=utf-8') {
  const calls = [];
  const transport = async (req) => {
    calls.push(req);
    return { status, contentType, body: Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)) };
  };
  return { transport, calls };
}
const payload = { title: 'Health now', body: HEALTH.body, assignee: 'mc-runner' };

test('templates are read strictly: exact fields, safe ids/assignees, bounded text, ambiguous duplicates dropped', () => {
  assert.deepEqual(checkTemplates([HEALTH, FAIL]).map((t) => t.id), ['system_health', 'controlled_failure']);
  for (const bad of [
    { ...HEALTH, command: 'rm -rf /' },
    { ...HEALTH, id: 'Bad Id' },
    { ...HEALTH, assignee: '../root' },
    { ...HEALTH, body: '' },
    { ...HEALTH, body: 'x\u0000y' },
    { ...HEALTH, label: 'a\nb' },
    { ...HEALTH, description: 'x'.repeat(501) },
    (({ assignee, ...rest }) => rest)(HEALTH),
    'system_health',
    null,
  ]) assert.deepEqual(checkTemplates([bad]), [], JSON.stringify(bad));
  assert.deepEqual(checkTemplates([HEALTH, { ...HEALTH, label: 'Other' }]), [], 'duplicate id is ambiguous');
  assert.deepEqual(checkTemplates(undefined), []);
  assert.deepEqual(Object.keys(publicTemplates(checkTemplates([HEALTH]))[0]).sort(), ['assignee', 'description', 'id', 'label'], 'body never leaves the server');
});

test('missing capabilities, read-only, no POST op, empty templates or unlisted assignee all fail closed with a reason', () => {
  assert.equal(createCapability(null).enabled, false);
  const cases = [
    { ...CAPS, read_only: true },
    { ...CAPS, ops: ['GET /v0/tasks'] },
    { ...CAPS, task_templates: [] },
    (({ task_templates, ...rest }) => rest)(CAPS),
    { ...CAPS, assignees: ['someone-else'] },
  ];
  for (const c of cases) {
    const r = createCapability(checkCapabilities(c));
    assert.equal(r.enabled, false, JSON.stringify(c));
    assert.ok(r.reason && r.reason.length > 20);
    assert.deepEqual(r.templates, []);
  }
  const ok = createCapability(checkCapabilities(CAPS));
  assert.equal(ok.enabled, true);
  assert.deepEqual(ok.templates.map((t) => t.id), ['system_health', 'controlled_failure']);
});

test('create request validation is strict and derives body/assignee only from the server template', () => {
  const tpls = checkTemplates([HEALTH, FAIL]);
  const ok = validateCreateRequest({ template_id: 'system_health', title: '  Health now ' }, KEY, tpls);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.payload, payload);
  const reject = (input, key = KEY) => validateCreateRequest(input, key, tpls).code;
  assert.equal(reject({ template_id: 'system_health', title: 'x' }, null), 'idempotency_key_required');
  assert.equal(reject({ template_id: 'system_health', title: 'x' }, 'short'), 'idempotency_key_required');
  assert.equal(reject({ template_id: 'system_health', title: 'x' }, 'bad key with spaces!!'), 'idempotency_key_required');
  for (const extra of ['body', 'assignee', 'command', 'model', 'provider', 'path', 'secret']) {
    assert.equal(reject({ template_id: 'system_health', title: 'x', [extra]: 'y' }), 'unexpected_fields', extra);
  }
  assert.equal(reject({ title: 'x' }), 'unexpected_fields');
  assert.equal(reject([]), 'invalid_input');
  assert.equal(reject({ template_id: 'shell', title: 'x' }), 'unknown_template');
  assert.equal(reject({ template_id: 'system_health', title: '   ' }), 'invalid_title');
  assert.equal(reject({ template_id: 'system_health', title: 'x'.repeat(201) }), 'invalid_title');
  assert.equal(reject({ template_id: 'system_health', title: 'a\nb' }), 'invalid_title');
  assert.equal(validateCreateRequest({ template_id: 'system_health', title: 'x' }, KEY, []).code, 'unknown_template', 'no templates -> nothing valid');
});

test('mutations require an explicit same-origin Origin header', () => {
  const url = 'https://board.example.test/api/control/tasks';
  assert.equal(isSameOriginMutation(headers({ origin: 'https://board.example.test' }), url), true);
  assert.equal(isSameOriginMutation(headers({ origin: 'https://board.example.test', 'sec-fetch-site': 'same-origin' }), url), true);
  assert.equal(isSameOriginMutation(headers({}), url), false, 'missing Origin is rejected');
  assert.equal(isSameOriginMutation(headers({ origin: 'https://evil.example' }), url), false);
  assert.equal(isSameOriginMutation(headers({ origin: 'null' }), url), false);
  assert.equal(isSameOriginMutation(headers({ origin: 'https://board.example.test', 'sec-fetch-site': 'cross-site' }), url), false);
  assert.equal(isSameOriginMutation(headers({ origin: 'https://board.example.test', 'sec-fetch-site': 'same-site' }), url), false);
});

test('normal submission sends a signed POST with exactly {title, body, assignee} and the Idempotency-Key', async () => {
  const { transport, calls } = fixture(202, accepted());
  const r = await submitTask(config, payload, KEY, { transport, now: () => NOW });
  assert.equal(r.outcome, 'accepted');
  assert.equal(r.task.id, 't_abc123');
  assert.equal(r.deduplicated, false);
  const [c] = calls;
  assert.equal(c.method, 'POST');
  assert.equal(c.target, '/v0/tasks');
  assert.equal(c.headers['idempotency-key'], KEY);
  assert.deepEqual(Object.keys(JSON.parse(c.body.toString('utf8'))), ['title', 'body', 'assignee']);
  const canon = ['mc-bridge-v1', 'POST', '/v0/tasks', c.headers['x-mc-timestamp'], c.headers['x-mc-nonce'], createHash('sha256').update(c.body).digest('hex')].join('\n');
  assert.equal(c.headers['x-mc-signature'], createHmac('sha256', Buffer.from(SECRET)).update(canon).digest('hex'));
});

test('idempotency key is only attached to POST and must be well-formed', async () => {
  const { transport } = fixture(200, {});
  assert.equal((await bridgeRequest(config, 'GET', '/v0/tasks', { transport, idempotencyKey: KEY })).code, 'invalid_idempotency_key');
  assert.equal((await bridgeRequest(config, 'POST', '/v0/tasks', { transport, body: {}, idempotencyKey: 'x' })).code, 'invalid_idempotency_key');
  assert.equal((await submitTask(config, payload, 'nope', { transport })).outcome, 'rejected');
});

test('duplicate key behavior: dedupe returns the same task, payload change is a conflict, unresolved reservation is ambiguous', async () => {
  const dup = await submitTask(config, payload, KEY, fixture(202, accepted({ deduplicated: true })));
  assert.equal(dup.outcome, 'accepted');
  assert.equal(dup.deduplicated, true);
  assert.equal((await submitTask(config, payload, KEY, fixture(409, { error: 'idempotency_conflict' }))).outcome, 'conflict');
  const amb = await submitTask(config, payload, KEY, fixture(409, { error: 'create_outcome_ambiguous', task_id: null, retry: 'blocked' }));
  assert.deepEqual(amb, { outcome: 'ambiguous', code: 'create_outcome_ambiguous' });
  assert.equal((await submitTask(config, payload, KEY, fixture(409, { error: 'idempotency_task_mismatch' }))).outcome, 'ambiguous');
  assert.equal((await submitTask(config, payload, KEY, fixture(409, { error: 'weird' }))).outcome, 'ambiguous', 'unknown 409 is never a clean failure');
  assert.equal(OUTCOMES.conflict.retry, 'new_key');
  assert.equal(OUTCOMES.ambiguous.retry, 'check_first');
  assert.equal(OUTCOMES.unconfirmed.retry, 'same_key');
  assert.notEqual(submissionFingerprint({ templateId: 'system_health', title: 'a' }), submissionFingerprint({ templateId: 'system_health', title: 'b' }));
  assert.equal(submissionFingerprint({ templateId: 'system_health', title: ' a ' }), submissionFingerprint({ templateId: 'system_health', title: 'a' }));
});

test('malformed or ambiguous responses never become success or a clean failure', async () => {
  const cases = [
    [fixture(202, { ...accepted(), submitted: false }), 'ambiguous'],
    [fixture(202, { ...accepted(), task: { id: 'bad', status: 'todo' } }), 'ambiguous'],
    [fixture(202, accepted({ task: { ...accepted().task, title: 'Something else' } })), 'ambiguous'],
    [fixture(202, accepted({ task: { ...accepted().task, assignee: 'other' } })), 'ambiguous'],
    [fixture(202, 'not json'), 'unconfirmed'],
    [fixture(202, accepted(), 'text/html'), 'unconfirmed'],
    [fixture(500, { error: 'internal_error' }), 'unconfirmed'],
    [fixture(504, { error: 'hermes_timeout' }), 'unconfirmed'],
    [fixture(400, { error: 'assignee_not_allowed' }), 'rejected'],
    [fixture(401, { error: 'unauthorized' }), 'unavailable'],
    [{ transport: async () => { throw Object.assign(new Error('t'), { code: 'timeout' }); } }, 'unconfirmed'],
    [{ transport: async () => { throw Object.assign(new Error('r'), { code: 'refused' }); } }, 'unavailable'],
  ];
  for (const [opts, want] of cases) assert.equal((await submitTask(config, payload, KEY, opts)).outcome, want, want);
  assert.equal((await submitTask(readBridgeConfig({}), payload, KEY)).outcome, 'unavailable');
  assert.equal(checkCreateResponse(202, null, payload).outcome, 'ambiguous');
});

test('idempotency-key header reaches a loopback server byte-for-byte alongside the signed body', async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      seen.push({ key: req.headers['idempotency-key'], body: Buffer.concat(chunks).toString('utf8') });
      res.writeHead(202, { 'content-type': 'application/json' });
      res.end(JSON.stringify(accepted()));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const cfg = readBridgeConfig({ url: `http://127.0.0.1:${server.address().port}`, secret: SECRET });
    assert.equal((await submitTask(cfg, payload, KEY)).outcome, 'accepted');
    assert.equal((await submitTask(cfg, payload, KEY)).outcome, 'accepted');
    assert.deepEqual(seen.map((s) => s.key), [KEY, KEY], 'retry reuses the same key');
    assert.deepEqual(JSON.parse(seen[0].body), payload);
  } finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
});

test('result rendering inputs: failed and completed details carry authoritative state, summary and run error', () => {
  const base = { runs: [{ id: 1, outcome: 'failed', error: 'controlled failure: no action performed' }], observed_at: new Date(NOW).toISOString() };
  const failed = checkTaskDetail({ ...base, task: { id: 't_abc123', status: 'blocked', ui: ui('failed') }, latest_summary: null });
  assert.equal(failed.task.bucket, 'failed');
  assert.equal(failed.runs[0].error, 'controlled failure: no action performed');
  const done = checkTaskDetail({ ...base, runs: [{ id: 2, outcome: 'completed' }], task: { id: 't_abc123', status: 'done', ui: ui('completed') }, latest_summary: 'uptime 3d; load 1.2' });
  assert.equal(done.task.verified, true);
  assert.equal(done.latestSummary, 'uptime 3d; load 1.2');
  assert.equal(outcomeCopy('nonsense').retry, 'check_first', 'unknown outcomes are treated as ambiguous');
});

test('POST route enforces same-origin, session, strict JSON, fresh capabilities and template membership in order', async () => {
  const route = await src('src/app/api/control/tasks/route.ts');
  const post = route.slice(route.indexOf('export async function POST'));
  const order = ['isSameOriginMutation(', 'hasControlAccess()', 'application\\/json', 'MAX_CREATE_REQUEST_BYTES', 'readCapabilities()', 'createCapability(', 'validateCreateRequest(', 'createTask('];
  let at = 0;
  for (const marker of order) {
    const i = post.indexOf(marker, at);
    assert.ok(i >= at, `${marker} out of order`);
    at = i;
  }
  assert.match(post, /request\.headers\.get\("idempotency-key"\)/);
  assert.match(post, /status: 403/);
  assert.doesNotMatch(route, /process\.env|console\./);
  const caps = await src('src/app/api/control/capabilities/route.ts');
  assert.match(caps, /publicTemplates\(create\.templates\)/);
  assert.match(caps, /if \(!\(await hasControlAccess\(\)\)\)/);
  const wrapper = await src('src/lib/mission-control/bridge.ts');
  assert.match(wrapper, /export async function createTask[\s\S]*noStore\(\)[\s\S]*hasControlAccess\(\)/);
});

test('form sends only template id + title with one stable key, and pages render it only from server capabilities', async () => {
  const form = await src('src/components/mc/task-create-form.tsx');
  assert.match(form, /^"use client";/);
  assert.match(form, /JSON\.stringify\(\{ template_id: p\.templateId, title: p\.title \}\)/);
  assert.match(form, /"idempotency-key": p\.key/);
  assert.match(form, /if \(inflight\.current\) return;/, 'double-click guard');
  assert.match(form, /beginSubmission\(pending\.current, \{ templateId, title \}, \{ acknowledged \}, newKey\)/, 'key choice goes through the tested helper');
  assert.match(form, /settleSubmission\(p, r\)/, 'pending state after a response goes through the tested helper');
  assert.match(form, /classifySubmitResponse\(/);
  assert.match(form, /restorePending\(sessionStorage\.getItem/);
  assert.match(form, /sessionStorage/, 'unresolved submission survives refresh');
  assert.match(form, /router\.push\(`\/tasks\/\$\{r\.task_id\}/, 'redirect only on confirmed acceptance');
  assert.doesNotMatch(form, /savePending\(null\)|pending\.current = null/, 'the form never clears pending state outside settleSubmission');
  assert.match(form, /disabled=\{!checked \|\| sending\}/, 'new-key resubmit after ambiguity needs explicit acknowledgement');
  assert.match(form, /Runs in lane \{t\.assignee\}/, 'assignee is a lane, not a Hermes profile');
  assert.doesNotMatch(form, /Runs as profile|function discard|onClick=\{discard\}/, 'unconfirmed outcome must not drop its idempotency key');
  const unconfirmed = form.match(/unresolved && result\.outcome !== "ambiguous" && \([\s\S]*?\n          \)\}/)?.[0] ?? '';
  assert.match(unconfirmed, /onClick=\{\(\) => void send\(\)\}/, 'unconfirmed retry reuses the same key');
  assert.match(unconfirmed, /<a href="\/tasks"/, 'unconfirmed offers a plain task-list link');
  assert.doesNotMatch(unconfirmed, /savePending\(null\)|pending\.current = null|send\(true\)/);
  assert.doesNotMatch(form, /process\.env|bridge-client|MC_BRIDGE|"assignee"|body: t\.body|<textarea/);
  for (const page of ['src/app/tasks/page.tsx', 'src/app/page.tsx']) {
    const text = await src(page);
    assert.match(text, /createCapability\(/, page);
    assert.match(text, /templates=\{publicTemplates\(/, page);
    assert.doesNotMatch(text, /<textarea/, `${page}: no free-form instruction box`);
  }
  assert.match(await src('src/app/tasks/page.tsx'), /SAFE_CAPABILITY_COPY/);
  const detail = await src('src/app/tasks/[id]/page.tsx');
  assert.match(detail, /<AutoRefresh active=\{!TERMINAL\.has\(task\.ui\.state\)\}/);
  assert.match(detail, /not finished until the status below says so/);
  assert.match(await src('src/components/mc/auto-refresh.tsx'), /router\.refresh\(\)/);
});

const mkKeys = () => {
  let n = 0;
  return () => `synthetic-key-${String(++n).padStart(4, '0')}`;
};
const FORM = { templateId: 'system_health', title: 'Mac system health check' };
const res = (status, data) => classifySubmitResponse({ status, data });
const TIMEOUT = classifySubmitResponse({ status: 0, data: null, network: true });
const DEFINITE_LATER = {
  offline: res(503, { outcome: 'unavailable', code: 'bridge_unreachable' }),
  401: res(401, { outcome: 'unavailable' }),
  403: res(403, null),
  rejected: res(400, { outcome: 'rejected', code: 'invalid_title', field: 'title' }),
  conflict: res(409, { outcome: 'conflict', code: 'idempotency_conflict' }),
};

test('response classification: only accepted with a valid task id is success; malformed/unknown stays unconfirmed', () => {
  assert.deepEqual(res(202, { outcome: 'accepted', task_id: 't_0a1b2c3d' }), { outcome: 'accepted', definite: true, task_id: 't_0a1b2c3d', deduplicated: false, data: { outcome: 'accepted', task_id: 't_0a1b2c3d' } });
  for (const bad of [{ outcome: 'accepted' }, { outcome: 'accepted', task_id: '../x' }, { outcome: 'accepted', task_id: 7 }]) {
    assert.equal(res(202, bad).outcome, 'unconfirmed');
    assert.equal(res(202, bad).definite, false);
  }
  assert.equal(res(200, { outcome: 'surprise' }).outcome, 'unconfirmed');
  assert.equal(res(502, null).outcome, 'unconfirmed');
  assert.equal(res(200, 'nope').outcome, 'unconfirmed');
  assert.equal(TIMEOUT.outcome, 'unconfirmed');
  assert.equal(res(409, { outcome: 'ambiguous' }).definite, false);
  for (const r of Object.values(DEFINITE_LATER)) assert.equal(r.definite, true);
});

test('fresh first attempt: definite rejection clears; same payload reuses key; changed payload gets a fresh key', () => {
  const keys = mkKeys();
  const a = beginSubmission(null, FORM, {}, keys);
  assert.equal(a.uncertain, false);
  assert.equal(beginSubmission(a, FORM, {}, keys).key, a.key, 'double submit reuses the key');
  assert.notEqual(beginSubmission(a, { ...FORM, title: 'Other' }, {}, keys).key, a.key, 'changed payload -> fresh key');
  for (const r of Object.values(DEFINITE_LATER)) assert.equal(settleSubmission(a, r), null);
});

for (const [name, later] of Object.entries(DEFINITE_LATER)) {
  test(`timeout -> ${name}: the original key, fingerprint and payload are retained and stay locked`, () => {
    const keys = mkKeys();
    const first = beginSubmission(null, FORM, {}, keys);
    const afterTimeout = settleSubmission(first, TIMEOUT);
    assert.equal(afterTimeout.uncertain, true);
    const retry = beginSubmission(afterTimeout, FORM, {}, keys);
    assert.equal(retry.key, first.key, 'retry uses the same key');
    const afterError = settleSubmission(retry, later);
    assert.deepEqual(afterError, { ...first, uncertain: true }, 'later definite error says nothing about the first attempt');
    const edited = beginSubmission(afterError, { ...FORM, title: 'Edited title' }, {}, keys);
    assert.deepEqual(edited, afterError, 'payload stays locked to the original while uncertain');
    const again = settleSubmission(settleSubmission(edited, later), later);
    assert.equal(again.key, first.key, 'repeated errors never drop the key');
  });
}

test('restored pending (after refresh) -> error keeps the key; restore is strict and always uncertain', () => {
  const keys = mkKeys();
  const first = beginSubmission(null, FORM, {}, keys); // saved before fetch, then the tab refreshed
  const restored = restorePending(JSON.stringify(first));
  assert.equal(restored.uncertain, true);
  assert.equal(restored.key, first.key);
  assert.equal(restored.fp, first.fp);
  for (const r of Object.values(DEFINITE_LATER)) assert.equal(settleSubmission(beginSubmission(restored, FORM, {}, keys), r).key, first.key);
  assert.equal(restorePending(JSON.stringify({ ...first, uncertain: false })).uncertain, true, 'stored flag cannot downgrade');
  for (const bad of ['{', 'null', '[]', JSON.stringify({ ...first, key: 'short' }), JSON.stringify({ key: first.key })]) assert.equal(restorePending(bad), null);
});

test('accepted clears; malformed accepted and ambiguous retain; only acknowledgement starts a new key', () => {
  const keys = mkKeys();
  const first = beginSubmission(null, FORM, {}, keys);
  const unsure = settleSubmission(first, TIMEOUT);
  assert.equal(settleSubmission(beginSubmission(unsure, FORM, {}, keys), res(202, { outcome: 'accepted', task_id: 't_abcdef12', deduplicated: true })), null, 'confirmed task clears');
  assert.equal(settleSubmission(first, res(202, { outcome: 'accepted', task_id: 't_abcdef12' })), null);
  const malformed = settleSubmission(first, res(202, { outcome: 'accepted' }));
  assert.equal(malformed.key, first.key);
  assert.equal(malformed.uncertain, true, 'accepted without a valid task id stays unconfirmed');
  const amb = settleSubmission(first, res(409, { outcome: 'ambiguous' }));
  assert.equal(amb.uncertain, true);
  const deliberate = beginSubmission(amb, FORM, { acknowledged: true }, keys);
  assert.notEqual(deliberate.key, first.key, 'explicit acknowledgement -> fresh key');
  assert.equal(deliberate.uncertain, false);
  assert.equal(settleSubmission(deliberate, DEFINITE_LATER.rejected), null, 'acknowledged new request is a fresh first attempt');
});

test('accepted-looking body is only confirmation with HTTP 202; 500/503/200 stay unconfirmed and keep the sticky key', () => {
  const body = { outcome: 'accepted', task_id: 't_abcdef12', deduplicated: true };
  const ok = res(202, body);
  assert.equal(ok.outcome, 'accepted');
  assert.equal(ok.task_id, 't_abcdef12');
  assert.equal(ok.deduplicated, true);
  for (const status of [500, 503, 200, 201]) {
    const r = res(status, body);
    assert.deepEqual(r, { outcome: 'unconfirmed', definite: false, code: `accepted_with_http_${status}` });
    const keys = mkKeys();
    const first = beginSubmission(null, FORM, {}, keys);
    const kept = settleSubmission(first, r);
    assert.deepEqual(kept, { ...first, uncertain: true }, `${status} accepted-looking body retains the key`);
    const unsure = settleSubmission(beginSubmission(settleSubmission(first, TIMEOUT), FORM, {}, keys), r);
    assert.equal(unsure.key, first.key, `${status} after a timeout never drops the original key`);
    assert.equal(beginSubmission(unsure, { ...FORM, title: 'Edited' }, {}, keys).key, first.key, 'payload stays locked');
    assert.equal(settleSubmission(beginSubmission(unsure, FORM, {}, keys), ok), null, 'a later real 202 clears it');
  }
});
