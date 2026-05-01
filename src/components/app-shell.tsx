"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { NavProvider } from "@/components/nav-context";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  const isEmbed = pathname.startsWith("/embed");

  if (isLogin || isEmbed) {
    return <>{children}</>;
  }

  return (
    <NavProvider>
      <Sidebar />
      <div className="md:ml-[260px] min-h-screen flex flex-col">
        <Topbar />
        <main className="flex-1">{children}</main>
      </div>
    </NavProvider>
  );
}
