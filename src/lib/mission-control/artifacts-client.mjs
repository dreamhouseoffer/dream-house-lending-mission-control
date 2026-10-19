// Strict, bounded reader for the bridge's registered-artifact and record-link reads:
//   GET /v0/tasks/:id/artifacts, GET /v0/tasks/:id/artifacts/:artifact_id (raw bytes), GET /v0/record-links.
// Server-only: requests are signed with the shared secret through the bridge client. Framework-neutral so the parsers
// can be tested directly. Fails closed: one malformed record rejects the whole payload. Artifact ids are the bridge's
// opaque registered ids (a<N> / a<N>m<K>); a filename or path is never accepted or returned.
import { createHash } from "node:crypto";
import {
  BRIDGE_UI_STATES,
  DEFAULT_TIMEOUT_MS,
  TASK_ID_RE,
  bridgeGet,
  newNonce,
  nodeTransport,
  sign,
} from "./bridge-client.mjs";

export const ARTIFACT_ID_RE = /^a[1-9]\d{0,9}(m\d{1,3})?$/;
export const RECORD_ID_RE = /^rec[A-Za-z0-9]{14}$/;
export const ARTIFACT_LIST_MAX_BYTES = 256 * 1024;
export const RECORD_LINKS_MAX_BYTES = 512 * 1024;
// The bridge caps files at 8 MiB; anything larger is refused before it is buffered here.
export const ARTIFACT_MAX_BYTES = 8 * 1024 * 1024;
export const PREVIEW_MAX_BYTES = 1024 * 1024;
export const PUBLICATION_NOT_BY_BRIDGE = "not_published_by_bridge";
export const ARTIFACTS_OP = "GET /v0/tasks/:id/artifacts";
export const RECORD_LINKS_OP = "GET /v0/record-links";

export const ARTIFACT_PROBLEMS = [
  "unsafe_name", "unsupported_type", "too_large", "size_mismatch", "path_mismatch", "not_regular_file", "unavailable",
  "archive_integrity", "encrypted", "unsupported_compression",
];

export const ARTIFACT_PROBLEM_TEXT = {
  unsafe_name: "unsafe file name",
  unsupported_type: "file type not allowed",
  too_large: "too large to serve",
  size_mismatch: "size differs from the registration",
  path_mismatch: "stored outside the attachment folder",
  not_regular_file: "not a regular file",
  unavailable: "file missing",
  archive_integrity: "archive failed its integrity check",
  encrypted: "encrypted archive",
  unsupported_compression: "unsupported archive compression",
};

const MIME = {
  "text/markdown": "markdown",
  "text/plain": "text",
  "application/json": "json",
  "application/zip": "zip",
  "application/x-xz": "xz",
};

const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const SHA_RE = /^[0-9a-f]{64}$/;
const NO = Symbol("invalid");

export function mimeBase(contentType) {
  return typeof contentType === "string" ? contentType.split(";")[0].trim().toLowerCase() : "";
}

/** "markdown" | "text" | "json" for types shown inline as escaped text; null for archives (download only). */
export function previewKind(contentType) {
  const kind = MIME[mimeBase(contentType)];
  return kind === "markdown" || kind === "text" || kind === "json" ? kind : null;
}

function str(v, max, { nullable = false } = {}) {
  if (v === null && nullable) return null;
  if (typeof v !== "string" || v.length > max || CONTROL_RE.test(v)) return NO;
  return v;
}

function iso(v, { nullable = true } = {}) {
  if (v === null && nullable) return null;
  return typeof v === "string" && v.length <= 64 && Number.isFinite(Date.parse(v)) ? v : NO;
}

function epoch(v) {
  if (v === null || v === undefined) return null;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : NO;
}

function checkUi(ui) {
  if (!isObj(ui) || typeof ui.state !== "string") return NO;
  return {
    state: BRIDGE_UI_STATES.includes(ui.state) ? ui.state : "unknown",
    reason: typeof ui.reason === "string" ? ui.reason.slice(0, 500) : "",
    native_status: typeof ui.native_status === "string" ? ui.native_status.slice(0, 64) : null,
    latest_run_outcome: typeof ui.latest_run_outcome === "string" ? ui.latest_run_outcome.slice(0, 64) : null,
  };
}

