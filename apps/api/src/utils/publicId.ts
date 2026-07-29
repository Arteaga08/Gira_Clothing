import { randomBytes } from "node:crypto";

/**
 * Unguessable public order identifier (BACKEND_SECURITY_GUIDELINES, anti-IDOR).
 * The id IS the credential: whoever holds it can read that order, so it travels
 * only in the confirmation email (M4) and never in a listing. 32 CSPRNG bytes
 * (~256 bits) make enumeration impossible; base64url keeps it URL-safe with no
 * percent-encoding.
 */
const PUBLIC_ID_BYTES = 32;

const generatePublicId = (): string => randomBytes(PUBLIC_ID_BYTES).toString("base64url");

export { generatePublicId };
