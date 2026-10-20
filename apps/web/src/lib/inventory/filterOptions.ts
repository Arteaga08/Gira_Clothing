import type { Print, Product, ProductCategory, Wire } from "@gira/shared";

interface FilterOption {
  value: string;
  label: string;
}

interface ModelOption extends FilterOption {
  /** Category the model belongs to: lets the "Modelo" select follow the "Categoría" one. */
  categoryId: string;
}

interface InventoryFilterOptions {
  categories: FilterOption[];
  models: ModelOption[];
  prints: FilterOption[];
}

const EMPTY_OPTIONS: InventoryFilterOptions = { categories: [], models: [], prints: [] };

const byLabel = (a: FilterOption, b: FilterOption): number => a.label.localeCompare(b.label, "es");

const toFilterOptions = (
  categories: readonly Wire<ProductCategory>[],
  products: readonly Wire<Product>[],
  prints: readonly Wire<Print>[],
): InventoryFilterOptions => ({
  categories: categories.map((category) => ({ value: category.id, label: category.name })).sort(byLabel),
  models: products
    .map((product) => ({ value: product.id, label: product.name, categoryId: product.category.id }))
    .sort(byLabel),
  prints: prints.map((print) => ({ value: print.id, label: print.name })).sort(byLabel),
});

/** Models of the chosen category, or all of them when none is chosen. */
const modelsForCategory = (models: readonly ModelOption[], categoryId: string | undefined): ModelOption[] =>
  categoryId ? models.filter((model) => model.categoryId === categoryId) : [...models];

export { EMPTY_OPTIONS, toFilterOptions, modelsForCategory };
export type { FilterOption, ModelOption, InventoryFilterOptions };
