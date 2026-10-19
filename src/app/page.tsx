import type { Metadata } from "next";
import agentStatus from "@/data/agent-status.json";
import { McPage, ModuleLink, PageHeader, Section, SourceNote, StatTile, StateNotice } from "@/components/mc/ui";
import { BridgeNotice, TaskList, taskSource } from "@/components/mc/task-views";
import { TaskCreateForm } from "@/components/mc/task-create-form";
import { SOURCES, capability, displayTotal, resolveViewState, scheduleRows } from "@/lib/mission-control/capabilities.mjs";
import { countByBucket, formatTime, lastTouched } from "@/lib/mission-control/bridge-client.mjs";
import { readCapabilities, readTasks } from "@/lib/mission-control/bridge";
import { createCapability, publicTemplates } from "@/lib/mission-control/task-submit.mjs";

export const metadata: Metadata = { title: "Home · Mission Control" };

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [list, caps] = await Promise.all([readTasks(), readCapabilities()]);
  const tasks = list.ok ? list.tasks : null;
  const taskSrc = taskSource(list);
  // Unconfigured/offline/failed reads resolve to not_connected/offline/unverified, so every total below is "Unknown".
  const taskState = list.ok
    ? resolveViewState({ source: { state: "observed" }, items: list.tasks, observedAt: list.observedAt })
    : resolveViewState({ source: taskSrc });
  const counts = tasks ? countByBucket(tasks) : null;
  const byRecent = (a: { id: string }, b: { id: string }) => lastTouched(b) - lastTouched(a);
  const active = tasks ? tasks.filter((t) => t.bucket === "running" || t.bucket === "queued").sort(byRecent).slice(0, 5) : [];
  const results = tasks ? tasks.filter((t) => t.bucket === "completed").sort(byRecent).slice(0, 5) : [];
  const failures = tasks ? tasks.filter((t) => t.bucket === "failed" || t.bucket === "blocked").sort(byRecent).slice(0, 5) : [];
  const taskHint = list.ok ? `Bridge read ${formatTime(list.observedAt)}` : taskSrc.state === "offline" ? "Bridge offline" : "Bridge not connected";
  const approvalState = resolveViewState({ source: SOURCES.approvals });
  const schedules = scheduleRows(agentStatus);
  const scheduleState = resolveViewState({ source: SOURCES.schedules, items: schedules });
  const erroring = schedules.filter((s) => s.status === "erroring");
  const assign = caps.ok ? createCapability(caps) : caps.state === "not_configured" ? { ...capability("task.create"), templates: [] } : createCapability(null);

  return (
    <McPage>
      <PageHeader
        eyebrow="Daily brief"
        title="Home"
        description="What needs attention, what is actually running, what finished, what failed and what to do next. Values that are not backed by a connected source are shown as Unknown, never as zero."
      />

      <Section title="Needs attention" description="Items that block real work or decisions.">
        <div className="space-y-3">
          {list.ok ? (
            <SourceNote source={taskSrc} />
          ) : (
            <BridgeNotice failure={list} subject="Task, agent and approval totals" />
          )}
          {counts && counts.failed + counts.blocked > 0 && (
            <StateNotice kind="error" title={`${counts.failed} failed and ${counts.blocked} blocked task(s) on the Hermes board`} href="/tasks?status=failed" hrefLabel="Review failed tasks" />
          )}
          <StateNotice kind="info" title="Finished drafts waiting for your review" href="/content#review" hrefLabel="Open Review">
            Result files (page drafts, training traces, briefs) open in Content. Drafts are not published.
          </StateNotice>
          <StateNotice kind="info" title="Milo cards: true state per card" href="/approvals#milo" hrefLabel="Open Milo cards">
            Approved means permission only; a card shows running only when a linked Hermes task has an open run.
          </StateNotice>
          {erroring.length > 0 && (
            <StateNotice kind="stale" title={`${erroring.length} schedule(s) recorded errors in the last snapshot`} href="/workflows?status=erroring" hrefLabel="Review schedules">
              Snapshot recorded {agentStatus.lastUpdated}. Not live telemetry.
            </StateNotice>
          )}
        </div>
      </Section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Active work" value={displayTotal(taskState, counts?.running)} hint={taskHint} href="/tasks?status=running" />
        <StatTile label="Awaiting approval" value={displayTotal(approvalState, undefined)} hint="Approval ledger not exposed by the bridge" href="/approvals" />
        <StatTile label="Failed tasks" value={displayTotal(taskState, counts?.failed)} hint={taskHint} href="/tasks?status=failed" />
        <StatTile label="Schedules (snapshot)" value={displayTotal(scheduleState, schedules.length)} hint={`Recorded ${agentStatus.lastUpdated}`} href="/workflows" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Active work" href="/tasks" hrefLabel="Tasks">
          {list.ok ? <TaskList tasks={active} empty="No running or queued tasks on the board" /> : <BridgeNotice failure={list} subject="Running and queued tasks" />}
        </Section>
        <Section title="Recent results" href="/briefs" hrefLabel="Brief archive">
          {list.ok ? <TaskList tasks={results} empty="No finished tasks on the board" /> : <BridgeNotice failure={list} subject="Task results" />}
        </Section>
        <Section title="Failures & blockers" href="/workflows" hrefLabel="Workflows">
          <div className="space-y-3">
            {list.ok ? <TaskList tasks={failures} empty="No failed or blocked tasks on the board" /> : <BridgeNotice failure={list} subject="Task failures" />}
            <SourceNote source={SOURCES.schedules} />
            <p className="text-sm text-slate-400">
              {erroring.length === 0
                ? `No schedule errors were recorded in the snapshot (${schedules.length} schedule(s), recorded ${agentStatus.lastUpdated}).`
                : erroring.map((s) => s.name).join(", ")}
            </p>
          </div>
        </Section>
        <Section title="Run a safe task" href="/tasks#assign" hrefLabel="All task options">
          <TaskCreateForm enabled={assign.enabled} reason={assign.reason} templates={publicTemplates(assign.templates)} idPrefix="home-assign" />
        </Section>
        <Section title="Next actions">
          <div className="space-y-2">
            <ModuleLink href="/tasks#assign" title="Submit a safe task" description={assign.enabled ? "Submit a safe pre-approved task. Free-form instructions are not available." : "Unavailable right now; the reason is shown on the Tasks page."} />
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
