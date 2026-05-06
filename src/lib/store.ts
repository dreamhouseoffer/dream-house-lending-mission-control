import { Task, ActivityEvent, ScheduledItem, Project, MemoryEntry, Doc, Tool, TeamMember, ContentPost } from "./types";

function get<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function set<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

// ---- Tasks ----
const TASKS_KEY = "mc_tasks";
export const getTasks = (): Task[] => get(TASKS_KEY, defaultTasks);
export const saveTasks = (tasks: Task[]) => set(TASKS_KEY, tasks);

// ---- Activity Feed ----
const ACTIVITY_KEY = "mc_activity";
export const getActivity = (): ActivityEvent[] => get(ACTIVITY_KEY, defaultActivity);
export const saveActivity = (events: ActivityEvent[]) => set(ACTIVITY_KEY, events);
export const addActivity = (text: string, type: ActivityEvent["type"] = "system") => {
  const events = getActivity();
  events.unshift({ id: crypto.randomUUID(), text, timestamp: new Date().toISOString(), type });
  if (events.length > 50) events.length = 50;
  saveActivity(events);
};

// ---- Schedule ----
const SCHEDULE_KEY = "mc_schedule";
export const getSchedule = (): ScheduledItem[] => get(SCHEDULE_KEY, defaultSchedule);
export const saveSchedule = (items: ScheduledItem[]) => set(SCHEDULE_KEY, items);

// ---- Projects ----
const PROJECTS_KEY = "mc_projects";
export const getProjects = (): Project[] => get(PROJECTS_KEY, defaultProjects);
export const saveProjects = (projects: Project[]) => set(PROJECTS_KEY, projects);

// ---- Memory ----
const MEMORY_KEY = "mc_memory";
export const getMemory = (): MemoryEntry[] => get(MEMORY_KEY, defaultMemory);
export const saveMemory = (entries: MemoryEntry[]) => set(MEMORY_KEY, entries);

// ---- Docs ----
const DOCS_KEY = "mc_docs";
export const getDocs = (): Doc[] => get(DOCS_KEY, defaultDocs);
export const saveDocs = (docs: Doc[]) => set(DOCS_KEY, docs);

// ---- Tools ----
const TOOLS_KEY = "mc_tools";
export const getTools = (): Tool[] => get(TOOLS_KEY, defaultTools);

// ---- Content Queue ----
const CONTENT_KEY = "mc_content";
export const getContent = (): ContentPost[] => get(CONTENT_KEY, defaultContent);
export const saveContent = (posts: ContentPost[]) => set(CONTENT_KEY, posts);

// ---- Team ----
export const getTeam = (): TeamMember[] => defaultTeam;

// ============ DEFAULTS ============

const defaultTasks: Task[] = [
  {
    id: "mc1",
    title: "Push every active loan into a clear next step",
    description: "Hermi Ops should turn the active pipeline into a short owner-by-owner push list: borrower/file, blocker, owner, next touch, and revenue risk.",
    nextAction: "Start with loans closing or locks expiring this week.",
    assignee: "hermi_ops",
    category: "loans",
    priority: "high",
    status: "ready",
    createdAt: new Date().toISOString(),
  },
  {
    id: "mc2",
    title: "Weekly CFO closeout orders",
    description: "Review Finance tabs for LO P&L, credit leakage, reimbursements, expenses, and what needs Monday.com/vendor cleanup.",
    nextAction: "Open /finance and write 3 CFO orders only.",
    assignee: "fonz",
    category: "finance",
    priority: "high",
    status: "in_progress",
    createdAt: new Date().toISOString(),
  },
  {
    id: "mc3",
    title: "Train Ask Hermi on the next loan SOP",
    description: "Upload or paste one high-value training so Claudia/Nataly can ask how Fonz would handle it later.",
    nextAction: "Prioritize soft pull, income review, AUS, or ready-to-sell file review.",
    assignee: "hermi_dev",
    category: "training",
    priority: "medium",
    status: "triage",
    createdAt: new Date().toISOString(),
  },
  {
    id: "mc4",
    title: "KW lead source operating rhythm",
    description: "Define the one lead source rhythm worth executing this week instead of adding a new side play.",
    nextAction: "Assign Claudia/Nataly follow-up blocks and define a daily scorecard.",
    assignee: "claudia",
    category: "lead_gen",
    priority: "high",
    status: "ready",
    createdAt: new Date().toISOString(),
  },
  {
    id: "mc5",
    title: "Create Hermi Ops recurring triage loop",
    description: "Set up the Hermes-side cron/profile workflow later so triage tasks are expanded automatically. UI is now ready; backend automation is the next move.",
    nextAction: "Create Hermi Ops profile + 15 minute Kanban triage cron once dashboard API/storage is connected.",
    assignee: "hermi_dev",
    category: "dev",
    priority: "medium",
    status: "blocked",
    createdAt: new Date().toISOString(),
  },
];

