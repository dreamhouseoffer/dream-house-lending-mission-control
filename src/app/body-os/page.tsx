"use client";

import { Badge } from "@/components/ui/badge";
import {
  Activity,
  Dumbbell,
  Flame,
  Moon,
  AlertTriangle,
  Target,
  Droplet,
  Apple,
  TrendingUp,
  ClipboardList,
} from "lucide-react";

type Exercise = {
  name: string;
  sets: string;
  rest?: string;
  rpe?: string;
  note?: string;
};

const workout: Exercise[] = [
  { name: "Lat pulldown", sets: "4 × 8–12", rest: "90s", rpe: "RPE 7–8" },
  { name: "Seated cable row", sets: "3 × 10–12", rest: "90s", rpe: "RPE 7–8" },
  { name: "Chest-supported row", sets: "3 × 8–12", rest: "90s", rpe: "RPE 7–8" },
  { name: "Rear delt fly", sets: "3 × 15–20", rest: "60s", rpe: "RPE 7–8" },
  { name: "DB curl", sets: "3 × 10–12", rest: "60s", rpe: "RPE 7–8" },
  { name: "Hammer curl", sets: "3 × 10–12", rest: "60s", rpe: "RPE 7–8" },
  {
    name: "Optional easy incline walk",
    sets: "8–10 min",
    note: "low intensity finisher",
  },
];

