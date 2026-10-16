import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import {
  EVIDENCE_LEVELS,
  FAMILIES,
  RECOMMENDATIONS,
  SNAPSHOT_KIND,
  SNAPSHOT_SCHEMA_VERSION,
  createUnavailableSnapshot,
  filterAssets,
  normalizeSnapshot,
  sanitizeExternalUrl,
  sanitizeText,
  summarizeAssets,
} from '../src/lib/headquarters/model.mjs';
import { loadHeadquartersSnapshot } from '../src/lib/headquarters/loader.mjs';
import { isHeadquartersAuthorized } from '../src/lib/headquarters/access.mjs';
import { buildSnapshotFromEvidence, ImportValidationError } from './headquarters/import-core.mjs';

const run = promisify(execFile);

// Synthetic fixtures only. Every name below is invented; no real inventory belongs in this file.
const SECRET_MARKERS = [
  'SUPER_SECRET_ENV_NAME',
  'prj_SyntheticProjectId123',
  'dpl_SyntheticDeployment',
  'synthetic-deploy-hash.vercel.app',
  'tok3n-value',
  'hunter2',
  'person@example.com',
  '/Users/synthetic-user',
  'ghp_SyntheticTokenValue0000',
  'leadFieldPhone',
  'api/private-leads',
  '@synthetic-owner',
  'secret=1',
];

function makeEvidence(counts = { github: 2, vercel: 2, replit: 2, local: 2 }) {
  const github = Array.from({ length: counts.github }, (_, i) => ({
    name: `Repo-${i}`,
    full_name: `example-org/Repo-${i}`,
    private: i % 2 === 0,
    archived: false,
    description: i === 0 ? 'Contact person@example.com for access' : null,
    homepage: i === 0 ? 'https://user:hunter2@repo-0.example.com/app?secret=1#frag' : null,
    default_branch: 'main',
    pushed_at: '2026-01-02T03:04:05Z',
    size: 10,
    language: 'TypeScript',
  }));
  const vercel = Array.from({ length: counts.vercel }, (_, i) => ({
    id: 'prj_SyntheticProjectId123',
    name: `site-${i}`,
    framework: 'nextjs',
    createdAt: 1,
    updatedAt: 2,
    git: { type: 'github', repo: `Repo-${i}`, org: 'example-org', productionBranch: 'main' },
    environment_key_names: ['SUPER_SECRET_ENV_NAME'],
    production: { id: 'dpl_SyntheticDeployment', url: 'synthetic-deploy-hash.vercel.app', readyState: i === 1 ? 'ERROR' : 'READY', createdAt: 3, target: 'production' },
  }));
  const vercel_http_reads = vercel.map((v, i) => ({
    name: v.name,
    domain_api_status: 200,
    domains: [`${v.name}.example.app`],
    pages: [{
      domain: `${v.name}.example.app`,
      status: i === 1 ? 404 : 200,
      final_origin_and_path: `https://${v.name}.example.app/login?token=tok3n-value`,
      title: i === 1 ? null : `Site ${i}`,
      body_bytes_read: 100,
      auth_marker: false,
    }],
    domain_has_more: false,
  }));
  const github_tree_reads = github.map((g, i) => ({
    repo: g.name,
    tree_status: i === 1 ? 409 : 200,
    blob_count: i === 1 ? 0 : 12,
    truncated: false,
    root_file_names: ['package.json'],
    integration_evidence_paths: i === 0 ? ['src/data/mockData.ts', '/Users/synthetic-user/abs.ts'] : [],
  }));
  const replit_discovered_projects = Object.fromEntries(
    Array.from({ length: counts.replit }, (_, i) => [`/@synthetic-owner/Workspace-${i}`, `Workspace ${i}`]),
  );
  const local_project_metadata = Array.from({ length: counts.local }, (_, i) => ({
    directory: `local-dir-${i}`,
    path: `/Users/synthetic-user/Projects/local-dir-${i}`,
    git_root: `/Users/synthetic-user/Projects/local-dir-${i}`,
    remote: i === 0 ? 'https://someone:ghp_SyntheticTokenValue0000@github.com/example-org/Repo-0.git' : '',
    branch: 'main',
    commit: 'abc123',
    dirty_entry_count: i,
    package: i === 0 ? { name: 'misleading-package-name', script_names: ['dev'], stack: { next: '14', react: '18', 'left-pad': '1' } } : undefined,
    top_level_file_names: ['package.json'],
  }));
  return {
    snapshot_date: '2026-01-02',
    timezone: 'America/Los_Angeles',
    coverage: { github_account: 'example-org', vercel_scope: 'synthetic-scope', replit_workspace: '@synthetic-owner', local_root: '/Users/synthetic-user/Projects' },
    counts: {
      github_repositories: counts.github,
      vercel_projects: counts.vercel,
      replit_discovered_projects: counts.replit,
      local_directories: counts.local,
    },
    github,
    vercel,
    vercel_http_reads,
    github_tree_reads,
    replit_discovered_projects,
    local_project_metadata,
    equity_public_api_check: {
      url: 'https://leads.example.com/api/private-leads',
      http_status: 200,
      authorization_header_sent: false,
      cookies_sent: false,
      top_level_keys: ['records'],
      returned_lead_count: 7,
      record_field_names: ['leadFieldPhone'],
      has_personal_contact_fields: true,
    },
    external_reference_reads: [],
    limitations: ['Assets overlap across platforms.'],
  };
}

