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

test('legacy route keeps GET/PATCH semantics', async () => {
  const s = await src('src/app/api/milo-approvals/route.ts');
  assert.match(s, /export async function GET\(\)/);
  assert.match(s, /export async function PATCH\(request: Request\)/);
  for (const frag of ['fields.Decision = "Approved"', 'fields.Status = "In Progress"', 'fields.Status = "Rejected / Parked"', 'fields.Status = "Hermie Reviewed"', '"Fonz Notes"', 'Unknown action.', 'Airtable API key is not configured.']) {
    assert.ok(s.includes(frag), frag);
  }
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
