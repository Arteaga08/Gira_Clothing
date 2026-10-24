import type { CategoryColor, Print, PrintFamily, ProductCategory, Wire } from "@gira/shared";

interface Option {
  value: string;
  label: string;
}

/** A category option also carries its colour, to say which one the model's card will take. */
interface CategoryOption extends Option {
  color?: CategoryColor;
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
  categories: CategoryOption[];
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

const toCategoryOptions = (categories: readonly Wire<ProductCategory>[]): CategoryOption[] =>
  categories.map((category) => ({ value: category.id, label: category.name, color: category.color })).sort(byLabel);

const toFamilyOptions = (families: readonly Wire<PrintFamily>[]): Option[] =>
  families.map((family) => ({ value: family.id, label: family.name })).sort(byLabel);

const toCatalogOptions = (
  categories: readonly Wire<ProductCategory>[],
  families: readonly Wire<PrintFamily>[],
  prints: readonly Wire<Print>[],
): CatalogOptions => ({
  categories: toCategoryOptions(categories),
  families: toFamilyOptions(families),
  prints: prints.map(toPickerPrint).sort(byName),
});

/** A product whose category was retired still has to show it in the select, flagged as retired. */
const withCurrentCategory = (options: CategoryOption[], categoryId: string, categoryName: string): CategoryOption[] =>
  options.some((option) => option.value === categoryId)
    ? options
    : [...options, { value: categoryId, label: `${categoryName} (retirada)` }];

export { toCatalogOptions, toCategoryOptions, toFamilyOptions, toPickerPrint, withCurrentCategory };
export type { Option, CategoryOption, PickerPrint, CatalogOptions };