export default function BodyOSPage() {
  return (
    <div className="min-h-screen bg-[#09090b] p-6 md:p-10">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Body OS / AI Trainer
          </h1>
          <p className="mt-1 text-sm text-white/50">
            Daily readiness, lift plan, and recovery rules
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-amber-500/20 bg-amber-500/10 text-amber-300">
            Manual MVP
          </Badge>
          <Badge className="border-white/10 bg-white/[0.04] text-white/50">
            No WHOOP API connected
          </Badge>
        </div>
      </div>

      {/* Top row: Goal + Readiness */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader icon={<Target className="size-4" />} title="Goal" />
          <p className="text-base font-semibold text-white">Build muscle</p>
          <p className="mt-1 text-xs text-white/50">
            Hypertrophy block · progressive overload · 4–5 sessions/week
          </p>
        </Card>

        <Card>
          <CardHeader
            icon={<Activity className="size-4" />}
            title="Readiness"
            right={
              <Badge className="border-amber-400/30 bg-gradient-to-r from-amber-500/15 to-emerald-500/15 text-amber-200">
                Yellow → Green
              </Badge>
            }
          />
          <p className="text-sm text-white/70">
            Train, but pick the right muscle group. Avoid CNS-heavy pressing
            today; favor pulling volume.
          </p>
        </Card>

        <Card>
          <CardHeader
            icon={<Dumbbell className="size-4" />}
            title="Last workout"
          />
          <p className="text-base font-semibold text-white">Chest · yesterday</p>
          <p className="mt-1 text-xs text-white/50">
            Local soreness expected — do NOT train chest today.
          </p>
        </Card>
      </div>

      {/* WHOOP Snapshot */}
      <Card className="mb-6">
        <CardHeader
          icon={<Moon className="size-4" />}
          title="WHOOP snapshot"
          right={<span className="text-[10px] uppercase tracking-widest text-white/30">manual entry</span>}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Sleep" value="86%" tone="green" />
          <Metric label="Recovery" value="64%" tone="yellow" />
          <Metric label="Strain" value="8.1" tone="neutral" sub="vs 9.8 optimal" />
          <Metric label="Target strain" value="9.8" tone="neutral" sub="hit moderate volume" />
        </div>
      </Card>

      {/* Recommendation */}
      <Card className="mb-6 border-emerald-500/20 bg-emerald-500/[0.04]">
        <CardHeader
          icon={<Flame className="size-4 text-emerald-300" />}
          title="Today's recommendation"
          right={<Badge className="border-emerald-400/20 bg-emerald-500/15 text-emerald-300">Back + Biceps · Hypertrophy</Badge>}
        />
        <ul className="space-y-1.5 text-sm text-white/70">
          <li className="flex gap-2">
            <span className="text-rose-400">✗</span>
            <span>Do NOT train chest — trained yesterday, still recovering.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-emerald-400">✓</span>
            <span>Train Back + Biceps for hypertrophy. Pulling volume, moderate strain to push toward 9.8.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-emerald-400">✓</span>
            <span>Stay in RPE 7–8. Leave 2–3 reps in reserve.</span>
          </li>
        </ul>
      </Card>

      {/* Warning */}
      <Card className="mb-6 border-rose-500/30 bg-rose-500/[0.05]">
        <CardHeader
          icon={<AlertTriangle className="size-4 text-rose-300" />}
          title="Safety warning"
        />
        <p className="text-sm leading-relaxed text-rose-100/80">
          Avoid the combo that caused the prior lightheaded / dehydration
          episode:
        </p>
        <ul className="mt-2 space-y-1 text-sm text-rose-100/80">
          <li>• Hard fasted workout</li>
          <li>• Pre-workout / stimulants on empty stomach</li>
          <li>• Poor sleep or long gap since last meal</li>
        </ul>
        <p className="mt-3 text-xs text-rose-200/70">
          Today: eat something 60–90 min before, skip pre-workout if you
          didn&apos;t sleep well, keep electrolytes on hand.
        </p>
      </Card>

      {/* Workout */}
      <Card className="mb-6">
        <CardHeader
          icon={<Dumbbell className="size-4" />}
          title="Today's workout"
          right={<span className="text-[10px] uppercase tracking-widest text-white/30">Back + Biceps</span>}
        />
        <div className="overflow-hidden rounded-lg border border-white/[0.06]">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Exercise</th>
                <th className="px-3 py-2 text-left font-medium">Sets × Reps</th>
                <th className="px-3 py-2 text-left font-medium">Rest</th>
                <th className="px-3 py-2 text-left font-medium">Intensity</th>
              </tr>
            </thead>
            <tbody>
              {workout.map((ex, i) => (
                <tr
                  key={ex.name}
                  className={i % 2 === 0 ? "bg-white/[0.015]" : ""}
                >
                  <td className="px-3 py-2.5 font-medium text-white/85">
                    {ex.name}
                    {ex.note && (
                      <span className="ml-2 text-xs text-white/40">
                        — {ex.note}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-white/65">{ex.sets}</td>
                  <td className="px-3 py-2.5 text-white/50">{ex.rest ?? "—"}</td>
                  <td className="px-3 py-2.5 text-white/50">{ex.rpe ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Log + Overload side-by-side */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            icon={<ClipboardList className="size-4" />}
            title="Workout log template"
          />
          <pre className="overflow-x-auto rounded-lg border border-white/[0.06] bg-black/40 p-3 text-xs leading-relaxed text-white/70">
{`Date: ____  |  Body: Back + Biceps  |  Sleep: __%  Recovery: __%

Lat pulldown        ___ x ___ @ ___ lb   RPE __
                    ___ x ___ @ ___ lb   RPE __
                    ___ x ___ @ ___ lb   RPE __
                    ___ x ___ @ ___ lb   RPE __

Seated cable row    ___ x ___ @ ___ lb   RPE __
                    ___ x ___ @ ___ lb   RPE __
                    ___ x ___ @ ___ lb   RPE __

Chest-supported row ___ x ___ @ ___ lb   RPE __  (x3)
Rear delt fly       ___ x ___ @ ___ lb            (x3)
DB curl             ___ x ___ @ ___ lb            (x3)
Hammer curl         ___ x ___ @ ___ lb            (x3)

Walk: __ min @ incline __
Notes: __________________________________________`}
          </pre>
        </Card>

        <Card>
          <CardHeader
            icon={<TrendingUp className="size-4" />}
            title="Progressive overload rules"
          />
          <ul className="space-y-2 text-sm text-white/70">
            <li>
              <span className="font-semibold text-white">Double progression.</span>{" "}
              Hit the top of the rep range on all sets → add 2.5–5 lb next
              session.
            </li>
            <li>
              <span className="font-semibold text-white">Reps before load.</span>{" "}
              Add reps first; only bump weight once you own the top of the
              range.
            </li>
            <li>
              <span className="font-semibold text-white">RPE cap.</span> Stop
              sets at RPE 7–8. Save the grinders for the last set only.
            </li>
            <li>
              <span className="font-semibold text-white">Deload trigger.</span>{" "}
              If reps drop across 2 sessions in a row, repeat the week or
              deload 10%.
            </li>
            <li>
              <span className="font-semibold text-white">Log everything.</span>{" "}
              No log = no overload. Compare to last session before warmups.
            </li>
          </ul>
        </Card>
      </div>

      {/* Nutrition */}
      <Card className="mb-6">
        <CardHeader
          icon={<Apple className="size-4" />}
          title="Nutrition & hydration basics"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <NutritionBlock
            icon={<Apple className="size-4 text-emerald-300" />}
            title="Protein"
            lines={[
              "0.8–1.0 g per lb bodyweight / day",
              "20–40 g per meal, 4–5 meals",
              "Lean meats, eggs, dairy, whey",
            ]}
          />
          <NutritionBlock
            icon={<Droplet className="size-4 text-sky-300" />}
            title="Hydration"
            lines={[
              "0.6–1.0 oz water per lb / day",
              "+16–24 oz around training",
              "Electrolytes (Na, K, Mg) if sweating hard",
            ]}
          />
          <NutritionBlock
            icon={<Flame className="size-4 text-amber-300" />}
            title="Pre-workout meal"
            lines={[
              "Eat 60–90 min before",
              "30–50 g carbs + 20–30 g protein",
              "Examples: rice + chicken, oats + whey",
            ]}
          />
        </div>
      </Card>

      <p className="text-center text-[11px] text-white/30">
        Body OS · Manual MVP — values entered by hand. Wire WHOOP API later for
        live readiness.
      </p>
    </div>
  );
}

/* ─────────── helpers ─────────── */

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-white/[0.06] bg-white/[0.03] p-5 ${className}`}
    >
      {children}
    </div>
  );
}

function CardHeader({
  icon,
  title,
  right,
}: {
  icon: React.ReactNode;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-white/80">
        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.04] text-white/60">
          {icon}
        </span>
        <h2 className="text-sm font-bold">{title}</h2>
      </div>
      {right}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone: "green" | "yellow" | "neutral";
  sub?: string;
}) {
  const toneClass =
    tone === "green"
      ? "text-emerald-300"
      : tone === "yellow"
      ? "text-amber-300"
      : "text-white/85";
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-white/40">{sub}</p>}
    </div>
  );
}

function NutritionBlock({
  icon,
  title,
  lines,
}: {
  icon: React.ReactNode;
  title: string;
  lines: string[];
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 p-4">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <p className="text-sm font-bold text-white">{title}</p>
      </div>
      <ul className="space-y-1 text-xs text-white/60">
        {lines.map((l) => (
          <li key={l}>• {l}</li>
        ))}
      </ul>
    </div>
  );
}
