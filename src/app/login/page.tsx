"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LockKeyhole, ShieldCheck } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => searchParams.get("next") || "/projects", [searchParams]);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });

    setLoading(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error || "Wrong PIN.");
      setPin("");
      return;
    }

    router.replace(nextPath.startsWith("/") ? nextPath : "/projects");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#070707] text-white flex items-center justify-center px-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.12),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.12),transparent_35%)]" />
      <section className="relative w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.04] p-7 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-300/70">Private dashboard</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Dream House Lending OS</h1>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-emerald-300">
            <ShieldCheck className="size-6" />
          </div>
        </div>

        <p className="mb-6 text-sm leading-6 text-white/55">
          This live dashboard is private. Enter the 4-digit Mission Control PIN to continue.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-xs uppercase tracking-[0.25em] text-white/40" htmlFor="pin">
            Access PIN
          </label>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 focus-within:border-emerald-300/50">
            <LockKeyhole className="size-5 text-white/35" />
            <input
              id="pin"
              autoFocus
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
              className="w-full bg-transparent text-2xl tracking-[0.5em] text-white outline-none placeholder:text-white/20"
              placeholder="••••"
              type="password"
            />
          </div>

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}

          <button
            type="submit"
            disabled={loading || pin.length < 4}
            className="w-full rounded-2xl bg-emerald-300 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-black transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Checking..." : "Unlock Mission Control"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
