// Server-only Headquarters guard. Import from route handlers or server components only.
// Verifies the signed owner session in the mission_control_auth cookie against MISSION_CONTROL_PIN and
// MISSION_CONTROL_SESSION_SECRET at request time. Async: every call site must `await` it.
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/session.mjs";
import { isHeadquartersAuthorized } from "./access.mjs";

export async function hasHeadquartersAccess(): Promise<boolean> {
  return isHeadquartersAuthorized({
    pin: process.env.MISSION_CONTROL_PIN,
    secret: process.env.MISSION_CONTROL_SESSION_SECRET,
    cookie: cookies().get(SESSION_COOKIE)?.value,
  });
}
