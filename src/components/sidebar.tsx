"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  BookOpen,
  CheckSquare,
  FileText,
  Home,
  ListTodo,
  PlugZap,
  Settings,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNav } from "@/components/nav-context";
import { CORE_NAV, MODULE_NAV, SOURCES, navItemFor, sourceStateLabel } from "@/lib/mission-control/capabilities.mjs";

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  tasks: ListTodo,
  agents: Bot,
  approvals: CheckSquare,
  workflows: Workflow,
  content: FileText,
  knowledge: BookOpen,
  settings: Settings,
};

function NavLinks({ onLinkClick }: { onLinkClick?: () => void }) {
  const pathname = usePathname();
  const activeHref = navItemFor(pathname)?.href;

  const linkCls = (active: boolean) =>
    cn(
      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
      active ? "bg-slate-800 text-slate-50" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
    );

  return (
    <nav className="space-y-6" aria-label="Mission Control">
      <div className="space-y-0.5">
        {CORE_NAV.map((item) => {
          const Icon = ICONS[item.icon] ?? Home;
          const active = activeHref === item.href;
          return (
            <Link key={item.href} href={item.href} onClick={onLinkClick} aria-current={active ? "page" : undefined} className={linkCls(active)}>
              <Icon size={16} className={active ? "text-teal-300" : "text-slate-500"} aria-hidden />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
      {MODULE_NAV.map((group) => (
        <div key={group.title}>
          <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{group.title}</p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = activeHref === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onLinkClick}
                  aria-current={active ? "page" : undefined}
                  className={cn(linkCls(active), "py-1.5 text-[13px]")}
                >
                  {item.label}
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
    <div className="mb-5 flex items-center justify-between gap-3 px-1">
      <Link href="/" className="flex min-w-0 items-center gap-2.5" title="Mission Control home">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-teal-500/30 bg-teal-500/10 text-sm font-bold text-teal-200">
          MC
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-100">Mission Control</span>
          <span className="block truncate text-[11px] text-slate-500">Hermes operations</span>
        </span>
      </Link>
      {closeButton}
    </div>
  );
}

function BridgeStatus() {
  const bridge = SOURCES.bridge;
  return (
    <Link href="/settings#connections" className="block rounded-lg border border-slate-800 bg-slate-900 p-3 hover:border-slate-600">
      <p className="flex items-center gap-2 text-xs font-medium text-slate-300">
        <PlugZap size={14} className="text-slate-500" aria-hidden />
        {bridge.label}
      </p>
      <p className="mt-1 text-xs text-slate-500">{sourceStateLabel(bridge.state)} — task execution unavailable</p>
    </Link>
  );
}

export function Sidebar() {
  const { open, setOpen } = useNav();

  return (
    <>
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-60 flex-col border-r border-slate-800 bg-slate-950 px-3 py-4 md:flex">
        <Brand />
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <NavLinks />
        </div>
        <div className="mt-4">
          <BridgeStatus />
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-screen w-[300px] max-w-[86vw] flex-col border-r border-slate-800 bg-slate-950 px-3 py-4">
            <Brand
              closeButton={
                <button
                  onClick={() => setOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                  aria-label="Close menu"
                >
                  <X size={16} />
                </button>
              }
            />
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <NavLinks onLinkClick={() => setOpen(false)} />
            </div>
            <div className="mt-4">
              <BridgeStatus />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
