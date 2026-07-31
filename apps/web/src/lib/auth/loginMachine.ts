import { TWO_FACTOR_REQUIRED_MESSAGE } from "@gira/shared";

type LoginPhase = "credentials" | "twoFactor";

interface LoginState {
  phase: LoginPhase;
  pending: boolean;
  error: string | null;
}

type LoginEvent =
  | { type: "submit" }
  | { type: "failure"; message: string; status: number }
  | { type: "success" };

const initialLoginState: LoginState = { phase: "credentials", pending: false, error: null };

/**
 * Pure reducer for the login form's transitions — no DOM, no `fetch`, so the
 * 2FA state machine is testable as a table. The API has no typed error code
 * for "the second factor is missing"; the only way to recognise that case is
 * to compare `TWO_FACTOR_REQUIRED_MESSAGE` exactly, which is why that
 * comparison lives here instead of scattered across the component.
 */
const loginReducer = (state: LoginState, event: LoginEvent): LoginState => {
  switch (event.type) {
    case "submit":
      return { ...state, pending: true, error: null };
    case "success":
      // Stays busy through the navigation that follows — this is what keeps
      // a double click/submit from firing a second request.
      return { ...state, pending: true };
    case "failure":
      if (event.message === TWO_FACTOR_REQUIRED_MESSAGE) {
        // Asking for the second factor is a step forward, not a failure: no
        // error is shown, the form just reveals the code field.
        return { phase: "twoFactor", pending: false, error: null };
      }
      return { ...state, pending: false, error: event.message };
    default:
      return state;
  }
};

export { initialLoginState, loginReducer };
export type { LoginEvent, LoginPhase, LoginState };
