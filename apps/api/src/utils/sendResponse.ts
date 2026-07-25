import type { Response } from "express";
import type { ApiMeta, ApiResponse } from "@gira/shared";

/**
 * The single way to write a JSON response. Controllers never assemble the
 * envelope by hand — keeps the API contract identical across every endpoint.
 * `status` is derived from the HTTP code: 2xx success, 4xx fail, 5xx error.
 */
const sendResponse = <T>(
  res: Response,
  statusCode: number,
  message: string,
  data?: T,
  meta?: ApiMeta,
): void => {
  const status: ApiResponse["status"] =
    statusCode >= 500 ? "error" : statusCode >= 400 ? "fail" : "success";

  const body: ApiResponse<T> = { status, message };
  if (data !== undefined) body.data = data;
  if (meta !== undefined) body.meta = meta;

  res.status(statusCode).json(body);
};

export { sendResponse };
