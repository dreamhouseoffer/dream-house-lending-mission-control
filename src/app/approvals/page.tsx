import type { Metadata } from "next";
import { DisabledAction, FilterLinks, McPage, ModuleLink, PageHeader, Section, SourceNote, StateNotice, StatusChip } from "@/components/mc/ui";
import { SOURCES, capability } from "@/lib/mission-control/capabilities.mjs";
import { formatTime, toEpochMs } from "@/lib/mission-control/bridge-client.mjs";
import {
  MILO_DECISION_FILTERS,
  NOT_VERIFIED,
  activeMiloFilter,
  decisionTone,
  filterMiloCards,
  levelTone,
  miloCardCaveat,
  miloFailureText,
} from "@/lib/mission-control/milo-approvals-client.mjs";
import { readMiloFeed, type MiloCard, type MiloFeed } from "@/lib/mission-control/milo-approvals";
import Link from "next/link";
import { readRecordLinks, type LinkedTask } from "@/lib/mission-control/artifacts";
import { SOURCE_STATE_TONES, joinSourceCards, sourceStateCounts } from "@/lib/mission-control/source-cards.mjs";
import { UI_STATE_LABELS } from "@/lib/mission-control/bridge-client.mjs";
import type { Tone } from "@/components/mc/ui";

type Joined = { card: MiloCard; linkedTasks: LinkedTask[]; derived: { state: string; label: string; why: string }; next: string };

export const metadata: Metadata = { title: "Approvals · Mission Control" };
export const dynamic = "force-dynamic";

const LIFECYCLE = ["Awaiting approval", "Authorized, not executed", "Executing", "Externally confirmed complete", "Rejected", "Revision requested"];

function MiloCardView({ item }: { item: Joined }) {
  const { card, derived, linkedTasks, next } = item;
  return (
    <article className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/40 p-3" data-record={card.id}>
      <h3 className="line-clamp-2 break-words text-sm font-medium leading-6 text-slate-100">{card.title ?? "Untitled card (no Title in Airtable)"}</h3>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <StatusChip tone={(SOURCE_STATE_TONES[derived.state as keyof typeof SOURCE_STATE_TONES] ?? "neutral") as Tone}>{derived.label}</StatusChip>
        <StatusChip tone={decisionTone(card.decision)}>Decision: {card.decision ?? "Not set"}</StatusChip>
      </div>
      <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-300">
        <span className="text-slate-500">Owner: Milo · Next:</span> {next}
      </p>
      {linkedTasks.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-xs">
          {linkedTasks.slice(0, 5).map((t) => (
            <li key={t.taskId} className="truncate">
              <Link href={`/tasks/${t.taskId}`} className="text-teal-300 hover:text-teal-200">
                {t.title ?? t.taskId}
              </Link>{" "}
              <span className="text-slate-500">· {UI_STATE_LABELS[t.ui.state as keyof typeof UI_STATE_LABELS] ?? t.ui.state}</span>
            </li>
          ))}
          {linkedTasks.length > 5 && <li className="text-slate-500">+{linkedTasks.length - 5} more linked task(s)</li>}
        </ul>
      )}
      <details className="mt-2 text-xs leading-5">
        <summary className="cursor-pointer font-medium text-slate-400">Details</summary>
        <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
          <dt className="text-slate-500">Saved status</dt>
          <dd className="break-words text-slate-300">{card.status ?? "Not set"}</dd>
          <dt className="text-slate-500">Why this state</dt>
          <dd className="break-words text-slate-400">{derived.why}</dd>
          <dt className="text-slate-500">Level</dt>
          <dd>
            <StatusChip tone={levelTone(card.approvalLevel)}>{card.approvalLevel ?? "Level not set"}</StatusChip>
          </dd>
          <dt className="text-slate-500">Category</dt>
          <dd className="break-words text-slate-400">{card.category ?? "Not set"}</dd>
          <dt className="text-slate-500">Approved at</dt>
          <dd className="text-slate-400">{card.approvedAt ? (toEpochMs(card.approvedAt) === null ? card.approvedAt : formatTime(card.approvedAt)) : "Not recorded"}</dd>
          <dt className="text-slate-500">Created</dt>
          <dd className="text-slate-400">{formatTime(card.createdTime)}</dd>
          <dt className="text-slate-500">Record</dt>
          <dd className="break-all font-mono text-slate-500">{card.id}</dd>
        </dl>
        <p className="mt-2 text-amber-200/80">{miloCardCaveat(card)}</p>
      </details>
    </article>
  );
}

function MiloFeedView({ feed, filter, links }: { feed: MiloFeed; filter: string; links: Awaited<ReturnType<typeof readRecordLinks>> }) {
  if (!feed.ok) {
    const kind = feed.state === "unauthenticated" || feed.state === "not_configured" ? "not_connected" : "error";
    return (
      <StateNotice kind={kind} title="Milo approval feed unavailable" href="/milo-approvals" hrefLabel="Open retained Milo module">
        {miloFailureText(feed.code)} The number of cards is unknown — this is not an empty queue.
      </StateNotice>
    );
  }
  const shown = filterMiloCards(feed.cards, filter);
  const joined = joinSourceCards(shown, links) as unknown as Joined[];
  const counts = sourceStateCounts(joinSourceCards(feed.cards, links)) as Record<string, number>;
  return (
    <div className="space-y-3">
      <p className="text-xs leading-5 text-slate-400">
        Read from Airtable (Milo approvals table) at {formatTime(feed.observedAt)} · {feed.cards.length} card{feed.cards.length === 1 ? "" : "s"}.
        Decisions and status are raw Airtable values. {NOT_VERIFIED} This view does not approve, revoke, re-request or
        execute anything.
      </p>
      <p className="text-xs leading-5 text-slate-400">
        {links.ok
          ? `Task links read at ${formatTime(links.observedAt)} (${links.scannedTasks} Hermes tasks scanned; linked only by the approved-execution workspace, never by title). Cards with an open linked Hermes run: ${counts.native_run_open ?? 0}.`
          : `Task links could not be read (${links.code}), so no card is shown as started.`}
      </p>
      {feed.truncated && (
        <StateNotice kind="stale" title="More cards exist than were read">
          Only the first {feed.cards.length + feed.malformed} records were read; additional cards exist in Airtable and are not shown here. The
          retained module shows at most the first 100.
        </StateNotice>
      )}
      {feed.malformed > 0 && (
        <StateNotice kind="stale" title={`${feed.malformed} record${feed.malformed === 1 ? "" : "s"} skipped`}>
          Airtable returned records without a valid id or fields; they are not shown.
        </StateNotice>
      )}
      {feed.cards.length === 0 ? (
        <StateNotice kind="empty" title="Airtable returned no Milo approval cards" />
      ) : (
        <>
          <FilterLinks basePath="/approvals" param="milo" options={MILO_DECISION_FILTERS} active={filter} />
          {shown.length === 0 ? (
            <StateNotice kind="empty" title="No cards match this filter" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {joined.map((item) => (
                <MiloCardView key={item.card.id} item={item} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default async function ApprovalsPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const decide = capability("approval.decide");
  const publish = capability("content.publish");
  const [feed, links] = await Promise.all([readMiloFeed(), readRecordLinks()]);
  const filter = activeMiloFilter(searchParams?.milo);

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
      <Section
        id="milo"
        title="Milo approval cards (Airtable)"
        description="Read-only view of the existing Milo Airtable queue. Approval there is permission for the card's scope only, not execution or publication authority."
        href="/milo-approvals"
        hrefLabel="Open retained Milo module"
      >
        <MiloFeedView feed={feed} filter={filter} links={links} />
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
