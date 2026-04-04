"use client";

import { useEffect, useState } from "react";

export function Topbar() {
  const [time, setTime] = useState("");

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
    <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-white/[0.06] bg-[#0A0A0A]/80 px-6 backdrop-blur-md">
      <span className="text-sm font-medium text-white/90">
        Mission Control 🦞
      </span>
      <span className="text-xs text-white/40">{time}</span>
    </header>
  );
}
