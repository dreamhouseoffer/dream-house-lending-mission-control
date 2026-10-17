import type { Metadata } from "next";
import agentStatus from "@/data/agent-status.json";
import { FilterLinks, McPage, ModuleLink, PageHeader, Section, SourceNote, StateNotice, StatusChip } from "@/components/mc/ui";
import { SCHEDULE_FILTERS, SOURCES, filterSchedules, scheduleRows } from "@/lib/mission-control/capabilities.mjs";

export const metadata: Metadata = { title: "Workflows · Mission Control" };

const STATUS_TONE = { erroring: "bad", never_run: "neutral", ran: "info", disabled: "neutral" } as const;
const STATUS_LABEL = { erroring: "Erroring", never_run: "Never run", ran: "Ran", disabled: "Disabled" } as const;

function fmt(value: string | null) {
  if (!value) return "—";
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC" : value;
}

export default function WorkflowsPage({ searchParams }: { searchParams: { status?: string; q?: string } }) {
  const all = scheduleRows(agentStatus);
  const status = SCHEDULE_FILTERS.some((f) => f.id === searchParams.status) ? (searchParams.status as string) : "all";
  const q = typeof searchParams.q === "string" ? searchParams.q.slice(0, 100) : "";
  const rows = filterSchedules(all, { status, q });

  return (
    <McPage>
      <PageHeader
        eyebrow="Automation"
        title="Workflows"
        description="Schedules with purpose, timezone, last attempt, next due and outcome. Missed runs and Mac outages require live telemetry."
      />
      <SourceNote source={SOURCES.schedules} />
      <StateNotice kind="stale" title={`Snapshot recorded ${agentStatus.lastUpdated}`}>
        This list is the last committed snapshot, not live state. Missed runs, expired connections and Mac outage are not
        detected until the bridge reports schedules.
      </StateNotice>

      <Section title="Schedules" description={`${all.length} schedule(s) in snapshot`}>
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <FilterLinks basePath="/workflows" param="status" active={status} options={SCHEDULE_FILTERS} extra={q ? { q } : undefined} />
            <form method="get" action="/workflows" className="flex gap-2" role="search">
              {status !== "all" && <input type="hidden" name="status" value={status} />}
              <label htmlFor="wf-q" className="sr-only">
                Search schedules
              </label>
              <input
                id="wf-q"
                name="q"
                defaultValue={q}
                placeholder="Search by name"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-teal-500 focus:outline-none sm:w-56"
              />
              <button type="submit" className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500">
                Search
              </button>
            </form>
          </div>

          {rows.length === 0 ? (
            <StateNotice kind="empty" title={all.length === 0 ? "No schedules in snapshot" : "No schedules match this filter"} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs text-slate-500">
                  <tr className="border-b border-slate-800">
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Schedule</th>
                    <th className="py-2 pr-3 font-medium">Last run</th>
                    <th className="py-2 pr-3 font-medium">Next due</th>
                    <th className="py-2 font-medium">Last error</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-800/60 align-top">
                      <td className="py-2.5 pr-3 font-medium text-slate-100">{r.name}</td>
                      <td className="py-2.5 pr-3">
                        <StatusChip tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE]}>{STATUS_LABEL[r.status as keyof typeof STATUS_LABEL]}</StatusChip>
                      </td>
                      <td className="py-2.5 pr-3 text-slate-300">
                        <code className="text-xs">{r.schedule ?? "—"}</code>
                        <p className="text-xs text-slate-500">{r.tz ?? "Timezone unknown"}</p>
                      </td>
                      <td className="py-2.5 pr-3 text-slate-400">
                        {fmt(r.lastRunAt)}
                        <p className="text-xs text-slate-500">Recorded status: {r.lastStatus}</p>
                      </td>
                      <td className="py-2.5 pr-3 text-slate-400">{fmt(r.nextRunAt)}</td>
                      <td className="py-2.5 text-xs text-slate-400">{r.lastError ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
