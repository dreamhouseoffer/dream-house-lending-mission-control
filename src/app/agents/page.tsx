import type { Metadata } from "next";
import Link from "next/link";
import { DisabledAction, McPage, ModuleLink, PageHeader, Section, SourceNote, StateNotice, StatusChip } from "@/components/mc/ui";
import { BridgeNotice } from "@/components/mc/task-views";
import { readTasks } from "@/lib/mission-control/bridge";
import { readOperations } from "@/lib/mission-control/operations";
import { agentView, operationsSource } from "@/lib/mission-control/operations-client.mjs";

export const metadata: Metadata = { title: "Agents · Mission Control" };
export const dynamic = "force-dynamic";

const UNSUPPORTED = "The bridge exposes profiles read-only. Chat and profile edits are not supported from this dashboard.";

function TaskCount({ tasks }: { tasks: { open: number; total: number } | null }) {
  if (!tasks) return <span className="text-slate-500">Assignments unknown (task board not read)</span>;
  return (
    <span>
      {tasks.open} open · {tasks.total} total native task(s)
    </span>
  );
}

export default async function AgentsPage() {
  const [ops, list] = await Promise.all([readOperations(), readTasks()]);
  const source = operationsSource(ops, "profiles");
  const view = ops.ok && ops.profiles ? agentView(ops.profiles, list.ok ? list.tasks : null) : null;

  return (
    <McPage>
      <PageHeader
        eyebrow="Work"
        title="Agents"
        description="Hermes profiles configured on the Mac, with their native task assignments. Configuration is not liveness: no heartbeat is reported, so no agent is shown as online."
      />
      <SourceNote source={source} />

      <Section title="Configured profiles" description="Names and roles exactly as recorded in the Hermes profile configuration.">
        {!ops.ok ? (
          <BridgeNotice failure={ops} subject="Agent profiles" />
        ) : !view ? (
          <StateNotice kind="stale" title="Profile source unavailable">
            The bridge answered but reports the profile source unavailable. Agents are unknown, not zero.
          </StateNotice>
        ) : view.agents.length === 0 ? (
          <StateNotice kind="empty" title="No configured profiles reported" />
        ) : (
          <ul className="space-y-2">
            {view.agents.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-100">{a.name}</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">
                    <span className="font-mono">{a.id}</span> · role {a.role ?? "unknown (not recorded)"}
                  </p>
                  <p className="text-xs leading-5 text-slate-400">
                    <TaskCount tasks={a.tasks} />
                    {a.tasks && a.tasks.total > 0 && (
                      <>
                        {" · "}
                        <Link href={`/tasks?q=${encodeURIComponent(a.id)}`} className="font-medium text-teal-300 hover:text-teal-200">
                          View tasks
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {a.configured === null ? (
                    <StatusChip>Configuration unknown</StatusChip>
                  ) : (
                    <StatusChip tone={a.configured ? "info" : "warn"}>{a.configured ? "Configured" : "Not fully configured"}</StatusChip>
                  )}
                  <StatusChip>Activity not verified</StatusChip>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {view && (
        <Section title="Control lanes & other assignees" description="Task owners on the Hermes board that are not agent profiles.">
          <ul className="space-y-2">
            {view.lanes.map((l) => (
              <li key={l.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-100">
                  <span className="font-mono">{l.id}</span>
                  <StatusChip tone="accent">Control lane</StatusChip>
                </p>
                <p className="mt-0.5 text-xs leading-5 text-slate-400">{l.detail}</p>
                <p className="text-xs leading-5 text-slate-500">
                  <TaskCount tasks={l.tasks} />
                </p>
              </li>
            ))}
            {view.unmatched.map((id) => (
              <li key={id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-100">
                  <span className="font-mono">{id}</span>
                  <StatusChip tone="warn">No matching profile</StatusChip>
                </p>
                <p className="mt-0.5 text-xs leading-5 text-slate-400">Assigned native tasks, but no configured profile with this id was reported.</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {!list.ok && ops.ok && (
        <StateNotice kind="info" title="Task assignments not shown">
          The Hermes task board could not be read, so per-agent assignment counts are unknown.
        </StateNotice>
      )}

      <Section title="Actions">
        <div className="grid gap-4 sm:grid-cols-2">
          <DisabledAction label="Chat with agent" reason={UNSUPPORTED} />
          <DisabledAction label="Edit profile" reason={UNSUPPORTED} />
        </div>
      </Section>

      <Section title="Related modules">
        <div className="space-y-2">
          <ModuleLink href="/team" title="Team roster" description="Retained roster page. Describes intended roles; not runtime activity." badge="Legacy" />
          <ModuleLink href="/headquarters" title="Headquarters" description="Systems map and readiness of known agents and services." />
          <ModuleLink href="/ask" title="Ask Hermes" description="Retained question-and-answer module." />
        </div>
      </Section>
    </McPage>
  );
}
