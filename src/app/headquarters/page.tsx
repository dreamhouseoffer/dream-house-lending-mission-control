import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadHeadquartersSnapshot } from "@/lib/headquarters/loader.mjs";
import { hasHeadquartersAccess } from "@/lib/headquarters/guard";
import type { HqSnapshot } from "@/lib/headquarters/types";
import { HeadquartersView } from "@/components/headquarters/headquarters-view";

// Snapshot is read from the private file at request time; never prerendered into static output.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = { title: "Headquarters · Mission Control" };

export default async function HeadquartersPage() {
  // Fails closed even in dev: without a configured PIN, signing secret and valid signed session, nothing is loaded.
  if (!(await hasHeadquartersAccess())) redirect("/login?next=/headquarters");
  const snapshot = (await loadHeadquartersSnapshot()) as HqSnapshot;
  return <HeadquartersView snapshot={snapshot} />;
}
