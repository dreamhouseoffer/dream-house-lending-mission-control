// Pure view helpers for the Headquarters page. Generic rendering logic only; all content
// comes from the normalized snapshot passed in at request time.
import { FAMILIES } from "./model.mjs";

export const HQ_TABS = [
  { id: "overview", label: "Overview" },
  { id: "map", label: "Systems map" },
  { id: "inventory", label: "Inventory" },
  { id: "roadmap", label: "Roadmap" },
  { id: "readiness", label: "Readiness" },
];

export function parseTabHash(hash) {
  const id = typeof hash === "string" ? hash.replace(/^#/, "") : "";
  return HQ_TABS.some((t) => t.id === id) ? id : "overview";
}

export const LABELS = {
  platform: { github: "GitHub", vercel: "Vercel", replit: "Replit", local: "Local" },
  family: {
    mortgage: "Mortgage",
    real_estate: "Real estate",
    marketing: "Marketing & content",
    ai_development: "AI & development",
    personal: "Personal",
    utilities_unknown: "Utilities / unknown",
  },
  evidence: {
    provider_read_verified: "Provider read verified",
    page_responds: "Page responds",
    source_inspected: "Source inspected",
    project_exists: "Project exists",
    user_reported: "User reported",
    unverified: "Unverified",
  },
  recommendation: {
    keep: "Keep",
    integrate: "Integrate",
    reference: "Reference",
    consolidate_candidate: "Consolidate candidate",
    park: "Park",
    unreviewed: "Unreviewed",
  },
  verification: {
    runtime_tested: "Runtime tested",
    platform_metadata: "Platform metadata",
    source_wired: "Source-wired",
    proposed: "Proposed",
    unverified: "Unverified",
  },
  severity: { critical: "Critical", high: "High", medium: "Medium", info: "Info" },
  readinessCategory: {
    security: "Security",
    integration: "Integration",
    decision: "Pending decisions",
    cost: "Cost",
    limitation: "Limitations",
  },
  readinessState: {
    unavailable: "Unavailable",
    not_integrated: "Not integrated",
    pending_decision: "Pending decision",
    unknown: "Unknown",
    open: "Open",
  },
  nodeKind: { person: "Person", orchestrator: "Orchestrator", system: "System", service: "Service" },
};

export const EVIDENCE_HINTS = {
  provider_read_verified: "A provider API returned relevant data during the audit.",
  page_responds: "A public page returned content. Not proof that workflows function.",
  source_inspected: "Source or a manifest was read. Not an end-to-end test.",
  project_exists: "The project is listed. Nothing about runtime was exercised.",
  user_reported: "Described by the owner; not independently observed.",
  unverified: "No supporting observation in this snapshot.",
};

// Solid = runtime tested (green) or platform metadata (cyan); dashed = source-wired, proposed, or unverified. Colors are Tailwind-compatible hex for SVG strokes.
export const EDGE_STYLES = {
  runtime_tested: { color: "#34d399", dash: null, width: 2.25 },
  platform_metadata: { color: "#22d3ee", dash: null, width: 1.75 },
  source_wired: { color: "#94a3b8", dash: "2 4", width: 1.75 },
  proposed: { color: "#fbbf24", dash: "7 6", width: 1.75 },
  unverified: { color: "#64748b", dash: "1 5", width: 1.5 },
};

export function formatObservedDate(observedAt, timezone) {
  if (!observedAt) return "No snapshot date";
  const date = new Date(observedAt.length === 10 ? `${observedAt}T12:00:00Z` : observedAt);
  if (Number.isNaN(date.getTime())) return "No snapshot date";
  const text = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return timezone ? `${text} (${timezone})` : text;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

export function buildFamilyGroups(snapshot) {
  const assets = list(snapshot?.assets);
  const nodes = list(snapshot?.nodes).filter((n) => n.kind === "service");
  return FAMILIES.map((family) => ({
    family,
    label: LABELS.family[family],
    assets: assets.filter((a) => a.family === family),
    nodes: nodes.filter((n) => n.family === family),
  }));
}

export function entityById(snapshot, id) {
  const asset = list(snapshot?.assets).find((a) => a.id === id);
  if (asset) return { type: "asset", item: asset, label: asset.label };
  const node = list(snapshot?.nodes).find((n) => n.id === id);
  if (node) return { type: "node", item: node, label: node.label };
  return null;
}

export function connectionsFor(snapshot, id) {
  return list(snapshot?.connections)
    .filter((c) => c.from === id || c.to === id)
    .map((c) => {
      const otherId = c.from === id ? c.to : c.from;
      return {
        ...c,
        otherId,
        otherLabel: entityById(snapshot, otherId)?.label ?? otherId,
        direction: c.from === id ? "outgoing" : "incoming",
      };
    });
}

/**
 * Hub-and-ring layout for the control plane (non-asset nodes). The first orchestrator is the hub;
 * people sit on the left of the ring, systems and services follow clockwise.
 */
export function layoutControlPlane(snapshot, { width = 880, height = 440 } = {}) {
  const nodes = list(snapshot?.nodes);
  if (!nodes.length) return { width, height, nodes: [], edges: [] };
  const hub = nodes.find((n) => n.kind === "orchestrator") ?? nodes[0];
  const order = { person: 0, system: 1, orchestrator: 2, service: 3 };
  const ring = nodes.filter((n) => n !== hub).sort((a, b) => order[a.kind] - order[b.kind]);
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2 - 110;
  const ry = height / 2 - 48;
  const placed = [{ ...hub, x: cx, y: cy, hub: true }];
  ring.forEach((n, i) => {
    const angle = Math.PI + (2 * Math.PI * i) / ring.length;
    placed.push({ ...n, x: Math.round(cx + rx * Math.cos(angle)), y: Math.round(cy + ry * Math.sin(angle)), hub: false });
  });
  const pos = new Map(placed.map((n) => [n.id, n]));
  const edges = list(snapshot?.connections)
    .filter((c) => pos.has(c.from) && pos.has(c.to))
    .map((c) => ({ ...c, x1: pos.get(c.from).x, y1: pos.get(c.from).y, x2: pos.get(c.to).x, y2: pos.get(c.to).y }));
  return { width, height, nodes: placed, edges };
}
