// Contract tests for the read-only Milo approvals feed. All records and credentials are SYNTHETIC fixtures; no real
// Airtable card, base content or credential is used, and no network request is made.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  MILO_DEFAULT_BASE_ID,
  MILO_DEFAULT_TABLE_ID,
  activeMiloFilter,
  decisionGroup,
  fetchMiloApprovals,
  filterMiloCards,
  legacyListUrl,
  miloCardCaveat,
  miloFailureText,
  normalizeLegacyRecord,
  parseMiloRecord,
  readMiloConfig,
} from '../src/lib/mission-control/milo-approvals-client.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const src = (p) => readFile(join(ROOT, p), 'utf8');
const NOW = Date.parse('2026-10-18T12:00:00Z');
const KEY = 'synthetic-airtable-key-0000';
const config = readMiloConfig({ apiKey: KEY });

let n = 0;
const rec = (fields = {}, over = {}) => ({ id: `recSYNTH${String(++n).padStart(9, '0')}`, createdTime: '2026-10-01T00:00:00.000Z', fields: { Title: 'Synthetic card', ...fields }, ...over });
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function pages(...bodies) {
  const calls = [];
  const transport = async (url, init) => {
    calls.push({ url, init });
    const next = bodies.shift();
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  };
  return { calls, transport };
}

test('config keeps the original base/table/env fallbacks', () => {
  assert.deepEqual(readMiloConfig({}), { configured: false, baseId: MILO_DEFAULT_BASE_ID, tableId: MILO_DEFAULT_TABLE_ID, key: '' });
  assert.equal(MILO_DEFAULT_BASE_ID, 'app9j7s9BTPr8UglD');
  assert.equal(MILO_DEFAULT_TABLE_ID, 'tblMixrIAukHjqBKl');
  assert.equal(readMiloConfig({ token: 't' }).key, 't');
  assert.equal(readMiloConfig({ apiKey: 'a', token: 't' }).key, 'a');
  const c = readMiloConfig({ baseId: 'appX', tableId: 'tblY', apiKey: 'k' });
  assert.equal(legacyListUrl(c).toString().split('?')[0], 'https://api.airtable.com/v0/appX/tblY');
  const q = legacyListUrl(c).searchParams;
  assert.equal(q.get('pageSize'), '100');
  assert.equal(q.get('sort[0][field]'), 'Status');
  assert.equal(q.get('sort[1][field]'), 'Approval Level');
});

test('legacy normalizer keeps its defaults', () => {
  const out = normalizeLegacyRecord({ id: 'recA', fields: {} });
  assert.equal(out.status, 'Drafted by Milo');
  assert.equal(out.decision, 'Pending');
  assert.equal(out.approvalLevel, 'YELLOW');
  assert.equal(out.createdTime, '');
});

test('raw parser never defaults missing labels and rejects malformed records', () => {
  const card = parseMiloRecord(rec({ Title: '  ', Status: 42 }));
  assert.equal(card.title, null);
  assert.equal(card.status, null);
  assert.equal(card.decision, null);
  assert.equal(card.approvalLevel, null);
  for (const bad of [null, [], {}, { id: 'nope', fields: {} }, { id: 'recSYNTH000000001' }, { id: 'recSYNTH000000001', fields: [] }]) {
    assert.equal(parseMiloRecord(bad), null);
  }
  // Only display fields are exposed; free-text fields stay out of the inbox card.
  assert.deepEqual(Object.keys(parseMiloRecord(rec())).sort(), ['approvalLevel', 'approvedAt', 'category', 'createdTime', 'decision', 'id', 'status', 'title']);
});

test('missing credential is not_configured and makes no request', async () => {
  const { calls, transport } = pages();
  const out = await fetchMiloApprovals(readMiloConfig({}), { transport });
  assert.deepEqual(out, { ok: false, state: 'not_configured', code: 'airtable_key_missing' });
  assert.equal(calls.length, 0);
});

