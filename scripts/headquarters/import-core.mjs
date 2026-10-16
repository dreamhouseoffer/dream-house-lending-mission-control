// Manual importer core: converts private audit evidence + private annotations into a
// normalized Headquarters snapshot. Pure; the CLI handles file IO. Never imported by the app.
import {
  CONNECTION_KINDS,
  EVIDENCE_LEVELS,
  PLATFORMS,
  SNAPSHOT_KIND,
  SNAPSHOT_SCHEMA_VERSION,
  connectionFallbackId,
  normalizeSnapshot,
  weakerSecondaryEvidence,
} from "../../src/lib/headquarters/model.mjs";

export class ImportValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ImportValidationError";
  }
}

const COUNT_KEYS = {
  github: "github_repositories",
  vercel: "vercel_projects",
  replit: "replit_discovered_projects",
  local: "local_directories",
};

// Dependency names worth surfacing as stack hints. Everything else in a manifest is dropped.
const STACK_WHITELIST = new Set([
  "next",
  "react",
  "vite",
  "express",
  "prisma",
  "@prisma/client",
  "next-auth",
  "@supabase/supabase-js",
  "airtable",
  "pg",
  "tailwindcss",
  "@tailwindcss/vite",
]);

const ANNOTATION_TEXT_FIELDS = ["statusLabel", "observed", "gap", "nextMove"];

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140) || "unnamed";
}

function createIdAllocator() {
  const used = new Set();
  return (platform, identifier) => {
    const base = `${platform}:${slug(identifier)}`;
    let id = base;
    for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
    used.add(id);
    return id;
  };
}

function isOk(status) {
  return typeof status === "number" && status >= 200 && status < 400;
}

function parseGithubRemote(remote) {
  if (typeof remote !== "string" || !remote.trim()) return null;
  const match = remote
    .trim()
    .replace(/^[a-z+]+:\/\/[^@/]*@/i, "https://")
    .match(/github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i);
  return match ? `${match[1]}/${match[2]}` : null;
}

function requireArray(evidence, key) {
  const value = evidence[key];
  if (!Array.isArray(value)) throw new ImportValidationError(`Evidence field "${key}" must be an array.`);
  return value;
}

function githubAssets(evidence, allocate) {
  const trees = new Map(
    (Array.isArray(evidence.github_tree_reads) ? evidence.github_tree_reads : []).map((t) => [t?.repo, t]),
  );
  return requireArray(evidence, "github").map((repo) => {
    if (typeof repo?.full_name !== "string" || typeof repo?.name !== "string") {
      throw new ImportValidationError("GitHub record is missing name/full_name.");
    }
    const tree = trees.get(repo.name);
    const treeListed = isOk(tree?.tree_status) && Number(tree?.blob_count) > 0;
    const visibility = repo.private === true ? "private" : repo.private === false ? "public" : null;
    const links = [{ label: "Repository", url: `https://github.com/${repo.full_name}` }];
    if (repo.homepage) links.push({ label: "Homepage", url: repo.homepage });
    return {
      id: allocate("github", repo.full_name),
      platform: "github",
      identifier: repo.full_name,
      label: repo.name,
      evidenceLevel: treeListed ? "source_inspected" : "project_exists",
      observed: [
        `Repository metadata read${visibility ? ` (${visibility}${repo.archived ? ", archived" : ""})` : ""}.`,
        treeListed
          ? `Source tree listed (${tree.blob_count} files).`
          : `Source tree not obtained${typeof tree?.tree_status === "number" ? ` (HTTP ${tree.tree_status})` : ""}.`,
      ].join(" "),
      gap: "Source listing is not an end-to-end test; runtime behavior not exercised.",
      facts: {
        language: repo.language,
        visibility,
        archived: repo.archived,
        lastPushedAt: repo.pushed_at,
        sourceTreeFileCount: typeof tree?.blob_count === "number" ? tree.blob_count : null,
        sourceTreeStatus: typeof tree?.tree_status === "number" ? tree.tree_status : null,
        observedPaths: Array.isArray(tree?.integration_evidence_paths) ? tree.integration_evidence_paths : [],
      },
      links,
      _repoKey: repo.full_name.toLowerCase(),
    };
  });
}