const defaultActivity: ActivityEvent[] = [
  { id: "a1", text: "Hermi Ops board initialized inside Mission Control", timestamp: new Date().toISOString(), type: "system" },
  { id: "a2", text: "Alex Finn workflow translated into DHL: Triage → Ready → In Progress → Blocked → Done", timestamp: new Date().toISOString(), type: "agent" },
  { id: "a3", text: "Rule added: no client-facing actions without human approval", timestamp: new Date().toISOString(), type: "system" },
];

const defaultSchedule: ScheduledItem[] = [
  { id: "s1", name: "Heartbeat Check", cron: "*/30 * * * *", humanSchedule: "Every 30 minutes", agent: "Jarvis", nextRun: "Next :00 or :30", dayOfWeek: -1, hour: -1 },
  { id: "s2", name: "Daily Briefing", cron: "0 8 * * *", humanSchedule: "Daily at 8:00 AM", agent: "Jarvis", nextRun: "Tomorrow 8:00 AM", dayOfWeek: -1, hour: 8 },
  { id: "s3", name: "Lead Follow-up Sweep", cron: "0 10 * * 1-5", humanSchedule: "Weekdays at 10:00 AM", agent: "Jarvis", nextRun: "Next weekday 10:00 AM", dayOfWeek: 1, hour: 10 },
  { id: "s4", name: "Weekly Pipeline Report", cron: "0 17 * * 5", humanSchedule: "Fridays at 5:00 PM", agent: "Jarvis", nextRun: "Friday 5:00 PM", dayOfWeek: 5, hour: 17 },
  { id: "s5", name: "Memory Consolidation", cron: "0 23 * * *", humanSchedule: "Daily at 11:00 PM", agent: "Jarvis", nextRun: "Tonight 11:00 PM", dayOfWeek: -1, hour: 23 },
];

const defaultProjects: Project[] = [
  { id: "p1", name: "Jarvis Mission Control", description: "Building the command center for all operations", progress: 15, status: "active", taskCount: 12 },
  { id: "p2", name: "Mortgage Business Automation", description: "AI operator for loan pipeline — intake to close", progress: 25, status: "active", taskCount: 18 },
  { id: "p3", name: "CRM Build", description: "Automating client/referral workflow and follow-ups", progress: 20, status: "active", taskCount: 9 },
  { id: "p4", name: "Wealth & Investing", description: "Tax liens, land flipping, NOD/NOT strategy", progress: 10, status: "planning", taskCount: 6 },
  { id: "p5", name: "Team & Delegation", description: "Getting Fonz out of the bottleneck — systems over self", progress: 30, status: "active", taskCount: 8 },
];

const defaultMemory: MemoryEntry[] = [
  {
    id: "m1", date: new Date().toISOString().split("T")[0], type: "daily",
    content: "## Daily Log\n\n- Mission Control build started\n- Reviewed task board architecture\n- Jarvis initialized all core systems\n- Fonz reviewed CRM schema proposal",
  },
  {
    id: "m2", date: new Date(Date.now() - 86400000).toISOString().split("T")[0], type: "daily",
    content: "## Daily Log\n\n- Researched Next.js 14 app router patterns\n- Set up project repository\n- Outlined all 8 Mission Control pages\n- Discussed mortgage pipeline automation scope",
  },
  {
    id: "m3", date: "2025-01-01", type: "longterm",
    content: `## Fonz — Core Profile\n\n**Name:** Alfonso "Fonz" Garza\n**Role:** Owner/CEO\n**Mission:** Build a lean, AI-powered operation that generates income and wealth without requiring constant presence.\n\n## Phase Plan\n\n1. **Foundation** — Build Mission Control, set up Jarvis, core tools\n2. **Mortgage Ops** — Automate loan pipeline, CRM, lead management\n3. **Wealth Building** — Tax liens, land deals, passive income streams\n4. **Scale** — Team delegation, sub-agents, full autonomy\n\n## Core Goals\n\n- Family, faith, and freedom above all\n- AI-first operations — minimize manual work\n- Multiple income streams under one command center\n- Ship fast, iterate, don't overthink`,
  },
];

