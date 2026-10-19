// Server-only Next wrapper for the bridge's registered-artifact and record-link reads. Import from route handlers or
// server components only. Reads MC_BRIDGE_URL / MC_BRIDGE_SECRET at request time, never logs them, never caches.
// Every read requires the owner session first; bytes never reach the static bundle or public assets.
import { unstable_noStore as noStore } from "next/cache";
import { readBridgeConfig, TASK_ID_RE } from "./bridge-client.mjs";
import { hasControlAccess, type BridgeResult, type BridgeTask } from "./bridge";
import { ARTIFACT_ID_RE, DRAFT_PACKAGE_TASKS, fetchArtifactBytes, fetchArtifactList, fetchRecordLinks } from "./artifacts-client.mjs";

export type Artifact = {
  id: string;
  kind: "attachment" | "archive_member";
  parentId: string | null;
  name: string;
  contentType: string | null;
  size: number;
  sha256: string | null;
  uploadedBy: string | null;
  registeredAt: string | null;
  readable: boolean;
  problem: string | null;
  reviewed: boolean;
};
export type ArtifactReview = {
  sourceArtifactId: string;
  reviewer: string | null;
  reviewedAt: string | null;
  decision: string | null;
  publicationAuthorized: boolean;
  websiteChanged: boolean | null;
  reviewedDigests: number;
  limitations: string[];
};
export type ArtifactList = {
  taskId: string;
  task: { title: string | null; assignee: string | null; ui: BridgeTask["ui"] };
  artifacts: Artifact[];
  review: ArtifactReview | null;
  unregisteredReviewedDigests: number;
  publication: "not_published_by_bridge";
  observedAt: string;
};
export type LinkedTask = {
  taskId: string;
  title: string | null;
  assignee: string | null;
  nativeStatus: string | null;
  createdAt: number | null;
  completedAt: number | null;
  ui: BridgeTask["ui"];
  linkage: "workspace_segment";
};
export type RecordLinks = { links: { recordId: string; tasks: LinkedTask[] }[]; scannedTasks: number; linkageRule: string; observedAt: string };
export type ArtifactBytes =
  | { ok: true; bytes: Buffer; contentType: string; name: string; sha256: string; artifact: Artifact; task: ArtifactList["task"]; review: ArtifactReview | null }
  | { ok: false; state: string; code: string };

// Only declared draft packages are discovered for Content review; arbitrary finished tasks are not drafts.
export const PINNED_REVIEW_TASKS: readonly string[] = DRAFT_PACKAGE_TASKS;

function config() {
  return readBridgeConfig({ url: process.env.MC_BRIDGE_URL, secret: process.env.MC_BRIDGE_SECRET });
}

async function guarded<T>(fn: (cfg: ReturnType<typeof config>) => Promise<unknown>): Promise<T> {
  noStore();
  const cfg = config();
  if (!cfg.configured) return { ok: false, state: "not_configured", code: cfg.reason ?? "not_configured" } as T;
  if (!(await hasControlAccess())) return { ok: false, state: "unauthenticated", code: "unauthenticated" } as T;
  return (await fn(cfg)) as T;
}

export function isArtifactId(id: unknown): id is string {
  return typeof id === "string" && ARTIFACT_ID_RE.test(id);
}

export function readArtifactList(taskId: string): Promise<BridgeResult<ArtifactList>> {
  if (typeof taskId !== "string" || !TASK_ID_RE.test(taskId)) return Promise.resolve({ ok: false, state: "not_found", code: "invalid_task_id" });
  return guarded((cfg) => fetchArtifactList(cfg, taskId));
}

export function readArtifactBytes(taskId: string, artifactId: string): Promise<ArtifactBytes> {
  if (typeof taskId !== "string" || !TASK_ID_RE.test(taskId)) return Promise.resolve({ ok: false, state: "not_found", code: "invalid_task_id" });
  if (!isArtifactId(artifactId)) return Promise.resolve({ ok: false, state: "not_found", code: "invalid_artifact_id" });
  return guarded((cfg) => fetchArtifactBytes(cfg, taskId, artifactId));
}

export function readRecordLinks(): Promise<BridgeResult<RecordLinks>> {
  return guarded((cfg) => fetchRecordLinks(cfg));
}

/**
 * Review discovery: declared draft packages only, read one at a time. Arbitrary finished tasks (source captures,
 * research, releases) are not drafts and are not scanned; their files stay on the task detail page. Reading
 * sequentially also keeps within the bridge's bounded CLI concurrency instead of tripping its 503 busy answer.
 */
export async function readReviewPackages(): Promise<{
  packages: ArtifactList[];
  failures: { taskId: string; state: string; code: string }[];
}> {
  const packages: ArtifactList[] = [];
  const failures: { taskId: string; state: string; code: string }[] = [];
  for (const id of PINNED_REVIEW_TASKS) {
    const r = await readArtifactList(id);
    if (r.ok) {
      if (r.artifacts.length > 0) packages.push(r);
    } else {
      failures.push({ taskId: id, state: r.state, code: r.code });
    }
  }
  return { packages, failures };
}
