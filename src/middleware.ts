import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE = "mission_control_auth";

function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/logout" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots") ||
    pathname.startsWith("/sitemap")
  );
}

export function middleware(request: NextRequest) {
  const pin = process.env.MISSION_CONTROL_PIN;

  // No PIN configured = don't lock local/dev environments by accident.
  // Set MISSION_CONTROL_PIN in Vercel to protect the live app.
  if (!pin) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const authCookie = request.cookies.get(AUTH_COOKIE)?.value;
  if (authCookie === pin) return NextResponse.next();

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!.*\\..*).*)", "/api/:path*"],
};
