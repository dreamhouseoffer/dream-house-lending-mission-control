"use client";

import { useEffect, useState } from "react";
import { getTeam } from "@/lib/store";
import { TeamMember } from "@/lib/types";
import { Bot, User, Cpu } from "lucide-react";

// Agent color mapping
const AGENT_COLORS: Record<string, { accent: string; bg: string; border: string }> = {
  Jarvis: {
    accent: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  Vega: {
    accent: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
  },
  Millan: {
    accent: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
  },
  Milo: {
    accent: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
  Mike: {
    accent: "text-pink-400",
    bg: "bg-pink-500/10",
    border: "border-pink-500/20",
  },
  "Jay Jay": {
    accent: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
  },
  Nova: {
    accent: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
  },
  "Claude Code": {
    accent: "text-white/60",
    bg: "bg-white/[0.04]",
    border: "border-white/[0.08]",
  },
};

const STATUS_DOT: Record<TeamMember["status"], string> = {
  active: "bg-emerald-500",
  idle: "bg-yellow-500",
  offline: "bg-white/20",
};

const STATUS_LABEL: Record<TeamMember["status"], string> = {
  active: "Active",
  idle: "Idle",
  offline: "Offline",
};

interface AgentStatusEntry {
  id: string;
  name: string;
  model: string;
  lastRunAt: string | null;
  lastStatus: string;
  nextRunAt: string | null;
  schedule: string;
  tz: string;
  lastError: string | null;
  lastDurationMs: number | null;
}

interface AgentStatusData {
  lastUpdated: string;
  agents: AgentStatusEntry[];
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getAgentColors(name: string) {
  const key = Object.keys(AGENT_COLORS).find((k) =>
    name.toLowerCase().includes(k.toLowerCase())
  );
  return (
    key
      ? AGENT_COLORS[key]
      : { accent: "text-white/50", bg: "bg-white/[0.03]", border: "border-white/[0.06]" }
  );
}

function LiveStatusDot({ status }: { status: string }) {
  if (status === "ok" || status === "success") {
    return (
      <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        OK
      </span>
    );
  }
  if (status === "error" || status === "failed") {
    return (
      <span className="flex items-center gap-1.5 text-red-400 text-xs font-medium">
        <span className="relative inline-flex size-2 rounded-full bg-red-500" />
        Error
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-white/30 text-xs">
      <span className="relative inline-flex size-2 rounded-full bg-white/15" />
      Idle
    </span>
  );
}

export default function TeamPage() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatusData | null>(null);

  useEffect(() => {
    setTeam(getTeam());
    fetch("/api/agent-status")
      .then((r) => r.json())
      .then(setAgentStatus)
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      {/* Mission Banner */}
      <div className="relative border-b border-white/[0.05]">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.025] to-transparent" />
        <div className="relative mx-auto max-w-3xl px-6 py-10 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3">
            Mission
          </p>
          <p className="text-base leading-relaxed text-white/55 sm:text-lg">
            Build a lean, AI-powered operation that generates income and wealth
            without requiring your constant presence — so your time goes to
            family, faith, and ownership.
          </p>
        </div>
      </div>

      {/* Scrolling ticker */}
      <div className="relative overflow-hidden border-b border-white/[0.05]" style={{ height: 32 }}>
        <style>{`
          @keyframes team-marquee {
            0% { transform: translateX(100%); }
            100% { transform: translateX(-100%); }
          }
        `}</style>
        <div
          className="whitespace-nowrap absolute top-0 left-0"
          style={{
            animation: "team-marquee 25s linear infinite",
            fontSize: 11,
            color: "#4ade80",
            fontFamily: "monospace",
            lineHeight: "32px",
            paddingLeft: "100%",
          }}
        >
          Mike: Mapping Kern County keywords... &nbsp;│&nbsp; Jay Jay: Drafting email sequence... &nbsp;│&nbsp; Milo: Monitoring 15 active files... &nbsp;│&nbsp; Millan: Preparing morning briefing... &nbsp;│&nbsp; Nova: Scheduling this week&apos;s content... &nbsp;│&nbsp; Vega: Scanning market data... &nbsp;│&nbsp; Jarvis: Reviewing deliverables... &nbsp;│&nbsp; Claude Code: Building features... &nbsp;│&nbsp; System: All clear ✓
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-5 py-7 space-y-8">
        {/* Live Agent Status */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold tracking-tight text-white/70">
              Live Agent Status
            </h2>
            {agentStatus?.lastUpdated && (
              <span className="text-[10px] text-white/25">
                Updated {relativeTime(agentStatus.lastUpdated)}
              </span>
            )}
          </div>

          {agentStatus?.agents && agentStatus.agents.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {agentStatus.agents.map((agent) => {
                const colors = getAgentColors(agent.name);
                return (
                  <div
                    key={agent.id}
                    className={`rounded-xl border ${colors.border} ${colors.bg} p-4`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold ${colors.accent} truncate`}>
                          {agent.name}
                        </p>
                        <p className="text-[10px] text-white/25 font-mono mt-0.5">
                          {agent.schedule} ·{" "}
                          {agent.tz?.replace("America/", "")}
                        </p>
                      </div>
                      <LiveStatusDot status={agent.lastStatus} />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md bg-black/20 border border-white/[0.04] p-2">
                        <p className="text-[9px] text-white/25 uppercase tracking-wider mb-1">Last Run</p>
                        <p className="text-white/65 font-medium">
                          {relativeTime(agent.lastRunAt)}
                        </p>
                        <p className="text-[9px] text-white/25 mt-0.5">
                          {formatDateTime(agent.lastRunAt)}
                        </p>
                      </div>
                      <div className="rounded-md bg-black/20 border border-white/[0.04] p-2">
                        <p className="text-[9px] text-white/25 uppercase tracking-wider mb-1">Next Run</p>
                        <p className="text-white/65 font-medium">
                          {relativeTime(agent.nextRunAt)}
                        </p>
                        <p className="text-[9px] text-white/25 mt-0.5">
                          {formatDateTime(agent.nextRunAt)}
                        </p>
                      </div>
                    </div>

                    {agent.model && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <Cpu className="size-3 text-white/20" />
                        <span className="text-[10px] text-white/25 font-mono">
                          {agent.model.replace("anthropic/", "")}
                        </span>
                        {agent.lastDurationMs && (
                          <span className="text-[10px] text-white/20 ml-auto">
                            {(agent.lastDurationMs / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                    )}

                    {agent.lastError && (
                      <p className="mt-2 text-[10px] text-red-400/70 bg-red-500/[0.08] rounded px-2 py-1 font-mono truncate">
                        {agent.lastError}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-6 text-center">
              <p className="text-sm text-white/25">Loading agent status...</p>
            </div>
          )}
        </div>

        {/* Org Chart */}
        <div>
          <h2 className="text-base font-semibold tracking-tight text-white/70 mb-4">
            Org Structure
          </h2>
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-5 overflow-x-auto">
            <div className="flex flex-col items-center gap-1 font-mono text-sm min-w-[340px]">
              <span className="text-white/70 font-bold">Fonz — Owner / CEO</span>
              <span className="text-white/15">│</span>
              <span className="text-blue-400 font-bold">Jarvis 🦞 — Primary AI</span>
              <span className="text-white/15">│</span>
              <div className="text-white/15 text-center">
                ┌──────────────────┬──────────────┬──────────────┐
              </div>
              <div className="grid grid-cols-5 gap-4 w-full text-center mt-1">
                <div>
                  <p className="text-[10px] font-bold text-emerald-400/70 uppercase tracking-wider mb-2">
                    Lending
                  </p>
                  <p className="text-pink-400/70 text-xs">Mike</p>
                  <p className="text-cyan-400/70 text-xs">Jay Jay</p>
                  <p className="text-emerald-400/70 text-xs">Milo</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-amber-400/70 uppercase tracking-wider mb-2">
                    Intel
                  </p>
                  <p className="text-orange-400/70 text-xs">Millan</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-purple-400/70 uppercase tracking-wider mb-2">
                    Brand
                  </p>
                  <p className="text-purple-400/70 text-xs">Nova</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">
                    Dev
                  </p>
                  <p className="text-white/40 text-xs">Claude Code</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-yellow-400/70 uppercase tracking-wider mb-2">
                    Finance
                  </p>
                  <p className="text-yellow-400/70 text-xs">Vega ⚡</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Team Grid */}
        <div>
          <h2 className="text-base font-semibold tracking-tight text-white/70 mb-4">
            Team Roster
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {team.map((member) => {
              const colors = getAgentColors(member.name);
              return (
                <div
                  key={member.id}
                  className={`rounded-xl border ${colors.border} ${colors.bg} p-4 transition-colors hover:opacity-90`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${colors.border} bg-black/20`}>
                        {member.type === "human" ? (
                          <User className={`size-4 ${colors.accent}`} />
                        ) : (
                          <Bot className={`size-4 ${colors.accent}`} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className={`text-sm font-semibold ${colors.accent} truncate`}>
                          {member.name}
                        </h3>
                        <p className="text-xs text-white/35 truncate">{member.role}</p>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-1.5 pt-0.5 shrink-0">
                      <span className="relative flex size-2">
                        {member.status === "active" && (
                          <span
                            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${STATUS_DOT[member.status]} opacity-40`}
                          />
                        )}
                        <span
                          className={`relative inline-flex size-2 rounded-full ${STATUS_DOT[member.status]}`}
                        />
                      </span>
                      <span className="text-[10px] text-white/30">
                        {STATUS_LABEL[member.status]}
                      </span>
                    </div>
                  </div>

                  {/* Model */}
                  {member.model && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <Cpu className="size-3 text-white/20" />
                      <code className="text-[10px] font-mono text-white/30">
                        {member.model}
                      </code>
                    </div>
                  )}

                  {/* Responsibilities */}
                  <p className="text-xs leading-relaxed text-white/40">
                    {member.responsibilities}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
