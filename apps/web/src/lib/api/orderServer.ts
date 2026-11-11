import type { PublicOrder, Wire } from "@gira/shared";
import { isApiError } from "./ApiError";
import { expectData } from "./request";
import { serverRequest } from "./server";

type PublicOrderResult = { status: "ok"; order: Wire<PublicOrder> } | { status: "not-found" } | { status: "error" };

const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{43,64}$/;

const isPublicOrderId = (value: string): boolean => PUBLIC_ID_PATTERN.test(value);

/**
 * `GET /orders/:publicId`, the order behind the link in the emails. The id is unguessable (it is the access),
 * so a malformed one never reaches the API. It reports what the server says and decides nothing itself.
 */
const getPublicOrder = async (publicId: string): Promise<PublicOrderResult> => {
  if (!isPublicOrderId(publicId)) return { status: "not-found" };
  try {
    const { order } = expectData(await serverRequest<{ order: PublicOrder }>(`/orders/${publicId}`, { timeoutMs: 5_000 }));
    return { status: "ok", order };
  } catch (error) {
    if (isApiError(error) && error.kind === "http" && error.status === 404) return { status: "not-found" };
    return { status: "error" };
  }
};

export type { PublicOrderResult };
export { getPublicOrder, isPublicOrderId };
