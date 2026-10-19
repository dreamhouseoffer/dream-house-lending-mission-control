// Server-safe presentation of registered task artifacts (result files). Renders only checked bridge records; links
// point at same-origin app routes by opaque artifact id. Raw HTML is never injected: previews are React text nodes.
import Link from "next/link";
import { Download, Eye } from "lucide-react";
import { StateNotice, StatusChip, type Tone } from "@/components/mc/ui";
import {
  ARTIFACT_PROBLEM_TEXT,
  PACKAGE_PROBLEM_TEXT,
  artifactDownloadHref,
  artifactHref,
  formatBytes,
  groupArtifacts,
  previewKind,
  publicationStatus,
  reviewStage,
} from "@/lib/mission-control/artifacts-client.mjs";
import { tokenizeMarkdown } from "@/lib/mission-control/safe-markdown.mjs";
import { formatTime } from "@/lib/mission-control/bridge-client.mjs";
import type { Artifact, ArtifactList } from "@/lib/mission-control/artifacts";

const FAILURE_TEXT: Record<string, { title: string; body: string }> = {
  not_supported: {
    title: "Result files are not served by the running bridge yet",
    body: "The connected bridge does not advertise the artifact read. It needs the reviewed bridge update and a restart; nothing here is simulated.",
  },
  not_configured: { title: "Mac execution bridge is not connected", body: "No bridge endpoint is configured, so result files cannot be read." },
  unauthenticated: { title: "Sign-in required", body: "Result files are only read for an authenticated owner session." },
  offline: { title: "Mac execution bridge is offline", body: "The bridge did not answer. Result files are unknown, not missing." },
  not_found: { title: "No such task", body: "The Hermes task board has no task with this id." },
  hermes_unavailable: {
    title: "Hermes was busy or unavailable for this read",
    body: "The bridge answered but could not read the task's attachments right now. Result files are unknown, not missing; refresh to retry.",
  },
  unauthorized: { title: "Bridge refused the signed read", body: "The bridge rejected this request's signature. Nothing is shown." },
  // A verification failure is a security signal: it stays visible and is never folded into "no files".
  bad_payload: {
    title: "Result file list failed verification",
    body: "The bridge answer did not match the expected schema and was discarded. This is not an empty package.",
  },
};

const NOT_CONNECTED = new Set(["not_supported", "not_configured", "unauthenticated"]);
const TRANSIENT = new Set(["offline", "hermes_unavailable"]);

export function ArtifactFailure({ state }: { state: string }) {
  const copy = FAILURE_TEXT[state] ?? { title: "Result files could not be read", body: `The bridge read failed (${state}), so nothing is shown.` };
  return (
    <StateNotice kind={TRANSIENT.has(state) ? "offline" : NOT_CONNECTED.has(state) ? "not_connected" : "error"} title={copy.title}>
      {copy.body}
    </StateNotice>
  );
}

function FileLinks({ taskId, a }: { taskId: string; a: Artifact }) {
  if (!a.readable) {
    return <StatusChip tone="neutral">Unavailable ({ARTIFACT_PROBLEM_TEXT[a.problem as keyof typeof ARTIFACT_PROBLEM_TEXT] ?? "unreadable"})</StatusChip>;
  }
  const cls = "inline-flex min-h-9 items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-teal-500/50 hover:text-teal-100";
  return (
    <span className="flex flex-wrap gap-1.5">
      {previewKind(a.contentType) && (
        <Link href={artifactHref(taskId, a.id)} className={cls} aria-label={`Open ${a.name}`}>
          <Eye size={13} aria-hidden /> Open
        </Link>
      )}
      <a href={artifactDownloadHref(taskId, a.id)} download className={cls} aria-label={`Download ${a.name}`}>
        <Download size={13} aria-hidden /> Download
      </a>
    </span>
  );
}

type Duplicate = Artifact & { duplicateOf: string };

function FileRow({ taskId, a, nested = false, sameAs }: { taskId: string; a: Artifact; nested?: boolean; sameAs?: string }) {
  return (
    <li className={nested ? "ml-4 border-l border-slate-800 pl-3" : undefined}>
      <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="break-words text-sm text-slate-100">{a.name}</p>
          <p className="text-xs text-slate-500">
            {formatBytes(a.size)} · {a.kind === "archive_member" ? "inside package" : "attachment"}
            {a.reviewed ? " · covered by the review" : ""}
            {sameAs ? ` · same bytes as ${sameAs}` : ""}
          </p>
        </div>
        <FileLinks taskId={taskId} a={a} />
      </div>
    </li>
  );
}

/**
 * One row per reviewed file (deduplicated by digest, standalone attachment preferred). The complete registry —
 * duplicate copies, packages, earlier versions, unavailable files — sits behind a details toggle, never as dead links.
 */
