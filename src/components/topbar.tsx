"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Plus } from "lucide-react";
import { useNav } from "@/components/nav-context";
import { navItemFor } from "@/lib/mission-control/capabilities.mjs";

export function Topbar() {
  const { setOpen } = useNav();
  const pathname = usePathname();
  const title = navItemFor(pathname)?.label ?? "Mission Control";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/90 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 md:hidden"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>
        <span className="truncate text-sm font-semibold text-slate-100">{title}</span>
      </div>
      <Link
        href="/tasks#assign"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-teal-500/40 bg-teal-500/15 px-3 py-1.5 text-sm font-medium text-teal-100 hover:bg-teal-500/25"
      >
        <Plus size={15} aria-hidden /> New assignment
      </Link>
    </header>
  );
}
