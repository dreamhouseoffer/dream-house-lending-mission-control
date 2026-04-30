"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useNav } from "@/components/nav-context";
import { X } from "lucide-react";

type Channel = {
  href: string;
  label: string;
  badge?: string;
};

type ChannelGroup = {
  title: string;
  channels: Channel[];
};

const channelGroups: ChannelGroup[] = [
  {
    title: "command",
    channels: [
      { href: "/projects", label: "projects", badge: "5" },
      { href: "/", label: "live-room" },
    ],
  },
  {
    title: "revenue",
    channels: [
      { href: "/pipeline", label: "pipeline", badge: "arive" },
      { href: "/campaigns", label: "campaigns" },
      { href: "/content", label: "video-studio" },
    ],
  },
  {
    title: "money",
    channels: [
      { href: "/finance", label: "cfo" },
      { href: "/vega", label: "markets" },
    ],
  },
  {
    title: "operators",
    channels: [
      { href: "/team", label: "agents" },
      { href: "/calendar", label: "calendar" },
    ],
  },
  {
    title: "archive",
    channels: [
      { href: "/briefs", label: "briefs" },
      { href: "/tasks", label: "backlog" },
    ],
  },
];

function allChannels() {
  return channelGroups.flatMap((group) => group.channels);
}

function ChannelLinks({ onLinkClick }: { onLinkClick?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-5">
      {channelGroups.map((group) => (
        <div key={group.title}>
          <p className="mb-1.5 px-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/24">
            {group.title}
          </p>
          <div className="space-y-0.5">
            {group.channels.map((channel) => {
              const active = pathname === channel.href;
              return (
                <Link
                  key={channel.href}
                  href={channel.href}
                  onClick={onLinkClick}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
                    active
                      ? "bg-white/[0.10] text-white"
                      : "text-white/42 hover:bg-white/[0.055] hover:text-white/75"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn("font-mono text-base leading-none", active ? "text-emerald-300" : "text-white/25")}>#</span>
                    <span className="truncate font-medium">{channel.label}</span>
                  </span>
                  {channel.badge && (
                    <span
                      className={cn(
                        "shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase",
                        active
                          ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
                          : "border-white/8 bg-white/[0.035] text-white/28"
                      )}
                    >
                      {channel.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Brand({ closeButton }: { closeButton?: React.ReactNode }) {
  return (
    <div className="mb-5 px-1">
      <div className="flex items-start justify-between gap-3">
        <Link href="/projects" className="group flex min-w-0 items-center gap-3" title="Mission Control">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 text-lg shadow-lg shadow-emerald-950/20">
            🦞
          </div>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-black uppercase tracking-[0.24em] text-white/70 group-hover:text-white">
              Mission Control
            </p>
            <p className="mt-1 truncate text-[10px] text-white/28">Slack-style work channels</p>
          </div>
        </Link>
        {closeButton}
      </div>
    </div>
  );
}

function SidebarFooter() {
  const pathname = usePathname();
  const current = allChannels().find((channel) => channel.href === pathname);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/25">current channel</p>
      <p className="mt-2 font-mono text-sm font-bold text-white/75">#{current?.label ?? "dashboard"}</p>
      <p className="mt-1 text-[11px] leading-5 text-white/32">
        Projects = active work. Pipeline = Arive loan data. Live Room = pulse view.
      </p>
    </div>
  );
}

export function Sidebar() {
  const { open, setOpen } = useNav();

  return (
    <>
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[260px] flex-col border-r border-white/[0.06] bg-[#070707] px-3 py-4 md:flex">
        <Brand />
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ChannelLinks />
        </div>
        <div className="mt-4">
          <SidebarFooter />
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
              <ChannelLinks onLinkClick={() => setOpen(false)} />
            </div>
            <div className="mt-4">
              <SidebarFooter />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
