"use client";

import { useState } from "react";

export default function OfficePage() {
  const [tab, setTab] = useState<"org" | "office">("org");

  return (
    <div
      className="min-h-screen flex flex-col items-center py-16 px-4 font-mono"
      style={{ backgroundColor: "#0A0A0A" }}
    >
      {/* Tab Bar */}
      <div className="flex gap-1 mb-10 bg-[#111] rounded-lg p-1 border border-gray-800">
        <button
          onClick={() => setTab("org")}
          className={`px-5 py-2 rounded-md text-sm transition-colors ${
            tab === "org"
              ? "bg-gray-800 text-gray-100"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          Org Chart
        </button>
        <button
          onClick={() => setTab("office")}
          className={`px-5 py-2 rounded-md text-sm transition-colors ${
            tab === "office"
              ? "bg-gray-800 text-gray-100"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          Virtual Office
        </button>
      </div>

      {tab === "org" ? <OrgChartTab /> : <VirtualOfficeTab />}
    </div>
  );
}

/* ═══════════════════════════════════════════
   TAB 1: Org Chart (original content)
   ═══════════════════════════════════════════ */

function OrgChartTab() {
  return (
    <>
      {/* Mission Statement */}
      <div className="max-w-2xl text-center mb-12">
        <h1 className="text-2xl text-gray-200 mb-4 tracking-widest uppercase">
          Organizational Chart
        </h1>
        <p className="text-gray-500 text-sm leading-relaxed italic">
          &ldquo;Build a lean, AI-powered operation that generates income and
          wealth without requiring your constant presence — so your time goes to
          family, faith, and ownership.&rdquo;
        </p>
      </div>

      {/* Org Chart */}
      <div className="relative flex flex-col items-center gap-0">
        {/* === LEVEL 1: Fonz === */}
        <OrgCard
          name="Fonz"
          subtitle="Alfonso Garza"
          role="Owner / CEO"
          status="active"
          variant="human"
        />

        {/* Connector: Fonz → Atlas */}
        <div className="w-px h-10 bg-gray-700" />

        {/* === LEVEL 2: Atlas === */}
        <OrgCard
          name="Jarvis 🦞"
          role="Primary AI Assistant"
          model="claude-sonnet-4-6"
          responsibilities="Orchestration, memory, task management, research, strategy"
          status="active"
          variant="primary"
        />

        {/* Connector: Atlas → branch */}
        <div className="w-px h-10 bg-gray-700" />

        {/* Horizontal connector bar */}
        <div className="relative flex items-start justify-center">
          <svg
            width="1540"
            height="12"
            className="absolute -top-px"
            style={{ left: "50%", transform: "translateX(-50%)" }}
          >
            <line x1="110" y1="0" x2="1430" y2="0" stroke="#374151" strokeWidth="1" />
            <line x1="110" y1="0" x2="110" y2="12" stroke="#374151" strokeWidth="1" />
            <line x1="330" y1="0" x2="330" y2="12" stroke="#374151" strokeWidth="1" />
            <line x1="550" y1="0" x2="550" y2="12" stroke="#374151" strokeWidth="1" />
            <line x1="770" y1="0" x2="770" y2="12" stroke="#374151" strokeWidth="1" />
            <line x1="990" y1="0" x2="990" y2="12" stroke="#374151" strokeWidth="1" />
            <line x1="1210" y1="0" x2="1210" y2="12" stroke="#374151" strokeWidth="1" />
            <line x1="1430" y1="0" x2="1430" y2="12" stroke="#374151" strokeWidth="1" />
          </svg>
        </div>

        {/* Spacer for SVG */}
        <div className="h-3" />

        {/* === LEVEL 3: Claude Code + Sub-Agents + Mike + Jay Jay === */}
        <div className="flex gap-10">
          <OrgCard
            name="Claude Code"
            role="Coding Agent"
            model="Claude Code CLI"
            responsibilities="Builds and ships features, writes code, scaffolds projects"
            status="active"
            variant="agent"
          />
          <OrgCard
            name="Sub-Agents"
            role="Parallel Workers"
            model="Various"
            responsibilities="Spawned on-demand for isolated tasks (research, PR review, batch work)"
            status="idle"
            variant="agent"
          />
          <OrgCard
            name="Mike"
            role="SEO & Content Agent"
            model="claude-sonnet-4-6"
            responsibilities="Keywords, blog posts, city pages, loan product pages, Google Business Profile, rank tracking"
            status="active"
            variant="agent"
          />
          <OrgCard
            name="Jay Jay"
            role="Lead Capture & Automation Agent"
            model="claude-sonnet-4-6"
            responsibilities="Lead capture forms, 14-email nurture sequence, Calendly integration, review generation, weekly dashboard"
            status="active"
            variant="agent"
          />
          <OrgCard
            name="Milo"
            role="Lending Operations & Pipeline Agent"
            model="claude-haiku-4-5-20251001"
            responsibilities="Daily pipeline briefings, stale file alerts, rate lock tracking, referral agent emails, post-closing triggers"
            status="active"
            variant="agent"
          />
          <OrgCard
            name="Millan"
            role="Personal Intelligence & Briefing Agent"
            model="claude-haiku-4-5-20251001"
            responsibilities="Daily 7am personal briefing — mortgage market pulse, Bakersfield weather, husband/dad tips, personal development, Fonz's edge"
            status="active"
            variant="agent"
          />
          <OrgCard
            name="Nova"
            role="Social Media & Brand Manager"
            model="claude-sonnet-4-6"
            responsibilities="LinkedIn, Instagram, Facebook, YouTube — content creation, brand voice, client win posts, market education content"
            status="active"
            variant="agent"
          />
          <OrgCard
            name="Vega ⚡"
            role="Financial Intelligence Agent"
            model="claude-haiku-4-5-20251001"
            responsibilities="Market analysis, stock/crypto research, technical analysis, macro intelligence, trade ideas"
            status="active"
            variant="agent"
          />
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════
   TAB 2: Virtual Office (pixel art)
   ═══════════════════════════════════════════ */

function VirtualOfficeTab() {
  return (
    <div className="w-full max-w-5xl flex flex-col items-center gap-6">
      {/* ═══ CSS Animations ═══ */}
      <style>{`
        @keyframes atlas-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes atlas-pulse {
          0%, 100% { text-shadow: 0 0 12px rgba(0,200,200,0.4); }
          50% { text-shadow: 0 0 24px rgba(0,200,200,0.8), 0 0 48px rgba(0,200,200,0.3); }
        }
        @keyframes desk-glow-pulse {
          0%, 100% { box-shadow: 0 0 16px rgba(0,200,200,0.15); }
          50% { box-shadow: 0 0 28px rgba(0,200,200,0.3); }
        }
        @keyframes fonz-idle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        @keyframes loan-fade {
          0%, 70% { opacity: 1; }
          85% { opacity: 0.4; }
          100% { opacity: 1; }
        }
        @keyframes led-flicker {
          0%, 100% { opacity: 1; }
          95% { opacity: 1; }
          96% { opacity: 0.6; }
          97% { opacity: 1; }
        }
        @keyframes sub-agent-active {
          0%, 100% { box-shadow: 0 0 8px rgba(74,222,128,0.3); }
          50% { box-shadow: 0 0 16px rgba(74,222,128,0.6); }
        }
        @keyframes marquee {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        @keyframes whoop-pulse {
          0%, 100% { background-color: #22c55e; }
          50% { background-color: #16a34a; }
        }
        @keyframes mike-glow {
          0%, 100% { box-shadow: 0 0 16px rgba(74,222,128,0.15); }
          50% { box-shadow: 0 0 28px rgba(74,222,128,0.35); }
        }
        @keyframes jayjay-glow {
          0%, 100% { box-shadow: 0 0 16px rgba(250,180,50,0.15); }
          50% { box-shadow: 0 0 28px rgba(250,180,50,0.35); }
        }
        @keyframes typing-cursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes milo-glow {
          0%, 100% { box-shadow: 0 0 16px rgba(59,130,246,0.15); }
          50% { box-shadow: 0 0 28px rgba(59,130,246,0.35); }
        }
        @keyframes millan-glow {
          0%, 100% { box-shadow: 0 0 16px rgba(245,158,11,0.15); }
          50% { box-shadow: 0 0 28px rgba(245,158,11,0.35); }
        }
        @keyframes nova-glow {
          0%, 100% { box-shadow: 0 0 16px rgba(192,132,252,0.15); }
          50% { box-shadow: 0 0 28px rgba(192,132,252,0.35); }
        }
        @keyframes vega-glow {
          0%, 100% { box-shadow: 0 0 16px rgba(234,179,8,0.15); }
          50% { box-shadow: 0 0 28px rgba(234,179,8,0.35); }
        }
      `}</style>

      {/* ═══ Office Room ═══ */}
      <div
        className="relative w-full rounded-lg border border-gray-800 overflow-hidden"
        style={{
          backgroundColor: "#0A0A0A",
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          height: 650,
          fontFamily: "'Courier New', Courier, monospace",
        }}
      >
        {/* ── Ceiling ── */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gray-800/60" />

        {/* ══════════════════════════════════
            BACK WALL
            ══════════════════════════════════ */}
        <div className="absolute top-0 left-0 right-0" style={{ height: 160, backgroundColor: "#0e0e0e", borderBottom: "1px solid #222" }}>

          {/* "MISSION CONTROL" title */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 text-center">
            <div
              className="text-[10px] tracking-[0.3em] uppercase"
              style={{ color: "#555", fontFamily: "monospace" }}
            >
              ─── Command Center ───
            </div>
            <div
              className="text-xl tracking-[0.5em] uppercase font-bold mt-1"
              style={{
                color: "#e0e0e0",
                textShadow: "0 0 20px rgba(255,255,255,0.15)",
                fontFamily: "monospace",
                letterSpacing: "0.5em",
              }}
            >
              MISSION CONTROL
            </div>
          </div>

          {/* Cross ✝️ (center, subtle) */}
          <div
            className="absolute top-4 left-1/2 -translate-x-1/2"
            style={{ marginTop: 52, opacity: 0.2 }}
          >
            <div className="text-2xl" style={{ color: "#888" }}>✝️</div>
          </div>

          {/* Scoreboard — retro LED style */}
          <div
            className="absolute top-[90px] left-1/2 -translate-x-1/2 px-6 py-2 rounded border"
            style={{
              borderColor: "#333",
              backgroundColor: "#0a0a0a",
              boxShadow: "inset 0 0 20px rgba(0,0,0,0.5), 0 0 8px rgba(74,222,128,0.05)",
              animation: "led-flicker 4s infinite",
            }}
          >
            <div
              className="text-xs tracking-widest text-center"
              style={{
                color: "#4ade80",
                fontFamily: "monospace",
                textShadow: "0 0 6px rgba(74,222,128,0.6)",
              }}
            >
              LOANS CLOSED: 12 &nbsp;│&nbsp; PORTFOLIO: $340K
            </div>
          </div>

          {/* Whiteboard behind Fonz */}
          <div
            className="absolute top-[85px] left-[8%] px-3 py-2 rounded-sm"
            style={{
              backgroundColor: "#f5f5f0",
              border: "2px solid #ccc",
              boxShadow: "2px 2px 0 #333",
              maxWidth: 140,
            }}
          >
            <div style={{ color: "#1a1a1a", fontSize: 8, fontFamily: "monospace", fontWeight: "bold", lineHeight: 1.4 }}>
              Phase 1: Lock the<br />System 🔒
            </div>
            <div style={{ color: "#c00", fontSize: 7, fontFamily: "monospace", marginTop: 2 }}>
              ← WE ARE HERE
            </div>
          </div>

          {/* Jersey on wall behind Fonz */}
          <div
            className="absolute top-[30px] left-[10%] text-center"
            style={{ opacity: 0.7 }}
          >
            <div className="text-2xl">👕</div>
            <div style={{ fontSize: 7, color: "#555", fontFamily: "monospace" }}>#10</div>
          </div>

          {/* Coffee mug info behind Atlas side */}
          <div
            className="absolute top-[100px] right-[8%] px-2 py-1 rounded-sm"
            style={{
              backgroundColor: "#1a1a1a",
              border: "1px solid #333",
            }}
          >
            <div className="text-sm text-center">☕</div>
            <div style={{ fontSize: 6, color: "#666", fontFamily: "monospace", textAlign: "center", maxWidth: 60 }}>
              not a search engine
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════
            SUB-AGENT DESKS (back row, just below wall)
            ══════════════════════════════════ */}
        <div className="absolute top-[170px] left-1/2 -translate-x-1/2 flex gap-8">
          {[
            { name: "Sub-Agent 1", active: false },
            { name: "Sub-Agent 2", active: true },
            { name: "Sub-Agent 3", active: false },
          ].map((agent) => (
            <div key={agent.name} className="flex flex-col items-center" style={{ opacity: agent.active ? 0.9 : 0.35 }}>
              {/* Mini monitor */}
              <div
                className="w-12 h-9 rounded-sm border flex items-center justify-center"
                style={{
                  backgroundColor: agent.active ? "#0a1a0a" : "#111",
                  borderColor: agent.active ? "#4ade80" : "#333",
                  animation: agent.active ? "sub-agent-active 2s ease-in-out infinite" : "none",
                }}
              >
                <div
                  className="w-6 h-4 rounded-sm"
                  style={{
                    backgroundColor: agent.active ? "#0f2f0f" : "#1a1a1a",
                    border: `1px solid ${agent.active ? "#4ade80" : "#333"}`,
                  }}
                />
              </div>
              {/* Small desk */}
              <div
                className="w-10 h-3 rounded-sm mt-1"
                style={{
                  backgroundColor: agent.active ? "#1a2a1a" : "#1a1a1a",
                  border: `1px solid ${agent.active ? "#333" : "#222"}`,
                }}
              />
              <span
                className="mt-1"
                style={{
                  fontSize: 8,
                  color: agent.active ? "#4ade80" : "#444",
                  fontFamily: "monospace",
                }}
              >
                {agent.name}
              </span>
              <span
                style={{
                  fontSize: 7,
                  color: agent.active ? "#4ade80" : "#333",
                  fontFamily: "monospace",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                {agent.active ? "ACTIVE" : "IDLE"}
              </span>
            </div>
          ))}
        </div>

        {/* ══════════════════════════════════
            MIKE'S DESK — Far Left
            ══════════════════════════════════ */}
        <div className="absolute bottom-[70px] left-[2%] flex flex-col items-center">
          {/* Whiteboard behind desk */}
          <div
            className="absolute -top-[90px] px-2 py-1 rounded-sm"
            style={{
              backgroundColor: "#f5f5f0",
              border: "2px solid #ccc",
              boxShadow: "2px 2px 0 #333",
            }}
          >
            <div style={{ color: "#1a1a1a", fontSize: 8, fontFamily: "monospace", fontWeight: "bold" }}>
              4 posts/week
            </div>
          </div>
          {/* Character */}
          <div className="flex flex-col items-center mb-2">
            <div style={{ fontSize: 32 }}>📝</div>
            {/* Typing animation */}
            <div className="flex gap-0.5 mt-1">
              <div style={{ width: 3, height: 3, backgroundColor: "#4ade80", borderRadius: "50%", animation: "typing-cursor 0.8s ease-in-out infinite" }} />
              <div style={{ width: 3, height: 3, backgroundColor: "#4ade80", borderRadius: "50%", animation: "typing-cursor 0.8s ease-in-out 0.2s infinite" }} />
              <div style={{ width: 3, height: 3, backgroundColor: "#4ade80", borderRadius: "50%", animation: "typing-cursor 0.8s ease-in-out 0.4s infinite" }} />
            </div>
          </div>
          {/* Desk */}
          <div
            className="flex items-center justify-center"
            style={{
              width: 120, height: 24,
              backgroundColor: "#0a1a0a",
              borderRadius: 3,
              border: "1px solid rgba(74,222,128,0.3)",
              animation: "mike-glow 2s ease-in-out infinite",
            }}
          >
            <span style={{ fontSize: 10 }}>🖥️</span>
          </div>
          <span className="mt-2 font-bold" style={{ fontSize: 11, color: "#e0e0e0", fontFamily: "monospace" }}>
            Mike — SEO
          </span>
          <span
            className="mt-1 uppercase"
            style={{
              fontSize: 9, color: "#4ade80", fontFamily: "monospace",
              backgroundColor: "#0a1a0a", border: "1px solid rgba(74,222,128,0.3)",
              padding: "2px 8px", borderRadius: 3, letterSpacing: "0.15em",
            }}
          >
            Active
          </span>
        </div>

        {/* ══════════════════════════════════
            JAY JAY'S DESK — Between Mike & Atlas
            ══════════════════════════════════ */}
        <div className="absolute bottom-[70px] right-[32%] flex flex-col items-center">
          {/* Character */}
          <div className="flex flex-col items-center mb-2">
            <div style={{ fontSize: 32 }}>⚡</div>
            {/* Typing animation */}
            <div className="flex gap-0.5 mt-1">
              <div style={{ width: 3, height: 3, backgroundColor: "#fbbf24", borderRadius: "50%", animation: "typing-cursor 0.8s ease-in-out infinite" }} />
              <div style={{ width: 3, height: 3, backgroundColor: "#fbbf24", borderRadius: "50%", animation: "typing-cursor 0.8s ease-in-out 0.2s infinite" }} />
              <div style={{ width: 3, height: 3, backgroundColor: "#fbbf24", borderRadius: "50%", animation: "typing-cursor 0.8s ease-in-out 0.4s infinite" }} />
            </div>
          </div>
          {/* Desk */}
          <div
            className="flex items-center justify-center gap-1"
            style={{
              width: 130, height: 24,
              backgroundColor: "#1a1408",
              borderRadius: 3,
              border: "1px solid rgba(250,180,50,0.3)",
              animation: "jayjay-glow 2s ease-in-out infinite",
            }}
          >
            {/* Small monitor showing email count */}
            <div
              className="flex items-center justify-center"
              style={{
                width: 56, height: 14,
                backgroundColor: "#0a0a0a",
                borderRadius: 2,
                border: "1px solid rgba(250,180,50,0.4)",
              }}
            >
              <span style={{ fontSize: 7, color: "#fbbf24", fontFamily: "monospace" }}>14 emails loaded</span>
            </div>
          </div>
          <span className="mt-2 font-bold" style={{ fontSize: 11, color: "#e0e0e0", fontFamily: "monospace" }}>
            Jay Jay — Automation
          </span>
          <span
            className="mt-1 uppercase"
            style={{
              fontSize: 9, color: "#fbbf24", fontFamily: "monospace",
              backgroundColor: "#1a1408", border: "1px solid rgba(250,180,50,0.3)",
              padding: "2px 8px", borderRadius: 3, letterSpacing: "0.15em",
            }}
          >
            Active
          </span>
        </div>

        {/* ══════════════════════════════════
            FONZ'S DESK — Left Side
            ══════════════════════════════════ */}
        <div className="absolute bottom-[70px] left-[12%] flex flex-col items-center">
          {/* Pixel Character */}
          <div className="flex flex-col items-center mb-2" style={{ animation: "fonz-idle 3s ease-in-out infinite" }}>
            {/* Head */}
            <div
              className="flex items-center justify-center"
              style={{
                width: 28, height: 28,
                backgroundColor: "#b8860b",
                borderRadius: 3,
                border: "2px solid #8b6914",
              }}
            >
              <div className="flex gap-1">
                <div style={{ width: 5, height: 5, backgroundColor: "white", borderRadius: "50%" }} />
                <div style={{ width: 5, height: 5, backgroundColor: "white", borderRadius: "50%" }} />
              </div>
            </div>
            {/* Body */}
            <div
              style={{
                width: 34, height: 28,
                backgroundColor: "#1e3a5f",
                borderRadius: 3,
                border: "1px solid #162d4a",
                marginTop: 2,
                position: "relative",
              }}
            />
            {/* Arms */}
            <div className="flex" style={{ gap: 22, marginTop: -10 }}>
              <div style={{ width: 7, height: 14, backgroundColor: "#b8860b", borderRadius: 2, position: "relative" }}>
                {/* WHOOP band on left wrist */}
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 4,
                    borderRadius: 1,
                    animation: "whoop-pulse 2s ease-in-out infinite",
                  }}
                />
              </div>
              <div style={{ width: 7, height: 14, backgroundColor: "#b8860b", borderRadius: 2 }} />
            </div>
          </div>

          {/* Desk surface with warm glow */}
          <div
            className="flex items-center justify-center gap-2"
            style={{
              width: 150, height: 24,
              backgroundColor: "#2a1f14",
              borderRadius: 3,
              border: "1px solid #3d2d1a",
              boxShadow: "0 0 20px rgba(255,200,100,0.08), 0 -4px 12px rgba(255,200,100,0.05)",
            }}
          >
            {/* Monitor */}
            <div style={{ width: 32, height: 12, backgroundColor: "#333", borderRadius: 2, border: "1px solid #555" }} />
            {/* Soccer trophy */}
            <div style={{ fontSize: 12 }}>⚽</div>
            {/* Loan files with fade animation */}
            <div style={{ fontSize: 11, animation: "loan-fade 5s ease-in-out infinite" }}>📁</div>
          </div>

          {/* Name + badge */}
          <span
            className="mt-2 font-bold"
            style={{ fontSize: 12, color: "#e0e0e0", fontFamily: "monospace" }}
          >
            Fonz
          </span>
          <span
            className="mt-1 uppercase"
            style={{
              fontSize: 9,
              color: "#999",
              fontFamily: "monospace",
              backgroundColor: "#1a1a1a",
              border: "1px solid #333",
              padding: "2px 8px",
              borderRadius: 3,
              letterSpacing: "0.15em",
            }}
          >
            Owner / CEO
          </span>
        </div>

        {/* ══════════════════════════════════
            ATLAS'S DESK — Center Right
            ══════════════════════════════════ */}
        <div className="absolute bottom-[70px] right-[26%] flex flex-col items-center">
          {/* Lobster character with bounce */}
          <div
            className="flex flex-col items-center mb-2"
            style={{ animation: "atlas-bounce 1.2s ease-in-out infinite" }}
          >
            <div
              className="flex items-center justify-center"
              style={{
                width: 48, height: 48,
                fontSize: 36,
                animation: "atlas-pulse 2s ease-in-out infinite",
              }}
            >
              🦞
            </div>
          </div>

          {/* Desk surface with teal glow */}
          <div
            className="flex items-center justify-center gap-1"
            style={{
              width: 150, height: 24,
              backgroundColor: "#0a1a1a",
              borderRadius: 3,
              border: "1px solid rgba(0,180,180,0.3)",
              animation: "desk-glow-pulse 2s ease-in-out infinite",
            }}
          >
            {/* 3 monitors */}
            <span style={{ fontSize: 12 }}>🖥️</span>
            <span style={{ fontSize: 12 }}>🖥️</span>
            <span style={{ fontSize: 12 }}>🖥️</span>
          </div>

          {/* Name + badge */}
          <span
            className="mt-2 font-bold"
            style={{ fontSize: 12, color: "#e0e0e0", fontFamily: "monospace" }}
          >
            Atlas 🦞
          </span>
          <span
            className="mt-1 uppercase"
            style={{
              fontSize: 9,
              color: "#5eead4",
              fontFamily: "monospace",
              backgroundColor: "#0a1a1a",
              border: "1px solid rgba(0,180,180,0.3)",
              padding: "2px 8px",
              borderRadius: 3,
              letterSpacing: "0.15em",
            }}
          >
            Primary AI
          </span>
        </div>

        {/* ══════════════════════════════════
            MILO'S DESK — Far Right
            ══════════════════════════════════ */}
        <div className="absolute bottom-[70px] right-[2%] flex flex-col items-center">
          {/* Character */}
          <div className="flex flex-col items-center mb-2">
            <div style={{ fontSize: 32 }}>📊</div>
            {/* Typing animation */}
            <div className="flex gap-0.5 mt-1">
              <div style={{ width: 3, height: 3, backgroundColor: "#3b82f6", borderRadius: "50%", animation: "typing-cursor 0.8s ease-in-out infinite" }} />
              <div style={{ width: 3, height: 3, backgroundColor: "#3b82f6", borderRadius: "50%", animation: "typing-cursor 0.8s ease-in-out 0.2s infinite" }} />
              <div style={{ width: 3, height: 3, backgroundColor: "#3b82f6", borderRadius: "50%", animation: "typing-cursor 0.8s ease-in-out 0.4s infinite" }} />
            </div>
          </div>
          {/* Desk */}
          <div
            className="flex items-center justify-center gap-1"
            style={{
              width: 130, height: 24,
              backgroundColor: "#0a0e1a",
              borderRadius: 3,
              border: "1px solid rgba(59,130,246,0.3)",
              animation: "milo-glow 2s ease-in-out infinite",
            }}
          >
            {/* Small monitor showing pipeline count */}
            <div
              className="flex items-center justify-center"
              style={{
                width: 60, height: 14,
                backgroundColor: "#0a0a0a",
                borderRadius: 2,
                border: "1px solid rgba(59,130,246,0.4)",
              }}
            >
              <span style={{ fontSize: 7, color: "#3b82f6", fontFamily: "monospace" }}>Pipeline: 15 files</span>
            </div>
          </div>
          <span className="mt-2 font-bold" style={{ fontSize: 11, color: "#e0e0e0", fontFamily: "monospace" }}>
            Milo — Ops
          </span>
          <span
            className="mt-1 uppercase"
            style={{
              fontSize: 9, color: "#3b82f6", fontFamily: "monospace",
              backgroundColor: "#0a0e1a", border: "1px solid rgba(59,130,246,0.3)",
              padding: "2px 8px", borderRadius: 3, letterSpacing: "0.15em",
            }}
          >
            Active
          </span>
        </div>

        {/* ══════════════════════════════════
            MILLAN'S DESK — Next to Milo
            ══════════════════════════════════ */}
        <div className="absolute bottom-[70px] right-[14%] flex flex-col items-center">
          {/* Whiteboard behind desk */}
          <div
            className="absolute -top-[90px] px-2 py-1 rounded-sm"
            style={{
              backgroundColor: "#f5f5f0",
              border: "2px solid #ccc",
              boxShadow: "2px 2px 0 #333",
            }}
          >
            <div style={{ color: "#1a1a1a", fontSize: 8, fontFamily: "monospace", fontWeight: "bold" }}>
              8am briefing ready
            </div>
          </div>
          {/* Character */}
          <div className="flex flex-col items-center mb-2">
            <div style={{ fontSize: 32 }}>🌅</div>
            {/* Typing animation */}
            <div className="flex gap-0.5 mt-1">
              <div style={{ width: 3, height: 3, backgroundColor: "#f59e0b", borderRadius: "50%", animation: "typing-cursor 0.8s ease-in-out infinite" }} />
              <div style={{ width: 3, height: 3, backgroundColor: "#f59e0b", borderRadius: "50%", animation: "typing-cursor 0.8s ease-in-out 0.2s infinite" }} />
              <div style={{ width: 3, height: 3, backgroundColor: "#f59e0b", borderRadius: "50%", animation: "typing-cursor 0.8s ease-in-out 0.4s infinite" }} />
            </div>
          </div>
          {/* Desk */}
          <div
            className="flex items-center justify-center"
            style={{
              width: 120, height: 24,
              backgroundColor: "#1a1408",
              borderRadius: 3,
              border: "1px solid rgba(245,158,11,0.3)",
              animation: "millan-glow 2s ease-in-out infinite",
            }}
          >
            <span style={{ fontSize: 10 }}>🖥️</span>
          </div>
          <span className="mt-2 font-bold" style={{ fontSize: 11, color: "#e0e0e0", fontFamily: "monospace" }}>
            Millan — Intel
          </span>
          <span
            className="mt-1 uppercase"
            style={{
              fontSize: 9, color: "#f59e0b", fontFamily: "monospace",
              backgroundColor: "#1a1408", border: "1px solid rgba(245,158,11,0.3)",
              padding: "2px 8px", borderRadius: 3, letterSpacing: "0.15em",
            }}
          >
            Active
          </span>
        </div>

        {/* ══════════════════════════════════
            NOVA'S DESK — Between Jay Jay & Millan
            ══════════════════════════════════ */}
        <div className="absolute bottom-[70px] right-[20%] flex flex-col items-center">
          {/* Character */}
          <div className="flex flex-col items-center mb-2">
            <div style={{ fontSize: 32 }}>✨</div>
            {/* Typing animation */}
            <div className="flex gap-0.5 mt-1">
              <div style={{ width: 3, height: 3, backgroundColor: "#c084fc", borderRadius: "50%", animation: "typing-cursor 0.8s ease-in-out infinite" }} />
              <div style={{ width: 3, height: 3, backgroundColor: "#c084fc", borderRadius: "50%", animation: "typing-cursor 0.8s ease-in-out 0.2s infinite" }} />
              <div style={{ width: 3, height: 3, backgroundColor: "#c084fc", borderRadius: "50%", animation: "typing-cursor 0.8s ease-in-out 0.4s infinite" }} />
            </div>
          </div>
          {/* Desk */}
          <div
            className="flex items-center justify-center gap-1"
            style={{
              width: 130, height: 24,
              backgroundColor: "#1a0a1a",
              borderRadius: 3,
              border: "1px solid rgba(192,132,252,0.3)",
              animation: "nova-glow 2s ease-in-out infinite",
            }}
          >
            {/* Small monitor showing scheduled posts */}
            <div
              className="flex items-center justify-center"
              style={{
                width: 64, height: 14,
                backgroundColor: "#0a0a0a",
                borderRadius: 2,
                border: "1px solid rgba(192,132,252,0.4)",
              }}
            >
              <span style={{ fontSize: 7, color: "#c084fc", fontFamily: "monospace" }}>3 posts scheduled</span>
            </div>
          </div>
          <span className="mt-2 font-bold" style={{ fontSize: 11, color: "#e0e0e0", fontFamily: "monospace" }}>
            Nova — Brand
          </span>
          <span
            className="mt-1 uppercase"
            style={{
              fontSize: 9, color: "#c084fc", fontFamily: "monospace",
              backgroundColor: "#1a0a1a", border: "1px solid rgba(192,132,252,0.3)",
              padding: "2px 8px", borderRadius: 3, letterSpacing: "0.15em",
            }}
          >
            Active
          </span>
        </div>

        {/* ══════════════════════════════════
            VEGA'S DESK — Between Mike & Fonz
            ══════════════════════════════════ */}
        <div className="absolute bottom-[70px] left-[26%] flex flex-col items-center">
          {/* Character */}
          <div className="flex flex-col items-center mb-2">
            <div style={{ fontSize: 32 }}>⚡</div>
            {/* Typing animation */}
            <div className="flex gap-0.5 mt-1">
              <div style={{ width: 3, height: 3, backgroundColor: "#eab308", borderRadius: "50%", animation: "typing-cursor 0.8s ease-in-out infinite" }} />
              <div style={{ width: 3, height: 3, backgroundColor: "#eab308", borderRadius: "50%", animation: "typing-cursor 0.8s ease-in-out 0.2s infinite" }} />
              <div style={{ width: 3, height: 3, backgroundColor: "#eab308", borderRadius: "50%", animation: "typing-cursor 0.8s ease-in-out 0.4s infinite" }} />
            </div>
          </div>
          {/* Desk */}
          <div
            className="flex items-center justify-center gap-1"
            style={{
              width: 130, height: 24,
              backgroundColor: "#1a1708",
              borderRadius: 3,
              border: "1px solid rgba(234,179,8,0.3)",
              animation: "vega-glow 2s ease-in-out infinite",
            }}
          >
            {/* Multiple monitors showing charts */}
            <span style={{ fontSize: 10 }}>📊</span>
            <span style={{ fontSize: 10 }}>🖥️</span>
            <span style={{ fontSize: 10 }}>📈</span>
          </div>
          <span className="mt-2 font-bold" style={{ fontSize: 11, color: "#e0e0e0", fontFamily: "monospace" }}>
            Vega — Finance
          </span>
          <span
            className="mt-1 uppercase"
            style={{
              fontSize: 9, color: "#eab308", fontFamily: "monospace",
              backgroundColor: "#1a1708", border: "1px solid rgba(234,179,8,0.3)",
              padding: "2px 8px", borderRadius: 3, letterSpacing: "0.15em",
            }}
          >
            Active
          </span>
        </div>

        {/* ── Floor gradient ── */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />

        {/* ══════════════════════════════════
            BOTTOM TICKER / MARQUEE
            ══════════════════════════════════ */}
        <div
          className="absolute bottom-0 left-0 right-0 overflow-hidden"
          style={{
            height: 22,
            backgroundColor: "#0a0a0a",
            borderTop: "1px solid #222",
          }}
        >
          <div
            className="whitespace-nowrap"
            style={{
              animation: "marquee 20s linear infinite",
              fontSize: 10,
              color: "#4ade80",
              fontFamily: "monospace",
              lineHeight: "22px",
              paddingLeft: "100%",
            }}
          >
            Mike: Mapping Kern County keywords... &nbsp;│&nbsp; Jay Jay: Drafting Email sequence... &nbsp;│&nbsp; Milo: Monitoring 15 active files... &nbsp;│&nbsp; Millan: Preparing morning briefing... &nbsp;│&nbsp; Nova: Scheduling this week&apos;s content... &nbsp;│&nbsp; Vega: Scanning market data... &nbsp;│&nbsp; Atlas: Reviewing deliverables... &nbsp;│&nbsp; Fonz: Reviewing Office Screen... &nbsp;│&nbsp; Sub-Agent 2: Processing... &nbsp;│&nbsp; Sub-Agent 1: Idle &nbsp;│&nbsp; Sub-Agent 3: Idle &nbsp;│&nbsp; System: All clear ✓
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════
          STATUS PANEL — Side-by-side cards
          ══════════════════════════════════ */}
      <div className="w-full grid grid-cols-8 gap-4">
        {/* Fonz status card */}
        <div
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "#111",
            borderColor: "#282828",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#4ade80" }} />
            <span style={{ fontSize: 13, color: "#e0e0e0", fontFamily: "monospace", fontWeight: "bold" }}>Fonz</span>
          </div>
          <div style={{ fontSize: 10, color: "#666", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Role: Owner / CEO
          </div>
          <div className="mt-2" style={{ fontSize: 11, color: "#999", fontFamily: "monospace" }}>
            Status: <span style={{ color: "#4ade80" }}>Reviewing</span>
          </div>
        </div>

        {/* Atlas status card */}
        <div
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "#0a1414",
            borderColor: "rgba(0,180,180,0.25)",
            boxShadow: "0 0 12px rgba(0,180,180,0.05)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#4ade80" }} />
            <span style={{ fontSize: 13, color: "#e0e0e0", fontFamily: "monospace", fontWeight: "bold" }}>Atlas 🦞</span>
          </div>
          <div style={{ fontSize: 10, color: "#666", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Role: Primary AI
          </div>
          <div className="mt-2" style={{ fontSize: 11, color: "#999", fontFamily: "monospace" }}>
            Status: <span style={{ color: "#5eead4" }}>Reviewing deliverables</span>
          </div>
        </div>

        {/* Mike status card */}
        <div
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "#0a140a",
            borderColor: "rgba(74,222,128,0.25)",
            boxShadow: "0 0 12px rgba(74,222,128,0.05)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#4ade80" }} />
            <span style={{ fontSize: 13, color: "#e0e0e0", fontFamily: "monospace", fontWeight: "bold" }}>Mike 📝</span>
          </div>
          <div style={{ fontSize: 10, color: "#666", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Role: SEO & Content
          </div>
          <div className="mt-2" style={{ fontSize: 11, color: "#999", fontFamily: "monospace" }}>
            Status: <span style={{ color: "#4ade80" }}>Writing city pages</span>
          </div>
        </div>

        {/* Jay Jay status card */}
        <div
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "#141008",
            borderColor: "rgba(250,180,50,0.25)",
            boxShadow: "0 0 12px rgba(250,180,50,0.05)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#fbbf24" }} />
            <span style={{ fontSize: 13, color: "#e0e0e0", fontFamily: "monospace", fontWeight: "bold" }}>Jay Jay ⚡</span>
          </div>
          <div style={{ fontSize: 10, color: "#666", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Role: Lead Capture & Automation
          </div>
          <div className="mt-2" style={{ fontSize: 11, color: "#999", fontFamily: "monospace" }}>
            Status: <span style={{ color: "#fbbf24" }}>Building nurture sequence</span>
          </div>
        </div>

        {/* Milo status card */}
        <div
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "#0a0e14",
            borderColor: "rgba(59,130,246,0.25)",
            boxShadow: "0 0 12px rgba(59,130,246,0.05)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#3b82f6" }} />
            <span style={{ fontSize: 13, color: "#e0e0e0", fontFamily: "monospace", fontWeight: "bold" }}>Milo 📊</span>
          </div>
          <div style={{ fontSize: 10, color: "#666", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Role: Lending Ops & Pipeline
          </div>
          <div className="mt-2" style={{ fontSize: 11, color: "#999", fontFamily: "monospace" }}>
            Status: <span style={{ color: "#3b82f6" }}>Monitoring 15 files</span>
          </div>
        </div>

        {/* Millan status card */}
        <div
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "#141008",
            borderColor: "rgba(245,158,11,0.25)",
            boxShadow: "0 0 12px rgba(245,158,11,0.05)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#f59e0b" }} />
            <span style={{ fontSize: 13, color: "#e0e0e0", fontFamily: "monospace", fontWeight: "bold" }}>Millan 🌅</span>
          </div>
          <div style={{ fontSize: 10, color: "#666", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Role: Personal Intel & Briefing
          </div>
          <div className="mt-2" style={{ fontSize: 11, color: "#999", fontFamily: "monospace" }}>
            Status: <span style={{ color: "#f59e0b" }}>Briefing ready</span>
          </div>
        </div>

        {/* Nova status card */}
        <div
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "#140a14",
            borderColor: "rgba(192,132,252,0.25)",
            boxShadow: "0 0 12px rgba(192,132,252,0.05)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#c084fc" }} />
            <span style={{ fontSize: 13, color: "#e0e0e0", fontFamily: "monospace", fontWeight: "bold" }}>Nova ✨</span>
          </div>
          <div style={{ fontSize: 10, color: "#666", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Role: Brand & Social
          </div>
          <div className="mt-2" style={{ fontSize: 11, color: "#999", fontFamily: "monospace" }}>
            Status: <span style={{ color: "#c084fc" }}>3 posts scheduled</span>
          </div>
        </div>

        {/* Vega status card */}
        <div
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "#141408",
            borderColor: "rgba(234,179,8,0.25)",
            boxShadow: "0 0 12px rgba(234,179,8,0.05)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#eab308" }} />
            <span style={{ fontSize: 13, color: "#e0e0e0", fontFamily: "monospace", fontWeight: "bold" }}>Vega ⚡</span>
          </div>
          <div style={{ fontSize: 10, color: "#666", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Role: Financial Intel
          </div>
          <div className="mt-2" style={{ fontSize: 11, color: "#999", fontFamily: "monospace" }}>
            Status: <span style={{ color: "#eab308" }}>Scanning markets</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Org Card Component (shared)
   ═══════════════════════════════════════════ */

function OrgCard({
  name,
  subtitle,
  role,
  model,
  responsibilities,
  status,
  variant,
}: {
  name: string;
  subtitle?: string;
  role: string;
  model?: string;
  responsibilities?: string;
  status: "active" | "idle";
  variant: "human" | "primary" | "agent";
}) {
  const isActive = status === "active";

  const borderColor =
    variant === "primary"
      ? "border-red-900/80"
      : variant === "human"
        ? "border-gray-600"
        : "border-gray-800";

  const bgColor =
    variant === "primary"
      ? "bg-[#1a0a0a]"
      : variant === "human"
        ? "bg-[#111318]"
        : "bg-[#111111]";

  return (
    <div
      className={`relative rounded-lg border ${borderColor} ${bgColor} px-5 py-4 w-52`}
      style={
        variant === "primary"
          ? { boxShadow: "0 0 20px rgba(220, 40, 40, 0.08)" }
          : undefined
      }
    >
      {/* Status dot */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: isActive ? "#4ade80" : "#6b7280" }}
        />
        <span
          className="text-xs"
          style={{ color: isActive ? "#4ade80" : "#6b7280" }}
        >
          {isActive ? "Active" : "Idle"}
        </span>
      </div>

      <h3 className="text-gray-100 text-sm font-semibold">{name}</h3>

      {subtitle && (
        <p className="text-gray-500 text-xs mt-0.5">{subtitle}</p>
      )}

      <p className="text-gray-400 text-xs mt-1">{role}</p>

      {model && (
        <p className="text-gray-600 text-xs mt-2">
          <span className="text-gray-500">Model:</span> {model}
        </p>
      )}

      {responsibilities && (
        <p className="text-gray-600 text-xs mt-1 leading-relaxed">
          {responsibilities}
        </p>
      )}

      {variant === "human" && (
        <span className="inline-block mt-2 px-2 py-0.5 text-[10px] rounded bg-gray-800 text-gray-400 uppercase tracking-wider">
          Human
        </span>
      )}
    </div>
  );
}
