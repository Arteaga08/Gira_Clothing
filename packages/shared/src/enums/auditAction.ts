/**
 * Append-only audit trail taxonomy. Grows additively as new privileged actions
 * appear in later milestones (catalog, orders, shipping). M1 covers auth only.
 */

enum AuditModule {
  AUTH = "auth",
}

enum AuditAction {
  LOGIN_SUCCESS = "login_success",
  LOGIN_FAILED = "login_failed",
  LOGOUT = "logout",
  TWO_FACTOR_SETUP = "two_factor_setup",
  TWO_FACTOR_ENABLED = "two_factor_enabled",
  TWO_FACTOR_DISABLED = "two_factor_disabled",
}

export { AuditModule, AuditAction };
