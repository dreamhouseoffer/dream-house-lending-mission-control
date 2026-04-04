"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useNav } from "@/components/nav-context";
import {
  LayoutDashboard,
  Calendar,
  FolderKanban,
  Brain,
  FileText,
  Users,
  Smartphone,
  Mail,
  Building2,
  Wrench,
  Zap,
  TrendingUp,
  Archive,
  X,
} from "lucide-react";

const links = [
  { href: "/", label: "Tasks", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/docs", label: "Docs", icon: FileText },
  { href: "/team", label: "Team", icon: Users },
  { href: "/content", label: "Content", icon: Smartphone },
  { href: "/campaigns", label: "Campaigns", icon: Mail },
  { href: "/vega", label: "Vega", icon: Zap },
  { href: "/portfolio", label: "Portfolio", icon: TrendingUp },
  { href: "/briefs", label: "Briefs", icon: Archive },
  { href: "/office", label: "Office", icon: Building2 },
  { href: "/tools", label: "Tools", icon: Wrench },
];

function NavLinks({ onLinkClick }: { onLinkClick?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onLinkClick}
            className={cn(
              "flex h-11 md:h-9 items-center gap-3 rounded-md px-2 text-[13px] font-medium transition-colors",
              active
                ? "bg-white/10 text-white"
                : "text-white/40 hover:bg-white/[0.06] hover:text-white/70"
            )}
          >
            <link.icon size={16} className="shrink-0" />
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
      <aside className="hidden md:flex fixed left-0 top-0 z-40 h-screen w-[180px] flex-col border-r border-white/[0.06] bg-[#0A0A0A] py-4 px-3 gap-0.5">
        <Link
          href="/"
          className="mb-4 flex h-8 items-center gap-2 px-2 text-lg"
          title="Mission Control"
        >
          <span>🦞</span>
          <span className="text-xs font-semibold tracking-wide text-white/70">Mission Control</span>
        </Link>
        <NavLinks />
      </aside>

      {/* Mobile drawer overlay */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          {/* Drawer */}
          <aside className="absolute left-0 top-0 h-screen w-[220px] flex flex-col border-r border-white/[0.06] bg-[#0A0A0A] py-4 px-3 gap-0.5">
            <div className="flex items-center justify-between mb-4 px-2">
              <div className="flex items-center gap-2">
                <span>🦞</span>
                <span className="text-xs font-semibold tracking-wide text-white/70">Mission Control</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-white/40 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
                aria-label="Close menu"
              >
                <X size={16} />
              </button>
            </div>
            <NavLinks onLinkClick={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
