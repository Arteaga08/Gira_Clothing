import { cookies } from "next/headers";
import type { PublicUser, Wire } from "@gira/shared";
import { isApiError } from "./ApiError";
import { expectData } from "./request";
import { SESSION_COOKIE_NAME, serverRequest } from "./server";

/**
 * The three outcomes the `(admin)` route guard needs to tell apart. Merging
 * "not logged in" and "API unreachable" into one falsy value would mean
 * showing a login form when the real problem is a downed API — a form that
 * can't work either way, but lies about why.
 */
type Session =
  | { kind: "authenticated"; user: Wire<PublicUser> }
  | { kind: "anonymous" }
  | { kind: "unavailable"; message: string };

/**
 * Server-side only, `GET /auth/me`. Checks for the session cookie before
 * making any request: a visitor with no cookie at all is obviously
 * anonymous, and skipping the round trip keeps the common case (an
 * unauthenticated visit) from paying for a network call that can only ever
 * answer 401.
 */
const loadSession = async (): Promise<Session> => {
  const store = await cookies();
  if (!store.get(SESSION_COOKIE_NAME)) {
    return { kind: "anonymous" };
  }

  try {
    const result = await serverRequest<{ user: PublicUser }>("/auth/me");
    return { kind: "authenticated", user: expectData(result).user };
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      return { kind: "anonymous" };
    }
    const message = isApiError(error) ? error.message : "No se pudo verificar tu sesión.";
    return { kind: "unavailable", message };
  }
};

export { loadSession };
export type { Session };
