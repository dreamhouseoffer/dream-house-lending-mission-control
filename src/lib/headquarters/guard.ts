// Server-only Headquarters guard. Import from route handlers or server components only.
// Checks the existing mission_control_auth cookie against MISSION_CONTROL_PIN at request time.
import { cookies } from "next/headers";
import { isHeadquartersAuthorized } from "./access.mjs";

const AUTH_COOKIE = "mission_control_auth";

export function hasHeadquartersAccess(): boolean {
  return isHeadquartersAuthorized({
    pin: process.env.MISSION_CONTROL_PIN,
    cookie: cookies().get(AUTH_COOKIE)?.value,
  });
}
