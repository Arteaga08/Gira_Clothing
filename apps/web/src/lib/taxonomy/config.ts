import {
  PRINT_FAMILY_DESCRIPTION_MAX,
  PRINT_FAMILY_NAME_MAX,
  PRINT_FAMILY_NAME_MIN,
  PRODUCT_CATEGORY_DESCRIPTION_MAX,
  PRODUCT_CATEGORY_NAME_MAX,
  PRODUCT_CATEGORY_NAME_MIN,
} from "@gira/shared";
import { categoryClient, familyClient, type TaxonClient } from "@/lib/api/adminTaxonomy";
import { assertProductId, productPath } from "@/lib/catalog/productId";
import { assertPrintId } from "@/lib/prints/printId";
import type { TaxonLimits } from "./taxonForm";

/**
 * Everything that differs between the Familias and Categorías screens, so the
 * table, filters, modal and retire guard are written once. Both nouns are
 * feminine in Spanish, which keeps the shared copy ("Nueva", "Retirada") right.
 */
/** The children's wording, spelled out per resource: the genders differ (estampas / modelos). */
interface TaxonChildCopy {
  singular: string;
  plural: string;
  /** The screen that lists them, as the sidebar names it. */
  screen: string;
  /** "6 estampas activas" / "1 modelo activo". */
  activeCount: (count: number) => string;
  /** Instruction while the retire is blocked. */
  retireFirst: string;
  /** The link under the list of children. */
  seeAll: (count: number) => string;
}

interface TaxonConfig {
  kind: "family" | "category";
  /** URL key of the open record: `?familia=<id|nueva>`. */
  param: string;
  /** Page title (also the list's aria-label). */
  title: string;
  subtitle: string;
  singular: string;
  newLabel: string;
  searchPlaceholder: string;
  /** Children, in singular and plural: prints for a family, models for a category. */
  child: TaxonChildCopy;
  limits: TaxonLimits;
  client: TaxonClient;
  /** Link to one child (a print opens in Estampas, a model in its editor). */
  childHref: (id: string) => string;
  /** Link to the child list filtered by this record (stock-style "see them all"). */
  childrenHref: (id: string) => string;
}

const familyConfig: TaxonConfig = {
  kind: "family",
  param: "familia",
  title: "Familias",
  subtitle: "Las colecciones que agrupan tus estampas.",
  singular: "familia",
  newLabel: "Nueva familia",
  searchPlaceholder: "Nombre de la familia",
  child: {
    singular: "estampa",
    plural: "estampas",
    screen: "Estampas",
    activeCount: (count) => (count === 1 ? "1 estampa activa" : `${count} estampas activas`),
    retireFirst: "Retíralas primero desde Estampas",
    seeAll: (count) => (count === 1 ? "Ver la estampa en Estampas" : `Ver las ${count} estampas en Estampas`),
  },
  limits: { nameMin: PRINT_FAMILY_NAME_MIN, nameMax: PRINT_FAMILY_NAME_MAX, descriptionMax: PRINT_FAMILY_DESCRIPTION_MAX },
  client: familyClient,
  childHref: (id) => `/estampas?estampa=${assertPrintId(id)}`,
  childrenHref: (id) => `/estampas?familia=${assertPrintId(id)}`,
};

const categoryConfig: TaxonConfig = {
  kind: "category",
  param: "categoria",
  title: "Categorías",
  subtitle: "Los tipos de producto con los que organizas tu catálogo.",
  singular: "categoría",
  newLabel: "Nueva categoría",
  searchPlaceholder: "Nombre de la categoría",
  child: {
    singular: "modelo",
    plural: "modelos",
    screen: "Productos",
    activeCount: (count) => (count === 1 ? "1 modelo activo" : `${count} modelos activos`),
    retireFirst: "Retíralos primero desde Productos",
    seeAll: (count) => (count === 1 ? "Ver el modelo en Productos" : `Ver los ${count} modelos en Productos`),
  },
  limits: {
    nameMin: PRODUCT_CATEGORY_NAME_MIN,
    nameMax: PRODUCT_CATEGORY_NAME_MAX,
    descriptionMax: PRODUCT_CATEGORY_DESCRIPTION_MAX,
  },
  client: categoryClient,
  childHref: (id) => productPath(id),
  childrenHref: (id) => `/productos?categoria=${assertProductId(id)}`,
};

type TaxonKind = TaxonConfig["kind"];

/** URL key of the open record, readable without resolving the whole config. */
const TAXON_PARAMS: Readonly<Record<TaxonKind, string>> = { family: familyConfig.param, category: categoryConfig.param };

/** The config is made of functions, so a Server Component cannot hand it to a Client Component: it passes the kind and the client resolves it. */
const taxonConfigFor = (kind: TaxonKind): TaxonConfig => (kind === "family" ? familyConfig : categoryConfig);

export { familyConfig, categoryConfig, taxonConfigFor, TAXON_PARAMS };
export type { TaxonConfig, TaxonChildCopy, TaxonKind };
