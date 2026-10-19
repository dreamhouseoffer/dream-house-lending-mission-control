import type { Metadata } from "next";
import Link from "next/link";
import { DisabledAction, McPage, ModuleLink, PageHeader, Section, SourceNote, StateNotice, StatusChip } from "@/components/mc/ui";
import { ArtifactFailure, ArtifactFiles, ReviewStatus } from "@/components/mc/artifact-views";
import { TaskStateChip } from "@/components/mc/task-views";
import { AutoRefresh } from "@/components/mc/auto-refresh";
import { SOURCES, capability } from "@/lib/mission-control/capabilities.mjs";
import { formatTime } from "@/lib/mission-control/bridge-client.mjs";
import { readCapabilities } from "@/lib/mission-control/bridge";
import { PINNED_REVIEW_TASKS, readReviewPackages } from "@/lib/mission-control/artifacts";
import { artifactsSupported } from "@/lib/mission-control/artifacts-client.mjs";

export const metadata: Metadata = { title: "Content · Mission Control" };
export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const publish = capability("content.publish");
  const caps = await readCapabilities();
  // An older running bridge does not serve result files: say so instead of probing it or showing a stand-in.
  const supported = caps.ok ? artifactsSupported(caps) : null;
  const review = supported ? await readReviewPackages() : null;

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
            ? { label: "Hermes task attachments (registered)", state: "observed", detail: "Read through the bridge for this signed-in session. Files are the task's registered native attachments, opened by id." }
            : { ...SOURCES.content }
        }
      />

      <Section
        id="review"
        title="Ready for your review"
        description="Open or download each file. Draft packages are never published from Mission Control; publishing needs its own approval and a confirmation from the destination."
      >
        {!caps.ok ? (
          <ArtifactFailure state={caps.state} />
        ) : !supported ? (
          <ArtifactFailure state="not_supported" />
        ) : !review ? null : (
          <div className="space-y-4">
            {review.failures.map((f) => (
              <div key={f.taskId}>
                <p className="mb-1 font-mono text-xs text-slate-500">{f.taskId}</p>
                <ArtifactFailure state={f.state} />
              </div>
            ))}
            {review.packages.length === 0 && review.failures.length === 0 && (
              <StateNotice kind="empty" title="No finished drafts with result files">
                Checked {PINNED_REVIEW_TASKS.length} declared draft package{PINNED_REVIEW_TASKS.length === 1 ? "" : "s"}. Other finished tasks keep their result files on their task page.
              </StateNotice>
            )}
            {review.packages.map((p) => (
              <article key={p.taskId} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="line-clamp-2 text-sm font-medium text-slate-100">{p.task.title ?? "Untitled task"}</h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      owner {p.task.assignee ?? "unassigned"} ·{" "}
                      <Link href={`/tasks/${p.taskId}`} className="font-mono text-teal-300 hover:text-teal-200">
                        {p.taskId}
                      </Link>{" "}
                      · read {formatTime(p.observedAt)}
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
