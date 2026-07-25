import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

/**
 * Symmetric encryption for secrets at rest — currently the admin TOTP secret
 * (BACKEND_SECURITY_GUIDELINES §2). A DB leak must never expose usable secrets.
 *
 * Output format: `ivHex:authTagHex:cipherHex`. A fresh 12-byte IV is generated
 * per call, so encrypting the same plaintext twice yields different ciphertext.
 * The 32-byte key is derived from ENCRYPTION_KEY via SHA-256 (never hardcoded).
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

const deriveKey = (): Buffer => createHash("sha256").update(env.encryptionKey).digest();

const encryptSecret = (plain: string): string => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
};

const decryptSecret = (payload: string): string => {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Formato de secreto cifrado inválido.");
  }
  const [ivHex, authTagHex, cipherHex] = parts as [string, string, string];
  const decipher = createDecipheriv(ALGORITHM, deriveKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
};

export { encryptSecret, decryptSecret };