const defaultDocs: Doc[] = [
  {
    id: "d1", title: "Loan Pipeline Process", category: "mortgage", createdAt: new Date().toISOString(),
    preview: "End-to-end mortgage origination workflow...",
    content: `# Loan Pipeline Process\n\n## Overview\nEnd-to-end mortgage origination workflow from lead intake to closing.\n\n## Stages\n1. **Lead Intake** — Capture from referral partners, web, social\n2. **Pre-qualification** — Pull credit, verify income (W-2/VOE)\n3. **Application** — Full 1003, disclosures\n4. **Processing** — Conditions, appraisal, title\n5. **Underwriting** — Final review and approval\n6. **Closing** — Docs, funding, recording\n\n## Automation Targets\n- Auto-assign leads based on source\n- Trigger follow-ups at each stage\n- Generate status updates for borrowers`,
  },
  {
    id: "d2", title: "Tax Lien Investment Strategy", category: "investing", createdAt: new Date().toISOString(),
    preview: "Strategy for acquiring tax lien certificates...",
    content: `# Tax Lien Investment Strategy\n\n## What Are Tax Liens?\nWhen property owners fail to pay taxes, the county sells the debt as a certificate. You buy the lien, earn interest, and potentially acquire the property.\n\n## Target Counties\n- Research counties with high redemption rates\n- Focus on residential properties under $200K assessed value\n- Avoid environmental hazard zones\n\n## Process\n1. Research county auction schedules\n2. Pull property lists 30 days before auction\n3. Filter and rank by criteria\n4. Set max bid amounts\n5. Attend auction (online preferred)\n6. Track redemption periods\n\n## Expected Returns\n- Redemption interest: 8-36% depending on state\n- Property acquisition: Below market value`,
  },
  {
    id: "d3", title: "Jarvis System Architecture", category: "systems", createdAt: new Date().toISOString(),
    preview: "Technical architecture for the Jarvis AI system...",
    content: `# Jarvis System Architecture\n\n## Core Components\n- **Mission Control** — Web dashboard (Next.js)\n- **Jarvis Core** — Claude-based orchestrator\n- **Memory System** — Long-term + daily logs\n- **Task Engine** — Kanban + automated workflows\n- **Cron Scheduler** — Recurring automated tasks\n\n## Communication\n- Jarvis reads/writes to localStorage (Mission Control)\n- Claude Code handles all development tasks\n- Sub-agents spawned for parallel operations\n\n## Principles\n- Ship fast, iterate often\n- AI handles execution, Fonz handles strategy\n- Everything logged, nothing lost`,
  },
];

const defaultTools: Tool[] = [
  { id: "t1", name: "Loan Pipeline Tracker", description: "Track mortgage applications from lead to close with automated stage transitions", status: "building" },
  { id: "t2", name: "Lead Source ROI Calculator", description: "Analyze which lead sources generate the best return on investment", status: "planned" },
  { id: "t3", name: "Daily Briefing Generator", description: "Auto-generate morning briefings with tasks, pipeline status, and priorities", status: "building" },
  { id: "t4", name: "Client Follow-up Automator", description: "Automated follow-up sequences for borrowers and referral partners", status: "planned" },
  { id: "t5", name: "Income Analyzer", description: "W-2 and VOE income calculation engine for loan qualification", status: "planned" },
];

const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
const monday = (() => { const d = new Date(); d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7)); return d.toISOString().split("T")[0]; })();
const wednesday = (() => { const d = new Date(); d.setDate(d.getDate() + ((3 + 7 - d.getDay()) % 7 || 7)); return d.toISOString().split("T")[0]; })();
const friday = (() => { const d = new Date(); d.setDate(d.getDate() + ((5 + 7 - d.getDay()) % 7 || 7)); return d.toISOString().split("T")[0]; })();

