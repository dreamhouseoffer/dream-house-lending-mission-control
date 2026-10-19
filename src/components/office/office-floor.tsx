"use client";
// Playful 2D pixel office. Pure CSS/SVG, no game engine. Wandering is ambient decoration only; typing at a desk is
// shown ONLY for agents whose status is "working" (open native run + recent same-run heartbeat, verified on the server),
// and only until that heartbeat ages out: a browser-side clock flips the desk to Unknown even if refresh is paused or offline.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, X } from "lucide-react";

export type OfficeTask = { id: string; title: string; state: string; label: string } | null;
export type OfficeAgent = {
  id: string; name: string; role: string; kind: "agent"; status: "working" | "idle" | "unknown"; statusLabel: string;
  current: OfficeTask; latest: OfficeTask; openCount: number | null;
  evidence: { source: string; taskId: string; runId: number | null; heartbeatAt: string | null; expiresAt: number | null; reason?: string } | null;
};
export type OfficeJob = {
  id: string; name: string; kind: "scheduled"; schedule: string | null; enabled: boolean | null; nextRunAt: string | null;
  lastRunAt: string | null; lastStatus: string | null; status: string;
};
export type OfficeHuman = { id: string; name: string; role: string; kind: "human"; status: "untracked"; statusLabel: string };
type Person = OfficeAgent | OfficeJob | OfficeHuman;

const PALETTE = [
  { hair: "#3b2416", shirt: "#14b8a6", skin: "#f1c27d" },
  { hair: "#111827", shirt: "#f59e0b", skin: "#c68642" },
  { hair: "#7c2d12", shirt: "#8b5cf6", skin: "#e0ac69" },
  { hair: "#facc15", shirt: "#ef4444", skin: "#f5d0a9" },
  { hair: "#1f2937", shirt: "#3b82f6", skin: "#8d5524" },
];
const HUMAN_COLORS = [
  { hair: "#1c1917", shirt: "#0ea5e9", skin: "#d6a77a" },
  { hair: "#78350f", shirt: "#ec4899", skin: "#f1c27d" },
  { hair: "#0f172a", shirt: "#22c55e", skin: "#c68642" },
];

// Lounge waypoints (percent of the floor) used for ambient idle wandering.
const WAYPOINTS = [
  { x: 40, y: 56 }, { x: 52, y: 62 }, { x: 63, y: 55 }, { x: 74, y: 66 }, { x: 84, y: 74 }, { x: 46, y: 74 },
  { x: 58, y: 80 }, { x: 70, y: 82 }, { x: 36, y: 66 }, { x: 88, y: 60 },
];

// A server-verified "working" desk is only trusted until its heartbeat ages out on the browser clock.
function effective(a: OfficeAgent, now: number): OfficeAgent {
  if (a.status !== "working") return a;
  if (a.evidence?.expiresAt && now < a.evidence.expiresAt) return a;
  return { ...a, status: "unknown", statusLabel: "Unknown — the last native heartbeat aged out (re-read the board to check again)" };
}

function fmt(iso: string | null) {
  if (!iso) return "not reported";
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? `${new Date(ms).toISOString().replace("T", " ").slice(0, 16)} UTC` : "not reported";
}

