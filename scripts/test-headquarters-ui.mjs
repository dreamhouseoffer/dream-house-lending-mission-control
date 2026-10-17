import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  CONNECTION_VERIFICATIONS,
  EVIDENCE_LEVELS,
  FAMILIES,
  FINDING_SEVERITIES,
  PLATFORMS,
  READINESS_CATEGORIES,
  READINESS_STATES,
  RECOMMENDATIONS,
  SNAPSHOT_KIND,
  SNAPSHOT_SCHEMA_VERSION,
  createUnavailableSnapshot,
  normalizeSnapshot,
} from '../src/lib/headquarters/model.mjs';
import {
  HQ_TABS,
  LABELS,
  EDGE_STYLES,
  buildFamilyGroups,
  connectionsFor,
  entityById,
  formatObservedDate,
  layoutControlPlane,
  parseTabHash,
} from '../src/lib/headquarters/view-model.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const src = (p) => readFile(join(ROOT, p), 'utf8');

// Synthetic, invented fixture. No real inventory belongs in source.
function fixture() {
  return normalizeSnapshot({
    kind: SNAPSHOT_KIND,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    observedAt: '2026-01-02',
    timezone: 'Test/Zone',
    coverage: { github: 1, vercel: 1, replit: 1, local: 1 },
    assets: [
      { id: 'github:org-app', platform: 'github', identifier: 'org/App', family: 'mortgage', evidenceLevel: 'source_inspected', recommendation: 'keep' },
      { id: 'vercel:app', platform: 'vercel', identifier: 'app', family: 'mortgage', evidenceLevel: 'page_responds', recommendation: 'keep' },
      { id: 'replit:tool', platform: 'replit', identifier: 'tool', family: 'marketing', evidenceLevel: 'project_exists', recommendation: 'park' },
      { id: 'local:misc', platform: 'local', identifier: 'misc', evidenceLevel: 'project_exists' },
    ],
    nodes: [
      { id: 'node:owner', label: 'Owner', kind: 'person' },
      { id: 'node:orch', label: 'Orchestrator', kind: 'orchestrator' },
      { id: 'node:hq', label: 'HQ', kind: 'system' },
      { id: 'node:svc', label: 'Service', kind: 'service', family: 'marketing' },
    ],
    connections: [
      { from: 'vercel:app', to: 'github:org-app', kind: 'hosting', verification: 'platform_metadata' },
      { from: 'node:owner', to: 'node:hq', kind: 'proposed' },
      { from: 'node:hq', to: 'node:orch', kind: 'proposed' },
      { from: 'node:svc', to: 'node:orch', kind: 'runtime', verification: 'runtime_tested' },
    ],
  });
}

test('tabs are exactly the five Headquarters views and hashes round-trip safely', () => {
  assert.deepEqual(HQ_TABS.map((t) => t.label), ['Overview', 'Systems map', 'Inventory', 'Roadmap', 'Readiness']);
  for (const tab of HQ_TABS) assert.equal(parseTabHash(`#${tab.id}`), tab.id);
  assert.equal(parseTabHash('#nope'), 'overview');
  assert.equal(parseTabHash(''), 'overview');
  assert.equal(parseTabHash('#<script>'), 'overview');
});

test('every enum value has a human label and every verification has an edge style', () => {
  const groups = { platform: PLATFORMS, family: FAMILIES, evidence: EVIDENCE_LEVELS, recommendation: RECOMMENDATIONS, verification: CONNECTION_VERIFICATIONS, severity: FINDING_SEVERITIES, readinessCategory: READINESS_CATEGORIES, readinessState: READINESS_STATES };
  for (const [group, values] of Object.entries(groups)) {
    for (const v of values) assert.ok(LABELS[group]?.[v], `missing label ${group}.${v}`);
  }
  for (const v of CONNECTION_VERIFICATIONS) assert.ok(EDGE_STYLES[v], `missing edge style ${v}`);
  assert.ok(EDGE_STYLES.proposed.dash, 'proposed connections must be dashed');
  assert.equal(EDGE_STYLES.runtime_tested.dash, null, 'runtime-tested connections are solid');
});

