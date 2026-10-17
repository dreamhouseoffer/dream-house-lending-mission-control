import type { Metadata } from "next";
import { McPage, ModuleLink, PageHeader, Section, SourceChip, StateNotice } from "@/components/mc/ui";
import { SOURCES } from "@/lib/mission-control/capabilities.mjs";

export const metadata: Metadata = { title: "Settings · Mission Control" };

export default function SettingsPage() {
  const sources = Object.values(SOURCES);

  return (
    <McPage>
      <PageHeader
        eyebrow="System"
        title="Settings & activity"
        description="Connection health, available configuration, action history and real usage. Unavailable values are labeled with what enables them."
      />

      <Section id="connections" title="Connections" description="Readiness is declared for this release; nothing here is reported as live.">
        <ul className="divide-y divide-slate-800">
          {sources.map((s) => (
            <li key={s.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-100">{s.label}</p>
                <p className="text-xs leading-5 text-slate-400">{s.detail}</p>
                {"enables" in s && s.state !== "live" && <p className="text-xs leading-5 text-slate-500">{s.enables}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <SourceChip state={s.state} />
                {"href" in s && s.href && (
                  <a href={s.href} className="text-xs font-medium text-teal-300 hover:text-teal-200">
                    Open
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Section>

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
