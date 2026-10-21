"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";
import { Field } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { SelectField, type SelectOption } from "@/components/ui/SelectField";
import { T_LABEL } from "@/components/ui/typography";
import {
  DEFAULT_SORT,
  type TaxonFilterPatch,
  type TaxonFilters as Filters,
  type TaxonStatus,
} from "@/lib/taxonomy/filters";

interface TaxonFiltersProps {
  filters: Filters;
  searchPlaceholder: string;
  onChange: (patch: TaxonFilterPatch) => void;
}

const SEARCH_DEBOUNCE_MS = 300;

const STATUS_OPTIONS: { value: TaxonStatus; label: string }[] = [
  { value: "active", label: "Activas" },
  { value: "retired", label: "Retiradas" },
  { value: "all", label: "Todas" },
];

const SORT_OPTIONS: SelectOption[] = [
  { value: "name", label: "Nombre (A–Z)" },
  { value: "-updatedAt", label: "Actualizadas recientemente" },
];

/**
 * Search (debounced 300 ms), state and order. The URL is the source of truth:
 * a change from outside pulls the search box along without clobbering what the
 * operator is still typing.
 */
const TaxonFilters = ({ filters, searchPlaceholder, onChange }: TaxonFiltersProps) => {
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
        placeholder={searchPlaceholder}
        icon={MagnifyingGlassIcon}
        value={searchText}
        maxLength={80}
        onChange={(event) => setSearchText(event.target.value)}
        containerClassName="min-w-52 flex-1"
      />
      <div className="flex flex-col gap-1.5">
        <span className={`${T_LABEL} text-text-secondary`}>Estado</span>
        <div role="group" aria-label="Estado" className="flex gap-2">
          {STATUS_OPTIONS.map((option) => (
            <Segmented
              key={option.value}
              selected={filters.status === option.value}
              // `Segmented`'s base fill outranks its own selected fill in the stylesheet, so the choice would not show.
              className={filters.status === option.value ? "bg-brand! text-text-inverse!" : ""}
              onClick={() => onChange({ status: option.value })}
            >
              {option.label}
            </Segmented>
          ))}
        </div>
      </div>
      <SelectField
        label="Ordenar por"
        options={SORT_OPTIONS}
        value={sortValue}
        onChange={(next) => onChange({ sort: next })}
        containerClassName="min-w-52"
      />
    </div>
  );
};

export type { TaxonFiltersProps };
export { TaxonFilters };
