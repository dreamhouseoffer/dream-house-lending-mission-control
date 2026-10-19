import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { McPage, PageHeader, Section, StateNotice, StatusChip } from "@/components/mc/ui";
import { ArtifactFailure, MarkdownPreview, PlainPreview } from "@/components/mc/artifact-views";
import { readArtifactBytes } from "@/lib/mission-control/artifacts";
import {
  ARTIFACT_PROBLEM_TEXT,
  PREVIEW_MAX_BYTES,
  artifactDownloadHref,
  decodePreview,
  formatBytes,
  previewKind,
} from "@/lib/mission-control/artifacts-client.mjs";
import { prettyJson } from "@/lib/mission-control/safe-markdown.mjs";

export const metadata: Metadata = { title: "Result file · Mission Control" };
export const dynamic = "force-dynamic";

export default async function ArtifactPreviewPage({ params, searchParams = {} }: { params: { id: string; artifactId: string }; searchParams?: { view?: string } }) {
  const result = await readArtifactBytes(params.id, params.artifactId);
  const back = (
    <Link href={`/tasks/${params.id.slice(0, 40)}#results`} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500">
      <ArrowLeft size={14} aria-hidden /> Task
    </Link>
  );

  if (!result.ok) {
    return (
      <McPage>
        <PageHeader eyebrow="Result file" title={params.artifactId.slice(0, 20)} actions={back} />
        {result.state === "unavailable" ? (
          <StateNotice kind="error" title="File unavailable">
            {ARTIFACT_PROBLEM_TEXT[result.code as keyof typeof ARTIFACT_PROBLEM_TEXT] ?? "The bridge refused to serve this file"}. Nothing was shown from it.
          </StateNotice>
        ) : (
          <ArtifactFailure state={result.state} />
        )}
      </McPage>
    );
  }

  const kind = previewKind(result.contentType);
  const text = kind && result.bytes.length <= PREVIEW_MAX_BYTES ? decodePreview(result.bytes) : null;
  const plain = searchParams.view === "plain" || kind !== "markdown";
  const base = `/tasks/${params.id}/artifacts/${params.artifactId}`;

  return (
    <McPage>
      <PageHeader
        eyebrow={`Result file · ${result.task.title ?? params.id}`}
        title={result.name}
        description={`${formatBytes(result.bytes.length)} · registered native attachment ${params.artifactId} · sha256 ${result.sha256.slice(0, 12)}…`}
        actions={
          <>
            {back}
            <a href={artifactDownloadHref(params.id, params.artifactId)} download className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-teal-500/40 bg-teal-500/10 px-3 py-1.5 text-sm font-medium text-teal-100 hover:bg-teal-500/20">
              <Download size={14} aria-hidden /> Download
            </a>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusChip tone={result.artifact.reviewed ? "warn" : "neutral"}>{result.artifact.reviewed ? "Draft · covered by the review" : "Draft · not covered by a review"}</StatusChip>
        <StatusChip>Not published</StatusChip>
        {kind === "markdown" && text !== null && (
          <span className="ml-auto flex gap-1.5 text-xs">
            <Link href={base} aria-current={!plain ? "page" : undefined} className={`rounded-md border px-2.5 py-1 ${!plain ? "border-teal-500/40 bg-teal-500/15 text-teal-100" : "border-slate-700 text-slate-400"}`}>
              Formatted
            </Link>
            <Link href={`${base}?view=plain`} aria-current={plain ? "page" : undefined} className={`rounded-md border px-2.5 py-1 ${plain ? "border-teal-500/40 bg-teal-500/15 text-teal-100" : "border-slate-700 text-slate-400"}`}>
              Plain text
            </Link>
          </span>
        )}
      </div>
      <Section title="Preview" description="Shown as escaped text. HTML or scripts inside the file are displayed literally, never run.">
        {!kind ? (
          <StateNotice kind="info" title="This file is a package">Packages are download-only. Their readable files are listed on the task page.</StateNotice>
        ) : text === null ? (
          <StateNotice kind="info" title="Too large or not plain text to preview">Use Download to open it on this device.</StateNotice>
        ) : plain ? (
          <PlainPreview text={kind === "json" ? prettyJson(text) : text} />
        ) : (
          <MarkdownPreview text={text} />
        )}
      </Section>
    </McPage>
  );
}