function checkArtifact(a) {
  if (!isObj(a)) return null;
  const out = {
    id: typeof a.id === "string" && ARTIFACT_ID_RE.test(a.id) ? a.id : NO,
    kind: a.kind === "attachment" || a.kind === "archive_member" ? a.kind : NO,
    parentId: a.parent_id === null ? null : typeof a.parent_id === "string" && ARTIFACT_ID_RE.test(a.parent_id) ? a.parent_id : NO,
    // A display name only. Never a path: separators are refused outright.
    name: typeof a.name === "string" && a.name.length > 0 && a.name.length <= 255 && !CONTROL_RE.test(a.name) && !/[\\/]/.test(a.name) ? a.name : NO,
    contentType: str(a.content_type, 100, { nullable: true }),
    size: Number.isSafeInteger(a.size) && a.size >= 0 ? a.size : NO,
    sha256: a.sha256 === null ? null : typeof a.sha256 === "string" && SHA_RE.test(a.sha256) ? a.sha256 : NO,
    uploadedBy: a.uploaded_by === null || a.uploaded_by === undefined ? null : str(a.uploaded_by, 64),
    registeredAt: iso(a.registered_at ?? null),
    readable: typeof a.readable === "boolean" ? a.readable : NO,
    problem: a.problem === null ? null : ARTIFACT_PROBLEMS.includes(a.problem) ? a.problem : NO,
    reviewed: typeof a.reviewed === "boolean" ? a.reviewed : NO,
  };
  if (Object.values(out).includes(NO)) return null;
  if ((out.kind === "archive_member") !== (out.parentId !== null)) return null;
  if (out.readable && out.problem !== null) return null;
  return out;
}

function checkReview(r) {
  if (r === null || r === undefined) return null;
  if (!isObj(r)) return NO;
  const limitations = Array.isArray(r.limitations) ? r.limitations.filter((l) => typeof l === "string").slice(0, 20).map((l) => l.slice(0, 500)) : NO;
  const out = {
    sourceArtifactId: typeof r.source_artifact_id === "string" && ARTIFACT_ID_RE.test(r.source_artifact_id) ? r.source_artifact_id : NO,
    reviewer: str(r.reviewer ?? null, 200, { nullable: true }),
    reviewedAt: iso(r.reviewed_at ?? null),
    decision: str(r.decision ?? null, 200, { nullable: true }),
    publicationAuthorized: typeof r.publication_authorized === "boolean" ? r.publication_authorized : NO,
    websiteChanged: typeof r.website_changed === "boolean" || r.website_changed === null ? r.website_changed : NO,
    reviewedDigests: Number.isSafeInteger(r.reviewed_digests) && r.reviewed_digests >= 0 ? r.reviewed_digests : NO,
    limitations,
  };
  return Object.values(out).includes(NO) ? NO : out;
}

/** @returns {any | null} the checked artifact list for exactly `taskId`, or null */
export function checkArtifactList(data, taskId) {
  if (!isObj(data) || data.task_id !== taskId || !isObj(data.task) || !Array.isArray(data.artifacts)) return null;
  // The bridge never publishes; any other publication claim is not trusted.
  if (data.publication !== PUBLICATION_NOT_BY_BRIDGE) return null;
  const observedAt = iso(data.observed_at, { nullable: false });
  const ui = checkUi(data.task.ui);
  const title = str(data.task.title ?? null, 500, { nullable: true });
  const assignee = str(data.task.assignee ?? null, 64, { nullable: true });
  const review = checkReview(data.review);
  const unregistered = Number.isSafeInteger(data.unregistered_reviewed_digests) && data.unregistered_reviewed_digests >= 0 ? data.unregistered_reviewed_digests : NO;
  if ([observedAt, ui, title, assignee, review, unregistered].includes(NO) || data.artifacts.length > 200) return null;
  const artifacts = [];
  const seen = new Set();
  for (const raw of data.artifacts) {
    const a = checkArtifact(raw);
    if (!a || seen.has(a.id)) return null;
    seen.add(a.id);
    artifacts.push(a);
  }
  for (const a of artifacts) if (a.parentId && !seen.has(a.parentId)) return null;
  return { taskId, task: { title, assignee, ui }, artifacts, review, unregisteredReviewedDigests: unregistered, publication: PUBLICATION_NOT_BY_BRIDGE, observedAt };
}

