"use client";

import { ORDER_NUMBER_PATTERN, OrderPriority, OrderStatus, ORDER_STATUS_LABELS } from "@gira/shared";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";
import { Field } from "@/components/ui/Field";
import { SelectField, type SelectOption } from "@/components/ui/SelectField";
import { Toggle } from "@/components/ui/Toggle";
import type { OrderFilterPatch, OrderListFilters } from "@/lib/orders/filters";

interface OrderFiltersProps {
  filters: OrderListFilters;
  onChange: (patch: OrderFilterPatch) => void;
}

const SEARCH_DEBOUNCE_MS = 300;
const ORDER_NUMBER_LENGTH = 11; // "GC-" + 8 characters
const ORDER_NUMBER_ERROR = "El folio tiene el formato GC-XXXXXXXX.";

const SORT_OPTIONS: SelectOption[] = [
  { value: "-createdAt", label: "Más recientes" },
  { value: "createdAt", label: "Más antiguos" },
  { value: "-total", label: "Mayor total" },
  { value: "total", label: "Menor total" },
];

const STATUS_OPTIONS: SelectOption[] = [
  { value: "", label: "Todos los estados" },
  ...Object.values(OrderStatus).map((status) => ({ value: status, label: ORDER_STATUS_LABELS[status] })),
];

/**
 * Folio is an exact match and needs no debounce (it only applies when it is a
 * complete, valid folio); free-text search waits 300 ms after the last key.
 * The status select only exists on "Todos": every other tab already is a status.
 */
const OrderFilters = ({ filters, onChange }: OrderFiltersProps) => {
  const [folio, setFolio] = useState(filters.orderNumber ?? "");
  const [searchText, setSearchText] = useState(filters.search ?? "");
  const [seenOrderNumber, setSeenOrderNumber] = useState(filters.orderNumber);
  const [seenSearch, setSeenSearch] = useState(filters.search);

  // The URL can change from outside (a sidebar link, back/forward): pull the inputs along. State is adjusted
  // during render, not in an effect. Text the operator is still typing is left alone.
  if (filters.orderNumber !== seenOrderNumber) {
    setSeenOrderNumber(filters.orderNumber);
    setFolio((typed) => filters.orderNumber ?? (ORDER_NUMBER_PATTERN.test(typed) ? "" : typed));
  }
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

  const handleFolio = (raw: string) => {
    const value = raw.toUpperCase().trim();
    setFolio(value);
    if (value === "") onChange({ orderNumber: undefined });
    else if (ORDER_NUMBER_PATTERN.test(value)) onChange({ orderNumber: value });
    else if (filters.orderNumber) onChange({ orderNumber: undefined });
  };

  const folioInvalid = folio.length >= ORDER_NUMBER_LENGTH && !ORDER_NUMBER_PATTERN.test(folio);
  const sortValue = SORT_OPTIONS.some((option) => option.value === filters.sort) ? filters.sort : "-createdAt";

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field
        label="Folio exacto"
        placeholder="GC-XXXXXXXX"
        value={folio}
        maxLength={ORDER_NUMBER_LENGTH}
        onChange={(event) => handleFolio(event.target.value)}
        {...(folioInvalid ? { error: ORDER_NUMBER_ERROR } : {})}
        containerClassName="w-44"
        className="font-mono"
      />
      <Field
        label="Buscar cliente"
        placeholder="Nombre, correo o teléfono"
        icon={MagnifyingGlassIcon}
        value={searchText}
        maxLength={80}
        onChange={(event) => setSearchText(event.target.value)}
        containerClassName="min-w-52 flex-1"
      />
      {filters.tab === "all" ? (
        <SelectField
          label="Estado"
          options={STATUS_OPTIONS}
          value={filters.status ?? ""}
          onChange={(event) => onChange({ status: (event.target.value || undefined) as OrderStatus | undefined })}
        />
      ) : null}
      <SelectField
        label="Ordenar por"
        options={SORT_OPTIONS}
        value={sortValue}
        onChange={(event) => onChange({ sort: event.target.value })}
      />
      <div className="flex min-h-10 items-center">
        <Toggle
          label="Solo urgentes"
          checked={filters.priority === OrderPriority.URGENT}
          onChange={(checked) => onChange({ priority: checked ? OrderPriority.URGENT : undefined })}
        />
      </div>
    </div>
  );
};

export type { OrderFiltersProps };
export { OrderFilters };