test('family groups contain every asset exactly once and include service nodes', () => {
  const snap = fixture();
  const groups = buildFamilyGroups(snap);
  assert.deepEqual(groups.map((g) => g.family), FAMILIES);
  const ids = groups.flatMap((g) => g.assets.map((a) => a.id));
  assert.equal(ids.length, snap.assets.length);
  assert.equal(new Set(ids).size, snap.assets.length);
  assert.ok(groups.find((g) => g.family === 'utilities_unknown').assets.some((a) => a.id === 'local:misc'));
  assert.ok(groups.find((g) => g.family === 'marketing').nodes.some((n) => n.id === 'node:svc'));
});

test('entity lookup and connection detail resolve both directions with labels', () => {
  const snap = fixture();
  assert.equal(entityById(snap, 'vercel:app').type, 'asset');
  assert.equal(entityById(snap, 'node:orch').type, 'node');
  assert.equal(entityById(snap, 'node:missing'), null);
  const conns = connectionsFor(snap, 'node:orch');
  assert.equal(conns.length, 2);
  assert.ok(conns.every((c) => c.otherLabel && c.direction));
  assert.ok(conns.some((c) => c.verification === 'proposed'));
});

test('control-plane layout positions every node and only draws node-to-node edges', () => {
  const snap = fixture();
  const layout = layoutControlPlane(snap);
  assert.equal(layout.nodes.length, snap.nodes.length);
  for (const n of layout.nodes) {
    assert.ok(n.x >= 0 && n.x <= layout.width && n.y >= 0 && n.y <= layout.height);
  }
  assert.equal(layout.nodes.find((n) => n.id === 'node:orch').hub, true);
  assert.equal(layout.edges.length, 3);
  assert.ok(layout.edges.every((e) => e.x1 != null && e.y2 != null));
});

test('unavailable snapshot yields empty, valid view data rather than demo content', () => {
  const snap = createUnavailableSnapshot();
  assert.equal(buildFamilyGroups(snap).flatMap((g) => g.assets).length, 0);
  assert.deepEqual(layoutControlPlane(snap).nodes, []);
  assert.deepEqual(connectionsFor(snap, 'node:x'), []);
  assert.equal(formatObservedDate(null), 'No snapshot date');
  assert.match(formatObservedDate('2026-01-02', 'Test/Zone'), /Jan 2, 2026/);
});

async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(join(ROOT, dir), { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(p)));
    else out.push(p);
  }
  return out;
}

