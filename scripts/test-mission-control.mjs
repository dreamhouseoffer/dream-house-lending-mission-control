import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  ACTIONS,
  CORE_NAV,
  MODULE_NAV,
  SOURCES,
  TASK_STATUSES,
  capability,
  displayTotal,
  filterSchedules,
  navItemFor,
  parseTaskStatus,
  resolveViewState,
  scheduleRows,
} from '../src/lib/mission-control/capabilities.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const src = (p) => readFile(join(ROOT, p), 'utf8');
const sha = async (p) => createHash('sha256').update(await readFile(join(ROOT, p))).digest('hex');

const NEW_PAGES = ['', 'tasks', 'agents', 'approvals', 'workflows', 'content', 'knowledge', 'settings'].map((r) =>
  r ? `src/app/${r}/page.tsx` : 'src/app/page.tsx'
);

test('no source is reported live in this release and every not-live source says what enables it', () => {
  for (const s of Object.values(SOURCES)) {
    assert.notEqual(s.state, 'live', s.id);
    if (s.state === 'not_connected') assert.ok(s.enables, `${s.id} needs an enable hint`);
  }
  assert.equal(SOURCES.bridge.state, 'not_connected');
});

test('every action is disabled with an exact reason while the bridge is not connected', () => {
  for (const action of Object.keys(ACTIONS)) {
    const c = capability(action);
    assert.equal(c.enabled, false, action);
    assert.ok(c.reason && c.reason.length > 20, action);
  }
  assert.match(capability('task.create').reason, /not connected/i);
  assert.equal(capability('nope').enabled, false);
});

test('a live source enables ordinary actions but publishing stays gated', () => {
  const live = Object.fromEntries(Object.entries(SOURCES).map(([k, v]) => [k, { ...v, state: 'live' }]));
  assert.deepEqual(capability('task.create', live), { enabled: true, reason: null });
  assert.equal(capability('content.publish', live).enabled, false);
  assert.match(capability('content.publish', live).reason, /approval gates/);
});

test('view state never turns silence into a healthy zero', () => {
  assert.equal(resolveViewState({ source: SOURCES.tasks }), 'not_connected');
  assert.equal(resolveViewState({ source: { state: 'live' }, items: [] , observedAt: new Date().toISOString() }), 'empty');
  assert.equal(resolveViewState({ source: { state: 'live' } }), 'unverified');
  assert.equal(resolveViewState({ source: { state: 'live' }, error: new Error('x'), items: [] }), 'error');
  assert.equal(resolveViewState({ source: { state: 'offline' }, items: [1] }), 'offline');
  assert.equal(resolveViewState({ source: { state: 'live' }, items: [1], observedAt: '2020-01-01T00:00:00Z', now: Date.parse('2020-01-01T00:05:00Z') }), 'stale');
  assert.equal(resolveViewState({ source: { state: 'live' }, items: [1], observedAt: '2020-01-01T00:00:00Z', now: Date.parse('2020-01-01T00:00:30Z') }), 'ready');
  assert.equal(resolveViewState({ source: { state: 'snapshot' }, items: [1] }), 'snapshot');
  assert.equal(displayTotal('not_connected', 0), 'Unknown');
  assert.equal(displayTotal('unverified', 3), 'Unknown');
  assert.equal(displayTotal('empty', 0), '0');
  assert.equal(displayTotal('snapshot', 4), '4');
  assert.equal(displayTotal('ready', undefined), 'Unknown');
});

test('task statuses are the seven distinct lifecycle states and parsing is safe', () => {
  assert.deepEqual(TASK_STATUSES.map((s) => s.id), ['queued', 'running', 'waiting_approval', 'blocked', 'completed', 'failed', 'canceled']);
  assert.equal(parseTaskStatus('failed'), 'failed');
  assert.equal(parseTaskStatus('<script>'), 'all');
  assert.equal(parseTaskStatus(undefined), 'all');
});

test('schedule snapshot rows derive status and filter by status and name', () => {
  const rows = scheduleRows({ agents: [
    { id: 'a', name: 'Alpha', enabled: true, consecutiveErrors: 2 },
    { id: 'b', name: 'Beta', enabled: true, lastRunAt: '2026-01-01T00:00:00Z' },
    { id: 'c', name: 'Gamma', enabled: false },
    { id: 'd', name: 'Delta', enabled: true },
  ] });
  assert.deepEqual(rows.map((r) => r.status), ['erroring', 'ran', 'disabled', 'never_run']);
  assert.deepEqual(filterSchedules(rows, { status: 'erroring' }).map((r) => r.id), ['a']);
  assert.deepEqual(filterSchedules(rows, { q: 'ta' }).map((r) => r.id), ['b', 'd']);
  assert.deepEqual(scheduleRows(null), []);
});