const ANNOTATIONS = {
  schemaVersion: 1,
  assets: {
    'github:example-org-repo-0': {
      family: 'mortgage',
      recommendation: 'keep',
      statusLabel: 'Adapter present; live connection unverified',
      gap: 'Live connection not exercised. Email person@example.com',
      nextMove: 'Confirm canonical source.',
      secondaryEvidence: ['user_reported', 'not-a-level'],
      evidenceCap: null,
    },
    'vercel:site-0': { family: 'not-a-family', recommendation: 'not-a-rec' },
  },
  nodes: [{ id: 'node:orchestrator', label: 'Orchestrator', kind: 'orchestrator', note: 'Coordinator role' }],
  connections: [
    { from: 'node:orchestrator', to: 'github:example-org-repo-0', kind: 'proposed', verification: 'runtime_tested', label: 'Proposed control link' },
  ],
  findings: [{ id: 'finding-1', severity: 'critical', title: 'Contain exposure', detail: 'See https://x.example.com/a?key=tok3n-value', assetIds: ['github:example-org-repo-0', 'missing:id'] }],
  roadmap: [{ id: 'phase-0', phase: 0, title: 'Safety', summary: 'Contain', status: 'completed', dependencies: [], acceptanceTests: ['No anonymous data'], approvalsNeeded: ['Owner'] }],
  readiness: [{ id: 'r-1', category: 'integration', title: 'Task engine', detail: 'Not integrated', state: 'not_integrated' }],
  limitations: ['Annotation limitation'],
};

const FIXED_TIME = '2026-01-02T12:00:00.000Z';

function build(counts, annotations = ANNOTATIONS) {
  return buildSnapshotFromEvidence(makeEvidence(counts), annotations, { generatedAt: FIXED_TIME });
}

function assertNoLeaks(value) {
  const json = JSON.stringify(value);
  for (const marker of SECRET_MARKERS) {
    assert.ok(!json.includes(marker), `leaked marker: ${marker}`);
  }
}

// ---------- importer ----------

test('importer preserves every platform asset for production-sized coverage without hardcoding counts', () => {
  for (const counts of [
    { github: 16, vercel: 9, replit: 19, local: 20 },
    { github: 3, vercel: 1, replit: 0, local: 5 },
  ]) {
    const snapshot = build(counts, { schemaVersion: 1 });
    assert.equal(snapshot.kind, SNAPSHOT_KIND);
    assert.equal(snapshot.schemaVersion, SNAPSHOT_SCHEMA_VERSION);
    const byPlatform = summarizeAssets(snapshot.assets).byPlatform;
    assert.deepEqual(byPlatform, counts);
    assert.deepEqual(snapshot.coverage, counts);
    const ids = snapshot.assets.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length, 'asset IDs must be unique');
  }
});

test('importer rejects evidence whose records disagree with declared coverage counts', () => {
  const evidence = makeEvidence();
  evidence.counts.vercel_projects = 5;
  assert.throws(() => buildSnapshotFromEvidence(evidence, { schemaVersion: 1 }, { generatedAt: FIXED_TIME }), ImportValidationError);
});

test('importer rejects annotations that reference unknown asset IDs', () => {
  assert.throws(
    () => build(undefined, { schemaVersion: 1, assets: { 'github:does-not-exist': { family: 'mortgage' } } }),
    ImportValidationError,
  );
});

test('importer gives colliding identifiers distinct stable IDs', () => {
  const evidence = makeEvidence({ github: 0, vercel: 0, replit: 2, local: 0 });
  evidence.replit_discovered_projects = { '/@synthetic-owner/Same.Name': 'A', '/@synthetic-owner/same-name': 'B' };
  const a = buildSnapshotFromEvidence(evidence, { schemaVersion: 1 }, { generatedAt: FIXED_TIME });
  const b = buildSnapshotFromEvidence(evidence, { schemaVersion: 1 }, { generatedAt: FIXED_TIME });
  const ids = a.assets.map((x) => x.id);
  assert.equal(new Set(ids).size, 2);
  assert.deepEqual(ids, b.assets.map((x) => x.id));
});

test('importer derives honest evidence levels from evidence only', () => {
  const snapshot = build();
  const get = (id) => snapshot.assets.find((a) => a.id === id);
  assert.equal(get('github:example-org-repo-0').evidenceLevel, 'source_inspected');
  assert.equal(get('github:example-org-repo-1').evidenceLevel, 'project_exists');
  assert.equal(get('vercel:site-0').evidenceLevel, 'page_responds');
  assert.equal(get('vercel:site-1').evidenceLevel, 'project_exists');
  assert.equal(get('vercel:site-1').facts.httpStatus, 404);
  assert.equal(get('vercel:site-1').facts.deploymentState, 'ERROR');
  assert.equal(get('replit:workspace-0').evidenceLevel, 'project_exists');
  assert.equal(get('local:local-dir-0').evidenceLevel, 'source_inspected');
  assert.equal(get('local:local-dir-1').evidenceLevel, 'project_exists');
  // annotation secondary evidence is filtered to known levels and never replaces the primary level
  assert.deepEqual(get('github:example-org-repo-0').secondaryEvidence, ['user_reported']);
});

