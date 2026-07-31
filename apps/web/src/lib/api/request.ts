import type { ApiErrorBody, ApiMeta, ApiResponse, Wire } from "@gira/shared";
import { apiBaseUrl } from "@/lib/config";
import { ApiError } from "./ApiError";
import { MISSING_DATA_MESSAGE, NETWORK_ERROR_MESSAGE, PARSE_ERROR_MESSAGE, TIMEOUT_ERROR_MESSAGE } from "./messages";

/**
 * The single frontier this project has for talking to the API. Everything
 * else (`browser.ts`, `server.ts`, endpoint modules) is a thin wrapper around
 * this function — it is the only place that knows the envelope shape, the
 * timeout mechanics, and how to turn a failure into an `ApiError`.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
  timeoutMs?: number;
  credentials?: RequestCredentials;
  cache?: RequestCache;
}

interface ApiResult<T> {
  message: string;
  data: Wire<T> | undefined;
  meta: ApiMeta | undefined;
}

const buildInit = (options: RequestOptions, signal: AbortSignal): RequestInit => {
  const headers: Record<string, string> = { ...options.headers };
  const init: RequestInit = {
    method: options.method ?? "GET",
    headers,
    signal,
  };

  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }
  if (options.credentials) init.credentials = options.credentials;
  if (options.cache) init.cache = options.cache;

  return init;
};

/**
 * A manual AbortController rather than `AbortSignal.timeout`/`.any`: both
 * statics depend on which `AbortSignal` implementation is active (browser vs
 * Node vs jsdom), which is exactly what a timeout test needs to control with
 * fake timers. This version is deterministic everywhere and lets us tell a
 * server timeout apart from the caller's own abort.
 */
const withTimeout = (
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; timedOut: () => boolean; clear: () => void } => {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener("abort", () => controller.abort());
    }
  }

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    clear: () => clearTimeout(timer),
  };
};

const request = async <T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> => {
  const timeout = withTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, buildInit(options, timeout.signal));
  } catch {
    timeout.clear();
    if (timeout.timedOut()) throw new ApiError(TIMEOUT_ERROR_MESSAGE, "timeout");
    throw new ApiError(NETWORK_ERROR_MESSAGE, "network");
  }
  timeout.clear();

  let payload: ApiResponse<T> | ApiErrorBody;
  try {
    payload = (await response.json()) as ApiResponse<T> | ApiErrorBody;
  } catch {
    throw new ApiError(PARSE_ERROR_MESSAGE, "parse", response.status);
  }

  if (!response.ok) {
    throw new ApiError(payload.message, "http", response.status);
  }

  const success = payload as ApiResponse<T>;
  return {
    message: success.message,
    data: success.data as Wire<T> | undefined,
    meta: success.meta,
  };
};

/** Unwraps `data`, turning its absence into the same `ApiError` shape as any other failure. */
const expectData = <T>(result: ApiResult<T>): Wire<T> => {
  if (result.data === undefined) {
    throw new ApiError(MISSING_DATA_MESSAGE, "parse");
  }
  return result.data;
};

export { request, expectData };
export type { RequestOptions, ApiResult };
