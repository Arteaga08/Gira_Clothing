/**
 * Password policy for creating or changing a password (register, reset). The
 * API validator and the storefront form (Bloque 3) read the same values, so the
 * form never accepts what the server then rejects. The ceiling is in BYTES, not
 * characters: it is bcrypt's real input limit and an emoji weighs 4 bytes.
 * Login and email verification do not apply the policy — only that the field
 * is present (and, on verification, the byte ceiling).
 */
const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_BYTES = 72;

export { PASSWORD_MIN_LENGTH, PASSWORD_MAX_BYTES };
