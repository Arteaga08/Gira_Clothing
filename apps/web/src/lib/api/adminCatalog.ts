import type { ImageAttrs, Print, PrintFamily, ProductCategory } from "@gira/shared";
import {
  toCatalogOptions,
  toCategoryOptions,
  toPickerPrint,
  type CatalogOptions,
  type Option,
  type PickerPrint,
} from "@/lib/catalog/catalogOptions";
import { browserRequest } from "./browser";
import { ADMIN_CATEGORIES_PATH, ADMIN_FAMILIES_PATH, ADMIN_PRINTS_PATH } from "./paths";
import { expectData } from "./request";

/**
 * Read-only lists that feed the catalog selects and the print picker. Active
 * records only, one page of the API's maximum: the catalog is small, and a
 * catalog past 100 prints is a pending item (the picker would need search).
 */
const QUERY = "isActive=true&limit=100&page=1";

const fetchCategoryOptions = async (): Promise<Option[]> =>
  toCategoryOptions(expectData(await browserRequest<{ categories: ProductCategory[] }>(`${ADMIN_CATEGORIES_PATH}?${QUERY}`)).categories);

const fetchCatalogOptions = async (): Promise<CatalogOptions> => {
  const [categories, families, prints] = await Promise.all([
    browserRequest<{ categories: ProductCategory[] }>(`${ADMIN_CATEGORIES_PATH}?${QUERY}`),
    browserRequest<{ families: PrintFamily[] }>(`${ADMIN_FAMILIES_PATH}?${QUERY}`),
    browserRequest<{ prints: Print[] }>(`${ADMIN_PRINTS_PATH}?${QUERY}`),
  ]);
  return toCatalogOptions(
    expectData(categories).categories,
    expectData(families).families,
    expectData(prints).prints,
  );
};

interface CreatePrintBody {
  name: string;
  sku: string;
  family: string;
  image: ImageAttrs;
}

const createPrint = async (body: CreatePrintBody): Promise<PickerPrint> =>
  toPickerPrint(expectData(await browserRequest<{ print: Print }>(ADMIN_PRINTS_PATH, { method: "POST", body })).print);

export { fetchCategoryOptions, fetchCatalogOptions, createPrint };
export type { CreatePrintBody };