test('importer applies annotations with enum fallback and keeps unannotated assets unreviewed', () => {
  const snapshot = build();
  const get = (id) => snapshot.assets.find((a) => a.id === id);
  assert.equal(get('github:example-org-repo-0').family, 'mortgage');
  assert.equal(get('github:example-org-repo-0').recommendation, 'keep');
  assert.equal(get('github:example-org-repo-0').statusLabel, 'Adapter present; live connection unverified');
  assert.equal(get('vercel:site-0').family, 'utilities_unknown');
  assert.equal(get('vercel:site-0').recommendation, 'unreviewed');
  assert.equal(get('replit:workspace-1').recommendation, 'unreviewed');
});

test('importer preserves identifiers and records metadata relations', () => {
  const snapshot = build();
  const get = (id) => snapshot.assets.find((a) => a.id === id);
  assert.equal(get('github:example-org-repo-0').identifier, 'example-org/Repo-0');
  assert.equal(get('vercel:site-0').identifier, 'site-0');
  assert.equal(get('replit:workspace-0').identifier, 'Workspace-0');
  assert.equal(get('local:local-dir-0').identifier, 'local-dir-0');
  const hosting = snapshot.connections.find((c) => c.from === 'vercel:site-0' && c.to === 'github:example-org-repo-0');
  assert.equal(hosting.kind, 'hosting');
  assert.equal(hosting.verification, 'platform_metadata');
  const source = snapshot.connections.find((c) => c.from === 'local:local-dir-0' && c.to === 'github:example-org-repo-0');
  assert.equal(source.kind, 'source_link');
  const proposed = snapshot.connections.find((c) => c.from === 'node:orchestrator');
  assert.equal(proposed.kind, 'proposed');
  assert.equal(proposed.verification, 'proposed', 'proposed edges cannot claim runtime verification');
  assert.equal(snapshot.roadmap[0].status, 'planned', 'roadmap phases are planned, never completed by import');
  assert.deepEqual(snapshot.findings[0].assetIds, ['github:example-org-repo-0']);
});

test('importer output contains no raw metadata, secrets, paths, usernames, or lead details', () => {
  const snapshot = build();
  assertNoLeaks(snapshot);
  assert.equal(snapshot.notices.sensitiveLeadAccess, true);
  const local = snapshot.assets.find((a) => a.id === 'local:local-dir-0');
  assert.deepEqual(local.facts.stack, ['next', 'react']);
  assert.equal(local.facts.hasUncommittedChanges, false);
  const vercel = snapshot.assets.find((a) => a.id === 'vercel:site-0');
  assert.deepEqual(vercel.links, [{ label: 'Production alias', url: 'https://site-0.example.app/login' }]);
  const repo = snapshot.assets.find((a) => a.id === 'github:example-org-repo-0');
  assert.ok(repo.links.some((l) => l.url === 'https://repo-0.example.com/app'));
  assert.deepEqual(repo.facts.observedPaths, ['src/data/mockData.ts']);
});

// ---------- model ----------

test('sanitizeExternalUrl only allows public http(s) and strips credentials, query, fragment', () => {
  assert.equal(sanitizeExternalUrl('https://u:p@example.com/a/b?x=1#y'), 'https://example.com/a/b');
  assert.equal(sanitizeExternalUrl('http://example.com'), 'http://example.com/');
  for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'ftp://example.com', 'http://localhost:3000', 'http://127.0.0.1', 'http://10.0.0.5', 'http://192.168.1.1', 'http://[::1]/', 'not a url', '', null, 42]) {
    assert.equal(sanitizeExternalUrl(bad), null, `should reject ${bad}`);
  }
});

test('sanitizeText redacts emails, local paths, token-like strings, and URL secrets', () => {
  const out = sanitizeText('Mail person@example.com at /Users/synthetic-user/x with ghp_SyntheticTokenValue0000 via https://a:b@x.example.com/p?secret=1');
  assertNoLeaks(out);
  assert.match(out, /https:\/\/x\.example\.com\/p/);
  assert.equal(sanitizeText(null), '');
  assert.ok(sanitizeText('x'.repeat(5000)).length <= 600);
});

test('normalizeSnapshot whitelists fields and rejects malformed structures', () => {
  const snapshot = build();
  const dirty = structuredClone(snapshot);
  dirty.raw = makeEvidence();
  dirty.assets[0].environment_key_names = ['SUPER_SECRET_ENV_NAME'];
  dirty.assets[0].path = '/Users/synthetic-user/x';
  dirty.assets[0].evidenceLevel = 'totally-verified';
  dirty.assets[0].links.push({ label: 'bad', url: 'javascript:alert(1)' });
  const result = normalizeSnapshot(dirty);
  assert.equal(result.available, true);
  assertNoLeaks(result);
  assert.equal(result.assets[0].evidenceLevel, 'unverified');
  assert.ok(result.assets[0].links.every((l) => l.url.startsWith('http')));
  assert.equal(result.mode, 'blueprint');
  assert.equal(result.liveExecutionBridge, 'not_connected');
  assert.equal(result.live.runs, null);
  assert.equal(result.live.approvals, null);
  assert.equal(result.live.heartbeat, null);

  for (const bad of [null, 'x', [], { kind: 'other' }, { ...snapshot, schemaVersion: 99 }, { ...snapshot, assets: 'nope' }]) {
    const r = normalizeSnapshot(bad);
    assert.equal(r.available, false);
    assert.equal(r.status, 'invalid');
    assert.deepEqual(r.assets, []);
    assert.equal(r.summary, null);
  }

  const dup = structuredClone(snapshot);
  dup.assets.push(structuredClone(dup.assets[0]));
  assert.equal(normalizeSnapshot(dup).status, 'invalid');

  const badPlatform = structuredClone(snapshot);
  badPlatform.assets[0].platform = 'myspace';
  assert.equal(normalizeSnapshot(badPlatform).status, 'invalid');
});

