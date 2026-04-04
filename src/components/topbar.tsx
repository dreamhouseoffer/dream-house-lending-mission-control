"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { useNav } from "@/components/nav-context";

export function Topbar() {
  const [time, setTime] = useState("");
  const { setOpen } = useNav();

  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      );
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-white/[0.06] bg-[#0A0A0A]/80 px-4 sm:px-6 backdrop-blur-md">
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        <button
          className="flex h-9 w-9 items-center justify-center rounded-md text-white/40 hover:bg-white/[0.06] hover:text-white/70 transition-colors md:hidden"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>
        <span className="text-sm font-medium text-white/90">
          Mission Control 🦞
        </span>
      </div>
      <span className="text-xs text-white/40">{time}</span>
    </header>
  );
}
