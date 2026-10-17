import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/app-shell";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Mission Control",
  description: "Dream House Lending Mission Control dashboard for Fonz.",
  applicationName: "Hermi Dashboard",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Hermi",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icons/hermi-icon.svg",
    apple: "/icons/hermi-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("dark font-sans", geistSans.variable)}>
      <body className="antialiased bg-background text-foreground">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
