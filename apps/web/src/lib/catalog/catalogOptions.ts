import type { Print, PrintFamily, ProductCategory, Wire } from "@gira/shared";

interface Option {
  value: string;
  label: string;
}

/** A print as the picker paints it: no slug, no storage id. */
interface PickerPrint {
  id: string;
  name: string;
  sku: string;
  familyId: string;
  familyName: string;
  imageUrl: string;
}

interface CatalogOptions {
  categories: Option[];
  families: Option[];
  prints: PickerPrint[];
}

const byLabel = (a: Option, b: Option): number => a.label.localeCompare(b.label, "es");
const byName = (a: PickerPrint, b: PickerPrint): number => a.name.localeCompare(b.name, "es");

const toPickerPrint = (print: Wire<Print>): PickerPrint => ({
  id: print.id,
  name: print.name,
  sku: print.sku,
  familyId: print.family.id,
  familyName: print.family.name,
  imageUrl: print.image.url,
});

const toCategoryOptions = (categories: readonly Wire<ProductCategory>[]): Option[] =>
  categories.map((category) => ({ value: category.id, label: category.name })).sort(byLabel);

const toCatalogOptions = (
  categories: readonly Wire<ProductCategory>[],
  families: readonly Wire<PrintFamily>[],
  prints: readonly Wire<Print>[],
): CatalogOptions => ({
  categories: toCategoryOptions(categories),
  families: families.map((family) => ({ value: family.id, label: family.name })).sort(byLabel),
  prints: prints.map(toPickerPrint).sort(byName),
});

/** A product whose category was retired still has to show it in the select, flagged as retired. */
const withCurrentCategory = (options: Option[], categoryId: string, categoryName: string): Option[] =>
  options.some((option) => option.value === categoryId)
    ? options
    : [...options, { value: categoryId, label: `${categoryName} (retirada)` }];

export { toCatalogOptions, toCategoryOptions, toPickerPrint, withCurrentCategory };
export type { Option, PickerPrint, CatalogOptions };
