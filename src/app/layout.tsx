import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Mission Control 🦞",
  description: "Command center for Fonz & Atlas",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("dark font-sans", geistSans.variable)}>
      <body className="antialiased bg-[#0A0A0A] text-white/90">
        <Sidebar />
        <div className="ml-[180px] min-h-screen flex flex-col">
          <Topbar />
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
