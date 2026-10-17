import type { Metadata } from "next";
import { DisabledAction, McPage, PageHeader, Section, SourceNote, StateNotice } from "@/components/mc/ui";
import { BridgeNotice, TaskStateChip, VerificationChip, taskSource } from "@/components/mc/task-views";
import { AutoRefresh } from "@/components/mc/auto-refresh";
import { formatTime } from "@/lib/mission-control/bridge-client.mjs";
import { readCapabilities, readTask } from "@/lib/mission-control/bridge";

export const metadata: Metadata = { title: "Task · Mission Control" };
export const dynamic = "force-dynamic";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-200">{children}</dd>
    </div>
  );
}

const text = (v: unknown) => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : "—");

const TERMINAL = new Set(["failed", "completed", "completed_unverified", "archived"]);

export default async function TaskDetailPage({ params, searchParams = {} }: { params: { id: string }; searchParams?: { submitted?: string; deduplicated?: string } }) {
  const [detail, caps] = await Promise.all([readTask(params.id), readCapabilities()]);
  const unsupported = caps.ok ? caps.unsupported : {};

  if (!detail.ok) {
    return (
      <McPage>
        <PageHeader eyebrow="Task" title={params.id.slice(0, 40)} description="Task detail is read from the Hermes task board through the bridge." />
        <SourceNote source={taskSource(detail)} />
        <BridgeNotice failure={detail} />
        <AutoRefresh active={detail.state === "offline" || detail.state === "hermes_unavailable"} intervalMs={15000} />
      </McPage>
    );
  }
  const { task, runs, events, latestSummary } = detail;

  return (
    <McPage>
      <PageHeader eyebrow="Task" title={task.title || "Untitled task"} description={`${task.id} · owner ${task.assignee || "unassigned"}`} />
      <SourceNote source={taskSource(detail)} />
      {searchParams.submitted === "1" && (
        <StateNotice kind="info" title={searchParams.deduplicated === "1" ? "Already submitted: this is the existing task for that submission" : "Accepted by the Mac bridge"}>
          Acceptance means the task is on the Hermes board. It is not finished until the status below says so from a recorded run.
        </StateNotice>
      )}
      <AutoRefresh active={!TERMINAL.has(task.ui.state)} />

      <Section title="Status" description="Native kanban status and the bridge's verified state are separate facts.">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <TaskStateChip task={task} />
            <VerificationChip task={task} />
          </div>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Native status">{task.ui.native_status ?? task.status}</Field>
            <Field label="Bridge reasoning">{task.ui.reason || "—"}</Field>
            <Field label="Latest run outcome">{task.ui.latest_run_outcome ?? "—"}</Field>
            <Field label="Runtime heartbeat">Unavailable (not exposed by the native CLI)</Field>
            <Field label="Created">{formatTime(task.created_at)}</Field>
            <Field label="Observed by bridge">{formatTime(detail.observedAt)}</Field>
          </dl>
        </div>
      </Section>

      <Section title="Result" description="Latest summary recorded on the task board.">
        {latestSummary ? (
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{latestSummary}</p>
        ) : (
          <StateNotice kind={task.ui.state === "failed" ? "error" : "empty"} title={task.ui.state === "failed" ? "Task failed without a result summary" : TERMINAL.has(task.ui.state) ? "No result summary recorded" : "No result yet"}>
            {task.ui.state === "failed" ? "See the run error below. To try again, submit a new task from Tasks; failed runs are never replayed automatically." : null}
          </StateNotice>
        )}
      </Section>

      {task.body && (
        <Section title="Assignment">
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">{text(task.body)}</p>
        </Section>
      )}

      <Section title="Runs" description="Native run receipts. A completion is verified only when a profile ran it for a non-zero duration.">
        {runs.length === 0 ? (
          <StateNotice kind="empty" title="No runs recorded" />
        ) : (
          <ul className="space-y-2">
            {runs.map((r, i) => (
              <li key={`${text(r.id)}-${i}`} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs leading-5 text-slate-400">
                <p className="text-sm text-slate-200">
                  {text(r.outcome ?? r.status)} · profile {text(r.profile)}
                </p>
                <p>
                  started {formatTime(r.started_at)} · ended {r.ended_at ? formatTime(r.ended_at) : "open"}
                </p>
                {r.summary && <p className="mt-1 whitespace-pre-wrap text-slate-300">{text(r.summary)}</p>}
                {r.error && <p className="mt-1 whitespace-pre-wrap text-rose-300">{text(r.error)}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Events" description={`${events.length} event(s) recorded.`}>
        {events.length === 0 ? (
          <StateNotice kind="empty" title="No events recorded" />
        ) : (
          <ul className="space-y-1 text-xs leading-5 text-slate-400">
            {events.slice(-20).map((e, i) => (
              <li key={i} className="break-words font-mono">
                {Object.entries(e)
                  .slice(0, 6)
                  .map(([k, v]) => `${k}=${String(v).slice(0, 120)}`)
                  .join(" · ")}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Actions" description="No action on this page submits or executes work.">
        {task.ui.state === "failed" && (
          <div className="mb-3">
            <StateNotice kind="error" title="Recovery: submit a new task" href="/tasks#assign" hrefLabel="New assignment">
              Retry is not exposed by the bridge, so this failed task is never re-run automatically. A new submission creates a separate task with its own receipts.
            </StateNotice>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <DisabledAction label="Retry task" reason={unsupported["task.retry"] ?? "Retry is not exposed by the bridge."} />
          <DisabledAction label="Cancel task" reason={unsupported["task.cancel"] ?? "Cancel is not exposed by the bridge."} />
        </div>
      </Section>
    </McPage>
  );
}