function checkLinkedTask(t) {
  if (!isObj(t)) return null;
  const out = {
    taskId: typeof t.task_id === "string" && TASK_ID_RE.test(t.task_id) ? t.task_id : NO,
    title: str(t.title ?? null, 500, { nullable: true }),
    assignee: str(t.assignee ?? null, 64, { nullable: true }),
    nativeStatus: str(t.native_status ?? null, 64, { nullable: true }),
    createdAt: epoch(t.created_at),
    completedAt: epoch(t.completed_at),
    ui: checkUi(t.ui),
    linkage: t.linkage === "workspace_segment" ? t.linkage : NO,
  };
  return Object.values(out).includes(NO) ? null : out;
}

/** @returns {{ links: { recordId: string, tasks: any[] }[], scannedTasks: number, linkageRule: string, observedAt: string } | null} */
export function checkRecordLinks(data) {
  if (!isObj(data) || !Array.isArray(data.links) || data.links.length > 500) return null;
  const observedAt = iso(data.observed_at, { nullable: false });
  const linkageRule = str(data.linkage_rule, 500);
  if (observedAt === NO || linkageRule === NO || !Number.isSafeInteger(data.scanned_tasks) || data.scanned_tasks < 0) return null;
  const links = [];
  const seen = new Set();
  for (const l of data.links) {
    if (!isObj(l) || typeof l.record_id !== "string" || !RECORD_ID_RE.test(l.record_id) || seen.has(l.record_id)) return null;
    if (!Array.isArray(l.tasks) || l.tasks.length > 50) return null;
    const tasks = [];
    for (const raw of l.tasks) {
      const t = checkLinkedTask(raw);
      if (!t) return null;
      tasks.push(t);
    }
    seen.add(l.record_id);
    links.push({ recordId: l.record_id, tasks });
  }
  return { links, scannedTasks: data.scanned_tasks, linkageRule, observedAt };
}

/** True only when the connected bridge itself advertises the read (an older running bridge does not). */
export function artifactsSupported(caps) {
  return Boolean(caps && Array.isArray(caps.ops) && caps.ops.includes(ARTIFACTS_OP));
}

export function recordLinksSupported(caps) {
  return Boolean(caps && Array.isArray(caps.ops) && caps.ops.includes(RECORD_LINKS_OP));
}

const failure = (state, code) => ({ ok: false, state, code });

export async function fetchArtifactList(config, taskId, options = {}) {
  if (typeof taskId !== "string" || !TASK_ID_RE.test(taskId)) return failure("not_found", "invalid_task_id");
  const res = await bridgeGet(config, `/v0/tasks/${taskId}/artifacts`, { maxBytes: ARTIFACT_LIST_MAX_BYTES, ...options });
  if (!res.ok) return res;
  const value = checkArtifactList(res.data, taskId);
  return value ? { ok: true, ...value } : failure("bad_payload", "schema_mismatch");
}

export async function fetchRecordLinks(config, options = {}) {
  const res = await bridgeGet(config, "/v0/record-links", { maxBytes: RECORD_LINKS_MAX_BYTES, ...options });
  if (!res.ok) return res;
  const value = checkRecordLinks(res.data);
  return value ? { ok: true, ...value } : failure("bad_payload", "schema_mismatch");
}

const BYTE_FAILURES = {
  400: ["not_found", "invalid_id"],
  401: ["unauthorized", "unauthorized"],
  403: ["unauthorized", "forbidden"],
  404: ["not_found", "not_found"],
  409: ["unavailable", "artifact_unavailable"],
  413: ["unavailable", "artifact_too_large"],
  415: ["unavailable", "unsupported_type"],
  503: ["hermes_unavailable", "hermes_unavailable"],
  504: ["hermes_unavailable", "hermes_timeout"],
};

