import type { Metadata } from "next";
import { DisabledAction, McPage, ModuleLink, PageHeader, Section, SourceNote, StateNotice, StatusChip } from "@/components/mc/ui";
import { SOURCES, capability } from "@/lib/mission-control/capabilities.mjs";

export const metadata: Metadata = { title: "Approvals · Mission Control" };

const LIFECYCLE = ["Awaiting approval", "Authorized, not executed", "Executing", "Externally confirmed complete", "Rejected", "Revision requested"];

export default function ApprovalsPage() {
  const decide = capability("approval.decide");
  const publish = capability("content.publish");

  return (
    <McPage>
      <PageHeader
        eyebrow="Decisions"
        title="Approvals"
        description="Exact versioned output, destination, action, timing and cost for every gated action. A material change to the output invalidates an earlier approval."
      />
      <SourceNote source={SOURCES.approvals} />
      <Section title="Execution approval inbox">
        <div className="space-y-4">
          <StateNotice kind="not_connected" title="No execution approvals available" enables={SOURCES.approvals.enables}>
            Approvals bound to a task and artifact version are stored in the bridge ledger. None are shown because none can be
            read yet.
          </StateNotice>
          <div className="flex flex-wrap gap-1.5" aria-label="Approval lifecycle">
            {LIFECYCLE.map((l) => (
              <StatusChip key={l}>{l}</StatusChip>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <DisabledAction label="Approve / reject / revise" reason={decide.reason ?? ""} />
            <DisabledAction label="Schedule or publish" reason={publish.reason ?? ""} />
          </div>
        </div>
      </Section>
      <Section title="Retained approval feeds">
        <ModuleLink
          href="/milo-approvals"
          title="Milo approvals (Airtable)"
          description="Working Airtable approval queue. Idea or draft approval there is not publication authority."
        />
      </Section>
    </McPage>
  );
}