function vercelAssets(evidence, allocate) {
  const reads = new Map(
    (Array.isArray(evidence.vercel_http_reads) ? evidence.vercel_http_reads : []).map((r) => [r?.name, r]),
  );
  return requireArray(evidence, "vercel").map((project) => {
    if (typeof project?.name !== "string") throw new ImportValidationError("Vercel record is missing name.");
    const pages = Array.isArray(reads.get(project.name)?.pages) ? reads.get(project.name).pages : [];
    const firstPage = pages[0];
    const responds = pages.some((p) => isOk(p?.status));
    const state = project.production?.readyState ?? null;
    const links = pages
      .filter((p) => isOk(p?.status))
      .map((p) => ({ label: "Production alias", url: p.final_origin_and_path }));
    return {
      id: allocate("vercel", project.name),
      platform: "vercel",
      identifier: project.name,
      label: project.name,
      evidenceLevel: responds ? "page_responds" : "project_exists",
      observed: [
        `Project metadata read; production deployment state ${state ?? "unknown"}.`,
        typeof firstPage?.status === "number"
          ? `Production alias returned HTTP ${firstPage.status}.`
          : "Production alias not read.",
      ].join(" "),
      gap: "HTTP response means the page responds, not that workflows function.",
      facts: {
        framework: project.framework,
        deploymentState: state,
        httpStatus: typeof firstPage?.status === "number" ? firstPage.status : null,
        pageTitle: firstPage?.title ?? null,
      },
      links,
      _gitKey:
        project.git && typeof project.git.org === "string" && typeof project.git.repo === "string"
          ? `${project.git.org}/${project.git.repo}`.toLowerCase()
          : null,
    };
  });
}