test('normalizeSnapshot drops connections to unknown endpoints and flags incomplete coverage', () => {
  const snapshot = build();
  snapshot.connections.push({ id: 'c-x', from: 'vercel:site-0', to: 'github:ghost', kind: 'hosting', verification: 'platform_metadata', label: 'x' });
  snapshot.assets = snapshot.assets.filter((a) => a.id !== 'replit:workspace-1');
  const result = normalizeSnapshot(snapshot);
  assert.ok(!result.connections.some((c) => c.to === 'github:ghost'));
  assert.equal(result.summary.coverageComplete, false);
  assert.deepEqual(result.summary.coverageGaps, [{ platform: 'replit', expected: 2, actual: 1 }]);
  assert.equal(normalizeSnapshot(build()).summary.coverageComplete, true);
});

test('summarizeAssets computes counts from records', () => {
  const assets = normalizeSnapshot(build()).assets;
  const summary = summarizeAssets(assets);
  assert.equal(summary.total, assets.length);
  assert.equal(Object.values(summary.byFamily).reduce((a, b) => a + b, 0), assets.length);
  assert.equal(Object.values(summary.byEvidence).reduce((a, b) => a + b, 0), assets.length);
  assert.equal(Object.values(summary.byRecommendation).reduce((a, b) => a + b, 0), assets.length);
  for (const key of FAMILIES) assert.ok(key in summary.byFamily);
  for (const key of EVIDENCE_LEVELS) assert.ok(key in summary.byEvidence);
  for (const key of RECOMMENDATIONS) assert.ok(key in summary.byRecommendation);
  assert.equal(summarizeAssets([]).total, 0);
});

test('filterAssets combines search and enum filters', () => {
  const assets = normalizeSnapshot(build()).assets;
  assert.equal(filterAssets(assets, {}).length, assets.length);
  assert.equal(filterAssets(assets, { platform: 'all', family: 'all' }).length, assets.length);
  assert.deepEqual(filterAssets(assets, { platform: 'vercel' }).map((a) => a.id), ['vercel:site-0', 'vercel:site-1']);
  assert.deepEqual(filterAssets(assets, { family: 'mortgage' }).map((a) => a.id), ['github:example-org-repo-0']);
  assert.deepEqual(filterAssets(assets, { evidenceLevel: 'page_responds' }).map((a) => a.id), ['vercel:site-0']);
  assert.deepEqual(filterAssets(assets, { recommendation: 'keep' }).map((a) => a.id), ['github:example-org-repo-0']);
  assert.deepEqual(filterAssets(assets, { query: '  WORKSPACE 1 ' }).map((a) => a.id), ['replit:workspace-1']);
  assert.deepEqual(filterAssets(assets, { query: 'example-org/repo-1' }).map((a) => a.id), ['github:example-org-repo-1']);
  assert.deepEqual(filterAssets(assets, { platform: 'vercel', query: 'repo' }), []);
  assert.deepEqual(filterAssets(null, {}), []);
});

test('createUnavailableSnapshot is truthful and empty', () => {
  const u = createUnavailableSnapshot('not_configured');
  assert.equal(u.available, false);
  assert.equal(u.status, 'not_configured');
  assert.equal(u.mode, 'blueprint');
  assert.equal(u.liveExecutionBridge, 'not_connected');
  assert.equal(u.observedAt, null);
  assert.equal(u.summary, null);
  for (const key of ['assets', 'connections', 'nodes', 'findings', 'roadmap', 'readiness', 'limitations']) assert.deepEqual(u[key], []);
  assert.match(u.message, /MC_HQ_SNAPSHOT_PATH|not configured/i);
});

// ---------- access guard ----------

test('HQ guard fails closed without a configured PIN, even with a cookie', () => {
  for (const pin of [undefined, null, '', '   ']) {
    for (const cookie of [undefined, '', 'anything', pin]) {
      assert.equal(isHeadquartersAuthorized({ pin, cookie }), false, `pin=${JSON.stringify(pin)} cookie=${JSON.stringify(cookie)}`);
    }
  }
});

test('HQ guard rejects missing or invalid cookies when a PIN is configured', () => {
  for (const cookie of [undefined, null, '', '1234 ', '12345', '123', 'other', 1234]) {
    assert.equal(isHeadquartersAuthorized({ pin: '1234', cookie }), false, `cookie=${JSON.stringify(cookie)}`);
  }
});

test('HQ guard accepts the cookie only when it exactly matches the configured PIN', () => {
  assert.equal(isHeadquartersAuthorized({ pin: '1234', cookie: '1234' }), true);
  assert.equal(isHeadquartersAuthorized({ pin: 'synthetic-pin', cookie: 'synthetic-pin' }), true);
  assert.equal(isHeadquartersAuthorized({}), false);
  assert.equal(isHeadquartersAuthorized(), false);
});

// ---------- review regressions ----------