test('core nav is exactly the eight operational pages and every nav target exists', async () => {
  assert.deepEqual(CORE_NAV.map((i) => i.label), ['Home', 'Tasks', 'Agents', 'Approvals', 'Workflows', 'Content', 'Knowledge', 'Settings']);
  const items = [...CORE_NAV, ...MODULE_NAV.flatMap((g) => g.items)];
  assert.equal(new Set(items.map((i) => i.href)).size, items.length, 'no duplicate nav targets');
  for (const { href } of items) {
    const file = href === '/' ? 'src/app/page.tsx' : `src/app${href}/page.tsx`;
    await stat(join(ROOT, file));
  }
  assert.equal(navItemFor('/tasks/legacy').label, 'Mission board (legacy)');
  assert.equal(navItemFor('/tasks').label, 'Tasks');
  assert.equal(navItemFor('/content/training').label, 'Loan training');
  assert.equal(navItemFor('/unknown'), null);
});

test('every pre-redesign page route still exists (no silently dropped modules)', async () => {
  const routes = ['ask', 'body-os', 'briefs', 'calendar', 'campaigns', 'docs', 'embed/hermes', 'finance', 'headquarters', 'login', 'memory', 'milo-approvals', 'office', 'pipeline', 'portfolio', 'projects', 'projects/legacy', 'team', 'tools', 'vega'];
  for (const r of routes) await stat(join(ROOT, `src/app/${r}/page.tsx`));
});

test('replaced pages are preserved verbatim at explicit legacy paths', async () => {
  // SHA-256 of the files at 5687b3c before the move.
  assert.equal(await sha('src/app/today/page.tsx'), 'f1ecdf3d541f96c5bd417e0a37fe5b82f164335c7f157effb63a57e430a2b036');
  assert.equal(await sha('src/app/tasks/legacy/page.tsx'), '65adcc162e51b7d9f6b28c37c7eb48e06a3b9da908d595894d81da4c564402b7');
  assert.equal(await sha('src/app/content/training/page.tsx'), '0ea1227f71527c70dca00b169d9f6132d3c111281d80cacc2567e579bd662338');
  assert.match(await src('src/app/today/layout.tsx'), /LegacyBanner/);
  assert.match(await src('src/app/tasks/legacy/layout.tsx'), /LegacyBanner/);
});

test('new operational pages are server components with no fake activity, storage or execution calls', async () => {
  const files = [...NEW_PAGES, 'src/components/mc/ui.tsx', 'src/components/mc/legacy-banner.tsx'];
  for (const f of files) {
    const text = await src(f);
    assert.doesNotMatch(text, /^["']use client["']/m, f);
    assert.doesNotMatch(text, /Math\.random|setInterval|localStorage|fetch\(|process\.env|mailchimp\/campaigns|\/schedule|\.hermes/, f);
  }
});

test('shell keeps login and embed exceptions and offers assignment entry', async () => {
  const shell = await src('src/components/app-shell.tsx');
  assert.match(shell, /pathname === "\/login"/);
  assert.match(shell, /startsWith\("\/embed"\)/);
  const topbar = await src('src/components/topbar.tsx');
  assert.match(topbar, /href="\/tasks#assign"/);
  const tasks = await src('src/app/tasks/page.tsx');
  assert.match(tasks, /id="assign"/);
  assert.match(tasks, /capability\("task\.create"\)/);
});

test('Home shows the bridge setup card and unknown totals rather than zero counts', async () => {
  const home = await src('src/app/page.tsx');
  assert.match(home, /Mac execution bridge is not connected/);
  assert.match(home, /displayTotal\(taskState, undefined\)/);
  for (const href of ['/tasks', '/approvals', '/workflows', '/settings#connections', '/today']) assert.ok(home.includes(`"${href}`), href);
});

test('middleware, auth and Mailchimp schedule endpoint are untouched by this phase', async () => {
  const mw = await src('src/middleware.ts');
  assert.match(mw, /MISSION_CONTROL_PIN/);
  assert.doesNotMatch(mw, /mission-control|tasks|agents/);
  await stat(join(ROOT, 'src/app/api/mailchimp/campaigns/[id]/schedule/route.ts'));
  const apiDirs = await readdir(join(ROOT, 'src/app/api'));
  assert.ok(!apiDirs.includes('mc'), 'no new control API in this phase');
});