function replitAssets(evidence, allocate) {
  const projects = evidence.replit_discovered_projects;
  if (!projects || typeof projects !== "object" || Array.isArray(projects)) {
    throw new ImportValidationError('Evidence field "replit_discovered_projects" must be an object.');
  }
  return Object.entries(projects).map(([path, label]) => {
    // Workspace owner segment is omitted from the browser identifier; the project slug is kept exactly.
    const match = path.match(/^\/@[^/]+\/([^/?#]+)$/);
    if (!match) throw new ImportValidationError("Replit project path has an unexpected shape.");
    return {
      id: allocate("replit", match[1]),
      platform: "replit",
      identifier: match[1],
      label: typeof label === "string" && label.trim() ? label : match[1],
      evidenceLevel: "project_exists",
      observed: "Project link visible in the workspace library.",
      gap: "Library listing proves existence only; runtime, source, and data destinations not exercised.",
      facts: {},
      links: [],
    };
  });
}

function localAssets(evidence, allocate) {
  return requireArray(evidence, "local_project_metadata").map((dir) => {
    if (typeof dir?.directory !== "string") throw new ImportValidationError("Local record is missing directory.");
    const hasPackage = Boolean(dir.package && typeof dir.package === "object");
    const remoteKey = parseGithubRemote(dir.remote);
    const deps = hasPackage && dir.package.stack && typeof dir.package.stack === "object" ? Object.keys(dir.package.stack) : [];
    return {
      id: allocate("local", dir.directory),
      platform: "local",
      identifier: dir.directory,
      label: dir.directory,
      evidenceLevel: hasPackage ? "source_inspected" : "project_exists",
      observed: [
        "Local directory metadata read",
        hasPackage ? "package manifest present" : "no package manifest recorded",
        remoteKey ? "GitHub remote recorded" : "no GitHub remote recorded",
      ].join("; ") + ".",
      gap: "Local copy may differ from deployed or hosted versions; nothing was executed.",
      facts: {
        stack: deps.filter((d) => STACK_WHITELIST.has(d)),
        hasGitRemote: typeof dir.remote === "string" ? Boolean(dir.remote.trim()) : false,
        hasUncommittedChanges: typeof dir.dirty_entry_count === "number" ? dir.dirty_entry_count > 0 : null,
      },
      links: [],
      _remoteKey: remoteKey ? remoteKey.toLowerCase() : null,
    };
  });
}

function metadataConnections(assets) {
  const githubByKey = new Map(assets.filter((a) => a.platform === "github").map((a) => [a._repoKey, a]));
  const connections = [];
  const link = (from, to, kind, label) => {
    const verification = "platform_metadata";
    connections.push({ id: connectionFallbackId(from.id, to.id, kind, verification), from: from.id, to: to.id, kind, verification, label });
    if (!from.relatedAssetIds.includes(to.id)) from.relatedAssetIds.push(to.id);
    if (!to.relatedAssetIds.includes(from.id)) to.relatedAssetIds.push(from.id);
  };
  for (const asset of assets) {
    if (asset.platform === "vercel" && asset._gitKey && githubByKey.has(asset._gitKey)) {
      link(asset, githubByKey.get(asset._gitKey), "hosting", "Vercel project builds from this repository");
    }
    if (asset.platform === "local" && asset._remoteKey && githubByKey.has(asset._remoteKey)) {
      link(asset, githubByKey.get(asset._remoteKey), "source_link", "Local checkout's git remote");
    }
  }
  return connections;
}

function applyAnnotations(assets, annotations) {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const entries = annotations.assets && typeof annotations.assets === "object" ? Object.entries(annotations.assets) : [];
  const unknown = entries.map(([id]) => id).filter((id) => !byId.has(id));
  if (unknown.length) throw new ImportValidationError(`Annotations reference unknown asset IDs: ${unknown.join(", ")}`);

  for (const [id, note] of entries) {
    const asset = byId.get(id);
    if (!note || typeof note !== "object") continue;
    asset.family = note.family;
    asset.recommendation = note.recommendation;
    for (const field of ANNOTATION_TEXT_FIELDS) {
      if (typeof note[field] === "string" && note[field].trim()) asset[field] = note[field];
    }
    // Annotations may only weaken the evidence-derived level, never strengthen it.
    if (EVIDENCE_LEVELS.indexOf(note.evidenceCap) > EVIDENCE_LEVELS.indexOf(asset.evidenceLevel)) {
      asset.evidenceLevel = note.evidenceCap;
    }
    // Filtered against the final (possibly capped) primary level.
    asset.secondaryEvidence = weakerSecondaryEvidence(note.secondaryEvidence, asset.evidenceLevel);
    if (Array.isArray(note.relatedAssetIds)) {
      for (const related of note.relatedAssetIds) {
        if (byId.has(related) && related !== id && !asset.relatedAssetIds.includes(related)) asset.relatedAssetIds.push(related);
      }
    }
  }
}

const sameEdge = (a, b) => a.from === b.from && a.to === b.to && a.kind === b.kind && a.verification === b.verification;

/**
 * Annotated connections are claims. They keep a non-proposed verification only when an
 * imported machine evidence record (a metadata-derived edge) backs the exact same edge;
 * otherwise they are "proposed" (proposed kind) or "unverified". Backed annotations without
 * their own ID enrich the existing evidence edge instead of duplicating it.
 */
function mergeAnnotatedConnections(evidenceConnections, annotated, knownIds) {
  const connections = evidenceConnections.map((c) => ({ ...c }));
  for (const c of annotated) {
    if (!knownIds.has(c?.from) || !knownIds.has(c?.to)) {
      throw new ImportValidationError(`Annotated connection references unknown endpoint: ${c?.from} -> ${c?.to}`);
    }
    if (!CONNECTION_KINDS.includes(c.kind)) {
      throw new ImportValidationError(`Annotated connection has unsupported kind: ${c.from} -> ${c.to}`);
    }
    const backing = c.kind === "proposed" ? null : evidenceConnections.find((e) => sameEdge(e, c));
    const verification = backing ? backing.verification : c.kind === "proposed" ? "proposed" : "unverified";
    const edge = { ...c, verification };
    if (backing && edge.id == null) {
      const target = connections.find((e) => e.id === backing.id);
      if (!target.note && typeof c.note === "string") target.note = c.note;
      continue;
    }
    if (edge.id == null) edge.id = connectionFallbackId(edge.from, edge.to, edge.kind, edge.verification);
    const existing = connections.find((e) => e.id === edge.id);
    if (existing) {
      if (sameEdge(existing, edge) && existing.label === edge.label && existing.note === edge.note) continue;
      throw new ImportValidationError(`Conflicting duplicate connection ID: ${edge.id}`);
    }
    connections.push(edge);
  }
  return connections;
}

function sensitiveLeadAccess(evidence) {
  const check = evidence.equity_public_api_check;
  if (!check || typeof check !== "object") return false;
  return isOk(check.http_status) && (Number(check.returned_lead_count) > 0 || check.has_personal_contact_fields === true);
}

export function buildSnapshotFromEvidence(evidence, annotations = {}, { generatedAt = new Date().toISOString() } = {}) {
  if (!evidence || typeof evidence !== "object") throw new ImportValidationError("Evidence must be a JSON object.");
  if (!annotations || typeof annotations !== "object") throw new ImportValidationError("Annotations must be a JSON object.");
  if (annotations.schemaVersion !== undefined && annotations.schemaVersion !== 1) {
    throw new ImportValidationError("Unsupported annotations schemaVersion.");
  }
  if (!evidence.counts || typeof evidence.counts !== "object") throw new ImportValidationError("Evidence is missing counts.");

  const allocate = createIdAllocator();
  const assets = [
    ...githubAssets(evidence, allocate),
    ...vercelAssets(evidence, allocate),
    ...replitAssets(evidence, allocate),
    ...localAssets(evidence, allocate),
  ].map((a) => ({ ...a, relatedAssetIds: [], secondaryEvidence: [], nextMove: "Classify ownership and purpose." }));

  const coverage = {};
  for (const platform of PLATFORMS) {
    const expected = evidence.counts[COUNT_KEYS[platform]];
    const actual = assets.filter((a) => a.platform === platform).length;
    if (!Number.isInteger(expected) || expected !== actual) {
      throw new ImportValidationError(`Coverage mismatch for ${platform}: declared ${expected}, found ${actual} records.`);
    }
    coverage[platform] = expected;
  }

  const connections = metadataConnections(assets);
  applyAnnotations(assets, annotations);

  const nodes = Array.isArray(annotations.nodes) ? annotations.nodes : [];
  const knownIds = new Set([...assets.map((a) => a.id), ...nodes.map((n) => n?.id)]);
  const allConnections = mergeAnnotatedConnections(
    connections,
    Array.isArray(annotations.connections) ? annotations.connections : [],
    knownIds,
  );

  const candidate = {
    kind: SNAPSHOT_KIND,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    generatedAt,
    observedAt: evidence.snapshot_date,
    timezone: evidence.timezone,
    coverage,
    notices: { sensitiveLeadAccess: sensitiveLeadAccess(evidence) },
    assets: assets.map(({ _repoKey, _gitKey, _remoteKey, ...rest }) => rest),
    nodes,
    connections: allConnections,
    findings: Array.isArray(annotations.findings) ? annotations.findings : [],
    roadmap: Array.isArray(annotations.roadmap) ? annotations.roadmap : [],
    readiness: Array.isArray(annotations.readiness) ? annotations.readiness : [],
    limitations: [
      ...(Array.isArray(evidence.limitations) ? evidence.limitations : []),
      ...(Array.isArray(annotations.limitations) ? annotations.limitations : []),
    ],
  };

  // The written snapshot is exactly the whitelisted projection, so the private file never holds raw evidence.
  const normalized = normalizeSnapshot(candidate);
  if (!normalized.available) throw new ImportValidationError("Normalized snapshot failed schema validation.");
  if (!normalized.summary.coverageComplete) throw new ImportValidationError("Normalized snapshot lost assets during validation.");
  if (normalized.connections.length !== allConnections.length) {
    throw new ImportValidationError("Normalized snapshot lost connections during validation (check connection IDs and endpoints).");
  }

  return {
    kind: SNAPSHOT_KIND,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    generatedAt: normalized.generatedAt,
    observedAt: normalized.observedAt,
    timezone: normalized.timezone,
    coverage: normalized.coverage,
    notices: { sensitiveLeadAccess: normalized.notices.sensitiveLeadAccess },
    assets: normalized.assets,
    nodes: normalized.nodes,
    connections: normalized.connections,
    findings: normalized.findings,
    roadmap: normalized.roadmap,
    readiness: normalized.readiness,
    limitations: normalized.limitations,
  };
}
