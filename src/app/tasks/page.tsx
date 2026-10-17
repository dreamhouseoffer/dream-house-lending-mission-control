import type { Metadata } from "next";
import { FilterLinks, McPage, ModuleLink, PageHeader, Section, SourceNote, StateNotice, StatusChip } from "@/components/mc/ui";
import { BridgeNotice, TaskList, taskSource } from "@/components/mc/task-views";
import { TaskCreateForm } from "@/components/mc/task-create-form";
import { TASK_STATUSES, capability, parseTaskStatus } from "@/lib/mission-control/capabilities.mjs";
import { filterTasks } from "@/lib/mission-control/bridge-client.mjs";
import { SAFE_CAPABILITY_COPY, createCapability, publicTemplates } from "@/lib/mission-control/task-submit.mjs";
import { readCapabilities, readTasks } from "@/lib/mission-control/bridge";

export const metadata: Metadata = { title: "Tasks · Mission Control" };
export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: { searchParams: { status?: string; q?: string } }) {
  const status = parseTaskStatus(searchParams.status);
  const statusDef = TASK_STATUSES.find((s) => s.id === status);
  const q = typeof searchParams.q === "string" ? searchParams.q.slice(0, 100) : "";
  const [list, caps] = await Promise.all([readTasks(), readCapabilities()]);
  // Creation is gated by the bridge's own capabilities (POST allowed, not read-only, safe templates advertised);
  // statically unavailable when the bridge is unconfigured. The POST route re-checks all of this server-side.
  const create = caps.ok ? createCapability(caps) : caps.state === "not_configured" ? { ...capability("task.create"), templates: [] } : createCapability(null);
  const shown = list.ok ? filterTasks(list.tasks, { status, q }) : [];

  return (
    <McPage>
      <PageHeader
        eyebrow="Work"
        title="Tasks"
        description="Assignments to Hermes with persistent identity, owner, status, progress and result. Each lifecycle state is distinct."
      />
      <SourceNote source={taskSource(list)} />

      <Section id="assign" title="New assignment" description="Submit a safe, pre-approved task to Hermes on the Mac. Status and results below come only from the Hermes board.">
        <div className="space-y-3">
          <p className="text-xs leading-5 text-slate-400">{SAFE_CAPABILITY_COPY}</p>
          <TaskCreateForm enabled={create.enabled} reason={create.reason} templates={publicTemplates(create.templates)} />
        </div>
      </Section>

      <Section title="Task list" description="Filter by lifecycle status or search by id, title, owner or description.">
        <div className="space-y-4">
          <FilterLinks basePath="/tasks" param="status" active={status} options={[{ id: "all", label: "All" }, ...TASK_STATUSES]} extra={q ? { q } : undefined} />
          <form action="/tasks" method="get" role="search" className="flex flex-wrap gap-2">
            {status !== "all" && <input type="hidden" name="status" value={status} />}
            <label htmlFor="task-q" className="sr-only">
              Search tasks
            </label>
            <input
              id="task-q"
              name="q"
              defaultValue={q}
              maxLength={100}
              placeholder="Search tasks"
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-teal-500 focus:outline-none"
            />
            <button type="submit" className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-500">
              Search
            </button>
          </form>
          {list.ok ? (
            <>
              <p className="text-xs text-slate-500">
                Showing {shown.length} of {list.tasks.length} task(s) read from the Hermes board. Native status and the bridge&apos;s verified state are shown
                separately; runtime heartbeat is not exposed, so running work is never shown as verified-alive.
              </p>
              {status === "canceled" && (
                <StateNotice kind="info" title="Native kanban has no cancel state">
                  Archived tasks are listed under All and are not treated as canceled.
                </StateNotice>
              )}
              <TaskList tasks={shown} empty={statusDef ? `No ${statusDef.label.toLowerCase()} tasks match` : "No tasks match"} />
            </>
          ) : (
            <BridgeNotice failure={list} subject={statusDef ? `${statusDef.label} tasks` : "Tasks"} />
          )}
          <div className="flex flex-wrap gap-1.5" aria-label="Status legend">
            {TASK_STATUSES.map((s) => (
              <StatusChip key={s.id} tone={s.tone as "neutral"}>
                {s.label}
              </StatusChip>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Retained modules">
        <ModuleLink
          href="/tasks/legacy"
          title="Mission board (legacy)"
          description="Previous browser-local board. Its cards live only in this browser and never reached Hermes."
          badge="Legacy"
        />
      </Section>
    </McPage>
  );
}
