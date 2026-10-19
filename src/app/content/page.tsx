import type { Metadata } from "next";
import Link from "next/link";
import { DisabledAction, McPage, ModuleLink, PageHeader, Section, SourceNote, StateNotice, StatusChip } from "@/components/mc/ui";
import { ArtifactFailure, ArtifactFiles, ReviewStatus } from "@/components/mc/artifact-views";
import { TaskStateChip } from "@/components/mc/task-views";
import { AutoRefresh } from "@/components/mc/auto-refresh";
import { SOURCES, capability } from "@/lib/mission-control/capabilities.mjs";
import { formatTime } from "@/lib/mission-control/bridge-client.mjs";
import { readCapabilities } from "@/lib/mission-control/bridge";
import { readReviewPackages } from "@/lib/mission-control/artifacts";
import {
  PACKAGE_PROBLEM_TEXT,
  artifactsSupported,
  contentPackagesSupported,
  discoverySummary,
  packageBasis,
  parseContentPage,
} from "@/lib/mission-control/artifacts-client.mjs";

export const metadata: Metadata = { title: "Content · Mission Control" };
export const dynamic = "force-dynamic";

const pageHref = (n: number) => (n === 1 ? "/content#review" : `/content?page=${n}#review`);

export default async function ContentPage({ searchParams }: { searchParams?: { page?: string | string[] } }) {
  const publish = capability("content.publish");
  const page = parseContentPage(searchParams?.page);
  const caps = await readCapabilities();
  // An older running bridge does not serve result files: say so instead of probing it or showing a stand-in.
  const supported = caps.ok ? artifactsSupported(caps) : null;
  const discover = caps.ok ? contentPackagesSupported(caps) : false;
  const review = supported && page !== null ? await readReviewPackages(page, { discover }) : null;
  const d = review?.discovery ?? null;

  return (
    <McPage>
      <PageHeader
        eyebrow="Create"
        title="Content"
        description="Finished drafts with their result files, ready for your review. Draft, ready-for-review and published are separate states; nothing here publishes."
      />
      <SourceNote
        source={
          review
            ? { label: "Hermes task attachments (registered)", state: "observed", detail: "Read through the bridge for this signed-in session. Packages are tasks carrying a valid typed content-package declaration; files are the task's registered native attachments, opened by id." }
            : { ...SOURCES.content }
        }
      />

      <Section
        id="review"
        title="Ready for your review"
        description="Open or download each file. Draft packages are never published from Mission Control; publishing needs its own approval and a confirmation from the destination."
      >
        {page === null ? (
          <StateNotice kind="error" title="Not a valid page" href="/content#review" hrefLabel="First page">
            The page number must be a whole number from 1 to 999.
          </StateNotice>
        ) : !caps.ok ? (
          <ArtifactFailure state={caps.state} />
        ) : !supported ? (
          <ArtifactFailure state="not_supported" />
        ) : !review ? null : (
          <div className="space-y-4">
            {!discover && (
              <StateNotice kind="info" title="Package discovery is not served by the running bridge yet">
                Only the earlier first-buyer package was checked. Newer declared packages appear after the reviewed bridge update and restart; nothing else is guessed.
              </StateNotice>
            )}
            {review.discoveryFailure && (
              <div>
                <p className="mb-1 text-xs text-slate-500">Package discovery (page {page})</p>
                <ArtifactFailure state={review.discoveryFailure.state} />
              </div>
            )}
            {d && <p className="text-xs leading-5 text-slate-400" data-testid="content-discovery-summary">{discoverySummary(d)}</p>}
            {d && d.candidatesCapped && (
              <StateNotice kind="stale" title="Task listing was capped">
                Hermes returned its maximum listing, so the oldest finished tasks may not be among the candidates.
              </StateNotice>
            )}
            {review.failures.map((f) => (
              <div key={f.taskId}>
                <p className="mb-1 font-mono text-xs text-slate-500">{f.taskId}</p>
                <ArtifactFailure state={f.state} />
              </div>
            ))}
            {d && d.failures.length > 0 && (
              <StateNotice kind="error" title={`${d.failures.length} task${d.failures.length === 1 ? "" : "s"} on this page could not be checked`}>
                Whether {d.failures.length === 1 ? "it is" : "they are"} a declared package is unknown, not no. Refresh to retry:{" "}
                {d.failures.map((f) => (
                  <Link key={f.taskId} href={`/tasks/${f.taskId}`} className="mr-2 font-mono text-teal-300 hover:text-teal-200">
                    {f.taskId}
                  </Link>
                ))}
              </StateNotice>
            )}
            {review.packages.length === 0 && review.failures.length === 0 && (
              <StateNotice kind="empty" title="No declared draft packages with result files on this page">
                {d ? "Use Older to check earlier finished tasks." : `Checked ${review.legacyChecked.length} earlier package.`} Other finished tasks keep their result files on their task page.
              </StateNotice>
            )}
            {review.packages.map((p) => (
              <article key={p.taskId} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3" data-testid="content-package" data-task-id={p.taskId}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="line-clamp-2 break-words text-sm font-medium text-slate-100">{p.task.title ?? "Untitled task"}</h3>
                    <p className="mt-0.5 break-words text-xs text-slate-500">
                      assignee {p.task.assignee ?? "unassigned"} ·{" "}
                      <Link href={`/tasks/${p.taskId}`} className="font-mono text-teal-300 hover:text-teal-200">
                        {p.taskId}
                      </Link>{" "}
                      · {packageBasis(p) === "declared" ? "declared package" : packageBasis(p) === "legacy" ? "earlier package" : "declaration changed since discovery"}
                      {" "}· read {formatTime(p.observedAt)}
                    </p>
                  </div>
                  <span className="flex shrink-0 flex-wrap gap-1.5">
                    <TaskStateChip task={{ id: p.taskId, status: p.task.ui.native_status ?? "", bucket: null, verified: false, ui: p.task.ui }} />
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  <ReviewStatus list={p} />
                  <ArtifactFiles list={p} />
                </div>
              </article>
            ))}
            {d && d.invalid.length > 0 && (
              <details className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs leading-5 text-slate-400">
                <summary className="cursor-pointer font-medium text-slate-200">
                  {d.invalid.length} rejected package declaration{d.invalid.length === 1 ? "" : "s"} (not shown as drafts)
                </summary>
                <ul className="mt-2 space-y-1">
                  {d.invalid.map((x) => (
                    <li key={x.taskId} className="break-words">
                      <Link href={`/tasks/${x.taskId}`} className="font-mono text-teal-300 hover:text-teal-200">
                        {x.taskId}
                      </Link>{" "}
                      {x.title ?? "Untitled task"} — {PACKAGE_PROBLEM_TEXT[x.problem as keyof typeof PACKAGE_PROBLEM_TEXT] ?? x.problem}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {d && (page > 1 || d.hasMore) && (
              <nav className="flex flex-wrap items-center gap-3 text-xs" aria-label="Content package pages">
                {page > 1 && (
                  <Link href={pageHref(page - 1)} className="font-medium text-teal-300 hover:text-teal-200">
                    ← Newer
                  </Link>
                )}
                <span className="text-slate-500">Page {page}</span>
                {d.hasMore && page < 999 && (
                  <Link href={pageHref(page + 1)} className="font-medium text-teal-300 hover:text-teal-200">
                    Older →
                  </Link>
                )}
              </nav>
            )}
          </div>
        )}
      </Section>

      <Section title="Publishing">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5" aria-label="Content states">
            <StatusChip>Draft</StatusChip>
            <StatusChip tone="warn">Ready for review (draft)</StatusChip>
            <StatusChip>Publication: unknown — not tracked here</StatusChip>
            <StatusChip tone="ok">Published — only with destination confirmation</StatusChip>
          </div>
          <DisabledAction label="Schedule or publish" reason={publish.reason ?? ""} />
        </div>
      </Section>
      <Section title="Retained modules">
        <div className="space-y-2">
          <ModuleLink href="/campaigns" title="Campaigns (Mailchimp)" description="Existing campaign module, unchanged. This workspace never schedules or sends from here." />
          <ModuleLink href="/content/training" title="Loan training" description="Training library used by Ask Hermes (previously at /content)." />
        </div>
      </Section>
      <AutoRefresh active={caps.ok === false && caps.state === "offline"} intervalMs={30000} label="Bridge offline: re-checking every 30s." />
    </McPage>
  );
}
