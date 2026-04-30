"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useNav } from "@/components/nav-context";
import type { LucideIcon } from "lucide-react";
import {
  Archive,
  BarChart3,
  CalendarDays,
  CheckSquare,
  ChevronRight,
  CircleDollarSign,
  Clapperboard,
  Command,
  DollarSign,
  Flame,
  FolderKanban,
  GitBranch,
  LineChart,
  Mail,
  ShieldAlert,
  Target,
  Users,
  X,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  intent: "command" | "money" | "revenue" | "people" | "review" | "parking";
  useful: "Core" | "Useful" | "Park";
  note: string;
};

type NavSection = {
  title: string;
  subtitle: string;
  items: NavItem[];
};

const sections: NavSection[] = [
  {
    title: "Command",
    subtitle: "Start here every morning",
    items: [
      {
        href: "/projects",
        label: "CEO OS",
        short: "OS",
        icon: FolderKanban,
        intent: "command",
        useful: "Core",
        note: "Next moves, owners, risks",
      },
      {
        href: "/",
        label: "Live Room",
        short: "Live",
        icon: Command,
        intent: "command",
        useful: "Useful",
        note: "Markets, agents, pipeline pulse",
      },
    ],
  },
  {
    title: "Money",
    subtitle: "CFO + investing",
    items: [
      {
        href: "/finance",
        label: "CFO View",
        short: "CFO",
        icon: CircleDollarSign,
        intent: "money",
        useful: "Core",
        note: "Cash, burn, net worth",
      },
      {
        href: "/vega",
        label: "Vega",
        short: "Vega",
        icon: LineChart,
        intent: "money",
        useful: "Useful",
        note: "BTC, markets, allocation",
      },
    ],
  },
  {
    title: "Revenue",
    subtitle: "Only what closes loans",
    items: [
      {
        href: "/pipeline",
        label: "Pipeline",
        short: "Pipe",
        icon: GitBranch,
        intent: "revenue",
        useful: "Core",
        note: "Files, locks, closings",
      },
      {
        href: "/campaigns",
        label: "Campaigns",
        short: "Leads",
        icon: Mail,
        intent: "revenue",
        useful: "Useful",
        note: "Lead gen only if measured",
      },
      {
        href: "/content",
        label: "Video Studio",
        short: "Video",
        icon: Clapperboard,
        intent: "revenue",
        useful: "Useful",
        note: "Emotion-led mortgage videos",
      },
    ],
  },
  {
    title: "Operators",
    subtitle: "People, time, accountability",
    items: [
      {
        href: "/calendar",
        label: "Calendar",
        short: "Cal",
        icon: CalendarDays,
        intent: "people",
        useful: "Useful",
        note: "Protect time blocks",
      },
      {
        href: "/team",
        label: "Team",
        short: "Team",
        icon: Users,
        intent: "people",
        useful: "Useful",
        note: "Claudia, Nathaly, agents",
      },
    ],
  },
  {
    title: "Review",
    subtitle: "History + parking lot",
    items: [
      {
        href: "/briefs",
        label: "Briefs",
        short: "Briefs",
        icon: Archive,
        intent: "review",
        useful: "Useful",
        note: "Daily history",
      },
      {
        href: "/tasks",
        label: "Backlog",
        short: "Park",
        icon: CheckSquare,
        intent: "parking",
        useful: "Park",
        note: "Do not live here all day",
      },
    ],
  },
];

const intentClasses: Record<NavItem["intent"], string> = {
  command: "text-purple-300 bg-purple-500/10 border-purple-400/20",
  money: "text-amber-300 bg-amber-500/10 border-amber-400/20",
  revenue: "text-emerald-300 bg-emerald-500/10 border-emerald-400/20",
  people: "text-blue-300 bg-blue-500/10 border-blue-400/20",
  review: "text-white/75 bg-white/10 border-white/15",
  parking: "text-zinc-300 bg-zinc-500/10 border-zinc-400/15",
};

const usefulClasses: Record<NavItem["useful"], string> = {
  Core: "border-emerald-400/20 bg-emerald-500/10 text-emerald-300",
  Useful: "border-white/10 bg-white/[0.06] text-white/45",
  Park: "border-red-400/20 bg-red-500/10 text-red-300",
};

function allItems() {
  return sections.flatMap((section) => section.items);
}

