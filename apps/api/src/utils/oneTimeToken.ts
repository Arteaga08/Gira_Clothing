import { createHash, randomBytes } from "node:crypto";

/**
 * Opaque single-use tokens for email links (verification, password reset).
 * 32 CSPRNG bytes → 64 hex chars. The DB stores only the sha256: a database
 * leak exposes no usable link. A fast hash is enough here (unlike passwords):
 * the input is 256 random bits, so there is nothing to brute-force.
 */

const generateOneTimeToken = (): string => randomBytes(32).toString("hex");

const hashOneTimeToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export { generateOneTimeToken, hashOneTimeToken };
