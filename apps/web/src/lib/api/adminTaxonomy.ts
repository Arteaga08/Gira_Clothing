import type { ApiMeta } from "@gira/shared";
import { toPanelCategory, toPanelFamily, type PanelTaxon } from "@/lib/taxonomy/panelTaxon";
import type { CreateTaxonBody, UpdateTaxonBody } from "@/lib/taxonomy/taxonForm";
import { isObjectId } from "@/lib/inventory/variantId";
import { ApiError } from "./ApiError";
import { browserRequest } from "./browser";
import { ADMIN_CATEGORIES_PATH, ADMIN_FAMILIES_PATH } from "./paths";
import { expectData, type ApiResult } from "./request";

/**
 * Browser-side client for /admin/print-families and /admin/product-categories.
 * Everything goes through `browserRequest`: the list refreshes in the client and
 * every mutation must leave with a real Origin header (see browser.ts). Both
 * resources wrap their payload in a named key (`families`/`family`,
 * `categories`/`category`); the client hides that behind one shape.
 */

interface TaxonClient {
  list: (query: string) => Promise<{ items: PanelTaxon[]; meta: ApiMeta }>;
  get: (id: string) => Promise<PanelTaxon>;
  create: (body: CreateTaxonBody) => Promise<PanelTaxon>;
  update: (id: string, body: UpdateTaxonBody) => Promise<PanelTaxon>;
  /** Soft delete. The API answers 409 (with its own Spanish message) while there are active children. */
  retire: (id: string) => Promise<PanelTaxon>;
  reactivate: (id: string) => Promise<PanelTaxon>;
}

interface ClientSpec {
  path: string;
  listKey: string;
  itemKey: string;
  entity: string;
  toPanel: (dto: never) => PanelTaxon;
}

/** A manipulated URL or id never reaches the API: it fails here, before any request. */
const assertTaxonId = (value: string, entity: string): string => {
  if (!isObjectId(value)) throw new ApiError(`El identificador de la ${entity} no es válido.`, "parse");
  return value;
};

const makeClient = (spec: ClientSpec): TaxonClient => {
  const itemPath = (id: string): string => `${spec.path}/${assertTaxonId(id, spec.entity)}`;
  const toPanel = spec.toPanel as (dto: unknown) => PanelTaxon;
  const item = async (call: Promise<ApiResult<Record<string, unknown>>>): Promise<PanelTaxon> =>
    toPanel(expectData(await call)[spec.itemKey]);

  return {
    list: async (query) => {
      const result = await browserRequest<Record<string, unknown[]>>(`${spec.path}?${query}`);
      const items = expectData(result)[spec.listKey] ?? [];
      return {
        items: items.map(toPanel),
        meta: result.meta ?? { total: items.length, page: 1, pages: 1, limit: items.length },
      };
    },
    get: (id) => item(browserRequest(itemPath(id))),
    create: (body) => item(browserRequest(spec.path, { method: "POST", body })),
    update: (id, body) => item(browserRequest(itemPath(id), { method: "PATCH", body })),
    retire: (id) => item(browserRequest(itemPath(id), { method: "DELETE" })),
    reactivate: (id) => item(browserRequest(itemPath(id), { method: "PATCH", body: { isActive: true } })),
  };
};

const familyClient = makeClient({
  path: ADMIN_FAMILIES_PATH,
  listKey: "families",
  itemKey: "family",
  entity: "familia",
  toPanel: toPanelFamily,
});

const categoryClient = makeClient({
  path: ADMIN_CATEGORIES_PATH,
  listKey: "categories",
  itemKey: "category",
  entity: "categoría",
  toPanel: toPanelCategory,
});

export { familyClient, categoryClient };
export type { TaxonClient };
