import type { Metadata } from "next";
import { DisabledAction, McPage, ModuleLink, PageHeader, Section, SourceNote, StateNotice, StatusChip } from "@/components/mc/ui";
import { SOURCES, capability } from "@/lib/mission-control/capabilities.mjs";

export const metadata: Metadata = { title: "Content · Mission Control" };

const STAGES = ["Research", "Ideas", "Scripts", "Captions", "Articles", "Publishing prep"];

export default function ContentPage() {
  const publish = capability("content.publish");

  return (
    <McPage>
      <PageHeader
        eyebrow="Create"
        title="Content"
        description="Sources, drafts, revisions and final outputs linked to their task. Idea approval is not publication authority; scheduled or published requires confirmation from the connected service."
      />
      <SourceNote source={SOURCES.content} />
      <Section title="Workspace">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5" aria-label="Stages">
            {STAGES.map((s) => (
              <StatusChip key={s}>{s}</StatusChip>
            ))}
          </div>
          <StateNotice kind="not_connected" title="No content items available" enables={SOURCES.content.enables}>
            Content items are produced by Hermes tasks. None are shown because no task source is connected.
          </StateNotice>
          <DisabledAction label="Schedule or publish" reason={publish.reason ?? ""} />
        </div>
      </Section>
      <Section title="Retained modules">
        <div className="space-y-2">
          <ModuleLink href="/campaigns" title="Campaigns (Mailchimp)" description="Existing campaign module, unchanged. This workspace never schedules or sends from here." />
          <ModuleLink href="/content/training" title="Loan training" description="Training library used by Ask Hermes (previously at /content)." />
        </div>
      </Section>
    </McPage>
  );
}