test('sanitizeExternalUrl rejects private hosts written with a trailing dot', () => {
  for (const bad of ['http://localhost./', 'http://localhost.:3000/x', 'http://intranet./', 'http://printer.local./', 'http://db.internal./', 'http://app.localhost./', 'http://127.0.0.1./', 'http://10.0.0.5./']) {
    assert.equal(sanitizeExternalUrl(bad), null, `should reject ${bad}`);
  }
  assert.equal(sanitizeExternalUrl('https://example.com./a'), 'https://example.com./a');
});

test('normalizeSnapshot deduplicates relatedAssetIds and links by sanitized URL', () => {
  const snapshot = build();
  const asset = snapshot.assets.find((a) => a.id === 'vercel:site-0');
  asset.relatedAssetIds = ['github:example-org-repo-0', 'github:example-org-repo-0', 'replit:workspace-0', 'replit:workspace-0'];
  asset.links = [
    { label: 'A', url: 'https://site-0.example.app/login' },
    { label: 'B', url: 'https://site-0.example.app/login?token=tok3n-value' },
    { label: 'C', url: 'https://u:hunter2@site-0.example.app/login#x' },
    { label: 'D', url: 'https://other.example.app/' },
  ];
  const result = normalizeSnapshot(snapshot).assets.find((a) => a.id === 'vercel:site-0');
  assert.deepEqual(result.relatedAssetIds, ['github:example-org-repo-0', 'replit:workspace-0']);
  assert.deepEqual(result.links, [
    { label: 'A', url: 'https://site-0.example.app/login' },
    { label: 'D', url: 'https://other.example.app/' },
  ]);
  assertNoLeaks(result);
});

test('importer metadata relations do not produce duplicate relatedAssetIds', () => {
  const annotations = { schemaVersion: 1, assets: { 'vercel:site-0': { relatedAssetIds: ['github:example-org-repo-0', 'github:example-org-repo-0'] } } };
  const snapshot = build(undefined, annotations);
  const related = snapshot.assets.find((a) => a.id === 'vercel:site-0').relatedAssetIds;
  assert.deepEqual(related, ['github:example-org-repo-0']);
});

test('annotated nodes are capped at user_reported evidence', () => {
  const annotations = {
    schemaVersion: 1,
    nodes: [
      { id: 'node:claims-verified', label: 'Claims verified', kind: 'system', evidenceLevel: 'provider_read_verified' },
      { id: 'node:claims-page', label: 'Claims page', kind: 'service', evidenceLevel: 'page_responds' },
      { id: 'node:reported', label: 'Reported', kind: 'system', evidenceLevel: 'user_reported' },
      { id: 'node:none', label: 'None', kind: 'system', evidenceLevel: 'unverified' },
    ],
  };
  const snapshot = build(undefined, annotations);
  const level = (id) => snapshot.nodes.find((n) => n.id === id).evidenceLevel;
  assert.equal(level('node:claims-verified'), 'user_reported');
  assert.equal(level('node:claims-page'), 'user_reported');
  assert.equal(level('node:reported'), 'user_reported');
  assert.equal(level('node:none'), 'unverified');
  // The model enforces the same cap when reading a stored snapshot directly.
  const raw = structuredClone(snapshot);
  raw.nodes[0].evidenceLevel = 'provider_read_verified';
  assert.equal(normalizeSnapshot(raw).nodes[0].evidenceLevel, 'user_reported');
});

test('unbacked annotated connections cannot claim runtime, source, or metadata verification', () => {
  const annotations = {
    schemaVersion: 1,
    nodes: [{ id: 'node:orchestrator', label: 'Orchestrator', kind: 'orchestrator' }, { id: 'node:svc', label: 'Svc', kind: 'service' }],
    connections: [
      { from: 'node:svc', to: 'node:orchestrator', kind: 'runtime', verification: 'runtime_tested', label: 'Claimed runtime', note: 'Private note stays useful' },
      { from: 'node:orchestrator', to: 'github:example-org-repo-1', kind: 'source_link', verification: 'source_wired', label: 'Claimed source' },
      { from: 'local:local-dir-1', to: 'github:example-org-repo-1', kind: 'source_link', verification: 'platform_metadata', label: 'Claimed metadata' },
      { from: 'node:orchestrator', to: 'node:svc', kind: 'proposed', verification: 'runtime_tested', label: 'Planned' },
    ],
  };
  const snapshot = build(undefined, annotations);
  const find = (label) => snapshot.connections.find((c) => c.label === label);
  assert.equal(find('Claimed runtime').verification, 'unverified');
  assert.equal(find('Claimed runtime').note, 'Private note stays useful');
  assert.equal(find('Claimed source').verification, 'unverified');
  assert.equal(find('Claimed metadata').verification, 'unverified');
  assert.equal(find('Planned').verification, 'proposed');
  for (const c of snapshot.connections) {
    assert.ok(c.verification !== 'runtime_tested' && c.verification !== 'source_wired', `annotation manufactured ${c.verification}`);
  }
  // Metadata-derived edges keep their observed verification.
  const hosting = snapshot.connections.find((c) => c.from === 'vercel:site-0' && c.to === 'github:example-org-repo-0' && c.kind === 'hosting');
  assert.equal(hosting.verification, 'platform_metadata');
});

