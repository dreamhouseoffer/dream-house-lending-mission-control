// Contract tests for the operations read (profiles + schedules). All payloads and transports are SYNTHETIC fixtures;
// no real bridge, credential, profile or schedule data is used.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readBridgeConfig } from '../src/lib/mission-control/bridge-client.mjs';
import {
  CONTROL_LANES,
  OPERATIONS_MAX_BYTES,
  agentView,
  checkOperations,
  fetchOperations,
  liveScheduleRows,
  operationsSource,
  UNNAMED_SCHEDULE,
} from '../src/lib/mission-control/operations-client.mjs';
import { filterSchedules } from '../src/lib/mission-control/capabilities.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const src = (p) => readFile(join(ROOT, p), 'utf8');
const NOW = Date.parse('2026-10-17T12:00:00Z');
const config = readBridgeConfig({ url: 'http://127.0.0.1:9130', secret: 'synthetic-test-secret-0123456789abcdef' });

const profile = (over = {}) => ({ id: 'alpha', name: 'Alpha', configured: true, activity: 'unverified', role: null, ...over });
const schedule = (over = {}) => ({
  id: 'job-1', name: 'Morning digest', schedule: '0 7 * * *', enabled: true,
  last_run_at: '2026-10-17T07:00:05Z', last_status: 'ok', next_run_at: '2026-10-18T07:00:00Z', has_error: false, ...over,
});
const payload = (over = {}) => ({
  observed_at: new Date(NOW).toISOString(),
  profiles: [profile(), profile({ id: 'beta', name: 'Beta', role: 'Researcher', configured: false })],
  schedules: [schedule()],
  sources: { profiles: { available: true, updated_at: '2026-10-17T11:00:00Z' }, schedules: { available: true, updated_at: null } },
  ...over,
});

function fixture(status, body, contentType = 'application/json') {
  const calls = [];
  const transport = async (req) => {
    calls.push(req);
    return { status, contentType, body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)) };
  };
  return { transport, calls };
}

test('valid payload parses to explicit fields only; unknown keys are dropped and role stays null', () => {
  const out = checkOperations(payload({ extra: 'x', profiles: [profile({ secret: 'nope', heartbeat: 'now' })] }));
  assert.ok(out);
  assert.deepEqual(out.profiles, [{ id: 'alpha', name: 'Alpha', configured: true, activity: 'unverified', role: null }]);
  assert.deepEqual(Object.keys(out.schedules[0]).sort(), ['enabled', 'has_error', 'id', 'last_run_at', 'last_status', 'name', 'next_run_at', 'schedule']);
  assert.equal(out.sources.schedules.updatedAt, null);
  assert.ok(!('extra' in out));
});

test('malformed payloads fail closed as a whole', () => {
  const bad = [
    null, [], 'x',
    payload({ observed_at: 'not a date' }),
    payload({ observed_at: undefined }),
    payload({ sources: undefined }),
    payload({ sources: { profiles: { available: 'yes' }, schedules: { available: true, updated_at: null } } }),
    payload({ sources: { profiles: { available: true, updated_at: 'garbage' }, schedules: { available: true, updated_at: null } } }),
    payload({ profiles: undefined }),
    payload({ profiles: [profile({ activity: 'online' })] }),
    payload({ profiles: [profile({ activity: undefined })] }),
    payload({ profiles: [profile({ configured: 'true' })] }),
    payload({ profiles: [profile({ id: '../etc' })] }),
    payload({ profiles: [profile({ name: '' })] }),
    payload({ profiles: [profile({ name: 'a\u0000b' })] }),
    payload({ profiles: [profile({ role: 7 })] }),
    payload({ profiles: [profile(), profile()] }),
    payload({ profiles: Array.from({ length: 101 }, (_, i) => profile({ id: `p${i}` })) }),
    payload({ schedules: [schedule({ enabled: 1 })] }),
    payload({ schedules: [schedule({ has_error: undefined })] }),
    payload({ schedules: [schedule({ last_run_at: 'yesterday' })] }),
    payload({ schedules: [schedule({ next_run_at: 12345 })] }),
    payload({ schedules: [schedule({ last_status: 'x'.repeat(65) })] }),
    payload({ schedules: [schedule(), 'junk'] }),
  ];
  for (const [i, p] of bad.entries()) assert.equal(checkOperations(p), null, `case ${i}`);
});

test('a source the bridge reports unavailable is unknown (null), never an empty healthy list', () => {
  const out = checkOperations(payload({
    profiles: [profile()],
    schedules: null,
    sources: { profiles: { available: false, updated_at: null }, schedules: { available: false, updated_at: null } },
  }));
  assert.equal(out.profiles, null);
  assert.equal(out.schedules, null);
  assert.equal(operationsSource({ ok: true, ...out }, 'profiles', NOW).state, 'unverified');
  assert.match(operationsSource({ ok: true, ...out }, 'schedules', NOW).detail, /unknown, not zero/);
  // Available with an empty list is a real (countable) empty answer.
  assert.deepEqual(checkOperations(payload({ schedules: [] })).schedules, []);
});

