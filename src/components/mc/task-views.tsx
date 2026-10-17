// Server-safe task presentation shared by Home, /tasks and /tasks/[id]. Renders only checked bridge records.
import Link from "next/link";
import { StateNotice, StatusChip, type SourceDef, type Tone } from "@/components/mc/ui";
import { SOURCES } from "@/lib/mission-control/capabilities.mjs";
import { UI_STATE_LABELS, UI_STATE_TONES, failureCopy, formatTime, lastTouched, observationState } from "@/lib/mission-control/bridge-client.mjs";
import type { BridgeFailure, BridgeResult, BridgeTask } from "@/lib/mission-control/bridge";

const FAILURE_SOURCE_STATE: Record<string, string> = { not_configured: "not_connected", unauthenticated: "not_connected", offline: "offline" };

/** Source descriptor for the task board: "Read via bridge" only after a checked read, never "Live". */
export function taskSource(result: BridgeResult<{ observedAt: string }>, now = Date.now()): SourceDef {
  if (result.ok) {
    return {
      ...SOURCES.tasks,
      state: observationState(result.observedAt, now),
      detail: `Bridge read the Hermes task board at ${formatTime(result.observedAt)}. This is an HTTP observation, not a runtime heartbeat.`,
    };
  }
  return { ...SOURCES.tasks, state: FAILURE_SOURCE_STATE[result.state] ?? "unverified", detail: failureCopy(result.state).body };
}

export function BridgeNotice({ failure, subject }: { failure: BridgeFailure; subject?: string }) {
  const copy = failureCopy(failure.state);
  return (
    <StateNotice
      kind={copy.kind as "error"}
      title={copy.title}
      enables={failure.state === "not_configured" ? SOURCES.bridge.enables : undefined}
      href={failure.state === "not_configured" ? "/settings#connections" : undefined}
      hrefLabel="Connection setup"
    >
      {copy.body} {subject ? `${subject} are unknown, not zero.` : null}
    </StateNotice>
  );
}

export function TaskStateChip({ task }: { task: BridgeTask }) {
  const state = task.ui.state as keyof typeof UI_STATE_LABELS;
  return <StatusChip tone={(UI_STATE_TONES[state] ?? "neutral") as Tone}>{UI_STATE_LABELS[state] ?? "Unrecognised status"}</StatusChip>;
}

export function VerificationChip({ task }: { task: BridgeTask }) {
  if (task.bucket !== "completed") return null;
  return task.verified ? <StatusChip tone="ok">Verified run receipt</StatusChip> : <StatusChip tone="warn">Not verified</StatusChip>;
}

export function TaskRow({ task }: { task: BridgeTask }) {
  return (
    <li>
      <Link
        href={`/tasks/${task.id}`}
        className="group flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3 hover:border-slate-600 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-100 group-hover:text-white">{task.title || "Untitled task"}</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">
            <span className="font-mono">{task.id}</span> · owner {task.assignee || "unassigned"} · native {task.ui.native_status ?? task.status} · updated{" "}
            {lastTouched(task) ? formatTime(lastTouched(task)) : "—"}
          </p>
        </div>
        <span className="flex shrink-0 flex-wrap items-center gap-1.5">
          <TaskStateChip task={task} />
          <VerificationChip task={task} />
        </span>
      </Link>
    </li>
  );
}

export function TaskList({ tasks, empty }: { tasks: BridgeTask[]; empty: string }) {
  if (tasks.length === 0) return <StateNotice kind="empty" title={empty} />;
  return <ul className="space-y-2">{tasks.map((t) => <TaskRow key={t.id} task={t} />)}</ul>;
}
