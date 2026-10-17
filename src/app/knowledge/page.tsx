import type { Metadata } from "next";
import { DisabledAction, McPage, ModuleLink, PageHeader, Section, SourceNote, StateNotice } from "@/components/mc/ui";
import { SOURCES, capability } from "@/lib/mission-control/capabilities.mjs";

export const metadata: Metadata = { title: "Knowledge · Mission Control" };

export default function KnowledgePage() {
  const revise = capability("knowledge.revise");

  return (
    <McPage>
      <PageHeader
        eyebrow="Memory"
        title="Knowledge"
        description="Preferences, decisions, lessons and open work from the authoritative Hermes memory, with revision history and recoverable earlier versions."
      />
      <SourceNote source={SOURCES.knowledge} />
      <Section title="Hermes memory">
        <div className="space-y-4">
          <StateNotice kind="not_connected" title="Memory search unavailable" enables={SOURCES.knowledge.enables}>
            Search is not offered until it can query the real Hermes memory. This page does not keep a separate copy.
          </StateNotice>
          <DisabledAction label="Propose correction" reason={revise.reason ?? ""} />
        </div>
      </Section>
      <Section title="Retained modules">
        <div className="space-y-2">
          <ModuleLink href="/content/training" title="Loan training" description="Training library used by Ask Hermes." />
          <ModuleLink href="/memory" title="Memory notes" description="Browser-local notes; not Hermes memory." badge="Legacy" />
          <ModuleLink href="/docs" title="Docs" description="Browser-local documents." badge="Legacy" />
        </div>
      </Section>
    </McPage>
  );
}