test('fetchOperations signs a GET to the fixed path with a bounded response size', async () => {
  const f = fixture(200, payload());
  const res = await fetchOperations(config, { transport: f.transport, now: () => NOW });
  assert.equal(res.ok, true);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].method, 'GET');
  assert.equal(f.calls[0].target, '/v0/operations');
  assert.equal(f.calls[0].body, undefined);
  assert.equal(f.calls[0].maxBytes, OPERATIONS_MAX_BYTES);
  assert.ok(OPERATIONS_MAX_BYTES <= 256 * 1024);
  assert.match(f.calls[0].headers['x-mc-signature'], /^[0-9a-f]{64}$/);
});

test('offline, unauthorised, non-JSON, oversize and schema-mismatched answers all fail closed', async () => {
  const offline = await fetchOperations(config, { transport: async () => { throw Object.assign(new Error('x'), { code: 'timeout' }); } });
  assert.deepEqual(offline, { ok: false, state: 'offline', code: 'timeout' });
  assert.equal((await fetchOperations(config, fixture(401, { error: 'x' }))).state, 'unauthorized');
  assert.equal((await fetchOperations(config, fixture(503, { error: 'x' }))).state, 'hermes_unavailable');
  assert.equal((await fetchOperations(config, fixture(200, '<html>', 'text/html'))).state, 'bad_payload');
  assert.equal((await fetchOperations(config, fixture(200, '{nope'))).state, 'bad_payload');
  assert.equal((await fetchOperations(config, fixture(200, 'x'.repeat(OPERATIONS_MAX_BYTES + 1)))).code, 'response_too_large');
  assert.deepEqual(await fetchOperations(config, fixture(200, payload({ profiles: [profile({ activity: 'live' })] }))), { ok: false, state: 'bad_payload', code: 'schema_mismatch' });
  assert.equal((await fetchOperations(readBridgeConfig({}), fixture(200, payload()))).state, 'not_configured');
  for (const state of ['offline', 'not_configured', 'bad_payload']) {
    assert.notEqual(operationsSource({ ok: false, state, code: state }, 'profiles').state, 'observed');
  }
});

test('agents join real task assignments; mc-runner is a control lane, never an agent', () => {
  assert.ok('mc-runner' in CONTROL_LANES);
  const profiles = [profile(), profile({ id: 'mc-runner', name: 'Runner' })];
  const tasks = [
    { assignee: 'alpha', bucket: 'running' },
    { assignee: 'alpha', bucket: 'completed' },
    { assignee: 'mc-runner', bucket: 'queued' },
    { assignee: 'ghost', bucket: 'failed' },
    { assignee: null, bucket: 'queued' },
  ];
  const v = agentView(profiles, tasks);
  assert.deepEqual(v.agents.map((a) => a.id), ['alpha']);
  assert.deepEqual(v.agents[0].tasks, { open: 1, total: 2 });
  assert.deepEqual(v.lanes, [{ id: 'mc-runner', detail: CONTROL_LANES['mc-runner'], tasks: { open: 1, total: 1 } }]);
  assert.deepEqual(v.unmatched, ['ghost']);
  const unknown = agentView([profile()], null);
  assert.equal(unknown.agents[0].tasks, null, 'failed task read is unknown, not zero');
  assert.equal(unknown.lanes[0].tasks, null);
});

test('bridge-contract nulls (configured/enabled/has_error/name) are accepted and stay null, not fabricated', () => {
  // Shapes the bridge emits when it cannot determine a value (lib/operations.js): bool|null flags, str|null name.
  const out = checkOperations(payload({
    profiles: [profile({ configured: null })],
    schedules: [
      schedule({ id: '_leading-underscore', name: null, enabled: null, has_error: null, last_status: null, last_run_at: null }),
      schedule({ id: '-leading-hyphen', name: 'n'.repeat(200) }),
      schedule({ id: 'x'.repeat(128) }),
    ],
  }));
  assert.ok(out, 'a valid bridge payload with nulls must not be rejected as a whole');
  assert.equal(out.profiles[0].configured, null);
  assert.deepEqual(
    [out.schedules[0].name, out.schedules[0].enabled, out.schedules[0].has_error],
    [null, null, null],
  );
  // Still strict: wrong types, missing keys and ids outside the bridge charset fail closed.
  const bad = [
    payload({ profiles: [profile({ configured: undefined })] }),
    payload({ profiles: [profile({ configured: 0 })] }),
    payload({ schedules: [schedule({ enabled: 'false' })] }),
    payload({ schedules: [schedule({ enabled: undefined })] }),
    payload({ schedules: [schedule({ has_error: 0 })] }),
    payload({ schedules: [schedule({ name: undefined })] }),
    payload({ schedules: [schedule({ name: 'n'.repeat(201) })] }),
    payload({ schedules: [schedule({ id: 'x'.repeat(129) })] }),
    payload({ schedules: [schedule({ id: 'a.b' })] }),
    payload({ schedules: [schedule({ id: '../x' })] }),
  ];
  for (const [i, p] of bad.entries()) assert.equal(checkOperations(p), null, `case ${i}`);
});

