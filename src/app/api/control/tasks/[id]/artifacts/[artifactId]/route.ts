import { NextResponse } from "next/server";
import { failureHttpStatus, hasControlAccess, isTaskId } from "@/lib/mission-control/bridge";
import { isArtifactId, readArtifactBytes } from "@/lib/mission-control/artifacts";
import { contentDisposition } from "@/lib/mission-control/artifacts-client.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

const STATUS: Record<string, number> = { not_found: 404, unavailable: 409 };
const CODE_STATUS: Record<string, number> = { artifact_too_large: 413, too_large: 413, unsupported_type: 415 };

// Authenticated download of one registered artifact by its opaque native id. Always served as an attachment with a
// sandboxing CSP, so a markdown/HTML-looking file is never rendered by the browser from this route. Preview happens
// server-side as escaped text on /tasks/[id]/artifacts/[artifactId].
export async function GET(_request: Request, { params }: { params: { id: string; artifactId: string } }) {
  if (!(await hasControlAccess())) return NextResponse.json({ ok: false, state: "unauthenticated" }, { status: 401, headers: HEADERS });
  if (!isTaskId(params.id)) return NextResponse.json({ ok: false, state: "invalid_task_id" }, { status: 400, headers: HEADERS });
  if (!isArtifactId(params.artifactId)) return NextResponse.json({ ok: false, state: "invalid_artifact_id" }, { status: 400, headers: HEADERS });
  const result = await readArtifactBytes(params.id, params.artifactId);
  if (!result.ok) {
    const status = CODE_STATUS[result.code] ?? STATUS[result.state] ?? failureHttpStatus(result.state);
    return NextResponse.json({ ok: false, state: result.state, code: result.code }, { status, headers: HEADERS });
  }
  return new NextResponse(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      ...HEADERS,
      "Cache-Control": "private, no-store",
      "Content-Type": result.contentType,
      "Content-Length": String(result.bytes.length),
      "Content-Disposition": contentDisposition(result.name),
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Artifact-Sha256": result.sha256,
    },
  });
}