export function ArtifactFiles({ list }: { list: ArtifactList }) {
  const { top, reviewed, duplicates, other, unavailable } = groupArtifacts(list.artifacts) as {
    top: Artifact[]; reviewed: Artifact[]; duplicates: Duplicate[]; other: Artifact[]; unavailable: Artifact[];
  };
  if (list.artifacts.length === 0) return <StateNotice kind="empty" title="No result files registered on this task" />;
  const primary = reviewed.length > 0 ? reviewed : top.filter((a) => a.readable);
  const rest: (Artifact | Duplicate)[] = reviewed.length > 0 ? [...duplicates, ...other] : other.filter((a) => a.parentId);
  const nameOf = new Map(list.artifacts.map((a) => [a.id, a.name]));
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-slate-800">{primary.map((a) => <FileRow key={a.id} taskId={list.taskId} a={a} />)}</ul>
      {(rest.length > 0 || unavailable.length > 0) && (
        <details className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-300">
            Complete file registry: {rest.length + unavailable.length} more — duplicate copies, packages, earlier versions, unavailable
          </summary>
          <ul className="mt-1 divide-y divide-slate-800">
            {[...rest, ...unavailable].map((a) => (
              <FileRow key={a.id} taskId={list.taskId} a={a} nested={Boolean(a.parentId)} sameAs={"duplicateOf" in a ? nameOf.get((a as Duplicate).duplicateOf) : undefined} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * Draft / ready-for-review only for declared draft packages; neutral "Result files" otherwise. Publication is stated as
 * unknown unless a provider confirmation exists (none is read here); a receipt only bounds what that review decided.
 */
export function ReviewStatus({ list }: { list: ArtifactList }) {
  const stage = reviewStage(list);
  const publication = publicationStatus(list);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <StatusChip tone={stage.tone as Tone}>{stage.label}</StatusChip>
        <StatusChip tone="neutral">{publication.chip}</StatusChip>
      </div>
      <p className="text-xs leading-5 text-slate-400">
        {publication.label}.{publication.boundary ? ` ${publication.boundary}.` : ""}
      </p>
      {list.package && (
        <p className="break-words text-xs leading-5 text-slate-500" data-testid="package-declaration">
          {list.package.state === "valid"
            ? `Declared content package (${list.package.sourceArtifactId}): ${list.package.declaredDigests} file${list.package.declaredDigests === 1 ? "" : "s"}. A declaration classifies the task only; it is not a review, approval or publication.`
            : `Package declaration ${list.package.sourceArtifactId} rejected: ${PACKAGE_PROBLEM_TEXT[list.package.problem as keyof typeof PACKAGE_PROBLEM_TEXT] ?? list.package.problem}. Shown as result files.`}
        </p>
      )}
      {list.review && (
        <details className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs leading-5 text-slate-400">
          <summary className="cursor-pointer font-medium text-slate-300">Review receipt (read record only)</summary>
          <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
            <dt className="text-slate-500">Reviewer</dt>
            <dd className="break-words">{list.review.reviewer ?? "not recorded"}</dd>
            <dt className="text-slate-500">Reviewed</dt>
            <dd>{list.review.reviewedAt ? formatTime(list.review.reviewedAt) : "not recorded"}</dd>
            <dt className="text-slate-500">Decision</dt>
            <dd className="break-words">{list.review.decision ?? "not recorded"}</dd>
            <dt className="text-slate-500">Files reviewed</dt>
            <dd>
              {list.review.reviewedDigests}
              {list.unregisteredReviewedDigests > 0 ? ` (${list.unregisteredReviewedDigests} not available here)` : ""}
            </dd>
            <dt className="text-slate-500">Website changed</dt>
            <dd>{list.review.websiteChanged === null ? "not recorded" : list.review.websiteChanged ? "yes (per review)" : "no"}</dd>
          </dl>
          {list.review.limitations.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {list.review.limitations.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          )}
        </details>
      )}
    </div>
  );
}

/** Escaped preview: every token is a React text node. */
export function MarkdownPreview({ text }: { text: string }) {
  const tokens = tokenizeMarkdown(text);
  return (
    <div className="space-y-3 break-words text-sm leading-7 text-slate-200">
      {tokens.map((t, i) => {
        if (t.type === "heading") {
          const size = t.level === 1 ? "text-xl" : t.level === 2 ? "text-lg" : "text-base";
          return <p key={i} role="heading" aria-level={Math.min(6, (t.level ?? 1) + 1)} className={`${size} font-semibold text-slate-50`}>{t.text}</p>;
        }
        if (t.type === "list") {
          const items = (t.items ?? []).map((it, j) => <li key={j}>{it}</li>);
          return t.ordered ? <ol key={i} className="list-decimal space-y-1 pl-6">{items}</ol> : <ul key={i} className="list-disc space-y-1 pl-6">{items}</ul>;
        }
        if (t.type === "code") return <pre key={i} className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-300">{t.text}</pre>;
        if (t.type === "quote") return <blockquote key={i} className="whitespace-pre-wrap border-l-2 border-slate-600 pl-3 text-slate-400">{t.text}</blockquote>;
        if (t.type === "rule") return <hr key={i} className="border-slate-800" />;
        return <p key={i} className="whitespace-pre-wrap">{t.text}</p>;
      })}
    </div>
  );
}

export function PlainPreview({ text }: { text: string }) {
  return <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-200">{text}</pre>;
}
