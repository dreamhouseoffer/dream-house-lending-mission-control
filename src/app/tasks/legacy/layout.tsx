import { LegacyBanner } from "@/components/mc/legacy-banner";

export default function LegacyTasksLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LegacyBanner name="Mission board" replacement="Tasks" replacementHref="/tasks" />
      {children}
    </>
  );
}
