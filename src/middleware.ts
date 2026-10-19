import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isProductionEnv, readSessionConfig, verifySessionToken } from "@/lib/auth/session.mjs";

function isPublicPath(pathname: string, method: string) {
  return (
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/logout" ||
    // Boolean session probe only (GET); it verifies the cookie itself and never issues a session.
    (pathname === "/api/auth/session" && method === "GET") ||
    // WHOOP's cross-site OAuth redirect (GET, exact path) arrives without the Strict session cookie. The handler binds it
    // to an authenticated start (bridge state + HttpOnly nonce cookie), mints no session and returns no data.
    (pathname === "/api/fitness/whoop/callback" && method === "GET") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots") ||
    pathname.startsWith("/sitemap")
  );
}

export async function middleware(request: NextRequest) {
  const pin = process.env.MISSION_CONTROL_PIN;

  const { pathname } = request.nextUrl;
  const isProduction = isProductionEnv({ NODE_ENV: process.env.NODE_ENV, VERCEL: process.env.VERCEL });

  // Local/dev stays unlocked unless a PIN is configured.
  // Production locks by default. A missing PIN or session secret fails closed: visitors see login but cannot enter.
  if (!pin && !isProduction) return NextResponse.next();
  if (isPublicPath(pathname, request.method)) return NextResponse.next();

  // Only a valid, unexpired signed owner session opens the board (WebCrypto verification, awaited).
  const config = readSessionConfig({ pin, secret: process.env.MISSION_CONTROL_SESSION_SECRET });
  const session = config.ok ? await verifySessionToken(config, request.cookies.get(SESSION_COOKIE)?.value) : null;
  if (session?.ok === true) return NextResponse.next();

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!.*\\..*).*)", "/api/:path*"],
};
