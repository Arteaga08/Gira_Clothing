/**
 * Single source of truth for the API base URL (FRONTEND_GUIDELINES §4: no
 * `const API = ...` scattered per file). Fail-fast on import: a panel silently
 * fetching `undefined/orders` fails at runtime with an unreadable error; this
 * fails at startup, naming the missing variable.
 */
const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;

if (!apiBaseUrl) {
  throw new Error("Falta NEXT_PUBLIC_API_URL. Copia .env.development.example a .env.development.local.");
}

export { apiBaseUrl };