test('reads all pages with offset and sends the credential only in the header', async () => {
  const { calls, transport } = pages(json({ records: [rec(), rec()], offset: 'itrA/recB' }), json({ records: [rec({ Decision: 'Approved', Status: 'In Progress' })] }));
  const out = await fetchMiloApprovals(config, { transport, now: () => NOW });
  assert.equal(out.ok, true);
  assert.equal(out.cards.length, 3);
  assert.equal(out.truncated, false);
  assert.equal(out.pages, 2);
  assert.equal(out.observedAt, '2026-10-18T12:00:00.000Z');
  assert.equal(new URL(calls[1].url).searchParams.get('offset'), 'itrA/recB');
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${KEY}`);
  assert.equal(calls[0].init.cache, 'no-store');
  assert.ok(!calls.some((c) => c.url.includes(KEY)));
  assert.ok(!calls.some((c) => c.init.method && c.init.method !== 'GET'));
  assert.ok(!JSON.stringify(out).includes(KEY));
});

test('pagination is bounded and reported as truncated', async () => {
  const { calls, transport } = pages(json({ records: [rec()], offset: 'o1' }), json({ records: [rec()], offset: 'o2' }), json({ records: [rec()], offset: 'o3' }));
  const out = await fetchMiloApprovals(config, { transport, maxPages: 2 });
  assert.equal(calls.length, 2);
  assert.equal(out.truncated, true);
  assert.equal(out.cards.length, 2);
});

test('malformed records are counted, not shown', async () => {
  const { transport } = pages(json({ records: [rec(), { id: 'bad' }, null] }));
  const out = await fetchMiloApprovals(config, { transport });
  assert.equal(out.cards.length, 1);
  assert.equal(out.malformed, 2);
});

test('empty table is a real empty result', async () => {
  const { transport } = pages(json({ records: [] }));
  const out = await fetchMiloApprovals(config, { transport });
  assert.equal(out.ok, true);
  assert.equal(out.cards.length, 0);
});

test('errors are unavailable, never a fake zero, and any failed page fails the read', async () => {
  const cases = [
    [[json({}, 401)], 'credential_rejected'],
    [[json({}, 403)], 'credential_rejected'],
    [[json({}, 404)], 'table_not_found'],
    [[json({}, 429)], 'rate_limited'],
    [[json({}, 500)], 'http_error'],
    [[new Error('boom')], 'network_error'],
    [[{ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } }], 'invalid_json'],
    [[json({ nope: [] })], 'records_missing'],
    [[json(null)], 'records_missing'],
    [[json({ records: [], offset: 5 })], 'invalid_offset'],
    [[json({ records: [], offset: 'bad offset with spaces' })], 'invalid_offset'],
    [[json({ records: [rec()], offset: 'o1' }), json({}, 500)], 'http_error'],
  ];
  for (const [bodies, code] of cases) {
    const { transport } = pages(...bodies);
    const out = await fetchMiloApprovals(config, { transport });
    assert.equal(out.ok, false, code);
    assert.equal(out.code, code);
    assert.ok(!('cards' in out), code);
    assert.ok(miloFailureText(code).length > 0);
  }
});

test('filters group raw decisions; unknown filter falls back to all', () => {
  const cards = ['Pending', 'Approved', 'Needs Changes', 'Rejected', null, 'Something else'].map((d) => parseMiloRecord(rec({ Decision: d ?? undefined })));
  assert.equal(filterMiloCards(cards, 'approved').length, 1);
  assert.equal(filterMiloCards(cards, 'needs_changes').length, 1);
  assert.equal(filterMiloCards(cards, 'other').length, 2);
  assert.equal(filterMiloCards(cards, 'bogus').length, 6);
  assert.equal(activeMiloFilter('bogus'), 'all');
  assert.equal(activeMiloFilter(['approved']), 'all');
  assert.equal(activeMiloFilter('pending'), 'pending');
  assert.equal(decisionGroup('approved'), 'approved');
});

test('caveats never upgrade a label into execution or completion', () => {
  const inProgress = miloCardCaveat({ decision: 'Approved', status: 'In Progress' });
  assert.match(inProgress, /Airtable label, not verified execution/);
  assert.match(inProgress, /not verified/);
  assert.match(miloCardCaveat({ decision: 'Approved', status: 'Approved' }), /permission only/);
  assert.match(miloCardCaveat({ decision: null, status: 'Verified / Done' }), /not verified/);
  assert.match(miloCardCaveat({ decision: null, status: null }), /not verified/);
  for (const s of ['In Progress', 'Approved', 'Verified / Done', null]) {
    assert.doesNotMatch(miloCardCaveat({ decision: 'Approved', status: s }), /\b(running|healthy|completed successfully|is done)\b/i);
  }
});

test('server wrapper owner-authenticates before reading and is uncached', async () => {
  const s = await src('src/lib/mission-control/milo-approvals.ts');
  assert.match(s, /noStore\(\)/);
  const auth = s.indexOf('hasControlAccess()');
  const read = s.indexOf('fetchMiloApprovals(miloConfigFromEnv())');
  assert.ok(auth > 0 && read > auth, 'auth check precedes the Airtable read');
  assert.ok(!/NEXT_PUBLIC/.test(s));
  assert.ok(!/console\./.test(s));
});

test('legacy route keeps GET and delegates PATCH to the read-before-write decision planner', async () => {
  const s = await src('src/app/api/milo-approvals/route.ts');
  assert.match(s, /export async function GET\(\)/);
  assert.match(s, /export async function PATCH\(request: Request\)/);
  assert.match(s, /applyLegacyDecision\(miloConfigFromEnv\(\), body\)/);
  assert.match(s, /isSameOriginMutation\(request\.headers, request\.url\)/);
  assert.ok(s.indexOf('isSameOriginMutation') < s.indexOf('applyLegacyDecision(miloConfigFromEnv'), 'origin check precedes any Airtable call');
  assert.ok(!/Status\s*=\s*"In Progress"|fields\.Status\s*=/.test(s), 'route never writes Status itself (never In Progress)');
  assert.match(s, /normalizeLegacyRecord/);
  assert.match(s, /export const dynamic = "force-dynamic"/);
});

test('/approvals renders the Milo feed read-only and keeps the execution section disabled', async () => {
  const s = await src('src/app/approvals/page.tsx');
  assert.match(s, /export const dynamic = "force-dynamic"/);
  assert.match(s, /readMiloFeed\(\)/);
  assert.match(s, /No execution approvals available/);
  assert.match(s, /DisabledAction label="Approve \/ reject \/ revise"/);
  assert.match(s, /href="\/milo-approvals"/);
  assert.match(s, /this is not an empty queue/);
  assert.match(s, /does not approve, revoke, re-request or\s+execute anything/);
  assert.match(s, /break-words/);
  // No client code, no writes, no new decision buttons.
  assert.ok(!/"use client"/.test(s));
  assert.ok(!/PATCH|method:|fetch\(|onClick|<button|<form/.test(s));
  assert.ok(!/\/milo-approvals[#?]/.test(s), 'no fabricated deep links into the retained module');
  assert.ok(!/\b(running|healthy)\b/i.test(s));
});

test('truncation notice is truthful about the retained module (review F1)', async () => {
  const s = await src('src/app/approvals/page.tsx');
  assert.match(s, /additional cards exist in Airtable and are not shown here/);
  assert.match(s, /retained module shows at most the first 100/);
  // The legacy GET reads one page of 100, so it never holds "the full table".
  assert.doesNotMatch(s, /full table/i);
  assert.match(legacyListUrl(config).toString(), /pageSize=100/);
});

// ---- Legacy decision recording (synthetic records, mock transport only; never a live Airtable write) -------------

const { applyLegacyDecision, parseDecisionRequest, planDecision, DECISION_BOUNDARY } = await import('../src/lib/mission-control/milo-legacy-decision.mjs');
const RID = 'recSYNTHLEGACY001';
const T0 = Date.parse('2026-10-18T15:00:00Z');

function airtableMock(fields) {
  const calls = [];
  let current = { id: RID, createdTime: '2026-10-01T00:00:00.000Z', fields: { Title: 'Synthetic legacy card', ...fields } };
  const transport = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null, auth: init.headers.Authorization });
    assert.ok(url.endsWith(`/${RID}`), 'exact record url only');
    if (init.method === 'PATCH') current = { ...current, fields: { ...current.fields, ...JSON.parse(init.body).fields } };
    return json(current);
  };
  return { calls, transport, patches: () => calls.filter((c) => c.method === 'PATCH'), current: () => current };
}

test('first approval records permission (Status Approved), never In Progress, and says nothing was started', async () => {
  const m = airtableMock({ Decision: 'Pending', Status: 'Needs Fonz Approval', Evidence: 'synthetic evidence' });
  const out = await applyLegacyDecision(config, { id: RID, action: 'approve', notes: '' }, { transport: m.transport, now: () => T0 });
  assert.equal(out.httpStatus, 200);
  assert.equal(m.calls[0].method, 'GET', 'reads the exact record before writing');
  assert.deepEqual(m.patches()[0].body.fields, { Decision: 'Approved', Status: 'Approved', 'Approved At': '2026-10-18T15:00:00.000Z' });
  assert.equal(out.body.effect, 'permission_recorded');
  assert.equal(out.body.execution, 'not_started');
  assert.equal(out.body.boundary, DECISION_BOUNDARY);
  assert.equal(m.current().fields.Evidence, 'synthetic evidence');
  assert.ok(!JSON.stringify(m.calls).includes('In Progress'));
  assert.equal(m.calls[0].auth, `Bearer ${KEY}`);
});

test('repeated approval preserves Decision, Approved At, a done outcome and notes, and makes no write', async () => {
  const saved = { Decision: 'Approved', Status: 'Verified / Done', 'Approved At': '2026-09-01T10:00:00.000Z', 'Fonz Notes': 'FHA release shipped', Evidence: 'release receipt' };
  const m = airtableMock(saved);
  const out = await applyLegacyDecision(config, { id: RID, action: 'approve', notes: '' }, { transport: m.transport, now: () => T0 });
  assert.equal(out.httpStatus, 200);
  assert.equal(m.patches().length, 0, 'no PATCH on an unchanged repeat');
  assert.equal(out.body.effect, 'approval_already_recorded');
  assert.deepEqual(out.body.changedFields, []);
  assert.equal(out.body.approval.status, 'Verified / Done');
  assert.equal(out.body.approval.approvedAt, '2026-09-01T10:00:00.000Z');
  assert.equal(out.body.approval.fonzNotes, 'FHA release shipped');
});

test('a legacy approved In Progress card is never re-stamped on repeat', () => {
  const plan = planDecision({ Decision: 'Approved', Status: 'In Progress', 'Approved At': '2026-09-01T10:00:00.000Z' }, parseDecisionRequest({ id: RID, action: 'approve', notes: '' }), () => T0);
  assert.deepEqual(plan.fields, {});
  assert.equal(plan.repeat, true);
});

test('a new decision never downgrades a completed outcome and keeps an existing Approved At', () => {
  const approve = planDecision({ Decision: 'Pending', Status: 'Verified / Done', 'Approved At': '2026-09-01T10:00:00.000Z' }, parseDecisionRequest({ id: RID, action: 'approve' }), () => T0);
  assert.deepEqual(approve.fields, { Decision: 'Approved' });
  const reject = planDecision({ Decision: 'Approved', Status: 'Verified / Done' }, parseDecisionRequest({ id: RID, action: 'reject' }), () => T0);
  assert.deepEqual(reject.fields, { Decision: 'Rejected' });
  const changes = planDecision({ Decision: 'Pending', Status: 'Needs Fonz Approval' }, parseDecisionRequest({ id: RID, action: 'needs_changes' }), () => T0);
  assert.deepEqual(changes.fields, { Decision: 'Needs Changes', Status: 'Hermie Reviewed' });
});

test('notes are never silently cleared or rewritten unchanged', async () => {
  const fields = { Decision: 'Pending', 'Fonz Notes': 'keep me' };
  // A decision click with an empty notes box leaves notes alone.
  assert.deepEqual(planDecision(fields, parseDecisionRequest({ id: RID, action: 'reject', notes: '' })).fields, { Decision: 'Rejected', Status: 'Rejected / Parked' });
  // Unchanged notes are not written.
  assert.equal(planDecision(fields, parseDecisionRequest({ id: RID, action: 'notes', notes: 'keep me' })).changed, false);
  // Clearing requires explicit confirmation; nothing is written otherwise.
  const m = airtableMock(fields);
  const refused = await applyLegacyDecision(config, { id: RID, action: 'notes', notes: '' }, { transport: m.transport });
  assert.equal(refused.httpStatus, 409);
  assert.equal(refused.body.code, 'notes_clear_unconfirmed');
  assert.equal(m.patches().length, 0);
  assert.deepEqual(planDecision(fields, parseDecisionRequest({ id: RID, action: 'notes', notes: '', clearNotes: true })).fields, { 'Fonz Notes': '' });
  assert.deepEqual(planDecision(fields, parseDecisionRequest({ id: RID, action: 'notes', notes: 'new' })).fields, { 'Fonz Notes': 'new' });
});

test('record ids, actions and statuses are validated before any request', async () => {
  const m = airtableMock({});
  for (const [body, code] of [
    [null, 'invalid_body'],
    [{ action: 'approve' }, 'missing_id'],
    [{ id: 'recA', action: 'approve' }, 'invalid_id'],
    [{ id: '../tblOther/recSYNTHLEGACY001', action: 'approve' }, 'invalid_id'],
    [{ id: RID, action: 'execute' }, 'unknown_action'],
    [{ id: RID, action: 'status' }, 'missing_status'],
    [{ id: RID, action: 'status', status: 'In Progress' }, 'status_not_allowed'],
    [{ id: RID, action: 'notes', notes: 'x'.repeat(5001) }, 'notes_too_long'],
  ]) {
    const out = await applyLegacyDecision(config, body, { transport: m.transport });
    assert.equal(out.httpStatus, 400, code);
    assert.equal(out.body.code, code);
  }
  assert.equal(m.calls.length, 0);
  const none = await applyLegacyDecision(readMiloConfig({}), { id: RID, action: 'approve' }, { transport: m.transport });
  assert.equal(none.httpStatus, 500);
  assert.equal(m.calls.length, 0);
});

test('a failed record read saves nothing', async () => {
  const calls = [];
  const transport = async (url, init) => { calls.push(init.method); return json({ error: 'NOT_FOUND' }, 404); };
  const out = await applyLegacyDecision(config, { id: RID, action: 'approve' }, { transport });
  assert.equal(out.httpStatus, 404);
  assert.deepEqual(calls, ['GET']);
  const mismatch = async () => json({ id: 'recSYNTHOTHER0001', fields: {} });
  assert.equal((await applyLegacyDecision(config, { id: RID, action: 'approve' }, { transport: mismatch })).httpStatus, 502);
});

test('legacy normalizer exposes raw saved status/decision without its display defaults', () => {
  const out = normalizeLegacyRecord({ id: 'recA', fields: {} });
  assert.equal(out.savedStatus, null);
  assert.equal(out.savedDecision, null);
  assert.equal(normalizeLegacyRecord({ id: 'recA', fields: { Status: 'In Progress', Decision: 'Approved' } }).savedStatus, 'In Progress');
});

test('legacy page is a concise card list with details, evidence-backed status and no execute action', async () => {
  const s = await src('src/app/milo-approvals/page.tsx');
  assert.ok(!/grid-cols-7|min-w-\[1180px\]/.test(s), 'no 7-column wall');
  assert.ok(!/queue execution|Approve \+ queue/i.test(s), 'approval is never labelled as queuing execution');
  assert.match(s, /Record approval \(permission only\)/);
  assert.match(s, /DECISION_BOUNDARY/);
  assert.match(s, /<details/);
  assert.match(s, /line-clamp-2/);
  assert.match(s, /joinSourceCards\(cards, links\)/);
  assert.match(s, /fetch\("\/api\/control\/record-links"/);
  assert.match(s, /savedStatus/);
  assert.match(s, /Unknown \(task links could not be read\)/);
  assert.match(s, /href="\/approvals"/);
  assert.match(s, /href="\/content"/);
  for (const action of ['"approve"', '"needs_changes"', '"reject"', '"notes"']) assert.ok(s.includes(`onAction(${action})`), action);
  assert.ok(!/onAction\("execute"\)|>\s*Execute\s*</.test(s), 'no execute button');
  assert.ok(!/title\.includes|\.title\s*===|match\(.*title/i.test(s), 'never links by title');
  assert.match(DECISION_BOUNDARY, /Approval records permission; execution is confirmed by a linked task/);
});

test('task detail pre-wrapped text breaks long tokens (mobile run errors)', async () => {
  const s = await src('src/app/tasks/[id]/page.tsx');
  const pre = s.match(/className="[^"]*whitespace-pre-wrap[^"]*"/g) ?? [];
  assert.ok(pre.length >= 5);
  for (const c of pre) assert.match(c, /break-words/, c);
});
