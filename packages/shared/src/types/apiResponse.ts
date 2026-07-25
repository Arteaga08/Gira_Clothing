/**
 * Shared API contract between apps/api and any HTTP consumer (web, dashboard).
 * Every endpoint responds with this envelope — controllers never build JSON by hand.
 */

type ApiStatus = "success" | "fail" | "error";

interface ApiMeta {
  total: number;
  page: number;
  pages: number;
  limit: number;
}

interface ApiResponse<T = unknown> {
  status: ApiStatus;
  /** User-facing message, written in Spanish. */
  message: string;
  data?: T;
  meta?: ApiMeta;
}

export type { ApiStatus, ApiMeta, ApiResponse };