function Sprite({ colors, walking, typing, muted }: { colors: (typeof PALETTE)[number]; walking?: boolean; typing?: boolean; muted?: boolean }) {
  // 10x14 pixel character; shape-rendering keeps it crisp.
  return (
    <svg viewBox="0 0 10 14" width="30" height="42" shapeRendering="crispEdges" aria-hidden className={`${walking ? "office-bob" : ""} ${muted ? "opacity-50 grayscale" : ""}`}>
      <rect x="2" y="0" width="6" height="2" fill={colors.hair} />
      <rect x="1" y="1" width="1" height="3" fill={colors.hair} />
      <rect x="8" y="1" width="1" height="3" fill={colors.hair} />
      <rect x="2" y="2" width="6" height="4" fill={colors.skin} />
      <rect x="3" y="3" width="1" height="1" fill="#111" />
      <rect x="6" y="3" width="1" height="1" fill="#111" />
      <rect x="4" y="5" width="2" height="1" fill="#9f1239" />
      <rect x="1" y="6" width="8" height="5" fill={colors.shirt} />
      <rect x="0" y="7" width="1" height="3" fill={colors.skin} className={typing ? "office-type-l" : ""} />
      <rect x="9" y="7" width="1" height="3" fill={colors.skin} className={typing ? "office-type-r" : ""} />
      <rect x="2" y="11" width="2" height="3" fill="#1e293b" className={walking ? "office-leg-l" : ""} />
      <rect x="6" y="11" width="2" height="3" fill="#1e293b" className={walking ? "office-leg-r" : ""} />
    </svg>
  );
}

