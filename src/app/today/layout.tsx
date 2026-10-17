import { LegacyBanner } from "@/components/mc/legacy-banner";

export default function LegacyTodayLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LegacyBanner name="Today" replacement="Home" replacementHref="/" />
      {children}
    </>
  );
}