/** Signed GET returning raw bytes (the artifact route is not JSON on success). Never throws. */
export async function bridgeGetBytes(config, target, { transport = nodeTransport, now = Date.now, timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = ARTIFACT_MAX_BYTES, nonce = newNonce() } = {}) {
  if (!config || !config.configured) return failure("not_configured", config?.reason ?? "not_configured");
  if (typeof target !== "string" || !target.startsWith("/v0/")) return failure("error", "invalid_target");
  const ts = String(Math.floor(now() / 1000));
  const headers = {
    accept: "*/*",
    "x-mc-timestamp": ts,
    "x-mc-nonce": nonce,
    "x-mc-signature": sign(config.secret, "GET", target, ts, nonce, Buffer.alloc(0)),
  };
  let res;
  try {
    res = await transport({ origin: config.origin, target, method: "GET", headers, body: undefined, timeoutMs: Math.min(Math.max(Number(timeoutMs) || DEFAULT_TIMEOUT_MS, 250), 20_000), maxBytes });
  } catch (e) {
    const code = e && typeof e.code === "string" ? e.code : "network";
    return failure(code === "response_too_large" ? "unavailable" : "offline", code === "response_too_large" ? "artifact_too_large" : code);
  }
  if (!res || !Buffer.isBuffer(res.body)) return failure("bad_payload", "no_body");
  if (res.status !== 200) {
    const [state, code] = BYTE_FAILURES[res.status] ?? ["error", `http_${res.status}`];
    return failure(state, code);
  }
  return { ok: true, bytes: res.body, contentType: String(res.contentType ?? "") };
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/**
 * Read one registered artifact by opaque id. The registration (list) is read first; the bytes must then match its
 * size, digest and allowlisted type exactly, otherwise nothing is returned. Never throws.
 */
export async function fetchArtifactBytes(config, taskId, artifactId, options = {}) {
  if (typeof taskId !== "string" || !TASK_ID_RE.test(taskId)) return failure("not_found", "invalid_task_id");
  if (typeof artifactId !== "string" || !ARTIFACT_ID_RE.test(artifactId)) return failure("not_found", "invalid_artifact_id");
  const list = await fetchArtifactList(config, taskId, options);
  if (!list.ok) return list;
  const artifact = list.artifacts.find((a) => a.id === artifactId);
  if (!artifact) return failure("not_found", "unknown_artifact");
  if (!artifact.readable) return failure("unavailable", artifact.problem ?? "unavailable");
  if (!MIME[mimeBase(artifact.contentType)]) return failure("unavailable", "unsupported_type");
  const raw = await bridgeGetBytes(config, `/v0/tasks/${taskId}/artifacts/${artifactId}`, options);
  if (!raw.ok) return raw;
  if (raw.bytes.length !== artifact.size) return failure("bad_payload", "size_mismatch");
  const digest = sha256(raw.bytes);
  if (artifact.sha256 && digest !== artifact.sha256) return failure("bad_payload", "digest_mismatch");
  if (mimeBase(raw.contentType) !== mimeBase(artifact.contentType)) return failure("bad_payload", "type_mismatch");
  return { ok: true, bytes: raw.bytes, contentType: artifact.contentType, name: artifact.name, sha256: digest, artifact, task: list.task, review: list.review };
}

// ---- view helpers -----------------------------------------------------------------------------------------

// Tasks explicitly declared as content draft packages (the completed Milo package, native done, run 17). Only these
// are ever labelled draft / ready-for-review. Any other finished task is shown with neutral "Result files": a task
// title, state or missing receipt says nothing about whether it is a draft or whether it was released.
export const DRAFT_PACKAGE_TASKS = ["t_11191492"];

export function isDraftPackage(taskId) {
  return DRAFT_PACKAGE_TASKS.includes(taskId);
}

/**
 * A review receipt that actually covers files here: it is itself a readable registered attachment, lists at least one
 * digest, and at least one readable file carries a listed digest. It is a record of what was read, nothing more: it
 * never authorizes execution or publication, whatever its `publication_authorized` flag says.
 */
export function hasCoveringReceipt(list) {
  const r = list.review;
  if (!r || !Number.isSafeInteger(r.reviewedDigests) || r.reviewedDigests < 1) return false;
  const source = list.artifacts.find((a) => a.id === r.sourceArtifactId);
  if (!source || source.kind !== "attachment" || !source.readable) return false;
  return list.artifacts.some((a) => a.readable && a.reviewed && a.sha256);
}

/**
 * Draft / ready-for-review stage, only for declared draft packages. "Published" is never derived here: the bridge does
 * not publish and reports `not_published_by_bridge`; publication needs separate provider confirmation.
 */
export function reviewStage(list, { draftPackage = isDraftPackage(list.taskId) } = {}) {
  const readable = list.artifacts.filter((a) => a.readable);
  if (readable.length === 0) return { stage: "no_files", label: "No readable result files", tone: "neutral" };
  if (!draftPackage) return { stage: "result_files", label: "Result files", tone: "neutral" };
  if (hasCoveringReceipt(list)) return { stage: "ready_for_review", label: "Ready for review (draft)", tone: "warn" };
  return { stage: "draft", label: "Draft (not reviewed)", tone: "neutral" };
}

/**
 * Publication is unknown here: no trusted provider-confirmation schema is read, and a missing receipt or a title proves
 * nothing either way. A covering receipt on a declared draft package only bounds what that review itself decided.
 */
export function publicationStatus(list, { draftPackage = isDraftPackage(list.taskId) } = {}) {
  let boundary = null;
  if (draftPackage && hasCoveringReceipt(list)) {
    boundary = list.review.publicationAuthorized
      ? "This review recorded publication authorization; that is not a release, and no provider confirmation is read here"
      : "This review did not authorize publication";
  }
  return { state: "unknown", chip: "Publication: unknown", label: "Publication status unavailable — not tracked here", boundary };
}

/**
 * One canonical file per reviewed digest. A standalone native attachment is preferred over the same bytes inside a
 * package; the other copies are returned as duplicates (with `duplicateOf`) so they stay reachable behind details.
 */
export function canonicalReviewedFiles(artifacts) {
  const bySha = new Map();
  for (const a of artifacts) {
    if (!a.readable || !a.reviewed || !a.sha256) continue;
    const cur = bySha.get(a.sha256);
    if (!cur || (cur.kind === "archive_member" && a.kind === "attachment")) bySha.set(a.sha256, a);
  }
  const canonical = artifacts.filter((a) => a.sha256 && bySha.get(a.sha256) === a);
  const duplicates = artifacts
    .filter((a) => a.readable && a.reviewed && a.sha256 && bySha.get(a.sha256) !== a)
    .map((a) => ({ ...a, duplicateOf: bySha.get(a.sha256).id }));
  return { canonical, duplicates };
}

/**
 * Attachments in bridge order with their archive members nested. Canonical reviewed files first; duplicate copies,
 * unreviewed readable files and unavailable files are returned separately so the page can keep them behind details
 * instead of repeating them or showing dead links.
 */
export function groupArtifacts(artifacts) {
  const members = new Map();
  for (const a of artifacts) {
    if (!a.parentId) continue;
    if (!members.has(a.parentId)) members.set(a.parentId, []);
    members.get(a.parentId).push(a);
  }
  const top = artifacts.filter((a) => !a.parentId).map((a) => ({ ...a, members: members.get(a.id) ?? [] }));
  const { canonical: reviewed, duplicates } = canonicalReviewedFiles(artifacts);
  const other = artifacts.filter((a) => a.readable && !a.reviewed);
  const unavailable = artifacts.filter((a) => !a.readable);
  return { top, reviewed, duplicates, other, unavailable };
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Same-origin app paths only (never a bridge URL, never a file path). */
export function artifactHref(taskId, artifactId) {
  return `/tasks/${taskId}/artifacts/${artifactId}`;
}

export function artifactDownloadHref(taskId, artifactId) {
  return `/api/control/tasks/${taskId}/artifacts/${artifactId}`;
}

/** ASCII-safe filename plus RFC 5987 UTF-8 form for Content-Disposition. */
export function contentDisposition(name) {
  const ascii = String(name).replace(/[^A-Za-z0-9._ ()-]/g, "_").slice(0, 150) || "download";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(String(name)).slice(0, 600)}`;
}

/** Decode UTF-8 strictly for preview; null if the bytes are not valid UTF-8. */
export function decodePreview(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
