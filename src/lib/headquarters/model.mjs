// Headquarters snapshot model: browser-safe whitelist, unavailable state, summary, and filters.
// Pure functions only. No snapshot content lives in source; data comes from a private file at runtime.

export const SNAPSHOT_KIND = "mission-control-headquarters-snapshot";
export const SNAPSHOT_SCHEMA_VERSION = 1;

export const PLATFORMS = ["github", "vercel", "replit", "local"];
export const FAMILIES = ["mortgage", "real_estate", "marketing", "ai_development", "personal", "utilities_unknown"];
// Ordered strongest → weakest. "user_reported" is a claim, not an observation.
export const EVIDENCE_LEVELS = [
  "provider_read_verified",
  "page_responds",
  "source_inspected",
  "project_exists",
  "user_reported",
  "unverified",
];
export const RECOMMENDATIONS = ["keep", "integrate", "reference", "consolidate_candidate", "park", "unreviewed"];
export const CONNECTION_KINDS = ["hosting", "source_link", "runtime", "proposed"];
export const CONNECTION_VERIFICATIONS = ["platform_metadata", "source_wired", "runtime_tested", "proposed", "unverified"];
export const NODE_KINDS = ["person", "orchestrator", "system", "service"];
export const FINDING_SEVERITIES = ["critical", "high", "medium", "info"];
export const READINESS_CATEGORIES = ["limitation", "security", "decision", "integration", "cost"];
export const READINESS_STATES = ["unavailable", "not_integrated", "pending_decision", "unknown", "open"];
export const DEPLOYMENT_STATES = ["READY", "ERROR", "BUILDING", "QUEUED", "INITIALIZING", "CANCELED", "unknown"];

const TEXT_MAX = 600;
const SHORT_MAX = 160;
const LIST_MAX = 50;

const UNAVAILABLE_MESSAGES = {
  not_configured:
    "Headquarters snapshot is not configured. Set the server-only MC_HQ_SNAPSHOT_PATH to an absolute path of a privately imported snapshot.",
  unreadable: "Headquarters snapshot file could not be read. Re-run the manual importer and check local configuration.",
  malformed: "Headquarters snapshot file is not valid JSON. Re-run the manual importer.",
  invalid: "Headquarters snapshot file does not match the expected schema. Re-run the manual importer.",
};

export const SENSITIVE_LEAD_NOTICE = "Sensitive lead access requires containment";

const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0", "[::1]", "::1", "[::]"]);

function isPrivateHost(hostname) {
  // A trailing dot is the same DNS name ("localhost." === "localhost").
  const host = hostname.toLowerCase().replace(/\.+$/, "");
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host.startsWith("[")) return true; // IPv6 literals are never needed for public project links
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return !host.includes(".");
}

