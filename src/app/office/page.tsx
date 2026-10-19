import type { Metadata } from "next";
import Link from "next/link";
import { McPage, PageHeader, SourceNote, StateNotice } from "@/components/mc/ui";
import { BridgeNotice, taskSource } from "@/components/mc/task-views";
import { AutoRefresh } from "@/components/mc/auto-refresh";
import { OfficeFloor, type OfficeAgent, type OfficeHuman, type OfficeJob } from "@/components/office/office-floor";
import { readTask, readTasks } from "@/lib/mission-control/bridge";
import { readOperations } from "@/lib/mission-control/operations";
import { operationsSource } from "@/lib/mission-control/operations-client.mjs";
import { ACTIVITY_SOURCE, HEARTBEAT_MAX_AGE_MS, activityCandidates, officeRoster } from "@/lib/mission-control/office-model.mjs";

export const metadata: Metadata = { title: "Office · Mission Control" };
export const dynamic = "force-dynamic";

// Team office: every person comes from a real source (Hermes profiles, Hermes schedules, the fixed human team).
// Activity is never inferred from the list: only a bounded set of task-detail reads (native runs + heartbeat events)
// can put an agent at the keyboard, and the desk stops typing in the browser once that heartbeat ages out.
export default async function OfficePage() {
  const [ops, list] = await Promise.all([readOperations(), readTasks()]);
  const ids = activityCandidates(list, ops.ok ? ops.profiles : null);
  const reads = await Promise.all(ids.map((id) => readTask(id)));
  const details = Object.fromEntries(ids.map((id, i) => [id, reads[i]]));
  const now = Date.now();
  const roster = officeRoster(ops, list, now, details);

  return (
    <McPage>
      <PageHeader
        eyebrow="Team"
        title="Office"
        description="Who is on the team and what they are actually doing. Click a desk or a name for status, task, latest result and schedule."
        actions={
          <Link href="/agents" className="inline-flex min-h-9 items-center rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500">
            Agent list
          </Link>
        }
      />
      <div className="grid gap-2 md:grid-cols-2">
        <SourceNote source={operationsSource(ops, "profiles")} />
        <SourceNote source={taskSource(list)} />
      </div>
      {!ops.ok && <BridgeNotice failure={ops} subject="Agents and schedules" />}
      {ops.ok && list.ok === false && (
        <StateNotice kind="stale" title="Task board not read">
          Agent activity is unknown, so nobody is shown typing.
        </StateNotice>
      )}
      {roster.excluded.length > 0 && (
        <p className="text-xs text-slate-500">Not shown as team members: {roster.excluded.join(", ")} (test profile or execution lane).</p>
      )}
      <p className="text-xs text-slate-500">
        Activity source: {ACTIVITY_SOURCE}. Typing needs a native heartbeat on the agent&apos;s own open run within the last{" "}
        {HEARTBEAT_MAX_AGE_MS / 1000}s; otherwise the desk shows Unknown. {ids.length} task detail{ids.length === 1 ? "" : "s"} read for this view.
      </p>
      <OfficeFloor serverNow={now} agents={roster.agents as OfficeAgent[]} jobs={roster.scheduled as OfficeJob[] | null} humans={roster.humans as OfficeHuman[]} />
      <AutoRefresh active={ops.ok} intervalMs={30000} label="Re-reading team status from the bridge every 30s." />
    </McPage>
  );
}