test('page is a dynamic server component that loads the snapshot at request time', async () => {
  const page = await src('src/app/headquarters/page.tsx');
  assert.doesNotMatch(page, /^["']use client["']/m);
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.match(page, /loadHeadquartersSnapshot/);
});

test('page and API both enforce the HQ PIN guard before loading the snapshot', async () => {
  const guard = await src('src/lib/headquarters/guard.ts');
  assert.match(guard, /from "next\/headers"/);
  assert.match(guard, /MISSION_CONTROL_PIN/);
  assert.match(guard, /mission_control_auth/);
  assert.match(guard, /isHeadquartersAuthorized/);
  for (const file of ['src/app/headquarters/page.tsx', 'src/app/api/headquarters/route.ts']) {
    const text = await src(file);
    const guardAt = text.search(/hasHeadquartersAccess\(\)/);
    const loadAt = text.search(/loadHeadquartersSnapshot\(\)/);
    assert.ok(guardAt > 0, `${file} must call the guard`);
    assert.ok(loadAt > guardAt, `${file} must check access before loading the snapshot`);
  }
  const route = await src('src/app/api/headquarters/route.ts');
  assert.match(route, /status: 401/);
  // The legacy auth flow and middleware are untouched by HQ.
  assert.doesNotMatch(await src('src/middleware.ts'), /headquarters/i);
});

test('inventory focus is cleared after it is consumed and when leaving inventory', async () => {
  const view = await src('src/components/headquarters/headquarters-view.tsx');
  const inventory = await src('src/components/headquarters/inventory.tsx');
  assert.match(view, /onFocusConsumed=\{clearFocus\}/);
  assert.match(view, /if \(tab !== "inventory"\) setFocus\(null\)/);
  assert.match(inventory, /onFocusConsumed\(\)/);
});

test('systems-map caption distinguishes every edge style and says grouping is not integration', async () => {
  const map = await src('src/components/headquarters/systems-map.tsx');
  assert.doesNotMatch(map, /Solid lines were observed/);
  for (const phrase of [/solid green/i, /runtime tested/i, /solid cyan/i, /platform metadata/i, /source-wired/i, /proposed/i, /unverified/i, /not integration/i]) {
    assert.match(map, phrase);
  }
  assert.equal(EDGE_STYLES.platform_metadata.dash, null);
  assert.ok(EDGE_STYLES.source_wired.dash && EDGE_STYLES.unverified.dash);
});

test('client components never touch the loader, filesystem, or snapshot env/path', async () => {
  const files = await listFiles('src/components/headquarters');
  assert.ok(files.length > 0);
  for (const f of files) {
    const text = await src(f);
    assert.doesNotMatch(text, /loader\.mjs|node:fs|MC_HQ_SNAPSHOT_PATH|process\.env|\.hermes|snapshot\.json/, f);
  }
});

test('UI shows required honesty labels and offers no fake action buttons', async () => {
  const files = await listFiles('src/components/headquarters');
  const all = (await Promise.all(files.map(src))).join('\n');
  for (const field of ['modeLabel', 'snapshotLabel', 'liveExecutionBridgeLabel', 'formatObservedDate']) {
    assert.match(all, new RegExp(field), `missing ${field}`);
  }
  assert.doesNotMatch(all, />\s*(Approve|Run|Deploy|Activate|Publish|Start)\s*</i, 'no action buttons');
  assert.doesNotMatch(all, /Math\.random|setInterval/, 'no simulated live activity');
  // Every external anchor opens safely.
  for (const m of all.matchAll(/target="_blank"[^>]*/g)) assert.match(m[0], /noopener noreferrer/);
  assert.match(all, /approval does not prove execution/i);
});

test('source contains no private inventory identifiers', async () => {
  const files = [...(await listFiles('src/components/headquarters')), ...(await listFiles('src/lib/headquarters')), 'src/app/headquarters/page.tsx'];
  const all = (await Promise.all(files.map(src))).join('\n').toLowerCase();
  for (const marker of ['dreamhouse', 'orai', 'equity hunter', 'kern', 'blotato', 'agarza', 'alfonso', 'telegram']) {
    assert.ok(!all.includes(marker), `private marker in source: ${marker}`);
  }
});

test('navigation keeps Headquarters and retained modules reachable on desktop and mobile', async () => {
  // Nav is defined once in the Mission Control nav model and rendered by the sidebar for both rails.
  const { MODULE_NAV, CORE_NAV } = await import('../src/lib/mission-control/capabilities.mjs');
  const sidebar = await src('src/components/sidebar.tsx');
  assert.match(sidebar, /CORE_NAV/);
  assert.match(sidebar, /MODULE_NAV/);
  assert.match(sidebar, /<Link href="\/"/);
  const hrefs = [...CORE_NAV, ...MODULE_NAV.flatMap((g) => g.items)].map((i) => i.href);
  for (const href of ['/headquarters', '/', '/pipeline', '/tasks', '/milo-approvals', '/ask']) assert.ok(hrefs.includes(href), href);
});

test('/projects bookmark redirects server-side to the new Home', async () => {
  const page = await src('src/app/projects/page.tsx');
  assert.doesNotMatch(page, /^["']use client["']/m);
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.match(page, /import \{ redirect \} from "next\/navigation"/);
  assert.match(page, /redirect\("\/"\)/);
});

test('original Projects page is preserved verbatim at /projects/legacy and linked from archive', async () => {
  // SHA-256 of `git show 16630c5:src/app/projects/page.tsx` (the pre-HQ Projects page).
  // Embedded so the check does not depend on HEAD or on full git history.
  const ORIGINAL_PROJECTS_SHA256 = '6577fc60b4685070daff494ec5d528bbd066ce64821e4d3272f87a0f4c469c50';
  const legacy = await readFile(join(ROOT, 'src/app/projects/legacy/page.tsx'));
  assert.equal(createHash('sha256').update(legacy).digest('hex'), ORIGINAL_PROJECTS_SHA256);
  const nav = await src('src/lib/mission-control/capabilities.mjs');
  assert.match(nav, /href: "\/projects\/legacy", label: "Projects \(legacy\)"/);
  assert.doesNotMatch(nav, /href: "\/projects",/);
  assert.match(nav, /href: "\/today", label: "Today \(legacy\)"/);
});