test('annotated connection backed by an imported metadata record keeps platform_metadata', () => {
  const annotations = {
    schemaVersion: 1,
    connections: [
      { from: 'vercel:site-0', to: 'github:example-org-repo-0', kind: 'hosting', verification: 'platform_metadata', note: 'Annotated context' },
    ],
  };
  const snapshot = build(undefined, annotations);
  const edges = snapshot.connections.filter((c) => c.from === 'vercel:site-0' && c.to === 'github:example-org-repo-0');
  assert.ok(edges.length >= 1);
  assert.ok(edges.every((c) => c.verification === 'platform_metadata'));
  assert.ok(edges.some((c) => c.note === 'Annotated context'));
});

test('secondaryEvidence is never stronger than or equal to the final primary level', () => {
  const annotations = {
    schemaVersion: 1,
    assets: {
      'github:example-org-repo-0': { secondaryEvidence: ['provider_read_verified', 'page_responds', 'source_inspected', 'project_exists', 'user_reported'], evidenceCap: 'project_exists' },
      'vercel:site-0': { secondaryEvidence: ['provider_read_verified', 'user_reported'] },
    },
  };
  const snapshot = build(undefined, annotations);
  const repo = snapshot.assets.find((a) => a.id === 'github:example-org-repo-0');
  assert.equal(repo.evidenceLevel, 'project_exists');
  assert.deepEqual(repo.secondaryEvidence, ['user_reported']);
  const site = snapshot.assets.find((a) => a.id === 'vercel:site-0');
  assert.equal(site.evidenceLevel, 'page_responds');
  assert.deepEqual(site.secondaryEvidence, ['user_reported']);
  // Model enforces the same ordering on stored snapshots.
  const raw = structuredClone(snapshot);
  raw.assets.find((a) => a.id === 'vercel:site-0').secondaryEvidence = ['provider_read_verified', 'page_responds', 'unverified', 'unverified'];
  assert.deepEqual(normalizeSnapshot(raw).assets.find((a) => a.id === 'vercel:site-0').secondaryEvidence, ['unverified']);
});

test('fallback connection IDs preserve parallel edges with different kind or verification', () => {
  const raw = build(undefined, { schemaVersion: 1, nodes: [{ id: 'node:a', label: 'A' }, { id: 'node:b', label: 'B' }] });
  raw.connections = [
    { from: 'node:a', to: 'node:b', kind: 'proposed', label: 'plan' },
    { from: 'node:a', to: 'node:b', kind: 'runtime', verification: 'unverified', label: 'claimed' },
    { from: 'node:a', to: 'node:b', kind: 'runtime', verification: 'runtime_tested', label: 'tested' },
    { from: 'node:b', to: 'node:a', kind: 'proposed', label: 'reverse' },
  ];
  const result = normalizeSnapshot(raw);
  assert.equal(result.connections.length, 4);
  assert.equal(new Set(result.connections.map((c) => c.id)).size, 4);
});

test('importer keeps parallel annotated edges and rejects conflicting duplicate explicit IDs', () => {
  const nodes = [{ id: 'node:a', label: 'A' }, { id: 'node:b', label: 'B' }];
  const parallel = build(undefined, {
    schemaVersion: 1,
    nodes,
    connections: [
      { from: 'node:a', to: 'node:b', kind: 'proposed', label: 'plan' },
      { from: 'node:a', to: 'node:b', kind: 'runtime', verification: 'runtime_tested', label: 'claimed' },
    ],
  });
  const between = parallel.connections.filter((c) => c.from === 'node:a' && c.to === 'node:b');
  assert.deepEqual(between.map((c) => c.verification).sort(), ['proposed', 'unverified']);

  assert.throws(
    () => build(undefined, {
      schemaVersion: 1,
      nodes,
      connections: [
        { id: 'edge-1', from: 'node:a', to: 'node:b', kind: 'proposed', label: 'one' },
        { id: 'edge-1', from: 'node:b', to: 'node:a', kind: 'proposed', label: 'two' },
      ],
    }),
    ImportValidationError,
  );
  // An explicit annotated ID may not collide with a metadata-derived edge either.
  const metadataId = build().connections.find((c) => c.kind === 'hosting').id;
  assert.throws(
    () => build(undefined, { schemaVersion: 1, nodes, connections: [{ id: metadataId, from: 'node:a', to: 'node:b', kind: 'proposed' }] }),
    ImportValidationError,
  );
  // Invalid kinds are rejected rather than silently dropped.
  assert.throws(
    () => build(undefined, { schemaVersion: 1, nodes, connections: [{ from: 'node:a', to: 'node:b', kind: 'telepathy' }] }),
    ImportValidationError,
  );
});

// ---------- loader ----------

test('loader reports not_configured without env var and never reads files', async () => {
  let reads = 0;
  const result = await loadHeadquartersSnapshot({ env: {}, readFile: async () => { reads += 1; return '{}'; } });
  assert.equal(result.status, 'not_configured');
  assert.equal(reads, 0);
  assert.deepEqual(result.assets, []);
});

