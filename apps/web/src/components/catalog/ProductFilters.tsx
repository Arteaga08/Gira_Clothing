"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";
import { Field } from "@/components/ui/Field";
import { SelectField, type SelectOption } from "@/components/ui/SelectField";
import type { Option } from "@/lib/catalog/catalogOptions";
import { DEFAULT_SORT, type CatalogFilterPatch, type CatalogFilters, type CatalogStatus } from "@/lib/catalog/filters";

interface ProductFiltersProps {
  filters: CatalogFilters;
  categories: Option[];
  onChange: (patch: CatalogFilterPatch) => void;
}

const SEARCH_DEBOUNCE_MS = 300;

const STATUS_OPTIONS: SelectOption[] = [
  { value: "active", label: "Activos" },
  { value: "retired", label: "Retirados" },
  { value: "all", label: "Todos" },
];

const SORT_OPTIONS: SelectOption[] = [
  { value: "category", label: "Categoría y nombre (A–Z)" },
  { value: "name", label: "Nombre (A–Z)" },
  { value: "basePrice", label: "Precio base, menor primero" },
  { value: "-basePrice", label: "Precio base, mayor primero" },
  { value: "-updatedAt", label: "Actualizados recientemente" },
];

/**
 * Search (debounced 300 ms), category, state and order. The URL is the source
 * of truth: a change from outside pulls the search box along without
 * clobbering what the operator is still typing.
 */
const ProductFilters = ({ filters, categories, onChange }: ProductFiltersProps) => {
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

  const sortValue = SORT_OPTIONS.some((option) => option.value === filters.sort) ? filters.sort : DEFAULT_SORT;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field
        label="Buscar"
        placeholder="Nombre del modelo"
        icon={MagnifyingGlassIcon}
        value={searchText}
        maxLength={80}
        onChange={(event) => setSearchText(event.target.value)}
        containerClassName="min-w-52 flex-1"
      />
      <SelectField
        label="Categoría"
        options={[{ value: "", label: "Todas" }, ...categories]}
        value={filters.category ?? ""}
        onChange={(next) => onChange({ category: next || undefined })}
      />
      <SelectField
        label="Estado"
        options={STATUS_OPTIONS}
        value={filters.status}
        onChange={(next) => onChange({ status: next as CatalogStatus })}
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

export type { ProductFiltersProps };
export { ProductFilters };
