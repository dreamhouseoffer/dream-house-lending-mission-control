// Shared Mission Control page primitives. Server-safe (no hooks), reused by every operational view.
import Link from "next/link";
import { AlertTriangle, ArrowRight, CircleSlash, Info, PlugZap, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { sourceStateLabel } from "@/lib/mission-control/capabilities.mjs";

export type Tone = "neutral" | "info" | "ok" | "warn" | "bad" | "accent";

const TONES: Record<Tone, string> = {
  neutral: "border-slate-600/50 bg-slate-700/30 text-slate-300",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  bad: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  accent: "border-teal-500/30 bg-teal-500/10 text-teal-200",
};

const SOURCE_TONES: Record<string, Tone> = {
  live: "ok",
  observed: "info",
  stale: "warn",
  offline: "bad",
  snapshot: "info",
  unverified: "warn",
  not_connected: "neutral",
};

export function StatusChip({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function SourceChip({ state }: { state: string }) {
  return <StatusChip tone={SOURCE_TONES[state] ?? "neutral"}>{sourceStateLabel(state)}</StatusChip>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-slate-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-teal-300/80">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-50">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function McPage({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">{children}</div>;
}

export function Section({
  title,
  description,
  href,
  hrefLabel,
  children,
  id,
}: {
  title: string;
  description?: React.ReactNode;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="scroll-mt-20 rounded-xl border border-slate-800 bg-slate-900/60">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          {description && <p className="mt-0.5 text-xs leading-5 text-slate-400">{description}</p>}
        </div>
        {href && (
          <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-teal-300 hover:text-teal-200">
            {hrefLabel ?? "Open"} <ArrowRight size={12} />
          </Link>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function StatTile({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const unknown = value === "Unknown";
  const body = (
    <>
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold", unknown ? "text-slate-500" : "text-slate-50")}>{value}</p>
      {hint && <p className="mt-1 text-[11px] leading-4 text-slate-500">{hint}</p>}
    </>
  );
  const cls = "block rounded-xl border border-slate-800 bg-slate-900/60 p-4";
  return href ? (
    <Link href={href} className={cn(cls, "hover:border-slate-600")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

type NoticeKind = "not_connected" | "offline" | "error" | "empty" | "stale" | "info";

const NOTICE: Record<NoticeKind, { icon: typeof Info; tone: string }> = {
  not_connected: { icon: PlugZap, tone: "border-slate-700 bg-slate-800/40" },
  offline: { icon: WifiOff, tone: "border-rose-500/30 bg-rose-500/5" },
  error: { icon: AlertTriangle, tone: "border-rose-500/30 bg-rose-500/5" },
  stale: { icon: AlertTriangle, tone: "border-amber-500/30 bg-amber-500/5" },
  empty: { icon: CircleSlash, tone: "border-slate-700 bg-slate-800/30" },
  info: { icon: Info, tone: "border-sky-500/20 bg-sky-500/5" },
};

export function StateNotice({
  kind,
  title,
  children,
  enables,
  href,
  hrefLabel,
}: {
  kind: NoticeKind;
  title: string;
  children?: React.ReactNode;
  enables?: string;
  href?: string;
  hrefLabel?: string;
}) {
  const { icon: Icon, tone } = NOTICE[kind];
  return (
    <div className={cn("flex gap-3 rounded-lg border p-3", tone)} role={kind === "error" || kind === "offline" ? "alert" : undefined}>
      <Icon size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-medium text-slate-100">{title}</p>
        {children && <div className="mt-1 leading-6 text-slate-400">{children}</div>}
        {enables && <p className="mt-1 text-xs leading-5 text-slate-500">{enables}</p>}
        {href && (
          <Link href={href} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-teal-300 hover:text-teal-200">
            {hrefLabel ?? "Open"} <ArrowRight size={12} />
          </Link>
        )}
      </div>
    </div>
  );
}

export type SourceDef = { label: string; state: string; detail: string; enables?: string; href?: string };

export function SourceNote({ source }: { source: SourceDef }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
      <span className="font-medium text-slate-300">Source:</span>
      <span>{source.label}</span>
      <SourceChip state={source.state} />
      <span className="basis-full leading-5 sm:basis-auto">{source.detail}</span>
    </div>
  );
}

export function ModuleLink({ href, title, description, badge }: { href: string; title: string; description: string; badge?: string }) {
  return (
    <Link href={href} className="group flex items-start justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3 hover:border-slate-600">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-100 group-hover:text-white">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-400">{description}</p>
      </div>
      <span className="flex shrink-0 items-center gap-2">
        {badge && <StatusChip>{badge}</StatusChip>}
        <ArrowRight size={14} className="text-slate-500 group-hover:text-teal-300" />
      </span>
    </Link>
  );
}

export function DisabledAction({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled
        aria-disabled="true"
        title={reason}
        className="cursor-not-allowed rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-500"
      >
        {label}
      </button>
      <p className="text-xs leading-5 text-slate-500">
        <span className="font-medium text-slate-400">Unavailable:</span> {reason}
      </p>
    </div>
  );
}

export function FilterLinks({
  basePath,
  param,
  options,
  active,
  extra,
}: {
  basePath: string;
  param: string;
  options: { id: string; label: string }[];
  active: string;
  extra?: Record<string, string>;
}) {
  return (
    <nav aria-label="Filter" className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const params = new URLSearchParams({ ...(extra ?? {}), ...(o.id === "all" ? {} : { [param]: o.id }) });
        const qs = params.toString();
        const on = o.id === active;
        return (
          <Link
            key={o.id}
            href={qs ? `${basePath}?${qs}` : basePath}
            aria-current={on ? "page" : undefined}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium",
              on ? "border-teal-500/40 bg-teal-500/15 text-teal-100" : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}
