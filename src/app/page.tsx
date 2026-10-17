import type { Metadata } from "next";
import agentStatus from "@/data/agent-status.json";
import { McPage, ModuleLink, PageHeader, Section, SourceNote, StatTile, StateNotice } from "@/components/mc/ui";
import { SOURCES, capability, displayTotal, resolveViewState, scheduleRows } from "@/lib/mission-control/capabilities.mjs";

export const metadata: Metadata = { title: "Home · Mission Control" };

export default function HomePage() {
  const taskState = resolveViewState({ source: SOURCES.tasks });
  const approvalState = resolveViewState({ source: SOURCES.approvals });
  const schedules = scheduleRows(agentStatus);
  const scheduleState = resolveViewState({ source: SOURCES.schedules, items: schedules });
  const erroring = schedules.filter((s) => s.status === "erroring");
  const assign = capability("task.create");

  return (
    <McPage>
      <PageHeader
        eyebrow="Daily brief"
        title="Home"
        description="What needs attention, what is actually running, what finished, what failed and what to do next. Values that are not backed by a connected source are shown as Unknown, never as zero."
      />

      <Section title="Needs attention" description="Items that block real work or decisions.">
        <div className="space-y-3">
          <StateNotice
            kind="not_connected"
            title="Mac execution bridge is not connected"
            enables={SOURCES.bridge.enables}
            href="/settings#connections"
            hrefLabel="Connection setup"
          >
            Hermes on the Mac cannot receive assignments or report progress to this dashboard yet. Task, agent and approval
            totals below are unknown until it is connected.
          </StateNotice>
          <StateNotice kind="info" title="Milo approvals are reviewed in the retained module" href="/milo-approvals" hrefLabel="Open Milo approvals">
            Pending Airtable approvals are not summarized here; open the module to see the current queue.
          </StateNotice>
          {erroring.length > 0 && (
            <StateNotice kind="stale" title={`${erroring.length} schedule(s) recorded errors in the last snapshot`} href="/workflows?status=erroring" hrefLabel="Review schedules">
              Snapshot recorded {agentStatus.lastUpdated}. Not live telemetry.
            </StateNotice>
          )}
        </div>
      </Section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Active work" value={displayTotal(taskState, undefined)} hint="Bridge not connected" href="/tasks?status=running" />
        <StatTile label="Awaiting approval" value={displayTotal(approvalState, undefined)} hint="Bridge not connected" href="/approvals" />
        <StatTile label="Failed tasks" value={displayTotal(taskState, undefined)} hint="Bridge not connected" href="/tasks?status=failed" />
        <StatTile label="Schedules (snapshot)" value={displayTotal(scheduleState, schedules.length)} hint={`Recorded ${agentStatus.lastUpdated}`} href="/workflows" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Active work" href="/tasks" hrefLabel="Tasks">
          <StateNotice kind="not_connected" title="No task source connected" enables={SOURCES.tasks.enables}>
            Running and queued tasks come from the Hermes task board. Nothing is listed because nothing can be verified.
          </StateNotice>
        </Section>
        <Section title="Recent results" href="/briefs" hrefLabel="Brief archive">
          <StateNotice kind="not_connected" title="Task results unavailable" enables={SOURCES.tasks.enables}>
            Finished task results will open from here and from task details. The retained daily brief archive is available now.
          </StateNotice>
        </Section>
        <Section title="Failures & blockers" href="/workflows" hrefLabel="Workflows">
          <div className="space-y-3">
            <StateNotice kind="not_connected" title="Task failures unknown" enables={SOURCES.tasks.enables} />
            <SourceNote source={SOURCES.schedules} />
            <p className="text-sm text-slate-400">
              {erroring.length === 0
                ? `No schedule errors were recorded in the snapshot (${schedules.length} schedule(s), recorded ${agentStatus.lastUpdated}).`
                : erroring.map((s) => s.name).join(", ")}
            </p>
          </div>
        </Section>
        <Section title="Next actions">
          <div className="space-y-2">
            <ModuleLink href="/tasks#assign" title="Draft an assignment" description={assign.enabled ? "Send work to Hermes." : "Composer is visible; sending is disabled until the bridge connects."} />
            <ModuleLink href="/pipeline" title="Check the loan pipeline" description="Retained Airtable-backed pipeline module." />
            <ModuleLink href="/ask" title="Ask Hermes" description="Retained question-and-answer module." />
            <ModuleLink href="/headquarters" title="Review Headquarters inventory" description="Private systems map and readiness snapshot." />
            <ModuleLink href="/today" title="Legacy Today" description="Previous browser-local Today page, kept for reference." badge="Legacy" />
          </div>
        </Section>
      </div>
    </McPage>
  );
}
