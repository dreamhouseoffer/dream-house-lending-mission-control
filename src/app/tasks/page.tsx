import type { Metadata } from "next";
import { DisabledAction, FilterLinks, McPage, ModuleLink, PageHeader, Section, SourceNote, StateNotice, StatusChip } from "@/components/mc/ui";
import { SOURCES, TASK_STATUSES, capability, parseTaskStatus } from "@/lib/mission-control/capabilities.mjs";

export const metadata: Metadata = { title: "Tasks · Mission Control" };

export default function TasksPage({ searchParams }: { searchParams: { status?: string } }) {
  const status = parseTaskStatus(searchParams.status);
  const statusDef = TASK_STATUSES.find((s) => s.id === status);
  const create = capability("task.create");

  return (
    <McPage>
      <PageHeader
        eyebrow="Work"
        title="Tasks"
        description="Assignments to Hermes with persistent identity, owner, status, progress and result. Each lifecycle state is distinct."
      />
      <SourceNote source={SOURCES.tasks} />

      <Section id="assign" title="New assignment" description="Describe the work for Hermes. Nothing is saved or sent until the bridge exists.">
        <form className="space-y-3" aria-describedby="assign-reason">
          <label htmlFor="assignment" className="sr-only">
            Assignment
          </label>
          <textarea
            id="assignment"
            name="assignment"
            rows={4}
            disabled={!create.enabled}
            placeholder="e.g. Summarize yesterday's pipeline changes into a three-line note"
            className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-teal-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
          <div id="assign-reason">
            <DisabledAction label="Send to Hermes" reason={create.reason ?? ""} />
          </div>
        </form>
      </Section>

      <Section title="Task list" description="Filter by lifecycle status.">
        <div className="space-y-4">
          <FilterLinks basePath="/tasks" param="status" active={status} options={[{ id: "all", label: "All" }, ...TASK_STATUSES]} />
          <StateNotice
            kind="not_connected"
            title={statusDef ? `${statusDef.label} tasks cannot be listed` : "Tasks cannot be listed"}
            enables={SOURCES.tasks.enables}
          >
            The dashboard does not keep a local task list. Tasks will appear here from the Hermes task board once the bridge
            is connected, so nothing shown here is simulated.
          </StateNotice>
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