const defaultContent: ContentPost[] = [
  {
    id: "cp1",
    platform: "Instagram",
    caption: "📊 FHA rates just hit 5.86% vs 6.36% conventional — if you're a first-time buyer in Bakersfield, this is your window. DM me and let's get you pre-approved before rates shift again.\n\n#BakersfieldRealEstate #FHALoan #DreamHouseLending #FirstTimeHomeBuyer #MortgageBroker\n\nNMLS# 1708922",
    suggestedDate: tomorrow,
    agent: "Nova ✨",
    status: "Pending",
  },
  {
    id: "cp2",
    platform: "LinkedIn",
    caption: "Everyone's waiting for the \"perfect\" rate.\n\nMeanwhile, the Fed just signaled no cuts coming. Inventory is still tight. And prices keep climbing.\n\nBuyers who move now — even at 6.5% — will look smart in 18 months when they've built equity and can refi into something lower.\n\nStop timing the market. Start building wealth.\n\nIf you're ready to talk pre-approvals, let's connect.\n\n#MortgageBroker #Bakersfield #RealEstate #HomeOwnership",
    suggestedDate: monday,
    agent: "Nova ✨",
    status: "Pending",
  },
  {
    id: "cp3",
    platform: "Facebook",
    caption: "🏡 Quick market update for Bakersfield families:\n\nRates are holding steady — FHA around 5.86%, conventional near 6.36%. Still very doable.\n\nDid you know CalHFA down payment assistance is still available? You might qualify for help with your down payment AND closing costs.\n\nCall me at 310-415-1359 or send a message to learn more. Let's get your family into a home this year.\n\nNMLS# 1708922 | Dream House Lending",
    suggestedDate: wednesday,
    agent: "Nova ✨",
    status: "Pending",
  },
  {
    id: "cp4",
    platform: "YouTube",
    caption: "🎥 SHORT VIDEO IDEA: \"3 Things Keeping You From Buying a Home in Bakersfield\"\n\n1. Waiting for perfect credit (you don't need a 740 — FHA goes down to 580)\n2. Not knowing about down payment assistance (CalHFA, GSFA, chenoa fund)\n3. Thinking you need 20% down (most first-time buyers put down 3-3.5%)\n\nCTA: Book a free 15-min call — link in bio.\n\nKeep it under 60 seconds. Casual, straight to camera. Alpha energy.",
    suggestedDate: friday,
    agent: "Nova ✨",
    status: "Pending",
  },
  {
    id: "cp5",
    platform: "Instagram",
    caption: "Friday reminder: You're not just buying a house — you're building something for your family.\n\nEvery payment is a brick. Every year is a step closer to generational wealth.\n\nKeep going. Keep building. 🧱👊\n\n#DreamHouseLending #AlphaDad #Bakersfield #BuildWealth #FridayMotivation",
    suggestedDate: friday,
    agent: "Nova ✨",
    status: "Pending",
  },
];

const defaultTeam: TeamMember[] = [
  { id: "tm1", name: "Fonz", role: "Owner / CEO", type: "human", responsibilities: "Strategy, decisions, client relationships, vision", status: "active" },
  { id: "tm2", name: "Jarvis 🦞", role: "Primary AI Assistant", type: "ai", model: "claude-sonnet-4-6", responsibilities: "Orchestration, memory, task management, automation", status: "active" },
  { id: "tm3", name: "Mike", role: "SEO & Content Agent", type: "ai", model: "claude-sonnet-4-6", responsibilities: "Keywords, blog posts, city pages, loan product pages, Google Business Profile, rank tracking", status: "active" },
  { id: "tm4", name: "Jay Jay", role: "Lead Capture & Automation Agent", type: "ai", model: "claude-sonnet-4-6", responsibilities: "Lead capture forms, 14-email nurture sequence, Calendly integration, review generation, weekly dashboard", status: "active" },
  { id: "tm5", name: "Milo", role: "Lending Operations & Pipeline Agent", type: "ai", model: "claude-haiku-4-5-20251001", responsibilities: "Daily pipeline briefings, stale file alerts, rate lock tracking, referral agent emails, post-closing triggers", status: "active" },
  { id: "tm6", name: "Millan", role: "Personal Intelligence & Briefing Agent", type: "ai", model: "claude-haiku-4-5-20251001", responsibilities: "Daily 7am personal briefing — mortgage market pulse, Bakersfield weather, husband/dad tips, personal development", status: "active" },
  { id: "tm7", name: "Nova ✨", role: "Social Media & Brand Manager", type: "ai", model: "claude-sonnet-4-6", responsibilities: "LinkedIn, Instagram, Facebook, YouTube content. Turns market intel and client wins into social content that builds Fonz's brand and attracts leads.", status: "active" },
  { id: "tm8", name: "Claude Code", role: "Coding Agent", type: "ai", model: "claude-sonnet-4-6", responsibilities: "Builds and ships features, debugging, code review", status: "active" },
  { id: "tm10", name: "Vega ⚡", role: "Financial Intelligence Agent", type: "ai", model: "claude-haiku-4-5-20251001", responsibilities: "Market analysis, stock/crypto research, technical analysis, macro intelligence, trade ideas", status: "active" },
  { id: "tm9", name: "Sub-agents", role: "Parallel Workers", type: "ai", model: "Various", responsibilities: "Spawned for parallel research, data processing, and specialized tasks", status: "idle" },
];
