import type { Metadata } from "next";
import agentStatus from "@/data/agent-status.json";
import { DisabledAction, FilterLinks, McPage, ModuleLink, PageHeader, Section, SourceNote, StateNotice, StatusChip } from "@/components/mc/ui";
import { BridgeNotice } from "@/components/mc/task-views";
import { SCHEDULE_FILTERS, SOURCES, filterSchedules, scheduleRows } from "@/lib/mission-control/capabilities.mjs";
import { formatTime } from "@/lib/mission-control/bridge-client.mjs";
import { liveScheduleRows, operationsSource } from "@/lib/mission-control/operations-client.mjs";
import { readOperations } from "@/lib/mission-control/operations";

export const metadata: Metadata = { title: "Workflows · Mission Control" };
export const dynamic = "force-dynamic";

const STATUS_TONE = { erroring: "bad", never_run: "neutral", ran: "info", disabled: "neutral", unknown: "warn" } as const;
const LIVE_LABEL = {
  erroring: "Scheduler reports error",
  never_run: "No run recorded",
  ran: "Run recorded",
  disabled: "Disabled",
  unknown: "Enabled/error state not reported",
} as const;
const SNAPSHOT_LABEL = { erroring: "Erroring", never_run: "Never run", ran: "Ran", disabled: "Disabled", unknown: "Unknown" } as const;
// Live rows can be "unknown" when the scheduler did not report enabled/error state; the snapshot never is.
const LIVE_FILTERS = [...SCHEDULE_FILTERS, { id: "unknown", label: "Unknown" }];

const UNSUPPORTED = "The bridge exposes schedules read-only. Pausing, resuming, editing or triggering a cron job is not supported from this dashboard.";

type Row = { id: string; name: string; status: string; schedule: string | null; lastRunAt: string | null; lastStatus: string | null; nextRunAt: string | null };
type Status = keyof typeof STATUS_TONE;

function ScheduleTable({ rows, labels, extra }: { rows: Row[]; labels: Record<Status, string>; extra?: (r: Row) => React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-xs text-slate-500">
          <tr className="border-b border-slate-800">
            <th className="py-2 pr-3 font-medium">Name</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 pr-3 font-medium">Schedule</th>
            <th className="py-2 pr-3 font-medium">Last run</th>
            <th className="py-2 font-medium">Next due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-800/60 align-top">
              <td className="py-2.5 pr-3 font-medium text-slate-100">
                {r.name}
                <p className="font-mono text-xs font-normal text-slate-500">{r.id}</p>
              </td>
              <td className="py-2.5 pr-3">
                <StatusChip tone={STATUS_TONE[r.status as Status]}>{labels[r.status as Status]}</StatusChip>
              </td>
              <td className="py-2.5 pr-3 text-slate-300">
                <code className="text-xs">{r.schedule ?? "—"}</code>
                {extra?.(r)}
              </td>
              <td className="py-2.5 pr-3 text-slate-400">
                {formatTime(r.lastRunAt)}
                <p className="text-xs text-slate-500">Scheduler receipt: {r.lastStatus ?? "unknown"}</p>
              </td>
              <td className="py-2.5 text-slate-400">{formatTime(r.nextRunAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function WorkflowsPage({ searchParams }: { searchParams: { status?: string; q?: string } }) {
  const ops = await readOperations();
  const status = LIVE_FILTERS.some((f) => f.id === searchParams.status) ? (searchParams.status as string) : "all";
  const q = typeof searchParams.q === "string" ? searchParams.q.slice(0, 100) : "";
  const live = ops.ok && ops.schedules ? liveScheduleRows(ops.schedules) : null;
  const rows = live ? filterSchedules(live, { status, q }) : [];
  // The committed snapshot is shown only as a labeled fallback when the scheduler could not be read.
  const snapshot = live ? [] : scheduleRows(agentStatus);

  return (
    <McPage>
      <PageHeader
        eyebrow="Automation"
        title="Workflows"
        description="Hermes cron jobs with their schedule, enabled state and the scheduler's own last/next run receipt. A recorded OK means the job ran, not that its business output succeeded."
      />
      <SourceNote source={operationsSource(ops, "schedules")} />

      <Section title="Schedules" description={live ? `${live.length} schedule(s) reported by the Hermes scheduler` : "Schedule count unknown"}>
        <div className="space-y-4">
          {!ops.ok ? (
            <BridgeNotice failure={ops} subject="Schedules" />
          ) : !live ? (
            <StateNotice kind="stale" title="Schedule source unavailable">
              The bridge answered but reports the scheduler source unavailable. Schedules and their outcomes are unknown, not zero.
            </StateNotice>
          ) : (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <FilterLinks basePath="/workflows" param="status" active={status} options={LIVE_FILTERS} extra={q ? { q } : undefined} />
                <form method="get" action="/workflows" className="flex gap-2" role="search">
                  {status !== "all" && <input type="hidden" name="status" value={status} />}
                  <label htmlFor="wf-q" className="sr-only">
                    Search schedules
                  </label>
                  <input
                    id="wf-q"
                    name="q"
                    defaultValue={q}
                    maxLength={100}
                    placeholder="Search by name"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-teal-500 focus:outline-none sm:w-56"
                  />
                  <button type="submit" className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500">
                    Search
                  </button>
                </form>
              </div>
              {rows.length === 0 ? (
                <StateNotice kind="empty" title={live.length === 0 ? "The scheduler reports no cron jobs" : "No schedules match this filter"} />
              ) : (
                <ScheduleTable rows={rows} labels={LIVE_LABEL} />
              )}
              <p className="text-xs leading-5 text-slate-500">
                Last and next run come from the scheduler&apos;s own records. Missed runs while the Mac was off are not detected, and a recorded OK is
                not proof the job&apos;s output was delivered.
              </p>
            </>
          )}
        </div>
      </Section>

      {snapshot.length > 0 && (
        <Section title="Committed snapshot (fallback)" description={`Recorded ${agentStatus.lastUpdated}. Not live state.`}>
          <div className="space-y-3">
            <SourceNote source={SOURCES.schedules} />
            <ScheduleTable
              rows={snapshot}
              labels={SNAPSHOT_LABEL}
              extra={(r) => <p className="text-xs text-slate-500">{snapshot.find((s) => s.id === r.id)?.tz ?? "Timezone unknown"}</p>}
            />
          </div>
        </Section>
      )}

      <Section title="Actions">
        <DisabledAction label="Pause, resume or run now" reason={UNSUPPORTED} />
      </Section>

      <Section title="Related modules">
        <div className="space-y-2">
          <ModuleLink href="/briefs" title="Briefs" description="Retained daily brief archive." />
          <ModuleLink href="/calendar" title="Calendar" description="Retained browser-local calendar; not Hermes schedules." badge="Legacy" />
        </div>
      </Section>
    </McPage>
  );
}
