type LoginPhase = "credentials" | "twoFactor" | "enroll";

interface LoginState {
  phase: LoginPhase;
  pending: boolean;
  error: string | null;
}

type LoginEvent =
  | { type: "submit" }
  | { type: "challenge"; next: "twoFactor" | "enroll" }
  | { type: "failure"; message: string; status: number }
  | { type: "success" };

const initialLoginState: LoginState = { phase: "credentials", pending: false, error: null };

/**
 * Pure reducer for the login form's transitions — no DOM, no `fetch`, so the
 * flow is testable as a table. The API answers the password step with a typed
 * `status` (code needed / enrolment needed), so the component dispatches
 * `challenge` from that; this reducer never compares message strings.
 *
 * A 401 past the password step has one meaning: the 5-minute challenge cookie
 * expired or was revoked. A wrong code is a 400 and a lock is a 429, so those
 * stay on the current phase.
 */
const loginReducer = (state: LoginState, event: LoginEvent): LoginState => {
  switch (event.type) {
    case "submit":
      return { ...state, pending: true, error: null };
    case "challenge":
      // Asking for the second factor is a step forward, not a failure: no
      // error is shown, the form just moves on.
      return { phase: event.next, pending: false, error: null };
    case "success":
      // Stays busy through the navigation that follows — this is what keeps
      // a double click/submit from firing a second request.
      return { ...state, pending: true };
    case "failure":
      if (event.status === 401 && state.phase !== "credentials") {
        return { phase: "credentials", pending: false, error: event.message };
      }
      return { ...state, pending: false, error: event.message };
    default:
      return state;
  }
};

export { initialLoginState, loginReducer };
export type { LoginEvent, LoginPhase, LoginState };
