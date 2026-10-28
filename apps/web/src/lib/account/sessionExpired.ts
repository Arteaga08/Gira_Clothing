import { isApiError } from "@/lib/api/ApiError";
import { STORE_ROUTES, withRedirect } from "@/lib/store/routes";

/**
 * On the account screens a 401 means the session ended while the form was open (the API answers a
 * wrong current password with 400, so the two never mix).
 */
const isSessionExpired = (error: unknown): boolean => isApiError(error) && error.kind === "http" && error.status === 401;

/** Full load of the login with `?redirect=` back to the screen the person was on. */
const goToLogin = (returnPath: string): void => {
  window.location.assign(withRedirect(STORE_ROUTES.login, returnPath));
};

export { isSessionExpired, goToLogin };
