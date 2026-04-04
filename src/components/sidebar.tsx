"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
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
  { href: "/office", label: "Office", icon: Building2 },
  { href: "/tools", label: "Tools", icon: Wrench },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[180px] flex-col border-r border-white/[0.06] bg-[#0A0A0A] py-4 px-3 gap-0.5">
      <Link
        href="/"
        className="mb-4 flex h-8 items-center gap-2 px-2 text-lg"
        title="Mission Control"
      >
        <span>🦞</span>
        <span className="text-xs font-semibold tracking-wide text-white/70">Mission Control</span>
      </Link>
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex h-9 items-center gap-3 rounded-md px-2 text-[13px] font-medium transition-colors",
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
    </aside>
  );
}
