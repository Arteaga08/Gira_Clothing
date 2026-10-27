import { assertVariantId } from "@/lib/inventory/variantId";
import { browserRequest } from "./browser";
import { WISHLIST_PATH } from "./paths";
import { expectData } from "./request";

/** Ids of the signed-in customer's saved variants (browser side: it needs the session cookie). */
const fetchSavedIds = async (signal?: AbortSignal): Promise<string[]> => {
  const { variantIds } = expectData(
    await browserRequest<{ variantIds: string[] }>(`${WISHLIST_PATH}/ids`, signal ? { signal } : {}),
  );
  return variantIds;
};

/** Both are idempotent on the API; a refusal (full list, retired product) rejects with its own Spanish message. */
const saveVariant = async (variantId: string): Promise<void> => {
  await browserRequest(`${WISHLIST_PATH}/${assertVariantId(variantId)}`, { method: "PUT" });
};

const unsaveVariant = async (variantId: string): Promise<void> => {
  await browserRequest(`${WISHLIST_PATH}/${assertVariantId(variantId)}`, { method: "DELETE" });
};

export { fetchSavedIds, saveVariant, unsaveVariant };
