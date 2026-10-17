import type { Metadata } from "next";
import { McPage, ModuleLink, PageHeader, Section, SourceNote, StateNotice } from "@/components/mc/ui";
import { SOURCES } from "@/lib/mission-control/capabilities.mjs";

export const metadata: Metadata = { title: "Agents · Mission Control" };

export default function AgentsPage() {
  return (
    <McPage>
      <PageHeader
        eyebrow="Work"
        title="Agents"
        description="Actual Hermes agents and sessions with role, current assignment and last verified activity. Silence is shown as no signal, never as healthy."
      />
      <SourceNote source={SOURCES.agents} />
      <Section title="Agent inventory">
        <StateNotice kind="not_connected" title="No runtime agent signal" enables={SOURCES.agents.enables}>
          No agent is listed because none can be verified from this deployment. Agents will appear with their last heartbeat
          and linked task conversations once the bridge reports them.
        </StateNotice>
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
