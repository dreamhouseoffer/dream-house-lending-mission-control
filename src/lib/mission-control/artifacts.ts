// Server-only Next wrapper for the bridge's registered-artifact and record-link reads. Import from route handlers or
// server components only. Reads MC_BRIDGE_URL / MC_BRIDGE_SECRET at request time, never logs them, never caches.
// Every read requires the owner session first; bytes never reach the static bundle or public assets.
import { unstable_noStore as noStore } from "next/cache";
import { readBridgeConfig, TASK_ID_RE } from "./bridge-client.mjs";
import { hasControlAccess, type BridgeResult, type BridgeTask } from "./bridge";
import {
  ARTIFACT_ID_RE,
  CONTENT_PACKAGES_MAX_PAGE,
  LEGACY_DRAFT_PACKAGE_TASKS,
  fetchArtifactBytes,
  fetchArtifactList,
  fetchContentPackages,
  fetchRecordLinks,
} from "./artifacts-client.mjs";

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
  declared: boolean;
};
export type ContentPackage = {
  sourceArtifactId: string;
  schema: "mission-control.content-package";
  version: 1;
  type: "content_draft_package";
  state: "valid" | "invalid";
  problem: string | null;
  declaredDigests: number;
  supersededDeclarations: number;
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
  package: ContentPackage | null;
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
export type DiscoveredPackage = {
  taskId: string;
  title: string | null;
  nativeStatus: "done" | "review";
  createdAt: number | null;
  completedAt: number | null;
  declarationArtifactId: string;
};
export type ContentPackagePage = {
  page: number;
  pageSize: number;
  checkedTaskIds: string[];
  packages: (DiscoveredPackage & { declaredDigests: number })[];
  invalid: (DiscoveredPackage & { problem: string })[];
  failures: { taskId: string; code: string }[];
  candidatesTotal: number;
  candidatesCapped: boolean;
  hasMore: boolean;
  range: { from: number; to: number } | null;
  candidateRule: string;
  observedAt: string;
};
export type ArtifactBytes =
  | { ok: true; bytes: Buffer; contentType: string; name: string; sha256: string; artifact: Artifact; task: ArtifactList["task"]; review: ArtifactReview | null }
  | { ok: false; state: string; code: string };

// The pre-declaration package, still shown on the first Content page. New packages are discovered by declaration.
export const LEGACY_REVIEW_TASKS: readonly string[] = LEGACY_DRAFT_PACKAGE_TASKS;

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

export function readContentPackagePage(page: number): Promise<BridgeResult<ContentPackagePage>> {
  if (!Number.isSafeInteger(page) || page < 1 || page > CONTENT_PACKAGES_MAX_PAGE) return Promise.resolve({ ok: false, state: "not_found", code: "invalid_page" });
  return guarded((cfg) => fetchContentPackages(cfg, page));
}

export type ReviewPackages = {
  packages: ArtifactList[];
  failures: { taskId: string; state: string; code: string }[];
  // null when the running bridge does not serve discovery (only the legacy package is read) or discovery failed.
  discovery: ContentPackagePage | null;
  discoveryFailure: { state: string; code: string } | null;
  legacyChecked: readonly string[];
};

/**
 * Review discovery, bounded per page: one discovery page from the bridge (it checks a fixed number of done/review
 * candidates for a valid typed declaration), then each discovered package's file list, read one at a time to stay
 * within the bridge's bounded CLI concurrency. The legacy pre-declaration package is read on page 1 only. A task is
 * never shown here because of its title, assignee or status; generic finished tasks keep their files on their task page.
 */
export async function readReviewPackages(page: number, { discover }: { discover: boolean }): Promise<ReviewPackages> {
  const packages: ArtifactList[] = [];
  const failures: { taskId: string; state: string; code: string }[] = [];
  let discovery: ContentPackagePage | null = null;
  let discoveryFailure: { state: string; code: string } | null = null;
  const ids: string[] = [];
  if (discover) {
    const d = await readContentPackagePage(page);
    if (d.ok) {
      discovery = d;
      ids.push(...d.packages.map((p) => p.taskId));
    } else discoveryFailure = { state: d.state, code: d.code };
  }
  const legacyChecked = page === 1 ? LEGACY_REVIEW_TASKS.filter((id) => !ids.includes(id)) : [];
  for (const id of [...ids, ...legacyChecked]) {
    const r = await readArtifactList(id);
    if (r.ok) {
      if (r.artifacts.length > 0) packages.push(r);
    } else {
      failures.push({ taskId: id, state: r.state, code: r.code });
    }
  }
  return { packages, failures, discovery, discoveryFailure, legacyChecked };
}
