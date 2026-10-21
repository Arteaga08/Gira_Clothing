"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";
import { Field } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { SelectField, type SelectOption } from "@/components/ui/SelectField";
import { T_LABEL } from "@/components/ui/typography";
import type { Option } from "@/lib/catalog/catalogOptions";
import { DEFAULT_SORT, type PrintFilterPatch, type PrintFilters as Filters, type PrintStatus } from "@/lib/prints/filters";

interface PrintFiltersProps {
  filters: Filters;
  families: Option[];
  onChange: (patch: PrintFilterPatch) => void;
}

const SEARCH_DEBOUNCE_MS = 300;

const STATUS_OPTIONS: { value: PrintStatus; label: string }[] = [
  { value: "active", label: "Activas" },
  { value: "retired", label: "Retiradas" },
  { value: "all", label: "Todas" },
];

const SORT_OPTIONS: SelectOption[] = [
  { value: "name", label: "Nombre (A–Z)" },
  { value: "sku", label: "SKU" },
  { value: "-updatedAt", label: "Actualizadas recientemente" },
];

/**
 * Search (debounced 300 ms), family, state and order. The URL is the source of
 * truth: a change from outside pulls the search box along without clobbering
 * what the operator is still typing.
 */
const PrintFilters = ({ filters, families, onChange }: PrintFiltersProps) => {
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

  // A shared link can carry a family that is no longer in the active list: keep it visible instead of showing "Todas".
  const familyOptions =
    filters.family && !families.some((family) => family.value === filters.family)
      ? [...families, { value: filters.family, label: "Familia retirada" }]
      : families;
  const sortValue = SORT_OPTIONS.some((option) => option.value === filters.sort) ? filters.sort : DEFAULT_SORT;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field
        label="Buscar"
        placeholder="Nombre o SKU"
        icon={MagnifyingGlassIcon}
        value={searchText}
        maxLength={80}
        onChange={(event) => setSearchText(event.target.value)}
        containerClassName="min-w-52 flex-1"
      />
      <SelectField
        label="Familia"
        options={[{ value: "", label: "Todas" }, ...familyOptions]}
        value={filters.family ?? ""}
        onChange={(next) => onChange({ family: next || undefined })}
        containerClassName="min-w-44"
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

export type { PrintFiltersProps };
export { PrintFilters };
