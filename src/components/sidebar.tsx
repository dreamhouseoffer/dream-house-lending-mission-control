"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useNav } from "@/components/nav-context";
import {
  LayoutDashboard,
  Calendar,
  FolderKanban,
  Users,
  Mail,
  Zap,
  Archive,
  CheckSquare,
  X,
} from "lucide-react";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/vega", label: "Vega", icon: Zap },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/campaigns", label: "Campaigns", icon: Mail },
  { href: "/team", label: "Team", icon: Users },
  { href: "/briefs", label: "Briefs", icon: Archive },
];

// Per-route accent colors for active state
const accentColors: Record<string, string> = {
  "/vega": "text-yellow-400 bg-yellow-500/10",
  "/calendar": "text-blue-400 bg-blue-500/10",
  "/projects": "text-purple-400 bg-purple-500/10",
  "/tasks": "text-cyan-400 bg-cyan-500/10",
  "/campaigns": "text-emerald-400 bg-emerald-500/10",
  "/team": "text-orange-400 bg-orange-500/10",
  "/briefs": "text-white/80 bg-white/10",
  "/": "text-white/90 bg-white/10",
};

function NavLinks({ onLinkClick }: { onLinkClick?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {links.map((link) => {
        const active = pathname === link.href;
        const activeStyle = accentColors[link.href] ?? "text-white/80 bg-white/10";
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onLinkClick}
            className={cn(
              "flex h-9 items-center gap-3 rounded-md px-2.5 text-[13px] font-medium transition-colors",
              active
                ? activeStyle
                : "text-white/35 hover:bg-white/[0.05] hover:text-white/65"
            )}
          >
            <link.icon size={15} className="shrink-0" />
            <span>{link.label}</span>
          </Link>
        );
      })}
    </>
  );
}

export function Sidebar() {
  const { open, setOpen } = useNav();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 z-40 h-screen w-[180px] flex-col border-r border-white/[0.05] bg-[#080808] py-4 px-2.5 gap-0.5">
        <Link
          href="/"
          className="mb-5 flex h-8 items-center gap-2 px-2.5"
          title="Mission Control"
        >
          <span className="text-base">🦞</span>
          <span className="text-[11px] font-semibold tracking-widest text-white/50 uppercase">Mission Control</span>
        </Link>
        <NavLinks />
      </aside>

      {/* Mobile drawer overlay */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-screen w-[200px] flex flex-col border-r border-white/[0.05] bg-[#080808] py-4 px-2.5 gap-0.5">
            <div className="flex items-center justify-between mb-5 px-2.5">
              <div className="flex items-center gap-2">
                <span className="text-base">🦞</span>
                <span className="text-[11px] font-semibold tracking-widest text-white/50 uppercase">Mission Control</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-white/30 hover:bg-white/[0.06] hover:text-white/60 transition-colors"
                aria-label="Close menu"
              >
                <X size={14} />
              </button>
            </div>
            <NavLinks onLinkClick={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
