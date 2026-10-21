import type { AdminPrint, ApiMeta } from "@gira/shared";
import { toPanelPrint, type PanelPrint } from "@/lib/prints/panelPrint";
import { assertPrintId } from "@/lib/prints/printId";
import type { CreatePrintBody, UpdatePrintBody } from "@/lib/prints/printForm";
import { browserRequest } from "./browser";
import { ADMIN_PRINTS_PATH } from "./paths";
import { expectData } from "./request";

/**
 * Browser-side client for /admin/prints. Everything goes through
 * `browserRequest`: the list refreshes in the client and every mutation must
 * leave with a real Origin header (see browser.ts). Print endpoints wrap
 * their payload in a named key (`prints`, `print`).
 */

const printApiPath = (id: string): string => `${ADMIN_PRINTS_PATH}/${assertPrintId(id)}`;

const listPrints = async (query: string): Promise<{ prints: PanelPrint[]; meta: ApiMeta }> => {
  const result = await browserRequest<{ prints: AdminPrint[] }>(`${ADMIN_PRINTS_PATH}?${query}`);
  const { prints } = expectData(result);
  return {
    prints: prints.map(toPanelPrint),
    meta: result.meta ?? { total: prints.length, page: 1, pages: 1, limit: prints.length },
  };
};

const getPrint = async (id: string): Promise<PanelPrint> =>
  toPanelPrint(expectData(await browserRequest<{ print: AdminPrint }>(printApiPath(id))).print);

const createAdminPrint = async (body: CreatePrintBody): Promise<PanelPrint> =>
  toPanelPrint(expectData(await browserRequest<{ print: AdminPrint }>(ADMIN_PRINTS_PATH, { method: "POST", body })).print);

const updateAdminPrint = async (id: string, body: UpdatePrintBody): Promise<PanelPrint> =>
  toPanelPrint(expectData(await browserRequest<{ print: AdminPrint }>(printApiPath(id), { method: "PATCH", body })).print);

/** Soft delete. The API answers 409 (with its own Spanish message) while the print still has active variants. */
const retirePrint = async (id: string): Promise<PanelPrint> =>
  toPanelPrint(expectData(await browserRequest<{ print: AdminPrint }>(printApiPath(id), { method: "DELETE" })).print);

/** The API answers 409 while the print's family is retired. */
const reactivatePrint = async (id: string): Promise<PanelPrint> =>
  toPanelPrint(
    expectData(await browserRequest<{ print: AdminPrint }>(printApiPath(id), { method: "PATCH", body: { isActive: true } })).print,
  );

export { listPrints, getPrint, createAdminPrint, updateAdminPrint, retirePrint, reactivatePrint };
