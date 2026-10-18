import type { Metadata } from "next";
import { McPage, PageHeader, Section, SourceNote } from "@/components/mc/ui";
import { OwnerChallengePanel } from "@/components/mc/owner-challenge-panel";
import { SOURCES } from "@/lib/mission-control/capabilities.mjs";
import { APPROVAL_ID_RE } from "@/lib/mission-control/approvals-client.mjs";
import { hasControlAccess } from "@/lib/mission-control/bridge";
import { ceremonyPanelAvailability, type PanelAvailability } from "@/lib/mission-control/approval-ceremony-route";

export const metadata: Metadata = { title: "Approval · Mission Control" };
export const dynamic = "force-dynamic";

// Owner decision for one approval. The panel is disabled unless the server-side ceremony availability (owner opt-in
// plus the bridge's reviewed challenge-only advertisement) holds; only that verdict and the public origin/rp_id are
// passed to the browser.
export default async function ApprovalDetailPage({ params }: { params: { id: string } }) {
  const validId = APPROVAL_ID_RE.test(params.id);
  const availability: PanelAvailability = !validId
    ? { available: false, reason: "invalid_approval_id" }
    : !(await hasControlAccess())
      ? { available: false, reason: "unauthenticated" }
      : await ceremonyPanelAvailability();

  return (
    <McPage>
      <PageHeader
        eyebrow="Approval"
        title={validId ? params.id : "Unknown approval"}
        description="Review the exact terms, then decide with the enrolled owner passkey. A decision authorizes only; nothing is executed from Mission Control."
      />
      <SourceNote source={SOURCES.approvals} />
      <Section title="Owner decision">
        <OwnerChallengePanel approvalId={validId ? params.id : ""} availability={availability} />
      </Section>
    </McPage>
  );
}
