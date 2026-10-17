import type { Metadata } from "next";
import { McPage, ModuleLink, PageHeader, Section, SourceChip, StateNotice, type SourceDef } from "@/components/mc/ui";
import { taskSource } from "@/components/mc/task-views";
import { SOURCES } from "@/lib/mission-control/capabilities.mjs";
import { failureCopy, formatTime, observationState } from "@/lib/mission-control/bridge-client.mjs";
import { createCapability } from "@/lib/mission-control/task-submit.mjs";
import { readCapabilities, readTasks } from "@/lib/mission-control/bridge";
import { operationsSource } from "@/lib/mission-control/operations-client.mjs";
import { readOperations } from "@/lib/mission-control/operations";

export const metadata: Metadata = { title: "Settings · Mission Control" };
export const dynamic = "force-dynamic";

const FAILURE_STATE: Record<string, string> = { not_configured: "not_connected", unauthenticated: "not_connected", offline: "offline" };

// Sources replaced below by an actual observation from this request.
const OBSERVED_IDS = new Set(["bridge", "tasks", "agents", "schedules"]);

type Row = SourceDef & { id: string };

export default async function SettingsPage() {
  const [ops, caps, list] = await Promise.all([readOperations(), readCapabilities(), readTasks()]);

  const bridge: Row = ops.ok
    ? {
        id: "bridge",
        label: SOURCES.bridge.label,
        state: observationState(ops.observedAt),
        detail: `Signed read answered at ${formatTime(ops.observedAt)}. Reachability only; the endpoint and credentials are never shown here.`,
      }
    : { id: "bridge", label: SOURCES.bridge.label, state: FAILURE_STATE[ops.state] ?? "unverified", detail: failureCopy(ops.state).body, enables: SOURCES.bridge.enables };

  const create = createCapability(caps.ok ? caps : null);
  const capability: Row = caps.ok
    ? {
        id: "capabilities",
        label: "Bridge capabilities",
        state: "observed",
        detail: `${caps.readOnly ? "Bridge reports read-only mode." : "Bridge accepts writes."} Task submission ${create.enabled ? "enabled for pre-approved templates" : `disabled: ${create.reason}`}.`,
      }
    : { id: "capabilities", label: "Bridge capabilities", state: FAILURE_STATE[caps.state] ?? "unverified", detail: failureCopy(caps.state).body };

  const observed: Row[] = [
    bridge,
    capability,
    { id: "tasks", ...taskSource(list) },
    { id: "profiles", ...operationsSource(ops, "profiles") },
    { id: "schedules", ...operationsSource(ops, "schedules") },
  ];
  const declared: Row[] = Object.values(SOURCES).filter((s) => !OBSERVED_IDS.has(s.id));
  const unsupported = caps.ok ? Object.entries(caps.unsupported) : [];

  return (
    <McPage>
      <PageHeader
        eyebrow="System"
        title="Settings & activity"
        description="What this request actually observed through the bridge, what the bridge says it supports, and what remains unverified."
      />

      <Section id="connections" title="Connections" description="Observed on this page load. Read via bridge means an HTTP answer, not a runtime heartbeat.">
        <ConnectionList rows={observed} />
      </Section>

      <Section title="Declared modules" description="Not checked from this page; readiness is declared, never reported as live.">
        <ConnectionList rows={declared} />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Unsupported operations">
          {!caps.ok ? (
            <StateNotice kind="not_connected" title="Capabilities unknown">
              The bridge capability list could not be read, so every control action stays disabled.
            </StateNotice>
          ) : unsupported.length === 0 ? (
            <StateNotice kind="info" title="Bridge lists no unsupported operations">
              Only the operations the dashboard implements are offered; everything else stays disabled.
            </StateNotice>
          ) : (
            <ul className="space-y-1.5 text-xs leading-5 text-slate-400">
              {unsupported.map(([op, reason]) => (
                <li key={op}>
                  <span className="font-mono text-slate-300">{op}</span> — {reason}
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Not verified">
          <ul className="space-y-1.5 text-xs leading-5 text-slate-400">
            <li>Recovery after a Mac reboot is not checked by this dashboard.</li>
            <li>Budgets, spend limits and provider usage are not checked; no figures are shown.</li>
            <li>Agent liveness is not reported by the bridge; no heartbeat is shown.</li>
          </ul>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Usage & cost">
          <StateNotice kind="not_connected" title="No verified usage source" enables={SOURCES.usage.enables}>
            Committed cost snapshots in the repository are not treated as real spend, so no figures are shown.
          </StateNotice>
        </Section>
        <Section title="Action history">
          <StateNotice kind="not_connected" title="No action ledger connected" enables={SOURCES.bridge.enables}>
            Assignments, approvals and external actions will be recorded in the bridge ledger.
          </StateNotice>
        </Section>
      </div>

      <Section title="Access">
        <p className="text-sm leading-6 text-slate-400">
          This dashboard stays behind the existing owner PIN login. Credentials remain server-side; this page does not change
          authentication, permissions or credentials.
        </p>
      </Section>

      <Section title="Related modules">
        <div className="space-y-2">
          <ModuleLink href="/headquarters" title="Headquarters" description="Private systems inventory, map and readiness." />
          <ModuleLink href="/tools" title="Tools" description="Retained tools list." badge="Legacy" />
          <ModuleLink href="/finance" title="Finance" description="Retained CFO closeout module." />
        </div>
      </Section>
    </McPage>
  );
}

function ConnectionList({ rows }: { rows: Row[] }) {
  return (
    <ul className="divide-y divide-slate-800">
      {rows.map((s) => (
        <li key={s.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-100">{s.label}</p>
            <p className="text-xs leading-5 text-slate-400">{s.detail}</p>
            {s.enables && s.state !== "observed" && <p className="text-xs leading-5 text-slate-500">{s.enables}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SourceChip state={s.state} />
            {s.href && (
              <a href={s.href} className="text-xs font-medium text-teal-300 hover:text-teal-200">
                Open
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
