/** The emailed tokens are 64 lowercase hex characters (accountTokenService). Anything else never reaches the API. */
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

const parseToken = (raw: string | string[] | undefined): string | null =>
  typeof raw === "string" && TOKEN_PATTERN.test(raw) ? raw : null;

export { parseToken };
