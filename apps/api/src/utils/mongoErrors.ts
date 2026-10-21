/** True for a MongoDB duplicate-key error (E11000), whichever index raised it. */
const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === "object" &&
  err !== null &&
  "code" in err &&
  (err as { code?: number }).code === 11000;

export { isDuplicateKeyError };