function NavLinks({ onLinkClick }: { onLinkClick?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-5">
      {sections.map((section) => (
        <div key={section.title}>
          <div className="mb-2 px-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/25">
              {section.title}
            </p>
            <p className="mt-0.5 text-[10px] leading-4 text-white/25">
              {section.subtitle}
            </p>
          </div>
          <div className="space-y-1.5">
            {section.items.map((link) => {
              const active = pathname === link.href;
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={onLinkClick}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl border px-2.5 py-2.5 transition-all",
                    active
                      ? cn("shadow-lg shadow-black/20", intentClasses[link.intent])
                      : "border-white/[0.05] bg-white/[0.025] text-white/42 hover:border-white/[0.12] hover:bg-white/[0.055] hover:text-white/75"
                  )}
                >
                  <div
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                      active
                        ? "border-current/20 bg-black/25"
                        : "border-white/[0.06] bg-black/25 text-white/35 group-hover:text-white/65"
                    )}
                  >
                    <Icon size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-semibold leading-none">
                        {link.label}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                          usefulClasses[link.useful]
                        )}
                      >
                        {link.useful}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[10px] text-white/28 group-hover:text-white/40">
                      {link.note}
                    </p>
                  </div>
                  <ChevronRight
                    size={13}
                    className={cn(
                      "shrink-0 transition-transform group-hover:translate-x-0.5",
                      active ? "text-current" : "text-white/18"
                    )}
                  />
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function UtilityVerdict() {
  return (
    <div className="rounded-2xl border border-red-400/15 bg-red-500/[0.045] p-3">
      <div className="mb-2 flex items-center gap-2 text-red-300">
        <ShieldAlert size={14} />
        <p className="text-[10px] font-black uppercase tracking-[0.2em]">Noise Filter</p>
      </div>
      <p className="text-[11px] leading-5 text-white/45">
        Useful: CEO OS, Pipeline, CFO. Conditional: Vega, Campaigns, Video Studio, Calendar, Team.
        Not useful as daily nav: raw docs, tools, memory.
      </p>
    </div>
  );
}

function Brand({ closeButton }: { closeButton?: React.ReactNode }) {
  return (
    <div className="mb-5 px-1">
      <div className="flex items-start justify-between gap-3">
        <Link href="/projects" className="group flex min-w-0 items-center gap-3" title="Fonz Operating System">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-purple-400/20 bg-purple-500/10 text-lg shadow-lg shadow-purple-950/20">
            🦞
          </div>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-black uppercase tracking-[0.24em] text-white/70 group-hover:text-white">
              Fonz OS
            </p>
            <p className="mt-1 truncate text-[10px] text-white/28">CEO / CFO command rail</p>
          </div>
        </Link>
        {closeButton}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-1.5">
        <div className="rounded-xl border border-emerald-400/10 bg-emerald-500/[0.045] p-2">
          <Target className="mb-1 size-3.5 text-emerald-300" />
          <p className="text-[9px] uppercase tracking-wider text-white/25">Focus</p>
          <p className="text-[10px] font-bold text-white/65">Revenue</p>
        </div>
        <div className="rounded-xl border border-amber-400/10 bg-amber-500/[0.045] p-2">
          <DollarSign className="mb-1 size-3.5 text-amber-300" />
          <p className="text-[9px] uppercase tracking-wider text-white/25">CFO</p>
          <p className="text-[10px] font-bold text-white/65">Cash</p>
        </div>
        <div className="rounded-xl border border-red-400/10 bg-red-500/[0.045] p-2">
          <Flame className="mb-1 size-3.5 text-red-300" />
          <p className="text-[9px] uppercase tracking-wider text-white/25">Rule</p>
          <p className="text-[10px] font-bold text-white/65">Cut</p>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { open, setOpen } = useNav();
  const pathname = usePathname();
  const currentItem = allItems().find((item) => item.href === pathname);

  return (
    <>
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[260px] flex-col border-r border-white/[0.06] bg-[#070707] px-3 py-4 md:flex">
        <Brand />
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <NavLinks />
        </div>
        <div className="mt-4 space-y-3">
          <UtilityVerdict />
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3">
            <div className="mb-2 flex items-center gap-2 text-white/45">
              <BarChart3 size={14} />
              <p className="text-[10px] font-black uppercase tracking-[0.2em]">Current View</p>
            </div>
            <p className="text-sm font-bold text-white/75">{currentItem?.label ?? "Dashboard"}</p>
            <p className="mt-1 text-[11px] leading-5 text-white/35">
              {currentItem?.note ?? "Use this only if it drives a decision today."}
            </p>
          </div>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-screen w-[310px] max-w-[86vw] flex-col border-r border-white/[0.06] bg-[#070707] px-3 py-4 shadow-2xl shadow-black">
            <Brand
              closeButton={
                <button
                  onClick={() => setOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/70"
                  aria-label="Close menu"
                >
                  <X size={15} />
                </button>
              }
            />
            <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <NavLinks onLinkClick={() => setOpen(false)} />
            </div>
            <div className="mt-4">
              <UtilityVerdict />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