export function sanitizeExternalUrl(input) {
  if (typeof input !== "string" || !input.trim()) return null;
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname || isPrivateHost(url.hostname)) return null;
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString();
}

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const HOME_PATH_PATTERN = /(?:\/Users|\/home|\/root|[A-Za-z]:\\Users)[\\/][^\s"'`)]*/g;
const TOKEN_PATTERN = /\b(?:sk|pk|rk|ghp|gho|ghu|ghs|ghr|github_pat|xox[abprs]|prj|dpl)[-_]([A-Za-z0-9_-]{16,})\b/g;
const URL_PATTERN = /\bhttps?:\/\/[^\s"'<>`)]+/gi;

export function sanitizeText(value, max = TEXT_MAX) {
  if (typeof value !== "string") return "";
  let text = value
    .replace(URL_PATTERN, (match) => sanitizeExternalUrl(match) ?? "[link removed]")
    .replace(EMAIL_PATTERN, "[redacted]")
    .replace(HOME_PATH_PATTERN, "[local path]")
    .replace(TOKEN_PATTERN, (match, tail) => (/\d/.test(tail) ? "[redacted]" : match))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim();
  if (text.length > max) text = `${text.slice(0, max - 1)}…`;
  return text;
}

function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function textList(value, max = SHORT_MAX) {
  return asArray(value)
    .map((item) => sanitizeText(item, max))
    .filter(Boolean)
    .slice(0, LIST_MAX);
}

function idString(value) {
  return typeof value === "string" && /^[a-z_]+:[a-z0-9][a-z0-9._-]{0,159}$/.test(value) ? value : null;
}

function plainId(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value) ? value : null;
}

function optionalNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function isoDate(value) {
  if (typeof value !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z)?$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
}

function normalizeLinks(value) {
  const seen = new Set();
  return asArray(value)
    .map((link) => {
      const url = sanitizeExternalUrl(link?.url);
      if (!url || seen.has(url)) return null;
      seen.add(url);
      return { label: sanitizeText(link?.label, 60) || "Link", url };
    })
    .filter(Boolean)
    .slice(0, 5);
}

function evidenceRank(level) {
  return EVIDENCE_LEVELS.indexOf(level);
}

// Secondary evidence only adds weaker context; it can never match or outrank the primary level.
export function weakerSecondaryEvidence(list, primary) {
  return [...new Set(asArray(list))].filter((e) => EVIDENCE_LEVELS.includes(e) && evidenceRank(e) > evidenceRank(primary));
}

// Fallback IDs carry the full edge semantics so parallel edges between the same endpoints survive.
export function connectionFallbackId(from, to, kind, verification) {
  return `${from}->${to}:${kind}:${verification}`;
}

function normalizeRepoPath(value) {
  if (typeof value !== "string") return null;
  if (!/^[A-Za-z0-9._\-[\]/]+$/.test(value) || value.startsWith("/") || value.includes("..")) return null;
  return value.slice(0, SHORT_MAX);
}

function normalizeFacts(facts = {}) {
  const f = facts && typeof facts === "object" ? facts : {};
  return {
    language: sanitizeText(f.language, 40) || null,
    framework: sanitizeText(f.framework, 40) || null,
    visibility: pick(f.visibility, ["public", "private"], null),
    archived: optionalBoolean(f.archived),
    lastPushedAt: isoDate(f.lastPushedAt),
    sourceTreeFileCount: optionalNumber(f.sourceTreeFileCount),
    sourceTreeStatus: optionalNumber(f.sourceTreeStatus),
    observedPaths: asArray(f.observedPaths).map(normalizeRepoPath).filter(Boolean).slice(0, 12),
    deploymentState: f.deploymentState == null ? null : pick(f.deploymentState, DEPLOYMENT_STATES, "unknown"),
    httpStatus: optionalNumber(f.httpStatus),
    pageTitle: sanitizeText(f.pageTitle, 120) || null,
    stack: asArray(f.stack).filter((s) => typeof s === "string" && /^[@a-z0-9/._-]{1,60}$/.test(s)).slice(0, 12),
    hasGitRemote: optionalBoolean(f.hasGitRemote),
    hasUncommittedChanges: optionalBoolean(f.hasUncommittedChanges),
  };
}

function normalizeAsset(asset) {
  if (!asset || typeof asset !== "object") return null;
  const id = idString(asset.id);
  if (!id || !PLATFORMS.includes(asset.platform) || !id.startsWith(`${asset.platform}:`)) return null;
  // Identifiers are preserved exactly; anything that is not a plain project identifier is rejected, not rewritten.
  const identifier = typeof asset.identifier === "string" ? asset.identifier : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._/&'()+-]{0,159}$/.test(identifier) || identifier.includes("//")) return null;
  const evidenceLevel = pick(asset.evidenceLevel, EVIDENCE_LEVELS, "unverified");
  return {
    id,
    platform: asset.platform,
    identifier,
    label: sanitizeText(asset.label, SHORT_MAX) || identifier,
    family: pick(asset.family, FAMILIES, "utilities_unknown"),
    evidenceLevel,
    secondaryEvidence: weakerSecondaryEvidence(asset.secondaryEvidence, evidenceLevel),
    recommendation: pick(asset.recommendation, RECOMMENDATIONS, "unreviewed"),
    statusLabel: sanitizeText(asset.statusLabel, SHORT_MAX) || null,
    observed: sanitizeText(asset.observed),
    gap: sanitizeText(asset.gap),
    nextMove: sanitizeText(asset.nextMove),
    facts: normalizeFacts(asset.facts),
    links: normalizeLinks(asset.links),
    relatedAssetIds: [...new Set(asArray(asset.relatedAssetIds).map(idString).filter(Boolean))].slice(0, LIST_MAX),
  };
}

// Nodes come only from private annotations, which are claims rather than observations.
const NODE_EVIDENCE_CAP = "user_reported";

function normalizeNode(node) {
  const id = idString(node?.id);
  if (!id || !id.startsWith("node:")) return null;
  const level = pick(node.evidenceLevel, EVIDENCE_LEVELS, "unverified");
  return {
    id,
    label: sanitizeText(node.label, SHORT_MAX) || id,
    kind: pick(node.kind, NODE_KINDS, "system"),
    family: pick(node.family, FAMILIES, "ai_development"),
    evidenceLevel: evidenceRank(level) < evidenceRank(NODE_EVIDENCE_CAP) ? NODE_EVIDENCE_CAP : level,
    note: sanitizeText(node.note),
  };
}

function normalizeConnection(connection, knownIds) {
  if (!connection || typeof connection !== "object") return null;
  const from = idString(connection.from);
  const to = idString(connection.to);
  if (!from || !to || !knownIds.has(from) || !knownIds.has(to)) return null;
  const kind = pick(connection.kind, CONNECTION_KINDS, null);
  if (!kind) return null;
  const claimed = kind === "proposed" ? "proposed" : pick(connection.verification, CONNECTION_VERIFICATIONS, "unverified");
  const verification = kind !== "proposed" && claimed === "proposed" ? "unverified" : claimed;
  return {
    id: plainId(connection.id) ?? connectionFallbackId(from, to, kind, verification),
    from,
    to,
    kind,
    verification,
    label: sanitizeText(connection.label, SHORT_MAX),
    note: sanitizeText(connection.note),
  };
}

function normalizeFinding(finding, knownIds) {
  const id = plainId(finding?.id);
  if (!id) return null;
  return {
    id,
    severity: pick(finding.severity, FINDING_SEVERITIES, "info"),
    title: sanitizeText(finding.title, SHORT_MAX),
    detail: sanitizeText(finding.detail),
    assetIds: asArray(finding.assetIds).filter((a) => knownIds.has(a)),
  };
}

function normalizePhase(phase) {
  const id = plainId(phase?.id);
  if (!id) return null;
  return {
    id,
    phase: optionalNumber(phase.phase),
    title: sanitizeText(phase.title, SHORT_MAX),
    summary: sanitizeText(phase.summary),
    status: "planned",
    dependencies: textList(phase.dependencies, 300),
    acceptanceTests: textList(phase.acceptanceTests, 300),
    approvalsNeeded: textList(phase.approvalsNeeded, 300),
  };
}

function normalizeReadiness(item) {
  const id = plainId(item?.id);
  if (!id) return null;
  return {
    id,
    category: pick(item.category, READINESS_CATEGORIES, "limitation"),
    title: sanitizeText(item.title, SHORT_MAX),
    detail: sanitizeText(item.detail),
    state: pick(item.state, READINESS_STATES, "unknown"),
  };
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function baseEnvelope() {
  return {
    mode: "blueprint",
    modeLabel: "Blueprint mode",
    snapshotLabel: "Audit snapshot",
    liveExecutionBridge: "not_connected",
    liveExecutionBridgeLabel: "Live execution bridge not connected",
    live: { status: "not_connected", runs: null, approvals: null, heartbeat: null },
  };
}

export function createUnavailableSnapshot(status = "not_configured") {
  const reason = UNAVAILABLE_MESSAGES[status] ? status : "invalid";
  return {
    available: false,
    status: reason,
    message: UNAVAILABLE_MESSAGES[reason],
    ...baseEnvelope(),
    observedAt: null,
    timezone: null,
    generatedAt: null,
    coverage: null,
    notices: { sensitiveLeadAccess: false, sensitiveLeadNotice: null },
    assets: [],
    nodes: [],
    connections: [],
    findings: [],
    roadmap: [],
    readiness: [],
    limitations: [],
    summary: null,
  };
}

function normalizeCoverage(value) {
  if (!value || typeof value !== "object") return null;
  const coverage = {};
  for (const platform of PLATFORMS) {
    const n = value[platform];
    if (!Number.isInteger(n) || n < 0) return null;
    coverage[platform] = n;
  }
  return coverage;
}

/**
 * Whitelists a private snapshot into the browser-safe payload. Anything not explicitly
 * listed here is dropped. Structural problems produce the truthful unavailable state.
 */
export function normalizeSnapshot(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return createUnavailableSnapshot("invalid");
  if (raw.kind !== SNAPSHOT_KIND || raw.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) return createUnavailableSnapshot("invalid");
  if (!Array.isArray(raw.assets)) return createUnavailableSnapshot("invalid");
  const observedAt = isoDate(raw.observedAt);
  if (!observedAt) return createUnavailableSnapshot("invalid");

  const assets = [];
  const assetIds = new Set();
  for (const item of raw.assets) {
    const asset = normalizeAsset(item);
    if (!asset || assetIds.has(asset.id)) return createUnavailableSnapshot("invalid");
    assetIds.add(asset.id);
    assets.push(asset);
  }
  for (const asset of assets) asset.relatedAssetIds = asset.relatedAssetIds.filter((id) => assetIds.has(id) && id !== asset.id);

  const nodes = uniqueById(asArray(raw.nodes).map(normalizeNode)).filter((n) => !assetIds.has(n.id));
  const knownIds = new Set([...assetIds, ...nodes.map((n) => n.id)]);
  const connections = uniqueById(asArray(raw.connections).map((c) => normalizeConnection(c, knownIds)));
  const findings = uniqueById(asArray(raw.findings).map((f) => normalizeFinding(f, assetIds)));
  const roadmap = uniqueById(asArray(raw.roadmap).map(normalizePhase));
  const readiness = uniqueById(asArray(raw.readiness).map(normalizeReadiness));
  const coverage = normalizeCoverage(raw.coverage);
  const sensitiveLeadAccess = raw.notices?.sensitiveLeadAccess === true;

  return {
    available: true,
    status: "ok",
    message: "Dated audit snapshot. Not real-time backend access.",
    ...baseEnvelope(),
    observedAt,
    timezone: sanitizeText(raw.timezone, 60) || null,
    generatedAt: isoDate(raw.generatedAt),
    coverage,
    notices: { sensitiveLeadAccess, sensitiveLeadNotice: sensitiveLeadAccess ? SENSITIVE_LEAD_NOTICE : null },
    assets,
    nodes,
    connections,
    findings,
    roadmap,
    readiness,
    limitations: textList(raw.limitations, TEXT_MAX),
    summary: buildSummary(assets, coverage),
  };
}

function zeroCounts(keys) {
  return Object.fromEntries(keys.map((k) => [k, 0]));
}

export function summarizeAssets(assets) {
  const list = asArray(assets);
  const summary = {
    total: list.length,
    byPlatform: zeroCounts(PLATFORMS),
    byFamily: zeroCounts(FAMILIES),
    byEvidence: zeroCounts(EVIDENCE_LEVELS),
    byRecommendation: zeroCounts(RECOMMENDATIONS),
  };
  for (const asset of list) {
    if (asset.platform in summary.byPlatform) summary.byPlatform[asset.platform] += 1;
    if (asset.family in summary.byFamily) summary.byFamily[asset.family] += 1;
    if (asset.evidenceLevel in summary.byEvidence) summary.byEvidence[asset.evidenceLevel] += 1;
    if (asset.recommendation in summary.byRecommendation) summary.byRecommendation[asset.recommendation] += 1;
  }
  return summary;
}

function buildSummary(assets, coverage) {
  const summary = summarizeAssets(assets);
  const coverageGaps = coverage
    ? PLATFORMS.filter((p) => coverage[p] !== summary.byPlatform[p]).map((p) => ({
        platform: p,
        expected: coverage[p],
        actual: summary.byPlatform[p],
      }))
    : [];
  return {
    ...summary,
    countsAreOverlappingAssets: true,
    coverageComplete: coverage !== null && coverageGaps.length === 0,
    coverageGaps,
  };
}

export const DEFAULT_FILTERS = { query: "", platform: "all", family: "all", evidenceLevel: "all", recommendation: "all" };

function matches(value, filter) {
  return !filter || filter === "all" || value === filter;
}

export function filterAssets(assets, filters = {}) {
  const f = { ...DEFAULT_FILTERS, ...(filters || {}) };
  const query = typeof f.query === "string" ? f.query.trim().toLowerCase() : "";
  return asArray(assets).filter((asset) => {
    if (!matches(asset.platform, f.platform)) return false;
    if (!matches(asset.family, f.family)) return false;
    if (!matches(asset.evidenceLevel, f.evidenceLevel)) return false;
    if (!matches(asset.recommendation, f.recommendation)) return false;
    if (!query) return true;
    return [asset.label, asset.identifier, asset.statusLabel, asset.observed, asset.gap, asset.nextMove]
      .filter(Boolean)
      .some((text) => text.toLowerCase().includes(query));
  });
}

export function hasActiveFilters(filters = {}) {
  const f = { ...DEFAULT_FILTERS, ...(filters || {}) };
  return Boolean(f.query && f.query.trim()) || ["platform", "family", "evidenceLevel", "recommendation"].some((k) => f[k] !== "all");
}
