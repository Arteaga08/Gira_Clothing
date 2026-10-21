"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";
import { Field } from "@/components/ui/Field";
import { SelectField, type SelectOption } from "@/components/ui/SelectField";
import {
  DEFAULT_SORT,
  type CouponFilterPatch,
  type CouponFilters as Filters,
  type CouponKindFilter,
  type CouponStatusFilter,
} from "@/lib/coupons/filters";

interface CouponFiltersProps {
  filters: Filters;
  onChange: (patch: CouponFilterPatch) => void;
}

const SEARCH_DEBOUNCE_MS = 300;

const STATUS_OPTIONS: (SelectOption & { value: CouponStatusFilter })[] = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Activos" },
  { value: "scheduled", label: "Programados" },
  { value: "expired", label: "Vencidos" },
  { value: "exhausted", label: "Agotados" },
  { value: "retired", label: "Retirados" },
];

const KIND_OPTIONS: (SelectOption & { value: CouponKindFilter })[] = [
  { value: "all", label: "Todos" },
  { value: "campaign", label: "Campañas" },
  { value: "personal", label: "Personales" },
];

const SORT_OPTIONS: SelectOption[] = [
  { value: "-createdAt", label: "Más recientes" },
  { value: "code", label: "Código (A–Z)" },
  { value: "-redeemedCount", label: "Más canjeados" },
  { value: "endsAt", label: "Vencen primero" },
];

/**
 * Search (debounced 300 ms), state and order. The URL is the source of truth:
 * a change from outside pulls the search box along without clobbering what the
 * operator is still typing.
 */
const CouponFilters = ({ filters, onChange }: CouponFiltersProps) => {
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
        placeholder="Código o nombre"
        icon={MagnifyingGlassIcon}
        value={searchText}
        maxLength={80}
        onChange={(event) => setSearchText(event.target.value)}
        containerClassName="min-w-52 flex-1"
      />
      <SelectField
        label="Estado"
        options={STATUS_OPTIONS}
        value={filters.status}
        onChange={(next) => onChange({ status: next as CouponStatusFilter })}
        containerClassName="min-w-44"
      />
      <SelectField
        label="Clase"
        options={KIND_OPTIONS}
        value={filters.kind}
        onChange={(next) => onChange({ kind: next as CouponKindFilter })}
        containerClassName="min-w-44"
      />
      <SelectField
        label="Ordenar por"
        options={SORT_OPTIONS}
        value={sortValue}
        onChange={(next) => onChange({ sort: next })}
        containerClassName="min-w-48"
      />
    </div>
  );
};

export type { CouponFiltersProps };
export { CouponFilters };
