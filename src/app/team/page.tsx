"use client";

import { useEffect, useState } from "react";
import { getTeam } from "@/lib/store";
import { TeamMember } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Bot, User, Cpu } from "lucide-react";

const statusColor: Record<TeamMember["status"], string> = {
  active: "bg-emerald-500",
  idle: "bg-yellow-500",
  offline: "bg-red-500",
};

const statusLabel: Record<TeamMember["status"], string> = {
  active: "Active",
  idle: "Idle",
  offline: "Offline",
};

export default function TeamPage() {
  const [team, setTeam] = useState<TeamMember[]>([]);

  useEffect(() => {
    setTeam(getTeam());
  }, []);

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Mission Statement Banner */}
      <div className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent" />
        <div className="relative mx-auto max-w-3xl px-6 py-16 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-white/40 mb-4">
            Mission
          </p>
          <p className="text-lg leading-relaxed text-white/70 sm:text-xl">
            Build a lean, AI-powered operation that generates income and wealth
            without requiring your constant presence&nbsp;&mdash; so your time
            goes to family, faith, and ownership.
          </p>
        </div>
      </div>

      {/* Scrolling Ticker */}
      <div className="relative overflow-hidden border-b border-white/[0.06]" style={{ height: 32 }}>
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
            fontSize: 12,
            color: "#4ade80",
            fontFamily: "monospace",
            lineHeight: "32px",
            paddingLeft: "100%",
          }}
        >
          Mike: Mapping Kern County keywords... &nbsp;│&nbsp; Jay Jay: Drafting email sequence... &nbsp;│&nbsp; Milo: Monitoring 15 active files... &nbsp;│&nbsp; Millan: Preparing morning briefing... &nbsp;│&nbsp; Nova: Scheduling this week&apos;s content... &nbsp;│&nbsp; Vega: Scanning market data... &nbsp;│&nbsp; Atlas: Reviewing deliverables... &nbsp;│&nbsp; Claude Code: Building features... &nbsp;│&nbsp; System: All clear ✓
        </div>
      </div>

      {/* Org Structure */}
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h2 className="mb-6 text-lg font-semibold tracking-tight text-white/80">Org Structure</h2>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-6">
          <div className="flex flex-col items-center gap-1 font-mono text-sm">
            <span className="text-white/70 font-semibold">Fonz — Owner / CEO</span>
            <span className="text-white/20">│</span>
            <span className="text-white/70 font-semibold">Atlas 🦞 — Primary AI</span>
            <span className="text-white/20">│</span>
            <div className="text-white/20 text-center">┌──────────────┬──────────────┬──────────────┐</div>
            <div className="grid grid-cols-5 gap-4 w-full text-center mt-1">
              <div>
                <p className="text-xs font-bold text-emerald-400/80 uppercase tracking-wider mb-2">Dream House Lending</p>
                <p className="text-white/50 text-xs">Mike — SEO & Content</p>
                <p className="text-white/50 text-xs">Jay Jay — Lead Capture</p>
                <p className="text-white/50 text-xs">Milo — Lending Ops</p>
              </div>
              <div>
                <p className="text-xs font-bold text-amber-400/80 uppercase tracking-wider mb-2">Intelligence</p>
                <p className="text-white/50 text-xs">Millan — Personal Intel</p>
              </div>
              <div>
                <p className="text-xs font-bold text-purple-400/80 uppercase tracking-wider mb-2">Brand</p>
                <p className="text-white/50 text-xs">Nova — Social Media</p>
              </div>
              <div>
                <p className="text-xs font-bold text-cyan-400/80 uppercase tracking-wider mb-2">Engineering</p>
                <p className="text-white/50 text-xs">Claude Code — Dev</p>
              </div>
              <div>
                <p className="text-xs font-bold text-yellow-400/80 uppercase tracking-wider mb-2">Finance</p>
                <p className="text-white/50 text-xs">Vega ⚡ — Financial Intel</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Team Grid */}
      <div className="mx-auto max-w-4xl px-6 pb-12">
        <h1 className="mb-8 text-2xl font-semibold tracking-tight">Team</h1>

        <div className="grid gap-4 md:grid-cols-2">
          {team.map((member) => (
            <div
              key={member.id}
              className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5 transition-colors hover:bg-white/[0.05]"
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04]">
                    {member.type === "human" ? (
                      <User className="h-4 w-4 text-white/50" />
                    ) : (
                      <Bot className="h-4 w-4 text-white/50" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-base font-medium leading-tight">
                      {member.name}
                    </h2>
                    <p className="text-sm text-white/40">{member.role}</p>
                  </div>
                </div>

                {/* Status dot */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="relative flex h-2.5 w-2.5">
                    {member.status === "active" && (
                      <span
                        className={`absolute inline-flex h-full w-full animate-ping rounded-full ${statusColor[member.status]} opacity-40`}
                      />
                    )}
                    <span
                      className={`relative inline-flex h-2.5 w-2.5 rounded-full ${statusColor[member.status]}`}
                    />
                  </span>
                  <span className="text-xs text-white/30">
                    {statusLabel[member.status]}
                  </span>
                </div>
              </div>

              {/* Badges */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-white/[0.1] text-white/60 text-[11px]"
                >
                  {member.type === "human" ? "Human" : "AI"}
                </Badge>
                {member.model && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[11px]">
                    <Cpu className="h-3 w-3 text-white/30" />
                    <code className="font-mono text-white/50">
                      {member.model}
                    </code>
                  </span>
                )}
              </div>

              {/* Responsibilities */}
              <p className="mt-3 text-sm leading-relaxed text-white/40">
                {member.responsibilities}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
