import Link from "next/link";
import { ArrowRight } from "lucide-react";

// Marks a retained browser-local page so it is never mistaken for connected Mission Control data.
export function LegacyBanner({ name, replacement, replacementHref }: { name: string; replacement: string; replacementHref: string }) {
  return (
    <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-100/90 sm:px-6">
      <span className="font-semibold">Legacy module — {name}.</span> Data here is stored only in this browser and is not
      connected to Hermes.{" "}
      <Link href={replacementHref} className="inline-flex items-center gap-1 font-medium text-teal-300 hover:text-teal-200">
        Go to {replacement} <ArrowRight size={11} />
      </Link>
    </div>
  );
}
