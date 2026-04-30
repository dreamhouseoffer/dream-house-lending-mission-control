import { NextResponse } from "next/server";

const AUTH_COOKIE = "mission_control_auth";

export async function POST(request: Request) {
  const configuredPin = process.env.MISSION_CONTROL_PIN;

  if (!configuredPin) {
    return NextResponse.json(
      { ok: false, error: "Mission Control PIN is not configured." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin.trim() : "";

  if (pin !== configuredPin) {
    return NextResponse.json({ ok: false, error: "Wrong PIN." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, configuredPin, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