function Desk({ person, x, y, colors, onOpen, paused }: { person: OfficeAgent | OfficeHuman; x: number; y: number; colors: (typeof PALETTE)[number]; onOpen: (id: string, el: HTMLElement) => void; paused: boolean }) {
  const working = person.kind === "agent" && person.status === "working";
  const unknown = person.kind === "agent" && person.status === "unknown";
  const human = person.kind === "human";
  return (
    <button
      type="button"
      data-desk={person.id}
      onClick={(e) => onOpen(person.id, e.currentTarget)}
      aria-label={`${person.name} desk — ${person.statusLabel}. Open details`}
      className="group absolute flex -translate-x-1/2 flex-col items-center rounded-md p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {/* monitor */}
      <span className={`relative block h-7 w-11 rounded-sm border-2 border-slate-900 ${working ? "bg-teal-300/90 shadow-[0_0_12px_rgba(45,212,191,0.8)]" : unknown ? "bg-slate-600" : "bg-slate-800"}`}>
        {working && <span className={`absolute inset-x-1 top-1 block h-1 bg-slate-900/70 ${paused ? "" : "office-code"}`} />}
        {unknown && <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-200">?</span>}
      </span>
      <span className="block h-1.5 w-2 bg-slate-900" />
      {/* desk top */}
      <span className="relative block h-4 w-20 rounded-sm border-b-4 border-amber-900 bg-amber-700">
        <span className="absolute left-1 top-0.5 block h-1.5 w-3 rounded-sm bg-slate-300/80" />
        <span className="absolute right-1.5 top-0 block h-2 w-1.5 rounded-sm bg-rose-200" title="mug" />
      </span>
      {(working || human || unknown) && (
        <span className="-mt-1">
          <Sprite colors={colors} typing={working && !paused} muted={human || unknown} />
        </span>
      )}
      <span className="mt-0.5 max-w-[7.5rem] truncate rounded bg-slate-950/85 px-1.5 py-0.5 text-[11px] font-semibold text-slate-50 group-hover:bg-teal-900">
        {person.name}
      </span>
      <span className={`mt-0.5 rounded px-1 text-[10px] font-medium ${working ? "bg-teal-500/30 text-teal-100" : human ? "bg-sky-500/20 text-sky-100" : unknown ? "bg-slate-600/60 text-slate-100" : "bg-slate-800/80 text-slate-300"}`}>
        {working ? "typing · run open" : human ? "human · not tracked" : unknown ? "unknown" : "desk empty · idle"}
      </span>
    </button>
  );
}

function Plant({ x, y }: { x: number; y: number }) {
  return (
    <span aria-hidden className="absolute -translate-x-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
      <span className="block h-6 w-8 rounded-t-full bg-emerald-600 shadow-[inset_-4px_-3px_0_rgba(0,0,0,0.25)]" />
      <span className="mx-auto block h-4 w-5 rounded-b-sm bg-orange-800" />
    </span>
  );
}

export function OfficeFloor({ agents: served, jobs, humans, serverNow }: { agents: OfficeAgent[]; jobs: OfficeJob[] | null; humans: OfficeHuman[]; serverNow: number }) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    // Truth clock, not animation: keeps running when motion is paused, AutoRefresh is paused or the browser is offline.
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 5000);
    return () => window.clearInterval(id);
  }, []);
  const agents = served.map((a) => effective(a, now));
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const idle = agents.filter((a) => a.status === "idle");
  const [spots, setSpots] = useState<Record<string, number>>(() => Object.fromEntries(idle.map((a, i) => [a.id, (i * 3) % WAYPOINTS.length])));

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const still = paused || reduced;
  useEffect(() => {
    if (still || idle.length === 0) return;
    const id = window.setInterval(() => {
      setSpots((prev) => {
        const next = { ...prev };
        for (const a of idle) if (Math.random() < 0.7) next[a.id] = Math.floor(Math.random() * WAYPOINTS.length);
        return next;
      });
    }, 3200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still, idle.map((a) => a.id).join(",")]);

  const open = useCallback((id: string, el: HTMLElement) => {
    opener.current = el;
    setSelected(id);
  }, []);
  const close = useCallback(() => {
    setSelected(null);
    opener.current?.focus();
  }, []);
  useEffect(() => {
    if (!selected) return;
    heading.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, close]);

  const everyone: Person[] = [...agents, ...humans, ...(jobs ?? [])];
  const person = everyone.find((p) => p.id === selected) ?? null;
  // Humans sit in their own row below the agent rows so labels never overlap.
  const humanRow = Math.ceil(agents.length / 4) || 1;
  const agentDesks = agents.map((a, i) => ({ a, x: 10 + (i % 4) * 17, y: 7 + Math.floor(i / 4) * 26, c: PALETTE[i % PALETTE.length] }));
  const loungeTop = 7 + (humanRow + 1) * 26;

  return (
    <div className="min-w-0 space-y-3" data-office-motion={still ? "paused" : "running"}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <button
          type="button"
          onClick={() => setPaused((v) => !v)}
          disabled={reduced}
          aria-pressed={paused}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 font-medium text-slate-200 hover:border-slate-500 disabled:cursor-not-allowed disabled:text-slate-500"
        >
          {still ? <Play size={13} aria-hidden /> : <Pause size={13} aria-hidden />}
          {reduced ? "Motion off (reduced-motion setting)" : paused ? "Resume motion" : "Pause motion"}
        </button>
        <span>Wandering is decoration only. Typing means the agent&apos;s own open Hermes run sent a native heartbeat in the last 2 minutes.</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800" tabIndex={0} aria-label="Office floor (scroll sideways on small screens)">
        <div
          className={`office-floor relative min-w-[760px] ${still ? "office-still" : ""}`}
          role="group"
          aria-label="Team office floor"
          style={{ height: `${Math.max(520, (loungeTop + 34) * 5.2)}px` }}
        >
          {/* walls & zones */}
          <span aria-hidden className="absolute inset-x-0 top-0 h-[5%] bg-slate-700" />
          <span aria-hidden className="absolute left-[4%] w-[78%] rounded-xl bg-indigo-950/40 ring-1 ring-indigo-400/10" style={{ top: `${loungeTop}%`, bottom: "3%" }} />
          <span className="absolute left-[5%] rounded bg-slate-950/70 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-200" style={{ top: `${loungeTop + 1}%` }}>Lounge</span>
          {/* coffee corner */}
          <span aria-hidden className="absolute right-[6%] flex flex-col items-center" style={{ top: `${loungeTop + 4}%` }}>
            <span className="block h-9 w-8 rounded-sm border-2 border-slate-900 bg-slate-400">
              <span className="mx-auto mt-1 block h-2 w-4 bg-slate-900" />
              <span className="mx-auto mt-1 block h-2 w-2 rounded-full bg-rose-500" />
            </span>
            <span className="mt-0.5 rounded bg-slate-950/70 px-1 text-[10px] text-amber-100">coffee</span>
          </span>
          {/* sofa */}
          <span aria-hidden className="absolute left-[60%] top-[90%] block h-[5%] w-[16%] rounded-t-lg bg-rose-800 shadow-[inset_0_-6px_0_rgba(0,0,0,0.3)]" />
          <Plant x={3} y={84} />
          <Plant x={96} y={86} />
          <Plant x={28} y={10} />
          <Plant x={92} y={10} />

          {agentDesks.map(({ a, x, y, c }) => (
            <Desk key={a.id} person={a} x={x} y={y} colors={c} onOpen={open} paused={still} />
          ))}
          {humans.map((h, i) => (
            <Desk key={h.id} person={h} x={10 + (i % 4) * 17} y={7 + humanRow * 26} colors={HUMAN_COLORS[i % HUMAN_COLORS.length]} onOpen={open} paused={still} />
          ))}

          {/* ambient wandering idle agents */}
          {idle.map((a) => {
            const i = agents.indexOf(a);
            const base = WAYPOINTS[spots[a.id] ?? 0];
            // Waypoints are spread over the lounge band, which starts below the desk rows.
            const wp = { x: 8 + ((base.x - 36) / 52) * 70, y: loungeTop + 14 + ((base.y - 55) / 30) * (100 - loungeTop - 20) };
            return (
              <button
                key={a.id}
                type="button"
                data-sprite={a.id}
                data-wp={spots[a.id] ?? 0}
                onClick={(e) => open(a.id, e.currentTarget)}
                aria-label={`${a.name} — idle, wandering (not work). Open details`}
                className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                style={{ left: `${wp.x}%`, top: `${wp.y}%`, transition: still ? "none" : "left 3s linear, top 3s linear" }}
              >
                <Sprite colors={PALETTE[i % PALETTE.length]} walking={!still} />
                <span className="rounded bg-slate-950/85 px-1.5 py-0.5 text-[11px] font-semibold text-slate-50">{a.name}</span>
              </button>
            );
          })}

          {/* schedule board */}
          <div className="absolute right-[2%] top-[7%] w-[22%] rounded-md border-2 border-amber-900 bg-emerald-950/90 p-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-200">Scheduled jobs</p>
            {jobs === null ? (
              <p className="text-[10px] text-slate-300">Schedules unknown (not read)</p>
            ) : jobs.length === 0 ? (
              <p className="text-[10px] text-slate-300">No schedules reported</p>
            ) : (
              <ul className="max-h-24 space-y-0.5 overflow-y-auto">
                {jobs.slice(0, 8).map((j) => (
                  <li key={j.id}>
                    <button type="button" onClick={(e) => open(j.id, e.currentTarget)} className="w-full truncate rounded px-0.5 text-left text-[10px] text-emerald-50 hover:bg-emerald-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-teal-300">
                      ⏰ {j.name}
                    </button>
                  </li>
                ))}
                {jobs.length > 8 && <li className="text-[10px] text-emerald-200">+{jobs.length - 8} more below</li>}
              </ul>
            )}
          </div>
        </div>
      </div>

      {person && (
        <section
          role="dialog"
          aria-modal="false"
          aria-labelledby="office-panel-title"
          className="fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl md:inset-x-auto md:bottom-6 md:right-6 md:w-96 md:rounded-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="office-panel-title" ref={heading} tabIndex={-1} className="text-base font-semibold text-slate-50 focus:outline-none">
                {person.name}
              </h2>
              <p className="text-xs text-slate-400">
                {person.kind === "agent" ? `Hermes agent profile · ${person.role}` : person.kind === "human" ? `${person.role} · human` : "Scheduled job (not an employee)"}
              </p>
            </div>
            <button type="button" onClick={close} aria-label="Close details" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100">
              <X size={16} />
            </button>
          </div>
          <dl className="mt-3 space-y-2 text-sm">
            {person.kind === "agent" && (
              <>
                <div><dt className="text-xs text-slate-500">Status</dt><dd className="text-slate-100" data-status={person.status}>{person.statusLabel}</dd></div>
                <div>
                  <dt className="text-xs text-slate-500">Activity evidence</dt>
                  <dd className="text-xs text-slate-300">
                    {person.evidence?.heartbeatAt
                      ? `Run ${person.evidence.runId} on ${person.evidence.taskId}: last native heartbeat ${fmt(person.evidence.heartbeatAt)}.`
                      : person.evidence
                        ? `No verified heartbeat for ${person.evidence.taskId}.`
                        : "No open run on the task board."}{" "}
                    Source: {person.evidence?.source ?? "bridge task list"}. Walking is decoration, not work.
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Current task</dt>
                  <dd>{person.current ? <Link href={`/tasks/${person.current.id}`} className="line-clamp-2 text-teal-300 hover:text-teal-200">{person.current.title}</Link> : <span className="text-slate-400">None open</span>}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Latest result</dt>
                  <dd>
                    {person.latest ? (
                      <Link href={`/tasks/${person.latest.id}#results`} className="line-clamp-2 text-teal-300 hover:text-teal-200">
                        {person.latest.title} · {person.latest.label}
                      </Link>
                    ) : (
                      <span className="text-slate-400">No finished task on the board</span>
                    )}
                  </dd>
                </div>
                <div><dt className="text-xs text-slate-500">Open tasks</dt><dd className="text-slate-200">{person.openCount === null ? "Unknown" : person.openCount}</dd></div>
                <div><dt className="text-xs text-slate-500">Next schedule</dt><dd className="text-slate-400">Schedules are not linked to a profile by the scheduler; see Workflows.</dd></div>
                <div className="flex flex-wrap gap-3 pt-1 text-xs">
                  <Link href={`/tasks?q=${encodeURIComponent(person.id)}`} className="font-medium text-teal-300 hover:text-teal-200">All tasks</Link>
                  <Link href="/agents" className="font-medium text-teal-300 hover:text-teal-200">Agent profile</Link>
                </div>
              </>
            )}
            {person.kind === "human" && (
              <div><dt className="text-xs text-slate-500">Presence</dt><dd className="text-slate-200">Not tracked. Mission Control does not know whether {person.name} is in.</dd></div>
            )}
            {person.kind === "scheduled" && (
              <>
                <div><dt className="text-xs text-slate-500">Schedule</dt><dd className="text-slate-200">{person.schedule ?? "not reported"}</dd></div>
                <div><dt className="text-xs text-slate-500">State</dt><dd className="text-slate-200">{person.status}</dd></div>
                <div><dt className="text-xs text-slate-500">Next run</dt><dd className="text-slate-200">{fmt(person.nextRunAt)}</dd></div>
                <div><dt className="text-xs text-slate-500">Last run</dt><dd className="text-slate-200">{fmt(person.lastRunAt)} · {person.lastStatus ?? "status not reported"}</dd></div>
                <Link href="/workflows" className="text-xs font-medium text-teal-300 hover:text-teal-200">Open Workflows</Link>
              </>
            )}
          </dl>
        </section>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {[
          { title: "Agents (Hermes profiles)", items: agents as Person[] },
          { title: "Human team", items: humans as Person[] },
          { title: "Scheduled jobs", items: (jobs ?? []) as Person[] },
        ].map((g) => (
          <div key={g.title} className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{g.title}</p>
            {g.items.length === 0 ? (
              <p className="mt-1 text-xs text-slate-500">{g.title === "Scheduled jobs" && jobs === null ? "Unknown — schedules not read" : "None reported"}</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {g.items.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={(e) => open(p.id, e.currentTarget)} className="flex w-full items-center justify-between gap-2 rounded px-1 py-1 text-left text-sm text-slate-200 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">
                      <span className="min-w-0 truncate">{p.name}</span>
                      <span className="max-w-[45%] shrink-0 truncate text-[11px] text-slate-400">{p.kind === "scheduled" ? p.status : p.kind === "human" ? "presence not tracked" : p.status === "working" ? "working (run open)" : p.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