test('unknown schedule flags render as "unknown", never disabled or healthy; explicit reports still win', () => {
  const rows = liveScheduleRows([
    schedule({ id: 'a', enabled: null }),
    schedule({ id: 'b', has_error: null }),
    schedule({ id: 'c', enabled: null, has_error: null, last_run_at: null }),
    schedule({ id: 'd', enabled: false, has_error: null }),
    schedule({ id: 'e', enabled: null, has_error: true }),
    schedule({ id: 'f', name: null }),
  ]);
  assert.deepEqual(rows.map((r) => r.status), ['unknown', 'unknown', 'unknown', 'disabled', 'erroring', 'ran']);
  assert.equal(rows[0].enabled, null);
  assert.equal(rows[1].hasError, null);
  assert.equal(rows[5].name, UNNAMED_SCHEDULE);
  // Filtering/search over rows with an unrecorded name must not throw.
  assert.deepEqual(filterSchedules(rows, { status: 'unknown', q: '' }).map((r) => r.id), ['a', 'b', 'c']);
  assert.deepEqual(filterSchedules(rows, { q: 'not recorded' }).map((r) => r.id), ['f']);
  // Unknown configuration is carried through to the agent view as null.
  assert.equal(agentView([profile({ configured: null })], []).agents[0].configured, null);
});

test('live schedule rows use the scheduler receipt without upgrading it to success', () => {
  const rows = liveScheduleRows([
    schedule({ id: 'a', enabled: false, has_error: true }),
    schedule({ id: 'b', has_error: true }),
    schedule({ id: 'c', last_run_at: null, last_status: null }),
    schedule({ id: 'd' }),
  ]);
  assert.deepEqual(rows.map((r) => r.status), ['disabled', 'erroring', 'never_run', 'ran']);
  assert.equal(rows[2].lastStatus, null);
  assert.equal(rows[3].lastStatus, 'ok');
});

test('operations route and wrapper are owner-protected, no-store and read-only', async () => {
  const route = await src('src/app/api/control/operations/route.ts');
  assert.ok(route.indexOf('hasControlAccess()') < route.indexOf('readOperations()'), 'session check precedes the bridge read');
  assert.match(route, /status: 401/);
  assert.match(route, /"Cache-Control": "no-store"/);
  assert.match(route, /force-dynamic/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)|process\.env|console\.|NEXT_PUBLIC/);
  const wrapper = await src('src/lib/mission-control/operations.ts');
  assert.match(wrapper, /noStore\(\)/);
  assert.ok(wrapper.indexOf('readBridgeConfig') < wrapper.indexOf('hasControlAccess()'));
  assert.doesNotMatch(wrapper, /NEXT_PUBLIC|console\./);
  const client = await src('src/lib/mission-control/operations-client.mjs');
  assert.match(client, /OPERATIONS_TARGET = "\/v0\/operations"/);
  assert.doesNotMatch(client, /process\.env|console\.|"POST"/);
});

test('Agents, Workflows and Settings render bridge reads with no fake controls, liveness or secrets', async () => {
  const pages = ['agents', 'workflows', 'settings'].map((p) => `src/app/${p}/page.tsx`);
  for (const f of pages) {
    const text = await src(f);
    assert.match(text, /force-dynamic/, f);
    assert.match(text, /readOperations\(\)/, f);
    assert.doesNotMatch(text, /^["']use client["']/m, f);
    assert.doesNotMatch(text, /onClick|<form[^>]*method="post"|action=\{|MC_BRIDGE|MISSION_CONTROL_PIN|NEXT_PUBLIC|\.origin|secret/i, f);
    assert.doesNotMatch(text, /Online|Healthy|Last heartbeat|Budget OK|Reboot verified/, f);
  }
  const agents = await src(pages[0]);
  assert.match(agents, /<BridgeNotice failure=\{ops\}/);
  assert.match(agents, /role \{a\.role \?\? "unknown \(not recorded\)"\}/);
  assert.match(agents, /<DisabledAction label="Chat with agent"/);
  assert.match(agents, /<DisabledAction label="Edit profile"/);
  assert.match(agents, /a\.configured === null \?/, 'unknown configuration is not shown as configured or unconfigured');
  assert.match(agents, /Configuration unknown/);
  const workflows = await src(pages[1]);
  assert.match(workflows, /LIVE_FILTERS = \[\.\.\.SCHEDULE_FILTERS, \{ id: "unknown"/);
  assert.match(workflows, /unknown: "Enabled\/error state not reported"/);
  assert.match(workflows, /<BridgeNotice failure=\{ops\}/);
  assert.match(workflows, /not proof/);
  assert.match(workflows, /<DisabledAction label="Pause, resume or run now"/);
  const settings = await src(pages[2]);
  assert.match(settings, /Recovery after a Mac reboot is not checked/);
  assert.match(settings, /Budgets, spend limits and provider usage are not checked/);
});
