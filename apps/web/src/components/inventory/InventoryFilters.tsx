"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";
import { Field } from "@/components/ui/Field";
import { SelectField, type SelectOption } from "@/components/ui/SelectField";
import { modelsForCategory, type InventoryFilterOptions } from "@/lib/inventory/filterOptions";
import type { InventoryFilterPatch, InventoryFilters as Filters } from "@/lib/inventory/filters";

interface InventoryFiltersProps {
  filters: Filters;
  options: InventoryFilterOptions;
  onChange: (patch: InventoryFilterPatch) => void;
}

const SEARCH_DEBOUNCE_MS = 300;

const SORT_OPTIONS: SelectOption[] = [
  { value: "available", label: "Menos disponible primero" },
  { value: "-available", label: "Más disponible primero" },
  { value: "sku", label: "SKU (A–Z)" },
  { value: "-updatedAt", label: "Actualizados recientemente" },
];

const withAll = (label: string, options: readonly { value: string; label: string }[]): SelectOption[] => [
  { value: "", label },
  ...options.map(({ value, label: text }) => ({ value, label: text })),
];

/**
 * Search (debounced 300 ms), category, model, print and order. Picking a
 * category narrows the model list, and changing it drops a model that no longer
 * belongs. The URL is the source of truth: a change from outside pulls the
 * search box along without clobbering what the operator is still typing.
 */
const InventoryFilters = ({ filters, options, onChange }: InventoryFiltersProps) => {
  const [searchText, setSearchText] = useState(filters.search ?? "");
  const [seenSearch, setSeenSearch] = useState(filters.search);

  if (filters.search !== seenSearch) {
    setSeenSearch(filters.search);
    setSearchText((typed) => ((filters.search ?? "") === typed.trim() ? typed : (filters.search ?? "")));
  }

  useEffect(() => {
    const trimmed = searchText.trim();
    if (trimmed === (filters.search ?? "")) return;
    const timer = setTimeout(() => onChange({ search: trimmed || undefined }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText, filters.search, onChange]);

  const models = modelsForCategory(options.models, filters.category);
  const sortValue = SORT_OPTIONS.some((option) => option.value === filters.sort) ? filters.sort : "available";

  const changeCategory = (category: string) => {
    const keepModel = filters.product && (!category || options.models.some((m) => m.value === filters.product && m.categoryId === category));
    onChange({ category: category || undefined, ...(keepModel ? {} : { product: undefined }) });
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field
        label="Buscar"
        placeholder="SKU, modelo o print"
        icon={MagnifyingGlassIcon}
        value={searchText}
        maxLength={80}
        onChange={(event) => setSearchText(event.target.value)}
        containerClassName="min-w-52 flex-1"
      />
      <SelectField
        label="Categoría"
        options={withAll("Todas", options.categories)}
        value={filters.category ?? ""}
        onChange={changeCategory}
      />
      <SelectField
        label="Modelo"
        options={withAll("Todos", models)}
        value={filters.product ?? ""}
        onChange={(next) => onChange({ product: next || undefined })}
      />
      <SelectField
        label="Print"
        options={withAll("Todos", options.prints)}
        value={filters.print ?? ""}
        onChange={(next) => onChange({ print: next || undefined })}
      />
      <SelectField
        label="Ordenar por"
        options={SORT_OPTIONS}
        value={sortValue}
        onChange={(next) => onChange({ sort: next })}
      />
    </div>
  );
};

export type { InventoryFiltersProps };
export { InventoryFilters };