test('loader handles missing, malformed, invalid, and oversized files without leaking paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hq-test-'));
  try {
    const missing = join(dir, 'secret-location', 'missing.json');
    const r1 = await loadHeadquartersSnapshot({ env: { MC_HQ_SNAPSHOT_PATH: missing } });
    assert.equal(r1.status, 'unreadable');
    assert.ok(!JSON.stringify(r1).includes(dir));

    const malformed = join(dir, 'malformed.json');
    await writeFile(malformed, '{not json');
    const r2 = await loadHeadquartersSnapshot({ env: { MC_HQ_SNAPSHOT_PATH: malformed } });
    assert.equal(r2.status, 'malformed');
    assert.ok(!JSON.stringify(r2).includes(dir));
    assert.deepEqual(r2.assets, []);

    const invalid = join(dir, 'invalid.json');
    await writeFile(invalid, JSON.stringify({ kind: 'something-else' }));
    const r3 = await loadHeadquartersSnapshot({ env: { MC_HQ_SNAPSHOT_PATH: invalid } });
    assert.equal(r3.status, 'invalid');

    const relative = await loadHeadquartersSnapshot({ env: { MC_HQ_SNAPSHOT_PATH: 'relative/path.json' } });
    assert.equal(relative.status, 'not_configured');

    const big = await loadHeadquartersSnapshot({ env: { MC_HQ_SNAPSHOT_PATH: malformed }, readFile: async () => 'x'.repeat(6 * 1024 * 1024) });
    assert.equal(big.status, 'malformed');

    const good = join(dir, 'good.json');
    await writeFile(good, JSON.stringify(build()));
    const r4 = await loadHeadquartersSnapshot({ env: { MC_HQ_SNAPSHOT_PATH: good } });
    assert.equal(r4.available, true);
    assert.equal(r4.status, 'ok');
    assert.equal(r4.observedAt, '2026-01-02');
    assert.equal(r4.assets.length, 8);
    assertNoLeaks(r4);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------- CLI ----------

test('import CLI writes an owner-only snapshot that the loader accepts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hq-cli-'));
  try {
    const evidencePath = join(dir, 'evidence.json');
    const annotationsPath = join(dir, 'annotations.json');
    const outPath = join(dir, 'out', 'snapshot.json');
    await writeFile(evidencePath, JSON.stringify(makeEvidence()));
    await writeFile(annotationsPath, JSON.stringify(ANNOTATIONS));
    const { stdout } = await run(process.execPath, [
      'scripts/import-headquarters-snapshot.mjs',
      '--evidence', evidencePath,
      '--annotations', annotationsPath,
      '--out', outPath,
    ]);
    assert.match(stdout, /github=2 vercel=2 replit=2 local=2/);
    const mode = (await stat(outPath)).mode & 0o777;
    assert.equal(mode, 0o600);
    const written = JSON.parse(await readFile(outPath, 'utf8'));
    assertNoLeaks(written);
    const loaded = await loadHeadquartersSnapshot({ env: { MC_HQ_SNAPSHOT_PATH: outPath } });
    assert.equal(loaded.status, 'ok');

    const bad = JSON.parse(JSON.stringify(makeEvidence()));
    bad.counts.local_directories = 99;
    await writeFile(evidencePath, JSON.stringify(bad));
    await assert.rejects(run(process.execPath, [
      'scripts/import-headquarters-snapshot.mjs',
      '--evidence', evidencePath,
      '--annotations', annotationsPath,
      '--out', join(dir, 'out', 'second.json'),
    ]));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------- cloud snapshot (chunked gzip+base64 env) ----------

const MAX_HQ_BYTES = 5 * 1024 * 1024;

function cloudEnv(payload, { parts, gzip = true } = {}) {
  const raw = Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload));
  const encoded = (gzip ? gzipSync(raw) : raw).toString('base64');
  const size = parts ? Math.ceil(encoded.length / parts) : 4096;
  const env = {};
  let n = 0;
  for (let i = 0; i < encoded.length; i += size) env[`MC_HQ_SNAPSHOT_PART_${n++}`] = encoded.slice(i, i + size);
  env.MC_HQ_SNAPSHOT_PART_COUNT = String(n);
  return env;
}

async function quietLoad(env, readFile) {
  const calls = [];
  const saved = {};
  for (const k of ['log', 'info', 'warn', 'error', 'debug']) {
    saved[k] = console[k];
    console[k] = (...args) => calls.push(args);
  }
  try {
    const result = await loadHeadquartersSnapshot({ env, readFile: readFile ?? (async () => { throw new Error('file read'); }) });
    return { result, calls };
  } finally {
    Object.assign(console, saved);
  }
}

test('cloud loader joins valid chunked gzip base64 parts into a normalized snapshot', async () => {
  const env = cloudEnv(build(), { parts: 4 });
  assert.ok(Number(env.MC_HQ_SNAPSHOT_PART_COUNT) > 1 && Number(env.MC_HQ_SNAPSHOT_PART_COUNT) <= 8);
  const { result, calls } = await quietLoad(env);
  assert.equal(result.status, 'ok');
  assert.equal(result.available, true);
  assert.equal(result.assets.length, 8);
  assertNoLeaks(result);
  assert.equal(calls.length, 0);
});

test('cloud config takes precedence over the private file and never falls back to it', async () => {
  let reads = 0;
  const readFile = async () => { reads += 1; return JSON.stringify(build()); };
  const good = await quietLoad({ ...cloudEnv(build()), MC_HQ_SNAPSHOT_PATH: '/tmp/stale.json' }, readFile);
  assert.equal(good.result.status, 'ok');
  assert.equal(reads, 0);

  const broken = { ...cloudEnv(build()), MC_HQ_SNAPSHOT_PATH: '/tmp/stale.json' };
  broken.MC_HQ_SNAPSHOT_PART_0 = '!!!!';
  const bad = await quietLoad(broken, readFile);
  assert.equal(bad.result.available, false);
  assert.equal(reads, 0);

  // A stray part without a count is still cloud config: fail closed rather than serve local data.
  const stray = await quietLoad({ MC_HQ_SNAPSHOT_PART_0: 'AAAA', MC_HQ_SNAPSHOT_PATH: '/tmp/stale.json' }, readFile);
  assert.equal(stray.result.available, false);
  assert.equal(reads, 0);

  // Without cloud config the private file path still works.
  const local = await quietLoad({ MC_HQ_SNAPSHOT_PATH: '/tmp/local.json' }, readFile);
  assert.equal(local.result.status, 'ok');
  assert.equal(reads, 1);
});

