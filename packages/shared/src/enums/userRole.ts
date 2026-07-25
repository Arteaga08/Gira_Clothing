/**
 * Business roles. Kept intentionally light in M1 (customer + admin).
 * Non-exclusive business capabilities (wholesale, subscriber, affiliate) are
 * modeled as separate documents later — never as flags on the user, per the
 * e-commerce architecture standard.
 */

enum UserRole {
  CUSTOMER = "customer",
  ADMIN = "admin",
}

export { UserRole };