test('cloud loader fails closed on missing parts, bad counts, and oversized chunks', async () => {
  const base = cloudEnv(build(), { parts: 4 });
  const count = Number(base.MC_HQ_SNAPSHOT_PART_COUNT);
  const cases = [];
  const missing = { ...base }; delete missing.MC_HQ_SNAPSHOT_PART_1; cases.push(missing);
  const empty = { ...base, MC_HQ_SNAPSHOT_PART_1: '' }; cases.push(empty);
  const noCount = { ...base }; delete noCount.MC_HQ_SNAPSHOT_PART_COUNT; cases.push(noCount);
  for (const c of ['0', '9', '-1', '1.5', 'abc', '', ' 2', String(count - 1), String(count + 1)]) {
    cases.push({ ...base, MC_HQ_SNAPSHOT_PART_COUNT: c });
  }
  // Extra part beyond the declared count is a misconfiguration.
  cases.push({ ...base, [`MC_HQ_SNAPSHOT_PART_${count}`]: 'AAAA' });
  // A chunk over 4096 chars is rejected even if the payload is otherwise valid.
  const one = cloudEnv(build(), { parts: 1 });
  if (one.MC_HQ_SNAPSHOT_PART_0.length <= 4096) one.MC_HQ_SNAPSHOT_PART_0 = 'A'.repeat(4100 - (4100 % 4) + 4) ;
  cases.push(one);
  for (const env of cases) {
    const { result, calls } = await quietLoad(env);
    assert.equal(result.available, false, JSON.stringify(Object.keys(env)));
    assert.deepEqual(result.assets, []);
    assert.equal(calls.length, 0);
  }
});

test('cloud loader fails closed on bad base64, bad gzip, bad JSON, and invalid snapshots', async () => {
  const good = cloudEnv(build());
  const cases = [
    { ...good, MC_HQ_SNAPSHOT_PART_0: good.MC_HQ_SNAPSHOT_PART_0.slice(0, -1) + '*' },
    { ...good, MC_HQ_SNAPSHOT_PART_0: good.MC_HQ_SNAPSHOT_PART_0 + '\n' },
    { ...good, MC_HQ_SNAPSHOT_PART_0: good.MC_HQ_SNAPSHOT_PART_0.replace(/=+$/, '') + 'A' },
    { MC_HQ_SNAPSHOT_PART_COUNT: '1', MC_HQ_SNAPSHOT_PART_0: 'QUJD=AAA' },
    cloudEnv(build(), { gzip: false }),
    cloudEnv('{not json'),
    cloudEnv({ kind: 'something-else' }),
  ];
  // Truncated gzip stream.
  const truncated = gzipSync(Buffer.from(JSON.stringify(build()))).subarray(0, 40).toString('base64');
  cases.push({ MC_HQ_SNAPSHOT_PART_COUNT: '1', MC_HQ_SNAPSHOT_PART_0: truncated });
  for (const env of cases) {
    const { result, calls } = await quietLoad(env);
    assert.equal(result.available, false);
    assert.deepEqual(result.assets, []);
    assert.equal(calls.length, 0);
  }
});

test('cloud loader caps decompressed output at the existing 5 MiB limit', async () => {
  // Highly compressible bomb: tiny encoded size, decompresses past the cap.
  const bomb = cloudEnv(' '.repeat(MAX_HQ_BYTES + 1024) + '{}');
  assert.ok(Number(bomb.MC_HQ_SNAPSHOT_PART_COUNT) <= 8);
  const { result, calls } = await quietLoad(bomb);
  assert.equal(result.available, false);
  assert.equal(result.status, 'malformed');
  assert.equal(calls.length, 0);
});

test('cloud loader errors are generic and never echo part values, paths, or decoder errors', async () => {
  const marker = 'SyntheticSecretChunkValue';
  const envs = [
    { MC_HQ_SNAPSHOT_PART_COUNT: '1', MC_HQ_SNAPSHOT_PART_0: marker, MC_HQ_SNAPSHOT_PATH: '/Users/synthetic-user/hq.json' },
    { MC_HQ_SNAPSHOT_PART_COUNT: '1', MC_HQ_SNAPSHOT_PART_0: Buffer.from(marker).toString('base64') },
    cloudEnv(`{"${marker}":`),
  ];
  for (const env of envs) {
    const { result, calls } = await quietLoad(env);
    const text = JSON.stringify(result);
    assert.equal(result.available, false);
    for (const leak of [marker, '/Users/synthetic-user', 'incorrect header', 'unexpected end', 'Unexpected', 'zlib', 'MC_HQ_SNAPSHOT']) {
      assert.ok(!text.includes(leak), `leaked ${leak}`);
    }
    assert.equal(calls.length, 0);
  }
});
